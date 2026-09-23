/** BaseWeaponSpec/FighterWingSpec OP costs, shared by autofit and variant hullmod effects. */
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_EQUIPMENT_COST',m);
export const originalCostInt=n=>{check(typeof n==='number'&&Number.isFinite(n),'Actual finite OP value required');return Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));};
const round=n=>originalCostInt(Math.floor(n+0.5));
const base=spec=>{check(typeof spec?.baseOPCost==='number'&&Number.isFinite(spec.baseOPCost),'Actual equipment OP spec required');return f(spec.baseOPCost);};
export function originalCostBonus(bonus,value){check(bonus,'Actual character/ship StatBonus required');return effective({base:f(value),modifiers:bonus});}
export function originalCostDynamic(stats,key,value){check(stats?.dynamic,'Actual OP dynamic modifier state required');return Object.hasOwn(stats.dynamic,key)?originalCostBonus(stats.dynamic[key],value):f(value);}
function call(s,key,...args){check(typeof s[key]==='function','Actual OP listener service required: '+key);const out=s[key](...args);check(!out||typeof out.then!=='function','OP listeners must be synchronous');return out;}
function listeners(kind,stats,spec,value,services){
 check(Object.hasOwn(stats,'listenerManager'),'Actual OP listener-manager state required');if(stats.listenerManager===null)return value;
 const list=call(services,'readOPCostListeners',stats,kind);check(Array.isArray(list),'Actual OP listener list required');
 for(const listener of [...list]){const next=call(services,kind==='weapon'?'modifyWeaponOPCost':'modifyFighterOPCost',listener,stats,spec,value);check(Number.isInteger(next)&&next>=-2147483648&&next<=2147483647,'Actual int OP listener result required');value=next;}return value;
}
export function originalWeaponOPCost(spec,character,stats,services={}){
 let value=base(spec);check(['SMALL','MEDIUM','LARGE'].includes(spec.size)&&typeof spec.type==='string'&&typeof spec.beam==='boolean'&&Array.isArray(spec.aiHints),'Actual typed weapon cost spec required');
 if(character!==null){const key=spec.size.toLowerCase()+'WeaponOPCost';value=originalCostBonus(character?.[key],value);check(character?.weaponOPCostMult,'Actual weapon OP multiplier required');value=f(round(f(value*effective(character.weaponOPCostMult))));}
 if(stats!==null){const size=spec.size.toLowerCase(),type=spec.type.toLowerCase();if(['ballistic','energy','missile'].includes(type))value=originalCostDynamic(stats,size+'_'+type+'_mod',value);if(spec.beam)value=originalCostDynamic(stats,size+'_beam_mod',value);if(spec.aiHints.includes('PD'))value=originalCostDynamic(stats,size+'_pd_mod',value);value=f(listeners('weapon',stats,spec,round(value),services));}
 return Math.max(0,f(round(value)));
}
export function originalFighterOPCost(spec,stats,services={}){
 let value=base(spec);check(typeof spec.role==='string','Actual fighter role required');
 if(stats!==null){originalCostDynamic(stats,'all_fighter_cost_mod',value); // Installed jar bytecode POP: intentionally not assigned.
  const role=spec.role.toLowerCase();if(['bomber','fighter','interceptor','support'].includes(role))value=originalCostDynamic(stats,role+'_cost_mod',value);value=f(listeners('fighter',stats,spec,round(value),services));}
 return Math.max(0,f(round(value)));
}
