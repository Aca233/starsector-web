/** Faction.pickShip and its actual cached role pools. Picks are variants, NOT instantiated fleet members. */
import raw from '../data/reference-ship-selection.json' with {type:'json'};
import {requireThat,immutableJSON,identifier} from '../core/Values.mjs';
import {originalJavaNextFloat} from './OriginalJavaRandom.mjs';
export const ORIGINAL_SHIP_SELECTION=immutableJSON(raw);
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_SHIP_SELECTION',m),f=Math.fround;
const modes=['ALL','IMPORTED','PRIORITY_ONLY','PRIORITY_THEN_ALL'],listKeys=['knownShips','priorityShips','shipsWhenImporting','restrictToVariants','overriddenHulls'];
const cfRoles={combatSmallForSmallFleet:'combatFreighterSmall',combatSmall:'combatFreighterSmall',combatMedium:'combatFreighterMedium',combatLarge:'combatFreighterLarge'};
const emptyCache=()=>({normal:{},imported:{},priority:{}}),long=v=>typeof v==='string'&&/^-?\d+$/.test(v)&&BigInt.asIntN(64,BigInt(v))===BigInt(v);
function owner(state,id){const row=state.factions.find(row=>row.factionId===id);check(row,'Actual current faction ship-selection state required');return row;}
export function restoreOriginalShipSelection(capture,doctrines,reference=ORIGINAL_SHIP_SELECTION){
 check(capture?.scope==='native-faction-ship-selection-inputs'&&capture.unresolved.length===0,'Actual native faction ship-selection capture required');
 const state={scope:'native-current-ship-selection',schemaVersion:1,catalogue:structuredClone(reference.roles),variants:structuredClone(reference.variants),factions:structuredClone(capture.entries)};
 for(const row of state.factions){const spec=reference.definitions[row.factionId],doctrine=doctrines.entries.find(d=>d.factionId===row.factionId);check(spec&&doctrine&&doctrine.objectRef===row.objectRef,'Actual matching spec and doctrine required');row.doctrine=doctrine.doctrine;row.cache=emptyCache();
  if(reference.devMode&&row.factionId!=='player'){for(const key of listKeys)if(key!=='restrictToVariants')row[key]=[];row.variantOverrides={};row.hullFrequency={};row.shipTimestamps={};}
  Object.assign(row.variantOverrides,spec.variantOverrides);Object.assign(row.hullFrequency,spec.hullFrequency);
  const add=(key,id)=>{if(!row[key].includes(id))row[key].push(id);};for(const id of spec.overriddenHulls)add('overriddenHulls',id);for(const id of spec.shipsWhenImporting)add('shipsWhenImporting',id);
  // This is membership for pickShip, not the native global hull-registry iteration API.
  for(const id of spec.knownShips)if(!row.knownShips.includes(id)){delete row.shipTimestamps[id];add('knownShips',id);if(row.autoEnableKnownShips)add('priorityShips',id);}
  for(const id of spec.priorityShips)add('priorityShips',id);
 }
 return validateOriginalShipSelection(state,doctrines);
}
export function validateOriginalShipSelection(state,doctrines=null){
 check(state?.scope==='native-current-ship-selection'&&state.schemaVersion===1&&Array.isArray(state.factions)&&state.catalogue?.byRef&&state.catalogue.entries&&state.variants,'Current role-selection state required');
 const seen=new Set();for(const row of state.factions){identifier(row.factionId);check(!seen.has(row.factionId)&&typeof row.objectRef==='string','Duplicate/invalid selection faction');seen.add(row.factionId);for(const key of listKeys){check(Array.isArray(row[key])&&new Set(row[key]).size===row[key].length,'Invalid native ship membership');row[key].forEach(id=>identifier(id));}
  check(typeof row.autoEnableKnownShips==='boolean'&&row.doctrine&&row.cache,'Missing current faction options');if(doctrines)check(doctrines.entries.find(d=>d.factionId===row.factionId)?.doctrine===row.doctrine,'Lost shared ship-selection doctrine');
  for(const map of [row.variantOverrides,row.hullFrequency])for(const [key,v]of Object.entries(map)){identifier(key);check(Number.isFinite(v)&&f(v)===v,'Invalid native ship weight');}
  for(const [key,t]of Object.entries(row.shipTimestamps)){identifier(key);check(long(t),'Invalid native ship timestamp');}
  for(const space of ['normal','imported','priority'])for(const [ref,pool]of Object.entries(row.cache[space])){check(state.catalogue.byRef[ref]&&Array.isArray(pool),'Invalid current role cache');for(const pick of pool)check(state.catalogue.entries[pick.entryRef]&&Number.isFinite(pick.weight)&&f(pick.weight)===pick.weight&&pick.weight>0,'Invalid cached role weight');}
 }
 for(const [ref,role]of Object.entries(state.catalogue.byRef)){check(ref===role.objectRef&&typeof role.roleId==='string'&&Array.isArray(role.entries),'Invalid role identity');for(const id of role.entries)check(state.catalogue.entries[id],'Missing shared role entry');for(const key of ['fallback','fallback2'])if(role[key]!==null)check(typeof role[key].roleId==='string'&&Number.isFinite(role[key].count)&&f(role[key].count)===role[key].count,'Invalid native fallback');}
 for(const [ref,entry]of Object.entries(state.catalogue.entries)){check(ref===entry.objectRef&&state.variants[entry.variantId]&&Number.isFinite(entry.weight)&&f(entry.weight)===entry.weight,'Invalid current role variant');}
 for(const v of Object.values(state.variants))check(typeof v.hullId==='string'&&Number.isInteger(v.fp)&&v.fp>=0&&v.fp<=2147483647,'Invalid variant FP');return state;
}
export function clearOriginalShipRoleCache(state,factionId){owner(state,factionId).cache=emptyCache();}
/** O0Oo.getRole is lazy even for unknown IDs; empty local roles fall through to the shared defaults. */
function localRole(state,map,id,prefix){let ref=map[id];if(ref===undefined){ref=prefix+':'+id;check(!Object.hasOwn(state.catalogue.byRef,ref),'Conflicting dynamic role identity');map[id]=ref;state.catalogue.byRef[ref]={objectRef:ref,roleId:id,entries:[],fallback:null,fallback2:null};}return state.catalogue.byRef[ref];}
function roleFor(state,row,id){const local=localRole(state,state.catalogue.factions[row.factionId]??(state.catalogue.factions[row.factionId]={}),id,'faction:'+row.factionId);return local.entries.length||local.fallback!==null?local:localRole(state,state.catalogue.defaults,id,'default');}
function variant(state,entry){const v=state.variants[entry.variantId];check(v,'Actual native role variant required');return v;}
const cacheSpace=mode=>mode==='ALL'?'normal':mode==='IMPORTED'?'imported':'priority';
function basePool(state,row,role,mode,filter){
 const space=cacheSpace(mode),cache=row.cache[space];if(filter===null&&Object.hasOwn(cache,role.objectRef))return cache[role.objectRef];
 const result=[];
 const add=(entryRef,mult)=>{const entry=state.catalogue.entries[entryRef],hull=variant(state,entry).hullId;if(row.restrictToVariants.length&&!row.restrictToVariants.includes(entry.variantId)||!row.knownShips.includes(hull)||space!=='normal'&&!(space==='imported'?row.shipsWhenImporting:row.priorityShips).includes(hull))return;
  let weight=f(entry.weight*mult);if(row.overriddenHulls.includes(hull)){if(!Object.hasOwn(row.variantOverrides,entry.variantId))return;weight=f(row.variantOverrides[entry.variantId]*mult);}if(Object.hasOwn(row.hullFrequency,hull))weight=f(weight*row.hullFrequency[hull]);if(filter!==null){const available=filter(entry.variantId);check(typeof available==='boolean','Synchronous native ShipFilter required');if(!available)return;}if(weight>0)result.push({entryRef,weight});};
 for(const ref of role.entries)add(ref,1);
 const mult=space==='priority'?row.doctrine.combatFreighterCombatUseFractionWhenPriority:row.doctrine.combatFreighterCombatUseFraction;
 if(mult>0&&cfRoles[role.roleId]){const other=roleFor(state,row,cfRoles[role.roleId]),existing=new Set(result.map(p=>state.catalogue.entries[p.entryRef].variantId));for(const ref of other.entries)if(!existing.has(state.catalogue.entries[ref].variantId))add(ref,mult);}
 if(filter===null)cache[role.objectRef]=result;return result;
}
function timestampPool(state,row,pool,time){if(time===null||!Object.keys(row.shipTimestamps).length)return pool;return pool.filter(p=>{const hull=variant(state,state.catalogue.entries[p.entryRef]).hullId,t=row.shipTimestamps[hull];return t===undefined||BigInt(t)<=BigInt(time);});}
function budgetPool(state,pool,maxFP){return pool.filter(p=>variant(state,state.catalogue.entries[p.entryRef]).fp<=maxFP);}
const total=pool=>pool.reduce((sum,p)=>f(sum+p.weight),0);
export function originalShipRoleAvailability(state,factionId,roleId,mode){check(modes.includes(mode),'Unknown ship-pick mode');identifier(roleId);const row=owner(state,factionId),pool=basePool(state,row,roleFor(state,row,roleId),mode,null);return {count:pool.length,weight:total(pool)};}
export function pickOriginalShipRole(state,factionId,roleId,params,random,filter=null){
 check(modes.includes(params.mode)&&Number.isInteger(params.maxFP)&&params.maxFP>=-2147483648&&params.maxFP<=2147483647&&(params.timestamp===null||long(params.timestamp))&&[null,true,false].includes(params.blockFallback),'Actual native ShipPickParams required');check(filter===null||typeof filter==='function','Invalid native ShipFilter');const row=owner(state,factionId),visited=new Set();
 function pick(id,p){const picks=[];if(id===null)return picks;identifier(id);visited.add(id);const role=roleFor(state,row,id),initial=timestampPool(state,row,basePool(state,row,role,p.mode,filter),p.timestamp);let pool=budgetPool(state,initial,p.maxFP);
  const budgetBlocked=initial.length>0&&pool.length===0&&p.mode==='PRIORITY_THEN_ALL';if(!budgetBlocked&&p.mode==='PRIORITY_THEN_ALL'&&pool.length===0)pool=budgetPool(state,timestampPool(state,row,basePool(state,row,role,'ALL',filter),p.timestamp),p.maxFP);
  if(pool.length){const sum=total(pool),roll=Math.min(f(originalJavaNextFloat(random)*sum),sum);let soFar=0,selected=pool.at(-1);for(const candidate of pool){soFar=f(soFar+candidate.weight);if(roll<=soFar){selected=candidate;break;}}return [{variantId:state.catalogue.entries[selected.entryRef].variantId,weight:1}];}
  if(p.blockFallback===true)return picks;let fallback=role.fallback;const target=fallback?.roleId??null;
  // Verified bytecode: fallback2 updates count, but does NOT update the original target local.
  if(fallback===null||visited.has(target))fallback=role.fallback2;
  if(fallback!==null){const count=fallback.count;if(originalJavaNextFloat(random)>count)visited.add(target);else if(!visited.has(target)){
   check(count<=65536,'Native fallback count exceeds bounded execution');let remaining=p.maxFP;for(let i=0;f(i)<count;i++)for(const selected of pick(target,{...p,maxFP:remaining})){const fp=state.variants[selected.variantId].fp;if(fp>remaining)continue;remaining=(remaining-fp)|0;picks.push(selected);}if(count>0)for(const selected of picks)selected.weight=f(selected.weight/count);
  }}return picks;
 }
 return pick(roleId,params);
}
