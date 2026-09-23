import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { canonicalJSON, jsonCopy } from '../src/campaign/core/Values.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { quoteOriginalLogistics, originalLogisticsProvider } from '../src/campaign/rules/OriginalLogistics.mjs';
import { cooperationProvider } from '../src/campaign/rules/Cooperation.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
const rules=createReferenceRuleset();
function fixture(){
  const w=structuredClone(createCampaignWorld({id:'world-a',rules:rules.lock,contentFingerprint:'fixture-content-v1'}));
  w.locations.port={id:'port',version:0,name:'Fixture rendezvous', navigation: { space: 'normal', terrain: [] } };
  for(const [i,id]of ['a','b','c'].entries()){
    w.players[id]={id,version:0,name:id,factionId:null};
    w.fleets[id]={id,version:0,name:id,owner:{kind:'player',id},control:{kind:'player',id},locationId:'port',position:[i*10,0],memberIds:[id],partyId:null,encounterId:null,cargo:{supplies:100+10*i,fuel:40}};
    w.members[id]={id,version:0,fleetId:id,owner:{kind:'player',id},loadout:{hullId:'wolf'},condition:{status:'ready',hullFraction:0.6,combatReadiness:0.5,armor:null,ammunition:{}}};
    w.accounts[id]={id,version:0,owner:{kind:'player',id},currency:'credits',balance:1000*(i+1)};
  }
  return validateCampaignWorld(w);
}
const actor=id=>({kind:'player',id});
const expected=(w,entries)=>entries.map(([collection,id])=>({collection,id,version:w[collection][id].version}));
function command(store,type,requestId,payload,entries){const w=store.read('world-a');return {worldId:w.id,epoch:store.epoch,type,requestId,payload,expected:expected(w,entries)};}
function memory(t){const store=new CampaignRepository(':memory:',rules);t.after(()=>store.close());store.create(fixture());return store;}
function joinParty(store){
  const invitation=store.execute(actor('a'),command(store,'party.invite','invite-1',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']])).result.invitationId;
  return store.execute(actor('b'),command(store,'party.accept','accept-1',{invitationId:invitation},[['invitations',invitation],['fleets','a'],['fleets','b']]));
}
function temp(t){const directory=mkdtempSync(join(tmpdir(),'starsector-campaign-'));const filename=join(directory,'world.sqlite');t.after(()=>{
  // Only these exact test-created files; no recursive deletion or user save discovery.
  for(const suffix of ['','-wal','-shm'])if(existsSync(filename+suffix))unlinkSync(filename+suffix);rmdirSync(directory);
});return filename;}
const member=(overrides={})=>({mothballed:false,suspendRepairs:false,needsRepairs:false,suppliesPerMonth:5,fighterCount:null,
  cr:0.7,maxCR:0.7,recoveryPerDay:0.1,baseRecoveryPercentPerDay:10,deployCR:0.2,baseDeployCR:0.2,deploymentSupplies:5,fuelPerLightYear:1,...overrides});
const logistics=(members=[member()],cargo={})=>({members,cargo:{spaceUsed:0,capacity:50,fuel:0,fuelCapacity:20,crew:15,marines:0,personnelCapacity:30,...cargo},fuelUseHyperMult:1});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('JSON boundary rejects cycles, nonfinite, unsupported values and unsafe keys',()=>{
  for(const value of [NaN,Infinity,undefined,new Map(),{a:undefined},JSON.parse('{"__proto__":{}}')])assert.throws(()=>jsonCopy(value));
  const cycle={};cycle.self=cycle;assert.throws(()=>jsonCopy(cycle));assert.equal(canonicalJSON({b:2,a:1}),'{"a":1,"b":2}');
});
test('world is deeply immutable and requires coherent identities',()=>{
  const w=fixture();assert.ok(Object.isFrozen(w.fleets.a.cargo));assert.throws(()=>{w.fleets.a.cargo.fuel=0;});
  const bad=structuredClone(w);bad.members.a.fleetId='b';assert.throws(()=>validateCampaignWorld(bad),{code:'BROKEN_REFERENCE'});
  assert.throws(()=>validateCampaignWorld({...w,schemaVersion:2}),{code:'SAVE_VERSION'});
});
test('rule registration rejects silent overrides and capability mismatches',()=>{
  const registry=new CampaignRuleRegistry().register(originalLogisticsProvider);assert.throws(()=>registry.register(originalLogisticsProvider),{code:'DUPLICATE_PROVIDER'});
  registry.register({id:'test.consumer',version:'1',apiVersion:1,service:'consumer',capabilities:[],requires:{logistics:['not-implemented']}});
  assert.throws(()=>registry.compile({id:'test',version:'1',providers:{logistics:'reference.logistics',consumer:'test.consumer'}}),{code:'RULE_CAPABILITY'});
});
test('whole provider can change without kernel edits, but old world rejects the new lock',t=>{
  const replacement={id:'overhaul.logistics',version:'1',apiVersion:1,service:'logistics',capabilities:['effective-stat-quote'],methods:{quote:()=>({newModel:true})}};
  const custom=new CampaignRuleRegistry().register(replacement).register(cooperationProvider).compile({id:'custom',version:'1',providers:{logistics:replacement.id,cooperation:cooperationProvider.id},settings:rules.lock.settings});
  assert.deepEqual(custom.services.logistics.quote({}),{newModel:true});
  const store=new CampaignRepository(':memory:',custom);t.after(()=>store.close());assert.throws(()=>store.create(fixture()),{code:'RULESET_MISMATCH'});
});
test('native base maintenance divides monthly effective supplies by 30; fuel includes all members',()=>{
  const q=quoteOriginalLogistics(logistics([member(),member({mothballed:true,suppliesPerMonth:0,fuelPerLightYear:2})]));
  near(q.maintenancePerDay,5/30);near(q.totalSuppliesPerDay,5/30);assert.equal(q.fuelPerLightYear,3);
});
test('native CR recovery is deployment supplies * fraction/day / deployment fraction',()=>{
  const q=quoteOriginalLogistics(logistics([member({cr:0.5})]));near(q.recoveryPerDay,2.5);near(q.totalSuppliesPerDay,5/30+2.5);
});
test('hull-only repairs use unmodified base CR rate/deploy cost and recovery denominator clamps',()=>{
  near(quoteOriginalLogistics(logistics([member({needsRepairs:true,recoveryPerDay:0.2,deployCR:0.1})])).recoveryPerDay,2.5);
  near(quoteOriginalLogistics(logistics([member({cr:0.5,deployCR:0})])).recoveryPerDay,50);
});
test('suspended/zero-rate/mothballed ships do not add recovery cost',()=>{
  for(const overrides of [{suspendRepairs:true},{recoveryPerDay:0},{mothballed:true}])assert.equal(quoteOriginalLogistics(logistics([member({cr:0.1,...overrides})])).recoveryPerDay,0);
});
test('each overload category caps independently; fleet-count penalty excludes recovery and mothballed maintenance',()=>{
  const q=quoteOriginalLogistics(logistics([...Array.from({length:30},()=>member({cr:0.5})),member({mothballed:true,suppliesPerMonth:0})],{spaceUsed:10000,fuel:10000,crew:10000}));
  assert.equal(q.excessCargoPerDay,50);assert.equal(q.excessFuelPerDay,50);assert.equal(q.excessPersonnelPerDay,50);
  near(q.excessShipsPerDay,1);near(q.recoveryPerDay,75);
});
test('invalid effective stats cannot generate nonfinite resource quotes',()=>{
  assert.throws(()=>quoteOriginalLogistics(logistics([member({suppliesPerMonth:NaN})])));
  assert.throws(()=>quoteOriginalLogistics(logistics([member({fuelPerLightYear:Number.MAX_VALUE}),member({fuelPerLightYear:Number.MAX_VALUE})])));
});
test('party invitation and consensual join preserve private fleet assets',t=>{
  const s=memory(t),before=s.read('world-a');const receipt=joinParty(s);const after=s.read('world-a');
  assert.equal(after.parties[receipt.result.partyId].fleetIds.length,2);
  for(const id of ['a','b','c']){assert.deepEqual(after.fleets[id].cargo,before.fleets[id].cargo);assert.deepEqual(after.fleets[id].owner,before.fleets[id].owner);assert.deepEqual(after.members[id],before.members[id]);assert.deepEqual(after.accounts[id],before.accounts[id]);}
  assert.equal(after.revision,2);assert.equal(s.eventsSince(after.id,0).length,2);
});
test('one player cannot issue orders for another fleet or accept another player invitation',t=>{
  const s=memory(t);assert.throws(()=>s.execute(actor('b'),command(s,'party.invite','bad',{fromFleetId:'a',toFleetId:'c'},[['fleets','a']])),{code:'FORBIDDEN'});
  const i=s.execute(actor('a'),command(s,'party.invite','good',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']])).result.invitationId;
  assert.throws(()=>s.execute(actor('c'),command(s,'party.accept','bad2',{invitationId:i},[['invitations',i],['fleets','a'],['fleets','b']])),{code:'FORBIDDEN'});
  assert.equal(s.read('world-a').revision,1);
});
test('idempotent receipt survives stale versions and authority epoch; changed payload is rejected',t=>{
  const s=memory(t),c=command(s,'party.invite','same',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']]);
  const receipt=s.execute(actor('a'),c);assert.deepEqual(s.execute(actor('a'),{...c,epoch:'older-process'}),receipt);
  assert.throws(()=>s.execute(actor('a'),{...c,payload:{...c.payload,toFleetId:'c'}}),{code:'REQUEST_REUSED'});
  assert.throws(()=>s.execute(actor('a'),{...c,requestId:'new',epoch:'older-process'}),{code:'STALE_AUTHORITY'});
  assert.equal(s.read('world-a').revision,1);
});
test('version requirements prevent stale edits, and future actors cannot read receipts',t=>{
  const s=memory(t);assert.throws(()=>s.execute(actor('a'),command(s,'party.invite','bad',{fromFleetId:'a',toFleetId:'b'},[])),{code:'VERSION_REQUIRED'});
  const c=command(s,'party.invite','good',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']]);c.expected[0].version=99;
  assert.throws(()=>s.execute(actor('a'),c),{code:'VERSION_CONFLICT'});assert.throws(()=>s.execute(actor('outsider'),c),{code:'AUTH_REQUIRED'});
});
test('leaving a two-fleet party dissolves it without deleting either fleet',t=>{
  const s=memory(t),p=joinParty(s).result.partyId;
  s.execute(actor('b'),command(s,'party.leave','leave',{fleetId:'b'},[['fleets','b'],['parties',p]]));
  const w=s.read('world-a');assert.equal(Object.keys(w.parties).length,0);assert.equal(w.fleets.a.partyId,null);assert.equal(w.fleets.b.partyId,null);assert.equal(Object.keys(w.members).length,3);
});
test('distance and encounter locks cannot be bypassed through a party invitation',t=>{
  const w=structuredClone(fixture());w.fleets.b.position=[1000,0];
  const s=new CampaignRepository(':memory:',rules);t.after(()=>s.close());s.create(w);
  const i=s.execute(actor('a'),command(s,'party.invite','invite',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']])).result.invitationId;
  assert.throws(()=>s.execute(actor('b'),command(s,'party.accept','join',{invitationId:i},[['invitations',i],['fleets','a'],['fleets','b']])),{code:'TOO_FAR'});
  const locked=structuredClone(fixture());locked.encounters.e={id:'e',version:0,battleAttempt:1,status:'running',fleetIds:['a']};locked.fleets.a.encounterId='e';
  const other=new CampaignRepository(':memory:',rules);t.after(()=>other.close());other.create(locked);
  assert.throws(()=>other.execute(actor('a'),command(other,'party.invite','blocked',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']])),{code:'ASSET_LOCKED'});
});
test('real SQLite transaction rolls back world/outbox when receipt write fails',t=>{
  const filename=temp(t),s=new CampaignRepository(filename,rules);s.create(fixture());
  const control=new DatabaseSync(filename);control.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'injected write failure'); END;");
  const c=command(s,'party.invite','atomic',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']]);
  assert.throws(()=>s.execute(actor('a'),c),/injected write failure/);assert.equal(s.read('world-a').revision,0);assert.equal(s.eventsSince('world-a',0).length,0);
  control.exec('DROP TRIGGER reject_receipt');control.close();assert.equal(s.execute(actor('a'),c).revision,1);s.close();
});
test('disk reopening retains worlds, receipts and outbox without accepting new stale-epoch commands',t=>{
  const filename=temp(t);let s=new CampaignRepository(filename,rules);s.create(fixture());
  const c=command(s,'party.invite','persisted',{fromFleetId:'a',toFleetId:'b'},[['fleets','a']]),r=s.execute(actor('a'),c);s.close();
  s=new CampaignRepository(filename,rules);assert.deepEqual(s.execute(actor('a'),c),r);assert.equal(s.eventsSince('world-a',0)[0].revision,1);
  assert.throws(()=>s.execute(actor('a'),{...c,requestId:'not-persisted'}),{code:'STALE_AUTHORITY'});s.close();
});
test('future or unrelated database is rejected without overwriting it',t=>{
  const filename=temp(t),db=new DatabaseSync(filename);db.exec('CREATE TABLE other(value TEXT); INSERT INTO other VALUES(\'keep\');');db.close();
  assert.throws(()=>new CampaignRepository(filename,rules),{code:'DATABASE_VERSION'});
  const check=new DatabaseSync(filename);assert.equal(check.prepare('SELECT value FROM other').get().value,'keep');check.exec('PRAGMA user_version=999');check.close();
  assert.throws(()=>new CampaignRepository(filename,rules),{code:'DATABASE_VERSION'});
});
test('Node Worker authority executes asynchronously and closes its owned database',async()=>{
  const service=new CampaignService({filename:':memory:'});try{
    const info=await service.ready();assert.equal(info.rules.originalReference,'Starsector 0.98a-RC8');await service.create(fixture());
    const c={worldId:'world-a',epoch:info.epoch,type:'party.invite',requestId:'worker-request',payload:{fromFleetId:'a',toFleetId:'b'},expected:[{collection:'fleets',id:'a',version:0}]};
    const [one,two]=await Promise.all([service.execute(actor('a'),c),service.execute(actor('a'),c)]);assert.deepEqual(one,two);
    assert.equal((await service.read('world-a')).revision,1);assert.equal((await service.eventsSince('world-a',0)).length,1);
    near((await service.quoteLogistics(logistics())).totalSuppliesPerDay,5/30);
  }finally{await service.close();}
  await assert.rejects(()=>service.read('world-a'),{code:'STORE_CLOSED'});
});

test('native repair sidebar includes only recovering ships upkeep and never bills that subtotal twice',()=>{
  const q=quoteOriginalLogistics(logistics([member({cr:0.4,suppliesPerMonth:30,deploymentSupplies:10}),member({suppliesPerMonth:60})]));
  near(q.repairSuppliesPerDay,6); near(q.recoveryPerDay,5); near(q.maintenancePerDay,3); near(q.totalSuppliesPerDay,8);
});
test('native repair sidebar excludes suspended, mothballed, zero-rate and fully recovered ships',()=>{
  for(const overrides of [{suspendRepairs:true},{mothballed:true},{recoveryPerDay:0},{cr:0.7}]){
    const q=quoteOriginalLogistics(logistics([member({cr:0.1,suppliesPerMonth:30,...overrides})]));
    near(q.repairSuppliesPerDay,0); near(q.totalSuppliesPerDay,1);
  }
});
test('repair sidebar uses recovery eligibility, not positive cost, and handles hull-only/fighter upkeep',()=>{
  near(quoteOriginalLogistics(logistics([member({cr:0.1,suppliesPerMonth:30,deploymentSupplies:0})])).repairSuppliesPerDay,1);
  near(quoteOriginalLogistics(logistics([member({needsRepairs:true,suppliesPerMonth:30,recoveryPerDay:0.2,deployCR:0.1})])).repairSuppliesPerDay,3.5);
  near(quoteOriginalLogistics(logistics([member({cr:0.1,suppliesPerMonth:30,fighterCount:3})])).repairSuppliesPerDay,5.5);
  near(quoteOriginalLogistics(logistics([])).repairSuppliesPerDay,0);
});
