import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { quoteOriginalQuickTransfer, originalCargoGesturesProvider } from '../src/campaign/rules/OriginalCargoGestures.mjs';
import { createCargoTransfer, quickCargoTransfer, cargoTransferRetained, cargoTransferItems, clickCargoSlot } from '../src/campaign/client/CargoTransfer.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { quoteCargoPreview } from '../server/campaign/CargoPreview.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { immutableJSON } from '../src/campaign/core/Values.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { listenCampaignGateway } from '../server/campaign/HttpGateway.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
const rules=createReferenceRuleset(), fid='fleet-captain-a';
const make=()=>structuredClone(createDevelopmentCampaign());
const input=(w,cargo,quickTransfer)=>({worldId:w.id,epoch:'test',fleetId:fid,fleetVersion:w.fleets[fid].version,
  memberVersions:w.fleets[fid].memberIds.map(id=>({id,version:w.members[id].version})),cargo,quickTransfer});
const free=(id,side,quantity,changes={})=>quoteOriginalQuickTransfer({members:{}},{memberIds:[],control:{kind:'player',id:'a'}},{id,side,quantity},()=>({cargo:{capacity:100,spaceUsed:0,crew:0,marines:0,personnelCapacity:140,fuel:0,fuelCapacity:100,...changes}}));
test('native observed crew 149/140: excess first, whole second, incoming fills then overloads',()=>{
 assert.equal(free('crew','hold',149,{crew:149}),9);
 assert.equal(free('crew','hold',140,{crew:140}),140);
 assert.equal(free('crew','discard',149),140);
 assert.equal(free('crew','discard',9,{crew:140}),9);
 assert.equal(free('marines','hold',20,{crew:135,marines:20}),15);
});
test('fuel uses int free space, ordinary goods round negative space down; tiny remainder moves whole',()=>{
 assert.equal(free('fuel','hold',100.2,{fuel:100.2}),100.2);
 assert.equal(free('fuel','discard',100.8),100.8);
 assert.equal(free('fuel','discard',110.8,{fuel:0.2}),99);
 assert.equal(free('supplies','hold',20,{spaceUsed:100.2}),1);
 assert.equal(free('supplies','hold',1.2,{spaceUsed:100.2}),1.2);
 assert.equal(free('heavy_machinery','discard',150,{spaceUsed:9.2}),90);
 assert.equal(free('supplies','discard',20,{spaceUsed:120}),20);
 assert.equal(free('supplies','hold',20,{spaceUsed:80}),20);
});
test('unsupported/meta cargo, fractional personnel and malformed stats are not guessed',()=>{
 for(const id of ['missing','credits','ship_weapons'])assert.throws(()=>free(id,'hold',1),{code:'UNSUPPORTED_CARGO'});
 assert.throws(()=>free('crew','hold',1.1),{code:'INVALID_CARGO_QUANTITY'});
 assert.throws(()=>free('supplies','hold',1,{capacity:NaN}),{code:'STATS_UNAVAILABLE'});
});
test('Ctrl source guard matches native source branches, not a Java executable probe',t=>{
 const p=new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/trade/F.java',import.meta.url);
 if(!existsSync(p)){t.skip('optional local decompile');return;}
 const s=readFileSync(p,'utf8').slice(readFileSync(p,'utf8').indexOf('if (bl && W.'));
 for(const text of ['getFreeCrewSpace()', 'getFreeFuelSpace()', 'Math.floor(f3)', 'if (f3 > 0.0f)', '&& f3 < 0.0f', 'getSize() - f2 < 1.0f'])assert.ok(s.includes(text),text);
});
test('pure transfer applies quoted portion and merges first match or first empty without cursor',()=>{
 let s=immutableJSON(createCargoTransfer({crew:149,fuel:20}));const before=structuredClone(s);
 s=quickCargoTransfer(s,'hold',0,9);assert.deepEqual(cargoTransferRetained(s),{crew:140,fuel:20});assert.deepEqual(cargoTransferItems(s),{crew:9});assert.equal(s.held,null);
 s=quickCargoTransfer(immutableJSON(s),'hold',0,140);assert.equal(s.discard[0].quantity,149);assert.equal(s.hold[0],null);
 s=quickCargoTransfer(immutableJSON(s),'discard',0,140);assert.equal(s.hold[0].quantity,140);assert.equal(s.discard[0].quantity,9);
 assert.deepEqual(before,createCargoTransfer({crew:149,fuel:20}));
});
test('atomic limits, bad quantities, held cursor and precision guards preserve exact state',()=>{
 const s=immutableJSON(createCargoTransfer({supplies:1e20,fuel:20}));
 for(const q of [0,-1,Infinity,NaN,1,1e21])assert.equal(quickCargoTransfer(s,'hold',0,q),s);
 assert.equal(quickCargoTransfer(s,'invalid',0,20),s);
 assert.equal(quickCargoTransfer(s,'hold',4096,20),s);
 const held=clickCargoSlot(s,'hold',1);assert.equal(quickCargoTransfer(held,'hold',0,100),held);
 const full={...s,discard:Array.from({length:64},(_,i)=>({id:'id'+i,quantity:1}))};assert.equal(quickCargoTransfer(full,'hold',1,20),full);
 const slots={...s,hold:Array.from({length:4096},()=>({id:'supplies',quantity:1})),discard:[{id:'fuel',quantity:2}]};assert.equal(quickCargoTransfer(slots,'discard',0,1),slots);
 const precision={...s,hold:[{id:'fuel',quantity:1}],discard:[{id:'fuel',quantity:1e20}]};assert.equal(quickCargoTransfer(precision,'hold',0,1),precision);
});
test('6000 frozen random shortcuts conserve total exactly for integer cargo',()=>{
 let state=createCargoTransfer({crew:149,fuel:200,supplies:300}),seed=9321;
 const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<6000;i++){
  const side=random(2)?'hold':'discard',index=random(5),stack=state[side][index];
  state=quickCargoTransfer(immutableJSON(state),side,index,stack?random(stack.quantity+1):1);
  const all={...cargoTransferRetained(state)};for(const [id,n]of Object.entries(cargoTransferItems(state)))all[id]=(all[id]??0)+n;
  assert.deepEqual(all,{crew:149,fuel:200,supplies:300});assert.equal(state.held,null);
 }
});
test('authoritative query uses retained capacities and is immutable, not a mutation',()=>{
 const w=make();w.fleets[fid].cargo={crew:35,fuel:40,supplies:70};const before=structuredClone(w);
 const q=quoteCargoPreview(w,'captain-a',input(w,{crew:35,fuel:40,supplies:70},{side:'hold',id:'crew',quantity:35}),rules);
 assert.equal(q.quickTransfer.amount,5); // one Wolf has 30 personnel capacity
 const inward=quoteCargoPreview(w,'captain-a',input(w,{crew:0,fuel:40,supplies:70},{side:'discard',id:'crew',quantity:35}),rules);
 assert.equal(inward.quickTransfer.amount,30);assert.deepEqual(w,before);assert.ok(Object.isFrozen(q.quickTransfer));
});
for(const [name,mutate]of [
 ['excess source',i=>i.quickTransfer.quantity=36],['empty hold',i=>i.cargo={}],['invented discard',i=>i.quickTransfer.side='discard'],
 ['negative',i=>i.quickTransfer.quantity=-1],['zero',i=>i.quickTransfer.quantity=0],['unknown ID',i=>i.quickTransfer.id='missing'],
 ['extra field',i=>i.quickTransfer.amount=500],['null',i=>i.quickTransfer=null],['wrong side',i=>i.quickTransfer.side='market'],
 ['stale member',i=>i.memberVersions[0].version++],['stale fleet',i=>i.fleetVersion++],
])test('read-only shortcut rejects '+name,()=>{
 const source=make();source.fleets[fid].cargo.crew=35;const w=immutableJSON(source);const i=input(w,{...w.fleets[fid].cargo},{side:'hold',id:'crew',quantity:35});mutate(i);
 assert.throws(()=>quoteCargoPreview(w,'captain-a',i,rules));
});
test('replacement gesture provider runs on immutable shadow world; absent provider does not default to native',()=>{
 let called=false;const registry=new CampaignRuleRegistry();
 registry.register({id:'mod.stats',version:'1',service:'fleetStats',apiVersion:1,capabilities:['effective-logistics-stats'],methods:{resolve:()=>({cargo:{}})}});
 registry.register({...originalCargoGesturesProvider,id:'mod.gestures',methods:{quoteQuickTransfer:(w,f,q)=>{called=true;assert.equal(w.fleets[f.id],f);assert.equal(f.cargo.crew,10);assert.ok(Object.isFrozen(w)&&Object.isFrozen(q));return 3;}}});
 const mod=registry.compile({id:'mod.rules',version:'1',providers:{fleetStats:'mod.stats',cargoGestures:'mod.gestures'}}),w=make();w.rules=mod.lock;
 assert.equal(quoteCargoPreview(w,'captain-a',input(w,{crew:10},{side:'hold',id:'crew',quantity:10}),mod).quickTransfer.amount,3);assert.ok(called);
 const absent=registry.compile({id:'mod.rules',version:'1',providers:{fleetStats:'mod.stats'}});w.rules=absent.lock;
 assert.throws(()=>quoteCargoPreview(w,'captain-a',input(w,{crew:10},{side:'hold',id:'crew',quantity:10}),absent),{code:'RULES_UNAVAILABLE'});
});
test('actual Worker HTTP shortcut is authenticated, versioned and leaves events/receipts/inventory untouched',async t=>{
 const service=new CampaignService({filename:':memory:'});t.after(()=>service.close());const w=make();await service.create(w);
 const gate=await listenCampaignGateway({service,worldId:w.id,port:0,grants:[{playerId:'captain-a',token:'A'.repeat(43)},{playerId:'captain-b',token:'B'.repeat(43)}]});t.after(()=>gate.close());
 const before=await service.read(w.id),events=await service.eventsSince(w.id,0),epoch=(await service.ready()).epoch;
 const body={...input(w,{...w.fleets[fid].cargo},{side:'hold',id:'fuel',quantity:20}),epoch};
 const send=async(token,data=body)=>fetch(gate.origin+'/campaign-api/cargo-preview',{method:'POST',headers:{Authorization:'Bearer '+token.repeat(43),'Content-Type':'application/json'},body:JSON.stringify(data)});
 const response=await send('A');assert.equal(response.status,200);const q=await response.json();assert.equal(q.quickTransfer.amount,20);assert.equal(q.requestId,undefined);
 assert.equal((await send('B')).status,403);assert.equal((await send('A',{...body,epoch:'wrong'})).status,409);
 assert.deepEqual(await service.read(w.id),before);assert.deepEqual(await service.eventsSince(w.id,0),events);
});

test('client validates full quote context and amount, including aborted requests',async()=>{
 const {queryCargoQuickTransfer}=await import('../src/campaign/client/CargoQuickTransfer.ts');
 const session={epoch:'e',view:{worldId:'w'}},fleet={id:'f',version:1,canCommand:true,private:{members:[{id:'m',version:2}]}};
 const quick={id:'crew',side:'hold',quantity:35},cargo={crew:35},signal=new AbortController().signal;
 const valid=req=>({...req,revision:0,logistics:null,logisticsUnavailable:null,quickTransfer:{...req.quickTransfer,amount:5}});
 assert.equal(await queryCargoQuickTransfer(session,fleet,cargo,quick,async req=>valid(req),signal),5);
 for(const mutate of [q=>q.epoch='other',q=>q.fleetId='other',q=>q.fleetVersion++,q=>q.memberVersions=[],q=>q.cargo={crew:34},
  q=>q.quickTransfer.side='discard',q=>q.quickTransfer.id='fuel',q=>q.quickTransfer.quantity=34,q=>q.quickTransfer.amount=-1,q=>q.quickTransfer.amount=36,
  q=>q.quickTransfer.amount=NaN,q=>delete q.quickTransfer]) {
  await assert.rejects(queryCargoQuickTransfer(session,fleet,cargo,quick,async req=>{const q=structuredClone(valid(req));mutate(q);return q;},signal));
 }
 const controller=new AbortController();controller.abort();
 await assert.rejects(queryCargoQuickTransfer(session,fleet,cargo,quick,async req=>valid(req),controller.signal));
 await assert.rejects(queryCargoQuickTransfer(session,{...fleet,canCommand:false},cargo,quick,async req=>valid(req),signal));
});
