import { signedAngle } from '../../math/Angles';
import { interceptTimeComponents } from '../FireControlGeometry';
import { advanceTurretAim } from '../../simulation/systems/weapon/WeaponAim';
import { SimulationRandom } from '../../simulation/SimulationRandom';
import type { SystemAutofirePolicy } from '../../extensions/ship-systems/Types';
import type { FireDecision } from '../AutofireController';
import { BodyFlag as B, WeaponFlag as W, ProjectileFlag as P, type StageView } from './StageProtocol';
import { FireHint as H, fireAvailable, type FireInputs } from './FireInputs';
import { fireCircle, fireSegment, fireShieldCovered } from './FireGeometry';
import { FireBudget, fireBudgetFor } from './FireBudget';
import { coordinateLength } from '../../math/Vector2';

const adaptiveBudget = import.meta.env?.VITE_AI_FIRE_BUDGET_ADAPTIVE !== 'false';
export type FireTargetKind = 0 | 1 | 2; // absent, hull, missile/decoy
export interface FireMemory {
  scanIn: number; firingTime: number; idleFireTime: number; ammoAllowed: boolean;
  policyKey?: string; random: SimulationRandom;
  numericCadence?: {
    mode: 'multirate' | '20hz'; aimIn: number; scanIn: number; salt: number;
    x: number; y: number; point: boolean; range: number; speed: number;
    base: number; arc: number; rx: number; ry: number; pd: boolean; initialized: boolean;
  };
}
export interface FireCoverage {
  numericMounts: number; genericMounts: number; specialForceMounts: number;
  customBudgetCalls: number; stageEpoch: number;
  fallbackReason?: 'unbound-stage' | 'custom-controller' | 'custom-system' | 'custom-budget' | 'missing-owner' | 'incomplete-budget-stage';
  unsupportedMechanisms?: string[];
  postTurnBoreChecks?: number; orderedFluxRechecks?: number;
  numericAimCalls?: number; numericAcquisitionScans?: number;
}
export const FIRE_DOMAIN_CONTRACT = Object.freeze({
  stage: 'FIRE_QUERY', binding: 'stageFor(world)',
  oldPreparationRequired: false, postTurnBoreRequired: true,
  futureResourceReservation: false, candidateCaps: false,
});
/** This callback exists ONLY for unknown advisory estimators/armor hooks. Native
 * budget never goes back through InFlightFireBudget or Ship candidate readers. */
export type CustomFirePenalty = (row: number, arrival: number) => number;

/** Full read-dense fire domain. Scratch is reused per controller; candidate
 * storage contains scalar columns/indices, never {target,entity,Vector2} graphs.
 * Bind once per ship plan; setMount once per mount. Consumers resolve ONLY the
 * final target row and perform tracker/turret writes and original ordered fire.
 */
export class FireProgram {
  private v!: StageView;
  private f!: FireInputs;
  private scope!: Uint8Array;
  private missileScope!: Uint8Array;
  private own = -1;
  private teamIndex = -1;
  private budget!: FireBudget;
  private budgetPresent = false;
  private nativeBudget = true;
  private penalty?: CustomFirePenalty;
  private coverage!: FireCoverage;
  private m = -1;
  private memory!: FireMemory;
  private dt = 0;
  private cadenceMode?: 'multirate' | '20hz';
  private ox = 0; private oy = 0; private pivotX = 0; private pivotY = 0;
  private delay = 0; private speed = 0; private range = 0;
  private contactTime = 0; private contactDistance = 0;
  private solveX = 0; private solveY = 0;
  private finalBore = false;
  private kinds: FireTargetKind[] = []; private rows: number[] = [];
  private xs: number[] = []; private ys: number[] = [];
  private priorities: number[] = []; private threats: number[] = [];
  private utilities: number[] = []; private retained: number[] = []; private traverses: number[] = [];
  private order: number[] = [];
  targetKind: FireTargetKind = 0;
  targetRow = -1;
  pointX = 0; pointY = 0; hasPoint = false;
  steerX = 0; steerY = 0; hasSteer = false;
  angle = 0; idle = 0;

  bind(v: StageView, f: FireInputs, scope: Uint8Array, missileScope: Uint8Array, own: number,
    budgetPresent: boolean, nativeBudget: boolean, coverage: FireCoverage, penalty?: CustomFirePenalty): void {
    this.v = v; this.f = f; this.scope = scope; this.missileScope = missileScope; this.own = own;
    this.teamIndex = v.teams.indexOf(v.bodies.team[own]);
    this.budgetPresent = budgetPresent; this.nativeBudget = nativeBudget; this.penalty = penalty;
    this.coverage = coverage; this.budget = fireBudgetFor(v, f);
  }
  setMount(m: number, state: FireMemory, kind: FireTargetKind, row: number, dt: number): void {
    this.configureMount(m, dt);
    this.setMemory(state, kind, row);
  }
  /** Manual/inactive/force mounts need turret state, not an allocated AI tracker. */
  configureMount(m: number, dt: number): void {
    this.m = m; this.dt = dt;
    const b = this.v.bodies, w = this.v.weapons, c = this.f.weapons[m];
    const cos = Math.cos(b.facing[this.own]), sin = Math.sin(b.facing[this.own]);
    this.pivotX = c.relativeX * cos - c.relativeY * sin + b.x[this.own];
    this.pivotY = c.relativeX * sin + c.relativeY * cos + b.y[this.own];
    this.angle = w.angle[m]; this.idle = c.idle;
    this.delay = w.firingState[m] === 1 ? Math.max(0, w.chargeDelay[m])
      : w.firingState[m] === 0 && w.burstRemaining[m] <= 0 ? w.chargeDelay[m] : 0;
    this.speed = w.speed[m]; this.range = w.effectiveRange[m];
    this.targetKind = 0; this.targetRow = -1;
    this.hasPoint = this.hasSteer = false;
    this.refreshBore(this.angle);
    this.finalBore = false;
  }
  setMemory(state: FireMemory, kind: FireTargetKind, row: number): void {
    this.memory = state; this.targetKind = kind; this.targetRow = row;
  }
  /** MUST be called after the turret actually advances. Own barrel offset uses
   * the new angle; all other body transforms remain the shared FIRE_QUERY view.
   * No stale snapshot angle/muzzle can reach decide/shotObstruction. */
  refreshBore(actualAngle: number): void {
    const c = this.f.weapons[this.m];
    this.angle = actualAngle;
    const cos = Math.cos(actualAngle), sin = Math.sin(actualAngle);
    this.ox = c.hasMuzzleOffset ? this.pivotX + (c.offsetX * cos - c.offsetY * sin) : this.pivotX;
    this.oy = c.hasMuzzleOffset ? this.pivotY + (c.offsetX * sin + c.offsetY * cos) : this.pivotY;
  }
  /** Explicit D inspection only; never allocated in the gameplay/candidate loop. */
  readBoreInput(): Readonly<{ mountRow: number; angle: number; x: number; y: number; postTurn: boolean }> {
    return { mountRow: this.m, angle: this.angle, x: this.ox, y: this.oy, postTurn: this.finalBore };
  }
  private pd(): boolean { return !!(this.v.weapons.flags[this.m] & W.PD); }
  private guided(): boolean { return !!(this.v.weapons.flags[this.m] & W.GUIDED); }
  private beam(): boolean { return !!(this.v.weapons.flags[this.m] & W.BEAM); }
  private radius(kind: FireTargetKind, row: number): number {
    return kind === 1 ? this.f.targetRadius[row] : this.v.projectiles.radius[row];
  }
  private eligible(kind: FireTargetKind, row: number): boolean {
    if (row < 0 || !kind) return false;
    const v = this.v, b = v.bodies, w = v.weapons, f = this.f, c = f.weapons[this.m];
    const flags = w.flags[this.m], hints = c.hints, pd = this.pd();
    if (kind === 2) {
      const p = v.projectiles;
      if (row >= v.projectileCount || !this.missileScope[row] || p.flags[row] & P.NO_COLLISION) return false;
      if (!Number.isFinite(f.explicitProjectileTeam[row])
        && (p.sourceRow[row] < 0 || !this.scope[p.sourceRow[row]])) return false;
      if (f.decoy[row]) {
        if (flags & W.PD_ONLY && !(hints & H.ANTI_FTR) || c.passFighters) return false;
        if (!pd && !(hints & H.ANTI_FTR) && (hints & H.STRIKE
          || c.weaponMissile && Number.isFinite(w.ammo[this.m]) && !(hints & H.DO_NOT_AIM))) return false;
      } else if (this.guided() || !this.beam() && c.missileBody && !c.hasProximity) return false;
      return !!(f.decoy[row] || pd) && Number.isFinite(f.projectileTeam[row])
        && f.projectileTeam[row] !== b.team[this.own] && f.missileHp[row] > 0 && f.flightLife[row] > 0
        && !(f.flare[row] && (hints & H.IGNORES_FLARES || f.pdIgnoreFlares[this.own] > 0));
    }
    if (row >= v.bodyCount || !this.scope[row] || f.vast[row]
      || b.flags[row] & (B.DEAD | B.COLLISIONLESS) || b.team[row] === b.team[this.own]
      || this.teamIndex < 0 || !v.visibility[row * v.teams.length + this.teamIndex]) return false;
    const fighter = !!(b.flags[row] & B.FIGHTER);
    if (flags & W.PD_ONLY && !(hints & H.ANTI_FTR && fighter)) return false;
    if (fighter && (c.passFighters || !pd && !(hints & H.ANTI_FTR)
      && (hints & H.STRIKE || c.weaponMissile && Number.isFinite(w.ammo[this.m]) && !(hints & H.DO_NOT_AIM)))) return false;
    return !(b.size[row] === 1 && hints & H.STRIKE && !(hints & H.USE_VS_FRIGATES));
  }
  private trace(kind: FireTargetKind, row: number, angle: number): boolean {
    const v = this.v, b = v.bodies, p = v.projectiles, w = v.weapons;
    const tx = kind === 1 ? b.vx[row] : p.vx[row], ty = kind === 1 ? b.vy[row] : p.vy[row];
    const vx = b.vx[this.own] - tx, vy = b.vy[this.own] - ty;
    const horizon = this.beam() ? 0 : this.range / Math.max(1e-6, this.speed);
    const sx = this.ox + vx * this.delay, sy = this.oy + vy * this.delay;
    const ex = sx + Math.cos(angle) * this.range + vx * horizon;
    const ey = sy + Math.sin(angle) * this.range + vy * horizon;
    const t = kind === 1 ? fireSegment(v, this.f.shieldOn, row, sx, sy, ex, ey)
      : fireCircle(sx, sy, ex, ey, p.x[row], p.y[row],
        p.radius[row] + w.projectileRadius[this.m] + this.f.weapons[this.m].proximity);
    if (t === null) return false;
    this.contactTime = horizon * t; this.contactDistance = this.range * t;
    return true;
  }
  private solve(kind: FireTargetKind, row: number): boolean {
    const v = this.v, b = v.bodies, p = v.projectiles, w = v.weapons;
    const x = kind === 1 ? b.x[row] : p.x[row], y = kind === 1 ? b.y[row] : p.y[row];
    const vx = (kind === 1 ? b.vx[row] : p.vx[row]) - b.vx[this.own];
    const vy = (kind === 1 ? b.vy[row] : p.vy[row]) - b.vy[this.own];
    // Conservative rejection only: same bound as outsideAcquisition. This does
    // not truncate candidates, use collision radius as hull geometry or change
    // cadence/fire rate; uncertain/nonfinite bounds always reach the full solve.
    const limit = this.range + this.radius(kind, row);
    const horizon = this.delay + (this.beam() ? 0 : limit / this.speed);
    const reach = limit + (Math.abs(vx) + Math.abs(vy)) * horizon;
    const distanceBound = Math.max(Math.abs(x - this.ox), Math.abs(y - this.oy));
    const pad = 1e-6 * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(this.ox), Math.abs(this.oy), Math.abs(reach));
    if (this.speed > 0 && this.delay >= 0 && limit >= 0 && horizon >= 0 && Number.isFinite(reach)
      && distanceBound > reach + pad) return false;
    const px = x - this.ox + vx * this.delay, py = y - this.oy + vy * this.delay;
    const time = this.beam() ? 0 : interceptTimeComponents(px, py, vx, vy, this.speed);
    if (time === null) return false;
    this.solveX = this.ox + px + vx * time; this.solveY = this.oy + py + vy * time;
    if (!Number.isFinite(this.solveX) || !Number.isFinite(this.solveY)) return false;
    const dx = this.solveX - this.ox, dy = this.solveY - this.oy, distance = coordinateLength(dx, dy);
    if (distance > this.range + this.radius(kind, row)) return false;
    const c = this.f.weapons[this.m];
    const free = this.guided() && (w.flags[this.m] & W.ALWAYS_FIRE || c.hints & (H.DO_NOT_AIM | H.GUIDED_POOR));
    if (!free && c.arc < 360 && Math.abs(signedAngle(Math.atan2(dy, dx) - w.baseAngle[this.m]))
      > w.arc[this.m] / 2 + Math.asin(Math.min(1, this.radius(kind, row) / Math.max(1, distance)))) return false;
    if (!this.guided() && (!this.trace(kind, row, Math.atan2(dy, dx))
      || kind === 2 && this.delay + this.contactTime > this.f.flightLife[row])) return false;
    return true;
  }
  private obstruction(angle: number): 'FRIENDLY_BLOCKED' | 'OBSTACLE_BLOCKED' | null {
    const v = this.v, b = v.bodies, f = this.f, c = f.weapons[this.m];
    const travelX = Math.cos(angle) * this.contactDistance, travelY = Math.sin(angle) * this.contactDistance;
    for (let other = 0; other < v.bodyCount; other++) {
      if (!this.scope[other] || other === this.own || b.flags[other] & (B.DEAD | B.PHASED)
        || b.team[other] !== b.team[this.own]
        || b.assemblyRootRow[other] === b.assemblyRootRow[this.own] && !f.noFireThrough[other]
        || b.flags[other] & B.FIGHTER && c.passFighters) continue;
      const vx = b.vx[this.own] - b.vx[other], vy = b.vy[this.own] - b.vy[other];
      const sx = this.ox + vx * this.delay, sy = this.oy + vy * this.delay;
      if (fireSegment(v, f.shieldOn, other, sx, sy,
        sx + travelX + vx * this.contactTime, sy + travelY + vy * this.contactTime, !!b.shieldVoid[other]) !== null)
        return 'FRIENDLY_BLOCKED';
    }
    for (let rock = 0; rock < f.asteroidHp.length; rock++) {
      if (f.asteroidHp[rock] <= 0) continue;
      const vx = b.vx[this.own] - f.asteroidVx[rock], vy = b.vy[this.own] - f.asteroidVy[rock];
      const sx = this.ox + vx * this.delay, sy = this.oy + vy * this.delay;
      if (fireCircle(sx, sy, sx + travelX + vx * this.contactTime, sy + travelY + vy * this.contactTime,
        f.asteroidX[rock], f.asteroidY[rock], f.asteroidRadius[rock] + v.weapons.projectileRadius[this.m]) !== null)
        return 'OBSTACLE_BLOCKED';
    }
    return null;
  }
  private impact(row: number): number {
    const b = this.v.bodies, p = this.v.projectiles, own = this.own;
    const dx = p.x[row] - b.x[own], dy = p.y[row] - b.y[own];
    const vx = p.vx[row] - b.vx[own], vy = p.vy[row] - b.vy[own];
    const radius = Math.max(b.radius[own], this.f.shieldOn[own] ? b.shieldRadius[own] : 0) + p.radius[row];
    const distance = coordinateLength(dx, dy);
    if (distance <= radius) return 0;
    const velocity = coordinateLength(vx, vy);
    const horizon = this.f.flightLifePresent[row] ? this.f.flightLife[row]
      : velocity > 0 ? distance / velocity * 2 : 0;
    if (!(horizon > 0)) return Infinity;
    const t = fireCircle(dx, dy, dx + vx * horizon, dy + vy * horizon, 0, 0, radius);
    return t === null ? Infinity : horizon * t;
  }
  private utility(row: number, retained: boolean, traverse: number, arrival: number): number {
    const b = this.v.bodies, w = this.v.weapons, f = this.f, c = f.weapons[this.m];
    const hull = Math.max(0, Math.min(1, b.hp[row] / Math.max(1, b.maxHp[row])));
    const vulnerable = !!(b.flags[row] & (B.OVERLOADED | B.VENTING));
    const shield = fireShieldCovered(this.v, f.shieldOn, row, this.ox, this.oy) && !vulnerable;
    const type = w.damageType[this.m];
    const effectiveness = type === 0 ? shield ? 2 : .5 : type === 1 ? shield ? .5 : 2
      : type === 3 ? b.flags[row] & B.FIGHTER ? 1.5 : .25 : 1;
    return effectiveness * .65 + (row === f.currentTarget[this.own] ? .45 : 0) + (retained ? .22 : 0)
      + f.finish[this.own] * ((1 - hull) * .55 + (vulnerable ? .55 : 0))
      + f.pressure[this.own] * (shield ? Math.max(0, Math.min(1, b.fluxPercent[row])) * .35 : 0)
      - (shield && c.hints & H.USE_LESS_VS_SHIELDS ? 1.8 : 0)
      - (Number.isFinite(w.ammo[this.m]) && !(c.regen > 0) && shield && type === 1 ? .6 : 0)
      - Math.min(Math.PI, Math.abs(traverse)) * .14 - Math.min(4, Math.max(0, arrival)) * .06;
  }
  private scan(policy?: SystemAutofirePolicy): void {
    this.coverage.numericAcquisitionScans = (this.coverage.numericAcquisitionScans ?? 0) + 1;
    const v = this.v, f = this.f, state = this.memory;
    this.order.length = 0;
    let count = 0, hulls = 0;
    const add = (kind: FireTargetKind, row: number) => {
      if (!this.eligible(kind, row) || !this.solve(kind, row)) return;
      this.kinds[count] = kind; this.rows[count] = row;
      this.xs[count] = this.solveX; this.ys[count] = this.solveY;
      this.order.push(count++); if (kind === 1) hulls++;
    };
    for (let p = 0; p < v.projectileCount; p++) if (this.missileScope[p] && (this.pd() || f.decoy[p])) add(2, p);
    for (let row = 0; row < v.bodyCount; row++) if (this.scope[row] && v.bodies.team[row] !== v.bodies.team[this.own]) add(1, row);
    const autonomous = !!f.autonomous[this.own];
    const omit = adaptiveBudget && autonomous && hulls < 2 && this.nativeBudget;
    for (let i = 0; i < count; i++) {
      const kind = this.kinds[i], row = this.rows[i], retained = kind === this.targetKind && row === this.targetRow;
      const traverse = Math.abs(signedAngle(Math.atan2(this.ys[i] - this.oy, this.xs[i] - this.ox) - this.angle));
      const arrival = this.delay + (this.beam() ? 0 : coordinateLength(this.xs[i] - this.ox, this.ys[i] - this.oy) / Math.max(1, this.speed));
      let priority: number;
      if (policy) {
        priority = policy.priority === 'SUPPRESS' && kind === 1 && !(v.bodies.flags[row] & B.FIGHTER)
          && row === f.currentTarget[this.own] ? -1
          : kind === 2 && !f.decoy[row] && !f.flare[row] || kind === 1 && v.bodies.flags[row] & B.FIGHTER ? 0
            : kind === 2 ? 2 : 1;
      } else {
        const pdFirst = this.pd() && !(f.weapons[this.m].hints & (H.PD_ALSO | H.STRIKE));
        priority = kind === 2 ? f.decoy[row] ? 2 : pdFirst ? 0 : 3
          : autonomous || row === f.currentTarget[this.own] ? 1 : 2;
      }
      let committed = 0;
      if (!omit && autonomous && !this.pd() && kind === 1 && this.budgetPresent
        && (!adaptiveBudget || !this.nativeBudget || this.budget.needsDetailed(v, f, this.own, row))) {
        // Native estimate has this exact eligibility early-out before any armor
        // callback. Keep known authored/native-ineligible targets numerical too.
        if (this.nativeBudget && !f.nativeThreat[row]) committed = 0;
        else if (this.nativeBudget && f.armor[row].native) committed = this.budget.penalty(v, f, this.scope, this.own, row, arrival);
        else if (this.penalty) {
          committed = this.penalty(row, arrival); this.coverage.customBudgetCalls++;
          if (!this.coverage.unsupportedMechanisms?.includes('unbatched-armor-budget-hook'))
            (this.coverage.unsupportedMechanisms ??= []).push('unbatched-armor-budget-hook');
        }
      }
      this.priorities[i] = priority; this.retained[i] = retained ? 0 : 1; this.traverses[i] = traverse;
      this.threats[i] = kind === 2 ? this.impact(row) : Infinity;
      this.utilities[i] = autonomous && kind === 1 ? this.utility(row, retained, traverse, arrival) - committed : 0;
    }
    this.order.sort((a, b) => this.priorities[a] - this.priorities[b]
      || (this.threats[a] === this.threats[b] ? 0 : this.threats[a] - this.threats[b])
      || this.utilities[b] - this.utilities[a] || this.retained[a] - this.retained[b]
      || this.traverses[a] - this.traverses[b]
      || (this.kinds[a] === 1 ? f.shipTie[this.rows[a]] : f.projectileTie[this.rows[a]])
        - (this.kinds[b] === 1 ? f.shipTie[this.rows[b]] : f.projectileTie[this.rows[b]]));
    let chosen = this.order[0];
    for (const i of this.order) {
      const angle = Math.atan2(this.ys[i] - this.oy, this.xs[i] - this.ox);
      let contact = true;
      if (this.guided()) {
        this.contactDistance = coordinateLength(this.xs[i] - this.ox, this.ys[i] - this.oy);
        this.contactTime = this.contactDistance / Math.max(1, this.speed);
      } else contact = this.trace(this.kinds[i], this.rows[i], angle);
      if (contact && !this.obstruction(angle)) { chosen = i; break; }
    }
    this.targetKind = chosen === undefined ? 0 : this.kinds[chosen];
    this.targetRow = chosen === undefined ? -1 : this.rows[chosen];
    this.hasPoint = chosen !== undefined;
    if (chosen !== undefined) { this.pointX = this.xs[chosen]; this.pointY = this.ys[chosen]; }
    state.scanIn = chosen !== undefined ? (.5 + state.random.next() * .5) * f.weapons[this.m].sizeScale
      : this.cadenceMode === 'multirate' ? this.pd() ? 1 / 30 : .1 : .05 + state.random.next() * .05;
    if (state.numericCadence && this.cadenceMode === 'multirate') state.numericCadence.scanIn = this.pd() ? 1 / 30 : .1;
  }
  private preAim(): boolean {
    const v = this.v, w = v.weapons;
    if (w.disabled[this.m] || w.flags[this.m] & W.HARDPOINT) return false;
    const savedRange = this.range;
    this.range *= 1.5;
    let found = false, nearest = Infinity;
    const track = (row: number) => {
      if (row < 0 || !this.eligible(1, row) || !this.solve(1, row)) return false;
      this.steerX = this.solveX; this.steerY = this.solveY; return true;
    };
    const selected = this.f.currentTarget[this.own];
    if (track(selected)) found = true;
    else for (let row = 0; row < v.bodyCount; row++) {
      if (!this.scope[row] || v.bodies.team[row] === v.bodies.team[this.own]) continue;
      const distance = coordinateLength(v.bodies.x[row] - this.ox, v.bodies.y[row] - this.oy);
      if (distance < nearest && track(row)) { found = true; nearest = distance; }
    }
    this.range = savedRange; return found;
  }
  private nativeLead(): void {
    if (!this.hasPoint || this.beam() || this.guided()) return;
    const v = this.v, b = v.bodies, p = v.projectiles, kind = this.targetKind, row = this.targetRow;
    const x = kind === 1 ? b.x[row] : p.x[row], y = kind === 1 ? b.y[row] : p.y[row];
    const vx = (kind === 1 ? b.vx[row] : p.vx[row]) - b.vx[this.own];
    const vy = (kind === 1 ? b.vy[row] : p.vy[row]) - b.vy[this.own];
    const dx = x - b.x[this.own], dy = y - b.y[this.own], distance = coordinateLength(dx, dy);
    const closing = distance > 0 ? -(vx * dx + vy * dy) / distance : 0;
    const accuracy = Math.max(1, 2 - Math.max(0, Math.min(1, this.f.accuracy[this.own]))
      - this.memory.firingTime / 15 - this.f.weapons[this.m].accuracyBonus);
    const rawRadius = kind === 1 ? b.radius[row] : p.radius[row];
    const range = Math.max(0, distance - (b.radius[this.own] + rawRadius) * .75);
    let speed = (closing + this.speed) * accuracy;
    if (speed <= 10) speed = 20;
    let time = range / speed;
    time = Math.max(0, Math.min(10, (range - closing * accuracy * time) / speed));
    const nx = x + vx * (time + this.delay), ny = y + vy * (time + this.delay);
    if (this.trace(kind, row, Math.atan2(ny - this.oy, nx - this.ox))) { this.pointX = nx; this.pointY = ny; }
  }
  aim(policy: SystemAutofirePolicy | undefined, cadenceMode?: 'multirate' | '20hz', salt = 0): void {
    this.coverage.numericAimCalls = (this.coverage.numericAimCalls ?? 0) + 1;
    const state = this.memory, w = this.v.weapons, c = this.f.weapons[this.m];
    this.cadenceMode = cadenceMode;
    const selected = this.f.currentTarget[this.own];
    const key = policy ? `${policy.priority}:${policy.suspended}:${policy.priority === 'SUPPRESS' && selected >= 0 ? this.v.bodies.handle[selected] : ''}` : undefined;
    if (state.policyKey !== key) { state.policyKey = key; this.targetKind = 0; this.targetRow = -1; state.scanIn = 0; }
    if (policy?.suspended) { this.targetKind = 0; this.targetRow = -1; return; }
    if (w.firingState[this.m] !== 0 || w.burstRemaining[this.m] > 0 || w.cooldown[this.m] > 0) {
      state.firingTime += this.dt; state.idleFireTime = 0;
    } else { state.idleFireTime += this.dt; if (state.idleFireTime > 3) state.firingTime = 0; }
    state.scanIn -= this.dt;
    let cadence = state.numericCadence;
    if (cadenceMode && (!cadence || cadence.mode !== cadenceMode || cadence.range !== c.baseRange
      || cadence.speed !== c.baseSpeed || cadence.base !== c.baseAngle || cadence.arc !== c.arc
      || cadence.rx !== c.relativeX || cadence.ry !== c.relativeY || cadence.pd !== this.pd())) {
      // Creating the first cadence does not wipe an existing full-rate tracker.
      // Only changed guards/mode reproduce the old clear/reseed transition.
      if (cadence) {
        this.targetKind = 0; this.targetRow = -1; state.scanIn = 0; state.firingTime = state.idleFireTime = 0;
        state.random = new SimulationRandom(salt); state.ammoAllowed = true;
      }
      cadence = state.numericCadence = { mode: cadenceMode, aimIn: 0, scanIn: 0, salt,
        x: 0, y: 0, point: false, range: c.baseRange, speed: c.baseSpeed, base: c.baseAngle,
        arc: c.arc, rx: c.relativeX, ry: c.relativeY, pd: this.pd(), initialized: false };
    }
    if (!cadenceMode) {
      if (cadence?.mode === 'multirate') {
        this.targetKind = 0; this.targetRow = -1; state.scanIn = 0; state.firingTime = state.idleFireTime = 0;
        state.random = new SimulationRandom(cadence.salt); state.ammoAllowed = true;
      }
      state.numericCadence = undefined; cadence = undefined;
    }
    if (cadence) { cadence.aimIn -= this.dt; cadence.scanIn -= this.dt; }
    if (this.targetKind && !this.eligible(this.targetKind, this.targetRow)) {
      this.targetKind = 0; this.targetRow = -1; state.scanIn = 0; state.firingTime = state.idleFireTime = 0;
      if (cadence) { cadence.point = false; cadence.aimIn = 0; }
    }
    if (cadence && cadence.aimIn > 1e-9) {
      this.hasPoint = !!this.targetKind;
      this.pointX = cadence.x; this.pointY = cadence.y;
      this.hasSteer = cadence.point; this.steerX = cadence.x; this.steerY = cadence.y;
      return;
    }
    const previousKind = this.targetKind, previousRow = this.targetRow;
    if (this.targetKind && this.solve(this.targetKind, this.targetRow)) {
      this.hasPoint = true; this.pointX = this.solveX; this.pointY = this.solveY;
    } else if (this.targetKind) { this.targetKind = 0; this.targetRow = -1; state.scanIn = 0; }
    const scanEligible = state.scanIn <= (cadenceMode === 'multirate' ? 1e-9 : 0)
      && (!cadence || cadenceMode !== 'multirate' || cadence.scanIn <= 1e-9);
    if (scanEligible) this.scan(policy);
    if (previousKind !== this.targetKind || previousRow !== this.targetRow) state.firingTime = state.idleFireTime = 0;
    this.nativeLead();
    this.hasSteer = this.hasPoint;
    if (this.hasPoint) { this.steerX = this.pointX; this.steerY = this.pointY; }
    else if (!cadence || cadenceMode !== 'multirate' || scanEligible) this.hasSteer = this.preAim();
    else { this.hasSteer = cadence.point; this.steerX = cadence.x; this.steerY = cadence.y; }
    if (cadence) {
      const first = !cadence.initialized;
      const period = cadenceMode === 'multirate' && this.pd() ? 1 / 30 : .05;
      let delay = period - Math.max(0, -cadence.aimIn) % period;
      if (delay <= 1e-9) delay = period;
      if (first) {
        delay = (1 + (salt >>> 0) % (cadenceMode === 'multirate' && this.pd() ? 2 : 3)) / 60;
        if (cadenceMode === 'multirate' && scanEligible && !this.pd()) cadence.scanIn += (salt >>> 0) % 2 * .05;
      }
      cadence.aimIn = cadenceMode === '20hz' && !first ? .05 : delay;
      cadence.point = this.hasSteer; cadence.x = this.hasSteer ? this.steerX : 0; cadence.y = this.hasSteer ? this.steerY : 0;
      cadence.initialized = true;
    }
  }
  turn(hasPoint = this.hasSteer, x = this.steerX, y = this.steerY): number {
    const w = this.v.weapons, b = this.v.bodies, m = this.m, base = w.baseAngle[m];
    const c = this.f.weapons[m];
    if (w.flags[m] & W.HARDPOINT || w.turnRate[m] <= 0) this.angle = base;
    else if (!hasPoint) {
      this.idle += this.dt;
      if (this.idle > 15) this.angle = advanceTurretAim(this.angle, base, base, c.arc, w.turnRate[m], b.angularVelocity[this.own], this.dt);
    } else {
      this.idle = 0;
      const angle = Math.atan2(y - this.pivotY, x - this.pivotX);
      const diff = signedAngle(angle - base);
      const desired = c.arc >= 360 || Math.abs(diff) <= w.arc[m] / 2 ? angle : base + Math.sign(diff) * w.arc[m] / 2;
      this.angle = advanceTurretAim(this.angle, base, desired, c.arc, w.turnRate[m], b.angularVelocity[this.own], this.dt);
    }
    this.refreshBore(this.angle);
    this.finalBore = true;
    return this.angle;
  }
  hasTarget(): boolean { return this.hasPoint && !!this.targetKind; }
  available(): boolean { return !this.v.weapons.disabled[this.m] && fireAvailable(this.v, this.own); }
  /** Every physical tick, including held 10/20/30Hz steering intent. Flux check
   * deliberately lives in the ordered resource consumer, not this observation. */
  decide(canFireWeapon: boolean, suspended: boolean): FireDecision {
    if (!this.finalBore) throw new Error('FireProgram.decide requires the post-turn bore input');
    this.coverage.postTurnBoreChecks = (this.coverage.postTurnBoreChecks ?? 0) + 1;
    const v = this.v, w = v.weapons, m = this.m, f = this.f, c = f.weapons[m], state = this.memory;
    if (suspended) return 'REASSIGNING';
    if (!this.hasTarget() || !this.eligible(this.targetKind, this.targetRow)) return 'NO_TARGET';
    if (!this.available() || !canFireWeapon) return 'UNAVAILABLE';
    if (this.cadenceMode && (!Number.isFinite(this.range) || !Number.isFinite(this.speed)
      || !Number.isFinite(this.delay) || !Number.isFinite(this.angle) || this.range < 0 || this.speed < 0
      || !this.beam() && this.speed === 0 || this.delay < 0)) return 'UNAVAILABLE';
    if (c.arc < 360 && Math.abs(signedAngle(this.angle - w.baseAngle[m])) > w.arc[m] / 2 + 1e-9) return 'ALIGNING';
    if (this.guided()) {
      const distance = coordinateLength(this.pointX - this.ox, this.pointY - this.oy);
      const free = w.flags[m] & W.ALWAYS_FIRE || c.hints & (H.DO_NOT_AIM | H.GUIDED_POOR);
      const error = Math.abs(signedAngle(Math.atan2(this.pointY - this.oy, this.pointX - this.ox) - this.angle));
      if (!free && error > Math.asin(Math.min(1, this.radius(this.targetKind, this.targetRow) / Math.max(1, distance)))) return 'ALIGNING';
      this.contactDistance = Math.min(this.range, distance); this.contactTime = this.contactDistance / Math.max(1, this.speed);
    } else if (!this.trace(this.targetKind, this.targetRow, this.angle)) return 'ALIGNING';
    if (this.cadenceMode && this.targetKind === 2 && this.delay + this.contactTime > f.flightLife[this.targetRow]) return 'NO_TARGET';
    const obstruction = this.obstruction(this.angle);
    if (obstruction) return obstruction;
    const active = w.burstRemaining[m] > 0 || w.firingState[m] === 1 || w.firingState[m] === 2;
    const committed = w.burstRemaining[m] > 0 || w.firingState[m] === 1 || this.beam() && c.beamBurst && w.firingState[m] === 2;
    if (f.autonomous[this.own] && v.bodies.flags[this.own] & B.HOLD_FIRE && !this.pd() && !committed) return 'DEFENSIVE_HOLD';
    if (!active) {
      if (w.ammo[m] < 1) return 'CONSERVING_AMMO';
      if (c.hints & H.USE_LESS_VS_SHIELDS && this.targetKind === 1 && !(v.bodies.flags[this.targetRow] & B.FIGHTER)) {
        if (fireShieldCovered(v, f.shieldOn, this.targetRow, this.ox, this.oy)) {
          if (!Number.isFinite(w.ammo[m]) || !(c.regen > 0)) state.ammoAllowed = false;
          else {
            if (w.ammo[m] <= 1 || w.ammo[m] <= w.maxAmmo[m] * .8) state.ammoAllowed = false;
            if (w.ammo[m] >= w.maxAmmo[m]) state.ammoAllowed = true;
          }
        } else state.ammoAllowed = true;
      } else if (!this.pd() && !(c.hints & H.DO_NOT_CONSERVE) && Number.isFinite(w.ammo[m]) && c.regen > 0) {
        if (w.ammo[m] <= 1) state.ammoAllowed = false;
        if (w.ammo[m] >= w.maxAmmo[m] * .34 || w.ammo[m] >= 5 || w.maxAmmo[m] < 12) state.ammoAllowed = true;
      } else state.ammoAllowed = true;
      if (!state.ammoAllowed) return 'CONSERVING_AMMO';
    }
    return 'FIRE';
  }
}
