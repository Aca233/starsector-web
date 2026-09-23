import { augmentConditionPhaseOracle } from './campaign-condition-phase-native-oracle.mjs';
/** Original callback bodies + complete native stats. Resolved world/intel getters are stubs, not an engine launch. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
function block(t, s) {
    const a = t.indexOf(s);
    assert.ok(a >= 0, s);
    const b = t.indexOf('{', a);
    let i = b + 1, d = 1;
    for (; i < t.length && d; i++) {
        if (t[i] === '{')
            d++;
        else if (t[i] === '}')
            d--;
    }
    assert.equal(d, 0);
    return t.slice(a, i);
}
export function nativeAdditionalConditionsOracle(cases) {
    const dir = mkdtempSync(join(tmpdir(), 'campaign-condition-oracle-'));
    const api = fileURLToPath(new URL('../../decompiled/starfarer.api/com/fs/starfarer/api/', import.meta.url));
    const jsonJar = fileURLToPath(new URL('../../starsector-core/json.jar', import.meta.url));
    const read = p => readFileSync(join(api, p + '.java'), 'utf8');
    const econ = name => read('impl/campaign/econ/' + name);
    try {
        for (const name of ['MutableStat', 'StatBonus', 'MutableStatWithTempMods'])
            writeFileSync(join(dir, name + '.java'), read('combat/' + name).replace(/^package .*;\r?\n/m, '').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm, ''));
        const definitions = [['BaseHazardCondition', 'BaseMarketConditionPlugin', ['public void apply', 'public void unapply']], ['WorldFarming', 'BaseMarketConditionPlugin', ['public void apply', 'public void unapply']], ['HighGravity', 'BaseHazardCondition', ['public void apply', 'public void unapply']], ['LowGravity', 'BaseHazardCondition', ['public void apply', 'public void unapply']], ['LCAttractorHigh', 'BaseHazardCondition', ['public void apply', 'public void unapply', 'public void modifyIncoming']], ['MildClimate', 'LCAttractorHigh', ['public void modifyIncoming', 'protected float getImmigrationBonus']], ['SolarArray', 'BaseMarketConditionPlugin', ['public void apply', 'public void unapply', 'protected Industry getIndustry']], ['LuddicMajority', 'BaseMarketConditionPlugin', ['public void apply', 'public void unapply', 'public void modifyIncoming', 'public float getImmigrationBonus', 'public float getEffectMult', 'public static boolean matchesBonusConditions']], ['ShippingDisruption', 'BaseMarketConditionPlugin', ['public static float getPenaltyForShippingLost', 'public void apply', 'public void unapply']]];
        const classes = definitions.map(([name, parent, sigs]) => { const text = econ(name); const constants = text.split('\n').filter(l => /^    public static (?:final )?(?:float|int|String|Map|List).* = /.test(l)).join('\n'); const init = name === 'SolarArray' ? block(text, 'static {') : ''; const shipping = name === 'ShippingDisruption' ? 'MutableStatWithTempMods shippingLost=new MutableStatWithTempMods(0);' : ''; return 'class ' + name + ' extends ' + parent + '{' + constants + init + shipping + sigs.map(s => block(text, s)).join('\n') + '}'; }).join('\n').replaceAll('Iterator<Object>', 'Iterator<?>').replaceAll('Industry ind = iterator.next();', 'Industry ind = (Industry)iterator.next();');
        const pbi = read('impl/campaign/intel/bases/PirateBaseIntel'), pa = read('impl/campaign/intel/bases/PirateActivity'), pc = read('impl/campaign/intel/bases/LuddicPathCells'), pi = read('impl/campaign/intel/bases/LuddicPathCellsIntel');
        const marketText = readFileSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/Market.java', import.meta.url), 'utf8');
        const marketMethods = ['public void reapplyConditions()', 'public void reapplyCondition(String string2)'].map(s => block(marketText, s)).join('\n');
        const comText = readFileSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/CommodityOnMarket.java', import.meta.url), 'utf8');
        const pop = read('impl/campaign/population/PopulationComposition');
        let java = String.raw `import java.util.*;import org.json.*;
class ConditionGenDataSpec{float hazard;ConditionGenDataSpec(float h){hazard=h;}float getHazard(){return hazard;}}
class Spec implements IndustrySpecAPI{List<String>tags=new ArrayList<>();public boolean hasTag(String tag){return tags.contains(tag);}}
interface IndustrySpecAPI{boolean hasTag(String tag);}
class Settings{Map<String,Spec>specs=new HashMap<>();Map<String,Float>hazards=new HashMap<>();Object getSpec(Class<?>c,String id,boolean b){return hazards.containsKey(id)?new ConditionGenDataSpec(hazards.get(id)):null;}IndustrySpecAPI getIndustrySpec(String id){return specs.get(id);}}
class Global{static Settings settings=new Settings();static Settings getSettings(){return settings;}}
class Misc{static String ucFirst(String s){return s;}}
class People{static String DARDAN_KATO="dardan_kato";}
class Admin{String id;String getId(){return id;}}
class HA_CMD{static boolean agreement;static boolean playerHasPatherAgreement(){return agreement;}}
class LuddicChurchHostileActivityFactor{static boolean deal,defeated;static boolean isMadeDeal(){return deal;}static boolean isDefeatedExpedition(){return defeated;}}
class ConstructionQueue{static class ConstructionQueueItem{String id;ConstructionQueueItem(String s){id=s;}}List<ConstructionQueueItem>items=new ArrayList<>();List<ConstructionQueueItem>getItems(){return items;}}
class Industry{String id;Spec spec;MutableStat supplyBonus=new MutableStat(0);String getId(){return id;}Spec getSpec(){return spec;}MutableStat getSupplyBonusFromOther(){return supplyBonus;}}
class CommodityOnMarketAPI{String id;int maxSupply;MutableStatWithTempMods available=new MutableStatWithTempMods(0);int getMaxSupply(){return maxSupply;}MutableStatWithTempMods getAvailableStat(){return available;}
${block(comText, 'public int getAvailable()')}}
class PopulationComposition{Map<String,Float>comp=new LinkedHashMap<>();MutableStat weight=new MutableStat(0);MutableStat getWeight(){return weight;}
${['public void add(', 'public void set(', 'public float get('].map(s => block(pop, s)).join('\n')}}
class MarketConditionAPI{String id,modId;boolean surveyed;BaseMarketConditionPlugin plugin;String getId(){return id;}String getName(){return id;}String getIdForPluginModifications(){return modId;}boolean isSurveyed(){return surveyed;}BaseMarketConditionPlugin getPlugin(){return plugin;}}
class MarketAPI{List<MarketConditionAPI>conditions=new ArrayList<>();List<Industry>industries=new ArrayList<>();List<CommodityOnMarketAPI>commodities=new ArrayList<>();List<String>suppressed=new ArrayList<>(),transientMods=new ArrayList<>(),trace=new ArrayList<>();MutableStat hazard=new MutableStat(0),stability=new MutableStat(0);StatBonus accessibility=new StatBonus();boolean playerOwned,habitable;int size;String faction;Admin admin;ConstructionQueue queue;
MutableStat getHazard(){return hazard;}MutableStat getStability(){return stability;}StatBonus getAccessibilityMod(){return accessibility;}List<Industry>getIndustries(){return industries;}Industry getIndustry(String id){for(Industry i:industries)if(i.id.equals(id))return i;return null;}List<CommodityOnMarketAPI>getCommoditiesCopy(){return new ArrayList<>(commodities);}boolean isPlayerOwned(){return playerOwned;}String getFactionId(){return faction;}boolean hasCondition(String id){return id.equals("habitable")&&habitable;}int getSize(){return size;}Admin getAdmin(){return admin;}ConstructionQueue getConstructionQueue(){return queue;}
void addTransientImmigrationModifier(BaseMarketConditionPlugin p){String key="condition:"+p.getModId();if(!transientMods.contains(key))transientMods.add(key);}void removeTransientImmigrationModifier(BaseMarketConditionPlugin p){transientMods.remove("condition:"+p.getModId());}
void suppressCondition(String id){if(!suppressed.contains(id))suppressed.add(id);}void unsuppressCondition(String id){suppressed.remove(id);}boolean isConditionSuppressed(String id){return suppressed.contains(id);}MarketConditionAPI getSpecificCondition(String id){for(MarketConditionAPI c:conditions)if(c.modId.equals(id))return c;return null;}
${marketMethods}}
class BaseMarketConditionPlugin{MarketAPI market;MarketConditionAPI condition;String getModId(){return condition.modId;}public void apply(String id){}public void unapply(String id){}public void modifyIncoming(MarketAPI m,PopulationComposition p){}}
${classes}
enum Tier{TIER_1_1MODULE,TIER_2_1MODULE,TIER_3_2MODULE,TIER_4_3MODULE,TIER_5_3MODULE}
class PirateBaseIntel{Tier tier;${['public float getAccessibilityPenalty', 'public float getStabilityPenalty'].map(s => block(pbi, s)).join('\n')}}
class PirateActivity extends BaseMarketConditionPlugin{PirateBaseIntel intel=new PirateBaseIntel();${['public void apply', 'public void unapply'].map(s => block(pa, s)).join('\n')}}
class LuddicPathCellsIntel{MarketAPI market=new MarketAPI();boolean sleeper;${block(pi, 'public boolean isSleeper')}}
class LuddicPathCells extends BaseMarketConditionPlugin{${pc.match(/public static int STABLITY_PENALTY = [0-9]+;/)[0]}LuddicPathCellsIntel intel=new LuddicPathCellsIntel();${['public void apply', 'public void unapply'].map(s => block(pc, s)).join('\n')}}
public class Oracle{
static void mods(MutableStat s,JSONObject o)throws Exception{for(String ch:new String[]{"flat","percent","mult"}){JSONArray a=o.getJSONArray(ch);for(int n=0;n<a.length();n++){JSONObject m=a.getJSONObject(n);String id=m.getString("id");float v=(float)m.getDouble("value");Map<String,MutableStat.StatMod>map=ch.equals("flat")?s.getFlatMods():ch.equals("percent")?s.getPercentMods():s.getMultMods();map.put(id,new MutableStat.StatMod(id,MutableStat.StatModType.valueOf(ch.toUpperCase()),v));}}float base=s.getBaseValue();s.setBaseValue(base+1);s.setBaseValue(base);}
static MutableStat stat(JSONObject o)throws Exception{MutableStat s=new MutableStat((float)o.getDouble("base"));mods(s,o.getJSONObject("modifiers"));return s;}
static JSONArray entries(Map<String,MutableStat.StatMod>map)throws Exception{JSONArray a=new JSONArray();for(MutableStat.StatMod m:map.values())a.put(new JSONObject().put("id",m.source).put("value",(double)m.value));return a;}
static JSONObject bonus(MutableStat s)throws Exception{return new JSONObject().put("flat",entries(s.getFlatMods())).put("percent",entries(s.getPercentMods())).put("mult",entries(s.getMultMods()));}
static JSONObject bonus(StatBonus s)throws Exception{return new JSONObject().put("flat",entries(s.getFlatBonuses())).put("percent",entries(s.getPercentBonuses())).put("mult",entries(s.getMultBonuses()));}
static JSONObject stat(MutableStat s)throws Exception{return new JSONObject().put("base",(double)s.getBaseValue()).put("modifiers",bonus(s));}
static void load(MarketAPI m,JSONObject o)throws Exception{m.hazard=stat(o.getJSONObject("hazard"));m.stability=stat(o.getJSONObject("stability"));MutableStat access=new MutableStat(0);mods(access,o.getJSONObject("accessibility"));m.accessibility.getFlatBonuses().putAll(access.getFlatMods());m.accessibility.getPercentBonuses().putAll(access.getPercentMods());m.accessibility.getMultBonuses().putAll(access.getMultMods());for(int n=0;n<o.getJSONArray("suppressedConditionIds").length();n++)m.suppressed.add(o.getJSONArray("suppressedConditionIds").getString(n));for(int n=0;n<o.getJSONArray("transientModifiers").length();n++){JSONObject x=o.getJSONArray("transientModifiers").getJSONObject(n);m.transientMods.add(x.getString("kind")+":"+x.getString("id"));}for(int n=0;n<o.getJSONArray("industries").length();n++){JSONObject x=o.getJSONArray("industries").getJSONObject(n);Industry i=new Industry();i.id=x.getString("industryId");i.spec=Global.settings.specs.get(i.id);i.supplyBonus=stat(x.getJSONObject("supplyBonusFromOther"));m.industries.add(i);}for(int n=0;n<o.getJSONArray("commodities").length();n++){JSONObject x=o.getJSONArray("commodities").getJSONObject(n);CommodityOnMarketAPI c=new CommodityOnMarketAPI();c.id=x.getString("commodityId");c.maxSupply=x.getInt("maxSupply");JSONObject av=x.getJSONObject("available");c.available=new MutableStatWithTempMods((float)av.getDouble("base"));c.available.addTemporaryModFlat(120,"sh_loss_timer",-2);c.available.unmodifyFlat("sh_loss_timer");mods(c.available,av.getJSONObject("modifiers"));m.commodities.add(c);}}
static JSONObject state(MarketAPI m)throws Exception{JSONArray inds=new JSONArray(),coms=new JSONArray(),callbacks=new JSONArray();for(Industry i:m.industries)inds.put(new JSONObject().put("industryId",i.id).put("supplyBonusFromOther",stat(i.supplyBonus)));for(CommodityOnMarketAPI c:m.commodities){if(!c.available.hasMod("sh_loss_timer"))throw new RuntimeException("Callback deleted temporary timer");coms.put(new JSONObject().put("commodityId",c.id).put("maxSupply",c.maxSupply).put("available",stat(c.available)));}for(String s:m.transientMods){int colon=s.indexOf(':');callbacks.put(new JSONObject().put("kind",s.substring(0,colon)).put("id",s.substring(colon+1)));}return new JSONObject().put("hazard",stat(m.hazard)).put("stability",stat(m.stability)).put("accessibility",bonus(m.accessibility)).put("industries",inds).put("commodities",coms).put("transientModifiers",callbacks).put("suppressedConditionIds",new JSONArray(m.suppressed));}
static BaseMarketConditionPlugin plugin(String id){switch(id){case "high_gravity":return new HighGravity();case "low_gravity":return new LowGravity();case "mild_climate":return new MildClimate();case "solar_array":return new SolarArray();case "luddic_majority":return new LuddicMajority();case "shipping_disruption":return new ShippingDisruption();case "pirate_activity":return new PirateActivity();case "pather_cells":return new LuddicPathCells();case "hot":case "poor_light":return new BaseHazardCondition();default:return new WorldFarming();}}
static void context(MarketAPI m,BaseMarketConditionPlugin p,JSONObject c)throws Exception{if(p instanceof LuddicMajority){m.playerOwned=c.getBoolean("playerOwned");m.habitable=c.getBoolean("habitable");LuddicChurchHostileActivityFactor.deal=c.getBoolean("madeChurchDeal");LuddicChurchHostileActivityFactor.defeated=c.getBoolean("defeatedExpedition");if(!c.isNull("adminId")){m.admin=new Admin();m.admin.id=c.getString("adminId");}if(!c.isNull("constructionQueue")){m.queue=new ConstructionQueue();JSONArray q=c.getJSONArray("constructionQueue");for(int n=0;n<q.length();n++){JSONObject x=q.getJSONObject(n);String id=x.getString("industryId");m.queue.items.add(new ConstructionQueue.ConstructionQueueItem(id));if(!x.getBoolean("specExists"))Global.settings.specs.remove(id);}}}else if(p instanceof PirateActivity)((PirateActivity)p).intel.tier=Tier.valueOf(c.getString("tier"));else if(p instanceof LuddicPathCells){LuddicPathCellsIntel intel=((LuddicPathCells)p).intel;intel.market.faction=c.getString("intelMarketFactionId");intel.sleeper=c.getBoolean("savedSleeper");HA_CMD.agreement=c.getBoolean("playerHasPatherAgreement");}else if(p instanceof ShippingDisruption){m.size=c.getInt("marketSize");m.playerOwned=c.getBoolean("playerOwned");MutableStat loss=stat(c.getJSONObject("shippingLost"));ShippingDisruption s=(ShippingDisruption)p;s.shippingLost=new MutableStatWithTempMods(loss.getBaseValue());s.shippingLost.getFlatMods().putAll(loss.getFlatMods());s.shippingLost.getPercentMods().putAll(loss.getPercentMods());s.shippingLost.getMultMods().putAll(loss.getMultMods());s.shippingLost.setBaseValue(loss.getBaseValue()+1);s.shippingLost.setBaseValue(loss.getBaseValue());}}
static MarketConditionAPI condition(MarketAPI m,JSONObject x)throws Exception{MarketConditionAPI c=new MarketConditionAPI();c.id=x.getString("conditionId");c.modId=x.getString("modId");c.surveyed=x.optBoolean("surveyed",true);c.plugin=plugin(c.id);c.plugin.condition=c;c.plugin.market=m;if(!x.isNull("context"))context(m,c.plugin,x.getJSONObject("context"));return c;}
public static void main(String[]args)throws Exception{JSONObject specs=new JSONObject(java.nio.file.Files.readString(java.nio.file.Path.of(args[0])));Scanner in=new Scanner(System.in);while(in.hasNextLine()){JSONObject x=new JSONObject(in.nextLine());Global.settings=new Settings();JSONObject industries=specs.getJSONObject("industries");Iterator<?>keys=industries.keys();while(keys.hasNext()){String id=(String)keys.next();Spec s=new Spec();JSONArray tags=industries.getJSONObject(id).getJSONArray("tags");for(int n=0;n<tags.length();n++)s.tags.add(tags.getString(n));Global.settings.specs.put(id,s);}Global.settings.hazards.put("high_gravity",0.5f);Global.settings.hazards.put("low_gravity",0.25f);Global.settings.hazards.put("mild_climate",-0.25f);Global.settings.hazards.put("hot",0.25f);Global.settings.hazards.put("poor_light",0.25f);
if(x.optString("mode").equals("penalty")){System.out.println((double)ShippingDisruption.getPenaltyForShippingLost((float)x.getDouble("marketSize"),(float)x.getDouble("unitsLost")));continue;}
MarketAPI m=new MarketAPI();load(m,x.getJSONObject("state"));
if(x.optString("mode").equals("pass")){JSONArray list=x.getJSONArray("conditions");for(int n=0;n<list.length();n++)m.conditions.add(condition(m,list.getJSONObject(n)));if(x.isNull("specificModId"))m.reapplyConditions();else m.reapplyCondition(x.getString("specificModId"));System.out.println(state(m));continue;}
MarketConditionAPI c=condition(m,x);if(x.getString("action").equals("apply"))c.plugin.apply(c.modId);else c.plugin.unapply(c.modId);
JSONObject result=new JSONObject().put("state",state(m));if(c.plugin instanceof LuddicMajority)result.put("eligible",LuddicMajority.matchesBonusConditions(m));
if(x.has("incoming")){JSONObject incoming=x.getJSONObject("incoming");PopulationComposition p=new PopulationComposition();p.weight=stat(incoming.getJSONObject("weight"));JSONArray comp=incoming.getJSONArray("composition");for(int n=0;n<comp.length();n++){JSONObject a=comp.getJSONObject(n);p.comp.put(a.getString("factionId"),(float)a.getDouble("amount"));}m.size=x.getInt("marketSize");m.playerOwned=x.getBoolean("playerOwned");LuddicChurchHostileActivityFactor.defeated=x.getBoolean("defeatedExpedition");c.plugin.modifyIncoming(m,p);JSONArray out=new JSONArray();for(Map.Entry<String,Float>e:p.comp.entrySet())out.put(new JSONObject().put("factionId",e.getKey()).put("amount",(double)e.getValue()));result.put("incoming",new JSONObject().put("composition",out).put("weight",stat(p.weight)));}
System.out.println(result);}}}
`;
        if (cases.some(c => c.fullPhase === true))
            java = augmentConditionPhaseOracle(java, read);
        writeFileSync(join(dir, 'Oracle.java'), java);
        const compiled = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jsonJar, '-d', dir, ...readdirSync(dir).filter(n => n.endsWith('.java')).map(n => join(dir, n))], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
        assert.equal(compiled.status, 0, compiled.stderr);
        const specs = resolve(fileURLToPath(new URL('../src/campaign/data/reference-additional-conditions.json', import.meta.url)));
        const result = spawnSync('java', ['-cp', dir + delimiter + jsonJar, 'Oracle', specs], { input: cases.map(c => JSON.stringify(c)).join('\n') + '\n', encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim().split(/\r?\n/).map(s => JSON.parse(s));
    }
    finally {
        const absolute = resolve(dir), root = resolve(tmpdir());
        assert.ok(absolute !== root && absolute.startsWith(root + sep));
        for (const file of readdirSync(absolute))
            unlinkSync(join(absolute, file));
        rmdirSync(absolute);
    }
}
