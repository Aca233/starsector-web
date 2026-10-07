import { fleetColumnsFor, solveFleetColumns } from '../FleetColumnSolver';
import { fleetPolicy, type FleetPlan } from '../FleetTactics';
import type { TacticalOrder } from '../../simulation/CombatTypes';
import { BodyFlag as B, WeaponFlag as W } from './StageProtocol';
import { clamp, type AIStageView } from './AIInputs';
import { batteryRows } from './AIProfileSolver';
import { aiDomainWork } from './AIWork';

/** Numeric-to-numeric adaptation to the established fleet kernel. This replaces
 * publishReadiness: never constructs FleetUnit/Ship wrappers or calls getters. */
export function solveAIFleet(v:AIStageView,owner:object,orders:ReadonlyMap<string,TacticalOrder>,manual:ReadonlySet<string>):FleetPlan {
  const b=v.bodies,w=v.weapons,a=v.ai,rows:number[]=[];
  for(let i=0;i<v.bodyCount;i++)if(!(b.flags[i]&(B.DEAD|B.RETREATED|B.DOCKED))&&b.hp[i]>0&&!a.vastBulk[i])rows.push(i);
  const f=fleetColumnsFor(owner);
  aiDomainWork.fleetSolves++;aiDomainWork.fleetRows+=rows.length;
  if(!f.begin(rows.length))throw new Error('Reentrant numeric fleet solve');
  try {
    const local=new Map(rows.map((r,i)=>[r,i]));
    for(let i=0;i<rows.length;i++){
      const r=rows[i],battery=batteryRows(v,r),available:number[]=[];
      for(let m=b.weaponFirst[r],end=m+b.weaponCount[r];m<end;m++)if(!w.disabled[m]&&w.ammo[m]>=1&&w.dps[m]>0)available.push(m);
      const offensive=available.filter(m=>!(w.flags[m]&W.PD)),ranges=battery.map(m=>({range:w.effectiveRange[m],power:w.dps[m]})).sort((a,b)=>a.range-b.range);
      const batteryPower=ranges.reduce((sum,m)=>sum+m.power,0),offensePower=offensive.reduce((sum,m)=>sum+w.dps[m],0);
      let cumulative=0,range=0;for(const m of ranges){cumulative+=m.power;range=m.range;if(cumulative>=batteryPower/2)break;}
      const wingPower=a.wingPower[r],carrier=a.carrierRange[r],speed=b.maxSpeed[r];
      const role=carrier>0&&offensePower<wingPower*1.25?'CARRIER':!battery.length?'UNARMED':range>=fleetPolicy.artilleryRange?'ARTILLERY'
        :speed>=fleetPolicy.skirmisherSpeed?'SKIRMISHER':range<=fleetPolicy.closeRange?'BRAWLER':'LINE';
      const availability=a.retreating[r]||(b.flags[r]&(B.OVERLOADED|B.VENTING))?.15:1-clamp(b.fluxPercent[r],0,1)*.6;
      f.id[i]=a.ids[r];f.x[i]=b.x[r];f.y[i]=b.y[r];f.radius[i]=b.radius[r];f.teamId[i]=b.team[r];
      f.role[i]=role;f.range[i]=role==='CARRIER'?carrier:range;f.carrierRange[i]=carrier;f.speed[i]=speed;
      f.hull[i]=clamp(b.hp[r]/Math.max(1,b.maxHp[r]),0,1);
      f.power[i]=(offensePower+(offensive.length?0:batteryPower*.3)+wingPower)*availability;
      f.hullHp[i]=b.hp[r];f.maxHullHp[i]=b.maxHp[r];f.armor[i]=a.specArmor[r];f.flux[i]=b.fluxPercent[r];
      f.overloaded[i]=Number(!!(b.flags[r]&B.OVERLOADED));f.venting[i]=Number(!!(b.flags[r]&B.VENTING));
      f.shieldPhased[i]=a.shieldPhased[r];f.systemPhased[i]=a.systemPhased[r];f.collisionless[i]=Number(!!(b.flags[r]&B.COLLISIONLESS));
      f.retreating[i]=a.retreating[r];f.major[i]=Number(!(b.flags[r]&B.FIGHTER)&&!a.systemDrone[r]);f.isPlayer[i]=a.player[r];f.doNotBackOff[i]=a.doNotBackOff[r];
      f.previousTask[i]=a.previousTask[r];f.currentTargetId[i]=a.currentTargetId[r];
      const target=a.currentTargetId[r]?v.rowById.get(a.currentTargetId[r]!):undefined;f.currentTargetRow[i]=target===undefined?-1:local.get(target)??-1;
    }
    for(let i=0;i<rows.length;i++)if(f.major[i]&&!f.retreating[i]&&!f.visibleTeams.includes(f.teamId[i]))f.visibleTeams.push(f.teamId[i]);
    for(let t=0;t<f.visibleTeams.length;t++){
      const source=v.teams.indexOf(f.visibleTeams[t]);
      for(let i=0;i<rows.length;i++)f.visible[t*rows.length+i]=source<0?0:v.visibility[rows[i]*v.teams.length+source];
    }
    return solveFleetColumns(f,orders,manual);
  } finally {f.end();}
}
