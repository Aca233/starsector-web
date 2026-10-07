import { existingStateCore } from '../engine/simulation/CombatStateCore';
import { encodeMotionDisplayFrame } from './MotionDisplay.mjs';
import { motionToText, MOTION_MAX_SHIPS } from './MotionFrame.mjs';
import type { MotionRow } from './MotionFrame.mjs';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
/** Native authority only. No large snapshot traversal or AI. Bounded display precision only; authority stays exact. */
export function captureMotion(engine: CombatEngine, tick: number, acknowledged: Record<number, number>): string | null {
  const active = engine.allCapitalShips.filter(ship => !engine.deployment.isReserve(ship.id));
  if (active.length > MOTION_MAX_SHIPS) return null; // Whole feature falls back; never silently omit ships.
  const core = existingStateCore(engine);
  const ships: MotionRow[] = active.map(s => {
    const pose=core?.pose(s);
    return pose ? [s.id,pose[0],pose[1],pose[2],pose[3],pose[4],pose[5],s.teleportSequence, (pose[6]?1:0)|(pose[7]?2:0)]
      : [s.id,s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.teleportSequence,(s.isDead?1:0)|(s.isRetreated?2:0)];
  });
  try { return motionToText(encodeMotionDisplayFrame({ tick, time: engine.combatTime, acknowledged, ships })); }
  catch { return null; }
}
