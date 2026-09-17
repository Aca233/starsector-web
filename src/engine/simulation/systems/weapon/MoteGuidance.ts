import { sameTeam } from "../../CombatTeams";
import { Vector2 } from '../../../math/Vector2';
import { interceptTime } from '../../../ai/FireControlGeometry';
import { moteState } from '../../../extensions/ship-systems/MoteState';
import { projectileSource } from './OutgoingDamage';
import type { Projectile } from '../../Weapon';
import type { Ship } from '../../Ship';
import type { WeaponSimContext } from './WeaponSimContext';
const direction=(from:Vector2,to:Vector2)=>to.clone().sub(from).normalize();
/** MoteAIScript flocking forces and target-budget rules, with Web linear intercept steering. */
export function advanceMote(p:Projectile,dt:number,ctx:WeaponSimContext,projectiles:Projectile[],ships:Ship[]):void {
  const data=p.mote,source=projectileSource(p,ctx);if(!data||!source||p.isDisarmed)return;
  data.age+=dt;if(data.age<.5)return;
  const shared=moteState(source),attractor=shared.attractorLock?.pos??shared.attractorTarget;
  data.scanRemaining-=dt;
  if(data.scanRemaining<=0){
    data.scanRemaining=.05+ctx.random.next()*.05;
    p.targetShipId=undefined;p.targetProjectileId=undefined;
    if(shared.attractorLock&&!shared.attractorLock.isDead&&!shared.attractorLock.isRetreated)p.targetShipId=shared.attractorLock.id;
    else {
      let best:Ship|Projectile|undefined,min=Infinity;
      const eligible=(pos:Vector2)=>pos.distanceTo(source.pos)<=2000||(!!attractor&&pos.distanceTo(attractor)<=1000);
      for(const other of projectiles){
        if(other===p||!other.isRocket||other.isPlayer===undefined||sameTeam(other, p)||other.collisionDisabled||other.isDisarmed||other.didDamage||(other.hitpoints??1)<=0||!eligible(other.pos))continue;
        if(shared.motes.filter(m=>m!==p&&m.targetProjectileId===other.id).length>=2)continue;
        const dist=p.pos.distanceTo(other.pos);if(dist<min){min=dist;best=other;}
      }
      for(const other of ships){
        if(sameTeam(other, p)||other.isDead||other.isCollisionless||other.spec.hullSize!=='FIGHTER'||!eligible(other.pos))continue;
        const dist=p.pos.distanceTo(other.pos);if(dist>3000&&!other.isVisibleTo(source.teamId))continue;
        if(shared.motes.filter(m=>m!==p&&m.targetShipId===other.id).length>=2)continue;
        if(dist<min){min=dist;best=other;}
      }
      if(best){if(typeof best.id==='string')p.targetShipId=best.id;else p.targetProjectileId=best.id;}
    }
  }
  const shipTarget=p.targetShipId?ships.find(s=>s.id===p.targetShipId&&!s.isDead&&!s.isCollisionless):undefined;
  const missileTarget=p.targetProjectileId===undefined?undefined:projectiles.find(q=>q.id===p.targetProjectileId&&(q.hitpoints??1)>0&&!q.didDamage);
  const target=shipTarget??missileTarget;
  let force=new Vector2();
  const distantLock=shared.attractorLock&&p.pos.distanceTo(shared.attractorLock.pos)>shared.attractorLock.spec.collisionRadius+300;
  if(target&&!distantLock){
    const lead=interceptTime(target.pos.clone().sub(p.pos),target.vel,p.maxSpeed??400)??0;
    force=target.pos.clone().addScaled(target.vel,lead).sub(p.pos);
  }else{
    let avoid=50*(1+Math.sin(shared.elapsed)*.25);const cohesion=100;
    if(attractor){const dist=p.pos.distanceTo(attractor);force.addScaled(direction(p.pos,attractor),Math.min(1,dist/200)*3);avoid*=3;}
    let hard=false;
    for(const other of [...ships.filter(s=>!s.isDead&&s.spec.hullSize!=='FIGHTER').map(s=>({pos:s.pos,radius:s.spec.collisionRadius})),...(ctx.asteroids??[])]){
      const dist=p.pos.distanceTo(other.pos);if(dist>other.radius+400)continue;
      const range=other.radius+avoid+50;
      if(dist<range){const f=1-dist/range;force.addScaled(direction(other.pos,p.pos),f*5);hard=f>.5;}
    }
    for(const other of shared.motes){if(other===p)continue;const dist=p.pos.distanceTo(other.pos);
      if(dist<avoid&&!hard)force.addScaled(direction(other.pos,p.pos),1-dist/avoid);
      if(dist<cohesion)force.addScaled(other.vel.clone().normalize(),1-dist/cohesion);
    }
    const dist=p.pos.distanceTo(source.pos),radius=source.spec.collisionRadius;
    if(dist>radius+200)force.addScaled(direction(p.pos,source.pos),(dist/(radius+600)-1)*.5);
    if(dist<radius+50)force.addScaled(direction(source.pos,p.pos),(1-dist/(radius+50))*5);
    if(dist<radius+600&&source.vel.length()>20)force.addScaled(source.vel.clone().normalize(),1-dist/(radius+600));
    if(force.length()<=.05)force=direction(p.pos,source.pos).rotate(data.turnSign*Math.PI/2);
  }
  if(force.length()>0){const desired=force.normalize().scale(p.maxSpeed??400),change=desired.sub(p.vel);const max=(p.engineAcceleration??650)*dt;if(change.length()>max)change.scale(max/change.length());p.vel.add(change);}
  p.facingRad=(p.facingRad??0)+data.turnSign*(p.maxTurnRate??0)*dt;
}
