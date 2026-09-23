import { identifier, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY, economyShape, originalEconomyShipping } from './OriginalMarketEconomy.mjs';
import { financeStat, financeFloat, nativeInt } from './OriginalMarketFinance.mjs';
import { resolveOriginalCommodityFinance } from './OriginalCommodityFinance.mjs';
import { bool } from './OriginalIndustryState.mjs';
const f=Math.fround, check=(v,m)=>requireThat(v,'UNSUPPORTED_COMMODITY_CACHE',m);
/** Values read by CommodityMarketData.getExportIncome at call time, not construction time. */
export function originalCachedCommodityExportIncome(input) {
  economyShape(input,['sourceIsIllegal','exportMarketShare','marketValue','incomeMult','playerOwned','playerCommodityExportMult'],'cached export income getter');
  bool(input.sourceIsIllegal,'source legality');
  // Native early return does not read market or player modifiers for an illegal source.
  if(input.sourceIsIllegal)return 0;
  financeFloat(input.exportMarketShare,'cached market share',0,1);financeFloat(input.marketValue,'cached market value',-Number.MAX_VALUE,Number.MAX_VALUE);bool(input.playerOwned,'current ownership');
  const income=financeStat(input.incomeMult);if(input.playerOwned)financeFloat(input.playerCommodityExportMult,'current commodity export multiplier');else check(input.playerCommodityExportMult===null,'Non-player getter must not use a player multiplier');
  return nativeInt(f(f(input.exportMarketShare*input.marketValue)*f(income*(input.playerOwned?input.playerCommodityExportMult:1))));
}
/**
 * Per-market/per-commodity native object references. NO TTL, auto invalidation on group changes,
 * global group-result reuse, or freshness assertion. Runtime capture/apply use one authority draft.
 * Capture supplies full live group data, updates native cached supply/demand, and must not recurse.
 */
export class OriginalCommodityNetworkCache {
  #runtime;#refs=new Map();#serial=0;#building=false;
  constructor(runtime){for(const method of ['capture','apply','setDemandFromPrimary','getEconGroup','getIncomeInputs','getAccessibility'])check(typeof runtime?.[method]==='function','Missing cache runtime '+method);this.#runtime=runtime;}
  checkpoint() {
    check(!this.#building,'Cannot checkpoint a commodity constructor in progress');
    const entries=Object.freeze([...new Set(this.#refs.values())]);
    const bindings=immutableJSON([...this.#refs].map(([key,entry])=>[...key.split('\0'),entry.serial]));
    // Each entry is already immutable and individually bounded; do not flatten all networks into one wire message.
    return Object.freeze({scope:'web-commodity-cache-checkpoint',schemaVersion:1,serial:this.#serial,entries,bindings});
  }
  static fromCheckpoint(runtime,s) {
    economyShape(s,['scope','schemaVersion','serial','entries','bindings'],'commodity cache checkpoint');
    check(s.scope==='web-commodity-cache-checkpoint'&&s.schemaVersion===1,'Unsupported commodity cache checkpoint');
    check(Number.isSafeInteger(s.serial)&&s.serial>=0,'Invalid cache serial');
    check(Array.isArray(s.entries)&&s.entries.length<=100000&&Array.isArray(s.bindings)&&s.bindings.length<=100000,'Cache checkpoint exceeds bindings limit');
    const cache=new OriginalCommodityNetworkCache(runtime),entries=new Map(),used=new Set();
    for(const value of s.entries){
      const entry=immutableJSON(value);
      economyShape(entry,['scope','serial','data'],'cached network object');
      check(entry.scope==='native-commodity-cache-object'&&Number.isSafeInteger(entry.serial)&&entry.serial>0&&entry.serial<=s.serial&&!entries.has(entry.serial),'Invalid cached network identity');
      check(entry.data?.scope==='original-single-player-commodity-financial-effects-only'&&Array.isArray(entry.data.markets)&&Array.isArray(entry.data.network?.markets),'Invalid cached network data');
      identifier(entry.data.network.commodityId);entries.set(entry.serial,entry);
    }
    for(const binding of s.bindings){
      check(Array.isArray(binding)&&binding.length===3,'Invalid cache binding');
      const [marketId,commodityId,serial]=binding,key=cache.#key(marketId,commodityId),entry=entries.get(serial);
      check(entry&&!cache.#refs.has(key)&&entry.data.network.commodityId===commodityId&&entry.data.network.markets.some(m=>m.marketId===marketId),'Dangling, conflicting or mismatched cache binding');
      cache.#refs.set(key,entry);used.add(serial);
    }
    check(used.size===entries.size,'Unbound checkpoint cache objects');cache.#serial=s.serial;
    return cache;
  }
  #call(method,...args){const result=this.#runtime[method](...args);check(!result||typeof result.then!=='function','Commodity runtime must be synchronous: '+method);return result;}
  #key(marketId,commodityId){identifier(marketId);identifier(commodityId);return marketId+'\0'+commodityId;}
  peek(marketId,commodityId){return this.#refs.get(this.#key(marketId,commodityId))??null;}
  get(marketId,commodityId){const old=this.peek(marketId,commodityId);if(old!==null)return old;const group=this.#call('getEconGroup',marketId);return this.rebuild(commodityId,group);}
  rebuild(commodityId,econGroup){
    identifier(commodityId);if(econGroup!==null)identifier(econGroup);check(!this.#building,'Recursive commodity constructor capture requires a phase-aware runtime');this.#building=true;
    const before=[];
    try {
      const input=this.#call('capture',commodityId,econGroup);check(input?.network?.commodityId===commodityId&&input.network.econGroup===econGroup,'Captured another commodity or economy group');
      const data=resolveOriginalCommodityFinance(input),entry=immutableJSON({scope:'native-commodity-cache-object',serial:++this.#serial,data});
      const variants=Object.values(ORIGINAL_MARKET_ECONOMY.commodities).filter(c=>c.id!==commodityId && c.demandClass===commodityId);
      for(const m of input.network.markets)for(const variant of variants)this.#call('setDemandFromPrimary',m.marketId,variant.id,m.amounts.maxDemand,m.amounts.demandLegal);
      // Bind only live members returned by the COMPLETE group capture. A removed calling market
      // is not rebound merely because it requested construction of its former group.
      for(const m of input.network.markets){const key=this.#key(m.marketId,commodityId);before.push([key,this.#refs.get(key)]);this.#refs.set(key,entry);}
      this.#call('apply',input,entry);return entry;
    }catch(error){for(const [key,old]of before){if(old===undefined)this.#refs.delete(key);else this.#refs.set(key,old);}throw error;}
    finally{this.#building=false;}
  }
  getExportIncome(marketId,commodityId){
    const entry=this.peek(marketId,commodityId);if(entry===null)return 0;const row=entry.data.markets.find(r=>r.marketId===marketId);
    if(row?.sourceIsIllegal)return 0;
    const current=this.#call('getIncomeInputs',marketId,commodityId);economyShape(current,['incomeMult','playerOwned','playerCommodityExportMult'],'current cached income inputs');
    return originalCachedCommodityExportIncome({sourceIsIllegal:false,exportMarketShare:row?.exportMarketShare??0,marketValue:entry.data.marketValue,...current});
  }
  getShipping(marketId){identifier(marketId);return originalEconomyShipping(financeStat({base:0,modifiers:this.#call('getAccessibility',marketId)}));}
}
