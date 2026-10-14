import { glorianaHulls, glorianaRefit, glorianaShips, GLORIANA_HULL_ID } from '../../content/GlorianaPack';
import { glorianaWeapons, glorianaArmoryStrings, glorianaArmoryRefit, GLORIANA_WEAPONS as W } from '../../content/GlorianaArmory';
import { glorianaAircraft, glorianaAirWeapons, glorianaAviationStrings, glorianaAviationRefit } from '../../content/GlorianaAviation';
import { GLORIANA_HULLMODS as H } from '../../content/GlorianaHullMods';
import { glorianaTorpedoTextures } from '../../visual/GlorianaTorpedoVisuals';
import type { PackFit, ShipPack } from '../ShipPack';
import { templateFit } from './PackFits';
export const GLORIANA_ARSENAL_FIT = '帝国军械 · 战列齐射 II';
export const GLORIANA_AVIATION_FIT = '帝国航空 · 盾矛协同 II';
const ships = glorianaShips();
function assembly(): PackFit {
  const fit = templateFit(ships.find(ship => ship.id === GLORIANA_HULL_ID)!, glorianaAviationRefit.wings);
  const apply = (d: PackFit) => {
    const hull = glorianaHulls[d.hullId], core = d.hullId === GLORIANA_HULL_ID;
    d.groups = Array.from({length: 7}, (_, index) => ({index, weaponSlotIds: [], mode: 'LINKED', isAutofire: index !== 0 && index !== 2}));
    for (const slot of hull.weaponSlots) {
      const torpedo = core && ['M12','M13'].includes(slot.slotId);
      d.weapons[slot.slotId] = torpedo ? W.torpedo : slot.slotSize === 'EXTRA_LARGE' ? core ? W.lance : W.macro
        : slot.slotSize === 'LARGE' ? W.siege : core ? W.interceptor : W.bolter;
      const index = torpedo ? 2 : slot.slotSize === 'MEDIUM' ? 3 : slot.slotSize === 'EXTRA_LARGE' ? 0 : 1;
      d.groups[index].weaponSlotIds.push(slot.slotId);
    }
    if (!core) { d.groups[0].isAutofire = true; d.groups[0].mode = 'ALTERNATING'; }
    d.vents = core || !hull.weaponSlots.some(slot => slot.slotSize === 'EXTRA_LARGE') ? 20 : 30;
    d.capacitors = core || !hull.weaponSlots.some(slot => slot.slotSize === 'EXTRA_LARGE') ? 10 : 20;
    Object.values(d.modules ?? {}).forEach(apply);
  };
  apply(fit); return fit;
}
const arsenal = assembly();
for (const module of Object.values(arsenal.modules ?? {})) if (/^web_gloriana_[ps][123]$/.test(module.hullId)) module.hullMods.push(H.loader);
const aviation = assembly();
aviation.wings = ['web_gloriana_fury_wing','web_gloriana_fury_wing','web_gloriana_thunderhawk_wing','web_gloriana_starhawk_wing','web_gloriana_starhawk_wing','web_gloriana_starhawk_wing'];
aviation.hullMods.push(H.flightline);
for (const slot of ['M12','M13']) aviation.weapons[slot] = W.siege;
aviation.groups[1].weaponSlotIds.push(...aviation.groups[2].weaponSlotIds); aviation.groups[2].weaponSlotIds = []; aviation.capacitors = 0;
export const glorianaShipPack: ShipPack = {
  schema: 1, id: 'foundry.gloriana', name: '荣光女王', version: '1.0.0', author: 'Aca233',
  description: '荣光女王整舰、八个模块、三型航空及两套现有配装。', mainHull: GLORIANA_HULL_ID,
  hostABI: 'ship-pack-host-1', behavior: 'gloriana-1', ships: [...ships, ...glorianaAircraft], weapons: [...glorianaWeapons, ...glorianaAirWeapons],
  baselines: glorianaHulls, refit: {...glorianaRefit, weapons: {...glorianaArmoryRefit.weapons, ...glorianaAviationRefit.weapons},
    wings: glorianaAviationRefit.wings, weaponStatus: glorianaArmoryRefit.weaponStatus} as ShipPack['refit'],
  i18n: {zh_CN: {...glorianaArmoryStrings?.zh_CN, ...glorianaAviationStrings?.zh_CN}, en_US: {...glorianaArmoryStrings?.en_US, ...glorianaAviationStrings?.en_US}},
  variants: [{id: 'web-gloriana-arsenal', name: GLORIANA_ARSENAL_FIT, fit: arsenal, preserveWings: true,
    warnings: ['战列齐射 II：保留当前联队；舰艏双鱼雷＋六炮廊联锁供弹。供弹机常态实弹射速×0.8，选中舷敕令满强度为无插件常态×2.1，对舷仍减速；请在合适舷向与载荷窗口启动。确认才替换整舰装配，可撤消；超预算不会自动删装备。']},
    {id: 'web-gloriana-aviation', name: GLORIANA_AVIATION_FIT, fit: aviation,
      warnings: ['盾矛协同 II：确认后将联队替换为2狂怒＋1雷鹰＋3星鹰（共15架），安装近域整备线；舰艏鱼雷改为同档攻城炮，六炮廊不装联锁供弹机。战损补充时间×0.7、补充率恢复+50%，出击距离×0.75；存活轰炸机装弹仍12秒。核心260/260OP，可撤消；不自动更改旧存档。']}],
  assetRoots: ['graphics/ships/web_gloriana/', 'graphics/weapons/web_gloriana/'], extraTextures: [...glorianaTorpedoTextures],
  sources: ['docs/gloriana-reference-notes-2026-09-25.md', 'docs/gloriana-runtime-source-notes.md', 'docs/ship-pack-development-plan.md', 'Warhammer 40,000 themed Web adaptation; distribution rights not asserted.'],
};
