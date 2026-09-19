import type { ShipVisualProfile } from '../visual/VisualProfiles';
import type { ShieldType } from '../simulation/Shield';
import type { ShipSystemType } from '../simulation/ShipSystem';
import type { WeaponMountType, WeaponSlotSize } from '../simulation/Weapon';
import type { HullSize } from '../simulation/FluxTracker';

export interface WeaponMountSlotConfig {
  slotId: string;
  mountType: WeaponMountType;
  slotSize: WeaponSlotSize;
  weaponType?: 'BALLISTIC' | 'ENERGY' | 'MISSILE' | 'HYBRID' | 'COMPOSITE' | 'SYNERGY' | 'UNIVERSAL' | 'BUILT_IN';
  x: number;
  y: number;
  baseAngleDeg: number;
  arcDeg: number;
  defaultWeaponId?: string;
  /** Authored free weapon, independent of the mount category (some are BALLISTIC/ENERGY). */
  builtIn?: boolean;
}

export interface EngineSlotConfig {
  /** Native engineSlot systemActivated; omitted for ordinary engines. */
  systemActivated?: boolean;
  x: number;
  y: number;
  angleDeg: number;
  width: number;
  length: number;
  style: 'LOW_TECH' | 'HIGH_TECH' | 'MIDLINE';
}

export interface FighterWingSpec {
  tags?: string[];
  specId: string;
  role: 'FIGHTER' | 'BOMBER';
  count: number;
  rebuildSeconds: number;
  range?: number;
}

/** Local mount coordinates use the same forward/right convention as weapon slots. */
export interface ShipModuleSlot { slotId: string; x: number; y: number; angleDeg: number; }
export interface ShipModuleSpec extends ShipModuleSlot { spec: ShipSpec; }

export interface ShipSpec {
  moduleSlots?: ShipModuleSlot[];
  moduleAnchor?: [number, number];
  /** Complete, source-authored module fits; modules are not separate fleet members. */
  modules?: ShipModuleSpec[];
  isModuleHull?: boolean;
  /** Native active-module classification (OP / weapon groups / flight decks). */
  moduleCombat?: boolean;
  visualProfile?: ShipVisualProfile;
  debrisColor?: [number, number, number];
  /** Source hull_styles overloadColor; omitted uses native [150,150,255]. */
  overloadColor?: [number, number, number];
  id: string;
  nameKey: string;
  descKey: string;
  designationKey: string;
  spriteUrl: string;
  phaseHighlightSpriteUrl?: string;
  phaseDiffuseSpriteUrl?: string;
  explosionColor?: [number, number, number];
  explosionFlashColor?: [number, number, number];
  breakProbability?: number;
  minPieces?: number;
  maxPieces?: number;
  spriteWidth: number;
  spriteHeight: number;
  pivotX: number;
  pivotY: number;
  collisionRadius: number;
  mass: number;
  hullSize?: HullSize;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  maxTurnRateDeg: number;
  turnAccelerationDeg: number;
  hitpoints: number;
  armorRating: number;
  /** Legacy serialized fields; combat now derives the native square grid from sprite dimensions/pivot. */
  armorCols: number;
  armorRows: number;
  maxFlux: number;
  fluxDissipation: number;
  peakCRSec?: number;
  crLossPerSec?: number;
  designation?: string;
  shieldType: ShieldType;
  shieldArcDeg: number;
  shieldRadius: number;
  shieldCenterX?: number;
  shieldCenterY?: number;
  shieldEfficiency: number;
  /** Fractions of base dissipation (shield) or base capacity (phase). */
  shieldUpkeep?: number;
  /** Unmodified hull dissipation: vents and hullmods do not raise shield upkeep. */
  shieldUpkeepBaseDissipation?: number;
  phaseCost?: number;
  phaseUpkeep?: number;
  /** Source loadout identity survives refits; special systems never guess it from the hull name. */
  sourceVariantId?: string;
  /** Stable base hull identity; refit, simulation and LAN runtime IDs may change. */
  sourceHullId?: string;
  /** Legacy/default first slot; omitted list inherits this without changing native hull data. */
  systemType: ShipSystemType;
  /** Ordered independent tactical skills. [] explicitly equips none. */
  systemTypes?: ShipSystemType[];
  /** Independent right-button defense slot; phase cloak is still owned by Shield. */
  defenseSystemType?: ShipSystemType;
  weaponSlots: WeaponMountSlotConfig[];
  /** Dedicated native SYSTEM launchers, never ordinary refit weapon slots. */
  systemWeaponSlots?: WeaponMountSlotConfig[];
  /** Non-firing artwork stays outside the editable/targetable weapon collection. */
  decorativeWeapons?: { id: string; x: number; y: number; angleDeg: number; spriteUrl: string; tags?: string[] }[];
  engineSlots: EngineSlotConfig[];
  /** Explicit custom multiplier; native hullmods are applied separately. */
  weaponRangeMult?: number;
  /** Native identity traits survive capability filtering; not executable hullmods. */
  sourceHullTraits?: string[];
  builtInHullMods?: string[];
  hullMods?: string[];
  /** Built-in improvements or externally fitted permanent hullmods; never duplicate normal effects. */
  sMods?: string[];
  /** Explicit piloted-ship combat preset; never campaign skill progression. */
  captainSkills?: import("../extensions/CombatSkills").CombatSkillLoadout;
  /** Fractional per-deployment CR cost for custom ships and persistent combat events. */
  deploymentCRCost?: number;
  /** Native deployment points; required for custom hulls absent from the source cost catalog. */
  deploymentPoints?: number;
  fighterBays?: number;
  fighterWings?: FighterWingSpec[];
  bounds: [number, number][];
  defaultWeaponGroups?: {
    index: number;
    weaponSlotIds: string[];
    mode: 'LINKED' | 'ALTERNATING';
    isAutofire: boolean;
  }[];
  i18n?: {
    zh_CN?: Record<string, string>;
    en_US?: Record<string, string>;
  };
}
