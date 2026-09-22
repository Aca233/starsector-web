import type { Ship } from '../simulation/Ship';
import type { Shield } from '../simulation/Shield';
import type { ShipSystem } from '../simulation/ShipSystem';
import type { FluxTracker } from '../simulation/FluxTracker';
import type { WeaponMount, WeaponSpec } from '../simulation/Weapon';
import type { HulkFragment } from '../simulation/CombatTypes';

/** Audited renderer reads. No update, damage, AI, fire-control or command capabilities.
 * Nested legacy vectors/content are borrowed on the inline path; do not mutate them.
 * This is the renderer boundary, NOT the complete tactical HUD or a checkpoint. */
export type RenderShield = Readonly<Pick<Shield, 'facingAngleRad' | 'hitSegmentLevels' | 'isPhaseEngaged' | 'isVisuallyDeployed' | 'phaseCooldownLevel' | 'phaseEffectLevel' | 'phaseState' | 'radius' | 'renderArcRad' | 'type' | 'visualAlpha'>>;
export type RenderSystem = Readonly<Pick<ShipSystem, 'activationSerial' | 'available' | 'disabled' | 'effectLevel' | 'fortressVisualLevel' | 'isActive' | 'state' | 'teleportVisual' | 'type'>> & { readonly definition: Pick<ShipSystem['definition'], 'visuals'> };
export type RenderFlux = Readonly<Pick<FluxTracker, 'fluxPercent' | 'hardFlux' | 'hullSize' | 'isOverloaded' | 'isVenting' | 'maxFlux' | 'overloadTimer'>>;
export type RenderWeaponSpec = Readonly<Pick<WeaponSpec, 'id' | 'spawnType' | 'isRocket' | 'isBeam' | 'hardpointUsesHullSprite' | 'turretSpriteUrl' | 'hardpointSpriteUrl' | 'hardpointGunSpriteUrl' | 'turretGunSpriteUrl' | 'glowSpriteUrl' | 'hardpointGlowSpriteUrl' | 'mountSize' | 'visualRecoil' | 'renderBarrelBelow' | 'weaponType' | 'glowColor' | 'animationType' | 'projSpeed' | 'projSpriteUrl' | 'beamEffect' | 'onHitEffect' | 'everyFrameEffect'>> & {
 readonly mirv?: { readonly childProjectile?: Readonly<Pick<NonNullable<NonNullable<WeaponSpec['mirv']>['childProjectile']>, 'onHitEffect' | 'turretSpriteUrl' | 'turretGunSpriteUrl' | 'hardpointSpriteUrl' | 'hardpointGunSpriteUrl' | 'glowSpriteUrl' | 'hardpointGlowSpriteUrl' | 'projSpriteUrl'>> };
};
export type RenderEngineStatus = Readonly<Pick<Ship['engineStatuses'][number], 'prevThrust' | 'currentThrust' | 'prevSpread' | 'spread'>>;
export type RenderWeapon = Readonly<Pick<WeaponMount, 'arcDeg' | 'baseAngleDeg' | 'currentAngleRad' | 'currentSpreadDeg' | 'glowAlpha' | 'isDisabled' | 'mountType' | 'recoil' | 'relativePos' | 'slotId'>> & { readonly spec: RenderWeaponSpec };
export interface ShipRenderState extends Readonly<Pick<Ship, 'id' | 'spec' | 'pos' | 'prevPos' | 'vel' | 'facingRad' | 'prevFacingRad' | 'angularVelRad' | 'hullHp' | 'isDead' | 'isDocked' | 'isRetreated' | 'isAttachedModule' | 'teamId' | 'playerTargetId' | 'visibilityMask' | 'visibilityOverflow' | 'phaseGhosts' | 'phaseVisualAlpha' | 'engineBoostLevel' | 'prevEngineBoostLevel' | 'scorchMarks' | 'scorchMarkVersion' | 'selectedGroupIndex'>> {
 readonly shield: RenderShield;
 readonly flux: RenderFlux;
 readonly armor: Readonly<Pick<Ship['armor'], 'cellWidth'>>;
 readonly engineController: Readonly<Pick<Ship['engineController'], 'flameAccelerating'>>;
 readonly engineStatuses: readonly RenderEngineStatus[];
 readonly weapons: readonly RenderWeapon[];
 readonly weaponGroups: Ship['weaponGroups'];
 readonly system: RenderSystem;
 readonly allSystems: readonly RenderSystem[];
 readonly sourceCarrier?: ShipRenderState;
 readonly interpolatedPos: Ship['interpolatedPos'];
 readonly interpolatedFacing: Ship['interpolatedFacing'];
 readonly getShieldCenter: Ship['getShieldCenter'];
 readonly isVisibleTo: Ship['isVisibleTo'];
}
export type RenderHulk = Omit<HulkFragment, 'sourceShip'> & { readonly sourceShip: ShipRenderState };

