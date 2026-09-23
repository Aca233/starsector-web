/** Original cache/getter/maxima methods; network construction is an identity-only live-membership stub here. */
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
function block(t,s){const a=t.indexOf(s);assert.ok(a>=0,s);let i=t.indexOf('{',a)+1,d=1;for(;i<t.length&&d;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i);}
const j=JSON.stringify,n=v=>Object.is(v,-0)?'-0.0f':Number.isNaN(v)?'Float.NaN':v+'f';
function initStat(target,s){let out=`${target}.setBaseValue(${n(s.base)});`;for(const k of ['flat','percent','mult'])for(const v of s.modifiers[k])out+=`${target}.modify${k[0].toUpperCase()+k.slice(1)}Always(${j(v.id)},${n(v.value)},null);`;return out;}
export function nativeCommodityCacheChecks(maximaCases,incomeCases){
 const root=fileURLToPath(new URL('../..',import.meta.url)),api=join(root,'decompiled/starfarer.api/com/fs/starfarer/api'),obf=join(root,'decompiled/starfarer_obf/com/fs/starfarer/campaign/econ'),dir=mkdtempSync(join(tmpdir(),'campaign-cache-'));
 const commodity=readFileSync(join(obf,'CommodityOnMarket.java'),'utf8'),data=readFileSync(join(obf,'reach/CommodityMarketData.java'),'utf8');
 try{
  for(const name of ['MutableStat','StatBonus'])writeFileSync(join(dir,name+'.java'),readFileSync(join(api,'combat/'+name+'.java'),'utf8').replace(/^package .*;\r?\n/m,'').replace(/^import com\.fs\.starfarer\..*;\r?\n/gm,''));
  const maxima=maximaCases.map((p,i)=>`static void maxima${i}(){Market m=new Market("a",null);CommodityOnMarket c=m.com(${j(p.commodityId)});c.primary=${p.commodityId!=='lobster'};c.isSupplyLegal=${p.previousSupplyLegal};c.isDemandLegal=${p.previousDemandLegal};c.maxDemand=99;c.maxSupply=99;${p.industries.map(e=>`m.industries.add(new Industry(${n(e.supply)},${n(e.demand)},${e.supplyLegal},${e.demandLegal}));`).join('')}c.updateMaxSupplyAndDemand();System.out.println("{\\"maxSupply\\":"+c.maxSupply+",\\"maxDemand\\":"+c.maxDemand+",\\"supplyLegal\\":"+c.isSupplyLegal+",\\"demandLegal\\":"+c.isDemandLegal+",\\"demandReads\\":"+m.industries.stream().mapToInt(x->x.demandReads).sum()+"}");}`).join('\n');
  const incomes=incomeCases.map((p,i)=>`static void income${i}(){Market m=new Market("a",null);m.owned=${p.playerOwned};${initStat('m.income',p.incomeMult)}Global.mult=${n(p.playerCommodityExportMult??1)};CommodityOnMarket c=m.com("food");CommodityMarketData d=new CommodityMarketData("food",null);d.value=${n(p.marketValue)};MarketShareData share=d.getMarketShareData(m);share.illegal=${p.sourceIsIllegal};share.share=${n(p.exportMarketShare)};c.commodityMarketData=d;System.out.println(c.getExportIncome());}`).join('\n');
  const java=String.raw`
import java.util.*;
interface CommodityOnMarketAPI{MarketAPI getMarket();String getId();}
interface MarketAPI{MutableStat getIncomeMult();boolean isPlayerOwned();}
class CommoditySpec{boolean primary;CommoditySpec(boolean b){primary=b;}boolean isPrimary(){return primary;}}
class Quantity{MutableStat q;Quantity(float n){q=new MutableStat(n);}MutableStat getQuantity(){return q;}}
class Industry{Quantity supply,demand;boolean supplyLegal,demandLegal;int demandReads;Industry(float s,float d,boolean a,boolean b){supply=new Quantity(s);demand=new Quantity(d);supplyLegal=a;demandLegal=b;}Quantity getSupply(String id){return supply;}Quantity getDemand(String id){demandReads++;return demand;}boolean isSupplyLegal(CommodityOnMarketAPI c){return supplyLegal;}boolean isDemandLegal(CommodityOnMarketAPI c){return demandLegal;}}
class Market implements MarketAPI{String id,group;boolean owned;MutableStat income=new MutableStat(1);List<Industry>industries=new ArrayList<>();Map<String,CommodityOnMarket>commodities=new HashMap<>();Market(String i,String g){id=i;group=g;}String getEconGroup(){return group;}List<Industry>getIndustries(){return industries;}public MutableStat getIncomeMult(){return income;}public boolean isPlayerOwned(){return owned;}CommodityOnMarket com(String id){return commodities.computeIfAbsent(id,k->new CommodityOnMarket(this,id));}}
class CommodityOnMarket implements CommodityOnMarketAPI{Market market;String id;boolean primary=true,isSupplyLegal=true,isDemandLegal=true;int maxSupply,maxDemand;CommodityMarketData commodityMarketData;CommodityOnMarket(Market m,String i){market=m;id=i;}public String getId(){return id;}public Market getMarket(){return market;}CommoditySpec getCommodity(){return new CommoditySpec(primary);}
${['public CommodityMarketData getCommodityMarketData()', 'public int getExportIncome()', 'public void updateMaxSupplyAndDemand()'].map(s=>block(commodity,s)).join('\n')}}
class Global{static float mult=1;static Global getSector(){return new Global();}Global getPlayerStats(){return this;}Global getDynamic(){return this;}float getValue(String id){return mult;}}
class Stats{static String getCommodityExportCreditsMultId(String id){return id;}}
class MarketShareData{boolean illegal;float share;boolean isSourceIsIllegal(){return illegal;}float getExportMarketShare(){return share;}}
class CommodityMarketData{static List<Market>live=new ArrayList<>();static int serial;int id=++serial;float value;Map<MarketAPI,MarketShareData>shares=new HashMap<>();CommodityMarketData(String commodity,String group){for(Market m:live)if(Objects.equals(m.group,group))m.com(commodity).commodityMarketData=this;}MarketShareData getMarketShareData(MarketAPI m){return shares.computeIfAbsent(m,k->new MarketShareData());}float getMarketValue(){return value;}${block(data,'public int getExportIncome(')}}
public class Oracle{${maxima}${incomes}
static void lifecycle(){CommodityMarketData.serial=0;CommodityMarketData.live.clear();Market a=new Market("a",null),b=new Market("b",null),removed=new Market("removed","empty");CommodityMarketData.live.add(a);CommodityMarketData.live.add(b);List<Integer>r=new ArrayList<>();r.add(a.com("food").getExportIncome());r.add(CommodityMarketData.serial);CommodityMarketData old=a.com("food").getCommodityMarketData();r.add(old.id);r.add(b.com("food").getCommodityMarketData().id);b.group="private";r.add(b.com("food").getCommodityMarketData().id);CommodityMarketData next=new CommodityMarketData("food",null);r.add(a.com("food").getCommodityMarketData().id);r.add(b.com("food").getCommodityMarketData().id);new CommodityMarketData("food","private");r.add(b.com("food").getCommodityMarketData().id);r.add(removed.com("food").getCommodityMarketData().id);r.add(removed.com("food").getCommodityMarketData().id);r.add(removed.com("food").commodityMarketData==null?1:0);System.out.println(r);}
public static void main(String[]args){${maximaCases.map((_,i)=>`maxima${i}();`).join('')}${incomeCases.map((_,i)=>`income${i}();`).join('')}lifecycle();}}
`;
  writeFileSync(join(dir,'Oracle.java'),java);
  const c=spawnSync('javac',['-encoding','UTF-8','-d',dir,...['MutableStat','StatBonus','Oracle'].map(x=>join(dir,x+'.java'))],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});assert.equal(c.status,0,c.stderr);
  const r=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s));
 }finally{const target=resolve(dir),parent=resolve(tmpdir());assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const p of readdirSync(target))unlinkSync(join(target,p));rmdirSync(target);}
}
