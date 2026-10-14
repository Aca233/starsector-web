import { encodeRustAIAdmission, type RustAIAdmission } from './RustAIProtocol';
import { encodeRustSceneAdmission, encodeRustSceneControl, type RustSceneAdmission, type RustSceneControl } from './RustSceneProtocol';
import { encodeRustMotionAdmission, type RustMotionAdmission } from './RustMotionProtocol';
/** Development ABI for resident domain foundations. Pure cross-runtime
 * data: no Ship, DOM, renderer or simulation-object references. */
export const RUST_CORE_ABI = 13;
export const RUST_MOTION_WIDTH = 22;
export const RUST_COMMAND_WIDTH = 4 + RUST_MOTION_WIDTH;
export const RUST_OUTPUT_HEADER = 44;
export const RUST_SYSTEM_WORLD_WIDTH=5,RUST_RANGE_WIDTH=16;
export const RUST_BEAM_EFFECT_WIDTH=8,RUST_GRAVITON_WIDTH=6,RUST_GRAVITON_HIT_WIDTH=5;
export const RUST_GUIDANCE_WIDTH=30;
export const RUST_READINESS_WIDTH=34;
export const RUST_FIRE_MEMORY_WIDTH=33;
export const RUST_PROJECTILE_WIDTH=65;
export const RUST_BEAM_WIDTH=29;
export const RUST_FLUX_WIDTH = 19;
export const RUST_SHIP_WIDTH = 40;
export const RUST_LIFECYCLE_WIDTH = 17;
export const RUST_SYSTEM_WIDTH = 29;
export const RUST_SHIELD_STATE_WIDTH = 64;
export const RUST_SHIELD_WIDTH = 3 + RUST_SHIELD_STATE_WIDTH;
export const RUST_ARMOR_STATE_WIDTH = 31;
export const RUST_ARMOR_WIDTH = 3 + RUST_ARMOR_STATE_WIDTH + 2;
export const RUST_SCAR_WIDTH = 18;
export const RUST_COMPONENT_WIDTH = 23;
export const RUST_ENGINE_CONTROLLER_STATE_WIDTH = 44;
export const RUST_ENGINE_CONTROLLER_WIDTH = 3 + RUST_ENGINE_CONTROLLER_STATE_WIDTH + 2;
export const RUST_ENGINE_WIDTH = 30;
export const RUST_WEAPON_CONTROLLER_STATE_WIDTH=23;
export const RUST_WEAPON_CONTROLLER_WIDTH=30;
export const RUST_WEAPON_MOUNT_WIDTH=39;
export const RUST_WEAPON_GROUP_STATE_WIDTH=11;
export const RUST_WEAPON_GROUP_WIDTH=16;
export const RUST_EVENT_WIDTH = 10;
export const RUST_BODY_WIDTH = 4 + RUST_MOTION_WIDTH + 1 + RUST_SHIP_WIDTH;
export const RustCoreDomain = Object.freeze({ IdentityAndRandom: 1, Motion: 2, Flux: 4, Lifecycle: 8, LocalClock: 16, Shield: 32, Upkeep: 64, Armor:128, WeaponHealth:256, Engines:512, ComponentPropagation:1024, WeaponState:2048 });
export const RustShipFlag = Object.freeze({ ShieldActive: 1, AllowDissipation: 2, LockedTurning: 4,
  SuppressBoost: 8, Dead: 16, Retreated: 32, Docked: 64, Retreating: 128, SystemsDisabled: 256, Brake: 512, FlamedOut: 1024 });
export const RustLifecycleFlag = Object.freeze({ Available: 1, Toggle: 2, UsesCharges: 4, HardFlux: 8,
  CancelOnBrake: 16, CancelOnRetreat: 32, CancelOnFlameout: 64 });
export const RustEventKind = Object.freeze({ FluxResult: 1, OverloadStarted: 2, OverloadAudio: 3,
  VentLoopStop: 4, SystemResult: 5, SystemInterrupt: 6, SystemReset: 7,
  SystemActivate: 8, SystemActive: 9, SystemAdvance: 10, ShieldResult: 11, ShieldUp: 12, ShieldDown: 13,
  PhaseActivate: 14, PhaseDeactivate: 15, VentAudio: 16, VentLoopStart: 17,
  ImpactFlux: 18, ImpactAbsorbed: 19, ImpactRemaining: 20, CellDamage:21, ArmorDamage:22,
  ArmorHullDamage:23, ResidualArmor:24, HullApplied:25, ComponentDamage:26, ComponentDisableResult:27,
  ComponentDisabled:28, ComponentRepaired:29, EngineDamage:30, EngineDisableResult:31, EngineDisabled:32,
  EngineRepaired:33, EngineFlameout:34, EngineRestart:35, CriticalArmor:36, CriticalHull:37 });
export const RustHullSize = Object.freeze({ FIGHTER:0,FRIGATE:1,DESTROYER:2,CRUISER:3,CAPITAL_SHIP:4,UNKNOWN:5 });
export const RustEngineState = Object.freeze({ READY:0,FLAMING_OUT:1,DISABLED:2 });
export interface RustStartupTracker {readonly repairDuration:number;readonly hitAgo:number;readonly interval:number;readonly elapsed:number;readonly intervalElapsed:boolean}
export interface RustConstructorSnapshot {
  readonly armor?: { readonly cells: readonly number[]; readonly dirtyVersion: number };
  readonly runtimeModifiers:readonly {readonly id:string;readonly modifiers:Readonly<import('../../extensions/ship-systems/Types').SystemModifiers>}[];
  readonly components:readonly {readonly componentId:number;readonly health:number;readonly maxHealth:number;readonly disabled:boolean;readonly permanent:boolean;
    readonly disabledTimer:number;readonly disabledDuration:number;readonly tracker?:RustStartupTracker}[];
  readonly engines:readonly {readonly index:number;readonly health:number;readonly maxHealth:number;readonly disabled:boolean;readonly permanent:boolean;
    readonly tracker:RustStartupTracker;readonly contribution:number;readonly driftContribution:number;readonly temporary:boolean;readonly glowDisabled:boolean;
    readonly thrust:number;readonly previousThrust:number;readonly spread:number;readonly previousSpread:number}[];
  readonly engineController:{readonly state:keyof typeof RustEngineState;readonly cooldown:number;readonly permanentFraction:number;readonly sinceAcceleration:number;
    readonly sinceSpread:number;readonly forcePending:boolean;readonly suppressMessage:boolean};
  readonly readiness:{readonly cr:number;readonly crAtDeployment:number|null;readonly peakRemaining:number;readonly shieldTimer:number;readonly shieldInterval:number;
    readonly shieldIntervalElapsed:boolean;readonly sinceShieldDamage:number};
}
export const RustEngineField = Object.freeze({Index:0,X:1,Y:2,Width:3,Length:4,SystemActivated:5,ManeuverPresent:6,
  JetX:7,JetY:8,JetTurn:9,Health:10,MaxHealth:11,Disabled:12,Permanent:13,RepairDuration:14,HitAgo:15,
  Interval:16,Elapsed:17,IntervalElapsed:18,Contribution:19,DriftContribution:20,Temporary:21,GlowDisabled:22,
  Thrust:23,PreviousThrust:24,Spread:25,PreviousSpread:26 });
export const RustEngineControllerField = Object.freeze({HullSize:0,Radius:1,HealthMultiplier:2,Count:3,State:4,Cooldown:5,
  PermanentFraction:6,JustFlamedOut:7,JustRestarted:8,FlameAccelerating:9,SinceAcceleration:10,SinceSpread:11,
  ForcePending:12,SuppressMessage:13,CanRepair:14,RepairMultiplier:15,UnderFire:16,MalfunctionChance:17,
  CriticalChance:18,MotionPresent:19,MotionStart:20,RawFraction:41,ThresholdFraction:42,MovementMultiplier:43 });
export interface RustEngineSlotConfig {
  readonly x:number;readonly y:number;readonly width:number;readonly length:number;
  readonly systemActivated?:boolean;readonly maneuver?:readonly [number,number,number];
}
/** Pre-engine stat inputs, preserving the source grouping and units. Independent
 * ships only; module propulsion/compensation is not admitted by this table. */
export interface RustEngineMotionStats {
  readonly accelerationBase:number;readonly accelerationPercent:number;readonly accelerationMultiplier:number;
  readonly decelerationBase:number;readonly decelerationPercent:number;readonly decelerationMultiplier:number;
  readonly speedBase:number;readonly speedPercent:number;readonly speedMultiplier:number;
  readonly turnAccelerationBaseDeg:number;readonly turnAccelerationPercent:number;readonly turnAccelerationMultiplier:number;
  readonly turnRateBaseDeg:number;readonly turnRatePercent:number;readonly turnRateMultiplier:number;
  readonly terrainMultiplier:number;readonly readinessMultiplier:number;
  readonly specAcceleration:number;readonly specTurnAccelerationDeg:number;
  readonly zeroFluxSpeedBonus:number;readonly zeroFluxTurnMultiplier:number;
}
export interface RustDamagePolicy {
  readonly empMultiplier:number;readonly weaponMultiplier:number;readonly engineMultiplier:number;
  readonly damageToWeapons:number;readonly damageToEngines:number;
  readonly baseCriticalDamage:number;readonly criticalDamageMultiplier:number;readonly crDamageMultiplier:number;
}
export type RustEngineOperation = 'damage'|'disable'|'critical'|'force-flameout'|'restore'|'clear-events';
export interface RustDamageSource {readonly id:number;readonly handle:RustBodyHandle}
export const RustArmorField = Object.freeze({ Cols:0,Rows:1,CellWidth:2,CellHeight:3,Rating:4,MinX:5,MinY:6,MaxCellArmor:7,
  EffectiveMultiplier:8,DynamicMultiplier:9,MaxReduction:10,MinResidualMultiplier:11,DirtyVersion:12,
  MaxHull:13,HullHp:14,HullSuppressed:15,VastBulk:16,ScarsEnabled:17,ScarsSuppressed:18,ScarRevision:19,
  ScarArmorRevision:20,IncomingMultipliers:21,Integrity:29 });
export const RustComponentField = Object.freeze({ Id:0,Size:1,Mount:2,X:3,Y:4,Health:5,MaxHealth:6,Disabled:7,Permanent:8,
  DisabledDuration:9,DisabledTimer:10,TrackerPresent:11,RepairDuration:12,HitAgo:13,Interval:14,Elapsed:15,
  IntervalElapsed:16,CanRepair:17,RepairMultiplier:18,RepairUnderFire:19 });
export const RustWeaponSize = Object.freeze({ SMALL:0,MEDIUM:1,LARGE:2,EXTRA_LARGE:3 });
export const RustWeaponMount = Object.freeze({ TURRET:0,HARDPOINT:1,HIDDEN:2 });
export interface RustArmorConfig {
  readonly cols:number;readonly rows:number;readonly cellWidth:number;readonly cellHeight:number;readonly armorRating:number;
  readonly minX?:number;readonly minY?:number;readonly maxHull:number;readonly hullHp?:number;
  readonly effectiveMultiplier?:number;readonly dynamicMultiplier?:number;readonly maxReduction?:number;readonly minResidualMultiplier?:number;
  readonly scarsEnabled?:boolean;readonly scarsSuppressed?:boolean;readonly hullSuppressed?:boolean;readonly vastBulk?:boolean;
}
/** Four armor/hull multiplier pairs in ENERGY, KINETIC, HIGH_EXPLOSIVE, FRAGMENTATION order. */
export interface RustArmorStats {
  readonly effectiveMultiplier:number;readonly dynamicMultiplier:number;readonly maxReduction:number;readonly minResidualMultiplier:number;
  readonly incoming:readonly [number,number,number,number,number,number,number,number];
  readonly hullSuppressed?:boolean;readonly vastBulk?:boolean;readonly scarsSuppressed?:boolean;
}
export interface RustWeaponHealthConfig {
  readonly componentId:number;readonly size:keyof typeof RustWeaponSize;readonly mount:keyof typeof RustWeaponMount;
  readonly x?:number;readonly y?:number;readonly healthMultiplier?:number;readonly deferTracker?:boolean;
}
export const RustShieldType = Object.freeze({ NONE: 0, FRONT: 1, OMNI: 2, PHASE: 3 });
export const RustUpkeepControl = Object.freeze({ BlockShields: 1, BlockDissipation: 2, LockTurning: 4, BlockVenting: 8, ReleaseOnOut: 16, ExtendEngineGlow:32, BlockWeapons:64, ForceAutofire:128 });
export const RustLifecycleGate = Object.freeze({ IDLE: 1, IN: 2, ACTIVE: 4, OUT: 8, COOLDOWN: 16, Applied: 2 | 4 | 8 });
/** Scalars are state copies. Only angle/arc/center/aim geometry fields can use
 * the approved geometry allowance; phases, speed multiplier and timers cannot. */
export const RustShieldField = Object.freeze({ Type:0, MaxArc:1, Radius:2, Efficiency:3, UpkeepRate:4,
  ToggleLocked:5, Active:6, CurrentArc:7, Facing:8, TargetFacing:9, CloseTime:10, PendingRaise:11,
  UnfoldMultiplier:12, TurnMultiplier:13, PhaseState:14, PhaseEffect:15, PhaseThreshold:16,
  PhaseUp:17, PhaseDown:18, PhaseCooldown:19, PhaseCost:20, PhaseUpkeep:21, PhaseCannotOverload:22,
  PhaseTimer:23, PendingPhaseCost:24, ForcedPhasePresent:25, ForcedPhaseValue:26, PhaseSpeed:27,
  SinceDamage:28, CenterX:29, CenterY:30, AimX:31, AimY:32, DefenseAimPresent:33, DefenseAim:34,
  DefenseBlocked:35, ExternalUpkeepMultiplier:36, ExternalSoftUpkeep:37, ExternalHardUpkeep:38,
  VoidPresent:39, DamageMultiplier:40, EnergyMultiplier:41, ExternalDamageMultiplier:42, RightClickSystem:43,
  VoidStart:44 });
export interface RustShieldConfig {
  readonly type: keyof typeof RustShieldType; readonly maxArc: number; readonly radius: number;
  readonly efficiency: number; readonly upkeepRate: number; readonly unfoldMultiplier?: number; readonly turnMultiplier?: number;
  readonly phaseChargeUp?: number; readonly phaseChargeDown?: number; readonly phaseCooldown?: number;
  readonly phaseActivationCost?: number; readonly phaseUpkeep?: number; readonly phaseThresholdMultiplier?: number;
  readonly toggleLocked?: boolean; readonly phaseCannotOverload?: boolean; readonly centerX?: number; readonly centerY?: number;
  readonly initialActive?: boolean; readonly rightClickSystem?: boolean;
}
export interface RustVoidShieldSpec {
  readonly layers: number; readonly integrityPerLayer: number; readonly rechargePerSecond: number;
  readonly hitDelay: number; readonly restartDelay: number;
}
/** Lifecycle resource subrules only. No targeting/geometry/world callback admission. */
export interface RustUpkeepPolicy {
  readonly gate: number; readonly softFluxPerSecond?: number; readonly hardFluxPerSecond?: number;
  readonly hardFluxCapacityFraction?: number; readonly shieldUpkeepBase?: number; readonly shieldUpkeepEffectSlope?: number;
  readonly controls?: number; readonly zeroFluxBoostSuppressed?: number;
}
export type RustShieldOperation = 'toggle-raw' | 'raise-raw' | 'lower-raw' | 'toggle-hull' | 'vent-ship';
export interface RustFluxConfig {
  readonly maxFlux: number; readonly baseDissipation: number; readonly hullSize: number;
  readonly ventRateMultiplier?: number; readonly overloadTimeMultiplier?: number;
  readonly shieldSoftFluxConversion?: number; readonly dissipationMultiplier?: number; readonly boostDelay?: number;
}
export interface RustShipConfig extends RustFluxConfig {
  readonly softFlux?: number; readonly hardFlux?: number; readonly flags?: number;
  readonly phaseTimeBonus?: number; readonly phaseEffect?: number; readonly externalTimeMultiplier?: number;
  readonly hardFluxDissipationFraction?: number; readonly zeroFluxMinimum?: number; readonly allowZeroFluxAtAnyLevel?: number;
}
/** Only shared lifecycle metadata. Does not admit any system's full behavior. */
export interface RustLifecycleSpec {
  readonly chargeUp: number; readonly active: number; readonly chargeDown: number; readonly cooldown: number;
  readonly maxCharges: number; readonly initialCharges?: number; readonly chargeRegen: number;
  readonly fluxCostPerUse: number; readonly flags: number;
}
export type RustFluxOperation = 'shield-hit' | 'increase' | 'spend-soft' | 'increase-clamped'
  | 'trigger-overload' | 'force-overload' | 'overload-for' | 'start-vent' | 'cancel-vent';
export type RustSystemOperation = 'activate' | 'interrupt' | 'reset' | 'enable' | 'disable';
export const RustFiringState=Object.freeze({IDLE:0,CHARGING:1,ACTIVE:2,CHARGEDOWN:3});
export const RustWeaponType=Object.freeze({NONE:0,BALLISTIC:1,ENERGY:2,MISSILE:3});
export const RustWeaponControllerField=Object.freeze({PreviousFacing:0,MountCount:1,GroupCount:2,ManualMode:3,ExternalBlocked:4,
  ExternalPhased:5,CombatRepairMultiplier:6,UnderFire:7,MalfunctionChance:8,CriticalChance:9,CurrentCR:10,RepairMultiplier:11,
  RecoilMultiplier:12,RateStart:13,AmmoRegenStart:16,ManualControl:19,CanShipFire:20,LastDt:21,SelectedGroup:22});
export const RustWeaponGroupField=Object.freeze({Index:0,Alternating:1,Autofire:2,AlternatingIndex:3,ElapsedPresent:4,Elapsed:5,
  WasFiringPresent:6,WasFiring:7,JustSwitchedPresent:8,JustSwitched:9,MemberCount:10});
export const RustWeaponStateField=Object.freeze({ComponentId:0,Type:1,Beam:2,BurstBeam:3,Refire:4,Charge:5,BurstDelay:6,
  BeamDelayPresent:7,BeamDelay:8,MaxAmmoPresent:9,MaxAmmo:10,AmmoRegen:11,MinSpread:12,SpreadDecay:13,TorpedoRack:14,
  Angle:15,Cooldown:16,Ammo:17,Recharge:18,LifecycleDt:19,BurstRemaining:20,BurstTimer:21,BurstReserved:22,
  FiringState:23,FiringTimer:24,TriggerHeld:25,CycleId:26,ReloadDelay:27,Recoil:28,Glow:29,Barrel:30,Spread:31,
  LoadedPresent:32,LoadedLeft:33,LoadedRight:34,UnlimitedAmmo:35});
/** Initial state only; ordinary steps never upload this record. */
export interface RustWeaponInitialState {
  readonly angle?:number;readonly cooldown?:number;readonly ammo?:number;readonly recharge?:number;readonly lifecycleDt?:number;
  readonly burstRemaining?:number;readonly burstTimer?:number;readonly burstReserved?:boolean;
  readonly firingState?:keyof typeof RustFiringState;readonly firingTimer?:number;readonly triggerHeld?:boolean;readonly cycleId?:number;
  readonly reloadDelay?:number;readonly recoil?:number;readonly glow?:number;readonly barrel?:number;readonly spread?:number;
  readonly loaded?:readonly [number,number];
}
export interface RustWeaponStateConfig {
  readonly componentId:number;readonly type?:keyof typeof RustWeaponType;readonly beam?:boolean;readonly burstBeam?:boolean;
  readonly refireDelay:number;readonly chargeTime?:number;readonly burstDelay?:number;readonly beamBurstDelay?:number;
  readonly maxAmmo?:number;readonly ammoRegen?:number;readonly minSpread?:number;readonly spreadDecay?:number;readonly torpedoRack?:boolean;
  readonly initial?:RustWeaponInitialState;
}
export interface RustWeaponGroupConfig {
  readonly index:number;readonly mode:'LINKED'|'ALTERNATING';readonly autofire:boolean;readonly members:readonly number[];
  readonly alternatingIndex?:number;readonly alternatingElapsed?:number;readonly alternatingWasFiring?:boolean;readonly alternatingJustSwitched?:boolean;
}
export interface RustCombatGeometry {
  readonly team:number;readonly hullSize:keyof typeof RustHullSize;readonly radius:number;
  readonly bounds:readonly (readonly [number,number])[];
  readonly player?:boolean;
}
export interface RustFireQueryShip {
  readonly visibility:readonly {readonly team:number;readonly visible:boolean}[];
  readonly scope:readonly RustDamageSource[];
  readonly player:boolean;readonly vast?:boolean;readonly noFireThrough?:boolean;readonly nativeThreat?:boolean;
  readonly pdIgnoresFlares?:number;readonly accuracy?:number;readonly finish:number;readonly pressure:number;readonly tieRank:number;readonly adaptiveBudget?:boolean;
}
export interface RustFireQueryMount {
  readonly flags:number;readonly hints:number;readonly baseAngleDeg:number;readonly arcDeg:number;readonly turnRateDeg:number;
  readonly sizeScale:number;readonly accuracyBonus?:number;readonly passFighters?:boolean;readonly proximity?:number;
  readonly schedulingSalt:number;readonly initialIdle?:number;readonly sampleHz20?:boolean;readonly sampleNative?:boolean;
}
/** Persistent damage/source attributes, revised only by actual stat changes. */
export interface RustCombatAttributes {
  readonly collisionDisabled?:boolean;readonly damageTaken?:number;readonly shieldDamage?:number;
  readonly pointDefenseSkill?:number;readonly targetAnalysisSkill?:number;readonly energyMasterySkill?:number;
  readonly damageToFightersPercent?:number;readonly damageToFightersMultiplier?:number;
  readonly damageToFrigatesPercent?:number;readonly damageToDestroyersPercent?:number;readonly damageToCruisersPercent?:number;
  readonly damageDealt?:number;readonly fluxCost?:number;readonly recoil?:number;
  readonly weaponDamage?:readonly [number,number,number];readonly beamDamage?:number;readonly ecmPenalty?:number;readonly ai?:boolean;
}
export interface RustDeliverySpec {
  readonly spawnType:'ORDINARY'|'BALLISTIC'|'BALLISTIC_AS_BEAM'|'PLASMA'|'MISSILE';
  readonly length?:number;readonly fadeTime?:number;readonly damageType:'ENERGY'|'KINETIC'|'HIGH_EXPLOSIVE'|'FRAGMENTATION';
  readonly weaponType?:keyof typeof RustWeaponType;readonly radius?:number;readonly armingTime?:number;readonly angularVelocity?:number;
  readonly flightTime?:number;readonly sourceMissile?:boolean;readonly flameoutTime?:number;readonly missileFadeTime?:number;
  readonly fizzleAtRange?:boolean;readonly noCollisionWhileFading?:boolean;readonly reduceDamageWhileFading?:boolean;
  readonly collisionAfterFlameoutNone?:boolean;readonly beamSpeed?:number;readonly beamHardFlux?:boolean;
  readonly guidance?:RustGuidanceSpec;
  readonly effect?:keyof typeof RustWeaponEffect;readonly highFrequency?:boolean;readonly beamWidth?:number;
  readonly fringeColor?:readonly [number,number,number,number];readonly coreColor?:readonly [number,number,number,number];
  readonly world?:RustDeliveryWorldSpec;
}
export interface RustExplosionSpec{readonly radius:number;readonly core:number;readonly duration:number;readonly minimumFraction:number;
  readonly collision:'SHIPS_AND_ASTEROIDS'|'MISSILE_FF'|'MISSILE_NO_FF'|'PROJECTILE_FF'|'PROJECTILE_NO_FF'|'OTHER';readonly noFriendlyFire?:boolean}
export interface RustDeliveryWorldSpec{
  readonly intercepts?:boolean;readonly passMissiles?:boolean;readonly passFighters?:boolean;readonly passFightersDestroyed?:boolean;
  readonly gravityCoupling?:'MASS_DRIVER';
  /** Actual birth spec identity rule: specId is not lightmg. */
  readonly batchShipContacts?:boolean;
  readonly terrainPenetration?:readonly [number,number,number];readonly hitpoints?:number;
  readonly isMine?:boolean;readonly fizzleAtRange?:boolean;readonly systemFuse?:number;readonly systemFadeIn?:number;readonly systemExplosionSound?:string;
  readonly explosion?:RustExplosionSpec;readonly fuse?:{readonly range:number;readonly radius:number;readonly core?:number;readonly sourceExplosion?:RustExplosionSpec};
  readonly visual:{readonly hitGlowRadius:number;readonly width:number;readonly texture:0|1|2;readonly scroll:number;readonly pixels:number;
    readonly movingSpeed?:number;readonly sourceMoveSpeed:boolean;readonly fringe:readonly [number,number,number,number];readonly core:readonly [number,number,number,number];
    readonly missile?:{readonly radius:number;readonly color:readonly [number,number,number];readonly hitGlow:boolean};readonly custom?:0|1|2|3;readonly heavyTorpedo?:boolean;
    readonly fuseSound:string;readonly fuseColor:readonly [number,number,number]};
  readonly beamHitRadius?:number;readonly beamHitBrighten?:number;
}
export const RustWeaponEffect=Object.freeze({Tachyon:1,Graviton:2,Sabot:3,Mote:4,HyperionYamato:5,GlorianaSiege:6});
export const RustSystemKind=Object.freeze({NONE:0,ECLIPSE:1,EDICT:2,YAMATO:3,JUMP:4,ARK_FORGE:5,ARK_BARRIER:6,ARK_REPAIR:7,ROC_ATTITUDE:8,ROC_FIRE:9,ZHEFENG:10,GRAVITY_WELL:11,GRAVITY_BATTLE_WELL:12,GRAVITY_OTHER:13});
export const RustGravityKind=Object.freeze({WELL:0,REPULSOR:1,MANEUVER:2,RELEASE:3,BATTLE_WELL:4,COLLAPSE:5,POLARITY:6,BATTLE_REPULSOR:7,PUSH:8});
export interface RustGravitySystemConfig {
  readonly systemId:number;readonly id:string;readonly kind:keyof typeof RustGravityKind;
  readonly field?:{readonly kind:'WELL'|'REPULSOR';readonly cursorSpeed?:number;readonly linger?:number;readonly radius:number;readonly placement:number;readonly duration:number;
    readonly shipStrength:number;readonly projectileStrength:number;readonly shipBudget:number;readonly projectileBudget:number;readonly maxShips:number;readonly maxProjectiles:number};
  readonly collapse?:{readonly radius:number;readonly damage:number;readonly edge:number;readonly maxShips:number;readonly auto?:{readonly up:number;readonly active:number;readonly cost:number}};
  readonly maneuver?:{readonly duration:number;readonly maxTurn:number;readonly turnRate:number;readonly acceleration:number;readonly minSpeed:number;readonly minAim:number};
  readonly push?:{readonly range:number;readonly shipStrength:number;readonly projectileStrength:number;readonly fluxRate:number};
}
export interface RustGravityMountConfig {
  readonly componentId:number;readonly id:string;readonly hardpoint:boolean;
  readonly tractor?:{readonly capture:number;readonly projectileCapture:number;readonly hold:number;readonly recovery:number;readonly anchorSpeed:number;readonly strength:number;readonly damping:number;
    readonly fluxRate:number;readonly selfTow:boolean;readonly tidalDamage?:number;readonly tidalFlux?:number};
  readonly deflector?:{readonly impulse:number;readonly budget:number;readonly flux:number;readonly interval:number};
}
/** carrierRoot keeps its ABI name, but stores the exact sourceCarrier handle;
 * assembly-root resolution belongs to the native system-world reader. */
export interface RustSystemWorldConfig{readonly traits:number;readonly parent?:RustBodyHandle;readonly carrierRoot?:RustBodyHandle;
  readonly children?:readonly RustBodyHandle[];readonly side?:-1|0|1;readonly rangeMultiplier?:number;readonly yamatoMuzzle?:readonly [number,number];
  readonly systems:readonly {readonly systemId:number;readonly kind:keyof typeof RustSystemKind}[];
  readonly bulkheads?:boolean;readonly fieldRepair?:boolean;readonly compensation?:boolean;
  readonly yamato?:{readonly damage:number;readonly emp:number;readonly range:number;readonly speed:number;readonly launchSpeed?:number;readonly speedBonus?:number;
    readonly weaponType?:keyof typeof RustWeaponType;readonly delivery:RustDeliverySpec};}
export interface RustGuidanceSpec {
  readonly rocket:boolean;readonly guided:boolean;readonly inertial?:boolean;readonly hitpoints?:number;
  readonly acceleration?:number;readonly maxSpeed?:number;readonly maxTurnRate?:number;readonly maxTurnAcceleration?:number;
  readonly guidanceBonus?:number;readonly eccmChance?:number;readonly renderTargetIndicator?:boolean;
  readonly mirv?:{readonly splitRange:number;readonly splitRangeRange:number;readonly minTime:number;readonly canSplitEarly:boolean;
    readonly shots:number;readonly damage:number;readonly emp:number;readonly damageType:RustDeliverySpec['damageType'];readonly childHitpoints:number;
    readonly evenSpread:boolean;readonly arcDeg:number;readonly inaccuracyDeg:number;readonly spreadSpeed:number;readonly spreadSpeedRange:number;
    readonly projectileRange:number;readonly childSpec:number;readonly childRadius?:number;readonly childSpawnType?:RustDeliverySpec['spawnType'];readonly childDelivery:RustDeliverySpec};
  readonly flare?:{readonly mode:'STANDARD'|'SEEKER'|'JAMMER';readonly effectRange:number;readonly effectChance:number;
    readonly flameoutTime:number;readonly fadeTime:number;readonly life:number};
}
export interface RustWorldShipConfig{
  readonly specId:string;readonly stableId:string;readonly shipName:string;readonly hullName:string;
  readonly explosionDamage:number;readonly explosionRadius:number;readonly breakProbability:number;readonly minPieces:number;readonly maxPieces:number;
  readonly explosionColor:readonly [number,number,number];readonly flashColor:readonly [number,number,number];readonly debrisColor:readonly [number,number,number];
  readonly transient?:boolean;readonly spriteHeight:number;readonly missileDamagePercent:number;readonly missileDamageMultiplier:number;
  readonly mass:number;readonly station?:boolean;readonly moduleOffset?:readonly [number,number];readonly moduleAngle?:number;readonly independentRotation?:boolean;
  readonly slots:readonly {readonly id:number;readonly position:readonly [number,number]}[];
}
/** Actual firing data installed once with each resident ordered mount. */
export interface RustFireSpec {
  readonly rangeInputs?:{readonly base:number;readonly percent:number;readonly multiplier:number;readonly flat:number;readonly threshold?:number;
    readonly pastMultiplier:number;readonly shipMultiplier:number;readonly authoredRange:number;readonly authoredSpeed:number;readonly speedBonus?:number;readonly carrierFlat?:number};
  readonly burstSize?:number;readonly interruptible?:boolean;readonly autoCharge?:boolean;
  readonly fluxPerShot?:number;readonly fluxPerSecond?:number;readonly beamChargeup?:number;readonly beamChargedown?:number;
  readonly beamDuration?:number;readonly beamFireOnlyFull?:boolean;readonly sustained?:boolean;
  readonly maxSpread?:number;readonly spreadPerShot?:number;readonly relativePos?:readonly [number,number];
  readonly damagePerShot?:number;readonly damagePerSecond?:number;readonly empPerShot?:number;readonly empPerSecond?:number;
  readonly recoilSpeed?:number;readonly pointDefense?:boolean;readonly offsets?:readonly (readonly [number,number])[];
  readonly rocket?:boolean;readonly dudProbability?:number;readonly flightTime?:number;readonly launchSpeed?:number;
  readonly range:number;readonly speed:number;readonly delivery:RustDeliverySpec;
}
/** Effective persistent attribute revisions. CR and arbitrary system modifier
 * producers are not admitted by this domain interface. */
export interface RustWeaponPolicy {
  readonly manual?:boolean;readonly blocked?:boolean;readonly phased?:boolean;readonly combatRepairMultiplier?:number;
  readonly underFire?:boolean;readonly malfunctionChance?:number;readonly criticalChance?:number;readonly currentCR?:number;
  readonly repairMultiplier?:number;readonly recoilMultiplier?:number;
  readonly rate?:readonly [number,number,number];readonly ammoRegen?:readonly [number,number,number];readonly selectedGroupIndex?:number;
}
export interface RustBodyHandle { readonly slot: number; readonly generation: number }
export interface RustReadinessConfig {
  readonly cr:number;readonly peakRemaining:number;readonly malfunctionRange?:number;readonly criticalChanceMultiplier?:number;
  readonly weaponChanceBonus?:number;readonly criticalChanceBonus?:number;readonly peakCRSeconds:number;readonly crLossPerSecond:number;
  readonly baseMovementMultiplier?:number;
}
export interface RustMineSpec {
  readonly weapon:1|2;readonly damage:number;readonly speed:number;readonly hp:number;readonly radius:number;readonly visualRadius:number;
  readonly acceleration:number;readonly trigger:number;readonly delay:number;readonly windup:number;readonly blastRadius:number;readonly blastCore:number;readonly blastDuration:number;
  readonly color:readonly[number,number,number];readonly glow:readonly[number,number,number];
}
export interface RustAuxPayload {readonly damage:number;readonly launchSpeed:number;readonly hp:number;readonly flight:number}
export interface RustAuxShip {
  readonly id:number;readonly handle:RustBodyHandle;readonly stealth?:1|2;readonly ineligible:boolean;readonly drone:boolean;
  readonly stealthHooks:number;readonly payloads:readonly[RustAuxPayload,RustAuxPayload];readonly travelSystems:readonly number[];
}
export type RustCommand =
  | {readonly kind:'initialize-ai-world';readonly id:number;readonly handle:RustBodyHandle;readonly data:RustAIAdmission}
  | {readonly kind:'initialize-motion-world';readonly id:number;readonly handle:RustBodyHandle;readonly data:RustMotionAdmission}
  | {readonly kind:'initialize-scene-world';readonly id:number;readonly handle:RustBodyHandle;readonly data:RustSceneAdmission}
  | {readonly kind:'scene-command';readonly id:number;readonly handle:RustBodyHandle;readonly command:RustSceneControl}
  | {readonly kind:'initialize-startup-random';readonly combat:readonly [number,number,number];readonly visual:readonly [number,number,number]}
  | {readonly kind:'initialize-phase-world';readonly id:number;readonly handle:RustBodyHandle;
      readonly ships:readonly {readonly id:number;readonly handle:RustBodyHandle;readonly anchorCRCost?:number}[];
      readonly controls:readonly {readonly id:number;readonly handle:RustBodyHandle;readonly systemId:number;readonly flags:number;readonly phase:boolean;readonly vulnerableUp:boolean;readonly vulnerableDown:boolean}[]}
  | {readonly kind:'initialize-constructor-state';readonly id:number;readonly handle:RustBodyHandle;readonly initial:RustConstructorSnapshot}
  | {readonly kind:'initialize-aux-world';readonly id:number;readonly handle:RustBodyHandle;readonly mines:readonly RustMineSpec[];readonly ships:readonly RustAuxShip[]}
  | {readonly kind:'deploy-mine';readonly id:number;readonly handle:RustBodyHandle;readonly point:readonly[number,number];readonly range:number}
  | { readonly kind: 'spawn'; readonly id: number; readonly motion: ArrayLike<number> }
  | { readonly kind: 'controls'; readonly id: number; readonly handle: RustBodyHandle;
      readonly turn: number; readonly brake: boolean; readonly throttle: number;
      readonly strafe: number; readonly flags: number }
  | { readonly kind: 'motion-stats'; readonly id: number; readonly handle: RustBodyHandle;
      readonly acceleration: number; readonly deceleration: number; readonly maxSpeed: number;
      readonly turnAcceleration: number; readonly maxTurnRate: number;
      readonly driftAcceleration: number; readonly strafeMultiplier: number }
  | { readonly kind: 'despawn'; readonly id: number; readonly handle: RustBodyHandle }
  | { readonly kind: 'initialize-ship'; readonly id: number; readonly handle: RustBodyHandle; readonly config: RustShipConfig }
  | { readonly kind: 'flux-stats'; readonly id: number; readonly handle: RustBodyHandle; readonly config: RustFluxConfig }
  | { readonly kind: 'clock-input'; readonly id: number; readonly handle: RustBodyHandle;
      readonly phaseTimeBonus: number; readonly phaseEffect: number; readonly externalTimeMultiplier: number }
  | { readonly kind: 'ship-flags'; readonly id: number; readonly handle: RustBodyHandle; readonly flags: number;
      readonly hardFluxDissipationFraction: number; readonly zeroFluxMinimum: number; readonly allowZeroFluxAtAnyLevel: number }
  | { readonly kind: 'flux'; readonly id: number; readonly handle: RustBodyHandle;
      readonly operation: RustFluxOperation; readonly amount?: number; readonly hard?: boolean }
  | { readonly kind: 'define-lifecycle'; readonly id: number; readonly spec: RustLifecycleSpec }
  | { readonly kind: 'install-system'; readonly id: number; readonly handle: RustBodyHandle; readonly systemId: number; readonly specId: number; readonly defense?: boolean }
  | { readonly kind: 'system'; readonly id: number; readonly handle: RustBodyHandle; readonly systemId: number; readonly operation: RustSystemOperation }
  | { readonly kind: 'dispatch-systems'; readonly id: number; readonly handle: RustBodyHandle }
  | { readonly kind: 'initialize-shield' | 'shield-stats'; readonly id: number; readonly handle: RustBodyHandle; readonly config: RustShieldConfig }
  | { readonly kind: 'shield-input'; readonly id: number; readonly handle: RustBodyHandle;
      readonly aimX: number; readonly aimY: number; readonly defenseAim?: number; readonly defenseBlocked?: boolean; readonly forcedPhaseEffect?: number }
  | { readonly kind: 'configure-void-shield'; readonly id: number; readonly handle: RustBodyHandle; readonly spec: RustVoidShieldSpec }
  | { readonly kind: 'shield'; readonly id: number; readonly handle: RustBodyHandle; readonly operation: RustShieldOperation }
  | { readonly kind: 'upkeep-stats'; readonly id: number; readonly handle: RustBodyHandle;
      readonly shieldMultiplier: number; readonly softFluxPerSecond: number; readonly hardFluxPerSecond: number }
  | { readonly kind: 'system-upkeep'; readonly id: number; readonly handle: RustBodyHandle; readonly systemId: number; readonly policy: RustUpkeepPolicy }
  | { readonly kind: 'shield-impact'; readonly id: number; readonly handle: RustBodyHandle;
      readonly damage: number; readonly damageType: 'ENERGY' | 'KINETIC' | 'HIGH_EXPLOSIVE' | 'FRAGMENTATION'; readonly hitAngle: number }
  | { readonly kind: 'shield-mitigation'; readonly id: number; readonly handle: RustBodyHandle;
      readonly damageMultiplier: number; readonly energyMultiplier: number; readonly externalMultiplier: number }
  | {readonly kind:'initialize-armor';readonly id:number;readonly handle:RustBodyHandle;readonly config:RustArmorConfig}
  | {readonly kind:'armor-stats';readonly id:number;readonly handle:RustBodyHandle;readonly stats:RustArmorStats}
  | {readonly kind:'armor-cell';readonly id:number;readonly handle:RustBodyHandle;readonly c:number;readonly r:number;readonly value:number}
  | {readonly kind:'armor-impact';readonly id:number;readonly handle:RustBodyHandle;readonly x:number;readonly y:number;
      readonly damage:number;readonly damageType:'ENERGY'|'KINETIC'|'HIGH_EXPLOSIVE'|'FRAGMENTATION';readonly hitStrength?:number;readonly isDps?:boolean;readonly applyHull?:boolean}
  | {readonly kind:'install-weapon-health';readonly id:number;readonly handle:RustBodyHandle;readonly config:RustWeaponHealthConfig}
  | {readonly kind:'component-damage';readonly id:number;readonly handle:RustBodyHandle;readonly componentId:number;readonly damage:number}
  | {readonly kind:'component-disable';readonly id:number;readonly handle:RustBodyHandle;readonly componentId:number;readonly permanent?:boolean}
  | {readonly kind:'component-repair-policy';readonly id:number;readonly handle:RustBodyHandle;readonly componentId:number;
      readonly canRepair:boolean;readonly multiplier:number;readonly underFire:boolean}
  | {readonly kind:'hull-damage';readonly id:number;readonly handle:RustBodyHandle;readonly damage:number}
  | {readonly kind:'sync-scars';readonly id:number;readonly handle:RustBodyHandle}
  | {readonly kind:'initialize-engines';readonly id:number;readonly handle:RustBodyHandle;
      readonly hullSize:keyof typeof RustHullSize;readonly radius:number;readonly healthMultiplier?:number;readonly slots:readonly RustEngineSlotConfig[]}
  | {readonly kind:'engine-policy';readonly id:number;readonly handle:RustBodyHandle;readonly canRepair:boolean;
      readonly repairMultiplier:number;readonly underFire:boolean;readonly malfunctionChance?:number;readonly criticalChance?:number}
  | {readonly kind:'engine-motion-stats';readonly id:number;readonly handle:RustBodyHandle;readonly stats:RustEngineMotionStats}
  | {readonly kind:'engine';readonly id:number;readonly handle:RustBodyHandle;readonly operation:RustEngineOperation;
      readonly index?:number;readonly damage?:number;readonly permanent?:boolean;readonly suppressMessage?:boolean}
  | {readonly kind:'damage-policy';readonly id:number;readonly handle:RustBodyHandle;readonly policy:RustDamagePolicy}
  | {readonly kind:'propagate-components';readonly id:number;readonly handle:RustBodyHandle;readonly x:number;readonly y:number;
      readonly armorDamage:number;readonly hullDamage:number;readonly emp:number;readonly source?:RustDamageSource}
  | {readonly kind:'armor-component-impact';readonly id:number;readonly handle:RustBodyHandle;readonly x:number;readonly y:number;
      readonly damage:number;readonly damageType:'ENERGY'|'KINETIC'|'HIGH_EXPLOSIVE'|'FRAGMENTATION';readonly hitStrength?:number;
      readonly isDps?:boolean;readonly applyHull?:boolean;readonly emp?:number;readonly source?:RustDamageSource}
  | {readonly kind:'initialize-weapons';readonly id:number;readonly handle:RustBodyHandle;readonly facing:number;
      readonly manual?:boolean;readonly mounts:readonly RustWeaponStateConfig[];readonly groups:readonly RustWeaponGroupConfig[]}
  | {readonly kind:'weapon-policy';readonly id:number;readonly handle:RustBodyHandle;readonly policy:RustWeaponPolicy}
  | {readonly kind:'weapon-critical';readonly id:number;readonly handle:RustBodyHandle;readonly componentId:number;readonly permanent?:boolean}
  | {readonly kind:'clear-weapon-events';readonly id:number;readonly handle:RustBodyHandle}
  | {readonly kind:'initialize-combat';readonly id:number;readonly handle:RustBodyHandle;readonly geometry:RustCombatGeometry}
  | {readonly kind:'combat-attributes';readonly id:number;readonly handle:RustBodyHandle;readonly attributes:RustCombatAttributes}
  | {readonly kind:'initialize-fire';readonly id:number;readonly handle:RustBodyHandle;readonly mounts:readonly RustFireSpec[]}
  | {readonly kind:'initialize-fire-query';readonly id:number;readonly handle:RustBodyHandle;readonly ship:RustFireQueryShip;readonly mounts:readonly RustFireQueryMount[]}
  | {readonly kind:'fire-controls';readonly id:number;readonly handle:RustBodyHandle;readonly aim:readonly [number,number];readonly trigger:boolean;
      readonly selectedGroup?:number;readonly target?:RustDamageSource;readonly holdFire?:boolean;readonly ai:boolean}
  | {readonly kind:'fire-query-policy';readonly id:number;readonly handle:RustBodyHandle;readonly index:number;readonly priority?:'ESCORT'|'SUPPRESS';
      readonly suspended?:boolean;readonly cadence?:'20hz'|'multirate';readonly systemAllows?:boolean}
  | {readonly kind:'group-autofire';readonly id:number;readonly handle:RustBodyHandle;readonly index:number;readonly enabled:boolean}
  | {readonly kind:'initialize-readiness';readonly id:number;readonly handle:RustBodyHandle;readonly config:RustReadinessConfig}
  | {readonly kind:'deploy-readiness';readonly id:number;readonly handle:RustBodyHandle;readonly cr:number;readonly controlsLocked?:boolean}
  | {readonly kind:'readiness-cr';readonly id:number;readonly handle:RustBodyHandle;readonly cr:number}
  | {readonly kind:'effect-attributes';readonly id:number;readonly handle:RustBodyHandle;readonly shieldPierced:number}
  | {readonly kind:'initialize-system-world';readonly id:number;readonly handle:RustBodyHandle;readonly config:RustSystemWorldConfig}
  | {readonly kind:'accepted-system';readonly id:number;readonly handle:RustBodyHandle;readonly systemId:number;readonly point:readonly [number,number];readonly facing?:number;readonly target?:RustDamageSource}
  | {readonly kind:'recoil-source';readonly id:number;readonly handle:RustBodyHandle;readonly index:number;readonly railgun:boolean;readonly pointDefenseRole?:boolean}
  | {readonly kind:'initialize-world-ship';readonly id:number;readonly handle:RustBodyHandle;readonly config:RustWorldShipConfig}
  | {readonly kind:'initialize-battle-world';readonly id:number;readonly handle:RustBodyHandle;readonly enemy:RustDamageSource;readonly asteroids:boolean}
  | {readonly kind:'initialize-gravity-world';readonly id:number;readonly handle:RustBodyHandle}
  | {readonly kind:'initialize-gravity-ship';readonly id:number;readonly handle:RustBodyHandle;readonly systems:readonly RustGravitySystemConfig[];readonly mounts:readonly RustGravityMountConfig[]}
  | {readonly kind:'initialize-gravity-collation';readonly id:number;readonly handle:RustBodyHandle;readonly shipRank:number;readonly prefixes?:readonly number[];readonly alphabet?:readonly number[]}
  | {readonly kind:'gravity-held';readonly id:number;readonly handle:RustBodyHandle;readonly field:boolean;readonly push:boolean}
  | {readonly kind:'configure-delivery-world';readonly id:number;readonly handle:RustBodyHandle;readonly mount:number;readonly child?:boolean;readonly config:RustDeliveryWorldSpec}
  | {readonly kind:'fire-intent';readonly id:number;readonly handle:RustBodyHandle;readonly index:number;readonly requested:boolean;
      readonly triggerHeld:boolean;readonly systemAllows?:boolean;readonly suspended?:boolean;readonly recheckFlux?:boolean;
      readonly target?:RustDamageSource;readonly angle:number};
export interface RustArmorSnapshot { readonly values:Float64Array;readonly cells:Float32Array;readonly scars:readonly Float64Array[] }
export interface RustReadinessSnapshot {readonly values:Float64Array;readonly targets:Float64Array}
export interface RustComponentSnapshot { readonly id:number;readonly values:Float64Array }
export interface RustEngineSnapshot {readonly values:Float64Array;readonly engines:readonly Float64Array[];readonly justDisabled:Float64Array}
export interface RustWeaponGroupSnapshot {readonly values:Float64Array;readonly members:Float64Array}
export interface RustWeaponSnapshot {readonly values:Float64Array;readonly mounts:readonly Float64Array[];
  readonly groups:readonly RustWeaponGroupSnapshot[];readonly justDisabled:Float64Array;readonly justRepaired:Float64Array}
export interface RustSystemSnapshot {
  readonly id: number; readonly specId: number; readonly values: Float64Array; readonly upkeep: Float64Array; readonly defense: boolean;
}
export interface RustShipSnapshot {
  readonly systemWorld?:Float64Array;readonly weaponRanges?:readonly Float64Array[];
  readonly flags: number; readonly flux: Float64Array; readonly clock: Float64Array;
  readonly hardFluxDissipationFraction: number; readonly zeroFluxMinimum: number; readonly allowZeroFluxAtAnyLevel: number;
  readonly systems: readonly RustSystemSnapshot[];
  readonly shield?: Float64Array;
  readonly armor?:RustArmorSnapshot;
  readonly components:readonly RustComponentSnapshot[];
  readonly damagePolicy:Float64Array;
  readonly engines?:RustEngineSnapshot;
  readonly weapons?:RustWeaponSnapshot;
  readonly fireMemories:readonly Float64Array[];
  readonly readiness?:RustReadinessSnapshot;
  readonly graviton?:{readonly multiplier:number;readonly hits:Float64Array};
}
export interface RustCoreEvent {
  readonly sequence: number; readonly tick: number; readonly id: number; readonly handle: RustBodyHandle;
  readonly systemId: number; readonly kind: number; readonly value: number;
  readonly detail:readonly [number,number];
}
export interface RustBodySnapshot {
  readonly id: number;
  readonly handle: RustBodyHandle;
  readonly order: number;
  /** Copy owned by this snapshot, never a view into Wasm mutable memory. */
  readonly motion: Float64Array;
  readonly ship?: RustShipSnapshot;
}
export interface RustCoreSnapshot {
  readonly world?:import('./RustWorldProtocol').RustWorldSnapshot;
  readonly tick: number;
  readonly combatTime: number;
  readonly random: readonly [number, number, number];
  readonly visualRandom: readonly [number, number, number];
  readonly domains: number;
  readonly fullBattleReady: false;
  readonly bodies: readonly RustBodySnapshot[];
  readonly projectiles:readonly Float64Array[];
  readonly guidance:readonly {readonly values:Float64Array;readonly immune:Float64Array}[];
  readonly beams:readonly Float64Array[];
  readonly beamEffects:readonly Float64Array[];
  readonly lastOrdnanceSerial:number;
  readonly events: readonly RustCoreEvent[];
  readonly lastEventSequence: number;
  readonly acknowledgedEventSequence: number;
}

const fluxOperations: readonly RustFluxOperation[] = ['shield-hit', 'increase', 'spend-soft', 'increase-clamped',
  'trigger-overload', 'force-overload', 'overload-for', 'start-vent', 'cancel-vent'];
const systemOperations: readonly RustSystemOperation[] = ['activate', 'interrupt', 'reset', 'enable', 'disable'];
const shieldOperations: readonly RustShieldOperation[] = ['toggle-raw', 'raise-raw', 'lower-raw', 'toggle-hull', 'vent-ship'];
const damageTypes = ['ENERGY', 'KINETIC', 'HIGH_EXPLOSIVE', 'FRAGMENTATION'] as const;
const engineOperations:readonly RustEngineOperation[]=['damage','disable','critical','force-flameout','restore','clear-events'];
function fluxConfigWords(config: RustFluxConfig): number[] {
  return [config.maxFlux, config.baseDissipation, config.hullSize, config.ventRateMultiplier ?? 1,
    config.overloadTimeMultiplier ?? 1, config.shieldSoftFluxConversion ?? 0, config.dissipationMultiplier ?? 1,
    config.boostDelay ?? 1];
}
function shieldConfigWords(c: RustShieldConfig): number[] {
  return [RustShieldType[c.type], c.maxArc, c.radius, c.efficiency, c.upkeepRate,
    c.unfoldMultiplier ?? 1, c.turnMultiplier ?? 1, c.phaseChargeUp ?? .5, c.phaseChargeDown ?? .5,
    c.phaseCooldown ?? 2, c.phaseActivationCost ?? 0, c.phaseUpkeep ?? 0, c.phaseThresholdMultiplier ?? 1,
    Number(c.toggleLocked ?? false), Number(c.phaseCannotOverload ?? true), c.centerX ?? 0, c.centerY ?? 0,
    Number(c.initialActive ?? false), Number(c.rightClickSystem ?? false)];
}
const spawnTypes=['ORDINARY','BALLISTIC','BALLISTIC_AS_BEAM','PLASMA','MISSILE'] as const;
function deliveryWords(d:RustDeliverySpec):number[]{
  return [spawnTypes.indexOf(d.spawnType),d.length??0,d.fadeTime??0,damageTypes.indexOf(d.damageType),
    RustWeaponType[d.weaponType??'NONE'],d.radius??0,Number(d.armingTime!==undefined),d.armingTime??0,d.angularVelocity??0,Number(d.flightTime!==undefined),d.flightTime??0,
    Number(d.sourceMissile??false),d.flameoutTime??0,d.missileFadeTime??0,Number(d.fizzleAtRange??false),Number(d.noCollisionWhileFading??false),
    Number(d.reduceDamageWhileFading??false),Number(d.collisionAfterFlameoutNone??false),d.beamSpeed??1400,Number(d.beamHardFlux??false)];
}
function effectWords(d:RustDeliverySpec,child=false):number[]{return [RustWeaponEffect[d.effect!],Number(d.highFrequency??false),d.beamWidth??12,
  ...(d.fringeColor??[255,255,255,255]),...(d.coreColor??[255,255,255,255]),Number(child)];}
function explosionWords(s:RustExplosionSpec|undefined):number[]{return s?[s.radius,s.core,s.duration,s.minimumFraction,['SHIPS_AND_ASTEROIDS','MISSILE_FF','MISSILE_NO_FF','PROJECTILE_FF','PROJECTILE_NO_FF','OTHER'].indexOf(s.collision),Number(s.noFriendlyFire??false)]:[0,0,0,0,0,0];}
function deliveryWorldRows(rows:number[][],h:number[],mount:number,child:boolean|2,c:RustDeliveryWorldSpec):void{
  if(c.gravityCoupling!==undefined&&c.gravityCoupling!=='MASS_DRIVER')throw Error('Invalid gravity coupling');
  const v=c.visual,m=v.missile,f=c.fuse,p=c.terrainPenetration,header=[...h,mount,Number(child)];
  rows.push([87,...header,Number(c.intercepts??false),Number(c.passMissiles??false),Number(c.passFighters??false),Number(c.passFightersDestroyed??false),Number(!!p),...(p??[0,0,0]),
    Number(!!m),m?.radius??0,...(m?.color??[0,0,0]),v.fuseColor[0],v.fuseColor[1],Number(m?.hitGlow??false),v.custom??0,Number(v.heavyTorpedo??false),c.hitpoints??0,v.fuseColor[2]]);
  rows.push([88,...header,Number(!!c.explosion),...explosionWords(c.explosion),Number(!!f),f?.range??0,f?.radius??0,Number(f?.core!==undefined),f?.core??0,...explosionWords(f?.sourceExplosion),Number(!!f?.sourceExplosion)]);
  rows.push([89,...header,v.hitGlowRadius,v.width,v.texture,v.scroll,v.pixels,Number(v.movingSpeed!==undefined),v.movingSpeed??0,Number(v.sourceMoveSpeed),...v.fringe,...v.core,c.beamHitRadius??0,c.beamHitBrighten??1]);
  if(!v.fuseSound.length)throw Error('Missing fuse sound');rows.push([90,...header,0]);
  const units=Array.from({length:v.fuseSound.length},(_,i)=>v.fuseSound.charCodeAt(i));for(let offset=0;offset<units.length;offset+=18){const chunk=units.slice(offset,offset+18);rows.push([91,...header,offset,chunk.length,...chunk]);}
  rows.push([92,...header,Number(c.isMine??false),Number(c.fizzleAtRange??false),Number(c.systemFuse!==undefined),c.systemFuse??0,Number(c.systemFadeIn!==undefined),c.systemFadeIn??0,Number(c.systemExplosionSound!==undefined),Number(c.gravityCoupling==='MASS_DRIVER'),Number(c.batchShipContacts??false)]);
  if(c.systemExplosionSound!==undefined){const sound=Array.from({length:c.systemExplosionSound.length},(_,i)=>c.systemExplosionSound!.charCodeAt(i));for(let offset=0;offset<sound.length;offset+=18){const chunk=sound.slice(offset,offset+18);rows.push([93,...header,offset,chunk.length,...chunk]);}}
}

/** One coarse command transaction. No world capture or object hydration. */
export function encodeRustCommands(commands: readonly RustCommand[]): Float64Array {
  const rows:number[][]=[],rowCounts:number[]=[];
  for(const command of commands){
    const firstRow=rows.length;
    if(command.kind==='initialize-motion-world'){
      rows.push(...encodeRustMotionAdmission(command.data,command.id,command.handle));
    }else if(command.kind==='initialize-ai-world'){
      rows.push(...encodeRustAIAdmission(command.data,command.id,command.handle));
    }else if(command.kind==='initialize-scene-world'){
      rows.push(...encodeRustSceneAdmission(command.data,command.id,command.handle));
    }else if(command.kind==='scene-command'){
      rows.push(...encodeRustSceneControl(command.command,command.id,command.handle));
    }else if(command.kind==='initialize-startup-random'){
      rows.push([104,0,0,0,...command.combat,...command.visual]);
    }else if(command.kind==='initialize-phase-world'){
      rows.push([118,command.id,command.handle.slot,command.handle.generation]);
      for(const s of command.ships)if(s.anchorCRCost!==undefined)rows.push([119,s.id,s.handle.slot,s.handle.generation,s.anchorCRCost]);
      for(const c of command.controls)rows.push([120,c.id,c.handle.slot,c.handle.generation,c.systemId,c.flags,Number(c.phase),Number(c.vulnerableUp),Number(c.vulnerableDown)]);
    }else if(command.kind==='initialize-constructor-state'){
      const h=[command.id,command.handle.slot,command.handle.generation],s=command.initial;
      const tracker=(t:RustStartupTracker|undefined)=>t?[t.repairDuration,t.hitAgo,t.interval,t.elapsed,Number(t.intervalElapsed)]:[0,0,0,0,0];
      rows.push([110,...h,s.components.length,s.engines.length,s.runtimeModifiers.length]);
      if ('armor' in s) {
        const a = s.armor as { readonly cells: readonly number[]; readonly dirtyVersion: number };
        rows.push([179,...h,a.cells.length,a.dirtyVersion]);
        for (let at = 0; at < a.cells.length; at += 20) rows.push([180,...h,at,Math.min(20,a.cells.length-at),...a.cells.slice(at,at+20)]);
        rows.push([181,...h]);
      }
      for(const c of s.components)rows.push([111,...h,c.componentId,c.health,c.maxHealth,Number(c.disabled),Number(c.permanent),c.disabledDuration,c.disabledTimer,Number(!!c.tracker),...tracker(c.tracker)]);
      for(const e of s.engines)rows.push([112,...h,e.index,e.health,e.maxHealth,Number(e.disabled),Number(e.permanent),...tracker(e.tracker),e.contribution,e.driftContribution,Number(e.temporary),Number(e.glowDisabled),e.thrust,e.previousThrust,e.spread,e.previousSpread]);
      const e=s.engineController,r=s.readiness;
      rows.push([113,...h,RustEngineState[e.state],e.cooldown,e.permanentFraction,e.sinceAcceleration,e.sinceSpread,Number(e.forcePending),Number(e.suppressMessage)]);
      rows.push([114,...h,r.cr,r.crAtDeployment??-1,r.peakRemaining,r.shieldTimer,r.shieldInterval,Number(r.shieldIntervalElapsed),r.sinceShieldDamage]);
      const sourceKeys:Readonly<Record<string,number>>={web_gloriana_emergency_bulkheads:1,phase_anchor:0xfffc0001,phase_anchor_emergency:0xfffc0002,shield_always_on:0xfffc0003,escort_package:0xfffc0004};
      const scalarKeys=['disableWeapons','disableDefense','disableMotion','disableVenting','disableSystems','collisionDisabled','visualAlphaMultiplier','sightRadiusFlat','sightRadiusPercent',
        'shieldDamageMultiplier','shieldUpkeepMultiplier','hullDamageMultiplier','armorDamageMultiplier','empDamageMultiplier','repairTimeMultiplier','timeMultiplier','beamDamageMultiplier','recoilMultiplier',
        'fighterDamageMultiplier','hardFluxPerSecond','softFluxPerSecond','speedFlat','speedPercent','accelerationFlat','decelerationFlat','dissipationMultiplier','zeroFluxBoostSuppressed',
        'accelerationPercent','decelerationPercent','turnRateFlat','turnRatePercent','turnAccelerationFlat','turnAccelerationPercent'] as const;
      const weaponKeys=['damageMultiplier','rateOfFireMultiplier','fluxCostMultiplier','rangePercent','projectileSpeedPercent','ammoRegenMultiplier'] as const;
      for(const source of s.runtimeModifiers){const key=sourceKeys[source.id];if(key===undefined)throw Error('Unsupported Rust runtime modifier source: '+source.id);
        const m=source.modifiers;
        for(const name of Object.keys(m))if(name!=='weapons'&&!scalarKeys.includes(name as typeof scalarKeys[number]))throw Error('Unsupported Rust modifier field: '+name);
        for(const [type,fields]of Object.entries(m.weapons??{})){if(!['BALLISTIC','ENERGY','MISSILE'].includes(type))throw Error('Unsupported Rust weapon modifier type: '+type);
          for(const name of Object.keys(fields??{}))if(!weaponKeys.includes(name as typeof weaponKeys[number]))throw Error('Unsupported Rust weapon modifier field: '+name);}
        const values=[...scalarKeys.map(k=>m[k]),...(['BALLISTIC','ENERGY','MISSILE']as const).flatMap(k=>weaponKeys.map(w=>m.weapons?.[k]?.[w]))];
        rows.push([115,...h,key,values.reduce<number>((mask,v,i)=>mask+(v===undefined?0:2**i),0)]);
        values.forEach((v,i)=>{if(v!==undefined)rows.push([116,...h,key,i,v]);});
      }
      rows.push([117,...h]);
    }else if(command.kind==='initialize-aux-world'){
      const h=[command.id,command.handle.slot,command.handle.generation];rows.push([105,...h]);
      for(const m of command.mines)rows.push([106,...h,m.weapon,m.damage,m.speed,m.hp,m.radius,m.visualRadius,m.acceleration,m.trigger,m.delay,m.windup,m.blastRadius,m.blastCore,m.blastDuration,...m.color,...m.glow]);
      for(const s of command.ships){const sh=[s.id,s.handle.slot,s.handle.generation];rows.push([107,...sh,s.stealth??0,Number(s.ineligible),Number(s.drone),s.stealthHooks,...s.payloads.flatMap(p=>[p.damage,p.launchSpeed,p.hp,p.flight])]);
        for(const id of s.travelSystems)rows.push([108,...sh,id]);}
    }else if(command.kind==='deploy-mine'){
      rows.push([109,command.id,command.handle.slot,command.handle.generation,...command.point,command.range]);
    }else if(command.kind==='configure-delivery-world'){
      deliveryWorldRows(rows,[command.id,command.handle.slot,command.handle.generation],command.mount,command.child??false,command.config);
    }else if(command.kind==='initialize-world-ship'){
      const h=[command.id,command.handle.slot,command.handle.generation],c=command.config;
      rows.push([82,...h,c.explosionDamage,c.explosionRadius,c.breakProbability,c.minPieces,c.maxPieces,...c.explosionColor,...c.flashColor,...c.debrisColor,Number(c.transient??false),c.spriteHeight,c.missileDamagePercent,c.missileDamageMultiplier]);
      [c.specId,c.shipName,c.hullName,c.stableId].forEach((s,field)=>{const units=Array.from({length:s.length},(_,i)=>s.charCodeAt(i));for(let offset=0;offset<units.length;offset+=19){const chunk=units.slice(offset,offset+19);rows.push([83,...h,field,offset,chunk.length,...chunk]);}});
      c.slots.forEach(s=>rows.push([84,...h,s.id,...s.position]));
      rows.push([86,...h,c.mass,Number(c.station??false),...(c.moduleOffset??[0,0]),c.moduleAngle??0,Number(c.independentRotation??false)]);
    }else if(command.kind==='initialize-battle-world'){
      rows.push([85,command.id,command.handle.slot,command.handle.generation,command.enemy.id,command.enemy.handle.slot,command.enemy.handle.generation,Number(command.asteroids)]);
    }else if(command.kind==='initialize-gravity-world'){
      rows.push([94,command.id,command.handle.slot,command.handle.generation]);
    }else if(command.kind==='initialize-gravity-ship'){
      const h=[command.id,command.handle.slot,command.handle.generation];
      const name=(id:number,mount:boolean,value:string)=>{const units=Array.from({length:value.length},(_,i)=>value.charCodeAt(i));
        for(let i=0;i<units.length;){let end=Math.min(i+18,units.length);if(end<units.length&&units[end-1]>=0xd800&&units[end-1]<=0xdbff)end--;const chunk=units.slice(i,end);rows.push([103,...h,id,Number(mount),i,chunk.length,...chunk]);i=end;}};
      for(const s of command.systems){rows.push([95,...h,s.systemId,RustGravityKind[s.kind]]);name(s.systemId,false,s.id);
        if(s.field){const f=s.field;rows.push([96,...h,s.systemId,Number(f.kind==='REPULSOR'),Number(f.cursorSpeed!==undefined),f.cursorSpeed??0,Number(f.linger!==undefined),f.linger??0,
          f.radius,f.placement,f.duration,f.shipStrength,f.projectileStrength,f.shipBudget,f.projectileBudget,f.maxShips,f.maxProjectiles]);}
        if(s.collapse){const c=s.collapse,a=c.auto;rows.push([97,...h,s.systemId,c.radius,c.damage,c.edge,c.maxShips,Number(!!a),a?.up??0,a?.active??0,a?.cost??0]);}
        if(s.maneuver){const m=s.maneuver;rows.push([98,...h,s.systemId,0,m.duration,m.maxTurn,m.turnRate,m.acceleration,m.minSpeed,m.minAim]);}
        if(s.push){const p=s.push;rows.push([98,...h,s.systemId,1,p.range,p.shipStrength,p.projectileStrength,p.fluxRate]);}
      }
      for(const m of command.mounts){if(m.tractor){const t=m.tractor;rows.push([99,...h,m.componentId,t.capture,t.projectileCapture,t.hold,t.recovery,t.anchorSpeed,t.strength,t.damping,t.fluxRate,
        Number(t.selfTow),Number(t.tidalDamage!==undefined),t.tidalDamage??0,Number(t.tidalFlux!==undefined),t.tidalFlux??0,Number(m.hardpoint)]);}
        else if(m.deflector){const d=m.deflector;rows.push([100,...h,m.componentId,d.impulse,d.budget,d.flux,d.interval,Number(m.hardpoint)]);}else throw Error('Missing gravity mount specification');name(m.componentId,true,m.id);}
    }else if(command.kind==='initialize-gravity-collation'){
      const h=[command.id,command.handle.slot,command.handle.generation];rows.push([101,...h,0,command.shipRank]);
      command.prefixes?.forEach((rank,i)=>rows.push([101,...h,1,rank,i]));command.alphabet?.forEach((rank,i)=>rows.push([101,...h,2,rank,'-.0123456789+e'.charCodeAt(i)]));
    }else if(command.kind==='gravity-held'){
      rows.push([102,command.id,command.handle.slot,command.handle.generation,Number(command.field),Number(command.push)]);
    }else if(command.kind==='initialize-system-world'){
      const h=[command.id,command.handle.slot,command.handle.generation],c=command.config,p=c.parent,a=c.carrierRoot;
      rows.push([73,...h,c.traits,Number(!!p),p?.slot??0,p?.generation??0,Number(!!a),a?.slot??0,a?.generation??0,c.children?.length??0,c.side??0,c.rangeMultiplier??1,
        Number(!!c.yamatoMuzzle),...(c.yamatoMuzzle??[0,0])]);
      c.systems.forEach(s=>rows.push([74,...h,s.systemId,RustSystemKind[s.kind]]));
      c.children?.forEach((s,i)=>rows.push([75,...h,i,s.slot,s.generation]));
      rows.push([78,...h,Number(c.bulkheads??false),Number(c.fieldRepair??false),Number(c.compensation??false)]);
      if(c.yamato){const y=c.yamato;rows.push([76,...h,y.damage,y.emp,y.range,y.speed,y.launchSpeed??y.speed,y.speedBonus??0,y.weaponType?RustWeaponType[y.weaponType]:0]);rows.push([77,...h,...deliveryWords(y.delivery)]);
        if(y.delivery.effect!==undefined&&y.delivery.effect!=='HyperionYamato')throw Error('Unsupported system launcher hit effect');
        if(y.delivery.guidance)throw Error('Unsupported guided system launcher');
        if(y.delivery.world)deliveryWorldRows(rows,h,0,2,y.delivery.world);}
    }else if(command.kind==='initialize-fire-query'){
      const h=[command.id,command.handle.slot,command.handle.generation],q=command.ship;
      rows.push([57,...h,q.visibility.length,q.scope.length,Number(q.player),Number(q.vast??false),Number(q.noFireThrough??false),Number(q.nativeThreat??true),
        q.pdIgnoresFlares??0,q.accuracy??1,q.finish,q.pressure,q.tieRank,Number(q.adaptiveBudget??false)]);
      q.visibility.forEach(v=>rows.push([58,...h,v.team,Number(v.visible)]));
      q.scope.forEach((s,i)=>rows.push([59,...h,i,s.id,s.handle.slot,s.handle.generation]));
      command.mounts.forEach((m,i)=>rows.push([60,...h,i,m.flags,m.hints,m.baseAngleDeg,m.arcDeg,m.turnRateDeg,m.sizeScale,m.accuracyBonus??0,
        Number(m.passFighters??false),Number(m.proximity!==undefined),m.proximity??0,m.schedulingSalt,m.initialIdle??15.1,Number(m.sampleHz20??false),Number(m.sampleNative??false)]));
    }else if(command.kind==='initialize-combat'){
      const h=[command.id,command.handle.slot,command.handle.generation],g=command.geometry;
      rows.push([49,...h,g.team,RustHullSize[g.hullSize],g.radius,g.bounds.length,Number(g.player!==undefined),Number(g.player??false)]);
      g.bounds.forEach((point,i)=>rows.push([50,...h,i,...point]));
    }else if(command.kind==='initialize-fire'){
      const h=[command.id,command.handle.slot,command.handle.generation];
      command.mounts.forEach((s,i)=>{
        rows.push([52,...h,i,s.burstSize??1,Number(s.interruptible??false),Number(s.autoCharge??false),s.fluxPerShot??0,s.fluxPerSecond??0,
          s.beamChargeup??0,s.beamChargedown??0,s.beamDuration??.001,Number(s.beamFireOnlyFull??false),Number(s.sustained??false),s.maxSpread??0,s.spreadPerShot??0,
          ...(s.relativePos??[0,0]),s.damagePerShot??0,s.damagePerSecond??0,s.empPerShot??0,s.empPerSecond??0,s.recoilSpeed??0,Number(s.pointDefense??false),s.offsets?.length??0]);
        rows.push([53,...h,i,Number(s.rocket??false),Number(s.delivery.sourceMissile??false),s.dudProbability??0,Number(s.flightTime!==undefined),s.flightTime??0,
          s.launchSpeed??s.speed,s.range,s.speed]);
        if(s.rangeInputs){const r=s.rangeInputs;rows.push([81,...h,i,r.base,r.percent,r.multiplier,r.flat,Number(r.threshold!==undefined),r.threshold??0,r.pastMultiplier,r.shipMultiplier,
          r.authoredRange,r.authoredSpeed,r.speedBonus??0,r.carrierFlat??0]);}
        s.offsets?.forEach((p,j)=>rows.push([54,...h,i,j,...p]));
        const d=s.delivery;
        rows.push([55,...h,i,...deliveryWords(d)]);
        const g=d.guidance;
        if(g){rows.push([67,...h,i,Number(g.rocket),Number(g.guided),Number(g.inertial??false),Number(g.hitpoints!==undefined),g.hitpoints??0,
          Number(g.acceleration!==undefined),g.acceleration??0,Number(g.maxSpeed!==undefined),g.maxSpeed??0,Number(g.maxTurnRate!==undefined),g.maxTurnRate??0,
          Number(g.maxTurnAcceleration!==undefined),g.maxTurnAcceleration??0,Number(g.guidanceBonus!==undefined),g.guidanceBonus??0,
          Number(g.eccmChance!==undefined),g.eccmChance??0,Number(g.renderTargetIndicator!==undefined),Number(g.renderTargetIndicator??false)]);
          const m=g.mirv;if(m){if(m.childDelivery.guidance)throw Error('Nested MIRV guidance is not admitted');
            rows.push([68,...h,i,m.splitRange,m.splitRangeRange,m.minTime,Number(m.canSplitEarly),m.shots,m.damage,m.emp,damageTypes.indexOf(m.damageType),m.childHitpoints,
              Number(m.evenSpread),m.arcDeg,m.inaccuracyDeg,m.spreadSpeed,m.spreadSpeedRange,m.projectileRange,m.childSpec,Number(m.childRadius!==undefined),m.childRadius??0,
              Number(m.childSpawnType!==undefined),spawnTypes.indexOf(m.childSpawnType??'BALLISTIC')]);
            rows.push([69,...h,i,...deliveryWords(m.childDelivery)]);}
          const f=g.flare;if(f)rows.push([70,...h,i,['STANDARD','SEEKER','JAMMER'].indexOf(f.mode),f.effectRange,f.effectChance,f.flameoutTime,f.fadeTime,f.life]);
        }
        if(d.effect)rows.push([71,...h,i,...effectWords(d)]);
        const child=d.guidance?.mirv?.childDelivery;if(child?.effect)rows.push([71,...h,i,...effectWords(child,true)]);
        if(d.world)deliveryWorldRows(rows,h,i,false,d.world);if(child?.world)deliveryWorldRows(rows,h,i,true,child.world);
      });
    }else if(command.kind==='initialize-engines'){
      rows.push([33,command.id,command.handle.slot,command.handle.generation,RustHullSize[command.hullSize],command.radius,
        command.healthMultiplier??1,command.slots.length]);
      command.slots.forEach((slot,index)=>rows.push([34,command.id,command.handle.slot,command.handle.generation,index,
        slot.x,slot.y,slot.width,slot.length,Number(slot.systemActivated??false),Number(slot.maneuver!==undefined),...(slot.maneuver??[0,0,0])]));
    } else if(command.kind==='initialize-weapons') {
      const header=[command.id,command.handle.slot,command.handle.generation];
      rows.push([41,...header,command.facing,command.mounts.length,command.groups.length,Number(command.manual??true)]);
      command.mounts.forEach((m,i)=>{
        rows.push([42,...header,i,m.componentId,RustWeaponType[m.type??'NONE'],Number(m.beam??false),Number(m.burstBeam??false),
          m.refireDelay,m.chargeTime??0,m.burstDelay??0,Number(m.beamBurstDelay!==undefined),m.beamBurstDelay??0,
          Number(m.maxAmmo!==undefined),m.maxAmmo??0,m.ammoRegen??0,m.minSpread||0,m.spreadDecay||5,Number(m.torpedoRack??false)]);
        const s=m.initial??{},ammo=s.ammo??m.maxAmmo??Number.POSITIVE_INFINITY;
        rows.push([43,...header,i,s.angle??command.facing,s.cooldown??0,ammo===Number.POSITIVE_INFINITY?0:ammo,s.recharge??0,
          s.lifecycleDt??0,s.burstRemaining??0,s.burstTimer??0,Number(s.burstReserved??false),RustFiringState[s.firingState??'IDLE'],
          s.firingTimer??0,Number(s.triggerHeld??false),s.cycleId??0,s.reloadDelay??0,s.recoil??0,s.glow??0,s.barrel??0,
          s.spread??m.minSpread??0,Number(s.loaded!==undefined),s.loaded?.[0]??0,s.loaded?.[1]??0,Number(ammo===Number.POSITIVE_INFINITY)]);
      });
      command.groups.forEach((g,i)=>{
        rows.push([44,...header,i,g.index,Number(g.mode==='ALTERNATING'),Number(g.autofire),g.alternatingIndex??0,
          Number(g.alternatingElapsed!==undefined),g.alternatingElapsed??0,Number(g.alternatingWasFiring!==undefined),Number(g.alternatingWasFiring??false),
          Number(g.alternatingJustSwitched!==undefined),Number(g.alternatingJustSwitched??false),g.members.length]);
        g.members.forEach((member,j)=>rows.push([45,...header,i,j,member]));
      });
    } else rows.push([]);
    rowCounts.push(rows.length-firstRow);
  }
  const words = new Float64Array(rows.length * RUST_COMMAND_WIDTH);
  let index=0;
  commands.forEach((command,commandIndex) => {
    if(rows[index].length){for(let i=0;i<rowCounts[commandIndex];i++){if(rows[index].length>RUST_COMMAND_WIDTH)throw Error('Rust command row exceeds ABI');words.set(rows[index],index*RUST_COMMAND_WIDTH);index++;}return;}
    const offset = index * RUST_COMMAND_WIDTH;
    index++;
    if(!('id' in command))throw Error('Missing encoded Rust global command');
    words[offset + 1] = command.id;
    if (command.kind === 'define-lifecycle') {
      const s = command.spec; words[offset] = 10;
      words.set([s.chargeUp, s.active, s.chargeDown, s.cooldown, s.maxCharges, s.initialCharges ?? -1,
        s.chargeRegen, s.fluxCostPerUse, s.flags, 0], offset + 4);
      return;
    }
    if (command.kind === 'spawn') {
      if (command.motion.length !== RUST_MOTION_WIDTH) throw new Error('Rust spawn motion layout differs');
      words[offset] = 1;
      for (let field = 0; field < RUST_MOTION_WIDTH; field++) words[offset + 4 + field] = command.motion[field];
      return;
    }
    words[offset + 2] = command.handle.slot;
    words[offset + 3] = command.handle.generation;
    const row = offset + 4;
    if (command.kind === 'controls') {
      words[offset] = 2;
      words[row + 7] = command.turn; words[row + 8] = Number(command.brake);
      words[row + 9] = command.throttle; words[row + 10] = command.strafe; words[row + 11] = command.flags;
    } else if (command.kind === 'motion-stats') {
      words[offset] = 3;
      words[row + 12] = command.acceleration; words[row + 13] = command.deceleration;
      words[row + 14] = command.maxSpeed; words[row + 15] = command.turnAcceleration;
      words[row + 16] = command.maxTurnRate; words[row + 17] = command.driftAcceleration;
      words[row + 18] = command.strafeMultiplier;
    } else if (command.kind === 'despawn') words[offset] = 4;
    else if (command.kind === 'initialize-ship') {
      const c = command.config; words[offset] = 5;
      words.set([...fluxConfigWords(c), c.softFlux ?? 0, c.hardFlux ?? 0, c.flags ?? 3,
        c.phaseTimeBonus ?? 1, c.phaseEffect ?? 0, c.externalTimeMultiplier ?? 1,
        c.hardFluxDissipationFraction ?? 0, c.zeroFluxMinimum ?? 0, c.allowZeroFluxAtAnyLevel ?? 0], row);
    } else if (command.kind === 'flux-stats') { words[offset] = 6; words.set(fluxConfigWords(command.config), row); }
    else if (command.kind === 'clock-input') {
      words[offset] = 7; words.set([command.phaseTimeBonus, command.phaseEffect, command.externalTimeMultiplier], row);
    } else if (command.kind === 'ship-flags') {
      words[offset] = 8; words.set([command.flags, command.hardFluxDissipationFraction,
        command.zeroFluxMinimum, command.allowZeroFluxAtAnyLevel], row);
    } else if (command.kind === 'flux') {
      words[offset] = 9; words.set([fluxOperations.indexOf(command.operation), command.amount ?? 0, Number(command.hard ?? false)], row);
    } else if (command.kind === 'install-system') {
      words[offset] = 11; words.set([command.systemId, command.specId, Number(command.defense ?? false)], row);
    } else if (command.kind === 'system') {
      words[offset] = 12; words.set([command.systemId, systemOperations.indexOf(command.operation)], row);
    } else if (command.kind === 'dispatch-systems') words[offset] = 13;
    else if (command.kind === 'initialize-shield' || command.kind === 'shield-stats') {
      words[offset] = command.kind === 'initialize-shield' ? 14 : 15; words.set(shieldConfigWords(command.config), row);
    } else if (command.kind === 'shield-input') {
      words[offset] = 16; words.set([command.aimX, command.aimY, Number(command.defenseAim !== undefined), command.defenseAim ?? 0,
        Number(command.defenseBlocked ?? false), Number(command.forcedPhaseEffect !== undefined), command.forcedPhaseEffect ?? 0], row);
    } else if (command.kind === 'configure-void-shield') {
      const s = command.spec; words[offset] = 17; words.set([s.layers,s.integrityPerLayer,s.rechargePerSecond,s.hitDelay,s.restartDelay], row);
    } else if (command.kind === 'shield') {
      words[offset] = 18; words[row] = shieldOperations.indexOf(command.operation);
    } else if (command.kind === 'upkeep-stats') {
      words[offset] = 19; words.set([command.shieldMultiplier,command.softFluxPerSecond,command.hardFluxPerSecond], row);
    } else if (command.kind === 'system-upkeep') {
      const p = command.policy; words[offset] = 20;
      words.set([command.systemId,p.gate,p.softFluxPerSecond ?? 0,p.hardFluxPerSecond ?? 0,p.hardFluxCapacityFraction ?? 0,
        p.shieldUpkeepBase ?? 1,p.shieldUpkeepEffectSlope ?? 0,p.controls ?? 0,p.zeroFluxBoostSuppressed ?? 0], row);
    } else if (command.kind === 'shield-impact') {
      words[offset] = 21; words.set([command.damage,damageTypes.indexOf(command.damageType),command.hitAngle], row);
    } else if (command.kind === 'shield-mitigation') {
      words[offset] = 22; words.set([command.damageMultiplier,command.energyMultiplier,command.externalMultiplier], row);
    } else if(command.kind==='initialize-armor') {
      const c=command.config;words[offset]=23;
      words.set([c.cols,c.rows,c.cellWidth,c.cellHeight,c.armorRating,c.minX??-c.cols*c.cellWidth/2,c.minY??-c.rows*c.cellHeight/2,
        c.maxHull,c.hullHp??c.maxHull,c.effectiveMultiplier??1,c.dynamicMultiplier??1,c.maxReduction??.85,c.minResidualMultiplier??1,
        Number(c.scarsEnabled??true),Number(c.scarsSuppressed??false),Number(c.hullSuppressed??false),Number(c.vastBulk??false)],row);
    } else if(command.kind==='armor-stats') {
      const s=command.stats;words[offset]=24;
      if(s.incoming.length!==8)throw Error('Rust armor multiplier layout differs');
      words.set([s.effectiveMultiplier,s.dynamicMultiplier,s.maxReduction,s.minResidualMultiplier,...s.incoming,
        Number(s.hullSuppressed??false),Number(s.vastBulk??false),Number(s.scarsSuppressed??false)],row);
    } else if(command.kind==='armor-cell') {
      words[offset]=25;words.set([command.c,command.r,command.value],row);
    } else if(command.kind==='armor-impact') {
      words[offset]=26;words.set([command.x,command.y,command.damage,damageTypes.indexOf(command.damageType),
        Number(command.hitStrength!==undefined),command.hitStrength??0,Number(command.isDps??false),Number(command.applyHull??false)],row);
    } else if(command.kind==='install-weapon-health') {
      const c=command.config;words[offset]=27;words.set([c.componentId,RustWeaponSize[c.size],RustWeaponMount[c.mount],c.x??0,c.y??0,
        c.healthMultiplier??1,Number(c.deferTracker??false)],row);
    } else if(command.kind==='component-damage') {
      words[offset]=28;words.set([command.componentId,command.damage],row);
    } else if(command.kind==='component-disable') {
      words[offset]=29;words.set([command.componentId,Number(command.permanent??false)],row);
    } else if(command.kind==='component-repair-policy') {
      words[offset]=30;words.set([command.componentId,Number(command.canRepair),command.multiplier,Number(command.underFire)],row);
    } else if(command.kind==='hull-damage') {words[offset]=31;words[row]=command.damage;
    } else if(command.kind==='sync-scars') {words[offset]=32;
    } else if(command.kind==='engine-policy') {
      words[offset]=35;words.set([Number(command.canRepair),command.repairMultiplier,Number(command.underFire),command.malfunctionChance??0,command.criticalChance??0],row);
    } else if(command.kind==='engine-motion-stats') {
      const s=command.stats;words[offset]=36;words.set([s.accelerationBase,s.accelerationPercent,s.accelerationMultiplier,
        s.decelerationBase,s.decelerationPercent,s.decelerationMultiplier,s.speedBase,s.speedPercent,s.speedMultiplier,
        s.turnAccelerationBaseDeg,s.turnAccelerationPercent,s.turnAccelerationMultiplier,s.turnRateBaseDeg,s.turnRatePercent,s.turnRateMultiplier,
        s.terrainMultiplier,s.readinessMultiplier,s.specAcceleration,s.specTurnAccelerationDeg,s.zeroFluxSpeedBonus,s.zeroFluxTurnMultiplier],row);
    } else if(command.kind==='engine') {
      words[offset]=37;words.set([engineOperations.indexOf(command.operation),command.index??0,
        command.operation==='damage'?command.damage??0:command.operation==='force-flameout'?Number(command.suppressMessage??false):Number(command.permanent??false)],row);
    } else if(command.kind==='damage-policy') {
      const p=command.policy;words[offset]=38;words.set([p.empMultiplier,p.weaponMultiplier,p.engineMultiplier,p.damageToWeapons,p.damageToEngines,
        p.baseCriticalDamage,p.criticalDamageMultiplier,p.crDamageMultiplier],row);
    } else if(command.kind==='propagate-components') {
      const s=command.source;words[offset]=39;words.set([command.x,command.y,command.armorDamage,command.hullDamage,command.emp,
        Number(s!==undefined),s?.id??0,s?.handle.slot??0,s?.handle.generation??0],row);
    } else if(command.kind==='armor-component-impact') {
      const s=command.source;words[offset]=40;words.set([command.x,command.y,command.damage,damageTypes.indexOf(command.damageType),
        Number(command.hitStrength!==undefined),command.hitStrength??0,Number(command.isDps??false),Number(command.applyHull??false),command.emp??0,
        Number(s!==undefined),s?.id??0,s?.handle.slot??0,s?.handle.generation??0],row);
    } else if(command.kind==='weapon-policy') {
      const p=command.policy;words[offset]=46;words.set([Number(p.manual??true),Number(p.blocked??false),Number(p.phased??false),
        p.combatRepairMultiplier??1,Number(p.underFire??false),p.malfunctionChance??0,p.criticalChance??0,p.currentCR??.7,
        p.repairMultiplier??1,p.recoilMultiplier??1,...(p.rate??[1,1,1]),...(p.ammoRegen??[1,1,1]),p.selectedGroupIndex??0],row);
    } else if(command.kind==='weapon-critical') {words[offset]=47;words.set([command.componentId,Number(command.permanent??true)],row);
    } else if(command.kind==='clear-weapon-events') {words[offset]=48;
    }else if(command.kind==='combat-attributes'){
      const a=command.attributes;words[offset]=51;words.set([Number(a.collisionDisabled??false),a.damageTaken??1,a.shieldDamage??1,
        a.pointDefenseSkill??0,a.targetAnalysisSkill??0,a.energyMasterySkill??0,a.damageToFightersPercent??0,a.damageToFightersMultiplier??1,
        a.damageToFrigatesPercent??0,a.damageToDestroyersPercent??0,a.damageToCruisersPercent??0,a.damageDealt??1,a.fluxCost??1,a.recoil??1,
        ...(a.weaponDamage??[1,1,1]),a.beamDamage??1,a.ecmPenalty??0,Number(a.ai??false)],row);
    }else if(command.kind==='fire-controls'){
      const t=command.target;words[offset]=61;words.set([...command.aim,Number(command.trigger),Number(command.selectedGroup!==undefined),command.selectedGroup??0,
        Number(t!==undefined),t?.id??0,t?.handle.slot??0,t?.handle.generation??0,Number(command.holdFire??false),Number(command.ai)],row);
    }else if(command.kind==='fire-query-policy'){
      words[offset]=62;words.set([command.index,command.priority==='ESCORT'?1:command.priority==='SUPPRESS'?2:0,Number(command.suspended??false),
        command.cadence==='20hz'?1:command.cadence==='multirate'?2:0,Number(command.systemAllows??true)],row);
    }else if(command.kind==='group-autofire'){
      words[offset]=63;words.set([command.index,Number(command.enabled)],row);
    }else if(command.kind==='initialize-readiness'){
      const c=command.config;words[offset]=64;words.set([c.cr,c.peakRemaining,c.malfunctionRange??1,c.criticalChanceMultiplier??1,
        c.weaponChanceBonus??0,c.criticalChanceBonus??0,c.peakCRSeconds,c.crLossPerSecond,c.baseMovementMultiplier??1],row);
    }else if(command.kind==='deploy-readiness'){
      words[offset]=65;words.set([command.cr,Number(command.controlsLocked??false)],row);
    }else if(command.kind==='readiness-cr'){
      words[offset]=66;words[row]=command.cr;
    }else if(command.kind==='effect-attributes'){
      words[offset]=72;words[row]=command.shieldPierced;
    }else if(command.kind==='accepted-system'){
      const t=command.target;words[offset]=80;words.set([command.systemId,...command.point,command.facing??0,Number(!!t),t?.id??0,t?.handle.slot??0,t?.handle.generation??0],row);
    }else if(command.kind==='recoil-source'){
      words[offset]=79;words.set([command.index,Number(command.railgun),Number(command.pointDefenseRole??false)],row);
    }else if(command.kind==='fire-intent'){
      const t=command.target;words[offset]=56;words.set([command.index,Number(command.requested),Number(command.triggerHeld),Number(command.systemAllows??true),
        Number(command.suspended??false),Number(command.recheckFlux??true),0,Number(t!==undefined),t?.id??0,t?.handle.slot??0,t?.handle.generation??0,command.angle],row);
    }
  });
  return words;
}
