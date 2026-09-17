import { shipPresentationPose } from "../visual/ShipPresentation";
import { sameTeam } from "./CombatTeams";
import { RuntimeCombatModifiers } from '../extensions/RuntimeCombatModifiers';
import { advanceCombatSkills, polarizedArmorLevel } from '../extensions/CombatSkills';
import { hasOnlyNativeRangeModifiers, installedHullMods, effectiveHullStats, hullModLoadoutErrors } from '../extensions/HullMods';
import { i18n } from '../i18n/LocalizationManager';
import { applyComponentDamage } from './systems/weapon/ComponentDamage';
import { advanceShipMotion, shipMotionStats } from './systems/ShipMotion';
import { EngineController } from './systems/EngineController';
import { LowCRShipDamageSequence } from './systems/LowCRShipDamageSequence';
import { finalizePermanentWeaponMalfunction } from './systems/ComponentMalfunctions';
import type { ComponentMalfunctionTarget } from './systems/ComponentMalfunctions';
import type { TacticalDiagnostics } from '../ai/TacticalWorld';
import type { FireControlWorld } from '../ai/AutofireController';
import { Vector2 } from '../math/Vector2';
import { ArmorGrid } from './ArmorGrid';
import { ShipDamageState } from './ShipDamageState';
import type { ScorchMark } from './ShipDamageState';
import { FluxTracker } from './FluxTracker';
import { Shield } from './Shield';
import { ShipSystem } from './ShipSystem';
import { Projectile, Beam, WeaponMount, WeaponGroup, LauncherSmokeSpec, MuzzleFlashSpec } from './Weapon';
import { ShipSpec } from '../modding/ModManager';
import { sound } from '../audio/SoundManager';
import { ShipWeaponControlSystem } from './systems/ShipWeaponControlSystem';
import { SimulationRandom } from './SimulationRandom';
import {
  CR_CRITICAL_MALFUNCTION_START,
  crDamageChangePercent,
  crDamageTakenChangePercent,
  crMovementChangePercent,
  computeCombatReadinessEffects,
  CombatReadinessEffects
} from './CombatReadiness';

// Identity, not a caller-writable "pure" flag; no new serialized combat state.
const nativeShieldReaders = new WeakMap<Ship, () => number>();
const nativeShieldDamageFor = Shield.prototype.damageTakenMultiplierFor;

export type { EngineStatus } from './systems/EngineController';

export interface PhaseGhost {
  pos: Vector2;
  facingRad: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface ArmorGridLocalRect {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * 装甲网格使用 .ship sprite 的真实局部矩形，而不是 collisionRadius 的正方形。
 * 这里提供基于 pivot 的船体贴图范围；构造时按原版方格向外取整，再补两圈支撑格。
 * pivot 保留前后不对称船体的局部坐标原点。
 */
function getArmorGridLocalRect(spec: ShipSpec): ArmorGridLocalRect {
  const spriteWidth = Number.isFinite(spec.spriteWidth) && spec.spriteWidth > 0 ? spec.spriteWidth : 0;
  const spriteHeight = Number.isFinite(spec.spriteHeight) && spec.spriteHeight > 0 ? spec.spriteHeight : 0;
  const pivotX = Number.isFinite(spec.pivotX) ? spec.pivotX : spriteWidth / 2;
  const pivotY = Number.isFinite(spec.pivotY) ? spec.pivotY : spriteHeight / 2;

  if (spriteWidth > 0 && spriteHeight > 0) {
    return {
      // 物理局部 +X 对应贴图向前/上方；pivotY 已在载入时转换到 Web 坐标约定。
      minX: pivotY - spriteHeight,
      minY: -pivotX,
      width: spriteHeight,
      height: spriteWidth
    };
  }

  if (spec.bounds.length >= 3) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [x, y] of spec.bounds) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (maxX > minX && maxY > minY) {
      return { minX, minY, width: maxX - minX, height: maxY - minY };
    }
  }

  const diameter = Math.max(1, spec.collisionRadius * 2);
  return { minX: -diameter / 2, minY: -diameter / 2, width: diameter, height: diameter };
}

export class Ship {
  public readonly runtimeModifiers = new RuntimeCombatModifiers();
  /** Presentation-lab protection must intercept before one-shot lethal-damage listeners. */
  public hullDamageSuppressed = false;
  /** Team-shared fog state, refreshed by the simulation, never used to disable physics. */
  public visibleToPlayer = true;
  public visibleToEnemy = true;
  public visibilityMask = 0x7fffffff;
  /** Delimited IDs avoid 32-bit aliasing for large free-for-all battles. */
  public visibilityOverflow = "*";
  public isVisibleTo(side: number | boolean): boolean { const team = typeof side === "boolean" ? (side ? 0 : 1) : side; return this.teamId === team || (team < 31 ? !!(this.visibilityMask & (1 << team)) : this.visibilityOverflow === "*" || this.visibilityOverflow.includes("|" + team + "|")); }
  public get sightRadius(): number { return Math.max(0, (3000 + this.hullStats.sightRadiusFlat + this.system.getSightRadiusFlat()) * (1 + (this.hullStats.sightRadiusPercent + this.system.getSightRadiusPercent()) / 100)); }
  public encounterEffects = { emergencyPhaseDiveUsed: false };
  public readonly hullDamageInterceptors = new Set<(damage: number) => boolean>();
  public retreating = false;
  public isRetreated = false;
  /** Extra combat events charged to the persistent fleet member, not immediate in-combat CR. */
  public pendingCombatCRLoss = 0;
  public applyHullDamage(damage: number): number {
    if (!(damage > 0) || this.isDead || this.isRetreated || this.hullDamageSuppressed) return 0;
    for (const intercept of this.hullDamageInterceptors) if (intercept(damage)) return 0;
    const dealt = Math.min(this.hullHp,damage); this.hullHp -= dealt; return dealt;
  }
  public retreatFromCombat(): void {
    if (this.isDead || this.isRetreated) return;
    this.retreating = this.isRetreated = true;
    this.clearInput(); this.shield.setActive(false); this.flux.cancelVenting();
    this.system.deactivate(); this.defenseSystem.deactivate();
    this.pos.set(0,-1000000); this.prevPos.copy(this.pos); this.vel.set(0,0);
  }
  public id: string;
  public spec: ShipSpec;
  /** Combat-instance only: recalculated from the deployed roster each fixed step. */
  public ecmRangePenalty = 0;
  public fleetSpeedBonusPercent = 0;
  public readonly hullStats: ReturnType<typeof effectiveHullStats>;
  public isPlayer: boolean;
  public teamId: number;
  public flightDeckWingId?: string;
  /** Runtime ownership, never persisted in hull specs or inferred from team alone. */
  public sourceCarrier?: Ship;
  public readonly deployedWingCraft = new Set<Ship>();
  public getWeaponDamageMultiplier(type: WeaponMount["spec"]["weaponType"]): number {
    const carrier = this.sourceCarrier;
    const support = carrier && !carrier.isDead && carrier.hullHp > 0 ? carrier.system.getFighterDamageMultiplier() : 1;
    return this.system.getWeaponDamageMultiplier(type) * support;
  }

  // 物理与刚体 (支持亚帧插值)
  public pos: Vector2;
  public prevPos: Vector2;
  public vel: Vector2;
  public facingRad: number;
  public prevFacingRad: number;
  public angularVelRad: number;

  // 核心机体状态
  public hullHp: number;
  /** Effective maximum; raw hull specs are immutable and remain safe to save/refit. */
  public get maxHullHp(): number { return this.hullStats.hitpoints; }
  public armor: ArmorGrid;
  public flux: FluxTracker;
  public shield: Shield;
  public system: ShipSystem;
  public defenseSystem: ShipSystem;
  public readonly weaponControl: ShipWeaponControlSystem;
  private readonly random: SimulationRandom;

  // --------------------------------------------------------------------------
  // 向后兼容 Getters / Setters (保证 UI、Renderer 和 Hooks 零修改平滑过渡)
  // --------------------------------------------------------------------------
  public get weapons(): WeaponMount[] { return this.weaponControl.weapons; }
  public set weapons(val: WeaponMount[]) { this.weaponControl.weapons = val; }
  public get weaponGroups(): WeaponGroup[] { return this.weaponControl.weaponGroups; }
  public set weaponGroups(val: WeaponGroup[]) { this.weaponControl.weaponGroups = val; }
  public get selectedGroupIndex(): number { return this.weaponControl.selectedGroupIndex; }
  public set selectedGroupIndex(val: number) { this.weaponControl.selectedGroupIndex = val; }
  public get justDisabledMounts(): WeaponMount[] { return this.weaponControl.justDisabledMounts; }
  public set justDisabledMounts(val: WeaponMount[]) { this.weaponControl.justDisabledMounts = val; }
  public get justRepairedMounts(): WeaponMount[] { return this.weaponControl.justRepairedMounts; }
  public set justRepairedMounts(val: WeaponMount[]) { this.weaponControl.justRepairedMounts = val; }

  // 发动机喷口独立健康与熄火状态 (Engine Flameout)
  public readonly engineController: EngineController;
  public get engineStatuses() { return this.engineController.engines; }

  // Native component-stat hooks. The current built-in hull/loadout defaults are neutral.
  public weaponHealthMultiplier = 1;
  public engineHealthMultiplier = 1;
  public combatEngineRepairTimeMultiplier = 1;
  public combatWeaponRepairTimeMultiplier = 1;
  public canRepairModulesUnderFire = false;
  public crMalfunctionRangeMultiplier = 1;
  public criticalMalfunctionChanceMultiplier = 1;
  public criticalMalfunctionDamageMultiplier = 1;
  public baseCriticalMalfunctionDamage = 100;
  public justCriticalDamage: { local: Vector2; armorDamage: number; hullDamage: number }[] = [];
  public empDamageTakenMultiplier = 1;
  /** Source-keyed debuffs do not mutate persisted specs and cannot leave stale stacked multipliers. */
  public readonly damageTakenModifiers = new Map<string, () => number>();
  /** Unknown damage readers or extension hooks disable shared projectile queries. */
  public get hasNativeThreatPhaseHooks(): boolean {
    return this.damageTakenModifiers.size === 0 && this.externalPhaseEffects.size === 0
      && !Object.hasOwn(this, 'externalDamageTakenMultiplier')
      && this.shield.externalDamageTakenMultiplier === nativeShieldReaders.get(this)
      && this.shield.damageTakenMultiplierFor === nativeShieldDamageFor
      && !Object.hasOwn(this.shield, 'damageTakenMultiplier')
      && this.system.hasNativeThreatPhaseAI && this.defenseSystem.hasNativeThreatPhaseAI
      && hasOnlyNativeRangeModifiers(this.spec)
      && (!this.sourceCarrier || hasOnlyNativeRangeModifiers(this.sourceCarrier.spec));
  }
  public get externalDamageTakenMultiplier(): number {
    let value = 1;
    for (const modifier of this.damageTakenModifiers.values()) value *= modifier();
    return value;
  }
  public get subjectiveTimeMultiplier(): number { return (1 + 2 * this.hullStats.phaseTimeBonusMultiplier * this.shield.phaseEffectLevel) * this.system.getTimeMultiplier(); }
  public get effectiveEmpDamageTakenMultiplier(): number { return this.empDamageTakenMultiplier * (1 - .5 * polarizedArmorLevel(this)) * this.system.getEmpDamageMultiplier() * this.externalDamageTakenMultiplier; }
  public weaponDamageTakenMultiplier = 1;
  public engineDamageTakenMultiplier = 1;
  public damageToTargetWeaponsMultiplier = 1;
  public damageToTargetEnginesMultiplier = 1;

  /** Native target-side listener. Hits remain for one second after contact ends. */
  public readonly statusEffects = new Map<string, { advance: (ship: Ship, dt: number) => boolean }>();

  // 相位潜航时空残影 (Phase Cloak Ghost Echoes)
  public phaseGhosts: PhaseGhost[] = [];
  public phaseGhostTimer = 0;
  public engineBoostLevel = 0;
  public prevEngineBoostLevel = 0;

  // 星云流体阻力减速系数
  public terrainSpeedMult = 1.0;

  // 舰体持续战损贴花：裂纹 / 熔蚀 / 穿孔，使用原版 damage_*48 贴图。
  public readonly damageDecals: ShipDamageState;
  public get scorchMarks(): readonly ScorchMark[] { return this.damageDecals.marks; }
  /** Persistent set and armor-derived opacity revision; heat has a separate render revision. */
  public get scorchMarkVersion(): number { return this.damageDecals.revision; }

  // 操纵指令输入
  public throttle = 0; // -1.0 (倒车) ~ 1.0 (前进)
  public brakeInput = false;
  public strafeInput = 0; // -1.0 (向左侧向平移) ~ 1.0 (向右侧向平移)
  public turnInput = 0; // -1.0 (左转) ~ 1.0 (右转)
  public aimTargetWorld: Vector2 = new Vector2();
  public isFiringMain = false;
  /** Ownership, not faction: the player autopilot also uses autonomous per-mount fire control. */
  public fireControlMode: 'MANUAL' | 'AI' = 'MANUAL';
  public defenseFacingRad?: number;
  public aiHoldOffensiveFire = false;
  public tacticalAI?: TacticalDiagnostics;
  
  /** Dynamic SHIELD_PIERCED_MULT target stat (native default 1). */
  public shieldPiercedMultiplier = 1;
  public isDead = false;
  public clearInput(): void {
    this.isFiringMain = false;
    this.throttle = 0;
    this.brakeInput = false;
    this.strafeInput = 0;
    this.turnInput = 0;
  }
  public prevOverloaded = false;
  public prevVenting = false;
  public currentTargetShip: Ship | null = null;
  /** Explicit pilot lock; null means no lock, not "pick the nearest enemy". */
  public playerTargetId: string | null = null;
  public fighterRecall = false;
  public combatShips: readonly Ship[] = [];

  /** Native IntervalTracker(.75, 1.25); overshoot is discarded on the next advance. */
  private crShieldMalfunctionTimer = 0;
  private crShieldMalfunctionInterval = 1;
  private crShieldMalfunctionIntervalElapsed = false;
  public justShieldMalfunction = false;

  // 1:1 原版战备值与峰值性能时钟 (Combat Readiness & Peak Performance Time)
  public shipName: string;
  /** Captured on deployment, never recaptured when ordinary CR decays. */
  public crAtDeployment: number | null = null;
  public lowCRDamageSequence: LowCRShipDamageSequence | null = null;
  public currentCR = 0.70; // 标准 70% 战备值
  public peakPerformanceRemaining: number;

  constructor(
    id: string,
    spec: ShipSpec,
    isPlayer = false,
    initialPos = new Vector2(),
    initialFacingRad = 0,
    random = new SimulationRandom(),
    visualRandom = new SimulationRandom(0x5c07c4),
    sourceCarrier?: Ship
  ) {
    this.id = id;
    this.spec = spec;
    const modErrors = hullModLoadoutErrors(spec);
    if (modErrors.length) throw new Error(spec.id + ": " + modErrors.join("; "));
    this.sourceCarrier = sourceCarrier;
    const refit = this.hullStats = effectiveHullStats(spec, sourceCarrier?.spec);
    this.weaponHealthMultiplier *= 1 + refit.weaponHealthPercent / 100;
    this.engineHealthMultiplier *= 1 + refit.engineHealthPercent / 100;
    this.weaponDamageTakenMultiplier *= refit.weaponDamageTakenMultiplier;
    this.engineDamageTakenMultiplier *= refit.engineDamageTakenMultiplier;
    this.canRepairModulesUnderFire = refit.canRepairModulesUnderFire > 0;
    this.currentCR = Math.min(1, .7 + refit.maxCombatReadinessBonus);
    this.combatEngineRepairTimeMultiplier *= refit.engineRepairTimeMultiplier;
    this.combatWeaponRepairTimeMultiplier *= refit.weaponRepairTimeMultiplier;
    this.isPlayer = isPlayer;
    this.teamId = sourceCarrier?.teamId ?? (isPlayer ? 0 : 1);
    this.random = random;
    this.weaponControl = new ShipWeaponControlSystem(random);
    this.shipName = i18n.t(spec.nameKey).split(' (')[0];
    this.peakPerformanceRemaining = refit.peakCRSec;

    this.pos = initialPos.clone();
    this.prevPos = initialPos.clone();
    this.vel = new Vector2();
    this.facingRad = initialFacingRad;
    this.prevFacingRad = initialFacingRad;
    this.angularVelRad = 0;

    this.hullHp = this.maxHullHp;
    const armorRect = getArmorGridLocalRect(spec);
    // ship/_new: square cells aligned at the pivot, with two support cells on every side.
    const grid = Math.min(30, Math.max(15, spec.spriteHeight / 10));
    const behind = Math.ceil(-armorRect.minX / grid) + 2;
    const ahead = Math.ceil((armorRect.minX + armorRect.width) / grid) + 2;
    const left = Math.ceil(-armorRect.minY / grid) + 2;
    const right = Math.ceil((armorRect.minY + armorRect.height) / grid) + 2;
    this.armor = new ArmorGrid(behind + ahead, left + right, grid, grid, refit.armorRating, -behind * grid, -left * grid);
    this.armor.damageTakenModifiers = (type) => ({
      armor: refit.armorDamageMultiplier * (type === "ENERGY" ? refit.energyDamageMultiplier : 1) * this.system.getArmorDamageMultiplier() * this.externalDamageTakenMultiplier,
      hull: refit.hullDamageMultiplier * (type === "ENERGY" ? refit.energyDamageMultiplier : 1) * this.system.getHullDamageMultiplier() * this.externalDamageTakenMultiplier,
    });
    this.armor.effectiveArmorMultiplier = refit.effectiveArmorMultiplier;
    this.armor.dynamicEffectiveArmorMultiplier = () => 1 + .5 * polarizedArmorLevel(this);
    this.armor.maxDamageReduction = Math.min(1, .85 + refit.maxArmorDamageReductionBonus);
    this.armor.minArmorFractionMultiplier = refit.minArmorFractionMultiplier;
    this.damageDecals = new ShipDamageState(this.armor, visualRandom);
    this.armor.onCellDamage = (c, r, damage) => this.damageDecals.onCellDamage(c, r, damage);
    const inferredHullSize = spec.collisionRadius <= 50
      ? 'FIGHTER'
      : spec.collisionRadius <= 90
      ? 'FRIGATE'
      : spec.collisionRadius <= 140
      ? 'DESTROYER'
      : spec.collisionRadius <= 210
      ? 'CRUISER'
      : 'CAPITAL_SHIP';
    this.flux = new FluxTracker(refit.maxFlux, refit.fluxDissipation, spec.hullSize ?? inferredHullSize);
    this.flux.ventRateMultiplier = refit.ventRateMultiplier;
    this.flux.shieldSoftFluxConversion = refit.shieldSoftFluxConversion;
    this.flux.overloadTimeMultiplier = refit.overloadTimeMultiplier;
    this.flux.onOverloadStarted = () => this.shield.setActive(false);
    this.empDamageTakenMultiplier *= refit.empDamageMultiplier;
    if (spec.captainSkills?.target_analysis === 2) {
      this.damageToTargetWeaponsMultiplier *= 2;
      this.damageToTargetEnginesMultiplier *= 2;
    }
    this.shieldPiercedMultiplier *= refit.shieldPiercedMultiplier;
    // ship_data.csv: shield upkeep 是基础耗散的比例 (攻势 0.4 → 240/s, 典范 0.6 → 750/s)。
    const shieldUpkeepRate = refit.shieldUpkeepPerSecond;
    this.shield = new Shield(
      refit.shieldType,
      refit.shieldArcDeg,
      spec.shieldRadius,
      refit.shieldEfficiency,
      shieldUpkeepRate,
      (amount) => this.flux.increaseFluxClamped(amount, true)
    );
    // ship_data.csv: phase cost / phase upkeep 是基础幅能容量的比例 (厄运 0.05/0.05)。
    this.shield.externalDamageTakenMultiplier = () => this.externalDamageTakenMultiplier;
    nativeShieldReaders.set(this, this.shield.externalDamageTakenMultiplier);
    this.shield.phaseMinSpeedFluxThresholdMultiplier = 1 + refit.phaseMinSpeedFluxThresholdPercent / 100;
    this.shield.unfoldRateMultiplier = 1 + refit.shieldUnfoldRatePercent / 100;
    this.shield.turnRateMultiplier = 1 + refit.shieldTurnRatePercent / 100;
    this.shield.damageTakenModifiers.set("hullmods", refit.shieldDamageMultiplier);
    this.shield.energyDamageTakenMultiplier = refit.energyDamageMultiplier;
    this.shield.phaseActivationCost = Math.max(0, spec.phaseCost ?? 0) * this.flux.maxFlux;
    this.shield.phaseUpkeepPerSecond = Math.max(0, spec.phaseUpkeep ?? 0) * this.flux.maxFlux * refit.phaseUpkeepMultiplier;
    this.shield.phaseCooldownDuration *= refit.phaseCooldownMultiplier;
    // HUD/检查工具读取 upkeepRate：相位线圈的维持费即每秒硬幅能成本。
    if (this.shield.type === 'PHASE') this.shield.upkeepRate = this.shield.phaseUpkeepPerSecond;
    this.system = new ShipSystem(spec.systemType, spec.maxFlux, this);
    this.defenseSystem = new ShipSystem(spec.defenseSystemType ?? 'NONE', spec.maxFlux, this);
    this.system.auxiliary = this.defenseSystem;

    // 初始化挂点武器与武器编组
    this.weaponControl.init(spec, initialFacingRad, this.weaponHealthMultiplier);

    // All engine trackers start at installation, with independent repair/interval draws.
    this.engineController = new EngineController(spec, this.random, this.engineHealthMultiplier);
    // Ship.init: initial hull HP / (all weapons + ordinary weapons + ordinary engines) * .75.
    const moduleCount = this.weapons.length + this.weapons.filter(mount => mount.mountType !== 'HIDDEN').length
      + this.engineStatuses.filter(engine => !engine.systemActivated).length;
    this.baseCriticalMalfunctionDamage = this.maxHullHp / Math.max(1, moduleCount) * .75;
    this.resetShieldMalfunctionState();
    for (const mod of installedHullMods(this.spec)) if (mod.status === 'implemented') mod.apply?.(this);
  }

  // --------------------------------------------------------------------------
  // 战备值 (CR) 性能修正接口 — 对齐 CRPluginImpl.applyCRToStats()
  // 在标准 70% 战备下所有倍率恒为 1.0，因此仅在衰退/超常战备时改变作战性能。
  // --------------------------------------------------------------------------
  public get crEffects(): CombatReadinessEffects {
    const effects = computeCombatReadinessEffects(this.currentCR, this.crMalfunctionRangeMultiplier, this.flux.hullSize === 'FIGHTER');
    effects.weaponMalfunctionChance += this.hullStats.weaponMalfunctionChanceBonus;
    effects.criticalMalfunctionChance = (effects.criticalMalfunctionChance + this.hullStats.criticalMalfunctionChanceBonus) * this.criticalMalfunctionChanceMultiplier;
    return effects;
  }

  /** 最高航速/加速度/减速度/转向速率倍率 (±10%)。 */
  public get crMovementMultiplier(): number {
    return 1 + crMovementChangePercent(this.currentCR) / 100;
  }

  /** 武器输出伤害倍率 (±10%)。 */
  public get crDamageDealtMultiplier(): number {
    return 1 + crDamageChangePercent(this.currentCR) / 100;
  }

  /** 承受装甲/船体/护盾伤害倍率 (±10%)。 */
  public get crDamageTakenMultiplier(): number {
    return 1 + crDamageTakenChangePercent(this.currentCR) / 100;
  }

  public resetShieldMalfunctionState(): void {
    this.crShieldMalfunctionTimer = 0;
    this.crShieldMalfunctionInterval = .75 + this.random.next() * .5;
    this.crShieldMalfunctionIntervalElapsed = false;
    this.shield.sinceLastDamageTaken = Number.POSITIVE_INFINITY;
    this.justShieldMalfunction = false;
  }

  /** CR stat/system restrictions and native shield malfunction interval/impact gating. */
  private applyCombatReadiness(dt: number) {
    const effects = this.crEffects;

    this.system.disabled = effects.systemDisabled;
    this.defenseSystem.disabled = effects.defenseDisabled;
    if (effects.defenseDisabled) this.defenseSystem.deactivate();
    if (effects.systemDisabled && this.system.isActive) {
      this.system.deactivate();
    }
    if (effects.defenseDisabled && this.shield.isRaiseRequested) {
      this.lowerShieldWithFeedback();
    }

    this.shield.sinceLastDamageTaken += dt;
    if (this.crShieldMalfunctionIntervalElapsed) {
      this.crShieldMalfunctionInterval = .75 + this.random.next() * .5;
      this.crShieldMalfunctionTimer = 0;
      this.crShieldMalfunctionIntervalElapsed = false;
    }
    this.crShieldMalfunctionTimer += dt;
    if (this.crShieldMalfunctionTimer < this.crShieldMalfunctionInterval) return;
    this.crShieldMalfunctionIntervalElapsed = true;

    // Ship.advance: only a real, active shield hit within 1.25s can fail at high flux.
    if (
      effects.shieldMalfunctionChance > 0 &&
      (this.shield.type === 'FRONT' || this.shield.type === 'OMNI') &&
      this.shield.isActive &&
      this.flux.fluxPercent > .75 &&
      this.shield.sinceLastDamageTaken < 1.25 &&
      this.random.next() < effects.shieldMalfunctionChance &&
      this.flux.forceOverload(0)
    ) {
      this.justShieldMalfunction = true;
      this.lowerShieldWithFeedback();
    }
  }

  /** Deployment hook; lazy first-update use lets callers configure CR before entry.
   * Reapplying explicitly is a new deployment, not an ordinary in-combat CR edit. */
  public applyDeploymentReadiness(cr = this.currentCR, controlsLocked = false): void {
    this.currentCR = Number.isFinite(cr) ? Math.max(0, Math.min(1, cr)) : 0;
    this.crAtDeployment = this.currentCR;
    this.lowCRDamageSequence = null;
    const threshold = CR_CRITICAL_MALFUNCTION_START * this.crMalfunctionRangeMultiplier - .001;
    if (threshold > 0 && this.currentCR < threshold && !controlsLocked && this.flux.hullSize !== 'FIGHTER') {
      const severity = (threshold - this.currentCR) / threshold * this.criticalMalfunctionChanceMultiplier;
      this.lowCRDamageSequence = new LowCRShipDamageSequence(this, severity, this.random);
    }
  }

  private advanceDeploymentReadiness(dt: number): void {
    if (this.crAtDeployment === null) this.applyDeploymentReadiness();
    this.lowCRDamageSequence?.advance(dt);
    if (this.lowCRDamageSequence?.finished) this.lowCRDamageSequence = null;
  }

  public applyCriticalMalfunction(target: ComponentMalfunctionTarget, permanent = true): void {
    let local: Vector2;
    if (target.kind === 'weapon') {
      this.weaponControl.disableComponent(target.mount, permanent);
      if (permanent) finalizePermanentWeaponMalfunction(this, target.mount);
      local = target.mount.relativePos;
    } else {
      const slot = this.spec.engineSlots[target.index];
      if (!slot) return;
      this.engineController.malfunction(target.index, this.engineDisableContext, permanent);
      local = new Vector2(slot.x, slot.y);
    }
    this.applyCriticalMalfunctionDamage(local);
  }

  /** Ship.applyCriticalMalfunction: side damage also occurs when permanence is vetoed. */
  public applyCriticalMalfunctionDamage(local: Vector2): void {
    const damage = this.baseCriticalMalfunctionDamage * (.75 + this.random.next() * .5) * this.criticalMalfunctionDamageMultiplier;
    const lethal = this.hullHp <= damage;
    if (!lethal && this.random.next() > .25) {
      const hullDamage = Math.min(this.hullHp, damage);
      this.applyHullDamage(damage);
      this.justCriticalDamage.push({ local: local.clone(), armorDamage: 0, hullDamage });
      return;
    }
    const raw = lethal ? this.maxHullHp * 10 : damage;
    const result = this.armor.takeDamage(local, raw * this.crDamageTakenMultiplier, 'ENERGY', raw, false);
    this.applyHullDamage(result.hullDamage);
    applyComponentDamage(this, local, result, 0, this);
    this.justCriticalDamage.push({ local: local.clone(), armorDamage: result.armorDamage, hullDamage: result.hullDamage });
  }

  public interpolatedPos(alpha: number): Vector2 {
    const presentation = shipPresentationPose(this);
    if (presentation) return presentation.pos.clone();
    if (!this.prevPos) return this.pos.clone();
    return Vector2.lerp(this.prevPos, this.pos, alpha);
  }

  public interpolatedFacing(alpha: number): number {
    const presentation = shipPresentationPose(this);
    if (presentation) return presentation.facing;
    if (this.prevFacingRad === undefined) return this.facingRad;
    let dAngle = this.facingRad - this.prevFacingRad;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    return this.prevFacingRad + dAngle * alpha;
  }

  /**
   * 计算护盾物理与视觉旋转锚点中心 (1:1 G.java:333-335: shieldPivot.computePosition)
   */
  public getShieldCenter(shipPos: Vector2 = this.pos, shipFacingRad: number = this.facingRad): Vector2 {
    const cx = this.spec.shieldCenterX || 0;
    const cy = this.spec.shieldCenterY || 0;
    if (cx === 0 && cy === 0) return shipPos.clone();
    // Cache only trigonometry, never a mutable world position or returned vector.
    let rotation = shieldCenterRotations.get(this);
    if (!rotation) {
      rotation = { facing: shipFacingRad, cos: Math.cos(shipFacingRad), sin: Math.sin(shipFacingRad) };
      shieldCenterRotations.set(this, rotation);
    } else if (!Object.is(rotation.facing, shipFacingRad)) {
      rotation.facing = shipFacingRad;
      rotation.cos = Math.cos(shipFacingRad);
      rotation.sin = Math.sin(shipFacingRad);
    }
    return new Vector2(shipPos.x + (cx * rotation.cos - cy * rotation.sin),
      shipPos.y + (cx * rotation.sin + cy * rotation.cos));
  }

  /** Use the same offset shield center for every simulation-side arc test. */
  public isShieldPointBlocked(hitWorldPos: Vector2): boolean {
    const shieldCenter = this.getShieldCenter();
    return this.shield.isHitBlocked(shieldCenter, hitWorldPos, this.facingRad);
  }

  /** Current Web flame-length modifiers; zero-flux boost is a separate mechanism. */
  public get isEngineGlowExtended(): boolean {
    return (this.system.definition.controls?.suppressZeroFlux && this.system.effectLevel > 0) || this.shield.phaseEffectLevel > 0;
  }

  private get engineDisableContext() {
    return { extendedGlow: this.isEngineGlowExtended, systemActive: this.system.isActive };
  }

  public damageEngineComponent(engineIndex: number, damage: number): void {
    this.engineController.damage(engineIndex, damage, this.isEngineGlowExtended);
  }

  /** No-index force is a controller cascade; an explicit index disables that component. */
  public triggerEngineFlameout(engineIndex?: number): void {
    if (engineIndex === undefined) this.engineController.forceFlameout();
    else this.engineController.disable(engineIndex, this.engineDisableContext);
  }

  public getFlameoutRatio(): number {
    return Math.max(0, Math.min(1, this.engineController.disabledFraction(true)));
  }

  public selectWeaponGroup(index: number) {
    this.weaponControl.selectGroup(index);
  }

  public toggleAutofire(groupIndex: number) {
    this.weaponControl.toggleAutofire(groupIndex);
  }

  public toggleFireMode(groupIndex: number) {
    this.weaponControl.toggleFireMode(groupIndex);
  }


  /**
   * 60Hz 逻辑步长更新
   */
  /** Independent external phase sources never overwrite the ship's own phase coil. */
  public readonly externalPhaseEffects = new Map<object, () => number | undefined>();
  public isDocked = false;
  public isSystemDrone = false;
  public get isCollisionless(): boolean { return this.isPhased || (this.runtimeModifiers.value.collisionDisabled ?? 0) > 0; }
  public get phaseVisualAlpha(): number {
    let alpha = this.shield.type === 'PHASE' ? 1 - .75 * this.shield.phaseEffectLevel : 1;
    for (const effect of this.externalPhaseEffects.values()) {
      const value = effect();
      if (value !== undefined) alpha = Math.min(alpha, Math.max(0, Math.min(1, value)));
    }
    return this.isDocked || this.isRetreated ? 0 : alpha * (this.runtimeModifiers.value.visualAlphaMultiplier ?? 1);
  }
  public get isPhased(): boolean {
    if (this.isDocked || this.isRetreated || this.shield.isPhased || this.system.isPhased) return true;
    for (const effect of this.externalPhaseEffects.values()) if (effect() !== undefined) return true;
    return false;
  }

  /**
   * 判断当前是否允许开启护盾 (严格对齐 D.java: canUseShields / ship_systems.csv noShield).
   * Burn Drive 的 IN/ACTIVE/OUT 全阶段都带 noShield；冷却阶段则允许重新展开护盾。
   */
  public get defenseFailureReason(): string | undefined {
    if (this.isDead || this.hullHp <= 0 || this.isDocked || this.isRetreated) return '舰船不在战斗状态';
    if (this.defenseSystem.type !== 'NONE') {
      if (!this.defenseSystem.isActive && (this.system.blocksShields || this.crEffects.defenseDisabled)) return '独立防御被禁用';
      return this.defenseSystem.activationFailureReason;
    }
    if (this.shield.type === 'NONE') return '没有护盾或独立防御';
    if (this.shield.toggleLocked) return '护盾常开，不能手动关闭';
    if (this.shield.type === 'PHASE' && this.shield.phaseState === 'OUT') return '正在退出相位';
    if (this.shield.type === 'PHASE' && this.shield.phaseState === 'COOLDOWN') return '相位线圈冷却中';
    if (this.system.blocksShields || this.crEffects.defenseDisabled) return '防御被禁用';
    if (this.flux.isOverloaded) return '幅能过载';
    if (this.flux.isVenting) return '正在排散幅能';
    if (this.retreating) return '撤退中';
    return undefined;
  }
  public activateDefenseSystem(): boolean {
    if (this.defenseFailureReason || this.defenseSystem.type === 'NONE') return false;
    return this.defenseSystem.activate();
  }
  public toggleDefense(): boolean {
    if (this.defenseFailureReason) return false;
    if (this.defenseSystem.type !== 'NONE') return this.activateDefenseSystem();
    const raising = this.shield.type === 'PHASE' ? this.shield.phaseState === 'IDLE' : !this.shield.isRaiseRequested;
    this.shield.toggle();
    // toggle() reports instantaneous protection, not whether the request was accepted.
    if (this.shield.type === 'PHASE') sound.play(raising ? 'phase_activate' : 'phase_deactivate', .9);
    else sound.play(raising ? 'shield_up' : 'shield_down', .65);
    return true;
  }

  public canUseShields(): boolean {
    const systemBlocksShield = this.system.blocksShields;
    // CRPluginImpl: cr <= 0 时 setDefenseDisabled(true)，护盾完全不可用。
    const crBlocksShield = this.crEffects.defenseDisabled;
    return this.shield.type !== 'NONE' && !systemBlocksShield && !crBlocksShield && !this.flux.isOverloaded && !this.flux.isVenting && !this.isDead && !this.retreating;
  }

  private lowerShieldWithFeedback(): boolean {
    if (!this.shield.isRaiseRequested) return false;
    if (this.shield.type === 'PHASE' && this.shield.phaseState !== 'IN' && this.shield.phaseState !== 'ACTIVE') return false;
    this.shield.setActive(false);
    if (this.shield.type === 'PHASE') sound.play('phase_deactivate', 0.9);
    else sound.play('shield_down', 0.7);
    return true;
  }

  /**
   * 启动主动幅能排散 (严格对齐 D.java: ventFlux & Ship.java: notifyVentingStarted)
   * 1. 立即取消护盾防护状态，但保留 currentArcDeg 让视觉按正常收拢速率退场
   * 2. 强制退出相位潜航与关闭战术系统
   * 3. 播放关盾音效与排散启动音效
   */
  public get ventFailureReason(): string | undefined {
    if (this.isDead || this.hullHp <= 0 || this.isDocked || this.isRetreated) return '舰船不在战斗状态';
    if (this.retreating) return '撤退中';
    if (this.shield.toggleLocked || this.system.blocksVenting || this.hullStats.ventRateMultiplier <= 0) return '当前配置禁止主动排幅';
    if (this.flux.isOverloaded) return '幅能过载';
    if (this.flux.isVenting) return '正在排散幅能';
    if (this.flux.totalFlux <= 5) return '无需排散幅能';
    return undefined;
  }
  public startVenting(): boolean {
    if (this.ventFailureReason) return false;

    // 1. 取消防护但不清零当前展开弧度；Shield.update() 会完成收拢动画。
    this.lowerShieldWithFeedback();

    // 2. 强制解除战术技能 (堡垒护盾 / 冲刺推进)
    if (this.system.isActive) {
      this.system.deactivate();
    }

    // 3. 触发幅能排散状态
    const started = this.flux.startVenting();
    if (started) {
      sound.play('flux_vent', 0.9);
      sound.startLoop('flux_flush_loop', 0.65);
    }
    return started;
  }

  /**
   * 判定视野与战术测距内是否存在重要敌对主力舰 (1:1 com.fs.starfarer.combat.entities.Ship.areSignificantEnemiesInRange)
   */
  public areSignificantEnemiesInRange(range = 2500, enemy?: Ship | null): boolean {
    const significant = (other: Ship) => other !== this && !sameTeam(other, this) && !other.isDead && !other.isRetreated && !other.isDocked
      && other.spec.hullSize !== 'FIGHTER' && this.pos.distanceTo(other.pos) <= range;
    // Enemy presence/PPT is a world query, never contingent on the player's R lock.
    return !!(enemy && significant(enemy)) || this.combatShips.some(significant);
  }

  /** Adapt source D flux modifiers without mutating saved ShipSpec or FluxTracker defaults. */
  private advanceHullModFlux(dt: number): void {
    this.flux.dissipationMultiplier = this.system.getDissipationMultiplier();
    const boostTimer = this.flux.zeroFluxTimer;
    const fluxLocked = this.flux.isOverloaded || this.flux.isVenting;
    if (dt > 0 && !fluxLocked && !this.system.blocksFluxDissipation && this.shield.isActive && this.hullStats.hardFluxDissipationFraction > 0) {
      // D.cfr_renamed_4: soft flux consumes the full budget first; only the
      // remaining budget is scaled by the hard-flux dissipation fraction.
      const leftover = Math.max(0, this.flux.effectiveDissipation * dt - this.flux.softFlux);
      this.flux.hardFlux = Math.max(0, this.flux.hardFlux - leftover * Math.min(1, this.hullStats.hardFluxDissipationFraction));
    }
    this.flux.update(dt, this.shield.isActive, !this.system.blocksFluxDissipation);
    if ((this.hullStats.zeroFluxMinimumFluxLevel > 0 || this.hullStats.allowZeroFluxAtAnyLevel > 0) && dt > 0) {
      const canBoost = !fluxLocked && !this.flux.isOverloaded && !this.flux.isVenting && !this.isDead
        && this.spec.hullSize !== 'FIGHTER' && !this.system.locksTurning
        && (this.flux.fluxPercent <= this.hullStats.zeroFluxMinimumFluxLevel || this.hullStats.allowZeroFluxAtAnyLevel > 0);
      this.flux.zeroFluxTimer = canBoost ? (this.hullStats.allowZeroFluxAtAnyLevel > 0 && this.flux.fluxPercent > this.hullStats.zeroFluxMinimumFluxLevel
        ? this.flux.timeSinceFluxIncrease : boostTimer + dt) : 0;
      this.flux.isEngineBoostActive = canBoost && this.flux.zeroFluxTimer >= this.flux.boostDelay;
    }
  }

  public update(
    dt: number,
    targetShip: Ship | null,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec) => void,
    fireControlWorld?: FireControlWorld
  ) {
    // Ship.advance advances listeners before weapons; use the Web combat step.
    // A notification does not alter the triggering pulse or later beams this tick.
    if (dt > 0) for (const [id, effect] of this.statusEffects) {
      if (!effect.advance(this, dt)) this.statusEffects.delete(id);
    }
    if (dt > 0) for (const mod of installedHullMods(this.spec)) if (mod.status === 'implemented') mod.advance?.(this, dt, this.random);
    // This deployment plugin uses world dt, before phase scales the ship clock.
    this.advanceDeploymentReadiness(dt);
    if (this.isDead || this.isRetreated || this.hullHp <= 0) return;

    // 记录上一物理帧状态，用于渲染亚帧平滑插值
    this.prevPos.copy(this.pos);
    this.prevFacingRad = this.facingRad;
    this.currentTargetShip = targetShip || null;
    this.combatShips = fireControlWorld?.ships ?? (this.combatShips.length ? this.combatShips : targetShip ? [this, targetShip] : [this]);

    // 战备值与峰值性能时钟推进 (1:1 RepairTracker.java & C.java)
    if (this.hullStats.peakCRSec > 0) {
      if (this.areSignificantEnemiesInRange(2500, targetShip)) {
        if (this.peakPerformanceRemaining > 0) {
          this.peakPerformanceRemaining = Math.max(0, this.peakPerformanceRemaining - dt);
        } else {
          const lossRate = this.hullStats.crLossPerSec * 0.01;
          this.currentCR = Math.max(0, this.currentCR - lossRate * dt);
        }
      }
    }

    for (const eng of this.engineStatuses) {
      eng.prevThrust = eng.currentThrust;
      eng.prevSpread = eng.spread;
    }
    this.prevEngineBoostLevel = this.engineBoostLevel;
    this.engineBoostLevel = this.flux.isEngineBoostActive
      ? Math.min(1, this.engineBoostLevel + dt * 2)
      : Math.max(0, this.engineBoostLevel - dt * 2);

    // 相位时钟膨胀 (严格对齐 PhaseCloakStats.java: 3x 主观战术时钟加速)
    const tacticalDt = dt * this.system.getTimeMultiplier();
    const effectiveDt = dt * this.subjectiveTimeMultiplier;
    advanceCombatSkills(this, effectiveDt);

    // 1. 更新战术技能与幅能
    this.system.update(effectiveDt);
    this.defenseSystem.update(effectiveDt);

    // 1.1 战备值惩罚：cr <= 0 时舰船系统与防御彻底失效；低战备触发故障机制
    this.applyCombatReadiness(effectiveDt);

    // Existing Web system-cancellation rules remain an adapter, not native controller behavior.
    if (this.flux.isOverloaded || this.flux.isVenting) this.defenseSystem.deactivate();
    if ((this.flux.isOverloaded || this.flux.isVenting) && this.system.isActive) {
      this.system.deactivate();
    }
    if (this.system.isActive && this.system.definition.controls?.cancelOnFlameout && this.getFlameoutRatio() >= 1.0) {
      this.system.deactivate();
    }

    // ship_systems.csv marks Burn Drive as noShield for its entire applied IN/ACTIVE/OUT lifecycle.
    // Cancel delayed raise requests too; otherwise closing can finish by raising a forbidden shield.
    // noShield 立即取消碰撞防护，但视觉仍通过 currentArcDeg 平滑收拢。
    if (this.system.blocksShields && this.shield.isRaiseRequested) {
      this.lowerShieldWithFeedback();
    }

    // 严禁过载或排散时使用护盾；同样保留视觉收拢阶段，避免一帧消失。
    if ((this.flux.isOverloaded || this.flux.isVenting) && this.shield.isRaiseRequested) {
      this.lowerShieldWithFeedback();
    }
    
    // 护盾维持能耗 (堡垒护盾激活时普通 shield upkeep 为 0，对齐 FortressShieldStats.java)
    // 相位线圈的开启/维持成本由 Shield 状态机以硬幅能结算，绝不过载。
    if (this.shield.type !== 'PHASE' && this.shield.isActive && !this.flux.isOverloaded && !this.flux.isVenting) {
      const upkeepMult = this.system.getShieldUpkeepMultiplier();
      if (this.flux.totalFlux >= this.flux.maxFlux
        || !this.flux.trySpendSoftFlux(this.shield.upkeepRate * upkeepMult * tacticalDt)) this.lowerShieldWithFeedback();
    }
    if (this.shield.type === 'PHASE' && this.shield.isPhaseUpkeepActive) {
      this.flux.increaseFluxClamped(this.shield.phaseUpkeepPerSecond * dt, true);
    }

    // Fortress Shield 自身另有 2.5% 基础幅能容量/秒的硬幅能成本；
    // 不能被上面的 shield-upkeep 归零逻辑一并吞掉。
    if (!this.flux.isOverloaded && !this.flux.isVenting) {
      this.flux.increaseFlux(this.system.getSoftFluxPerSecond() * tacticalDt, false);
      const systemHardFluxPerSecond = this.system.getHardFluxPerSecond(this.flux.maxFlux);
      if (systemHardFluxPerSecond > 0) {
        this.flux.increaseFlux(systemHardFluxPerSecond * tacticalDt, true);
      }
    }

    // 系统激活成本 (ship_systems.csv flux/use)：空雷突袭每次使用消耗 10% 基础幅能容量。
    const systemActivationFlux = this.system.consumePendingActivationFlux();
    if (systemActivationFlux > 0) {
      this.flux.increaseFlux(systemActivationFlux, this.system.generatesHardFlux);
    }
    const defenseActivationFlux = this.defenseSystem.consumePendingActivationFlux();
    if (defenseActivationFlux > 0) this.flux.increaseFlux(defenseActivationFlux, this.defenseSystem.generatesHardFlux);
    this.advanceHullModFlux(tacticalDt);

    // 2. 物理运动推力与转向 (相位下机动时限加速)
    const engineCommands = this.updateMotion(effectiveDt);

    // 3. 护盾朝向与展开
    const aimAngle = Math.atan2(this.aimTargetWorld.y - this.pos.y, this.aimTargetWorld.x - this.pos.x);
    this.shield.update(effectiveDt, this.facingRad, this.fireControlMode === 'AI' ? this.defenseFacingRad ?? aimAngle : aimAngle);

    // 4. 武器挂点瞄准与开火解算
    this.weaponControl.update(effectiveDt, this, aimAngle, targetShip, spawnProjectile, spawnBeam, spawnMuzzleFlash, fireControlWorld);

    // 5. 更新战损贴花的红热余辉；冷却后焦痕本体仍持续保留
    this.updateScorchMarks(dt);

    // Native ship order: movement commands, component health, controller, then glow.
    this.engineController.advance(effectiveDt, {
      ...this.engineDisableContext, ...engineCommands, canRepair: !this.isDead && this.hullHp > 0,
      repairTimeMultiplier: this.combatEngineRepairTimeMultiplier * this.system.getRepairTimeMultiplier(),
      canRepairUnderFire: this.canRepairModulesUnderFire,
      malfunctionChance: this.crEffects.engineMalfunctionChance,
      criticalMalfunctionChance: this.crEffects.criticalMalfunctionChance,
      onCriticalMalfunction: index => {
        const slot = this.spec.engineSlots[index];
        this.applyCriticalMalfunctionDamage(new Vector2(slot.x, slot.y));
      }
    });

    // P.java retains seven recent poses for the coil masks, not fading hull copies.
    if (this.shield.isPhaseEngaged) {
      this.phaseGhosts.unshift({ pos: this.pos.clone(), facingRad: this.facingRad, alpha: 1, life: 1, maxLife: 1 });
      if (this.phaseGhosts.length > 7) this.phaseGhosts.pop();
    } else {
      this.phaseGhosts.length = 0;
    }
  }

  public syncWithArmorGridState(): void {
    this.damageDecals.syncWithArmorGridState();
  }

  public updateScorchMarks(dt: number): void {
    this.damageDecals.advance(dt, this.hullHp / this.maxHullHp);
  }

  public getMotionStats() { return shipMotionStats(this); }

  private updateMotion(dt: number): { accelerating: boolean; spreading: boolean } {
    return advanceShipMotion(this, dt);
  }
}

const shieldCenterRotations = new WeakMap<Ship, { facing: number; cos: number; sin: number }>();
/** Identity gate for read-only geometry memoization; overridden callbacks stay uncached. */
export const nativeGetShieldCenter = Ship.prototype.getShieldCenter;
