import { signedAngle } from '../../math/Angles';
import { selectThreatFacing } from '../ShieldThreatSector';
import type { ThreatAssessment, IncomingThreat } from '../ThreatAssessment';
import { BodyFlag as B, WeaponFlag as W, ProjectileFlag as P } from './StageProtocol';
import { assertAIStage, circleEntry, length, type AIStageView } from './AIInputs';
import { aiDomainWork } from './AIWork';

/** Complete trajectories + guided pursuit + crossing beams + hostile follow-up
 * weapons. No calls to assessThreats, envelope/frame, or authority getters. */
interface StageThreatIndex {
  epoch: number;
  revision: number;
  projectileCount: number;
  beamCount: number;
  bodyCount: number;
  weaponCount: number;
  validProjectileRows: Int32Array;
  validProjectileTeams: Float64Array;
  validProjectileCount: number;
  validBeamRows: Int32Array;
  validBeamCount: number;
  shipRecovery: Float64Array;
  shipActiveWeaponFirst: Int32Array;
  shipArmedCount: Int32Array;
  activeWeaponRows: Int32Array;
  weaponCanBound: Uint8Array;
  shipCanBoundAll: Uint8Array;
  shipMinReadiness: Float64Array;
  shipMinReachX: Float64Array;
  shipMaxReachX: Float64Array;
  shipMinReachY: Float64Array;
  shipMaxReachY: Float64Array;
  shipTeams: Float64Array;
}

const threatIndices = new WeakMap<object, StageThreatIndex>();
const emptyThreats: IncomingThreat[] = [];
let imminentWeightsScratch = new Float64Array(128);
let imminentDirectionsScratch = new Float64Array(128);
let imminentFluxScratch = new Float64Array(128);
let imminentEtaScratch = new Float64Array(128);

function getThreatIndex(v: AIStageView): StageThreatIndex {
  let idx = threatIndices.get(v.bodies);
  if (idx && idx.epoch === v.epoch && idx.revision === v.revision
    && idx.projectileCount === v.projectileCount && idx.beamCount === v.beamCount
    && idx.bodyCount === v.bodyCount && idx.weaponCount === v.weaponCount) {
    return idx;
  }
  const pc = v.projectileCount, bc = v.beamCount, sc = v.bodyCount, wc = v.weaponCount;
  if (!idx) {
    idx = {
      epoch: -1, revision: -1, projectileCount: 0, beamCount: 0, bodyCount: 0, weaponCount: 0,
      validProjectileRows: new Int32Array(Math.max(pc, 256)),
      validProjectileTeams: new Float64Array(Math.max(pc, 256)),
      validProjectileCount: 0,
      validBeamRows: new Int32Array(Math.max(bc, 64)),
      validBeamCount: 0,
      shipRecovery: new Float64Array(Math.max(sc, 128)),
      shipActiveWeaponFirst: new Int32Array(Math.max(sc, 128)),
      shipArmedCount: new Int32Array(Math.max(sc, 128)),
      activeWeaponRows: new Int32Array(Math.max(wc, 512)),
      weaponCanBound: new Uint8Array(Math.max(wc, 512)),
      shipCanBoundAll: new Uint8Array(Math.max(sc, 128)),
      shipMinReadiness: new Float64Array(Math.max(sc, 128)),
      shipMinReachX: new Float64Array(Math.max(sc, 128)),
      shipMaxReachX: new Float64Array(Math.max(sc, 128)),
      shipMinReachY: new Float64Array(Math.max(sc, 128)),
      shipMaxReachY: new Float64Array(Math.max(sc, 128)),
      shipTeams: new Float64Array(Math.max(sc, 128)),
    };
    threatIndices.set(v.bodies, idx);
  } else {
    if (idx.validProjectileRows.length < pc) {
      const cap = Math.max(pc, idx.validProjectileRows.length * 2);
      idx.validProjectileRows = new Int32Array(cap);
      idx.validProjectileTeams = new Float64Array(cap);
    }
    if (idx.validBeamRows.length < bc) {
      idx.validBeamRows = new Int32Array(Math.max(bc, idx.validBeamRows.length * 2));
    }
    if (idx.shipRecovery.length < sc) {
      const cap = Math.max(sc, idx.shipRecovery.length * 2);
      idx.shipRecovery = new Float64Array(cap);
      idx.shipActiveWeaponFirst = new Int32Array(cap);
      idx.shipArmedCount = new Int32Array(cap);
      idx.shipCanBoundAll = new Uint8Array(cap);
      idx.shipMinReadiness = new Float64Array(cap);
      idx.shipMinReachX = new Float64Array(cap);
      idx.shipMaxReachX = new Float64Array(cap);
      idx.shipMinReachY = new Float64Array(cap);
      idx.shipMaxReachY = new Float64Array(cap);
      idx.shipTeams = new Float64Array(cap);
    }
    if (idx.activeWeaponRows.length < wc) {
      const cap = Math.max(wc, idx.activeWeaponRows.length * 2);
      idx.activeWeaponRows = new Int32Array(cap);
      idx.weaponCanBound = new Uint8Array(cap);
    }
  }
  const b = v.bodies, w = v.weapons, p = v.projectiles, a = v.ai, be = v.beams;
  let sameEpochTeams = idx.epoch === v.epoch && idx.projectileCount === pc && idx.bodyCount === sc;
  if (sameEpochTeams) {
    for (let s = 0; s < sc; s++) {
      if (!Object.is(idx.shipTeams[s], b.team[s])) { sameEpochTeams = false; break; }
    }
  }
  if (!sameEpochTeams) {
    for (let s = 0; s < sc; s++) idx.shipTeams[s] = b.team[s];
    let vp = 0;
    for (let i = 0; i < pc; i++) {
      const owner = Number.isNaN(p.team[i]) ? (p.sourceRow[i] >= 0 ? b.team[p.sourceRow[i]] : NaN) : p.team[i];
      if (Number.isNaN(owner) || (p.flags[i] & (P.FLARE | P.DISARMED | P.NO_COLLISION))
        || a.projectileDidDamage[i] || !(p.damage[i] > 0) || !(p.remainingLife[i] > 0)) continue;
      idx.validProjectileRows[vp] = i;
      idx.validProjectileTeams[vp] = owner;
      vp++;
    }
    idx.validProjectileCount = vp;
  }
  let vb = 0;
  for (let i = 0; i < bc; i++) {
    const s = be.sourceRow[i];
    if (s < 0 || (b.flags[s] & B.DEAD) || !be.damageActive[i] || be.duration[i] <= 0) continue;
    idx.validBeamRows[vb++] = i;
  }
  idx.validBeamCount = vb;
  let aw = 0;
  for (let s = 0; s < sc; s++) {
    idx.shipRecovery[s] = Math.max(
      b.flags[s] & B.OVERLOADED ? b.overloadTimer[s] : 0,
      b.flags[s] & B.VENTING ? b.ventTime[s] : 0,
      b.flags[s] & B.PHASED ? b.phaseDownDuration[s] : 0,
      b.systemRecovery[s]
    );
    idx.shipActiveWeaponFirst[s] = aw;
    let armed = 0, canBoundAll = 1, minReady = Infinity;
    let minRX = Infinity, maxRX = -Infinity, minRY = Infinity, maxRY = -Infinity;
    for (let m = b.weaponFirst[s], end = m + b.weaponCount[s]; m < end; m++) {
      if (w.disabled[m] || w.ammo[m] < 1 || w.dps[m] <= 0) continue;
      idx.activeWeaponRows[aw++] = m;
      armed++;
      const effRange = w.effectiveRange[m], wMaxSpd = w.maxSpeed[m], ready = w.readiness[m];
      const mx = w.muzzleX[m], my = w.muzzleY[m];
      const canBound = Number.isFinite(effRange) && Number.isFinite(wMaxSpd);
      idx.weaponCanBound[m] = canBound ? 1 : 0;
      if (canBound && Number.isFinite(mx) && Number.isFinite(my)) {
        if (ready < minReady) minReady = ready;
        if (mx - effRange < minRX) minRX = mx - effRange;
        if (mx + effRange > maxRX) maxRX = mx + effRange;
        if (my - effRange < minRY) minRY = my - effRange;
        if (my + effRange > maxRY) maxRY = my + effRange;
      } else {
        canBoundAll = 0;
        minReady = -Infinity;
      }
    }
    idx.shipArmedCount[s] = armed;
    idx.shipCanBoundAll[s] = canBoundAll;
    idx.shipMinReadiness[s] = minReady;
    idx.shipMinReachX[s] = minRX;
    idx.shipMaxReachX[s] = maxRX;
    idx.shipMinReachY[s] = minRY;
    idx.shipMaxReachY[s] = maxRY;
  }
  idx.epoch = v.epoch;
  idx.revision = v.revision;
  idx.projectileCount = pc;
  idx.beamCount = bc;
  idx.bodyCount = sc;
  idx.weaponCount = wc;
  return idx;
}

/** Complete trajectories + guided pursuit + crossing beams + hostile follow-up
 * weapons. No calls to assessThreats, envelope/frame, or authority getters. */
export function solveAIThreat(v:AIStageView,r:number,horizon:number,window:number,weaponHorizon=horizon,weaponFrameEligible=false,skipThreatList=false):ThreatAssessment {
  assertAIStage(v);
  const b=v.bodies,w=v.weapons,p=v.projectiles,a=v.ai,be=v.beams;
  const idx = getThreatIndex(v);
  aiDomainWork.threatSolves++;aiDomainWork.projectileRows+=v.projectileCount;aiDomainWork.beamRows+=v.beamCount;
  if(weaponHorizon>window)aiDomainWork.fullForecastSolves++;else aiDomainWork.nearThreatSolves++;
  const threats:IncomingThreat[] = skipThreatList ? emptyThreats : [];
  const cx=b.shieldX[r],cy=b.shieldY[r],radius=Math.max(b.radius[r],b.shieldType[r]===1||b.shieldType[r]===2?b.shieldRadius[r]:0);
  const shieldEff = b.shieldEfficiency[r], shieldDmgMult = b.shieldDamageMultiplier[r], shieldEnergyMult = b.shieldEnergyMultiplier[r];
  let hasAnyThreat = false, farWeaponEarliest = Infinity, earliest = Infinity;
  let imminentDamage = 0, imminentShieldFlux = 0, actualDamage = 0, immLen = 0;
  const add=(kind:IncomingThreat['kind'],sourceId:string,eta:number,damage:number,type:number,x:number,y:number)=>{
    if(!(eta>=0&&eta<=(kind==='WEAPON'?weaponHorizon:horizon)&&damage>0)||!Number.isFinite(damage))return;
    hasAnyThreat = true;
    if (eta < earliest) earliest = eta;
    if (eta <= window) {
      const base=type===0?2:type===1?.5:type===3?.25:1;
      const multiplier=shieldDmgMult*(type===2?shieldEnergyMult:1);
      const shieldFlux = damage*base*shieldEff*multiplier;
      const direction = Math.atan2(y-cy,x-cx);
      imminentDamage += damage;
      imminentShieldFlux += shieldFlux;
      if (kind !== 'WEAPON') actualDamage += damage;
      if (immLen >= imminentWeightsScratch.length) {
        const nextCap = imminentWeightsScratch.length * 2;
        const nw = new Float64Array(nextCap); nw.set(imminentWeightsScratch); imminentWeightsScratch = nw;
        const nd = new Float64Array(nextCap); nd.set(imminentDirectionsScratch); imminentDirectionsScratch = nd;
        const nf = new Float64Array(nextCap); nf.set(imminentFluxScratch); imminentFluxScratch = nf;
        const ne = new Float64Array(nextCap); ne.set(imminentEtaScratch); imminentEtaScratch = ne;
      }
      imminentWeightsScratch[immLen] = shieldFlux / (1 + eta);
      imminentDirectionsScratch[immLen] = direction;
      imminentFluxScratch[immLen] = shieldFlux;
      imminentEtaScratch[immLen] = eta;
      immLen++;
      if (!skipThreatList) threats.push({kind,sourceId,eta,damage,shieldFlux,direction});
    } else {
      if (kind === 'WEAPON' && eta < farWeaponEarliest) farWeaponEarliest = eta;
      if (!skipThreatList) {
        const base=type===0?2:type===1?.5:type===3?.25:1;
        const multiplier=shieldDmgMult*(type===2?shieldEnergyMult:1);
        threats.push({kind,sourceId,eta,damage,shieldFlux:damage*base*shieldEff*multiplier,direction:Math.atan2(y-cy,x-cx)});
      }
    }
  };
  const rTeam=b.team[r],rvx=b.vx[r],rvy=b.vy[r];
  const vpRows = idx.validProjectileRows, vpTeams = idx.validProjectileTeams, vpCount = idx.validProjectileCount;
  for(let k=0;k<vpCount;k++){
    if(vpTeams[k]===rTeam)continue;
    const i=vpRows[k];
    const life=Math.min(horizon,p.remainingLife[i]);if(!(life>0))continue;
    const px=p.x[i],py=p.y[i],ex=px+(p.vx[i]-rvx)*life,ey=py+(p.vy[i]-rvy)*life;
    const cr=radius+p.radius[i]+a.projectileFuse[i],crPad=cr+1e-6;
    const guidedToMe=(p.flags[i]&P.GUIDED)!==0&&p.targetRow[i]===r;
    const inBox=!(px<cx-crPad&&ex<cx-crPad)&&!(px>cx+crPad&&ex>cx+crPad)&&!(py<cy-crPad&&ey<cy-crPad)&&!(py>cy+crPad&&ey>cy+crPad);
    if(!inBox&&!guidedToMe)continue;
    const t=inBox?circleEntry(px,py,ex,ey,cx,cy,cr):null;
    let eta=t===null?Infinity:t*life;
    if(guidedToMe){
      const dx=cx-px,dy=cy-py,error=Math.abs(signedAngle(Math.atan2(dy,dx)-p.facing[i]));
      const pursuit=Math.max(0,length(dx,dy)-cr)/Math.max(1,a.projectileMaxSpeed[i])+error/Math.max(.001,a.projectileTurnRate[i]);
      if(pursuit<=life)eta=Math.min(eta,pursuit);
    }
    if(eta<=horizon)add('PROJECTILE',skipThreatList?'':a.projectileSourceId[i],eta,p.damage[i],p.damageType[i],px,py);
  }
  let active:Set<number>|undefined;
  const vbRows = idx.validBeamRows, vbCount = idx.validBeamCount;
  for(let k=0;k<vbCount;k++){
    const i=vbRows[k],s=be.sourceRow[i];
    if(b.team[s]===rTeam)continue;
    if(circleEntry(be.startX[i],be.startY[i],be.endX[i],be.endY[i],cx,cy,radius)===null)continue;
    if(be.mountRow[i]>=0)(active??=new Set()).add(be.mountRow[i]);
    add('BEAM',skipThreatList?'':a.ids[s],0,be.dps[i]*Math.min(window,be.duration[i]),be.damageType[i],be.startX[i],be.startY[i]);
  }
  const rTeamIdx=v.teams.indexOf(rTeam),numTeams=v.teams.length,vis=v.visibility;
  const finiteHorizon=Number.isFinite(weaponHorizon)&&weaponHorizon>=0;
  const awRows = idx.activeWeaponRows, wCanBound = idx.weaponCanBound;
  for(let s=0;s<v.bodyCount;s++){
    if(s===r||(b.flags[s]&(weaponFrameEligible?B.DEAD|B.RETREATED|B.DOCKED:B.DEAD))||b.team[s]===rTeam||rTeamIdx<0||vis[s*numTeams+rTeamIdx]===0)continue;
    const effW = skipThreatList ? Math.min(weaponHorizon, Math.max(window, farWeaponEarliest)) : weaponHorizon;
    const recovery=idx.shipRecovery[s];
    if(recovery>effW)continue;
    aiDomainWork.weaponRows+=b.weaponCount[s];
    const armedCount = idx.shipArmedCount[s];
    if(armedCount===0||idx.shipMinReadiness[s]>effW)continue;
    const dvx=b.vx[s]-rvx,dvy=b.vy[s]-rvy,maxSpd=b.maxSpeed[s],maxTurn=Math.max(.001,b.maxTurnRate[s]);
    const maxClosingReach=finiteHorizon?radius+effW*Math.max(1,maxSpd+Math.abs(dvx)+Math.abs(dvy))*1.000001:Infinity;
    if(finiteHorizon&&idx.shipCanBoundAll[s]&&(cx-maxClosingReach>idx.shipMaxReachX[s]||cx+maxClosingReach<idx.shipMinReachX[s]||cy-maxClosingReach>idx.shipMaxReachY[s]||cy+maxClosingReach<idx.shipMinReachY[s]))continue;
    for(let awIdx=idx.shipActiveWeaponFirst[s],awEnd=awIdx+armedCount;awIdx<awEnd;awIdx++){
      const m=awRows[awIdx];
      if(active!==undefined&&active.has(m))continue;
      const effWM = skipThreatList ? Math.min(weaponHorizon, Math.max(window, farWeaponEarliest)) : weaponHorizon;
      const effRange=w.effectiveRange[m],wMaxSpd=w.maxSpeed[m],canBound=wCanBound[m]!==0;
      if(w.readiness[m]>effWM&&canBound)continue;
      const dx=cx-w.muzzleX[m],dy=cy-w.muzzleY[m];
      const canBoundTravel=weaponFrameEligible||canBound;
      if(finiteHorizon&&(Math.abs(dx)>maxClosingReach+effRange||Math.abs(dy)>maxClosingReach+effRange)&&canBoundTravel)continue;
      const minDist=Math.max(Math.abs(dx),Math.abs(dy))-radius;
      if(finiteHorizon&&canBoundTravel&&!(w.flags[m]&W.BEAM)&&minDist>0){
        const minTravel=Math.min(effRange,minDist)/Math.max(1,wMaxSpd);
        if(Math.max(recovery,w.readiness[m])+minTravel*(1-1e-12)>effWM)continue;
      }
      // Legacy frame/kernel and live Vector2.length have distinct rounding.
      // Only owner-qualified plan observers use the kernel's Math.hypot.
      const distance=weaponFrameEligible?Math.hypot(dx,dy):length(dx,dy);
      const ux=distance>.00001?dx/distance:dx,uy=distance>.00001?dy/distance:dy;
      const closing=Math.max(0,dvx*ux+dvy*uy);
      const approach=Math.max(0,distance-radius-effRange)/Math.max(1,maxSpd+closing);
      if(approach>effWM&&canBoundTravel)continue;
      const frameTravel=canBoundTravel?(w.flags[m]&W.BEAM?0:Math.max(0,Math.min(effRange,distance-radius))/Math.max(1,wMaxSpd)):undefined;
      if(frameTravel!==undefined&&Math.max(recovery,w.readiness[m],approach)+frameTravel>effWM)continue;
      const travel=frameTravel??(w.flags[m]&W.BEAM?0:Math.max(0,Math.min(effRange,distance-radius))/Math.max(1,wMaxSpd));
      let turnTime=0;
      if(!((w.flags[m]&W.GUIDED)&&(w.flags[m]&W.ALWAYS_FIRE))){
        const heading=Math.atan2(dy,dx),turn=Math.abs(signedAngle(heading-w.baseAngle[m]));
        const halfArc=a.fixedMount[m]?0:a.authoredHalfArc[m];
        const hullTurn=(turn<=halfArc&&radius>=0)?0:Math.max(0,turn-halfArc-Math.asin(Math.min(1,radius/Math.max(1,distance))))/maxTurn;
        if(canBoundTravel&&hullTurn+travel>effWM)continue;
        const turret=halfArc>0?Math.abs(signedAngle(heading-w.angle[m]))/Math.max(.001,w.turnRate[m]):0;
        turnTime=Math.max(hullTurn,turret);
      }
      const eta=Math.max(recovery,w.readiness[m],turnTime,approach)+travel;
      if(!(eta>=0&&eta<=effWM))continue;
      const count=Math.min(w.ammo[m],Math.max(1,w.burstSize[m]));
      const damage=w.flags[m]&W.BEAM?w.dps[m]*Math.min(window,w.beamDuration[m]):w.damage[m]*count;
      add('WEAPON',skipThreatList?'':a.ids[s],eta,damage,w.damageType[m],w.muzzleX[m],w.muzzleY[m]);
    }
  }
  let facing:number|null=null,best=-1;
  if(immLen>=128){
    const imminent = skipThreatList
      ? Array.from({ length: immLen }, (_, i) => ({ shieldFlux: imminentFluxScratch[i], eta: imminentEtaScratch[i], direction: imminentDirectionsScratch[i] }))
      : threats.filter(t=>t.eta<=window);
    facing=selectThreatFacing(imminent,a.shieldThreatHalfArc[r]);
  } else if(immLen>0){
    const weights = imminentWeightsScratch, dirs = imminentDirectionsScratch;
    const half=a.shieldThreatHalfArc[r];
    for(let cIdx=0;cIdx<immLen;cIdx++){
      const candDir = dirs[cIdx];
      let weight=0;
      for(let i=0;i<immLen;i++){
        const difference=dirs[i]-candDir,absolute=Math.abs(difference);
        const separation=absolute<=Math.PI?absolute:Math.PI*2-absolute;
        const covered=absolute<=Math.PI*2&&Math.abs(separation-half)>1e-12?separation<=half:Math.abs(signedAngle(difference))<=half;
        if(covered)weight+=weights[i];
      }
      if(weight>best){best=weight;facing=candDir;}
    }
  }
  return {threats,hasAnyThreat,farWeaponEarliest,horizon,imminentDamage,imminentShieldFlux,actualDamage,earliest,facing};
}
