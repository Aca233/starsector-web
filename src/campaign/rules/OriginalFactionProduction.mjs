/** FactionProduction queue, current pricing/capacity and natural timers (0.98a-RC8).
 * Monthly manufacture and delivery are separate: a zero buildDelay is NOT a completed order. */
import {requireThat} from '../core/Values.mjs';
import finance from '../data/reference-market-finance.json' with {type:'json'};
import {ORIGINAL_STORAGE} from './OriginalStorage.mjs';
const f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_FACTION_PRODUCTION',message);
const scalar=value=>{check(typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(f(value)),'Actual finite production float required');return f(value);};
const int=value=>{check(Number.isInteger(value)&&value>=-2147483648&&value<=2147483647,'Actual Java production int required');return value;};
const key=(type,specId)=>{check(['SHIP','FIGHTER','WEAPON'].includes(type)&&typeof specId==='string','Actual production type and spec ID required');};
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual production service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Production services must be synchronous');return value;};
const baseDelay=(item,services)=>scalar(services.readProductionItemBaseBuildDelay?call(services,'readProductionItemBaseBuildDelay',item):0);
const maxQuantity=(item,services)=>int(services.readProductionItemMaxQuantity?call(services,'readProductionItemMaxQuantity',item):100);
const find=(list,type,specId)=>list.find(item=>item.type===type&&item.specId===specId)??null;
const equal=(a,b)=>a.type===b.type&&a.specId===b.specId&&a.quantity===b.quantity;
function remove(list,item){const index=list.findIndex(row=>equal(row,item));if(index>=0)list.splice(index,1);}
export function createOriginalProductionItem(type,specId,quantity,services={}){
 key(type,specId);int(quantity);const item={scope:'native-faction-production-item',type,specId,buildDelay:0,timeInterrupted:0,quantity:0};item.buildDelay=baseDelay(item,services);item.quantity=quantity;return item;
}
export function createOriginalFactionProduction(faction){
 const state={scope:'native-faction-production',faction,gatheringPoint:null,current:[],interrupted:[],accruedProduction:0,costMult:1};return validateOriginalFactionProduction(state,faction);
}
export function validateOriginalFactionProduction(state,faction=state?.faction){
 check(state?.scope==='native-faction-production'&&faction&&typeof faction.objectRef==='string'&&typeof faction.factionId==='string'&&state.faction===faction,'Lost production/Faction identity');
 check(state.gatheringPoint===null||state.gatheringPoint&&typeof state.gatheringPoint==='object','Actual production gathering market or known null required');int(state.accruedProduction);check(scalar(state.costMult)===state.costMult,'Native production cost multiplier required');
 for(const name of ['current','interrupted']){check(Array.isArray(state[name]),'Actual ordered production list required');for(const item of state[name]){check(item?.scope==='native-faction-production-item','Actual production item required');key(item.type,item.specId);int(item.quantity);for(const k of ['buildDelay','timeInterrupted'])check(scalar(item[k])===item[k],'Native production timer required');}}
 return state;
}
export function advanceOriginalFactionProduction(state,seconds,services){
 seconds=scalar(seconds);if(seconds<=0)return;
 const days=scalar(call(services,'convertFactionSecondsToDays',seconds));
 for(const item of state.current){item.buildDelay=f(item.buildDelay-days);if(item.buildDelay<0)item.buildDelay=0;}
 for(let i=0;i<state.interrupted.length;){const item=state.interrupted[i];item.timeInterrupted=f(item.timeInterrupted+days);if(item.timeInterrupted>30)state.interrupted.splice(i,1);else i++;}
}
export function addOriginalProductionItem(state,type,specId,quantity=1,limit=0,services={}){
 key(type,specId);int(quantity);int(limit);let item=find(state.current,type,specId);
 if(item===null){item=find(state.interrupted,type,specId);if(item===null)item=createOriginalProductionItem(type,specId,0,services);else{remove(state.interrupted,item);item.quantity=0;}}
 let accepted=true,maximum=maxQuantity(item,services);if(limit>0)maximum=limit;
 let next=(item.quantity+quantity)|0;if(next>maximum){next=maximum;accepted=false;}
 item.quantity=next;item.timeInterrupted=0;if(!state.current.some(row=>equal(row,item)))state.current.push(item);return accepted;
}
export function removeOriginalProductionItem(state,type,specId,quantity,services={}){
 key(type,specId);int(quantity);const item=find(state.current,type,specId);if(item===null)return;
 item.quantity=Math.max(0,(item.quantity-quantity)|0);if(item.quantity>0)return;
 remove(state.current,item);if(baseDelay(item,services)>0){const interrupted=find(state.interrupted,type,specId);if(interrupted===null)state.interrupted.push(item);else interrupted.buildDelay=Math.min(interrupted.buildDelay,item.buildDelay);}
}
export function clearOriginalFactionProduction(state,services={}){for(const item of [...state.current])removeOriginalProductionItem(state,item.type,item.specId,item.quantity,services);}
export function originalProductionCount(state,type,specId){key(type,specId);return find(state.current,type,specId)?.quantity??0;}
/** Java clone is shallow for faction/market; only the two lists and their items are copied. */
export function copyOriginalFactionProduction(state){return {...state,current:state.current.map(item=>({...item})),interrupted:state.interrupted.map(item=>({...item}))};}
export function resetOriginalFactionProductionFromCopy(state,copy){state.interrupted.length=0;state.current.length=0;for(const item of copy.interrupted)state.interrupted.push({...item});for(const item of copy.current)state.current.push({...item});}
export function originalFactionProductionSameAsCopy(state,copy){
 if(copy===null)return false;if(!state.current.length&&!copy.current.length)return true;
 return ['interrupted','current'].every(name=>state[name].length===copy[name].length&&state[name].every((item,i)=>equal(item,copy[name][i])));
}

/** FactionProduction.getGatheringPoint: oldest player colony; stable first tie. */
export function originalProductionGatheringPoint(state,markets,services){
 validateOriginalFactionProduction(state);check(Array.isArray(markets),'Actual economy market roster required');
 if(state.gatheringPoint!==null){const live=call(services,'isProductionMarketInEconomy',state.gatheringPoint);check(typeof live==='boolean','Actual market membership required');if(live)return state.gatheringPoint;}
 let oldest=0,selected=null;for(const market of markets){check(typeof market.playerOwned==='boolean','Actual market ownership required');if(!market.playerOwned)continue;const days=scalar(call(services,'readProductionMarketAge',market));if(days>oldest||selected===null){oldest=days;selected=market;}}
 state.gatheringPoint=selected;return selected;
}

const javaInt=value=>Number.isNaN(value)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(value)))||0;
const javaRound=value=>javaInt(Math.floor(value+0.5));
function baseValue(type,specId,services){
 if(services.readProductionBaseValue)return scalar(call(services,'readProductionBaseValue',type,specId));
 const table=type==='SHIP'?ORIGINAL_STORAGE.hulls:type==='FIGHTER'?ORIGINAL_STORAGE.wings:ORIGINAL_STORAGE.weapons;
 check(Object.hasOwn(table,specId),'Unloaded production specification: '+specId);
 return scalar(type==='WEAPON'?table[specId]:table[specId].baseValue);
}
/** ItemInProduction.getBaseCost: small hull surcharge is added AFTER the float-to-int cast. */
export function originalProductionBaseCost(item,services={}){
 key(item.type,item.specId);const value=baseValue(item.type,item.specId,services),base=javaInt(f(value*f(finance.settings.productionCostMult)));
 return item.type==='SHIP'&&value<20000?(base+int(finance.settings.shipProductionCostBase))|0:base;
}
function weaponOverride(type,specId,services){
 if(type!=='WEAPON'||!services.readProductionWeaponCostOverride)return null;
 const value=call(services,'readProductionWeaponCostOverride',specId);return value===null?null:int(value);
}
/** The optional weapon delegate is the real getCostOverride service; null means no spec/override. */
export function originalProductionUnitCost(state,type,specId,services={}){
 validateOriginalFactionProduction(state);const item=createOriginalProductionItem(type,specId,1,services),override=weaponOverride(type,specId,services);
 if(override!==null&&override>=0)return override;
 return javaRound(f(f(originalProductionBaseCost(item,services))*state.costMult));
}
export function originalProductionTotalCurrentCost(state,services={}){
 validateOriginalFactionProduction(state);let total=0;
 for(const item of state.current){
  // Java multiplies the two ints BEFORE converting to float (not unitCost * quantity).
  let cost=javaRound(f(f(Math.imul(originalProductionBaseCost(item,services),item.quantity))*state.costMult));
  const override=weaponOverride(item.type,item.specId,services);if(override!==null&&override>=0)cost=Math.imul(override,item.quantity);
  total=(total+cost)|0;if(total>2000000000)return total;
 }
 return total;
}
export function originalProductionCapacityForMarket(maxSupply,available){
 const supply=Math.min(scalar(maxSupply),f(int(available)));if(supply<=0)return 0;
 return f(f(javaRound(f(f(supply*100)/100)))*f(finance.settings.productionCapacityPerSWUnit));
}
export function originalMonthlyProductionCapacity(markets,services){
 check(Array.isArray(markets),'Actual economy market roster required');let capacity=0;
 for(const market of markets){
  check(typeof market.playerOwned==='boolean','Actual production market ownership required');if(!market.playerOwned)continue;
  const supply=call(services,'readProductionMarketSupply',market);check(supply&&typeof supply==='object','Actual current ships commodity supply required');
  capacity=f(capacity+originalProductionCapacityForMarket(supply.maxSupply,supply.available));
 }
 capacity=scalar(call(services,'applyProductionCapacityModifier',capacity));
 // Source stores the rounded Java int back into a float before returning an int.
 return javaInt(f(javaRound(capacity)));
}

/** StatBonus.computeEffective for a credit capacity, not the bounded commodity-quantity getter. */
export function originalProductionCapacityModified(base,modifiers){
 base=scalar(base);check(modifiers&&typeof modifiers==='object','Actual production capacity modifiers required');
 const totals={flat:0,percent:0,mult:1};
 for(const channel of ['flat','percent','mult']){
  const rows=modifiers[channel];check(Array.isArray(rows)&&rows.length<=1024,'Actual ordered capacity modifier list required');const ids=new Set();
  for(const row of rows){check(typeof row?.id==='string'&&!ids.has(row.id),'Actual distinct capacity modifier source required');ids.add(row.id);const value=scalar(row.value);totals[channel]=channel==='mult'?f(totals[channel]*value):f(totals[channel]+value);}
 }
 return f(f(f(base+f(f(base*totals.percent)/100))+totals.flat)*totals.mult);
}
