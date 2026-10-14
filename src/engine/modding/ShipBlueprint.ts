import type {
  EngineSlotConfig,
  FighterWingSpec,
  ShipSpec,
  WeaponMountSlotConfig,
} from '../content/ShipSpec';
import type { HullSize } from '../simulation/FluxTracker';
import type { ShieldType } from '../simulation/Shield';
import type { ShipSystemType } from '../simulation/ShipSystem';
import type { ShipPack } from './ShipPack';

export const SHIP_BLUEPRINT_SCHEMA_VERSION = '2.0' as const;

/**
 * 8-sector continuous armor distribution weights around the hull:
 * [0]=Front (0°), [1]=FrontRight (45°), [2]=Right (90°), [3]=RearRight (135°),
 * [4]=Rear (180°), [5]=RearLeft (-135°), [6]=Left (-90°), [7]=FrontLeft (-45°).
 */
export type ContinuousArmorSectorWeights = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface BlueprintAtomicActionSpec {
  readonly kind:
    | 'APPLY_FORCE'
    | 'RADIAL_FORCE'
    | 'SET_TIME_SCALE'
    | 'SET_COLLISION_MASK'
    | 'SPAWN_PROJECTILE'
    | 'BOOST_STAT'
    | 'EMIT_PARTICLE_BURST'
    | 'TRIGGER_HERO_SOUND';
  readonly magnitude?: number;
  readonly radius?: number;
  readonly angleOffsetDeg?: number;
  readonly durationSec?: number;
  readonly statKey?: 'maxSpeed' | 'acceleration' | 'turnRate' | 'weaponDamage' | 'fluxDissipation';
  readonly soundTier?: 1 | 2 | 3;
}

export interface SelfRegisteringCapabilityBlueprint {
  readonly id: string;
  readonly kind: 'SHIP_SYSTEM' | 'HULL_MOD';
  readonly name: string;
  readonly description: string;
  readonly chargeUp?: number;
  readonly active?: number;
  readonly chargeDown?: number;
  readonly cooldown?: number;
  readonly charges?: number;
  readonly chargeRegen?: number;
  readonly fluxPerUseFlat?: number;
  readonly fluxPerUseFraction?: number;
  readonly hardFlux?: boolean;
  readonly toggle?: boolean;
  readonly atomicActions?: readonly BlueprintAtomicActionSpec[];
}

export interface ShipBlueprint {
  readonly schemaVersion: typeof SHIP_BLUEPRINT_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly designation: string;
  readonly description: string;
  readonly author?: string;
  readonly hullSize: HullSize;
  readonly deploymentPoints: number;
  readonly visual: {
    readonly spriteUrl: string;
    readonly spriteWidth: number;
    readonly spriteHeight: number;
    readonly pivotX: number;
    readonly pivotY: number;
    readonly bounds: [number, number][];
    readonly explosionColor?: [number, number, number];
    readonly overloadColor?: [number, number, number];
  };
  readonly kinematics: {
    readonly mass: number;
    readonly collisionRadius: number;
    readonly maxSpeed: number;
    readonly acceleration: number;
    readonly deceleration: number;
    readonly maxTurnRateDeg: number;
    readonly turnAccelerationDeg: number;
  };
  readonly defense: {
    readonly hitpoints: number;
    readonly armorRating: number;
    /** Optional 8-sector multipliers relative to armorRating. Defaults to balanced front-biased profile. */
    readonly continuousArmorSectors?: ContinuousArmorSectorWeights;
    /** Minimum residual armor ratio when a sector is fully ablated (default 0.05). */
    readonly minArmorResidualRatio?: number;
    readonly shieldType: ShieldType;
    readonly shieldArcDeg: number;
    readonly shieldRadius: number;
    readonly shieldEfficiency: number;
    readonly shieldUpkeep?: number;
    readonly phaseCost?: number;
    readonly phaseUpkeep?: number;
  };
  readonly flux: {
    readonly maxFlux: number;
    readonly fluxDissipation: number;
    readonly peakCRSec?: number;
    readonly crLossPerSec?: number;
  };
  readonly systems: {
    readonly primarySystem: ShipSystemType;
    readonly systemTypes?: ShipSystemType[];
    readonly defenseSystemType?: ShipSystemType;
    readonly rightClickSystemType?: ShipSystemType;
  };
  readonly weaponSlots: WeaponMountSlotConfig[];
  readonly defaultWeaponGroups?: {
    readonly index: number;
    readonly weaponSlotIds: string[];
    readonly mode: 'LINKED' | 'ALTERNATING';
    readonly isAutofire: boolean;
  }[];
  readonly engineSlots: EngineSlotConfig[];
  readonly fighterBays?: number;
  readonly fighterWings?: FighterWingSpec[];
  readonly builtInHullMods?: string[];
  readonly hullMods?: string[];
  readonly sMods?: string[];
  readonly capabilities?: readonly SelfRegisteringCapabilityBlueprint[];
}

export interface BlueprintValidationIssue {
  readonly code:
    | 'SCHEMA_VERSION_MISMATCH'
    | 'INVALID_IDENTIFIER'
    | 'INVALID_DIMENSIONS'
    | 'POLYGON_TOO_FEW_VERTICES'
    | 'POLYGON_SELF_INTERSECTION'
    | 'BOUNDS_EXCEED_COLLISION_RADIUS'
    | 'MOUNT_DUPLICATE_ID'
    | 'MOUNT_COORDINATE_OVERLAP'
    | 'MOUNT_OUTSIDE_HULL_BOUNDS'
    | 'INVALID_KINEMATICS'
    | 'INVALID_DEFENSE_PARAMETERS'
    | 'INVALID_FLUX_PARAMETERS'
    | 'CAPABILITY_INVALID_TIMING';
  readonly severity: 'error' | 'warning';
  readonly path: string;
  readonly message: string;
  readonly suggestion?: string;
}

export interface BlueprintValidationResult {
  readonly valid: boolean;
  readonly shipId: string;
  readonly issues: readonly BlueprintValidationIssue[];
}

export interface EcsCompiledShipConfig {
  readonly id: string;
  readonly hullSizeCode: number;
  readonly mass: number;
  readonly collisionRadius: number;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly maxTurnRateRad: number;
  readonly turnAccelerationRad: number;
  readonly hitpoints: number;
  readonly armorRating: number;
  readonly armorSectors: ContinuousArmorSectorWeights;
  readonly maxFlux: number;
  readonly fluxDissipation: number;
  readonly shieldTypeCode: number; // 0=NONE, 1=FRONT, 2=OMNI, 3=PHASE
  readonly shieldArcRad: number;
  readonly shieldRadius: number;
  readonly shieldEfficiency: number;
  readonly weaponMountCount: number;
  readonly fighterWingCount: number;
}

export const DEFAULT_ARMOR_SECTOR_WEIGHTS: ContinuousArmorSectorWeights = [
  1.15, // Front
  1.05, // Front-Right
  1.0,  // Right
  0.9,  // Rear-Right
  0.85, // Rear
  0.9,  // Rear-Left
  1.0,  // Left
  1.05, // Front-Left
];

function segmentsIntersect(
  a1: readonly [number, number],
  a2: readonly [number, number],
  b1: readonly [number, number],
  b2: readonly [number, number]
): boolean {
  const ccw = (
    p1: readonly [number, number],
    p2: readonly [number, number],
    p3: readonly [number, number]
  ) => (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  return (
    ccw(a1, b1, b2) !== ccw(a2, b1, b2) &&
    ccw(a1, a2, b1) !== ccw(a1, a2, b2)
  );
}

function hasSelfIntersectingPolygon(bounds: readonly [number, number][]): boolean {
  const n = bounds.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = bounds[i];
    const a2 = bounds[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges sharing a vertex
      if (i === 0 && j === n - 1) continue;
      const b1 = bounds[j];
      const b2 = bounds[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

function minClearanceForSlotSize(size: string): number {
  switch (size) {
    case 'LARGE':
      return 14;
    case 'MEDIUM':
      return 9;
    case 'SMALL':
    default:
      return 5;
  }
}

/**
 * Performs comprehensive static validation on a single-file ShipBlueprint.
 * Designed for <1ms execution and machine-readable AI feedback loops.
 */
export function validateShipBlueprint(blueprint: ShipBlueprint): BlueprintValidationResult {
  const issues: BlueprintValidationIssue[] = [];
  const shipId = typeof blueprint?.id === 'string' ? blueprint.id : 'UNKNOWN_SHIP';

  if (blueprint.schemaVersion !== SHIP_BLUEPRINT_SCHEMA_VERSION) {
    issues.push({
      code: 'SCHEMA_VERSION_MISMATCH',
      severity: 'error',
      path: 'schemaVersion',
      message: `Expected schemaVersion "${SHIP_BLUEPRINT_SCHEMA_VERSION}", got "${String(blueprint.schemaVersion)}".`,
      suggestion: `Set "schemaVersion": "${SHIP_BLUEPRINT_SCHEMA_VERSION}".`,
    });
  }

  if (!blueprint.id || !/^[A-Za-z0-9_.-]+$/.test(blueprint.id)) {
    issues.push({
      code: 'INVALID_IDENTIFIER',
      severity: 'error',
      path: 'id',
      message: `Invalid ship identifier "${String(blueprint.id)}".`,
      suggestion: 'Use alphanumeric characters, underscores, hyphens, or dots.',
    });
  }

  const { visual, kinematics, defense, flux } = blueprint;
  if (!visual || !(visual.spriteWidth > 0) || !(visual.spriteHeight > 0)) {
    issues.push({
      code: 'INVALID_DIMENSIONS',
      severity: 'error',
      path: 'visual.spriteWidth/spriteHeight',
      message: 'Sprite width and height must be positive numbers.',
      suggestion: 'Specify positive pixel dimensions for visual.spriteWidth and visual.spriteHeight.',
    });
  }

  if (!Array.isArray(visual?.bounds) || visual.bounds.length < 3) {
    issues.push({
      code: 'POLYGON_TOO_FEW_VERTICES',
      severity: 'error',
      path: 'visual.bounds',
      message: `Collision polygon requires at least 3 vertices (found ${visual?.bounds?.length ?? 0}).`,
      suggestion: 'Provide at least 3 [x, y] vertices around the hull perimeter.',
    });
  } else {
    if (hasSelfIntersectingPolygon(visual.bounds)) {
      issues.push({
        code: 'POLYGON_SELF_INTERSECTION',
        severity: 'error',
        path: 'visual.bounds',
        message: 'Hull collision polygon has self-intersecting edges.',
        suggestion: 'Order visual.bounds vertices sequentially clockwise or counter-clockwise without crossing edges.',
      });
    }
    const maxVertexDist = Math.max(
      ...visual.bounds.map(([x, y]) => Math.hypot(x, y))
    );
    if (kinematics?.collisionRadius > 0 && maxVertexDist > kinematics.collisionRadius * 1.45) {
      issues.push({
        code: 'BOUNDS_EXCEED_COLLISION_RADIUS',
        severity: 'warning',
        path: 'kinematics.collisionRadius',
        message: `Polygon vertex distance (${maxVertexDist.toFixed(1)}) significantly exceeds collisionRadius (${kinematics.collisionRadius}).`,
        suggestion: `Increase kinematics.collisionRadius to at least ${Math.ceil(maxVertexDist)}.`,
      });
    }
  }

  if (
    !kinematics ||
    !(kinematics.mass > 0) ||
    !(kinematics.maxSpeed > 0) ||
    !(kinematics.acceleration > 0) ||
    !(kinematics.maxTurnRateDeg > 0)
  ) {
    issues.push({
      code: 'INVALID_KINEMATICS',
      severity: 'error',
      path: 'kinematics',
      message: 'Kinematics mass, maxSpeed, acceleration, and maxTurnRateDeg must all be positive.',
      suggestion: 'Set positive values for all kinematics fields.',
    });
  }

  if (!defense || !(defense.hitpoints > 0) || !(defense.armorRating >= 0)) {
    issues.push({
      code: 'INVALID_DEFENSE_PARAMETERS',
      severity: 'error',
      path: 'defense',
      message: 'Defense hitpoints must be positive and armorRating must be non-negative.',
    });
  }

  if (!flux || !(flux.maxFlux > 0) || !(flux.fluxDissipation > 0)) {
    issues.push({
      code: 'INVALID_FLUX_PARAMETERS',
      severity: 'error',
      path: 'flux',
      message: 'Flux maxFlux and fluxDissipation must be positive.',
    });
  }

  const seenSlotIds = new Set<string>();
  const slots = blueprint.weaponSlots ?? [];
  const halfW = (visual?.spriteWidth ?? 0) * 0.65 + 40;
  const halfH = (visual?.spriteHeight ?? 0) * 0.65 + 40;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (seenSlotIds.has(slot.slotId)) {
      issues.push({
        code: 'MOUNT_DUPLICATE_ID',
        severity: 'error',
        path: `weaponSlots[${i}].slotId`,
        message: `Duplicate weapon slot ID "${slot.slotId}".`,
        suggestion: `Rename duplicate slot "${slot.slotId}" to a unique ID.`,
      });
    }
    seenSlotIds.add(slot.slotId);

    if (Math.abs(slot.x) > halfW || Math.abs(slot.y) > halfH) {
      issues.push({
        code: 'MOUNT_OUTSIDE_HULL_BOUNDS',
        severity: 'warning',
        path: `weaponSlots[${i}]`,
        message: `Weapon slot "${slot.slotId}" at (${slot.x}, ${slot.y}) is outside the sprite envelope.`,
        suggestion: 'Adjust slot x/y coordinates to lie within the hull sprite bounds.',
      });
    }

    for (let j = i + 1; j < slots.length; j++) {
      const other = slots[j];
      const dist = Math.hypot(slot.x - other.x, slot.y - other.y);
      const minClearance = Math.min(
        minClearanceForSlotSize(slot.slotSize),
        minClearanceForSlotSize(other.slotSize)
      );
      if (dist < minClearance && slot.renderLayer === other.renderLayer) {
        issues.push({
          code: 'MOUNT_COORDINATE_OVERLAP',
          severity: 'warning',
          path: `weaponSlots[${i}]/weaponSlots[${j}]`,
          message: `Weapon slots "${slot.slotId}" and "${other.slotId}" are only ${dist.toFixed(1)}px apart (recommended clearance >= ${minClearance}px).`,
          suggestion: `Separate "${slot.slotId}" and "${other.slotId}" coordinates to avoid turret clipping.`,
        });
      }
    }
  }

  if (blueprint.capabilities) {
    for (let i = 0; i < blueprint.capabilities.length; i++) {
      const cap = blueprint.capabilities[i];
      if (
        cap.kind === 'SHIP_SYSTEM' &&
        ((cap.chargeUp ?? 0) < 0 ||
          (cap.active ?? 0) < 0 ||
          (cap.chargeDown ?? 0) < 0 ||
          (cap.cooldown ?? 0) < 0)
      ) {
        issues.push({
          code: 'CAPABILITY_INVALID_TIMING',
          severity: 'error',
          path: `capabilities[${i}]`,
          message: `Capability "${cap.id}" has negative timing parameters.`,
          suggestion: 'Ensure chargeUp, active, chargeDown, and cooldown are >= 0.',
        });
      }
    }
  }

  return {
    valid: issues.every(issue => issue.severity !== 'error'),
    shipId,
    issues,
  };
}

/**
 * Converts a self-contained ShipBlueprint into a runtime ShipSpec.
 */
export function blueprintToShipSpec(blueprint: ShipBlueprint): ShipSpec {
  const { visual, kinematics, defense, flux, systems } = blueprint;
  const nameKey = `ship.${blueprint.id}.name`;
  const descKey = `ship.${blueprint.id}.desc`;
  const designationKey = `ship.${blueprint.id}.designation`;

  return {
    id: blueprint.id,
    nameKey,
    descKey,
    designationKey,
    designation: blueprint.designation,
    hullSize: blueprint.hullSize,
    deploymentPoints: blueprint.deploymentPoints,
    spriteUrl: visual.spriteUrl,
    spriteWidth: visual.spriteWidth,
    spriteHeight: visual.spriteHeight,
    pivotX: visual.pivotX,
    pivotY: visual.pivotY,
    explosionColor: visual.explosionColor,
    overloadColor: visual.overloadColor,
    bounds: visual.bounds.map(([x, y]) => [x, y]),
    mass: kinematics.mass,
    collisionRadius: kinematics.collisionRadius,
    maxSpeed: kinematics.maxSpeed,
    acceleration: kinematics.acceleration,
    deceleration: kinematics.deceleration,
    maxTurnRateDeg: kinematics.maxTurnRateDeg,
    turnAccelerationDeg: kinematics.turnAccelerationDeg,
    hitpoints: defense.hitpoints,
    armorRating: defense.armorRating,
    armorCols: 15,
    armorRows: 15,
    shieldType: defense.shieldType,
    shieldArcDeg: defense.shieldArcDeg,
    shieldRadius: defense.shieldRadius,
    shieldEfficiency: defense.shieldEfficiency,
    shieldUpkeep: defense.shieldUpkeep,
    phaseCost: defense.phaseCost,
    phaseUpkeep: defense.phaseUpkeep,
    maxFlux: flux.maxFlux,
    fluxDissipation: flux.fluxDissipation,
    peakCRSec: flux.peakCRSec ?? 180,
    crLossPerSec: flux.crLossPerSec ?? 0.25,
    systemType: systems.primarySystem,
    systemTypes: systems.systemTypes ? [...systems.systemTypes] : [systems.primarySystem],
    defenseSystemType: systems.defenseSystemType,
    rightClickSystemType: systems.rightClickSystemType,
    weaponSlots: blueprint.weaponSlots.map(slot => ({ ...slot })),
    defaultWeaponGroups: blueprint.defaultWeaponGroups?.map(g => ({
      ...g,
      weaponSlotIds: [...g.weaponSlotIds],
    })),
    engineSlots: blueprint.engineSlots.map(engine => ({ ...engine })),
    fighterBays: blueprint.fighterBays,
    fighterWings: blueprint.fighterWings?.map(w => ({ ...w })),
    builtInHullMods: blueprint.builtInHullMods ? [...blueprint.builtInHullMods] : undefined,
    hullMods: blueprint.hullMods ? [...blueprint.hullMods] : undefined,
    sMods: blueprint.sMods ? [...blueprint.sMods] : undefined,
    i18n: {
      zh_CN: {
        [nameKey]: blueprint.name,
        [descKey]: blueprint.description,
        [designationKey]: blueprint.designation,
      },
      en_US: {
        [nameKey]: blueprint.name,
        [descKey]: blueprint.description,
        [designationKey]: blueprint.designation,
      },
    },
  };
}

/**
 * Converts an existing ShipSpec into a normalized single-file ShipBlueprint.
 */
export function shipSpecToBlueprint(spec: ShipSpec): ShipBlueprint {
  const zh = spec.i18n?.zh_CN ?? {};
  const en = spec.i18n?.en_US ?? {};
  const name = zh[spec.nameKey] || en[spec.nameKey] || spec.id;
  const description = zh[spec.descKey] || en[spec.descKey] || '';
  const designation =
    spec.designation || zh[spec.designationKey] || en[spec.designationKey] || 'Cruiser';

  return {
    schemaVersion: SHIP_BLUEPRINT_SCHEMA_VERSION,
    id: spec.id,
    name,
    designation,
    description,
    hullSize: spec.hullSize ?? 'CRUISER',
    deploymentPoints: spec.deploymentPoints ?? 20,
    visual: {
      spriteUrl: spec.spriteUrl,
      spriteWidth: spec.spriteWidth,
      spriteHeight: spec.spriteHeight,
      pivotX: spec.pivotX,
      pivotY: spec.pivotY,
      bounds: spec.bounds.map(([x, y]) => [x, y]),
      explosionColor: spec.explosionColor,
      overloadColor: spec.overloadColor,
    },
    kinematics: {
      mass: spec.mass,
      collisionRadius: spec.collisionRadius,
      maxSpeed: spec.maxSpeed,
      acceleration: spec.acceleration,
      deceleration: spec.deceleration,
      maxTurnRateDeg: spec.maxTurnRateDeg,
      turnAccelerationDeg: spec.turnAccelerationDeg,
    },
    defense: {
      hitpoints: spec.hitpoints,
      armorRating: spec.armorRating,
      continuousArmorSectors: DEFAULT_ARMOR_SECTOR_WEIGHTS,
      minArmorResidualRatio: 0.05,
      shieldType: spec.shieldType,
      shieldArcDeg: spec.shieldArcDeg,
      shieldRadius: spec.shieldRadius,
      shieldEfficiency: spec.shieldEfficiency,
      shieldUpkeep: spec.shieldUpkeep,
      phaseCost: spec.phaseCost,
      phaseUpkeep: spec.phaseUpkeep,
    },
    flux: {
      maxFlux: spec.maxFlux,
      fluxDissipation: spec.fluxDissipation,
      peakCRSec: spec.peakCRSec,
      crLossPerSec: spec.crLossPerSec,
    },
    systems: {
      primarySystem: spec.systemType,
      systemTypes: spec.systemTypes,
      defenseSystemType: spec.defenseSystemType,
      rightClickSystemType: spec.rightClickSystemType,
    },
    weaponSlots: spec.weaponSlots.map(s => ({ ...s })),
    defaultWeaponGroups: spec.defaultWeaponGroups?.map(g => ({
      ...g,
      weaponSlotIds: [...g.weaponSlotIds],
    })),
    engineSlots: spec.engineSlots.map(e => ({ ...e })),
    fighterBays: spec.fighterBays,
    fighterWings: spec.fighterWings?.map(w => ({ ...w })),
    builtInHullMods: spec.builtInHullMods ? [...spec.builtInHullMods] : undefined,
    hullMods: spec.hullMods ? [...spec.hullMods] : undefined,
    sMods: spec.sMods ? [...spec.sMods] : undefined,
  };
}

/**
 * Wraps a single-file ShipBlueprint into a complete ShipPack ready for runtime registration.
 */
export function blueprintToShipPack(blueprint: ShipBlueprint): ShipPack {
  const spec = blueprintToShipSpec(blueprint);
  return {
    id: `blueprint.${blueprint.id.toLowerCase()}`,
    name: blueprint.name,
    version: '2.0.0',
    author: blueprint.author ?? 'Foundry Blueprint Pipeline',
    description: blueprint.description,
    ships: [spec],
    weapons: [],
    i18n: spec.i18n,
  };
}

/**
 * Compiles a ShipBlueprint into a flat numeric structure for zero-overhead Rust ECS spawning.
 */
export function compileBlueprintToEcsConfig(blueprint: ShipBlueprint): EcsCompiledShipConfig {
  const DegToRad = Math.PI / 180;
  const hullSizeCode =
    blueprint.hullSize === 'FRIGATE'
      ? 1
      : blueprint.hullSize === 'DESTROYER'
        ? 2
        : blueprint.hullSize === 'CRUISER'
          ? 3
          : blueprint.hullSize === 'CAPITAL_SHIP'
            ? 4
            : 0;

  const shieldTypeCode =
    blueprint.defense.shieldType === 'FRONT'
      ? 1
      : blueprint.defense.shieldType === 'OMNI'
        ? 2
        : blueprint.defense.shieldType === 'PHASE'
          ? 3
          : 0;

  return {
    id: blueprint.id,
    hullSizeCode,
    mass: blueprint.kinematics.mass,
    collisionRadius: blueprint.kinematics.collisionRadius,
    spriteWidth: blueprint.visual.spriteWidth,
    spriteHeight: blueprint.visual.spriteHeight,
    pivotX: blueprint.visual.pivotX,
    pivotY: blueprint.visual.pivotY,
    maxSpeed: blueprint.kinematics.maxSpeed,
    acceleration: blueprint.kinematics.acceleration,
    deceleration: blueprint.kinematics.deceleration,
    maxTurnRateRad: blueprint.kinematics.maxTurnRateDeg * DegToRad,
    turnAccelerationRad: blueprint.kinematics.turnAccelerationDeg * DegToRad,
    hitpoints: blueprint.defense.hitpoints,
    armorRating: blueprint.defense.armorRating,
    armorSectors: blueprint.defense.continuousArmorSectors ?? DEFAULT_ARMOR_SECTOR_WEIGHTS,
    maxFlux: blueprint.flux.maxFlux,
    fluxDissipation: blueprint.flux.fluxDissipation,
    shieldTypeCode,
    shieldArcRad: blueprint.defense.shieldArcDeg * DegToRad,
    shieldRadius: blueprint.defense.shieldRadius,
    shieldEfficiency: blueprint.defense.shieldEfficiency,
    weaponMountCount: blueprint.weaponSlots.length,
    fighterWingCount: blueprint.fighterWings?.reduce((sum, w) => sum + w.count, 0) ?? 0,
  };
}
