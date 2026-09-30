import {ADUN_ARK_ID,ARK_HULLMODS,ADUN_ARK_FORGE,ADUN_ARK_BARRIER,ADUN_ARK_REPAIR} from '../../content/AdunArkIds';
import {arkSystemTextures,arkPluginTextures,ARK_SYSTEM_ART} from '../../visual/ArkSystemFX';
const systemTextures=[...arkSystemTextures,...arkPluginTextures];
import type {Ship} from '../../simulation/Ship';
import type {ShipSystem} from '../../simulation/ShipSystem';
import type {ShipSystemDefinition,SystemModifiers} from './Types';

export const arkReactor=(ship:Ship)=>ship.allSystems.find(s=>s.type===ADUN_ARK_FORGE);
const alive=(s:Ship)=>!s.isDead&&s.hullHp>0&&!s.isDocked&&!s.isRetreated;
export const arkEngineeringOnline=(ship:Ship)=>ship.childModules.some(s=>s.moduleMount?.slotId==='AFT'&&alive(s));
const installReason=(spec:Ship['spec'])=>(spec.sourceHullId??spec.id)===ADUN_ARK_ID?undefined:'仅亚顿之矛方舟核心可装配';
function reason(ship:Ship,system:ShipSystem,cost:number):string|undefined {
  const core=arkReactor(ship);
  if(!core)return '太阳核心未装配';
  if(ship.allSystems.some(s=>s!==system&&[ADUN_ARK_FORGE,ADUN_ARK_BARRIER,ADUN_ARK_REPAIR].includes(s.type)&&s.isActive))return '太阳核心正在供能另一项能力';
  if(core.charges<cost)return `太阳能不足：${Math.floor(core.charges)}/${cost}`;
}
function status(system:ShipSystem):string {
  const owner=system.owner,core=owner&&arkReactor(owner);
  return core?`太阳能 ${Math.floor(core.charges)}/${core.maxCharges} · 火力40 / 屏障35 / 重构50${owner&&!arkEngineeringOnline(owner)?' · 工程段失效：机动/充能降低':''}${corona(owner)?' · 日冕耦合：回能×0.7':''}`:'';
}
const online=(ship:Ship)=>alive(ship)&&!ship.flux.isOverloaded&&!ship.flux.isVenting;
const cost=(amount:number)=>(ship:Ship,_world:unknown,system:ShipSystem)=>{
  if(!online(ship)||reason(ship,system,amount)){system.deactivate();return;}
  arkReactor(ship)!.charges-=amount;
};
// Active modifiers replace passive ones in ShipSystem, so retain hull limitations in both paths.
const arkMobility=(owner:Ship|undefined):SystemModifiers=>({zeroFluxBoostSuppressed:1,...(owner&&!arkEngineeringOnline(owner)?{speedPercent:-45,turnRatePercent:-25,turnAccelerationPercent:-25}:{})});
const corona = (owner?: Ship) => !!owner && [...(owner.spec.hullMods ?? []), ...(owner.spec.builtInHullMods ?? [])].includes(ARK_HULLMODS.coupler);
const forgeBuff=(level:number, owner?:Ship):SystemModifiers=>({dissipationMultiplier:1-.15*level,weapons:{ENERGY:{damageMultiplier:1+(corona(owner)?.65:.45)*level,rateOfFireMultiplier:1+(corona(owner)?.3:.2)*level,fluxCostMultiplier:1+(corona(owner)?.55:.35)*level}}});
export const adunArkSystems:ShipSystemDefinition[]=[{
  id:ADUN_ARK_FORGE,sourceIds:[],name:'太阳锻炉',iconUrl:ARK_SYSTEM_ART+'reactor.png',resources:{textures:systemTextures},
  description:'共享太阳能100，工程段完整时每秒恢复2.5。消耗40，8秒能量伤害+45%、射速+20%，载荷成本+35%、耗散-15%、航速-35%。与屏障、重构互斥；过载或排散中断。工程段损毁航速-45%、转向-25%，充能降至每秒0.8。选装日冕耦合器：伤害+65%、射速+30%、载荷消耗+55%，闲置回能×0.7。',
  implementationDetails:'Web方舟战斗改编；使用权威系统charges，无外部计时器。增益传播到存活模块，不额外复制太阳资源。',
  charges:100,initialCharges:100,chargeRegen:2.5,usesChargesForActivation:false,chargeUp:.8,active:8,chargeDown:.6,cooldown:20,
  installReason,passiveStatusText:status,activationReason:(ship,system)=>reason(ship,system,40)??(ship.assemblyShips.some(s=>alive(s)&&s.weapons.some(w=>!w.isDisabled&&w.ammo!==0))?undefined:'武备段不可用'),
  passiveModifiers:(_system,owner)=>arkMobility(owner),
  modifiers:(s,_capacity,owner)=>{const mobility=arkMobility(owner);return {...mobility,...forgeBuff(s.effectLevel,owner),speedPercent:(mobility.speedPercent??0)-35*s.effectLevel};},moduleModifiers:(s,module)=>alive(module)?forgeBuff(s.effectLevel,s.owner):{},
  onActivate:cost(40),onAdvance:(ship,_dt,_world,system)=>{
    system.chargeRegenRate=online(ship)&&!ship.allSystems.some(s=>s.isActive)?(arkEngineeringOnline(ship)?2.5:.8)*(corona(ship)?.7:1):0;
    if(system.isActive&&!online(ship))system.deactivate();
  },
  advanceAI:({ship,target,distance,system})=>{if(system&&!target.isDead&&distance<2400&&ship.flux.fluxPercent<.45)system.activate();},
},{
  id:ADUN_ARK_BARRIER,sourceIds:[],name:'护盾超载',iconUrl:ARK_SYSTEM_ART+'matrix.png',resources:{textures:systemTextures},
  description:'消耗35共享太阳能，7秒护盾承受的伤害降低65%，维持耗散提高50%，能量武器载荷成本+25%。用于顶住齐射、保护方舟模块；不清空硬载荷，不免疫过载。',
  chargeUp:.25,active:7,chargeDown:.5,cooldown:18,installReason,passiveStatusText:status,
  activationReason:(ship,system)=>reason(ship,system,35)??(!ship.shield.isActive?'先升起护盾，再启用超载':undefined),onActivate:cost(35),
  modifiers:s=>({shieldDamageMultiplier:1-.65*s.effectLevel,shieldUpkeepMultiplier:1+.5*s.effectLevel}),
  moduleModifiers:s=>({weapons:{ENERGY:{fluxCostMultiplier:1+.25*s.effectLevel}}}),visuals:{fortressShield:true},
  onAdvance:(ship,_dt,_world,system)=>{if(system.isActive&&!online(ship))system.deactivate();},
  advanceAI:({ship,system,distance})=>{if(system&&distance<2000&&ship.flux.fluxPercent>.45&&ship.flux.fluxPercent<.85)system.activate();},
},{
  id:ADUN_ARK_REPAIR,sourceIds:[],name:'重构光束',iconUrl:ARK_SYSTEM_ART+'repair-1.png',resources:{textures:systemTextures},
  description:'消耗50共享太阳能，6秒修复存活模块每秒1.5%最大结构，并修复盾内己方舰载机。牺牲火力：期间舰体能量武器伤害-60%，舰载机仍可掩护。无法复活已毁模块或恢复装甲；适合召回飞机后重整阵线。',
  chargeUp:.7,active:6,chargeDown:.5,cooldown:28,installReason,passiveStatusText:status,
  activationReason:(ship,system)=>reason(ship,system,50)??(ship.assemblyShips.some(s=>alive(s)&&s.hullHp<s.maxHullHp)||ship.combatShips.some(c=>c.sourceCarrier?.assemblyRoot===ship&&alive(c)&&c.hullHp<c.maxHullHp&&c.pos.distanceTo(ship.pos)<ship.shield.radius)?undefined:'没有可重构的受损模块或近旁舰载机'),
  onActivate:cost(50),modifiers:s=>({weapons:{ENERGY:{damageMultiplier:1-.6*s.effectLevel}}}),moduleModifiers:s=>({weapons:{ENERGY:{damageMultiplier:1-.6*s.effectLevel}}}),
  onAdvance:(ship,dt,world,system)=>{
    if(system.isActive&&!online(ship)){system.deactivate();return;}
    if(system.state!=='ACTIVE')return;
    for(const part of ship.assemblyShips)if(alive(part))part.hullHp=Math.min(part.maxHullHp,part.hullHp+part.maxHullHp*.015*dt);
    for(const craft of world.ships)if(craft.sourceCarrier?.assemblyRoot===ship&&alive(craft)&&craft.pos.distanceTo(ship.pos)<ship.shield.radius)craft.hullHp=Math.min(craft.maxHullHp,craft.hullHp+craft.maxHullHp*.12*dt);
  },
  advanceAI:({ship,system})=>{if(system&&ship.flux.fluxPercent<.45&&ship.assemblyShips.some(s=>alive(s)&&s.hullHp<s.maxHullHp*.65))system.activate();},
}];
