/** Method-block oracle; no original game/UI launch. Non-commodity industry effects are intentionally absent. */
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
function range(text, first, after) {
  const start = text.indexOf(first), end = text.indexOf(after, start);
  assert.ok(start >= 0 && end > start, first + ' -> ' + after); return text.slice(start, end);
}
export function nativeCivicOracle(vectors) {
  const dir = mkdtempSync(join(tmpdir(), 'campaign-civic-oracle-'));
  const api = fileURLToPath(new URL('../../decompiled/starfarer.api/com/fs/starfarer/api/', import.meta.url));
  const read = p => readFileSync(join(api, p), 'utf8');
  try {
    for (const name of ['MutableStat', 'StatBonus']) writeFileSync(join(dir, name + '.java'), read('combat/' + name + '.java').replace(/^package .*;\r?\n/m, '').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm, ''));
    const b = read('impl/campaign/econ/impl/BaseIndustry.java');
    const aggregate = block(readFileSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/CommodityOnMarket.java', import.meta.url), 'utf8'), 'public void updateMaxSupplyAndDemand()');
    const baseMethods = [
      'public void demand(String commodityId, int quantity)', 'public void demand(String commodityId, int quantity, String desc)',
      'public void demand(int index, String commodityId, int quantity, String desc)', 'public void demand(String modId, String commodityId, int quantity, String desc)',
      'public void supply(String commodityId, int quantity)', 'public void supply(String commodityId, int quantity, String desc)',
      'public void supply(int index, String commodityId, int quantity, String desc)', 'public void supply(String modId, String commodityId, int quantity, String desc)',
      'public boolean isFunctional()', 'public boolean isUpgrading()', 'public MutableCommodityQuantity getSupply(', 'public MutableCommodityQuantity getDemand(',
      'protected void updateAICoreToSupplyAndDemandModifiers(', 'protected void applyAlphaCoreSupplyAndDemandModifiers(',
      'protected void applyBetaCoreSupplyAndDemandModifiers(', 'protected void applyGammaCoreSupplyAndDemandModifiers(',
      'protected void updateSupplyAndDemandModifiers(', 'protected int getImproveProductionBonus(', 'protected void updateImprovementSupplyAndDemandModifiers(',
      'public boolean isSupplyLegal(', 'public boolean isDemandLegal(',
    ].map(s => block(b, s)).join('\n');
    const classes = ['PopulationAndInfrastructure', 'Spaceport', 'MilitaryBase', 'GroundDefenses', 'OrbitalStation'];
    const classCode = classes.map(name => {
      const source = read('impl/campaign/econ/impl/' + name + '.java'), apply = block(source, 'public void apply()'); let body;
      if (name === 'PopulationAndInfrastructure') body = 'super.apply(true);\n' + range(apply, 'int size =', 'Pair<String, Integer> deficit');
      else if (name === 'Spaceport') body = 'super.apply(true);\n' + range(apply, 'int size =', 'String desc =');
      else if (name === 'GroundDefenses') body = 'super.apply(true);\n' + range(apply, 'int size =', 'this.modifyStabilityWithBaseMod();');
      else if (name === 'OrbitalStation') body = 'super.apply(false);\n' + range(apply, 'int size =', 'this.modifyStabilityWithBaseMod();') + range(apply, 'this.demand("crew"', 'float mult =');
      else body = range(apply, 'int size =', 'super.apply(!patrol);') + 'super.apply(!patrol);\n' + range(apply, 'int extraDemand =', 'this.market.getStats()') + range(apply, 'this.demand("supplies"', 'this.modifyStabilityWithBaseMod();');
      if (name !== 'PopulationAndInfrastructure') body += '\n' + block(apply, 'if (!this.isFunctional())');
      const overrides = ['protected void applyAlphaCoreSupplyAndDemandModifiers(', 'public boolean isSupplyLegal(', 'public boolean isDemandLegal('].filter(sig => source.includes(sig)).map(sig => block(source, sig)).join('\n');
      return `class ${name} extends BaseIndustry{public void apply(){${body}}\n${overrides}}`;
    }).join('\n');
    const java = String.raw`import java.util.*;
class MutableCommodityQuantity{MutableStat quantity=new MutableStat(0);MutableCommodityQuantity(String id){} MutableStat getQuantity(){return quantity;}}
class CommodityOnMarketAPI{boolean illegal;boolean isIllegal(){return illegal;}}
interface Industry{MutableCommodityQuantity getSupply(String id);MutableCommodityQuantity getDemand(String id);boolean isSupplyLegal(CommodityOnMarketAPI c);boolean isDemandLegal(CommodityOnMarketAPI c);}
class CommoditySpec{boolean isPrimary(){return true;}}
class NativeCommodity extends CommodityOnMarketAPI{Market market;String id;int maxSupply,maxDemand;boolean isSupplyLegal,isDemandLegal;String getId(){return id;}CommoditySpec getCommodity(){return new CommoditySpec();}
${aggregate}
}
class Dynamic{Map<String,Float> values=new HashMap<>();float getValue(String s,float fallback){return values.getOrDefault(s,fallback);}}
class Stats{Dynamic dynamic=new Dynamic();Dynamic getDynamic(){return dynamic;}}
class Admin{Stats stats=new Stats();Stats getStats(){return stats;}}
class Spec{Set<String>tags=new HashSet<>();boolean hasTag(String t){return tags.contains(t);}}
class Market{List<Industry>industries=new ArrayList<>();List<Industry>getIndustries(){return industries;}int size;boolean habitable;Admin admin=new Admin();int getSize(){return size;}Admin getAdmin(){return admin;}boolean hasCondition(String id){return id.equals("habitable")&&habitable;}void setHasSpaceport(boolean b){}}
class BaseIndustry implements Industry{
static int SUPPLY_BONUS=1,DEMAND_REDUCTION=1,DEFAULT_IMPROVE_SUPPLY_BONUS=1;static String BASE_VALUE_TEXT="";
String id,upgradeId,aiCoreId;boolean building,disrupted,improved;Market market;Spec spec=new Spec();
MutableStat supplyBonus=new MutableStat(0),demandReduction=new MutableStat(0),supplyBonusFromOther=new MutableStat(0),demandReductionFromOther=new MutableStat(0);
Map<String,MutableCommodityQuantity>supply=new LinkedHashMap<>(),demand=new LinkedHashMap<>();
String getId(){return id;}String getModId(int i){return "ind_"+id+"_"+i;}Spec getSpec(){return spec;}
boolean isBuilding(){return building;}boolean isDisrupted(){return disrupted;}boolean isImproved(){return improved;}boolean canImproveToIncreaseProduction(){return false;}
String getImprovementsDescForModifiers(){return "";}public void apply(boolean ignored){updateSupplyAndDemandModifiers();}public void apply(){}public void unapply(){}
${baseMethods}
}
${classCode}
public class Oracle{
static String mods(Map<String,MutableStat.StatMod>mods){StringJoiner j=new StringJoiner(",","[","]");for(MutableStat.StatMod m:mods.values())j.add("{\"id\":\""+m.source+"\",\"value\":"+(double)m.value+"}");return j.toString();}
static String stat(MutableStat s){return "{\"base\":"+(double)s.base+",\"modifiers\":{\"flat\":"+mods(s.getFlatMods())+",\"percent\":"+mods(s.getPercentMods())+",\"mult\":"+mods(s.getMultMods())+"}}";}
static String quantities(Map<String,MutableCommodityQuantity>m){StringJoiner j=new StringJoiner(",","{","}");for(String id:m.keySet())j.add("\""+id+"\":"+stat(m.get(id).quantity));return j.toString();}
static String effective(Map<String,MutableCommodityQuantity>m){StringJoiner j=new StringJoiner(",","{","}");for(String id:m.keySet())j.add("\""+id+"\":"+(double)m.get(id).quantity.getModifiedValue());return j.toString();}
static String aggregate(BaseIndustry b){StringJoiner j=new StringJoiner(",","{","}");for(String id:new String[]{"crew","supplies","ships","marines","hand_weapons"}){NativeCommodity c=new NativeCommodity();c.id=id;c.market=b.market;c.illegal=true;c.updateMaxSupplyAndDemand();j.add("\""+id+"\":{\"maxSupply\":"+c.maxSupply+",\"maxDemand\":"+c.maxDemand+",\"supplyLegal\":"+c.isSupplyLegal+",\"demandLegal\":"+c.isDemandLegal+"}");}return j.toString();}
static void emit(BaseIndustry b){String a=aggregate(b);CommodityOnMarketAPI c=new CommodityOnMarketAPI();c.illegal=true;System.out.println("{\"state\":{\"schemaVersion\":1,\"industryId\":\""+b.id+"\",\"supplyBonus\":"+stat(b.supplyBonus)+",\"demandReduction\":"+stat(b.demandReduction)+",\"supply\":"+quantities(b.supply)+",\"demand\":"+quantities(b.demand)+"},\"effectiveSupply\":"+effective(b.supply)+",\"effectiveDemand\":"+effective(b.demand)+",\"supplyLegal\":"+b.isSupplyLegal(c)+",\"demandLegal\":"+b.isDemandLegal(c)+",\"aggregates\":"+a+"}");}
static void seed(BaseIndustry b,int n){
b.market.admin.stats.dynamic.values.put("supply_bonus",(n%5-2)*0.5f);b.market.admin.stats.dynamic.values.put("demand_reduction",(n%3-1)*0.5f);
if(n%2==0){b.supplyBonusFromOther.modifyFlat(b.getModId(0),2);b.supplyBonusFromOther.modifyFlat("extra",-0.5f);b.supplyBonusFromOther.modifyMult("mult",0.5f);}
if(n%3==0){b.demandReductionFromOther.modifyFlat("extra",1.5f);b.demandReductionFromOther.modifyPercent("percent",25);}
if(n%4==0)b.getDemand("supplies").quantity.modifyMult("half",0.5f);
if(n%5==0)b.getSupply("food").quantity.setBaseValue(1);
}
public static void main(String[] args)throws Exception{Scanner scanner=new Scanner(System.in);while(scanner.hasNextLine()){
String[] x=scanner.nextLine().split("\\|");BaseIndustry b=(BaseIndustry)Class.forName(x[1]).getDeclaredConstructor().newInstance();b.id=x[0];b.spec.tags.addAll(Arrays.asList(x[2].split(",")));b.market=new Market();b.market.industries.add(b);b.market.size=Integer.parseInt(x[3]);b.market.habitable=x[4].equals("1");b.aiCoreId=x[5].equals("none")?null:x[5];b.improved=x[6].equals("1");seed(b,Integer.parseInt(x[7]));
for(int step=0;step<4;step++){
if(step==1){b.market.habitable=!b.market.habitable;b.aiCoreId=null;b.improved=!b.improved;}
if(step==2)b.disrupted=true;if(step==3){b.disrupted=false;b.building=true;b.upgradeId="next_industry";}
b.apply();emit(b);
}}}}
`;
    writeFileSync(join(dir, 'Oracle.java'), java);
    const compiled = spawnSync('javac', ['-encoding', 'UTF-8', '-d', dir, join(dir, 'MutableStat.java'), join(dir, 'StatBonus.java'), join(dir, 'Oracle.java')], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(compiled.status, 0, compiled.stderr);
    const input = vectors.map(v => [v.id, v.className, v.tags.join(','), v.size, v.habitable ? 1 : 0, v.core ?? 'none', v.improved ? 1 : 0, v.seed].join('|')).join('\n') + '\n';
    const run = spawnSync('java', ['-cp', dir, 'Oracle'], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, input });
    assert.equal(run.status, 0, run.stderr); return run.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  } finally {
    const absolute = resolve(dir), root = resolve(tmpdir()); assert.ok(absolute.startsWith(root + sep) && absolute !== root);
    for (const file of readdirSync(absolute)) unlinkSync(join(absolute, file)); rmdirSync(absolute);
  }
}
