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
}

export interface ShipSpec {
  visualProfile?: ShipVisualProfile;
  debrisColor?: [number, number, number];
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
  systemType: ShipSystemType;
  /** Independent right-button defense slot; phase cloak is still owned by Shield. */
  defenseSystemType?: ShipSystemType;
  weaponSlots: WeaponMountSlotConfig[];
  /** Dedicated native SYSTEM launchers, never ordinary refit weapon slots. */
  systemWeaponSlots?: WeaponMountSlotConfig[];
  engineSlots: EngineSlotConfig[];
  /** Explicit custom multiplier; native hullmods are applied separately. */
  weaponRangeMult?: number;
  /** Native identity traits survive capability filtering; not executable hullmods. */
  sourceHullTraits?: string[];
  builtInHullMods?: string[];
  hullMods?: string[];
  /** Explicit piloted-ship combat preset; never campaign skill progression. */
  captainSkills?: import("../extensions/CombatSkills").CombatSkillLoadout;
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
