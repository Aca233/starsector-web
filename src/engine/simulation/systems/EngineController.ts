import type { EngineSlotConfig, ShipSpec } from '../../content/ShipSpec';
import type { HullSize } from '../FluxTracker';
import type { SimulationRandom } from '../SimulationRandom';
import { advanceComponentHealth, createComponentHealthTracker } from './ComponentHealth';
import type { ComponentHealthState, ComponentHealthTracker } from './ComponentHealth';

export interface EngineStatus extends ComponentHealthState {
  healthTracker: ComponentHealthTracker;
  contribution: number;
  driftContribution: number;
  systemActivated: boolean;
  temporaryMalfunction: boolean;
  glowDisabled: boolean;
  currentThrust: number;
  prevThrust: number;
  spread: number;
  prevSpread: number;
}

export interface EngineControlContext {
  canRepair: boolean;
  repairTimeMultiplier: number;
  canRepairUnderFire: boolean;
  /** Current Web system flame-length shifter; not the zero-flux boost. */
  extendedGlow: boolean;
  systemActive: boolean;
  accelerating: boolean;
  spreading: boolean;
  malfunctionChance?: number;
  criticalMalfunctionChance?: number;
  onCriticalMalfunction?: (index: number) => void;
}

export function engineHealthProfile(size: HullSize | undefined, slot: EngineSlotConfig, healthMultiplier = 1) {
  const base = size === 'CAPITAL_SHIP' ? 800 : size === 'CRUISER' ? 600 : size === 'DESTROYER' ? 400 : size === 'FRIGATE' ? 200 : size === 'FIGHTER' ? 100 : 10;
  const repairDuration = size === 'CAPITAL_SHIP' ? 20 : size === 'CRUISER' ? 15 : size === 'DESTROYER' ? 12 : size === 'FRIGATE' ? 8 : size === 'FIGHTER' ? 4 : 10;
  return { health: base * (.75 + Math.max(25, Math.min(100, slot.width + slot.length)) / 100 * .5) * healthMultiplier, repairDuration };
}

/** ship/null + null$oo: weighted damage, delayed cascade, disabled repair/restart.
 * Custom system/API integration and hull-style sound mapping remain adapters. */
export class EngineController {
  public readonly engines: EngineStatus[];
  public state: 'READY' | 'FLAMING_OUT' | 'DISABLED' = 'READY';
  public cooldown = 0;
  public permanentlyDisabledFraction = 0;
  public justDisabledEngines: number[] = [];
  public justFlamedOut = false;
  public justRestarted = false;
  public flameAccelerating = false;
  private sinceAcceleration = .05;
  private sinceSpread = .05;
  private forcePending = false;
  private suppressMessage = false;

  constructor(private readonly spec: ShipSpec, private readonly random: SimulationRandom, healthMultiplier = 1) {
    this.engines = (spec.engineSlots ?? []).map(slot => {
      const profile = engineHealthProfile(spec.hullSize, slot, healthMultiplier);
      const repairDuration = profile.repairDuration * (.9 + random.next() * .2);
      return { health: profile.health, maxHealth: profile.health, isDisabled: false, isPermanentlyDisabled: false,
        healthTracker: createComponentHealthTracker(repairDuration, random), contribution: 0,
        driftContribution: Math.max(-1, Math.min(1, slot.y / Math.max(.000001, spec.collisionRadius * .3))),
        systemActivated: slot.systemActivated ?? false, temporaryMalfunction: false, glowDisabled: false,
        currentThrust: .4, prevThrust: .4, spread: 0, prevSpread: 0 };
    });
    let total = this.engines.filter(e => !e.systemActivated).reduce((sum, e) => sum + e.maxHealth, 0);
    if (total <= 0) total = this.engines.reduce((sum, e) => sum + e.maxHealth, 0);
    if (total <= 0) total = 100;
    for (const engine of this.engines) engine.contribution = engine.maxHealth / total;
  }

  public get isFlamedOut(): boolean { return this.state !== 'READY'; }
  public get movementMultiplier(): number { return Math.max(0, Math.min(1, 1 - this.disabledFraction(true))); }

  /** Native node.y and Web slot.y use the same local coordinates and rotation
   * equations (ShipHullSpecLoader -> W -> EngineSlot.computePosition). */
  public driftAcceleration(turnAcceleration: number, extendedGlow: boolean): number {
    if (this.state === 'DISABLED') return 0;
    let drift = 0;
    for (const engine of this.engines) {
      if (engine.isDisabled && (!engine.systemActivated || extendedGlow)) drift += engine.contribution * engine.driftContribution * 2;
    }
    return drift * turnAcceleration;
  }

  /** Raw movement/UI fraction vs. threshold fraction with malfunction exclusions. */
  public disabledFraction(raw = false): number {
    let fraction = 0, temporary = 0;
    for (const engine of this.engines) {
      if (!engine.isDisabled || engine.systemActivated) continue;
      fraction += engine.contribution;
      if (engine.temporaryMalfunction && !engine.isPermanentlyDisabled) temporary += engine.contribution;
    }
    if (!raw && fraction < 1) {
      const excluded = this.permanentlyDisabledFraction + temporary;
      if (excluded > 0 && excluded < 1) fraction = (fraction - excluded) / (1 - excluded);
    }
    return fraction;
  }

  public damage(index: number, damage: number, extendedGlow: boolean): void {
    const engine = this.engines[index];
    if (!engine || !(damage > 0) || this.state === 'DISABLED' || engine.isDisabled || (engine.systemActivated && !extendedGlow)) return;
    engine.health = Math.max(0, engine.health - damage);
    engine.healthTracker.hitAgo = 0;
  }

  public disable(index: number, context: Pick<EngineControlContext, 'extendedGlow' | 'systemActive'>, permanent = false): boolean {
    const engine = this.engines[index];
    if (!engine) return false;
    // Source sets permanent BEFORE the last-ordinary-engine system veto.
    engine.isPermanentlyDisabled ||= permanent;
    if (!engine.isDisabled && context.extendedGlow && context.systemActive &&
      !this.engines.some(other => other !== engine && !other.systemActivated && !other.isDisabled)) return false;
    const newlyDisabled = !engine.isDisabled;
    engine.isDisabled = true;
    engine.health = 0;
    return newlyDisabled;
  }

  /** Compensation is a Ship.applyCriticalMalfunction behavior, not generic disable(true). */
  public malfunction(index: number, context: Pick<EngineControlContext, 'extendedGlow' | 'systemActive'>, permanent = false): boolean {
    const engine = this.engines[index];
    if (!engine) return false;
    // Explicit critical events can revisit a target disabled since deployment.
    // Native Ship.applyCriticalMalfunction counts each permanent event; health
    // scheduling itself skips permanent engines before reaching this method.
    engine.temporaryMalfunction = true;
    if (permanent) this.permanentlyDisabledFraction += engine.contribution;
    return this.disable(index, context, permanent);
  }

  public forceFlameout(suppressMessage = false): void {
    this.forcePending = true;
    this.suppressMessage = suppressMessage;
  }

  public advance(amount: number, context: EngineControlContext): void {
    this.cooldown = Math.max(0, this.cooldown - amount);
    const flamingOut = this.state === 'FLAMING_OUT';
    for (let index = 0; index < this.engines.length; index++) {
      const engine = this.engines[index];
      advanceComponentHealth(engine, engine.healthTracker, amount, this.random, {
        canRepair: context.canRepair && !flamingOut, repairTimeMultiplier: context.repairTimeMultiplier,
        canRepairUnderFire: context.canRepairUnderFire, flamingOut,
        malfunction: !engine.systemActivated && (context.malfunctionChance ?? 0) > 0 && (context.accelerating || context.spreading) ? {
          chance: context.malfunctionChance!, criticalChance: context.criticalMalfunctionChance ?? 0,
          canPermanentlyDisable: () => this.permanentlyDisabledFraction + engine.contribution <= .66,
          disable: (critical, permanent) => {
            const onset = this.malfunction(index, context, permanent);
            if (critical) context.onCriticalMalfunction?.(index);
            return onset;
          }
        } : undefined,
        disable: () => { engine.temporaryMalfunction = false; return this.disable(index, context); }
      });
      // The native component advances presentation after health, not in applyDamage.
      if (engine.isDisabled && !engine.glowDisabled) {
        engine.glowDisabled = true;
        this.justDisabledEngines.push(index);
      } else if (!engine.isDisabled && (engine.glowDisabled || engine.currentThrust === 0)) {
        engine.glowDisabled = false;
        engine.currentThrust = 0;
      }
    }
    if (this.state === 'FLAMING_OUT' && this.engines.every(engine => engine.currentThrust <= 0)) this.state = 'DISABLED';
    if (this.engines.length > 0) {
      const fraction = this.forcePending ? 1 : this.disabledFraction();
      this.forcePending = false;
      const threshold = context.extendedGlow ? .99 : .5;
      if (this.state === 'READY' && ((this.cooldown <= 0 && fraction > threshold) || fraction >= 1)) {
        this.state = 'FLAMING_OUT';
        const size = this.spec.hullSize;
        this.cooldown = size === 'CAPITAL_SHIP' ? 11 : size === 'CRUISER' ? 9 : size === 'DESTROYER' ? 7 : size === 'FRIGATE' ? 5 : 10;
        if (!this.suppressMessage) this.justFlamedOut = true;
        this.suppressMessage = false;
      } else if (this.state === 'DISABLED' && fraction <= threshold) {
        this.state = 'READY';
        this.justRestarted = true;
        for (const engine of this.engines) if (!engine.isDisabled) {
          engine.glowDisabled = false;
          engine.currentThrust = 0;
        }
      }
    }
    this.advanceGlow(amount, context);
  }

  private advanceGlow(amount: number, context: EngineControlContext): void {
    // G has two .05s interlocks. ShipMotion submits lateral/braking before forward
    // thrust; a recently accepted opposing command can suppress the visual switch.
    let accelerating = false, spreading = false;
    if (context.spreading && this.sinceAcceleration >= .05) {
      this.sinceSpread = 0;
      spreading = true;
    }
    if (context.accelerating && this.sinceSpread >= .05) {
      this.sinceAcceleration = 0;
      accelerating = true;
      spreading = false;
    }
    this.sinceAcceleration += amount;
    this.sinceSpread += amount;
    for (const engine of this.engines) {
      // Disabled/initial recovery take an early return, preserving spread and the
      // prior flame-shape mode while the engine fades or returns toward idle.
      if (engine.glowDisabled) { engine.currentThrust = Math.max(0, engine.currentThrust - amount); continue; }
      if (engine.currentThrust < .4) { engine.currentThrust = Math.min(.4, engine.currentThrust + amount); continue; }
      this.flameAccelerating = accelerating || this.sinceAcceleration <= .05;
      const target = this.flameAccelerating ? 1 : .4;
      engine.currentThrust += Math.sign(target - engine.currentThrust) * Math.min(Math.abs(target - engine.currentThrust), amount);
      if (spreading && engine.currentThrust <= .4) engine.currentThrust += .01;
      const targetSpread = spreading ? 90 : 0;
      engine.spread += Math.sign(targetSpread - engine.spread) * Math.min(Math.abs(targetSpread - engine.spread), amount * 270);
    }
  }

  /** Scenario reset only: no new RNG draws and no stale permanent/cascade state. */
  public restore(): void {
    this.state = 'READY'; this.cooldown = 0; this.permanentlyDisabledFraction = 0;
    this.forcePending = false; this.suppressMessage = false;
    this.flameAccelerating = false; this.sinceAcceleration = this.sinceSpread = .05;
    this.clearEvents();
    for (const engine of this.engines) {
      engine.health = engine.maxHealth; engine.isDisabled = false; engine.isPermanentlyDisabled = false;
      engine.temporaryMalfunction = false; engine.glowDisabled = false;
      engine.currentThrust = engine.prevThrust = .4; engine.spread = engine.prevSpread = 0;
      engine.healthTracker.hitAgo = 0; engine.healthTracker.elapsed = 0; engine.healthTracker.intervalElapsed = false;
    }
  }

  public clearEvents(): void {
    this.justDisabledEngines.length = 0; this.justFlamedOut = false; this.justRestarted = false;
  }
}
