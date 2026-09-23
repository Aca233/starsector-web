/** Full source advance/increaseMarketSize methods. Reapplication/world/UI dependencies are explicit test stubs. */
import assert from 'node:assert/strict';
import { nativeImmigrationSnapshots } from './campaign-immigration-native-oracle.mjs';
export function nativePopulationSnapshots(cases) {
  return nativeImmigrationSnapshots(cases.map(c=>c.state.immigration),[],({java,core,market,block,initStat,n,j})=>{
    function replace(needle,value){assert.ok(java.includes(needle),needle);java=java.replace(needle,value);}
    replace('class Settings{','class Settings{void profilerBegin(String s){}void profilerEnd(){}');
    replace('class Sector{','class Sector{boolean newGame;CampaignUI ui=new CampaignUI();boolean isInNewGameAdvance(){return newGame;}Faction getPlayerFaction(){return new Faction(new MarketAPI());}CampaignUI getCampaignUI(){return ui;}');
    replace('class ConditionGenDataSpec{','class ConditionGenDataSpec{boolean isRequiresSurvey(){return false;}');
    replace('class Faction{','class Faction{String getCrest(){return "crest";}');
    replace('class BaseMarketConditionPlugin{','class BaseMarketConditionPlugin{void setParam(Object o){}');
    replace('class Misc{','class Misc{static ImmigrationPlugin getImmigrationPlugin(MarketAPI m){return new CoreImmigrationPluginImpl(m);}static String getBasePlayerColor(){return "";}static String getTextColor(){return "";}static String getHighlightColor(){return "";}');
    const extras=String.raw`
interface ImmigrationPlugin{float getWeightForMarketSize(float size);}
class BaseIntelPlugin{static String getSoundMajorPosting(){return "";}}
class MessageIntel{MessageIntel(String a,String b){}void addLine(String a,String b,String[]c,String d){}void setIcon(String s){}void setSound(String s){}}
class CommMessageAPI{enum MessageClickAction{COLONY_INFO}}
class CampaignUI{int messages;void addMessage(MessageIntel i,CommMessageAPI.MessageClickAction a,MarketAPI m){messages++;}}
class GrowthReads{int stability;float cap;boolean owner,newGame;GrowthReads(int s,float c,boolean o,boolean g){stability=s;cap=c;owner=o;newGame=g;}}
class ListenerUtil{static void reportColonySizeChanged(MarketAPI m,int old){m.calls.add("setSize:"+m.size);}}
class MarketCondition extends MarketConditionAPI{static int sequence;MarketCondition(String id,MarketAPI m){super(id,id+"_native"+(++sequence),true,false);plugin=new BaseMarketConditionPlugin();plugin.market=m;plugin.condition=this;}ConditionGenDataSpec getGenSpec(){return null;}void setSurveyed(boolean b){surveyed=b;}}
`;
    replace('class MarketAPI{',extras+`class MarketAPI{PopulationComposition population,incoming;List<String>calls=new ArrayList<>();Map<Integer,GrowthReads>growthReads=new HashMap<>();String getName(){return id;}void resetCache(){}void reapplyIndustries(){calls.add("reapplyIndustries");GrowthReads r=growthReads.get(size);if(r!=null){stability.unmodify();stability.setBaseValue(r.stability);stats.getMod("max_market_size").unmodify();stats.getMod("max_market_size").modifyFlat("driver",r.cap-6f);playerOwned=r.owner;Global.sector.newGame=r.newGame;}}void removeCondition(String s){calls.add("remove:"+s);nativeRemoveCondition(s);}String addCondition(String s){calls.add("add:"+s);return addCondition(s,null);}public void reapplyConditions(){calls.add("reapplyConditions");nativeReapplyConditions();}
${['public PopulationComposition getPopulation()', 'public PopulationComposition getIncoming()', 'public boolean wasIncomingSetBefore()', 'public void setIncoming(', 'public void setSize(', 'public String addCondition(String string2, Object', 'public void removeCondition('].map(s=>block(market,s)).join('\n').replace('public void removeCondition(', 'public void nativeRemoveCondition(')}
`);
    // Preserve the original implementation already loaded by the immigration harness, with a logging wrapper.
    const originalConditions=block(market,'public void reapplyConditions(');
    replace(originalConditions,originalConditions.replace('public void reapplyConditions(', 'public void nativeReapplyConditions('));
    replace('class CoreImmigrationPluginImpl{',`class CoreImmigrationPluginImpl implements ImmigrationPlugin{${['public void advance(', 'public void increaseMarketSize()', 'public static void increaseMarketSize('].map(s=>block(core,s)).join('\n')}`);
    const populationJSON=String.raw`
static String composition(PopulationComposition p){if(p==null)return "null";StringJoiner c=new StringJoiner(",","[","]");for(String id:p.getComp().keySet())c.add("{\"factionId\":\""+id+"\",\"amount\":"+(double)p.get(id)+"}");return "{\"composition\":"+c+",\"weight\":"+stat(p.getWeight())+"}";}
static String advanced(MarketAPI m){StringJoiner c=new StringJoiner(",","[","]"),conditions=new StringJoiner(",","[","]");for(String s:m.calls)c.add("\""+s+"\"");for(MarketConditionAPI s:m.conditions)conditions.add("\""+s.id+"\"");return "{\"population\":"+composition(m.population)+",\"incoming\":"+composition(m.incoming)+",\"size\":"+m.size+",\"stability\":"+(double)m.getStabilityValue()+",\"incentives\":{\"on\":"+m.incentives+",\"credits\":"+(double)m.credits+"},\"playerOwned\":"+m.playerOwned+",\"inNewGameAdvance\":"+Global.sector.newGame+",\"calls\":"+c+",\"conditions\":"+conditions+",\"notifications\":"+Global.sector.ui.messages+"}";}
`;
    replace('public class Oracle{','public class Oracle{'+populationJSON);
    function initPopulation(target,p){if(p===null)return `${target}=null;`;return `${target}=new PopulationComposition();${initStat(target+'.getWeight()',p.weight)}${p.composition.map(r=>`${target}.set(${j(r.factionId)},${n(r.amount)});`).join('')}`;}
    for(let i=0;i<cases.length;i++){
      const {state:p,growthReads}=cases[i],sig=`static void scenario${i}()`,scenario=block(java,sig);
      const setup=`m.playerOwned=${p.playerOwned};Global.sector.newGame=${p.inNewGameAdvance};${initPopulation('m.population',p.population)}${initPopulation('m.incoming',p.previousIncoming)}${Object.entries(growthReads).map(([size,r])=>`m.growthReads.put(${size},new GrowthReads(${r.stability},${n(r.maxSize)},${r.playerOwned},${r.inNewGameAdvance}));`).join('')}`;
      const needle=`CoreImmigrationPluginImpl plugin=new CoreImmigrationPluginImpl(m);PopulationComposition inc=plugin.computeIncoming(${p.immigration.uiUpdateOnly},${n(p.immigration.days)}/30f);System.out.println(result(m,inc));`;
      assert.ok(scenario.includes(needle));replace(scenario,scenario.replace(needle,`${setup}CoreImmigrationPluginImpl plugin=new CoreImmigrationPluginImpl(m);${(cases[i].steps??[{days:p.immigration.days,uiUpdateOnly:p.immigration.uiUpdateOnly}]).map(step=>`plugin.advance(${n(step.days)},${step.uiUpdateOnly});`).join('')}System.out.println(advanced(m));`));
    }
    return java;
  });
}
