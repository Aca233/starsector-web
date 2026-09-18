import type { Ship } from '../../src/engine/simulation/Ship';
import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import { CapitalShipAI } from '../../src/engine/ai/CapitalShipAI';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { combatObservation, setTrainingAction, type PolicyAction } from '../../src/engine/ai/learning/CombatPolicy';
export * from '../../src/engine/ai/learning/CombatPolicy';
export { AutofireController, solveWeaponAim } from '../../src/engine/ai/AutofireController';
export { fireTargetUtility } from '../../src/engine/ai/FireTargetUtility';
export { fleetEngagementRange, regroupVelocity } from '../../src/engine/ai/FleetNavigation';
export { Ship } from '../../src/engine/simulation/Ship';
export { Vector2 } from '../../src/engine/math/Vector2';
export { modManager } from '../../src/engine/modding/ModManager';
export { SimulationRandom, CapitalShipAI };
export { InFlightFireBudget } from '../../src/engine/ai/InFlightFireBudget';
export { chooseCombatVelocity, forecastCombatPosition } from '../../src/engine/ai/TacticalPositioning';
export { combatProfile, weaponRange } from '../../src/engine/ai/ShipCombatProfile';
export { planFleetTactics } from '../../src/engine/ai/FleetTactics';
export { Owner } from '../../src/engine/ai/multicore/Owner';
export { Publisher } from '../../src/engine/ai/multicore/Protocol';

// Small, explicit curriculum. This is a training harness, NOT a claim of fleet-scale validation.
export const LAB_SCENARIOS = [
  { name: 'frigate-mirror', player: 'lasher', enemy: 'lasher' },
  { name: 'mobile-mirror', player: 'wolf', enemy: 'wolf' },
  { name: 'destroyer-mirror', player: 'hammerhead', enemy: 'hammerhead' },
];
export const LAB_VERSION = 'duel-v2-native-deaths-60hz';
export class CombatLab {
  readonly engine: CombatEngine;
  readonly playerAI: CapitalShipAI;
  readonly learner: Ship;
  readonly opponent: Ship;
  private steps = 0;
  private terminalRewardPaid = false;
  readonly dt = 1 / 60;
  constructor(readonly seed: number, readonly scenario = 0, readonly side: 0 | 1 = 0, readonly maxSeconds = 60) {
    const config = LAB_SCENARIOS[scenario];
    if (!config || !Number.isInteger(seed) || (side !== 0 && side !== 1) || !(maxSeconds > 0 && maxSeconds <= 600))
      throw new Error('Invalid combat lab scenario');
    this.engine = new CombatEngine(config.player, config.enemy, seed);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.engine.playerShip.fireControlMode = 'AI';
    this.engine.enemyShip.fireControlMode = 'AI';
    this.learner = side === 0 ? this.engine.playerShip : this.engine.enemyShip;
    this.opponent = side === 0 ? this.engine.enemyShip : this.engine.playerShip;
    // No terrain RNG confound. Physical hulls, shields, weapons and AI are unmodified.
    this.engine.asteroids.length = 0;
    this.engine.nebulae.length = 0;
    const rng = new SimulationRandom(seed ^ 0x71a7);
    const offset = (rng.next() - .5) * 200;
    this.engine.playerShip.pos.x = offset;
    this.engine.enemyShip.pos.x = -offset;
    // Isolate the baseline even if a future build contains an enabled deployed policy.
    setTrainingAction(this.learner, 'BALANCED');
    setTrainingAction(this.opponent, 'BALANCED');
    // Start acquisition using the ordinary per-team visibility state.
    this.engine.updateShipAI(this.playerAI, this.dt);
    this.engine.updateShipAI(this.engine.enemyAI, this.dt);
  }
  get state(): number | null { return combatObservation(this.learner, this.learner.currentTargetShip); }
  get done(): boolean {
    return this.steps >= Math.ceil(this.maxSeconds / this.dt) || !!this.engine.battleResult
      || this.learner.isDead || this.opponent.isDead;
  }
  private health(ship: typeof this.learner): number { return ship.isDead ? 0 : Math.max(0, ship.hullHp / ship.maxHullHp); }
  step(action: PolicyAction) {
    if (this.done) throw new Error('Episode is complete');
    const own = this.health(this.learner), enemy = this.health(this.opponent);
    let overloadTicks = 0, ticks = 0;
    setTrainingAction(this.learner, action);
    // 1-second decisions; all physics and safety gates still execute at 60 Hz.
    for (let i = 0; i < 60 && !this.done; i++) {
      this.engine.updateShipAI(this.playerAI, this.dt);
      this.engine.fixedUpdate(this.dt);
      this.steps++; ticks++;
      if (this.learner.flux.isOverloaded) overloadTicks++;
    }
    // Damage balance, death/win, overload and elapsed time. No reward for ammo spam or orbiting.
    let reward = 3 * ((enemy - this.health(this.opponent)) - (own - this.health(this.learner)))
      - .03 * overloadTicks / 60 - .002 * ticks / 60;
    if (this.done && !this.terminalRewardPaid) {
      reward += (this.opponent.isDead ? 2 : 0) - (this.learner.isDead ? 2 : 0);
      this.terminalRewardPaid = true;
    }
    return { reward, state: this.state, done: this.done };
  }
  summary() {
    return { seed: this.seed, scenario: LAB_SCENARIOS[this.scenario].name, side: this.side,
      seconds: this.steps * this.dt, ownHull: this.health(this.learner), enemyHull: this.health(this.opponent),
      outcome: this.learner.isDead && this.opponent.isDead ? 'mutual' : this.opponent.isDead ? 'win'
        : this.learner.isDead ? 'loss' : 'timeout',
      checksum: [this.learner.hullHp, this.opponent.hullHp, this.learner.flux.totalFlux, this.opponent.flux.totalFlux,
        this.learner.pos.x, this.learner.pos.y, this.opponent.pos.x, this.opponent.pos.y, this.engine.projectiles.length] };
  }
}

export * from './FleetCombatLab';
