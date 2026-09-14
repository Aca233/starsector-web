import { assetManager } from '../assets/AssetResolver';
import { contentRegistry } from '../content/ContentRegistry';
import type { ShipSpec, WeaponMountSlotConfig, EngineSlotConfig } from './ModManager';
import type { WeaponSpec } from '../simulation/Weapon';

export interface ShipValidationOptions {
  allowExistingId?: boolean;
  additionalWeapons?: ReadonlyMap<string, WeaponSpec>;
  requireBundledAssets?: boolean;
}

const SHIELD_TYPES = new Set(['NONE', 'FRONT', 'OMNI', 'PHASE']);
const SYSTEM_TYPES = new Set(['NONE', 'BURN_DRIVE', 'FORTRESS_SHIELD', 'MINE_STRIKE']);
const MOUNT_TYPES = new Set(['TURRET', 'HARDPOINT', 'HIDDEN']);
const SLOT_SIZES = new Set(['SMALL', 'MEDIUM', 'LARGE']);
const ENGINE_STYLES = new Set(['LOW_TECH', 'HIGH_TECH', 'MIDLINE']);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  return value.trim();
}

function finite(value: unknown, label: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} 必须是 ${min === -Infinity ? '' : `>= ${min}`}${max === Infinity ? '' : ` 且 <= ${max}`} 的有限数值`);
  }
  return value;
}

function integer(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const result = finite(value, label, min, max);
  if (!Number.isInteger(result)) throw new Error(`${label} 必须是整数`);
  return result;
}

function enumValue(value: unknown, label: string, allowed: ReadonlySet<string>): string {
  const result = text(value, label);
  if (!allowed.has(result)) throw new Error(`${label} 值无效: ${result}`);
  return result;
}

function colorTuple(value: unknown, label: string, length: 3 | 4): number[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} 必须是 ${length === 3 ? 'RGB' : 'RGBA'} 数组`);
  value.forEach((channel, index) => finite(channel, `${label}[${index}]`, 0, 255));
  return value as number[];
}

function finiteArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数值数组`);
  value.forEach((item, index) => finite(item, `${label}[${index}]`));
  return value as number[];
}

function requireAsset(path: string, label: string, required: boolean): void {
  if (!required) return;
  if (!assetManager.isLoaded) throw new Error(`无法校验 ${label}：独立资源清单尚未加载`);
  if (!assetManager.hasPath(path)) throw new Error(`${label} 未出现在独立资源清单中: ${path}`);
}

export function validateWeaponSpec(input: unknown, requireBundledAssets = assetManager.isLoaded): asserts input is WeaponSpec {
  const spec = object(input, '武器规格');
  const id = text(spec.id, 'weapon.id');
  text(spec.nameKey, `${id}.nameKey`);
  enumValue(spec.type, `${id}.type`, new Set(['KINETIC', 'HIGH_EXPLOSIVE', 'ENERGY', 'FRAGMENTATION']));
  enumValue(spec.mountSize, `${id}.mountSize`, SLOT_SIZES);
  if (typeof spec.isBeam !== 'boolean') throw new Error(`${id}.isBeam 必须是布尔值`);
  for (const key of ['damagePerShot', 'damagePerSecond', 'fluxPerShot', 'range', 'refireDelay', 'projSpeed', 'projRadius'] as const) {
    finite(spec[key], `${id}.${key}`, 0);
  }
  colorTuple(spec.color, `${id}.color`, 3);

  for (const key of ['turnRateDegPerSec', 'minSpread', 'maxSpread', 'spreadPerShot', 'spreadDecay', 'visualRecoil', 'hitGlowRadius', 'glowRadius', 'coreWidthMult', 'projLength', 'projWidth', 'muzzleFlashSize', 'burstDelay', 'engineAcceleration', 'maxSpeed', 'maxTurnRate', 'missileHp', 'beamWidth', 'beamDuration', 'beamSourceChargeupTime', 'beamSourceChargedownTime', 'beamBurstDelay', 'fluxPerSecond', 'empPerSecond', 'maxAmmo', 'ammoRegenPerSec', 'hitGlowBrightenDuration'] as const) {
    if (spec[key] !== undefined) finite(spec[key], `${id}.${key}`, 0);
  }
  for (const key of ['launchSpeed', 'flightTime', 'armingTime', 'missileDeceleration', 'maxTurnAcceleration'] as const) {
    if (spec[key] !== undefined) finite(spec[key], `${id}.${key}`, 0);
  }
  if (spec.fadeTime !== undefined) finite(spec.fadeTime, `${id}.fadeTime`, 0);
  if (spec.pixelsPerTexel !== undefined) {
    const pixelsPerTexel = finite(spec.pixelsPerTexel, `${id}.pixelsPerTexel`, 0);
    if (pixelsPerTexel <= 0) throw new Error(`${id}.pixelsPerTexel 必须 > 0`);
  }
  if (spec.textureScrollSpeed !== undefined) finite(spec.textureScrollSpeed, `${id}.textureScrollSpeed`);
  if (spec.burstSize !== undefined) integer(spec.burstSize, `${id}.burstSize`, 1);
  for (const key of ['renderBarrelBelow', 'isRocket', 'isGuided', 'isTwoStage'] as const) {
    if (spec[key] !== undefined && typeof spec[key] !== 'boolean') throw new Error(`${id}.${key} 必须是布尔值`);
  }
  if (spec.spawnType !== undefined) enumValue(spec.spawnType, `${id}.spawnType`, new Set(['BALLISTIC', 'BALLISTIC_AS_BEAM', 'MISSILE', 'BEAM']));
  if (spec.visualSpawnType !== undefined) enumValue(spec.visualSpawnType, `${id}.visualSpawnType`, new Set(['BALLISTIC', 'BALLISTIC_AS_BEAM', 'MISSILE', 'BEAM']));
  if (spec.beamVisualMode !== undefined) enumValue(spec.beamVisualMode, `${id}.beamVisualMode`, new Set(['BURST', 'SUSTAINED']));
  if (spec.textureType !== undefined) enumValue(spec.textureType, `${id}.textureType`, new Set(['ROUGH', 'SMOOTH']));
  for (const key of ['fringeColor', 'coreColor', 'glowColor'] as const) {
    if (spec[key] !== undefined) colorTuple(spec[key], `${id}.${key}`, 4);
  }
  for (const key of ['muzzleFlashColor', 'engineFlameColor'] as const) {
    if (spec[key] !== undefined) colorTuple(spec[key], `${id}.${key}`, 3);
  }
  for (const key of ['turretOffsets', 'hardpointOffsets'] as const) {
    if (spec[key] !== undefined) finiteArray(spec[key], `${id}.${key}`);
  }
  if (spec.soundKey !== undefined) text(spec.soundKey, `${id}.soundKey`);

  if (spec.muzzleFlashSpec !== undefined) {
    const muzzle = object(spec.muzzleFlashSpec, `${id}.muzzleFlashSpec`);
    for (const key of ['length', 'spread', 'particleSizeMin', 'particleSizeRange', 'particleDuration'] as const) {
      finite(muzzle[key], `${id}.muzzleFlashSpec.${key}`, 0);
    }
    integer(muzzle.particleCount, `${id}.muzzleFlashSpec.particleCount`, 0);
    colorTuple(muzzle.particleColor, `${id}.muzzleFlashSpec.particleColor`, 4);
  }
  if (spec.launcherSmokeSpec !== undefined) {
    const smoke = object(spec.launcherSmokeSpec, `${id}.launcherSmokeSpec`);
    for (const key of ['particleSizeMin', 'particleSizeRange', 'cloudDuration', 'cloudRadius', 'blowbackDuration', 'blowbackLength', 'blowbackSpread'] as const) {
      finite(smoke[key], `${id}.launcherSmokeSpec.${key}`, 0);
    }
    integer(smoke.cloudParticleCount, `${id}.launcherSmokeSpec.cloudParticleCount`, 0);
    integer(smoke.blowbackParticleCount, `${id}.launcherSmokeSpec.blowbackParticleCount`, 0);
    colorTuple(smoke.particleColor, `${id}.launcherSmokeSpec.particleColor`, 4);
  }
  if (spec.missileEngineVisualSpec !== undefined) {
    const engineVisual = object(spec.missileEngineVisualSpec, `${id}.missileEngineVisualSpec`);
    finite(engineVisual.nozzleOffset, `${id}.missileEngineVisualSpec.nozzleOffset`);
    finite(engineVisual.width, `${id}.missileEngineVisualSpec.width`, 0);
    finite(engineVisual.length, `${id}.missileEngineVisualSpec.length`, 0);
    colorTuple(engineVisual.color, `${id}.missileEngineVisualSpec.color`, 4);
    if (engineVisual.glowSizeMult !== undefined) finite(engineVisual.glowSizeMult, `${id}.missileEngineVisualSpec.glowSizeMult`, 0);
    if (engineVisual.glowAlternateColor !== undefined) colorTuple(engineVisual.glowAlternateColor, `${id}.missileEngineVisualSpec.glowAlternateColor`, 4);
  }
  if (spec.missileTrailSpec !== undefined) {
    const trail = object(spec.missileTrailSpec, `${id}.missileTrailSpec`);
    finite(trail.duration, `${id}.missileTrailSpec.duration`, 0);
    finite(trail.baseWidth, `${id}.missileTrailSpec.baseWidth`, 0);
    finite(trail.widenMult, `${id}.missileTrailSpec.widenMult`, 0);
    finite(trail.minSeg, `${id}.missileTrailSpec.minSeg`, 0);
    finite(trail.spawnOffset, `${id}.missileTrailSpec.spawnOffset`);
    colorTuple(trail.color, `${id}.missileTrailSpec.color`, 4);
    enumValue(trail.blendMode, `${id}.missileTrailSpec.blendMode`, new Set(['NORMAL', 'GLOW']));
  }
  if (spec.missileExplosionVisualSpec !== undefined) {
    const explosion = object(spec.missileExplosionVisualSpec, `${id}.missileExplosionVisualSpec`);
    finite(explosion.radius, `${id}.missileExplosionVisualSpec.radius`, 0);
    colorTuple(explosion.color, `${id}.missileExplosionVisualSpec.color`, 4);
  }

  if (spec.proximityFuse !== undefined) {
    const fuse = object(spec.proximityFuse, `${id}.proximityFuse`);
    finite(fuse.range, `${id}.proximityFuse.range`, 0);
    finite(fuse.explosionRadius, `${id}.proximityFuse.explosionRadius`, 0);
    if (fuse.coreRadius !== undefined) finite(fuse.coreRadius, `${id}.proximityFuse.coreRadius`, 0);
    if (fuse.soundKey !== undefined) text(fuse.soundKey, `${id}.proximityFuse.soundKey`);
  }

  if (spec.mirv !== undefined) {
    const mirv = object(spec.mirv, `${id}.mirv`);
    for (const key of ['splitRange', 'splitRangeRange', 'minTimeToSplit', 'damage', 'emp', 'childHitpoints', 'arcDeg', 'spreadInaccuracyDeg', 'spreadSpeed', 'spreadSpeedRange', 'projectileRange'] as const) {
      finite(mirv[key], `${id}.mirv.${key}`, 0);
    }
    integer(mirv.numShots, `${id}.mirv.numShots`, 1);
    if (typeof mirv.canSplitEarly !== 'boolean') throw new Error(`${id}.mirv.canSplitEarly 必须是布尔值`);
    if (typeof mirv.evenSpread !== 'boolean') throw new Error(`${id}.mirv.evenSpread 必须是布尔值`);
    enumValue(mirv.damageType, `${id}.mirv.damageType`, new Set(['KINETIC', 'HIGH_EXPLOSIVE', 'ENERGY', 'FRAGMENTATION']));
    text(mirv.projectileSpec, `${id}.mirv.projectileSpec`);
  }

  const assetFields = ['turretSpriteUrl', 'turretGunSpriteUrl', 'hardpointSpriteUrl', 'hardpointGunSpriteUrl', 'glowSpriteUrl', 'hardpointGlowSpriteUrl', 'projSpriteUrl'] as const;
  for (const field of assetFields) {
    const value = spec[field];
    if (value !== undefined) requireAsset(text(value, `${id}.${field}`), `${id}.${field}`, requireBundledAssets);
  }
}

function validateWeaponSlot(slotInput: unknown, shipId: string, index: number): WeaponMountSlotConfig {
  const slot = object(slotInput, `${shipId}.weaponSlots[${index}]`);
  const prefix = `${shipId}.weaponSlots[${index}]`;
  text(slot.slotId, `${prefix}.slotId`);
  enumValue(slot.mountType, `${prefix}.mountType`, MOUNT_TYPES);
  enumValue(slot.slotSize, `${prefix}.slotSize`, SLOT_SIZES);
  finite(slot.x, `${prefix}.x`);
  finite(slot.y, `${prefix}.y`);
  finite(slot.baseAngleDeg, `${prefix}.baseAngleDeg`, -360, 360);
  finite(slot.arcDeg, `${prefix}.arcDeg`, 0, 360);
  if (slot.defaultWeaponId !== undefined) text(slot.defaultWeaponId, `${prefix}.defaultWeaponId`);
  return slot as unknown as WeaponMountSlotConfig;
}

function validateEngineSlot(slotInput: unknown, shipId: string, index: number): EngineSlotConfig {
  const slot = object(slotInput, `${shipId}.engineSlots[${index}]`);
  const prefix = `${shipId}.engineSlots[${index}]`;
  finite(slot.x, `${prefix}.x`);
  finite(slot.y, `${prefix}.y`);
  finite(slot.angleDeg, `${prefix}.angleDeg`, -360, 360);
  finite(slot.width, `${prefix}.width`, 0.01);
  finite(slot.length, `${prefix}.length`, 0.01);
  enumValue(slot.style, `${prefix}.style`, ENGINE_STYLES);
  return slot as unknown as EngineSlotConfig;
}

export function validateShipSpec(input: unknown, options: ShipValidationOptions = {}): asserts input is ShipSpec {
  const spec = object(input, '舰船规格');
  const id = text(spec.id, 'ship.id');
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`ship.id 含非法字符: ${id}`);
  if (!options.allowExistingId && contentRegistry.getShip(id)) throw new Error(`舰船 ID 已注册: ${id}`);

  for (const key of ['nameKey', 'descKey', 'designationKey', 'spriteUrl'] as const) text(spec[key], `${id}.${key}`);
  const spriteWidth = finite(spec.spriteWidth, `${id}.spriteWidth`, 1);
  const spriteHeight = finite(spec.spriteHeight, `${id}.spriteHeight`, 1);
  finite(spec.pivotX, `${id}.pivotX`, 0, spriteWidth);
  finite(spec.pivotY, `${id}.pivotY`, 0, spriteHeight);

  for (const key of ['collisionRadius', 'mass', 'maxSpeed', 'acceleration', 'deceleration', 'maxTurnRateDeg', 'turnAccelerationDeg', 'hitpoints', 'armorRating', 'maxFlux', 'fluxDissipation', 'shieldRadius', 'shieldEfficiency'] as const) {
    finite(spec[key], `${id}.${key}`, key === 'maxSpeed' || key === 'fluxDissipation' ? 0 : 0.000001);
  }
  integer(spec.armorCols, `${id}.armorCols`, 1, 256);
  integer(spec.armorRows, `${id}.armorRows`, 1, 256);
  finite(spec.shieldArcDeg, `${id}.shieldArcDeg`, 0, 360);
  enumValue(spec.shieldType, `${id}.shieldType`, SHIELD_TYPES);
  enumValue(spec.systemType, `${id}.systemType`, SYSTEM_TYPES);
  if (spec.hullSize !== undefined) enumValue(spec.hullSize, `${id}.hullSize`, new Set(['FIGHTER', 'FRIGATE', 'DESTROYER', 'CRUISER', 'CAPITAL_SHIP']));
  if (spec.shieldCenterX !== undefined) finite(spec.shieldCenterX, `${id}.shieldCenterX`);
  if (spec.shieldCenterY !== undefined) finite(spec.shieldCenterY, `${id}.shieldCenterY`);
  if (spec.peakCRSec !== undefined) finite(spec.peakCRSec, `${id}.peakCRSec`, 0);
  if (spec.crLossPerSec !== undefined) finite(spec.crLossPerSec, `${id}.crLossPerSec`, 0);
  if (spec.weaponRangeMult !== undefined) finite(spec.weaponRangeMult, `${id}.weaponRangeMult`, 0.01, 10);
  if (spec.fighterBays !== undefined) integer(spec.fighterBays, `${id}.fighterBays`, 0, 100);

  if (!Array.isArray(spec.weaponSlots)) throw new Error(`${id}.weaponSlots 必须是数组`);
  if (!Array.isArray(spec.engineSlots)) throw new Error(`${id}.engineSlots 必须是数组`);
  if (!Array.isArray(spec.bounds) || spec.bounds.length < 3) throw new Error(`${id}.bounds 至少需要 3 个顶点`);
  const slots = spec.weaponSlots.map((slot, index) => validateWeaponSlot(slot, id, index));
  spec.engineSlots.forEach((slot, index) => validateEngineSlot(slot, id, index));
  spec.bounds.forEach((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) throw new Error(`${id}.bounds[${index}] 必须是 [x,y]`);
    finite(point[0], `${id}.bounds[${index}][0]`);
    finite(point[1], `${id}.bounds[${index}][1]`);
  });

  const slotIds = new Set<string>();
  for (const slot of slots) {
    if (slotIds.has(slot.slotId)) throw new Error(`${id} 存在重复挂点 ID: ${slot.slotId}`);
    slotIds.add(slot.slotId);
    if (!slot.defaultWeaponId) continue;
    const weapon = options.additionalWeapons?.get(slot.defaultWeaponId) ?? contentRegistry.getWeapon(slot.defaultWeaponId);
    if (!weapon) throw new Error(`${id}.${slot.slotId} 引用了不存在的武器: ${slot.defaultWeaponId}`);
    const sizeRank: Record<string, number> = { SMALL: 1, MEDIUM: 2, LARGE: 3 };
    if (sizeRank[weapon.mountSize] > sizeRank[slot.slotSize]) {
      throw new Error(`${id}.${slot.slotId} 挂点尺寸 ${slot.slotSize} 无法容纳武器 ${weapon.id} (${weapon.mountSize})`);
    }
  }

  if (spec.defaultWeaponGroups !== undefined) {
    if (!Array.isArray(spec.defaultWeaponGroups)) throw new Error(`${id}.defaultWeaponGroups 必须是数组`);
    const groupIndices = new Set<number>();
    for (const [index, groupInput] of spec.defaultWeaponGroups.entries()) {
      const group = object(groupInput, `${id}.defaultWeaponGroups[${index}]`);
      const groupIndex = integer(group.index, `${id}.defaultWeaponGroups[${index}].index`, 0, 4);
      if (groupIndices.has(groupIndex)) throw new Error(`${id} 存在重复武器组 index: ${groupIndex}`);
      groupIndices.add(groupIndex);
      enumValue(group.mode, `${id}.defaultWeaponGroups[${index}].mode`, new Set(['LINKED', 'ALTERNATING']));
      if (typeof group.isAutofire !== 'boolean') throw new Error(`${id}.defaultWeaponGroups[${index}].isAutofire 必须是布尔值`);
      if (!Array.isArray(group.weaponSlotIds)) throw new Error(`${id}.defaultWeaponGroups[${index}].weaponSlotIds 必须是数组`);
      for (const slotId of group.weaponSlotIds) {
        const value = text(slotId, `${id}.defaultWeaponGroups[${index}].weaponSlotIds`);
        if (!slotIds.has(value)) throw new Error(`${id} 武器组引用了不存在的挂点: ${value}`);
      }
    }
  }

  requireAsset(text(spec.spriteUrl, `${id}.spriteUrl`), `${id}.spriteUrl`, options.requireBundledAssets ?? assetManager.isLoaded);
}

