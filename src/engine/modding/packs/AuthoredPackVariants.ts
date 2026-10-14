import type { ShipSpec } from '../../content/ShipSpec';
import { HYPERION_HULLMODS } from '../../content/HyperionIds';
import { ARK_HULLMODS } from '../../content/AdunArkIds';
import { GRAVITY_WEAPONS } from '../../content/GravityArmory';
import { ZHEFENG_MODS, ZHEFENG_WEAPONS } from '../../content/ZhefengIds';
import type { PackVariant, PackWing } from '../ShipPack';
import { templateFit } from './PackFits';

export const HYPERION_ASSAULT_FIT = '雷诺旗舰 · 跃迁突破';
export const HYPERION_FOCUS_FIT = '雷诺旗舰 · 大和压制';
export const HYPERION_REPAIR_FIT = '雷诺旗舰 · 战地续航';
export const ADUN_DEFAULT_FIT = '方舟 · 太阳战阵';

/** Data factories copied from the existing opt-in fits; no UI/catalog dependency. */
export function zhuYuanVariants(ship: ShipSpec): PackVariant[] {
  return [{id: 'zhuyuan-standard', name: '烛渊 · 标准配装', fit: templateFit(ship)}];
}
export function hyperionVariants(ship: ShipSpec): PackVariant[] {
  const assault = templateFit(ship); assault.vents = 50; assault.capacitors = 20;
  const focus = structuredClone(assault); focus.capacitors = 5; focus.hullMods = [HYPERION_HULLMODS.focus];
  const repair = structuredClone(assault); repair.capacitors = 5; repair.hullMods = [HYPERION_HULLMODS.repair];
  return [
    {id: 'web-sc2-hyperion-assault', name: HYPERION_ASSAULT_FIT, fit: assault},
    {id: 'web-sc2-hyperion-focus', name: HYPERION_FOCUS_FIT, fit: focus,
      warnings: ['装配25OP大和聚能回路：消耗45、基础冷却14秒，跃迁预热延长至2.4秒。此方案电容5、耗散50，保留24门炮；确认后才替换当前配装，可撤消。']},
    {id: 'web-sc2-hyperion-repair', name: HYPERION_REPAIR_FIT, fit: repair,
      warnings: ['装配25OP战地抢修系统：关闭含近防在内的自动开火，停火并连续6秒无受击后耗能抢修；最多修至80%，本场累计20%。此方案电容5、耗散50，与聚能回路互斥；确认才替换，可撤消。']},
  ];
}
export function adunArkVariants(ship: ShipSpec, wings: Record<string, PackWing>): PackVariant[] {
  const fit = templateFit(ship, wings); fit.vents = 50; fit.capacitors = 20; fit.hullMods = [ARK_HULLMODS.matrix];
  return [{id: 'web-adun-ark-solar-battleline', name: ADUN_DEFAULT_FIT, fit}];
}
export function zhefengVariants(ship: ShipSpec): PackVariant[] {
  return [false, true].map(pressure => {
    const fit = templateFit(ship);
    fit.weapons.M01 = fit.weapons.M02 = pressure ? ZHEFENG_WEAPONS.wedge : ZHEFENG_WEAPONS.breaker;
    fit.hullMods = [pressure ? ZHEFENG_MODS.steady : ZHEFENG_MODS.assault, 'reinforcedhull'];
    fit.vents = 20; fit.capacitors = 20;
    return {id: pressure ? 'zhefeng-pressure' : 'zhefeng-assault', name: pressure ? '折锋 · 压盾支援' : '折锋 · 突击破甲', fit};
  });
}
export function gravityVariants(ship: ShipSpec): PackVariant[] {
  return [false, true].map(control => {
    const fit = templateFit(ship);
    for (let i = 1; i <= 4; i++) fit.weapons['M' + i] = GRAVITY_WEAPONS.calibrator;
    for (let i = 1; i <= 6; i++) fit.weapons['S' + i] = i <= (control ? 4 : 2) ? GRAVITY_WEAPONS.deflector : GRAVITY_WEAPONS.pdc;
    fit.vents = 45; fit.capacitors = 45; fit.hullMods = [];
    return {id: control ? 'gravity-control' : 'gravity-escort', name: control ? '万有引力 · 引力控场' : '万有引力 · 潮汐攻坚', fit};
  });
}
