import { signedAngle } from '../../math/Angles';
import { interceptTimeComponents } from '../FireControlGeometry';
import type { CombatProfile } from '../ShipCombatProfile';
import { fleetPolicy, type FleetAssignment } from '../FleetTactics';
import { policyAction, POLICY_ACTIONS, POLICY_TUNING, validateCombatPolicy } from '../learning/CombatPolicy';
import bundledPolicy from '../learning/combat-policy.json';
import { BodyFlag as B, WeaponFlag as W } from './StageProtocol';
import { assertAIStage, clamp, length, visible, type AIStageView } from './AIInputs';
import { aiDomainWork } from './AIWork';

export function batteryRows(v:AIStageView,r:number,sustained=true):number[] {
  const b=v.bodies,w=v.weapons,start=b.weaponFirst[r],end=start+b.weaponCount[r];
  let hasOffense=false,hasSteady=false;
  for(let m=start;m<end;m++)if(!w.disabled[m]&&w.ammo[m]>=1&&w.dps[m]>0&&!(w.flags[m]&W.PD)){
    hasOffense=true;if(sustained&&!(w.flags[m]&W.MISSILE)&&!(w.hintMask[m]&8)){hasSteady=true;break;}
  }
  const rows:number[]=[];
  for(let m=start;m<end;m++){
    if(w.disabled[m]||!(w.ammo[m]>=1)||!(w.dps[m]>0))continue;
    if(hasOffense&&(w.flags[m]&W.PD))continue;
    if(hasSteady&&((w.flags[m]&W.MISSILE)||(w.hintMask[m]&8)))continue;
    rows.push(m);
  }
  return rows;
}
export function attackOpportunity(v:AIStageView,r:number,t:number,pressure=1):boolean {
  const b=v.bodies;
  if(b.fluxPercent[r]>.7||b.hp[r]/Math.max(1,b.maxHp[r])<fleetPolicy.lowHull||pressure>fleetPolicy.regroupPressure||(b.flags[t]&B.COLLISIONLESS))return false;
  return !!(b.flags[t]&(B.OVERLOADED|B.VENTING))||b.hp[t]/Math.max(1,b.maxHp[t])<.3
    ||b.fluxPercent[t]>=.75&&b.fluxPercent[t]-b.fluxPercent[r]>=.2;
}
function learningRange(v:AIStageView,r:number,t:number):number {
  const b=v.bodies,a=v.ai,override=a.trainingAction[r];
  if(b.flags[r]&B.MANUAL)return 1;
  if(override>=0)return POLICY_TUNING[POLICY_ACTIONS[override]??'BALANCED'].range;
  if(!bundledPolicy.enabled||!validateCombatPolicy(bundledPolicy))return 1;
  if(![b.fluxPercent[r],b.hp[r],b.maxHp[r],b.fluxPercent[t],a.specSpeed[r],a.specSpeed[t],b.hp[t],b.maxHp[t]].every(Number.isFinite)
    ||b.maxHp[r]<=0||b.maxHp[t]<=0)return 1;
  let friends=0,enemies=0;
  for(let i=0;i<v.bodyCount;i++){
    if((b.flags[i]&(B.DEAD|B.RETREATED|B.DOCKED))||!visible(v,i,r))continue;
    const weight=[0,1,2,4,8][b.size[i]]??0;if(!weight||!Number.isFinite(b.hp[i]/b.maxHp[i]))continue;
    const influence=weight*Math.max(.2,Math.min(1,b.hp[i]/b.maxHp[i]))/(1+length(b.x[r]-b.x[i],b.y[r]-b.y[i])/1000);
    if(b.team[i]===b.team[r])friends+=influence;else enemies+=influence;
  }
  const flux=b.fluxPercent[r]>=.75?2:b.fluxPercent[r]>=.45?1:0,hull=b.hp[r]/b.maxHp[r]<.4?1:0;
  const window=b.flags[t]&(B.OVERLOADED|B.VENTING)?2:b.fluxPercent[t]>=.7?1:0;
  const speed=a.specSpeed[r]/Math.max(1,a.specSpeed[t]),mobility=speed<.8?0:speed>1.25?2:1;
  const weak=b.hp[t]/b.maxHp[t]<.4?1:0,ratio=enemies/Math.max(.1,friends),pressure=ratio<.65?0:ratio>1.35?2:1;
  return POLICY_TUNING[policyAction(bundledPolicy,((((flux*2+hull)*3+window)*3+mobility)*2+weak)*3+pressure)].range;
}
export function engagementRange(v:AIStageView,r:number,t:number,gunRange:number,assignment?:FleetAssignment):number {
  const b=v.bodies,clearance=b.radius[r]+b.radius[t]+8;
  if(assignment?.role==='CARRIER')return Math.max(clearance,assignment.carrierRange);
  const role=assignment?.role,pressure=role==='BRAWLER'?.70:role==='SKIRMISHER'?.80:role==='ARTILLERY'?.92:.84;
  const reserve=Math.max(clamp((b.fluxPercent[r]-.65)/.25,0,1),clamp((.4-b.hp[r]/Math.max(1,b.maxHp[r]))/.25,0,1));
  const fraction=(pressure+(1-pressure)*reserve)*(attackOpportunity(v,r,t,assignment?.pressureRatio)?.72:1);
  let residual=learningRange(v,r,t);if(reserve>.4||role==='ARTILLERY')residual=Math.max(1,residual);
  return clearance+Math.max(0,gunRange-clearance)*Math.min(1.12,fraction*residual);
}
export function solveAIProfile(v:AIStageView,r:number,t:number,assignment?:FleetAssignment):CombatProfile {
  assertAIStage(v);
  aiDomainWork.profileSolves++;
  if(t<0)return {range:0,relativeBearing:0,firepower:0,weapons:0};
  const b=v.bodies,w=v.weapons,mounts=batteryRows(v,r),radius=b.radius[t];
  const distance=Math.max(1,length(b.x[r]-b.x[t],b.y[r]-b.y[t]));
  const heading=Math.atan2(b.y[t]-b.y[r],b.x[t]-b.x[r]),current=signedAngle(heading-b.facing[r]);
  const n=mounts.length;
  if(!n)return {relativeBearing:current,range:engagementRange(v,r,t,b.radius[r]+radius+8,assignment),firepower:0,weapons:0};
  const boundaries=new Float64Array(n*2);
  const bearings:number[]=[current,0];
  const arcs=new Array<{m:number;weight:number;base:number;half:number}>(n);
  const tx=b.x[t],ty=b.y[t],vx=b.vx[t]-b.vx[r],vy=b.vy[t]-b.vy[r],rPlusT=b.radius[r]+radius;
  for(let i=0;i<n;i++){
    const m=mounts[i];
    let x=tx,y=ty;
    if(distance<=w.effectiveRange[m]*1.5+rPlusT){
      const px=x-w.muzzleX[m]+vx*v.ai.profileDelay[m],py=y-w.muzzleY[m]+vy*v.ai.profileDelay[m];
      const time=w.flags[m]&W.BEAM?0:interceptTimeComponents(px,py,vx,vy,w.speed[m]);
      if(time!==null){const ix=w.muzzleX[m]+px+vx*time,iy=w.muzzleY[m]+py+vy*time;if(Number.isFinite(ix)&&Number.isFinite(iy)){x=ix;y=iy;}}
    }
    const base=signedAngle(v.ai.localBaseAngle[m]-signedAngle(Math.atan2(y-w.muzzleY[m],x-w.muzzleX[m])-heading));
    const half=v.ai.fixedMount[m]?0:Math.min(Math.PI,v.ai.authoredHalfArc[m]);
    arcs[i]={m,weight:w.dps[m],base,half};
    bearings.push(base);
    boundaries[i*2]=signedAngle(base-half);
    boundaries[i*2+1]=signedAngle(base+half);
  }
  boundaries.sort();
  for(let i=0;i<boundaries.length;i++)bearings.push(boundaries[i]);
  for(let i=0;i<boundaries.length;i++)bearings.push(signedAngle((boundaries[i]+(i+1<boundaries.length?boundaries[i+1]:boundaries[0]+Math.PI*2))/2));
  let best=current,power=-1,alignment=Infinity,previous:number|undefined;
  for(let k=0;k<bearings.length;k++){
    const bearing=bearings[k];
    if(Object.is(bearing,previous))continue;previous=bearing;
    let score=0,offset=0;
    for(let i=0;i<n;i++){const a=arcs[i],error=Math.abs(signedAngle(bearing-a.base));if(error<=a.half+1e-8){score+=a.weight;offset+=a.weight*error;}}
    if(score>power+1e-6||Math.abs(score-power)<1e-6&&(offset<alignment-1e-6||Math.abs(offset-alignment)<1e-6&&Math.abs(signedAngle(bearing-current))<Math.abs(signedAngle(best-current)))){
      best=bearing;power=score;alignment=offset;
    }
  }
  const cosBest=Math.cos(best),sinBest=Math.sin(best);
  const ranges:{weight:number;range:number}[]=[];
  for(let i=0;i<n;i++){
    const a=arcs[i];
    if(Math.abs(signedAngle(best-a.base))<=a.half+1e-8){
      ranges.push({weight:a.weight,range:w.effectiveRange[a.m]*.9+w.relativeX[a.m]*cosBest+w.relativeY[a.m]*sinBest+radius});
    }
  }
  ranges.sort((a,b)=>a.range-b.range);
  let accumulated=0,range=ranges.length?ranges[ranges.length-1].range:distance;
  for(let i=0;i<ranges.length;i++){const entry=ranges[i];accumulated+=entry.weight;if(accumulated>=power*.5){range=entry.range;break;}}
  range=Math.max(rPlusT+8,range);
  return {relativeBearing:signedAngle(best),range:engagementRange(v,r,t,range,assignment),firepower:power,weapons:ranges.length};
}
