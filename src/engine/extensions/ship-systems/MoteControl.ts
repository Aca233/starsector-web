import { sameTeam } from "../../simulation/CombatTeams";
import { nativeSystem } from './NativeSystemFactory';
import { moteState,resetMotes,highFrequencyMotes } from './MoteState';
import { spawnSystemProjectile } from './SystemProjectile';
import { Vector2 } from '../../math/Vector2';
import { sound } from '../../audio/SoundManager';
import type { Ship } from '../../simulation/Ship';
const attractorSlot=(ship:Ship)=>ship.spec.systemWeaponSlots?.find(s=>s.slotSize==='MEDIUM');
export const moteControl=nativeSystem('mote_control',{
  installReason: spec => spec.systemWeaponSlots?.some(s => s.slotSize === 'MEDIUM') && spec.systemWeaponSlots.some(s => s.slotSize === 'SMALL') ? undefined : '需要中型吸引器和小型微光发射挂点',
  description:'自动维持30枚光尘（感灵吸引场50枚），拦截导弹/战机。按技能键将光尘引向3000范围内的点（10秒）或敌舰（20秒）；锁舰期间停止补充。',
  implementationDetails:'原生SYSTEM光尘弹体、随机补充周期、母舰/吸引点范围、每目标最多2枚拦截、成群避让、近距锁舰追击与穿盾EMP。Web独立平移导引；未逐帧复刻光尘闪动、空地吸引场粒子及音量空间混合。',
  resources:{weapons:['motelauncher','motelauncher_hf'],sounds:['mote_attractor_system_activated','mote_attractor_launch_mote','mote_attractor_targeted_ship']},
  audio:{activate:'mote_attractor_system_activated'},
  canActivate:ship=>!!attractorSlot(ship),
  onReset:(_s,ship)=>{if(ship)resetMotes(ship);},
  statusText:system=>system.owner?moteState(system.owner).motes.length+' / '+(highFrequencyMotes(system.owner)?50:30)+' 光尘':undefined,
  onActivate:(ship,world,system)=>{
    const slot=attractorSlot(ship);if(!slot)return;
    const from=ship.pos.clone().add(new Vector2(slot.x,slot.y).rotate(ship.facingRad));
    const range=3000*ship.hullStats.systemRangeMultiplier;
    const offset=(system.activationInput?.point??ship.aimTargetWorld).clone().sub(from);if(offset.length()>range)offset.scale(range/offset.length());
    const point=from.clone().add(offset),state=moteState(ship);
    state.attractorLock=world.ships.find(s=>!sameTeam(s, ship)&&!s.isDead&&!s.isRetreated&&!s.isCollisionless&&s.isVisibleTo(ship.teamId)&&s.spec.hullSize!=='FIGHTER'&&s.pos.distanceTo(from)<=range&&s.pos.distanceTo(point)<s.spec.collisionRadius+50);
    state.attractorTarget=state.attractorLock?.pos.clone()??point;
    state.attractorRemaining=state.attractorLock?20:10;
  },
  onActive:(ship,world)=>{
    const slot=attractorSlot(ship),state=moteState(ship);if(!slot||!state.attractorTarget)return;
    const from=ship.pos.clone().add(new Vector2(slot.x,slot.y).rotate(ship.facingRad));
    world.spawnSystemArc?.(from,state.attractorLock?.pos??state.attractorTarget,highFrequencyMotes(ship)?[255,100,255]:[100,165,255]);
    sound.playAtPos('mote_attractor_targeted_ship',state.attractorTarget,ship.pos,1);
  },
  onAdvance:(ship,dt,world)=>{
    if(!world.projectiles)return;
    const state=moteState(ship);state.elapsed+=dt;
    state.motes=state.motes.filter(p=>world.projectiles!.includes(p)&&(p.hitpoints??1)>0&&!p.didDamage);
    if(!state.deathMonitor&&world.addCombatEffect){
      state.deathMonitor=true;
      world.addCombatEffect(()=>{
        if(moteState(ship)!==state)return true;
        if(!ship.isDead&&!ship.isRetreated)return false;
        for(const p of state.motes){p.isDisarmed=true;p.inertialFlight=true;p.flightTimeRemaining=1;}state.motes=[];return true;
      });
    }
    if(state.attractorRemaining>0){state.attractorRemaining-=dt;if(state.attractorRemaining<=0||state.attractorLock?.isDead||state.attractorLock?.isRetreated||!state.motes.length){state.attractorTarget=undefined;state.attractorLock=undefined;state.attractorRemaining=0;}}
    if(!state.interval)state.interval=.75+world.combatRandom.next()*.5;
    state.launchElapsed+=dt*5;if(state.launchElapsed<state.interval)return;
    state.launchElapsed=0;state.interval=.75+world.combatRandom.next()*.5;
    const high=highFrequencyMotes(ship);
    if(state.motes.length>=(high?50:30)||state.attractorLock||ship.flux.isOverloaded||ship.flux.isVenting)return;
    const slots=ship.spec.systemWeaponSlots?.filter(s=>s.slotSize==='SMALL')??[];if(!slots.length)return;
    const slot=slots[Math.floor(world.combatRandom.next()*slots.length)];
    const from=ship.pos.clone().add(new Vector2(slot.x,slot.y).rotate(ship.facingRad));
    const angle=ship.facingRad+(slot.baseAngleDeg+(world.combatRandom.next()-.5)*slot.arcDeg)*Math.PI/180;
    const p=spawnSystemProjectile(ship,high?'motelauncher_hf':'motelauncher',from,angle,world,{empResistance:10000,interceptsMissiles:true,renderTargetIndicator:false,
      mote:{age:-world.combatRandom.next()*.5,turnSign:world.combatRandom.next()>.5?1:-1,scanRemaining:0}});
    state.motes.push(p);sound.playAtPos('mote_attractor_launch_mote',from,ship.pos,.25);
  },
  advanceAI:({ship,target,distance, system = ship.system})=>{const s=moteState(ship);if(distance<3000*ship.hullStats.systemRangeMultiplier&&s.motes.length>=6&&s.attractorRemaining<2){ship.aimTargetWorld.copy(target.pos);system.activate();}},
});
