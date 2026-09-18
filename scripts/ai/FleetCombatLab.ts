import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import { CapitalShipAI } from '../../src/engine/ai/CapitalShipAI';
import type { Ship } from '../../src/engine/simulation/Ship';
import { Vector2 } from '../../src/engine/math/Vector2';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { modManager } from '../../src/engine/modding/ModManager';
import { combatObservation, setTrainingAction, POLICY_ACTIONS, type PolicyAction } from '../../src/engine/ai/learning/CombatPolicy';

export const FLEET_LAB_VERSION = 'residual-fleet-v2-native-deaths-60hz';
export type FleetSplit = 'train' | 'validation' | 'holdout';
export interface FleetScenario { id: string; teams: [readonly string[], readonly string[]]; formation: 'LINE' | 'STAGGER' | 'WIDE' }
// Split definitions are fixed before training. Holdout includes different compositions,
// formations and hulls, not merely another seed of the same mirror duel.
export const FLEET_SCENARIOS: Record<FleetSplit, readonly FleetScenario[]> = {
  train: [
    { id: 'train-light-pair', teams: [['wolf', 'lasher'], ['wolf', 'lasher']], formation: 'LINE' },
    { id: 'train-mixed-pair', teams: [['hammerhead', 'wolf'], ['hammerhead', 'lasher']], formation: 'STAGGER' },
    { id: 'train-strike-pair', teams: [['sunder', 'lasher'], ['hammerhead', 'wolf']], formation: 'LINE' },
  ],
  validation: [
    { id: 'validation-destroyer-pair', teams: [['sunder', 'wolf'], ['hammerhead', 'wolf']], formation: 'WIDE' },
    { id: 'validation-frigate-pair', teams: [['lasher', 'lasher'], ['wolf', 'lasher']], formation: 'STAGGER' },
    { id: 'validation-escort-trio', teams: [['hammerhead', 'wolf', 'lasher'], ['sunder', 'lasher', 'wolf']], formation: 'LINE' },
  ],
  holdout: [
    { id: 'holdout-shrike-pair', teams: [['shrike', 'lasher'], ['hammerhead', 'wolf']], formation: 'WIDE' },
    { id: 'holdout-mixed-trio', teams: [['sunder', 'wolf', 'lasher'], ['hammerhead', 'shrike', 'lasher']], formation: 'STAGGER' },
    { id: 'holdout-vigilance-trio', teams: [['vigilance', 'hammerhead', 'wolf'], ['sunder', 'wolf', 'lasher']], formation: 'WIDE' },
  ],
};
export function fleetCase(split: FleetSplit, index: number, seed: number): { scenario: FleetScenario; seed: number } {
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff) throw new Error('Invalid fleet case');
  const offset = split === 'train' ? 0 : split === 'validation' ? 0x40000000 : 0x80000000;
  return { scenario: FLEET_SCENARIOS[split][index % FLEET_SCENARIOS[split].length], seed: (seed + offset + index) >>> 0 };
}
const alive = (ship: Ship) => !ship.isDead && !ship.isRetreated && ship.hullHp > 0;
export class FleetCombatLab {
  readonly engine: CombatEngine;
  readonly playerAI: CapitalShipAI;
  readonly teams: readonly [readonly Ship[], readonly Ship[]];
  readonly dt = 1 / 60;
  private ticks = 0;
  private readonly initialHull: [number, number];
  private overloadSeconds = 0;
  private blockedWeaponSeconds = 0;
  private terminalPaid = false;
  private readonly ammoAtStart: number;
  constructor(readonly scenario: FleetScenario, readonly seed: number, readonly learnerTeam: 0 | 1, readonly maxSeconds = 90) {
    if (!Number.isInteger(seed) || (learnerTeam !== 0 && learnerTeam !== 1) || !(maxSeconds >= 1 && maxSeconds <= 600)
      || scenario.teams.some(t => t.length < 1 || t.length > 8)) throw new Error('Invalid fleet lab');
    const e = this.engine = new CombatEngine(scenario.teams[0][0], scenario.teams[1][0], seed);
    const teams: [Ship[], Ship[]] = [[e.playerShip], [e.enemyShip]];
    for (const team of [0, 1] as const) for (const hull of scenario.teams[team].slice(1))
      teams[team].push(e.addShip(modManager.requireShip(hull), team === 0, new Vector2(), team === 0 ? -Math.PI / 2 : Math.PI / 2));
    this.teams = teams;
    const rng = new SimulationRandom(seed ^ 0x5641);
    const spacing = scenario.formation === 'WIDE' ? 450 : 340;
    const offset = (rng.next() - .5) * 120, separation = 480 + rng.next() * 120;
    for (const team of [0, 1] as const) teams[team].forEach((ship, index) => {
      const sign = team === 0 ? 1 : -1;
      const stagger = scenario.formation === 'STAGGER' && index % 2 === 1 ? 140 : 0;
      ship.pos.set(sign * ((index - (teams[team].length - 1) / 2) * spacing + offset), sign * (separation + stagger));
      ship.prevPos.copy(ship.pos); ship.facingRad = -sign * Math.PI / 2;
      ship.fireControlMode = 'AI'; ship.combatShips = e.ships;
      setTrainingAction(ship, 'BALANCED');
    });
    e.asteroids.length = 0; e.nebulae.length = 0;
    this.playerAI = new CapitalShipAI(e.playerShip, e.enemyShip);
    // A shared initial observation, independent of which policy will control the team.
    const plan = e.planFleetAI();
    e.updateShipAI(this.playerAI, this.dt, undefined, undefined, plan);
    for (const ai of e.getNativeAIs()) e.updateShipAI(ai, this.dt, undefined, undefined, plan);
    this.initialHull = [teams[0].reduce((n, s) => n + s.maxHullHp, 0), teams[1].reduce((n, s) => n + s.maxHullHp, 0)];
    this.ammoAtStart = this.ammo();
  }
  get learners(): readonly Ship[] { return this.teams[this.learnerTeam]; }
  get opponents(): readonly Ship[] { return this.teams[1 - this.learnerTeam]; }
  get done(): boolean {
    return this.ticks >= Math.ceil(this.maxSeconds / this.dt) || !!this.engine.battleResult
      || !this.learners.some(alive) || !this.opponents.some(alive);
  }
  observations(): Array<{ ship: Ship; state: number | null }> {
    return this.learners.filter(alive).map(ship => ({ ship, state: combatObservation(ship, ship.currentTargetShip) }));
  }
  private health(team: number): number {
    return this.teams[team].reduce((n, s) => n + (alive(s) ? Math.max(0, s.hullHp) : 0), 0) / this.initialHull[team];
  }
  private ammo(): number {
    return this.learners.reduce((n, s) => n + s.weapons.reduce((sum, w) => sum + (Number.isFinite(w.ammo) ? w.ammo : 0), 0), 0);
  }
  step(actions: ReadonlyMap<string, PolicyAction>) {
    if (this.done) throw new Error('Fleet episode is complete');
    const legal = new Set(this.learners.filter(alive).map(s => s.id));
    for (const [id, action] of actions) if (!legal.has(id) || !POLICY_ACTIONS.includes(action)) throw new Error('Action must belong to a live learner ship');
    const own = this.health(this.learnerTeam), enemy = this.health(1 - this.learnerTeam);
    let overload = 0, frames = 0;
    for (let i = 0; i < 60 && !this.done; i++) {
      // The opposing original AI stays BALANCED, even in a future build with a deployed model.
      // Uncontrolled children/fighters also stay baseline; only specified live learners receive residuals.
      for (const ship of this.engine.ships) setTrainingAction(ship, legal.has(ship.id) ? actions.get(ship.id) ?? 'BALANCED' : 'BALANCED');
      this.engine.updateShipAI(this.playerAI, this.dt);
      this.engine.fixedUpdate(this.dt);
      this.ticks++; frames++;
      for (const ship of this.learners) if (alive(ship)) {
        if (ship.flux.isOverloaded) overload += this.dt / this.learners.length;
        for (const mount of ship.weapons) if (mount.fireControl?.reason === 'FRIENDLY_BLOCKED') this.blockedWeaponSeconds += this.dt;
      }
    }
    this.overloadSeconds += overload;
    // Shared team credit, measured from ALL original fleet members, not just the flagship.
    let reward = 3 * ((enemy - this.health(1 - this.learnerTeam)) - (own - this.health(this.learnerTeam)))
      - .025 * overload - .001 * frames * this.dt;
    if (this.done && !this.terminalPaid) {
      reward += (this.opponents.some(alive) ? 0 : 2) - (this.learners.some(alive) ? 0 : 2);
      this.terminalPaid = true;
    }
    return { reward, done: this.done, observations: this.observations(), elapsedSeconds: frames * this.dt };
  }
  summary() {
    const ownAlive = this.learners.filter(alive).length, enemyAlive = this.opponents.filter(alive).length;
    const outcome = !ownAlive && !enemyAlive ? 'mutual' : !ownAlive ? 'loss' : !enemyAlive ? 'win' : 'timeout';
    return { scenario: this.scenario.id, seed: this.seed, learnerTeam: this.learnerTeam, seconds: this.ticks * this.dt,
      outcome, score: outcome === 'win' ? 1 : outcome === 'loss' ? 0 : .5,
      ownHull: this.health(this.learnerTeam), enemyHull: this.health(1 - this.learnerTeam), ownAlive, enemyAlive,
      ownLost: this.learners.length - ownAlive, enemyLost: this.opponents.length - enemyAlive,
      overloadSeconds: this.overloadSeconds, blockedWeaponSeconds: this.blockedWeaponSeconds,
      finiteAmmoSpent: this.ammoAtStart - this.ammo(),
      checksum: this.teams.flat().flatMap(s => [s.hullHp, s.flux.totalFlux, s.pos.x, s.pos.y, s.isDead ? 1 : 0]) };
  }
}
