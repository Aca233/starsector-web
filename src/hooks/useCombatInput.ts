import { useEffect, useRef } from 'react';
import { Vector2 } from '../engine/math/Vector2';
import { Ship } from '../engine/simulation/Ship';
import { sound } from '../engine/audio/SoundManager';
import { CombatSession } from '../engine/runtime/CombatSession';
import { clientToCombatWorld, zoomCombatView } from '../engine/runtime/PlayerControls';
import { isCombatTextEntry, isCombatPointerUi, hasCombatModal, hasCombatInputFocus } from '../engine/runtime/CombatInputFocus';
import { dispatchShipCommand, flightKey, shipCommandForKey, type ShipCommand } from '../engine/runtime/CombatCommands';

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

function resetInputState(keys: React.MutableRefObject<Record<string, boolean>>, mouse: React.MutableRefObject<boolean>, ship: Ship): void {
  keys.current = {};
  mouse.current = false;
  ship.clearInput();
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
  const onTogglePauseRef = useRef(onTogglePause);
  useEffect(() => { onTogglePauseRef.current = onTogglePause; }, [onTogglePause]);



  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clearTransientInput = () => {
      resetInputState(keysPressed, isMouseDown, sessionRef.current.engine.playerShip);
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

    const command = (action: ShipCommand) => {
      const engine = sessionRef.current.engine;
      if (engine.battleResult) return;
      if (isAutopilotRef.current && ['system', 'shield', 'vent'].includes(action.kind)) {
        engine.addFloatingText(engine.playerShip.pos.clone(), '自动驾驶中，按 U 接管', [255, 190, 90], 13, 1.3);
        return;
      }
      const aim = clientToCombatWorld(mouseScreenPos.current, canvas, cameraPosRef.current, zoomRef.current);
      const result = dispatchShipCommand(engine.playerShip, action, mouseAimActiveRef.current ? aim : undefined, engine.ships);
      if (!result.accepted && result.reason) engine.addFloatingText(engine.playerShip.pos.clone(), result.reason, [255, 190, 90], 13, 1.3);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (inputBlockedRef.current || !hasCombatInputFocus() || !sessionRef.current.isPresentationReady()) { loseFocus(); return; }
      if (e.target !== canvas) {
        mouseAimActiveRef.current = false;
        sessionRef.current.cameraController.suspendPointer();
        isMouseDown.current = false;
        sessionRef.current.engine.playerShip.isFiringMain = false;
        return;
      }
      mouseScreenPos.current.set(e.clientX, e.clientY);
      mouseAimActiveRef.current = !sessionRef.current.engine.isTacticalMap;
      if (mouseAimActiveRef.current) sessionRef.current.cameraController.samplePointer(e.clientX, e.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (blocked(e.target, true) || e.target !== canvas || e.ctrlKey || e.altKey || e.metaKey) return;
      canvas.focus({ preventScroll: true });
      mouseScreenPos.current.set(e.clientX, e.clientY);
      void sound.preloadSounds();
      const engine = sessionRef.current.engine;
      const curCanvas = canvasRef.current;
      if (!curCanvas) return;

      // The tactical chart owns its independent projection and pointer handlers.
      if (engine.isTacticalMap) return;
      mouseAimActiveRef.current = true;
      sessionRef.current.cameraController.samplePointer(e.clientX, e.clientY);

      if (e.button === 0) {
        if (engine.battleResult || engine.playerShip.isDead || sessionRef.current.state !== 'running' || isAutopilotRef.current) return;
        isMouseDown.current = true;
      } else if (e.button === 2) {
        e.preventDefault();
        command({ kind: 'shield' });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isMouseDown.current = false;
      sessionRef.current.engine.playerShip.isFiringMain = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      if (e.target === canvas) e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.target !== canvas || e.ctrlKey || e.altKey || e.metaKey || blocked(e.target, true) || sessionRef.current.engine.isTacticalMap) return;
      e.preventDefault();
      zoomRef.current = zoomCombatView(zoomRef.current, e.deltaY);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || blocked(e.target)) return;
      const engine = sessionRef.current.engine;
      const action = shipCommandForKey(e);
      if (e.ctrlKey || e.altKey || e.metaKey) {
        if (action && !engine.isTacticalMap) {
          e.preventDefault();
          if (!e.repeat) command(action);
        } else clearTransientInput();
        return;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) { loseFocus(); engine.toggleTacticalMap(); }
        return;
      }
      if (engine.isTacticalMap) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) { clearTransientInput(); onTogglePauseRef.current(); }
        return;
      }
      if (e.code === 'KeyU') {
        if (engine.battleResult || engine.playerShip.isDead || engine.playerShip.isRetreated) return;
        if (!e.repeat) {
          clearTransientInput();
          isAutopilotRef.current = !isAutopilotRef.current;
          setIsAutopilot(isAutopilotRef.current);
          sound.play('autofire_toggle', .8);
        }
        return;
      }
      if (action) {
        e.preventDefault();
        if (!e.repeat) command(action);
        return;
      }
      if (flightKey(e.code)) {
        e.preventDefault();
        if (engine.battleResult || engine.playerShip.isDead || engine.playerShip.isRetreated
          || (!isAutopilotRef.current && sessionRef.current.state === 'running')) keysPressed.current[e.code] = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.code] = false; };
    const onVisibility = () => { if (document.hidden) loseFocus(); };
    const onFocus = (event: FocusEvent) => { if (isCombatTextEntry(event.target) || hasCombatModal()) loseFocus(); };
    const onPointerLeave = () => { mouseAimActiveRef.current = false; sessionRef.current.cameraController.suspendPointer(); isMouseDown.current = false; sessionRef.current.engine.playerShip.isFiringMain = false; };

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
  }, [sessionRef, canvasRef, cameraPosRef, zoomRef, isAutopilotRef, inputBlockedRef, keysPressed, mouseScreenPos, mouseAimActiveRef, isMouseDown, setIsAutopilot]);
}
