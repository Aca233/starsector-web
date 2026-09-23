/** Misc storage getters and FleetMember base valuation. Not sale quotes or a fleet-stat simulator. */
import reference from '../data/reference-storage.json' with {type:'json'};
import { immutableJSON, requireThat } from '../core/Values.mjs';
import { ORIGINAL_MARKET_REFERENCE } from './OriginalMarketPricing.mjs';
import { validateOriginalResourceCargo } from './OriginalResourceCargo.mjs';
export const ORIGINAL_STORAGE = immutableJSON(reference);
const R=ORIGINAL_STORAGE,f=Math.fround;
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_STORAGE',message);
const own=(o,id)=>typeof id==='string'&&Object.hasOwn(o,id)?o[id]:undefined;
const nativeInt=n=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
function number(n,label){check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),label+' must be a finite native float');return n;}
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(h,31)+s.charCodeAt(i))|0;return (h^(h>>>16))>>>0;}
// XStream restores HashMap entries with put(); resizing splits each bucket without changing chain order.
function mapState(){return {capacity:16,entries:[]};}
function order(map){map.entries.sort((a,b)=>(hash(a[0])&(map.capacity-1))-(hash(b[0])&(map.capacity-1)));}
function put(map,key,value){
 check(typeof key==='string'&&key.length>0&&key.length<=1024&&typeof value==='string'&&value.length>0&&value.length<=1024,'Invalid weapon map entry');
 const old=map.entries.find(e=>e[0]===key);if(old){old[1]=value;return;}
 check(map.entries.length<4096,'Weapon map work limit');map.entries.push([key,value]);
 const bucket=hash(key)&(map.capacity-1),count=map.entries.filter(e=>(hash(e[0])&(map.capacity-1))===bucket).length;
 if(count>8){check(map.capacity<64,'Treeified weapon map requires native comparator restoration');map.capacity*=2;}
 if(map.entries.length>map.capacity*0.75)map.capacity*=2;order(map);
}
function mapFrom(entries,capacity=16){check(Array.isArray(entries),'Missing weapon entries');const map={capacity,entries:[]};for(const e of entries){check(Array.isArray(e)&&e.length===2&&!map.entries.some(x=>x[0]===e[0]),'Duplicate/malformed saved weapon');put(map,...e);}return map;}
function hull(id){const h=own(R.hulls,id);check(h,'Unloaded hull base valuation: '+id);return h;}
/** Actual HullVariantSpec weapon/wing mutations; preserves retained arrays and HashMap bucket order. */
export function setOriginalVariantWeapon(variant,slotId,weaponId){
 const h=hull(variant.hullId);if(Object.hasOwn(h.builtInWeapons,slotId))return;
 check(Number.isInteger(variant.weaponMapCapacity)&&variant.weaponMapCapacity>0,'Actual weapon map capacity required');
 const map={entries:variant.weapons,capacity:variant.weaponMapCapacity};put(map,slotId,weaponId);variant.weaponMapCapacity=map.capacity;
}
export function clearOriginalVariantWeapon(variant,slotId){const at=variant.weapons.findIndex(([id])=>id===slotId);if(at>=0)variant.weapons.splice(at,1);}
export function setOriginalVariantWing(variant,index,wingId){
 check(Number.isInteger(index)&&index>=0&&index<4096&&(wingId===null||typeof wingId==='string'),'Actual bounded fighter bay and wing required');
 const built=hull(variant.hullId).builtInWings;if(index<built.length)wingId=built[index];if(wingId===null)wingId='';
 while(variant.wings.length<index+1)variant.wings.push('');variant.wings[index]=wingId;
}
/** A valuation projection of setHullSpec/readResolve. Wing-bearing members still require updateStats. */
export function restoreOriginalStorageVariant(input,{stock=false}={}){
 const h=hull(input.hullId),map=stock?mapState():mapFrom(input.weapons);
 // Both the hull built-ins and each JSONObject weapon group enumerate a Java HashMap.
 const built=mapFrom(Object.entries(h.builtInWeapons));for(const e of built.entries)put(map,...e);
 if(stock)for(const group of input.weaponGroups??[input.weapons])for(const e of mapFrom(group).entries)if(!Object.hasOwn(h.builtInWeapons,e[0]))put(map,...e);
 check(Array.isArray(input.wings)&&input.wings.length<=4096,'Missing/bounded variant wings');
 const wings=stock?[...h.builtInWings,...input.wings]:[...input.wings];for(const w of wings)check(w===null||typeof w==='string','Invalid wing ID');
 for(let i=0;i<h.builtInWings.length;i++)wings[i]=h.builtInWings[i];
 let effects=null;
 if(input.effects){
  effects=structuredClone(input.effects);if(stock&&input.effects.moduleMapOrder==='hash')effects.stationModules=mapFrom(effects.stationModules).entries;delete effects.moduleMapOrder;for(const key of ['hullMods','permaMods','sMods','sModdedBuiltIns','suppressedMods','tags'])check(Array.isArray(effects[key])&&new Set(effects[key]).size===effects[key].length&&effects[key].every(id=>typeof id==='string'&&id.length>0),'Invalid current variant '+key);
  for(const key of ['fluxVents','fluxCapacitors'])check(Number.isInteger(effects[key])&&effects[key]>=0&&effects[key]<=2147483647,'Invalid native flux allocation');
  check(Array.isArray(effects.stationModules)&&effects.stationModules.every(e=>Array.isArray(e)&&e.length===2&&e.every(v=>typeof v==='string'&&v.length>0))&&new Set(effects.stationModules.map(e=>e[0])).size===effects.stationModules.length,'Actual ordered module roster required');
  const mods=stock?[]:[...effects.hullMods],add=id=>{if(!mods.includes(id)&&(!effects.suppressedMods.includes(id)||stock))mods.push(id);};
  for(const id of h.builtInMods)add(id);
  if(stock){for(const id of [...effects.hullMods,...effects.permaMods,...effects.sMods])add(id);effects.permaMods=[...new Set([...effects.permaMods,...effects.sMods])];effects.hullMods=mods.filter(id=>!effects.suppressedMods.includes(id));}else effects.hullMods=mods;
 }
 return {hullId:h.hullId,weapons:map.entries,weaponMapCapacity:map.capacity,wings,effects,hasOpAffectingMods:null,statsForOpCosts:null,...(stock?{moduleVariants:null}:Object.hasOwn(input,'moduleVariants')?{moduleVariants:input.moduleVariants}:{})};
}
/** HullVariantSpec.clone: independent mutable arrays and HashMap.putAll capacity/order. */
export function cloneOriginalStorageVariant(input,objectRef){
 const ancestors=new Set();function clone(value,ref){
  check(typeof ref==='string'&&value?.objectRef&&Array.isArray(value.weapons),'Actual current variant and clone identity required');check(!ancestors.has(value)&&ancestors.size<48,'Cyclic or excessive module-variant clone');ancestors.add(value);
  const {statsForOpCosts,...uncached}=value,result=structuredClone(uncached);result.objectRef=ref;
  // Native Object.clone retains the OP cache and its original variant reference until invalidated.
  if(Object.hasOwn(value,'statsForOpCosts'))result.statsForOpCosts=statsForOpCosts;
  if(value.weapons.length){let capacity=1;while(capacity<Math.floor(value.weapons.length/0.75+1))capacity*=2;const map=mapFrom(value.weapons,capacity);result.weapons=map.entries;result.weaponMapCapacity=map.capacity;}else{result.weapons=[];result.weaponMapCapacity=16;}
  if(Object.hasOwn(value,'moduleVariants')&&value.moduleVariants!==null){check(Array.isArray(value.moduleVariants),'Actual module variant map required');const keys=mapFrom(value.moduleVariants.map(([key])=>[key,key])).entries;result.moduleVariants=keys.map(([key])=>[key,clone(value.moduleVariants.find(([id])=>id===key)[1],ref+':module:'+key)]);}
  ancestors.delete(value);return result;
 }return clone(input,objectRef);
}
export function restoreOriginalStoredMember(member){
 check(['SHIP','FIGHTER_WING','NULL'].includes(member.type),'Unknown fleet member type');
 if(member.type==='NULL')return {...member,variant:null,valuationLifecycle:'null-member'};
 let input=member.savedVariant,stock=false;
 if(!input||member.type==='FIGHTER_WING'){let id=member.specId;if(member.type==='FIGHTER_WING'){const wing=own(R.wings,id);check(wing,'Missing fighter spec');id=wing.variantId;}input=own(R.variants,id);check(input,'Unloaded member variant: '+id);stock=true;}
 const variant=restoreOriginalStorageVariant(input,{stock});variant.objectRef=stock?(member.type==='SHIP'?'created-member-variant:'+member.objectRef:'stock-wing-variant:'+member.specId):input.objectRef;
 if(stock&&member.type==='SHIP'&&variant.weapons.length){let capacity=1;while(capacity<Math.floor(variant.weapons.length/0.75+1))capacity*=2;const cloned=mapFrom(variant.weapons,capacity);variant.weapons=cloned.entries;variant.weaponMapCapacity=cloned.capacity;}
 return {...member,variant,valuationLifecycle:variant.wings.some(w=>w!==null&&w!=='')?'wing-stats-required':'no-wing-base-valuation'};
}
export function originalStorageAccess(storage){
 check(storage?.scope==='native-storage-current-objects'&&storage.unresolved.length===0,'Actual storage plugin capture required');
 check(storage.classAlias==='StoragePlugin'&&typeof storage.playerPaidToUnlock==='boolean','Unknown storage access plugin');
 return storage.playerPaidToUnlock;
}
/** BaseSubmarketPlugin.getCargo. Existing captures are never silently upgraded/replaced. */
export function ensureOriginalStorageCargo(storage,services={}){
 check(storage?.scope==='native-storage-current-objects'&&storage.unresolved.length===0,'Actual storage capture required');
 if(storage.cargo!==null)return storage.cargo;
 check(typeof storage.factionId==='string'&&storage.factionId.length>0,'Submarket faction required for lazy mothballed fleet');
 check(typeof services.createStorageCargo==='function'&&typeof services.initializeStorageMothballedShips==='function','Actual storage Cargo/FleetData constructor services required');
 const cargo=services.createStorageCargo(storage);
 check(cargo&&typeof cargo.objectRef==='string'&&cargo.carryingFleetRef===null&&cargo.mothballedShips===null&&cargo.credits?.objectRef===cargo.creditsRef,'Actual new unattached storage Cargo required');
 validateOriginalResourceCargo(cargo);storage.cargo=cargo;
 const initialized=services.initializeStorageMothballedShips(cargo,storage.factionId);check(!initialized||typeof initialized.then!=='function','Storage construction must be synchronous');
 check(cargo.mothballedShips?.nativeSyncScope==='native-fleet-data-sync-inputs','Actual initialized storage FleetData required');
 storage.mothballed=cargo.mothballedShips;cargo.mothballedShipsRef=storage.mothballed.dataRef;
 return cargo;
}
export function originalStorageStackBaseValue(stack,dependencies={}){
 check(stack&&typeof stack.type==='string','Missing cargo stack');let value;
 if(stack.type==='RESOURCES'){const spec=own(ORIGINAL_MARKET_REFERENCE.commodities,stack.commodityId);check(spec&&!spec.plugin,'Missing resource base value');value=spec.basePrice;}
 else if(stack.type==='WEAPONS'){value=own(R.weapons,stack.itemId);check(value!==undefined,'Missing weapon base value');}
 else if(stack.type==='FIGHTER_CHIP'){const wing=own(R.wings,stack.itemId);check(wing,'Missing LPC base value');value=wing.baseValue;}
 else if(stack.type==='SPECIAL'){
  check(typeof dependencies.readSpecialItemPrice==='function','Actual special item plugin.getPrice(null,null) required');
  value=dependencies.readSpecialItemPrice(stack,null,null);check(Number.isInteger(value)&&value>=-2147483648&&value<=2147483647,'Special item price must be a native int');return value;
 }else{check(stack.type==='NULL','Unknown cargo stack type');return 10;}
 return nativeInt(number(value,'Base value'));
}
/** Read current variant handles every time. No cached totals, sell multipliers, CR or D-mod discounts here. */
export function originalStoredMemberBaseValue(member,dependencies={}){
 check(member&&member.type!=='NULL','NULL members must be removed by the fleet roster getter');
 let variant=member.variant;
 if(member.valuationLifecycle==='wing-stats-required'||member.valuationLifecycle==='no-wing-base-valuation'&&variant?.wings?.some(w=>w!==null&&w!=='')){
  check(typeof dependencies.readCurrentStoredVariant==='function','Actual current stored carrier variant after updateStats required');
  variant=dependencies.readCurrentStoredVariant(member);check(variant&&typeof variant.then!=='function','Current variant getter must be synchronous');
 }else check(member.valuationLifecycle==='no-wing-base-valuation'||member.valuationLifecycle==='current-fleet-variant','Stored member lifecycle not restored');
 const h=hull(variant?.hullId);check(Array.isArray(variant.weapons)&&Array.isArray(variant.wings),'Current variant data required');
 const capacity=variant.weaponMapCapacity;check(Number.isInteger(capacity)&&capacity>=1&&capacity<=8192&&(capacity&(capacity-1))===0,'Missing actual weapon map capacity');
 const seen=new Set();let previous=-1,result=0;
 for(const [slot,id] of variant.weapons){const bucket=hash(slot)&(capacity-1);check(bucket>=previous&&!seen.has(slot),'Current weapon map is not in native bucket order');previous=bucket;seen.add(slot);if(Object.hasOwn(h.builtInWeapons,slot))continue;
  const value=own(R.weapons,id);check(value!==undefined,'Unloaded fitted weapon: '+id);result=f(result+value);
 }
 let counted=0;for(const id of variant.wings){if(id===null||id===''||counted++<h.builtInWings.length)continue;const wing=own(R.wings,id);check(wing,'Unloaded fitted wing');result=f(result+wing.baseValue);}
 return f(h.baseValue+result);
}
export function originalStorageValues(storage,dependencies={}){
 const cargo=ensureOriginalStorageCargo(storage,dependencies);check(cargo.unresolved.length===0,'Stored cargo owner lifecycle not restored');validateOriginalResourceCargo(cargo);
 let cargoValue=0,shipsValue=0;
 for(const stack of cargo.slots){if(stack===null)continue;cargoValue=f(cargoValue+f(number(stack.size,'Cargo size')*f(originalStorageStackBaseValue(stack,dependencies))));}
 // Misc.getStorageShipValue dereferences the fleet: a missing capture cannot become zero.
 {const fleet=storage.mothballed;check(fleet&&fleet.objectRef===cargo.mothballedShipsRef,'Actual mothballed fleet binding required');
  let members;
  if(fleet.nativeSyncScope==='native-fleet-data-sync-inputs'){
   check(cargo.mothballedShips===fleet&&typeof dependencies.readStorageFleetMembers==='function','Actual storage FleetData synchronization service required');
   members=dependencies.readStorageFleetMembers(fleet);check(Array.isArray(members),'Synchronous current storage roster required');
  }else{check(fleet.unresolved?.length===0,'Stored fleet capture unresolved');members=fleet.members;}
  for(const member of members)if(member!==null&&member.type!=='NULL')shipsValue=f(shipsValue+originalStoredMemberBaseValue(member,dependencies));
 }
 return {cargo:number(cargoValue,'Stored cargo total'),ships:number(shipsValue,'Stored ship total')};
}

/** Structural check only: no lazy creation, repricing, callbacks or replay on checkpoint restore. */
export function validateOriginalStorageState(storage){
 check(storage?.scope==='native-storage-current-objects'&&Array.isArray(storage.unresolved),'Invalid storage state');
 if(storage.cargo!==null){validateOriginalResourceCargo(storage.cargo);check(Array.isArray(storage.cargo.unresolved),'Missing cargo restore state');if(Object.hasOwn(storage.cargo,'mothballedShips'))check(storage.cargo.mothballedShips===storage.mothballed,'Lost actual storage fleet link');}
 if(storage.mothballed!==null){const fleet=storage.mothballed;check(fleet&&storage.cargo&&fleet.objectRef===storage.cargo.mothballedShipsRef&&Array.isArray(fleet.members),'Lost mothballed fleet identity');
  if(fleet.nativeSyncScope==='native-fleet-data-sync-inputs')check(storage.cargo.mothballedShips===fleet&&fleet.dataRef===storage.cargo.mothballedShipsRef,'Lost actual storage Cargo/FleetData sharing');
  else check(Array.isArray(fleet.unresolved)&&!Object.hasOwn(storage.cargo,'mothballedShips'),'Incomplete retained storage fleet cannot impersonate an actual FleetData');
  for(const m of fleet.members)if(m!==null){check(typeof m.objectRef==='string'&&['SHIP','FIGHTER_WING','NULL'].includes(m.type),'Invalid stored member');if(m.variant!==null)check(typeof m.variant.objectRef==='string'&&Array.isArray(m.variant.weapons)&&Array.isArray(m.variant.wings),'Missing current stored variant');}
 }
}
