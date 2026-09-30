import { GRAVITY_HULL_ID, GRAVITY_SYSTEM_IDS as ID } from '../../content/GravityIds';
import type { ShipSystemDefinition } from './Types';
import type { Ship } from '../../simulation/Ship';
import { sameTeam } from '../../simulation/CombatTeams';
import { releaseShipGravityTractors } from '../../simulation/systems/GravityTractor';
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
  system.gravityField = { kind: spec.kind, serial: system.activationSerial, x: point.x, y: point.y, age: 0, duration:spec.duration, radius: 0,
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
  ...gravityWell,id:ID.battleWell,name:'重力井',chargeUp:.25,active:7,cooldown:8,fluxPerUseFlat:900,
  description:'准星处固定重力井：聚拢敌舰、实体弹与可移动物体。G可将它坍缩为真实潮汐攻击，再按F安静收回。重舰按质量抵抗，不定身，不移动普通友军。',
  gravityField:{kind:'WELL',radius:650,placementRange:1700,duration:7,shipStrength:600,projectileStrength:1200,shipBudget:1800,projectileBudget:28000,maxShips:24,maxProjectiles:128},
  activationReason:ship=>!alive(ship)?'当前不能布置重力井':!Number.isFinite(ship.aimTargetWorld.x)||!Number.isFinite(ship.aimTargetWorld.y)||ship.pos.distanceTo(ship.aimTargetWorld)>1700?'部署点超出1700距离':undefined,
  modifiers:system=>system.state==='ACTIVE'?{softFluxPerSecond:250}:{},
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
    system.gravityField={kind:'COLLAPSE',serial:system.activationSerial,x:input.point.x,y:input.point.y,age:0,duration:.35,radius:650,
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
export const gravityBattleRepulsor: ShipSystemDefinition = {
  ...gravityRepulsor,id:ID.battleRepulsor,chargeUp:.1,active:.4,cooldown:8,fluxPerUseFlat:2800,
  gravityField:{kind:'REPULSOR',radius:1050,placementRange:1,duration:.4,shipStrength:650,projectileStrength:1100,shipBudget:2200,projectileBudget:36000,maxShips:24,maxProjectiles:128},
};
// Retain previous IDs for old fits and explicit historical rule probes.
export const gravitySystems = [gravityWell,gravityRepulsor,gravityVectorTurn,gravityRemoteRelease,gravityBattleWell,gravityCollapse,gravityBattleRepulsor];
