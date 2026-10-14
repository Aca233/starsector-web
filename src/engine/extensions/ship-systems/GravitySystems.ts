import { GRAVITY_HULL_ID, GRAVITY_SYSTEM_IDS as ID } from '../../content/GravityIds';
import type { ShipSystemDefinition } from './Types';
import type { Ship } from '../../simulation/Ship';
import { gravityPolarity } from '../../simulation/systems/GravityControlInput';
import { sameTeam } from '../../simulation/CombatTeams';
import { gravityProjectileSupported, releaseShipGravityTractors } from '../../simulation/systems/GravityTractor';
import { gravityTextures } from '../../visual/GravityVisuals';

const installReason: ShipSystemDefinition['installReason'] = spec =>
  (spec.sourceHullId ?? spec.id) === GRAVITY_HULL_ID ? undefined : '需要万有引力号场发生器';
const alive = (ship: Ship) => !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.isDocked && !ship.isPhased;
const noState: ShipSystemDefinition['onReset'] = system => { system.gravityField = undefined; };
const createField: ShipSystemDefinition['onActivate'] = (ship, _world, system) => {
  const spec = system.definition.gravityField!;
  if (!alive(ship) || system.disabled || ship.flux.isOverloaded || ship.flux.isVenting || (system.state !== 'IN' && system.state !== 'ACTIVE')) return;
  const point = spec.kind === 'WELL' || system.definition.gravityRemoteRelease ? system.activationInput?.point : ship.pos;
  if (!point) return;
  const releaseTargets = spec.kind === 'REPULSOR' && !system.definition.gravityRemoteRelease ? releaseShipGravityTractors(ship) : undefined;
  if (system.definition.gravityRemoteRelease) {
    const well = ship.allSystems.find(s => s.definition.gravityField?.kind === 'WELL');
    if (well && well.activationSerial === system.activationInput?.gravityAnchorSerial) { well.gravityField=undefined;well.deactivate(); }
  }
  system.gravityField = { polarity: spec.cursorSpeed ? gravityPolarity(ship) : undefined,
    cursorControlled: spec.cursorSpeed ? ship.fireControlMode === 'MANUAL' : undefined, lingerRemaining: spec.lingerSeconds, kind: spec.kind, serial: system.activationSerial, x: point.x, y: point.y, age: 0, duration:spec.duration, radius: 0,
    shipBudgetRemaining: spec.shipBudget, projectileBudgetRemaining: spec.projectileBudget,
    environmentBudgetRemaining: spec.shipBudget, environmentHits: [], releaseTargets, shipHits: [], projectileHits: [] };
};
export const gravityWell: ShipSystemDefinition = {
  id: ID.well, sourceIds: [], name: '区域引力井', installReason,
  resources:{textures:[...gravityTextures]},
  description: '在指针处固定部署多目标引力井，再次启动收回。持续改变敌舰和实体弹丸的速度，不瞬移、不定身、不牵引友舰。重舰及完整模块舰按总质量抵抗。排散、过载或脱离维持距离会中断。',
  implementationDetails: 'Web原创引力实验装置；固定区域场、广义牵引及排斥共用对象级限幅。',
  chargeUp: .35, active: 6, chargeDown: .15, cooldown: 7, toggle: true, fluxPerUseFlat: 240,
  controls: { cancelOnDeath: true, cancelOnRetreat: true },
  gravityField: { kind: 'WELL', radius: 520, placementRange: 1400, duration: 6, shipStrength: 240, projectileStrength: 1000, shipBudget: 900, projectileBudget: 24000, maxShips: 24, maxProjectiles: 96 },
  activationReason: ship => !alive(ship) ? '当前不能建立引力井' :
    !Number.isFinite(ship.aimTargetWorld.x) || !Number.isFinite(ship.aimTargetWorld.y) || ship.pos.distanceTo(ship.aimTargetWorld) > 1400 ? '部署点超出1400距离' : undefined,
  modifiers: system => system.state === 'ACTIVE' ? { softFluxPerSecond: 180 } : {},
  onActivate: createField, onReset: noState, onInterrupt: noState,
  statusText: s => s.gravityField && s.state === 'ACTIVE' ? `引力井 · 固定场 / 再按收回 · ${s.activeTimer.toFixed(1)}s` : undefined,
  advanceAI: ({ ship, system = ship.system, target, tactical }) => {
    if (system.state !== 'IDLE' || !target || !alive(target) || sameTeam(ship, target) || tactical?.withdrawing || tactical?.waypoint || ship.flux.fluxPercent > .55) return;
    const before = ship.aimTargetWorld.clone();
    // Offset toward the owner's firing lane instead of repeatedly toggling an active field.
    ship.aimTargetWorld.copy(target.pos).addScaled(ship.pos.clone().sub(target.pos).normalize(), 140);
    system.activate(); ship.aimTargetWorld.copy(before);
  },
};
export const gravityRepulsor: ShipSystemDefinition = {
  id: ID.repulsor, sourceIds: [], name: '全向排斥', installReason,
  resources:{textures:[...gravityTextures]},
  description: '从本舰向四周扩张一次排斥波，推离敌舰与实体弹幕，成功时释放牵引对象。每对象每波一次冲量；不关闭独立引力井。刚抓住的友舰可被推出，其余友舰与普通友弹免疫。光束无法推开，不重置伤害或寿命。',
  implementationDetails: '本舰中心全向排斥；成功时释放广义牵引对象，友舰仅对被主动释放对象推送。',
  chargeUp: .12, active: .65, chargeDown: .2, cooldown: 11, fluxPerUseFlat: 900,
  controls: { cancelOnDeath: true, cancelOnRetreat: true },
  gravityField: { kind: 'REPULSOR', radius: 820, placementRange: 1, duration: .65, shipStrength: 240, projectileStrength: 720, shipBudget: 1000, projectileBudget: 20000, maxShips: 24, maxProjectiles: 128 },
  activationReason: ship => !alive(ship) ? '当前不能释放排斥波' : undefined,
  onActivate: createField, onReset: noState, onInterrupt: noState,
  statusText: s => s.gravityField ? '排斥波扩张 · 每对象一次冲量' : undefined,
  advanceAI: ({ ship, system, world, tactical }) => {
    if (!system || system.state !== 'IDLE' || !world || tactical?.waypoint || ship.flux.fluxPercent > .7) return;
    const close = world.ships.filter(other => other.assemblyRoot === other && !sameTeam(ship, other) && alive(other) && ship.pos.distanceTo(other.pos) < 450);
    const barrage=world.projectiles.filter(p=>!sameTeam(ship,p) && !p.didDamage && !p.collisionDisabled && p.spawnType!=='BALLISTIC_AS_BEAM'
      && p.pos.distanceTo(ship.pos)<430 && p.vel.clone().sub(ship.vel).dot(p.pos.clone().sub(ship.pos))<0).length;
    if (close.length >= 2 || barrage>=5 || (close.length > 0 && (tactical?.withdrawing || ship.flux.fluxPercent > .45))) system.activate();
  },
};
const maneuverLimits = { duration: .8, maxTurn: Math.PI * 2 / 3, turnRate: Math.PI * 5 / 6, lateralAcceleration: 240, minSpeed: 30, minAimDistance: 30 };
const clearManeuver: ShipSystemDefinition['onReset'] = system => { system.gravityManeuver = undefined; };
export const gravityVectorTurn: ShipSystemDefinition = {
  id: ID.maneuver, sourceIds: [], name: '惯性折转', installReason,
  description: '朝启动时指针方向有限弯转当前航迹，舰首仍可独立操纵。不加速、不瞬移、不提供护盾或无敌。高速时转弯更缓；制动、排散、过载及动力熄火会中断。不会主动关闭引力井。',
  implementationDetails: 'Web原创；速度向量改向进入共享外力结算。数值为机制试验基线，正式舰图、动态素材和自然AI平衡待验。',
  chargeUp: 0, active: maneuverLimits.duration, chargeDown: .1, cooldown: 10, fluxPerUseFlat: 450,
  controls: { cancelOnDeath: true, cancelOnRetreat: true, cancelOnBrake: true, cancelOnFlameout: true },
  gravityManeuver: maneuverLimits,
  activationReason: ship => {
    if (!alive(ship) || ship.isAttachedModule) return '当前不能折转航迹';
    if (ship.vel.length() < maneuverLimits.minSpeed) return '需要先推进至30航速';
    const dx = ship.aimTargetWorld.x - ship.pos.x, dy = ship.aimTargetWorld.y - ship.pos.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < maneuverLimits.minAimDistance) return '请指向离舰心更远的航行方向';
    const error = Math.atan2(Math.sin(Math.atan2(dy, dx) - ship.vel.heading()), Math.cos(Math.atan2(dy, dx) - ship.vel.heading()));
    return Math.abs(error) < .02 ? '当前已沿该方向航行' : undefined;
  },
  onActivate: (ship, _world, system) => {
    const input = system.activationInput;
    if (!input || !alive(ship) || system.disabled || ship.flux.isOverloaded || ship.flux.isVenting || system.state !== 'ACTIVE') return;
    system.gravityManeuver = { targetAngle: Math.atan2(input.point.y - input.origin.y, input.point.x - input.origin.x), age: 0, turnRemaining: maneuverLimits.maxTurn };
  },
  onReset: clearManeuver, onInterrupt: clearManeuver,
  statusText: system => system.gravityManeuver ? '惯性折转 · 不加速 / 舰首独立' : undefined,
  advanceAI: ({ ship, system, target, tactical }) => {
    if (!system || system.state !== 'IDLE' || !target || !alive(target) || sameTeam(ship, target) || !tactical?.withdrawing || tactical.waypoint || ship.flux.fluxPercent > .6) return;
    const before = ship.aimTargetWorld.clone();
    // A committed withdrawal direction, never perfect per-projectile dodging.
    ship.aimTargetWorld.copy(ship.pos).add(ship.pos.clone().sub(target.pos));
    system.activate(); ship.aimTargetWorld.copy(before);
  },
};
export const gravityRemoteRelease: ShipSystemDefinition = {
  id: ID.release, sourceIds: [], name: '远端释放', installReason, gravityRemoteRelease: true,
  description: '将已部署引力锚转为一次远端排斥波并收场。波从锚点向外传播，改变敌舰、实体弹和散落物的运动；没有锚时不可用。',
  implementationDetails: '锚位置与序列号在成功输入时提交；不追鼠标，失败不清场。',
  chargeUp: 0, active: .5, chargeDown: .15, cooldown: 6, fluxPerUseFlat: 450,
  controls: {cancelOnDeath:true,cancelOnRetreat:true},
  gravityField: {kind:'REPULSOR',radius:520,placementRange:1400,duration:.5,shipStrength:150,projectileStrength:450,shipBudget:600,projectileBudget:12000,maxShips:24,maxProjectiles:96},
  activationReason: ship => {
    const well = ship.allSystems.find(s=>s.definition.gravityField?.kind==='WELL');
    return !alive(ship) ? '当前不能远端释放' : !well?.gravityField || well.state !== 'ACTIVE' ? '需要一个已建立的引力锚'
      : Math.hypot(ship.pos.x-well.gravityField.x,ship.pos.y-well.gravityField.y)>1400 ? '引力锚超出维持距离' : undefined;
  },
  onActivate:createField,onReset:noState,onInterrupt:noState,
  statusText: s=>s.gravityField?'远端排斥 · 锚已释放':undefined,
  advanceAI: ({ship,system,target,tactical}) => {
    const well=ship.allSystems.find(s=>s.gravityField?.kind==='WELL');
    if (!system || system.state!=='IDLE' || !well?.gravityField || well.state!=='ACTIVE' || !target || ship.flux.fluxPercent>.65) return;
    const distance=Math.hypot(target.pos.x-well.gravityField.x,target.pos.y-well.gravityField.y);
    if (distance<350 && (tactical?.withdrawing || well.activeTimer<1.2)) system.activate();
  },
};
export const gravityBattleWell: ShipSystemDefinition = {
  ...gravityWell,id:ID.battleWell,name:'区域操纵',toggle:false,chargeUp:.25,active:20,cooldown:8,fluxPerUseFlat:900,
  description:'F布置区域场，按住可移动，松开最多10秒驻留，总有效20秒；半径1100、布置/维持2400。按住右键时区域排斥，松右键恢复吸引，不翻转左键。自然到期在最后位置自动潮汐爆，不能手动引爆；0.45秒预警，原伤害3200/800。打断只收场。再次接管同一场不刷新总时限。',
  gravityField:{kind:'WELL',cursorSpeed:650,lingerSeconds:10,radius:1100,placementRange:2400,duration:20,shipStrength:600,projectileStrength:1200,shipBudget:1800,projectileBudget:28000,maxShips:24,maxProjectiles:128},
  gravityCollapse:{radius:1100,damage:3200,edgeDamage:800,maxShips:24},
  gravityAutoCollapse:{chargeUp:.45,active:.35,fluxCost:1800},
  activationReason:(ship,system)=>system.gravityField?.kind==='COLLAPSE'?'区域正在自动坍缩':!alive(ship)?'当前不能布置重力井':!Number.isFinite(ship.aimTargetWorld.x)||!Number.isFinite(ship.aimTargetWorld.y)||ship.pos.distanceTo(ship.aimTargetWorld)>2400?'部署点超出2400距离':undefined,
  modifiers:system=>system.state==='ACTIVE'&&system.gravityField?.kind!=='COLLAPSE'?{softFluxPerSecond:250}:{},
  statusText:s=>s.gravityField?.kind==='COLLAPSE'?(s.state==='IN'?'自动坍缩预警':'到期潮汐爆'):s.gravityField ? `${s.gravityField.polarity===-1?'排斥':'吸引'}区域 · ${s.gravityControlHeld?'操纵中':s.gravityField.cursorControlled?'驻留 '+(s.gravityField.lingerRemaining??0).toFixed(1)+'s':'自主场'} · 总余${Math.max(0,s.activeTimer).toFixed(1)}s` : undefined,
};
export const gravityCollapse: ShipSystemDefinition = {
  id:ID.collapse,sourceIds:[],name:'潮汐坍缩',installReason,gravityRemoteRelease:true,
  resources:{textures:[...gravityTextures]},chargeUp:.45,active:.35,chargeDown:.1,cooldown:8,fluxPerUseFlat:1800,
  controls:{cancelOnDeath:true,cancelOnRetreat:true},
  description:'消耗已建立的重力井；0.45秒收缩后在原井区域产生一次潮汐伤害。中心3200、外缘800能量伤害，盾弧/装甲/遮挡照常结算。保持当前左键牵引，不攻击友舰。',
  gravityCollapse:{radius:650,damage:3200,edgeDamage:800,maxShips:24},
  activationReason:ship=>{
    const well=ship.allSystems.find(s=>s.definition.gravityField?.kind==='WELL');
    return !alive(ship)?'当前不能坍缩':!well?.gravityField||well.state!=='ACTIVE'?'需要已建立的重力井'
      :Math.hypot(ship.pos.x-well.gravityField.x,ship.pos.y-well.gravityField.y)>1700?'重力井超出维持距离':undefined;
  },
  onActivate:(ship,_world,system)=>{
    const well=ship.allSystems.find(s=>s.definition.gravityField?.kind==='WELL'),input=system.activationInput;
    if(!alive(ship)||system.disabled||ship.flux.isOverloaded||ship.flux.isVenting||!input||!well?.gravityField||well.activationSerial!==input.gravityAnchorSerial||(system.state!=='IN'&&system.state!=='ACTIVE'))return;
    system.gravityField={kind:'COLLAPSE',serial:system.activationSerial,x:input.point.x,y:input.point.y,age:0,duration:.35,radius:system.definition.gravityCollapse!.radius,
      shipBudgetRemaining:0,projectileBudgetRemaining:0,shipHits:[],projectileHits:[],collapseApplied:false};
    well.gravityField=undefined;well.deactivate();
  },onReset:noState,onInterrupt:noState,
  statusText:s=>s.gravityField?s.state==='IN'?'潮汐收缩 · 0.45秒预警':'潮汐崩解 · 单次命中':undefined,
  advanceAI:({ship,system,target})=>{
    const well=ship.allSystems.find(s=>s.gravityField?.kind==='WELL');
    if(!system||system.state!=='IDLE'||!well?.gravityField||well.state!=='ACTIVE'||well.gravityField.age<.8||!target||ship.flux.fluxPercent>.65)return;
    if(Math.hypot(target.pos.x-well.gravityField.x,target.pos.y-well.gravityField.y)<400||well.activeTimer<.8)system.activate();
  },
};
export const gravityPolaritySwitch: ShipSystemDefinition = {
  id:ID.polarity,sourceIds:[],name:'极性反转',installReason,gravityPolaritySwitch:true,
  description:'右键切换吸引/排斥；同时改变左键及本舰区域场的施力方向，不松抓、不关闭场。G始终向外排斥。',
  chargeUp:0,active:.05,chargeDown:0,cooldown:.12,
  initialize:s=>{s.gravityPolarity=1;},onReset:s=>{s.gravityPolarity=1;},
  onActivate:(ship,_world,s)=>{if(alive(ship)&&!s.disabled&&!ship.flux.isOverloaded&&!ship.flux.isVenting)s.gravityPolarity=s.gravityPolarity===-1?1:-1;},
  passiveStatusText:s=>`极性 · ${s.gravityPolarity===-1?'排斥':'吸引'}`,
  advanceAI:({ship,system})=>{if(system.state==='IDLE'&&system.gravityPolarity===-1&&!ship.flux.isOverloaded&&!ship.flux.isVenting)system.activate();},
};
export const gravityBattleRepulsor: ShipSystemDefinition = {
  ...gravityRepulsor,id:ID.battleRepulsor,name:'紧急排斥',chargeUp:.1,active:.4,cooldown:8,fluxPerUseFlat:2800,
  advanceAI:({ship,system,world,tactical})=>{
    if(!system||system.state!=='IDLE'||!world||tactical?.waypoint||ship.flux.fluxPercent>.7)return;
    const danger=world.ships.some(other=>{
      if(other.assemblyRoot!==other||sameTeam(ship,other)||!alive(other))return false;
      const gap=ship.pos.distanceTo(other.pos)-ship.spec.collisionRadius-other.spec.collisionRadius;
      return gap<80||(gap<180&&(tactical?.withdrawing||ship.flux.fluxPercent>.45));
    });
    const barrage=world.projectiles.filter(p=>{
      if(sameTeam(ship,p)||!gravityProjectileSupported(p))return false;
      const relative=p.pos.clone().sub(ship.pos),velocity=p.vel.clone().sub(ship.vel);
      const seconds=-relative.dot(velocity)/Math.max(1,velocity.lengthSq());
      return seconds>=0&&seconds<.65&&relative.addScaled(velocity,seconds).length()<ship.spec.collisionRadius+p.radius+25;
    }).length;
    if(danger||barrage>=5)system.activate();
  },
  gravityField:{kind:'REPULSOR',radius:1050,placementRange:1,duration:.4,shipStrength:650,projectileStrength:1100,shipBudget:2200,projectileBudget:36000,maxShips:24,maxProjectiles:128},
};
export const gravityDirectionalPush: ShipSystemDefinition = {
  id:ID.push,sourceIds:[],name:'定向推送',installReason,
  description:'按住右键对准未被左键抓住的敌舰、敌弹或可动实体即可持续推送；不接管左键对象（含本舰），不改变拖锚方向。本舰区域按住时排斥、松手恢复吸引，但不影响左键抓住的对象。不新增伤害、不接管弹体。松开立即停止，F操纵时保持已有力向，G仍独立全向解围。',
  implementationDetails:'Web原创有限连续外力；手动逻辑保持输入、质量响应、真实轮廓选取、遮挡与共享速度限幅。',
  chargeUp:0,active:Infinity,chargeDown:0,cooldown:.2,toggle:true,fluxPerUseFlat:60,
  gravityDirectionalPush:{range:2000,shipStrength:1800,projectileStrength:1400,fluxPerSecond:350},
  controls:{cancelOnDeath:true,cancelOnRetreat:true},
  activationReason:ship=>!alive(ship)||ship.fireControlMode!=='MANUAL'?'当前不能定向推送':undefined,
  onReset:s=>{s.gravityPush=undefined;s.gravityControlHeld=false;},onInterrupt:s=>{s.gravityPush=undefined;},
  statusText:s=>s.gravityControlHeld?s.gravityPush?.status??'对准实体推送':undefined,
  passiveStatusText:s=>s.state==='IDLE'?'按住右键 · 定向推送':undefined,
};
// Retain previous IDs for old fits and explicit historical rule probes.
export const gravitySystems = [gravityWell,gravityRepulsor,gravityVectorTurn,gravityRemoteRelease,gravityBattleWell,gravityCollapse,gravityBattleRepulsor,gravityPolaritySwitch,gravityDirectionalPush];
