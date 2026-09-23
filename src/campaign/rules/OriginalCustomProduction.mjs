/** CoreScript.doCustomProduction (0.98a-RC8): mutates actual orders, cargo and ledger.
 * The caller owns the transaction. World factories/inflater/listeners are real services;
 * failing one requires discarding the draft, never publishing a partial delivery.
 */
import {requireThat} from '../core/Values.mjs';
import {ORIGINAL_STORAGE} from './OriginalStorage.mjs';
import {createOriginalJavaRandom,validateOriginalJavaRandom,originalJavaNextFloat,originalJavaNextInt,originalJavaNextLong} from './OriginalJavaRandom.mjs';
import {originalProductionBaseCost,removeOriginalProductionItem,validateOriginalFactionProduction} from './OriginalFactionProduction.mjs';
import {originalCurrentMonthlyReport,computeOriginalMonthlyTotals,chargeOriginalCustomProduction} from './OriginalMonthlyReport.mjs';
import {addOriginalNativeCargoItems,addAllOriginalNativeCargo,sortOriginalNativeCargo} from './OriginalNativeCargo.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CUSTOM_PRODUCTION',m);
const int=v=>Number.isNaN(v)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(v)))||0;
const number=v=>{check(typeof v==='number'&&Number.isFinite(v)&&f(v)===v,'Actual finite native production float required');return v;};
const javaInt=v=>{check(Number.isInteger(v)&&v>=-2147483648&&v<=2147483647,'Actual production Java int required');return v;};
const call=(services,name,...args)=>{check(typeof services?.[name]==='function','Actual production world service required: '+name);const result=services[name](...args);check(!result||typeof result.then!=='function','Production world service must be synchronous: '+name);return result;};
const bool=v=>{check(typeof v==='boolean','Actual production flag required');return v;};
/** CoreScript reads each current non-built-in wing/weapon in variant iteration order. */
export function originalProductionMemberFittingValues(member){
 const variant=member.variant,hull=ORIGINAL_STORAGE.hulls[variant?.hullId];check(hull&&Array.isArray(variant.wings)&&Array.isArray(variant.weapons),'Actual production member variant required');
 const values=[];let nonemptyWings=0;
 for(const id of variant.wings){if(id===null||id==='')continue;if(nonemptyWings++<hull.builtInWings.length)continue;const wing=ORIGINAL_STORAGE.wings[id];check(wing,'Actual production wing base value required: '+id);values.push(number(f(wing.baseValue)));}
 for(const [slot,id] of variant.weapons){if(Object.hasOwn(hull.builtInWeapons,slot))continue;const value=ORIGINAL_STORAGE.weapons[id];check(value!==undefined,'Actual production weapon base value required: '+id);values.push(number(f(value)));}
 return values;
}
/** Explicit NEW CoreScript state. Never called to fill missing saved RNG history. */
export function createOriginalCustomProductionState(coreRef,seed){return validateOriginalCustomProductionState({scope:'native-core-custom-production',coreRef,random:createOriginalJavaRandom(seed)});}
export function validateOriginalCustomProductionState(state){
 check(state?.scope==='native-core-custom-production'&&typeof state.coreRef==='string'&&Object.hasOwn(state,'random'),'Actual CoreScript production history required');
 if(state.random!==null)validateOriginalJavaRandom(state.random);return state;
}
/** WeightedRandomPicker keeps the ORIGINAL weights while Item.quantity changes. */
class Picker{
 constructor(random){this.random=random;this.rows=[];this.total=0;}
 add(item,weight){weight=f(weight);if(weight<=0)return;this.rows.push({item,weight});this.total=f(this.total+weight);}
 remove(item){const at=this.rows.findIndex(row=>row.item===item);if(at<0)return;this.total=f(this.total-this.rows.splice(at,1)[0].weight);}
 pick(){if(!this.rows.length)return null;let value=f(originalJavaNextFloat(this.random)*this.total);if(value>this.total)value=this.total;let sum=0;for(const row of this.rows){sum=f(sum+row.weight);if(value<=sum)return row.item;}return this.rows.at(-1).item;}
}
/** Misc.getRandom(seed, 11) advances a seeded RNG 11 longs, then seeds another RNG. */
function industryRandom(seed,services){if(seed==='0')return validateOriginalJavaRandom(call(services,'readSharedMiscRandom'));const first=createOriginalJavaRandom(seed);for(let i=0;i<11;i++)originalJavaNextLong(first);return createOriginalJavaRandom(originalJavaNextLong(first));}
export function executeOriginalCustomProduction(state,context,services){
 const gatheringPoint=context.gatheringPoint;if(gatheringPoint===null)return {skipped:'no-gathering-point'};
 const local=context.storageCargo;if(local===null)return {skipped:'no-storage'};
 validateOriginalCustomProductionState(state);const prod=validateOriginalFactionProduction(context.production),report=originalCurrentMonthlyReport(context.accounts);computeOriginalMonthlyTotals(report);
 let credits=(int(f(report.root.totalIncome-report.root.totalUpkeep))+int(number(context.accounts.credits.value)))|0;if(credits<0)credits=0;
 const capacity=Math.min(javaInt(call(services,'readMonthlyProductionCapacity')),credits);let remaining=(capacity+prod.accruedProduction)|0;
 if(state.random===null)state.random=validateOriginalJavaRandom(call(services,'createProductionRandom'));
 const random=state.random,picker=new Picker(random);bool(context.devMode);bool(context.weaponsHaveCost);
 for(const item of prod.current){if(item.buildDelay>0&&!context.devMode)continue;picker.add(item,item.quantity);}
 const wantedToDoProduction=picker.rows.length>0,unableToDoProduction=capacity<=0,batches=[];
 const getCargo=title=>{
  check(title===null||typeof title==='string','Actual production cargo title required');let row=batches.find(row=>row.title===title);
  if(!row){const cargo=call(services,'createProductionCargo');check(cargo&&typeof cargo.objectRef==='string'&&Array.isArray(cargo.slots)&&cargo.slots.length===0,'Actual new production cargo required');call(services,'initializeProductionMothballedShips',cargo);row={title,cargo};batches.push(row);}return row.cargo;
 };
 const cargo=getCargo('Heavy Industry - Custom Production');let quality=-1;
 check(Array.isArray(context.markets),'Actual economy market roster required');
 for(const market of context.markets){if(!bool(market.playerOwned))continue;const current=number(call(services,'readProductionMarketQuality',market));quality=Math.max(quality,current);}
 quality=f(quality-number(call(services,'readPlayerDoctrineQualityContribution')));quality=f(quality+f(4*number(context.settings.doctrineFleetQualityPerPoint)));
 // Even an empty production fleet MUST run the native construction/inflation path.
 const ships=call(services,'createProductionFleet'),params={quality,mode:'PRIORITY_THEN_ALL',persistent:false,seed:originalJavaNextLong(random),timestamp:null,blockHullmodsWithItemReqs:true};
 check(ships&&typeof ships==='object','Actual temporary player fleet required');call(services,'attachProductionInflater',ships,params);
 let totalCost=0,accrued=0,steps=0;
 while(remaining>0&&picker.rows.length){
  check(++steps<=100000,'Production selection exceeded supported work budget');const pick=picker.pick(),baseCost=originalProductionBaseCost(pick,services.pricing);
  let count=Math.min(pick.quantity,int(remaining/Math.max(1,baseCost)));if(count>0)count=(originalJavaNextInt(random,count)+1)|0;
  if(count<=0){accrued=remaining;remaining=0;}
  else{
   const cost=Math.imul(count,baseCost);totalCost=(totalCost+cost)|0;remaining=(remaining-cost)|0;
   if(pick.type==='SHIP'){
    const variants=call(services,'readProductionHullVariants',pick.specId);check(Array.isArray(variants)&&variants.every(id=>typeof id==='string'),'Actual mutable native hull-to-variant list required');
    if(variants.length===0){variants.push(pick.specId+'_Hull');continue;}
    const variant=variants[originalJavaNextInt(random,variants.length)];for(let i=0;i<count;i++)call(services,'addProductionFleetMember',ships,variant);
   }else addOriginalNativeCargoItems(cargo,{type:pick.type==='FIGHTER'?'FIGHTER_CHIP':'WEAPONS',itemId:pick.specId},count,services.cargo);
   removeOriginalProductionItem(prod,pick.type,pick.specId,count,services.pricing);if(pick.quantity<=0)picker.remove(pick);
  }
 }
 call(services,'inflateProductionFleet',ships);
 let weaponCost=0;const members=call(services,'readProductionFleetMembers',ships);check(Array.isArray(members),'Actual synchronized manufactured members required');
 for(const member of members){
  call(services,'addProductionMothballedMember',cargo,member);
  const costs=call(services,'readProductionMemberFittingValues',member);check(Array.isArray(costs),'Actual non-built-in wing/weapon value list required');
  for(const value of costs)weaponCost=int(f(f(weaponCost)+number(value)));
 }
 if(!context.weaponsHaveCost)weaponCost=0;
 const addedValue=int(f(f(totalCost)*number(context.settings.productionSuppliesBonusFraction))),prices=context.settings.commodityPrices;
 const sCost=int(number(prices.supplies)),fCost=int(number(prices.fuel)),cCost=int(number(prices.crew));check(sCost!==0&&fCost!==0&&cCost!==0,'Original production bonus commodity prices must be nonzero');
 const sValue=int(f(f(addedValue)*f(f(.5)*f(f(.5)+f(originalJavaNextFloat(random)*f(.5))))));
 const fValue=int(f(f(addedValue)*f(f(.3)*f(f(.5)+f(originalJavaNextFloat(random)*f(.5))))));
 let supplies=int(sValue/sCost),fuel=int(fValue/fCost),crew=int((((addedValue-Math.imul(sCost,supplies))|0)-Math.imul(fCost,fuel)|0)/cCost);
 supplies=Math.imul(int(supplies/10),10);fuel=Math.imul(int(fuel/10),10);crew=Math.imul(int(crew/10),10);
 for(const [commodityId,amount]of [['supplies',supplies],['fuel',fuel],['crew',crew]])addOriginalNativeCargoItems(cargo,{type:'RESOURCES',commodityId},amount,services.cargo);
 totalCost=(totalCost-prod.accruedProduction)|0;totalCost=(totalCost+accrued)|0;if(totalCost<0)totalCost=0;prod.accruedProduction=accrued;
 const cargoMembers=current=>{const values=call(services,'readProductionCargoMembers',current);check(Array.isArray(values),'Actual production cargo member roster required');return values;};
 const isEmpty=current=>bool(call(services,'isProductionCargoEmpty',current))&&cargoMembers(current).length===0;
 for(const market of context.markets){if(!market.playerOwned)continue;const industries=call(services,'readProductionIndustries',market);check(Array.isArray(industries),'Actual ordered current industry roster required');
  for(const industry of industries){
   const added=call(services,'generateIndustryProductionCargo',industry,industryRandom(originalJavaNextLong(random),services));
   if(added!==null&&!isEmpty(added)){const target=getCargo(call(services,'readIndustryProductionCargoTitle',industry));addAllOriginalNativeCargo(target,added,services.cargo);for(const member of cargoMembers(added))call(services,'addProductionMothballedMember',target,member);}
  }
 }
 const empty=batches.every(row=>isEmpty(row.cargo)),noProduction=wantedToDoProduction&&unableToDoProduction;
 if(!empty||totalCost>0||noProduction){
  if(totalCost>0)chargeOriginalCustomProduction(context.accounts,cargo,totalCost,weaponCost);
  for(const batch of batches){addAllOriginalNativeCargo(local,batch.cargo,services.cargo);call(services,'initializeProductionMothballedShips',local);
   for(const member of cargoMembers(batch.cargo)){call(services,'prepareProductionMemberForDelivery',member);call(services,'addProductionMothballedMember',local,member);}
  }
  sortOriginalNativeCargo(local,services.cargo);
  call(services,'addProductionReportIntel',{gatheringPoint,batches,totalCost:(totalCost+weaponCost)|0,accrued:prod.accruedProduction,noProductionThisMonth:noProduction});
 }
 return {skipped:null,capacity,totalCost,weaponCost,accrued:prod.accruedProduction,wantedToDoProduction,unableToDoProduction,delivered:!empty||totalCost>0||noProduction,batches};
}
