/** Mandatory read publication. These facts never carry a TS simulator/callback. */
import type { RustBodyHandle, RustBodySnapshot } from './RustCoreProtocol';
import type { ShipRenderState, RenderSystem, RenderWeapon } from '../../render/ShipRenderState';
import type { CombatRenderView } from '../../render/CombatRenderView';
import type { HudShip, HudSystem } from '../CombatHudView';
import type { DeploymentRow } from '../../simulation/CombatDeployment';
import type { DetachedCombatPresentation } from '../local/CombatPresentationWire';
import type { TacticalOrder } from '../../simulation/CombatTypes';
import type { CombatAudioEvent } from '../../audio/CombatAudioEvents';
import type { EmpArc } from '../../simulation/CombatTypes';
import type { FloatingText, RadioMessage } from '../../simulation/CombatTypes';
import type { Projectile, Beam } from '../../simulation/Weapon';

/** Non-ABI art/birth values and exact cross-category hit order. Every running
 * numeric lifecycle value still comes from the completed Rust publication. */
export const RUST_PROJECTILE_PRESENTATION_FIELDS = ['interceptsMissiles', 'isMine', 'fizzleAtRange', 'systemFuseSeconds', 'systemFadeInSeconds',
  'systemExplosionSound', 'isFlare', 'flareLife', 'flareMaxLife', 'isFighterDecoy', 'spriteAlphaOverride', 'visualSpawnType',
  'movingRayMoveSpeed', 'barrelOffset', 'sourceDamageMultiplier', 'gravityCoupling', 'maxFlightTime', 'missileRangeOrigin',
  'sourceWeaponType', 'damagedTargetIds', 'empResistance', 'inertialFlight', 'angularVelocityRad', 'proximityExplosionSpec', 'flareBehavior', 'mote', 'maxHitpoints', 'maxSpeed', 'isRocket', 'isGuided', 'ballisticTail', 'prevBallisticTail', 'missileExplosionVisualSpec', 'color'] as const satisfies readonly (keyof Projectile)[];
export type RustProjectilePresentationValues = Readonly<Pick<Projectile, typeof RUST_PROJECTILE_PRESENTATION_FIELDS[number] | 'targetProjectileId'>>;

export interface RustPresentationSystemDefinition {
  readonly type: string; readonly name: string; readonly description: string; readonly available: boolean;
  readonly maxCharges: number; readonly visuals: RenderSystem['definition']['visuals'];
  readonly gravityField: HudSystem['definition']['gravityField']; readonly gravityCollapse: HudSystem['definition']['gravityCollapse'];
  readonly charges: HudSystem['definition']['charges']; readonly audio: HudSystem['definition']['audio'];
}
export interface RustPresentationSystemFact {
  readonly systemId: number; readonly definition: RustPresentationSystemDefinition;
  /** Includes asynchronous execution (Yamato), not just lifecycleActive. */
  readonly isActive: boolean; readonly activationFailureReason: string | undefined;
  readonly statusText: string | undefined; readonly passiveStatusText: string | undefined;
  readonly fortressVisualLevel: number; readonly pulseOffset: number;
  readonly gravityControlHeld: boolean; readonly gravityPolarity: RenderSystem['gravityPolarity'];
  readonly gravityField: RenderSystem['gravityField']; readonly gravityPush: RenderSystem['gravityPush'];
  readonly gravityManeuver: RenderSystem['gravityManeuver']; readonly teleportVisual: RenderSystem['teleportVisual'];
}
export interface RustPresentationWeaponFact {
  readonly componentId: number; readonly weaponKey: string; readonly slotId: string;
  readonly relativePos: readonly [number, number]; readonly mountType: RenderWeapon['mountType'];
  readonly arcDeg: number; readonly baseAngleDeg: number; readonly range: number;
  readonly presentationRelativeAngle: number | undefined;
  readonly gravityTractor: RenderWeapon['gravityTractor']; readonly gravityDeflection: RenderWeapon['gravityDeflection'];
}
export interface RustPresentationShipFact {
  readonly id: number; readonly handle: RustBodyHandle; readonly stableId: string; readonly specKey: string; readonly team: number;
  /** Constructor copy for an undeployed reserve only; never a live body overwrite. */
  readonly reserveInitial: RustBodySnapshot | undefined;
  readonly parent: RustBodyHandle | undefined; readonly sourceCarrier: RustBodyHandle | undefined;
  readonly previousPosition: readonly [number, number]; readonly previousFacing: number;
  readonly playerTargetId: string | null; readonly visibilityMask: number; readonly visibilityOverflow: string;
  readonly isPhased: boolean; readonly shipName: string; readonly flightDeckWingId: string | undefined;
  readonly isSystemDrone: boolean; readonly sightRadius: number;
  readonly isFiringMain: boolean; readonly fighterRecall: boolean;
  readonly combatWeaponRepairTimeMultiplier: number; readonly flameoutRatio: number;
  readonly significantEnemiesInRange: boolean;
  readonly phaseVisualAlpha: number; readonly phaseGhosts: ShipRenderState['phaseGhosts'];
  readonly engineBoostLevel: number; readonly previousEngineBoostLevel: number;
  readonly surfaceFeedback: ShipRenderState['surfaceFeedback']; readonly shieldHitSegmentLevels: Float32Array;
  readonly teleportCameraOffset: HudShip['teleportCameraOffset'];
  readonly presentationPose: { readonly position: readonly [number, number]; readonly facing: number } | undefined;
  readonly primarySystemId: number; readonly tacticalSystemIds: readonly number[]; readonly defenseSystemId: number | undefined;
  readonly systems: readonly RustPresentationSystemFact[]; readonly mounts: readonly RustPresentationWeaponFact[];
}
export interface RustPresentationDeploymentFacts {
  readonly available: boolean; readonly enabled: boolean; readonly limit: number;
  readonly rows: readonly DeploymentRow[];
  readonly simulation: boolean; readonly simulationLimit: number; readonly allyUsed: number; readonly enemyUsed: number;
}
export interface RustPresentationFacts {
  readonly version: 1; readonly epoch: number; readonly revision: number; readonly tick: number;
  readonly playerId: string; readonly enemyId: string; readonly manualWeaponId: string; readonly targetId: string | null;
  /** Actual semantic source rosters, including dead hulls where the source retains them. */
  readonly rosters: { readonly ships: readonly string[]; readonly capitalShips: readonly string[]; readonly allCapitalShips: readonly string[];
    readonly fighters: readonly string[]; readonly bombers: readonly string[] };
  readonly ships: readonly RustPresentationShipFact[];
  readonly playerWings: readonly { readonly specId: string; readonly carrierId: string; readonly wingId: string; readonly name: string; readonly maxCrafts: number; readonly crr: number }[];
  readonly enemyWings: RustPresentationFacts['playerWings'];
  readonly deployment: RustPresentationDeploymentFacts;
  readonly tactical: { readonly available: boolean; readonly commandPoints: number; readonly selectedUnitId: string | null;
    readonly isTacticalMap: boolean; readonly orders: ReadonlyMap<string, Readonly<TacticalOrder>> };
  readonly openBattlefield: boolean; readonly multiTeamBattle: boolean;
  readonly battleResult: DetachedCombatPresentation['hud']['battleResult']; readonly isBattleResultReady: boolean;
  readonly notificationTime: number; readonly shipLossNotifications: DetachedCombatPresentation['hud']['shipLossNotifications'];
  readonly environment: CombatRenderView['environment']; readonly cameraShakeIntensity: number;
  readonly sceneTexts: readonly FloatingText[]; readonly radio: readonly RadioMessage[];
  /** Factories have already sampled native visual RNG and advanced at the real FX barrier. */
  readonly asteroidSprites: readonly string[];
  readonly visuals: Pick<CombatRenderView, 'particles' | 'contrails' | 'debris' | 'explosions' | 'hitGlows'
    | 'mines' | 'muzzleFlashes' | 'muzzleParticles' | 'shieldRipples' | 'movingRayFades'
    | 'projectileVisuals' | 'projectileFlight' | 'projectilePrediction' | 'localMuzzles' | 'localParticles'> & {
      readonly empArcs: readonly (Omit<EmpArc, 'native'> & { readonly native?: Omit<NonNullable<EmpArc['native']>, 'anchor'> & { readonly anchor: RustBodyHandle } })[];
      readonly trailStrips: readonly (CombatRenderView['trailStrips'] extends IterableIterator<infer T> ? T : never)[];
    };
  /** Render art binding for every live ordnance serial, including generated shots. */
  readonly ordnance: { readonly projectiles: readonly { readonly serial: number; readonly weaponKey: string; readonly sourceSlotId: string | undefined;
      readonly isPlayer: boolean | undefined; readonly presentFields: readonly (keyof Projectile)[]; readonly presentation: RustProjectilePresentationValues }[];
    readonly beams: readonly { readonly serial: number; readonly weaponKey: string; readonly sourceSlotId: string | undefined;
      readonly maxDuration: number; readonly scaleGlowBasedOnDamageEffectiveness: boolean | undefined; readonly barrelValue?: boolean; readonly rayValue?: boolean; readonly empValue?: boolean; readonly presentFields: readonly (keyof Beam)[] }[] };
  readonly audio: { readonly sequence: number; readonly events: readonly CombatAudioEvent[] };
}
