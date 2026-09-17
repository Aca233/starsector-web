import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import type { Ship } from '../../engine/simulation/Ship';
import type { FixedTimestepScheduler } from '../../engine/simulation/FixedTimestepScheduler';
import { Vector2 } from '../../engine/math/Vector2';
import { hasCombatInputFocus } from '../../engine/runtime/CombatInputFocus';
import { clientToCombatWorld } from '../../engine/runtime/PlayerControls';
import { lockedCombatTarget, pickCombatContact } from '../../engine/runtime/CombatTargeting';
import { FloatingShipHUD } from './FloatingShipHUD';
import { TargetShipHUD } from './TargetShipHUD';

interface Props {
  engine: CombatEngine;
  cameraPosRef?: MutableRefObject<Vector2>;
  zoomRef?: MutableRefObject<number>;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  scheduler?: FixedTimestepScheduler;
  paused?: boolean;
  blocked?: boolean;
}

/** One pointer/roster observer for the entire fleet; at most one hover and one locked HUD. */
export function CombatContacts({ engine, cameraPosRef, zoomRef, canvasRef, scheduler, paused = false, blocked = false }: Props) {
  const [contacts, setContacts] = useState<{ hover: Ship | null; target: Ship | null }>({ hover: null, target: null });
  const state = useRef({ blocked, paused });
  useLayoutEffect(() => { state.current = { blocked, paused }; }, [blocked, paused]);
  const alphaRef = useRef(1);
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const pointer = new Vector2(), origin = new Vector2();
    let pointerActive = false, frame = 0, lastRefresh = 0;
    let current = { hover: null as Ship | null, target: null as Ship | null };
    const clear = () => { pointerActive = false; };
    const sample = (event: MouseEvent) => {
      pointerActive = event.target === canvas && !state.current.blocked && !engine.isTacticalMap && hasCombatInputFocus();
      if (pointerActive) pointer.set(event.clientX, event.clientY);
    };
    const update = (now: number) => {
      alphaRef.current = scheduler && !state.current.paused ? scheduler.alpha : 1;
      const suppressed = state.current.blocked || engine.isTacticalMap || !hasCombatInputFocus();
      if (suppressed) clear();
      const player = engine.playerShip, ships = engine.ships;
      const target = suppressed ? null : lockedCombatTarget(ships, player);
      const zoom = zoomRef?.current ?? 1;
      const point = pointerActive ? clientToCombatWorld(pointer, canvas, cameraPosRef?.current ?? origin, zoom) : null;
      const hover = point ? pickCombatContact(ships, player, point, 8 * canvas.width / Math.max(1, canvas.clientWidth) / zoom, false, alphaRef.current) : null;
      const next = { hover: hover === target ? null : hover, target };
      // Refresh read-only weapon/CR/status text at 10Hz, not React once per ship per frame.
      if (next.hover !== current.hover || next.target !== current.target || ((next.target || next.hover) && now - lastRefresh >= 100)) {
        current = next; lastRefresh = now; setContacts(next);
      }
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('mousemove', sample);
    window.addEventListener('mousedown', sample);
    window.addEventListener('blur', clear);
    canvas.addEventListener('mouseleave', clear);
    document.addEventListener('visibilitychange', clear);
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', sample);
      window.removeEventListener('mousedown', sample);
      window.removeEventListener('blur', clear);
      canvas.removeEventListener('mouseleave', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [engine, cameraPosRef, zoomRef, canvasRef, scheduler]);
  if (blocked || engine.isTacticalMap) return null;
  const shared = { cameraPosRef, zoomRef, canvasRef, alphaRef };
  return <>
    {contacts.hover && <FloatingShipHUD key={'hover:' + contacts.hover.id} ship={contacts.hover}
      isEnemy={contacts.hover.teamId !== engine.playerShip.teamId} observerTeamId={engine.playerShip.teamId} {...shared} />}
    {contacts.target && <TargetShipHUD key={'target:' + contacts.target.id} ship={contacts.target} observer={engine.playerShip} {...shared} />}
  </>;
}
