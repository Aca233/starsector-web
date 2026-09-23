/** HullVariantSpec constructors and module factory rules. No registry/world registration. */
import {requireThat} from '../core/Values.mjs';
import {ORIGINAL_STORAGE,cloneOriginalStorageVariant} from './OriginalStorage.mjs';
import {ORIGINAL_FLEET_MEMBERS,originalFleetStockVariant} from './OriginalFleetMembers.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_EMPTY_VARIANT',message);
const sources=[null,'STOCK','MISSION_DESIGN','MISSION_SAVE','REFIT','HULL'];
const sharedFields=['hullSpec','statsForOpCosts','savedModuleVariants'];
const nativeHulls=new Map();
const own=(o,k)=>o!==null&&typeof o==='object'&&Object.hasOwn(o,k);
function key(value,label){check(typeof value==='string'&&value.length>0&&value.length<=1024,label+' required');return value;}
function call(services,name,...args){
 check(typeof services?.[name]==='function','Actual variant service required: '+name);
 const result=services[name](...args);check(!result||typeof result.then!=='function','Variant services must be synchronous');return result;
}
function stringSet(value,label){check(Array.isArray(value)&&value.length<=4096&&value.every(x=>typeof x==='string'&&x.length>0)&&new Set(value).size===value.length,'Actual ordered '+label+' required');}
function entries(value,label){check(Array.isArray(value)&&value.length<=4096&&value.every(e=>Array.isArray(e)&&e.length===2&&typeof e[0]==='string'&&e[0].length>0)&&new Set(value.map(e=>e[0])).size===value.length,'Actual unique '+label+' required');return value;}
function effects(v){check(v?.effects&&typeof v.effects==='object','Actual variant effects required');entries(v.effects.stationModules,'station module roster');return v.effects;}
function variant(v){
 check(v&&typeof v==='object','Actual variant required');key(v.objectRef,'Variant object identity');key(v.hullVariantId,'Native hullVariantId');key(v.hullId,'Native hull ID');
 check(own(v,'variantSource')&&sources.includes(v.variantSource),'Actual nullable native variant source required');return v;
}
function overrides(v){
 check(own(v,'moduleVariants'),'Uncaptured module overrides cannot be treated as empty');
 if(v.moduleVariants!==null){entries(v.moduleVariants,'module override map');for(const [,child]of v.moduleVariants)variant(child);}
 return v.moduleVariants;
}
/** Java HashMap iteration, for fresh maps only; tree bins require a replacement implementation. */
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(h,31)+s.charCodeAt(i))|0;return (h^(h>>>16))>>>0;}
function put(map,k,value){
 key(k,'Map key');const old=map.entries.find(e=>e[0]===k);if(old){old[1]=value;return;}
 check(map.entries.length<4096,'Variant map work limit');map.entries.push([k,value]);
 const bucket=hash(k)&(map.capacity-1),count=map.entries.filter(e=>(hash(e[0])&(map.capacity-1))===bucket).length;
 if(count>8){check(map.capacity<64,'Treeified variant map requires actual native comparator ordering');map.capacity*=2;}
 if(map.entries.length>map.capacity*0.75)map.capacity*=2;
 map.entries.sort((a,b)=>(hash(a[0])&(map.capacity-1))-(hash(b[0])&(map.capacity-1)));
}
function linkedPut(rows,k,value){const row=rows.find(e=>e[0]===k);if(row)row[1]=value;else rows.push([k,value]);}
function validateHull(h,id){
 check(h&&h.hullId===id&&h.builtInWeapons&&typeof h.builtInWeapons==='object'&&!Array.isArray(h.builtInWeapons)&&h.slots&&typeof h.slots==='object'&&!Array.isArray(h.slots),'Actual hull built-ins and weapon slots required: '+id);
 stringSet(h.builtInMods,'built-in mods');check(Array.isArray(h.builtInWings)&&h.builtInWings.length<=4096&&h.builtInWings.every(x=>typeof x==='string'),'Actual ordered built-in wings required');
 for(const [slot,weapon]of Object.entries(h.builtInWeapons)){key(slot,'Built-in slot');key(weapon,'Built-in weapon');}
 check(Object.values(h.slots).every(x=>typeof x==='string'),'Actual weapon slot types required');return h;
}
/** Canonical immutable public-spec view, never a member, stock variant, or placeholder. */
export function originalEmptyVariantHull(hullId,services={}){
 key(hullId,'Hull ID');if(own(services,'readEmptyVariantHull'))return validateHull(call(services,'readEmptyVariantHull',hullId),hullId);
 if(nativeHulls.has(hullId))return nativeHulls.get(hullId);
 check(own(ORIGINAL_STORAGE.hulls,hullId)&&own(ORIGINAL_FLEET_MEMBERS.hulls,hullId),'Unloaded empty-variant hull: '+hullId);
 const spec=Object.freeze({...ORIGINAL_STORAGE.hulls[hullId],slots:ORIGINAL_FLEET_MEMBERS.hulls[hullId].slots});validateHull(spec,hullId);nativeHulls.set(hullId,spec);return spec;
}
function hullFor(v,services){return own(v,'hullSpec')?validateHull(v.hullSpec,v.hullId):originalEmptyVariantHull(v.hullId,services);}
function text(services,id){const value=own(services,'readEmptyVariantText')?call(services,'readEmptyVariantText',id):id==='standard'?'标准':'特装';check(typeof value==='string','Actual variant display text required');return value;}
/** SettingsAPI.createEmptyVariant: no auto ID, STOCK/HULL source, registry entry or modules. */
export function createOriginalEmptyVariant(objectRef,hullVariantId,hullId,services={}){
 key(objectRef,'Fresh variant object identity');key(hullVariantId,'Requested variant ID');const hull=originalEmptyVariantHull(hullId,services),built={entries:[],capacity:16},weapons={entries:[],capacity:16};
 // getBuiltInWeapons().keySet, then the constructor's separate new HashMap.put sequence.
 for(const [slot,id]of Object.entries(hull.builtInWeapons))put(built,slot,id);
 for(const [slot,id]of built.entries){
  let resolved=id;if(own(services,'readEmptyVariantWeaponId'))resolved=call(services,'readEmptyVariantWeaponId',id);
  else check(own(ORIGINAL_STORAGE.weapons,id),'Unloaded built-in weapon: '+id);
  key(resolved,'Actual built-in weapon spec ID');put(weapons,slot,resolved);
 }
 return {objectRef,hullId,hullSpec:hull,hullVariantId,displayName:'Strike',variantSource:null,sourceDetail:null,sourcePath:null,goalVariant:false,mayAutoAssignWeapons:true,originalVariant:null,
  weapons:weapons.entries,weaponMapCapacity:weapons.capacity,wings:[...hull.builtInWings],groupSpecs:[],
  effects:{hullMods:[...hull.builtInMods],permaMods:[],sMods:[],sModdedBuiltIns:[],suppressedMods:[],tags:[],fluxVents:0,fluxCapacitors:0,stationModules:[]},
  moduleVariants:null,moduleVariantMapCapacity:null,savedModuleVariants:null,hasOpAffectingMods:null,statsForOpCosts:null};
}
/** ShipHull*Loader constructor stage only. Caller registers once, then runs default-module pass. */
export function createOriginalRegisteredHullVariant(objectRef,hullId,services={}){
 const v=createOriginalEmptyVariant(objectRef,hullId+'_Hull',hullId,services);v.variantSource='HULL';v.displayName=text(services,Object.keys(v.hullSpec.slots).length?'custom':'standard');return v;
}
export function originalVariantIsStock(v){return variant(v).variantSource==='STOCK';}
/** Empty hull ignores flux, tags, module contents and permaMod sets; blank extra wing bays still count. */
export function originalVariantIsEmptyHull(v,services={}){
 variant(v);const h=hullFor(v,services),e=effects(v);stringSet(e.hullMods,'hull mods');entries(v.weapons,'weapons');check(Array.isArray(v.wings),'Actual wing list required');
 return !e.hullMods.some(id=>!h.builtInMods.includes(id))&&v.wings.length<=h.builtInWings.length&&!v.weapons.some(([slot])=>!own(h.builtInWeapons,slot))&&v.variantSource==='HULL';
}
export function originalVariantOriginalId(v,services){
 variant(v);check(v.originalVariant===null||typeof v.originalVariant==='string','Actual nullable originalVariant required');if(v.originalVariant!==null)return v.originalVariant;
 const registered=call(services,'isVariantRegistered',v.hullVariantId);check(typeof registered==='boolean','Actual B.containsKey result required');return registered?v.hullVariantId:null;
}
export function originalVariantModuleSlots(v,services={}){
 variant(v);const slots=hullFor(v,services).slots;return effects(v).stationModules.filter(([slot])=>{check(own(slots,slot),'Missing module roster weapon slot: '+slot);return slots[slot]==='STATION_MODULE';}).map(([slot])=>slot);
}
/** Explicit overrides win even outside the station-slot roster; fallback returns the shared object. */
export function originalVariantModule(v,slotId,services={}){
 variant(v);key(slotId,'Module slot');const rows=overrides(v),override=rows?.find(([slot])=>slot===slotId);if(override)return override[1];
 if(!originalVariantModuleSlots(v,services).includes(slotId))return null;
 const id=effects(v).stationModules.find(([slot])=>slot===slotId)[1];if(id===null)return null;key(id,'Module variant ID');
 const module=call(services,'readRegisteredVariant',id);check(module!==null,'Unloaded registered module variant: '+id);return variant(module);
}
/** No cloning here: non-STOCK modules retain exact object identity; null/STOCK do not edit roster IDs. */
export function setOriginalVariantModule(v,slotId,module){
 variant(v);key(slotId,'Module slot');const rows=overrides(v);effects(v);if(module!==null)variant(module);
 if(module===null||originalVariantIsStock(module)){
  if(rows!==null){const at=rows.findIndex(([slot])=>slot===slotId);if(at>=0)rows.splice(at,1);
   if(rows.length===0||(module!==null&&!rows.some(([,child])=>!originalVariantIsStock(child)))){v.moduleVariants=null;v.moduleVariantMapCapacity=null;}}
  return;
 }
 const capacity=rows===null?16:v.moduleVariantMapCapacity;
 check(Number.isInteger(capacity)&&capacity>=16&&capacity<=8192&&(capacity&(capacity-1))===0,'Actual module HashMap capacity required; unknown history cannot be guessed');
 const map={entries:rows===null?[]:rows.map(([k,value])=>[k,value]),capacity};put(map,slotId,module);
 if(rows===null)v.moduleVariants=map.entries;else rows.splice(0,rows.length,...map.entries);
 v.moduleVariantMapCapacity=map.capacity;linkedPut(effects(v).stationModules,slotId,module.hullVariantId);
}
/** Reuse the existing native collection clone, excluding Object.clone's shallow-reference fields. */
export function cloneOriginalModuleVariant(input,objectRef){
 key(objectRef,'Fresh clone object identity');const ancestors=new Set(),refs=new Set(),sourceRefs=new Map();let count=0;
 function prepare(v){
  variant(v);check(!ancestors.has(v)&&ancestors.size<48&&++count<=4096,'Cyclic or excessive module variant clone');ancestors.add(v);
  check(!sourceRefs.has(v.objectRef)||sourceRefs.get(v.objectRef)===v,'Split source module variant identity');sourceRefs.set(v.objectRef,v);
  const copy={...v};for(const field of sharedFields)delete copy[field];const rows=overrides(v);
  if(rows!==null)copy.moduleVariants=rows.map(([slot,child])=>[slot,prepare(child)]);ancestors.delete(v);return copy;
 }
 const cloned=cloneOriginalStorageVariant(prepare(input),objectRef);
 function restore(source,dest){
  check(!refs.has(dest.objectRef)&&!sourceRefs.has(dest.objectRef),'Ambiguous or reused module clone identity');refs.add(dest.objectRef);
  for(const field of sharedFields)if(own(source,field))dest[field]=source[field];
  if(source.moduleVariants===null){dest.moduleVariantMapCapacity=null;return;}
  const map={entries:[],capacity:16};for(const [slot,child]of source.moduleVariants){const childClone=dest.moduleVariants.find(([id])=>id===slot)[1];restore(child,childClone);put(map,slot,childClone);}
  dest.moduleVariants=map.entries;dest.moduleVariantMapCapacity=map.capacity;
 }
 restore(input,cloned);return cloned;
}
/** SpecStore's D-parent/restore-to-base rule, including its nullable D-parent fallbacks. */
export function originalDefaultModuleHullId(h){
 check(h&&typeof h.isDefaultDHull==='boolean'&&typeof h.isRestoreToBase==='boolean','Actual D-hull restoration flags required');key(h.hullId,'Module hull ID');
 check(h.dParentHullId===null||typeof h.dParentHullId==='string','Actual nullable D-parent hull required');check(h.baseHullId===null||typeof h.baseHullId==='string','Actual nullable base hull required');
 let id=h.dParentHullId;if(!h.isDefaultDHull&&!h.isRestoreToBase)id=h.hullId;if(id===null&&h.isRestoreToBase)id=h.baseHullId;return key(id===null?h.hullId:id,'Restored module hull ID');
}
/** SpecStore.oO0000 AFTER registry loading, BEFORE mission variants. Mutates the actual registry.
 * Requires the native B.keySet snapshot, not sorted IDs/JSON enumeration. Run in caller transaction. */
export function initializeOriginalDefaultHullModules(services){
 const identities=new Map();
 const read=id=>{const value=call(services,'readRegisteredVariant',id);check(value===null||value&&typeof value==='object','Actual registered variant or known null required');check(!identities.has(id)||identities.get(id)===value,'Registry service lost shared variant identity: '+id);identities.set(id,value);return value;};
 const ids=call(services,'readVariantRegistryOrder');check(Array.isArray(ids)&&ids.length<=32768&&ids.every(id=>typeof id==='string'&&id.length>0)&&new Set(ids).size===ids.length,'Actual ordered native variant registry IDs required');
 let assigned=0,templates=0,work=0;
 for(const id of [...ids]){
  const v=variant(read(id));if(originalVariantIsEmptyHull(v,services))continue;const e=effects(v);stringSet(e.tags,'variant tags');if(e.tags.includes('skip_for_default_hull_modules'))continue;
  const empty=read(v.hullId+'_Hull');check(empty===null||empty&&typeof empty==='object','Actual nullable registered hull variant required');if(empty===null)continue;variant(empty);
  const target=effects(empty).stationModules;if(target.length||!e.stationModules.length)continue;templates++;
  // Native iterates stationModules, NOT getModuleSlots: decorative/non-station entries are included.
  for(const [slot,moduleId]of e.stationModules){
   check(++work<=250000,'Default module initialization work limit');key(moduleId,'Template module ID');const module=variant(read(moduleId));
   const h=call(services,'readModuleHullRestoration',module.hullId);check(h?.hullId===module.hullId,'Actual module hull restoration spec required');const hullId=originalDefaultModuleHullId(h),variantId=hullId+'_Hull';
   const defaultModule=read(variantId);check(defaultModule===null||defaultModule&&typeof defaultModule==='object','Actual nullable default module required');if(defaultModule===null)continue;variant(defaultModule);
   defaultModule.displayName=text(services,'standard');linkedPut(target,slot,variantId);assigned++;
  }
 }
 return {scope:'native-default-hull-modules',templates,assigned};
}

/** Thin adapter for the existing member factory; no new registry, NPC/D-mod services or authority gate. */
export function originalEmptyVariantFactoryServices(memberFactory,allocateObjectRef,services={}){
 check(memberFactory?.scope==='native-fleet-member-factory'&&memberFactory.stockVariants,'Actual current member factory required');check(typeof allocateObjectRef==='function','Persistent Web variant object allocator required');
 const readRegisteredVariant=id=>own(services,'readRegisteredVariant')?call(services,'readRegisteredVariant',id):originalFleetStockVariant(memberFactory,id);
 const bound={...services,readRegisteredVariant};
 const allocate=()=>key(allocateObjectRef(),'Fresh Web variant object identity');
 return {
  readInflaterStockVariant:id=>variant(readRegisteredVariant(id)),
  createInflaterEmptyVariant:(id,hullId)=>createOriginalEmptyVariant(allocate(),id,hullId,bound),
  readModuleVariant:(v,slot)=>originalVariantModule(v,slot,bound),
  cloneVariant:v=>{const ref=allocate();check(ref!==v.objectRef,'Clone cannot reuse source identity');return cloneOriginalModuleVariant(v,ref);},
  setModuleVariant:setOriginalVariantModule,
 };
}
