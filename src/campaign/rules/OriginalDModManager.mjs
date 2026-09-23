/** Native DModManager plus the HullVariantSpec mutations it invokes; no UI or implicit plugin fallback. */
import raw from '../data/reference-dmods.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
import {originalJavaNextFloat,originalJavaNextInt,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {createOriginalEmptyVariant,originalEmptyVariantHull} from './OriginalEmptyVariants.mjs';
export const ORIGINAL_DMODS=immutableJSON(raw);
export const ORIGINAL_DMOD_ADDER_TYPE='com.fs.starfarer.api.plugins.DModAdderPlugin';
const R=ORIGINAL_DMODS,f=Math.fround,check=(ok,m)=>requireThat(ok,'UNSUPPORTED_NATIVE_DMOD',m);
const own=(o,k)=>o&&Object.hasOwn(o,k);
function call(s,k,...a){check(typeof s?.[k]==='function','Actual D-mod service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','D-mod services must be synchronous');return v;}
function integer(n,label){check(Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Actual Java int required: '+label);return n;}
function boolean(n){check(typeof n==='boolean','Actual D-mod flag required');return n;}
function set(v,label){check(Array.isArray(v)&&v.length<=4096&&v.every(x=>typeof x==='string'&&x.length>0)&&new Set(v).size===v.length,'Actual ordered '+label+' required');return v;}
function effects(v){check(v&&typeof v.hullId==='string'&&v.effects,'Actual current variant required');for(const k of ['hullMods','permaMods','sMods','suppressedMods','tags'])set(v.effects[k],k);return v.effects;}
function hull(v,s){const h=own(s,'readDModHull')?call(s,'readDModHull',v.hullId):R.hulls[v.hullId];check(h&&h.hullId===v.hullId,'Unloaded D-mod hull: '+v.hullId);return h;}
function specs(s){const rows=own(s,'readDModSpecs')?call(s,'readDModSpecs'):R.mods;check(Array.isArray(rows)&&rows.length<=32768,'Actual ordered HullMod SpecStore required');const ids=new Set();for(const row of rows){check(row&&typeof row.id==='string'&&!ids.has(row.id),'Unique actual HullMod spec required');set(row.tags,'hullmod tags');ids.add(row.id);}return rows;}
function byId(rows,id){const mod=rows.find(m=>m.id===id);check(mod,'Unloaded native hullmod: '+id);return mod;}
function count(v,rows,tags=[],nonBuiltIn=false,h=null){const e=effects(v);return e.hullMods.filter(id=>{const tagsNow=byId(rows,id).tags;return tagsNow.includes('dmod')&&tags.every(t=>tagsNow.includes(t))&&(!nonBuiltIn||!h.builtInMods.includes(id));}).length;}
export function createOriginalDModClassState(){return {scope:'native-dmod-class-state',reduceNextDmodsBy:0,assumeAllShipsAreAutomated:false,maxDModsFromCombat:R.maxDModsAddedByCombat};}
export function validateOriginalDModClassState(state){check(state?.scope==='native-dmod-class-state','Actual DModManager class history required');integer(state.reduceNextDmodsBy,'reduceNextDmodsBy');integer(state.maxDModsFromCombat,'MAX_DMODS_FROM_COMBAT');boolean(state.assumeAllShipsAreAutomated);return state;}
export function originalDModCount(v,tags=[],s={}){set(tags,'D-mod tag filter');return count(v,specs(s),tags);}
export function originalNonBuiltInDModCount(v,s={}){return count(v,specs(s),[],true,hull(v,s));}
function add(a,id){if(!a.includes(id))a.push(id);}
function remove(a,id){const i=a.indexOf(id);if(i>=0)a.splice(i,1);}
/** Retains collection identity and the nullable OP-cache flag; does not clear the cached stats object. */
function modOps(v,h){const e=effects(v);set(h.builtInMods,'built-in mods');const addMod=id=>{if(e.suppressedMods.includes(id)||e.hullMods.includes(id))return;v.hasOpAffectingMods=null;e.hullMods.push(id);};const removeMod=id=>{if(!e.suppressedMods.includes(id)&&(h.builtInMods.includes(id)||e.permaMods.includes(id)))return;if(e.hullMods.includes(id)){remove(e.hullMods,id);v.hasOpAffectingMods=null;}};return {
 addMod,removeMod,addPerma:id=>{add(e.permaMods,id);addMod(id);v.hasOpAffectingMods=null;},
 removePerma:id=>{remove(e.permaMods,id);remove(e.sMods,id);removeMod(id);},
 suppress:id=>{add(e.suppressedMods,id);removeMod(id);},
 unsuppress:id=>{remove(e.suppressedMods,id);if(h.builtInMods.includes(id)||e.permaMods.includes(id))addMod(id);},
 };}
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(h,31)+s.charCodeAt(i))|0;return (h^(h>>>16))>>>0;}
function putWeapon(v,k,id){const row=v.weapons.find(r=>r[0]===k);if(row){row[1]=id;return;}check(v.weapons.length<4096,'Weapon map work limit');v.weapons.push([k,id]);const bucket=hash(k)&(v.weaponMapCapacity-1),n=v.weapons.filter(r=>(hash(r[0])&(v.weaponMapCapacity-1))===bucket).length;if(n>8){check(v.weaponMapCapacity<64,'Treeified weapon map requires native ordering');v.weaponMapCapacity*=2;}if(v.weapons.length>v.weaponMapCapacity*.75)v.weaponMapCapacity*=2;v.weapons.sort((a,b)=>(hash(a[0])&(v.weaponMapCapacity-1))-(hash(b[0])&(v.weaponMapCapacity-1)));}
export function setOriginalDHull(v,s={}){
 effects(v);v.variantSource='REFIT';if(boolean(hull(v,s).isDefaultDHull))return false;
 const id=v.hullId.endsWith('_default_D')?v.hullId:v.hullId+'_default_D';
 const source=own(s,'readDModHull')?{readEmptyVariantHull:k=>hull({hullId:k},s)}:{};
 const h=originalEmptyVariantHull(id,source),built=createOriginalEmptyVariant('dmod-built-ins','dmod-built-ins',id,source);
 check(Array.isArray(v.weapons)&&Array.isArray(v.wings)&&Number.isInteger(v.weaponMapCapacity)&&v.weaponMapCapacity>=16&&(v.weaponMapCapacity&(v.weaponMapCapacity-1))===0,'Actual variant equipment maps required');
 v.hullId=id;v.hullSpec=h;v.hasOpAffectingMods=null;for(const [slot,weapon]of built.weapons)putWeapon(v,slot,weapon);const ops=modOps(v,h);for(const mod of h.builtInMods)ops.addMod(mod);for(let i=0;i<h.builtInWings.length;i++){while(v.wings.length<=i)v.wings.push('');v.wings[i]=h.builtInWings[i];}return true;
}
export function removeOriginalDMod(v,id,s={}){
 const h=hull(v,s);check(typeof id==='string'&&id.length>0,'Actual removed hullmod ID required');let base=h.dParentHullId;if(!h.isDefaultDHull&&!h.isRestoreToBase)base=h.hullId;if(base===null&&h.isRestoreToBase)base=h.baseHullId;check(typeof base==='string','Native removeDMod requires a non-null restoration base');const target=hull({hullId:base},s),ops=modOps(v,h);ops.removePerma(id);if(target.builtInMods.includes(id))ops.suppress(id);else ops.removeMod(id);
}
function unsuited(v,h,rows,state){const e=effects(v),auto=state.assumeAllShipsAreAutomated||e.hullMods.includes('automated')||e.tags.includes('automated')||h.tags.includes('automated'),civ=h.hints.includes('CIVILIAN'),shields=h.shieldType==='FRONT'||h.shieldType==='OMNI';return rows.filter(m=>{const t=m.tags;return !(!(h.noCRLossTime<10000)&&t.includes('peak_time')||h.phase&&t.includes('notPhase')||auto&&t.includes('notAuto')||civ&&t.includes('notCiv')||civ&&!t.includes('civ')&&!t.includes('civOnly')||!civ&&t.includes('civOnly')||!shields&&t.includes('reqShields'));});}
function candidates(v,h,rows,state,fixed,destroyed){const tagged=tag=>rows.filter(m=>m.tags.includes(tag));let result=tagged('damage');if(fixed&&destroyed)result.push(...tagged('destroyedDamageAlways'));result=unsuited(v,h,result,state);if(count(v,rows,['damageStruct'])>0)result=result.filter(m=>!m.tags.includes('damageStruct'));if(h.fighterBays>0)result.push(...tagged('fighterBayDamage'));if(h.phase)result.push(...tagged('phaseDamage'));if(fixed&&h.hints.includes('CARRIER'))result.push(...tagged('carrierDamageAlways'));return result.filter(m=>!v.effects.hullMods.includes(m.id));}
function select(v,h,rows,pool,num,random){const ops=modOps(v,h);for(let i=0;i<num&&pool.length;i++){
 // All weights are exactly 1. Keep duplicate references, and remove the first identity occurrence.
 const value=f(originalJavaNextFloat(random)*f(pool.length));let at=0,total=0;while(at<pool.length){total=f(total+1);if(value<=total)break;at++;}const picked=pool[Math.min(at,pool.length-1)];pool.splice(pool.indexOf(picked),1);
 if(picked.tags.includes('damageStruct')&&count(v,rows,['damageStruct'])>0){i--;continue;}ops.unsuppress(picked.id);ops.addPerma(picked.id);
 }}
function parameters(v,random,s){effects(v);if(random===null)random=call(s,'createDModRandom');validateOriginalJavaRandom(random);return {variant:v,destroyed:false,own:false,canAddDestroyedMods:false,num:0,recoverer:null,random};}
function overridden(params,s){const plugin=call(s,'pickDModAdderPlugin',params);check(plugin===null||plugin&&typeof plugin==='object','Actual selected DModAdderPlugin or known null required');if(plugin===null)return false;call(s,'runDModAdderPlugin',plugin,params);return true;}
export function addOriginalDMods(v,canAddDestroyedMods,num,random,state,s){validateOriginalDModClassState(state);const params=parameters(v,random,s);params.canAddDestroyedMods=boolean(canAddDestroyedMods);params.num=integer(num,'D-mod count');if(overridden(params,s))return;const rows=specs(s),h=hull(v,s);select(v,h,rows,candidates(v,h,rows,state,true,canAddDestroyedMods),num,params.random);}
export function addOriginalCombatDMods(v,destroyed,ownShip,recoverer,random,state,s){validateOriginalDModClassState(state);const params=parameters(v,random,s);params.destroyed=boolean(destroyed);params.own=boolean(ownShip);check(recoverer===null||recoverer&&typeof recoverer==='object','Actual recovering fleet or null required');params.recoverer=recoverer;if(overridden(params,s))return;
 const rows=specs(s),h=hull(v,s),ops=modOps(v,h);if(destroyed)for(const m of rows)if(m.tags.includes('destroyedDamageAlways')){ops.unsuppress(m.id);ops.addPerma(m.id);}const pool=candidates(v,h,rows,state,false,false);let num=2+originalJavaNextInt(params.random,3),reduction=state.reduceNextDmodsBy;state.reduceNextDmodsBy=0;
 if(recoverer!==null){const value=call(s,'readDModRecoveryReduction',recoverer);check(typeof value==='number'&&Number.isFinite(value)&&f(value)===value,'Actual recovery reduction float required');let extra=Math.max(-2147483648,Math.min(2147483647,Math.trunc(value)));extra=extra>=0?originalJavaNextInt(params.random,(extra+1)|0):-originalJavaNextInt(params.random,(-extra+1)|0);reduction=(reduction+extra)|0;}
 num=(num-reduction)|0;if(num<1)num=1;const already=count(v,rows);let amount=ownShip?(1-reduction)|0:(num-already)|0;if(((amount+already)|0)>state.maxDModsFromCombat)amount=(state.maxDModsFromCombat-already)|0;if(amount<=0)return;select(v,h,rows,pool,amount,params.random);
}
