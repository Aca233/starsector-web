import { ShipSpec, WeaponMountSlotConfig, EngineSlotConfig } from '../modding/ModManager';
import { WeaponSpec } from '../simulation/Weapon';
import { ShieldType } from '../simulation/Shield';
import { ShipSystemType } from '../simulation/ShipSystem';
import { DamageType } from '../simulation/ArmorGrid';

/**
 * 宽松 JSON 解析器 (兼容原版 Starsector 的 # 注释、无引号枚举键及尾随逗号)
 */
export function parseStarsectorJson(rawText: string): any {
  // 1. 过滤 # 与 // 单行注释
  let cleaned = rawText.replace(/#.*/g, '').replace(/\/\/.*/g, '');
  
  // 2. 补全未加引号的枚举标识符 (如 style: HIGH_TECH, textureType: ROUGH)
  cleaned = cleaned.replace(/:\s*([A-Za-z_][A-Za-z0-9_]*)\s*([,}\]])/g, ': "$1"$2');
  
  // 3. 清除末尾多余的逗号
  cleaned = cleaned.replace(/,\s*([,}\]])/g, '$1');

  return JSON.parse(cleaned);
}

/**
 * 官方 CSV 解析器
 */
export function parseStarsectorCsv(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    // 简易 CSV 切分 (考虑逗号)
    const cols = lines[i].split(',');
    if (cols.length < headers.length) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j]?.trim() || '';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 原版资产直读装载器 (StarsectorDataLoader)
 * 通过 /api/asset 原位直读官方本地 data/hulls, data/weapons, data/shipsystems 真实文件
 */
export class StarsectorDataLoader {
  private static instance: StarsectorDataLoader;

  private constructor() {}

  public static getInstance(): StarsectorDataLoader {
    if (!StarsectorDataLoader.instance) {
      StarsectorDataLoader.instance = new StarsectorDataLoader();
    }
    return StarsectorDataLoader.instance;
  }

  /**
   * 从本地文件系统异步载入真实的 .ship 与 CSV 舰船规格
   */
  public async loadShipFromSource(hullId: string): Promise<ShipSpec> {
    // 1. 读取原版 .ship 文件
    const shipRes = await fetch(`/api/asset?path=data/hulls/${hullId}.ship`);
    if (!shipRes.ok) throw new Error(`Failed to load ${hullId}.ship`);
    const shipJson = parseStarsectorJson(await shipRes.text());

    // 2. 读取 ship_data.csv 中对应条目的真实基础属性
    const csvRes = await fetch(`/api/asset?path=data/hulls/ship_data.csv`);
    const csvText = await csvRes.text();
    const rows = parseStarsectorCsv(csvText);
    const row = rows.find(r => r['id'] === hullId) || {};

    const hitpoints = parseFloat(row['hitpoints'] || '10000');
    const armorRating = parseFloat(row['armor rating'] || '1000');
    const maxFlux = parseFloat(row['max flux'] || '10000');
    const fluxDissipation = parseFloat(row['flux dissipation'] || '500');
    const maxSpeed = parseFloat(row['max speed'] || '30');
    const acceleration = parseFloat(row['acceleration'] || '20');
    const deceleration = parseFloat(row['deceleration'] || '15');
    const maxTurnRate = parseFloat(row['max turn rate'] || '10');
    const turnAcceleration = parseFloat(row['turn acceleration'] || '10');
    const mass = parseFloat(row['mass'] || '1000');
    const peakCRSec = parseFloat(row['peak CR sec'] || '720');
    const crLossPerSec = parseFloat(row['CR loss/sec'] || '0.25');
    const designation = row['designation'] || '';

    // 护盾与战术系统
    const shieldType = (row['shield type'] || 'NONE') as ShieldType;
    const shieldArc = parseFloat(row['shield arc'] || '0');
    const shieldEfficiency = parseFloat(row['shield efficiency'] || '1.0');
    const systemId = (row['system id'] || '').toLowerCase();
    const systemType: ShipSystemType = systemId.includes('burn')
      ? 'BURN_DRIVE'
      : systemId.includes('fortress')
      ? 'FORTRESS_SHIELD'
      : 'NONE';

    // 转换原版 weaponSlots
    const weaponSlots: WeaponMountSlotConfig[] = (shipJson.weaponSlots || []).map((s: any) => {
      // 原版 .ship 中的 locations 为 [y, x] 或 [x, y]
      const loc = s.locations || [0, 0];
      return {
        slotId: s.id,
        mountType: s.mount,
        slotSize: s.size,
        x: loc[0],
        y: loc[1],
        baseAngleDeg: s.angle || 0,
        arcDeg: s.arc || 10,
        defaultWeaponId: shipJson.builtInWeapons?.[s.id]
      };
    });

    // 转换原版 engineSlots
    const engineSlots: EngineSlotConfig[] = (shipJson.engineSlots || []).map((e: any) => {
      const loc = e.location || [0, 0];
      return {
        x: loc[0],
        y: loc[1],
        angleDeg: e.angle || 180,
        width: e.width || 15,
        length: e.length || 50,
        style: e.style || 'LOW_TECH'
      };
    });

    const spriteRel = shipJson.spriteName || `graphics/ships/${hullId}.png`;
    const spriteWidth = shipJson.width || 300;
    const spriteHeight = shipJson.height || 300;
    const center = shipJson.center || [spriteWidth / 2, spriteHeight / 2];
    const pivotX = center[0];
    const pivotY = spriteHeight - center[1]; // OpenGL 坐标系转 Canvas 顶方向坐标

    const bounds: [number, number][] = [];
    if (Array.isArray(shipJson.bounds)) {
      for (let i = 0; i < shipJson.bounds.length; i += 2) {
        bounds.push([shipJson.bounds[i], shipJson.bounds[i + 1]]);
      }
    }

    return {
      id: hullId,
      nameKey: `ship.${hullId}.name`,
      descKey: `ship.${hullId}.desc`,
      designationKey: `ship.${hullId}.designation`,
      spriteUrl: `/api/asset?path=${spriteRel}`,
      spriteWidth,
      spriteHeight,
      pivotX,
      pivotY,
      collisionRadius: shipJson.collisionRadius || 200,
      mass,
      maxSpeed,
      acceleration,
      deceleration,
      maxTurnRateDeg: maxTurnRate,
      turnAccelerationDeg: turnAcceleration,
      hitpoints,
      armorRating,
      armorCols: Math.max(10, Math.round((shipJson.collisionRadius || 200) / 18)),
      armorRows: Math.max(8, Math.round((shipJson.collisionRadius || 200) / 22)),
      maxFlux,
      fluxDissipation,
      peakCRSec,
      crLossPerSec,
      designation,
      shieldType,
      shieldArcDeg: shieldArc,
      shieldRadius: shipJson.shieldRadius || shipJson.collisionRadius,
      shieldEfficiency,
      systemType,
      weaponSlots,
      engineSlots,
      bounds
    };
  }

  /**
   * 从本地文件系统异步载入真实的 .wpn 武器规格
   */
  public async loadWeaponFromSource(weaponId: string): Promise<WeaponSpec> {
    const wpnRes = await fetch(`/api/asset?path=data/weapons/${weaponId}.wpn`);
    if (!wpnRes.ok) throw new Error(`Failed to load ${weaponId}.wpn`);
    const wpnJson = parseStarsectorJson(await wpnRes.text());

    const csvRes = await fetch(`/api/asset?path=data/weapons/weapon_data.csv`);
    const rows = parseStarsectorCsv(await csvRes.text());
    const row = rows.find(r => r['id'] === weaponId) || {};

    const damagePerShot = parseFloat(row['damage/shot'] || '0');
    const damagePerSecond = parseFloat(row['damage/second'] || '0');
    const energyPerShot = parseFloat(row['energy/shot'] || '0');
    const energyPerSecond = parseFloat(row['energy/second'] || '0');
    const range = parseFloat(row['range'] || '1000');
    const type = (row['type'] || 'ENERGY') as DamageType;
    const isBeam = wpnJson.specClass === 'beam';
    const fluxPerShot = isBeam ? energyPerSecond : energyPerShot;
    const projSpeed = isBeam ? 0 : parseFloat(row['proj speed'] || '800');

    // 默认光晕色与弹药色
    const color: [number, number, number] = wpnJson.glowColor
      ? [wpnJson.glowColor[0], wpnJson.glowColor[1], wpnJson.glowColor[2]]
      : [255, 200, 100];

    return {
      id: weaponId,
      nameKey: `weapon.${weaponId}.name`,
      type,
      mountSize: wpnJson.size || 'MEDIUM',
      isBeam,
      damagePerShot,
      damagePerSecond,
      fluxPerShot,
      range,
      refireDelay: damagePerShot > 0 ? Math.max(0.05, (damagePerShot / Math.max(1, damagePerSecond))) : 0.1,
      projSpeed,
      projRadius: wpnJson.size === 'LARGE' ? 8 : 5,
      color,
      turnRateDegPerSec: parseFloat(row['turn rate'] || '25'),
      minSpread: parseFloat(row['min spread'] || '0'),
      maxSpread: parseFloat(row['max spread'] || '0'),
      spreadPerShot: parseFloat(row['spread/shot'] || '0'),
      spreadDecay: parseFloat(row['spread decay/sec'] || '0'),
      burstSize: parseFloat(row['burst size'] || '1'),
      burstDelay: parseFloat(row['burst delay'] || '0'),
      turretOffsets: wpnJson.turretOffsets,
      hardpointOffsets: wpnJson.hardpointOffsets,
      turretSpriteUrl: wpnJson.turretSprite ? `/api/asset?path=${wpnJson.turretSprite}` : undefined,
      hardpointSpriteUrl: wpnJson.hardpointSprite ? `/api/asset?path=${wpnJson.hardpointSprite}` : undefined,
      glowSpriteUrl: wpnJson.turretGlowSprite ? `/api/asset?path=${wpnJson.turretGlowSprite}` : undefined,
      hardpointGlowSpriteUrl: wpnJson.hardpointGlowSprite ? `/api/asset?path=${wpnJson.hardpointGlowSprite}` : undefined,
      visualRecoil: wpnJson.visualRecoil,
      muzzleFlashSpec: wpnJson.muzzleFlashSpec,
      soundKey: wpnJson.fireSoundTwo || wpnJson.fireSoundOne
    };
  }
}

export const dataLoader = StarsectorDataLoader.getInstance();
