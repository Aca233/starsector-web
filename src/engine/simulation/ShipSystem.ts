import { hasExactThreatPhaseAI, hasNativeThreatPhaseAI, hasNativeSystemStats, resolveSystemId, shipSystemDefinitions } from '../extensions/ship-systems/Registry';
import type { SystemWorld, ShipSystemDefinition, SystemWeaponType, SystemModifiers } from '../extensions/ship-systems/Types';
import type { Ship } from './Ship';
import type { Vector2 } from '../math/Vector2';
import { combineSystemModifiers, emptySystemModifiers } from '../extensions/ship-systems/Modifiers';
import { OwnedNativeSystemModifiers } from './OwnedNativeSystemModifiers';

const ownedModifierSystems = new WeakSet<ShipSystem>();

/** Content references registered IDs; extending systems never requires widening an enum. */
export type ShipSystemType = string;
export type ShipSystemState = 'IDLE' | 'IN' | 'ACTIVE' | 'OUT' | 'COOLDOWN';

/** Shared lifecycle only. Timing, effects, AI, presentation and controls belong to definitions. */
export class ShipSystem {
  private static readonly nativeModifierReader = ShipSystem.prototype.modifiers;
  private static readonly nativeRangeReader = ShipSystem.prototype.getWeaponRangePercent;
  private static readonly nativeProjectileSpeedReader = ShipSystem.prototype.getProjectileSpeedPercent;
  /** Internal opt-in for a runtime that never exports mutable Ship/System objects.
   * Install once, without adding a branch/cache lookup to legacy stat queries. */
  public enableOwnedNativeModifiers(): boolean {
    // Parent-system hooks depend on live attachment/activation input, not this slot's lifecycle.
    if (this.owner?.parentShip?.allSystems.some(system => system.definition.moduleModifiers)) return false;
    if (ownedModifierSystems.has(this)) return true;
    if (Object.getPrototypeOf(this) !== ShipSystem.prototype) return false;
    const reader = OwnedNativeSystemModifiers.create(this.definition);
    if (!reader) return false;
    // Non-enumerable: derived cache/closures never enter snapshots or projections.
    // Only own modifiers are memoized; preserve the original live, ordered fold.
    Object.defineProperty(this, 'modifiers', { value: (capacity = this.baseFluxCapacity) => {
      const own = reader.read(this, capacity);
      const composed = this.auxiliary?.available ? combineSystemModifiers(own, this.auxiliary.modifiers(capacity)) : own;
      return this.owner?.system === this && !this.owner.runtimeModifiers.empty ? combineSystemModifiers(composed, this.owner.runtimeModifiers.value) : composed;
    } });
    ownedModifierSystems.add(this);
    return true;
  }
  public readonly definition: ShipSystemDefinition;
  /** Compatibility composition chain (other tactical slots, then defense); never advances siblings. */
  public auxiliary?: ShipSystem;
  public activationTarget?: Ship;
  /** Immutable command-edge inputs; live weapon aim may keep moving during IN. */
  public activationInput?: { point: Vector2; origin: Vector2; velocity: Vector2; facing: number; target: Ship | null; gravityAnchorSerial?: number };
  /** Accepted teleport plan / successful departure for presentation and LAN snapshots.
   * Independent of current aim and command-edge origin; never drives collision/motion. */
  public teleportVisual?: {
    serial: number; destination: Vector2; destinationFacing: number;
    origin?: Vector2; originFacing?: number;
  };
  declare public gravityPolarity?: 1 | -1;
  declare public gravityPush?: import('./GravityPushState').GravityPushState;
  public gravityControlHeld = false;
  declare public gravityField?: import('./GravityFieldState').GravityFieldState;
  declare public gravityManeuver?: import('./GravityManeuverState').GravityManeuverState;
  public activationSerial = 0;
  public state: ShipSystemState = 'IDLE';
  public effectLevel = 0;
  private lifecycleActive = false;
  /** Weapon systems may still be firing after their independent charge tracker cools down. */
  public get isActive(): boolean { return this.lifecycleActive || !!this.definition.isExecuting?.(this); }
  public set isActive(value: boolean) { this.lifecycleActive = value; }
  public isCoolingDown = false;
  public activeTimer = 0;
  public cooldownTimer = 0;
  public maxDuration: number;
  public maxCooldown: number;
  public chargeUpDuration: number;
  public activeDuration: number;
  public chargeDownDuration: number;
  public maxCharges: number;
  public charges: number;
  public chargeRegenRate: number;
  public disabled = false;
  public fluxCostPerUse: number;
  public generatesHardFlux: boolean;
  private pendingActivationFlux = 0;
  private pendingActiveEvents = 0;
  private pendingActivationEvents = 0;
  private chargeRegenTimer = 0;
  private stageTimer = 0;
  private outEntryEffectLevel = 0;

  constructor(public readonly type: ShipSystemType = 'NONE', private readonly baseFluxCapacity = 0, public readonly owner?: Ship) {
    this.type = resolveSystemId(type);
    const d = this.definition = shipSystemDefinitions.require(this.type);
    this.chargeUpDuration = d.chargeUp;
    this.activeDuration = d.active;
    this.chargeDownDuration = d.chargeDown;
    this.maxCooldown = d.cooldown;
    this.maxDuration = Number.isFinite(d.active) && d.active > 0 ? d.active : d.chargeUp + d.chargeDown;
    this.maxCharges = this.charges = d.charges ?? 1;
    this.chargeRegenRate = d.chargeRegen ?? 0;
    this.fluxCostPerUse = (d.fluxPerUseFlat ?? 0) + (d.fluxPerUseFraction ?? 0) * Math.max(0, baseFluxCapacity) + (d.fluxPerUseDissipationFraction ?? 0) * (owner?.hullStats.fluxDissipation ?? 0);
    this.generatesHardFlux = d.hardFlux ?? false;
    if (owner) {
      d.initialize?.(this, owner);
      if (!d.unavailable && this.type !== "NONE") {
        const stats = owner.hullStats;
        if (d.charges !== undefined) this.maxCharges = this.charges = this.maxCharges + stats.systemUsesBonus;
        this.chargeRegenRate *= stats.systemRegenMultiplier;
        this.maxCooldown *= stats.systemCooldownMultiplier;
        this.fluxCostPerUse *= stats.systemFluxCostMultiplier;
      }
    }
    if (d.initialCharges !== undefined) this.charges = Math.min(this.maxCharges, d.initialCharges);
  }
  public get name(): string { return this.definition.name; }
  public get statusText(): string | undefined { return this.definition.statusText?.(this); }
  public autofirePolicy(mount: import('./Weapon').WeaponMount): import('../extensions/ship-systems/Types').SystemAutofirePolicy | undefined {
    return (this.available && !this.disabled ? this.definition.autofirePolicy?.(this, mount) : undefined) ?? this.auxiliary?.autofirePolicy(mount);
  }
  public get passiveStatusText(): string | undefined { return this.definition.passiveStatusText?.(this); }
  /** Availability is implementation readiness, not current cooldown/CR/charge readiness. */
  public get available(): boolean { return this.type !== 'NONE' && !this.definition.unavailable; }
  public get description(): string { return this.definition.description ?? ''; }
  /** Native jets leave acceleration modifiers at their last applied strength during OUT. */
  public get retainedEffectLevel(): number { return this.state === 'OUT' ? this.outEntryEffectLevel : this.effectLevel; }
  /** Teleport phase immunity does not imply the phase cloak's 3x subjective clock. */
  public get isPhased(): boolean {
    if (!this.available || !this.isActive || !this.definition.phase) return false;
    if (this.state === 'IN') return !this.definition.phase.vulnerableChargeUp;
    if (this.state === 'OUT') return !this.definition.phase.vulnerableChargeDown;
    return this.state === 'ACTIVE';
  }
  private get controlsActive(): boolean { return this.isActive && !(this.state === 'OUT' && this.definition.controls?.releaseOnOut); }
  public get blocksFluxDissipation(): boolean { return (this.controlsActive && !!this.definition.controls?.blockFluxDissipation) || !!this.auxiliary?.blocksFluxDissipation; }
  public get blocksAcceleration(): boolean { return (this.owner?.runtimeModifiers.value.disableMotion ?? 0) > 0 || (this.available && !!this.definition.motionControl?.(this).blockAcceleration) || (this.controlsActive && !!this.definition.controls?.blockAcceleration) || !!this.auxiliary?.blocksAcceleration; }
  public get forcesBraking(): boolean { return (this.available && !!this.definition.motionControl?.(this).forceBrake) || !!this.auxiliary?.forcesBraking; }
  public get blocksStrafing(): boolean { return (this.owner?.runtimeModifiers.value.disableMotion ?? 0) > 0 || (this.controlsActive && !!this.definition.controls?.blockStrafing) || !!this.auxiliary?.blocksStrafing; }
  public get forcesAutofire(): boolean { return (this.controlsActive && !!this.definition.controls?.forceAutofire) || !!this.auxiliary?.forcesAutofire; }
  public get tacticalMode(): ShipSystemDefinition['tacticalMode'] { return (this.isActive ? this.definition.tacticalMode : undefined) ?? this.auxiliary?.tacticalMode; }
  public get blocksWeapons(): boolean { return (this.owner?.runtimeModifiers.value.disableWeapons ?? 0) > 0 || (this.controlsActive && !!this.definition.controls?.blockWeapons) || !!this.auxiliary?.blocksWeapons; }
  public get blocksShields(): boolean { return (this.available && !this.disabled && this.definition.defenseEnabled?.(this) === false) || (this.owner?.runtimeModifiers.value.disableDefense ?? 0) > 0 || (this.controlsActive && !!this.definition.controls?.blockShields) || !!this.auxiliary?.blocksShields; }
  public get locksTurning(): boolean { return (this.owner?.runtimeModifiers.value.disableMotion ?? 0) > 0 || (this.controlsActive && !!this.definition.controls?.lockTurning) || !!this.auxiliary?.locksTurning; }
  public get forcesForward(): boolean { return (this.controlsActive && !!this.definition.controls?.forceForward) || !!this.auxiliary?.forcesForward; }
  public get engineVisualLevel(): number { return Math.max(this.definition.visuals?.engineBoost ? this.effectLevel : 0, this.auxiliary?.engineVisualLevel ?? 0); }
  public get fortressVisualLevel(): number { return Math.max(this.definition.visuals?.fortressShield ? this.effectLevel : 0, this.auxiliary?.fortressVisualLevel ?? 0); }

  /** Only natural expiry; explicit deactivate()/interruption never detonates. */
  public expire(): void {
    const spec=this.definition.gravityAutoCollapse,field=this.gravityField,ship=this.owner;
    if(spec&&this.state==='ACTIVE'&&field?.kind==='WELL'&&ship&&!ship.isDead&&ship.hullHp>0&&!ship.isDocked&&!ship.isRetreated&&!ship.retreating&&!ship.isPhased&&!ship.isAttachedModule
      &&!this.disabled&&(ship.runtimeModifiers.value.disableSystems??0)<=0&&!ship.flux.isVenting&&!ship.flux.isOverloaded
      &&Math.hypot(ship.pos.x-field.x,ship.pos.y-field.y)<=this.definition.gravityField!.placementRange
      &&ship.flux.totalFlux+this.pendingActivationFlux+spec.fluxCost<=ship.flux.maxFlux){
      ship.flux.increaseFlux(spec.fluxCost,false);
      this.gravityControlHeld=false;this.activationSerial++;
      this.gravityField={kind:'COLLAPSE',serial:this.activationSerial,x:field.x,y:field.y,age:0,duration:spec.active,radius:this.definition.gravityCollapse!.radius,
        shipBudgetRemaining:0,projectileBudgetRemaining:0,shipHits:[],projectileHits:[],collapseApplied:false};
      this.state='IN';this.isActive=true;this.effectLevel=0;this.stageTimer=this.activeTimer=spec.chargeUp;
      return;
    }
    this.beginOut();
  }
  public reset(): void {
    this.gravityControlHeld = false;
    this.definition.onReset?.(this,this.owner);
    this.state = 'IDLE'; this.effectLevel = 0; this.isActive = false; this.isCoolingDown = false;
    this.activationTarget = undefined; this.activationInput = undefined; this.teleportVisual = undefined; this.activationSerial++;
    this.activeTimer = this.cooldownTimer = this.stageTimer = this.chargeRegenTimer = this.outEntryEffectLevel = 0;
    this.charges = this.definition.initialCharges ?? this.maxCharges; this.pendingActivationFlux = this.pendingActiveEvents = this.pendingActivationEvents = 0;
  }
  /** One readiness reader for execution and HUD; a toggle-off is an accepted command. */
  public get reservedFluxCost(): number { return this.pendingActivationFlux; }
  public get activationFailureReason(): string | undefined {
    if (!this.available) return this.type === 'NONE' ? '没有舰船系统' : '该系统尚未接入';
    const ship = this.owner;
    if (ship && (ship.isDead || ship.hullHp <= 0 || ship.isRetreated || ship.isDocked)) return '舰船不在战斗状态';
    if (this.disabled || (ship?.runtimeModifiers.value.disableSystems ?? 0) > 0) return '系统离线';
    if (this.state === 'COOLDOWN' || this.isCoolingDown) return '冷却中（' + this.cooldownTimer.toFixed(1) + 's）';
    if (this.gravityField?.kind==='COLLAPSE' && this.definition.gravityAutoCollapse) return '区域正在自动坍缩';
    if (this.isActive && this.definition.gravityField?.cursorSpeed && (this.state === 'IN' || this.state === 'ACTIVE')) {
      if (ship?.retreating || ship?.flux.isOverloaded || ship?.flux.isVenting) return '当前不能接管区域场';
      const reason = ship && this.definition.activationReason?.(ship,this);
      if (reason) return reason;
      return undefined;
    }
    if (this.isActive) return this.definition.toggle && this.state !== 'OUT' ? (ship ? this.definition.deactivationReason?.(ship, this) : undefined) : this.state === 'OUT' ? '关闭中' : '系统正在运行';
    if (ship?.retreating) return '撤退中';
    if (ship?.flux.isOverloaded) return '载荷过载';
    if (ship?.flux.isVenting) return '正在排散载荷';
    if (ship && ship.flux.totalFlux + this.fluxCostPerUse + ship.allSystems.reduce((total, system) => total + system.reservedFluxCost, 0) > ship.flux.maxFlux) return '载荷空间不足';
    if (this.definition.charges !== undefined && this.definition.usesChargesForActivation !== false && this.charges <= 0) return '充能耗尽';
    const reason = ship && this.definition.activationReason?.(ship, this);
    if (reason) return reason;
    if (ship && this.definition.selectTarget && !this.definition.selectTarget(ship)) return this.definition.targetFailureReason?.(ship) ?? '射程内没有有效目标';
    if (ship && this.definition.canActivate && !this.definition.canActivate(ship)) return '未满足系统使用条件';
    return undefined;
  }
  public activate(): boolean {
    if (this.activationFailureReason) return false;
    if (this.isActive && this.definition.gravityField?.cursorSpeed) return true;
    if (this.isActive) { this.beginOut(); return true; }
    const target = this.owner && this.definition.selectTarget?.(this.owner);
    if (this.definition.selectTarget && !target) return false;
    if (this.definition.charges !== undefined && this.definition.usesChargesForActivation !== false) {
      if (this.charges <= 0) return false;
      this.charges--;
    }
    this.activationTarget = target || undefined;
    this.activationInput = this.owner ? { point: this.owner.aimTargetWorld.clone(), origin: this.owner.pos.clone(), velocity: this.owner.vel.clone(), facing: this.owner.facingRad, target: this.owner.currentTargetShip } : undefined;
    if (this.definition.gravityRemoteRelease && this.owner && this.activationInput) {
      const well = this.owner.allSystems.find(s => s.gravityField?.kind === 'WELL');
      if (well?.gravityField) {
        this.activationInput.point.set(well.gravityField.x, well.gravityField.y);
        this.activationInput.gravityAnchorSerial = well.activationSerial;
      }
    }
    this.activationSerial++;
    this.pendingActivationFlux += this.fluxCostPerUse;
    this.pendingActivationEvents++;
    this.state = 'IN'; this.isActive = true; this.effectLevel = 0;
    this.stageTimer = this.activeTimer = this.chargeUpDuration;
    if (this.stageTimer === 0) this.beginActive();
    return true;
  }
  public consumePendingActivationFlux(): number {
    const cost = this.pendingActivationFlux; this.pendingActivationFlux = 0; return cost;
  }
  public dispatchEvents(ship: Ship, world: SystemWorld, dt: number): void {
    const starts = this.pendingActivationEvents; this.pendingActivationEvents = 0;
    const count = this.pendingActiveEvents; this.pendingActiveEvents = 0;
    if (!this.available) return;
    for (let i = 0; i < starts; i++) this.definition.onActivate?.(ship, world, this);
    for (let i = 0; i < count; i++) this.definition.onActive?.(ship, world, this);
    this.definition.onAdvance?.(ship, dt, world, this);
  }
  public deactivate(): void {
    this.gravityControlHeld = false;
    this.definition.onInterrupt?.(this, this.owner);
    this.pendingActiveEvents = this.pendingActivationEvents = 0;
    if (this.state === 'IN' || this.state === 'ACTIVE') this.beginOut();
  }
  public update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Consume stage overshoot instead of losing a frame at every transition.
    let remaining = dt;
    while (remaining > 1e-9 && this.state !== 'IDLE') {
      if (this.stageTimer === Infinity) { this.effectLevel = 1; break; }
      const used = Math.min(remaining, this.stageTimer);
      this.stageTimer = Math.max(0, this.stageTimer - used); remaining -= used;
      if (this.state === 'COOLDOWN') this.cooldownTimer = this.stageTimer;
      else this.activeTimer = this.stageTimer;
      if (this.state === 'IN') {
        const duration=this.gravityField?.kind==='COLLAPSE'?this.definition.gravityAutoCollapse?.chargeUp??this.chargeUpDuration:this.chargeUpDuration;
        this.effectLevel=duration?1-this.stageTimer/duration:1;
      }
      else if (this.state === 'OUT') this.effectLevel = this.chargeDownDuration ? this.stageTimer / this.chargeDownDuration : 0;
      if (this.stageTimer > 1e-9) break;
      if (this.state === 'IN') this.beginActive();
      else if (this.state === 'ACTIVE') this.expire();
      else if (this.state === 'OUT') this.finishOut();
      else { this.state = 'IDLE'; this.isCoolingDown = false; this.cooldownTimer = 0; }
    }
    if (this.charges < this.maxCharges && this.chargeRegenRate > 0) {
      this.chargeRegenTimer += dt;
      const interval = 1 / this.chargeRegenRate;
      while (this.chargeRegenTimer >= interval && this.charges < this.maxCharges) { this.charges++; this.chargeRegenTimer -= interval; }
      if (this.charges === this.maxCharges) this.chargeRegenTimer = 0;
    }
  }
  private beginActive(): void {
    this.state = 'ACTIVE'; this.effectLevel = 1; this.isActive = true;
    this.stageTimer = this.gravityField?.kind==='COLLAPSE' && this.definition.gravityAutoCollapse ? this.definition.gravityAutoCollapse.active : this.activeDuration;
    this.activeTimer = Number.isFinite(this.stageTimer) ? this.stageTimer : this.maxDuration;
    this.pendingActiveEvents++;
    if (this.activeDuration === 0) this.beginOut();
  }
  private beginOut(): void {
    this.outEntryEffectLevel = Math.max(0, Math.min(1, this.effectLevel));
    this.state = 'OUT'; this.isActive = true;
    this.stageTimer = this.activeTimer = this.chargeDownDuration * Math.max(0, Math.min(1, this.effectLevel));
    if (this.stageTimer <= 0) this.finishOut();
  }
  private finishOut(): void {
    this.effectLevel = 0; this.isActive = false; this.activeTimer = 0;
    this.isCoolingDown = this.maxCooldown > 0;
    this.state = this.isCoolingDown ? 'COOLDOWN' : 'IDLE';
    this.stageTimer = this.cooldownTimer = this.maxCooldown;
  }
  /** Live composition gate only, not a cache of mutable system state/modifiers. */
  public get hasNativeThreatPhaseAI(): boolean {
    return hasNativeThreatPhaseAI(this.definition) && (!this.auxiliary || this.auxiliary.hasNativeThreatPhaseAI);
  }
  public get hasExactThreatPhaseAI(): boolean {
    return hasExactThreatPhaseAI(this.definition) && (!this.auxiliary || this.auxiliary.hasExactThreatPhaseAI);
  }
  public get hasNativeStats(): boolean {
    if (!hasNativeSystemStats(this.definition) || (this.auxiliary && !this.auxiliary.hasNativeStats)) return false;
    if (this.owner?.system === this && this.owner.parentShip) {
      const parent = this.owner.parentShip;
      if (!Object.hasOwn(parent, 'allSystems') && parent.systems.length <= 1 && (!parent.systems.length || parent.systems[0] === parent.system)) {
        return parent.system.hasNativeStats && parent.defenseSystem.hasNativeStats;
      }
      return parent.allSystems.every(s => s.hasNativeStats);
    }
    return true;
  }
  /** Read-only acquisition permission, NOT a threat-AI or cross-update lease.
   * Own accessors are rejected before dispatch; unknown modifier chains keep
   * their original per-candidate range/projectile-speed callback sequence. */
  public get hasNativeAimQueryStats(): boolean {
    if (ownedModifierSystems.has(this)) return this.hasNativeStats;
    return !Object.hasOwn(this, 'getWeaponRangePercent') && !Object.hasOwn(this, 'getProjectileSpeedPercent')
      && this.getWeaponRangePercent === ShipSystem.nativeRangeReader
      && this.getProjectileSpeedPercent === ShipSystem.nativeProjectileSpeedReader
      && this.hasUnshadowedMotionModifierChain() && this.hasNativeStats;
  }
  /** Borrowed only for one synchronous owned motion query. No cached values or
   * lifecycle shortcuts: unknown definitions/effect sources retain scalar calls. */
  public readNativeMotionModifiers(): SystemModifiers | undefined {
    if (!this.hasUnshadowedMotionModifierChain()
      || (this.owner && !this.owner.runtimeModifiers.empty)
      || (this.owner?.parentShip && !this.owner.parentShip.runtimeModifiers.empty)
      || !this.hasNativeStats) return undefined;
    return this.modifiers();
  }
  /** Do not suppress custom dictionary dispatch even inside the owned realm.
   * The explicitly installed native cache is nonconfigurable and already audited.
   * Check the entire auxiliary chain without touching shadowed getter properties. */
  private hasUnshadowedMotionModifierChain(): boolean {
    if (ownedModifierSystems.has(this)) return true;
    if (Object.hasOwn(this, 'modifiers') || this.modifiers !== ShipSystem.nativeModifierReader) return false;
    return !this.auxiliary || this.auxiliary.hasUnshadowedMotionModifierChain();
  }
  private modifiers(capacity = this.baseFluxCapacity) {
    const own = this.available ? (this.isActive ? this.definition.modifiers?.(this, capacity, this.owner) : this.definition.passiveModifiers?.(this, this.owner)) ?? emptySystemModifiers : emptySystemModifiers;
    let composed = this.auxiliary?.available ? combineSystemModifiers(own, this.auxiliary.modifiers(capacity)) : own;
    const owner = this.owner, parent = owner?.parentShip;
    if (owner?.system === this) {
      if (!owner.runtimeModifiers.empty) composed = combineSystemModifiers(composed, owner.runtimeModifiers.value);
      if (parent && !parent.isDead && parent.hullHp > 0 && !parent.isRetreated && !owner.isDead && owner.hullHp > 0 && !owner.isRetreated) {
        if (!Object.hasOwn(parent, 'allSystems') && parent.systems.length <= 1 && (!parent.systems.length || parent.systems[0] === parent.system)) {
          const pSys = parent.system;
          if (pSys.available && !pSys.disabled && pSys.isActive && pSys.definition.moduleModifiers) {
            composed = combineSystemModifiers(composed, pSys.definition.moduleModifiers(pSys, owner));
          }
          const pDef = parent.defenseSystem;
          if (pDef.available && !pDef.disabled && pDef.isActive && pDef.definition.moduleModifiers) {
            composed = combineSystemModifiers(composed, pDef.definition.moduleModifiers(pDef, owner));
          }
        } else {
          for (const system of parent.allSystems) {
            if (system.available && !system.disabled && system.isActive && system.definition.moduleModifiers) {
              composed = combineSystemModifiers(composed, system.definition.moduleModifiers(system, owner));
            }
          }
        }
      }
    }
    return composed;
  }
  public canFireWeapon(mount: import('./Weapon').WeaponMount): boolean {
    return !this.blocksWeapons && (!this.available || this.definition.weaponEnabled?.(this, mount) !== false)
      && (!this.auxiliary || this.auxiliary.canFireWeapon(mount));
  }
  public get hasAutofirePolicy(): boolean {
    if (Object.hasOwn(this, 'autofirePolicy') || this.autofirePolicy !== nativeAutofirePolicy) return true;
    if (this.available && !this.disabled && this.definition.autofirePolicy) return true;
    return !!this.auxiliary?.hasAutofirePolicy;
  }
  public get hasPerMountWeaponGate(): boolean {
    if (Object.hasOwn(this, 'canFireWeapon') || this.canFireWeapon !== nativeCanFireWeapon) return true;
    if (this.available && this.definition.weaponEnabled) return true;
    return !!this.auxiliary?.hasPerMountWeaponGate;
  }
  /** One query's composed values. Call again after any lifecycle/owner write;
   * consumers must not retain this table across AI, update or emission stages. */
  public readModifierTable(readers: readonly (keyof ShipSystem)[] = []): Readonly<SystemModifiers> | undefined {
    if (ownedModifierSystems.has(this)) return this.modifiers();
    // Definitions may compose arbitrary authored systems. A scalar-method override
    // is a different extension API, and must keep its original live getter path.
    if (Object.getPrototypeOf(this) !== ShipSystem.prototype) return;
    for (let i = 0; i < readers.length; i++) {
      const key = readers[i];
      if (Object.hasOwn(this, key) || this[key] !== composedScalarReaderObj[key]) return;
    }
    return this.modifiers();
  }
  public get blocksVenting(): boolean { return (this.owner?.runtimeModifiers.value.disableVenting ?? 0) > 0 || (this.controlsActive && (!!this.definition.controls?.blockVenting || this.definition.canVent?.(this) === false)) || !!this.auxiliary?.blocksVenting; }
  public get preventsAIVenting(): boolean { return (this.available && this.definition.preventAIVenting?.(this) === true) || !!this.auxiliary?.preventsAIVenting; }
  public getSightRadiusFlat(): number { return this.modifiers().sightRadiusFlat ?? 0; }
  public getSightRadiusPercent(): number { return this.modifiers().sightRadiusPercent ?? 0; }
  public getArmorDamageMultiplier(): number { return this.modifiers().armorDamageMultiplier ?? 1; }
  public getHullDamageMultiplier(): number { return this.modifiers().hullDamageMultiplier ?? 1; }
  public getEmpDamageMultiplier(): number { return this.modifiers().empDamageMultiplier ?? 1; }
  public getRepairTimeMultiplier(): number { return this.modifiers().repairTimeMultiplier ?? 1; }
  public getTimeMultiplier(): number { return this.modifiers().timeMultiplier ?? 1; }
  public getBeamDamageMultiplier(): number { return this.modifiers().beamDamageMultiplier ?? 1; }
  public getFighterDamageMultiplier(): number { return this.modifiers().fighterDamageMultiplier ?? 1; }
  public getWeaponRangePercent(weaponType: SystemWeaponType | undefined): number { return weaponType ? this.modifiers().weapons?.[weaponType]?.rangePercent ?? 0 : 0; }
  public getProjectileSpeedPercent(weaponType: SystemWeaponType | undefined): number { return weaponType ? this.modifiers().weapons?.[weaponType]?.projectileSpeedPercent ?? 0 : 0; }
  public getRecoilMultiplier(): number { return this.modifiers().recoilMultiplier ?? 1; }
  public getShieldDamageMultiplier(): number { return this.modifiers().shieldDamageMultiplier ?? 1; }
  public getShieldUpkeepMultiplier(): number { return this.modifiers().shieldUpkeepMultiplier ?? 1; }
  public getHardFluxPerSecond(capacity: number): number { return this.modifiers(capacity).hardFluxPerSecond ?? 0; }
  public getSoftFluxPerSecond(): number { return this.modifiers().softFluxPerSecond ?? 0; }
  public getDissipationMultiplier(): number { return this.modifiers().dissipationMultiplier ?? 1; }
  public get suppressesZeroFluxBoost(): boolean { return (this.modifiers().zeroFluxBoostSuppressed ?? 0) > 0; }
  public getSpeedPercentBonus(): number { return this.modifiers().speedPercent ?? 0; }
  public getDecelerationFlatBonus(): number { return this.modifiers().decelerationFlat ?? 0; }
  public getAmmoRegenMultiplier(type: SystemWeaponType | undefined): number { return type ? this.modifiers().weapons?.[type]?.ammoRegenMultiplier ?? 1 : 1; }
  public getSpeedFlatBonus(): number { return this.modifiers().speedFlat ?? 0; }
  public getAccelerationFlatBonus(): number { return this.modifiers().accelerationFlat ?? 0; }
  public getAccelerationPercentBonus(): number { return this.modifiers().accelerationPercent ?? 0; }
  public getDecelerationPercentBonus(): number { return this.modifiers().decelerationPercent ?? 0; }
  public getTurnRateFlatBonus(): number { return this.modifiers().turnRateFlat ?? 0; }
  public getTurnRatePercentBonus(): number { return this.modifiers().turnRatePercent ?? 0; }
  public getTurnAccelerationFlatBonus(): number { return this.modifiers().turnAccelerationFlat ?? 0; }
  public getTurnAccelerationPercentBonus(): number { return this.modifiers().turnAccelerationPercent ?? 0; }
  public getWeaponDamageMultiplier(weaponType: SystemWeaponType | undefined): number {
    return weaponType ? this.modifiers().weapons?.[weaponType]?.damageMultiplier ?? 1 : 1;
  }
  public getWeaponRateOfFireMultiplier(weaponType: SystemWeaponType | undefined): number {
    return weaponType ? this.modifiers().weapons?.[weaponType]?.rateOfFireMultiplier ?? 1 : 1;
  }
  public getWeaponFluxCostMultiplier(weaponType: SystemWeaponType | undefined): number {
    return weaponType ? this.modifiers().weapons?.[weaponType]?.fluxCostMultiplier ?? 1 : 1;
  }
}
const nativeAutofirePolicy = ShipSystem.prototype.autofirePolicy;
const nativeCanFireWeapon = ShipSystem.prototype.canFireWeapon;
const composedScalarReaderObj: Partial<Record<keyof ShipSystem, unknown>> = Object.create(null);
for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(ShipSystem.prototype))) {
  if (typeof descriptor.value === 'function') composedScalarReaderObj[key as keyof ShipSystem] = descriptor.value;
}

/** Identity used by synchronous query leases; overridden readers stay live. */
export const nativeReadModifierTable = ShipSystem.prototype.readModifierTable;

