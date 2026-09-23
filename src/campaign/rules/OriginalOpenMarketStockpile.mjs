import { finite, identifier, integer, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_REFERENCE as R } from './OriginalMarketPricing.mjs';
import { originalMarketMonthlyRandom } from './OriginalMarketEconomy.mjs';
const f = Math.fround;
function stockSpec(id) {
 const spec=R.commodities[identifier(id)];requireThat(spec&&spec.plugin===null,'UNSUPPORTED_COMMODITY','Unknown/custom stocking commodity');return spec;
}
export const ORIGINAL_RETAIL_MAX_STACK = 1_000_000;
export const originalRetailShape = (value, keys, label) => requireThat(isRecord(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k)), 'UNSUPPORTED_RETAIL_STATE', `Expected exact ${label} fields`);
export function originalRetailFloat(value, label, maximum = 2 ** 24) {
 finite(value,label,0,maximum);
 requireThat(value === f(value), 'UNSUPPORTED_RETAIL_STATE', `${label} must preserve its native float value`);
 return value;
}
export function originalRetailCommodityInput(input) {
 originalRetailShape(input,['commodityId','shippingGlobal','available','maxSupply','maxDemand'],'resolved stocking input');
 const spec=stockSpec(input.commodityId);
 for(const key of ['shippingGlobal','available','maxSupply','maxDemand']) { integer(input[key],key);requireThat(input[key]<=65536,'UNSUPPORTED_RETAIL_RANGE','Unsupported stocking level'); }
 return spec;
}
/** OpenMarketPlugin's negative DEFICIT multiplier is subtracted, not added. */
export function originalOpenMarketBaseLimit(input) {
 const spec=originalRetailCommodityInput(input),unit=f(spec.econUnit);
 const available=input.available,production=Math.min(input.maxSupply,available),exported=Math.min(production,input.shippingGlobal);
 const extra=Math.max(0,available-Math.max(exported,input.maxDemand)),deficit=Math.max(0,input.maxDemand-available),imports=Math.max(0,available-production);
 let limit=0;
 limit=f(limit+f(f(imports*unit)*f(0.1)));
 limit=f(limit+f(f(production*unit)*f(0.4)));
 limit=f(limit+f(extra*unit));
 limit=f(limit-f(f(deficit*unit)*f(-0.2)));
 return Math.trunc(Math.max(0,limit));
}
export function originalOpenMarketLimit(input, marketId, submarketSpecId, month, stability) {
 identifier(marketId);identifier(submarketSpecId);integer(month,'native month',1);requireThat(month<=12,'UNSUPPORTED_RETAIL_STATE','Native month must be 1..12');finite(stability,'stability',0,10);
 const random=originalMarketMonthlyRandom(marketId,submarketSpecId,month).demandRoll;
 let limit=f(originalOpenMarketBaseLimit(input));
 limit=f(limit*f(f(0.9)+f(f(0.2)*random)));
 limit=f(limit*f(f(0.25)+f(f(0.75)*f(f(stability)/10))));
 return Math.trunc(Math.max(0,limit));
}
/** BaseSubmarketPlugin.advance; Web uses the already-declared fixed authority frames. */
export function advanceOriginalRetailTimer(previous, ticks, ticksPerSecond) {
 originalRetailFloat(previous,'resource update timer');integer(ticks,'ticks');integer(ticksPerSecond,'tick rate',1);
 requireThat(ticks<=1_000_000&&ticksPerSecond<=1000,'RETAIL_WORK_LIMIT','Advance in bounded fixed-frame slices');
 const days=f(f(1/ticksPerSecond)/R.settings.secondsPerDay);let next=previous;
 for(let n=0;n<ticks;n++)next=f(next+days);
 return originalRetailFloat(next,'advanced resource update timer');
}
/** Shared native replenishment amounts; cargo adapters own actual stack arithmetic. */
export function planOriginalOpenResourceChange({current,limit,sinceLastCargoUpdate,illegal}) {
 originalRetailFloat(current,'resource quantity',2**31);integer(limit,'resource limit');requireThat(limit<=2147483647&&typeof illegal==='boolean','UNSUPPORTED_RETAIL_STATE','Invalid stocking policy');
 originalRetailFloat(sinceLastCargoUpdate,'resource update timer');
 const days=f(f(sinceLastCargoUpdate*R.settings.secondsPerDay)/R.settings.secondsPerDay);limit=f(limit);
 let add=0,remove=0;
 if(current<limit&&!illegal&&limit>0) {
  const rate=f(limit/30);
  if(f(f(sinceLastCargoUpdate*rate)+current)>=1) {
   add=f(rate*days);if(f(current+add)>limit)add=f(limit-current);
   if(add>0&&f(current+add)<1)add=1;
  }
 } else if(current>limit) {
  const rate=f(f(f(current-limit)*2)/30);remove=f(rate*days);
  if(f(current-remove)<limit)remove=f(current-limit);
  if(remove>0&&current<=1)remove=1;
 }
 return {add,remove};
}
/** Open resources only; no weapons/ships, no shortage-countering, no user-supplied inventory writes. */
export function refreshOriginalOpenMarketResources(input) {
 originalRetailShape(input,['marketId','submarketSpecId','month','stability','sinceLastCargoUpdate','inventory','commodities','illegalCommodityIds'],'resource refresh');
 const {marketId,submarketSpecId,month,stability,sinceLastCargoUpdate,inventory,commodities,illegalCommodityIds}=input;
 identifier(marketId);identifier(submarketSpecId);integer(month,'native month',1);requireThat(month<=12,'UNSUPPORTED_RETAIL_STATE','Native month must be 1..12');finite(stability,'stability',0,10);
 originalRetailFloat(sinceLastCargoUpdate,'resource update timer');requireThat(isRecord(inventory)&&Object.keys(inventory).length<=64,'UNSUPPORTED_RETAIL_STATE','Unsupported inventory');
 requireThat(Array.isArray(commodities)&&commodities.length<=64&&Array.isArray(illegalCommodityIds)&&new Set(illegalCommodityIds).size===illegalCommodityIds.length,'UNSUPPORTED_RETAIL_STATE','Unsupported commodity roster');
 illegalCommodityIds.forEach(stockSpec);
 // The shared amount planner preserves the native days -> seconds -> days roundings.
 const next={...inventory},reports=[],seen=new Set();
 for(const [id,n]of Object.entries(inventory)){stockSpec(id);finite(n,'inventory',0,2**24);}
 for(const commodity of commodities) {
  const spec=originalRetailCommodityInput(commodity),id=spec.id;
  requireThat(!seen.has(id),'UNSUPPORTED_RETAIL_STATE','Duplicate stocking input');seen.add(id);
  if(spec.tags.includes('nonecon')||spec.tags.includes('meta'))continue;
  const current=originalRetailFloat(inventory[id]??0,'single resource stack',ORIGINAL_RETAIL_MAX_STACK);
  const limit=originalOpenMarketLimit(commodity,marketId,submarketSpecId,month,stability);
  requireThat(limit<=ORIGINAL_RETAIL_MAX_STACK,'UNSUPPORTED_RETAIL_RANGE','Multi-stack resource refresh is not represented by the current inventory map');
  let after=current;
  const change=planOriginalOpenResourceChange({current,limit,sinceLastCargoUpdate,illegal:illegalCommodityIds.includes(id)});
  if(change.add>0)after=f(current+change.add);
  if(change.remove>0){after=f(Math.max(0,f(current-Math.min(current,change.remove))));if(after<1)after=0;}
  if(after!==current||Object.hasOwn(inventory,id))next[id]=after;
  reports.push({commodityId:id,before:current,after,limit,delta:after-current});
 }
 return immutableJSON({inventory:next,sinceLastCargoUpdate:0,reports});
}
