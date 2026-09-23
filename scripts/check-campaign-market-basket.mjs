/** Resolved test economy ONLY; does not populate production markets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { listenCampaignGateway } from '../server/campaign/HttpGateway.mjs';
import { originalMarketBasketTotals } from '../src/campaign/rules/OriginalMarketBasket.mjs';
import { originalMarketStateId, quoteOriginalMarketBasket, quoteOriginalMarketTrade, validateOriginalMarketState, ORIGINAL_MARKET_REFERENCE as R } from '../src/campaign/rules/OriginalMarket.mjs';
import { createOriginalMarketTradeLedger, ingestOriginalMarketTrade, originalMarketTradeQuantities, advanceOriginalMarketTradeLedger } from '../src/campaign/rules/OriginalMarketEconomyLedger.mjs';
const rules = createReferenceRuleset(), actor = (id='captain-a') => ({kind:'player',id});
const fid = 'fleet-captain-a', sid = originalMarketStateId('port'), state = w => w.extensions[sid].data;
const bonus = () => ({flat:0,percent:0,mult:1}), threshold = () => ({highThreshold:-1,highMult:1,lowThreshold:-1,lowMult:1});
const row = id => ({stockpile:1000,demandValue:750,greed:250,utilityOnMarket:R.commodities[id].utility,availableWithoutTrade:5,tradeMod:{both:0,plus:0,minus:0},supplyPrice:threshold(),demandPrice:threshold(),playerSupplyModsByPlayer:{'captain-a':bonus(),'captain-b':bonus()},playerDemandModsByPlayer:{'captain-a':bonus(),'captain-b':bonus()}});
function fixture() {
 const w = structuredClone(createDevelopmentCampaign());
 w.factions.merchant={id:'merchant',version:0,name:'Test merchant',playerRoles:{}};
 w.markets.port={id:'port',version:0,owner:{kind:'faction',id:'merchant'},locationId:'system'};
 w.spaceEntities.station={id:'station',version:0,name:'Test anchor',locationId:'system',position:[0,0],radius:50,tags:[]};
 for(const id of ['captain-a','captain-b']) {
  w.accounts[id]={id,version:0,owner:{kind:'player',id},currency:'credits',balance:10000};
  w.fleets['fleet-'+id].position=[0,0]; w.fleets['fleet-'+id].cargo={supplies:100,fuel:100,heavy_machinery:100,crew:30};
 }
 const ids=['supplies','fuel','heavy_machinery'];
 w.extensions[sid]={id:sid,version:0,schemaVersion:1,data:{marketId:'port',anchorEntityId:'station',asOfTick:0,coverage:'resolved-native-trade-v1',tariffRate:0.3,admissionByPlayer:{'captain-a':'OPEN','captain-b':'OPEN'},illegalCommodityIds:[],commodityOrder:ids,commodities:Object.fromEntries(ids.map(id=>[id,row(id)])),marketSupplyMod:bonus(),marketDemandMod:bonus(),submarkets:{open:{plugin:'open',inventory:{supplies:1000,fuel:1000,heavy_machinery:1000}},black:{plugin:'black',inventory:{supplies:1000,fuel:1000}}},tradeImpacts:[]}};
 return w;
}
const item=(commodityId,side='buy',quantity=1)=>({commodityId,side,quantity});
const payload=(items=[item('supplies','buy',10),item('heavy_machinery','sell',20)],who='captain-a')=>({marketId:'port',submarketId:'open',fleetId:'fleet-'+who,accountId:who,items});
const quote=(w,p=payload(),who='captain-a')=>quoteOriginalMarketBasket(w,actor(who),p);
const command=(w,p=payload(),id='basket',who='captain-a',epoch='qa')=>({worldId:w.id,epoch,type:'market.trade-basket',requestId:id,payload:p,expected:quote(w,p,who).expected});
function memory(t,w=fixture()) {const store=new CampaignRepository(':memory:',rules,{epoch:'qa'});t.after(()=>store.close());store.create(w);return store;}
function temp(t,close=()=>{}) {const dir=mkdtempSync(join(tmpdir(),'market-basket-'));t.after(()=>{close();for(const name of readdirSync(dir)){const file=resolve(dir,name);assert.ok(file.startsWith(resolve(dir)+sep));unlinkSync(file);}rmdirSync(dir);});return dir;}
function unchanged(store,w,c,code,who='captain-a') {assert.throws(()=>store.execute(actor(who),c),code?{code}:undefined);assert.deepEqual(store.read(w.id),w);assert.deepEqual(store.eventsSince(w.id,0),[]);}

test('native basket rounds combined tax once, not per-line, and taxes both buy and sell value',()=>{
 const q=originalMarketBasketTotals([{side:'buy',rawGross:1},{side:'sell',rawGross:1}],0.3);
 assert.equal(q.tariff,1);assert.equal(q.subtotal,0);assert.equal(q.creditsDelta,-1);
 assert.equal(originalMarketBasketTotals([{side:'buy',rawGross:1},{side:'buy',rawGross:1}],0.3).tariff,1);
 assert.equal(originalMarketBasketTotals([{side:'buy',rawGross:1.75},{side:'buy',rawGross:1.75}],0).creditsDelta,-3);
 assert.equal(originalMarketBasketTotals([{side:'sell',rawGross:1.75},{side:'buy',rawGross:1.25}],0).creditsDelta,0);
});
test('basket rejects malformed, duplicate/opposing lines, injected prices and unsupported quantities',()=>{
 const w=fixture();
 for(const items of [[],Array(65).fill(item('fuel')),null,[null],[item('fuel'),item('fuel','sell')],[{...item('fuel'),gross:1}],[item('fuel','bad')],...[0,-1,0.5,Infinity,NaN,2**25].map(n=>[item('fuel','buy',n)])])assert.throws(()=>quote(w,payload(items)));
 assert.throws(()=>quote(w,{...payload(),tariffRate:0}));
 for(const lines of [[],Array(65).fill({side:'buy',rawGross:1}),[{side:'sell',rawGross:-1}],[{side:'buy',rawGross:NaN}],[{side:'buy',rawGross:2**24},{side:'buy',rawGross:1}]])assert.throws(()=>originalMarketBasketTotals(lines,0.3));
});
test('actual V0 basket preserves fractional raw resource prices until whole net/tax rounding',t=>{
 const w=fixture(),d=state(w);
 for(const [id,amount]of [['survey_data_1',1.75],['survey_data_2',1.75]]){
  d.commodityOrder.push(id);d.commodities[id]=row(id);d.submarkets.open.inventory[id]=10;
  d.commodities[id].playerSupplyModsByPlayer['captain-a']={flat:amount-R.commodities[id].basePrice,percent:0,mult:1};
 }
 d.tariffRate=0;const p=payload([item('survey_data_1'),item('survey_data_2')]),q=quote(w,p);assert.deepEqual(q.items.map(i=>i.rawGross),[1.75,1.75]);assert.equal(q.buyGross,3.5);assert.equal(q.creditsDelta,-3);
 const store=memory(t,w);store.execute(actor(),command(w,p));assert.equal(store.read(w.id).accounts['captain-a'].balance,9997);assert.equal(store.read(w.id).fleets[fid].cargo.survey_data_2,1);
});
test('basket amount ceiling is checked before float rounding can hide an overflowing unit',()=>{
 for(const side of ['buy','sell'])assert.throws(()=>originalMarketBasketTotals([{side,rawGross:2**24},{side,rawGross:1}],0),{code:'UNSUPPORTED_MARKET_RANGE'});
});
test('immutable same-snapshot quote keeps each original integral, complete dependencies, and never mutates stock or credits',()=>{
 const w=fixture(),before=structuredClone(w),p=payload(),q=quote(w,p);
 for(const line of q.items){const {items:_items,...common}=p;const one=quoteOriginalMarketTrade(w,actor(),{...common,commodityId:line.commodityId,side:line.side,quantity:line.quantity});assert.equal(line.rawGross,one.gross);assert.deepEqual(q.expected,one.expected);}
 assert.ok(Object.isFrozen(q)&&Object.isFrozen(q.items));assert.deepEqual(w,before);assert.ok(q.expected.some(e=>e.collection==='members'));assert.ok(q.expected.some(e=>e.collection==='factions'));assert.equal(q.admissionByPlayer,undefined);
});
test('selling finances buying at zero starting credits, with one atomic basket, one version increment and one outbox batch',t=>{
 const w=fixture();w.accounts['captain-a'].balance=0;const p=payload(),q=quote(w,p);assert.ok(q.executable&&q.creditsDelta>0);
 const buy=quoteOriginalMarketTrade(w,actor(),{marketId:'port',submarketId:'open',fleetId:fid,accountId:'captain-a',...p.items[0]});assert.equal(buy.canAfford,false);
 const store=memory(t,w),c=command(w,p),receipt=store.execute(actor(),c),after=store.read(w.id);
 assert.equal(after.fleets[fid].cargo.supplies,110);assert.equal(after.fleets[fid].cargo.heavy_machinery,80);assert.equal(after.accounts['captain-a'].balance,q.creditsDelta);
 assert.equal(state(after).submarkets.open.inventory.supplies,990);assert.equal(state(after).submarkets.open.inventory.heavy_machinery,1020);
 for(const [collection,id]of [['fleets',fid],['accounts','captain-a'],['markets','port'],['extensions',sid]])assert.equal(after[collection][id].version,1);
 assert.deepEqual(after.accounts['captain-b'],w.accounts['captain-b']);assert.equal(state(after).tradeImpacts.length,2);assert.equal(state(after).commodities.supplies.stockpile,1000);
 assert.equal(store.eventsSince(w.id,0).length,1);assert.equal(receipt.result.creditsDelta,q.creditsDelta);
 assert.deepEqual(store.execute(actor(),{...c,epoch:'old'}),receipt);assert.deepEqual(store.read(w.id),after);
 assert.throws(()=>store.execute(actor(),{...c,payload:{...p,items:[item('fuel')]}}),{code:'REQUEST_REUSED'});
});
test('overloaded purchases allowed and fractional valid account remainder preserved',t=>{
 const w=fixture();w.accounts['captain-a'].balance=1e6+0.5;
 const p=payload([item('supplies','buy',100)]),store=memory(t,w),q=quote(w,p);assert.ok(q.executable);
 store.execute(actor(),command(w,p));assert.equal(store.read(w.id).fleets[fid].cargo.supplies,200);assert.equal(store.read(w.id).accounts['captain-a'].balance%1,0.5);
});
test('insufficient final funds rejects whole basket without making the sell first',t=>{
 const w=fixture();w.accounts['captain-a'].balance=0;const p=payload([item('supplies','buy',100),item('fuel','sell',1)]),q=quote(w,p);assert.equal(q.canAfford,false);
 const store=memory(t,w);unchanged(store,store.read(w.id),command(w,p),'INSUFFICIENT_CREDITS');
});
test('all per-line availability, legality and late result bounds are checked before any persistence',t=>{
 for(const [mutate,p,code]of [
  [w=>state(w).submarkets.open.inventory.fuel=0,payload([item('supplies'),item('fuel')]),'INSUFFICIENT_STOCK'],
  [w=>w.fleets[fid].cargo.fuel=0,payload([item('supplies'),item('fuel','sell')]),'INSUFFICIENT_CARGO'],
  [w=>state(w).illegalCommodityIds.push('fuel'),payload([item('supplies'),item('fuel')]),'ILLEGAL_COMMODITY'],
  [w=>w.fleets[fid].cargo.fuel=2**24,payload([item('supplies'),item('fuel')]),'INVALID_NUMBER'],
  [w=>state(w).commodities.fuel.tradeMod.plus=-(2**24),payload([item('supplies'),item('fuel')]),'INVALID_NUMBER']]) {
   const w=fixture(),c=command(w,p);mutate(w);const store=memory(t,w);unchanged(store,store.read(w.id),c,code);
  }
});
test('all optimistic dependencies are mandatory; concurrent player cannot partially buy the stale shared basket',t=>{
 const w=fixture(),p=payload([item('supplies','buy',999),item('fuel')]);w.accounts['captain-a'].balance=1e6;w.accounts['captain-b'].balance=1e6;
 const store=memory(t,w),a=command(w,p),b=command(w,payload(p.items,'captain-b'),'other','captain-b');
 for(const e of a.expected){unchanged(store,store.read(w.id),{...a,expected:a.expected.filter(x=>x!==e)},'VERSION_REQUIRED');unchanged(store,store.read(w.id),{...a,expected:a.expected.map(x=>x===e?{...x,version:x.version+1}:x)},'VERSION_CONFLICT');}
 store.execute(actor(),a);const after=store.read(w.id);assert.throws(()=>store.execute(actor('captain-b'),b),{code:'VERSION_CONFLICT'});assert.deepEqual(store.read(w.id),after);assert.equal(state(after).submarkets.open.inventory.supplies,1);
});
test('unchanged fleet versions do not bypass physical contact, authority permission or stale economics',t=>{
 for(const [mutate,code]of [[w=>w.fleets[fid].position=[10000,0],'MARKET_OUT_OF_REACH'],[w=>state(w).admissionByPlayer['captain-a']='NONE','MARKET_ACCESS_DENIED'],[w=>w.fleets[fid].control={kind:'player',id:'captain-b'},'FORBIDDEN'],[w=>{w.clock.tick=1;w.clock.gameSeconds=1/w.clock.ticksPerSecond;},'MARKET_SNAPSHOT_STALE']]) {
  const w=fixture(),c=command(w);mutate(w);const store=memory(t,w);unchanged(store,store.read(w.id),c,code);
 }
 const w=fixture();assert.throws(()=>quote(w,payload(),'captain-b'),{code:'FORBIDDEN'});assert.throws(()=>quote(w,{...payload(),accountId:'captain-b'}),{code:'FORBIDDEN'});
});
test('impact ledger budget refuses the whole multi-line command, not just its last fact',t=>{
 const w=fixture(),d=state(w);d.tradeImpacts=Array.from({length:4095},(_,i)=>({requestId:'prior-'+i,playerId:'captain-a',submarketId:'open',commodityId:'supplies',channel:'plus',quantity:1,createdTick:0,expiresAtGameSeconds:R.settings.tradeImpactDays*R.settings.secondsPerDay}));
 const store=memory(t,w);unchanged(store,store.read(w.id),command(w),'MARKET_REFRESH_REQUIRED');
});
test('black market may quote zero tariff but must not execute until consequences are supported',t=>{
 const w=fixture(),p={...payload([item('supplies'),item('fuel','sell')]),submarketId:'black'},q=quote(w,p);assert.equal(q.tariff,0);assert.equal(q.executable,false);assert.equal(q.unavailableReason,'BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED');
 const store=memory(t,w);unchanged(store,store.read(w.id),command(w,p),'UNSUPPORTED_MARKET_TRANSACTION');
});
test('SQLite outbox failure rolls back every basket line and receipt; retry and reopened authority settle once',t=>{
 let store,db,next;const dir=temp(t,()=>{db?.close();store?.close();next?.close();}),file=join(dir,'basket.sqlite'),w=fixture();
 store=new CampaignRepository(file,rules,{epoch:'qa'});store.create(w);const before=store.read(w.id),c=command(w);
 db=new DatabaseSync(file);db.exec("CREATE TRIGGER fail_basket BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'basket-failure'); END;");
 assert.throws(()=>store.execute(actor(),c),/basket-failure/);assert.deepEqual(store.read(w.id),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,0);
 db.exec('DROP TRIGGER fail_basket');const receipt=store.execute(actor(),c),after=store.read(w.id);
 next=new CampaignRepository(file,rules,{epoch:'replacement'});assert.deepEqual(next.execute(actor(),c),receipt);assert.deepEqual(next.read(w.id),after);assert.equal(next.eventsSince(w.id,0).length,1);
});
test('multi-line impact ledger uses per-commodity identities without breaking legacy receipts or player isolation',t=>{
 const w=fixture(),store=memory(t,w);store.execute(actor(),command(w));const facts=state(store.read(w.id)).tradeImpacts;
 let ledger=createOriginalMarketTradeLedger({atTick:0,ticksPerSecond:w.clock.ticksPerSecond,entries:[]});
 for(const fact of facts)ledger=ingestOriginalMarketTrade(ledger,fact);
 assert.equal(ledger.entries.length,2);assert.equal(originalMarketTradeQuantities(ledger,'supplies').plus,-10);assert.equal(originalMarketTradeQuantities(ledger,'heavy_machinery').plus,20);
 for(const fact of facts)assert.deepEqual(ingestOriginalMarketTrade(ledger,fact),ledger);
 assert.throws(()=>ingestOriginalMarketTrade(ledger,{...facts[0],quantity:5}),{code:'REQUEST_REUSED'});
 assert.throws(()=>ingestOriginalMarketTrade(ledger,{...facts[0],lineId:'fuel'}),{code:'UNSUPPORTED_TRADE_LEDGER'});
 const {lineId:_lineId,...legacy}=facts[0];assert.throws(()=>ingestOriginalMarketTrade(ledger,legacy),{code:'REQUEST_REUSED'});
 const old=ingestOriginalMarketTrade(createOriginalMarketTradeLedger({atTick:0,ticksPerSecond:60,entries:[]}),legacy);assert.deepEqual(ingestOriginalMarketTrade(old,legacy),old);assert.throws(()=>ingestOriginalMarketTrade(old,facts[0]),{code:'REQUEST_REUSED'});
 assert.equal(ingestOriginalMarketTrade(ledger,{...facts[0],playerId:'captain-b'}).entries.length,3);
 const advanced=advanceOriginalMarketTradeLedger(ledger,1).ledger;assert.deepEqual(ingestOriginalMarketTrade(advanced,facts[0]),advanced);
 const invalid=structuredClone(store.read(w.id));state(invalid).tradeImpacts.push(facts[0]);assert.throws(()=>validateOriginalMarketState(invalid,'port'),{code:'UNSUPPORTED_MARKET_STATE'});
 state(invalid).tradeImpacts.pop();state(invalid).tradeImpacts.push(legacy);assert.throws(()=>validateOriginalMarketState(invalid,'port'),{code:'UNSUPPORTED_MARKET_STATE'});
});

async function gateway(t,mutate=()=>{}) {
 const service=new CampaignService({filename:':memory:'});t.after(()=>service.close());const w=fixture();mutate(w);await service.create(w);const {epoch}=await service.ready();
 const host=await listenCampaignGateway({service,worldId:w.id,grants:[{playerId:'captain-a',token:'A'.repeat(43)},{playerId:'captain-b',token:'B'.repeat(43)}],port:0});t.after(()=>host.close());
 const post=async(path,body,who='captain-a')=>{const response=await fetch(host.origin+'/campaign-api/'+path,{method:'POST',headers:{Authorization:'Bearer '+(who==='captain-a'?'A':'B').repeat(43),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
 const request=(p=payload())=>({...p,worldId:w.id,epoch});return {service,w,epoch,post,request};
}
test('real Worker and authenticated HTTP carry complete basket quote/command/retry with read-only quote and private fields',async t=>{
 const {service,w,epoch,post,request}=await gateway(t),before=await service.read(w.id),q=await post('market-basket-quote',request());
 assert.equal(q.status,200);assert.equal(q.value.worldId,w.id);assert.equal(q.value.epoch,epoch);assert.equal(q.value.executable,true);assert.equal(q.value.admissionByPlayer,undefined);assert.equal(q.value.accounts,undefined);assert.deepEqual(await service.read(w.id),before);assert.deepEqual(await service.eventsSince(w.id,0),[]);
 const c={worldId:w.id,epoch,type:'market.trade-basket',requestId:'http-basket',payload:payload(),expected:q.value.expected};
 const receipt=await post('command',c);assert.equal(receipt.status,200);assert.deepEqual(await post('command',c),receipt);assert.equal((await service.read(w.id)).fleets[fid].cargo.supplies,110);assert.equal((await service.eventsSince(w.id,0)).length,1);
});
test('basket HTTP rejects foreign control, injected prices/principal, world/epoch mismatch and system publication',async t=>{
 const {service,w,epoch,post,request}=await gateway(t),before=await service.read(w.id);
 for(const [body,who,code]of [[request(),'captain-b','FORBIDDEN'],[{...request(),worldId:'other'},'captain-a','FORBIDDEN'],[{...request(),epoch:'old'},'captain-a','STALE_AUTHORITY'],[{...request(),principal:{kind:'system',id:'fake'}},'captain-a','UNSUPPORTED_MARKET_STATE'],[{...request(),gross:1},'captain-a','UNSUPPORTED_MARKET_STATE']])assert.equal((await post('market-basket-quote',body,who)).value.error.code,code);
 assert.equal((await post('command',{worldId:w.id,epoch,requestId:'bad',type:'market.publish-snapshot',payload:{},expected:[]})).value.error.code,'FORBIDDEN_COMMAND');assert.deepEqual(await service.read(w.id),before);
});
test('two real gateway clients cannot spend the same stock twice and stale quote never refreshes economic timestamps',async t=>{
 const {service,w,epoch,post,request}=await gateway(t,w=>{w.accounts['captain-a'].balance=1e6;w.accounts['captain-b'].balance=1e6;});
 const mixed=payload([item('fuel','buy',600),item('heavy_machinery','sell',100)]),mb=payload(mixed.items,'captain-b');
 const a=await post('market-basket-quote',request(mixed)),b=await post('market-basket-quote',request(mb),'captain-b');assert.equal(a.value.executable,true);
 const c=(p,q,id)=>({worldId:w.id,epoch,requestId:id,type:'market.trade-basket',payload:p,expected:q.expected});
 assert.equal((await post('command',c(mixed,a.value,'race-a'))).status,200);assert.equal((await post('command',c(mb,b.value,'race-b'),'captain-b')).value.error.code,'VERSION_CONFLICT');assert.equal((await post('market-basket-quote',request(mb),'captain-b')).value.error.code,'INSUFFICIENT_STOCK');
 await service.execute({kind:'system',id:'clock'},{worldId:w.id,epoch,requestId:'tick',type:'world.advance',payload:{fromTick:0,ticks:1},expected:[]});const before=await service.read(w.id);
 assert.equal((await post('market-basket-quote',request())).value.error.code,'MARKET_SNAPSHOT_STALE');assert.deepEqual(await service.read(w.id),before);assert.equal(state(before).asOfTick,0);
});

function method(source,signature){const start=source.indexOf(signature);assert.ok(start>=0);const brace=source.indexOf('{',start);let depth=0;for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error('Unclosed source method');}
test('extracted Java F.getTransactionValue matches 240 mixed/fractional/float-boundary basket vectors',t=>{
 const source=readFileSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/trade/F.java',import.meta.url),'utf8');
 const code=method(source,'public float getTransactionValue(boolean bl)'),dir=temp(t);
 const stubs=String.raw`
import java.util.*;
class CargoAPI { enum CargoItemType { RESOURCES } }
class CargoItemStack { float cost; CargoItemStack(float f){cost=f;} CargoAPI.CargoItemType getType(){return CargoAPI.CargoItemType.RESOURCES;} Object getData(){return "x";} float getSize(){return 1;} boolean isNull(){return false;} }
class CargoData { List<CargoItemStack> stacks=new ArrayList<>(); List<CargoItemStack> getStacks(){return stacks;} float getItemQuantity(CargoAPI.CargoItemType t,Object d){return 0;} }
class Picker { float getValue(){return 0;} }
class Sub { float tariff; float getTariff(){return tariff;} }
public class Oracle {
boolean \u00d3\u00d8\u00f8O00=false;
CargoItemStack \u00d5\u00f4\u00f8O00=null;
CargoData \u00f4\u00f4\u00f8O00=new CargoData(), cfr_renamed_745=new CargoData();
Picker \u00d2\u00f4\u00f8O00=null;
Object \u00d3\u00f4\u00f8O00=null, cfr_renamed_743=null, \u00f8\u00d8\u00f8O00=new Object();
Sub cfr_renamed_746=new Sub();
float computeSellCost(CargoItemStack s,float n){return s.cost;} float computeBuyCost(CargoItemStack s,float n){return s.cost;}
boolean o00000(CargoItemStack a,CargoItemStack b){return false;}
`;
 const main=String.raw`
public static void main(String[] args){Scanner scan=new Scanner(System.in);while(scan.hasNextLine()){String[] values=scan.nextLine().split(",");Oracle o=new Oracle();o.cfr_renamed_746.tariff=Float.parseFloat(values[0]);for(int i=1;i<values.length;i++){String[] pair=values[i].split(":");(pair[0].equals("buy")?o.\u00f4\u00f4\u00f8O00:o.cfr_renamed_745).stacks.add(new CargoItemStack(Float.parseFloat(pair[1])));}System.out.println((int)o.getTransactionValue(true)+","+(int)o.getTransactionValue(false));}}
}`;
 writeFileSync(join(dir,'Oracle.java'),stubs+code+main);
 const built=spawnSync('javac',['-encoding','UTF-8','-d',dir,join(dir,'Oracle.java')],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(built.status,0,built.stderr);
 const vectors=Array.from({length:240},(_,i)=>({rate:[0,0.0005,0.3,0.5,1][i%5],lines:Array.from({length:1+i%11},(_,j)=>({side:(i+j)%3?'buy':'sell',rawGross:Math.fround(i%13===0?300000+(i*73+j*211)%500000+(j%4)/4:i%8===0?0.125+(j+1)*0.5:i%7===0?(j+1)*0.1:(1+(i*123+j*67)%13000)+(j%4)/4)}))}));
 const output=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',timeout:30000,windowsHide:true,input:vectors.map(v=>[v.rate,...v.lines.map(l=>l.side+':'+l.rawGross)].join(',')).join('\n')+'\n'});assert.equal(output.status,0,output.stderr);
 const lines=output.stdout.trim().split(/\r?\n/);assert.equal(lines.length,vectors.length);
 vectors.forEach((v,i)=>{const q=originalMarketBasketTotals(v.lines,v.rate);assert.deepEqual([q.tariff,q.creditsDelta],lines[i].split(',').map(Number),'native basket '+i);});
});

// Reuse this existing gateway suite: browse is read-only and authenticated like quoting.
test('market visit -> reviewed basket -> receipt -> refreshed visit preserves privacy and inventory', async t => {
  const { service, w, epoch, post, request } = await gateway(t), before = await service.read(w.id);
  const body = { worldId: w.id, epoch, marketId: 'port', fleetId: fid };
  const visit = await post('market-visit', body);
  assert.equal(visit.status, 200); assert.deepEqual(visit.value.accounts.map(a => a.id), ['captain-a']);
  assert.equal(visit.value.admissionByPlayer, undefined); assert.equal(visit.value.tradeImpacts, undefined);
  assert.equal(visit.value.submarkets.find(s => s.plugin === 'open').inventory.supplies, 1000);
  assert.equal(visit.value.submarkets.find(s => s.plugin === 'black').unavailableReason, 'BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED');
  assert.deepEqual(await service.read(w.id), before);
  const view = await service.projectPlayer(w.id, 'captain-a');
  assert.equal(view.ports[0].anchorEntityId, 'station'); assert.equal(view.ports[0].inventory, undefined);
  const q = (await post('market-basket-quote', request())).value;
  for (const dep of q.expected) assert.ok(visit.value.expected.some(e => e.collection === dep.collection && e.id === dep.id && e.version === dep.version));
  const c = { worldId: w.id, epoch, requestId: 'visit-confirm', type: 'market.trade-basket', payload: payload(), expected: q.expected };
  const receipt = await post('command', c); assert.equal(receipt.status, 200); assert.deepEqual(await post('command', c), receipt);
  const refreshed = (await post('market-visit', body)).value;
  assert.equal(refreshed.submarkets.find(s => s.plugin === 'open').inventory.supplies, 990);
  assert.equal(refreshed.accounts[0].balance, visit.value.accounts[0].balance + q.creditsDelta);
  assert.equal(refreshed.fleetVersion, visit.value.fleetVersion + 1);
  for (const [input, who, code] of [[body, 'captain-b', 'FORBIDDEN'], [{ ...body, worldId: 'other' }, 'captain-a', 'FORBIDDEN'], [{ ...body, epoch: 'old' }, 'captain-a', 'STALE_AUTHORITY'], [{ ...body, principal: actor('captain-b') }, 'captain-a', 'UNSUPPORTED_MARKET_STATE']]) {
    assert.equal((await post('market-visit', input, who)).value.error.code, code);
  }
});
test('market visit refuses remote/stale economics and sneak never reveals open stock or foreign funds', async t => {
  const { browseOriginalMarket } = await import('../src/campaign/rules/OriginalMarket.mjs');
  const w = fixture(), input = { marketId: 'port', fleetId: fid };
  state(w).admissionByPlayer['captain-a'] = 'SNEAK';
  const visit = browseOriginalMarket(w, actor(), input);
  assert.deepEqual(visit.submarkets.map(s => s.plugin), ['black']); assert.equal(visit.accounts.length, 1);
  state(w).admissionByPlayer['captain-a'] = 'NONE'; assert.throws(() => browseOriginalMarket(w, actor(), input), { code: 'MARKET_ACCESS_DENIED' });
  state(w).admissionByPlayer['captain-a'] = 'OPEN'; w.fleets[fid].position = [100000, 0];
  assert.throws(() => browseOriginalMarket(w, actor(), input), { code: 'MARKET_OUT_OF_REACH' });
  w.fleets[fid].position = [0, 0]; const store = memory(t, w);
  store.execute({ kind: 'system', id: 'clock' }, { worldId: w.id, epoch: 'qa', requestId: 'browse-tick', type: 'world.advance', payload: { fromTick: 0, ticks: 1 }, expected: [] });
  assert.throws(() => browseOriginalMarket(store.read(w.id), actor(), input), { code: 'MARKET_SNAPSHOT_STALE' });
});
test('market client uses the same cargo gestures but nets buys and sells and cancels both sides without minting', async () => {
  const { createMarketTransfer, marketTransferItems, marketTransferPending, marketTransferMatches, cancelMarketTransfer } = await import('../src/campaign/client/MarketTransfer.mjs');
  const { clickCargoSlot, quickCargoTransfer, returnHeldCargo, cargoTransferRetained, cargoTransferItems } = await import('../src/campaign/client/CargoTransfer.mjs');
  const hold = { supplies: 100.125, heavy_machinery: 30 }, stock = { supplies: 1000, fuel: 80 };
  let state = createMarketTransfer(hold, stock); assert.equal(marketTransferPending(state), false);
  state = clickCargoSlot(state, 'discard', 1); assert.equal(state.held.stack.id, 'fuel'); assert.deepEqual(marketTransferItems(state), []);
  state = clickCargoSlot(state, 'hold', 2); assert.deepEqual(marketTransferItems(state), [item('fuel', 'buy', 80)]);
  state = quickCargoTransfer(state, 'hold', 1, 20);
  assert.deepEqual(marketTransferItems(state), [item('heavy_machinery', 'sell', 20), item('fuel', 'buy', 80)]);
  state = quickCargoTransfer(state, 'discard', 0, 10); assert.ok(marketTransferItems(state).some(i => i.commodityId === 'supplies' && i.quantity === 10));
  state = returnHeldCargo(clickCargoSlot(state, 'hold', 0));
  const cancelled = cancelMarketTransfer(state); assert.equal(marketTransferPending(cancelled), false);
  assert.deepEqual(cargoTransferRetained(cancelled), hold); assert.deepEqual(cargoTransferItems(cancelled), stock);
  assert.equal(marketTransferMatches(cancelled, hold, stock), true); assert.equal(marketTransferMatches(cancelled, hold, { ...stock, fuel: 79 }), false);
  const fractional = quickCargoTransfer(createMarketTransfer({}, { fuel: 1.5 }), 'discard', 0, 1.5);
  assert.equal(marketTransferItems(fractional), null);
});
