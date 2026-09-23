import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { quoteCargoPreview } from '../server/campaign/CargoPreview.mjs';
import { projectFleetLogistics } from '../server/campaign/FleetHudProjection.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { listenCampaignGateway } from '../server/campaign/HttpGateway.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { immutableJSON } from '../src/campaign/core/Values.mjs';
import { createCargoTransfer, clickCargoSlot, returnHeldCargo, cancelCargoTransfer, cargoTransferRetained } from '../src/campaign/client/CargoTransfer.mjs';
const rules = createReferenceRuleset(), fid = 'fleet-captain-a', mid = 'wolf-captain-a';
const make = () => structuredClone(createDevelopmentCampaign());
const request = (w, cargo = w.fleets[fid].cargo) => ({worldId:w.id,epoch:'test',fleetId:fid,fleetVersion:w.fleets[fid].version,
  memberVersions:w.fleets[fid].memberIds.map(id=>({id,version:w.members[id].version})),cargo});
const preview = (w, cargo) => quoteCargoPreview(w,'captain-a',request(w,cargo),rules);

test('native ordinary pickup, staging, holding from discard, and undo exclude cursor/discard from HUD',()=>{
  const w=make();w.fleets[fid].cargo={crew:15,fuel:20,heavy_machinery:16};
  const before=structuredClone(w), base=createCargoTransfer(w.fleets[fid].cargo);
  assert.equal(preview(w,cargoTransferRetained(base)).logistics.cargoSpaceUsed,16);
  const held=clickCargoSlot(base,'hold',2), staged=clickCargoSlot(held,'discard',0), heldAgain=clickCargoSlot(staged,'discard',0);
  for(const state of [held,staged,heldAgain]) assert.equal(preview(w,cargoTransferRetained(state)).logistics.cargoSpaceUsed,0);
  assert.equal(preview(w,cargoTransferRetained(returnHeldCargo(held))).logistics.cargoSpaceUsed,16);
  assert.equal(preview(w,cargoTransferRetained(cancelCargoTransfer(staged))).logistics.cargoSpaceUsed,16);
  assert.deepEqual(w,before);
});
test('native excess cargo/fuel/personnel charges use preview quantities, not a flat UI subtraction',()=>{
  for(const id of ['supplies','fuel','crew']) {
    const w=make();w.fleets[fid].cargo[id]=1000;
    const full=preview(w), reduced=preview(w,{...w.fleets[fid].cargo,[id]:15});
    assert.ok(full.logistics.suppliesPerDay>reduced.logistics.suppliesPerDay,id);
    assert.deepEqual(full.logistics,projectFleetLogistics(w,w.fleets[fid],rules).logistics);
  }
});
test('crew removal recomputes native recovery and does not mutate actual member condition',()=>{
  const w=make();w.members[mid].condition.combatReadiness=0.4;w.members[mid].condition.hullFraction=0.8;
  const before=structuredClone(w), full=preview(w), empty=preview(w,{...w.fleets[fid].cargo,crew:0});
  assert.ok(full.logistics.recoveryPerDay>empty.logistics.recoveryPerDay);
  assert.equal(empty.logistics.personnelUsed,0);assert.deepEqual(w,before);
});
test('unrelated world revision does not invalidate fleet/member-bound preview',()=>{
  const w=make(), input=request(w);w.revision+=10;
  assert.equal(quoteCargoPreview(w,'captain-a',input,rules).revision,w.revision);
});
test('replacement providers receive the same immutable shadow fleet through both arguments',()=>{
  const registry=new CampaignRuleRegistry(), w=make();let called=false;
  registry.register({id:'mod.stats',version:'1',service:'fleetStats',apiVersion:1,capabilities:[],methods:{resolve:(f,m,{world})=>{
    called=true;assert.equal(f,world.fleets[fid]);assert.equal(f.cargo.supplies,7);assert.equal(m[0],world.members[mid]);
    assert.ok(Object.isFrozen(f.cargo)&&Object.isFrozen(world)&&Object.isFrozen(world.members[mid].condition));
    assert.throws(()=>{world.members[mid].condition.hullFraction=0;},TypeError);
    assert.throws(()=>{world.fleets[fid].cargo.supplies=100;},TypeError);
    return {cargo:{spaceUsed:f.cargo.supplies*10,capacity:222,fuelCapacity:333,crew:4,marines:5,personnelCapacity:444}};
  }}});
  registry.register({id:'mod.logistics',version:'1',service:'logistics',apiVersion:1,capabilities:[],methods:{quote:i=>({totalSuppliesPerDay:i.cargo.spaceUsed+2,maintenancePerDay:6,recoveryPerDay:1,fuelPerLightYear:8})}});
  const custom=registry.compile({id:'mod.campaign',version:'1',providers:{fleetStats:'mod.stats',logistics:'mod.logistics'}});w.rules=custom.lock;w.extensions={};
  const before=structuredClone(w), p=quoteCargoPreview(w,'captain-a',request(w,{supplies:7}),custom);
  assert.ok(called);assert.equal(p.logistics.cargoSpaceUsed,70);assert.equal(p.logistics.suppliesPerDay,72);assert.equal(p.logistics.repairSuppliesPerDay,null);
  assert.deepEqual(w,before);assert.ok(Object.isFrozen(p.cargo));
});
test('missing/unsupported providers produce unavailable, never fabricated native values',()=>{
  const w=make();assert.equal(quoteCargoPreview(w,'captain-a',request(w),null).logisticsUnavailable,'RULES_UNAVAILABLE');
  w.members[mid].loadout.hullId='unknown-hull';assert.equal(preview(w).logistics,null);
  w.rules.version='wrong';assert.throws(()=>preview(w),{code:'RULESET_MISMATCH'});
});
for(const [name,mutate,code] of [
  ['foreign fleet',i=>{i.fleetId='fleet-captain-b';},'FORBIDDEN'],
  ['missing fleet',i=>{i.fleetId='missing';},'FORBIDDEN'],
  ['wrong world',i=>{i.worldId='other';},'FORBIDDEN'],
  ['player impersonation',i=>{i.playerId='captain-b';},'INVALID_REQUEST'],
  ['stale fleet',i=>{i.fleetVersion++;},'VERSION_CONFLICT'],
  ['stale member',i=>{i.memberVersions[0].version++;},'VERSION_CONFLICT'],
  ['missing roster',i=>{i.memberVersions=[];},'VERSION_CONFLICT'],
  ['foreign roster',i=>{i.memberVersions[0].id='wolf-captain-b';},'VERSION_CONFLICT'],
  ['invented item',i=>{i.cargo={metals:1};},'INVALID_CARGO'],
  ['extra quantity',i=>{i.cargo={fuel:21};},'INVALID_NUMBER'],
  ['negative',i=>{i.cargo={fuel:-1};},'INVALID_NUMBER'],
  ['infinite',i=>{i.cargo={fuel:Infinity};},'INVALID_NUMBER'],
  ['string',i=>{i.cargo={fuel:'10'};},'INVALID_NUMBER'],
  ['null cargo',i=>{i.cargo=null;},'INVALID_REQUEST'],
  ['array cargo',i=>{i.cargo=[];},'INVALID_REQUEST'],
  ['unsafe key',i=>{i.cargo=JSON.parse('{"__proto__":1}');},'INVALID_ID'],
]) test('rejects '+name+' without modifying the world',()=>{
  const w=immutableJSON(make()), i=structuredClone(request(w)), before=JSON.stringify(w);mutate(i);
  assert.throws(()=>quoteCargoPreview(w,'captain-a',i,rules),{code});assert.equal(JSON.stringify(w),before);
});
test('explicit control, not ownership, authorizes previews; NPC and nonmembers are rejected',()=>{
  const w=make();w.fleets[fid].control={kind:'npc',id:'npc'};assert.throws(()=>preview(w),{code:'FORBIDDEN'});
  assert.throws(()=>quoteCargoPreview(make(),'stranger',request(make()),rules),{code:'FORBIDDEN'});
});
test('duplicate member expectations cannot substitute for the whole roster',()=>{
  const w=make();w.fleets[fid].memberIds.push('wolf-captain-b');const i=request(w);i.memberVersions[1]=i.memberVersions[0];
  assert.throws(()=>quoteCargoPreview(w,'captain-a',i,rules),{code:'VERSION_CONFLICT'});
});
test('real worker and authenticated HTTP preview have no world, event or command side effects',async t=>{
  const service=new CampaignService({filename:':memory:'});t.after(()=>service.close());const w=make();await service.create(w);
  const gateway=await listenCampaignGateway({service,worldId:w.id,port:0,grants:[{playerId:'captain-a',token:'A'.repeat(43)},{playerId:'captain-b',token:'B'.repeat(43)}]});
  t.after(()=>gateway.close());const epoch=(await service.ready()).epoch,input={...request(w,{crew:0,fuel:0,supplies:0}),epoch};
  const send=async(i=input,who='A')=>{const r=await fetch(gateway.origin+'/campaign-api/cargo-preview',{method:'POST',headers:{Authorization:'Bearer '+who.repeat(43),'Content-Type':'application/json'},body:JSON.stringify(i)});return {status:r.status,body:await r.json()};};
  const before=await service.read(w.id), events=await service.eventsSince(w.id,0);
  const p=await send();assert.equal(p.status,200);assert.equal(p.body.epoch,epoch);assert.equal(p.body.logistics.cargoSpaceUsed,0);assert.equal(p.body.requestId,undefined);
  assert.deepEqual(await send(),p);assert.equal((await send(input,'B')).status,403);assert.equal((await send(input,'C')).status,401);
  assert.equal((await send({...input,epoch:'old'})).body.error.code,'STALE_AUTHORITY');
  assert.equal((await send({...input,fleetVersion:1})).body.error.code,'VERSION_CONFLICT');
  assert.deepEqual(await service.read(w.id),before);assert.deepEqual(await service.eventsSince(w.id,0),events);
  // Preview never reserved an idempotency receipt or consumed a mutation version.
  const command={worldId:w.id,epoch,requestId:'after-preview',type:'cargo.jettison',payload:{fleetId:fid,items:{fuel:2}},expected:[{collection:'fleets',id:fid,version:0},{collection:'members',id:mid,version:0}]};
  const receipt=await service.execute({kind:'player',id:'captain-a'},command);assert.equal(receipt.revision,1);
  assert.deepEqual(await service.execute({kind:'player',id:'captain-a'},command),receipt);
});
