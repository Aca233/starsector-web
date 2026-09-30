import { ZHEFENG_ID } from '../engine/content/ZhefengIds';
import { GRAVITY_HULL_ID } from '../engine/content/GravityIds';
import { createGravityEscort, createGravityControl } from './GravityLoadouts';
import { createZhefengAssault, createZhefengPressure } from './ZhefengLoadouts';
import { ROCINANTE_HULL_ID } from '../engine/content/RocinanteIds';
import { createRocinanteSkirmish, createRocinanteHunter } from './RocinanteLoadouts';
import { ADUN_ARK_ID } from '../engine/content/AdunArkIds';
import { ADUN_DEFAULT_FIT, createAdunDesign } from './SpearOfAdunLoadouts';
import { HYPERION_HULL_ID } from '../engine/content/HyperionPack';
import { createHyperionAssaultDesign, HYPERION_ASSAULT_FIT, createHyperionFocusDesign, HYPERION_FOCUS_FIT, createHyperionRepairDesign, HYPERION_REPAIR_FIT } from './HyperionLoadouts';
import { GLORIANA_HULL_ID } from '../engine/content/GlorianaPack';
import { createGlorianaArsenalDesign, GLORIANA_ARSENAL_FIT, createGlorianaAviationDesign, GLORIANA_AVIATION_FIT } from './GlorianaLoadouts';
import type { Design } from './DesignModel';

export interface ExtensionVariantChoice {
  id: string;
  name: string;
  warnings?: readonly string[];
  create: (current?: Pick<Design, 'wings'>) => Design;
}
const glorianaVariants: readonly ExtensionVariantChoice[] = [{
  id: 'web-gloriana-arsenal', name: GLORIANA_ARSENAL_FIT, create: createGlorianaArsenalDesign,
  warnings: ['战列齐射 II：保留当前联队；舰艏双鱼雷＋六炮廊联锁供弹。供弹机常态实弹射速×0.8，选中舷敕令满强度为无插件常态×2.1，对舷仍减速；请在合适舷向与载荷窗口启动。确认才替换整舰装配，可撤消；超预算不会自动删装备。'],
}, {id:'web-gloriana-aviation', name:GLORIANA_AVIATION_FIT, create:createGlorianaAviationDesign,
  warnings: ['盾矛协同 II：确认后将联队替换为2狂怒＋1雷鹰＋3星鹰（共15架），安装近域整备线；舰艏鱼雷改为同档攻城炮，六炮廊不装联锁供弹机。战损补充时间×0.7、补充率恢复+50%，出击距离×0.75；存活轰炸机装弹仍12秒。核心260/260OP，可撤消；不自动更改旧存档。']}];
/** Refit and simulation share explicit extension fits, never save migrations. */
export function extensionVariantsForHull(hullId: string): readonly ExtensionVariantChoice[] {
  if(hullId===GRAVITY_HULL_ID)return [{id:'gravity-escort',name:'万有引力 · 潮汐攻坚',create:createGravityEscort},{id:'gravity-control',name:'万有引力 · 引力控场',create:createGravityControl}];
  if(hullId===ADUN_ARK_ID)return [{id:'web-adun-ark-solar-battleline',name:ADUN_DEFAULT_FIT,create:createAdunDesign}];
  if(hullId===HYPERION_HULL_ID)return [
    {id:'web-sc2-hyperion-assault',name:HYPERION_ASSAULT_FIT,create:createHyperionAssaultDesign},
    {id:'web-sc2-hyperion-focus',name:HYPERION_FOCUS_FIT,create:createHyperionFocusDesign,
      warnings:['装配25OP大和聚能回路：消耗45、基础冷却14秒，跃迁预热延长至2.4秒。此方案电容5、耗散50，保留24门炮；确认后才替换当前配装，可撤消。']},
    {id:'web-sc2-hyperion-repair',name:HYPERION_REPAIR_FIT,create:createHyperionRepairDesign,
      warnings:['装配25OP战地抢修系统：关闭含近防在内的自动开火，停火并连续6秒无受击后耗能抢修；最多修至80%，本场累计20%。此方案电容5、耗散50，与聚能回路互斥；确认才替换，可撤消。']},
  ];
  if (hullId === ZHEFENG_ID) return [{id:'zhefeng-assault',name:'折锋 · 突击破甲',create:createZhefengAssault},{id:'zhefeng-pressure',name:'折锋 · 压盾支援',create:createZhefengPressure}];
  if (hullId === ROCINANTE_HULL_ID) return [{id:'rocinante-skirmish',name:'罗西南特 · 轨炮拉扯',create:createRocinanteSkirmish},{id:'rocinante-hunter',name:'罗西南特 · 鱼雷猎手',create:createRocinanteHunter}];
  return hullId === GLORIANA_HULL_ID ? glorianaVariants : [];
}
