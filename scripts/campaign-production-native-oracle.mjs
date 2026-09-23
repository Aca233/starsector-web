/** Headless native method-block oracle. Finance, pollution and lazy market getters are outside this probe. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
function block(text, signature) {
  const start = text.indexOf(signature); assert.ok(start >= 0, signature); const open = text.indexOf('{', start);
  let end = open + 1, depth = 1;
  for (; end < text.length && depth; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; }
  assert.equal(depth, 0); return text.slice(start, end);
}
export function nativeProductionOracle(vectors) {
  const dir = mkdtempSync(join(tmpdir(), 'campaign-production-oracle-'));
  const api = fileURLToPath(new URL('../../decompiled/starfarer.api/com/fs/starfarer/api/', import.meta.url));
  const read = p => readFileSync(join(api, p), 'utf8');
  try {
    for (const name of ['MutableStat', 'StatBonus']) writeFileSync(join(dir, name + '.java'), read('combat/' + name + '.java').replace(/^package .*;\r?\n/m, '').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm, ''));
    const b = read('impl/campaign/econ/impl/BaseIndustry.java');
    const baseMethods = [
      'public void demand(String commodityId, int quantity)', 'public void demand(String commodityId, int quantity, String desc)',
      'public void demand(int index, String commodityId, int quantity, String desc)', 'public void demand(String modId, String commodityId, int quantity, String desc)',
      'public void supply(String commodityId, int quantity)', 'public void supply(String commodityId, int quantity, String desc)',
      'public void supply(int index, String commodityId, int quantity, String desc)', 'public void supply(String modId, String commodityId, int quantity, String desc)',
      'public boolean isFunctional()', 'public boolean isUpgrading()', 'public MutableCommodityQuantity getSupply(', 'public MutableCommodityQuantity getDemand(',
      'protected void updateAICoreToSupplyAndDemandModifiers(', 'protected void applyAlphaCoreSupplyAndDemandModifiers(',
      'protected void applyBetaCoreSupplyAndDemandModifiers(', 'protected void applyGammaCoreSupplyAndDemandModifiers(',
      'protected void updateSupplyAndDemandModifiers(', 'protected int getImproveProductionBonus(', 'protected void updateImprovementSupplyAndDemandModifiers(',
      'public Pair<String, Integer> getMaxDeficit(', 'protected void applyDeficitToProduction(', 'public boolean isSupplyLegal(', 'public boolean isDemandLegal(',
    ].map(s => block(b, s)).join('\n');
    const classCode = ['LightIndustry', 'Refining', 'HeavyIndustry', 'FuelProduction'].map(name => {
      const text = read('impl/campaign/econ/impl/' + name + '.java');
      const methods = ['public void apply()', 'public void unapply()', 'protected boolean canImproveToIncreaseProduction()', 'public boolean isSupplyLegal(', 'public boolean isDemandLegal('].filter(s=>text.includes(s)).map(s=>block(text,s)).join('\n');
      const constants = name === 'HeavyIndustry' ? text.match(/public static float ORBITAL_WORKS_QUALITY_BONUS = [0-9.]+f;/)[0] : '';
      return 'class ' + name + ' extends BaseIndustry { ' + constants + methods + '}';
    }).join('\n');
    const boost = read('impl/campaign/econ/impl/BoostIndustryInstallableItemEffect.java'), repo = read('impl/campaign/econ/impl/ItemEffectsRepo.java');
    const itemCode = ['corrupted_nanoforge', 'pristine_nanoforge', 'synchrotron', 'biofactory_embryo', 'catalytic_core'].map(id => {
      const part = repo.slice(repo.indexOf('this.put("' + id + '"'));
      const stop = part.indexOf('this.put(', 10), text = stop < 0 ? part : part.slice(0,stop);
      const methods = ['public void apply(', 'public void unapply(', 'public String[] getSimpleReqs('].filter(s=>text.includes(s)).map(s=>block(text,s)).join('\n');
      const bonus = text.match(/, ([A-Z_]+), 0/)[1]; return 'case "' + id + '": return new BoostEffect(id,' + bonus + ',0){' + methods + '};';
    }).join('\n');
    const constants = [...repo.matchAll(/^        ([A-Z_]+) = (-?[0-9.]+f?);/gm)].map(m=>'static final float '+m[1]+'='+m[2]+';').join('\n');
    const java = String.raw`import java.util.*;
class Pair<A,B>{A one;B two;}
class Global{static boolean CODEX_TOOLTIP_MODE=false;}
class Misc{static String ucFirst(String s){return s;}}
class MutableCommodityQuantity{MutableStat quantity=new MutableStat(0);MutableCommodityQuantity(String id){} MutableStat getQuantity(){return quantity;}}
class CommodityOnMarketAPI{boolean illegal;int available;boolean isIllegal(){return illegal;}int getAvailable(){return available;}}
interface Industry{MutableStat getSupplyBonus();MutableStat getDemandReduction();Market getMarket();}
class Dynamic{Map<String,Float> values=new HashMap<>();Map<String,StatBonus> mods=new HashMap<>();float getValue(String s,float fallback){return values.getOrDefault(s,fallback);}StatBonus getMod(String s){return mods.computeIfAbsent(s,k->new StatBonus());}}
class Stats{Dynamic dynamic=new Dynamic();Dynamic getDynamic(){return dynamic;}}
class Admin{Stats stats=new Stats();Stats getStats(){return stats;}}
class Market{int size;float previousStability;Admin admin=new Admin();Stats stats=new Stats();Set<String>conditions=new HashSet<>(),illegal=new HashSet<>();Map<String,CommodityOnMarketAPI>coms=new HashMap<>();int getSize(){return size;}Admin getAdmin(){return admin;}Stats getStats(){return stats;}boolean hasCondition(String s){return conditions.contains(s);}boolean isIllegal(String s){return illegal.contains(s);}float getPrevStability(){return previousStability;}CommodityOnMarketAPI getCommodityData(String id){return coms.computeIfAbsent(id,k->new CommodityOnMarketAPI());}}
class ItemSpec{String id;ItemSpec(String id){this.id=id;}String getId(){return id;}String getName(){return id;}}
class BoostEffect{
static String HABITABLE="habitable",NO_ATMOSPHERE="no_atmosphere";ItemSpec spec;float supplyIncrease,demandIncrease;BoostEffect(String id,float s,float d){spec=new ItemSpec(id);supplyIncrease=s;demandIncrease=d;}
public String[] getSimpleReqs(Industry i){return new String[0];}
// Only these two native hasCondition requirements are relevant; survey checks are disabled by BaseIndustry.
boolean enabled(Industry i){for(String condition:getSimpleReqs(i))if(!i.getMarket().hasCondition(condition))return false;return true;}
${block(boost, 'public void apply(')}
${block(boost, 'public void unapply(')}
}
class Items{
${constants}
static BoostEffect get(String id){switch(id){${itemCode}default:throw new IllegalArgumentException(id);}}
}
class BaseIndustry implements Industry{
static int SUPPLY_BONUS=1,DEMAND_REDUCTION=1,DEFAULT_IMPROVE_SUPPLY_BONUS=1;static String BASE_VALUE_TEXT="";
String id,upgradeId,aiCoreId,special;boolean building,disrupted,improved;Market market=new Market();
MutableStat supplyBonus=new MutableStat(0),demandReduction=new MutableStat(0),supplyBonusFromOther=new MutableStat(0),demandReductionFromOther=new MutableStat(0);
Map<String,MutableCommodityQuantity>supply=new LinkedHashMap<>(),demand=new LinkedHashMap<>();
public MutableStat getSupplyBonus(){return supplyBonus;}public MutableStat getDemandReduction(){return demandReduction;}public Market getMarket(){return market;}
String getId(){return id;}String getModId(int i){return "ind_"+id+"_"+i;}String getNameForModifier(){return id;}static String getDeficitText(String s){return s;}
boolean isBuilding(){return building;}boolean isDisrupted(){return disrupted;}boolean isImproved(){return improved;}boolean canImproveToIncreaseProduction(){return false;}String getImprovementsDescForModifiers(){return "";}
// Finance is outside this probe; these plugins do not override AI/improve callbacks.
public void apply(boolean ignored){updateSupplyAndDemandModifiers();if(special!=null){BoostEffect e=Items.get(special);if(e.enabled(this))e.apply(this);else e.unapply(this);}}
public void apply(){}public void unapply(){if(special!=null)Items.get(special).unapply(this);}
${baseMethods}
}
${classCode}
public class Oracle{
static String mods(Map<String,MutableStat.StatMod>mods){StringJoiner j=new StringJoiner(",","[","]");for(MutableStat.StatMod m:mods.values())j.add("{\"id\":\""+m.source+"\",\"value\":"+(double)m.value+"}");return j.toString();}
static String stat(MutableStat s){return "{\"base\":"+(double)s.base+",\"modifiers\":{\"flat\":"+mods(s.getFlatMods())+",\"percent\":"+mods(s.getPercentMods())+",\"mult\":"+mods(s.getMultMods())+"}}";}
static String quantities(Map<String,MutableCommodityQuantity>m){StringJoiner j=new StringJoiner(",","{","}");for(String id:m.keySet())j.add("\""+id+"\":"+stat(m.get(id).quantity));return j.toString();}
static String effective(Map<String,MutableCommodityQuantity>m){StringJoiner j=new StringJoiner(",","{","}");for(String id:m.keySet())j.add("\""+id+"\":"+(double)m.get(id).quantity.getModifiedValue());return j.toString();}
static String bonus(StatBonus s){return "{\"flat\":"+mods(s.getFlatBonuses())+",\"percent\":"+mods(s.getPercentBonuses())+",\"mult\":"+mods(s.getMultBonuses())+"}";}
static void emit(BaseIndustry b){CommodityOnMarketAPI c=new CommodityOnMarketAPI();c.illegal=true;System.out.println("{\"state\":{\"schemaVersion\":1,\"industryId\":\""+b.id+"\",\"supplyBonus\":"+stat(b.supplyBonus)+",\"demandReduction\":"+stat(b.demandReduction)+",\"supply\":"+quantities(b.supply)+",\"demand\":"+quantities(b.demand)+"},\"productionQuality\":"+bonus(b.market.stats.dynamic.getMod("production_quality_mod"))+",\"effectiveSupply\":"+effective(b.supply)+",\"effectiveDemand\":"+effective(b.demand)+",\"supplyLegal\":"+b.isSupplyLegal(c)+",\"demandLegal\":"+b.isDemandLegal(c)+"}");}
static void seed(BaseIndustry b,int n){
b.market.admin.stats.dynamic.values.put("supply_bonus",(n%5-2)*0.5f);b.market.admin.stats.dynamic.values.put("demand_reduction",(n%3-1)*0.5f);b.market.admin.stats.dynamic.values.put("fuel_supply_bonus",(n%7-3)*0.5f);
if(n%2==0){b.supplyBonusFromOther.modifyFlat(b.getModId(0),2);b.supplyBonusFromOther.modifyFlat("extra",-0.5f);b.supplyBonusFromOther.modifyMult("mult",0.5f);}
if(n%3==0){b.demandReductionFromOther.modifyFlat("extra",1.5f);b.demandReductionFromOther.modifyPercent("percent",25);}
if(n%4==0){b.getDemand("organics").quantity.modifyMult("half",0.5f);b.getDemand("ore").quantity.modifyMult("half",0.5f);}
if(n%5==0)b.getSupply("fuel").quantity.setBaseValue(1);
b.market.stats.dynamic.getMod("production_quality_mod").modifyFlat("external",0.1f);
}
public static void main(String[] args)throws Exception{Scanner scanner=new Scanner(System.in);while(scanner.hasNextLine()){
String[] x=scanner.nextLine().split("\\|");BaseIndustry b=(BaseIndustry)Class.forName(x[1]).getDeclaredConstructor().newInstance();b.id=x[0];b.market.size=Integer.parseInt(x[2]);int n=Integer.parseInt(x[3]);b.aiCoreId=x[4].equals("none")?null:x[4];b.improved=x[5].equals("1");b.special=x[6].equals("none")?null:x[6];seed(b,n);
for(int step=0;step<4;step++){
b.market.conditions.clear();if((n+step)%2==0)b.market.conditions.add("habitable");if((n+step)%3==0)b.market.conditions.add("no_atmosphere");
b.market.illegal.clear();if((n+step)%2==1)b.market.illegal.addAll(Arrays.asList("drugs","luxury_goods"));
b.market.previousStability=step==1?8:(n%11)*0.5f;
for(String c:new String[]{"organics","heavy_machinery","ore","rare_ore","metals","rare_metals","volatiles"})b.market.getCommodityData(c).available=(n+step+c.length())%10-1;
if(step==2)b.disrupted=true;if(step==3){b.unapply();b.special=null;b.aiCoreId=null;b.improved=false;b.disrupted=false;b.building=true;b.upgradeId="next_industry";}
b.apply();emit(b);
}}}}
`;
    writeFileSync(join(dir, 'Oracle.java'), java);
    const compiled = spawnSync('javac', ['-encoding','UTF-8','-d',dir,join(dir,'MutableStat.java'),join(dir,'StatBonus.java'),join(dir,'Oracle.java')], { encoding:'utf8', timeout:30000, windowsHide:true });
    assert.equal(compiled.status,0,compiled.stderr);
    const input = vectors.map(v=>[v.id,v.className,v.size,v.seed,v.core??'none',v.improved?1:0,v.item??'none'].join('|')).join('\n')+'\n';
    const result=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,windowsHide:true,input});
    assert.equal(result.status,0,result.stderr);return result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  } finally {
    const absolute=resolve(dir),root=resolve(tmpdir());assert.ok(absolute.startsWith(root+sep)&&absolute!==root);
    for(const file of readdirSync(absolute))unlinkSync(join(absolute,file));rmdirSync(absolute);
  }
}
