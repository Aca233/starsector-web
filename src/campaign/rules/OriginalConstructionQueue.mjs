/** ConstructionQueue / BaseIndustry.buildNextInQueue. Engine rules, not UI admission or charging. */
import {requireThat} from '../core/Values.mjs';
import {stat} from './OriginalIndustryState.mjs';
import {ORIGINAL_MILITARY_BASES} from './OriginalMilitaryBases.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_CONSTRUCTION_QUEUE',m);
const spec=id=>{const value=ORIGINAL_MILITARY_BASES.industrySpecs[id];check(value,'Actual construction industry spec required');return value;};
export function validateOriginalConstructionQueue(m){
 const q=Object.hasOwn(m,'constructionQueueState')?m.constructionQueueState:m.industryLifecycle?.queue;
 check(q&&typeof q.objectRef==='string'&&Array.isArray(q.items)&&q.items.length===m.constructionQueue.length,'Actual current construction queue required');
 if(m.industryLifecycle)check(m.industryLifecycle.queue===q,'Split current construction queue identity');
 q.items.forEach((item,i)=>check(typeof item.objectRef==='string'&&item.industryId===m.constructionQueue[i]&&Number.isInteger(item.cost)&&item.cost>=-2147483648&&item.cost<=2147483647,'Lost queue item, order or original int cost'));
 return q;
}
export function originalConstructionIndustryCount(m,runtime){
 let count=0;
 for(const e of m.industries){const d=spec(e.state.industryId);if(d.tags.includes('industry'))count++;
  else if(e.operating.building&&e.operating.upgradeId!==null&&d.upgradeId!==null){
   // Misc uses spec.upgrade, and instantiates even when it only needs isIndustry().
   const candidate=runtime.instantiate(d.upgradeId);if(spec(candidate.entry.state.industryId).tags.includes('industry'))count++;
  }
 }
 for(const item of validateOriginalConstructionQueue(m).items)if(spec(item.industryId).tags.includes('industry'))count++;
 return count;
}
export function buildNextOriginalConstructionQueue(m,runtime){
 const queue=validateOriginalConstructionQueue(m);
 while(queue.items.length){
  const item=queue.items.shift();m.constructionQueue.shift();
  const candidate=runtime.instantiate(item.industryId),count=originalConstructionIndustryCount(m,runtime),max=Math.floor(stat({base:0,modifiers:m.maxIndustries})+0.5);
  if(!runtime.isAvailable(candidate)||!(count<=max||!spec(item.industryId).tags.includes('industry'))){
   if(m.playerOwned){runtime.refundCredits(item.cost);runtime.message(candidate,'cancelled',item.cost);}continue;
  }
  // Market.addIndustry either reuses an existing object or constructs and applies a second object.
  const row=runtime.add(item.industryId);runtime.startBuilding(row);row.buildCostOverride=Math.fround(item.cost);
  if(m.playerOwned)runtime.message(row,'started',null);return row.objectRef;
 }
 return null;
}
/** First matching ID only, retaining item identity and cost. Removing here is not a player refund command. */
export function editOriginalConstructionQueue(m,id,action){
 check(['up','down','front','back','remove'].includes(action),'Unknown queue edit');
 const q=validateOriginalConstructionQueue(m),i=q.items.findIndex(item=>item.industryId===id);if(i<0)return;
 const [item]=q.items.splice(i,1);m.constructionQueue.splice(i,1);if(action==='remove')return;
 const next=action==='front'?0:action==='back'?q.items.length:action==='up'?Math.max(0,i-1):Math.min(q.items.length,i+1);
 q.items.splice(next,0,item);m.constructionQueue.splice(next,0,item.industryId);
}
