/** Immutable installed specs, separate from mutable OP/stat effects and campaign world services. */
import reference from '../data/reference-autofit-specs.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
const check=(value,message)=>requireThat(value,'UNSUPPORTED_NATIVE_AUTOFIT_SPEC',message);
const sizes=['SMALL','MEDIUM','LARGE'],types=['BALLISTIC','ENERGY','MISSILE','LAUNCH_BAY','HYBRID','SYNERGY','COMPOSITE','UNIVERSAL','BUILT_IN','DECORATIVE','SYSTEM','STATION_MODULE'];
const strings=value=>Array.isArray(value)&&value.every(x=>typeof x==='string');
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
/** WeaponSlotAPI.weaponFits: matching mount permits one size down, mixed mounts require exact size. */
export function originalAutofitWeaponFits(slot,spec){
 if(spec===null)return false;
 check(slot&&types.includes(slot.type)&&sizes.includes(slot.size),'Actual registered weapon slot type/size required');
 check(spec&&types.includes(spec.mountType)&&sizes.includes(spec.size)&&typeof spec.restrictToSpecifiedMountType==='boolean'&&strings(spec.aiHints),'Actual weapon mountType/restriction/AI hints required');
 const weaponSize=sizes.indexOf(spec.size),slotSize=sizes.indexOf(slot.size),mount=spec.mountType,type=slot.type;
 if(weaponSize>slotSize||mount==='STATION_MODULE'||mount==='SYSTEM'||spec.aiHints.includes('SYSTEM'))return false;
 const same=mount===type;
 let mixed=(mount==='HYBRID'&&['ENERGY','BALLISTIC','UNIVERSAL','HYBRID'].includes(type))
  ||(mount==='SYNERGY'&&['ENERGY','MISSILE','UNIVERSAL','SYNERGY'].includes(type))
  ||(mount==='COMPOSITE'&&['BALLISTIC','MISSILE','UNIVERSAL','COMPOSITE'].includes(type))
  ||(mount==='UNIVERSAL'&&['BALLISTIC','MISSILE','ENERGY','HYBRID','COMPOSITE','SYNERGY'].includes(type))
  ||(type==='HYBRID'&&['ENERGY','BALLISTIC'].includes(mount))
  ||(type==='SYNERGY'&&['ENERGY','MISSILE'].includes(mount))
  ||(type==='COMPOSITE'&&['BALLISTIC','MISSILE'].includes(mount))
  ||(type==='UNIVERSAL'&&['BALLISTIC','MISSILE','ENERGY'].includes(mount));
 if(spec.restrictToSpecifiedMountType)mixed=false;
 if(!same&&!mixed)return false;
 if(same&&weaponSize<slotSize-1)return false;
 return same||!mixed||weaponSize===slotSize;
}
export function createOriginalAutofitSpecRegistry(input=reference){
 check(input?.schemaVersion===1&&input.scope==='native-autofit-static-specs-not-op-stat-lifecycle','Audited autofit spec reference required');
 check(input.weapons&&input.fighters&&input.hulls,'Complete autofit spec tables required');
 const data=structuredClone({weapons:input.weapons,fighters:input.fighters,hulls:input.hulls});
 for(const [id,w]of Object.entries(data.weapons))check(w.id===id&&sizes.includes(w.size)&&types.includes(w.type)&&types.includes(w.mountType)&&typeof w.restrictToSpecifiedMountType==='boolean'&&typeof w.usesAmmo==='boolean'&&Number.isInteger(w.tier)&&Number.isInteger(w.maxAmmo)&&Number.isInteger(w.baseOPCost)&&typeof w.beam==='boolean'&&strings(w.tags)&&strings(w.aiHints)&&(w.autofitCategory===null||typeof w.autofitCategory==='string')&&strings(w.autofitCategories),'Complete weapon spec required: '+id);
 for(const [id,w]of Object.entries(data.fighters))check(w.id===id&&Number.isInteger(w.tier)&&Number.isFinite(w.baseOPCost)&&typeof w.role==='string'&&strings(w.tags)&&typeof w.autofitCategory==='string'&&strings(w.autofitCategories),'Complete fighter spec required: '+id);
 for(const [id,h]of Object.entries(data.hulls)){
  check(h.hullId===id&&['DEFAULT','FIGHTER','FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP'].includes(h.hullSize)&&typeof h.phase==='boolean'&&strings(h.tags)&&strings(h.builtInMods)&&strings(h.builtInWings)&&h.builtInWeapons&&Number.isInteger(h.fighterBays)&&Number.isInteger(h.ordnancePoints)&&(h.defenseId===null||typeof h.defenseId==='string')&&[null,'NONE','OMNI','FRONT','PHASE'].includes(h.shieldType)&&Number.isFinite(h.shieldArc)&&Array.isArray(h.slots),'Complete hull spec required: '+id);
  // The original ArrayList preserves duplicate slot IDs (e.g. Heron's WS 010); lookup uses the first.
  for(const slot of h.slots){check(typeof slot.id==='string'&&sizes.includes(slot.size)&&types.includes(slot.type)&&['HARDPOINT','TURRET','HIDDEN'].includes(slot.mount)&&Array.isArray(slot.location)&&slot.location.length===2&&[...slot.location,slot.angle,slot.arc].every(Number.isFinite),'Complete weapon slot required: '+id);
   check(slot.builtIn===(slot.type==='BUILT_IN')&&slot.decorative===(slot.type==='DECORATIVE')&&slot.hidden===(slot.mount==='HIDDEN')&&slot.system===(slot.type==='SYSTEM')&&slot.stationModule===(slot.type==='STATION_MODULE'),'Consistent original slot flags required: '+id+':'+slot.id);
  }
 }
 freeze(data);
 const lookup=(rows,id,kind)=>{check(typeof id==='string'&&Object.hasOwn(rows,id),'Actual registered '+kind+' spec required: '+String(id));return rows[id];};
 const readHull=variant=>lookup(data.hulls,typeof variant==='string'?variant:variant?.hullId,'hull');
 return Object.freeze({
  readWeaponSpec:id=>lookup(data.weapons,id,'weapon'),
  readFighterSpec:id=>id===null?null:lookup(data.fighters,id,'fighter'),
  readHull,
  // Original getAllWeaponSlotsCopy copies the list, not the individual slot specs.
  readWeaponSlots:variant=>readHull(variant).slots.slice(),
  weaponFits:originalAutofitWeaponFits,
 });
}
export const originalAutofitSpecs=createOriginalAutofitSpecRegistry();
