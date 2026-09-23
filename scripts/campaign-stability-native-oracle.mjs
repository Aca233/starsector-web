/** Original method/block oracle, not a game launch. Demand writes are supplied by the separately verified commodity pass. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ORIGINAL_MARKET_ECONOMY, resolveOriginalEconomyMutable } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
import { ORIGINAL_MARKET_STABILITY as R } from '../src/campaign/rules/OriginalMarketStability.mjs';
function block(text, signature) { const start = text.indexOf(signature); assert.ok(start >= 0, signature); const open = text.indexOf('{', start); let end = open + 1, depth = 1; for (; end < text.length && depth; end++) {
    if (text[end] === '{')
        depth++;
    else if (text[end] === '}')
        depth--;
} assert.equal(depth, 0); return text.slice(start, end); }
function between(text, start, end) { const a = text.indexOf(start), b = text.indexOf(end, a); assert.ok(a >= 0 && b > a, start + ' -> ' + end); return text.slice(a, b); }
const j = JSON.stringify, num = n => n + 'f';
function initStat(target, state, bonus = false) {
    let code = bonus ? '' : target + '.setBaseValue(' + num(state.base) + ');';
    for (const kind of ['flat', 'percent', 'mult'])
        for (const m of (bonus ? state : state.modifiers)[kind])
            code += `${target}.modify${kind[0].toUpperCase() + kind.slice(1)}Always(${j(m.id)},${num(m.value)},null);`;
    return code;
}
export function nativeStabilitySnapshots(cases) {
    const root = fileURLToPath(new URL('../..', import.meta.url)), api = join(root, 'decompiled/starfarer.api/com/fs/starfarer/api'), dir = mkdtempSync(join(tmpdir(), 'campaign-stability-'));
    const read = p => readFileSync(join(api, p), 'utf8'), econ = p => read('impl/campaign/econ/' + p + '.java');
    try {
        for (const name of ['MutableStat', 'StatBonus'])
            writeFileSync(join(dir, name + '.java'), read('combat/' + name + '.java').replace(/^package .*;\r?\n/m, '').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm, ''));
        const base = econ('impl/BaseIndustry'), pop = econ('impl/PopulationAndInfrastructure'), military = econ('impl/MilitaryBase'), ground = econ('impl/GroundDefenses'), station = econ('impl/OrbitalStation'), misc = read('util/Misc.java');
        const constants = o => Object.entries(o).map(([key, value]) => `static float ${key}=${num(value)};`).join('\n');
        const baseMethods = ['public Pair<String, Integer> getMaxDeficit(', 'public boolean isFunctional()', 'public boolean isUpgrading()', 'public boolean isIndustry()', 'protected int getBaseStabilityMod()', 'protected void modifyStabilityWithBaseMod()', 'protected void unmodifyStabilityWithBaseMod()', 'protected Pair<String, Integer> getStabilityAffectingDeficit()', 'protected int getStabilityPenalty()'].map(s => block(base, s)).join('\n');
        const classes = [pop, military, ground, station].map((source, index) => {
            const name = ['PopulationAndInfrastructure', 'MilitaryBase', 'GroundDefenses', 'OrbitalStation'][index], apply = block(source, 'public void apply()');
            let body;
            if (index === 0)
                body = between(apply, 'PopulationAndInfrastructure.modifyStability(', 'boolean spaceportFirstInQueue') + 'this.market.getStats().getDynamic().getMod("max_industries").modifyFlat(this.getModId(), this.getMaxIndustries(), null);PopulationAndInfrastructure.modifyStability2(this,this.market,this.getModId(3));';
            else if (index === 1)
                body = between(apply, 'int size =', 'super.apply(!patrol);') + between(apply, 'super.apply(!patrol);', 'int extraDemand =') + between(apply, 'int extraDemand =', 'this.market.getStats()') + between(apply, 'this.demand("supplies"', 'float mult =');
            else if (index === 2)
                body = between(apply, 'super.apply(true);', 'float mult =');
            else
                body = between(apply, 'super.apply(false);', 'float mult =');
            if (index !== 0)
                body += 'if(!isFunctional())unapply();';
            const unapply = block(source, 'public void unapply()');
            const ownUnapply = unapply.split(/\r?\n/).filter(l => l.includes('super.unapply()') || l.includes('getStability().') || l.includes('unmodifyStability') || l.includes('getMod("max_industries")')).join('\n');
            const methods = ['protected int getBaseStabilityMod()', 'protected Pair<String, Integer> getStabilityAffectingDeficit()', 'protected void applyImproveModifiers()'].filter(sig => source.includes(sig) && (!sig.includes('applyImprove') || index === 0 || index === 3)).map(sig => block(source, sig)).join('\n');
            const popMethods = index === 0 ? ['public static void modifyStability(', 'public static void unmodifyStability(', 'public static void modifyStability2(', 'public static float getIncomeStabilityMult(', 'public static float getUpkeepHazardMult(', 'public static void modifyUpkeepByHazardRating(', 'public static int getMismanagementPenalty()', 'public int getMaxIndustries()', 'public static int getMaxIndustries('].map(s => block(pop, s)).join('\n') : '';
            return `class ${name} extends BaseIndustry{static float IMPROVE_STABILITY_BONUS=1f;static int[]MAX_IND=new int[]{${R.maxIndustries}};public void apply(){${body}}public void unapply(){${ownUnapply}}${methods}${popMethods}}`;
        }).join('\n');
        const trade = econ('impl/TradeCenter'), lions = econ('impl/LionsGuardHQ');
        const specialClasses = 'class TradeCenter extends BaseIndustry{' + [...trade.matchAll(/public static float [A-Z_]+ = [0-9.]+f;/g)].map(m => m[0]).join('') +
            'public void apply(){super.apply(true);' + block(trade, 'public void apply()').slice(block(trade, 'public void apply()').indexOf('this.market.getStability()')) +
            'public void unapply(){super.unapply();' + block(trade, 'public void unapply()').slice(block(trade, 'public void unapply()').indexOf('this.market.getStability()')) +
            ['protected void applyAlphaCoreModifiers(', 'protected void applyNoAICoreModifiers(', 'protected void applyImproveModifiers('].map(sig => block(trade, sig)).join('') + '}' +
            'class LionsGuardHQ extends BaseIndustry{public void apply(){' + block(lions, 'public void apply()').slice(block(lions, 'public void apply()').indexOf('super.apply(true);'), block(lions, 'public void apply()').indexOf('MemoryAPI memory')) + 'if(!this.isFunctional())this.unapply();}public void unapply(){super.unapply();this.unmodifyStabilityWithBaseMod();}' + ['public boolean isFunctional()', 'protected int getBaseStabilityMod()', 'protected Pair<String, Integer> getStabilityAffectingDeficit()'].map(sig => block(lions, sig)).join('') + '}';
        const relay = econ('CommRelayCondition');
        const conditions = ['FreeMarket', 'RecentUnrest', 'DecivilizedSubpop'].map(name => {
            const source = econ(name), methods = ['apply', 'unapply'].map(action => `public void ${action}(String id){${block(source, 'public void ' + action + '(String id)').split(/\r?\n/).filter(l => l.includes('getStability()')).join('\n')}}`).join('\n');
            return `class ${name} extends BaseCondition{${name === 'FreeMarket' ? constants(R.freeMarket) + 'float daysActive;' + block(source, 'protected float getStabilityPenalty()') : name === 'RecentUnrest' ? 'int penalty;' : constants(R.decivilized)}${methods}}`;
        }).join('\n');
        const methods = cases.map(({ input: p, commodityEffects, conditionsAlreadyApplied = false }, idx) => {
            const governed = p.governance.markets.find(m => m.marketId === p.governance.marketId);
            let setup = `static void case${idx}(){Global.sector.economy.markets.clear();MarketAPI m=new MarketAPI();m.size=${p.commodityPass.marketSize};m.owned=${governed.playerOwned};m.admin.player=${governed.adminIsPlayer};m.previous=${num(p.previousStability)};m.hazard=${num(p.hazard)};Global.sector.person.stats.outposts.setBaseValue(${num(p.governance.maxOutposts)});`;
            if (p.commodityPass.special)
                setup += `m.factionId=${j(p.commodityPass.special.factionId)};`;
            for (const row of p.governance.markets)
                setup += `{MarketAPI other=new MarketAPI();other.owned=${row.playerOwned};other.admin.player=${row.adminIsPlayer};Global.sector.economy.markets.add(other);}`;
            for (const name of ['stability', 'incomeMult', 'upkeepMult'])
                setup += initStat('m.' + name, p[name]);
            setup += initStat('m.stats.dynamic.getMod("max_industries")', p.maxIndustries, true);
            for (const row of p.marketCommodities)
                setup += `{CommodityOnMarketAPI c=new CommodityOnMarketAPI();c.id=${j(row.commodityId)};c.nonecon=${ORIGINAL_MARKET_ECONOMY.commodities[row.commodityId].tags.includes('nonecon')};c.demand=${row.maxDemand};c.supply=${row.maxSupply};c.available=${row.available};c.data.shipping=${row.shippingFaction};c.data.export=${row.maxExportFaction};m.commodities.put(c.id,c);}`;
            for (const c of p.commodityPass.conditions) {
                setup += `m.conditions.add(${j(c.id)});`;
                if (conditionsAlreadyApplied || !['free_market', 'recent_unrest', 'decivilized_subpop', 'comm_relay'].includes(c.id))
                    continue;
                const klass = { free_market: 'FreeMarket', recent_unrest: 'RecentUnrest', decivilized_subpop: 'DecivilizedSubpop', comm_relay: 'CommRelayCondition' }[c.id], s = p.conditionStateByModId[c.modId];
                setup += `{${klass} c=new ${klass}();c.market=m;c.modId=${j(c.modId)};c.active=${c.surveyed && !c.suppressed};`;
                if (c.id === 'free_market')
                    setup += `c.daysActive=${num(s.daysActive)};`;
                if (c.id === 'recent_unrest')
                    setup += `c.penalty=${s.penalty};`;
                if (c.id === 'comm_relay') {
                    setup += `m.location=${s.hasContainingLocation ? 'new Object()' : 'null'};`;
                    for (const r of s.relays)
                        setup += `{SectorEntityToken r=new SectorEntityToken();r.faction=${r.sameFaction ? 'm.faction' : 'new Object()'};r.memory.disabled=${r.nonFunctional};r.makeshift=${r.makeshift};c.relays.add(r);}`;
                }
                setup += 'm.plugins.add(c);}';
            }
            for (let index = 0; index < p.commodityPass.industries.length; index++) {
                const e = p.commodityPass.industries[index], spec = R.industries[e.state.industryId], kind = ['PopulationAndInfrastructure', 'MilitaryBase', 'GroundDefenses', 'OrbitalStation', 'TradeCenter', 'LionsGuardHQ'].includes(spec.className) ? spec.className : 'BaseIndustry';
                setup += `{BaseIndustry b=new ${kind}();b.market=m;b.id=${j(e.state.industryId)};b.spec=Global.settings.getIndustrySpec(b.id);b.building=${e.operating.building};b.disrupted=${e.operating.disrupted};b.upgradeId=${j(e.operating.upgradeId)};b.improved=${e.modifiers.improved};b.aiCoreId=${j(e.modifiers.aiCoreId)};b.specialItemId=${j(e.modifiers.specialItemId)};`;
                for (const [id, s] of Object.entries(e.state.demand))
                    setup += `b.getDemand(${j(id)}).quantity.setBaseValue(${num(resolveOriginalEconomyMutable(s))});`;
                for (const [id, s] of Object.entries(commodityEffects.industries[index].state.demand))
                    setup += `b.after.put(${j(id)},${num(resolveOriginalEconomyMutable(s))});`;
                setup += 'm.industries.add(b);}';
            }
            for (const id of p.constructionQueue)
                setup += `{ConstructionQueue.ConstructionQueueItem q=new ConstructionQueue.ConstructionQueueItem();q.id=${j(id)};m.queue.items.add(q);}`;
            return setup + 'for(BaseCondition c:m.plugins){c.unapply(c.modId);if(c.active)c.apply(c.modId);}for(Industry i:m.industries){BaseIndustry b=(BaseIndustry)i;b.unapply();b.apply();}PopulationAndInfrastructure.modifyUpkeepByHazardRating(m,"upkeep_hazard_mod");System.out.println(output(m));}';
        }).join('\n');
        const java = String.raw `import java.util.*;
class Pair<A,B>{A one;B two;Pair(){}Pair(A a,B b){one=a;two=b;}}
class JSONArray{int getInt(int i)throws JSONException{return 0;}}class JSONException extends Exception{}
class Global{static boolean CODEX_TOOLTIP_MODE=false;static Settings settings=new Settings();static Sector sector=new Sector();static Settings getSettings(){return settings;}static Sector getSector(){return sector;}}
class Settings{float getFloat(String id){switch(id){${Object.entries(R.settings).map(([k, v]) => `case ${j(k)}:return ${num(v)};`).join('')}default:throw new RuntimeException(id);}}JSONArray getJSONArray(String id){return new JSONArray();}Spec getIndustrySpec(String id){Spec s=new Spec();switch(id){${Object.entries(R.industries).map(([id, s]) => `case ${j(id)}:s.tags.addAll(Arrays.asList(${s.tags.map(j).join(',')}));s.upgrade=${j(s.upgrade)};break;`).join('')}default:throw new RuntimeException(id);}return s;}}
class Sector{Economy economy=new Economy();Person person=new Person();Economy getEconomy(){return economy;}Sector getCharacterData(){return this;}Person getPerson(){return person;}}
class Economy{List<MarketAPI>markets=new ArrayList<>();List<MarketAPI>getMarketsCopy(){return markets;}}
class MutableCharacterStatsAPI{MutableStat outposts=new MutableStat(0);MutableStat getOutpostNumber(){return outposts;}}
class Person{MutableCharacterStatsAPI stats=new MutableCharacterStatsAPI();MutableCharacterStatsAPI getStats(){return stats;}}
class Admin{boolean player;boolean isPlayer(){return player;}}
class Dynamic{Map<String,StatBonus>mods=new HashMap<>();StatBonus getMod(String id){return mods.computeIfAbsent(id,k->new StatBonus());}}
class Stats{Dynamic dynamic=new Dynamic();Dynamic getDynamic(){return dynamic;}}
interface IndustrySpecAPI{boolean hasTag(String t);}
class Spec implements IndustrySpecAPI{Set<String>tags=new HashSet<>();String upgrade;public boolean hasTag(String t){return tags.contains(t);}String getUpgrade(){return upgrade;}}
class ConstructionQueue{static class ConstructionQueueItem{String id;}List<ConstructionQueueItem>items=new ArrayList<>();List<ConstructionQueueItem>getItems(){return items;}}
class CommodityMarketDataAPI{int shipping,export;int getMaxShipping(MarketAPI m,boolean faction){return shipping;}int getMaxExport(String id){return export;}}
class CommodityOnMarketAPI{String id;int supply,demand,available;boolean nonecon;boolean isNonEcon(){return nonecon;}int getMaxSupply(){return supply;}int getMaxDemand(){return demand;}int getAvailable(){return available;}CommodityMarketDataAPI data=new CommodityMarketDataAPI();CommodityMarketDataAPI getCommodityMarketData(){return data;}}
class MarketAPI{String factionId="f";StringJoiner financialReads=new StringJoiner(",","[","]");int size;float previous,hazard;boolean owned;Object location=new Object(),faction=new Object();Admin admin=new Admin();Stats stats=new Stats();ConstructionQueue queue=new ConstructionQueue();List<Industry>industries=new ArrayList<>();Set<String>conditions=new HashSet<>();List<BaseCondition>plugins=new ArrayList<>();Map<String,CommodityOnMarketAPI>commodities=new LinkedHashMap<>();MutableStat stability=new MutableStat(0),incomeMult=new MutableStat(1),upkeepMult=new MutableStat(1);
int getSize(){return size;}float getPrevStability(){return previous;}float getHazardValue(){return hazard;}MutableStat getStability(){return stability;}MutableStat getIncomeMult(){return incomeMult;}MutableStat getUpkeepMult(){return upkeepMult;}boolean isPlayerOwned(){return owned;}Admin getAdmin(){return admin;}Stats getStats(){return stats;}String getFactionId(){return factionId;}Object getFaction(){return faction;}Object getContainingLocation(){return location;}boolean hasCondition(String id){return conditions.contains(id);}List<CommodityOnMarketAPI>getCommoditiesCopy(){return new ArrayList<>(commodities.values());}CommodityOnMarketAPI getCommodityData(String id){return commodities.get(id);}List<Industry>getIndustries(){return industries;}ConstructionQueue getConstructionQueue(){return queue;}Industry instantiateIndustry(String id){BaseIndustry b=new BaseIndustry();b.spec=Global.settings.getIndustrySpec(id);return b;}
${block(readFileSync(join(root, 'decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/Market.java'), 'utf8'), 'public float getStabilityValue()')}
}
interface Industry{boolean isIndustry();boolean isUpgrading();Spec getSpec();}
class MutableCommodityQuantity{MutableStat quantity=new MutableStat(0);MutableStat getQuantity(){return quantity;}}
class BaseIndustry implements Industry{String aiCoreId,specialItemId;protected void applyAlphaCoreModifiers(){}protected void applyNoAICoreModifiers(){}void applyDeficitToProduction(int index,Pair<String,Integer> deficit,String...ids){}String id,upgradeId;boolean building,disrupted,improved;Spec spec;MarketAPI market;Map<String,MutableCommodityQuantity>demand=new LinkedHashMap<>();Map<String,Float>after=new HashMap<>();String getId(){return id;}String getModId(){return "ind_"+id;}String getModId(int i){return getModId()+"_"+i;}public Spec getSpec(){return spec;}boolean isBuilding(){return building;}boolean isDisrupted(){return disrupted;}boolean isImproved(){return improved;}String getNameForModifier(){return "";}String getImprovementsDescForModifiers(){return "";}static String getDeficitText(String id){return "";}MutableCommodityQuantity getDemand(String id){return demand.computeIfAbsent(id,k->new MutableCommodityQuantity());}void demand(String id,int n){getDemand(id).quantity.setBaseValue(after.get(id));}void supply(String id,int n){}void applyIncomeAndUpkeep(float size){market.financialReads.add("{\"industryId\":\""+id+"\",\"incomeMult\":"+(double)market.incomeMult.getModifiedValue()+",\"upkeepMult\":"+(double)market.upkeepMult.getModifiedValue()+"}");}void apply(boolean update){if(update)applyIncomeAndUpkeep(-1f);if("alpha_core".equals(aiCoreId))applyAlphaCoreModifiers();else if(aiCoreId==null)applyNoAICoreModifiers();applyImproveModifiers();if("dealmaker_holosuite".equals(specialItemId))market.incomeMult.modifyPercent("dealmaker_holosuite",50);}public void apply(){apply(true);}protected void applyImproveModifiers(){}public void unapply(){applyNoAICoreModifiers();if("dealmaker_holosuite".equals(specialItemId))market.incomeMult.unmodifyPercent("dealmaker_holosuite");boolean old=improved;improved=false;applyImproveModifiers();improved=old;}
${baseMethods}}
class Misc{static int OVER_MAX_INDUSTRIES_PENALTY=${R.settings.overMaxIndustriesPenalty};${['public static float getOutpostPenalty()', 'public static int getNumIndustries(', 'public static int getMaxIndustries('].map(s => block(misc, s)).join('\n')}}
${classes}
${specialClasses}
class Memory{boolean disabled;boolean getBoolean(String id){return disabled;}}class SectorEntityToken{boolean makeshift;Object faction;Memory memory=new Memory();boolean hasTag(String tag){return makeshift;}Memory getMemoryWithoutUpdate(){return memory;}Object getFaction(){return faction;}}
class BaseCondition{MarketAPI market;String modId;boolean active;public void apply(String id){}public void unapply(String id){}}
class CommRelayCondition extends BaseCondition{static String COMM_RELAY_MOD_ID="core_comm_relay";${constants(R.relay)}LinkedHashSet<SectorEntityToken>relays=new LinkedHashSet<>();${['protected boolean isMakeshift(', 'protected SectorEntityToken getBestRelay()', 'public void apply(String id)', 'public void unapply(String id)'].map(s => block(relay, s)).join('\n')}}
${conditions}
public class Oracle{
static String mods(Map<String,MutableStat.StatMod>m){StringJoiner j=new StringJoiner(",","[","]");for(MutableStat.StatMod v:m.values())j.add("{\"id\":\""+v.source+"\",\"value\":"+(double)v.value+"}");return j.toString();}
static String bonus(StatBonus s){return "{\"flat\":"+mods(s.getFlatBonuses())+",\"percent\":"+mods(s.getPercentBonuses())+",\"mult\":"+mods(s.getMultBonuses())+"}";}
static String stat(MutableStat s){return "{\"base\":"+(double)s.base+",\"modifiers\":{\"flat\":"+mods(s.getFlatMods())+",\"percent\":"+mods(s.getPercentMods())+",\"mult\":"+mods(s.getMultMods())+"}}";}
static String output(MarketAPI m){return "{\"industryFinancialInputs\":"+m.financialReads+",\"stability\":"+stat(m.stability)+",\"incomeMult\":"+stat(m.incomeMult)+",\"upkeepMult\":"+stat(m.upkeepMult)+",\"maxIndustries\":"+bonus(m.stats.dynamic.getMod("max_industries"))+",\"values\":{\"stability\":"+(double)m.getStabilityValue()+",\"rawStability\":"+(double)m.stability.getModifiedValue()+",\"incomeMult\":"+(double)m.incomeMult.getModifiedValue()+",\"upkeepMult\":"+(double)m.upkeepMult.getModifiedValue()+",\"maxIndustries\":"+Misc.getMaxIndustries(m)+"}}";}
${methods}
public static void main(String[]args){${cases.map((_, i) => `case${i}();`).join('')}}
}`;
        writeFileSync(join(dir, 'Oracle.java'), java);
        const compiled = spawnSync('javac', ['-encoding', 'UTF-8', '-d', dir, join(dir, 'MutableStat.java'), join(dir, 'StatBonus.java'), join(dir, 'Oracle.java')], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        assert.equal(compiled.status, 0, compiled.stderr);
        const run = spawnSync('java', ['-cp', dir, 'Oracle'], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
        assert.equal(run.status, 0, run.stderr);
        return run.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
    }
    finally {
        const target = resolve(dir), parent = resolve(tmpdir());
        assert.ok(target.startsWith(parent + sep) && target !== parent);
        for (const file of readdirSync(target))
            unlinkSync(join(target, file));
        rmdirSync(target);
    }
}
