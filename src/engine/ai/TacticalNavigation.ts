import { sameTeam } from "../simulation/CombatTeams";
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { nativeGetMotionStats, type Ship } from '../simulation/Ship';
import type { TacticalWorld } from './TacticalWorld';
import { tacticalPolicy as policy } from './TacticalWorld';
import { cursorTurnCommand } from '../runtime/PlayerControls';

/** Heading/translation are independent, like native BasicEngineAI's desiredFacing/desiredHeading. */
export function driveVelocity(ship: Ship, desired: Vector2, facing: number): void {
  const stats=ship.getMotionStats();
  ship.turnInput=ship.system.locksTurning || ship.flux.isOverloaded ? 0
    : cursorTurnCommand(ship.facingRad,ship.angularVelRad,facing,stats.turnDeceleration);
  ship.brakeInput=desired.length()<1;
  ship.throttle=0;ship.strafeInput=0;
  if(ship.brakeInput)return;
  const local=desired.clone().sub(ship.vel).rotate(-ship.facingRad);
  ship.throttle=Math.max(-1,Math.min(1,local.x/((local.x>=0?stats.acceleration:stats.deceleration)*policy.steeringResponse)));
  ship.strafeInput=Math.max(-1,Math.min(1,local.y/(stats.acceleration*stats.strafeMultiplier*policy.steeringResponse)));
}

export function velocityToPosition(ship: Ship, point: Vector2, targetVelocity=new Vector2(), tolerance: number=policy.positionTolerance): Vector2 {
  const stats=ship.getMotionStats(),delta=point.clone().sub(ship.pos),distance=delta.length();
  const speed=distance<=tolerance?0:Math.min(stats.maxSpeed,Math.sqrt(2*stats.deceleration*(distance-tolerance)));
  const desired=targetVelocity.clone();
  if(distance>0)desired.addScaled(delta,speed/distance);
  if(desired.length()>stats.maxSpeed)desired.scale(stats.maxSpeed/desired.length());
  return desired;
}
const nativeDistanceTo = Vector2.prototype.distanceTo;
const nativeVectorLength = Vector2.prototype.length;
interface Obstacle { x:number;y:number;vx:number;vy:number;radius:number }
function obstacles(ship: Ship,world: TacticalWorld,horizon:number): Obstacle[] {
  const result:Obstacle[]=[];
  const ownRadius=Math.max(ship.spec.collisionRadius,ship.shield.isActive && ship.shield.type!=='PHASE'?ship.shield.radius:0);
  // The same observer speed was recomputed for every obstacle (including all
  // system modifiers). Reuse it only for this read-only native scan, never across
  // AI calls/ticks: systems and phase/flux state may change between those calls.
  // Dependency/custom callbacks keep the original per-obstacle reads.
  const reuseMotion = !world.noteNavigationObstacle && ship.getMotionStats === nativeGetMotionStats && ship.hasNativeThreatPhaseHooks;
  let motion: { maxSpeed: number; speed: number } | undefined;
  const add=(pos:Vector2,vel:Vector2,radius:number)=>{
    const combined=ownRadius+radius+policy.collisionMargin;
    const own = reuseMotion ? motion ??= { maxSpeed: ship.getMotionStats().maxSpeed, speed: ship.vel.length() } : undefined;
    if (own && horizon >= 0 && ship.pos.distanceTo === nativeDistanceTo && vel.length === nativeVectorLength) {
      // L1 speed bounds Euclidean speed from above, while a coordinate gap
      // bounds distance from below. Far obstacles need neither exact hypot.
      // Keep rounding slack and fail open on non-finite bounds; near obstacles
      // retain the original expression and its exact distance/radius comparison.
      const reach = combined + (own.maxSpeed + own.speed + Math.abs(vel.x) + Math.abs(vel.y)) * horizon;
      const gap = Math.max(Math.abs(ship.pos.x - pos.x), Math.abs(ship.pos.y - pos.y));
      if (gap > reach + 1e-12 * Math.max(1, Math.abs(reach))) return;
    }
    if(ship.pos.distanceTo(pos)>combined+((own?.maxSpeed ?? ship.getMotionStats().maxSpeed)+(own?.speed ?? ship.vel.length())+vel.length())*horizon)return;
    result.push({x:pos.x,y:pos.y,vx:vel.x,vy:vel.y,radius:combined});
  };
  for(const other of world.ships){
    if(other===ship||other.isDead||other.isPhased||other.spec.hullSize==='FIGHTER')continue;
    world.noteNavigationObstacle?.(ship, other, horizon);
    add(other.pos,other.vel,Math.max(other.spec.collisionRadius,other.shield.isActive&&other.shield.type!=='PHASE'?other.shield.radius:0));
  }
  for(const asteroid of world.asteroids)if(asteroid.hp>0)add(asteroid.pos,asteroid.vel,asteroid.radius);
  return result;
}

/** Finite acceleration and braking, rather than assuming a requested sideways velocity appears instantly. */
function collisionRisk(ship: Ship,desired: Vector2,nearby:Obstacle[],horizon:number): number {
  const stats=ship.getMotionStats(),step=horizon/policy.avoidanceSteps;
  const c=Math.cos(ship.facingRad),s=Math.sin(ship.facingRad);
  let x=ship.pos.x,y=ship.pos.y,vx=ship.vel.x,vy=ship.vel.y,risk=0;
  for(let i=0;i<policy.avoidanceSteps;i++){
    const beforeX=x,beforeY=y,time=i*step;
    if(desired.length()<1){const speed=Math.hypot(vx,vy),mult=speed?Math.max(0,1-stats.deceleration*step/speed):0;vx*=mult;vy*=mult;}
    else{
      const ex=(desired.x-vx)*c+(desired.y-vy)*s,ey=-(desired.x-vx)*s+(desired.y-vy)*c;
      const ax=Math.max(-stats.deceleration,Math.min(stats.acceleration,ex/policy.steeringResponse));
      const ay=Math.max(-stats.acceleration*stats.strafeMultiplier,Math.min(stats.acceleration*stats.strafeMultiplier,ey/policy.steeringResponse));
      vx+=(ax*c-ay*s)*step;vy+=(ax*s+ay*c)*step;
    }
    x+=vx*step;y+=vy*step;
    for(const o of nearby){
      const rx=beforeX-o.x-o.vx*time,ry=beforeY-o.y-o.vy*time;
      const dx=x-beforeX-o.vx*step,dy=y-beforeY-o.vy*step;
      const t=Math.max(0,Math.min(1,-(rx*dx+ry*dy)/Math.max(1e-10,dx*dx+dy*dy)));
      const separation=Math.hypot(rx+dx*t,ry+dy*t);
      if(separation<o.radius)risk+=(o.radius-separation)/o.radius*step/(1+time);
    }
  }
  return risk;
}

export function avoidCollisions(ship: Ship,desired: Vector2,world:TacticalWorld): {velocity:Vector2;avoiding:boolean;risk:number} {
  if(ship.isPhased)return {velocity:desired,avoiding:false,risk:0};
  const stats=ship.getMotionStats();
  const horizon=Math.max(policy.avoidanceLookahead,ship.vel.length()/Math.max(1,stats.deceleration)+1);
  const nearby=obstacles(ship,world,horizon);
  if(!nearby.length)return {velocity:desired,avoiding:false,risk:0};
  const originalRisk=collisionRisk(ship,desired,nearby,horizon);
  if(originalRisk<=1e-8)return {velocity:desired,avoiding:false,risk:0};
  const speed=Math.max(desired.length(),stats.maxSpeed*.5);
  const heading=desired.length()>1?desired.heading():ship.facingRad;
  // Starboard candidate first breaks head-on symmetry: both ships pass on their own right.
  const candidates=[desired.clone().scale(.5),new Vector2()];
  for(const angle of [30,-30,60,-60,90,-90,135,-135,180])candidates.push(Vector2.fromAngle(heading+angle*Math.PI/180,Math.min(speed,stats.maxSpeed)));
  let best=desired,bestRisk=originalRisk,bestDeviation=0;
  for(const candidate of candidates){
    const risk=collisionRisk(ship,candidate,nearby,horizon);
    // A pure velocity-difference cost rewards two capital ships stopping face-to-face forever.
    // Prefer a safe moving detour over losing all progress; braking still wins if moving is unsafe.
    const deviation=desired.length()>1
      ? Math.abs(signedAngle(candidate.heading()-heading))*speed*.5+Math.abs(candidate.length()-desired.length())*2
      : candidate.length();
    if(risk<bestRisk-1e-8||(Math.abs(risk-bestRisk)<1e-8&&deviation<bestDeviation-1e-8)){best=candidate;bestRisk=risk;bestDeviation=deviation;}
  }
  return {velocity:best,avoiding:true,risk:bestRisk};
}

export function forwardPathClear(ship:Ship,world:TacticalWorld,speed:number,horizon:number): boolean {
  // Conservative constant-speed corridor for a system which locks turning and accelerates forward.
  if(ship.isPhased)return true;
  const direction=Vector2.fromAngle(ship.facingRad,speed);
  for(const o of obstacles(ship,world,horizon)){
    const delta=new Vector2(o.x-ship.pos.x,o.y-ship.pos.y),relative=new Vector2(o.vx-direction.x,o.vy-direction.y);
    const t=Math.max(0,Math.min(horizon,-delta.dot(relative)/Math.max(1e-8,relative.dot(relative))));
    if(delta.addScaled(relative,t).length()<o.radius)return false;
  }
  return true;
}

export function rangeVelocity(ship:Ship,target:Ship,range:number,withdrawing:boolean):Vector2{
  const toward=target.pos.clone().sub(ship.pos);
  if(toward.length()<1e-6)toward.copy(Vector2.fromAngle(ship.facingRad));
  const unit=toward.clone().normalize();
  if(withdrawing)return unit.scale(-ship.getMotionStats().maxSpeed);
  const destination=target.pos.clone().addScaled(unit,-range);
  // Match the target's velocity for close stationkeeping, not the entire approach.
  // Two closing AIs otherwise feed each other's opposite velocity into their thrust
  // requests and settle at roughly half speed despite being well outside gun range.
  const stats=ship.getMotionStats();
  const brakingDistance=Math.max(64,stats.maxSpeed*stats.maxSpeed/(2*Math.max(1,stats.deceleration)));
  const gap=Math.max(0,toward.length()-range-policy.positionTolerance);
  const follow=Math.max(0,1-gap/brakingDistance);
  return velocityToPosition(ship,destination,target.vel.clone().scale(follow));
}
export const facingError=(ship:Ship,facing:number)=>signedAngle(facing-ship.facingRad);
/** Local cooperation: if this hull is the obstruction in an ally's current firing lane,
 * move toward the nearer edge. Does not pick fleet targets or rewrite explicit waypoints. */
export function yieldFireLane(ship:Ship,desired:Vector2,world:TacticalWorld):{velocity:Vector2;yielding:boolean}{
  if(ship.isPhased)return {velocity:desired,yielding:false};
  const lanes = world.friendlyFireLaneIndex?.get(world.ships);
  // Preserve roster/mount order and the uncached path for custom AI or owner probes.
  for(let i=0;i<(lanes?.length ?? world.ships.length);i++){
    const ally=lanes ? lanes[i].ally : world.ships[i];
    if(ally===ship||ally.isDead||!sameTeam(ally, ship))continue;
    for(const mount of lanes ? lanes[i].mounts : ally.weapons){
      if(mount.fireControl?.reason!=='FRIENDLY_BLOCKED'||mount.fireControl.targetKind!=='SHIP')continue;
      const target=lanes ? world.friendlyFireLaneIndex!.findTarget(mount.fireControlTargetShipId)
        : world.ships.find(s=>s.id===mount.fireControlTargetShipId&&!s.isDead&&!s.isPhased);
      if(!target)continue;
      const origin=mount.relativePos.clone().rotate(ally.facingRad).add(ally.pos);
      const line=target.pos.clone().sub(origin),length=line.length();
      if(length<1)continue;
      const unit=line.scale(1/length),relative=ship.pos.clone().sub(origin),along=relative.dot(unit);
      if(along<=0||along>=length-target.spec.collisionRadius)continue;
      const normal=new Vector2(-unit.y,unit.x),offset=relative.dot(normal);
      const radius=Math.max(ship.spec.collisionRadius,ship.shield.isActive&&ship.shield.type!=='PHASE'?ship.shield.radius:0)+policy.collisionMargin;
      if(Math.abs(offset)>=radius)continue;
      const velocity=desired.clone().addScaled(normal,(offset<0?-1:1)*ship.getMotionStats().maxSpeed*.5);
      if(velocity.length()>ship.getMotionStats().maxSpeed)velocity.scale(ship.getMotionStats().maxSpeed/velocity.length());
      return {velocity,yielding:true};
    }
  }
  return {velocity:desired,yielding:false};
}
