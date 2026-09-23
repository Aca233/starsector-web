/** Source-extracted accessibility oracle. Runs Java without a visible window, never launches the game. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ORIGINAL_MARKET_ACCESSIBILITY as R } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
function block(text, signature) { const start = text.indexOf(signature); assert.ok(start >= 0, signature); let end = text.indexOf('{', start) + 1, depth = 1; for (; depth && end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; } assert.equal(depth, 0); return text.slice(start, end); }
function between(text, first, after) { const start = text.indexOf(first), end = text.indexOf(after, start); assert.ok(start >= 0 && end > start, first + ' / ' + after); return text.slice(start, end); }
export function nativeAccessibilityOracle(groupCases, localCases, industryCases = []) {
  const dir = mkdtempSync(join(tmpdir(), 'campaign-access-oracle-')), root = fileURLToPath(new URL('../../', import.meta.url));
  const api = 'decompiled/starfarer.api/com/fs/starfarer/api/', obf = 'decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/';
  const read = p => readFileSync(join(root, p), 'utf8');
  try {
    for (const name of ['MutableStat', 'StatBonus']) writeFileSync(join(dir, name + '.java'), read(api + 'combat/' + name + '.java').replace(/^package .*;\r?\n/m, '').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm, ''));
    const c = read(obf + 'reach/CommodityMarketData.java'), reach = read(obf + 'reach/ReachEconomy.java'), misc = read(api + 'util/Misc.java');
    const port = read(api + 'impl/campaign/econ/impl/Spaceport.java'), pop = read(api + 'impl/campaign/econ/impl/PopulationAndInfrastructure.java'), free = read(api + 'impl/campaign/econ/FreeMarket.java'), base = read(api + 'impl/campaign/econ/impl/BaseIndustry.java');
    const coreMethods = ['public static Vector2f computeCenterOfMass(', 'public static float computeBaseAccessibility(MarketAPI marketAPI, Vector2f', 'public static int getShippingCapacity(', 'public static String getDescForAccessibility(', 'public static String getFactionHostilityDesc(', 'public static class o'].map(sig => block(c, sig).replace('List list =', 'List<MarketAPI> list =')).join('\n');
    const coreUpdate = between(c, 'float f6 = CommodityMarketData.computeBaseAccessibility', 'float f7 = marketAPI.getAccessibilityMod()');
    const portApply = between(block(port, 'public void apply()'), 'this.market.setHasSpaceport(true);', 'float officerProb') + block(block(port, 'public void apply()'), 'if (!this.isFunctional())');
    const portUnapply = between(block(port, 'public void unapply()'), 'this.market.setHasSpaceport(false);', 'this.market.getStats()');
    const popApply = between(block(pop, 'public void apply()'), 'boolean spaceportFirstInQueue =', 'float stability =');
    const popUnapply = block(pop, 'public void unapply()').split(/\r?\n/).filter(l => l.includes('getAccessibilityMod()')).join('\n');
    const constants = obj => Object.entries(obj).map(([key, value]) => `static float ${key}=${value}f;`).join('\n');
    const itemRepo = read(api + 'impl/campaign/econ/impl/ItemEffectsRepo.java'), install = read(api + 'impl/campaign/econ/impl/BaseInstallableItemEffect.java');
    const itemStart = itemRepo.indexOf('this.put("fullerene_spool"'), itemEnd = itemRepo.indexOf('this.put(', itemStart + 10), spool = itemRepo.slice(itemStart, itemEnd);
    const requirements = block(install, 'public List<String> getUnmetRequirements(Industry industry, boolean');
    const constantNames = [...new Set([...requirements.matchAll(/ItemEffectsRepo\.([A-Z_]+)/g)].map(m => m[1]))];
    // Keep declaration order: CORONAL_TAP_RANGE references an earlier integer constant.
    const constantLines = itemRepo.split('\n').filter(line => constantNames.some(name => new RegExp('public static (?:String|int) ' + name + ' = ').test(line)));
    assert.equal(constantLines.length, constantNames.length);
    const itemConstants = constantLines.join('\n');
    const spoolBonus = itemRepo.match(/FULLERENE_SPOOL_ACCESS_BONUS = ([\d.]+)f;/)[1];
    const itemClasses = String.raw`
interface InstallableItemEffect{void apply(Industry industry);void unapply(Industry industry);List<String>getUnmetRequirements(Industry industry);}
class SpecialItemData{String id;SpecialItemData(String s){id=s;}String getId(){return id;}}
class SpecialItemSpec{String id;SpecialItemSpec(String s){id=s;}String getId(){return id;}String getName(){return id;}}
class Planet{boolean gas;Planet(boolean b){gas=b;}boolean isGasGiant(){return gas;}}
class Pair<A,B>{A one;B two;}
class SectorEntityToken{}
class BaseInstallableItemEffect implements InstallableItemEffect{SpecialItemSpec spec;BaseInstallableItemEffect(String id){spec=new SpecialItemSpec(id);}public void apply(Industry i){}public void unapply(Industry i){}
${['public String[] getSimpleReqs(', 'public List<String> getRequirements(', 'public List<String> getUnmetRequirements(Industry industry)'].map(s=>block(install,s)).join('\n')}
${requirements}
}
class ItemEffectsRepo{
${itemConstants}
static float FULLERENE_SPOOL_ACCESS_BONUS=${spoolBonus}f;
static Map<String,InstallableItemEffect>ITEM_EFFECTS=new HashMap<>();static{ITEM_EFFECTS.put("fullerene_spool",new BaseInstallableItemEffect("fullerene_spool"){
${['public void apply(', 'public void unapply(', 'public String[] getSimpleReqs('].map(s=>block(spool,s)).join('\n')}
});}}
`;
    const j = JSON.stringify, number = v => Object.is(v, -0) ? '-0.0f' : v + 'f';
    const industrySetups = industryCases.map((p, index) => {
      const init = ['flat', 'percent', 'mult'].map(channel => p.accessibility[channel].map(m => 'm.access.modify' + channel[0].toUpperCase() + channel.slice(1) + 'Always(' + j(m.id) + ',' + number(m.value) + ',null);').join('')).join('');
      const planet = p.portItemContext ? (p.portItemContext.planetIsGasGiant === null ? '' : 'm.planet=new Planet(' + p.portItemContext.planetIsGasGiant + ');') + p.portItemContext.conditionIds.map(id => 'm.conditions.add(' + j(id) + ');').join('') : '';
      const industries = p.industries.map(i => '{BaseIndustry b=new ' + (i.industryId === 'population' ? 'PopulationAndInfrastructure' : ['spaceport', 'megaport'].includes(i.industryId) ? 'Spaceport' : 'BaseIndustry') + '();b.id=' + j(i.industryId) + ';b.market=m;b.aiCoreId=' + j(i.aiCoreId) + ';b.improved=' + i.improved + ';b.disrupted=' + i.operating.disrupted + ';b.building=' + i.operating.building + ';b.upgradeId=' + j(i.operating.upgradeId) + ';b.special=' + (i.specialItemId === null ? 'null' : 'new SpecialItemData(' + j(i.specialItemId) + ')') + ';m.industries.add(b);}').join('');
      return 'static void industry' + index + '(){MarketAPI m=new MarketAPI();m.size=' + p.marketSize + ';m.hasSpaceport=' + p.hasSpaceport + ';Global.settings.queuedIsPort=' + p.firstQueuedIndustryHasSpaceportTag + ';' + planet + (p.firstQueuedIndustryHasSpaceportTag ? 'm.queue.items.add(new ConstructionQueue.ConstructionQueueItem());' : '') + init + industries + String.raw`for(Industry i:m.industries){BaseIndustry b=(BaseIndustry)i;b.unapply();b.apply();}System.out.println("{\"accessibility\":"+bonus(m.access)+",\"hasSpaceport\":"+m.hasSpaceport+",\"value\":"+(double)m.access.computeEffective(0)+"}");}`;
    }).join('\n');
    const java = String.raw`import java.util.*;import org.lwjgl.util.vector.Vector2f;
class Profiler{static void \u00d200000(String s){}static void o00000(){}}
class FactionAPI{String id;Set<String>hostile=new HashSet<>();boolean isHostileTo(FactionAPI f){return hostile.contains(f.id);}}
class IndustrySpecAPI{Set<String>tags=new HashSet<>();boolean hasTag(String s){return tags.contains(s);}}
class ConstructionQueue{static class ConstructionQueueItem{String id="queued";}List<ConstructionQueueItem>items=new ArrayList<>();List<ConstructionQueueItem>getItems(){return items;}}
interface Industry{MarketAPI getMarket();IndustrySpecAPI getSpec();boolean isBuilding();boolean isUpgrading();}
${itemClasses}
class MarketAPI{enum SurveyLevel{NONE,PRELIMINARY,FULL}Planet planet;Set<String>conditions=new HashSet<>();SurveyLevel getSurveyLevel(){return SurveyLevel.FULL;}Planet getPlanetEntity(){return planet;}boolean hasCondition(String id){return conditions.contains(id);}String id,group;FactionAPI faction;int size;Vector2f location=new Vector2f();StatBonus access=new StatBonus();boolean hasSpaceport;ConstructionQueue queue=new ConstructionQueue();List<Industry>industries=new ArrayList<>();String getEconGroup(){return group;}String getId(){return id;}int getSize(){return size;}FactionAPI getFaction(){return faction;}Vector2f getLocationInHyperspace(){return location;}StatBonus getAccessibilityMod(){return access;}boolean hasSpaceport(){return hasSpaceport;}void setHasSpaceport(boolean b){hasSpaceport=b;}ConstructionQueue getConstructionQueue(){return queue;}List<Industry>getIndustries(){return industries;}}
class Economy{List<MarketAPI>markets=new ArrayList<>();${block(reach, 'public List<MarketAPI> getMarketsInGroup(')} ${block(reach, 'public boolean isInGroup(')}}
class Sector{Economy economy=new Economy();Economy getEconomy(){return economy;}}
class Settings{boolean queuedIsPort;float getFloat(String s){switch(s){${Object.entries(R.settings).map(([key, value]) => `case "${key}":return ${value}f;`).join('')}default:throw new RuntimeException(s);}}IndustrySpecAPI getIndustrySpec(String s){IndustrySpecAPI spec=new IndustrySpecAPI();if(queuedIsPort)spec.tags.add("spaceport");return spec;}}
class Global{static Sector sector=new Sector();static Settings settings=new Settings();static Sector getSector(){return sector;}static Settings getSettings(){return settings;}}
class Misc{static String ucFirst(String s){return s;}static Vector2f temp3=new Vector2f();${block(misc, 'public static float getDistanceLY(Vector2f')} ${block(misc, 'public static float getUnitsPerLightYear(')} ${block(misc, 'public static Industry getCurrentlyBeingConstructed(')}}
class CommodityMarketData{static float BASE_ACCESSIBILITY=${R.settings.accessibilityBaseValue}f,COM_FACTOR=${R.settings.accessibilityDistFromCOM}f,SAME_FACTION_BONUS=${R.settings.accessibilitySameFactionBonus}f,PER_UNIT_SHIPPING=${R.settings.accessibilityPerUnitShipping}f;${coreMethods}}
class BaseIndustry implements Industry{SpecialItemData special;public MarketAPI getMarket(){return market;}String id,aiCoreId,upgradeId;boolean disrupted,building;Boolean improved=false;MarketAPI market;Map<String,Object>supply=new HashMap<>();String getId(){return id;}String getModId(int i){return "ind_"+id+"_"+i;}boolean isImproved(){return Boolean.TRUE.equals(improved);}boolean isDisrupted(){return disrupted;}public boolean isBuilding(){return building;}public IndustrySpecAPI getSpec(){IndustrySpecAPI s=new IndustrySpecAPI();if(id.equals("population"))s.tags.add("population");return s;}String getNameForModifier(){return "";}String getImprovementsDescForModifiers(){return "";}
${block(base, 'public boolean isFunctional()')} ${block(base, 'public boolean isUpgrading()')} ${block(base, 'protected void applyAICoreModifiers()')}
protected void applyAlphaCoreModifiers(){}protected void applyBetaCoreModifiers(){}protected void applyGammaCoreModifiers(){}protected void applyNoAICoreModifiers(){}protected void applyImproveModifiers(){}
public void apply(boolean ignored){applyAICoreModifiers();applyImproveModifiers();InstallableItemEffect effect;${block(block(base, 'public void apply(boolean'), 'if (this.special != null')}}public void apply(){}public void unapply(){${between(block(base, 'public void unapply()'), 'this.applyNoAICoreModifiers();', 'if (this instanceof MarketImmigrationModifier)')}InstallableItemEffect effect;${block(block(base, 'public void unapply()'), 'if (this.special != null')}}}
class Spaceport extends BaseIndustry{${constants(R.portSettings)}
public void apply(){super.apply(true);boolean megaport="megaport".equals(getId());String desc="";${portApply}}
public void unapply(){super.unapply();${portUnapply}}
${['protected void applyAlphaCoreModifiers()', 'protected void applyNoAICoreModifiers()', 'protected void applyImproveModifiers()'].map(sig => block(port, sig)).join('\n')}
}
class PopulationAndInfrastructure extends BaseIndustry{static Pair<SectorEntityToken,Float>getNearestCoronalTap(Vector2f v,boolean b){throw new UnsupportedOperationException("Spool must not use coronal-tap requirements");}public void apply(){int size=market.getSize();float sizeBonus;${popApply}}public void unapply(){${popUnapply}}${block(pop, 'public static float getAccessibilityBonus(')}}
class FreeMarket{${constants(R.freeMarketSettings)}float daysActive;${block(free, 'protected float getAccessBonus()')}}
public class Oracle{
static String mods(Map<String,MutableStat.StatMod>m){StringJoiner j=new StringJoiner(",","[","]");for(MutableStat.StatMod v:m.values())j.add("{\"id\":\""+v.source+"\",\"value\":"+(double)v.value+"}");return j.toString();}
static String bonus(StatBonus s){return "{\"flat\":"+mods(s.getFlatBonuses())+",\"percent\":"+mods(s.getPercentBonuses())+",\"mult\":"+mods(s.getMultBonuses())+"}";}
static void group(String[] parts){int n=Integer.parseInt(parts[1]),mask=Integer.parseInt(parts[2]);Global.sector.economy.markets.clear();Map<String,FactionAPI>factions=new LinkedHashMap<>();for(int i=0;i<n;i++){String[] x=parts[3+i].split(",");MarketAPI m=new MarketAPI();m.id=x[0];m.group=null;m.faction=factions.computeIfAbsent(x[1],key->{FactionAPI f=new FactionAPI();f.id=key;return f;});m.size=Integer.parseInt(x[2]);m.location.set(Float.parseFloat(x[3]),Float.parseFloat(x[4]));m.access.modifyFlatAlways("external",Float.parseFloat(x[5]),null);m.access.modifyFlatAlways("core_base",Float.parseFloat(x[6]),null);m.access.modifyFlatAlways("core_hostile",Float.parseFloat(x[7]),null);m.access.modifyPercentAlways("percent",Float.parseFloat(x[8]),null);m.access.modifyMultAlways("mult",Float.parseFloat(x[9]),null);Global.sector.economy.markets.add(m);}
for(FactionAPI a:factions.values())for(FactionAPI b:factions.values()){int bit=Integer.parseInt(a.id.substring(1))*3+Integer.parseInt(b.id.substring(1));if((mask&(1<<bit))!=0)a.hostile.add(b.id);}
Vector2f vector2f=CommodityMarketData.computeCenterOfMass(null,null);CommodityMarketData.o weights=new CommodityMarketData.o(Global.sector.economy.markets);float f3=weights.\u00d200000;Map<FactionAPI,Integer>map=weights.Object;float f4=Global.settings.getFloat("accessibilityLossWhenAllHostile");StringJoiner rows=new StringJoiner(",","[","]");
for(MarketAPI marketAPI:Global.sector.economy.markets){float before=marketAPI.access.computeEffective(0);int beforeG=CommodityMarketData.getShippingCapacity(marketAPI,false),beforeF=CommodityMarketData.getShippingCapacity(marketAPI,true);float f5;${coreUpdate}
rows.add("{\"marketId\":\""+marketAPI.id+"\",\"base\":"+(double)f6+",\"beforeValue\":"+(double)before+",\"beforeG\":"+beforeG+",\"beforeF\":"+beforeF+",\"afterValue\":"+(double)marketAPI.access.computeEffective(0)+",\"afterG\":"+CommodityMarketData.getShippingCapacity(marketAPI,false)+",\"afterF\":"+CommodityMarketData.getShippingCapacity(marketAPI,true)+",\"accessibility\":"+bonus(marketAPI.access)+"}");}
System.out.println("{\"center\":{\"x\":"+(double)vector2f.x+",\"y\":"+(double)vector2f.y+"},\"markets\":"+rows.toString()+"}");}
static void local(String[] p){MarketAPI m=new MarketAPI();m.size=Integer.parseInt(p[1]);m.hasSpaceport=p[2].equals("1");Global.settings.queuedIsPort=p[3].equals("1");if(Global.settings.queuedIsPort)m.queue.items.add(new ConstructionQueue.ConstructionQueueItem());float days=Float.parseFloat(p[4]);boolean active=p[5].equals("1");int seed=Integer.parseInt(p[6]);m.access.modifyFlatAlways("external",(seed%7)*0.1f,null);m.access.modifyFlatAlways("core_base",0.4f,null);m.access.modifyFlatAlways("free",0.05f,null);m.access.modifyPercentAlways("percent",50,null);m.access.modifyMultAlways("mult",1.1f,null);
for(int i=7;i<p.length;i++){String[] x=p[i].split(",");BaseIndustry b=x[0].equals("population")?new PopulationAndInfrastructure():x[0].equals("spaceport")||x[0].equals("megaport")?new Spaceport():new BaseIndustry();b.id=x[0];b.market=m;b.aiCoreId=x[1].equals("none")?null:x[1];b.improved=x[2].equals("1");b.disrupted=x[3].equals("1");b.building=x[4].equals("1");b.upgradeId=x[5].equals("none")?null:x[5];m.industries.add(b);}
FreeMarket free=new FreeMarket();free.daysActive=days;
for(int iteration=0;iteration<3;iteration++){m.access.unmodifyFlat("free");if(active)m.access.modifyFlat("free",free.getAccessBonus(),null);for(Industry i:m.industries){BaseIndustry b=(BaseIndustry)i;b.unapply();b.apply();}System.out.println("{\"accessibility\":"+bonus(m.access)+",\"hasSpaceport\":"+m.hasSpaceport+",\"value\":"+(double)m.access.computeEffective(0)+"}");}}
${industrySetups}
public static void main(String[]args){Scanner scan=new Scanner(System.in);while(scan.hasNextLine()){String[] p=scan.nextLine().split(";");if(p[0].equals("G"))group(p);else local(p);}${industryCases.map((_,i)=>`industry${i}();`).join('')}}
}`;
    // Generic repair only: decompiler erases local list types. No numeric/control-flow edits.
    writeFileSync(join(dir, 'Oracle.java'), java);
    const jar = join(root, 'starsector-core/lwjgl_util.jar'), cp = dir + delimiter + jar;
    const compiled = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', cp, '-d', dir, join(dir, 'MutableStat.java'), join(dir, 'StatBonus.java'), join(dir, 'Oracle.java')], { encoding: 'utf8', timeout: 30000, windowsHide: true }); assert.equal(compiled.status, 0, compiled.stderr);
    const input = groupCases.map(g => ['G', g.input.markets.length, g.mask, ...g.input.markets.map(m => [m.marketId, m.factionId, m.size, m.location.x, m.location.y, ...m.accessibility.flat.map(x => x.value), m.accessibility.percent[0].value, m.accessibility.mult[0].value].join(','))].join(';'));
    input.push(...localCases.map(c => { const p = c.input; return ['L', p.marketSize, p.hasSpaceport ? 1 : 0, p.firstQueuedIndustryHasSpaceportTag ? 1 : 0, p.freeMarketDaysByModId.free, p.conditions[0].suppressed ? 0 : 1, c.seed, ...p.industries.map(i => [i.industryId, i.aiCoreId ?? 'none', i.improved ? 1 : 0, i.operating.disrupted ? 1 : 0, i.operating.building ? 1 : 0, i.operating.upgradeId ?? 'none'].join(','))].join(';'); }));
    const run = spawnSync('java', ['-cp', cp, 'Oracle'], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, input: input.join('\n') + (input.length ? '\n' : '') }); assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  } finally { const target = resolve(dir), parent = resolve(tmpdir()); assert.ok(target.startsWith(parent + sep) && target !== parent); for (const file of readdirSync(target)) unlinkSync(join(target, file)); rmdirSync(target); }
}
