/** HullVariantSpec OP cache, exact budget getters, and variant-only hullmod execution. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalAutofitSpecs} from './OriginalAutofitSpecRegistry.mjs';
import {createOriginalVariantShipStats} from './OriginalFleetMemberStats.mjs';
import {applyOriginalVariantHullmod} from './OriginalMemberEffects.mjs';
import {originalCostInt as jint,originalCostBonus,originalWeaponOPCost,originalFighterOPCost} from './OriginalEquipmentCosts.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_AUTOFIT_COST',m);
const hullmods=new Map(Object.entries(R.hullmodSpecs).map(([id,spec])=>{
 const lifecycle=R.hullmodLifecycle[id];check(lifecycle&&typeof lifecycle.affectsOPCosts==='boolean','Actual hullmod OP metadata required: '+id);
 // Stable script reference, not a fabricated ShipAPI/effect instance. Ship lifecycle still needs its real service.
 return [id,Object.freeze({id,tags:Object.freeze([...spec.tags]),costs:Object.freeze({...spec.costs}),affectsOPCosts:lifecycle.affectsOPCosts,effect:lifecycle.script===null?null:Object.freeze({scope:'native-hullmod-effect-reference',className:lifecycle.script})})];
}));
function call(s,key,...args){check(typeof s[key]==='function','Actual autofit cost service required: '+key);const out=s[key](...args);check(!out||typeof out.then!=='function','Autofit cost services must be synchronous');return out;}
function variant(v){check(v?.effects&&Array.isArray(v.weapons)&&Array.isArray(v.wings)&&Array.isArray(v.effects.hullMods)&&Array.isArray(v.effects.permaMods),'Actual mutable variant required');return v;}
export function invalidateOriginalVariantOPCosts(v){variant(v).hasOpAffectingMods=null;}
export function createOriginalAutofitCostServices(services={}){
 const s={...originalAutofitSpecs,
  readHullmodSpec:id=>{check(hullmods.has(id),'Actual registered hullmod spec required: '+id);return hullmods.get(id);},
  createVariantStats:createOriginalVariantShipStats,
  applyVariantHullmod:(stats,v,spec)=>applyOriginalVariantHullmod(stats,v,spec.id),
  readCostStats:v=>{
   variant(v);
   // Native fields are transient. Old captures with neither field start at native deserialization null.
   if(!Object.hasOwn(v,'hasOpAffectingMods')){check(!Object.hasOwn(v,'statsForOpCosts'),'Incomplete historical OP cache');v.hasOpAffectingMods=null;v.statsForOpCosts=null;}
   check(v.hasOpAffectingMods===null||typeof v.hasOpAffectingMods==='boolean','Actual nullable OP cache flag required');
   if(v.hasOpAffectingMods===null){v.statsForOpCosts=call(s,'createVariantStats',v);v.hasOpAffectingMods=false;
    for(const id of v.effects.hullMods){const spec=call(s,'readHullmodSpec',id);check(typeof spec?.affectsOPCosts==='boolean','Actual affectsOPCosts implementation required: '+id);if(!spec.affectsOPCosts)continue;v.hasOpAffectingMods=true;call(s,'applyVariantHullmod',v.statsForOpCosts,v,spec);}
    if(!v.hasOpAffectingMods)v.statsForOpCosts=null;
   }
   check(Object.hasOwn(v,'statsForOpCosts')&&(v.hasOpAffectingMods?v.statsForOpCosts?.scope==='native-variant-ship-stats':v.statsForOpCosts===null),'Actual retained OP cache required');return v.statsForOpCosts;
  },
  readWeaponOPCost:(spec,character,stats)=>originalWeaponOPCost(spec,character,stats,s),
  readFighterOPCost:(spec,stats)=>originalFighterOPCost(spec,stats,s),
  readHullmodCost:(spec,size)=>{check(spec?.costs,'Actual hullmod cost spec required');return ['FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP'].includes(size)?jint(spec.costs[size]):2;},
  readSModOPCost:(spec,size)=>{check(spec?.costs,'Actual S-mod cost spec required');return jint(spec.costs[['FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP'].includes(size)?size:'FRIGATE']);},
  readOrdnancePoints:(v,character)=>{const points=call(s,'readHull',v).ordnancePoints;check(Number.isInteger(points),'Actual hull ordnance points required');return character===null?points:jint(originalCostBonus(character?.shipOrdnancePointBonus,points));},
  readMaxFluxBonus:(character,kind,base)=>{check(kind==='vents'||kind==='caps','Actual flux bonus kind required');return jint(originalCostBonus(character?.[kind==='vents'?'maxVentsBonus':'maxCapacitorsBonus'],base));},
  readVariantOPCost:(v,character)=>{
   variant(v);const h=call(s,'readHull',v);check(h.builtInWeapons&&Array.isArray(h.builtInWings)&&Array.isArray(h.builtInMods),'Actual built-in equipment definitions required');let total=0;
   for(const [slot,id]of v.weapons){if(Object.hasOwn(h.builtInWeapons,slot)||id===null||id==='')continue;const spec=call(s,'readWeaponSpec',id),stats=call(s,'readCostStats',v);total=jint(f(f(total)+call(s,'readWeaponOPCost',spec,character,stats)));}
   for(let i=0;i<v.wings.length;i++){const id=v.wings[i];if(i<h.builtInWings.length||id===null||id==='')continue;const spec=call(s,'readFighterSpec',id),stats=call(s,'readCostStats',v);total=jint(f(f(total)+call(s,'readFighterOPCost',spec,stats)));}
   let mods=0;for(const id of v.effects.hullMods){if(h.builtInMods.includes(id)||v.effects.permaMods.includes(id))continue;mods=(mods+jint(call(s,'readHullmodCost',call(s,'readHullmodSpec',id),h.hullSize)))|0;}
   check(Number.isInteger(v.effects.fluxVents)&&Number.isInteger(v.effects.fluxCapacitors),'Actual int flux allocation required');return ((((total+mods)|0)+v.effects.fluxVents)|0)+v.effects.fluxCapacitors|0;
  },
  computeNumFighterBays:v=>{if(v===null)return 0;variant(v);const stats=call(s,'createVariantStats',v);for(const id of v.effects.hullMods){const spec=call(s,'readHullmodSpec',id);if(spec.effect===null)continue;call(s,'applyVariantHullmod',stats,v,spec);}return Math.max(0,jint(effective(stats.numFighterBays)));},
  ...services,
 };
 return Object.freeze(s);
}
export const originalAutofitCosts=createOriginalAutofitCostServices();
