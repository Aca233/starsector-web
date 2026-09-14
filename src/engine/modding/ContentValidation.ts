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
  if (!Array.isArray(spec.color) || spec.color.length !== 3) throw new Error(`${id}.color 必须是 RGB 三元组`);
  spec.color.forEach((channel, index) => finite(channel, `${id}.color[${index}]`, 0, 255));

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

