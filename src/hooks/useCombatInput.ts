import { useEffect, useRef } from 'react';
import { Vector2 } from '../engine/math/Vector2';
import { Ship } from '../engine/simulation/Ship';
import { sound } from '../engine/audio/SoundManager';
import { CombatSession } from '../engine/runtime/CombatSession';

export interface UseCombatInputParams {
  sessionRef: React.MutableRefObject<CombatSession>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraPosRef: React.MutableRefObject<Vector2>;
  zoomRef: React.MutableRefObject<number>;
  isAutopilotRef: React.MutableRefObject<boolean>;
  inputBlockedRef: React.MutableRefObject<boolean>;
  keysPressed: React.MutableRefObject<{ [key: string]: boolean }>;
  mouseScreenPos: React.MutableRefObject<Vector2>;
  isMouseDown: React.MutableRefObject<boolean>;
  setIsAutopilot: React.Dispatch<React.SetStateAction<boolean>>;
  onActivateSystem: () => void;
  onTogglePause: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function isInteractiveUiTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return !!element.closest(
    'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [data-combat-input-block]'
  );
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
  isMouseDown,
  setIsAutopilot,
  onActivateSystem,
  onTogglePause
}: UseCombatInputParams) {
  const onActivateSystemRef = useRef(onActivateSystem);
  const onTogglePauseRef = useRef(onTogglePause);
  useEffect(() => { onTogglePauseRef.current = onTogglePause; }, [onTogglePause]);

  useEffect(() => {
    onActivateSystemRef.current = onActivateSystem;
  }, [onActivateSystem]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clearTransientInput = () => {
      resetInputState(keysPressed, isMouseDown, sessionRef.current.engine.playerShip);
    };

    const blocked = (target: EventTarget | null) => (
      inputBlockedRef.current
      || !!document.querySelector('[role="dialog"], [role="alertdialog"]')
      || !sessionRef.current.isPresentationReady()
      || isEditableTarget(target)
      || isInteractiveUiTarget(target)
    );

    const unsubscribePresentation = sessionRef.current.subscribePresentation((state) => {
      if (state.status !== 'ready') clearTransientInput();
    });
    if (!sessionRef.current.isPresentationReady()) clearTransientInput();

    const onMouseMove = (e: MouseEvent) => {
      if (inputBlockedRef.current || !sessionRef.current.isPresentationReady()) return;
      if (e.target !== canvas) return;
      mouseScreenPos.current.set(e.clientX, e.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (blocked(e.target) || e.target !== canvas) return;
      canvas.focus({ preventScroll: true });
      mouseScreenPos.current.set(e.clientX, e.clientY);
      void sound.preloadSounds();
      const engine = sessionRef.current.engine;
      const curCanvas = canvasRef.current;
      if (!curCanvas) return;

      // The tactical chart owns its independent projection and pointer handlers.
      if (engine.isTacticalMap) return;

      if (e.button === 0) {
        isMouseDown.current = true;
        engine.playerShip.isFiringMain = true;
      } else if (e.button === 2) {
        e.preventDefault();
        const player = engine.playerShip;
        if (player.defenseSystem.type !== 'NONE') { player.activateDefenseSystem(); return; }
        if (!player.canUseShields()) return;
        const active = player.shield.toggle();
        if (player.shield.type === 'PHASE') sound.play(active ? 'phase_activate' : 'phase_deactivate', 0.9);
        else sound.play(active ? 'shield_up' : 'shield_down', 0.65);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isMouseDown.current = false;
      sessionRef.current.engine.playerShip.isFiringMain = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!blocked(e.target)) e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || blocked(e.target) || sessionRef.current.engine.isTacticalMap) return;
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomRef.current = Math.max(0.3, Math.min(1.5, zoomRef.current * zoomFactor));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || blocked(e.target)) return;
      const engine = sessionRef.current.engine;
      const digitMatch = e.code.match(/^(?:Digit|Numpad)([1-7])$/);
      // Browser/OS chords are not bare flight keys. Only Ctrl+1..7 is a
      // deliberate combat chord; Shift remains available for mouse steering.
      if (e.ctrlKey || e.altKey || e.metaKey) {
        if (!engine.isTacticalMap && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && digitMatch) {
          e.preventDefault();
          if (!e.repeat) engine.playerShip.toggleAutofire(Number(digitMatch[1]) - 1);
        } else if (!/^(Control|Alt|Meta)(Left|Right)$/.test(e.code)) {
          clearTransientInput();
        }
        return;
      }
      // The live mode owns Tab even during the HUD's mount/unmount interval.
      // Once mounted, the chart capture handler consumes it before this one.
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) { clearTransientInput(); engine.toggleTacticalMap(); }
        return;
      }
      if (engine.isTacticalMap) return;
      keysPressed.current[e.code] = true;
      if (e.repeat) {
        if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
        return;
      }
      void sound.preloadSounds();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'KeyZ') engine.toggleFighterRecall();
      if (e.code === 'KeyU') { setIsAutopilot((prev) => !prev); sound.play('autofire_toggle', 0.8); }
      if (e.code === 'Space') { clearTransientInput(); onTogglePauseRef.current(); return; }
      if (e.code === 'KeyV') engine.playerShip.startVenting();
      if (e.code === 'KeyF') onActivateSystemRef.current();

      if (digitMatch) engine.playerShip.selectWeaponGroup(Number(digitMatch[1]) - 1);
    };

    const onKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.code] = false; };
    const onVisibility = () => { if (document.hidden) clearTransientInput(); };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearTransientInput);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTransientInput();
      unsubscribePresentation();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearTransientInput);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sessionRef, canvasRef, cameraPosRef, zoomRef, isAutopilotRef, inputBlockedRef, keysPressed, mouseScreenPos, isMouseDown, setIsAutopilot]);
}
