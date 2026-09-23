import { identifier, integer, requireThat, isRecord, immutableJSON } from '../core/Values.mjs';
import { originalMarketStateId, validateOriginalMarketState, ORIGINAL_MARKET_REFERENCE as R } from './OriginalMarket.mjs';
import { ORIGINAL_CALENDAR_EPOCH_KEY } from './OriginalCalendar.mjs';
import { originalRetailShape as shape, originalRetailFloat, advanceOriginalRetailTimer, refreshOriginalOpenMarketResources } from './OriginalOpenMarketStockpile.mjs';
const PREFIX='reference.open-retail:';
export const originalRetailStateId=marketId=>identifier(PREFIX+identifier(marketId));
const source=value=>requireThat(typeof value==='string'&&value.trim().length>0&&value.length<=1024,'UNSUPPORTED_RETAIL_STATE','Explicit source description required');
const put=(row,value)=>({collection:'extensions',id:row.id,expectedVersion:row.version,value:{...value,version:row.version+1}});
export function validateOriginalRetailState(world,marketId) {
 const row=world.extensions[originalRetailStateId(marketId)];requireThat(row,'RETAIL_UNAVAILABLE','Retail timing must be explicitly captured, never guessed from existing stock');
 shape(row,['id','version','schemaVersion','data'],'retail extension');integer(row.version,'retail version');requireThat(row.schemaVersion===1&&row.id===originalRetailStateId(marketId),'UNSUPPORTED_RETAIL_STATE','Unsupported retail extension');
 const data=row.data;shape(data,['marketId','atTick','submarkets'],'retail timer state');
 requireThat(data.marketId===marketId,'UNSUPPORTED_RETAIL_STATE','Retail market mismatch');integer(data.atTick,'retail tick');
 requireThat(data.atTick===world.clock.tick,'RETAIL_TIME_CONFLICT','Retail counter must advance with every authority frame, not be silently caught up');
 const market=validateOriginalMarketState(world,marketId);
 requireThat(isRecord(data.submarkets)&&Object.keys(data.submarkets).length>0&&Object.keys(data.submarkets).length<=64,'UNSUPPORTED_RETAIL_STATE','Unsupported retail submarkets');
 for(const [id,entry]of Object.entries(data.submarkets)) {
  identifier(id);shape(entry,['specId','sinceLastCargoUpdate','source'],'retail counter');identifier(entry.specId);originalRetailFloat(entry.sinceLastCargoUpdate,'retail days');source(entry.source);
  requireThat(market.data.submarkets[id]?.plugin==='open','UNSUPPORTED_SUBMARKET','Retail counter requires a resolved open submarket');
 }
 return row;
}
export function validateOriginalRetailWorld(world) {
 for(const [id,row]of Object.entries(world.extensions))if(id.startsWith(PREFIX)) {
  requireThat(isRecord(row.data)&&typeof row.data.marketId==='string'&&id===originalRetailStateId(row.data.marketId),'UNSUPPORTED_RETAIL_STATE','Invalid retail extension identity');
  validateOriginalRetailState(world,row.data.marketId);
 }
}
/** Only time passes here. Neither resource cargo nor price snapshots are refreshed by a frame. */
export function advanceOriginalRetailFrame(world) {
 const changes=[];
 for(const [id,row]of Object.entries(world.extensions))if(id.startsWith(PREFIX)) {
  validateOriginalRetailState(world,row.data.marketId);
  const submarkets=Object.fromEntries(Object.entries(row.data.submarkets).map(([key,entry])=>[key,{...entry,sinceLastCargoUpdate:advanceOriginalRetailTimer(entry.sinceLastCargoUpdate,1,world.clock.ticksPerSecond)}]));
  changes.push(put(row,{...row,data:{...row.data,atTick:world.clock.tick+1,submarkets}}));
 }
 return immutableJSON({changes,events:[]});
}
/** Trusted bridge for new/native captured submarkets. No implicit 31-day reset of an existing save. */
function capture(ctx,payload) {
 requireThat(ctx.actor.kind==='system','FORBIDDEN','Only authority may capture original retail timing');
 shape(payload,['marketId','submarketId','specId','sinceLastCargoUpdate','source'],'retail capture');
 identifier(payload.submarketId);identifier(payload.specId);originalRetailFloat(payload.sinceLastCargoUpdate,'captured retail days');source(payload.source);
 const market=ctx.requireVersion('markets',identifier(payload.marketId)),economic=ctx.requireVersion('extensions',originalMarketStateId(market.id));
 ctx.services.market.validateState(ctx.world,market.id);
 requireThat(economic.data.asOfTick===ctx.world.clock.tick,'MARKET_SNAPSHOT_STALE','Capture against a current resolved market');
 requireThat(economic.data.submarkets[payload.submarketId]?.plugin==='open','UNSUPPORTED_SUBMARKET','Only open-market resource timing is supported');
 const id=originalRetailStateId(market.id),previous=ctx.world.extensions[id];
 if(previous){ctx.requireVersion('extensions',id);validateOriginalRetailState(ctx.world,market.id);requireThat(!Object.hasOwn(previous.data.submarkets,payload.submarketId),'RETAIL_ALREADY_CAPTURED','Cannot reset an existing native timer');}
 const submarkets={...previous?.data.submarkets,[payload.submarketId]:{specId:payload.specId,sinceLastCargoUpdate:payload.sinceLastCargoUpdate,source:payload.source}};
 const next={id,version:previous?previous.version+1:0,schemaVersion:1,data:{marketId:market.id,atTick:ctx.world.clock.tick,submarkets}};
 validateOriginalRetailState({...ctx.world,extensions:{...ctx.world.extensions,[id]:next}},market.id);
 return {changes:[{collection:'markets',id:market.id,expectedVersion:market.version,value:{...market,version:market.version+1}},
  {collection:'extensions',id,expectedVersion:previous?.version??null,value:next}],events:[{type:'market.retail-captured',data:{marketId:market.id,submarketId:payload.submarketId,atTick:ctx.world.clock.tick}}],result:{marketId:market.id,submarketId:payload.submarketId,atTick:ctx.world.clock.tick}};
}
/** Supply/transport/stability must come from an authority resolver at this tick, not a player UI. */
function refresh(ctx,payload) {
 requireThat(ctx.actor.kind==='system','FORBIDDEN','Only authority may run an original resource refresh');
 shape(payload,['marketId','submarketId','asOfTick','stability','commodities','source'],'resolved resource refresh');
 source(payload.source);identifier(payload.submarketId);integer(payload.asOfTick,'stocking source tick');
 requireThat(payload.asOfTick===ctx.world.clock.tick,'MARKET_SNAPSHOT_STALE','Stocking inputs must be resolved at the current tick');
 const market=ctx.requireVersion('markets',identifier(payload.marketId)),economic=ctx.requireVersion('extensions',originalMarketStateId(market.id));
 ctx.services.market.validateState(ctx.world,market.id);
 requireThat(economic.data.asOfTick===ctx.world.clock.tick,'MARKET_SNAPSHOT_STALE','Cannot make stale prices or admission current by refreshing cargo');
 const timer=ctx.requireVersion('extensions',originalRetailStateId(market.id));validateOriginalRetailState(ctx.world,market.id);
 const sub=timer.data.submarkets[payload.submarketId];requireThat(sub,'RETAIL_UNAVAILABLE','Submarket has no captured timing');
 ctx.requireVersion('extensions',ORIGINAL_CALENDAR_EPOCH_KEY);
 const calendar=ctx.services.calendar.projectWorld(ctx.world);requireThat(calendar?.date,'RULES_UNAVAILABLE','Native month requires a real calendar epoch');
 const expectedIds=economic.data.commodityOrder.filter(id=>!R.commodities[id].tags.includes('nonecon')&&!R.commodities[id].tags.includes('meta'));
 requireThat(Array.isArray(payload.commodities)&&payload.commodities.length===expectedIds.length&&payload.commodities.every((c,i)=>c?.commodityId===expectedIds[i]),'INCOMPLETE_RETAIL_INPUT','Stocking inputs must cover the complete resolved economic roster in its native order');
 const result=refreshOriginalOpenMarketResources({marketId:market.id,submarketSpecId:sub.specId,month:calendar.date.month,stability:payload.stability,
  sinceLastCargoUpdate:sub.sinceLastCargoUpdate,inventory:economic.data.submarkets[payload.submarketId].inventory,commodities:payload.commodities,illegalCommodityIds:economic.data.illegalCommodityIds});
 const nextEconomic={...economic,data:{...economic.data,submarkets:{...economic.data.submarkets,[payload.submarketId]:{...economic.data.submarkets[payload.submarketId],inventory:result.inventory}}}};
 const nextTimer={...timer,data:{...timer.data,submarkets:{...timer.data.submarkets,[payload.submarketId]:{...sub,sinceLastCargoUpdate:0,source:payload.source}}}};
 const data={marketId:market.id,submarketId:payload.submarketId,asOfTick:ctx.world.clock.tick,elapsedDays:sub.sinceLastCargoUpdate,reports:result.reports};
 return {changes:[{collection:'markets',id:market.id,expectedVersion:market.version,value:{...market,version:market.version+1}},put(economic,nextEconomic),put(timer,nextTimer)],
  events:[{type:'market.resources-refreshed',data}],result:data};
}
export const originalRetailProvider=Object.freeze({id:'reference.open-retail',version:'0.1.0',service:'retail',apiVersion:1,
 extensionWriteGrants:[{service:'simulation',capabilities:['world-clock-writer'],commands:['world.advance']}],
 capabilities:['native-open-resource-refresh','fixed-frame-retail-counters'],requires:{market:['resolved-market-snapshot'],calendar:['absolute-calendar-projection']},
 evidence:[{reference:R.originalReference,sources:R.provenance.sources,scope:'Open-market resource refresh and timers, not ship/weapon generation or the upstream economy',cooperationPolicy:'One authority-owned inventory/timer per submarket; private player quotes cannot trigger stocking writes'}],
 methods:{validateWorld:validateOriginalRetailWorld,advanceFrame:advanceOriginalRetailFrame},commands:{'market.capture-open-retail':capture,'market.refresh-open-resources':refresh}});
