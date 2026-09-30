import { GLORIANA_HULLMODS } from '../../content/GlorianaHullMods';
import { glorianaBulkheadStatus } from '../../content/GlorianaBuiltins';
import { modulePropulsionState } from '../../simulation/systems/ModulePropulsion';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { ShipSystemDefinition, SystemModifiers } from './Types';
import { signedAngle } from '../../math/Angles';
import { GLORIANA_EDICT_ID, GLORIANA_EDICT_ICON_URL, GLORIANA_HULL_ID } from '../../content/GlorianaPack';

import { broadsideAt, lockedBroadside, batterySide, alive, usableBattery, readyBatteries, edictOnline, type GlorianaBroadside } from './GlorianaEdictState';
export { broadsideAt, lockedBroadside, type GlorianaBroadside } from './GlorianaEdictState';

/** Pure query: live parent lifecycle + the accepted input, no persistent bonus state. */
export function edictModuleModifiers(system: ShipSystem, child: Ship): SystemModifiers {
  const owner=system.owner,side=batterySide(child),locked=lockedBroadside(system);
  if(!owner||child.parentShip!==owner||!owner.childModules.includes(child)||!side||!locked||!edictOnline(system)||!usableBattery(child))return {};
  const level=system.effectLevel;
  const loader=child.spec.hullMods?.includes(GLORIANA_HULLMODS.loader)||child.spec.builtInHullMods?.includes(GLORIANA_HULLMODS.loader);
  return side===locked ? {
    dissipationMultiplier:1-.3*level,
    weapons:{BALLISTIC:{rateOfFireMultiplier:(1+.75*level)*(loader?1+.5*level:1),rangePercent:15*level,fluxCostMultiplier:(1+.25*level)*(loader?1-.2*level:1)}},
  } : {weapons:{BALLISTIC:{rateOfFireMultiplier:1-.35*level}}};
}
const sideName=(side:GlorianaBroadside)=>side==='P'?'左舷':'右舷';
export const glorianaEdict: ShipSystemDefinition = {
  id:GLORIANA_EDICT_ID,sourceIds:[],name:'战列敕令',
  iconUrl:GLORIANA_EDICT_ICON_URL,resources:{textures:[GLORIANA_EDICT_ICON_URL]},
  description:'荣光女王专属。准星移向一侧后按F，锁定该舷炮廊。持续6秒：选定舷实弹射速+75%、射程+15%，但每发载荷消耗+25%、炮廊耗散-30%；对舷实弹射速-35%。核心航速/加速度-40%、转向-60%，抑制零载荷加速。启动消耗核心6%容量硬载荷，20秒冷却。',
  implementationDetails:'Web 原创；0.8/6/1秒阶段，所有倍率随阶段强度变化。启动后转动或移动准星不会换舷；中心线附近/该舷无可用实弹炮时不扣费。只增幅自身存活炮廊，不作用于动力舱、核心武器或友军；不增加弹药，损失炮廊不重新分配倍率。核心排散/过载立即撤除模块增益并进入退出/冷却。沿用模块AI火控，并非手动同步齐射。暂复用原版填弹器图标；选定炮廊局部装甲通电与实弹炮座光提示增益，封舱/离线炮廊熄灭。',
  chargeUp:.8,active:6,chargeDown:1,cooldown:20,fluxPerUseFraction:.06,hardFlux:true,
  installReason:spec=>(spec.sourceHullId??spec.id)===GLORIANA_HULL_ID&&!spec.isModuleHull?undefined:'需要荣光女王指挥核心（专属舰体）',
  activationReason:ship=>{
    if((ship.spec.sourceHullId??ship.spec.id)!==GLORIANA_HULL_ID||ship.isAttachedModule)return '需要荣光女王指挥核心';
    const side=broadsideAt(ship.aimTargetWorld,ship.pos,ship.facingRad);
    if(!side)return '将准星移至左舷或右舷后启动';
    return readyBatteries(ship,side).length?undefined:sideName(side)+'没有可用实弹炮廊（检查战损、弹药与载荷）';
  },
  passiveStatusText:system=>{
    const owner = system.owner;
    if (!owner) return undefined;
    const seal = glorianaBulkheadStatus(owner), drive = modulePropulsionState(owner);
    const status = drive && drive.level < 1 ? `动力 ${drive.online}/${drive.total} · 航速${Math.round(drive.speed*100)}% 加速${Math.round(drive.acceleration*100)}% 转向${Math.round(drive.turn*100)}%` : undefined;
    return [seal, status].filter(Boolean).join(' · ') || undefined;
  },
  statusText:system=>{
    const owner=system.owner;if(!owner)return undefined;
    const side=system.isActive?lockedBroadside(system):broadsideAt(owner.aimTargetWorld,owner.pos,owner.facingRad);
    if(!side)return system.isActive?'敕令中止 · 退出中':'准星选舷：左舷 / 右舷';
    const count=readyBatteries(owner,side).length;
    return system.isActive?`${sideName(side)}敕令 · ${count}/3炮廊 · 射速+${Math.round((edictOnline(system) ? .75 : 0)*system.effectLevel*100)}% · 对舷减速`:`准星：${sideName(side)} · ${count}/3炮廊可用`;
  },
  modifiers:system=>({zeroFluxBoostSuppressed:1,speedPercent:-40*system.effectLevel,accelerationPercent:-40*system.effectLevel,turnRatePercent:-60*system.effectLevel,turnAccelerationPercent:-60*system.effectLevel}),
  moduleModifiers:edictModuleModifiers,
  onAdvance:(ship,_dt,_world,system)=>{
    if(system.isActive&&(ship.flux.isOverloaded||ship.flux.isVenting||ship.retreating||system.disabled)) {
      // Invalidate the accepted order: finishing a quick vent during OUT must not revive it.
      system.activationInput=undefined;
      if(system.state!=='OUT')system.deactivate();
    }
  },
  advanceAI:({ship,target,system=ship.system,tactical})=>{
    if(system.isActive||system.isCoolingDown||system.disabled||!alive(ship)||!alive(target)||target.isPhased||tactical?.withdrawing||tactical?.waypoint||tactical?.avoidingCollision)return;
    if(ship.flux.totalFlux+system.fluxCostPerUse>ship.flux.maxFlux*.65)return;
    const side=broadsideAt(ship.aimTargetWorld,ship.pos,ship.facingRad);
    if(!side||side!==broadsideAt(target.pos,ship.pos,ship.facingRad))return;
    const useful=readyBatteries(ship,side).filter(b=>b.flux.fluxPercent<.6).some(b=>b.weapons.some(w=>{
      if(w.spec.weaponType!=='BALLISTIC'||w.isDisabled||w.ammo===0||w.cooldownTimer>system.chargeUpDuration)return false;
      const delta=target.pos.clone().sub(b.pos.clone().add(w.relativePos.clone().rotate(b.facingRad)));
      return delta.length()<=b.getWeaponDisplayRange(w.spec)+target.spec.collisionRadius
        && Math.abs(signedAngle(delta.heading()-w.currentAngleRad))<.2+Math.asin(Math.min(1,target.spec.collisionRadius/Math.max(1,delta.length())));
    }));
    if(useful)system.activate();
  },
};
