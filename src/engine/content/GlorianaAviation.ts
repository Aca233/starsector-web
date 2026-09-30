import { retainedWeaponMedia } from './RetainedWeaponMedia';
import type { ShipSpec } from './ShipSpec';
import type { WeaponSpec } from '../simulation/Weapon';
import { originalWeapon, originalCraft } from './OriginalDefaults';
import art from './gloriana-aviation-art.json';

/** Theme adaptation, not a canonical Gloriana complement. Uses the three user-approved aircraft sprites. */
export const GLORIANA_CRAFT = {
  fury: 'web_gloriana_fury', starhawk: 'web_gloriana_starhawk', thunderhawk: 'web_gloriana_thunderhawk',
} as const;
export type GlorianaCraftRole = keyof typeof GLORIANA_CRAFT;
export function glorianaCraftRole(spec: Pick<ShipSpec, 'id' | 'sourceHullId'>): GlorianaCraftRole | undefined {
  return (Object.keys(GLORIANA_CRAFT) as GlorianaCraftRole[]).find(role => GLORIANA_CRAFT[role] === (spec.sourceHullId ?? spec.id));
}
export const GLORIANA_AIR_WEAPONS = {
  laser: 'web_gloriana_fury_laser', cannon: 'web_gloriana_thunderhawk_cannon', torpedo: 'web_gloriana_starhawk_torpedo',
} as const;
const W = GLORIANA_AIR_WEAPONS;
const artNote = '战锤主题Web改编；使用玩家提供的独立机体图，不代表原著固定编制。';
export const glorianaWings = {
  web_gloriana_fury_wing: { specId: GLORIANA_CRAFT.fury, role: 'FIGHTER', category: 'INTERCEPTOR', count: 4, rebuildSeconds: 12, op: 8, range: 3200,
    name: '狂怒截击机联队', displayName: '狂怒', sourceRole: 'INTERCEPTOR', formation: 'V',
    roleDescription: '截击 / 护航', description: '4机拦截屏障；优先来袭导弹和敌方航空器，无明确攻击令不突击大型舰。600结构/120装甲，双激光阵列合计200名义DPS；无盾，对重装甲目标效率有限。' + artNote },
  web_gloriana_starhawk_wing: { specId: GLORIANA_CRAFT.starhawk, role: 'BOMBER', category: 'BOMBER', count: 2, rebuildSeconds: 24, op: 18, range: 4000,
    name: '星鹰轰炸机联队', displayName: '星鹰', sourceRole: 'BOMBER', formation: 'V',
    roleDescription: '双雷 / 窗口突击', description: '2机，每架1600结构/300装甲，携带2枚2000高爆、350耐久鱼雷。等待目标朝向本机的护盾缺口或过载/排散，明确攻击令可强制投弹；弹尽返航装填12秒，召回保持待命。无盾且怕近防。' + artNote },
  web_gloriana_thunderhawk_wing: { specId: GLORIANA_CRAFT.thunderhawk, role: 'FIGHTER', category: 'FIGHTER', count: 1, rebuildSeconds: 30, op: 14, range: 3600,
    name: '雷鹰重装炮艇联队', displayName: '雷鹰', sourceRole: 'FIGHTER', formation: 'V',
    roleDescription: '重装 / 持续压盾', description: '1架重装炮艇，3200结构/500装甲；在距目标外缘约680处持续点射，800射程、660名义动能DPS压盾，为星鹰制造窗口。重甲无盾、航速低，不能当截击机；本版无登舰/运兵机制。' + artNote },
} as const;

function gun(id: string, kind: Parameters<typeof originalWeapon>[0], overrides: Partial<WeaponSpec>): WeaponSpec {
  const base = { ...originalWeapon(kind), ...retainedWeaponMedia(id) };
  delete base.onHitEffect; delete base.everyFrameEffect; delete base.beamEffect;
  return { ...base, id, nameKey: `weapon.${id}.name`, ordnancePointCost: 0,
    // Cannon/launcher shells are already in the approved aircraft sprite.
    hardpointUsesHullSprite: true, turnRateDegPerSec: 0,
    turretOffsets:[0,0],hardpointOffsets:[0,0],tags: ['web_gloriana_aviation'], aiHints: [], alwaysFire: false, fluxPerShot: 0, ...overrides };
}
export const glorianaAirWeapons: WeaponSpec[] = [
  gun(W.laser, 'energy', { weaponType: 'ENERGY', type: 'ENERGY', isPointDefense: true,
    damagePerShot: 20, damagePerSecond: 100, range: 600, burstSize: 3, burstDelay: .08, refireDelay: .44,
    minSpread: 0, maxSpread: 2, spreadPerShot: .2, projSpeed: 1400, projLength: 20, projWidth: 2, color: [255, 105, 65] }),
  gun(W.cannon, 'gun', { type: 'KINETIC', isPointDefense: false,
    damagePerShot: 220, damagePerSecond: 660, range: 800, burstSize: 3, burstDelay: .15, refireDelay: .7,
    minSpread: .2, maxSpread: 1.5, spreadPerShot: .2, projSpeed: 1000, projLength: 25 }),
  gun(W.torpedo, 'missile', { damagePerShot: 2000, damagePerSecond: 2000,
    range: 1200, maxAmmo: 1, ammoRegenPerSec: 0, burstSize: 1, burstDelay: 0, refireDelay: .65,
    chargeTime: .2, missileHp: 350, launchSpeed: 160, projSpeed: 380, maxSpeed: 380,
    flightTime: 5, maxTurnRate: .65, maxTurnAcceleration: 2, engineAcceleration: 500 }),
];
const titles = { fury: ['狂怒截击机', 'Fury Interceptor'], starhawk: ['星鹰轰炸机', 'Starhawk Bomber'], thunderhawk: ['雷鹰重装炮艇', 'Thunderhawk Gunship'] };
function craft(role: GlorianaCraftRole, overrides: Partial<ShipSpec>): ShipSpec {
  const base = originalCraft(), id = GLORIANA_CRAFT[role];
  const a=art[role], scale=a.size/1254, local=([x,y]: number[])=>({x:(a.pivot[1]-y)*scale,y:(x-a.pivot[0])*scale});
  const weapon=role==='fury'?W.laser:role==='starhawk'?W.torpedo:W.cannon;
  const slots=a.muzzles.map((point,index)=>({slotId:'GUN_'+index,mountType:'HARDPOINT' as const,slotSize:'SMALL' as const,
    weaponType:role==='fury'?'ENERGY' as const:role==='starhawk'?'MISSILE' as const:'BALLISTIC' as const,
    ...local(point),baseAngleDeg:0,arcDeg:role==='starhawk'?25:40,defaultWeaponId:weapon,builtIn:true}));
  return { ...base, id, sourceHullId: id, nameKey: `ship.${id}.name`, descKey: `ship.${id}.desc`, designationKey: `ship.${id}.designation`,
    designation: '帝国航空 · Web扩展', hullSize: 'FIGHTER', fighterBays: 0, fighterWings: [],
    builtInHullMods: [], shieldType: 'NONE', shieldArcDeg: 0, shieldUpkeep: 0, systemType: 'NONE',
    maxFlux: 500, fluxDissipation: 100, ...overrides,
    spriteUrl:'/game-assets/graphics/ships/web_gloriana/aviation/'+role+'.png',spriteWidth:a.size,spriteHeight:a.size,
    pivotX:a.pivot[0]*scale,pivotY:a.pivot[1]*scale,collisionRadius:a.size*.57,mass:role==='fury'?45:role==='starhawk'?80:140,
    bounds:a.outline.map(p=>{const v=local(p);return [v.x,v.y] as [number,number];}),
    engineSlots:a.nozzles.map(([x,y,width])=>({...local([x,y]),angleDeg:180,width:width*scale,length:role==='fury'?72:role==='starhawk'?83:96,style:'LOW_TECH' as const})),
    weaponSlots:slots,
    defaultWeaponGroups: [{index:0,weaponSlotIds:slots.map(s=>s.slotId),mode:role==='starhawk'?'ALTERNATING':'LINKED',isAutofire:false}],
    i18n: {zh_CN:{[`ship.${id}.name`]:titles[role][0],[`ship.${id}.desc`]:glorianaWings[`${id}_wing` as keyof typeof glorianaWings].description,[`ship.${id}.designation`]:'帝国航空 · Web扩展'},
      en_US:{[`ship.${id}.name`]:titles[role][1],[`ship.${id}.desc`]:'Warhammer-themed mixed aviation wing. Player-provided artwork; not a canonical Gloriana complement.',[`ship.${id}.designation`]:'Imperial aviation (Web extension)'}},
  };
}
export const glorianaAircraft: ShipSpec[] = [
  craft('fury', { hitpoints: 600, armorRating: 120, maxSpeed: 310, acceleration: 420, deceleration: 360, maxTurnRateDeg: 170, turnAccelerationDeg: 340 }),
  craft('starhawk', { hitpoints: 1600, armorRating: 300, maxSpeed: 175, acceleration: 250, deceleration: 230, maxTurnRateDeg: 85, turnAccelerationDeg: 170 }),
  craft('thunderhawk', { hitpoints: 3200, armorRating: 500, maxSpeed: 145, acceleration: 170, deceleration: 220, maxTurnRateDeg: 70, turnAccelerationDeg: 140 }),
];
export const glorianaAviationRefit = {
  wings: glorianaWings,
  weapons: Object.fromEntries(glorianaAirWeapons.map(w => [w.id, {op:0, name:({[W.laser]:'机载激光阵列',[W.cannon]:'雷鹰背负战炮',[W.torpedo]:'星鹰重型对舰鱼雷'})[w.id], builtInOnly:true}])),
};
export const glorianaAviationStrings: ShipSpec['i18n'] = {
  zh_CN: Object.fromEntries(Object.entries(glorianaAviationRefit.weapons).map(([id,w])=>[`weapon.${id}.name`,w.name])),
  en_US: {[`weapon.${W.laser}.name`]:'Fury Laser Battery',[`weapon.${W.cannon}.name`]:'Thunderhawk Battle Cannon',[`weapon.${W.torpedo}.name`]:'Starhawk Heavy Torpedo'},
};
