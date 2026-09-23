import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { projectCampaignPlayer } from '../server/campaign/PlayerProjection.mjs';
import { originalFleetRadius } from '../src/campaign/rules/OriginalTransitions.mjs';
import { advanceJumpVisual, initialJumpVisual, jumpVisualParameters, wantsJumpPointOpen } from '../src/campaign/client/JumpPointVisual.mjs';
const rules = createReferenceRuleset(), a='fleet-captain-a', b='fleet-captain-b', player={kind:'player',id:'captain-a'}, system={kind:'system',id:'world-service'}, worldId='development-sector';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const command=(s,type,payload,refs=[])=>{const w=s.read(worldId);return {worldId,epoch:s.epoch,requestId:randomUUID(),type,payload,expected:refs.map(([collection,id])=>({collection,id,version:w[collection][id].version}))};};
const approach=s=>command(s,'fleet.approach',{fleetId:a,targetId:'exit'},[['fleets',a],['spaceEntities','exit']]);
const step=(s,ticks)=>s.execute(system,command(s,'world.advance',{fromTick:s.read(worldId).clock.tick,ticks}));
function store(t,world=createDevelopmentCampaign()){const s=new CampaignRepository(':memory:',rules);s.create(world);t.after(()=>s.close());return s;}
function fileStore(t){const dir=mkdtempSync(path.join(tmpdir(),'campaign-interaction-')),file=path.join(dir,'world.sqlite');t.after(()=>{for(const p of [file+'-wal',file+'-shm',file])if(existsSync(p))unlinkSync(p);rmdirSync(dir);});return file;}

test('approach is a persistent authoritative intent, not a jump, teleport or fuel charge; retry does not restart it',t=>{
  const s=store(t),input=approach(s),before=s.read(worldId),receipt=s.execute(player,input),after=s.read(worldId);
  assert.deepEqual(after.fleets[a].position,before.fleets[a].position);assert.deepEqual(after.fleets[a].cargo,before.fleets[a].cargo);
  assert.deepEqual(after.fleets[a].navigation.interaction,{targetId:'exit',orderId:input.requestId,arrived:false});assert.equal(after.fleets[a].navigation.transition,undefined);
  step(s,120);const progressed=s.read(worldId);assert.deepEqual(s.execute(player,input),receipt);assert.deepEqual(s.read(worldId),progressed);
});
test('arrival uses native fleet selection radius + jump radius and holds only that fleet; another player keeps moving',t=>{
  const s=store(t);s.execute(player,approach(s));s.execute({kind:'player',id:'captain-b'},command(s,'fleet.set-course',{fleetId:b,locationId:'system',destination:[5000,60]},[['fleets',b]]));
  step(s,180);const arrived=s.read(worldId),f=arrived.fleets[a];assert.equal(f.navigation.interaction.arrived,true);assert.deepEqual(f.navigation.velocity,[0,0]);
  assert.ok(Math.hypot(f.position[0]-240,f.position[1])<40+originalFleetRadius(f.memberIds.map(id=>arrived.members[id])));assert.ok(f.position[0]<240,'no snap to portal center');
  assert.equal(f.cargo.fuel,20);assert.equal(f.navigation.transition,undefined);
  step(s,180);const later=s.read(worldId);assert.deepEqual(later.fleets[a].position,f.position);assert.ok(later.fleets[b].position[0]>arrived.fleets[b].position[0]);
  const ready=s.eventsSince(worldId,0).flatMap(e=>e.events).filter(e=>e.type==='fleet.interaction-ready');assert.equal(ready.length,1);
});
test('no-fuel engine drift overrides a non-arrived interaction, but an arrived dialog holds only its own fleet',t=>{
  const w=structuredClone(createDevelopmentCampaign());w.fleets[a].locationId='hyper';w.fleets[a].position=[-500,0];w.fleets[a].cargo.fuel=0;
  w.spaceEntities.remote={...structuredClone(w.spaceEntities.well),id:'remote',position:[-2000,0]};
  const s=store(t,w);s.execute(player,command(s,'fleet.approach',{fleetId:a,targetId:'remote'},[['fleets',a],['spaceEntities','remote']]));
  step(s,1);assert.deepEqual(s.read(worldId).fleets[a].navigation.destination,[0,0]);
  step(s,120);const drifting=s.read(worldId).fleets[a];assert.ok(drifting.position[0]>-500,'interaction must not steer away from the closest well each tick');
  assert.equal(drifting.navigation.interaction.targetId,'remote');assert.equal(drifting.navigation.interaction.arrived,false);
  step(s,480);const landed=s.read(worldId).fleets[a];assert.equal(landed.locationId,'system');assert.equal(landed.navigation.interaction,undefined);assert.equal(landed.cargo.fuel,0);
  const held=structuredClone(w);held.fleets[a].position=[-50,0];const h=store(t,held);
  h.execute(player,command(h,'fleet.approach',{fleetId:a,targetId:'well'},[['fleets',a],['spaceEntities','well']]));step(h,180);
  assert.equal(h.read(worldId).fleets[a].navigation.interaction.arrived,true);assert.deepEqual(h.read(worldId).fleets[a].position,[-50,0]);assert.equal(h.read(worldId).fleets[a].navigation.transition,undefined);
  h.execute(player,command(h,'fleet.stop',{fleetId:a,locationId:'hyper'},[['fleets',a]]));step(h,480);assert.equal(h.read(worldId).fleets[a].locationId,'system');
  const empty=structuredClone(w);empty.spaceEntities.well.jump.anchor=null;empty.spaceEntities.remote.jump.anchor=null;const e=store(t,empty);
  e.execute(player,command(e,'fleet.approach',{fleetId:a,targetId:'remote'},[['fleets',a],['spaceEntities','remote']]));step(e,120);assert.ok(e.read(worldId).fleets[a].position[0]<-500,'known-empty drift topology must still allow the interaction course');
});
test('controller, point version, location, unsupported targets and client-supplied arrival data are checked atomically',t=>{
  const s=store(t),before=s.read(worldId);
  assert.throws(()=>s.execute({kind:'player',id:'captain-b'},approach(s)),{code:'FORBIDDEN'});
  const stale=approach(s);stale.expected[1].version++;assert.throws(()=>s.execute(player,stale),{code:'VERSION_CONFLICT'});
  assert.throws(()=>s.execute(player,command(s,'fleet.approach',{fleetId:a,targetId:'well'},[['fleets',a],['spaceEntities','well']])),{code:'LOCATION_CONFLICT'});
  const forged=approach(s);forged.payload.arrived=true;assert.throws(()=>s.execute(player,forged),{code:'INVALID_COMMAND'});assert.deepEqual(s.read(worldId),before);
  const w=structuredClone(createDevelopmentCampaign());w.spaceEntities.exit.tags=['wormhole'];const unsupported=store(t,w);assert.throws(()=>unsupported.execute(player,approach(unsupported)),{code:'UNSUPPORTED_INTERACTION'});
});
test('setting a new course or stopping cancels interaction; beginning a jump clears stale source interaction through landing',t=>{
  const s=store(t);s.execute(player,approach(s));s.execute(player,command(s,'fleet.stop',{fleetId:a,locationId:'system'},[['fleets',a]]));assert.equal(s.read(worldId).fleets[a].navigation.interaction,undefined);
  s.execute(player,approach(s));s.execute(player,command(s,'fleet.set-course',{fleetId:a,locationId:'system',destination:[0,50]},[['fleets',a]]));assert.equal(s.read(worldId).fleets[a].navigation.interaction,undefined);
  s.execute(player,approach(s));step(s,180);s.execute(player,command(s,'fleet.jump',{fleetId:a,sourceId:'exit',destinationIndex:0},[['fleets',a],['spaceEntities','exit'],['spaceEntities','well']]));
  assert.equal(s.read(worldId).fleets[a].navigation.interaction,undefined);assert.equal(s.read(worldId).fleets[a].cargo.fuel,19);step(s,240);assert.equal(s.read(worldId).fleets[a].locationId,'hyper');assert.equal(s.read(worldId).fleets[a].navigation.interaction,undefined);assert.ok(s.read(worldId).fleets[a].cargo.fuel<=19,'normal post-landing hyperspace movement may consume fuel');
});
test('only disclosed fleets expose interaction targets; independent players do not leak intents in the directory',t=>{
  const s=store(t);s.execute(player,approach(s));const world=s.read(worldId),own=projectCampaignPlayer(world,'captain-a'),other=projectCampaignPlayer(world,'captain-b');
  assert.equal(own.fleets[0].navigation.interaction.targetId,'exit');assert.equal(other.contacts[0].interaction,undefined);assert.ok(!other.fleets.some(f=>f.id===a));
});
test('interaction state rejects foreign endpoints, invalid arrival flags and moving held fleets',()=>{
  for(const interaction of [{targetId:'well',orderId:'x',arrived:false},{targetId:'exit',orderId:'x',arrived:'yes'},{targetId:'exit',orderId:'x',arrived:true}]){
    const w=structuredClone(createDevelopmentCampaign());w.fleets[a].navigation={velocity:[1,0],destination:[240,0],interaction};assert.throws(()=>validateCampaignWorld(w),{code:'INVALID_WORLD'});
  }
});
test('file reopen keeps approach identity/position; failed receipt rolls back the target, movement and arrival event',t=>{
  const filename=fileStore(t);let s,db;
  try{s=new CampaignRepository(filename,rules);s.create(createDevelopmentCampaign());db=new DatabaseSync(filename);const request=approach(s),before=s.read(worldId);
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'interaction-rollback'); END;");
    assert.throws(()=>s.execute(player,request),/interaction-rollback/);assert.deepEqual(s.read(worldId),before);db.exec('DROP TRIGGER fail_receipt');
    s.execute(player,request);step(s,60);const saved=s.read(worldId);s.close();s=new CampaignRepository(filename,rules);assert.deepEqual(s.read(worldId),saved);
    const events=s.eventsSince(worldId,0);db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'interaction-rollback'); END;");
    assert.throws(()=>step(s,180),/interaction-rollback/);assert.deepEqual(s.read(worldId),saved);assert.deepEqual(s.eventsSince(worldId,0),events);db.exec('DROP TRIGGER fail_receipt');step(s,180);assert.equal(s.read(worldId).fleets[a].navigation.interaction.arrived,true);
  }finally{db?.close();s?.close();}
});
test('normal jump opens only for a selected target at strictly less than 600; mere proximity and wrong location do not open',()=>{
  const point={id:'exit',locationId:'system',position:[0,0]},fleet={locationId:'system',position:[600,0],navigation:{interaction:{targetId:'exit'}}};
  assert.equal(wantsJumpPointOpen(point,[fleet],false),false);fleet.position=[599.99,0];assert.equal(wantsJumpPointOpen(point,[fleet],false),true);
  fleet.navigation.interaction=null;fleet.position=[0,0];assert.equal(wantsJumpPointOpen(point,[fleet],false),false);
  fleet.navigation.jumpSourceId='exit';assert.equal(wantsJumpPointOpen(point,[fleet],false),true);fleet.locationId='hyper';assert.equal(wantsJumpPointOpen(point,[fleet],false),false);assert.equal(wantsJumpPointOpen(point,[],true),true);
});
test('opening fades over one second, squares brightness, and cancels with a five-second hold then a one-second close',()=>{
  const closed=initialJumpVisual(),half=advanceJumpVisual(closed,true,.5);near(half.brightness,.5);near(jumpVisualParameters(40,half.brightness).open,.25);
  const opened=advanceJumpVisual(half,true,.5);near(opened.brightness,1);const hold=advanceJumpVisual(opened,false,4.9);near(hold.brightness,1);
  const closing=advanceJumpVisual(hold,false,.6);near(closing.brightness,.5);const end=advanceJumpVisual(closing,false,.5);near(end.brightness,0);
  const reopened=advanceJumpVisual(closing,true,.25);near(reopened.brightness,.75);assert.equal(reopened.hold,5);
});
test('a cancelled partial opening finishes before the hold; pause freezes visuals and different frame batches agree',()=>{
  const half=advanceJumpVisual(initialJumpVisual(),true,.5),one=advanceJumpVisual(half,false,6.5);near(one.brightness,0);
  assert.deepEqual(advanceJumpVisual(half,false,0),half);let split=half;for(let i=0;i<390;i++)split=advanceJumpVisual(split,false,1/60);near(split.brightness,one.brightness);
  assert.throws(()=>advanceJumpVisual(half,true,NaN));
});
test('closed/open render parameters preserve the native shrinking portal, full-size core and layered rings',()=>{
  const closed=jumpVisualParameters(40,0),opened=jumpVisualParameters(40,1);
  near(closed.scale,.1);near(opened.scale,1);near(closed.glowSize,55);near(closed.glowAlpha,.67);near(opened.glowAlpha,0);near(opened.bandAlpha,0);near(opened.ringSize,124);
  assert.ok(closed.bandWidth>opened.bandWidth);assert.throws(()=>jumpVisualParameters(-1,1));
});

test('market anchor pursuit follows the existing arrival/cancel path without granting trade or changing cargo', t => {
  const w = structuredClone(createDevelopmentCampaign());
  w.markets.port = { id: 'port', version: 0, owner: { kind: 'player', id: 'captain-a' }, locationId: 'system' };
  w.spaceEntities.station = { id: 'station', version: 0, name: 'Port', locationId: 'system', position: [200, 0], radius: 50, tags: [], marketId: 'port' };
  const s = store(t, w), before = s.read(worldId);
  const c = command(s, 'fleet.approach', { fleetId: a, targetId: 'station' }, [['fleets', a], ['spaceEntities', 'station']]);
  s.execute(player, c); assert.deepEqual(s.read(worldId).fleets[a].cargo, before.fleets[a].cargo);
  step(s, 240); assert.equal(s.read(worldId).fleets[a].navigation.interaction.arrived, true);
  assert.equal(s.read(worldId).extensions['reference.market:port'], undefined, 'arrival is not an economic snapshot');
  assert.equal(projectCampaignPlayer(s.read(worldId), 'captain-a', rules).ports[0].marketId, 'port');
  s.execute(player, command(s, 'fleet.stop', { fleetId: a, locationId: 'system' }, [['fleets', a]]));
  assert.equal(s.read(worldId).fleets[a].navigation.interaction, undefined);
});
