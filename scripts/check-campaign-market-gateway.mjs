/** Explicit resolved test port, never installed as a playable original market. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDevelopmentCampaign} from '../server/campaign/DevelopmentWorld.mjs';
import {CampaignService} from '../server/campaign/CampaignService.mjs';
import {listenCampaignGateway} from '../server/campaign/HttpGateway.mjs';
import {originalMarketStateId,ORIGINAL_MARKET_REFERENCE} from '../src/campaign/rules/OriginalMarket.mjs';
const worldId='development-sector',bonus=()=>({flat:0,percent:0,mult:1}),threshold=()=>({highThreshold:-1,highMult:1,lowThreshold:-1,lowMult:1});
function fixture(){
  const w=structuredClone(createDevelopmentCampaign());w.factions.merchant={id:'merchant',version:0,name:'Test-only merchant',playerRoles:{}};
  w.markets.port={id:'port',version:0,owner:{kind:'faction',id:'merchant'},locationId:'system'};w.spaceEntities.station={id:'station',version:0,name:'Test-only port anchor',locationId:'system',position:[0,0],radius:50,tags:[]};
  for(const id of ['captain-a','captain-b'])w.accounts[id]={id,version:0,owner:{kind:'player',id},currency:'credits',balance:10000};
  const commodity={stockpile:1000,demandValue:750,greed:250,utilityOnMarket:ORIGINAL_MARKET_REFERENCE.commodities.supplies.utility,availableWithoutTrade:5,tradeMod:{both:0,plus:0,minus:0},supplyPrice:threshold(),demandPrice:threshold(),playerSupplyModsByPlayer:{'captain-a':bonus(),'captain-b':bonus()},playerDemandModsByPlayer:{'captain-a':bonus(),'captain-b':bonus()}};
  const id=originalMarketStateId('port');w.extensions[id]={id,version:0,schemaVersion:1,data:{marketId:'port',anchorEntityId:'station',asOfTick:0,coverage:'resolved-native-trade-v1',tariffRate:.3,admissionByPlayer:{'captain-a':'OPEN','captain-b':'OPEN'},illegalCommodityIds:[],commodityOrder:['supplies'],commodities:{supplies:commodity},marketSupplyMod:bonus(),marketDemandMod:bonus(),submarkets:{open:{plugin:'open',inventory:{supplies:5}}},tradeImpacts:[]}};return w;
}
const input=(who='captain-a',quantity=2,side='buy')=>({marketId:'port',submarketId:'open',fleetId:'fleet-'+who,accountId:who,commodityId:'supplies',quantity,side});
async function setup(t){const service=new CampaignService({filename:':memory:'});await service.create(fixture());const grants=['captain-a','captain-b'].map((playerId,i)=>({playerId,token:(i?'B':'A').repeat(43)}));const gateway=await listenCampaignGateway({service,worldId,grants,port:0});t.after(async()=>{await gateway.close();await service.close();});
  const api=async(who,path,body)=>{const r=await fetch(gateway.origin+'/campaign-api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+(who==='captain-a'?'A':'B').repeat(43),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,value:await r.json()};};
  const command=async(i,q)=>{const {side,...payload}=i;return {worldId,epoch:(await service.ready()).epoch,requestId:randomUUID(),type:'market.'+side,payload,expected:q.expected};};return {api,service,command};
}
test('authenticated HTTP quote -> atomic buy -> replay -> fresh sell uses pinned worker market rules',async t=>{
  const {api,service,command}=await setup(t),i=input(),q=await api('captain-a','market-quote',i);assert.equal(q.status,200);assert.equal(q.value.executable,true);assert.ok(q.value.expected.length>0);assert.equal(q.value.admissionByPlayer,undefined);
  const c=await command(i,q.value),receipt=await api('captain-a','command',c);assert.equal(receipt.status,200);assert.deepEqual(await api('captain-a','command',c),receipt);
  const w=await service.read(worldId);assert.equal(w.fleets['fleet-captain-a'].cargo.supplies,32);assert.equal(w.extensions[originalMarketStateId('port')].data.submarkets.open.inventory.supplies,3);assert.ok(w.accounts['captain-a'].balance<10000);assert.equal(w.accounts['captain-b'].balance,10000);
  const sell=input('captain-a',1,'sell'),sq=await api('captain-a','market-quote',sell);assert.equal((await api('captain-a','command',await command(sell,sq.value))).status,200);
  const projected=(await api('captain-a','session')).value.view;assert.equal(projected.fleets[0].private.logistics.cargoSpaceUsed,31);assert.equal(projected.extensions,undefined);assert.equal(projected.accounts,undefined);
});
test('public quote cannot choose principal, use foreign assets, or publish authoritative economics',async t=>{
  const {api,service,command}=await setup(t),before=await service.read(worldId);
  assert.equal((await api('captain-b','market-quote',input())).value.error.code,'FORBIDDEN');assert.notEqual((await api('captain-a','market-quote',{...input(),principal:{kind:'system',id:'admin'}})).status,200);
  assert.notEqual((await api('captain-a','market-quote',{...input(),quantity:Infinity})).status,200);assert.equal((await api('captain-a','market-quote')).status,404);
  const c=await command(input(),{expected:[]});c.type='market.publish-snapshot';c.payload={};assert.equal((await api('captain-a','command',c)).value.error.code,'FORBIDDEN_COMMAND');assert.deepEqual(await service.read(worldId),before);
});
test('two gateway clients cannot oversell shared retail inventory using concurrent stale quotes',async t=>{
  const {api,service,command}=await setup(t),a=input('captain-a',4),b=input('captain-b',4),qa=await api('captain-a','market-quote',a),qb=await api('captain-b','market-quote',b);
  const [ca,cb]=await Promise.all([command(a,qa.value),command(b,qb.value)]);assert.equal((await api('captain-a','command',ca)).status,200);assert.equal((await api('captain-b','command',cb)).value.error.code,'VERSION_CONFLICT');assert.equal((await api('captain-b','market-quote',b)).value.error.code,'INSUFFICIENT_STOCK');assert.equal((await service.read(worldId)).extensions[originalMarketStateId('port')].data.submarkets.open.inventory.supplies,1);
});
test('advancing time does not silently relabel stale economic inputs as current snapshots',async t=>{
  const {api,service}=await setup(t),ready=await service.ready();await service.execute({kind:'system',id:'test-clock'},{worldId,epoch:ready.epoch,requestId:'tick',type:'world.advance',payload:{fromTick:0,ticks:1},expected:[]});
  const before=await service.read(worldId),q=await api('captain-a','market-quote',input());assert.equal(q.value.error.code,'MARKET_SNAPSHOT_STALE');assert.deepEqual(await service.read(worldId),before);assert.equal(before.extensions[originalMarketStateId('port')].data.asOfTick,0);
});
