import { encodeMotionDisplayFrame } from './MotionDisplay.mjs';
import { motionToText, MOTION_MAX_SHIPS } from './MotionFrame.mjs';
import type { MotionRow } from './MotionFrame.mjs';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
/** Native authority only. No large snapshot traversal or AI. Bounded display precision only; authority stays exact. */
export function captureMotion(engine: CombatEngine, tick: number, acknowledged: Record<number, number>): string | null {
  const active = engine.allCapitalShips.filter(ship => !engine.deployment.isReserve(ship.id));
  if (active.length > MOTION_MAX_SHIPS) return null; // Whole feature falls back; never silently omit ships.
  const ships: MotionRow[] = active.map(s => [s.id, s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.facingRad, s.angularVelRad,
    s.teleportSequence, (s.isDead ? 1 : 0) | (s.isRetreated ? 2 : 0)]);
  try { return motionToText(encodeMotionDisplayFrame({ tick, time: engine.combatTime, acknowledged, ships })); }
  catch { return null; }
}
