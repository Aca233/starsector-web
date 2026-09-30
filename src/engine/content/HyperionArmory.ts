import { retainedWeaponMedia } from './RetainedWeaponMedia';
import type { WeaponSpec } from '../simulation/Weapon';
import type { ShipSpec } from './ShipSpec';
import art from './hyperion-armory-art.json';
import { originalWeapon } from './OriginalDefaults';

/** Original Web-adapted rules. No native source specs are loaded. */
export const HYPERION_WEAPONS = {
  battery: 'web_sc2_hyperion_ata',
  suppressor: 'web_sc2_hyperion_al',
  interceptor: 'web_sc2_hyperion_pd',
} as const;
type Kind = keyof typeof HYPERION_WEAPONS;
const names: Record<Kind, [string, string]> = {
  battery: ['ATA 联装激光阵列', 'ATA Twin Laser Battery'],
  suppressor: ['AL 连射压制激光', 'AL Suppression Laser'],
  interceptor: ['守望者拦截激光', 'Sentinel Interception Laser'],
};
const costs: Record<Kind, number> = { battery: 26, suppressor: 11, interceptor: 4 };
function weapon(kind: Kind, template: Parameters<typeof originalWeapon>[0], overrides: Partial<WeaponSpec>): WeaponSpec {
  const base = { ...originalWeapon(template), ...retainedWeaponMedia(HYPERION_WEAPONS[kind]) };
  delete base.beamEffect;
  delete base.onHitEffect;
  delete base.everyFrameEffect;
  delete base.turretGunSpriteUrl; delete base.hardpointGunSpriteUrl;
  const body = `/game-assets/graphics/weapons/web_sc2_hyperion/${kind}.png`;
  const glow = `/game-assets/graphics/weapons/web_sc2_hyperion/${kind}-glow.png`;
  return { ...base, id: HYPERION_WEAPONS[kind], nameKey: `weapon.${HYPERION_WEAPONS[kind]}.name`,
    tags: ['web_sc2_hyperion_armory'], ordnancePointCost: costs[kind], ...overrides,
    turretSpriteUrl: body, hardpointSpriteUrl: body, hardpointUsesHullSprite: false,
    glowSpriteUrl: glow, hardpointGlowSpriteUrl: glow, animationType: 'GLOW_AND_FLASH',
    turretOffsets: [...art[kind].offsets], hardpointOffsets: [...art[kind].offsets], visualRecoil: 0 };
}
export const hyperionWeapons: WeaponSpec[] = [
  weapon('battery', 'energy', {
    visualSpawnType: 'BALLISTIC_AS_BEAM',
    mountSize: 'LARGE', weaponType: 'ENERGY', type: 'ENERGY',
    damagePerShot: 260, damagePerSecond: 1560 / 2.25, fluxPerShot: 175,
    range: 1600, chargeTime: .15, burstSize: 6, burstDelay: .075, refireDelay: 1.725,
    maxAmmo: 24, ammoRegenPerSec: 1.5, autoCharge: true, interruptibleBurst: false,
    turretOffsets: [33, -6, 33, 6], hardpointOffsets: [48, -6, 48, 6],
    projSpeed: 1300, projLength: 62, projWidth: 12, projRadius: 6,
    turnRateDegPerSec: 18, minSpread: .2, maxSpread: 2, spreadPerShot: .2, spreadDecay: 3,
    color: [255, 125, 55], fringeColor: [255, 85, 30, 255], coreColor: [255, 236, 183, 255],
    glowColor: [255, 155, 65, 220], hitGlowRadius: 45,
    muzzleFlashSpec: { length: 32, spread: 4, particleSizeMin: 6, particleSizeRange: 8,
      particleDuration: .1, particleCount: 7, particleColor: [255, 165, 75, 210] },
    aiHints: [],
  }),
  weapon('suppressor', 'energy', {
    visualSpawnType: 'BALLISTIC_AS_BEAM',
    mountSize: 'MEDIUM', weaponType: 'ENERGY', type: 'KINETIC',
    damagePerShot: 60, damagePerSecond: 360 / .93, fluxPerShot: 50,
    range: 1350, chargeTime: 0, burstSize: 6, burstDelay: .07, refireDelay: .58,
    autoCharge: false, interruptibleBurst: true, maxAmmo: undefined, ammoRegenPerSec: 0,
    projSpeed: 1500, projLength: 40, projWidth: 6, projRadius: 3,
    turnRateDegPerSec: 45, minSpread: .1, maxSpread: 1, spreadPerShot: .12, spreadDecay: 3,
    color: [65, 180, 255], fringeColor: [40, 135, 255, 240], coreColor: [215, 245, 255, 255],
    glowColor: [65, 175, 255, 190], hitGlowRadius: 22,
    muzzleFlashSpec: { length: 18, spread: 3, particleSizeMin: 3, particleSizeRange: 5,
      particleDuration: .08, particleCount: 4, particleColor: [80, 190, 255, 180] },
    aiHints: [],
  }),
  weapon('interceptor', 'beam', {
    mountSize: 'SMALL', weaponType: 'ENERGY', type: 'ENERGY', isPointDefense: true,
    damagePerSecond: 110, fluxPerSecond: 70, range: 650, beamWidth: 5,
    beamSpeed: 3000, turnRateDegPerSec: 180,
    color: [130, 220, 255], fringeColor: [65, 175, 225, 225], coreColor: [230, 255, 255, 255],
    glowColor: [100, 215, 255, 165], hitGlowRadius: 15, aiHints: ['PD'],
  }),
];
const descriptions: Record<Kind, string> = {
  battery: '六发交替齐射，每发260能量伤害/175载荷，射程1600；0.15秒准备、0.075秒弹间隔、1.725秒冷却。24发电容储备，每秒恢复1.5发；持续突击会耗尽储备，需要错峰开火。适合在压盾后打重击，不是无限持续火力。',
  suppressor: '六连发，每发60动能伤害/50载荷，射程1350；0.07秒弹间隔、0.58秒冷却，无弹药上限。激光弹有飞行时间、造成硬载荷；对盾双倍、对装甲较弱。用于压盾后接ATA和大和炮，不是同时包办破甲的万能炮。',
  interceptor: '持续精确光束，110能量DPS/70载荷每秒，射程650；优先拦截导弹和战机。持续束不享受射速倍率，不代替大口径对舰火力。',
};
export const hyperionArmoryRefit = {
  weapons: Object.fromEntries((Object.keys(HYPERION_WEAPONS) as Kind[]).map(kind => [HYPERION_WEAPONS[kind], {
    op: costs[kind], name: names[kind][0], manufacturer: '休伯利安 · 雷诺军械（Web）',
    role: { battery: '六发齐射 / 电容弹匣', suppressor: '连续压盾 / 动能激光弹', interceptor: '精准点防御' }[kind],
    description: descriptions[kind] + '\n\n成功跃迁收束后6秒：能量武器伤害×1.2、射速×1.5、载荷成本×1.5（持续光束不加速）。过载/排散中止。可自由换装到兼容槽，不是免费内置。Web主题规则；已接入本地生成的三档专属炮塔和发光层；音效与通用弹道渲染复用宿主。',
  }])),
  weaponStatus: Object.fromEntries(Object.values(HYPERION_WEAPONS).map(id => [id, {
    level: 'supported', reasons: ['独立主题武器、三档专属炮塔与真实枪口；仍为Web改编初试数值。'],
  }])),
};
export const hyperionArmoryStrings: ShipSpec['i18n'] = {
  zh_CN: { ...Object.fromEntries((Object.keys(HYPERION_WEAPONS) as Kind[]).map(k => [`weapon.${HYPERION_WEAPONS[k]}.name`, names[k][0]])),
    'weapon.web_sc2_hyperion_yamato.name': '大和炮' },
  en_US: { ...Object.fromEntries((Object.keys(HYPERION_WEAPONS) as Kind[]).map(k => [`weapon.${HYPERION_WEAPONS[k]}.name`, names[k][1]])),
    'weapon.web_sc2_hyperion_yamato.name': 'Yamato Cannon' },
};
