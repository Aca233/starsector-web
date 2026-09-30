import type { ShipSystemDefinition } from './Types';
import { ZHEFENG_SYSTEM, ZHEFENG_MODS as M } from '../../content/ZhefengIds';
import { reachableFireTarget } from '../../ai/AutofireController';
const icon='/game-assets/graphics/icons/hullsys/ammo_feeder.png';
export const zhefengSystem:ShipSystemDefinition={
  id:ZHEFENG_SYSTEM,sourceIds:[],name:'断路反击',iconUrl:icon,resources:{textures:[icon]},
  description:'F启动（需前盾已开，消耗180软载荷）。1.5秒承压：盾承伤载荷减半、航速−30%、非近防武器停火；随后3秒反击：强制关盾，实弹射速×1.6、每发载荷×0.85；最后1秒恢复：允许右键重新开盾，实弹射速×0.6。冷却12秒。不加弹伤、不补弹、不清冷却。排散/过载/死亡中断。',
  implementationDetails:'原创三阶段驱逐舰系统。阶段防御许可接入真实输入与模拟，不通过隐藏盾图伪造。承压须面对敌火；反击时裸露装甲，可被侧击或拉开。未宣称最终14DP平衡。',
  chargeUp:1.5,active:3,chargeDown:1,cooldown:12,fluxPerUseFlat:180,
  controls:{cancelOnDeath:true,cancelOnRetreat:true},
  installReason:spec=>spec.builtInHullMods?.includes(M.capacitor)?undefined:'需要内置分流电容舱',
  activationReason:ship=>!ship.shield.isActive?'需要先展开前盾':ship.weapons.every(w=>w.spec.isPointDefense||w.isDisabled)?'缺少可用主攻武器':undefined,
  defenseEnabled:system=>system.state!=='ACTIVE',
  weaponEnabled:(system,mount)=>system.state!=='IN'||mount.spec.isPointDefense===true,
  modifiers:(system,_capacity,owner)=>{
    if(system.disabled||!owner||owner.isDead||owner.hullHp<=0||owner.isRetreated||owner.flux.isVenting||owner.flux.isOverloaded)return {};
    if(system.state==='IN')return {shieldDamageMultiplier:.5,speedPercent:-30};
    if(system.state==='ACTIVE')return {weapons:{BALLISTIC:{rateOfFireMultiplier:1.6,fluxCostMultiplier:.85}}};
    return system.state==='OUT'?{weapons:{BALLISTIC:{rateOfFireMultiplier:.6}}}:{};
  },
  visuals:{fortressShield:true},
  statusText:s=>s.state==='IN'?`承压 ${s.activeTimer.toFixed(1)}s · 正面接火 / 主炮停火`:s.state==='ACTIVE'?`反击 ${s.activeTimer.toFixed(1)}s · 无盾速射`:s.state==='OUT'?'恢复 · 可右键开盾 / 装填减速':undefined,
  advanceAI:({ship,system=ship.system,target,world,tactical})=>{
    if(system.state!=='IDLE'||system.activationFailureReason||!world||!target||target.isDead||tactical?.withdrawing||tactical?.waypoint||tactical?.avoidingCollision||ship.flux.fluxPercent>.45)return;
    // Only commit with a real reachable firing solution, not a distance-to-center guess.
    const fireWorld={ships:world.ships,asteroids:world.asteroids,missiles:[]};
    if(ship.weapons.some(w=>!w.isDisabled&&!w.spec.isPointDefense&&reachableFireTarget(ship,w,{kind:'SHIP',entity:target},fireWorld)))system.activate();
  },
};
