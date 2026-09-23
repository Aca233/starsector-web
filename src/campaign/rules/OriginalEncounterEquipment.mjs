/** FleetEncounterContext equipment drops on actual member variants and Cargo. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {ORIGINAL_STORAGE} from './OriginalStorage.mjs';
import {ORIGINAL_FLEET_MEMBERS} from './OriginalFleetMembers.mjs';
import {ORIGINAL_FLEET_SYNC} from './OriginalFleetData.mjs';
import {originalJavaNextFloat,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalPersonMemoryWithoutUpdate} from './OriginalPersonAdvance.mjs';
import {originalCampaignMemoryContains,originalCampaignMemoryGet,originalCampaignMemoryBoolean} from './OriginalCampaignMemory.mjs';
import {addOriginalNativeCargoItems,originalNativeCargoItemSpec} from './OriginalNativeCargo.mjs';
import {encounterCheck as check,encounterCall as call,encounterFloat as num,encounterBool as bool} from './OriginalEncounterState.mjs';
const f=Math.fround;
export function originalEncounterSalvageSetting(key,services={}){return num(services.readEncounterSalvageSetting?call(services,'readEncounterSalvageSetting',key):R.settings[key]);}
export function originalEncounterSalvageRandom(state,services={}){
 check(state.salvageRandom!==undefined,'Actual nullable salvage random required');const random=state.salvageRandom===null?call(services,'readEncounterMiscRandom'):state.salvageRandom;validateOriginalJavaRandom(random);
 if(state.salvageRandom===null)check(random!==services.globalRandom,'Misc.random must be independent of Math.random');return random;
}
export function originalEncounterFleetDynamic(fleet,key,base){
 const s=fleet.stats;check(s?.dynamic&&s.dynamicStats,'Actual dynamic fleet stats required');
 return base===undefined?(Object.hasOwn(s.dynamicStats,key)?effective(s.dynamicStats[key]):1):(Object.hasOwn(s.dynamic,key)?effective({base:num(base),modifiers:s.dynamic[key]}):base);
}
function hull(variant){const h=ORIGINAL_STORAGE.hulls[variant.hullId];check(h,'Actual hull built-in equipment required');return h;}
function effects(variant){check(variant.effects&&Array.isArray(variant.effects.tags)&&Array.isArray(variant.effects.hullMods),'Actual current variant effects required');return variant.effects;}
function* modules(variant,services){
 const slots=ORIGINAL_FLEET_MEMBERS.hulls[variant.hullId]?.slots;check(slots&&Array.isArray(effects(variant).stationModules),'Actual ordered module slots required');
 // getModuleSlots snapshots slot IDs, but getModuleVariant runs only when each recursive turn reaches it.
 const ids=variant.effects.stationModules.filter(([slot])=>{check(Object.hasOwn(slots,slot),'Actual station module slot required');return slots[slot]==='STATION_MODULE';}).map(([slot])=>slot);
 for(const slot of ids){
  let module;if(!Object.hasOwn(variant,'moduleVariants'))module=call(services,'readEncounterModuleVariant',variant,slot);
  else{check(variant.moduleVariants===null||Array.isArray(variant.moduleVariants),'Actual nullable module overrides required');const override=variant.moduleVariants?.find(row=>row[0]===slot),id=variant.effects.stationModules.find(row=>row[0]===slot)?.[1]??null;module=override?override[1]:id===null?null:call(services,'readEncounterStockVariant',id);}
  check(module!==undefined,'Actual nullable module variant required');if(module!==null)yield module;
 }
}
function memory(captain){return originalPersonMemoryWithoutUpdate(captain);}
function stringMemory(m,key,services){const value=originalCampaignMemoryGet(m,key,services.memoryServices);check(value===null||typeof value==='string','Actual String memory value required: '+key);return value;}
const add=(state,type,itemId,amount,services,itemData)=>addOriginalNativeCargoItems(state.loot,type==='RESOURCES'?{type,commodityId:itemId}:type==='SPECIAL'?{type,itemId,itemData}:{type,itemId},amount,services);
function requiredItem(id,services){
 if(services.readEncounterHullmodRequiredItem)return call(services,'readEncounterHullmodRequiredItem',id);
 const spec=R.hullmods[id];check(spec,'Actual hullmod spec required');if(spec.requiredItem==='default-null')return null;
 return call(services,'readEncounterHullmodRequiredItem',id);
}
export function returnOriginalEncounterHullmodItems(state,member,services={}){
 if(services.returnEncounterHullmodItems){call(services,'returnEncounterHullmodItems',member,state.loot);return;}
 const manager=call(services,'readEncounterHullmodItemManager');check(manager?.scope==='native-hullmod-item-manager'&&Array.isArray(manager.map),'Actual registered HullModItemManager required');
 let list=manager.map.find(row=>row.memberId===member.id);if(!list){list={memberId:member.id,installed:[]};manager.map.push(list);}
 for(const id of list.installed.map(row=>row.modId)){
  if(requiredItem(id,services)===null)continue;const index=list.installed.findIndex(row=>row.modId===id);if(index<0)continue;const data=list.installed.splice(index,1)[0];addOriginalNativeCargoItems(state.loot,data.item,1,services);
 }
 for(let i=manager.map.length-1;i>=0;i--)if(manager.map[i].installed.length===0)manager.map.splice(i,1);
}
export function lootOriginalEncounterWeapons(state,member,variant,own,mult,lootingModule=false,services={},ancestors=new Set()){
 if(variant===null||member.type==='FIGHTER_WING')return;bool(own);num(mult);check(!ancestors.has(variant),'Cyclic equipment module graph');const next=new Set(ancestors);next.add(variant);
 const captain=()=>call(services,'readEncounterCaptain',member),hasTag=tag=>effects(variant).tags.includes(tag);
 if(own&&!lootingModule){const p=captain();if(p!==null){const m=memory(p);if(originalCampaignMemoryContains(m,'$aiCoreIdForRecovery',services.memoryServices)&&!originalCampaignMemoryBoolean(m,'$captain_unremovable',services.memoryServices))add(state,'RESOURCES',stringMemory(m,'$aiCoreIdForRecovery',services),1,services);}}
 if(own)returnOriginalEncounterHullmodItems(state,member,services);
 const random=originalEncounterSalvageRandom(state,services);let coreOverride=null;const p=captain();if(p!==null&&originalCampaignMemoryContains(memory(p),'$aiCoreIdForPossibleRecovery',services.memoryServices))coreOverride=stringMemory(memory(p),'$aiCoreIdForPossibleRecovery',services);
 if(!own&&!lootingModule){const person=captain();check(person&&Object.hasOwn(person,'aiCoreId'),'Actual captain AI core field required');
  if((person.aiCoreId!==null||coreOverride!==null)&&!hasTag('no_ai_core_drop')){
   const id=coreOverride??captain().aiCoreId;if(id!==null&&!originalNativeCargoItemSpec({type:'RESOURCES',commodityId:id}).tags.includes('no_drop')){
    let probability=originalEncounterSalvageSetting('drop_prob_officer_'+id,services);const h=ORIGINAL_FLEET_SYNC.hulls[member.variant.hullId];check(h,'Actual member hull size required');const suffix=h.hints.includes('STATION')?'station':({FRIGATE:'frigate',DESTROYER:'destroyer',CRUISER:'cruiser',CAPITAL_SHIP:'capital'})[h.hullSize];
    if(suffix)probability=f(probability*originalEncounterSalvageSetting('drop_prob_mult_ai_core_'+suffix,services));if(probability>0&&originalJavaNextFloat(random)<probability)add(state,'RESOURCES',id,1,services);
   }
  }
 }
 let probability=originalEncounterSalvageSetting('salvageWeaponProb',services);if(own)probability=originalEncounterSalvageSetting('salvageOwnWeaponProb',services);
 probability=originalEncounterFleetDynamic(call(services,'readBattlePlayerFleet'),own?'own_weapon_recovery_mod':'enemy_weapon_recovery_mod',probability);
 const stripped=state.recoverableShips.includes(member),removed=new Set(),built=hull(variant).builtInWeapons,slots=variant.weapons.filter(([slot])=>!Object.hasOwn(built,slot));
 if(hasTag('consistent_weapon_drops'))for(const [slot,id]of slots){if(id===null||state.loot.slots.some(s=>s?.type==='WEAPONS'&&s.itemId===id&&s.size>0)||originalNativeCargoItemSpec({type:'WEAPONS',itemId:id}).tags.includes('no_drop'))continue;add(state,'WEAPONS',id,1,services);removed.add(slot);}
 for(const [slot,id]of slots){if(removed.has(slot)||!stripped&&(originalJavaNextFloat(random)>mult||originalJavaNextFloat(random)>probability))continue;if(originalNativeCargoItemSpec({type:'WEAPONS',itemId:id}).tags.includes('no_drop'))continue;add(state,'WEAPONS',id,1,services);removed.add(slot);}
 for(const module of modules(variant,services))lootOriginalEncounterWeapons(state,member,module,own,mult,true,services,next);
}
export function lootOriginalEncounterWings(state,member,variant,own,mult,services={},ancestors=new Set()){
 if(variant===null||member.type==='FIGHTER_WING')return;bool(own);num(mult);check(!ancestors.has(variant),'Cyclic wing module graph');const next=new Set(ancestors);next.add(variant);
 const random=originalEncounterSalvageRandom(state,services);let probability=originalEncounterSalvageSetting('salvageWingProb',services);if(own)probability=originalEncounterSalvageSetting('salvageOwnWingProb',services);
 probability=originalEncounterFleetDynamic(call(services,'readBattlePlayerFleet'),own?'own_wing_recovery_mod':'enemy_wing_recovery_mod',probability);
 const stripped=state.recoverableShips.includes(member),built=hull(variant).builtInWings.length;let index=0;
 for(const id of variant.wings){if(id===null||id===''||index++<built)continue;if(!stripped&&(originalJavaNextFloat(random)>mult||originalJavaNextFloat(random)>probability)||originalNativeCargoItemSpec({type:'FIGHTER_CHIP',itemId:id}).tags.includes('no_drop'))continue;add(state,'FIGHTER_CHIP',id,1,services);}
 for(const module of modules(variant,services))lootOriginalEncounterWings(state,member,module,own,mult,services,next);
}
export function lootOriginalEncounterHullmods(state,member,variant,mult,services={},ancestors=new Set()){
 if(variant===null||member.type==='FIGHTER_WING')return;num(mult);check(!ancestors.has(variant),'Cyclic hullmod module graph');const next=new Set(ancestors);next.add(variant);
 const random=originalEncounterSalvageRandom(state,services),p=originalEncounterSalvageSetting('salvageHullmodProb',services),pItem=originalEncounterSalvageSetting('salvageHullmodRequiredItemProb',services),built=hull(variant).builtInMods;
 for(const id of effects(variant).hullMods){
  if(!built.includes(id)&&originalJavaNextFloat(random)<pItem&&originalJavaNextFloat(random)<mult){const item=requiredItem(id,services);check(item!==undefined,'Actual nullable required item required');if(item!==null&&!originalNativeCargoItemSpec(item).tags.includes('no_drop'))addOriginalNativeCargoItems(state.loot,item,1,services);}
  if(!(originalJavaNextFloat(random)<p)||!(originalJavaNextFloat(random)<mult))continue;const spec=R.hullmods[id];check(spec,'Actual hullmod spec required');let known=bool(call(services,'isEncounterPlayerHullmodKnown',id));
  if(services.allowEncounterKnownHullmodDrops&&bool(call(services,'allowEncounterKnownHullmodDrops')))known=false;
  if(known||spec.hidden||spec.hiddenEverywhere||spec.tags.includes('no_drop'))continue;add(state,'SPECIAL','modspec',1,services,id);
 }
 for(const module of modules(variant,services))lootOriginalEncounterHullmods(state,member,module,mult,services,next);
}
