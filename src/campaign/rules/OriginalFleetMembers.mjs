/** Real FleetMember string construction and ShipNameStore/FleetData naming; no world fleet registration. */
import raw from '../data/reference-fleet-members.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
import {ORIGINAL_STORAGE,restoreOriginalStorageVariant,cloneOriginalStorageVariant} from './OriginalStorage.mjs';
import {ORIGINAL_DEFAULT_HULL_MODULES,createOriginalDefaultHullRegistryState,validateOriginalDefaultHullRegistryState,originalDefaultHullVariantRecipe} from './OriginalDefaultHullModules.mjs';
import {ORIGINAL_FLEET_SYNC,originalFleetPointCost} from './OriginalFleetData.mjs';
import {updateOriginalMemberStats} from './OriginalMemberEffects.mjs';
import {nextOriginalNativeUID,createOriginalDefaultFleetCaptain,originalPersonnelByRef} from './OriginalMarketPersonnel.mjs';
import {originalJavaNextInt,originalJavaNextFloat,originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
export const ORIGINAL_FLEET_MEMBERS=immutableJSON(raw);
const R=ORIGINAL_FLEET_MEMBERS,f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_MEMBER_FACTORY',m);
export function createOriginalFleetMemberFactory(mathRandom){
 validateOriginalJavaRandom(mathRandom);
 const factory={scope:'native-fleet-member-factory',members:[],stockVariants:{},names:{scope:'web-current-ship-name-store',tables:structuredClone(R.names),uses:{},useRomanNumerals:false,staticRandom:null,mathRandom}};
 // Actual new class initialization. Restore never calls this to fill an old cache/history gap.
 // Materialize in the oracle's B.keySet order; all default module IDs remain registry references,
 // not eagerly cloned overrides. The same cached module object is shared by every parent.
 for(const id of ORIGINAL_DEFAULT_HULL_MODULES.registryOrder){const recipe=originalDefaultHullVariantRecipe(id);if(recipe===null)continue;
  check(Object.hasOwn(R.variants,id)&&R.variants[id].source==='HULL','Native HULL recipe lacks actual public construction data: '+id);
  const value=constructStockVariant(id);check(value.hullId===recipe.hullId&&value.effects.stationModules.length===0,'Unexpected preinitialized HULL constructor input');
  value.effects.stationModules.push(...recipe.stationModules.map(([slot,moduleId])=>[slot,moduleId]));value.displayName=recipe.displayName;factory.stockVariants[id]=value;
 }
 // Publish proof only after complete construction, never after a partial failed initialization.
 factory.defaultHullRegistry=createOriginalDefaultHullRegistryState();return factory;
}
function constructStockVariant(id){
 check(Object.hasOwn(R.variants,id)&&Object.hasOwn(ORIGINAL_STORAGE.variants,id),'Unloaded stock construction variant');const meta=R.variants[id];
 return {...restoreOriginalStorageVariant(ORIGINAL_STORAGE.variants[id],{stock:true}),objectRef:'stock-construction-variant:'+id,hullVariantId:id,displayName:meta.displayName,variantSource:meta.source,sourceDetail:null,goalVariant:meta.goalVariant,mayAutoAssignWeapons:true,originalVariant:null,groupSpecs:structuredClone(meta.groupSpecs)};
}
function requiresDefaultHullHistory(id){const recipe=originalDefaultHullVariantRecipe(id);return !!R.variants[id]?.defaultHullModulesPending||recipe!==null&&(recipe.stationModules.length>0||recipe.displayName!==recipe.initialDisplayName);}
export function originalFleetStockVariant(factory,id){
 check(factory?.scope==='native-fleet-member-factory'&&factory.stockVariants,'Actual member factory required');
 const initialized=Object.hasOwn(factory,'defaultHullRegistry');
 if(initialized||requiresDefaultHullHistory(id))validateOriginalDefaultHullRegistryState(factory.defaultHullRegistry);
 if(initialized&&originalDefaultHullVariantRecipe(id)!==null)check(Object.hasOwn(factory.stockVariants,id),'Initialized default HULL registry lost its actual cached object: '+id);
 if(Object.hasOwn(factory.stockVariants,id))return factory.stockVariants[id];
 check(!requiresDefaultHullHistory(id),'Default empty-hull module registry ordering/history is not restored');
 const value=constructStockVariant(id);factory.stockVariants[id]=value;return value;
}
function memberStatus(member){
 const v=member.variant;let count;
 if(member.type==='NULL')count=1;
 else if(member.type==='FIGHTER_WING')count=ORIGINAL_FLEET_SYNC.wings[member.specId].numFighters;
 else{count=1;const slots=R.hulls[v.hullId]?.slots;check(slots,'Actual module slots required');for(const [slot]of v.effects.stationModules){check(Object.hasOwn(slots,slot),'Unknown native module slot');if(slots[slot]==='STATION_MODULE')count++;}}
 check(Number.isInteger(count)&&count>0,'Actual status count required');
 return {objectRef:'created-status:'+member.objectRef,random:null,memberRef:member.objectRef,hullFractions:Array(count).fill(1),modules:Array.from({length:count},(_,i)=>({objectRef:'created-module-status:'+member.objectRef+':'+i,hullFraction:1,armorCellFractions:null,gridWidth:0,gridHeight:0,detached:null,permaDetached:null,moduleSlotId:null,inactive:null,ammoState:null,hullDamageTaken:0,armorDamageTaken:0}))};
}
/** UID/member and UID/default captain allocations use the SAME current Sector counter. */
export function createOriginalFleetMember(factory,player,specId,type='SHIP',plugins={}){
 check(['SHIP','FIGHTER_WING'].includes(type),'Actual member factory/type required');check(typeof specId==='string'&&specId.length>0,'Actual variant or wing ID required');return constructMember(factory,player,specId,type,0,plugins);
}
/** FleetData class initializer's actual owner -1/null variant member, not a roster marker. */
export function createOriginalNullFleetMember(factory,player){return constructMember(factory,player,null,'NULL',-1,{});}
function constructMember(factory,player,specId,type,owner,plugins){
 check(factory?.scope==='native-fleet-member-factory','Actual member factory required');
 const id=nextOriginalNativeUID(player),objectRef='created-fleet-member:'+player.nativeUID.sectorRef+':'+id;
 check(!factory.members.some(m=>m.id===id||m.objectRef===objectRef)&&!(player.fleet?.members??[]).some(m=>m.id===id),'Duplicate native member UID');
 const buffManager={objectRef:'created-buff-manager:'+objectRef,memberRef:objectRef,buffs:[]};
 const captain=createOriginalDefaultFleetCaptain(player);let variantId=specId;
 if(type==='FIGHTER_WING'){const wing=ORIGINAL_FLEET_SYNC.wings[specId];check(wing,'Unknown native fighter wing');variantId=wing.variantId;}
 else if(type!=='NULL'&&!Object.hasOwn(R.variants,variantId))variantId=R.errorShipVariant;
 let variant=type==='NULL'?null:originalFleetStockVariant(factory,variantId);if(type==='SHIP'){variant=cloneOriginalStorageVariant(variant,'created-member-variant:'+objectRef);if(variant.groupSpecs.length>1)variant.mayAutoAssignWeapons=false;}
 const member={objectRef,id,nativeConstruction:'fleet-member-string',owner,type,specId,savedVariant:null,variant,valuationLifecycle:'unresolved',shipName:null,isFlagship:false,captain,captainRef:captain.objectRef,fleetDataRef:null,fleetCommanderForStatsRef:null,fleetDataForStatsRef:null,
  personalityOverride:null,isAlly:false,spriteOverride:null,overrideSpriteSize:null,civilian:false,computedCivilian:false,stats:null,statUpdateNeeded:false,forceNoMoreStatsUpdates:false,cachedStrength:-1,
  buffManager,buffManagerRef:buffManager.objectRef,crewComposition:{objectRef:'created-crew:'+objectRef,crew:0,marines:0},status:null,repairTracker:null};
 member.status=memberStatus(member);
 member.repairTracker={objectRef:'created-repair:'+objectRef,memberRef:objectRef,cr:f(0.5),crPriorToMothballing:0,noSuppliesCRLoss:[],recentEvents:[],recoveryRate:0,decreaseRate:0,suspendRepairs:false,mothballed:false,crashMothballed:false,losingCR:false,crOverride:null};
 // Detached is a real null FleetData, not a fabricated fleet used to bypass native dependencies.
 updateOriginalMemberStats(member,null,plugins);factory.members.push(member);return member;
}
export function setOriginalFleetMemberName(member,name){check(name===null||typeof name==='string','Native ship name must be nullable text');member.shipName=name;}
export function originalConstructedMemberHullSize(member){const h=ORIGINAL_FLEET_SYNC.hulls[member.variant?.hullId];check(h,'Current member hull required');return ['DEFAULT','FIGHTER','FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP'].indexOf(h.hullSize);}
export function originalConstructedMemberHints(member){const h=ORIGINAL_FLEET_SYNC.hulls[member.variant?.hullId];check(h,'Current member hull required');return h.hints;}
export function originalConstructedMemberCivilian(member){const hints=originalConstructedMemberHints(member);if(hints.includes('CIVILIAN'))return true;if(hints.includes('STATION')||hints.includes('SHIP_WITH_MODULES')||originalConstructedMemberHullSize(member)===1)return false;return member.variant.weapons.length===0&&!member.variant.wings.some(w=>w!==null&&w!=='');}
/** FleetData's constructor receives a current prefix and a source faction (both may be null). */
export function createOriginalFleetNaming(prefix,sourceFactionId,reference=R){
 check(prefix===null||typeof prefix==='string','Actual current fleet prefix required');let sources=null;
 if(sourceFactionId!==null){const source=reference.factions[sourceFactionId];check(source,'Actual naming faction required');sources={items:[],weights:[],total:0,random:null};for(const e of source.entries){if(e.weight<=0)continue;sources.items.push(e.item);sources.weights.push(f(e.weight));sources.total=f(sources.total+f(e.weight));}}
 return {scope:'native-fleet-data-naming',prefix,sourceFactionId,sources};
}
function sourcePick(store,picker){
 if(picker.items.length===0)return null;
 let value=picker.random===null?f(originalJavaNextDouble(store.mathRandom)*picker.total):f(originalJavaNextFloat(picker.random)*picker.total);if(value>picker.total)value=picker.total;
 let sum=0,i=0;for(const weight of picker.weights){sum=f(sum+weight);if(value<=sum)break;i++;}return picker.items[Math.min(i,picker.items.length-1)];
}
function roman(n){check(n>0,'Native roman count outside range');n=(n-1)%3999+1;let out='';for(const [value,letters]of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=value){n-=value;out+=letters;}return out;}
function nameFromList(store,member,prefix,list){
 if(member?.type==='FIGHTER_WING'){const h=R.hulls[member.variant.hullId];check(h,'Actual fighter hull name required');return h.name+' '+member.variant.displayName+' 联队';}
 // This Math.random call is NOT skipped even when the supplied random replaces its index.
 let index=Math.trunc(originalJavaNextDouble(store.mathRandom)*list.length);
 if(store.staticRandom!==null)index=originalJavaNextInt(store.staticRandom,list.length);
 check(index>=0&&index<list.length,'Native ship-name list is empty');const name=list[index],count=((Object.hasOwn(store.uses,name)?store.uses[name]:0)+1)|0;store.uses[name]=count;
 const base=prefix===null||prefix===''?name:prefix+' '+name;
 return count===1||!store.useRomanNumerals||store.staticRandom!==null?base:base+' '+roman(count);
}
export function pickOriginalShipName(factory,member,random,prefix,source){
 const store=factory.names;check(random===null||validateOriginalJavaRandom(random),'Actual naming random required');store.staticRandom=random;
 if(source===null||source.toLowerCase()==='all'||!Object.hasOwn(store.tables.groups,source))return nameFromList(store,member,prefix,store.tables.all);
 const result=nameFromList(store,member,prefix,store.tables.groups[source]);store.staticRandom=null;return result;
}
/** Overload without a random deliberately observes ShipNameStore's retained static random. */
export function pickOriginalShipNameFromAll(factory,member,prefix){return nameFromList(factory.names,member,prefix,factory.names.tables.all);}
export function pickOriginalFleetShipName(factory,naming,member,random){
 validateOriginalFleetNaming(naming);if(naming.sources!==null)naming.sources.random=random;
 const source=naming.sources===null?'Unknown':sourcePick(factory.names,naming.sources);
 const name=pickOriginalShipName(factory,member,random,naming.prefix,source);
 if(naming.sources!==null)naming.sources.random=null;return name;
}
/** addFleetMember uses picker.pick(random), which restores its previous random (unlike pickShipName). */
export function pickOriginalFleetMemberNameOnAdd(factory,naming,member,random){
 validateOriginalFleetNaming(naming);let source='Unknown';
 if(naming.sources!==null){const previous=naming.sources.random;naming.sources.random=random;source=sourcePick(factory.names,naming.sources);naming.sources.random=previous;}
 return pickOriginalShipName(factory,member,random,naming.prefix,source);
}
export function validateOriginalFleetNaming(naming){
 check(naming?.scope==='native-fleet-data-naming'&&(naming.prefix===null||typeof naming.prefix==='string')&&(naming.sourceFactionId===null||typeof naming.sourceFactionId==='string'),'Invalid current fleet naming state');
 const s=naming.sources;if(s!==null){check(Array.isArray(s.items)&&Array.isArray(s.weights)&&s.items.length===s.weights.length&&s.items.every(v=>typeof v==='string')&&s.weights.every(w=>Number.isFinite(w)&&f(w)===w)&&Number.isFinite(s.total)&&f(s.total)===s.total,'Invalid native name-source picker');if(s.random!==null)validateOriginalJavaRandom(s.random);}return naming;
}
export function validateOriginalFleetMemberFactory(factory,player,mathRandom){
 check(factory?.scope==='native-fleet-member-factory'&&Array.isArray(factory.members)&&factory.stockVariants&&factory.names?.scope==='web-current-ship-name-store','Invalid member factory');
 if(Object.hasOwn(factory,'defaultHullRegistry')){validateOriginalDefaultHullRegistryState(factory.defaultHullRegistry);for(const id of Object.keys(ORIGINAL_DEFAULT_HULL_MODULES.hullVariants))check(Object.hasOwn(factory.stockVariants,id)&&factory.stockVariants[id]?.objectRef==='stock-construction-variant:'+id,'Initialized default HULL registry lost cached identity: '+id);}
 else for(const id of Object.keys(factory.stockVariants))check(!requiresDefaultHullHistory(id),'Actual default hull registry initialization history required for retained stock object: '+id);

 const names=factory.names;validateOriginalJavaRandom(names.mathRandom);check(names.mathRandom===mathRandom,'Lost shared Web global name random');if(names.staticRandom!==null)validateOriginalJavaRandom(names.staticRandom);
 check(typeof names.useRomanNumerals==='boolean'&&Array.isArray(names.tables?.all)&&names.tables.all.every(n=>typeof n==='string')&&names.tables.groups&&names.uses,'Invalid current name tables');for(const list of Object.values(names.tables.groups))check(Array.isArray(list)&&list.every(n=>typeof n==='string'),'Invalid current name group');for(const n of Object.values(names.uses))check(Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Invalid current name count');
 if(factory.members.length)check(player,'Actual player/UID personnel state required by created members');
 const ids=new Set(),refs=new Set();for(const m of factory.members){
  check(m.nativeConstruction==='fleet-member-string'&&!ids.has(m.id)&&!refs.has(m.objectRef)&&['SHIP','FIGHTER_WING','NULL'].includes(m.type),'Invalid or duplicate created member');ids.add(m.id);refs.add(m.objectRef);
  check(m.captain&&m.captainRef===m.captain.objectRef&&originalPersonnelByRef(player,m.captainRef)===m.captain,'Lost shared created captain identity');
  if(m.type==='NULL')check(m.variant===null&&m.specId===null&&m.stats===null&&m.valuationLifecycle==='null-member','Invalid constructed NULL member');
  else check(m.variant?.effects&&m.stats?.nativeMemberStatsVersion===1&&m.stats.lifecycle==='current'&&m.stats.fleetMemberRef===m.objectRef&&m.stats.variantRef===m.variant.objectRef,'Missing actual constructed member statistics');
  check(m.buffManager?.memberRef===m.objectRef&&m.buffManager.objectRef===m.buffManagerRef&&m.repairTracker&&m.status?.modules?.length>0&&m.crewComposition,'Incomplete constructed member lifecycle');
  if(m.type==='FIGHTER_WING')check(Object.values(factory.stockVariants).includes(m.variant),'Lost shared fighter stock variant');
 }
 return factory;
}
/** Bind construction/naming/getters only. Real FleetData add/remove/getters/sort must still be supplied. */
export function originalFleetMemberConstructionServices(factory,player,naming,plugins={}){return {
 createMember:id=>createOriginalFleetMember(factory,player,id,'SHIP',plugins),
 pickShipName:(member,random)=>{check(naming,'Actual target FleetData naming state required');return pickOriginalFleetShipName(factory,naming,member,random);},
 setShipName:setOriginalFleetMemberName,memberFP:originalFleetPointCost,memberCivilian:originalConstructedMemberCivilian,memberHullSize:originalConstructedMemberHullSize,memberHints:originalConstructedMemberHints,
};}
