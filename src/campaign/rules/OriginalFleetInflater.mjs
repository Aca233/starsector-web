/** DefaultFleetInflater's actual selection/variant pipeline. Runtime supplies the ported CoreAutofit;
 * uncaptured world/spec hooks remain explicit services, never a loadout approximation. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalJavaRandom,validateOriginalJavaRandom,originalJavaNextFloat,originalJavaNextDouble,originalJavaNextInt,originalJavaNextLong} from './OriginalJavaRandom.mjs';
const f=Math.fround,CLASS='com.fs.starfarer.api.impl.campaign.fleets.DefaultFleetInflater';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_INFLATER',m);
const num=v=>{check(typeof v==='number'&&Number.isFinite(v)&&f(v)===v,'Actual inflater float required');return v;};
const int=v=>{check(Number.isInteger(v)&&v>=-2147483648&&v<=2147483647,'Actual inflater Java int required');return v;};
const bool=v=>{check(typeof v==='boolean','Actual inflater Boolean result required');return v;};
const call=(s,name,...args)=>{check(typeof s[name]==='function','Actual fleet inflater service required: '+name);const r=s[name](...args);check(!r||typeof r.then!=='function','Fleet inflater services must be synchronous');return r;};
const strings=v=>{check(Array.isArray(v)&&v.every(x=>typeof x==='string'),'Actual ordered equipment IDs required');return v;};
const long=v=>{check(typeof v==='string'&&/^-?(0|[1-9][0-9]*)$/.test(v)&&String(BigInt.asIntN(64,BigInt(v)))===v,'Actual inflater signed-long required');return v;};
export function createOriginalFleetInflaterParams(objectRef,overrides={}){
 check(typeof objectRef==='string'&&objectRef.length>0,'Actual new inflater params identity required');
 return {objectRef,seed:null,timestamp:null,persistent:null,quality:0,averageSMods:null,allWeapons:null,rProb:null,mode:null,factionId:null,blockHullmodsWithItemReqs:null,...overrides,className:CLASS+'Params'};
}
export function createOriginalFleetInflaterForParams(objectRef,parameters){
 check(typeof objectRef==='string'&&objectRef.length>0,'Actual new inflater identity required');
 return validateOriginalFleetInflater({scope:'native-default-fleet-inflater',objectRef,className:CLASS,parameters});
}
export function createOriginalFleetInflater(objectRef,overrides={}){return createOriginalFleetInflaterForParams(objectRef,createOriginalFleetInflaterParams(objectRef+':params',overrides));}
export function validateOriginalFleetInflater(item){
 check(item?.scope==='native-default-fleet-inflater'&&item.className===CLASS&&typeof item.objectRef==='string','Actual implemented DefaultFleetInflater required');
 const p=item.parameters;check(p&&typeof p.objectRef==='string','Actual retained DefaultFleetInflaterParams required');num(p.quality);
 for(const k of ['seed','timestamp'])if(p[k]!==null)long(p[k]);
 for(const k of ['persistent','allWeapons','blockHullmodsWithItemReqs'])check(p[k]===null||typeof p[k]==='boolean','Actual nullable inflater flag required');
 if(p.averageSMods!==null)int(p.averageSMods);if(p.rProb!==null)num(p.rProb);
 check(p.mode===null||['ALL','PRIORITY_ONLY','PRIORITY_THEN_ALL','IMPORTED'].includes(p.mode),'Actual nullable ship-pick mode required');check(p.factionId===null||typeof p.factionId==='string','Actual nullable inflater faction required');return item;
}
export const originalInflaterRemovesAfterInflating=item=>validateOriginalFleetInflater(item).parameters.persistent!==true;
export function setOriginalInflaterRemovesAfterInflating(item,value){validateOriginalFleetInflater(item).parameters.persistent=bool(value)?null:true;}
export function originalInflaterTierProbability(tier,quality){int(tier);num(quality);if(tier===1)return Math.min(f(.9),f(f(.75)+quality));if(tier===2)return Math.min(f(.9),f(f(.5)+f(quality*f(.5))));if(tier===3)return Math.min(f(.9),f(f(.25)+f(quality*f(.25))));return 1;}
export function originalInflaterMakePicks(count,max,random){int(count);int(max);check(max>=0,'Nonnegative equipment pool size required');validateOriginalJavaRandom(random);count=Math.min(count,max);const result=new Set();if(count===0)return [];if(count===max){for(let i=0;i<max;i++)result.add(i);return [...result];}let steps=0;while(result.size<count){check(++steps<=100000,'Inflater picker work budget');result.add(originalJavaNextInt(random,max));}return [...result];}
export function originalInflaterMaxSMods(average,random){int(average);const roll=originalJavaNextFloat(random);return Math.max(0,Math.min(3,roll<.25?(average-1)|0:roll<.5?(average+1)|0:average));}
export function originalInflaterNumDMods(average,existing,random){num(average);int(existing);const value=average+originalJavaNextDouble(random)*3-2,rounded=value>=2**63?9223372036854775807n:value<=-(2**63)?-9223372036854775808n:BigInt(Math.floor(value+.5));return Math.max(0,(Math.min(5,Number(BigInt.asIntN(32,rounded)))-existing)|0);}
function derivedRandom(seed,services){if(seed==='0')return validateOriginalJavaRandom(call(services,'readInflaterMiscRandom'));const r=createOriginalJavaRandom(seed);for(let i=0;i<5;i++)originalJavaNextLong(r);return createOriginalJavaRandom(originalJavaNextLong(r));}
const hash=name=>{check(typeof name==='string','Actual named member required before inflation');let h=0;for(let i=0;i<name.length;i++)h=(Math.imul(h,31)+name.charCodeAt(i))|0;return h;};
const categories=[['kinetic',['kinetic','energy','he','beam','pd','rocket','missile','utility','strike']],['he',['he','energy','kinetic','beam','pd','rocket','missile','utility','strike']],['energy',['energy','kinetic','he','beam','pd','rocket','missile','utility','strike']],['pd',['pd','beam','he','kinetic','utility','rocket','missile','strike']],['beam',['beam','energy','he','kinetic','rocket','missile','utility','strike']],['strike',['strike','missile','rocket','he','energy','kinetic','utility','beam','pd']],['missile',['missile','strike','rocket','he','energy','kinetic','utility','beam','pd']],['utility',['utility','missile','rocket','strike','he','kinetic','energy','beam','pd']],['rocket',['rocket','utility','missile','strike','he','kinetic','energy','beam','pd']],['swarm',['utility','missile','rocket']],['interceptor',['interceptor','fighter','support','bomber']],['bomber',['bomber','fighter','interceptor','support']],['fighter',['fighter','interceptor','bomber','support']],['support',['support','interceptor','fighter','bomber']]];
/** Actual constructor state, not a doFit implementation or presentation/UI facade. */
export function createOriginalCoreAutofitClassState(){return {scope:'native-core-autofit-class-state',categories:null,categoryEntries:null,tagLevels:[],randomizeChance:f(.5)};}
export function validateOriginalCoreAutofitClassState(state){check(state?.scope==='native-core-autofit-class-state'&&(state.categories===null||Array.isArray(state.categories)),'Actual CoreAutofit class history required');if(state.categories!==null)for(const row of state.categories){check(typeof row.base==='string','Actual autofit category required');strings(row.tags);strings(row.fallback);}if(Object.hasOwn(state,'categoryEntries')){check(state.categoryEntries===null&&state.categories===null||Array.isArray(state.categoryEntries)&&state.categories!==null,'Actual shared category map required');for(const [key,cat]of state.categoryEntries??[])check(typeof key==='string'&&state.categories.includes(cat),'Lost category alias identity');}if(Object.hasOwn(state,'tagLevels'))check(Array.isArray(state.tagLevels)&&state.tagLevels.every(([key,value])=>(key===null||typeof key==='string')&&Number.isInteger(value)),'Actual tag-level cache required');if(Object.hasOwn(state,'randomizeChance'))num(state.randomizeChance);return state;}
export function createOriginalCoreAutofitSession(commander,random,classState){
 check(commander===null||commander&&commander.stats,'Actual nullable autofit commander required');validateOriginalJavaRandom(random);validateOriginalCoreAutofitClassState(classState);
 if(classState.categories===null){classState.categories=categories.map(([base,fallback])=>({base,tags:Array.from({length:100},(_,i)=>base+i),fallback:[...fallback]}));classState.categoryEntries=classState.categories.flatMap(cat=>[cat.base,...cat.tags].map(key=>[key,cat]));}
 return {scope:'native-core-autofit-session',classState,commander,stats:commander?.stats??null,random,options:[['use_from_cargo',true],['use_from_storage',true],['buy_from_market',true],['black_market',true],['upgrade',false],['strip',true],['always_reinforced_hull',false],['always_blast_doors',false],['randomize',false]],categories:classState.categories,randomize:false,weaponFilterSeed:'0',emptyWingTarget:null,altWeaponCats:[],altFighterCats:[],debug:false,availableMods:null,slotsToSkip:[],baysToSkip:[],fittingModule:false,missilesWithAmmoOnCurrent:0,fittedWeaponMapCapacity:16,fittedFighterMapCapacity:16,fittedWeapons:[],fittedFighters:[]};
}
const setChecked=(auto,id,value)=>{const option=auto.options.find(x=>x[0]===id);check(option,'Missing native autofit option');option[1]=value;};
function weaponPool(){return new Map();}
function weaponsAt(pool,tier,cat,size){let byCat=pool.get(tier);if(!byCat)pool.set(tier,byCat=new Map());let bySize=byCat.get(cat);if(!bySize)byCat.set(cat,bySize=new Map());let list=bySize.get(size);if(!list)bySize.set(size,list=[]);return list;}
function fightersAt(pool,cat){let list=pool.get(cat);if(!list)pool.set(cat,list=[]);return list;}
const category=value=>{check(value===null||typeof value==='string','Actual nullable autofit category required');return value;};
const available=(kind,id,spec)=>({kind,id,spec,quantity:1000,price:0,source:null,submarket:null,...(kind==='weapon'?{savedCostStats:null,cachedOPCost:-1}:{})});
export function executeOriginalFleetInflation(item,fleet,services){
 const p=validateOriginalFleetInflater(item).parameters;
 // Both default Random constructors occur even when the supplied seed replaces them.
 let random=validateOriginalJavaRandom(call(services,'createInflaterRandom'));if(p.seed!==null)random=createOriginalJavaRandom(p.seed);
 let dmodRandom=validateOriginalJavaRandom(call(services,'createInflaterRandom'));if(p.seed!==null)dmodRandom=derivedRandom(p.seed,services);
 const auto=createOriginalCoreAutofitSession(call(services,'readInflaterCommander',fleet),random,call(services,'readInflaterAutofitClassState'));
 setChecked(auto,'upgrade',originalJavaNextFloat(random)<Math.min(f(f(.1)+f(p.quality*f(.5))),f(.5)));
 const faction=call(services,'readInflaterFaction',fleet,p.factionId),hullmods=strings(call(services,'readInflaterKnownHullmods',faction)).filter(id=>p.blockHullmodsWithItemReqs!==true||call(services,'readInflaterHullmodRequiredItem',id)===null);
 const priorityWeapons=weaponPool(),nonPriorityWeapons=weaponPool(),weaponCategories=new Set();
 for(const id of strings(call(services,'readInflaterKnownWeapons',faction))){
  if(!bool(call(services,'isInflaterWeaponKnownAt',faction,id,p.timestamp)))continue;
  const spec=call(services,'readInflaterWeaponSpec',id);check(spec&&['SMALL','MEDIUM','LARGE'].includes(spec.size),'Actual known weapon spec/size required: '+id);int(spec.tier);category(spec.autofitCategory);
  weaponsAt(bool(call(services,'isInflaterWeaponPriority',faction,id))?priorityWeapons:nonPriorityWeapons,spec.tier,spec.autofitCategory,spec.size).push(available('weapon',id,spec));weaponCategories.add(spec.autofitCategory);
 }
 const priorityFighters=new Map(),nonPriorityFighters=new Map(),fighterCategories=new Set();
 for(const id of strings(call(services,'readInflaterKnownFighters',faction))){
  if(!bool(call(services,'isInflaterFighterKnownAt',faction,id,p.timestamp)))continue;const spec=call(services,'readInflaterFighterSpec',id);check(spec,'Actual known fighter spec required: '+id);category(spec.autofitCategory);
  fightersAt(bool(call(services,'isInflaterFighterPriority',faction,id))?priorityFighters:nonPriorityFighters,spec.autofitCategory).push(available('fighter',id,spec));fighterCategories.add(spec.autofitCategory);
 }
 const averageDmods=f(f(1-p.quality)/num(call(services,'readInflaterQualityPerDMod')));num(averageDmods);
 const force=bool(call(services,'readInflaterForceAutofit',fleet)),members=call(services,'readInflaterMembers',fleet);check(Array.isArray(members),'Actual synchronized fleet members required');let memberIndex=0;
 for(const member of members){
  const hullTags=force?[]:strings(call(services,'readInflaterHullTags',member));const variant=member.variant;check(variant===null||Array.isArray(variant?.effects?.tags),'Actual member variant tags required');
  const tagged=tag=>hullTags.includes(tag)||variant?.effects.tags.includes(tag)===true;
  if(!force&&tagged('no_autofit'))continue;if(!bool(call(services,'isInflaterPlayerFaction',faction))&&!force&&tagged('no_autofit_unless_player'))continue;
  if(p.seed!==null){const seed=String(BigInt.asIntN(64,BigInt(p.seed)*BigInt(hash(member.shipName))));random=createOriginalJavaRandom(seed);auto.random=random;dmodRandom=derivedRandom(seed,services);}
  const weapons=[];
  for(const cat of weaponCategories)for(const size of ['SMALL','MEDIUM','LARGE']){let found=false;for(let tier=0;tier<4;tier++){
   let chance=p.allWeapons===true?1:originalInflaterTierProbability(tier,p.quality);if(!found)chance=1;
   const priority=weaponsAt(priorityWeapons,tier,cat,size),other=weaponsAt(nonPriorityWeapons,tier,cat,size),tierAvailable=originalJavaNextFloat(random)<chance;if(!tierAvailable&&found)continue;
   let count=p.allWeapons===true?500:2;let picks=originalInflaterMakePicks(count,priority.length,random);for(const i of picks){weapons.push(priority[i]);found=true;}count-=picks.length;
   if(count>0){picks=originalInflaterMakePicks(count,other.length,random);for(const i of picks){weapons.push(other[i]);found=true;}}
  }}
  const fighters=[];for(const cat of fighterCategories){const priority=priorityFighters.get(cat);let picked=false;if(priority){let count=originalJavaNextInt(random,2)+1;if(p.allWeapons===true)count=100;for(const i of originalInflaterMakePicks(count,priority.length,random)){fighters.push(priority[i]);picked=true;}}
   if(!picked){let count=originalJavaNextInt(random,2)+1;if(p.allWeapons===true)count=100;const others=nonPriorityFighters.get(cat);check(others,'Actual nonpriority fighter category required');for(const i of originalInflaterMakePicks(count,others.length,random))fighters.push(others[i]);}
  }
  let target=member.variant;check(target&&Object.hasOwn(target,'originalVariant'),'Actual original-variant state required');if(target.originalVariant!==null)target=call(services,'readInflaterStockVariant',target.originalVariant);
  if(bool(call(services,'isInflaterPlayerFaction',faction))&&originalJavaNextFloat(random)<f(.5)){
   const targets=call(services,'readInflaterTargetVariants',member);check(Array.isArray(targets),'Actual player autofit target history required');const alts=targets.filter(v=>v.hullId===target.hullId);
   if(alts.length){const value=f(originalJavaNextFloat(random)*f(alts.length));target=alts[Math.min(Math.max(0,Math.ceil(value)-1),alts.length-1)];}
  }
  check(typeof target?.hullId==='string'&&typeof target.hullVariantId==='string'&&typeof target.variantSource==='string','Actual target variant source/identity required');
  check(typeof fleet.id==='string','Actual CampaignFleet ID required');const current=call(services,'createInflaterEmptyVariant',fleet.id+'_'+memberIndex,target.hullId);check(current&&current!==target&&typeof current.hullVariantId==='string'&&Array.isArray(current.effects?.sMods),'Actual fresh mutable empty variant required');
  if(target.variantSource==='STOCK')current.originalVariant=target.hullVariantId;
  const doctrineProbability=num(call(services,'readInflaterRandomizeProbability',faction)),rProb=p.rProb??doctrineProbability;let randomize=originalJavaNextFloat(random)<rProb;if(bool(call(services,'isInflaterMemberStation',member)))randomize=false;setChecked(auto,'randomize',randomize);memberIndex++;
  let maxSmods=0;if(p.averageSMods!==null&&!bool(call(services,'isInflaterMemberCivilian',member)))maxSmods=(originalInflaterMaxSMods(p.averageSMods,dmodRandom)-current.effects.sMods.length)|0;
  const delegate={scope:'native-fleet-inflater-delegate',fleet,faction,member,variant:current,hullmods,weapons,fighters};
  call(services,'fitInflaterVariant',auto,current,target,maxSmods,delegate);current.variantSource='REFIT';
  // FleetMember.setVariant(current,false,false): no field-refit CR event or eager stats rebuild.
  member.computedCivilian=false;member.variant=current;if(member.type!=='FIGHTER_WING')member.specId=current.hullVariantId;
  if(!bool(call(services,'isInflaterMemberStation',member))){const count=originalInflaterNumDMods(averageDmods,int(call(services,'readInflaterDModCount',current)),dmodRandom);if(count>0){call(services,'setInflaterDHull',current);call(services,'addInflaterDMods',member,true,count,dmodRandom);}}
 }
 call(services,'markInflaterFleetSyncNeeded',fleet);call(services,'syncInflaterFleet',fleet);
 return {scope:'native-default-fleet-inflation-result',processedMembers:memberIndex};
}
/** CampaignFleet nullable state and listener ordering; not a missing-inflater bypass. */
export function inflateOriginalCampaignFleet(fleet,services){
 const flags=fleet?.campaign?.flags;check(flags&&Object.hasOwn(flags,'inflated')&&Object.hasOwn(fleet,'inflater'),'Actual CampaignFleet inflation fields required');check(flags.inflated===null||typeof flags.inflated==='boolean','Actual nullable inflated state required');
 if(fleet.inflater===null||flags.inflated!==null||bool(call(services,'isInflaterFleetNeutral',fleet)))return false;
 call(services,'inflateCampaignFleetWith',fleet,fleet.inflater);
 call(services,'reportCampaignFleetInflated',fleet,fleet.inflater);
 if(bool(call(services,'removeCampaignInflaterAfterUse',fleet.inflater)))fleet.inflater=null;
 flags.inflated=true;fleet.inflated=true;return true;
}
