import { BodyFlag, ProjectileFlag, type StageView } from './StageProtocol';
import type { FireInputs } from './FireInputs';
import { fireCircle, fireSegment } from './FireGeometry';

const stageBudgets = new WeakMap<StageView, FireBudget>();
/** One launched-fire index per phase, shared by every shooter/controller. */
export function fireBudgetFor(v: StageView, f: FireInputs): FireBudget {
  let budget = stageBudgets.get(v);
  if (!budget) { budget = new FireBudget(); stageBudgets.set(v, budget); }
  budget.bind(v, f);
  return budget;
}

/** Actual launched-fire advisory ledger. Never a pre-reservation or permission
 * to stop shooting. The owning stage publishes rounds at its ordered boundary.
 * Port of InFlightFireBudget.estimate/needsDetailedPenalty/penalty, including
 * moving blockers, arming, local 21-cell armor and shield recovery confidence. */
export class FireBudget {
  private byTarget: readonly number[][] = [];
  bind(_v: StageView, f: FireInputs): void { this.byTarget = f.budgetRows; }
  needsDetailed(v: StageView, f: FireInputs, own: number, target: number): boolean {
    const b = v.bodies;
    if (f.shieldOn[target] || b.shieldType[target] === 3) return false;
    if (!f.armor[target].native || !Number.isFinite(b.hp[target]) || !Number.isFinite(b.maxHp[target])
      || b.hp[target] <= 0 || b.hp[target] <= b.maxHp[target] * .5) return true;
    let raw = 0;
    for (const p of this.byTarget[target] ?? []) {
      if (!Number.isFinite(v.projectiles.damage[p])) return true;
      if (f.budgetTeam[p] !== b.team[own]) continue;
      raw += Math.max(0, v.projectiles.damage[p]);
      if (raw >= b.hp[target] * .25) return true;
    }
    return false;
  }
  penalty(v: StageView, f: FireInputs, scope: Uint8Array, own: number, target: number, before: number): number {
    const b = v.bodies, p = v.projectiles;
    const horizon = Math.min(3, before);
    if (!Number.isFinite(horizon) || horizon <= 0 || b.flags[target] & (BodyFlag.DEAD | BodyFlag.COLLISIONLESS)
      || b.team[target] === b.team[own] || b.shieldType[target] === 3 || !f.nativeThreat[target]
      || f.shieldOn[target]) return 0;
    const a = f.armor[target];
    let damage = 0;
    for (const shot of this.byTarget[target] ?? []) {
      if (!f.eligibleBudget[shot] || v.damagedRows.get(shot)?.has(target)
        || f.budgetTeam[shot] !== b.team[own]) continue;
      const speed = f.sourceSpeed[shot];
      if (!(speed > 0)) continue;
      const life = Math.min(horizon, p.rangeRemaining[shot] / speed, f.flightLife[shot]);
      const vx = p.vx[shot] - b.vx[target], vy = p.vy[shot] - b.vy[target];
      const entry = fireSegment(v, f.shieldOn, target, p.x[shot], p.y[shot],
        p.x[shot] + vx * life, p.y[shot] + vy * life);
      if (entry === null) continue;
      const eta = entry * life;
      if (f.arming[shot] > eta) continue;
      let blocked = false;
      const teamIndex = v.teams.indexOf(b.team[own]);
      for (let other = 0; other < v.bodyCount; other++) {
        if (!f.budgetScope[other] || other === target || other === p.sourceRow[shot]
          || b.flags[other] & BodyFlag.COLLISIONLESS || teamIndex < 0
          || !v.visibility[other * v.teams.length + teamIndex]) continue;
        if (fireSegment(v, f.shieldOn, other, p.x[shot], p.y[shot],
          p.x[shot] + (p.vx[shot] - b.vx[other]) * eta,
          p.y[shot] + (p.vy[shot] - b.vy[other]) * eta,
          !!b.shieldVoid[other] && b.team[other] === f.explicitProjectileTeam[shot]) !== null) { blocked = true; break; }
      }
      if (blocked) continue;
      for (let rock = 0; rock < f.asteroidHp.length; rock++) {
        if (f.asteroidHp[rock] > 0 && fireCircle(p.x[shot], p.y[shot],
          p.x[shot] + (p.vx[shot] - f.asteroidVx[rock]) * eta,
          p.y[shot] + (p.vy[shot] - f.asteroidVy[rock]) * eta,
          f.asteroidX[rock], f.asteroidY[rock], f.asteroidRadius[rock] + p.radius[shot]) !== null) {
          blocked = true; break;
        }
      }
      if (blocked) continue;
      const cos = Math.cos(-b.facing[target]), sin = Math.sin(-b.facing[target]);
      const hx = p.x[shot] + vx * eta - b.x[target], hy = p.y[shot] + vy * eta - b.y[target];
      const x = hx * cos - hy * sin, y = hx * sin + hy * cos;
      const col = Math.max(0, Math.min(a.cols - 1, Math.floor((x - a.minX) / a.width)));
      const row = Math.max(0, Math.min(a.rows - 1, Math.floor((y - a.minY) / a.height)));
      const type = p.damageType[shot];
      const typeMult = type === 1 ? 2 : type === 0 ? .5 : type === 3 ? .25 : 1;
      const armorMult = typeMult * a.armorMult[type], hullMult = a.hullMult[type];
      if (!(armorMult > 0 && hullMult > 0)) continue;
      let effective = 0, absorption = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        const c = col + dx, r = row + dy;
        const cell = c < 0 || r < 0 || c >= a.cols || r >= a.rows ? 0 : a.cells[r * a.cols + c];
        effective += cell * ((dx === 0 && dy === 0 || Math.abs(dx) <= 1 && Math.abs(dy) <= 1)
          ? 1 : .033333335 / .06666667);
        absorption += cell;
      }
      effective = Math.max(effective * a.effective * a.dynamicEffective, a.residual);
      const strength = p.damage[shot] * armorMult;
      const reduced = strength * Math.max(1 - a.reduction, strength / (strength + effective));
      let confidence = p.flags[shot] & ProjectileFlag.GUIDED ? .55 : .8;
      if (b.shieldType[target] !== 0 && !(b.flags[target] & BodyFlag.OVERLOADED && b.overloadTimer[target] > eta)
        && !(b.flags[target] & BodyFlag.VENTING && b.ventTime[target] > eta)) confidence *= .35;
      const expected = Math.max(0, reduced - absorption) * hullMult / armorMult * confidence;
      if (Number.isFinite(expected)) damage += expected;
    }
    const coverage = damage / Math.max(1, b.hp[target]);
    return 2.5 * Math.max(0, Math.min(1, (coverage - .6) / .8));
  }
}
