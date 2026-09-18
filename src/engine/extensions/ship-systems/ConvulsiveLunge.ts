import { offensiveManeuverAllowed } from './SystemAI';
import { nativeSystem } from './NativeSystemFactory';
import { Vector2 } from '../../math/Vector2';
import type { ShipSystem } from '../../simulation/ShipSystem';
const destinations=new WeakMap<ShipSystem,Vector2>();
/** ConvulsiveLungeSystemScript: a spring pull, not a teleport or fixed forward speed buff. */
export const convulsiveLunge=nativeSystem('convulsive_lunge',{
  description:'朝启动时的瞄准方向拉向1000单位外的固定点。2秒预备、3秒弹簧牵引、0.5秒收束；持续制动，禁止主推进与开火。蓄力超过85%且未收束时收起防御。',
  implementationDetails:'真实速度积分：max(0,4×离目标距离−1000)加速度；不瞬移、不套通用航速。保留转向/侧推。渊幕粒子预拉伸须由渊幕舰装视觉承接，当前未移植该粒子效果。',
  audio:{activate:'system_convulsive_lunge'},
  resources:{sounds:['system_convulsive_lunge']},
  onReset:(system,ship)=>{destinations.delete(system);ship?.runtimeModifiers.delete('convulsive_lunge');},
  onActivate:(ship,_world,system)=>{
    const origin=system.activationInput?.origin??ship.pos;
    const angle=(system.activationInput?.point??ship.aimTargetWorld).clone().sub(origin).heading();
    destinations.set(system,origin.clone().add(Vector2.fromAngle(angle,1000)));
  },
  motionControl:system=>({blockAcceleration:system.isActive&&system.effectLevel>0,forceBrake:system.isActive&&system.effectLevel>0}),
  onAdvance:(ship,dt,_world,system)=>{
    if(system.effectLevel>.85&&system.state!=='OUT'){
      ship.runtimeModifiers.set('convulsive_lunge',{disableDefense:1});ship.shield.setActive(false);ship.defenseSystem.deactivate();
    }else ship.runtimeModifiers.delete('convulsive_lunge');
    const dest=destinations.get(system);
    if(dest&&system.state==='ACTIVE'){
      const offset=dest.clone().sub(ship.pos),dist=offset.length();
      if(dist>0)ship.vel.addScaled(offset,Math.max(0,4*dist-1000)*dt/dist);
    }
    if(system.state==='OUT'||system.state==='IDLE'||system.state==='COOLDOWN')destinations.delete(system);
  },
  advanceAI:({ship,target,distance,tactical})=>{if(distance>600&&distance<2200&&offensiveManeuverAllowed(tactical)){ship.aimTargetWorld.copy(target.pos);ship.system.activate();}},
});
