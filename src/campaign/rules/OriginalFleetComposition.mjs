/** FleetFactoryV3 roster phase (213–353, 416–648, 1130–1475), NOT complete createFleet.
 * Members remain actual runtime objects. Missing creation/naming/mutation services fail;
 * no variant-only stand-in fleets or delayed/batched naming are supplied here.
 */
import raw from '../data/reference-fleet-composition.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
import {originalJavaNextFloat,originalJavaNextInt,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
export const ORIGINAL_FLEET_COMPOSITION=immutableJSON(raw);
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_COMPOSITION',m);
const int=v=>Number.isNaN(v)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(v)))|0;
const round=v=>int(Math.floor(v+0.5));
const modes=['ALL','IMPORTED','PRIORITY_ONLY','PRIORITY_THEN_ALL'];
export function createOriginalFleetCompositionState(){return {scope:'native-fleet-composition-runtime',sizeOverride:0};}
export function validateOriginalFleetCompositionState(state){check(state?.scope==='native-fleet-composition-runtime'&&Number.isInteger(state.sizeOverride)&&state.sizeOverride>=0&&state.sizeOverride<=5,'Invalid current FleetFactoryV3 size override');return state;}
export function createOriginalFleetCompositionParams(input){return {combatPts:0,freighterPts:0,tankerPts:0,transportPts:0,linerPts:0,utilityPts:0,minShipSize:0,maxShipSize:1000,doctrineOverride:null,ignoreMarketFleetSizeMult:null,onlyApplyFleetSizeToCombatShips:null,forceAllowPhaseShipsEtc:null,treatCombatFreighterSettingAsFraction:null,doNotPrune:null,doNotAddShipsBeforePruning:null,maxNumShips:null,addShips:null,timestamp:null,blockFallback:null,banPhaseShipsEtc:false,...input};}
function call(ctx,name,...args){check(typeof ctx.services?.[name]==='function','Actual fleet service required: '+name);return ctx.services[name](...args);}
function doctrine(ctx){return ctx.params.doctrineOverride??call(ctx,'doctrine');}
function constants(ctx){return (ctx.reference??ORIGINAL_FLEET_COMPOSITION).constants;}
function sizeFor(ctx,size){return ctx.state.sizeOverride>0?ctx.state.sizeOverride:size;}
function counts(ctx,width,size){const c=constants(ctx),base=c['BASE_COUNTS_WITH_'+width][size-1],extra=c['MAX_EXTRA_WITH_'+width][size-1];check(base&&extra,'Unsupported doctrine ship-size index');return base.map((n,i)=>(n+originalJavaNextInt(ctx.random,extra[i]+1))|0);}
// WeightedRandomPicker retains float total through removals and removes FIRST equal item.
class Picker {
 items=[];weights=[];total=0;
 constructor(random){this.random=random;}
 add(item,weight=1){weight=f(weight);if(weight<=0)return;this.items.push(item);this.weights.push(weight);this.total=f(this.total+weight);}
 clear(){this.items.length=0;this.weights.length=0;this.total=0;}
 remove(item){if(item===null)return;const i=this.items.indexOf(item);if(i<0)return;this.items.splice(i,1);this.total=f(this.total-this.weights.splice(i,1)[0]);}
 pick(){if(!this.items.length)return null;let value=f(originalJavaNextFloat(this.random)*this.total);if(value>this.total)value=this.total;let sum=0,i=0;for(const w of this.weights){sum=f(sum+w);if(value<=sum)break;i++;}return this.items[Math.min(i,this.items.length-1)];}
}
function addVariant(ctx,variantId){
 const member=call(ctx,'createMember',variantId);check(member&&typeof member==='object','Actual created fleet member required');
 const name=call(ctx,'pickShipName',member,ctx.random);
 call(ctx,'setShipName',member,name);call(ctx,'addMember',member);
 return f(call(ctx,'memberFP',member));
}
function addRole(ctx,role,maxFP){
 const p=ctx.params,picks=call(ctx,'pickShipsForRole',role,{mode:p.mode,maxFP,timestamp:p.timestamp,blockFallback:p.blockFallback},ctx.random);
 let total=0;for(const pick of picks)total=f(total+addVariant(ctx,pick.variantId));return total;
}
function addShips(ctx,role,count,remaining){
 let addedSomething=false;
 for(let i=0;i<count;i++){if(remaining.fp<=0)break;const added=addRole(ctx,role,remaining.fp);if(added>0){remaining.fp=int(f(f(remaining.fp)-added));addedSomething=true;}}
 return addedSomething;
}
function available(ctx,role){return call(ctx,'roleAvailability',role,'PRIORITY_ONLY');}
function priorityCount(ctx,roles){let total=0;for(const role of roles)total=(total+available(ctx,role).count)|0;return total;}
/** Public native three-size helper, including fractional fp return when no member was added. */
export function addOriginalFleetPoints(ctx,fp,sizeFilter,roles){
 fp=f(fp);let size=doctrine(ctx).shipSize,added=true;const rem={fp:int(fp)},p=ctx.params;
 while(added&&rem.fp>0){
  size=sizeFor(ctx,size);let [small,medium,large]=counts(ctx,3,size);
  if(sizeFilter==='SMALL_IS_FRIGATE'){if(p.maxShipSize<=1)medium=0;if(p.maxShipSize<=2)large=0;}
  else if(sizeFilter==='SMALL_IS_DESTROYER'){if(p.maxShipSize<=2)medium=0;if(p.maxShipSize<=3)large=0;}
  const smallPre=int(small/2),mediumPre=int(medium/2);small-=smallPre;medium-=mediumPre;added=false;
  for(const [role,count]of [[roles[0],smallPre],[roles[1],mediumPre],[roles[0],small],[roles[2],large],[roles[1],medium]]){const result=addShips(ctx,role,count,rem);added=result||added;}
 }
 return f(fp-f(rem.fp));
}
export function addOriginalPriorityFleetPoints(ctx,fp,sizeFilter,roles){
 fp=f(fp);if(fp<=0)return 0;const p=ctx.params;
 if(p.mode!=='PRIORITY_THEN_ALL')return addOriginalFleetPoints(ctx,fp,sizeFilter,roles);
 p.mode=priorityCount(ctx,roles)>0?'PRIORITY_ONLY':'ALL';
 const added=addOriginalFleetPoints(ctx,fp,sizeFilter,roles);p.mode='PRIORITY_THEN_ALL';return added;
}
function addWeightedShips(ctx,picker,priority,remaining,override,count){
 if(!picker.items.length)return false;let any=false;
 for(let i=0;i<count;i++){
  const role=picker.pick();if(role===null)break;const proper=remaining[role],rem=override??proper;
  if(priority.has(role))ctx.params.mode='PRIORITY_ONLY';
  const before=rem.fp,added=addShips(ctx,role,1,rem);
  if(added&&override!==null){const spent=(before-rem.fp)|0,take=Math.min(proper.fp,spent);proper.fp=(proper.fp-take)|0;}
  if(priority.has(role))ctx.params.mode='PRIORITY_THEN_ALL';
  if(!added){picker.remove(role);i--;if(!picker.items.length)break;}
  any=added||any;
 }
 return any;
}
function redistribute(one,two,three,newTotal){
 const total=f((one.fp+two.fp+three.fp)|0);if(total<=0)return;
 let a=round(f(f(f(one.fp)/total)*f(newTotal)));
 const b=round(f(f(f(two.fp)/total)*f(newTotal))),c=round(f(f(f(three.fp)/total)*f(newTotal)));
 a=(a+((newTotal-a-b-c)|0))|0;one.fp=a;two.fp=b;three.fp=c;
}
export function addOriginalCombatFleetPoints(ctx,warshipFP,carrierFP,phaseFP){
 warshipFP=f(warshipFP);carrierFP=f(carrierFP);phaseFP=f(phaseFP);
 const p=ctx.params,d=doctrine(ctx),pickers=Array.from({length:4},()=>new Picker(ctx.random)),priorityCapital=new Picker(ctx.random);
 const smallRole=p.banPhaseShipsEtc?'combatSmallForSmallFleet':'combatSmall';
 const roles=[[smallRole,'phaseSmall'],['combatMedium','phaseMedium','carrierSmall'],['combatLarge','phaseLarge','carrierMedium'],['combatCapital','phaseCapital','carrierLarge']];
 for(let i=0;i<4;i++)for(let j=0;j<roles[i].length;j++)pickers[i].add(roles[i][j],[warshipFP,phaseFP,carrierFP][j]);
 const priority=new Set();
 if(p.mode==='PRIORITY_THEN_ALL'){
  for(const role of ['combatCapital','carrierLarge','phaseCapital']){const weight=available(ctx,role).weight;if(weight>0)priorityCapital.add(role,weight);}
  for(const group of [['phaseSmall','phaseMedium','phaseLarge'],['carrierSmall','carrierMedium','carrierLarge']])if(priorityCount(ctx,group)>0)for(const role of group)priority.add(role);
 }
 const w={fp:int(warshipFP)},c={fp:int(carrierFP)},ph={fp:int(phaseFP)},remaining={};
 for(const role of ['combatSmallForSmallFleet','combatSmall','combatMedium','combatLarge','combatCapital'])remaining[role]=w;
 for(const role of ['carrierSmall','carrierMedium','carrierLarge'])remaining[role]=c;
 for(const role of ['phaseSmall','phaseMedium','phaseLarge','phaseCapital'])remaining[role]=ph;
 if(p.maxShipSize<=1)pickers[1].clear();if(p.maxShipSize<=2)pickers[2].clear();if(p.maxShipSize<=3)pickers[3].clear();
 if(p.minShipSize>=2)pickers[0].clear();if(p.minShipSize>=3)pickers[1].clear();if(p.minShipSize>=4)pickers[2].clear();
 let size=d.shipSize,fails=0;
 while(fails<2){
  size=sizeFor(ctx,size);let [small,medium,large,capital]=counts(ctx,4,size);
  if(size<5&&capital>1)capital=1;
  if(p.maxShipSize<=1)medium=0;if(p.maxShipSize<=2)large=0;if(p.maxShipSize<=3)capital=0;
  if(p.minShipSize>=2)small=0;if(p.minShipSize>=3)medium=0;if(p.minShipSize>=4)large=0;
  const smallPre=int(small/2),mediumPre=int(medium/2);small-=smallPre;medium-=mediumPre;let added=false;
  for(const [index,count]of [[0,smallPre],[1,mediumPre],[0,small],[2,large],[1,medium]]){const result=addWeightedShips(ctx,pickers[index],priority,remaining,null,count);added=result||added;}
  if(priorityCapital.items.length){
   p.mode='PRIORITY_ONLY';p.blockFallback=true;const combined={fp:(w.fp+c.fp+ph.fp)|0};
   const result=addWeightedShips(ctx,priorityCapital,priority,remaining,combined,capital);added=result||added;
   if(result)redistribute(w,c,ph,combined.fp);
   p.mode='PRIORITY_THEN_ALL';p.blockFallback=null;
  }else{const result=addWeightedShips(ctx,pickers[3],priority,remaining,null,capital);added=result||added;}
  // Successful rounds do NOT reset numFails in the installed implementation.
  if(added||++fails!==2)continue;let again=false;
  if(ph.fp>0){w.fp=(w.fp+ph.fp)|0;ph.fp=0;again=true;}
  if(c.fp>0){w.fp=(w.fp+c.fp)|0;c.fp=0;again=true;}
  if(!again)continue;fails=0;
  for(let i=0;i<4;i++)pickers[i].add(roles[i][0],1);
 }
}
const logistics=[['freighter','NONE'],['tanker','SMALL_IS_DESTROYER'],['personnel','NONE'],['liner','NONE'],['utility','NONE']];
function roleNames(prefix){return prefix==='utility'?['utility','utility','utility']:[prefix+'Small',prefix+'Medium',prefix+'Large'];}
function populate(ctx,w,c,p,points){
 addOriginalCombatFleetPoints(ctx,f(w),f(c),f(p));
 for(let i=0;i<logistics.length;i++)addOriginalPriorityFleetPoints(ctx,points[i],logistics[i][1],roleNames(logistics[i][0]));
}
/** Caller has already created the real empty fleet and resolved source, pick mode and random. */
export function composeOriginalFleetRoster(ctx){
 validateOriginalFleetCompositionState(ctx.state);validateOriginalJavaRandom(ctx.random);
 const p=ctx.params,d=doctrine(ctx);check(modes.includes(p.mode),'Resolved native ship-pick mode required before roster creation');
 for(const key of ['combatPts','freighterPts','tankerPts','transportPts','linerPts','utilityPts'])check(Number.isFinite(p[key]),'Finite fleet budget required: '+key);
 let mult=p.ignoreMarketFleetSizeMult===true?1:f(call(ctx,'marketSizeMult')),combat=f(f(p.combatPts)*mult);
 if(p.onlyApplyFleetSizeToCombatShips===true)mult=1;
 const points=['freighterPts','tankerPts','transportPts','linerPts','utilityPts'].map(k=>f(f(p[k])*mult));
 if(combat<10&&combat>0)combat=Math.max(combat,f(5+originalJavaNextInt(ctx.random,6)));
 let dw=f(f(f(d.warships)+f(originalJavaNextInt(ctx.random,3)))-2),dc=f(f(f(d.carriers)+f(originalJavaNextInt(ctx.random,3)))-2),dp=f(f(f(d.phaseShips)+f(originalJavaNextInt(ctx.random,3)))-2);
 if(d.strictComposition){dw=f(f(d.warships)-1);dc=f(f(d.carriers)-1);dp=f(f(d.phaseShips)-1);}
 else{const r1=originalJavaNextFloat(ctx.random),r2=originalJavaNextFloat(ctx.random),min=Math.min(r1,r2),max=Math.max(r1,r2),third=f(1/3);dw=f(dw+f(min-third));dc=f(dc+f(f(max-min)-third));dp=f(dp+f(f(1-max)-third));}
 if(d.warships<=0)dw=0;if(d.carriers<=0)dc=0;if(d.phaseShips<=0)dp=0;
 p.banPhaseShipsEtc=!call(ctx,'isPlayerFaction')&&combat<f(constants(ctx).FLEET_POINTS_THRESHOLD_FOR_ANNOYING_SHIPS);
 if(p.forceAllowPhaseShipsEtc===true)p.banPhaseShipsEtc=false;
 if(dw<0)dw=0;if(dc<0)dc=0;if(dp<0)dp=0;
 let extra=f(7-f(f(dc+dp)+dw));if(extra<0)extra=0;
 if(d.warships>d.carriers&&d.warships>d.phaseShips)dw=f(dw+extra);
 else if(d.carriers>d.warships&&d.carriers>d.phaseShips)dc=f(dc+extra);
 else if(d.phaseShips>d.warships&&d.phaseShips>d.carriers)dp=f(dp+extra);
 const total=f(f(dw+dc)+dp);combat=f(int(combat));
 let warships=int(f(f(combat*dw)/total));const carriers=int(f(f(combat*dc)/total)),phase=int(f(f(combat*dp)/total));
 warships=int(f(f(warships)+f(f(f(combat-f(warships))-f(carriers))-f(phase))));
 if(p.addShips!==null){for(const variantId of p.addShips)warships=int(f(f(warships)-addVariant(ctx,variantId)));if(warships<0)warships=0;}
 const fraction=p.treatCombatFreighterSettingAsFraction===true;
 if(fraction||(points[0]>0&&originalJavaNextFloat(ctx.random)<d.combatFreighterProbability)){
  let cf=f(int(Math.min(f(points[0]*1.5),f(f(warships)*1.5))));if(fraction)cf=f(cf*f(d.combatFreighterProbability));
  const added=addOriginalPriorityFleetPoints(ctx,cf,'SMALL_IS_FRIGATE',roleNames('combatFreighter'));
  points[0]=f(points[0]-f(added*0.5));warships=int(f(f(warships)-f(added*0.5)));
 }
 populate(ctx,warships,carriers,phase,points);
 const maxShips=p.maxNumShips??(ctx.reference??ORIGINAL_FLEET_COMPOSITION).settings.maxShipsInAIFleet;
 if(call(ctx,'numMembers')>maxShips&&p.doNotPrune!==true){
  const targetFP=f(originalCompositionFleetFP(ctx));
  if(p.doNotAddShipsBeforePruning!==true){ctx.state.sizeOverride=5;populate(ctx,warships,carriers,phase,points);ctx.state.sizeOverride=0;}
  pruneOriginalFleet(ctx,maxShips,targetFP);originalCompositionFleetFP(ctx);
 }
 call(ctx,'sortFleet');call(ctx,'sortFleet');
}
export function originalCompositionFleetFP(ctx){let total=0;for(const member of call(ctx,'membersCopy'))total=(total+call(ctx,'memberFP',member))|0;return total;}
function keepMembers(ctx,from,to,num){
 let added=0;if(num<=5){while(added<num&&from.length){to.add(from.shift());added++;}return;}
 const make=()=>{const p=new Picker(ctx.random);for(const size of [5,5,5,5,4,4,3,2])p.add(size);return p;};let picker=make();
 for(let i=0;i<num;i++){
  if(!picker.items.length)picker=make();
  while(picker.items.length){const size=picker.pick();picker.remove(size);const index=from.findIndex(m=>call(ctx,'memberHullSize',m)===size);if(index<0)continue;to.add(from.splice(index,1)[0]);added++;break;}
 }
 while(added<num&&from.length){to.add(from.shift());added++;}
}
/** Preserves native quota and replacement quirks; maxShips is not a newly imposed hard cap. */
export function pruneOriginalFleet(ctx,maxShips,targetFP){
 targetFP=f(targetFP);let combatFP=0,civFP=0,copy=call(ctx,'membersCopy');const combat=[],freighter=[],tanker=[],liner=[],other=[];
 for(const member of copy){
  if(call(ctx,'memberCivilian',member)){
   civFP=f(civFP+f(call(ctx,'memberFP',member)));const hints=call(ctx,'memberHints',member);
   if(hints.includes('FREIGHTER'))freighter.push(member);else if(hints.includes('TANKER'))tanker.push(member);else if(hints.includes('TRANSPORT')||hints.includes('LINER'))liner.push(member);else other.push(member);
  }else{combatFP=f(combatFP+f(call(ctx,'memberFP',member)));combat.push(member);}
 }
 if(civFP<1)civFP=1;if(combatFP<1)combatFP=1;
 const keepCombat=int(f(f(f(maxShips)*combatFP)/f(civFP+combatFP)));let keepCiv=(maxShips-keepCombat)|0;
 if(civFP>10&&keepCiv<2){keepCiv=2;for(const group of [freighter,tanker,liner,other])if(group.length)keepCiv++;keepCiv=(maxShips-keepCiv)|0;}
 const groups=[freighter,tanker,liner,other];let total=f((freighter.length+tanker.length+liner.length+other.length)|0);if(total<1)total=1;
 const quotas=groups.map(group=>{let quota=f(f(f(group.length)/total)*f(keepCiv));if(quota>0)quota=f(round(quota));if(group.length>0&&quota<1)quota=1;return quota;});
 let extra=int(f(f(f(f(quotas[0]+quotas[1])+quotas[2])+quotas[3])-f(keepCiv)));
 for(const i of [3,2,1,0])if(extra>0&&quotas[i]>=2){extra--;quotas[i]=f(quotas[i]-1);}
 for(const group of [combat,...groups])group.sort((a,b)=>call(ctx,'memberHullSize',b)-call(ctx,'memberHullSize',a));
 const keep=new Set();keepMembers(ctx,combat,keep,keepCombat);for(let i=0;i<groups.length;i++)keepMembers(ctx,groups[i],keep,int(quotas[i]));
 for(const member of copy)if(!keep.has(member))call(ctx,'removeMember',member);
 const currentFP=f(originalCompositionFleetFP(ctx));if(currentFP<=targetFP)return;
 call(ctx,'sortFleet');copy=call(ctx,'membersCopy');
 for(let i=0;i<int(copy.length/2);i+=2){const j=copy.length-1-i;[copy[i],copy[j]]=[copy[j],copy[i]];}
 const goal=f(currentFP-targetFP);let done=0;
 for(const current of copy){
  if(call(ctx,'memberCivilian',current))continue;let best=null,bestDiff=0;
  for(const replacement of combat){
   const fpCurrent=f(call(ctx,'memberFP',current)),fpReplacement=f(call(ctx,'memberFP',replacement));if(!(fpCurrent>fpReplacement))continue;
   const diff=f(fpCurrent-fpReplacement);if(f(done+diff)<=goal){best=replacement;bestDiff=diff;break;}
   if(!(diff<bestDiff))continue;best=replacement;bestDiff=diff;
  }
  if(best!==null){done=f(done+bestDiff);combat.splice(combat.indexOf(best),1);call(ctx,'removeMember',current);call(ctx,'addMember',best);}
  if(done>=goal)break;
 }
}
