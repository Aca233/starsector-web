import { signedAngle } from '../../math/Angles';
import { selectThreatFacing } from '../ShieldThreatSector';
import type { ThreatAssessment, IncomingThreat } from '../ThreatAssessment';
import { BodyFlag as B, WeaponFlag as W, ProjectileFlag as P } from './StageProtocol';
import { circleEntry, length, visible, type AIStageView } from './AIInputs';
import { aiDomainWork } from './AIWork';

/** Complete trajectories + guided pursuit + crossing beams + hostile follow-up
 * weapons. No calls to assessThreats, envelope/frame, or authority getters. */
export function solveAIThreat(v:AIStageView,r:number,horizon:number,window:number,weaponHorizon=horizon,weaponFrameEligible=false):ThreatAssessment {
  const b=v.bodies,w=v.weapons,p=v.projectiles,a=v.ai,be=v.beams;
  aiDomainWork.threatSolves++;aiDomainWork.projectileRows+=v.projectileCount;aiDomainWork.beamRows+=v.beamCount;
  if(weaponHorizon>window)aiDomainWork.fullForecastSolves++;else aiDomainWork.nearThreatSolves++;
  const threats:IncomingThreat[]=[];
  const cx=b.shieldX[r],cy=b.shieldY[r],radius=Math.max(b.radius[r],b.shieldType[r]===1||b.shieldType[r]===2?b.shieldRadius[r]:0);
  const add=(kind:IncomingThreat['kind'],sourceId:string,eta:number,damage:number,type:number,x:number,y:number)=>{
    if(!(eta>=0&&eta<=(kind==='WEAPON'?weaponHorizon:horizon)&&damage>0)||!Number.isFinite(damage))return;
    const base=type===0?2:type===1?.5:type===3?.25:1;
    const multiplier=b.shieldDamageMultiplier[r]*(type===2?b.shieldEnergyMultiplier[r]:1);
    threats.push({kind,sourceId,eta,damage,shieldFlux:damage*base*b.shieldEfficiency[r]*multiplier,direction:Math.atan2(y-cy,x-cx)});
  };
  for(let i=0;i<v.projectileCount;i++){
    const owner=Number.isNaN(p.team[i])?(p.sourceRow[i]>=0?b.team[p.sourceRow[i]]:NaN):p.team[i];
    if(Number.isNaN(owner)||owner===b.team[r]||(p.flags[i]&(P.FLARE|P.DISARMED|P.NO_COLLISION))||a.projectileDidDamage[i]||!(p.damage[i]>0))continue;
    const life=Math.min(horizon,p.remainingLife[i]);if(!(life>0))continue;
    const ex=p.x[i]+(p.vx[i]-b.vx[r])*life,ey=p.y[i]+(p.vy[i]-b.vy[r])*life;
    const cr=radius+p.radius[i]+a.projectileFuse[i],t=circleEntry(p.x[i],p.y[i],ex,ey,cx,cy,cr);
    let eta=t===null?Infinity:t*life;
    if((p.flags[i]&P.GUIDED)&&p.targetRow[i]===r){
      const dx=cx-p.x[i],dy=cy-p.y[i],error=Math.abs(signedAngle(Math.atan2(dy,dx)-p.facing[i]));
      const pursuit=Math.max(0,length(dx,dy)-cr)/Math.max(1,a.projectileMaxSpeed[i])+error/Math.max(.001,a.projectileTurnRate[i]);
      if(pursuit<=life)eta=Math.min(eta,pursuit);
    }
    add('PROJECTILE',a.projectileSourceId[i],eta,p.damage[i],p.damageType[i],p.x[i],p.y[i]);
  }
  const active=new Set<number>();
  for(let i=0;i<v.beamCount;i++){
    const s=be.sourceRow[i];
    if(s<0||b.team[s]===b.team[r]||(b.flags[s]&B.DEAD)||!be.damageActive[i]||be.duration[i]<=0)continue;
    if(circleEntry(be.startX[i],be.startY[i],be.endX[i],be.endY[i],cx,cy,radius)===null)continue;
    if(be.mountRow[i]>=0)active.add(be.mountRow[i]);
    add('BEAM',a.ids[s],0,be.dps[i]*Math.min(window,be.duration[i]),be.damageType[i],be.startX[i],be.startY[i]);
  }
  for(let s=0;s<v.bodyCount;s++){
    if(s===r||(b.flags[s]&(weaponFrameEligible?B.DEAD|B.RETREATED|B.DOCKED:B.DEAD))||b.team[s]===b.team[r]||!visible(v,s,r))continue;
    const recovery=Math.max(b.flags[s]&B.OVERLOADED?b.overloadTimer[s]:0,b.flags[s]&B.VENTING?b.ventTime[s]:0,
      b.flags[s]&B.PHASED?b.phaseDownDuration[s]:0,b.systemRecovery[s]);
    if(recovery>weaponHorizon)continue;
    aiDomainWork.weaponRows+=b.weaponCount[s];
    for(let m=b.weaponFirst[s],end=m+b.weaponCount[s];m<end;m++){
      if(w.disabled[m]||w.ammo[m]<1||w.dps[m]<=0||active.has(m))continue;
      // Legacy frame/kernel and live Vector2.length have distinct rounding.
      // Only owner-qualified plan observers use the kernel's Math.hypot.
      const dx=cx-w.muzzleX[m],dy=cy-w.muzzleY[m],distance=weaponFrameEligible?Math.hypot(dx,dy):length(dx,dy);
      const ux=distance>.00001?dx/distance:dx,uy=distance>.00001?dy/distance:dy;
      const closing=Math.max(0,(b.vx[s]-b.vx[r])*ux+(b.vy[s]-b.vy[r])*uy);
      const approach=Math.max(0,distance-radius-w.effectiveRange[m])/Math.max(1,b.maxSpeed[s]+closing);
      if(!weaponFrameEligible&&approach>weaponHorizon)continue;
      const frameTravel=weaponFrameEligible?(w.flags[m]&W.BEAM?0:Math.max(0,Math.min(w.effectiveRange[m],distance-radius))/Math.max(1,w.maxSpeed[m])):undefined;
      if(frameTravel!==undefined&&Math.max(recovery,w.readiness[m],approach)+frameTravel>weaponHorizon)continue;
      const heading=Math.atan2(dy,dx),turn=Math.abs(signedAngle(heading-w.baseAngle[m]));
      const halfArc=a.fixedMount[m]?0:a.authoredHalfArc[m];
      const hullTurn=Math.max(0,turn-halfArc-Math.asin(Math.min(1,radius/Math.max(1,distance))))/Math.max(.001,b.maxTurnRate[s]);
      const turret=halfArc>0?Math.abs(signedAngle(heading-w.angle[m]))/Math.max(.001,w.turnRate[m]):0;
      const turnTime=(w.flags[m]&W.GUIDED)&&(w.flags[m]&W.ALWAYS_FIRE)?0:Math.max(hullTurn,turret);
      const travel=frameTravel??(w.flags[m]&W.BEAM?0:Math.max(0,Math.min(w.effectiveRange[m],distance-radius))/Math.max(1,w.maxSpeed[m]));
      const eta=Math.max(recovery,w.readiness[m],turnTime,approach)+travel;
      const count=Math.min(w.ammo[m],Math.max(1,w.burstSize[m]));
      const damage=w.flags[m]&W.BEAM?w.dps[m]*Math.min(window,w.beamDuration[m]):w.damage[m]*count;
      add('WEAPON',a.ids[s],eta,damage,w.damageType[m],w.muzzleX[m],w.muzzleY[m]);
    }
  }
  const imminent=threats.filter(t=>t.eta<=window);
  let facing:number|null=null,best=-1;
  if(imminent.length>=128)facing=selectThreatFacing(imminent,a.shieldThreatHalfArc[r]);
  else {
    const weights=imminent.map(t=>t.shieldFlux/(1+t.eta));
    for(const candidate of imminent){
      let weight=0;
      for(let i=0;i<imminent.length;i++){
        const difference=imminent[i].direction-candidate.direction,absolute=Math.abs(difference);
        const separation=absolute<=Math.PI?absolute:Math.PI*2-absolute,half=a.shieldThreatHalfArc[r];
        const covered=absolute<=Math.PI*2&&Math.abs(separation-half)>1e-12?separation<=half:Math.abs(signedAngle(difference))<=half;
        if(covered)weight+=weights[i];
      }
      if(weight>best){best=weight;facing=candidate.direction;}
    }
  }
  let imminentDamage=0,imminentShieldFlux=0,actualDamage=0,earliest=Infinity;
  for(const t of threats){earliest=Math.min(earliest,t.eta);if(t.eta<=window){imminentDamage+=t.damage;imminentShieldFlux+=t.shieldFlux;if(t.kind!=='WEAPON')actualDamage+=t.damage;}}
  return {threats,horizon,imminentDamage,imminentShieldFlux,actualDamage,earliest,facing};
}
