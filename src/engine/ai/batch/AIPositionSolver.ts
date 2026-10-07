import { positionScorer, type PositionBody, type PositionFoeGun, type PositionLane } from '../TacticalPositioningKernel';
import type { CombatProfile } from '../ShipCombatProfile';
import type { FleetPlan } from '../FleetTactics';
import { BodyFlag as B, WeaponFlag as W } from './StageProtocol';
import { length, limit, visible, type AIVelocity, type AIStageView } from './AIInputs';
import { batteryRows } from './AIProfileSolver';
import { aiDomainWork } from './AIWork';

export interface AIPositionChoice {
  velocity:AIVelocity;adjusted:boolean;scoreGain:number;clearFire:number;reason:'BASELINE'|'FIRE_LANE'|'COVER';
}
export function solveAIPosition(v:AIStageView,r:number,t:number,desired:AIVelocity,profile:CombatProfile,fleet:FleetPlan):AIPositionChoice {
  aiDomainWork.positionSolves++;
  const b=v.bodies,w=v.weapons,a=v.ai;
  const result:AIPositionChoice={velocity:desired,adjusted:false,scoreGain:0,clearFire:0,reason:'BASELINE'};
  if((b.flags[r]&(B.PHASED|B.VENTING|B.OVERLOADED))||a.systemLocksTurning[r]||!visible(v,t,r)||!(b.maxSpeed[r]>0)
    ||!Number.isFinite(profile.range)||length(b.x[r]-b.x[t],b.y[r]-b.y[t])>profile.range*2.5)return result;
  const battery=(row:number,steady=false)=>batteryRows(v,row,steady).filter(m=>!(w.flags[m]&W.PD)&&w.dps[m]>0&&Number.isFinite(w.dps[m]+w.effectiveRange[m]))
    .sort((m,n)=>w.dps[n]-w.dps[m]||a.slotIds[m].localeCompare(a.slotIds[n])).slice(0,8);
  const guns=battery(r,true),ownPower=guns.reduce((n,m)=>n+w.dps[m],0);if(ownPower<=0)return result;
  const nearby:number[]=[];
  for(let i=0;i<v.bodyCount;i++)if(i!==r&&i!==t&&!(b.flags[i]&(B.DEAD|B.PHASED|B.FIGHTER))&&visible(v,i,r))nearby.push(i);
  nearby.sort((i,j)=>length(b.x[r]-b.x[i],b.y[r]-b.y[i])-length(b.x[r]-b.x[j],b.y[r]-b.y[j])||a.ids[i].localeCompare(a.ids[j]));
  // Preserve the existing advisory sample limits; threat/collision/fleet domains
  // retain every entity/mount and are never capped by these local policy limits.
  nearby.length=Math.min(nearby.length,12);
  const predict=(i:number)=>({x:b.x[i]+b.vx[i]*3,y:b.y[i]+b.vy[i]*3});
  const bodies:PositionBody[]=nearby.map(i=>({...predict(i),radius:Math.max(b.radius[i],a.rawShieldActive[i]&&!(b.shieldVoid[i]&&b.team[i]===b.team[r])?b.shieldRadius[i]:0)+8}));
  const rocks=Array.from({length:a.asteroidCount},(_,i)=>i).sort((i,j)=>length(b.x[r]-a.obstacleX[i],b.y[r]-a.obstacleY[i])-length(b.x[r]-a.obstacleX[j],b.y[r]-a.obstacleY[j])).slice(0,8);
  for(const i of rocks)bodies.push({x:a.obstacleX[i]+a.obstacleVx[i]*3,y:a.obstacleY[i]+a.obstacleVy[i]*3,radius:a.obstacleRadius[i]+8});
  const foes:PositionFoeGun[]=[];
  for(const i of nearby.filter(i=>b.team[i]!==b.team[r]&&!(b.flags[i]&(B.VENTING|B.OVERLOADED|B.WEAPONS_BLOCKED))).slice(0,4)){
    const p=predict(i),c=Math.cos(b.facing[i]),s=Math.sin(b.facing[i]);
    for(const m of battery(i))foes.push({x:w.relativeX[m]*c-w.relativeY[m]*s+p.x,y:w.relativeX[m]*s+w.relativeY[m]*c+p.y,
      range:w.effectiveRange[m],power:w.dps[m],facing:b.facing[i],base:a.localBaseAngle[m],arc:a.authoredHalfArc[m]+.15});
  }
  const lanes:PositionLane[]=[];
  for(const i of nearby.filter(i=>b.team[i]===b.team[r])){
    const id=fleet.get(a.ids[i])?.targetId,j=id?v.rowById.get(id):undefined;
    if(j!==undefined&&!(b.flags[j]&B.DEAD)&&b.team[j]!==b.team[r]&&visible(v,j,r))lanes.push({start:predict(i),end:predict(j)});
  }
  const score=positionScorer({x:b.x[r],y:b.y[r],vx:b.vx[r],vy:b.vy[r],facing:b.facing[r],target:predict(t),targetRadius:b.radius[t],
    radius:Math.max(b.radius[r],a.rawShieldActive[r]?b.shieldRadius[r]:0),range:profile.range,relativeBearing:profile.relativeBearing,ownPower,desired,
    acceleration:b.acceleration[r],deceleration:b.deceleration[r],strafeMultiplier:a.strafeMultiplier[r],maxTurnRate:b.maxTurnRate[r],maxSpeed:b.maxSpeed[r],
    guns:guns.map(m=>({x:w.relativeX[m],y:w.relativeY[m],range:w.effectiveRange[m],power:w.dps[m],fixed:!!a.fixedMount[m],
      halfArc:a.fixedMount[m]?0:a.authoredHalfArc[m],turretReach:a.positionTurnRate[m]*3,angle:w.angle[m],base:a.localBaseAngle[m]})),bodies,foes,lanes});
  const baseline=score(desired);result.clearFire=baseline.clearFire;
  if(baseline.blocked===0&&baseline.alliedLane===0&&baseline.danger<.4&&baseline.escape===0)return result;
  let rx=predict(t).x-b.x[r],ry=predict(t).y-b.y[r];const n=length(rx,ry);if(n>.00001){rx/=n;ry/=n;}
  const candidates:AIVelocity[]=[];
  for(const side of [1,-1])for(const amount of [.55,1])candidates.push(limit({x:desired.x+-ry*(side*b.maxSpeed[r]*amount),y:desired.y+rx*(side*b.maxSpeed[r]*amount)},b.maxSpeed[r]));
  candidates.push({x:desired.x*.5,y:desired.y*.5},{x:0,y:0});
  const minimum=length(b.x[r]-b.x[t],b.y[r]-b.y[t])>profile.range+8?Math.max(0,desired.x*rx+desired.y*ry)*.5:0;
  let best=baseline;
  for(const candidate of candidates){
    aiDomainWork.positionCandidates++;
    if(minimum>0&&candidate.x*rx+candidate.y*ry<minimum-1e-8)continue;
    const next=score(candidate);if(next.total>best.total+.12){
      best=next;result.velocity=candidate;result.adjusted=true;result.reason=baseline.blocked>0||baseline.alliedLane>0?'FIRE_LANE':'COVER';
      result.scoreGain=next.total-baseline.total;result.clearFire=next.clearFire;
    }
  }
  return result;
}
