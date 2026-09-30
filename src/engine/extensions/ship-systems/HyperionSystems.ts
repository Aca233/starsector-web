import { hyperionReactor, hyperionSharedReason as sharedReason, hyperionYamatoCost, spendHyperionReactor, hyperionReactorStatus } from '../../content/HyperionHullMods';
export { hyperionReactor } from '../../content/HyperionHullMods';
import { HYPERION_REACTOR, hyperionJumpPointFailure } from '../../content/HyperionJumpTarget';
export { HYPERION_REACTOR } from '../../content/HyperionJumpTarget';
import { hyperionFXTextures } from '../../visual/HyperionFXAssets';
import { HYPERION_HULL_ID, HYPERION_YAMATO_ID, HYPERION_JUMP_ID, HYPERION_PROJECTILE_ID, hyperionYamatoProjectile } from '../../content/HyperionPack';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { ShipSystemDefinition } from './Types';
import { Vector2 } from '../../math/Vector2';
import { findTeleportDestination } from './PhaseTeleporter';
import { spawnSystemProjectile } from './SystemProjectile';
import { combatAudio } from '../../audio/CombatAudioEvents';


const online = (ship:Ship,system:ShipSystem) => !ship.isDead && ship.hullHp>0 && !ship.isRetreated && !ship.retreating && !ship.isDocked && !ship.flux.isOverloaded && !ship.flux.isVenting && !system.disabled && (ship.runtimeModifiers.value.disableSystems??0)<=0;
/** A successful jump's cooldown is the authoritative clock; failures have no origin. */
export function hyperionAmbushRemaining(system:ShipSystem):number {
  if(system.type!==HYPERION_JUMP_ID || system.state!=='COOLDOWN' || !system.teleportVisual?.origin
    || !system.owner || !online(system.owner,system))return 0;
  return Math.max(0,system.cooldownTimer-Math.max(0,system.maxCooldown-6));
}
function installReason(spec:Ship['spec']):string|undefined { return (spec.sourceHullId??spec.id)===HYPERION_HULL_ID?undefined:'仅休伯利安反应堆可装配'; }
function status(system:ShipSystem):string {
  const core=system.owner && hyperionReactor(system.owner);
  const jump=system.owner?.allSystems.find(s=>s.type===HYPERION_JUMP_ID);
  const window=jump?hyperionAmbushRemaining(jump):0;
  return core?`${hyperionReactorStatus(system.owner!)}${window>0?` | 跃迁突击 ${window.toFixed(1)}s · 火力↑ 载荷成本↑`:''}`:'反应堆核心未装配';
}
function cancelInterrupted(ship:Ship,system:ShipSystem):void {
  if(system.isActive && !online(ship,system)) { system.teleportVisual=undefined;system.activationInput=undefined;system.deactivate(); }
}
function aimReason(ship:Ship):string|undefined {
  const delta=ship.aimTargetWorld.clone().sub(ship.pos);
  if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y)||delta.length()<400)return '将准星置于舰艏前方400距离外';
  const angle=Math.atan2(Math.sin(delta.heading()-ship.facingRad),Math.cos(delta.heading()-ship.facingRad));
  if(Math.abs(angle)>Math.PI/15)return '大和炮需要舰艏对准准星（±12°）';
}
/** Factories keep definition registration safe across the existing content/validation cycle. */
export function createHyperionYamato():ShipSystemDefinition { return {
  id:HYPERION_YAMATO_ID,sourceIds:[],name:'大和炮',chargeUp:2,active:.15,chargeDown:.45,cooldown:18,
  charges:100,initialCharges:100,chargeRegen:0,usesChargesForActivation:false,
  description:'休伯利安专属。舰艏对准准星后蓄能2秒，沿舰艏发射6500能量伤害弹体，射程2400。穿过导弹，命中舰体或掩体后释放170范围爆破，向边缘衰减，不伤友军、不对直接目标重复结算。成功发射消耗共享反应堆60点；储备基准100，每秒恢复3。蓄能锁定转向、航速降低，过载/排散会中断；非锁定必中。装配聚能回路后改为45储备、14秒基础冷却，当前消耗见插件状态。',
  implementationDetails:'Web改编。真实PLASMA弹体由宿主处理护盾、装甲、友军阻挡和伤害归属。内置旗舰反应堆拥有储备并复用现有系统次数状态；聚能回路将消耗改为45、基础冷却改为14秒，原生次数/恢复舰装仍影响基准。没有额外航空或虚空盾。',
  resources:{textures:hyperionFXTextures,weapons:[HYPERION_PROJECTILE_ID],sounds:['plasma_cannon_fire']},
  installReason,activationReason:(ship,system)=>sharedReason(ship,system,hyperionYamatoCost(ship))??aimReason(ship),
  passiveStatusText:status,statusText:system=>system.state==='IN'?'大和炮蓄能 · 转向锁定':system.state==='ACTIVE'?'大和炮发射':undefined,
  controls:{lockTurning:true,suppressZeroFlux:true},
  modifiers:system=>({speedPercent:-60*system.effectLevel,accelerationPercent:-60*system.effectLevel}),
  visuals:{weaponGlow:{color:[255,180,70,180],types:['ENERGY']}},
  onActive:(ship,world,system)=>{
    if(!online(ship,system)||!system.activationInput||!world.projectiles||sharedReason(ship,system,hyperionYamatoCost(ship)))return;
    const muzzle=ship.spec.systemWeaponSlots?.find(s=>s.slotId==='SYS_YAMATO');if(!muzzle)return;
    const position=new Vector2(muzzle.x,muzzle.y).rotate(ship.facingRad).add(ship.pos);
    spawnSystemProjectile(ship,HYPERION_PROJECTILE_ID,position,ship.facingRad,world,{slotId:muzzle.slotId});
    spendHyperionReactor(ship,system,hyperionYamatoCost(ship));
    combatAudio.play('plasma_cannon_fire',ship.isPlayer ? .9 : .5,.75);
  },
  onAdvance:(ship,_dt,_world,system)=>cancelInterrupted(ship,system),
  advanceAI:({ship,target,distance,system=ship.system,tactical})=>{
    if(system.isActive||system.isCoolingDown||!online(ship,system)||target.isDead||target.isPhased||ship.flux.fluxPercent>.65||ship.hullHp<ship.spec.hitpoints*.4||tactical?.withdrawing||tactical?.waypoint)return;
    if(distance<450||distance>hyperionYamatoProjectile.range-50||sharedReason(ship,system,hyperionYamatoCost(ship)))return;
    const delta=target.pos.clone().sub(ship.pos),angle=Math.atan2(Math.sin(delta.heading()-ship.facingRad),Math.cos(delta.heading()-ship.facingRad));
    if(Math.abs(angle)>.1)return;
    const previous=ship.aimTargetWorld.clone();ship.aimTargetWorld.copy(target.pos);system.activate();ship.aimTargetWorld.copy(previous);
  },
}; }
export function createHyperionJump():ShipSystemDefinition {
const jumpIcon='/game-assets/graphics/icons/hullsys/teleport.png';
return {
  id:HYPERION_JUMP_ID,sourceIds:[],name:'战术跃迁',chargeUp:1.2,active:.05,chargeDown:.6,cooldown:14,
  iconUrl:jumpIcon,resources:{textures:[jumpIcon,...hyperionFXTextures],sounds:['system_phase_teleporter']},audio:{activate:'system_phase_teleporter'},
  description:'休伯利安专属。按技能键或按钮进入选点，虚影跟随鼠标；第一次左键锁定位置，移动鼠标调整虚影朝向，第二次左键确认；右键/Esc/再次按技能键取消。确认位置和方向后预热1.2秒，跃迁最多1800距离并将速度减半；成功消耗共享反应堆75点。与大和炮互斥；成功收束后6秒能量武器伤害×1.2、射速×1.5、载荷成本×1.5（持续光束不加速）。过载/排散中止突击。预热可被攻击，全程没有相位免疫。装配聚能回路后预热延长至2.4秒。',
  implementationDetails:'手动选点由权威检查舰船/小行星净空，保持精确落点，不自动挪位；AI初次选点保留净空搜索。落点在预热后再次校验。不安全或中断时不扣储备但保留技能冷却。起终点残影和镜头偏移使用已有权威字段，瞬移不形成跨地图扫掠碰撞。Web战场无实体边界。',
  installReason,activationReason:(ship,system)=>sharedReason(ship,system,75)??hyperionJumpPointFailure(ship,ship.aimTargetWorld,HYPERION_REACTOR.jumpRange*ship.hullStats.systemRangeMultiplier),
  passiveStatusText:status,statusText:system=>system.state==='IN'?'跃迁引擎预热 · 落点已锁定':undefined,
  controls:{blockWeapons:true,lockTurning:true,suppressZeroFlux:true},
  modifiers:system=>({speedPercent:-50*system.effectLevel}),
  passiveModifiers:system=>hyperionAmbushRemaining(system)>0?{weapons:{ENERGY:{damageMultiplier:1.2,rateOfFireMultiplier:1.5,fluxCostMultiplier:1.5}}}:{},
  visuals:{teleportCopy:true},
  onReset:system=>{system.teleportVisual=undefined;},
  onActivate:(ship,world,system)=>{
    system.teleportVisual=undefined;
    if(!online(ship,system)||!system.activationInput||sharedReason(ship,system,75)){system.deactivate();return;}
    const range=HYPERION_REACTOR.jumpRange*ship.hullStats.systemRangeMultiplier;
    const destination=ship.fireControlMode==='MANUAL'
      ? (hyperionJumpPointFailure(ship,system.activationInput.point,range,world)?null:system.activationInput.point.clone())
      : findTeleportDestination(ship,system.activationInput.point,range,world);
    if(!destination||destination.distanceTo(ship.pos)<200){system.deactivate();return;}
    system.teleportVisual={serial:system.activationSerial,destination,destinationFacing:system.activationInput.facing};
  },
  onActive:(ship,world,system)=>{
    const plan=system.teleportVisual;
    if(!plan||!online(ship,system)||!system.activationInput||sharedReason(ship,system,75)){system.teleportVisual=undefined;return;}
    const destination=hyperionJumpPointFailure(ship,plan.destination,HYPERION_REACTOR.jumpRange*ship.hullStats.systemRangeMultiplier,world)?null:plan.destination.clone();
    if(!destination||destination.distanceTo(ship.pos)<200){system.teleportVisual=undefined;return;}
    if(!spendHyperionReactor(ship,system,HYPERION_REACTOR.jump))return;
    system.teleportVisual={...plan,destination,origin:ship.pos.clone(),originFacing:ship.facingRad};
    ship.teleportSequence++;ship.teleportCameraOffset.x+=ship.pos.x-destination.x;ship.teleportCameraOffset.y+=ship.pos.y-destination.y;
    ship.pos.copy(destination);ship.prevPos.copy(destination);ship.facingRad=ship.prevFacingRad=plan.destinationFacing;ship.vel.scale(.5);
  },
  onAdvance:(ship,_dt,_world,system)=>{
    cancelInterrupted(ship,system);
    if(!online(ship,system) || (!system.isActive && hyperionAmbushRemaining(system)<=0))system.teleportVisual=undefined;
  },
  advanceAI:({ship,target,distance,system,tactical})=>{
    if(!system||system.isActive||system.isCoolingDown||!online(ship,system)||sharedReason(ship,system,75)||target.isDead||tactical?.waypoint)return;
    const away=ship.pos.clone().sub(target.pos).normalize();
    const retreat=tactical?.withdrawing||ship.hullHp<ship.spec.hitpoints*.4||ship.flux.fluxPercent>.7;
    const approach=!retreat && tactical?.allowOffensiveManeuver!==false && distance>(tactical?.desiredRange??750)+900;
    if(!retreat&&!approach)return;
    const desired=retreat?ship.pos.clone().addScaled(away,1500):target.pos.clone().addScaled(away,Math.max(800,tactical?.desiredRange??800));
    const delta=desired.clone().sub(ship.pos),range=HYPERION_REACTOR.jumpRange*ship.hullStats.systemRangeMultiplier;
    if(delta.length()>range)desired.copy(ship.pos).add(delta.normalize().scale(range));
    const previous=ship.aimTargetWorld.clone();ship.aimTargetWorld.copy(desired);system.activate();ship.aimTargetWorld.copy(previous);
  },
}; }
