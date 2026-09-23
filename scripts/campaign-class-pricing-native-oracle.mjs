/** Original class-price loops, shared MutableStat and updateCalc, with captured engine getters. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ORIGINAL_MARKET_ECONOMY as E } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
import { ORIGINAL_MARKET_REFERENCE as R } from '../src/campaign/rules/OriginalMarketPricing.mjs';
function block(t,s){const a=t.indexOf(s);assert.ok(a>=0,s);let i=t.indexOf('{',a)+1,d=1;for(;i<t.length&&d;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i);}
const j=JSON.stringify,n=v=>Object.is(v,-0)?'-0.0f':v+'f';
function init(target,s,bonus=false){let out=bonus?'':target+'.setBaseValue('+n(s.base)+');';const mods=bonus?s:s.modifiers;for(const k of ['flat','percent','mult'])for(const m of mods[k])out+=target+'.modify'+k[0].toUpperCase()+k.slice(1)+'Always('+j(m.id)+','+n(m.value)+',null);';return out;}
export function nativeClassPriceSnapshots(histories){
 const root=fileURLToPath(new URL('../..',import.meta.url)),api=join(root,'decompiled/starfarer.api/com/fs/starfarer/api'),obf=join(root,'decompiled/starfarer_obf/com/fs/starfarer/campaign/econ'),dir=mkdtempSync(join(tmpdir(),'campaign-class-pricing-'));
 const read=p=>readFileSync(join(api,p),'utf8'),native=p=>readFileSync(join(obf,p),'utf8');
 const rename=t=>t.replace(/\bOOoO{30,}\b/g,'Spec').replace(/\boOoO{30,}2\b/g,'seedSpec');
 try {
  for(const name of ['MutableStat','StatBonus'])writeFileSync(join(dir,name+'.java'),read('combat/'+name+'.java').replace(/^package .*;\r?\n/m,'').replace(/^import com\.fs\.starfarer\..*;\r?\n/gm,''));
  const main=native('reach/MainWorkTask2.java'),com=native('CommodityOnMarket.java'),base=read('impl/campaign/econ/impl/BaseIndustry.java');
  const icons=read('impl/campaign/econ/CommodityIconCounts.java').replace(/^package .*;\r?\n/m,'').replace(/^import com\..*;\r?\n/gm,'').replace('public class CommodityIconCounts','class CommodityIconCounts');
  const setup=histories.map((h,i)=>{
    const p=h.initial;
    let s='static void scenario'+i+'(){Market m=new Market('+j(p.marketId)+');MarketDemand demand=new MarketDemand(specs.get('+j(R.commodities[p.triggerCommodityId].demandClass)+'));'+init('demand.demand',p.demandStat);
    for(const r of p.commodities){s+='{CommodityOnMarket c=new CommodityOnMarket(m,demand,specs.get('+j(r.commodityId)+'));c.maxSupply='+r.maxSupply+';c.maxDemand='+r.maxDemand+';c.availableValue='+r.available+';c.available.setBaseValue('+n(r.availableWithoutTrade)+');c.sg='+r.shippingGlobal+';c.sf='+r.shippingFaction+';c.data.max='+(r.maxExportGlobal??0)+';c.stockpile='+n(r.stockpile)+';c.tradeMod.setBaseValue('+n(r.tradeMod.both)+');c.tradeModPlus.setBaseValue('+n(r.tradeMod.plus)+');c.tradeModMinus.setBaseValue('+n(r.tradeMod.minus)+');'+init('c.greed',r.greedStat)+init('c.playerDemand',r.playerModifiers.p.demand,true)+init('c.playerSupply',r.playerModifiers.p.supply,true)+'m.rows.add(c);}';}
    for(const step of h.steps){for(const change of step.demands??[])s+='m.row('+j(change.commodityId)+').maxDemand='+change.maxDemand+';';s+='Global.month='+step.month+';MainWorkTask2.updateStockpileAndPriceV2(m,specs.get('+j(step.triggerCommodityId)+'));System.out.println(snapshot(m,demand));';}
    return s+'}';
  }).join('\n');
  const specs=Object.values(R.commodities).filter(s=>!s.plugin&&!s.tags.includes('nonecon')).map(s=>'specs.put('+j(s.id)+',new Spec('+j(s.id)+','+j(s.demandClass)+','+n(s.econUnit)+','+n(s.basePrice)+','+n(s.utility)+','+j(s.variability)+'));').join('');
  const java=String.raw`
import java.util.*;
interface CommodityOnMarketAPI{Market getMarket();Spec getCommodity();int getAvailable();int getMaxSupply();int getMaxDemand();}
class Spec{String id,dc,variability;float unit,base,utility;Spec(String i,String d,float u,float b,float v,String p){id=i;dc=d;unit=u;base=b;utility=v;variability=p;}String getId(){return id;}String getDemandClass(){return dc;}boolean isPrimary(){return id.equals(dc);}float getEconUnit(){return unit;}float getBasePrice(){return base;}float getUtility(){return utility;}String getPriceVariability(){return variability;}}
class Market{String id;int sg,sf;List<CommodityOnMarket>rows=new ArrayList<>();Market(String i){id=i;}String getId(){return id;}List<CommodityOnMarket>getCommoditiesWithClass(String dc){List<CommodityOnMarket>r=new ArrayList<>();for(CommodityOnMarket c:rows)if(c.spec.dc.equals(dc))r.add(c);return r;}CommodityOnMarket row(String id){for(CommodityOnMarket c:rows)if(c.spec.id.equals(id))return c;throw new RuntimeException(id);}}
class Global{static int month;static Global getSector(){return new Global();}Global getClock(){return this;}int getMonth(){return month;}static Global getSettings(){return new Global();}int getShippingCapacity(Market m,boolean faction){return faction?m.sf:m.sg;}}
class MarketDemand{Spec base;MutableStat demand=new MutableStat(0);MarketDemand(Spec b){base=b;}MutableStat getDemand(){return demand;}Spec getBaseCommodity(){return base;}${block(native('MarketDemand.java'),'public float getDemandValue()')}}
class CommodityMarketData{int max;int getMaxExportGlobal(){return max;}}
class PriceCalculator{float basePrice,demand,highThreshold=-1,highMult=1,lowThreshold=-1,lowMult=1;String variability;void setBasePrice(float v){basePrice=v;}void setDemand(float v){demand=v;}void setVariability(String v){variability=v;}void setHighPriceThreshold(float v){highThreshold=v;}void setHighPriceMult(float v){highMult=v;}void setLowPriceThreshold(float v){lowThreshold=v;}void setLowPriceMult(float v){lowMult=v;}}
class CommodityOnMarket implements CommodityOnMarketAPI{Market market;Spec spec;MarketDemand demand;int maxSupply,maxDemand,availableValue,sg,sf;float stockpile;MutableStat available=new MutableStat(0),greed=new MutableStat(0),tradeMod=new MutableStat(0),tradeModPlus=new MutableStat(0),tradeModMinus=new MutableStat(0);StatBonus playerDemand=new StatBonus(),playerSupply=new StatBonus();PriceCalculator supplyPrice=new PriceCalculator(),demandPrice=new PriceCalculator();CommodityMarketData data=new CommodityMarketData();CommodityOnMarket(Market m,MarketDemand d,Spec s){market=m;demand=d;spec=s;}public Market getMarket(){market.sg=sg;market.sf=sf;return market;}public Spec getCommodity(){return spec;}public int getAvailable(){return availableValue;}public int getMaxSupply(){return maxSupply;}public int getMaxDemand(){return maxDemand;}MarketDemand getDemand(){return demand;}MutableStat getGreed(){return greed;}StatBonus getPlayerDemandPriceMod(){return playerDemand;}CommodityMarketData getCommodityMarketData(){return data;}PriceCalculator getSupplyPrice(){return supplyPrice;}PriceCalculator getDemandPrice(){return demandPrice;}MutableStat getTradeMod(){return tradeMod;}MutableStat getTradeModPlus(){return tradeModPlus;}MutableStat getTradeModMinus(){return tradeModMinus;}
${['public void updateCalc()','public float getCombinedTradeModQuantity()','public float getModValueForQuantity(float f2)','public void setStockpile(float f2)','public float getStockpile()'].map(s=>rename(block(com,s))).join('\n')}}
class BaseIndustry{${block(base,'public static float getSizeMult(float size)')}${block(base,'public static float getCommodityEconUnitMult(float size)')}}
class Economy{static final int MIN_STOCKPILE_FOR_PRICING=${E.settings.economyMinStockpileForPricing};static final float ECONOMY_GREED_FRACTION=${n(E.settings.economyGreedFraction)},ECONOMY_NO_DEMAND_PRICE_MULT=${n(E.settings.economyNoDemandPriceMult)},DEFICIT_PRICE_INCR_PER_UNIT=${n(E.settings.economyDeficitPriceIncrPerUnit)},DEFICIT_PRICE_MULT_MAX=${n(E.settings.economyDeficitPriceMultMax)},EXCESS_PRICE_DECR_PER_UNIT=${n(E.settings.economyExcessPriceDecrPerUnit)},EXCESS_PRICE_MULT_MIN=${n(E.settings.economyExcessPriceMultMin)};}
${icons}
class MainWorkTask2{${rename(block(main,'public static void updateStockpileAndPriceV2'))}${block(main,'public static float getStockpileQuantity')}}
public class Oracle{static Map<String,Spec>specs=new HashMap<>();
static String mods(Map<String,MutableStat.StatMod>m){StringJoiner j=new StringJoiner(",","[","]");for(MutableStat.StatMod v:m.values())j.add("{\"id\":\""+v.source+"\",\"value\":"+(double)v.value+"}");return j.toString();}
static String stat(MutableStat s){return "{\"base\":"+(double)s.base+",\"modifiers\":{\"flat\":"+mods(s.getFlatMods())+",\"percent\":"+mods(s.getPercentMods())+",\"mult\":"+mods(s.getMultMods())+"}}";}
static String bonus(StatBonus s){return "{\"flat\":"+mods(s.getFlatBonuses())+",\"percent\":"+mods(s.getPercentBonuses())+",\"mult\":"+mods(s.getMultBonuses())+"}";}
static String price(PriceCalculator p){return "{\"basePrice\":"+(double)p.basePrice+",\"variability\":\""+p.variability+"\",\"demand\":"+(double)p.demand+",\"highThreshold\":"+(double)p.highThreshold+",\"highMult\":"+(double)p.highMult+",\"lowThreshold\":"+(double)p.lowThreshold+",\"lowMult\":"+(double)p.lowMult+"}";}
static String snapshot(Market m,MarketDemand d){StringJoiner rows=new StringJoiner(",","[","]");for(CommodityOnMarket c:m.rows)rows.add("{\"commodityId\":\""+c.spec.id+"\",\"stockpile\":"+(double)c.getStockpile()+",\"greedStat\":"+stat(c.greed)+",\"playerModifiers\":{\"p\":{\"supply\":"+bonus(c.playerSupply)+",\"demand\":"+bonus(c.playerDemand)+"}},\"demandPrice\":"+price(c.demandPrice)+",\"supplyPrice\":"+price(c.supplyPrice)+"}");return "{\"demandStat\":"+stat(d.demand)+",\"demandValue\":"+(double)d.getDemandValue()+",\"commodities\":"+rows+"}";}
${setup}
public static void main(String[]args){${specs}${histories.map((_,i)=>'scenario'+i+'();').join('')}}}
`;
  writeFileSync(join(dir,'Oracle.java'),java);
  const c=spawnSync('javac',['-encoding','UTF-8','-d',dir,...['MutableStat','StatBonus','Oracle'].map(s=>join(dir,s+'.java'))],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});assert.equal(c.status,0,c.stderr);
  const r=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
 }finally{const target=resolve(dir),parent=resolve(tmpdir());assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const p of readdirSync(target))unlinkSync(join(target,p));rmdirSync(target);}
}
