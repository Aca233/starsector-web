import type { HullModDefinition } from '../extensions/HullMods';
import { ZHEFENG_ID, ZHEFENG_MODS as M } from './ZhefengIds';
const applicable:HullModDefinition['applicable']=s=>(s.sourceHullId??s.id)===ZHEFENG_ID&&!s.isModuleHull?null:'仅限折锋级驱逐舰';
const meta=(icon:string,cost:number)=>({cost:{DESTROYER:cost},manufacturer:'折锋专属 · Web原创',uiTags:['特殊'],icon:'graphics/hullmods/'+icon+'.png'});
const resources=(icon:string)=>({textures:['/game-assets/graphics/hullmods/'+icon+'.png']});
export const zhefengHullMods:readonly HullModDefinition[]=[
  {id:M.capacitor,name:'折锋 · 分流电容舱',status:'implemented',applicable,refit:{...meta('flux_coil_adjunct',0),builtInOnly:true},resources:resources('flux_coil_adjunct'),
    description:'内置0OP、不可卸下。载荷容量+1000、基础耗散−50；提供断路反击所需的分流电路。空配最终6000容量/350耗散，额外电容与耗散投资另计。技能仍需180启动载荷、承压/反击/恢复与冷却；不另叠隐藏减伤。',stats:()=>({capacityBonus:1000,dissipationBonus:-50})},
  {id:M.assault,name:'折锋 · 短程突击整备',status:'implemented',applicable,refit:meta('unstable_injector',8),resources:resources('unstable_injector'),conflicts:[M.steady],
    description:'8OP。非近防实弹炮塔转速+40%，代价是该类武器射程−10%。近防不受影响；固定炮不会变成全向炮。与稳态火控架互斥。',
    weaponStats:(_s,w)=>w.weaponType==='BALLISTIC'&&!w.isPointDefense?{turnRateMultiplier:1.4}:{},rangePercent:(_s,w)=>w.weaponType==='BALLISTIC'&&!w.isPointDefense?-10:0},
  {id:M.steady,name:'折锋 · 稳态火控架',status:'implemented',applicable,refit:meta('integrated_targeting_unit',8),resources:resources('integrated_targeting_unit'),conflicts:[M.assault],
    description:'8OP。非近防实弹射程+10%，代价是航速−10%。适合跟随战线压盾，但更难追击和脱离；近防不增程。与短程突击整备互斥。',
    stats:()=>({speedPercent:-10}),rangePercent:(_s,w)=>w.weaponType==='BALLISTIC'&&!w.isPointDefense?10:0},
];
