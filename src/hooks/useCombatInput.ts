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
  onRestart: () => void;
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
  onRestart
}: UseCombatInputParams) {
  const onActivateSystemRef = useRef(onActivateSystem);
  const onRestartRef = useRef(onRestart);

  useEffect(() => {
    onActivateSystemRef.current = onActivateSystem;
  }, [onActivateSystem]);

  useEffect(() => {
    onRestartRef.current = onRestart;
  }, [onRestart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clearTransientInput = () => {
      for (const key of Object.keys(keysPressed.current)) keysPressed.current[key] = false;
      isMouseDown.current = false;
      const player = sessionRef.current.engine.playerShip;
      player.isFiringMain = false;
      player.throttle = 0;
      player.strafeInput = 0;
      player.turnInput = 0;
    };

    const blocked = (target: EventTarget | null) => (
      inputBlockedRef.current
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
      mouseScreenPos.current.set(e.clientX, e.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (blocked(e.target)) return;
      mouseScreenPos.current.set(e.clientX, e.clientY);
      void sound.preloadSounds();
      const engine = sessionRef.current.engine;
      const curCanvas = canvasRef.current;
      if (!curCanvas) return;

      if (engine.isTacticalMap) {
        const worldMouseX = (e.clientX - curCanvas.width / 2) / zoomRef.current + cameraPosRef.current.x;
        const worldMouseY = (e.clientY - curCanvas.height / 2) / zoomRef.current + cameraPosRef.current.y;
        const clickWorldPos = new Vector2(worldMouseX, worldMouseY);
        const allUnits = [engine.playerShip, ...engine.fighters, ...engine.bombers];

        if (e.button === 0) {
          let clickedUnit: Ship | null = null;
          for (const unit of allUnits) {
            if (unit.isDead) continue;
            if (clickWorldPos.distanceTo(unit.pos) < Math.max(50, unit.spec.collisionRadius * 1.5)) {
              clickedUnit = unit;
              break;
            }
          }
          engine.selectUnit(clickedUnit?.id ?? null);
        } else if (e.button === 2) {
          e.preventDefault();
          const selectedId = engine.selectedUnitId || 'fleet';
          const targetEnemy = clickWorldPos.distanceTo(engine.enemyShip.pos) < Math.max(80, engine.enemyShip.spec.collisionRadius * 1.5) && !engine.enemyShip.isDead;
          engine.issueOrder(selectedId, targetEnemy
            ? { id: `order-${engine.combatTime.toFixed(4)}-${selectedId}`, type: 'ENGAGE', targetShipId: engine.enemyShip.id, issuedTime: engine.combatTime }
            : { id: `waypoint-${engine.combatTime.toFixed(4)}-${selectedId}`, type: 'WAYPOINT', targetPos: clickWorldPos, issuedTime: engine.combatTime });
        }
        return;
      }

      if (e.button === 0) {
        isMouseDown.current = true;
        engine.playerShip.isFiringMain = true;
      } else if (e.button === 2) {
        e.preventDefault();
        const player = engine.playerShip;
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
      if (blocked(e.target)) return;
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomRef.current = Math.max(0.3, Math.min(1.5, zoomRef.current * zoomFactor));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (blocked(e.target)) return;
      keysPressed.current[e.code] = true;
      void sound.preloadSounds();
      const session = sessionRef.current;
      const engine = session.engine;

      if (e.code === 'Tab') { e.preventDefault(); engine.toggleTacticalMap(); }
      if (e.code === 'KeyZ') engine.toggleFighterRecall();
      if (e.code === 'KeyU') { setIsAutopilot((prev) => !prev); sound.play('autofire_toggle', 0.8); }
      if (e.code === 'KeyV' || e.code === 'Space') engine.playerShip.startVenting();
      if (e.code === 'KeyF') onActivateSystemRef.current();
      if (e.code === 'KeyC') engine.launchCountermeasures();
      if (e.code === 'KeyR') {
        onRestartRef.current();
        clearTransientInput();
      }

      const digitMatch = e.code.match(/^(?:Digit|Numpad)([1-5])$/);
      if (digitMatch) {
        const groupIndex = parseInt(digitMatch[1], 10) - 1;
        if (e.ctrlKey) { e.preventDefault(); engine.playerShip.toggleAutofire(groupIndex); }
        else engine.playerShip.selectWeaponGroup(groupIndex);
      }
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
