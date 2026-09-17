import type { RoomOptions, Team } from './protocol';
import type { Design } from '../studio/DesignModel';
import { aiHullId, aiLoadout, pruneAiLoadouts } from './ai-loadouts.mjs';
export interface AiFleetGroup { key:string; loadoutKey:string; hull:string; name:string; design:Design|null; team:Team|null; count:number; }
export function groupAiFleet(options:RoomOptions):AiFleetGroup[] {
  const groups=new Map<string,AiFleetGroup>();
  options.aiHulls.forEach((hulls,team)=>{for(const loadoutKey of hulls){
    const key=(options.assignment==='solo'?'solo':team)+':'+loadoutKey;
    const group=groups.get(key);
    if(group)group.count++;
    else {const design=aiLoadout(options,loadoutKey);groups.set(key,{key,loadoutKey,hull:aiHullId(options,loadoutKey),name:design?.name??'建议配装',design:design??null,team:options.assignment==='solo'?null:team,count:1});}
  }});
  return [...groups.values()];
}
export function withoutAiGroup(options:RoomOptions,group:AiFleetGroup):RoomOptions {
  return pruneAiLoadouts({...options,aiHulls:options.aiHulls.map((hulls,team)=>group.team===null||group.team===team?hulls.filter(key=>key!==group.loadoutKey):hulls)});
}
