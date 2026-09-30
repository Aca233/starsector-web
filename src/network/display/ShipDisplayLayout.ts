// ShipDisplayLane v3 adds authoritative maxHullHp for target-aware reconstruction materials.
import type {
  RenderEngineStatus, RenderFlux, RenderShield, RenderSystem, RenderWeapon, ShipRenderState,
} from '../../engine/render/ShipRenderState';

/** Reject optional and non-scalar properties at compile time; the lists below
 * are deliberately explicit, never discovered by enumerating a simulation. */
type RequiredScalarKey<T, Scalar> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : T[K] extends Scalar ? K : never;
}[keyof T] & string;

/** Fixed display-only layout. Array order is the wire contract: numbers first,
 * then booleans (canonical 0/1), each occupying one Float64 element. A layout
 * change requires the parent encoder/decoder to agree on a new packet version.
 *
 * Computed scalar properties are SAMPLED by the encoder, not recomputed here.
 * This is not a simulation/checkpoint layout and does not enable any transport.
 * No lossy Float32 conversion, enum coercion, optional-value sentinel or model
 * traversal belongs in this layer.
 *
 * Metadata / separately bound nested views (not entries in these lists):
 * - Ship: id, spec, pos/prevPos/vel, playerTargetId, visibilityOverflow,
 *   phaseGhosts, scorchMarks, shield/flux/armor/engineController,
 *   engineStatuses, weapons/weaponGroups, system/allSystems, sourceCarrier.
 * - Projected ship queries also require weaponRanges (keyed by the actual
 *   projected weapon identities) and presentationPose (possibly undefined).
 * - Shield: type, phaseState, hitSegmentLevels (Float32Array, NOT a scalar).
 * - Flux: hullSize is a string union, NOT a number.
 * - System: type, state, definition.visuals, optional teleportVisual; the
 *   projected-only pulseOffset is supplied by the parent metadata lane.
 * - Weapon: slotId, spec, mountType, relativePos, plus the OPTIONAL number
 *   presentationRelativeAngle. Preserve undefined; zero means a real angle.
 * - armor.cellWidth and engineController.flameAccelerating stay on their own
 *   nested views; do not flatten them into unrelated ship properties.
 *
 * Vector2 objects need stable read-only buffer-backed x/y views supplied by the
 * parent; never replace a Vector2 with a number or expose writable authority
 * vectors. Renderer-only until local prediction has a separate safe contract.
 */
export const SHIP_NUMBERS = Object.freeze([
  'facingRad',
  'prevFacingRad',
  'angularVelRad',
  'hullHp',
  'maxHullHp',
  'teamId',
  'visibilityMask',
  'phaseVisualAlpha',
  'engineBoostLevel',
  'prevEngineBoostLevel',
  'scorchMarkVersion',
  'selectedGroupIndex',
] as const satisfies readonly RequiredScalarKey<ShipRenderState, number>[]);

export const SHIP_BOOLEANS = Object.freeze([
  'isDead',
  'isDocked',
  'isRetreated',
  'isAttachedModule',
] as const satisfies readonly RequiredScalarKey<ShipRenderState, boolean>[]);

export const SHIELD_NUMBERS = Object.freeze([
  'facingAngleRad',
  'phaseCooldownLevel',
  'phaseEffectLevel',
  'radius',
  'renderArcRad',
  'visualAlpha',
] as const satisfies readonly RequiredScalarKey<RenderShield, number>[]);

export const SHIELD_BOOLEANS = Object.freeze([
  'isPhaseEngaged',
  'isVisuallyDeployed',
] as const satisfies readonly RequiredScalarKey<RenderShield, boolean>[]);

export const FLUX_NUMBERS = Object.freeze([
  'fluxPercent',
  'hardFlux',
  'maxFlux',
  'overloadTimer',
] as const satisfies readonly RequiredScalarKey<RenderFlux, number>[]);

export const FLUX_BOOLEANS = Object.freeze([
  'isOverloaded',
  'isVenting',
] as const satisfies readonly RequiredScalarKey<RenderFlux, boolean>[]);

export const SYSTEM_NUMBERS = Object.freeze([
  'activationSerial',
  'effectLevel',
  'fortressVisualLevel',
] as const satisfies readonly RequiredScalarKey<RenderSystem, number>[]);

export const SYSTEM_BOOLEANS = Object.freeze([
  'available',
  'disabled',
  'isActive',
] as const satisfies readonly RequiredScalarKey<RenderSystem, boolean>[]);

export const WEAPON_NUMBERS = Object.freeze([
  'arcDeg',
  'baseAngleDeg',
  'currentAngleRad',
  'currentSpreadDeg',
  'glowAlpha',
  'recoil',
] as const satisfies readonly RequiredScalarKey<RenderWeapon, number>[]);

export const WEAPON_BOOLEANS = Object.freeze([
  'isDisabled',
] as const satisfies readonly RequiredScalarKey<RenderWeapon, boolean>[]);

export const ENGINE_NUMBERS = Object.freeze([
  'prevThrust',
  'currentThrust',
  'prevSpread',
  'spread',
] as const satisfies readonly RequiredScalarKey<RenderEngineStatus, number>[]);
