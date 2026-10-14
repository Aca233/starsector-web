import { signedAngle } from '../../math/Angles';
import { solveSteering } from '../SteeringKernel';
import { tacticalPolicy as policy } from '../TacticalWorld';
import type { FleetAssignment } from '../FleetTactics';
import { BodyFlag as B } from './StageProtocol';
import { assertAIStage, clamp, length, limit, type AIVelocity, type AIStageView } from './AIInputs';
import { aiDomainWork } from './AIWork';

interface Obstacle { x:number;y:number;vx:number;vy:number;radius:number;rejectRadius:number }
export function positionVelocity(v:AIStageView,r:number,x:number,y:number,vx=0,vy=0,tolerance:number=policy.positionTolerance):AIVelocity {
  aiDomainWork.navigationSolves++;
  const b=v.bodies,dx=x-b.x[r],dy=y-b.y[r],distance=length(dx,dy);
  const speed=distance<=tolerance?0:Math.min(b.maxSpeed[r],Math.sqrt(2*b.deceleration[r]*(distance-tolerance)));
  const desired={x:vx,y:vy};if(distance>0){desired.x+=dx*(speed/distance);desired.y+=dy*(speed/distance);}
  return limit(desired,b.maxSpeed[r]);
}
export function approachVelocity(v:AIStageView,r:number,t:number,range:number,withdrawing:boolean,assignment?:FleetAssignment):AIVelocity {
  const b=v.bodies;let tx=b.x[t]-b.x[r],ty=b.y[t]-b.y[r];
  if(length(tx,ty)<1e-6){tx=Math.cos(b.facing[r]);ty=Math.sin(b.facing[r]);}
  const distance=length(tx,ty),ux=distance>.00001?tx/distance:tx,uy=distance>.00001?ty/distance:ty;
  if(withdrawing)return {x:ux*-b.maxSpeed[r],y:uy*-b.maxSpeed[r]};
  const braking=Math.max(64,b.maxSpeed[r]*b.maxSpeed[r]/(2*Math.max(1,b.deceleration[r])));
  const gap=Math.max(0,distance-range-policy.positionTolerance),follow=Math.max(0,1-gap/braking);
  const desired=positionVelocity(v,r,b.x[t]+ux*-range,b.y[t]+uy*-range,b.vx[t]*follow,b.vy[t]*follow);
  if(assignment?.approachBearing==null)return desired;
  const rx=b.x[r]-b.x[t],ry=b.y[r]-b.y[t],radial=length(rx,ry);
  if(radial<1||radial>range*2.5)return desired;
  const error=signedAngle(assignment.approachBearing-Math.atan2(ry,rx));
  const lane=Math.min(b.maxSpeed[r]*(assignment.role==='SKIRMISHER'?.5:.3),Math.sqrt(2*b.acceleration[r]*v.ai.strafeMultiplier[r]*Math.max(0,Math.abs(error)*radial-20)));
  desired.x+=-ry/radial*(Math.sign(error)*lane);desired.y+=rx/radial*(Math.sign(error)*lane);
  return limit(desired,b.maxSpeed[r]);
}
export function regroupVelocity(v:AIStageView,r:number,anchor:number,t:number):AIVelocity {
  const b=v.bodies;let x=t>=0?b.x[anchor]-b.x[t]:Math.cos(b.facing[anchor]+Math.PI),y=t>=0?b.y[anchor]-b.y[t]:Math.sin(b.facing[anchor]+Math.PI);
  if(length(x,y)<1){x=Math.cos(b.facing[anchor]+Math.PI);y=Math.sin(b.facing[anchor]+Math.PI);}
  const k=(b.radius[r]+b.radius[anchor]+180)/length(x,y);
  return positionVelocity(v,r,b.x[anchor]+x*k,b.y[anchor]+y*k,b.vx[anchor],b.vy[anchor],60);
}
const AVOIDANCE_ANGLES=[30,-30,60,-60,90,-90,135,-135,180] as const;
function obstacles(v:AIStageView,r:number,horizon:number):Obstacle[] {
  const b=v.bodies,a=v.ai,result:Obstacle[]=[],own=Math.max(b.radius[r],a.rawShieldActive[r]&&b.shieldType[r]!==3?b.shieldRadius[r]:0);
  const rx=b.x[r],ry=b.y[r],ownSpeed=b.maxSpeed[r]+length(b.vx[r],b.vy[r]);
  const add=(x:number,y:number,vx:number,vy:number,radius:number)=>{
    const combined=own+radius+policy.collisionMargin;
    if(horizon>=0){
      const reach=combined+(ownSpeed+Math.abs(vx)+Math.abs(vy))*horizon;
      const gap=Math.max(Math.abs(rx-x),Math.abs(ry-y));
      if(gap>reach+1e-12*Math.max(1,Math.abs(reach)))return;
    }
    if(length(rx-x,ry-y)>combined+(ownSpeed+length(vx,vy))*horizon)return;
    result.push({x,y,vx,vy,radius:combined,rejectRadius:combined+1e-12*Math.max(1,Math.abs(combined))});
  };
  const rootRow=b.assemblyRootRow[r],team=b.team[r];
  for(let i=0;i<v.bodyCount;i++){
    if(b.assemblyRootRow[i]===rootRow||(b.flags[i]&(B.DEAD|B.PHASED|B.FIGHTER)))continue;
    add(b.x[i],b.y[i],b.vx[i],b.vy[i],Math.max(b.radius[i],a.rawShieldActive[i]&&b.shieldType[i]!==3&&!(b.shieldVoid[i]&&b.team[i]===team)?b.shieldRadius[i]:0));
  }
  for(let i=0;i<a.obstacleCount;i++)add(a.obstacleX[i],a.obstacleY[i],a.obstacleVx[i],a.obstacleVy[i],a.obstacleRadius[i]);
  return result;
}
function risk(v:AIStageView,r:number,desired:AIVelocity,nearby:Obstacle[],horizon:number):number {
  const b=v.bodies,step=horizon/policy.avoidanceSteps,c=Math.cos(b.facing[r]),s=Math.sin(b.facing[r]);
  const desLen=length(desired.x,desired.y),maxAy=b.acceleration[r]*v.ai.strafeMultiplier[r],decel=b.deceleration[r],accel=b.acceleration[r];
  let x=b.x[r],y=b.y[r],vx=b.vx[r],vy=b.vy[r],score=0;
  for(let i=0;i<policy.avoidanceSteps;i++){
    const bx=x,by=y,time=i*step;
    if(desLen<1){const speed=Math.hypot(vx,vy),mult=speed?Math.max(0,1-decel*step/speed):0;vx*=mult;vy*=mult;}
    else {
      const ex=(desired.x-vx)*c+(desired.y-vy)*s,ey=-(desired.x-vx)*s+(desired.y-vy)*c;
      const ax=clamp(ex/policy.steeringResponse,-decel,accel);
      const ay=clamp(ey/policy.steeringResponse,-maxAy,maxAy);
      vx+=(ax*c-ay*s)*step;vy+=(ax*s+ay*c)*step;
    }
    x+=vx*step;y+=vy*step;
    const stepDx=x-bx,stepDy=y-by;
    for(let k=0;k<nearby.length;k++){
      const o=nearby[k],rej=o.rejectRadius;
      const rx=bx-o.x-o.vx*time,ry=by-o.y-o.vy*time,dx=stepDx-o.vx*step,dy=stepDy-o.vy*step;
      if((rx>rej&&rx+dx>rej)||(rx<-rej&&rx+dx<-rej)||(ry>rej&&ry+dy>rej)||(ry<-rej&&ry+dy<-rej))continue;
      const t=clamp(-(rx*dx+ry*dy)/Math.max(1e-10,dx*dx+dy*dy),0,1);
      const sx=rx+dx*t,sy=ry+dy*t;
      if(Math.abs(sx)>rej||Math.abs(sy)>rej)continue;
      const separation=Math.hypot(sx,sy);
      if(separation<o.radius)score+=(o.radius-separation)/o.radius*step/(1+time);
    }
  }
  return score;
}
export function solveAIAvoidance(v:AIStageView,r:number,desired:AIVelocity):{velocity:AIVelocity;avoiding:boolean;risk:number} {
  assertAIStage(v);
  aiDomainWork.avoidanceSolves++;
  const b=v.bodies;
  if(b.flags[r]&B.PHASED)return {velocity:desired,avoiding:false,risk:0};
  const horizon=Math.max(policy.avoidanceLookahead,length(b.vx[r],b.vy[r])/Math.max(1,b.deceleration[r])+1),nearby=obstacles(v,r,horizon);
  if(!nearby.length)return {velocity:desired,avoiding:false,risk:0};
  const original=risk(v,r,desired,nearby,horizon);
  if(original<=1e-8)return {velocity:desired,avoiding:false,risk:0};
  const desLen=length(desired.x,desired.y);
  const speed=Math.max(desLen,b.maxSpeed[r]*.5),heading=desLen>1?Math.atan2(desired.y,desired.x):b.facing[r];
  const candidates=[{x:desired.x*.5,y:desired.y*.5},{x:0,y:0}];
  const candidateSpeed=Math.min(speed,b.maxSpeed[r]);
  for(const angle of AVOIDANCE_ANGLES){const h=heading+angle*Math.PI/180;candidates.push({x:Math.cos(h)*candidateSpeed,y:Math.sin(h)*candidateSpeed});}
  let best=desired,bestRisk=original,bestDeviation=0;
  for(const candidate of candidates){
    const candidateRisk=risk(v,r,candidate,nearby,horizon),candLen=length(candidate.x,candidate.y),deviation=desLen>1
      ?Math.abs(signedAngle(Math.atan2(candidate.y,candidate.x)-heading))*speed*.5+Math.abs(candLen-desLen)*2:candLen;
    if(candidateRisk<bestRisk-1e-8||Math.abs(candidateRisk-bestRisk)<1e-8&&deviation<bestDeviation-1e-8){best=candidate;bestRisk=candidateRisk;bestDeviation=deviation;}
  }
  return {velocity:best,avoiding:true,risk:bestRisk};
}
export function solveAIForwardPath(v:AIStageView,r:number,speed:number,horizon:number):boolean {
  assertAIStage(v);
  const b=v.bodies;if(b.flags[r]&B.PHASED)return true;
  const vx=Math.cos(b.facing[r])*speed,vy=Math.sin(b.facing[r])*speed;
  for(const o of obstacles(v,r,horizon)){
    const dx=o.x-b.x[r],dy=o.y-b.y[r],rx=o.vx-vx,ry=o.vy-vy;
    const t=clamp(-(dx*rx+dy*ry)/Math.max(1e-8,rx*rx+ry*ry),0,horizon);
    if(length(dx+rx*t,dy+ry*t)<o.radius)return false;
  }
  return true;
}
export function solveAIYield(v:AIStageView,r:number,desired:AIVelocity):{velocity:AIVelocity;yielding:boolean} {
  assertAIStage(v);
  aiDomainWork.yieldSolves++;
  const b=v.bodies,w=v.weapons,a=v.ai;
  if(b.flags[r]&B.PHASED)return {velocity:desired,yielding:false};
  for(let ally=0;ally<v.bodyCount;ally++){
    if(ally===r||(b.flags[ally]&B.DEAD)||b.team[ally]!==b.team[r])continue;
    for(let m=b.weaponFirst[ally],end=m+b.weaponCount[ally];m<end;m++){
      const t=a.blockedLaneTarget[m];if(t<0||(b.flags[t]&(B.DEAD|B.PHASED)))continue;
      const c=Math.cos(b.facing[ally]),s=Math.sin(b.facing[ally]),ox=w.relativeX[m]*c-w.relativeY[m]*s+b.x[ally],oy=w.relativeX[m]*s+w.relativeY[m]*c+b.y[ally];
      const dx=b.x[t]-ox,dy=b.y[t]-oy,n=length(dx,dy);if(n<1)continue;
      const ux=dx/n,uy=dy/n,rx=b.x[r]-ox,ry=b.y[r]-oy,along=rx*ux+ry*uy;
      if(along<=0||along>=n-b.radius[t])continue;
      const offset=rx*-uy+ry*ux,radius=Math.max(b.radius[r],a.rawShieldActive[r]&&b.shieldType[r]!==3?b.shieldRadius[r]:0)+policy.collisionMargin;
      if(Math.abs(offset)>=radius)continue;
      const k=(offset<0?-1:1)*b.maxSpeed[r]*.5;
      return {velocity:limit({x:desired.x+-uy*k,y:desired.y+ux*k},b.maxSpeed[r]),yielding:true};
    }
  }
  return {velocity:desired,yielding:false};
}
export function solveAISteering(v:AIStageView,r:number,desired:AIVelocity,facing:number) {
  assertAIStage(v);
  aiDomainWork.steeringSolves++;
  const b=v.bodies;
  return solveSteering({facing:b.facing[r],angularVelocity:b.angularVelocity[r],velocityX:b.vx[r],velocityY:b.vy[r],
    acceleration:b.acceleration[r],deceleration:b.deceleration[r],strafeMultiplier:v.ai.strafeMultiplier[r],
    turnDeceleration:b.turnDeceleration[r],locked:!!v.ai.systemLocksTurning[r]||!!(b.flags[r]&B.OVERLOADED)},desired.x,desired.y,facing,policy.steeringResponse);
}
