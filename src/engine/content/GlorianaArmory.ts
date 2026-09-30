import { GLORIANA_SIEGE_HIT_EFFECT } from '../extensions/weapon-effects/GlorianaSiegeHit';
import { retainedWeaponMedia } from './RetainedWeaponMedia';
import type { WeaponSpec } from '../simulation/Weapon';
import type { ShipSpec } from './ShipSpec';
import { originalWeapon } from './OriginalDefaults';
import art from './gloriana-armory-art.json';

/** Shipborne arsenal tiers promoted S→M, M→L, L→XL on 2026-09-29.
 * Art, IDs, OP and authored combat values stay unchanged; aircraft weapons are separate. */
export const GLORIANA_WEAPONS = {
  macro: 'web_gloriana_macro', lance: 'web_gloriana_lance', siege: 'web_gloriana_siege',
  torpedo: 'web_gloriana_torpedo', bolter: 'web_gloriana_bolter', interceptor: 'web_gloriana_interceptor',
} as const;
type Kind = keyof typeof GLORIANA_WEAPONS;
const names: Record<Kind, [string, string]> = {
  macro: ['「雷霆」双联宏炮', 'Thunder Macrocannon'],
  lance: ['「裁决」重型光矛', 'Judgement Lance'],
  siege: ['「破城」攻城炮', 'Breacher Siege Cannon'],
  torpedo: ['「誓约」重型鱼雷', 'Oath Heavy Torpedo'],
  bolter: ['「铁卫」近防爆矢炮', 'Ironward Defence Bolter'],
  interceptor: ['「烛卫」截击激光', 'Vigil Interception Laser'],
};
const costs: Record<Kind, number> = {macro: 28, lance: 30, siege: 12, torpedo: 18, bolter: 4, interceptor: 5};
function weapon(kind: Kind, template: Parameters<typeof originalWeapon>[0], overrides: Partial<WeaponSpec>): WeaponSpec {
  const base = { ...originalWeapon(template), ...retainedWeaponMedia(GLORIANA_WEAPONS[kind]) };
  // The approved art is one layer. Never accidentally draw native barrels/glow over it.
  delete base.turretGunSpriteUrl; delete base.hardpointGunSpriteUrl;
  delete base.glowSpriteUrl; delete base.hardpointGlowSpriteUrl;
  delete base.beamEffect; delete base.onHitEffect; delete base.everyFrameEffect;
  const sprite = `/game-assets/graphics/weapons/web_gloriana/${kind}.png`;
  return {...base, id: GLORIANA_WEAPONS[kind], nameKey: `weapon.${GLORIANA_WEAPONS[kind]}.name`,
    ordnancePointCost: costs[kind], tags: ['web_gloriana_armory'], aiHints: [],
    turretSpriteUrl: sprite, hardpointSpriteUrl: sprite, hardpointUsesHullSprite: false,
    turretOffsets: [...art[kind].offsets], hardpointOffsets: [...art[kind].offsets],
    visualRecoil: 0, renderBarrelBelow: false, ...overrides};
}
export const glorianaWeapons: WeaponSpec[] = [
  weapon('macro', 'gun', {
    mountSize: 'EXTRA_LARGE', weaponType: 'BALLISTIC', type: 'KINETIC',
    damagePerShot: 450, damagePerSecond: 1800 / 3.65, fluxPerShot: 380,
    range: 2200, chargeTime: .25, burstSize: 4, burstDelay: .2, refireDelay: 2.8,
    fadeTime: .5, projSpeed: 950, turnRateDegPerSec: 12, minSpread: .3, maxSpread: 2.2, spreadPerShot: .45, spreadDecay: 2,
    projSpriteUrl: '/game-assets/graphics/missiles/shell_large_yellow.png',
    color: [245,203,133], fringeColor: [220,158,80,235], coreColor: [255,238,194,225],
    muzzleFlashSpec: {length: 48, spread: 16, particleSizeMin: 9, particleSizeRange: 16, particleDuration: .15, particleCount: 20, particleColor: [255,211,145,210]},
  }),
  weapon('lance', 'beam', {
    mountSize: 'EXTRA_LARGE', weaponType: 'ENERGY', type: 'ENERGY',
    damagePerSecond: 1800, empPerSecond: 0, fluxPerSecond: 1500, range: 2600,
    beamFireOnlyOnFullCharge: true, beamSourceChargeupTime: 1.2, beamDuration: 1.8, beamSourceChargedownTime: .4, beamBurstDelay: 5.5,
    refireDelay: 5.5, burstDelay: 5.5, beamWidth: 15, turnRateDegPerSec: 7,
    color: [255,188,90], fringeColor: [234,142,36,230], coreColor: [255,247,222,255], glowColor: [255,190,90,175],
    aiHints: ['FIRE_WHEN_INEFFICIENT'],
  }),
  weapon('siege', 'gun', {
    mountSize: 'LARGE', weaponType: 'BALLISTIC', type: 'HIGH_EXPLOSIVE',
    damagePerShot: 1000, damagePerSecond: 1000 / 3.55, fluxPerShot: 800,
    range: 2000, passThroughMissiles: true, passThroughFighters: true, passThroughFightersOnlyWhenDestroyed: true, chargeTime: .45, burstSize: 1, burstDelay: 0, refireDelay: 3.1,
    fadeTime: .5, projSpeed: 720, turnRateDegPerSec: 18, minSpread: .3, maxSpread: 1.2, spreadPerShot: .5,
    // Heavy physical shell, distinct from the golden macrocannon tracer. Visuals only.
    projSpriteUrl: '/game-assets/graphics/missiles/shell_hellbore.png',
    projWidth: 11, projRadius: 5.5, projLength: 22, aiHints: ['USE_LESS_VS_SHIELDS'],
    color: [220, 155, 85], fringeColor: [220, 155, 85, 125], coreColor: [255, 245, 230, 255],
    hitGlowRadius: 30, glowRadius: 0,
    muzzleFlashSpec: {length: 30, spread: 10, particleSizeMin: 8, particleSizeRange: 8,
      particleDuration: .1, particleCount: 8, particleColor: [255, 215, 155, 200]},
    onHitEffect: GLORIANA_SIEGE_HIT_EFFECT,
  }),
  weapon('torpedo', 'missile', {
    mountSize: 'LARGE', weaponType: 'MISSILE', type: 'HIGH_EXPLOSIVE',
    damagePerShot: 4500, damagePerSecond: 9000 / 9.25, fluxPerShot: 0,
    range: 3200, chargeTime: .3, burstSize: 2, burstDelay: .45, refireDelay: 8.5,
    maxAmmo: 8, ammoRegenPerSec: 0, projSpeed: 320, maxSpeed: 320, launchSpeed: 100,
    engineAcceleration: 220, missileDeceleration: 140, maxTurnRate: Math.PI / 10,
    maxTurnAcceleration: Math.PI / 4, flightTime: 12, missileHp: 650,
    turnRateDegPerSec: 18, aiHints: ['STRIKE', 'CONSERVE_1', 'USE_LESS_VS_SHIELDS'],
  }),
  weapon('bolter', 'gun', {
    mountSize: 'MEDIUM', weaponType: 'BALLISTIC', type: 'FRAGMENTATION', isPointDefense: true,
    damagePerShot: 40, damagePerSecond: 240 / .475, fluxPerShot: 8,
    range: 700, burstSize: 6, burstDelay: .045, refireDelay: .25,
    spawnType: 'BALLISTIC', fadeTime: .2, projLength: 16, projWidth: 2.5,
    projSpeed: 1100, turnRateDegPerSec: 160, minSpread: .5, maxSpread: 5, spreadPerShot: .45, spreadDecay: 18,
    aiHints: ['PD'],
    muzzleFlashSpec: {length: 15, spread: 7, particleSizeMin: 3, particleSizeRange: 4, particleDuration: .08, particleCount: 4, particleColor: [255,217,154,180]},
  }),
  weapon('interceptor', 'beam', {
    mountSize: 'MEDIUM', weaponType: 'ENERGY', type: 'ENERGY', isPointDefense: true,
    damagePerSecond: 100, fluxPerSecond: 70, range: 850, turnRateDegPerSec: 150, beamWidth: 5,
    color: [255,192,110], fringeColor: [225,151,60,220], coreColor: [255,245,217,255], glowColor: [255,185,85,140],
    aiHints: ['PD'],
  }),
];
const descriptions: Record<Kind, string> = {
  macro: '四发动能齐射，每发450伤害/380载荷，射程2200。0.25秒准备、0.2秒弹间隔、2.8秒冷却。适合炮廊战列敕令压盾；低转速、射击间隙和高爆不足要求副炮接力。',
  lance: '1.2秒充能、1.8秒全功率照射、0.4秒收束、5.5秒再充能。全功率1800能量DPS/1500载荷每秒，射程2600。适合宏炮压盾后的集中打击；不穿盾、不附送EMP，光束对普通盾产生软载荷。橙色能量舱逐段充能，满充后出束；核心固定炮射界窄，需要舰首持续对准。',
  siege: '每发1000高爆伤害/800载荷，射程2000；0.45秒准备、3.1秒冷却。重弹破甲，盾前效率低，射速与弹速偏慢；自动模式在目标正面护盾遮挡时等待，交给宏炮压盾后接力破甲；可手动强制开火。可穿过导弹和已击毁战机，但不会穿透实体掩体，不承担近防。',
  torpedo: '双发弱制导重型鱼雷，每发4500高爆伤害，射程3200，备弹8枚（4次完整双发），战斗中不自动补给。0.3秒准备、0.45秒弹间隔、8.5秒冷却。弹体650耐久、最高320航速，容易被战机和近防拦截；适合破盾窗口发射而不是远距离盲射。自动模式避免向被护盾遮挡的目标开火，手动不限制。需要导弹兼容挂点，舰艏M12/M13为通用大槽（历史槽ID保留）。双轨弹体随实际发射移除，冷却末段从剩余库存补装，弹尽后保持空架；架上弹计入总备弹，不额外补给。',
  bolter: '六发短点射，每发40破片伤害/8载荷，射程700；高转速拦截近距导弹和战机。对装甲极弱，不应替代主炮；与更远的截击激光形成两层近防。',
  interceptor: '持续精确截击，100能量DPS/70载荷每秒，射程850。没有散布，优先追踪导弹与战机；比爆矢近防覆盖远，但面对密集目标时单体输出有限。',
};
export const glorianaArmoryRefit = {
  weapons: Object.fromEntries((Object.keys(GLORIANA_WEAPONS) as Kind[]).map(kind => [GLORIANA_WEAPONS[kind], {
    op: costs[kind], name: names[kind][0], manufacturer: '荣光女王 · 帝国军械库（Web）',
    role: ({macro:'动能齐射 / 压盾',lance:'充能光矛 / 对舰',siege:'高爆重弹 / 破甲',torpedo:'有限弹药 / 突击',bolter:'近距点防御',interceptor:'精确点防御'})[kind],
    description: descriptions[kind] + '\n\n战锤主题 Web 原创适配，使用用户选定素材；音效、光效与通用弹体按用户要求保留原版素材。非免费内置武器，可用于兼容挂点。',
  }])),
  weaponStatus: Object.fromEntries(Object.values(GLORIANA_WEAPONS).map(id => [id, {level:'supported', reasons:['Web主题军械，用户选定炮体素材；非原版数值。']}])),
};
export const glorianaArmoryStrings: ShipSpec['i18n'] = {
  zh_CN: Object.fromEntries((Object.keys(GLORIANA_WEAPONS) as Kind[]).map(k => [`weapon.${GLORIANA_WEAPONS[k]}.name`, names[k][0]])),
  en_US: Object.fromEntries((Object.keys(GLORIANA_WEAPONS) as Kind[]).map(k => [`weapon.${GLORIANA_WEAPONS[k]}.name`, names[k][1]])),
};
