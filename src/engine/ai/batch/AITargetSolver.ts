import { BodyFlag as B } from './StageProtocol';
import { assertAIStage, length, visible, type AIStageView } from './AIInputs';
import { aiDomainWork } from './AIWork';

/** Numeric replacement for Engine/DecisionScene hostile preselection. Its
 * admission deliberately matches findCombatHostile (later CapitalAI validation
 * rejects retreated/docked contacts). Strict distance ties keep roster order. */
export function solveAIHostile(v:AIStageView,r:number,orderedId?:string):number {
  assertAIStage(v);
  aiDomainWork.targetSolves++;
  const b=v.bodies,a=v.ai,rTeam=b.team[r],rTeamIdx=v.teams.indexOf(rTeam),numTeams=v.teams.length,vis=v.visibility;
  if(rTeamIdx<0)return -1;
  const hostile=(i:number)=>i>=0&&!a.vastBulk[i]&&!(b.flags[i]&B.DEAD)&&b.team[i]!==rTeam&&vis[i*numTeams+rTeamIdx]!==0;
  const ordered=orderedId?v.rowById.get(orderedId)??-1:-1;if(hostile(ordered))return ordered;
  const current=a.currentTargetId[r]?v.rowById.get(a.currentTargetId[r]!)??-1:-1;if(hostile(current))return current;
  let main=-1,any=-1,mainDistance=0,anyDistance=0;
  const rx=b.x[r],ry=b.y[r];
  for(let i=0;i<v.bodyCount;i++){
    if(!hostile(i))continue;
    const d=length(rx-b.x[i],ry-b.y[i]);
    if(any<0||d<anyDistance){any=i;anyDistance=d;}
    if(!(b.flags[i]&B.FIGHTER)&&(main<0||d<mainDistance)){main=i;mainDistance=d;}
  }
  return main>=0?main:any;
}
