/** Source task/forced-nextStep/scheduled-createTasks oracle. Runtime effects are explicit call-tracing stubs. */
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
function block(t,s){const a=t.indexOf(s);assert.ok(a>=0,s);let i=t.indexOf('{',a)+1,d=1;for(;i<t.length&&d;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i);}
const j=JSON.stringify,n=x=>x+'f';
export function nativeEconomyTaskTraces(cases){
  const root=fileURLToPath(new URL('../..',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'campaign-economy-tasks-')),base=join(root,'decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/reach');
  const read=name=>readFileSync(join(base,name+'.java'),'utf8');
  const main=read('MainWorkTask2'),longName=main.match(/import com\.fs\.starfarer\.loading\.(\w+);/)[1];
  function clean(s){return s.replaceAll(longName,'CommoditySpec').replace(/\boOoO+([23])?\b/g,(_,number)=>'spec'+(number??'')).replaceAll('\\u00d200000','begin').replaceAll('Profiler.o00000()','Profiler.end()');}
  const init=clean(block(main,'public void initCommodityList()')).replace('public int o00000(', 'public int compare(');
  // javap verifies that CFR's erroneous Iterator local is an EconomyUpdateListener taken from a copied list.
  const batch=clean(block(main,'public void doNextBatch()')).replace('for (Iterator<Object> iterator : new ArrayList(list))','for (EconomyAPI.EconomyUpdateListener iterator : new ArrayList<EconomyAPI.EconomyUpdateListener>(list))');
  const classes=['UpdateMarketsAgainTask','ImmigrationTask','FinishEconomyUpdateTask'].map(name=>{const t=read(name),start=t.indexOf('public class');return clean(t.slice(start).replace('public class','class'));}).join('\n');
  const setups=cases.map(({config:c,options:o},i)=>{
    let s=`static void scenario${i}(){W.reset();`;
    for(const m of c.markets)s+=`W.addMarket(${j(m.id)},${j(m.econGroup)});`;
    for(const l of c.listeners)s+=`W.registry.put(${j(l.id)},new Listener(${j(l.id)},${l.expired}));`;
    for(const id of c.listenerRoster??c.listeners.map(l=>l.id))s+=`W.listeners.add(W.registry.get(${j(id)}));`;
    for(const spec of c.specs)s+=`W.specs.add(new CommoditySpec(${j(spec.id)},${n(spec.economyTier)},${spec.tags.includes('nonecon')}));`;
    for(const a of c.actions??[])s+=`W.actions.add(new Action(${j(a.trigger)},${a.occurrence},${j(a.type)},${j(a.id)},${j(a.group??null)}));`;
    if(o.mode==='forced'){s+='MainWorkTask.EconWorkParams p=new MainWorkTask.EconWorkParams();';for(const [key,value]of Object.entries(o.params))s+=`p.${key}=${value};`;s+='W.reachEconomy.nextStep(p);';}
    else s+=`new ReachEconomyStepper(W.reachEconomy,${o.lastIteration?'0':'1'}).run();`;
    return s+'System.out.println(W.output());}';
  }).join('\n');
  try {
    const java=String.raw`
import java.util.*;
interface DoNotObfuscate{}
abstract class MultiFrameTask{public abstract void doNextBatch();public abstract boolean isDone();public String getLoggingIdentifier(){return "";}}
class Profiler{static void begin(String s){}static void end(){}}
class Global{static Sector getSector(){return new Sector();}static Settings getSettings(){return new Settings();}}
class Sector{Economy getEconomy(){return W.economy;}}
interface CommoditySpecAPI{boolean hasTag(String s);String getId();}
class CommoditySpec implements CommoditySpecAPI{String id;float tier;boolean nonecon;CommoditySpec(String i,float t,boolean b){id=i;tier=t;nonecon=b;}public boolean hasTag(String s){return s.equals("nonecon")&&nonecon;}public String getId(){return id;}float getEconomyTier(){return tier;}}
class Settings{List<CommoditySpec>getAllCommoditySpecs(){return W.specs;}}
class SpecStore{static CommoditySpec o00000(Class<?>c,String id){for(CommoditySpec s:W.specs)if(s.id.equals(id))return s;throw new RuntimeException(id);}}
class PersonAPI{String id;PersonAPI(String s){id=s;}Stats getStats(){return new Stats(id);}}
class Stats{String id;Stats(String s){id=s;}void refreshCharacterStatsEffects(){W.emit("character:"+id);}void refreshGovernedOutpostEffects(MarketAPI m){W.emit("governed:"+m.id);}}
class MarketAPI{String id,group;MarketAPI(String i,String g){id=i;group=g;}String getEconGroup(){return group;}void reapplyConditions(){W.emit("conditions:"+id);}void reapplyIndustries(){W.emit("industries:"+id);}PersonAPI getAdmin(){return new PersonAPI(id);}}
class Market extends MarketAPI{Market(String i,String g){super(i,g);}}
interface EconomyAPI{interface EconomyUpdateListener{boolean isEconomyListenerExpired();void commodityUpdated(String id);void economyUpdated();}}
class Economy{static final int NUM_ITER_PER_MONTH=10;List<MarketAPI>getMarkets(){return W.markets;}List<EconomyAPI.EconomyUpdateListener>getUpdateListeners(){return W.listeners;}void removeUpdateListener(EconomyAPI.EconomyUpdateListener l){W.emit("removeListener:"+((Listener)l).id);W.listeners.remove(l);}}
class Listener implements EconomyAPI.EconomyUpdateListener{String id;boolean expired;Listener(String i,boolean e){id=i;expired=e;}public boolean isEconomyListenerExpired(){boolean b=expired;W.emit("expired:"+id+":"+b);return b;}public void commodityUpdated(String c){W.emit("commodity:"+id+":"+c);}public void economyUpdated(){W.emit("finish:"+id);}}
class CommodityMarketData{CommodityMarketData(String id,String group){StringJoiner ids=new StringJoiner(",");for(MarketAPI m:W.markets)if(Objects.equals(m.group,group))ids.add(m.id);W.emit("network:"+id+":"+group+":"+ids);}}
interface ImmigrationPlugin{void advance(float days,boolean ui);}
class Misc{static ImmigrationPlugin getImmigrationPlugin(MarketAPI m){return (days,ui)->W.emit("immigration:"+m.id+":"+((days==(int)days)?""+(int)days:""+days)+":"+ui);}}
class MainWorkTask{public static class EconWorkParams{public boolean withIncomeAndUpkeep=true,withStockpileUpdate=true,forceNonUIStep=false,withImmigration=true;}}
class MainWorkTask2 extends MultiFrameTask{private ReachEconomy economy;private List<MarketAPI>markets=null;private List<String>commodities;private int index=0;private boolean started=false;private int marketIndex=0;private MainWorkTask.EconWorkParams params;
${clean(block(main,'public MainWorkTask2('))}${init}${batch}${clean(block(main,'public boolean isDone()'))}
public static void updateStockpileAndPrice(Market m,CommoditySpec c){W.emit("stockpile:"+m.id+":"+c.id);}}
${classes}
class ReachEconomy{List<MarketAPI>markets=W.reach;List<MarketAPI>getMarkets(){return markets;}${clean(block(read('ReachEconomy'),'public void nextStep('))}}
class ReachEconomyStepper{List<MultiFrameTask>tasks;ReachEconomy econ;int iterLeft;ReachEconomyStepper(ReachEconomy r,int left){econ=r;iterLeft=left;}void run(){createTasks();for(MultiFrameTask t:tasks)while(!t.isDone())t.doNextBatch();}${clean(block(read('ReachEconomyStepper'),'private void createTasks()'))}}
class Action{String trigger,type,id,group;int occurrence;Action(String t,int n,String k,String i,String g){trigger=t;occurrence=n;type=k;id=i;group=g;}}
class W{static List<String>trace;static List<MarketAPI>reach,markets;static Map<String,Market>all;static Map<String,Listener>registry;static List<EconomyAPI.EconomyUpdateListener>listeners;static List<CommoditySpec>specs;static List<Action>actions;static Map<String,Integer>counts;static Economy economy;static ReachEconomy reachEconomy;
static void reset(){trace=new ArrayList<>();reach=new ArrayList<>();markets=new ArrayList<>();all=new HashMap<>();registry=new HashMap<>();listeners=new ArrayList<>();specs=new ArrayList<>();actions=new ArrayList<>();counts=new HashMap<>();economy=new Economy();reachEconomy=new ReachEconomy();}
static void addMarket(String id,String group){Market m=all.get(id);if(m==null){m=new Market(id,group);all.put(id,m);}else m.group=group;if(!reach.contains(m))reach.add(m);if(!markets.contains(m))markets.add(m);}
static void emit(String e){trace.add(e);int count=counts.getOrDefault(e,0)+1;counts.put(e,count);for(Action a:actions){if(!a.trigger.equals(e)||a.occurrence!=count)continue;switch(a.type){case "add-market":addMarket(a.id,a.group);break;case "remove-market":reach.remove(all.get(a.id));markets.remove(all.get(a.id));break;case "group":all.get(a.id).group=a.group;break;case "add-listener":registry.putIfAbsent(a.id,new Listener(a.id,false));listeners.add(registry.get(a.id));break;case "remove-listener":listeners.remove(registry.get(a.id));break;case "expire":registry.get(a.id).expired=true;break;default:throw new RuntimeException(a.type);}}}
static String output(){StringJoiner j=new StringJoiner(",","[","]");for(String s:trace)j.add("\""+s+"\"");return j.toString();}}
public class Oracle{${setups}public static void main(String[]args){${cases.map((_,i)=>`scenario${i}();`).join('')}}}
`;
    writeFileSync(join(dir,'Oracle.java'),java);
    const c=spawnSync('javac',['-encoding','UTF-8','-d',dir,join(dir,'Oracle.java')],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});assert.equal(c.status,0,c.stderr);
    const r=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s));
  }finally{const target=resolve(dir),parent=resolve(tmpdir());assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const p of readdirSync(target))unlinkSync(join(target,p));rmdirSync(target);}
}
