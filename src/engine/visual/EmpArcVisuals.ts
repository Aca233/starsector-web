import { Vector2 } from '../math/Vector2';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import type { Ship } from '../simulation/Ship';
import type { EmpArc } from '../simulation/CombatTypes';

export interface NativeEmpArcVisual {
  anchor: Ship;
  fromLocal: Vector2;
  toLocal: Vector2;
  points: Vector2[];
  length: number;
  fringe: [number, number, number, number];
  core: [number, number, number, number];
  period: number;
  elapsed: number;
  level: number;
  peak: number;
  brightness: number;
}

/** D$oo default geometry: a correlated random walk at 1–2 world-unit spacing,
 * bounded by min(distance to either end * .25,100), with no invented branches. */
export function createEmpArcPoints(length: number, random: SimulationRandom): Vector2[] {
  const points = [new Vector2()];
  let x = 0, y = 0, direction = 0;
  while (x < length) {
    const step = 1 + random.next();
    const last = x + step > length - 3;
    x = last ? Math.min(x + step, length - 3) : x + step;
    const envelope = Math.min(Math.min(x, length - x) * .25, 100);
    direction = Math.max(-1, Math.min(1, direction + random.next() - .5));
    let nextY = y + Math.sign(direction) * random.next();
    if (Math.abs(nextY) > Math.abs(envelope)) nextY = Math.sign(nextY) * envelope;
    points.push(new Vector2(x, nextY));
    y = nextY;
    if (last) break;
  }
  points.push(new Vector2(length, 0));
  return points;
}

function resetFlicker(state: NativeEmpArcVisual, random: SimulationRandom): void {
  state.period = .25 * .25 + random.next() * .25 * .75;
  state.peak = Math.min(1, .5 + random.next() * .75);
  state.elapsed = 0;
  state.level = 1;
}

export function createNativeEmpArc(from: Vector2, to: Vector2, anchor: Ship,
  width: number, fringe: [number, number, number, number], core: [number, number, number, number],
  random: SimulationRandom): EmpArc {
  const state: NativeEmpArcVisual = {
    anchor, fromLocal: from.clone().sub(anchor.pos).rotate(-anchor.facingRad),
    toLocal: to.clone().sub(anchor.pos).rotate(-anchor.facingRad),
    length: Math.max(1, from.distanceTo(to)), points: [], fringe: [...fringe], core: [...core],
    period: 0, elapsed: 0, level: 1, peak: 1, brightness: 1
  };
  resetFlicker(state, random);
  state.brightness = Math.min(1, state.level * state.peak * 1.5);
  state.points = createEmpArcPoints(state.length, random);
  return { startPos: from.clone(), endPos: to.clone(), life: 1, maxLife: 1,
    thickness: width, coreColor: [core[0], core[1], core[2]],
    glowColor: [fringe[0], fringe[1], fringe[2]], segments: [], branches: [], native: state };
}

/** EmpArcEntity + damage/oooo_1: simulate flicker; never redraw randomness. */
export function advanceNativeEmpArc(arc: EmpArc, dt: number, random: SimulationRandom): void {
  const s = arc.native!;
  const amount = Math.max(0, dt) * .8;
  s.elapsed += amount;
  if (s.elapsed > s.period) resetFlicker(s, random);
  else if (s.elapsed > s.period / 5) s.level = Math.max(0, s.level - amount / (s.period * .8));
  else s.level = 1;
  s.brightness = Math.min(1, s.level * s.peak * 1.5);
  arc.life = s.level > 0 ? 1 : 0;
  arc.startPos.copy(s.fromLocal).rotate(s.anchor.facingRad).add(s.anchor.pos);
  arc.endPos.copy(s.toLocal).rotate(s.anchor.facingRad).add(s.anchor.pos);
}
