import { bindNativeFireQueries } from '../../ai/AutofireController';
import { advanceGlorianaTorpedoLoad, clearGlorianaTorpedoRail } from '../../visual/GlorianaTorpedoVisuals';
import { updateGravityTractorInput, releaseGravityTractor } from './GravityTractor';
import { isImmutableMetadata } from '../../extensions/Immutable';
import { FireControlQueryBatch } from '../../ai/FireControlQueryBatch';
import { initializeSourceMissile } from './weapon/SourceMissileLifecycle';
import { effectiveHullModWeaponSpec, installedHullMods } from '../../extensions/HullMods';
import { AutofireController, nativeAutofireReaders, nativeSampledAutofireReaders, type FireControlWorld } from '../../ai/AutofireController';
import { signedAngle } from '../../math/Angles';
import { manualFireSlots, advanceTurretAim } from './weapon/WeaponAim';
import { combatWeaponRange, combatProjectileSpeed } from '../WeaponRange';
import { bindProjectileSource } from './weapon/OutgoingDamage';
import { canPermanentlyDisableWeapon, finalizePermanentWeaponMalfunction, weaponIsInFiringCycle } from './ComponentMalfunctions';
import { advanceWeaponComponent, createWeaponHealthTracker, damageWeaponComponent, disableWeaponComponent, weaponHealthProfile } from './weapon/WeaponComponentHealth';
import { Vector2 } from '../../math/Vector2';
import { Projectile, Beam, WeaponMount, WeaponSpec, WeaponGroup, LauncherSmokeSpec, MuzzleFlashSpec } from '../Weapon';
import { ShipSpec } from '../../modding/ModManager';
import { initializeSourceProjectile } from './weapon/SourceProjectileLifecycle';
import { combatAudio as sound } from '../../audio/CombatAudioEvents';
import type { Ship } from '../Ship';
import { contentRegistry } from '../../content/ContentRegistry';
import { SimulationRandom } from '../SimulationRandom';
import { stageFor, type StageView } from '../../ai/batch/StageProducer';
import { publishFireInputs, fireScope, fireTeamScope, fireMissileScope, fireMissileRows } from '../../ai/batch/FireInputs';
import { FireProgram, type FireCoverage, type FireTargetKind } from '../../ai/batch/FireProgram';
import { FireGroups } from '../../ai/batch/FireGroups';
import { InFlightFireBudget } from '../../ai/InFlightFireBudget';
import { WeaponFlag } from '../../ai/batch/StageProtocol';
import { knownProjectionKeys } from '../../runtime/local/ProjectionArrays';
import { HYPERION_HIT_EFFECT } from '../../content/HyperionIds';
import { GLORIANA_SIEGE_HIT_EFFECT } from '../../extensions/weapon-effects/GlorianaSiegeHit';
import type { SystemModifiers } from '../../extensions/ship-systems/Types';

const barrelOffsetProjectionKeys = ['x', 'y'];
let beamProjectionKeys: string[] | undefined;
let missileProjectileKeys: string[] | undefined;
let ballisticProjectileKeys: string[] | undefined;
const mountSaltCache = new WeakMap<WeaponMount, { shipId: string; slotId: string; salt: number }>();
const weaponControlModifierReaders = [
  'getWeaponRateOfFireMultiplier',
  'getAmmoRegenMultiplier',
  'getRecoilMultiplier',
  'getRepairTimeMultiplier',
  'getWeaponFluxCostMultiplier',
] as const;
const nativePresentationEffects = new Set<string>([
  'com.fs.starfarer.api.impl.combat.TachyonLanceEffect',
  'com.fs.starfarer.api.impl.combat.GravitonBeamEffect',
  'com.fs.starfarer.api.impl.combat.SabotOnHitEffect',
  'com.fs.starfarer.api.impl.combat.MoteOnHitEffect',
  HYPERION_HIT_EFFECT,
  GLORIANA_SIEGE_HIT_EFFECT,
]);

/**
 * 战舰武器挂点、火控散布、交替射击与弹道发射控制子系统 (ShipWeaponControlSystem)
 * 纯粹负责管理各挂点旋转、火控散布衰减、自动火控解算与多管射击偏移。
 */
export interface WeaponControlStep {
  readonly owner: ShipWeaponControlSystem; readonly ship: Ship; readonly dt: number;
  readonly manualControl: boolean; readonly canShipFire: boolean; readonly serial: number;
}
export interface WeaponFirePlan extends WeaponControlStep {
  readonly activeSlotSet: ReadonlySet<string>; readonly fireRequests: Set<string>;
  readonly suspendedAutofire: ReadonlySet<string>; readonly automaticStarts: ReadonlyMap<string, WeaponGroup>;
  readonly tractorRequests: readonly { mount: WeaponMount; world: FireControlWorld; trigger: boolean }[];
  /** Numerical decisions are final; the consumer may only recheck live resources. */
  readonly numericFire?: boolean;
}

const weaponStepSerial = new WeakMap<ShipWeaponControlSystem, number>();
const consumedPlans = new WeakSet<WeaponFirePlan>();
const numericalFirePlans = new WeakSet<WeaponFirePlan>();
// Transient scratch/diagnostics must not become enumerable authority fields.
const firePrograms = new WeakMap<ShipWeaponControlSystem, FireProgram>();
const fireCoverages = new WeakMap<ShipWeaponControlSystem, FireCoverage>();

function aimMountTurret(
  mount: WeaponMount,
  targetPoint: Vector2 | null,
  mountX: number,
  mountY: number,
  mountBaseWorldAngle: number,
  halfArcRad: number,
  isHardpoint: boolean,
  turretTurnRateRad: number,
  shipAngularVel: number,
  dt: number
): void {
  if (isHardpoint || turretTurnRateRad <= 0) {
    mount.currentAngleRad = mountBaseWorldAngle;
    return;
  }
  if (!targetPoint) {
    mount.aimIdleSeconds = (mount.aimIdleSeconds ?? 15.1) + dt;
    if (mount.aimIdleSeconds > 15) mount.currentAngleRad = advanceTurretAim(mount.currentAngleRad, mountBaseWorldAngle, mountBaseWorldAngle, mount.arcDeg, turretTurnRateRad, shipAngularVel, dt);
    return;
  }
  mount.aimIdleSeconds = 0;
  const dx = targetPoint.x - mountX;
  const dy = targetPoint.y - mountY;
  const targetAngle = Math.atan2(dy, dx);
  let diffFromBase = targetAngle - mountBaseWorldAngle;
  while (diffFromBase > Math.PI) diffFromBase -= Math.PI * 2;
  while (diffFromBase < -Math.PI) diffFromBase += Math.PI * 2;
  const isWithinArc = mount.arcDeg >= 360 || Math.abs(diffFromBase) <= halfArcRad;
  const desiredAngle = isWithinArc ? targetAngle : mountBaseWorldAngle + Math.sign(diffFromBase) * halfArcRad;
  mount.currentAngleRad = advanceTurretAim(mount.currentAngleRad, mountBaseWorldAngle, desiredAngle, mount.arcDeg, turretTurnRateRad, shipAngularVel, dt);
}

export class ShipWeaponControlSystem {
  private readonly autofire = new AutofireController();
  private get fireProgram(): FireProgram {
    let program = firePrograms.get(this);
    if (!program) { program = new FireProgram(); firePrograms.set(this, program); }
    return program;
  }
  /** Actual dispatch coverage of the latest plan, not sampled/perf instrumentation. */
  public get actualFireCoverage(): FireCoverage {
    let coverage = fireCoverages.get(this);
    if (!coverage) {
      coverage = { numericMounts: 0, genericMounts: 0,
        specialForceMounts: 0, customBudgetCalls: 0, stageEpoch: -1 };
      fireCoverages.set(this, coverage);
    }
    return coverage;
  }
  public set actualFireCoverage(coverage: FireCoverage) { fireCoverages.set(this, coverage); }
  public getFireDomainCoverage(): FireDomainCoverage {
    return { plan: { ...this.actualFireCoverage,
      unsupportedMechanisms: this.actualFireCoverage.unsupportedMechanisms?.slice() },
      legacyCalls: { ...this.autofire.legacyCalls } };
  }
  public static hasNativeQueryLoop(control: ShipWeaponControlSystem): boolean {
    // Mount specs are mutable by design; do not freeze/refit them for this cache.
    // Reject accessors and unregistered nested metadata instead of assuming purity.
    for (const mount of control.weapons) {
      const spec = Object.getOwnPropertyDescriptor(mount, 'spec')?.value as WeaponSpec | undefined;
      if (!spec) return false;
      for (const key of Object.getOwnPropertyNames(spec)) {
        const d = Object.getOwnPropertyDescriptor(spec, key)!;
        if (!('value' in d) || typeof d.value === 'function'
          || d.value && typeof d.value === 'object' && !isImmutableMetadata(d.value)) return false;
      }
    }
    const ai = control.autofire;
    return Object.getPrototypeOf(ai) === AutofireController.prototype
      && nativeAutofireReaders.every(([key, value]) => ai[key] === value);
  }
  /** Cheap identity gate ONLY inside the existing private cloned-command host.
   * Generic callers still require the full mutable-metadata audit above. */
  public static hasNativePlanLoop(control:ShipWeaponControlSystem):boolean {
    const ai=control.autofire;
    if(control.planFire!==nativePlanFire||Object.getPrototypeOf(ai)!==AutofireController.prototype
      ||control.planNumericFire!==nativeNumericPlanFire||control.programFluxBudget!==nativeProgramFluxBudget)return false;
    for(let i=0;i<nativeAutofireReaders.length;i++){const r=nativeAutofireReaders[i];if(ai[r[0]]!==r[1])return false;}
    for(let i=0;i<nativeSampledAutofireReaders.length;i++){const r=nativeSampledAutofireReaders[i];if(ai[r[0]]!==r[1])return false;}
    return true;
  }
  private previousHullFacingRad = 0;
  public weapons: WeaponMount[] = [];
  public weaponGroups: WeaponGroup[] = [];
  public selectedGroupIndex = 0;
  public justDisabledMounts: WeaponMount[] = [];
  public justRepairedMounts: WeaponMount[] = [];

  constructor(private readonly random = new SimulationRandom()) {}

  public init(spec: ShipSpec, initialFacingRad: number, healthMultiplier = 1) {
    firePrograms.delete(this);
    fireCoverages.delete(this);
    this.autofire.reset();
    this.previousHullFacingRad = initialFacingRad;
    this.weapons = [];
    this.weaponGroups = [];
    this.selectedGroupIndex = 0;
    this.justDisabledMounts = [];
    this.justRepairedMounts = [];

    // 装备挂点与武器
    for (const slot of spec.weaponSlots) {
      const baseWeapon = slot.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
      const weaponSpec = baseWeapon ? effectiveHullModWeaponSpec(spec, baseWeapon) : undefined;
      if (slot.defaultWeaponId && !weaponSpec) throw new Error(`${spec.id}.${slot.slotId}: unknown weapon ${slot.defaultWeaponId}`);
      if (weaponSpec) {
        const health = weaponHealthProfile(weaponSpec.mountSize, slot.mountType, healthMultiplier);
        this.weapons.push({
          slotId: slot.slotId,
          spec: weaponSpec,
          mountType: slot.mountType,
          relativePos: new Vector2(slot.x, slot.y),
          baseAngleDeg: slot.baseAngleDeg,
          arcDeg: slot.arcDeg,
          aimIdleSeconds: 15.1,
          currentAngleRad: initialFacingRad + (slot.baseAngleDeg * Math.PI) / 180,
          cooldownTimer: 0,
          isAutofire: slot.mountType === 'TURRET',
          burstRemaining: 0,
          burstTimer: 0,
          firingState: 'IDLE',
          firingStateTimer: 0,
          triggerHeld: false,
          firingCycleId: 0,
          baseMaxAmmo: baseWeapon?.maxAmmo,
          ammo: weaponSpec.maxAmmo ?? Number.POSITIVE_INFINITY,
          ammoRechargeProgress: 0,
          recoil: 0,
          glowAlpha: 0,
          barrelIndex: 0,
          currentSpreadDeg: weaponSpec.minSpread || 0,
          health: health.health,
          maxHealth: health.health,
          healthTracker: createWeaponHealthTracker(health.repairDuration, this.random),
          isPermanentlyDisabled: false,
          isDisabled: false,
          disabledTimer: 0,
          disabledDuration: 0
        });
      }
    }

    for (const mount of this.weapons) advanceGlorianaTorpedoLoad(mount);

    // 初始化武器编组 (Groups 1 - 5)
    if (spec.defaultWeaponGroups && spec.defaultWeaponGroups.length > 0) {
      this.weaponGroups = spec.defaultWeaponGroups.map((g) => ({
        index: g.index,
        mode: g.mode,
        isAutofire: g.isAutofire,
        weaponSlotIds: [...g.weaponSlotIds],
        alternatingIndex: 0,
        alternatingElapsed: 0,
        alternatingWasFiring: false,
        alternatingJustSwitched: false
      }));
    } else {
      this.weaponGroups = [
        {
          index: 0,
          mode: 'LINKED',
          isAutofire: false,
          weaponSlotIds: this.weapons.map((w) => w.slotId),
          alternatingIndex: 0,
          alternatingElapsed: 0,
          alternatingWasFiring: false,
          alternatingJustSwitched: false
        }
      ];
    }
    // Native variants may start with an empty group. Never spawn with an invisible
    // selected group while all visible weapon rows appear unselected.
    const occupied = this.weaponGroups.findIndex(g => g.weaponSlotIds.some(id => this.weapons.some(w => w.slotId === id)));
    this.selectedGroupIndex = Math.max(0, occupied);
  }

  private resolveGroupArrayIndex(declaredIndex: number): number {
    return this.weaponGroups.findIndex((group) => group.index === declaredIndex);
  }

  public selectGroup(declaredIndex: number) {
    const arrayIndex = this.resolveGroupArrayIndex(declaredIndex);
    if (arrayIndex >= 0 && this.selectedGroupIndex !== arrayIndex) {
      this.selectedGroupIndex = arrayIndex;
      sound.play('ui_button_press', 0.5);
    }
  }

  public toggleAutofire(declaredIndex: number) {
    const arrayIndex = this.resolveGroupArrayIndex(declaredIndex);
    if (arrayIndex >= 0) {
      const g = this.weaponGroups[arrayIndex];
      g.isAutofire = !g.isAutofire;
      sound.play('autofire_toggle', 0.7);
    }
  }

  public toggleFireMode(declaredIndex: number) {
    const arrayIndex = this.resolveGroupArrayIndex(declaredIndex);
    if (arrayIndex >= 0) {
      const g = this.weaponGroups[arrayIndex];
      g.mode = g.mode === 'LINKED' ? 'ALTERNATING' : 'LINKED';
      sound.play('ui_button_press', 0.6);
    }
  }

  /** Raw component transfer; periodic health checks, not damage calls, disable. */
  public damageComponent(mount: WeaponMount, damage: number): void {
    damageWeaponComponent(mount, damage, this.random);
  }

  public disableComponent(mount: WeaponMount, permanent = false): void {
    if (disableWeaponComponent(mount, this.random, permanent)) this.onComponentDisabled(mount);
  }

  private onComponentDisabled(mount: WeaponMount): void {
    // Destroy charge/burst state immediately; normal weapon cooldown keeps running
    // during repairs. There is no invented half-second cooldown on recovery.
    if (mount.firingState !== 'IDLE' || mount.burstRemaining > 0) {
      mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.beamBurstDelay ?? mount.spec.refireDelay);
    }
    mount.burstRemaining = 0;
    mount.burstFluxReserved = false;
    mount.burstTimer = 0;
    mount.firingState = 'IDLE';
    mount.firingStateTimer = 0;
    mount.triggerHeld = false;
    this.justDisabledMounts.push(mount);
  }

  public update(
    dt: number,
    ship: Ship,
    cursorAngle: number,
    targetShip: Ship | null,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec, underHullShipId?: string) => void,
    fireControlWorld?: FireControlWorld
  ) {
    const state = this.advanceState(dt, ship);
    if (ship.hullHp <= 0) return;
    const plan = this.planFire(state, cursorAngle, targetShip, fireControlWorld);
    this.commitFire(plan, spawnProjectile, spawnBeam, spawnMuzzleFlash);
  }

  /** Cooldown, repair and malfunction writes finish globally before fire queries. */
  public advanceState(dt: number, ship: Ship): WeaponControlStep {
    const manualControl = ship.fireControlMode === 'MANUAL' && !ship.system.forcesAutofire;
    const hullTurn = signedAngle(ship.facingRad - this.previousHullFacingRad);
    this.previousHullFacingRad = ship.facingRad;
    for (const mount of this.weapons) mount.currentAngleRad += hullTurn;
    const systemBlocksWeapons = ship.system.blocksWeapons;
    const isPhaseBlockingWeapons = ship.isPhased;
    const canShipFire = !ship.flux.isOverloaded && !ship.flux.isVenting && !systemBlocksWeapons && !isPhaseBlockingWeapons;

    // 冷却计时器、后坐力回位与弹道散布收束 (严格对齐 MultiBarrelRecoilTracker.java 与 weapon_data.csv)
    const cr = ship.crEffects;
    const sysMods = ship.system.hasNativeStats ? ship.system.readModifierTable?.(weaponControlModifierReaders) : undefined;
    const recoilMult = sysMods ? (sysMods.recoilMultiplier ?? 1) : undefined;
    const repairMult = sysMods ? ship.combatWeaponRepairTimeMultiplier * (sysMods.repairTimeMultiplier ?? 1) : undefined;
    const canRepair = !ship.isDead;
    const canRepairUnderFire = ship.canRepairModulesUnderFire;
    for (const mount of this.weapons) {
      // Timers remain in source weapon seconds. Apply transient RoF to their clock,
      // never to shared specs, ammo regeneration, repair, turret aim or projectile speed.
      const rate = this.weaponClockRate(mount, ship, sysMods);
      const reloadDelay = mount.reloadDelayRemaining ?? 0;
      mount.reloadDelayRemaining = Math.max(0, reloadDelay - dt * rate);
      const weaponDt = Math.max(0, dt * rate - reloadDelay);
      mount.lifecycleDt = mount.spec.isBeam
        ? Math.max(0, (weaponDt - mount.cooldownTimer) / rate)
        : Math.max(0, weaponDt - mount.cooldownTimer);
      if (mount.cooldownTimer > 0) {
        mount.cooldownTimer = Math.max(0, mount.cooldownTimer - weaponDt);
        if (mount.cooldownTimer < 1e-9) mount.cooldownTimer = 0;
      }
      if (Number.isFinite(mount.ammo) && mount.spec.maxAmmo !== undefined && mount.spec.ammoRegenPerSec) {
        const ammoRegenMult = sysMods
          ? (mount.spec.weaponType ? sysMods.weapons?.[mount.spec.weaponType]?.ammoRegenMultiplier ?? 1 : 1)
          : ship.system.getAmmoRegenMultiplier(mount.spec.weaponType);
        mount.ammoRechargeProgress += mount.spec.ammoRegenPerSec * ammoRegenMult * dt;
        while (mount.ammoRechargeProgress >= 1 && mount.ammo < mount.spec.maxAmmo) {
          mount.ammo++;
          mount.ammoRechargeProgress -= 1;
        }
        if (mount.ammo >= mount.spec.maxAmmo) mount.ammoRechargeProgress = 0;
      }
      advanceGlorianaTorpedoLoad(mount, canRepair);
      // 官方真实后坐力恢复时间: refireDelay * 0.8
      if (mount.recoil > 0) {
        const recoveryTime = Math.max(0.12, mount.spec.refireDelay * 0.8);
        mount.recoil = Math.max(0, mount.recoil - dt / recoveryTime);
      }
      if (mount.glowAlpha > 0) {
        mount.glowAlpha = Math.max(0, mount.glowAlpha - dt * 3.5);
      }
      // 真实弹道散布自然恢复 (spread decay)
      const minSpr = mount.spec.minSpread || 0;
      if (mount.currentSpreadDeg > minSpr) {
        const effRecoilMult = recoilMult ?? ship.system.getRecoilMultiplier();
        mount.currentSpreadDeg = Math.max(minSpr, mount.currentSpreadDeg - (mount.spec.spreadDecay || 5) * effRecoilMult * dt);
      }
      const effRepairMult = repairMult ?? ship.combatWeaponRepairTimeMultiplier * ship.system.getRepairTimeMultiplier();
      const healthEvent = advanceWeaponComponent(mount, dt, this.random, canRepair,
        effRepairMult, canRepairUnderFire,
        cr.weaponMalfunctionChance > 0 && weaponIsInFiringCycle(mount) ? {
          chance: cr.weaponMalfunctionChance, criticalChance: cr.criticalMalfunctionChance,
          canPermanentlyDisable: () => canPermanentlyDisableWeapon(ship, mount),
          disable: (critical, permanent) => {
            const onset = disableWeaponComponent(mount, this.random, permanent);
            if (permanent) finalizePermanentWeaponMalfunction(ship, mount);
            if (critical) ship.applyCriticalMalfunctionDamage(mount.relativePos);
            return onset;
          }
        } : undefined);
      if (healthEvent.disabled) this.onComponentDisabled(mount);
      if (healthEvent.repaired) this.justRepairedMounts.push(mount);
    }

    const serial = (weaponStepSerial.get(this) ?? 0) + 1;
    weaponStepSerial.set(this, serial);
    return { owner: this, ship, dt, manualControl, canShipFire, serial };

  }

  /** No projectile/beam creation or shot resource debit. Writes this controller's intent only. */
  public planFire(state: WeaponControlStep, cursorAngle: number, targetShip: Ship | null, fireControlWorld?: FireControlWorld): WeaponFirePlan {
    if (state.owner !== this) throw new Error('Weapon state belongs to another controller');
    const { dt, ship, manualControl, canShipFire } = state;
    const world: FireControlWorld = fireControlWorld ?? { ships: targetShip ? [ship, targetShip] : [ship], missiles: [], asteroids: [] };
    // The producer's private lease certifies this exact post-motion stage.
    // Exit BEFORE old QueryBatch/NativeAcquisitionFrame binding, not after an
    // acquisition fast path that still calls old aim/preAim/decide to finish.
    const nativeLoop = ShipWeaponControlSystem.hasNativePlanLoop(this);
    const numerical = stageFor(world);
    const nativeSystem = !!numerical && ship.system.hasNativeStats && ship.defenseSystem.hasNativeStats;
    const budget = world.fireBudget;
    // Unknown estimators/prioritization callbacks keep their complete original
    // branch and invocation order. Never synthesize a zero penalty/no-fire result.
    const nativeBudget = !budget || Object.getPrototypeOf(budget) === InFlightFireBudget.prototype
      && budget.estimate === nativeBudgetEstimate && budget.penalty === nativeBudgetPenalty
      && budget.needsDetailedPenalty === nativeBudgetNeedsDetailed
      && !Object.hasOwn(budget, 'canOmitUncontestedPenalty');
    let incompleteBudget = false;
    if (nativeLoop && nativeSystem && nativeBudget && numerical?.kind === 'FIRE_QUERY' && numerical.rowOf.has(ship)) {
      const published = publishFireInputs(numerical, world);
      incompleteBudget = !published.budgetComplete;
      if (!incompleteBudget) return this.planNumericFire(state, world, numerical, published);
    }
    this.actualFireCoverage = { numericMounts: 0, genericMounts: this.weapons.length,
      specialForceMounts: 0, customBudgetCalls: 0, stageEpoch: numerical?.epoch ?? -1,
      fallbackReason: !nativeLoop ? 'custom-controller' : !numerical || numerical.kind !== 'FIRE_QUERY'
        ? 'unbound-stage' : !nativeSystem ? 'custom-system' : !nativeBudget ? 'custom-budget'
          : incompleteBudget ? 'incomplete-budget-stage' : 'missing-owner' };
    const activeGroup = manualControl ? this.weaponGroups[this.selectedGroupIndex] : undefined;
    const activeSlotSet = activeGroup ? new Set(activeGroup.weaponSlotIds) : undefined;
    let autofireSlotSet: Set<string> | undefined;
    if (manualControl) {
      autofireSlotSet = new Set<string>();
      for (const g of this.weaponGroups) {
        if (g.isAutofire) {
          for (const slotId of g.weaponSlotIds) {
            autofireSlotSet.add(slotId);
          }
        }
      }
    }

    // 交替射击组：同一时刻只允许"当前活动挂点"开火，并按原版时间片轮换
    // (见 advanceAlternatingActive)。故障/无弹挂点会被跳过，否则它们会永久阻塞整组。
    const isAlternatingGroup = manualControl && !!activeGroup && activeGroup.mode === 'ALTERNATING';
    if (isAlternatingGroup && activeGroup) {
      if (ship.isFiringMain && canShipFire) {
        this.advanceAlternatingActive(activeGroup, dt, ship);
      } else {
        // 原版 WeaponGroup.advanceAlternating：松开扳机时，若上一次活动权不是被时间片
        // 自动轮换掉的，就把活动权手动交给下一门可用炮——也就是玩家常用的"轻点扳机换炮"。
        if (activeGroup.alternatingWasFiring && !activeGroup.alternatingJustSwitched) {
          this.selectNextAlternatingActive(activeGroup);
        }
        activeGroup.alternatingElapsed = 0;
        activeGroup.alternatingWasFiring = false;
        activeGroup.alternatingJustSwitched = false;
      }
    }
    const alternatingSlotId = isAlternatingGroup && activeGroup
      ? activeGroup.weaponSlotIds[((activeGroup.alternatingIndex % activeGroup.weaponSlotIds.length) + activeGroup.weaponSlotIds.length) % activeGroup.weaponSlotIds.length]
      : undefined;

    const manualSlots = activeSlotSet ? manualFireSlots(ship, this.weapons, activeSlotSet, alternatingSlotId) : undefined;
    const fireRequests = new Set<string>();
    const suspendedAutofire = new Set<string>();
    const tractorRequests: { mount: WeaponMount; world: FireControlWorld; trigger: boolean }[] = [];
    const queryBatch = FireControlQueryBatch.create(ship, world);
    const aimWorld = queryBatch ? { ...world, queryBatch } : world;
    const nativePlanLoop = nativeLoop;
    const closeNativeQueries = nativePlanLoop ? bindNativeFireQueries(ship, aimWorld) : undefined;
    const sampleRule = world.sampledAutofire;
    const root = sampleRule ? ship.assemblyRoot : undefined;
    const multirate = sampleRule?.cadence === 'multirate';
    const sampleShip = sampleRule && dt > 0 && Number.isFinite(dt) && !manualControl && ship.fireControlMode === 'AI'
      && root !== sampleRule.playerShip.assemblyRoot && root!.fireControlMode === 'AI'
      // The world owner includes externally controlled roots in fullRateShipIds.
      // Check both IDs as a fail-safe when an individual module is excluded.
      && !sampleRule.fullRateShipIds.has(root!.id) && !sampleRule.fullRateShipIds.has(ship.id) && ship.spec.hullSize !== 'FIGHTER'
      // A successful binding earned this exact sealed native stage, not a
      // permanent spec certificate. hasNativePlanLoop also excludes replaced
      // aim/decision callbacks. Unbound and legacy callers keep the full audit.
      && ((nativePlanLoop && closeNativeQueries !== undefined)
        || (ShipWeaponControlSystem.hasNativeQueryLoop(this)
          && nativeSampledAutofireReaders.every(([key, value]) => this.autofire[key] === value)));
    const shipCos = Math.cos(ship.facingRad), shipSin = Math.sin(ship.facingRad);
    const shipX = ship.pos.x, shipY = ship.pos.y, shipFacing = ship.facingRad, shipAngularVel = ship.angularVelRad;
    try {
      for (const mount of this.weapons) {
        mount.triggerHeld = false;
        if (mount.isDisabled) {
          if (mount.spec.gravityTractor) releaseGravityTractor(mount, '发射器离线');
          this.autofire.clear(mount);
          // 故障挂点电机失灵无法旋转瞄准，射控电路短路无法击发
          mount.burstRemaining = 0;
          mount.burstFluxReserved = false;
          mount.firingState = 'IDLE';
          mount.firingStateTimer = 0;
          continue;
        }

        const isInActiveGroup = activeSlotSet ? activeSlotSet.has(mount.slotId) : false;
        const isAutofireSlot = autofireSlotSet ? autofireSlotSet.has(mount.slotId) : false;

        const relX = mount.relativePos.x, relY = mount.relativePos.y;
        const mountX = shipX + relX * shipCos - relY * shipSin;
        const mountY = shipY + relX * shipSin + relY * shipCos;
        const mountBaseWorldAngle = shipFacing + (mount.baseAngleDeg * Math.PI) / 180;
        const halfArcRad = (mount.arcDeg * Math.PI) / 360;

        // 硬挂点或固定主炮不可独立转动 (对齐 Starsector: if.java:781)
        const isHardpoint = mount.mountType === 'HARDPOINT' || (mount.spec.turnRateDegPerSec !== undefined && mount.spec.turnRateDegPerSec <= 0);
        const turretTurnRateRad = isHardpoint ? 0 : (((mount.spec.turnRateDegPerSec ?? 30) * Math.PI) / 180);

        if (mount.spec.gravityTractor) {
          const tractorAim = !manualControl && ship.currentTargetShip ? ship.currentTargetShip.pos : ship.aimTargetWorld;
          const held = mount.gravityTractor;
          aimMountTurret(mount, held?.phase === 'HOLD' ? new Vector2(held.contactX, held.contactY) : tractorAim,
            mountX, mountY, mountBaseWorldAngle, halfArcRad, isHardpoint, turretTurnRateRad, shipAngularVel, dt);
          const trigger = canShipFire && (manualControl
            ? isInActiveGroup && ship.isFiringMain
            : !!ship.currentTargetShip && ship.flux.fluxPercent < .65);
          if (world.fireFrame) tractorRequests.push({ mount, world, trigger });
          else updateGravityTractorInput(dt, ship, mount, world, trigger);
          continue;
        }
        if (mount.spec.gravityDeflector) {
          // Authority resolves a real threat and applies its budget in the shared force pass.
          continue;
        }

        // 1. 当前选中的主力武器编组 (Active Group - 玩家手动瞄准与击发，绝对优先级)
        if (manualControl && isInActiveGroup && activeGroup && manualSlots) {
          this.autofire.clear(mount);
          if (isHardpoint) {
            mount.currentAngleRad = mountBaseWorldAngle;
          } else {
            aimMountTurret(mount, ship.aimTargetWorld, mountX, mountY, mountBaseWorldAngle, halfArcRad, isHardpoint, turretTurnRateRad, shipAngularVel, dt);
          }

          // Manual fire follows the group selection rule, not an invented alignment tolerance.
          if (ship.isFiringMain && canShipFire && mount.cooldownTimer <= 0 && !mount.spec.isBeam
            && (mount.firingState === 'CHARGING' || mount.burstRemaining > 0)) fireRequests.add(mount.slotId);
          if (ship.isFiringMain && canShipFire && mount.cooldownTimer <= 0 && manualSlots.has(mount.slotId)) {
            if (activeGroup.mode === 'LINKED') {
              fireRequests.add(mount.slotId);
            } else if (activeGroup.mode === 'ALTERNATING') {
              // 原版交替模式：本帧只把开火指令发给当前活动挂点，其余挂点禁止击发。
              // 活动权由 advanceAlternatingActive 按时间片轮换，因此两门炮会错开半个周期。
              if (mount.slotId === alternatingSlotId) {
                fireRequests.add(mount.slotId);
              }
            }
          }
        }
        // Aim/safety are per mount; the group scheduler gates new automatic firing cycles below.
        // AI owns all mounts; a manual pilot owns the selected group and opts others into autofire.
        else if (!manualControl || isAutofireSlot) {
          const spec = sampleShip ? mount.spec : undefined;
          // Multirate admits native large and fixed mounts too. Guided/rocket/
          // missile launchers retain the full live path: decideSampled cannot
          // safely authorize their launch geometry/lifetime semantics.
          const sampleMount = spec && (multirate || mount.mountType === 'TURRET' && (spec.mountSize === 'SMALL' || spec.mountSize === 'MEDIUM'))
            && !spec.isGuided && !spec.isRocket && spec.weaponType !== 'MISSILE' && spec.spawnType !== 'MISSILE'
            && !ship.system.autofirePolicy(mount);
          // Also reset when the world rule disappears or control returns to a
          // human/root, rather than keeping a sample for a later mode switch.
          if (!sampleMount) this.autofire.dropAimSample(mount);
          const sample = sampleMount ? this.autofire.sampledAim(dt, ship, mount, aimWorld) : undefined;
          const solution = sample ? null : this.autofire.aim(dt, ship, mount, aimWorld);
          if (ship.system.autofirePolicy(mount)?.suspended) {
            suspendedAutofire.add(mount.slotId);
            aimMountTurret(mount, null, mountX, mountY, mountBaseWorldAngle, halfArcRad, isHardpoint, turretTurnRateRad, shipAngularVel, dt);
            continue;
          }
          aimMountTurret(mount, sample ? sample.point : solution?.point ?? this.autofire.preAim(ship, mount, aimWorld),
            mountX, mountY, mountBaseWorldAngle, halfArcRad, isHardpoint, turretTurnRateRad, shipAngularVel, dt);
          const decision = sample ? this.autofire.decideSampled(ship, mount, sample.intent, aimWorld, dt)
            : this.autofire.decide(ship, mount, solution, aimWorld, dt);
          if (decision === 'FIRE' && canShipFire && mount.cooldownTimer <= 0) {
            fireRequests.add(mount.slotId);
          }
        }
        // 3. 其余未激活且非自动开火挂点 (Inactive Manual Weapons: Starsector WeaponGroup.java:334)
        else {
          this.autofire.clear(mount);
          const idleTargetAngle = Math.atan2(ship.aimTargetWorld.y-mountY,ship.aimTargetWorld.x-mountX);
          const cursorNearArc = Math.abs(signedAngle(idleTargetAngle-mountBaseWorldAngle)) <= (mount.arcDeg+30)*Math.PI/360;
          // Native inactive manual turrets receive the cursor only near their arc.
          if (ship.isPlayer && !isHardpoint && (cursorNearArc || mount.spec.alwaysFire)) {
            aimMountTurret(mount, ship.aimTargetWorld, mountX, mountY, mountBaseWorldAngle, halfArcRad, isHardpoint, turretTurnRateRad, shipAngularVel, dt);
          } else {
            aimMountTurret(mount, null, mountX, mountY, mountBaseWorldAngle, halfArcRad, isHardpoint, turretTurnRateRad, shipAngularVel, dt);
          }
        }

      }

    } finally { closeNativeQueries?.(); queryBatch?.close(); }

    // Resolve every mount before choosing an automatic group member: an out-of-arc,
    // empty or obstructed first gun must not starve the rest of the group.
    const automaticStarts = new Map<string, WeaponGroup>();
    for (const group of this.weaponGroups) {
      if (group.mode !== 'ALTERNATING' || (manualControl && (group === activeGroup || !group.isAutofire))) continue;
      const chosen = this.chooseAutomaticAlternating(group, fireRequests, dt, ship);
      if (chosen) automaticStarts.set(chosen, group);
      for (const slotId of group.weaponSlotIds) {
        const mount = this.weapons.find(w => w.slotId === slotId);
        // Let an already-started charge/burst finish; alternating controls cycle starts,
        // not the individual rounds within a burst. Sustained beams retain one owner.
        const committed = mount && (mount.burstRemaining > 0 || mount.firingState === 'CHARGING'
          || (mount.spec.isBeam && mount.spec.beamVisualMode === 'BURST' && mount.firingState === 'ACTIVE'));
        if (slotId !== chosen && !committed) fireRequests.delete(slotId);
      }
    }
    return { ...state, activeSlotSet, fireRequests, suspendedAutofire, automaticStarts, tractorRequests };
  }

  private readonly numericSlotsScratch = new Map<string, number>();
  private readonly numericMountRowsScratch: number[] = [];
  private numericRequestsScratch = new Uint8Array(512);

  /** Complete stage consumer. Only publication, per-mount controller memory,
   * explicit system callbacks and ordered output touch the old object model. */
  private planNumericFire(state: WeaponControlStep, world: FireControlWorld, v: StageView, prePublished?: ReturnType<typeof publishFireInputs>): WeaponFirePlan {
    const { ship, dt, manualControl, canShipFire } = state;
    const own = v.rowOf.get(ship)!;
    const input = prePublished ?? publishFireInputs(v, world), scope = fireScope(v, input, world);
    const missileScope = fireMissileScope(v, input, world);
    const ownTeam = v.bodies.team[own];
    const teamIndex = v.teams.indexOf(ownTeam);
    const teamScope = fireTeamScope(v, input, world, ownTeam, teamIndex);
    const missileRows = fireMissileRows(v, input, world, missileScope);
    const coverage: FireCoverage = this.actualFireCoverage = { numericMounts: 0, genericMounts: 0,
      specialForceMounts: 0, customBudgetCalls: 0, stageEpoch: v.epoch, unsupportedMechanisms: [],
      postTurnBoreChecks: 0, orderedFluxRechecks: 0, numericAimCalls: 0, numericAcquisitionScans: 0 };
    const slots = this.numericSlotsScratch;
    slots.clear();
    const mountRows = this.numericMountRowsScratch;
    mountRows.length = this.weapons.length;
    const weaponFirst = v.bodies.weaponFirst[own];
    const sysMods = ship.system.readModifierTable?.(weaponControlModifierReaders);
    const hasPolicy = ship.system.hasAutofirePolicy;
    const hasWeaponGate = ship.system.hasPerMountWeaponGate;
    const systemAllowsWeapons = !ship.system.blocksWeapons;
    if (this.numericRequestsScratch.length < v.weaponCount) {
      this.numericRequestsScratch = new Uint8Array(Math.max(v.weaponCount, this.numericRequestsScratch.length * 2, 512));
    }
    const requests = this.numericRequestsScratch;
    // Mount/slot binding and clocks are input publication, never hot target reads.
    for (let i = 0; i < this.weapons.length; i++) {
      const mount = this.weapons[i];
      const row = v.mounts[weaponFirst + i] === mount ? weaponFirst + i : v.mountRowOf.get(mount);
      if (row === undefined) throw new Error('FIRE_QUERY did not publish a firing mount');
      slots.set(mount.slotId, row);
      mountRows[i] = row;
      requests[row] = 0;
      const c = input.weapons[row], rate = this.weaponClockRate(mount, ship, sysMods);
      c.cooldownRate = rate;
      if (rate !== 1) {
        const spec = mount.spec;
        let cycle = spec.isBeam
          ? (spec.beamDuration ?? 0) + (spec.beamBurstDelay ?? 0) + (spec.beamSourceChargeupTime ?? 0) + (spec.beamSourceChargedownTime ?? 0)
          : (spec.burstSize ?? 1) > 50 ? 3
            : Math.max(0, (spec.burstSize ?? 1) - 1) * (spec.burstDelay ?? 0) + spec.refireDelay + (spec.chargeTime ?? 0);
        if (spec.isBeam) { if (!(cycle > 0)) cycle = 3; cycle -= (spec.beamBurstDelay ?? 0) * (1 - 1 / rate); }
        else cycle /= rate;
        c.cycle = cycle;
      }
    }
    const groups = new FireGroups(v, input, this.weaponGroups, this.selectedGroupIndex, slots, own, dt, manualControl, canShipFire, mountRows);
    groups.writebackManual(this.weaponGroups);
    const activeSlotSet = new Set<string>(), fireRequests = new Set<string>(), suspendedAutofire = new Set<string>();
    const automaticStarts = new Map<string, WeaponGroup>();
    const tractorRequests: { mount: WeaponMount; world: FireControlWorld; trigger: boolean }[] = [];
    const budget = world.fireBudget;
    const nativeBudget = !budget || Object.getPrototypeOf(budget) === InFlightFireBudget.prototype
      && budget.estimate === nativeBudgetEstimate && budget.penalty === nativeBudgetPenalty
      && !Object.hasOwn(budget, 'canOmitUncontestedPenalty');
    this.fireProgram.bind(v, input, scope, missileScope, own, !!budget, nativeBudget, coverage,
      budget ? (row, arrival) => budget.penalty(ship, v.ships[row], arrival) : undefined,
      teamScope, missileRows);
    const program = this.fireProgram, w = v.weapons, sample = world.sampledAutofire;
    const root = sample ? ship.assemblyRoot : undefined;
    const sampleShip = sample && dt > 0 && Number.isFinite(dt) && !manualControl && input.autonomous[own]
      && root !== sample.playerShip.assemblyRoot && root!.fireControlMode === 'AI'
      && !sample.fullRateShipIds.has(root!.id) && !sample.fullRateShipIds.has(ship.id)
      && ship.spec.hullSize !== 'FIGHTER';
    for (let mIdx = 0; mIdx < this.weapons.length; mIdx++) {
      const mount = this.weapons[mIdx];
      const row = mountRows[mIdx];
      const c = input.weapons[row], flags = w.flags[row];
      if (groups.active[row]) activeSlotSet.add(mount.slotId);
      mount.triggerHeld = false;
      if (w.disabled[row]) {
        if (c.tractor) releaseGravityTractor(mount, '发射器离线');
        this.autofire.clear(mount);
        mount.burstRemaining = 0; mount.burstFluxReserved = false;
        mount.firingState = 'IDLE'; mount.firingStateTimer = 0;
        coverage.numericMounts++;
        continue;
      }
      program.configureMount(row, dt);
      if (c.tractor) {
        // Builtin force/contact state machine is intentionally not a weapon-shot
        // solver. Preserve its real input/ordered force pass, report it separately.
        const held = mount.gravityTractor;
        const target = input.currentTarget[own];
        program.turn(true, held?.phase === 'HOLD' ? held.contactX : !manualControl && target >= 0 ? v.bodies.x[target] : input.aimX[own],
          held?.phase === 'HOLD' ? held.contactY : !manualControl && target >= 0 ? v.bodies.y[target] : input.aimY[own]);
        mount.currentAngleRad = program.angle; mount.aimIdleSeconds = program.idle;
        const trigger = canShipFire && (manualControl ? !!groups.active[row] && !!input.mainTrigger[own]
          : target >= 0 && v.bodies.fluxPercent[own] < .65);
        tractorRequests.push({ mount, world, trigger }); coverage.specialForceMounts++;
        if (!coverage.unsupportedMechanisms!.includes('gravity-tractor-contact'))
          coverage.unsupportedMechanisms!.push('gravity-tractor-contact');
        continue;
      }
      if (c.deflector) {
        coverage.specialForceMounts++;
        if (!coverage.unsupportedMechanisms!.includes('gravity-deflector-force'))
          coverage.unsupportedMechanisms!.push('gravity-deflector-force');
        continue;
      }
      if (manualControl && groups.active[row]) {
        this.autofire.clear(mount);
        program.turn(true, input.aimX[own], input.aimY[own]);
        mount.currentAngleRad = program.angle; mount.aimIdleSeconds = program.idle;
        if (groups.manualRequest(row)) requests[row] = 1;
        coverage.numericMounts++; continue;
      }
      if (manualControl && !groups.automatic[row]) {
        this.autofire.clear(mount);
        const b = v.bodies, cos = Math.cos(b.facing[own]), sin = Math.sin(b.facing[own]);
        const pivotX = c.relativeX * cos - c.relativeY * sin + b.x[own];
        const pivotY = c.relativeX * sin + c.relativeY * cos + b.y[own];
        const near = Math.abs(signedAngle(Math.atan2(input.aimY[own] - pivotY, input.aimX[own] - pivotX) - w.baseAngle[row]))
          <= (c.arc + 30) * Math.PI / 360;
        program.turn(!!input.player[own] && !(flags & WeaponFlag.HARDPOINT)
          && (near || !!(flags & WeaponFlag.ALWAYS_FIRE)), input.aimX[own], input.aimY[own]);
        mount.currentAngleRad = program.angle; mount.aimIdleSeconds = program.idle;
        coverage.numericMounts++; continue;
      }
      // Exactly one automatic-controller memory read. The target ref is mapped
      // once here and never enters the numerical candidate traversal.
      let memory = this.autofire.fireProgramMemory(ship, mount);
      let kind: FireTargetKind = 0, targetRow = -1;
      // Preserve a lost target's kind even when its row is absent. aim() must
      // advance clocks before invalidating it and waking held cadence intent.
      if (memory.target?.kind === 'SHIP') {
        targetRow = v.rowOf.get(memory.target.entity) ?? -1; kind = 1;
      } else if (memory.target?.kind === 'MISSILE') {
        targetRow = v.projectileRowOf.get(memory.target.entity) ?? -1; kind = 2;
      }
      program.setMemory(memory, kind, targetRow);
      // Do not move dynamic policy callbacks into a global snapshot. They run
      // in the original per-mount positions (admission, aim, suspension, decide).
      const sampleAdmission = sampleShip && !c.missileBody && !(flags & (WeaponFlag.GUIDED | WeaponFlag.MISSILE))
        && (sample!.cadence === 'multirate' || mount.mountType === 'TURRET'
          && (mount.spec.mountSize === 'SMALL' || mount.spec.mountSize === 'MEDIUM'));
      const sampled = sampleAdmission && !(hasPolicy && ship.system.autofirePolicy(mount));
      if ((!sampled && (memory.sampledAim || memory.numericCadence))
        || sampled && memory.sampledAim && memory.sampledAim.cadence !== (sample!.cadence === 'multirate' ? 'multirate' : undefined)) {
        this.autofire.dropAimSample(mount);
        // dropAimSample may delete the previous tracker. Fetching the replacement
        // is a memory-boundary operation, never a target/world query.
        memory = this.autofire.fireProgramMemory(ship, mount);
        const held = memory.target;
        const heldRow = held?.kind === 'SHIP' ? v.rowOf.get(held.entity)
          : held?.kind === 'MISSILE' ? v.projectileRowOf.get(held.entity) : undefined;
        program.setMemory(memory, held?.kind === 'SHIP' ? 1 : held?.kind === 'MISSILE' ? 2 : 0, heldRow ?? -1);
      }
      const tracker = memory;
      let salt = 2166136261;
      if (sampled) {
        const shipId = ship.id, slotId = mount.slotId;
        let cachedSalt = mountSaltCache.get(mount);
        if (!cachedSalt || cachedSalt.shipId !== shipId || cachedSalt.slotId !== slotId) {
          for (let i = 0; i < shipId.length; i++) salt = Math.imul(salt ^ shipId.charCodeAt(i), 16777619);
          salt = Math.imul(salt ^ 47, 16777619);
          for (let i = 0; i < slotId.length; i++) salt = Math.imul(salt ^ slotId.charCodeAt(i), 16777619);
          cachedSalt = { shipId, slotId, salt };
          mountSaltCache.set(mount, cachedSalt);
        } else {
          salt = cachedSalt.salt;
        }
      }
      const policy = hasPolicy ? ship.system.autofirePolicy(mount) : undefined;
      program.aim(policy, sampled ? sample!.cadence === 'multirate' ? 'multirate' : '20hz' : undefined, salt);
      tracker.sampledAim = undefined; tracker.acquisitionCadence = undefined;
      let target = tracker.target;
      if (program.targetKind === 1) {
        const entity = v.ships[program.targetRow];
        if (!target || target.kind !== 'SHIP' || target.entity !== entity) target = { kind: 'SHIP', entity };
      } else if (program.targetKind === 2) {
        const entity = v.projectileRefs[program.targetRow];
        if (!target || target.kind !== 'MISSILE' || target.entity !== entity) target = { kind: 'MISSILE', entity };
      } else {
        target = undefined;
      }
      tracker.target = target;
      mount.fireControlTargetShipId = target?.kind === 'SHIP' ? target.entity.id : undefined;
      mount.fireControlTargetProjectileId = target?.kind === 'MISSILE' ? target.entity.id : undefined;
      const initialReason = policy?.suspended ? 'REASSIGNING' : program.hasTarget() ? 'ALIGNING' : 'NO_TARGET';
      if (mount.fireControl) {
        mount.fireControl.targetId = target?.entity.id;
        mount.fireControl.targetKind = target?.kind;
        mount.fireControl.reason = initialReason;
      } else {
        mount.fireControl = { targetId: target?.entity.id, targetKind: target?.kind, reason: initialReason };
      }
      if (hasPolicy && ship.system.autofirePolicy(mount)?.suspended) {
        suspendedAutofire.add(mount.slotId);
        program.turn(false);
        mount.currentAngleRad = program.angle; mount.aimIdleSeconds = program.idle;
        coverage.numericMounts++; continue;
      }
      // Actual write precedes the final input refresh. The bore check cannot
      // accidentally consume FIRE_QUERY's pre-turn angle or barrel position.
      mount.currentAngleRad = program.turn();
      mount.aimIdleSeconds = program.idle;
      program.refreshBore(mount.currentAngleRad);
      const decidePolicy = hasPolicy ? ship.system.autofirePolicy(mount) : undefined;
      const canWeaponFire = !decidePolicy?.suspended && program.hasTarget() && program.available()
        ? (hasWeaponGate ? ship.system.canFireWeapon(mount) : systemAllowsWeapons) : false;
      let decision = program.decide(canWeaponFire, !!decidePolicy?.suspended);
      if (decision === 'FIRE' && !this.programFluxBudget(ship, mount, dt, sysMods)) decision = 'FLUX_BUDGET';
      mount.fireControl.reason = decision;
      if (decision === 'FIRE' && canShipFire && w.cooldown[row] <= 0) requests[row] = 1;
      coverage.numericMounts++;
    }
    groups.scheduleAutomatic(requests);
    groups.writeback(this.weaponGroups);
    const hasStarts = groups.starts.size > 0;
    for (let i = 0; i < this.weapons.length; i++) {
      const row = mountRows[i];
      if (requests[row]) fireRequests.add(this.weapons[i].slotId);
      if (hasStarts) {
        const group = groups.starts.get(row);
        if (group !== undefined) automaticStarts.set(this.weapons[i].slotId, this.weaponGroups[group]);
      }
    }
    const plan: WeaponFirePlan = { ...state, activeSlotSet, fireRequests, suspendedAutofire, automaticStarts, tractorRequests, numericFire: true };
    numericalFirePlans.add(plan);
    return plan;
  }

  /** Ordered resource boundary, not a second aim/decide. No pre-deduction:
   * every mount sees current flux and its current committed-cycle/ammo state. */
  private programFluxBudget(ship: Ship, mount: WeaponMount, dt: number, sysMods?: Readonly<SystemModifiers>): boolean {
    const spec = mount.spec;
    const active = mount.burstRemaining > 0 || mount.firingState === 'CHARGING' || mount.firingState === 'ACTIVE';
    const cost = spec.isBeam ? (spec.fluxPerSecond ?? 0) * Math.max(dt, !active && spec.beamVisualMode === 'BURST'
      ? (spec.beamSourceChargeupTime ?? 0) + (spec.beamDuration ?? 0) : dt)
      : mount.burstFluxReserved || active ? 0 : spec.fluxPerShot * (spec.interruptibleBurst ? 1 : Math.max(1, spec.burstSize ?? 1));
    const pd = spec.isPointDefense || spec.aiHints?.includes('PD') || spec.aiHints?.includes('PD_ONLY');
    const ceiling = ship.fireControlMode === 'AI' && !pd && !active ? .95 : 1;
    if (!(cost > 0)) return true;
    const fluxMult = sysMods
      ? (spec.weaponType ? sysMods.weapons?.[spec.weaponType]?.fluxCostMultiplier ?? 1 : 1)
      : ship.system.getWeaponFluxCostMultiplier(spec.weaponType);
    return !(ship.flux.totalFlux + cost * fluxMult > ship.flux.maxFlux * ceiling);
  }

  /** Ordered resource/lifecycle submission; intent is consumed exactly once. */
  public commitFire(plan: WeaponFirePlan, spawnProjectile: (p: Projectile) => void, spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec, underHullShipId?: string) => void): void {
    if (plan.owner !== this || plan.serial !== weaponStepSerial.get(this) || consumedPlans.has(plan)) throw new Error('Invalid or already committed fire plan');
    consumedPlans.add(plan);
    // The report flag is NOT a capability. Only this module's real private-stage
    // producer may select the numerical resource boundary for this exact plan.
    const numericPlan = numericalFirePlans.has(plan);
    const { dt, ship, manualControl, canShipFire, activeSlotSet, fireRequests, suspendedAutofire, automaticStarts } = plan;
    if (ship.isDead || ship.isRetreated || ship.hullHp <= 0) return;
    const liveCanShipFire = canShipFire && !ship.flux.isOverloaded && !ship.flux.isVenting && !ship.system.blocksWeapons && !ship.isPhased;
    for (const request of plan.tractorRequests)
      updateGravityTractorInput(dt, ship, request.mount, request.world, request.trigger && liveCanShipFire);
    const hasWeaponGate = ship.system.hasPerMountWeaponGate;
    let sysMods: Readonly<SystemModifiers> | undefined;
    let sysModsRead = false;
    // Keep emission/lifecycle in authored mount order for flux and deterministic replays.
    for (const mount of this.weapons) {
      if (mount.isDisabled) continue;
      if (mount.spec.gravityTractor || mount.spec.gravityDeflector) continue;
      if (fireRequests.has(mount.slotId) && (!manualControl || !activeSlotSet.has(mount.slotId))) {
        if (numericPlan) {
          this.actualFireCoverage.orderedFluxRechecks = (this.actualFireCoverage.orderedFluxRechecks ?? 0) + 1;
          if (!sysModsRead) {
            sysModsRead = true;
            sysMods = ship.system.hasNativeStats ? ship.system.readModifierTable?.(weaponControlModifierReaders) : undefined;
          }
        }
        if (!(numericPlan ? this.programFluxBudget(ship, mount, dt, sysMods) : this.autofire.hasFluxBudget(ship, mount, dt))) {
          fireRequests.delete(mount.slotId);
          if (mount.fireControl) mount.fireControl.reason = 'FLUX_BUDGET';
          else mount.fireControl = { reason: 'FLUX_BUDGET' };
        }
      }
      if (liveCanShipFire && fireRequests.has(mount.slotId) && this.requestWeaponFire(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash)) {
        const group = automaticStarts.get(mount.slotId);
        if (group) {
          group.alternatingIndex = group.weaponSlotIds.indexOf(mount.slotId);
          group.alternatingElapsed = 0;
          group.alternatingWasFiring = true;
          group.alternatingJustSwitched = true;
        }
      }
      // Reassignment holds an in-flight firing cycle, not its cooldown/ammo clock.
      // Only opted-in ordinary PDCs use this path; no new round or refund is emitted.
      const mountCanFire = liveCanShipFire && (hasWeaponGate ? ship.system.canFireWeapon(mount) : true);
      if (suspendedAutofire.has(mount.slotId) && mountCanFire) continue;
      this.advanceWeaponLifecycle(mount.lifecycleDt ?? dt, mount, ship, mountCanFire, spawnProjectile, spawnBeam, spawnMuzzleFlash);
    }
  }

  /** Web automatic groups share the displayed mode, unlike the native independent autofire.
   * Count real usable mounts and measure spacing from successful starts, never idle scans. */
  private chooseAutomaticAlternating(group: WeaponGroup, requests: ReadonlySet<string>, dt: number, ship: Ship): string | undefined {
    const mounts = group.weaponSlotIds.map(id => this.weapons.find(w => w.slotId === id));
    if (!mounts.length) return;
    const index = ((group.alternatingIndex % mounts.length) + mounts.length) % mounts.length;
    const active = mounts[index];
    // A just-spent launcher still contributes its running cycle to the spacing.
    const usable = mounts.filter(m => m && !m.isDisabled && (m.ammo >= 1 || m.cooldownTimer > 0
      || m.burstRemaining > 0 || m.firingState !== 'IDLE'));
    if (group.alternatingWasFiring) {
      group.alternatingElapsed = (group.alternatingElapsed ?? 0) + dt;
      if (active?.spec.isBeam && active.spec.beamVisualMode !== 'BURST') {
        if (requests.has(active.slotId) && active.firingState !== 'IDLE') return active.slotId;
      } else if (active && (group.alternatingElapsed ?? 0) + 1e-9 < this.getAlternatingSlice(active, usable.length, ship)) return;
    }
    for (let offset = group.alternatingWasFiring ? 1 : 0; offset < mounts.length + (group.alternatingWasFiring ? 1 : 0); offset++) {
      const mount = mounts[(index + offset) % mounts.length];
      if (mount && requests.has(mount.slotId) && !mount.isDisabled && mount.ammo >= 1
        && mount.firingState === 'IDLE' && mount.burstRemaining <= 0 && mount.cooldownTimer <= 0
        && !(mount.reloadDelayRemaining! > 0)) return mount.slotId;
    }
  }

  /**
   * 交替射击组的时间片轮换 (1:1 原版 WeaponGroup.advanceAlternating)
   *
   * 原版规则：同一时刻只把"开火指令"发给当前活动挂点，其余挂点一律 advance(false) 禁止击发；
   * 活动权按下述时间片轮换，而不是"谁冷却好了谁打"——因此两门同型炮在交替模式下会
   * 各占半个周期、交替倾泻，而不会像齐射那样同帧齐发。
   *
   *   非光束时间片 = ((burstSize-1)*burstDelay + refireDelay + chargeTime) / 炮数
   *   爆发光束时间片 = (burstDuration + burstCooldown + chargeup + chargedown) / 炮数
   *   持续光束不轮换 (原版只在 isBurstBeam 分支里 selectNextActive)
   *
   * 故障/开火前已无弹的挂点会被跳过；刚打出最后一发的挂点仍完成本次时间片，
   * 避免单发鱼雷组在相邻帧把整组打空。
   */
  private advanceAlternatingActive(group: WeaponGroup, dt: number, ship: Ship): void {
    const slotIds = group.weaponSlotIds;
    if (slotIds.length === 0) return;

    const mountAt = (index: number) => this.weapons.find((w) => w.slotId === slotIds[index]);
    const isFireable = (mount?: WeaponMount) =>
      !!mount && !mount.isDisabled && (!Number.isFinite(mount.ammo) || mount.ammo >= 1);

    const startIndex = ((group.alternatingIndex % slotIds.length) + slotIds.length) % slotIds.length;
    let activeIndex = startIndex;
    let active = mountAt(activeIndex);
    let rotated = false;

    // Empty BEFORE firing can be skipped. Empty BECAUSE the current trigger just
    // launched its last round must finish its slice, or single-shot Reapers drain
    // the whole group one frame apart and look like a linked salvo.
    const finishingSpentCycle = !!active && !active.isDisabled && active.ammo < 1
      && group.alternatingWasFiring && (active.cooldownTimer > 0 || active.burstRemaining > 0 || active.firingState !== 'IDLE');
    if (!isFireable(active) && !finishingSpentCycle) {
      const nextIndex = this.findNextFireableAlternatingIndex(group, startIndex);
      if (nextIndex === undefined) {
        // 整组都不可击发：本帧不开火，指针保持不动 (不空转)
        group.alternatingWasFiring = true;
        group.alternatingJustSwitched = false;
        return;
      }
      activeIndex = nextIndex;
      active = mountAt(activeIndex)!;
      group.alternatingElapsed = 0;
      rotated = true;
    }

    // 持续光束不参与轮换：原版只对爆发光束做 selectNextActive
    const isSustainedBeam = !!active.spec.isBeam && active.spec.beamVisualMode !== 'BURST';
    if (isSustainedBeam) {
      group.alternatingIndex = activeIndex;
      group.alternatingElapsed = 0;
      group.alternatingWasFiring = true;
      group.alternatingJustSwitched = false;
      return;
    }

    const slice = this.getAlternatingSlice(active, slotIds.length, ship);
    const elapsed = (group.alternatingElapsed ?? 0) + dt;
    if (elapsed > slice) {
      const nextIndex = this.findNextFireableAlternatingIndex(group, activeIndex);
      if (nextIndex !== undefined && nextIndex !== activeIndex) {
        activeIndex = nextIndex;
      }
      group.alternatingElapsed = 0;
      rotated = true;
    } else {
      group.alternatingElapsed = elapsed;
    }

    group.alternatingIndex = activeIndex;
    group.alternatingWasFiring = true;
    group.alternatingJustSwitched = rotated;
  }

  /** 从 fromIndex 之后开始找下一个可击发挂点在 weaponSlotIds 中的下标 (跳过故障/无弹)。 */
  private findNextFireableAlternatingIndex(group: WeaponGroup, fromIndex: number): number | undefined {
    const slotIds = group.weaponSlotIds;
    for (let offset = 1; offset <= slotIds.length; offset++) {
      const index = (fromIndex + offset) % slotIds.length;
      const mount = this.weapons.find((w) => w.slotId === slotIds[index]);
      if (mount && !mount.isDisabled && (!Number.isFinite(mount.ammo) || mount.ammo >= 1)) return index;
    }
    return undefined;
  }

  /** 玩家手动换炮 (轻点扳机)：把活动权交给下一门可击发挂点。 */
  private selectNextAlternatingActive(group: WeaponGroup): void {
    const slotIds = group.weaponSlotIds;
    if (slotIds.length === 0) return;
    const current = ((group.alternatingIndex % slotIds.length) + slotIds.length) % slotIds.length;
    const next = this.findNextFireableAlternatingIndex(group, current);
    if (next !== undefined) group.alternatingIndex = next;
    group.alternatingElapsed = 0;
  }

  /** 原版时间片长度：单门炮的完整射击周期除以炮数与实时 RoF 倍率 (包含 source chargeTime)。 */
  private getAlternatingSlice(mount: WeaponMount, weaponCount: number, ship: Ship): number {
    const count = Math.max(1, weaponCount);
    const spec = mount.spec;
    let cycle: number;
    if (spec.isBeam) {
      // burstduration + burstcooldown + chargeup + chargedown，原版缺省 3 秒
      cycle =
        (spec.beamDuration ?? 0) +
        (spec.beamBurstDelay ?? 0) +
        (spec.beamSourceChargeupTime ?? 0) +
        (spec.beamSourceChargedownTime ?? 0);
      if (!(cycle > 0)) cycle = 3.0;
    } else {
      const burstSize = spec.burstSize && Number.isFinite(spec.burstSize) ? spec.burstSize : 1;
      // 原版对超大弹数 (>50) 直接使用 3 秒固定时间片
      cycle =
        burstSize > 50
          ? 3.0
          : Math.max(0, burstSize - 1) * (spec.burstDelay ?? 0) + spec.refireDelay + (spec.chargeTime ?? 0);
    }
    const rate = this.weaponClockRate(mount, ship);
    if (spec.isBeam) cycle -= (spec.beamBurstDelay ?? 0) * (1 - 1 / rate);
    else cycle /= rate;
    return Math.max(1 / 240, cycle / count);
  }

  /** Native projectile controller ship/A/if.java and settings.json minRefireDelay=0.05.
   * Burst beams use RoF only for cooldown; their charge/ACTIVE/chargedown and flux
   * stay on real time (ship/A/oooo_1.java). Continuous beams are not accelerated.
   */
  private weaponClockRate(mount: WeaponMount, ship: Ship, sysMods?: Readonly<SystemModifiers>): number {
    const rofMult = sysMods
      ? (mount.spec.weaponType ? sysMods.weapons?.[mount.spec.weaponType]?.rateOfFireMultiplier ?? 1 : 1)
      : ship.system.getWeaponRateOfFireMultiplier(mount.spec.weaponType);
    const rate = Math.max(.001, rofMult);
    if (mount.spec.isBeam) return mount.spec.beamVisualMode === 'BURST' ? rate : 1;
    if (rate <= 1) return rate;
    const sourceDelay = mount.burstRemaining > 0
      ? mount.spec.burstDelay ?? 0
      : mount.spec.refireDelay + (mount.spec.chargeTime ?? 0);
    return sourceDelay / rate < .05 ? Math.max(1, sourceDelay / .05) : rate;
  }

  private weaponFluxPerShot(mount: WeaponMount, ship: Ship): number {
    return mount.spec.fluxPerShot * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType);
  }

  private requestWeaponFire(
    mount: WeaponMount,
    ship: Ship,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec, underHullShipId?: string) => void
  ): boolean {
    if (mount.spec.gravityTractor || mount.spec.gravityDeflector) return false;
    if ((mount.reloadDelayRemaining ?? 0) > 0 || !ship.system.canFireWeapon(mount)) return false;
    mount.triggerHeld = true;

    if (mount.spec.isBeam) {
      if (mount.firingState !== 'IDLE' || mount.cooldownTimer > 0) return false;
      if (Number.isFinite(mount.ammo) && mount.ammo < 1) return false;
      if (Number.isFinite(mount.ammo)) mount.ammo = Math.max(0, mount.ammo - 1);
      mount.firingCycleId++;
      if (mount.spec.soundIntroKey) sound.play(mount.spec.soundIntroKey, ship.isPlayer ? .85 : .45);
      const chargeup = mount.spec.beamSourceChargeupTime ?? 0;
      if (chargeup > 0) {
        mount.firingState = 'CHARGING';
        mount.firingStateTimer = chargeup;
        mount.glowAlpha = 0;
        if (!mount.spec.beamFireOnlyOnFullCharge) this.emitBeamState(mount, ship, spawnBeam, true, chargeup);
      } else {
        this.activateBeam(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
      }
      return true;
    }

    if (mount.firingState !== 'IDLE' || mount.burstRemaining > 0 || mount.cooldownTimer > 0) return false;
    if (Number.isFinite(mount.ammo) && mount.ammo < 1) return false;
    const cost = this.weaponFluxPerShot(mount, ship) * (mount.spec.interruptibleBurst ? 1 : Math.max(1, mount.spec.burstSize ?? 1));
    if (ship.flux.maxFlux - ship.flux.totalFlux < cost) return false;
    mount.cycleTargetShipId = mount.fireControl ? mount.fireControlTargetShipId : ship.currentTargetShip?.id;
    mount.cycleTargetProjectileId = mount.fireControl ? mount.fireControlTargetProjectileId : undefined;
    mount.firingState = 'CHARGING';
    mount.firingStateTimer = mount.spec.chargeTime ?? 0;

    return true;
  }

  private activateBeam(
    mount: WeaponMount,
    ship: Ship,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec, underHullShipId?: string) => void
  ): void {
    mount.firingState = 'ACTIVE';
    mount.firingStateTimer = mount.spec.beamVisualMode === 'BURST'
      ? Math.max(0.001, mount.spec.beamDuration ?? 0.001)
      : Number.POSITIVE_INFINITY;
    this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
  }

  private emitBeamState(
    mount: WeaponMount,
    ship: Ship,
    spawnBeam: (b: Beam) => void,
    damageActive: boolean,
    duration: number
  ): void {
    const mountOffset = mount.relativePos.clone().rotate(ship.facingRad);
    const firePos = ship.pos.clone().add(mountOffset);
    spawnBeam({
      id: this.random.next(),
      sourceShipId: ship.id,
      slotId: mount.slotId,
      isPlayer: ship.isPlayer, teamId: ship.teamId,
      specId: mount.spec.id,
      startPos: firePos,
      endPos: firePos.clone(),
      // Charging and chargedown share the real ray and brightness-squared damage clock.
      damagePerSec: mount.spec.damagePerSecond * ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(mount.spec.weaponType) * ship.system.getBeamDamageMultiplier(),
      baseDamagePerSec: mount.spec.damagePerSecond,
      empPerSec: mount.spec.empPerSecond,
      baseEmpPerSec: mount.spec.empPerSecond,
      damageType: mount.spec.type,
      color: mount.spec.color,
      duration: Math.max(0.001, duration),
      maxDuration: Math.max(0.001, duration),
      damageActive,
      firingCycleId: mount.firingCycleId,
      width: mount.spec.beamWidth ?? 12,
      visualMode: mount.spec.beamVisualMode,
      beamEffect: mount.spec.beamEffect,
      elapsedTime: 0,
      textureType: mount.spec.textureType,
      textureScrollSpeed: mount.spec.textureScrollSpeed,
      pixelsPerTexel: mount.spec.pixelsPerTexel,
      fringeColor: mount.spec.fringeColor,
      coreColor: mount.spec.coreColor,
      glowColor: mount.spec.glowColor,
      hitGlowRadius: mount.spec.hitGlowRadius,
      hitGlowBrightenDuration: mount.spec.hitGlowBrightenDuration,
      useGlowColorForHitGlow: mount.spec.useGlowColorForHitGlow,
      fringeScrollSpeedMult: mount.spec.fringeScrollSpeedMult,
      coreWidthMult: mount.spec.coreWidthMult,
      darkCore: mount.spec.darkCore,
      darkFringeIter: mount.spec.darkFringeIter,
      darkCoreIter: mount.spec.darkCoreIter
    });
  }

  private enterBeamChargedown(mount: WeaponMount, ship: Ship, spawnBeam: (b: Beam) => void, hadActiveBeam: boolean): void {
    const chargedown = mount.spec.beamSourceChargedownTime ?? 0;
    const level = mount.firingState === 'CHARGING'
      ? Math.max(0, Math.min(1, 1 - mount.firingStateTimer / Math.max(0.001, mount.spec.beamSourceChargeupTime ?? 0))) : 1;
    const remaining = chargedown * level;
    if ((hadActiveBeam || !mount.spec.beamFireOnlyOnFullCharge) && remaining > 0) {
      this.emitBeamState(mount, ship, spawnBeam, true, remaining);
    }
    if (remaining > 0) {
      mount.firingState = 'CHARGEDOWN';
      mount.firingStateTimer = remaining;
    } else {
      mount.firingState = 'IDLE';
      mount.firingStateTimer = 0;
      mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.beamBurstDelay ?? mount.spec.refireDelay);
    }
  }

  private advanceWeaponLifecycle(
    dt: number,
    mount: WeaponMount,
    ship: Ship,
    canShipFire: boolean,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec, underHullShipId?: string) => void
  ): void {
    if (!mount.spec.isBeam && mount.firingState === 'CHARGING') {
      if (!canShipFire || (!mount.triggerHeld && !mount.spec.autoCharge)) {
        mount.firingState = 'IDLE';
        mount.firingStateTimer = 0;
        return;
      }
      mount.firingStateTimer -= dt;
      mount.glowAlpha = 1 - Math.max(0, mount.firingStateTimer) / Math.max(.001, mount.spec.chargeTime ?? 0);
      if (mount.firingStateTimer > 1e-9) return;
      mount.firingState = 'IDLE';
      const count = Math.max(1, Math.floor(mount.spec.burstSize ?? 1));
      if (!mount.spec.interruptibleBurst && count > 1) {
        const cost = this.weaponFluxPerShot(mount, ship) * count;
        if (ship.flux.maxFlux - ship.flux.totalFlux < cost) return;
        ship.flux.increaseFlux(cost, false);
        mount.burstFluxReserved = true; // Native B reserves noninterruptible bursts as a whole.
      }
      if (!this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash)) {
        mount.burstFluxReserved = false;
        return;
      }
      mount.burstRemaining = count - 1;
      if (count > 1) mount.burstTimer = mount.spec.burstDelay ?? 0;
      else mount.cooldownTimer = mount.spec.refireDelay;
      return; // Do not advance a freshly fired burst by this same dt a second time.
    }
    if (!mount.spec.isBeam && mount.burstRemaining > 0) {
      // A burst is not an autonomous entity: overload/venting/phase/system weapon
      // lock interrupts the remaining shots immediately.
      if (!canShipFire || (mount.spec.interruptibleBurst && !mount.triggerHeld)) {
        mount.burstRemaining = 0;
        mount.burstFluxReserved = false;
        mount.burstTimer = 0;
        mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.refireDelay);
        return;
      }

      mount.burstTimer -= dt;
      const delay = Math.max(0.0001, mount.spec.burstDelay ?? 0.0001);
      while (mount.burstRemaining > 0 && mount.burstTimer <= 1e-9) {
        if (!this.fireWeapon(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash)) {
          mount.burstRemaining = 0;
          mount.burstFluxReserved = false;
          mount.burstTimer = 0;
          mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.refireDelay);
          break;
        }
        mount.burstRemaining--;
        if (mount.burstRemaining === 0) mount.burstFluxReserved = false;
        if (mount.burstRemaining > 0) mount.burstTimer += delay;
        else mount.cooldownTimer = mount.spec.refireDelay;
      }
      return;
    }

    if (!mount.spec.isBeam) return;
    if (mount.firingState === 'CHARGING') {
      if ((!mount.triggerHeld && mount.spec.beamVisualMode !== 'BURST') || !canShipFire) {
        this.enterBeamChargedown(mount, ship, spawnBeam, false);
        return;
      }
      if (mount.spec.fluxPerSecond && !ship.flux.trySpendSoftFlux(mount.spec.fluxPerSecond * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType) * dt)) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      mount.firingStateTimer -= dt;
      const chargeup = Math.max(0.001, mount.spec.beamSourceChargeupTime ?? 0.001);
      mount.glowAlpha = Math.max(mount.glowAlpha, 1 - Math.max(0, mount.firingStateTimer) / chargeup);
      if (mount.firingStateTimer <= 0) this.activateBeam(mount, ship, spawnProjectile, spawnBeam, spawnMuzzleFlash);
      return;
    }

    if (mount.firingState === 'ACTIVE') {
      const isBurstBeam = mount.spec.beamVisualMode === 'BURST';
      // 光束射击循环不是独立实体：母舰过载/排散/相位/堡垒护盾锁定会立即打断它
      // (vanilla stoppedFiring() 在 isOverloadedOrVenting 时直接销毁光束)，
      // 否则速子长矛这类爆发光束会在母舰过载期间继续倾泻伤害。
      if (!canShipFire) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      if (!isBurstBeam && !mount.triggerHeld) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      if (mount.spec.fluxPerSecond && !ship.flux.trySpendSoftFlux(mount.spec.fluxPerSecond * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType) * dt)) {
        this.enterBeamChargedown(mount, ship, spawnBeam, true);
        return;
      }
      if (isBurstBeam) {
        mount.firingStateTimer -= dt;
        if (mount.firingStateTimer <= 0) this.enterBeamChargedown(mount, ship, spawnBeam, true);
      }
      return;
    }

    if (mount.firingState === 'CHARGEDOWN') {
      mount.firingStateTimer -= dt;
      const chargedown = Math.max(0.001, mount.spec.beamSourceChargedownTime ?? 0.001);
      mount.glowAlpha = Math.min(mount.glowAlpha, Math.max(0, mount.firingStateTimer) / chargedown);
      if (mount.firingStateTimer <= 0) {
        mount.firingState = 'IDLE';
        mount.firingStateTimer = 0;
        mount.cooldownTimer = Math.max(mount.cooldownTimer, mount.spec.beamBurstDelay ?? mount.spec.refireDelay);
      }
    }
  }

  public fireWeapon(
    mount: WeaponMount,
    ship: Ship,
    spawnProjectile: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnMuzzleFlash?: (pos: Vector2, angleRad: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, shipVel?: Vector2, launcherSmokeSpec?: LauncherSmokeSpec, underHullShipId?: string) => void
  ): boolean {
    if (mount.spec.gravityTractor || mount.spec.gravityDeflector) return false;
    if ((mount.reloadDelayRemaining ?? 0) > 0 || !ship.system.canFireWeapon(mount)) return false;
    // 开火必须校验剩余幅能容量 (vanilla com/fs/starfarer/combat/entities/ship/A/if.java:346
    // startedChargeup(): `getFluxAvailable() >= getFluxCostToFire()`，与弹药、过载/排散判定并列)。
    // 幅能不足时严禁产生任何副作用：不扣弹药、不产生后坐力/散布增长/枪口火焰/音效，也不生成弹丸。
    // 光束不受此限：其幅能按充能和 ACTIVE 时长以 fluxPerSecond 连续累积。
    if (
      !mount.spec.isBeam && !mount.burstFluxReserved &&
      mount.spec.fluxPerShot > 0 &&
      ship.flux.maxFlux - ship.flux.totalFlux < this.weaponFluxPerShot(mount, ship)
    ) {
      return false;
    }

    // 非光束有限弹药按“实际发射一发”扣除；无弹时不得产生任何发射副作用。
    if (!mount.spec.isBeam && Number.isFinite(mount.ammo)) {
      if (mount.ammo < 1) return false;
      mount.ammo = Math.max(0, mount.ammo - 1);
    }

    // 触发动态视觉后坐力与充能发光
    mount.recoil = 1.0;
    mount.glowAlpha = 1.0;

    // 累积散布与计算实际开火偏角 (严格对齐 weapon_data.csv: min/max spread, spread/shot)
    const minSpr = mount.spec.minSpread || 0;
    const maxSpr = Math.max(minSpr, (mount.spec.maxSpread || minSpr) * ship.system.getRecoilMultiplier());
    const sprPerShot = (mount.spec.spreadPerShot || 0) * ship.system.getRecoilMultiplier();
    mount.currentSpreadDeg = Math.min(maxSpr, mount.currentSpreadDeg + sprPerShot);
    const spreadRad = ((this.random.next() - 0.5) * mount.currentSpreadDeg * Math.PI) / 180;
    const fireAngleRad = mount.currentAngleRad + spreadRad;

    // 多管武器交替射击管位切换与枪口世界坐标偏移 (1:1 官方 Starsector 炮管偏移算法)
    let barrelOffsetWorld = new Vector2(0, 0);
    const isHardpoint = mount.mountType === 'HARDPOINT';
    const offsets = isHardpoint
      ? (mount.spec.hardpointOffsets && mount.spec.hardpointOffsets.length >= 2 ? mount.spec.hardpointOffsets : mount.spec.turretOffsets)
      : (mount.spec.turretOffsets && mount.spec.turretOffsets.length >= 2 ? mount.spec.turretOffsets : mount.spec.hardpointOffsets);

    let offX = 0;
    let offY = 0;
    if (offsets && offsets.length >= 2) {
      const barrelCount = Math.floor(offsets.length / 2);
      const bIdx = mount.barrelIndex % barrelCount;
      clearGlorianaTorpedoRail(mount, bIdx);
      offX = offsets[bIdx * 2];
      offY = offsets[bIdx * 2 + 1];
      barrelOffsetWorld = new Vector2(offX, offY).rotate(mount.currentAngleRad);
      mount.barrelIndex = (mount.barrelIndex + 1) % barrelCount;
    }

    // 挂点世界绝对坐标 (加上炮管偏移)
    const rotatedOffset = mount.relativePos.clone().rotate(ship.facingRad);
    const firePos = ship.pos.clone().add(rotatedOffset).add(barrelOffsetWorld);

    // 实体弹药按发射次数产生幅能；光束按充能和 ACTIVE 时间连续产生 source energy/second 幅能。
    if (!mount.spec.isBeam && !mount.burstFluxReserved && mount.spec.fluxPerShot > 0) ship.flux.increaseFlux(this.weaponFluxPerShot(mount, ship), false);

    // 播放官方真实音效
    if (mount.spec.soundKey && !mount.spec.soundLoopKey && !mount.spec.soundIntroKey) {
      sound.play(mount.spec.soundKey, ship.isPlayer ? 0.85 : 0.45);
    }

    // 激发枪口火焰 (1:1 官方原版粒子暴风 _class.o00000 & SmoothParticle.java)
    if (spawnMuzzleFlash) {
      const underHullShipId = ship.spec.weaponSlots.find(slot => slot.slotId === mount.slotId)?.renderLayer === 'BELOW_HULL' ? ship.id : undefined;
      if (mount.spec.launcherSmokeSpec) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          [mount.spec.launcherSmokeSpec.particleColor[0], mount.spec.launcherSmokeSpec.particleColor[1], mount.spec.launcherSmokeSpec.particleColor[2]],
          undefined,
          ship.vel,
          mount.spec.launcherSmokeSpec,
          underHullShipId
        );
      } else if (mount.spec.muzzleFlashSpec) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          [mount.spec.muzzleFlashSpec.particleColor[0], mount.spec.muzzleFlashSpec.particleColor[1], mount.spec.muzzleFlashSpec.particleColor[2]],
          mount.spec.muzzleFlashSpec,
          ship.vel,
          undefined,
          underHullShipId
        );
      } else if (mount.spec.muzzleFlashColor && !mount.spec.isBeam) {
        spawnMuzzleFlash(
          firePos,
          fireAngleRad,
          mount.spec.muzzleFlashSize || 25,
          mount.spec.muzzleFlashColor,
          undefined, undefined, undefined, underHullShipId
        );
      }
    }

    const effectiveRange = combatWeaponRange(ship, mount.spec);

    if (mount.spec.isBeam) {
      // 每个 beam firing cycle 只创建一个实体；持续光束由挂点 ACTIVE 状态维持。
      // A new ray starts at zero length; the handler grows its collision front.
      const endPos = firePos.clone();
      const beamDuration = mount.spec.beamVisualMode === 'SUSTAINED'
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0.001, mount.spec.beamDuration ?? 0.001);
      mount.glowAlpha = 1.0;
      const barrelOffset = { x: offX, y: offY };
      knownProjectionKeys.set(barrelOffset, barrelOffsetProjectionKeys);
      const beam: Beam = {
        id: this.random.next(),
        sourceShipId: ship.id,
        slotId: mount.slotId,
        isPlayer: ship.isPlayer, teamId: ship.teamId,
        specId: mount.spec.id,
        startPos: firePos,
        endPos: endPos,
        barrelOffset,
        // 武器输出伤害按母舰战备值修正 (CRPluginImpl.getDamageChangePercent)
        damagePerSec: mount.spec.damagePerSecond * ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(mount.spec.weaponType) * ship.system.getBeamDamageMultiplier(),
        baseDamagePerSec: mount.spec.damagePerSecond,
        empPerSec: mount.spec.empPerSecond,
        baseEmpPerSec: mount.spec.empPerSecond,
        damageType: mount.spec.type,
        color: mount.spec.color,
        duration: beamDuration,
        maxDuration: beamDuration,
        damageActive: true,
        firingCycleId: mount.firingCycleId,
        hasRecordedHit: false,
        width: mount.spec.beamWidth ?? 12,
        visualMode: mount.spec.beamVisualMode,
        beamEffect: mount.spec.beamEffect,
        elapsedTime: 0,
        textureType: mount.spec.textureType,
        textureScrollSpeed: mount.spec.textureScrollSpeed,
        pixelsPerTexel: mount.spec.pixelsPerTexel,
        fringeColor: mount.spec.fringeColor,
        coreColor: mount.spec.coreColor,
        glowColor: mount.spec.glowColor,
        hitGlowRadius: mount.spec.hitGlowRadius,
        hitGlowBrightenDuration: mount.spec.hitGlowBrightenDuration,
        useGlowColorForHitGlow: mount.spec.useGlowColorForHitGlow,
        fringeScrollSpeedMult: mount.spec.fringeScrollSpeedMult,
        coreWidthMult: mount.spec.coreWidthMult,
        darkCore: mount.spec.darkCore,
        darkFringeIter: mount.spec.darkFringeIter,
        darkCoreIter: mount.spec.darkCoreIter,
        isHitting: undefined,
        brightness: undefined,
        rayEndPrevFrame: undefined,
        elapsedSinceDamage: undefined,
        accumulatedBrightness: undefined,
        dpsDuration: undefined,
        damageMultiplier: undefined,
        hitGlowBrightness: undefined,
        hitGlowSizeMult: undefined,
        wasShortened: undefined,
        scaleGlowBasedOnDamageEffectiveness: undefined,
        contactSurface: undefined,
        contactFxCooldown: undefined,
        contactSoundCooldown: undefined,
      };
      if ((!mount.spec.beamEffect || nativePresentationEffects.has(mount.spec.beamEffect))
        && (!mount.spec.everyFrameEffect || nativePresentationEffects.has(mount.spec.everyFrameEffect))) {
        beamProjectionKeys ??= Object.keys(beam);
        knownProjectionKeys.set(beam, beamProjectionKeys);
      }
      spawnBeam(beam);
    } else {
      // 实体弹药使用弹速；导弹则严格区分发射初速与发动机额定极速。
      const isRocket = !!(mount.spec.isRocket || mount.spec.spawnType === 'MISSILE');
      const isMissileLike = !!(isRocket || mount.spec.isGuided || mount.spec.flightTime !== undefined || mount.spec.missileHp);
      const baseProjSpeed = isRocket ? mount.spec.projSpeed : combatProjectileSpeed(ship, mount.spec);
      const projectileLaunchSpeed = isRocket
        ? (mount.spec.launchSpeed ?? mount.spec.projSpeed)
        : baseProjSpeed;
      const projVel = Vector2.fromAngle(fireAngleRad, projectileLaunchSpeed).add(ship.vel);
      const barrelOffset = { x: offX, y: offY };
      knownProjectionKeys.set(barrelOffset, barrelOffsetProjectionKeys);
      const sourceDamageMultiplier = ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(mount.spec.weaponType);
      const projectile: Projectile = isMissileLike ? {
        id: this.random.next(),
        sourceShipId: ship.id,
        slotId: mount.slotId,
        isPlayer: ship.isPlayer, teamId: ship.teamId,
        specId: mount.spec.id,
        pos: firePos.clone(),
        prevPos: firePos.clone(),
        ballisticTail: mount.spec.spawnType === 'BALLISTIC' ? firePos.clone() : undefined,
        prevBallisticTail: mount.spec.spawnType === 'BALLISTIC' ? firePos.clone() : undefined,
        vel: projVel,
        baseDamage: mount.spec.damagePerShot,
        sourceDamageMultiplier,
        sourceWeaponType: mount.spec.weaponType,
        gravityCoupling: mount.spec.gravityCoupling,
        spawnLocation: firePos.clone(),
        empDamage: mount.spec.empPerShot ?? 0,
        damage: mount.spec.damagePerShot * sourceDamageMultiplier,
        damageType: mount.spec.type,
        onHitEffect: mount.spec.onHitEffect,
        passThroughMissiles: mount.spec.passThroughMissiles,
        passThroughFighters: mount.spec.passThroughFighters,
        passThroughFightersOnlyWhenDestroyed: mount.spec.passThroughFightersOnlyWhenDestroyed,
        radius: mount.spec.projRadius,
        rangeRemaining: effectiveRange,
        totalRange: effectiveRange,
        elapsedTime: 0,
        color: mount.spec.color,
        spawnType: mount.spec.spawnType,
        renderTargetIndicator: mount.spec.renderTargetIndicator,
        visualSpawnType: mount.spec.visualSpawnType,
        textureType: mount.spec.textureType,
        textureScrollSpeed: mount.spec.textureScrollSpeed,
        fadeTime: mount.spec.fadeTime,
        pixelsPerTexel: mount.spec.pixelsPerTexel,
        fringeColor: mount.spec.fringeColor,
        coreColor: mount.spec.coreColor,
        glowColor: mount.spec.glowColor,
        hitGlowRadius: mount.spec.hitGlowRadius,
        glowRadius: mount.spec.glowRadius,
        coreWidthMult: mount.spec.coreWidthMult,
        movingRayMoveSpeed: mount.spec.spawnType === 'BALLISTIC_AS_BEAM' ? baseProjSpeed : undefined,
        projSpriteUrl: mount.spec.projSpriteUrl,
        projLength: mount.spec.projLength,
        projWidth: mount.spec.projWidth,
        barrelOffset,
        isRocket,
        isGuided: mount.spec.isGuided,
        eccmChance: mount.spec.eccmChanceBonus,
        guidanceBonus: mount.spec.missileGuidanceBonus,
        targetShipId: mount.cycleTargetShipId,
        targetProjectileId: mount.cycleTargetProjectileId,
        facingRad: fireAngleRad,
        flightTimeRemaining: mount.spec.flightTime === undefined ? undefined : mount.spec.flightTime * (1 - ship.ecmRangePenalty / 100),
        maxFlightTime: mount.spec.flightTime === undefined ? undefined : mount.spec.flightTime * (1 - ship.ecmRangePenalty / 100),
        missileLifecycleSpec: mount.spec.missileLifecycleSpec,
        armingTimeRemaining: mount.spec.armingTime,
        turnVelocityRad: 0,
        engineAcceleration: mount.spec.engineAcceleration,
        missileDeceleration: mount.spec.missileDeceleration,
        maxSpeed: mount.spec.maxSpeed ?? (isRocket ? mount.spec.projSpeed : undefined),
        maxTurnRate: mount.spec.maxTurnRate,
        maxTurnAcceleration: mount.spec.maxTurnAcceleration,
        engineFlameColor: mount.spec.engineFlameColor,
        missileEngineVisualSpec: mount.spec.missileEngineVisualSpec,
        missileTrailSpec: mount.spec.missileTrailSpec,
        missileExplosionVisualSpec: mount.spec.missileExplosionVisualSpec,
        projectileExplosionSpec: mount.spec.projectileExplosionSpec,
        isTwoStage: mount.spec.isTwoStage,
        mirv: mount.spec.mirv,
        proximityFuse: mount.spec.proximityFuse,
        hitpoints: mount.spec.missileHp || (isRocket ? 100 : undefined),
        maxHitpoints: mount.spec.missileHp || (isRocket ? 100 : undefined),
        didDamage: false,
        softFlux: false,
        stageTriggered: undefined,
        mirvSplitDistance: undefined,
        sourceMoveSpeed: undefined,
        sourceVelocity: undefined,
        fadeProgress: undefined,
        prevFadeProgress: undefined,
        unfadedDamage: undefined,
        unfadedEmp: undefined,
        armedWhileFizzling: undefined,
        missileRangeOrigin: undefined,
        missileFizzleTime: undefined,
        isDisarmed: undefined,
        collisionDisabled: undefined,
        damagedTargetIds: undefined,
        voidShieldBlockedRoot: undefined,
        voidShieldHitRecorded: undefined,
        gravityOriginalSourceShipId: undefined,
        gravityCapturedBy: undefined,
        gravityWellBinding: undefined,
        gravityDeflected: undefined,
      } : {
        id: this.random.next(),
        sourceShipId: ship.id,
        slotId: mount.slotId,
        isPlayer: ship.isPlayer, teamId: ship.teamId,
        specId: mount.spec.id,
        pos: firePos.clone(),
        prevPos: firePos.clone(),
        ballisticTail: mount.spec.spawnType === 'BALLISTIC' ? firePos.clone() : undefined,
        prevBallisticTail: mount.spec.spawnType === 'BALLISTIC' ? firePos.clone() : undefined,
        vel: projVel,
        baseDamage: mount.spec.damagePerShot,
        sourceDamageMultiplier,
        sourceWeaponType: mount.spec.weaponType,
        gravityCoupling: mount.spec.gravityCoupling,
        spawnLocation: firePos.clone(),
        empDamage: mount.spec.empPerShot ?? 0,
        damage: mount.spec.damagePerShot * sourceDamageMultiplier,
        damageType: mount.spec.type,
        onHitEffect: mount.spec.onHitEffect,
        passThroughMissiles: mount.spec.passThroughMissiles,
        passThroughFighters: mount.spec.passThroughFighters,
        passThroughFightersOnlyWhenDestroyed: mount.spec.passThroughFightersOnlyWhenDestroyed,
        radius: mount.spec.projRadius,
        rangeRemaining: effectiveRange,
        totalRange: effectiveRange,
        elapsedTime: 0,
        color: mount.spec.color,
        spawnType: mount.spec.spawnType,
        renderTargetIndicator: mount.spec.renderTargetIndicator,
        visualSpawnType: mount.spec.visualSpawnType,
        textureType: mount.spec.textureType,
        textureScrollSpeed: mount.spec.textureScrollSpeed,
        fadeTime: mount.spec.fadeTime,
        pixelsPerTexel: mount.spec.pixelsPerTexel,
        fringeColor: mount.spec.fringeColor,
        coreColor: mount.spec.coreColor,
        glowColor: mount.spec.glowColor,
        hitGlowRadius: mount.spec.hitGlowRadius,
        glowRadius: mount.spec.glowRadius,
        coreWidthMult: mount.spec.coreWidthMult,
        movingRayMoveSpeed: mount.spec.spawnType === 'BALLISTIC_AS_BEAM' ? baseProjSpeed : undefined,
        projSpriteUrl: mount.spec.projSpriteUrl,
        projLength: mount.spec.projLength,
        projWidth: mount.spec.projWidth,
        barrelOffset,
        isRocket: false,
        targetShipId: mount.cycleTargetShipId,
        facingRad: fireAngleRad,
        projectileExplosionSpec: mount.spec.projectileExplosionSpec,
        proximityFuse: mount.spec.proximityFuse,
        didDamage: false,
        softFlux: false,
        sourceMoveSpeed: undefined,
        sourceVelocity: undefined,
        fadeProgress: undefined,
        prevFadeProgress: undefined,
        unfadedDamage: undefined,
        unfadedEmp: undefined,
        isDisarmed: undefined,
        collisionDisabled: undefined,
        damagedTargetIds: undefined,
        voidShieldBlockedRoot: undefined,
        voidShieldHitRecorded: undefined,
        gravityOriginalSourceShipId: undefined,
        gravityCapturedBy: undefined,
        gravityWellBinding: undefined,
        gravityDeflected: undefined,
      };
      initializeSourceProjectile(projectile, isRocket ? combatProjectileSpeed(ship, mount.spec) : baseProjSpeed, ship.vel);
      initializeSourceMissile(projectile, this.random);
      if ((!mount.spec.onHitEffect || nativePresentationEffects.has(mount.spec.onHitEffect))
        && (!mount.spec.everyFrameEffect || nativePresentationEffects.has(mount.spec.everyFrameEffect))) {
        const projKeys = isMissileLike
          ? (missileProjectileKeys ??= Object.keys(projectile))
          : (ballisticProjectileKeys ??= Object.keys(projectile));
        knownProjectionKeys.set(projectile, projKeys);
      }
      spawnProjectile(bindProjectileSource(projectile, ship));
      // A successful shot, not a trigger/charge animation, owns physical recoil.
      // The projectile and muzzle effects already inherited the pre-shot velocity.
      const recoilSpeed = mount.spec.fireRecoilSpeed ?? 0;
      if (Number.isFinite(recoilSpeed) && recoilSpeed > 0) {
        const dx = -Math.cos(fireAngleRad) * recoilSpeed, dy = -Math.sin(fireAngleRad) * recoilSpeed;
        ship.vel.x += dx; ship.vel.y += dy;
        for (const mod of installedHullMods(ship.spec)) mod.onWeaponRecoil?.(ship, mount, dx, dy);
      }
    }
    return true;
  }
}

const nativePlanFire=ShipWeaponControlSystem.prototype.planFire;
const nativeNumericPlanFire = ShipWeaponControlSystem.prototype['planNumericFire'];
const nativeProgramFluxBudget = ShipWeaponControlSystem.prototype['programFluxBudget'];
const nativeBudgetEstimate = InFlightFireBudget.prototype.estimate;
const nativeBudgetPenalty = InFlightFireBudget.prototype.penalty;
const nativeBudgetNeedsDetailed = InFlightFireBudget.prototype.needsDetailedPenalty;

export interface FireDomainCoverage {
  readonly plan: Readonly<FireCoverage>;
  readonly legacyCalls: Readonly<{ aim: number; preAim: number; decide: number; hasFluxBudget: number; sampledAim: number; decideSampled: number }>;
}
/** D's acceptance boundary: read before/after step; no UI/table/sampling switch. */
export function readFireDomainCoverage(control: ShipWeaponControlSystem): FireDomainCoverage {
  return control.getFireDomainCoverage();
}
