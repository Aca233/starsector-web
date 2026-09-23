import {addOriginalResourceCargo,removeOriginalResourceCargo,originalResourceQuantity,validateOriginalResourceCargo} from '../src/campaign/rules/OriginalResourceCargo.mjs';
/** Resolved/captured fixtures, never installed into the playable sector. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createDevelopmentCampaign} from '../server/campaign/DevelopmentWorld.mjs';
import {createReferenceRuleset} from '../src/campaign/ReferenceRuleset.mjs';
import {CampaignRepository} from '../server/campaign/Repository.mjs';
import {CampaignService} from '../server/campaign/CampaignService.mjs';
import {listenCampaignGateway} from '../server/campaign/HttpGateway.mjs';
import {originalMarketStateId,quoteOriginalMarketTrade,ORIGINAL_MARKET_REFERENCE as R} from '../src/campaign/rules/OriginalMarket.mjs';
import {originalRetailStateId,validateOriginalRetailState,advanceOriginalRetailFrame} from '../src/campaign/rules/OriginalRetail.mjs';
import {originalOpenMarketBaseLimit,originalOpenMarketLimit,refreshOriginalOpenMarketResources,advanceOriginalRetailTimer} from '../src/campaign/rules/OriginalOpenMarketStockpile.mjs';
const f=Math.fround,rules=createReferenceRuleset(),system={kind:'system',id:'test-resolver'},mid='port',sid=originalMarketStateId(mid),rid=originalRetailStateId(mid),cid='reference.calendar:epoch';
const eco=w=>w.extensions[sid].data,timer=w=>w.extensions[rid].data.submarkets.open;
const bonus=()=>({flat:0,percent:0,mult:1}),threshold=()=>({highThreshold:-1,highMult:1,lowThreshold:-1,lowMult:1});
const com=(commodityId='supplies',values={})=>({commodityId,shippingGlobal:5,available:6,maxSupply:5,maxDemand:4,...values});
const refreshInput=(values={})=>({marketId:mid,submarketSpecId:'open_market',month:1,stability:10,sinceLastCargoUpdate:31,inventory:{supplies:0},commodities:[com()],illegalCommodityIds:[],...values});
function fixture(){const w=structuredClone(createDevelopmentCampaign());
 w.factions.merchant={id:'merchant',version:0,name:'Test merchant',playerRoles:{}};
 w.markets[mid]={id:mid,version:0,owner:{kind:'faction',id:'merchant'},locationId:'system'};
 w.spaceEntities.station={id:'station',version:0,name:'Test anchor',locationId:'system',position:[0,0],radius:50,tags:[]};
 w.accounts['captain-a']={id:'captain-a',version:0,owner:{kind:'player',id:'captain-a'},currency:'credits',balance:10000};
 const ids=['supplies','fuel','survey_data_1'];
 const row=id=>({stockpile:1000,demandValue:750,greed:250,utilityOnMarket:R.commodities[id].utility,availableWithoutTrade:5,tradeMod:{both:0,plus:0,minus:0},supplyPrice:threshold(),demandPrice:threshold(),playerSupplyModsByPlayer:{'captain-a':bonus()},playerDemandModsByPlayer:{'captain-a':bonus()}});
 w.extensions[sid]={id:sid,version:0,schemaVersion:1,data:{marketId:mid,anchorEntityId:'station',asOfTick:0,coverage:'resolved-native-trade-v1',tariffRate:0.3,admissionByPlayer:{'captain-a':'OPEN'},illegalCommodityIds:[],commodityOrder:ids,commodities:Object.fromEntries(ids.map(id=>[id,row(id)])),marketSupplyMod:bonus(),marketDemandMod:bonus(),submarkets:{open:{plugin:'open',inventory:{supplies:0,fuel:0,survey_data_1:5}}},tradeImpacts:[]}};
 return w;
}
const capturePayload=(values={})=>({marketId:mid,submarketId:'open',specId:'open_market',sinceLastCargoUpdate:31,source:'Test capture of new native resource timer',...values});
const refreshPayload=(w,values={})=>({marketId:mid,submarketId:'open',asOfTick:w.clock.tick,stability:10,commodities:[com(),com('fuel')],source:'Explicit resolved test supply/transport inputs; not production economy',...values});
const expected=(w,refs)=>refs.map(([collection,id])=>({collection,id,version:w[collection][id].version}));
const command=(w,type,payload,refs,requestId=type,epoch='qa')=>({worldId:w.id,epoch,type,payload,expected:expected(w,refs),requestId});
const captureCommand=(w,values={},id='capture',epoch='qa')=>command(w,'market.capture-open-retail',capturePayload(values),[['markets',mid],['extensions',sid],...(w.extensions[rid]?[['extensions',rid]]:[])],id,epoch);
const refreshCommand=(w,values={},id='refresh',epoch='qa')=>command(w,'market.refresh-open-resources',refreshPayload(w,values),[['markets',mid],['extensions',sid],['extensions',rid],['extensions',cid]],id,epoch);
const stepCommand=(w,ticks,id='step',epoch='qa')=>command(w,'world.advance',{fromTick:w.clock.tick,ticks},[],id,epoch);
function memory(t,w=fixture()){const store=new CampaignRepository(':memory:',rules,{epoch:'qa'});t.after(()=>store.close());store.create(w);return store;}
const capture=(store,w=store.read('development-sector'),values={})=>{store.execute(system,captureCommand(w,values));return store.read(w.id);};
function temp(t,close=()=>{}){const dir=mkdtempSync(join(tmpdir(),'open-retail-'));t.after(()=>{close();for(const name of readdirSync(dir)){const p=resolve(dir,name);assert.ok(p.startsWith(resolve(dir)+sep));unlinkSync(p);}rmdirSync(dir);});return dir;}

test('native open limit uses production/imports/extra, adds the negative deficit term, and hashes actual spec id',()=>{
 assert.equal(originalOpenMarketBaseLimit(com()),2325);
 assert.equal(originalOpenMarketBaseLimit(com('supplies',{available:0,maxSupply:0,maxDemand:5})),750);
 const limit=originalOpenMarketLimit(com(),mid,'open_market',1,10);assert.ok(limit>=2092&&limit<=2558);
 assert.notEqual(limit,originalOpenMarketLimit(com(),mid,'alias-open',1,10));
 assert.equal(originalOpenMarketLimit(com(),mid,'open_market',1,0),Math.trunc(limit/4));
 // Stability zero retains a quarter stock, rather than deleting all goods.
 assert.ok(originalOpenMarketLimit(com(),mid,'open_market',1,0)>0);
});
test('31 native days fill an empty resource inventory; zero elapsed time never grants a second refresh',()=>{
 const input=refreshInput(),before=structuredClone(input),r=refreshOriginalOpenMarketResources(input);assert.equal(r.inventory.supplies,r.reports[0].limit);assert.equal(r.sinceLastCargoUpdate,0);assert.deepEqual(input,before);assert.ok(Object.isFrozen(r.inventory));
 const zero=refreshOriginalOpenMarketResources({...input,sinceLastCargoUpdate:0,inventory:{supplies:0}});assert.equal(zero.inventory.supplies,0);
 const partial=refreshOriginalOpenMarketResources({...input,sinceLastCargoUpdate:15});assert.equal(partial.inventory.supplies,f(f(r.reports[0].limit/30)*15));
});
test('overstock decays to limit, illegality prevents replenishment but does not destroy below-limit stock',()=>{
 const base=refreshInput(),limit=refreshOriginalOpenMarketResources(base).reports[0].limit;
 const result=refreshOriginalOpenMarketResources({...base,inventory:{supplies:limit+3000},sinceLastCargoUpdate:15});assert.equal(result.inventory.supplies,limit);
 assert.equal(refreshOriginalOpenMarketResources({...base,inventory:{supplies:100},illegalCommodityIds:['supplies']}).inventory.supplies,100);
 assert.equal(refreshOriginalOpenMarketResources({...base,illegalCommodityIds:['supplies']}).inventory.supplies,0);
 assert.equal(refreshOriginalOpenMarketResources({...base,inventory:{supplies:limit+3000},illegalCommodityIds:['supplies']}).inventory.supplies,limit);
});
test('native tiny-stack threshold and removal discard sub-unit remainder; nonecon/meta cargo is untouched',()=>{
 const small=refreshInput({inventory:{supplies:0},sinceLastCargoUpdate:f(0.001)});assert.equal(refreshOriginalOpenMarketResources(small).inventory.supplies,0);
 const zeroInput=refreshInput({inventory:{supplies:f(1.1)},commodities:[com('supplies',{available:0,maxSupply:0,maxDemand:0})],sinceLastCargoUpdate:2});assert.equal(refreshOriginalOpenMarketResources(zeroInput).inventory.supplies,0);
 const skipped=refreshOriginalOpenMarketResources(refreshInput({inventory:{survey_data_1:5,ships:4},commodities:[com('survey_data_1'),com('ships')]}));assert.deepEqual(skipped.inventory,{survey_data_1:5,ships:4});assert.deepEqual(skipped.reports,[]);
});
test('timers preserve every float frame and batching; malformed/partial/nonnative/multistack ranges reject explicitly',()=>{
 const a=advanceOriginalRetailTimer(31,600,60),b=advanceOriginalRetailTimer(advanceOriginalRetailTimer(31,173,60),427,60);assert.equal(a,b);assert.notEqual(a,32);
 for(const changes of [{month:0},{stability:11},{sinceLastCargoUpdate:0.1},{inventory:{supplies:0.1}},{inventory:{supplies:1000001}},{commodities:[com(),com()]},{commodities:[com('supplies',{shippingGlobal:-1})]}])assert.throws(()=>refreshOriginalOpenMarketResources(refreshInput(changes)));
 assert.throws(()=>advanceOriginalRetailTimer(0,1000001,60),{code:'RETAIL_WORK_LIMIT'});
});
test('capture is explicit, one-time and versioned; no implicit reset or player-supplied clock',t=>{
 const w=fixture(),store=memory(t,w);assert.throws(()=>validateOriginalRetailState(store.read(w.id),mid),{code:'RETAIL_UNAVAILABLE'});
 const c=captureCommand(w);assert.throws(()=>store.execute({kind:'player',id:'captain-a'},c),{code:'FORBIDDEN'});
 const receipt=store.execute(system,c),after=store.read(w.id);assert.equal(timer(after).sinceLastCargoUpdate,31);assert.equal(timer(after).specId,'open_market');assert.deepEqual(eco(after),eco(w));assert.deepEqual(store.execute(system,c),receipt);
 assert.throws(()=>store.execute(system,captureCommand(after,{},'again')),{code:'RETAIL_ALREADY_CAPTURED'});assert.deepEqual(store.read(w.id),after);
});
test('world.advance advances only captured counters, not inventory/prices; partitioned frames agree',t=>{
 const w=fixture(),one=memory(t,w),many=memory(t,w);capture(one);capture(many);
 one.execute(system,stepCommand(one.read(w.id),120));for(let i=0;i<4;i++)many.execute(system,stepCommand(many.read(w.id),30,'step-'+i));
 const a=one.read(w.id),b=many.read(w.id);assert.equal(timer(a).sinceLastCargoUpdate,advanceOriginalRetailTimer(31,120,60));assert.deepEqual(a.extensions[rid].data,b.extensions[rid].data);assert.equal(a.extensions[rid].version,1);assert.equal(b.extensions[rid].version,4);
 assert.deepEqual(eco(a),eco(w));assert.equal(a.extensions[rid].data.atTick,120);assert.equal(a.clock.tick,120);assert.equal(eco(a).asOfTick,0);validateOriginalRetailState(a,mid);
});
test('system refresh atomically generates stock, clears timer, preserves non-econ and pricing, and enables real trade',t=>{
 const w=fixture(),store=memory(t,w),before=capture(store),c=refreshCommand(before),receipt=store.execute(system,c),after=store.read(w.id);
 assert.ok(eco(after).submarkets.open.inventory.supplies>0);assert.equal(timer(after).sinceLastCargoUpdate,0);assert.equal(eco(after).submarkets.open.inventory.survey_data_1,5);
 assert.deepEqual(eco(after).commodities,eco(before).commodities);assert.deepEqual(eco(after).tradeImpacts,[]);assert.equal(eco(after).asOfTick,0);assert.deepEqual(after.fleets,before.fleets);assert.deepEqual(store.execute(system,c),receipt);
 const input={marketId:mid,submarketId:'open',fleetId:'fleet-captain-a',accountId:'captain-a',commodityId:'supplies',quantity:5,side:'buy'},q=quoteOriginalMarketTrade(after,{kind:'player',id:'captain-a'},input),{side,...payload}=input;
 store.execute({kind:'player',id:'captain-a'},{worldId:w.id,epoch:'qa',requestId:'buy-generated',type:'market.'+side,payload,expected:q.expected});const bought=store.read(w.id),stock=eco(bought).submarkets.open.inventory.supplies;
 store.execute(system,refreshCommand(bought,{},'second'));assert.equal(eco(store.read(w.id)).submarkets.open.inventory.supplies,stock);assert.equal(stock,eco(after).submarkets.open.inventory.supplies-5);
});
test('refresh rejects missing roster, stale resolver tick, late snapshot and every missing optimistic dependency without changes',t=>{
 const store=memory(t),w=capture(store),c=refreshCommand(w),beforeEvents=store.eventsSince(w.id,0);
 for(const patch of [{commodities:[com()]},{commodities:[com('fuel'),com()]},{asOfTick:1},{stability:NaN},{inventory:{supplies:9999}}]){assert.throws(()=>store.execute(system,{...c,payload:{...c.payload,...patch}}));assert.deepEqual(store.read(w.id),w);assert.deepEqual(store.eventsSince(w.id,0),beforeEvents);}
 for(const e of c.expected){assert.throws(()=>store.execute(system,{...c,expected:c.expected.filter(x=>x!==e)}),{code:'VERSION_REQUIRED'});assert.throws(()=>store.execute(system,{...c,expected:c.expected.map(x=>x===e?{...x,version:x.version+1}:x)}),{code:'VERSION_CONFLICT'});}
 store.execute(system,stepCommand(w,1));const later=store.read(w.id);assert.throws(()=>store.execute(system,refreshCommand(later)),{code:'MARKET_SNAPSHOT_STALE'});assert.equal(timer(later).sinceLastCargoUpdate,advanceOriginalRetailTimer(31,1,60));assert.deepEqual(store.read(w.id),later);
});
test('refresh concurrent with player sale cannot overwrite inventory using earlier versions',t=>{
 const store=memory(t),w=capture(store),c=refreshCommand(w),input={marketId:mid,submarketId:'open',fleetId:'fleet-captain-a',accountId:'captain-a',commodityId:'supplies',quantity:3,side:'sell'},q=quoteOriginalMarketTrade(w,{kind:'player',id:'captain-a'},input),{side,...payload}=input;
 store.execute({kind:'player',id:'captain-a'},{worldId:w.id,epoch:'qa',requestId:'sell-first',type:'market.'+side,payload,expected:q.expected});const after=store.read(w.id);assert.throws(()=>store.execute(system,c),{code:'VERSION_CONFLICT'});assert.deepEqual(store.read(w.id),after);assert.equal(eco(after).submarkets.open.inventory.supplies,3);
});
test('counter and refreshed stock survive restart; outbox failure rolls back both refresh and time advancement',t=>{
 let store,db,next;const dir=temp(t,()=>{db?.close();store?.close();next?.close();}),file=join(dir,'retail.sqlite'),w=fixture();store=new CampaignRepository(file,rules,{epoch:'qa'});store.create(w);const captured=capture(store),c=refreshCommand(captured);db=new DatabaseSync(file);
 db.exec("CREATE TRIGGER fail_retail BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'retail-failure'); END;");
 for(const cmd of [c,stepCommand(captured,30)]){assert.throws(()=>store.execute(system,cmd),/retail-failure/);assert.deepEqual(store.read(w.id),captured);}
 db.exec('DROP TRIGGER fail_retail');const receipt=store.execute(system,c),after=store.read(w.id);next=new CampaignRepository(file,rules,{epoch:'new'});assert.deepEqual(next.execute(system,c),receipt);assert.deepEqual(next.read(w.id),after);assert.equal(timer(after).sinceLastCargoUpdate,0);
});
test('real Worker runs captured timers and refresh; authenticated HTTP cannot call either system-only command',async t=>{
 const service=new CampaignService({filename:':memory:'});t.after(()=>service.close());const w=fixture();await service.create(w);const {epoch}=await service.ready();
 const host=await listenCampaignGateway({service,worldId:w.id,grants:[{playerId:'captain-a',token:'A'.repeat(43)}],port:0});t.after(()=>host.close());
 const c=captureCommand(w,{},'capture',epoch);await service.execute(system,c);const captured=await service.read(w.id),refresh=refreshCommand(captured,{},'refresh',epoch);await service.execute(system,refresh);const before=await service.read(w.id);
 for(const command of [c,refresh]){const response=await fetch(host.origin+'/campaign-api/command',{method:'POST',headers:{Authorization:'Bearer '+'A'.repeat(43),'Content-Type':'application/json'},body:JSON.stringify(command)});assert.equal(response.status,403);assert.equal((await response.json()).error.code,'FORBIDDEN_COMMAND');}
 assert.deepEqual(await service.read(w.id),before);await service.execute(system,stepCommand(before,60,'one-second',epoch));const after=await service.read(w.id);assert.equal(timer(after).sinceLastCargoUpdate,advanceOriginalRetailTimer(0,60,60));assert.deepEqual(eco(after),eco(before));
});
test('retail frame rejects stale captured state, never changes input, and supplies no clock or inventory mutation',()=>{
 const w=fixture();w.extensions[rid]={id:rid,version:0,schemaVersion:1,data:{marketId:mid,atTick:0,submarkets:{open:{specId:'open_market',sinceLastCargoUpdate:31,source:'Captured test'}}}};const before=structuredClone(w),plan=advanceOriginalRetailFrame(w);assert.deepEqual(w,before);assert.equal(plan.clock,undefined);assert.equal(plan.changes.length,1);assert.equal(plan.changes[0].id,rid);assert.equal(plan.changes[0].value.data.atTick,1);
 w.extensions[rid].data.atTick=1;assert.throws(()=>advanceOriginalRetailFrame(w),{code:'RETAIL_TIME_CONFLICT'});
});

function method(source,signature){const start=source.indexOf(signature);assert.ok(start>=0,signature);const brace=source.indexOf('{',start);let depth=0;for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error('Unclosed method');}
const bits=n=>new Int32Array(new Float32Array([n]).buffer)[0];
test('extracted native OpenMarket + BaseSubmarket + CargoData resource methods agree on 320 stocking vectors and four timer rates',t=>{
 const read=path=>readFileSync(new URL('../../decompiled/'+path,import.meta.url),'utf8');
 const open=read('starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/OpenMarketPlugin.java'),base=read('starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/BaseSubmarketPlugin.java'),cargo=read('starfarer_obf/com/fs/starfarer/campaign/fleet/CargoData.java'),stack=read('starfarer_obf/com/fs/starfarer/campaign/ui/trade/CargoItemStack.java');
 const dir=temp(t),java=`import java.util.*;
interface CargoAPI { enum CargoItemType{RESOURCES,NULL,WEAPONS,SPECIAL,FIGHTER_CHIP}; float getCommodityQuantity(String id);void addCommodity(String id,float n);void removeCommodity(String id,float n); }
class Carrying { void setSyncNeeded(){} }
class CargoItemStack {CargoAPI.CargoItemType type;Object data;float size,maxSize=1000000;boolean roundSize=false;CargoData cargo;
CargoItemStack(CargoAPI.CargoItemType t,Object d,CargoData c){type=t;data=d;cargo=c;} CargoAPI.CargoItemType getType(){return type;}Object getData(){return data;}
${['public float getSize()','public void setSize(float','public float getFree()','public boolean isNull()','public boolean isFull()','public float getMaxSize()','public void setMaxSize(int','public void setRoundSize(boolean'].map(sig=>method(stack,sig)).join('\n')}
}
class CargoData implements CargoAPI {
 ArrayList<CargoItemStack> stacks=new ArrayList<>();Map<String,Float> partials=null;Carrying carryingFleet=null;boolean unlimitedStacks=true;static CargoItemStack NULL_STACK=new CargoItemStack(CargoAPI.CargoItemType.NULL,null,null);
 CargoItemStack findStack(CargoAPI.CargoItemType t,Object d){for(CargoItemStack s:stacks)if(s.type==t&&Objects.equals(s.data,d))return s;return null;}
 void addStack(CargoItemStack s){stacks.add(s);}void updateSpaceUsed(){}float getPartial(String key){return 0;}void setPartial(String key,float value){}
 ${['public void addCommodity(String','public void addItems(CargoAPI.CargoItemType','public float getQuantity(CargoAPI.CargoItemType','public float getCommodityQuantity(String','public void removeCommodity(String','public boolean removeItems(CargoAPI.CargoItemType'].map(sig=>method(cargo,sig)).join('\n')}
}
class Spec {float unit;boolean meta;float getEconUnit(){return unit;}boolean isMeta(){return meta;}}
class Market {String id;int shipping;float stability;String getId(){return id;}float getStabilityValue(){return stability;}boolean isIllegal(CommodityOnMarketAPI c){return c.illegal;}boolean isUseStockpilesForShortages(){return false;}}
class CommodityOnMarketAPI {String id;int available,supply,demand;boolean illegal,nonEcon;Spec spec=new Spec();Market market;String getId(){return id;}boolean isNonEcon(){return nonEcon;}Spec getCommodity(){return spec;}Market getMarket(){return market;}int getAvailable(){return available;}int getMaxSupply(){return supply;}int getMaxDemand(){return demand;}}
class Sub {String id;String getSpecId(){return id;}}
class Clock {int month;int getMonth(){return month;}float convertToDays(float a){return a/10f;}float convertToSeconds(float a){return a*10f;}}
class Sector {Clock clock=new Clock();Clock getClock(){return clock;}}
class Settings {int getShippingCapacity(Market m,boolean f){return m.shipping;}}
class Global {static Sector sector=new Sector();static Settings settings=new Settings();static Sector getSector(){return sector;}static Settings getSettings(){return settings;}}
class Base {Market market;Sub submarket;CargoData cargo=new CargoData();float sinceLastCargoUpdate=31,sinceSWUpdate=31;CargoAPI getCargo(){return cargo;}int getStockpileLimit(CommodityOnMarketAPI com){return 0;}boolean shouldHaveCommodity(CommodityOnMarketAPI com){return true;}
 ${['public void advance(float','public float getStockpilingAddRateMult(','protected boolean doShortageCountering(','public void addAndRemoveStockpiledResources(CommodityOnMarketAPI'].map(sig=>method(base,sig)).join('\n')}
}
class OpenMarketPlugin extends Base {static float ECON_UNIT_MULT_EXTRA=1f,ECON_UNIT_MULT_PRODUCTION=.4f,ECON_UNIT_MULT_IMPORTS=.1f,ECON_UNIT_MULT_DEFICIT=-.2f;
 ${['public boolean shouldHaveCommodity(','public int getStockpileLimit(','public static float getBaseStockpileLimit('].map(sig=>method(open,sig)).join('\n')}
}
public class Oracle {public static void main(String[] args){Scanner scan=new Scanner(System.in);while(scan.hasNextLine()){String[] s=scan.nextLine().split(",");OpenMarketPlugin p=new OpenMarketPlugin();p.market=new Market();p.market.id=s[0];p.market.stability=Float.parseFloat(s[3]);p.market.shipping=Integer.parseInt(s[4]);p.submarket=new Sub();p.submarket.id=s[1];Global.sector.clock.month=Integer.parseInt(s[2]);
CommodityOnMarketAPI c=new CommodityOnMarketAPI();c.id="supplies";c.market=p.market;c.available=Integer.parseInt(s[5]);c.supply=Integer.parseInt(s[6]);c.demand=Integer.parseInt(s[7]);c.spec.unit=Float.parseFloat(s[8]);c.illegal=s[11].equals("1");c.nonEcon=s[12].equals("1");c.spec.meta=s[13].equals("1");float current=Float.parseFloat(s[9]);if(current>0){CargoItemStack st=new CargoItemStack(CargoAPI.CargoItemType.RESOURCES,c.id,p.cargo);st.setSize(current);p.cargo.addStack(st);}p.sinceLastCargoUpdate=Float.parseFloat(s[10]);
int limit=p.getStockpileLimit(c);p.addAndRemoveStockpiledResources(c,Global.sector.clock.convertToSeconds(p.sinceLastCargoUpdate),false,true,true);System.out.println((int)OpenMarketPlugin.getBaseStockpileLimit(c)+","+limit+","+Float.floatToIntBits(p.cargo.getCommodityQuantity(c.id)));}
for(int rate:new int[]{1,20,60,1000}){Base p=new Base();for(int i=0;i<10000;i++)p.advance(1f/rate);System.out.println("T,"+rate+","+Float.floatToIntBits(p.sinceLastCargoUpdate));}}
}`;
 writeFileSync(join(dir,'Oracle.java'),java);const compiled=spawnSync('javac',['-encoding','UTF-8','-d',dir,join(dir,'Oracle.java')],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(compiled.status,0,compiled.stderr);
 const vectors=Array.from({length:320},(_,i)=>{const commodityId=i%5===0?'fuel':'supplies',c=com(commodityId,{shippingGlobal:i%12,available:i%9,maxSupply:i%7,maxDemand:i%8}),input=refreshInput({marketId:'overflow-test-market-'+i,submarketSpecId:i%2?'open_market':'test_alias',month:i%12+1,stability:i%11,sinceLastCargoUpdate:f([0,0.001,0.1,1,2,15,31,120][i%8]),inventory:{[commodityId]:f(i%13===0?1.1:i%17===0?0.5:i%4===0?0:(i*2311)%30000)},commodities:[c],illegalCommodityIds:i%3===0?[commodityId]:[]});return {c,input};});
 const stdin=vectors.map(({c,input:p})=>[p.marketId,p.submarketSpecId,p.month,p.stability,c.shippingGlobal,c.available,c.maxSupply,c.maxDemand,R.commodities[c.commodityId].econUnit,p.inventory[c.commodityId],p.sinceLastCargoUpdate,p.illegalCommodityIds.length?1:0,0,0].join(',')).join('\n')+'\n';
 const run=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',timeout:30000,windowsHide:true,input:stdin});assert.equal(run.status,0,run.stderr);const lines=run.stdout.trim().split(/\r?\n/);assert.equal(lines.length,324);
 vectors.forEach(({c,input:p},i)=>{const q=refreshOriginalOpenMarketResources(p);assert.deepEqual([originalOpenMarketBaseLimit(c),originalOpenMarketLimit(c,p.marketId,p.submarketSpecId,p.month,p.stability),bits(q.inventory[c.commodityId]??0)],lines[i].split(',').map(Number),'native stocking vector '+i);});
 for(const line of lines.slice(320)){const [,rate,value]=line.split(',');assert.equal(bits(advanceOriginalRetailTimer(31,10000,Number(rate))),Number(value),'timer rate '+rate);}
});

// Existing retail checks cover the formula; this scenario covers actual CargoData storage semantics.
test('ordered resource cargo preserves smallest-stack ties, tombstones, native spill and nonnull partials',()=>{
 const stack=(size,objectRef)=>({objectRef,type:'RESOURCES',commodityId:'food',size,maxSize:1000000,roundSize:false,cargoSpacePerUnit:1});
 const opaque={objectRef:'weapon',type:'WEAPONS',size:2,source:{name:'CIStack',attributes:{t:'WEAPONS'},children:[],text:''}};
 const first=stack(2,'first'),second=stack(2,'second'),cargo={unlimitedStacks:true,partials:null,slots:[opaque,null,first,second]};
 validateOriginalResourceCargo(cargo);addOriginalResourceCargo(cargo,'food',1);assert.equal(first.size,3);assert.equal(second.size,2);
 removeOriginalResourceCargo(cargo,'food',1.5);assert.equal(cargo.slots[3],null);assert.equal(originalResourceQuantity(cargo,'food'),3);assert.equal(cargo.slots[0],opaque);
 first.size=1000000;addOriginalResourceCargo(cargo,'food',1000001.5);assert.equal(cargo.slots[1].size,1000000);assert.equal(cargo.slots[3].size,1.5);assert.equal(originalResourceQuantity(cargo,'food'),2000001.5);
 const spill={unlimitedStacks:true,partials:null,slots:[stack(999999.5,'full')]};addOriginalResourceCargo(spill,'food',1);assert.equal(spill.slots.length,1);assert.equal(spill.slots[0].size,1000000); // Native drops a remaining sub-unit after filling a stack.
 const partial={unlimitedStacks:false,partials:{},slots:[]};addOriginalResourceCargo(partial,'food',0.5);assert.equal(partial.slots.length,0);assert.equal(partial.partials.RESOURCESfood,0.5);
 addOriginalResourceCargo(partial,'food',0.5);assert.equal(originalResourceQuantity(partial,'food'),1);assert.equal(partial.slots[0].maxSize,R.commodities.food.stackSize);assert.deepEqual(partial.partials,{});
 removeOriginalResourceCargo(partial,'food',0.25);assert.equal(originalResourceQuantity(partial,'food'),1);assert.equal(partial.partials.RESOURCESfood,-0.25);
 removeOriginalResourceCargo(partial,'food',0.75);assert.equal(originalResourceQuantity(partial,'food'),0);assert.deepEqual(partial.partials,{});
 const rounded=stack(5,'round');rounded.roundSize=true;const integerCargo={unlimitedStacks:true,partials:null,slots:[rounded]};addOriginalResourceCargo(integerCargo,'food',0.75);assert.equal(rounded.size,5);removeOriginalResourceCargo(integerCargo,'food',0.25);assert.equal(rounded.size,4);
});
