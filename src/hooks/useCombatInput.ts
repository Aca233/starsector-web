import { pickModuleFireControl } from '../engine/runtime/ModuleFireControl';
import { HYPERION_JUMP_ID } from '../engine/content/HyperionIds';
import { HYPERION_REACTOR, jumpTargetingEntryFailure } from '../engine/content/HyperionJumpTarget';
import { effectiveHullStats } from '../engine/extensions/HullMods';
import { readSystemBindings, selectNextSystem } from '../engine/runtime/SystemBindings';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Vector2 } from '../engine/math/Vector2';
import type { HudShip as Ship } from '../engine/runtime/CombatHudView';
import { sound } from '../engine/audio/SoundManager';
import { CombatSession } from '../engine/runtime/CombatSession';
import { clientToCombatWorld, zoomCombatView } from '../engine/runtime/PlayerControls';
import { isCombatTextEntry, isCombatPointerUi, hasCombatModal, hasCombatInputFocus } from '../engine/runtime/CombatInputFocus';
import { flightKey, shipCommandForKey, shipCommandForMouse, type ShipCommand } from '../engine/runtime/CombatCommands';

export interface UseCombatInputParams {
  sessionRef: React.MutableRefObject<CombatSession>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraPosRef: React.MutableRefObject<Vector2>;
  zoomRef: React.MutableRefObject<number>;
  isAutopilotRef: React.MutableRefObject<boolean>;
  inputBlockedRef: React.MutableRefObject<boolean>;
  keysPressed: React.MutableRefObject<{ [key: string]: boolean }>;
  mouseScreenPos: React.MutableRefObject<Vector2>;
  mouseAimActiveRef: React.MutableRefObject<boolean>;
  isMouseDown: React.MutableRefObject<boolean>;
  setIsAutopilot: React.Dispatch<React.SetStateAction<boolean>>;
  onTogglePause: () => void;
}

function releaseHeldFire(mouse: React.MutableRefObject<boolean>): void { mouse.current = false; }

function resetHeldInput(keys: React.MutableRefObject<Record<string, boolean>>, mouse: React.MutableRefObject<boolean>): void {
  keys.current = {}; mouse.current = false;
}

function resetInputState(keys: React.MutableRefObject<Record<string, boolean>>, mouse: React.MutableRefObject<boolean>, session: CombatSession): void {
  resetHeldInput(keys, mouse);
  session.dispatchControl({ kind: 'clear-input' });
}

export function useCombatInput({
  sessionRef,
  canvasRef,
  cameraPosRef,
  zoomRef,
  isAutopilotRef,
  inputBlockedRef,
  keysPressed,
  mouseScreenPos,
  mouseAimActiveRef,
  isMouseDown,
  setIsAutopilot,
  onTogglePause
}: UseCombatInputParams) {
  const [targetingMessage, setTargetingMessage] = useState('');
  const [commandNotice, setCommandNotice] = useState('');
  const jumpConfirmPending = useRef(false);
  useEffect(() => {
    const targeting = sessionRef.current.jumpTargeting;
    const sync = () => setTargetingMessage(targeting.message);
    sync(); return targeting.subscribe(sync);
  }, [sessionRef]);
  useEffect(() => {
    if (!commandNotice) return;
    const timer = window.setTimeout(() => setCommandNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [commandNotice]);
  const ownershipRequest = useRef(0);
  const heldCodes = useRef(new Set<string>());
  const pointerHeld = useRef(false);
  const inputGeneration = useRef(0);
  const [takeoverNotice, setTakeoverNotice] = useState<{ ship: Ship } | null>(null);
  useEffect(() => {
    if (!takeoverNotice) return;
    const timer = window.setTimeout(() => setTakeoverNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [takeoverNotice]);

  const canPilot = useCallback(() => {
    const { read: engine } = sessionRef.current, ship = engine.playerShip;
    return !engine.battleResult && !ship.isDead && ship.hullHp > 0
      && !ship.isRetreated && !ship.isDocked && !ship.retreating;
  }, [sessionRef]);

  // ACK owns the pilot transition; old encounters/focus releases cannot re-enable input.
  const setAutopilot = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!canPilot()) return false;
    if (isAutopilotRef.current === enabled) return true;
    sessionRef.current.jumpTargeting.cancel();
    const session = sessionRef.current, epoch = session.controlEpoch, ship = session.read.playerShip;
    const request = ++ownershipRequest.current;
    resetHeldInput(keysPressed, isMouseDown);
    const result = await session.dispatchControl({kind:'pilot',autopilot:enabled});
    if (!result.accepted || sessionRef.current !== session || session.controlEpoch !== epoch || request !== ownershipRequest.current) return false;
    isAutopilotRef.current = enabled; setIsAutopilot(enabled);
    setTakeoverNotice(enabled ? null : {ship}); sound.play('autofire_toggle', .8);
    return true;
  }, [canPilot, sessionRef, keysPressed, isMouseDown, isAutopilotRef, setIsAutopilot]);
  const takeManualControl = useCallback(() => setAutopilot(false), [setAutopilot]);
  const command = useCallback(async (action: ShipCommand) => {
    const session = sessionRef.current, canvas = canvasRef.current, epoch = session.controlEpoch, generation = inputGeneration.current;
    if (!canvas || inputBlockedRef.current || session.read.isTacticalMap || !session.isPresentationReady() || !hasCombatInputFocus()) return;
    const jump = action.kind === 'system' && session.read.playerShip.systems[action.value ?? 0]?.type === HYPERION_JUMP_ID;
    if (jump && session.jumpTargeting.active) { session.jumpTargeting.cancel(); return; }
    if (jumpConfirmPending.current) return;
    if (jump) {
      const reason = jumpTargetingEntryFailure(session.read.playerShip.systems[action.value ?? 0]);
      if (reason) { setCommandNotice(reason); return; }
    }
    const aim = clientToCombatWorld(mouseScreenPos.current, canvas, cameraPosRef.current, zoomRef.current);
    const pointerActive = mouseAimActiveRef.current;
    if (!await takeManualControl() || session.controlEpoch !== epoch || generation !== inputGeneration.current || inputBlockedRef.current || !hasCombatInputFocus()) return;
    if (jump && action.kind === 'system') {
      releaseHeldFire(isMouseDown); pointerHeld.current = false;
      await session.dispatchControl({kind:'stop-firing'});
      if (session.controlEpoch !== epoch || generation !== inputGeneration.current || inputBlockedRef.current || !hasCombatInputFocus()) return;
      const ship = session.read.playerShip;
      session.jumpTargeting.begin(ship.id,epoch,action.value ?? 0,HYPERION_REACTOR.jumpRange*effectiveHullStats(ship.spec).systemRangeMultiplier);
      session.updateJumpTargeting(pointerActive ? aim : undefined);
      return;
    }
    session.jumpTargeting.cancel();
    const result = await session.dispatchControl({kind:'ship',command:action,aim:pointerActive ? [aim.x,aim.y] : undefined});
    if (action.kind === 'module' && !result.accepted && session.controlEpoch === epoch
      && generation === inputGeneration.current && sessionRef.current === session) {
      setCommandNotice(result.reason ?? '模块接管未获准');
    }
  }, [sessionRef, canvasRef, inputBlockedRef, takeManualControl, mouseScreenPos, cameraPosRef, zoomRef, mouseAimActiveRef, isMouseDown]);

  const onTogglePauseRef = useRef(onTogglePause);
  useEffect(() => { onTogglePauseRef.current = onTogglePause; }, [onTogglePause]);



  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clearTransientInput = () => {
      sessionRef.current.jumpTargeting.cancel();
      inputGeneration.current++; heldCodes.current.clear(); pointerHeld.current = false;
      resetInputState(keysPressed, isMouseDown, sessionRef.current);
    };

    const loseFocus = () => {
      mouseAimActiveRef.current = false;
      clearTransientInput();
      sessionRef.current.cameraController.suspendPointer();
    };

    const blocked = (target: EventTarget | null, pointer = false) => (
      inputBlockedRef.current
      || hasCombatModal()
      || !sessionRef.current.isPresentationReady()
      || isCombatTextEntry(target)
      || (pointer && isCombatPointerUi(target))
    );

    const unsubscribePresentation = sessionRef.current.subscribePresentation((state) => {
      if (state.status !== 'ready') loseFocus();
    });
    if (!sessionRef.current.isPresentationReady()) loseFocus();

    const onMouseMove = (e: MouseEvent) => {
      if (inputBlockedRef.current || !hasCombatInputFocus() || !sessionRef.current.isPresentationReady()) { loseFocus(); return; }
      if (e.target !== canvas) {
        mouseAimActiveRef.current = false;
        sessionRef.current.cameraController.suspendPointer();
        isMouseDown.current = false;
        sessionRef.current.dispatchControl({ kind: 'stop-firing' });
        return;
      }
      mouseScreenPos.current.set(e.clientX, e.clientY);
      mouseAimActiveRef.current = !sessionRef.current.read.isTacticalMap;
      if (mouseAimActiveRef.current) sessionRef.current.cameraController.samplePointer(e.clientX, e.clientY);
    };

    const onMouseDown = async (e: MouseEvent) => {
      if (blocked(e.target, true) || e.target !== canvas || e.ctrlKey || e.altKey || e.metaKey) return;
      canvas.focus({ preventScroll: true });
      mouseScreenPos.current.set(e.clientX, e.clientY);
      void sound.preloadSounds();
      const engine = sessionRef.current.read;
      const curCanvas = canvasRef.current;
      if (!curCanvas) return;

      // The tactical chart owns its independent projection and pointer handlers.
      if (engine.isTacticalMap) return;
      mouseAimActiveRef.current = true;
      sessionRef.current.cameraController.samplePointer(e.clientX, e.clientY);

      const session = sessionRef.current;
      if (session.jumpTargeting.active && (e.button === 0 || e.button === 2)) {
        e.preventDefault(); isMouseDown.current = false; pointerHeld.current = false;
        if (e.button === 2) { session.jumpTargeting.cancel(); return; }
        session.updateJumpTargeting(clientToCombatWorld(mouseScreenPos.current, curCanvas, cameraPosRef.current, zoomRef.current));
        const target = session.jumpTargeting.preview, selection = session.jumpTargeting.selection;
        if (!target?.valid || !selection) return;
        if (!session.jumpTargeting.choosingFacing) { session.jumpTargeting.lockPosition(); return; }
        const aim: [number,number] = [target.position.x,target.position.y];
        session.jumpTargeting.cancel(); jumpConfirmPending.current = true;
        try {
          const result = await session.dispatchControl({kind:'ship',command:{kind:'system',value:selection.slot},aim,facing:target.facing});
          if (!result.accepted && session.controlEpoch === selection.epoch) setCommandNotice(result.reason ?? '跃迁未获准');
        } finally { jumpConfirmPending.current = false; }
        return;
      }
      if (jumpConfirmPending.current) { e.preventDefault(); return; }
      if (e.button === 0) {
        const point = clientToCombatWorld(mouseScreenPos.current, curCanvas, cameraPosRef.current, zoomRef.current);
        const module = !engine.battleResult ? pickModuleFireControl(engine.playerShip, engine.ships, point,
          session.state === 'running' ? session.scheduler.alpha : 1) : undefined;
        if (module !== undefined) {
          // This entire press selects, even when held/dragged off the hull. A new press fires.
          e.preventDefault(); pointerHeld.current = false; releaseHeldFire(isMouseDown);
          void session.dispatchControl({kind:'stop-firing'});
          await command({kind:'module',value:module});
          return;
        }
        pointerHeld.current = true;
        const generation = inputGeneration.current, epoch = session.controlEpoch;
        if (!await takeManualControl() || !pointerHeld.current || session.state !== 'running'
          || session.controlEpoch !== epoch || generation !== inputGeneration.current || blocked(e.target, true)) return;
        isMouseDown.current = true;
      } else if (e.button === 2) {
        e.preventDefault();
        command({ kind: e.shiftKey ? 'hullShield' : 'shield' });
      } else {
        // The browser gesture guard already prevents side-button navigation;
        // defaultPrevented must not suppress the game's binding here.
        const action = shipCommandForMouse(e, engine.playerShip);
        if (action) { e.preventDefault(); command(action); }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      pointerHeld.current = false; isMouseDown.current = false;
      sessionRef.current.dispatchControl({ kind: 'stop-firing' });
    };

    const onContextMenu = (e: MouseEvent) => {
      if (e.target === canvas) e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.target !== canvas || e.ctrlKey || e.altKey || e.metaKey || blocked(e.target, true) || sessionRef.current.read.isTacticalMap) return;
      e.preventDefault();
      if (e.shiftKey && readSystemBindings().wheelSelect) { selectNextSystem(sessionRef.current.read.playerShip, e.deltaY); return; }
      zoomRef.current = zoomCombatView(zoomRef.current, e.deltaY);
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || blocked(e.target) || !hasCombatInputFocus()) return;
      if (e.code === 'Escape' && sessionRef.current.jumpTargeting.active) {
        e.preventDefault(); sessionRef.current.jumpTargeting.cancel(); return;
      }
      // Focused HUD buttons own Space/Enter activation, not the pause shortcut.
      if ((e.code === 'Space' || e.code === 'Enter') && isCombatPointerUi(e.target)) return;
      const engine = sessionRef.current.read;
      const action = shipCommandForKey(e, engine.playerShip);
      if (e.ctrlKey || e.altKey || e.metaKey) {
        if (action && !engine.isTacticalMap) {
          e.preventDefault();
          if (!e.repeat) command(action);
        } else clearTransientInput();
        return;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) { loseFocus(); sessionRef.current.dispatchControl({ kind: 'toggle-map' }); }
        return;
      }
      if (engine.isTacticalMap) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) { clearTransientInput(); onTogglePauseRef.current(); }
        return;
      }
      if (e.code === 'KeyU') {
        if (!e.repeat) setAutopilot(!isAutopilotRef.current);
        return;
      }
      if (action) {
        e.preventDefault();
        if (!e.repeat) command(action);
        return;
      }
      if (flightKey(e.code)) {
        e.preventDefault();
        if (engine.battleResult || engine.playerShip.isDead || engine.playerShip.isRetreated) {
          keysPressed.current[e.code] = true; // Observer-camera controls never claim pilot ownership.
        } else {
          heldCodes.current.add(e.code);
          const generation = inputGeneration.current, epoch = sessionRef.current.controlEpoch;
          if (await takeManualControl() && heldCodes.current.has(e.code) && generation === inputGeneration.current && epoch === sessionRef.current.controlEpoch && !blocked(e.target) && sessionRef.current.state === 'running') keysPressed.current[e.code] = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => { heldCodes.current.delete(e.code); keysPressed.current[e.code] = false; };
    const onVisibility = () => { if (document.hidden) loseFocus(); };
    const onFocus = (event: FocusEvent) => { if (isCombatTextEntry(event.target) || hasCombatModal()) loseFocus(); };
    const onPointerLeave = () => { pointerHeld.current = false; mouseAimActiveRef.current = false; sessionRef.current.cameraController.suspendPointer(); isMouseDown.current = false; sessionRef.current.dispatchControl({ kind: 'stop-firing' }); };

    document.addEventListener('focusin', onFocus);
    canvas.addEventListener('mouseleave', onPointerLeave);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', loseFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTransientInput();
      unsubscribePresentation();
      document.removeEventListener('focusin', onFocus);
      canvas.removeEventListener('mouseleave', onPointerLeave);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', loseFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sessionRef, canvasRef, cameraPosRef, zoomRef, isAutopilotRef, inputBlockedRef, keysPressed, mouseScreenPos, mouseAimActiveRef, isMouseDown, command, setAutopilot, takeManualControl]);

  return { command, setAutopilot, targetingMessage: targetingMessage || commandNotice, controlNotice: takeoverNotice ?? undefined };
}
