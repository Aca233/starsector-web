/** Source-backed resource commodity methods; no fabricated playable market snapshots. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_RESOURCE_INDUSTRIES as R, newOriginalResourceIndustry as fresh, applyOriginalResourceDeposit as deposit,
  applyOriginalResourceIndustry as apply, originalResourceIndustryOutput as output, validateOriginalResourceIndustry } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
import { resolveOriginalIndustryAmounts, resolveOriginalMarketEconomyPass } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..'), native = resolve(project, '../decompiled');
const bonus = () => ({ flat: [], percent: [], mult: [] });
const stat = (flat = [], percent = [], mult = [], base = 0) => ({ base, modifiers: { flat, percent, mult } });
const mod = (id, value) => ({ id, value });
const operating = (values = {}) => ({ disrupted: false, building: false, upgradeId: null, ...values });
const modifiers = (values = {}) => ({ aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: stat(), demandReductionFromOther: stat(), specialItemId: null, ...values });
const run = (state, size = 6, values = {}) => apply({ state, marketSize: size, operating: operating(), available: { heavy_machinery: 99 }, modifiers: modifiers(), ...values });
const put = (state, conditionId, size = 6, op = operating(), modId = conditionId) => deposit({ conditionId, modId, marketSize: size, industries: [{ state, operating: op }] }).industries[0].state;
const value = (state, c, channel = 'supply') => output(state, { commodityId: c, illegal: false })[channel];
const reject = (fn, code) => assert.throws(fn, e => e instanceof CampaignError && (!code || e.code === code));

test('resource data reimports 24 deposits and nine original source hashes without changes', () => {
  const p = spawnSync(process.execPath, ['scripts/import-campaign-resource-industries.mjs', '--check'], { cwd: project, encoding: 'utf8', windowsHide: true });
  assert.equal(p.status, 0, p.stderr); assert.equal(Object.keys(R.conditions).length, 24); assert.equal(Object.keys(R.sources).length, 9);
});
test('actual authored Corvus resource chains produce food/organics/volatiles, not handwritten market supply', () => {
  const authored = JSON.parse(readFileSync(join(project, 'src/campaign/data/reference-corvus.json'), 'utf8'));
  for (const [id, industryId, c, expected, demand] of [['asharu', 'farming', 'food', 3, 1], ['jangala', 'farming', 'food', 6, 3], ['jangala', 'mining', 'organics', 8, 3], ['corvus_IIIa', 'mining', 'volatiles', 3, 0]]) {
    const m = authored.markets.find(m => m.id === id); assert.ok(m.industries.includes(industryId)); let s = fresh(industryId);
    for (const condition of m.conditions.filter(id => Object.hasOwn(R.conditions, id))) s = put(s, condition, m.size);
    s = run(s, m.size); assert.equal(value(s, c), expected); assert.equal(value(s, 'heavy_machinery', 'demand'), demand);
    const a = resolveOriginalIndustryAmounts({ commodityId: c, industries: [output(s, { commodityId: c, illegal: false })], previousSupplyLegal: false, previousDemandLegal: false });
    assert.equal(a.maxSupply, expected); assert.equal(a.supplyLegal, true); assert.ok(!Object.hasOwn(s, 'asOfTick'));
  }
});
test('heavy machinery deficit is subtracted once per industry, does not compound on repeated apply', () => {
  const a = run(put(fresh('farming'), 'farmland_adequate'), 6, { available: { heavy_machinery: 1 } });
  assert.equal(value(a, 'food'), 4); assert.deepEqual(run(a, 6, { available: { heavy_machinery: 1 } }), a);
  assert.equal(value(run(a), 'food'), 6);
  const b = run(put(fresh('mining'), 'organics_plentiful'), 6, { available: { heavy_machinery: 1 } });
  assert.equal(value(b, 'organics'), 6); assert.equal(value(b, 'drugs', 'demand'), 6);
  // No drugs availability is consumed by Mining.apply's production method.
  reject(() => run(b, 6, { available: { heavy_machinery: 1, drugs: 0 } }));
});
test('water surface uses aquaculture fallback, farming always wins even when nonfunctional', () => {
  const aq = put(fresh('aquaculture'), 'water_surface'); assert.equal(value(run(aq, 6, { available: { heavy_machinery: 1 } }), 'food'), 1);
  const entries = [{ state: fresh('aquaculture'), operating: operating() }, { state: fresh('farming'), operating: operating({ disrupted: true }) }];
  const r = deposit({ conditionId: 'water_surface', modId: 'water', marketSize: 6, industries: entries });
  assert.equal(r.targetIndustryId, 'farming'); assert.equal(value(r.industries[0].state, 'food'), 0);
  assert.equal(deposit({ conditionId: 'water_surface', modId: 'water', marketSize: 6, industries: [] }).targetIndustryId, null);
});
test('lobster base ignores market size, and the food deficit never reduces lobster output', () => {
  for (const size of [0, 3, 6, 10]) {
    const s = run(put(fresh('aquaculture'), 'volturnian_lobster_pens', size), size, { available: { heavy_machinery: 0 } });
    assert.equal(value(s, 'lobster'), 1);
  }
});
test('distinct condition modifier IDs coexist and same ID replaces in its existing order', () => {
  const a = put(put(fresh('mining'), 'ore_moderate', 6, operating(), 'first'), 'ore_rich', 6, operating(), 'second');
  assert.equal(value(a, 'ore'), 14); assert.deepEqual(put(a, 'ore_rich', 6, operating(), 'second'), a);
  assert.equal(value(put(a, 'ore_sparse', 6, operating(), 'second'), 'ore'), 11);
});
test('condition phase uses previous bonuses: one industry apply does not magically refresh condition supply', () => {
  let s = put(fresh('farming'), 'farmland_adequate');
  s = run(s, 6, { modifiers: modifiers({ aiCoreId: 'alpha_core', improved: true }) });
  assert.equal(value(s, 'food'), 6); assert.equal(value(s, 'heavy_machinery', 'demand'), 2);
  s = put(s, 'farmland_adequate'); assert.equal(value(s, 'food'), 8);
  s = run(s); assert.equal(value(s, 'food'), 8); // zero deficit write does not clear ind_sb
  s = put(s, 'farmland_adequate'); assert.equal(value(s, 'food'), 6);
});
test('AI cores, improvements, admin and other stats combine in original order, preserve neutral and shadow entries', () => {
  for (const core of ['alpha_core', 'beta_core', 'gamma_core']) {
    let s = run(fresh('mining'), 6, { modifiers: modifiers({ aiCoreId: core, improved: true, adminSupplyBonus: 0.5, adminDemandReduction: 0.5 }) });
    s = put(s, 'organics_plentiful'); assert.equal(value(s, 'organics'), core === 'alpha_core' ? 11 : 10);
    assert.equal(value(s, 'heavy_machinery', 'demand'), 1);
  }
  const other = stat([mod('ind_mining_0', 0), mod('extra', 2)], [mod('percent', 20)], [mod('mult', 0.5)], 999);
  const s = run(fresh('mining'), 6, { modifiers: modifiers({ aiCoreId: 'alpha_core', supplyBonusFromOther: other }) });
  assert.deepEqual(s.supplyBonus.modifiers.flat, [mod('ind_mining_0', 0), mod('extra', 2)]);
  assert.equal(s.supplyBonus.base, 0); assert.equal(value(put(s, 'ore_moderate'), 'ore'), 7);
});
test('deficit casts effective demand toward zero, unlike Math.round used for bonus and market aggregation', () => {
  let s = structuredClone(put(fresh('farming'), 'farmland_adequate'));
  s.demand.heavy_machinery = stat([], [], [mod('half', 0.5)]);
  s = run(s, 6, { available: { heavy_machinery: 0 } });
  assert.equal(value(s, 'heavy_machinery', 'demand'), 1.5); assert.equal(value(s, 'food'), 5);
  assert.equal(resolveOriginalIndustryAmounts({ commodityId: 'heavy_machinery', industries: [output(s, { commodityId: 'heavy_machinery', illegal: false })], previousSupplyLegal: true, previousDemandLegal: true }).maxDemand, 2);
});
test('isUnmodified depends on modifier presence, not nonzero production or net bonus', () => {
  let s = structuredClone(fresh('farming')); s.supply.food = stat([], [], [], 7);
  assert.equal(value(run(s, 6, { available: { heavy_machinery: 0 } }), 'food'), 7);
  s.supply.food.modifiers.mult = [mod('neutral-but-present', 1)];
  assert.equal(value(run(s, 6, { available: { heavy_machinery: 0 } }), 'food'), 4);
  const b = run(fresh('farming'), 6, { modifiers: modifiers({ supplyBonusFromOther: stat([mod('positive', 1), mod('negative', -1)]) }) });
  const p = put(b, 'farmland_adequate'); assert.equal(value(p, 'food'), 6);
});
test('disruption clears supply not demand; condition removal is specific; construction and upgrading differ', () => {
  let s = run(put(fresh('mining'), 'ore_moderate'), 6, { modifiers: modifiers({ aiCoreId: 'alpha_core' }) }); s = put(s, 'ore_moderate');
  const removed = put(s, 'ore_moderate', 6, operating({ disrupted: true }));
  assert.equal(value(removed, 'ore'), 1); // this condition deletes only its own flats, not ind_sb
  const stopped = run(removed, 6, { operating: operating({ disrupted: true }) });
  assert.deepEqual(stopped.supply, {}); assert.equal(value(stopped, 'drugs', 'demand'), 6);
  const building = operating({ building: true });
  assert.deepEqual(run(put(stopped, 'ore_moderate', 6, building), 6, { operating: building }).supply, {});
  const upgrading = operating({ building: true, upgradeId: 'next_mining' });
  assert.equal(value(run(put(stopped, 'ore_moderate', 6, upgrading), 6, { operating: upgrading }), 'ore'), 6);
});
test('resource output feeds existing market price pass without granting inventory or snapshot freshness', () => {
  const s = run(put(fresh('farming'), 'farmland_poor', 4), 4), c = output(s, { commodityId: 'food', illegal: false });
  const p = resolveOriginalMarketEconomyPass({ marketId: 'asharu', commodityId: 'food', month: 9, sourceRevision: 'resource-test', phase: 'native-final-iteration',
    industry: { industries: [c], previousSupplyLegal: true, previousDemandLegal: true }, network: { shippingGlobal: 4, shippingFaction: 9, maxExportGlobal: 0, maxExportFaction: 0, hidden: false },
    otherAvailableFlat: 0, eventModBeforePass: 0, tradeMod: { both: 0, plus: 0, minus: 0 }, demandStat: stat(), greedStat: stat(), playerModifiers: { a: { supply: bonus(), demand: bonus() } }, marketModifiers: { supply: bonus(), demand: bonus() } });
  assert.equal(p.diagnostics.amounts.maxSupply, 3); assert.equal(p.diagnostics.available, 3);
  assert.equal(Object.hasOwn(p, 'asOfTick'), false); assert.equal(Object.hasOwn(p, 'inventory'), false);
  assert.equal(output(s, { commodityId: 'food', illegal: true }).supplyLegal, false);
});
test('results are immutable and inputs untouched; invalid/unknown/missing state fails closed', () => {
  const s = put(fresh('farming'), 'farmland_poor'), before = structuredClone(s); run(s); assert.deepEqual(s, before);
  assert.ok(Object.isFrozen(s.supply.food.modifiers.flat)); reject(() => fresh('population'));
  for (const changes of [{ marketSize: 11 }, { modifiers: modifiers({ specialItemId: 'soil_nanites' }) }, { available: {} }, { available: { heavy_machinery: 1.5 } }, { modifiers: modifiers({ adminSupplyBonus: 0.1 }) }]) reject(() => run(s, 6, changes));
  reject(() => deposit({ conditionId: 'hot', modId: 'hot', marketSize: 6, industries: [] }));
  reject(() => validateOriginalResourceIndustry({ ...s, schemaVersion: 2 }));
  reject(() => validateOriginalResourceIndustry({ ...s, extra: true }));
  reject(() => run(s, 6, { modifiers: modifiers({ supplyBonusFromOther: stat([mod('duplicate', 1), mod('duplicate', 2)]) }) }));
  const entry = { state: s, operating: operating() }; reject(() => deposit({ conditionId: 'farmland_poor', modId: 'fp', marketSize: 6, industries: [entry, entry] }));
});

function method(text, signature) {
  const start = text.indexOf(signature); assert.ok(start >= 0, signature);
  const open = text.indexOf('{', start); let depth = 1, end = open + 1;
  for (; depth > 0 && end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; }
  assert.equal(depth, 0); return text.slice(start, end);
}
test('extracted native deposits, Farming/Mining/BaseIndustry and full MutableStat agree on 1296 ordered state snapshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'campaign-resource-industries-'));
  try {
    const api = join(native, 'starfarer.api/com/fs/starfarer/api');
    const read = p => readFileSync(join(api, p), 'utf8');
    for (const name of ['MutableStat', 'StatBonus']) {
      // Complete original classes, only package/import relocation to this isolated harness.
      const text = read('combat/' + name + '.java').replace(/^package .*;\r?\n/m, '').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm, '');
      writeFileSync(join(dir, name + '.java'), text);
    }
    const b = read('impl/campaign/econ/impl/BaseIndustry.java'), d = read('impl/campaign/econ/ResourceDepositsCondition.java');
    const baseMethods = [
      'public void demand(String commodityId, int quantity)', 'public void demand(String commodityId, int quantity, String desc)',
      'public void demand(int index, String commodityId, int quantity, String desc)', 'public void demand(String modId, String commodityId, int quantity, String desc)',
      'public void supply(String commodityId, int quantity)', 'public void supply(String commodityId, int quantity, String desc)',
      'public void supply(int index, String commodityId, int quantity, String desc)', 'public void supply(String modId, String commodityId, int quantity, String desc)',
      'protected void applyDeficitToProduction(', 'public boolean isFunctional()', 'public boolean isUpgrading()',
      'public MutableCommodityQuantity getSupply(', 'public MutableCommodityQuantity getDemand(', 'public Pair<String, Integer> getMaxDeficit(',
      'protected void updateAICoreToSupplyAndDemandModifiers(', 'protected void applyAlphaCoreSupplyAndDemandModifiers(',
      'protected void applyBetaCoreSupplyAndDemandModifiers(', 'protected void applyGammaCoreSupplyAndDemandModifiers(',
      'protected void updateSupplyAndDemandModifiers(', 'protected int getImproveProductionBonus(', 'protected void updateImprovementSupplyAndDemandModifiers(',
    ].map(s => method(b, s)).join('\n');
    const declarations = d.slice(d.indexOf('    public static Map'), d.indexOf('    @Override'));
    const java = String.raw`import java.util.*;
class Global {static boolean CODEX_TOOLTIP_MODE=false;}
class Pair<A,B>{A one;B two;}
class Misc{static String ucFirst(String s){return s;}}
class MutableCommodityQuantity{MutableStat quantity=new MutableStat(0);MutableCommodityQuantity(String id){} MutableStat getQuantity(){return quantity;}}
class CommodityOnMarketAPI{int available;int getAvailable(){return available;}}
interface Industry{boolean isFunctional();void supply(String m,String c,int a,String d);MutableCommodityQuantity getSupply(String c);}
class Dynamic{Map<String,Float> values=new HashMap<>();float getValue(String s,float fallback){return values.getOrDefault(s,fallback);}}
class Stats{Dynamic dynamic=new Dynamic();Dynamic getDynamic(){return dynamic;}}
class Admin{Stats stats=new Stats();Stats getStats(){return stats;}}
class Market{int size;int available;Admin admin=new Admin();Map<String,Industry> industries=new LinkedHashMap<>();int getSize(){return size;}Admin getAdmin(){return admin;}Industry getIndustry(String id){return industries.get(id);}void addImmigrationModifier(Object o){} CommodityOnMarketAPI getCommodityData(String id){CommodityOnMarketAPI c=new CommodityOnMarketAPI();c.available=available;return c;}}
class Condition{String id;String getId(){return id;}String getName(){return id;}}
class Hazard{Market market;Condition condition;public void apply(String id){}}
class Deposits extends Hazard{${declarations}
${method(d, 'public void apply(String id)')}}
class BaseIndustry implements Industry{
static int SUPPLY_BONUS=${R.settings.SUPPLY_BONUS},DEMAND_REDUCTION=${R.settings.DEMAND_REDUCTION},DEFAULT_IMPROVE_SUPPLY_BONUS=${R.settings.DEFAULT_IMPROVE_SUPPLY_BONUS};
static String BASE_VALUE_TEXT="";String id,upgradeId,aiCoreId;boolean building,disrupted,improved;Market market;
MutableStat supplyBonus=new MutableStat(0),demandReduction=new MutableStat(0),supplyBonusFromOther=new MutableStat(0),demandReductionFromOther=new MutableStat(0);
Map<String,MutableCommodityQuantity>supply=new LinkedHashMap<>(),demand=new LinkedHashMap<>();
String getId(){return id;}String getModId(int i){return "ind_"+id+"_"+i;}
boolean isBuilding(){return building;}boolean isDisrupted(){return disrupted;}boolean isImproved(){return improved;}boolean canImproveToIncreaseProduction(){return true;}
String getImprovementsDescForModifiers(){return "";}static String getDeficitText(String s){return "";}
public void apply(boolean ignored){updateSupplyAndDemandModifiers();}public void apply(){}
${baseMethods}
}
class Farming extends BaseIndustry{${method(read('impl/campaign/econ/impl/Farming.java'), 'public void apply()')}}
class Mining extends BaseIndustry{${method(read('impl/campaign/econ/impl/Mining.java'), 'public void apply()')}}
public class Oracle{
static String mods(Map<String,MutableStat.StatMod>mods){StringJoiner j=new StringJoiner(",","[","]");for(MutableStat.StatMod m:mods.values())j.add("{\"id\":\""+m.source+"\",\"value\":"+(double)m.value+"}");return j.toString();}
static String stat(MutableStat s){return "{\"base\":"+(double)s.base+",\"modifiers\":{\"flat\":"+mods(s.getFlatMods())+",\"percent\":"+mods(s.getPercentMods())+",\"mult\":"+mods(s.getMultMods())+"}}";}
static String quantities(Map<String,MutableCommodityQuantity>m){StringJoiner j=new StringJoiner(",","{","}");for(String id:m.keySet())j.add("\""+id+"\":"+stat(m.get(id).quantity));return j.toString();}
static String effective(Map<String,MutableCommodityQuantity>m){StringJoiner j=new StringJoiner(",","{","}");for(String id:m.keySet())j.add("\""+id+"\":"+(double)m.get(id).quantity.getModifiedValue());return j.toString();}
static void emit(BaseIndustry b){System.out.println("{\"schemaVersion\":1,\"industryId\":\""+b.id+"\",\"supplyBonus\":"+stat(b.supplyBonus)+",\"demandReduction\":"+stat(b.demandReduction)+",\"supply\":"+quantities(b.supply)+",\"demand\":"+quantities(b.demand)+",\"effectiveSupply\":"+effective(b.supply)+",\"effectiveDemand\":"+effective(b.demand)+"}");}
static void seed(BaseIndustry b,int seed){
b.market.admin.stats.dynamic.values.put("supply_bonus",(seed%5-2)*0.5f);b.market.admin.stats.dynamic.values.put("demand_reduction",(seed%3-1)*0.5f);
if(seed%2==0){b.supplyBonusFromOther.modifyFlat(b.getModId(0),2);b.supplyBonusFromOther.modifyFlat("extra",-0.5f);b.supplyBonusFromOther.modifyMult("mult",0.5f);}
if(seed%3==0){b.demandReductionFromOther.modifyFlat("extra",1.5f);b.demandReductionFromOther.modifyPercent("percent",25);}
if(seed%4==0)b.getDemand("heavy_machinery").quantity.modifyMult("half",0.5f);
if(seed%5==0)b.getSupply("food").quantity.setBaseValue(1);
}
public static void main(String[] args){Scanner scanner=new Scanner(System.in);while(scanner.hasNextLine()){
String[] x=scanner.nextLine().split("\\|");BaseIndustry b=x[0].equals("mining")?new Mining():new Farming();b.id=x[0];b.market=new Market();b.market.size=Integer.parseInt(x[1]);b.market.available=Integer.parseInt(x[6]);b.market.industries.put(b.id,b);b.aiCoreId=x[4].equals("none")?null:x[4];b.improved=x[5].equals("1");seed(b,Integer.parseInt(x[3]));
Deposits d=new Deposits();d.market=b.market;d.condition=new Condition();d.condition.id=x[2];
for(int step=0;step<9;step++){
if(step==3){b.aiCoreId=null;b.improved=false;b.market.admin.stats.dynamic.values.clear();b.supplyBonusFromOther=new MutableStat(0);b.demandReductionFromOther=new MutableStat(0);}
if(step==5){b.disrupted=true;b.market.available=0;}if(step==6){b.disrupted=false;b.building=true;}if(step==7)b.upgradeId="next_industry";if(step==8){b.building=false;b.upgradeId=null;}
if(step!=1&&step!=3)d.apply("deposit");if(step!=0)b.apply();emit(b);
}}}
}`;
    writeFileSync(join(dir, 'Oracle.java'), java);
    const compiled = spawnSync('javac', ['-encoding', 'UTF-8', '-d', dir, join(dir, 'MutableStat.java'), join(dir, 'StatBonus.java'), join(dir, 'Oracle.java')], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(compiled.status, 0, compiled.stderr);
    const conditions = Object.keys(R.conditions), vectors = Array.from({ length: 144 }, (_, i) => {
      const conditionId = conditions[i % conditions.length], c = R.conditions[conditionId];
      return { id: c.industryId === 'farming' && i % 2 ? 'aquaculture' : c.industryId, size: i % 11, conditionId, seed: i,
        core: [null, 'alpha_core', 'beta_core', 'gamma_core'][i % 4], improved: i % 3 === 0, available: i % 9 - 1 };
    });
    const stdin = vectors.map(v => [v.id, v.size, v.conditionId, v.seed, v.core ?? 'none', v.improved ? 1 : 0, v.available].join('|')).join('\n') + '\n';
    const executed = spawnSync('java', ['-cp', dir, 'Oracle'], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, input: stdin });
    assert.equal(executed.status, 0, executed.stderr); const results = executed.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.equal(results.length, 1296);
    vectors.forEach((v, i) => {
      let s = structuredClone(fresh(v.id));
      let m = modifiers({ aiCoreId: v.core, improved: v.improved, adminSupplyBonus: (v.seed % 5 - 2) * 0.5, adminDemandReduction: (v.seed % 3 - 1) * 0.5 });
      if (v.seed % 2 === 0) m.supplyBonusFromOther = stat([mod('ind_' + v.id + '_0', 2), mod('extra', -0.5)], [], [mod('mult', 0.5)]);
      if (v.seed % 3 === 0) m.demandReductionFromOther = stat([mod('extra', 1.5)], [mod('percent', 25)]);
      if (v.seed % 4 === 0) s.demand.heavy_machinery = stat([], [], [mod('half', 0.5)]);
      if (v.seed % 5 === 0) s.supply.food = stat([], [], [], 1);
      const op = operating(); let available = v.available;
      for (let step = 0; step < 9; step++) {
        if (step === 3) m = modifiers();
        if (step === 5) { op.disrupted = true; available = 0; }
        if (step === 6) { op.disrupted = false; op.building = true; }
        if (step === 7) op.upgradeId = 'next_industry';
        if (step === 8) { op.building = false; op.upgradeId = null; }
        if (step !== 1 && step !== 3) s = put(s, v.conditionId, v.size, op, 'deposit');
        if (step !== 0) s = run(s, v.size, { operating: op, available: { heavy_machinery: available }, modifiers: m });
        const { effectiveSupply, effectiveDemand, ...expected } = results[i * 9 + step];
        assert.deepEqual(s, expected, `native resource state ${i}, step ${step}, ${JSON.stringify(v)}`);
        for (const [c, quantity] of Object.entries(effectiveSupply)) assert.equal(value(s, c), quantity, `native supply ${i}/${step}/${c}`);
        for (const [c, quantity] of Object.entries(effectiveDemand)) assert.equal(value(s, c, 'demand'), quantity, `native demand ${i}/${step}/${c}`);
      }
    });
  } finally {
    const absolute = resolve(dir), root = resolve(tmpdir());
    assert.ok(absolute.startsWith(root + sep) && absolute !== root, 'only clean the unique oracle temp directory');
    for (const file of readdirSync(absolute)) unlinkSync(join(absolute, file));
    rmdirSync(absolute);
  }
});
