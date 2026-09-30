import { retainedWeaponMedia } from './RetainedWeaponMedia';
import type { ShipSpec, WeaponMountSlotConfig } from './ShipSpec';
import type { WeaponSpec } from '../simulation/Weapon';
import { originalWeapon } from './OriginalDefaults';

/** Web-original content and user-supplied artwork, separate from native imports. */
export const ZHUYUAN_HULL_ID = 'web_zhuyuan';
export const STAR_NEEDLE_ID = 'web_zhuyuan_star_needle';
export const ECLIPSE_PROTOCOL_ID = 'WEB_ZHUYUAN_ECLIPSE_PROTOCOL';
export const ECLIPSE_ICON_URL = '/game-assets/graphics/icons/hullsys/web_zhuyuan_eclipse.png';
export const zhuYuanArtNotice = 'Web 原创扩展；舰体、炮塔和技能图标使用用户提供的专属素材。';
const hullSprite = '/game-assets/graphics/ships/web_zhuyuan/zhuyuan.png';
const turretSprite = '/game-assets/graphics/weapons/web_zhuyuan/star_needle_turret.png';
const turretGlow = '/game-assets/graphics/weapons/web_zhuyuan/star_needle_glow.png';
// Source image 1024x1536 -> physical hull 256x384. Runtime coordinates are
// +x forward / +y starboard. Never send this custom geometry through the native adapter.
const point = (x: number, y: number): [number, number] => [(896 - y) / 4, (x - 512) / 4];
const mount = (slotId: string, x: number, y: number, slotSize: 'SMALL' | 'MEDIUM', baseAngleDeg = 0, arcDeg = 240): WeaponMountSlotConfig => {
  const [forward, right] = point(x, y);
  return { slotId, x: forward, y: right, slotSize, weaponType: 'ENERGY', mountType: 'TURRET', baseAngleDeg, arcDeg };
};
// Clockwise source-image outline includes the entire inner fork, not a convex hull.
const silhouette: [number, number][] = [
  [466,20],[392,106],[323,262],[272,440],[294,480],[266,614],[281,640],
  [247,699],[188,806],[204,827],[188,872],[106,994],[105,1152],[125,1201],
  [168,1300],[199,1394],[243,1398],[280,1380],[290,1315],[321,1310],
  [347,1424],[438,1451],[458,1478],[518,1494],[554,1478],[564,1435],
  [655,1451],[683,1355],[729,1320],[744,1385],[790,1397],[827,1389],
  [859,1300],[909,1176],[919,1140],[918,992],[839,881],[821,842],[836,809],
  [807,749],[769,698],[738,635],[758,611],[733,483],[753,441],[704,301],
  [660,196],[617,103],[560,20],[581,149],[594,306],[591,430],[583,475],
  [581,519],[570,541],[554,524],[530,471],[516,466],[504,468],[489,501],
  [466,543],[448,538],[438,521],[441,466],[427,388],[418,301],[425,184],[450,66],
];
const description = '以敌方火力点燃棱镜核心的试验巡洋舰。日蚀协议会将不断攀升的载荷变成能量火力，却降低航速、耗散与护盾效率：保持在过载边缘，或及时脱离。' + zhuYuanArtNotice;
export const zhuYuanHull: ShipSpec = {
  id: ZHUYUAN_HULL_ID, sourceHullId: ZHUYUAN_HULL_ID,
  nameKey: 'ship.web_zhuyuan.name', descKey: 'ship.web_zhuyuan.desc', designationKey: 'ship.web_zhuyuan.designation',
  designation: '棱镜巡洋舰（Web 原创）', spriteUrl: hullSprite,
  spriteWidth: 256, spriteHeight: 384, pivotX: 128, pivotY: 224,
  collisionRadius: 224, mass: 2400, hullSize: 'CRUISER',
  hitpoints: 11000, armorRating: 850, armorCols: 16, armorRows: 24,
  maxFlux: 15000, fluxDissipation: 850,
  maxSpeed: 85, acceleration: 55, deceleration: 40, maxTurnRateDeg: 27, turnAccelerationDeg: 30,
  shieldType: 'OMNI', shieldRadius: 235, shieldCenterX: 15, shieldCenterY: 0,
  shieldArcDeg: 210, shieldEfficiency: .8, shieldUpkeep: .4,
  deploymentPoints: 35, deploymentCRCost: .15, peakCRSec: 420, crLossPerSec: .25,
  systemType: ECLIPSE_PROTOCOL_ID, fighterBays: 0, builtInHullMods: [],
  weaponSlots: [
    mount('WS 001', 351, 478, 'SMALL', -15), mount('WS 002', 672, 478, 'SMALL', 15),
    mount('WS 003', 335, 843, 'SMALL', -90, 230), mount('WS 004', 688, 843, 'SMALL', 90, 230),
    mount('WS 005', 512, 1196, 'SMALL', 180, 220),
    mount('WS 007', 338, 742, 'MEDIUM'), mount('WS 008', 686, 742, 'MEDIUM'),
    mount('WS 009', 512, 866, 'MEDIUM', 0, 160),
  ],
  engineSlots: [[235,1386,12,48],[395,1438,20,72],[513,1482,25,80],[632,1438,20,72],[789,1386,12,48]].map(([x,y,width,length]) => {
    const [forward,right] = point(x,y);
    return { x:forward, y:right, width, length, angleDeg:180, style:'HIGH_TECH', exhaust:{mode:'NATIVE' as const,envelopeWidth:width*1.55} };
  }),
  bounds: silhouette.map(([x,y]) => point(x,y)),
  overloadColor: [80,235,225], explosionColor: [80,225,220], explosionFlashColor: [220,255,250],
  breakProbability: .6, minPieces: 2, maxPieces: 3,
  i18n: {
    zh_CN: {
      'ship.web_zhuyuan.name': '烛渊', 'ship.web_zhuyuan.designation': '棱镜巡洋舰（原创）',
      'ship.web_zhuyuan.desc': description, 'weapon.web_zhuyuan_star_needle.name': '缝星针',
    },
    en_US: {
      'ship.web_zhuyuan.name': 'Candle Abyss', 'ship.web_zhuyuan.designation': 'Prism cruiser (Web original)',
      'ship.web_zhuyuan.desc': 'An original high-flux prism cruiser. Eclipse Protocol turns flux pressure into energy damage at the cost of mobility, cooling and shield strength. Exclusive user-supplied hull, weapon and skill artwork.',
      'weapon.web_zhuyuan_star_needle.name': 'Star Needle',
    },
  },
};
export const zhuYuanHulls: Record<string, ShipSpec> = { [ZHUYUAN_HULL_ID]: zhuYuanHull };
export const starNeedle: WeaponSpec = {
  ...originalWeapon('energy'), ...retainedWeaponMedia(STAR_NEEDLE_ID),
  id: STAR_NEEDLE_ID, mountSize:'MEDIUM', nameKey: 'weapon.web_zhuyuan_star_needle.name', ordnancePointCost: 18,
  turretSpriteUrl: turretSprite, hardpointSpriteUrl: turretSprite,
  glowSpriteUrl: turretGlow, hardpointGlowSpriteUrl: turretGlow,
  turretOffsets: [28,-3.3,29,0,28,3.3], hardpointOffsets: [28,-3.3,29,0,28,3.3],
  damagePerShot: 220, empPerShot: 120, damagePerSecond: 660 / 2.23, fluxPerShot: 240,
  range: 900, refireDelay: 1.8, chargeTime: .25, burstSize: 3, burstDelay: .09,
  projSpeed: 1450, projRadius: 2.5, projLength: 65, projWidth: 4,
  turnRateDegPerSec: 35, minSpread: 0, maxSpread: 1, spreadPerShot: .35, spreadDecay: 2,
  color: [70,235,225], fringeColor: [70,235,225,255], coreColor: [235,255,250,255],
  glowColor: [70,235,225,90], hitGlowRadius: 42, glowRadius: 22,
  muzzleFlashSpec: {
    length: 34, spread: 8, particleSizeMin: 8, particleSizeRange: 6,
    particleDuration: .12, particleCount: 8, particleColor: [70,235,225,255],
  },
};
/** Defaults are a removable fit, not free built-in weapons. Hull baseline stays empty. */
export function zhuYuanShips(): ShipSpec[] {
  const ship = structuredClone(zhuYuanHull);
  ship.weaponSlots = ship.weaponSlots.map(slot => ({ ...slot, builtIn: false,
    defaultWeaponId: slot.slotSize === 'MEDIUM' ? STAR_NEEDLE_ID : 'web_sc2_hyperion_pd',
  }));
  ship.defaultWeaponGroups = [
    { index: 0, weaponSlotIds: ['WS 007','WS 008','WS 009'], mode: 'LINKED', isAutofire: false },
    { index: 1, weaponSlotIds: ['WS 001','WS 002','WS 003','WS 004','WS 005'], mode: 'ALTERNATING', isAutofire: true },
  ];
  return [ship];
}
/** Existing refit and tooltip consumers share this catalog; native imports have been removed. */
export const zhuYuanRefit = {
  ships: { [ZHUYUAN_HULL_ID]: { op: 160, name: '烛渊', manufacturer: '烛渊计划 · Web 原创', designation: zhuYuanHull.designation! } },
  weapons: { [STAR_NEEDLE_ID]: {
    op: 18, name: '缝星针', manufacturer: '烛渊计划 · Web 原创', role: '三连发精确压制 / EMP', accuracy: '优秀', turnRate: '较快',
    description: '将三枚压缩棱镜束依次缝入同一条弹道。每发 220 能量伤害、120 EMP、240 载荷；900 射程，0.25 秒蓄力，0.09 秒连发间隔，1.8 秒冷却。\n\n配合日蚀协议，利用高载荷强化能量伤害；EMP 不会穿透护盾。中型能量挂点通用，并非免费内置武器。\n\n' + zhuYuanArtNotice,
  } },
  shipStatus: { [ZHUYUAN_HULL_ID]: { level: 'supported', reasons: ['Web 原创扩展，非原版内容。'] } },
  weaponStatus: { [STAR_NEEDLE_ID]: { level: 'supported', reasons: ['Web 原创三连发能量武器。'] } },
};
