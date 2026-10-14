import { fleetColumnsFor, solveFleetColumns } from '../FleetColumnSolver';
import { fleetPolicy, type FleetPlan } from '../FleetTactics';
import type { TacticalOrder } from '../../simulation/CombatTypes';
import { BodyFlag as B, WeaponFlag as W } from './StageProtocol';
import { assertAIStage, clamp, type AIStageView } from './AIInputs';
import { aiDomainWork } from './AIWork';

const fleetScratchRanges: number[] = [];
const fleetScratchPowers: number[] = [];

/** Numeric-to-numeric adaptation to the established fleet kernel. This replaces
 * publishReadiness: never constructs FleetUnit/Ship wrappers or calls getters. */
export function solveAIFleet(v:AIStageView,owner:object,orders:ReadonlyMap<string,TacticalOrder>,manual:ReadonlySet<string>,onlyTeam?:number):FleetPlan {
  assertAIStage(v);
  const b=v.bodies,w=v.weapons,a=v.ai,rows:number[]=[];
  for(let i=0;i<v.bodyCount;i++)if(!(b.flags[i]&(B.DEAD|B.RETREATED|B.DOCKED))&&b.hp[i]>0&&!a.vastBulk[i])rows.push(i);
  const f=fleetColumnsFor(owner);
  aiDomainWork.fleetSolves++;aiDomainWork.fleetRows+=rows.length;
  if(!f.begin(rows.length))throw new Error('Reentrant numeric fleet solve');
  try {
    const identityRows=rows.length===v.bodyCount;
    const local=identityRows?undefined:new Map(rows.map((r,i)=>[r,i]));
    for(let i=0;i<rows.length;i++){
      const r=rows[i],start=b.weaponFirst[r],end=start+b.weaponCount[r];
      let offensePower=0,hasOffensive=false,hasSteady=false;
      for(let m=start;m<end;m++){
        if(!w.disabled[m]&&w.ammo[m]>=1&&w.dps[m]>0&&!(w.flags[m]&W.PD)){
          hasOffensive=true;offensePower+=w.dps[m];
          if(!(w.flags[m]&W.MISSILE)&&!(w.hintMask[m]&8))hasSteady=true;
        }
      }
      let batteryCount=0,batteryPower=0;
      for(let m=start;m<end;m++){
        if(w.disabled[m]||!(w.ammo[m]>=1)||!(w.dps[m]>0))continue;
        if(hasOffensive&&(w.flags[m]&W.PD))continue;
        if(hasSteady&&((w.flags[m]&W.MISSILE)||(w.hintMask[m]&8)))continue;
        const dps=w.dps[m],er=w.effectiveRange[m];
        batteryPower+=dps;
        let ins=batteryCount++;
        while(ins>0&&fleetScratchRanges[ins-1]>er){
          fleetScratchRanges[ins]=fleetScratchRanges[ins-1];
          fleetScratchPowers[ins]=fleetScratchPowers[ins-1];
          ins--;
        }
        fleetScratchRanges[ins]=er;
        fleetScratchPowers[ins]=dps;
      }
      let cumulative=0,range=0;
      for(let k=0;k<batteryCount;k++){
        cumulative+=fleetScratchPowers[k];range=fleetScratchRanges[k];
        if(cumulative>=batteryPower/2)break;
      }
      const wingPower=a.wingPower[r],carrier=a.carrierRange[r],speed=b.maxSpeed[r];
      const role=carrier>0&&offensePower<wingPower*1.25?'CARRIER':!batteryCount?'UNARMED':range>=fleetPolicy.artilleryRange?'ARTILLERY'
        :speed>=fleetPolicy.skirmisherSpeed?'SKIRMISHER':range<=fleetPolicy.closeRange?'BRAWLER':'LINE';
      const availability=a.retreating[r]||(b.flags[r]&(B.OVERLOADED|B.VENTING))?.15:1-clamp(b.fluxPercent[r],0,1)*.6;
      f.id[i]=a.ids[r];f.x[i]=b.x[r];f.y[i]=b.y[r];f.radius[i]=b.radius[r];f.teamId[i]=b.team[r];
      f.role[i]=role;f.range[i]=role==='CARRIER'?carrier:range;f.carrierRange[i]=carrier;f.speed[i]=speed;
      f.hull[i]=clamp(b.hp[r]/Math.max(1,b.maxHp[r]),0,1);
      f.power[i]=(offensePower+(hasOffensive?0:batteryPower*.3)+wingPower)*availability;
      f.hullHp[i]=b.hp[r];f.maxHullHp[i]=b.maxHp[r];f.armor[i]=a.specArmor[r];f.flux[i]=b.fluxPercent[r];
      f.overloaded[i]=Number(!!(b.flags[r]&B.OVERLOADED));f.venting[i]=Number(!!(b.flags[r]&B.VENTING));
      f.shieldPhased[i]=a.shieldPhased[r];f.systemPhased[i]=a.systemPhased[r];f.collisionless[i]=Number(!!(b.flags[r]&B.COLLISIONLESS));
      f.retreating[i]=a.retreating[r];f.major[i]=Number(!(b.flags[r]&B.FIGHTER)&&!a.systemDrone[r]);f.isPlayer[i]=a.player[r];f.doNotBackOff[i]=a.doNotBackOff[r];
      f.previousTask[i]=a.previousTask[r];f.currentTargetId[i]=a.currentTargetId[r];
      const target=a.currentTargetId[r]?v.rowById.get(a.currentTargetId[r]!):undefined;f.currentTargetRow[i]=target===undefined?-1:identityRows?target:local!.get(target)??-1;
    }
    for(let i=0;i<rows.length;i++)if(f.major[i]&&!f.retreating[i]&&!f.visibleTeams.includes(f.teamId[i]))f.visibleTeams.push(f.teamId[i]);
    for(let t=0;t<f.visibleTeams.length;t++){
      const source=v.teams.indexOf(f.visibleTeams[t]);
      for(let i=0;i<rows.length;i++)f.visible[t*rows.length+i]=source<0?0:v.visibility[rows[i]*v.teams.length+source];
    }
    return solveFleetColumns(f,orders,manual,onlyTeam);
  } finally {f.end();}
}
