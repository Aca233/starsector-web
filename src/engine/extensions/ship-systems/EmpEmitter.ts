import { sameTeam } from "../../simulation/CombatTeams";
import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { Projectile } from '../../simulation/Weapon';
import type { SystemWorld } from './Types';
import { nativeSystem } from './NativeSystemFactory';
import { applyComponentDamage } from '../../simulation/systems/weapon/ComponentDamage';

interface Target { point: () => Vector2; ship?: Ship; missile?: Projectile; local?: Vector2; shield?: boolean; weight: number }
interface State { elapsed: number; interval: number; previous?: Target }
const states = new WeakMap<ShipSystem, State>();
function shieldIntersection(ship: Ship, from: Vector2, to: Vector2): Vector2 | undefined {
  if (!ship.shield.isActive || ship.shield.type === 'NONE' || ship.shield.type === 'PHASE') return;
  const d = to.clone().sub(from), f = from.clone().sub(ship.getShieldCenter());
  const a = d.dot(d), b = 2*f.dot(d), c = f.dot(f)-ship.shield.radius**2, disc = b*b-4*a*c;
  if (a < 1e-9 || disc < 0) return;
  for (const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)]) {
    if (t < 0 || t > 1) continue;
    const p = from.clone().addScaled(d,t);
    if (ship.isShieldPointBlocked(p)) return p;
  }
}
/** Native D.getPotentialTargets: engines, nonhidden weapons and shield intersections;
 * missiles use every launcher for range, and successive arcs favor spatially separate targets. */
export function empEmitterTargets(source: Ship, world: SystemWorld, previous?: Target): Target[] {
  const slots = source.spec.systemWeaponSlots?.length ? source.spec.systemWeaponSlots : [{x:0,y:0}];
  const starts = slots.map(p=>new Vector2(p.x,p.y).rotate(source.facingRad).add(source.pos));
  const from = starts[0], range = 500*source.hullStats.systemRangeMultiplier, result: Target[] = [];
  const add = (target: Omit<Target,'weight'>, start=from) => {
    const distance = target.point().distanceTo(previous?.point() ?? start);
    result.push({...target,weight:distance*distance*(target.missile?.isDisarmed ? .1 : 1)});
  };
  for (const p of world.projectiles ?? []) {
    if (p.collisionDisabled || !p.isRocket || p.isFlare || sameTeam(p, source) || (p.hitpoints ?? 1) <= 0) continue;
    const start = starts.find(v=>v.distanceTo(p.pos)<=range);
    if (start) add({point:()=>p.pos,missile:p},start);
  }
  for (const ship of world.ships) {
    if (ship === source || sameTeam(ship, source) || ship.isDead || ship.isPhased || ship.isDocked) continue;
    if (ship.pos.distanceTo(from)>range+ship.spec.collisionRadius+source.spec.collisionRadius) continue;
    const points = [...ship.spec.engineSlots.map(p=>new Vector2(p.x,p.y)),...ship.weapons.filter(w=>w.mountType!=='HIDDEN').map(w=>w.relativePos)];
    for (const local of points) {
      const point = ()=>local.clone().rotate(ship.facingRad).add(ship.pos);
      const intersection = shieldIntersection(ship,from,point());
      if (intersection) {
        const offset = intersection.clone().sub(ship.pos);
        add({ship,shield:true,point:()=>ship.pos.clone().add(offset)});
      } else if (point().distanceTo(from)<=range) add({ship,local,point});
    }
  }
  return result;
}
function nextInterval(world: SystemWorld): number {
  // renderer damage flicker: .25*(.25+random*.75), then advance at .8 rate.
  const interval = .25*(.25+world.combatRandom.next()*.75);
  world.combatRandom.next(); world.combatRandom.next(); // source brightness and phase
  return interval;
}
export function dischargeEmpEmitter(source: Ship, world: SystemWorld, state: State): void {
  const targets = empEmitterTargets(source,world,state.previous);
  let roll = world.combatRandom.next()*targets.reduce((n,t)=>n+t.weight,0);
  const target = targets.find(t=>(roll-=t.weight)<0);
  const slot = source.spec.systemWeaponSlots?.[0];
  const from = slot ? new Vector2(slot.x,slot.y).rotate(source.facingRad).add(source.pos) : source.pos.clone();
  if (!target) { const end=source.pos.clone().add(Vector2.fromAngle(world.combatRandom.next()*Math.PI*2,125*source.hullStats.systemRangeMultiplier)); state.previous={point:()=>end,weight:1};world.spawnSystemArc?.(from,end,[255,150,255]);return; }
  state.previous=target;
  const point=target.point();world.spawnSystemArc?.(from,point,[255,150,255]);
  const damage=100*source.crDamageDealtMultiplier;
  if (target.missile) {
    const p=target.missile;
    if ((p.empResistance ?? 0)>0) p.empResistance!--;
    else {
      p.isDisarmed=true;p.isGuided=false;p.inertialFlight=true;p.armingTimeRemaining=10000;p.fizzleAtRange=true;
      p.targetProjectileId=undefined;p.engineAcceleration=0;
      p.missileEngineVisualSpec={nozzleOffset:0,width:0,length:0,color:[0,0,0,0]};
    }
    p.hitpoints=(p.hitpoints ?? 100)-damage*(1+source.hullStats.damageToMissilesPercent/100)*source.hullStats.damageToMissilesMultiplier;
    if (p.hitpoints<=0) {const i=world.projectiles?.indexOf(p) ?? -1;if(i>=0)world.projectiles!.splice(i,1);}
  } else if (target.ship && !target.ship.isPhased) {
    const ship=target.ship;
    if (target.shield) {
      const flux=ship.shield.absorbDamage(damage*ship.crDamageTakenMultiplier*ship.system.getShieldDamageMultiplier(),'ENERGY',point.clone().sub(ship.getShieldCenter()).heading());
      ship.flux.increaseShieldFlux(flux,true);
    } else if (target.local) {
      const result=ship.armor.takeDamage(target.local,damage*ship.crDamageTakenMultiplier,'ENERGY');
      ship.applyHullDamage(result.hullDamage);
      applyComponentDamage(ship,target.local,result,500,source);
    }
  }
}
export const empEmitter = nativeSystem('emp', {
  description:'500范围内按原生随机闪烁间隔释放电弧：100能量伤害和500EMP，护盾可拦截。导弹耗尽EMP抗性后熄火并解除引信，不会每帧重复造成EMP。',
  implementationDetails:'原生发射口/组件/护盾/导弹候选、随机间隔和距离平方权重、导弹抗性与解除引信。Web电弧表现；不是原版专用抖动动画。',
  onReset:s=>{states.delete(s);},
  audio:{activate:'system_emp_emitter_activate',loop:'system_emp_emitter_loop'},
  onActivate: (_ship,_world,s) => { const state=states.get(s);if(state)state.previous=undefined; },
  onAdvance: (ship,dt,world,s) => {
    let state=states.get(s);if(!state){state={elapsed:0,interval:nextInterval(world)};states.set(s,state);}
    state.elapsed+=dt*.8;
    if(state.elapsed<=state.interval)return;
    state.elapsed=0;state.interval=nextInterval(world);
    if(s.isActive && s.effectLevel===1)dischargeEmpEmitter(ship,world,state);
  },
  advanceAI: ({ship,target,distance,tactical, system = ship.system}) => {
    if(!target.isDead && !target.isPhased && distance<500+ship.spec.collisionRadius+target.spec.collisionRadius
      && ship.flux.fluxPercent<.65 && !tactical?.withdrawing)system.activate();
  },
});
