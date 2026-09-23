/** Native EconomyUpdateListener callbacks; market/bonus handles are shared with the active transaction. */
import { immutableJSON, requireThat, canonicalJSON, identifier } from '../core/Values.mjs';
import { put, stat } from './OriginalIndustryState.mjs';
import { ORIGINAL_ECONOMY_TASKS as R } from './OriginalEconomyTasks.mjs';
import { ORIGINAL_MARKET_FINANCE } from './OriginalMarketFinance.mjs';
import { validateOriginalResourceCargo, addOriginalResourceCargo, removeOriginalResourceCargo } from './OriginalResourceCargo.mjs';
const f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_ECONOMY_LISTENER',message);
const round=value=>Math.floor(value+0.5),available=c=>Math.max(0,round(stat(c.available)));
const empty=()=>({flat:[],percent:[],mult:[]});
const pirate={TIER_1_1MODULE:[0,0.2,0,0,0],TIER_2_1MODULE:[0.2,0.3,2,0,0],TIER_3_2MODULE:[0.3,0.4,2,1,0],TIER_4_3MODULE:[0.4,0.5,2,2,0],TIER_5_3MODULE:[0.5,0.75,2,2,2]};
function modifyFlat(bonus,id,value,always=false){
 value=f(value);const index=bonus.flat.findIndex(row=>row.id===id);
 if(index>=0)bonus.flat[index]={id,value};else if(always||value!==0)bonus.flat.push({id,value});
}
export class OriginalEconomyUpdateListeners {
 #runtime;#roster;#managedRoster;#objects;#quality=new Map();#qualitySingleton=null;
 constructor(capture,runtime){
  check(capture?.scope==='native-economy-update-listeners'&&capture.unresolved.length===0,'Complete supported native economy listener capture required');
  check(Array.isArray(capture.roster)&&capture.roster.length<=4096,'Listener roster limit');
  this.#objects=structuredClone(capture.objects);this.#roster=[...capture.roster];this.#runtime=runtime;
  this.#qualitySingleton=structuredClone(capture.shipQualitySingleton??null);
  check(capture.managedRoster==null||Array.isArray(capture.managedRoster),'Invalid managed listener registration list');
  this.#managedRoster=capture.managedRoster==null?null:[...capture.managedRoster];
  check(this.#managedRoster===null||this.#managedRoster.length<=65536&&this.#managedRoster.every(ref=>typeof ref==='string')&&new Set(this.#managedRoster).size===this.#managedRoster.length,'Invalid managed listener registrations');
  for(const method of ['market','marketIds','getCommodityData','getShipping','isPaused'])check(typeof runtime?.[method]==='function','Missing listener runtime '+method);
  for(const ref of this.#roster){const obj=this.#objects[ref];check(obj&&obj.objectRef===ref&&['ship-quality','local-resources','pirate-base','pather-base'].includes(obj.kind),'Unsupported listener identity');
   if(obj.kind==='pirate-base'||obj.kind==='pather-base'){check(obj.ended===null||typeof obj.ended==='boolean','Invalid intel lifecycle state');check(obj.kind==='pirate-base'?Object.hasOwn(pirate,obj.tier):typeof obj.large==='boolean','Invalid base development state');}
   if(obj.kind==='ship-quality')this.#quality.set(ref,new Map());else runtime.market(obj.marketId);
  }
  for(const obj of Object.values(this.#objects))if(obj.kind==='ship-quality'&&!this.#quality.has(obj.objectRef))this.#quality.set(obj.objectRef,new Map());
 }

 /** Independent manager registrations, including receivers implemented elsewhere. Not the update roster. */
 managedRoster(){return this.#managedRoster===null?null:[...this.#managedRoster];}
 removeManagedListener(ref){check(this.#managedRoster!==null,'Actual managed registration list required');this.#managedRoster=this.#managedRoster.filter(id=>id!==ref);}
 #monthlyLocal(ref){
  const obj=this.listener(ref);check(obj.kind==='local-resources','Only the actual local resource receiver is implemented here');
  check(this.#managedRoster!==null,'Actual saved managed listener registrations required');
  if(!this.#managedRoster.includes(ref))return null;
  if(this.expired(ref)){this.removeManagedListener(ref);return null;}
  return obj;
 }
 reportEconomyMonthEnd(ref){return {scope:'local-resources-month-end-only',registered:this.#monthlyLocal(ref)!==null};}
 reportEconomyTick(ref,iteration){
  check(Number.isInteger(iteration)&&iteration>=-2147483648&&iteration<=2147483647,'Expected actual economy iteration');
  const obj=this.#monthlyLocal(ref),result={scope:'local-resources-economy-tick-only',registered:obj!==null,billedStacks:0};
  if(!obj||iteration!==Math.trunc(ORIGINAL_MARKET_FINANCE.settings.economyIterPerMonth)-1)return result;
  const market=this.#runtime.market(obj.marketId);check(typeof market.playerOwned==='boolean','Actual current market ownership required');
  const cargo=value=>{check(value&&!value.unresolved?.length,'Actual detached local resource cargo required');validateOriginalResourceCargo(value);return value;};
  const taken=cargo(obj.taken);
  const updateSpace=value=>{let used=0;for(const stack of value.slots){if(!stack)continue;check(stack.type==='RESOURCES'||stack.type==='NULL','Actual non-resource space getter required');if(stack.type==='RESOURCES')used=f(used+f(stack.cargoSpacePerUnit*stack.size));}value.spaceUsed=f(used+(value.extraCargoUsed??0));};
  if(market.playerOwned){
   const left=cargo(obj.left);check(left!==taken&&left.objectRef!==taken.objectRef,'Local resource accounting cargos must be distinct');
   for(const value of [taken,left])for(const stack of value.slots)check(!stack||stack.type==='RESOURCES'||stack.type==='NULL','Non-resource local cargo requires its native item adapter');
   // CargoData.createCopy rebuilds stacks and intentionally does NOT copy partials.
   const copy={unlimitedStacks:taken.unlimitedStacks,partials:null,slots:[]};
   for(const stack of taken.slots)if(stack?.type==='RESOURCES')addOriginalResourceCargo(copy,stack.commodityId,stack.size);
   for(const stack of [...left.slots])if(stack?.type==='RESOURCES')removeOriginalResourceCargo(taken,stack.commodityId,stack.size,()=>updateSpace(taken));
   for(const stack of [...copy.slots])if(stack?.type==='RESOURCES')removeOriginalResourceCargo(left,stack.commodityId,stack.size,()=>updateSpace(left));
   for(const stack of [...taken.slots]){
    if(stack?.type!=='RESOURCES')continue;
    check(typeof this.#runtime.chargeRestocking==='function','Shared monthly resource billing runtime required');
    const charged=this.#runtime.chargeRestocking(obj.marketId,stack.commodityId,stack.size);check(!charged||typeof charged.then!=='function','Resource billing must be synchronous');result.billedStacks++;
   }
  }
  // Native clear leaves the partial map, credit and mothballed fleet objects untouched.
  taken.slots.length=0;updateSpace(taken);return result;
 }

 roster(){return [...this.#roster];}
 listener(ref){const obj=this.#objects[ref];check(obj,'Unknown listener object');return obj;}
 expired(ref){const obj=this.listener(ref);if(obj.kind==='ship-quality')return false;if(obj.kind!=='local-resources')return obj.ended===true;
  const m=this.#runtime.market(obj.marketId),retail=m.retail;check(retail&&retail.unresolved.length===0,'Actual submarket membership required');
  return ![...retail.submarkets,...retail.otherSubmarkets].some(s=>s.specId===obj.submarketSpecId);
 }
 remove(ref){const index=this.#roster.indexOf(ref);if(index>=0)this.#roster.splice(index,1);}
 commodityUpdated(ref,commodityId){
  const obj=this.listener(ref);if(obj.kind==='ship-quality')return;
  if(obj.kind==='local-resources'){check(this.#runtime.isPaused()===false,'Paused local-resource shortage callbacks require their cargo adapter');return;}
  const c=this.#runtime.market(obj.marketId).commodities[commodityId];check(c,'Listener commodity not loaded');
  const id=obj.marketId,existing=c.available.modifiers.flat.find(row=>row.id===id),current=existing?round(existing.value):0;
  let withoutPenalties=round(c.available.base);
  for(const mod of c.available.modifiers.flat)if(mod.value>=0)withoutPenalties+=round(mod.value);
  const amount=withoutPenalties-current;
  if(c.maxDemand>amount)put(c.available,'flat',id,Math.max(1,c.maxDemand-amount)); // No unmodify when the new deficit disappears.
 }
 shipQualityManagerRef(){
  check(this.#qualitySingleton!==null,'Actual Sector ship-quality singleton capture required');const s=this.#qualitySingleton;
  if(s.objectRef===null){check(s.classAlias===null,'Sector ship-quality value is not its native manager');let ref='created-ship-quality-manager',serial=0;while(Object.hasOwn(this.#objects,ref))ref='created-ship-quality-manager:'+ ++serial;
   this.#objects[ref]={objectRef:ref,classAlias:'ShipQuality',kind:'ship-quality',marketId:null,marketRef:null,ended:null,tier:null,large:null,submarketSpecId:null};this.#quality.set(ref,new Map());this.#roster.push(ref);s.objectRef=ref;s.classAlias='ShipQuality';
  }
  check(s.classAlias==='ShipQuality'&&this.#objects[s.objectRef]?.kind==='ship-quality','Sector ship-quality value is not its native manager');return s.objectRef;
 }
 shipQuality(marketId=null,factionId=null){
  let quality=0,market=null;if(marketId!==null){market=this.#runtime.market(marketId);const data=this.qualityData(this.shipQualityManagerRef(),marketId);check(market.economyBonuses,'Actual fleet quality modifier required');quality=f(stat({base:0,modifiers:data.quality})+stat({base:0,modifiers:market.economyBonuses.fleet_quality_mod}));}
  if(factionId!==null){check(typeof this.#runtime.factionShipQualityContribution==='function','Actual current faction doctrine service required');const contribution=id=>{const v=this.#runtime.factionShipQualityContribution(id);check(Number.isFinite(v)&&f(v)===v,'Actual doctrine contribution float required');return v;};if(market?.factionId!==undefined&&market?.factionId!==null)quality=f(quality-contribution(market.factionId));quality=f(quality+contribution(factionId));}
  return quality;
 }
 qualityData(ref,marketId){
  const obj=this.listener(ref);check(obj.kind==='ship-quality','Listener is not the ship quality manager');
  const m=this.#runtime.market(marketId),key=m.factionId+'_'+String(m.econGroup),data=this.#quality.get(ref);
  if(!data.has(key)){const quality=empty();if(!m.hidden)modifyFlat(quality,'no_prod_penalty',R.qualityPenaltyForImports);data.set(key,{econGroup:m.econGroup,factionId:m.factionId,marketId:null,prod:-1,qMod:-1,quality});}
  return data.get(key);
 }
 economyUpdated(ref){
  const obj=this.listener(ref);
  if(obj.kind==='local-resources'){check(this.#runtime.isPaused()===false,'Paused local-resource shortage callbacks require their cargo adapter');return;}
  if(obj.kind==='ship-quality'){
   this.#quality.get(ref).clear();
   for(const id of this.#runtime.marketIds()){
    const m=this.#runtime.market(id),data=this.qualityData(ref,id),c=m.commodities.ships;check(c&&m.economyBonuses,'Ship quality getters not captured');
    let production=Math.min(available(c),c.maxSupply);
    this.#runtime.getCommodityData(id,'ships');production=Math.min(production,this.#runtime.getShipping(id).inFaction);
    production=Math.max(Math.min(available(c),c.maxSupply),production); // Read AGAIN after the potentially mutating lazy network getter.
    if(production<data.prod||production<=0)continue;
    const quality=m.economyBonuses.production_quality_mod,q=stat({base:0,modifiers:quality});
    if(!(q>=data.qMod)&&production<=data.prod)continue;
    Object.assign(data,{prod:production,qMod:q,marketId:id,quality}); // Native stores the live StatBonus, NOT a frozen numeric quality.
   }
   return;
  }
  const m=this.#runtime.market(obj.marketId),mods=m.economyBonuses;check(mods,'Actual fleet/patrol dynamic bonuses required');
  const values=obj.kind==='pirate-base'?pirate[obj.tier]:obj.large?[0.5,1,4,4,3]:[0,0.5,3,2,1];
  for(const [index,key] of ['fleet_quality_mod','combat_fleet_size_mult','patrol_num_light_mod','patrol_num_medium_mod','patrol_num_heavy_mod'].entries())modifyFlat(mods[key],m.marketId,values[index],index<2);
 }
 checkpoint(){
  for(const data of this.#quality.values())for(const row of data.values())if(row.marketId!==null)
   check(row.quality===this.#runtime.market(row.marketId).economyBonuses?.production_quality_mod,'Detached live ship quality handle');
  return immutableJSON({scope:'web-economy-listener-checkpoint',schemaVersion:1,
   capture:{scope:'native-economy-update-listeners',roster:this.#roster,managedRoster:this.#managedRoster,objects:this.#objects,unresolved:[],...(this.#qualitySingleton===null?{}:{shipQualitySingleton:this.#qualitySingleton})},
   quality:[...this.#quality].map(([ref,data])=>[ref,[...data]])});
 }
 static fromCheckpoint(checkpoint,runtime){
  const s=immutableJSON(checkpoint);check(s.scope==='web-economy-listener-checkpoint'&&s.schemaVersion===1&&Array.isArray(s.quality),'Unsupported listener checkpoint');
  const listeners=new OriginalEconomyUpdateListeners(s.capture,runtime),seen=new Set();
  for(const [ref,rows]of s.quality){
   check(!seen.has(ref)&&listeners.listener(ref).kind==='ship-quality'&&Array.isArray(rows)&&rows.length<=4096,'Invalid quality cache owner');seen.add(ref);
   const data=new Map();
   for(const [key,value]of rows){
    check(typeof key==='string'&&key===value.factionId+'_'+String(value.econGroup)&&!data.has(key),'Invalid quality group');
    identifier(value.factionId);if(value.econGroup!==null)identifier(value.econGroup);
    check(Number.isFinite(value.prod)&&Number.isFinite(value.qMod),'Invalid remembered quality getters');stat({base:0,modifiers:value.quality});
    const row=structuredClone(value);
    if(row.marketId!==null){
     identifier(row.marketId);const quality=runtime.market(row.marketId).economyBonuses?.production_quality_mod;
     check(quality&&canonicalJSON(quality)===canonicalJSON(row.quality),'Checkpoint quality reference/value mismatch');row.quality=quality;
    }
    data.set(key,row);
   }
   listeners.#quality.set(ref,data);
  }
  check([...listeners.#quality.keys()].every(ref=>seen.has(ref)),'Missing ship quality state');return listeners;
 }
 snapshot(){return immutableJSON({scope:'native-economy-update-listener-state',shipQualitySingleton:this.#qualitySingleton,roster:this.#roster,managedRoster:this.#managedRoster,objects:this.#objects,shipQuality:Object.fromEntries([...this.#quality].map(([ref,data])=>[ref,Object.fromEntries(data)]))});}
}
