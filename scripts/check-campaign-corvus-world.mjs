import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCorvusDevelopmentCampaign, CORVUS_DEVELOPMENT_WORLD_ID as worldId, CORVUS_DEVELOPMENT_SEED as seed,
 CORVUS_DEVELOPMENT_EXTENSION_ID as metadataId } from '../server/campaign/CorvusDevelopmentWorld.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { canonicalJSON } from '../src/campaign/core/Values.mjs';
import { originalOrbitOrder, advanceOriginalOrbit } from '../src/campaign/rules/OriginalOrbits.mjs';
import { createOriginalCorvusProvider } from '../src/campaign/content/OriginalCorvus.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import reference from '../src/campaign/data/reference-corvus.json' with { type: 'json' };

const rules=createReferenceRuleset(), provider=createOriginalCorvusProvider(reference), player={kind:'player',id:'captain-a'},system={kind:'system',id:'scheduler'},fleetId='fleet-captain-a';
const metadata=w=>w.extensions[metadataId].data;
function store(t,world=createCorvusDevelopmentCampaign()) { const s=new CampaignRepository(':memory:',rules);t.after(()=>s.close());s.create(world);return s; }
function command(s,type,payload,refs=[]) { const w=s.read(worldId);return {worldId,epoch:s.epoch,requestId:randomUUID(),type,payload,expected:refs.map(([collection,id])=>({collection,id,version:w[collection][id].version}))}; }
function unchangedAfter(s,fn,code){const before=canonicalJSON(s.read(worldId)),events=s.eventsSince(worldId,0);assert.throws(fn,{code});assert.equal(canonicalJSON(s.read(worldId)),before);assert.deepEqual(s.eventsSince(worldId,0),events);}

test('independent authored Corvus world passes generic validation and every selected provider hook',t=>{
 const w=createCorvusDevelopmentCampaign();assert.equal(w.id,worldId);assert.notEqual(w.id,'development-sector');
 assert.deepEqual(validateCampaignWorld(w),w);assert.doesNotThrow(()=>rules.validateWorld(w));assert.equal(rules.acceptsLock(w.rules),true);
 assert.equal(Object.keys(w.locations).length,1);assert.equal(w.locations.corvus.name,'Corvus');assert.equal(Object.keys(w.spaceEntities).length,15);assert.equal(Object.keys(w.markets).length,4);
 assert.deepEqual(store(t,w).read(worldId),w);assert.equal(w.clock.tick,0);assert.equal(w.clock.gameSeconds,0);
 assert.ok(rules.services.calendar.projectWorld(w));
});
test('same options recreate identical canonical bytes, identity seed is explicit and not native RNG',()=>{
 const a=createCorvusDevelopmentCampaign(),b=createCorvusDevelopmentCampaign({id:worldId,seed});assert.equal(canonicalJSON(a),canonicalJSON(b));
 assert.equal(metadata(a).seed,seed);assert.equal(metadata(a).officialNewGame,false);assert.equal(metadata(a).newGamePreludeExecuted,false);
 assert.match(metadata(a).seedScope,/fallback identity|fallback|identity/);assert.match(metadata(a).seedScope,/no Java/);
 assert.equal(metadata(a).simulationStatus,'inspection-only-terrain-and-topology-unavailable');assert.match(a.contentFingerprint,/^dev-corvus:[a-f0-9]{64}$/);
 const changed=createCorvusDevelopmentCampaign({seed:'other-web-seed'});assert.notEqual(changed.contentFingerprint,a.contentFingerprint);
 for(const id of ['corvus','asharu','jangala','barad','corvus_IIIa','jangala_jump'])assert.deepEqual(changed.spaceEntities[id],a.spaceEntities[id]);
 for(const handle of ['corvus_loc1','corvus_loc3']){const x=metadata(a).identityByHandle[handle],y=metadata(changed).identityByHandle[handle];assert.notEqual(x.id,y.id);assert.deepEqual(a.spaceEntities[x.id].position,changed.spaceEntities[y.id].position);}
 assert.notEqual(metadata(createCorvusDevelopmentCampaign({id:'another-corvus-development'})).identityByHandle.corvus_loc1.id,metadata(a).identityByHandle.corvus_loc1.id);
});
test('13 native IDs preserved and only the two null-id custom entities get traceable Web IDs',()=>{
 const w=createCorvusDevelopmentCampaign(),identities=Object.values(metadata(w).identityByHandle);
 assert.equal(identities.filter(x=>x.nativeId!==null).length,13);assert.equal(identities.filter(x=>x.nativeId===null).length,2);
 for(const e of provider.listEntities().filter(e=>['star','planet','custom','jump-point'].includes(e.kind))){const x=metadata(w).identityByHandle[e.handle];const actual=w.spaceEntities[x.id];
  assert.equal(actual.source.nativeId,e.nativeId);assert.equal(actual.source.sourceHandle,e.handle);assert.deepEqual(actual.source.source,e.source);
  if(e.nativeId!==null){assert.equal(x.id,e.nativeId);assert.equal(x.policy,'preserved-native-id');}
  else{assert.match(x.id,/^web-corvus:entity:[a-f0-9]{64}$/);assert.equal(x.policy,'web-stable-sha256-v1-not-native-genUID');}
 }
 assert.equal(w.spaceEntities.corvus_loc1,undefined);assert.equal(w.spaceEntities.corvus_loc3,undefined);
});
test('presentation metadata matches real planet/custom types; explicit jump is not falsely a planet or a complete link',()=>{
 const w=createCorvusDevelopmentCampaign();
 assert.deepEqual(w.spaceEntities.corvus.presentation,{kind:'star',nativeType:'star_yellow',sourceHandle:'star'});
 assert.deepEqual(w.spaceEntities.asharu.presentation,{kind:'planet',nativeType:'desert',sourceHandle:'corvusI'});
 assert.deepEqual(w.spaceEntities.corvus_hegemony_station.presentation,{kind:'custom',nativeType:'station_jangala_type',sourceHandle:'hegemonyStation'});
 assert.equal(w.spaceEntities.jangala_jump.presentation,undefined);assert.deepEqual(w.spaceEntities.jangala_jump.jump,{anchor:null,destinations:[]});
 assert.equal(Object.values(w.spaceEntities).filter(e=>e.jump).length,1);assert.ok(Object.values(w.spaceEntities).filter(e=>e.presentation).length===14);
 assert.equal(w.spaceEntities.well,undefined);assert.equal(w.locations.hyper,undefined);assert.equal(w.spaceEntities.corvus.radius,775);
 assert.equal(w.spaceEntities.corvus_hegemony_station.name,'Jangala 空间站');assert.equal(w.spaceEntities.corvus_pirate_station.name,'Garnir Extraction Depot');
});
test('background and persisted surface/cloud phases are explicit, moons light from the star, never implicit RNG',()=>{
 const w=createCorvusDevelopmentCampaign();assert.deepEqual(w.locations.corvus.presentation,{background:reference.system.background.path});
 for(const id of ['corvus','asharu','jangala','barad','corvus_IIIa','corvus_IIIb']){
  const e=w.spaceEntities[id];assert.equal(e.surfacePhase,0);assert.equal(e.cloudPhase,0);
  assert.equal(e.source.phasePolicy.surface,'web-development-fixed-zero-not-native-random');assert.equal(e.source.phasePolicy.cloud,'native-initial-zero');
  if(id!=='corvus')assert.equal(e.lightSourceId,'corvus');
 }
 assert.equal(w.spaceEntities.corvus_IIIa.orbit.focusId,'barad');assert.equal(w.spaceEntities.corvus_IIIa.lightSourceId,'corvus');
 assert.equal(w.spaceEntities.corvus.lightSourceId,undefined);assert.equal(w.spaceEntities.corvus_hegemony_station.surfacePhase,undefined);
 assert.match(metadata(w).renderPhasePolicy,/Web development phase/);
});
test('sourceFocus mapping and focus-first advance(0) initialize all 14 orbits, never persist zero placeholders',()=>{
 const w=createCorvusDevelopmentCampaign(),map=metadata(w).identityByHandle;assert.equal(originalOrbitOrder(w).length,14);
 const order=originalOrbitOrder(w);assert.deepEqual(order,metadata(w).initializationOrder);assert.ok(order.indexOf('barad')<order.indexOf('corvus_IIIa'));assert.ok(order.indexOf('corvus_IIIa')<order.indexOf('corvus_pirate_station'));
 assert.deepEqual(w.spaceEntities.corvus.position,[0,0]);
 for(const e of provider.listEntities().filter(e=>map[e.handle]&&e.orbit)){
  const actual=w.spaceEntities[map[e.handle].id],focus=w.spaceEntities[map[e.orbit.focusHandle].id];
  assert.equal(actual.orbit.focusId,focus.id);assert.deepEqual(actual.source.initialOrbit,e.orbit);
  const initial={...actual,position:[0,0],orbit:{...actual.orbit,angleDegrees:e.orbit.angleDegrees}};
  assert.deepEqual(actual.position,advanceOriginalOrbit(initial,focus,0).position);
  assert.ok(Math.abs(Math.hypot(actual.position[0]-focus.position[0],actual.position[1]-focus.position[1])-e.orbit.radius)<0.01);
  assert.notDeepEqual(actual.position,[0,0]);
 }
 assert.deepEqual(w.spaceEntities.asharu.position,[1606.0140380859375,2293.625732421875]);assert.deepEqual(w.spaceEntities.corvus_IIIa.position,[-1913.0703125,8240.115234375]);
 assert.equal(w.spaceEntities.corvus_hegemony_station.facingDegrees,225);
 const stable=w.spaceEntities[map.corvus_loc3.id];assert.equal(stable.source.initialOrbit.angleDegrees,-80);assert.equal(stable.orbit.angleDegrees,280);assert.equal(stable.facingDegrees,280);
});
test('real faction identities and market links exist without initializing politics or pretending economics',()=>{
 const w=createCorvusDevelopmentCampaign();assert.deepEqual(Object.keys(w.factions).sort(),['hegemony','independent','neutral','pirates']);assert.equal(w.factions.hegemony.name,'霸主');
 for(const f of Object.values(w.factions)){assert.deepEqual(f.playerRoles,{});assert.equal(f.source.relationships,'not-initialized');assert.equal(f.source.governance,'not-simulated');}
 assert.equal(w.spaceEntities.corvus.factionId,null);assert.equal(w.spaceEntities.jangala.factionId,'hegemony');assert.equal(w.spaceEntities.asharu.factionId,'independent');assert.equal(w.spaceEntities.jangala_gate.factionId,'neutral');
 assert.equal(w.spaceEntities.corvus_hegemony_station.marketId,'jangala');assert.equal(w.spaceEntities.corvus_pirate_station.marketId,'corvus_IIIa');
 for(const m of Object.values(w.markets)){
  assert.deepEqual(m.metadata.definition,provider.getMarket(m.id));assert.equal(m.owner.id,m.metadata.definition.faction);assert.equal(m.metadata.tradeState,'unavailable');
  assert.equal(w.extensions['reference.market:'+m.id],undefined);assert.throws(()=>rules.services.market.validateState(w,m.id),{code:'MARKET_UNAVAILABLE'});
 }
 assert.equal(w.markets.jangala.metadata.definition.size,6);assert.equal(w.markets.corvus_IIIa.metadata.definition.freePort,true);
 assert.equal(w.markets.corvus_abandoned_station_market.metadata.economyRegistration,'native-helper-not-economy-registered');
 assert.deepEqual(w.accounts,{});assert.deepEqual(w.colonies,{});assert.equal(Object.values(w.members).some(m=>m.loadout.hullId==='hermes'),false);
});
test('terrain coverage names six source terrain helpers plus corona and both ungenerated procedural phases',()=>{
 const w=createCorvusDevelopmentCampaign(),data=metadata(w),nav=w.locations.corvus.navigation;
 assert.equal(nav.space,'normal');assert.equal(nav.jumpTopology,'unavailable');assert.equal(nav.terrain.length,9);
 assert.deepEqual(nav.terrain,data.unimplementedTerrain.map(x=>x.id));assert.equal(new Set(nav.terrain).size,9);
 for(const t of data.unimplementedTerrain){assert.equal(t.status,'required-not-executed');assert.ok(t.source.id);assert.equal(w.spaceEntities[t.id],undefined,'no fake zero-radius terrain entities');}
 assert.deepEqual(data.unimplementedTerrain.filter(t=>t.sourceHandle).map(t=>t.sourceHandle),['@operation:38','barad_field','@operation:51','baradL4','baradL5','nebula','star']);
 assert.equal(data.omittedAuthoredRecords.length,8);assert.equal(data.pendingStages.length,5);assert.equal(data.pendingPostprocessing.length,6);
 assert.ok(data.pendingStages.every(s=>s.status==='required-not-executed'));
});
test('QA Wolf fleets share exact original respawn position, not hyperspace coordinates or a fabricated native start',()=>{
 const w=createCorvusDevelopmentCampaign();assert.equal(Object.keys(w.players).length,2);assert.equal(Object.keys(w.fleets).length,2);
 for(const f of Object.values(w.fleets)){assert.equal(f.locationId,'corvus');assert.deepEqual(f.position,[-2500,-3500]);assert.deepEqual(f.cargo,{supplies:30,fuel:20,crew:15});assert.equal(w.members[f.memberIds[0]].loadout.hullId,'wolf');assert.equal(f.navigation,undefined);}
 assert.equal(w.locations.corvus.source.system.hyperspaceLocation.x,400);assert.equal(w.locations.corvus.source.system.hyperspaceLocation.y,-9400);
 assert.equal(metadata(w).spawn.source.line,61);assert.match(metadata(w).spawn.policy,/not a claimed native new-game/);assert.match(metadata(w).spawn.calendar,/no time advance/);
});
test('returned world is deeply frozen, isolated and never mutates source JSON/provider blueprint',()=>{
 const raw=canonicalJSON(reference),bp=canonicalJSON(provider.getBlueprint()),a=createCorvusDevelopmentCampaign(),b=createCorvusDevelopmentCampaign();
 assert.notEqual(a,b);assert.notEqual(a.spaceEntities.asharu,b.spaceEntities.asharu);assert.equal(canonicalJSON(reference),raw);assert.equal(canonicalJSON(provider.getBlueprint()),bp);
 assert.throws(()=>{a.spaceEntities.asharu.position[0]=9;},TypeError);assert.throws(()=>{a.markets.jangala.metadata.definition.industries.push('fake');},TypeError);
 const clone=structuredClone(a);clone.markets.jangala.metadata.definition.conditions.push('fake');assert.equal(canonicalJSON(reference),raw);assert.equal(canonicalJSON(provider.getBlueprint()),bp);
});
test('fleet course, approach, jump and world.advance are rejected atomically rather than granting a safe sector',t=>{
 const s=store(t);
 unchangedAfter(s,()=>s.execute(player,command(s,'fleet.set-course',{fleetId,locationId:'corvus',destination:[0,0]},[['fleets',fleetId]])),'UNSUPPORTED_TRAVEL');
 unchangedAfter(s,()=>s.execute(player,command(s,'fleet.approach',{fleetId,targetId:'jangala_jump'},[['fleets',fleetId],['spaceEntities','jangala_jump']])),'UNSUPPORTED_INTERACTION');
 unchangedAfter(s,()=>s.execute(player,command(s,'fleet.jump',{fleetId,sourceId:'jangala_jump',destinationIndex:0},[['fleets',fleetId],['spaceEntities','jangala_jump']])),'UNSUPPORTED_TRAVEL');
 unchangedAfter(s,()=>s.execute(system,command(s,'world.advance',{fromTick:0,ticks:1})),'UNSUPPORTED_TRAVEL');
 unchangedAfter(s,()=>s.execute(system,command(s,'world.advance',{fromTick:0,ticks:60})),'UNSUPPORTED_TRAVEL');
 assert.equal(s.read(worldId).clock.tick,0);assert.equal(s.read(worldId).revision,0);
});
test('even a test-only removal of terrain blockers does not fabricate a missing jump destination',t=>{
 const draft=structuredClone(createCorvusDevelopmentCampaign());draft.locations.corvus.navigation.terrain=[];
 const s=store(t,draft);unchangedAfter(s,()=>s.execute(player,command(s,'fleet.jump',{fleetId,sourceId:'jangala_jump',destinationIndex:0},[['fleets',fleetId],['spaceEntities','jangala_jump']])),'NOT_FOUND');
 assert.equal(s.read(worldId).locations.corvus.navigation.jumpTopology,'unavailable');
});
test('market metadata is not trade state, even when a test supplies an authorized credit account',t=>{
 const draft=structuredClone(createCorvusDevelopmentCampaign());draft.accounts.testcredits={id:'testcredits',version:0,owner:{kind:'player',id:player.id},currency:'credits',balance:100000};
 // Test-only account to reach the missing-snapshot gate. The builder itself never creates native credits.
 const s=store(t,draft),payload={marketId:'jangala',submarketId:'open_market',fleetId,accountId:'testcredits',commodityId:'supplies',quantity:1};
 assert.throws(()=>rules.services.market.quote(s.read(worldId),player,{...payload,side:'buy'}),{code:'MARKET_UNAVAILABLE'});
 unchangedAfter(s,()=>s.execute(player,command(s,'market.buy',payload)),'MARKET_UNAVAILABLE');
 unchangedAfter(s,()=>s.execute(player,command(s,'market.sell',payload)),'MARKET_UNAVAILABLE');
});
test('provider validation still rejects corrupt orbit graphs, bad rule locks and missing faction ownership',()=>{
 let draft=structuredClone(createCorvusDevelopmentCampaign());draft.spaceEntities.corvus_IIIa.orbit.focusId='missing';assert.throws(()=>rules.validateWorld(draft),{code:'INVALID_ORBIT'});
 draft=structuredClone(createCorvusDevelopmentCampaign());draft.spaceEntities.barad.orbit.focusId='corvus_IIIa';assert.throws(()=>rules.validateWorld(draft),{code:'INVALID_ORBIT'});
 draft=structuredClone(createCorvusDevelopmentCampaign());draft.rules.version='other';assert.throws(()=>rules.validateWorld(draft),{code:'RULESET_MISMATCH'});
 draft=structuredClone(createCorvusDevelopmentCampaign());delete draft.factions.hegemony;assert.throws(()=>validateCampaignWorld(draft),{code:'BROKEN_REFERENCE'});
 for(const value of [null,[],{seed:0},{seed:null},{id:null},{id:'../invalid'},{id:'development-sector'},{seed:'x'.repeat(129)},{rules:{}},{world:{}}])assert.throws(()=>createCorvusDevelopmentCampaign(value));
});
test('TypeScript API remains readonly and assignable to the shared world without shared type edits',async()=>{
 const ts=await import('typescript'),project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),filename=resolve(project,'scripts/__corvus_world_contract_in_memory__.mts').replace(/\\/g,'/');
 const source=`import {createCorvusDevelopmentCampaign} from '../server/campaign/CorvusDevelopmentWorld.mjs';
 import type {CorvusDevelopmentSpaceEntity} from '../server/campaign/CorvusDevelopmentWorld.mjs';
 import type {ReadonlyWorld} from '../src/campaign/Types.js';
 const w=createCorvusDevelopmentCampaign({seed:'web-test'});const shared:ReadonlyWorld=w;void shared;
 const presentation:NonNullable<CorvusDevelopmentSpaceEntity['presentation']>={kind:'star',nativeType:'star_yellow',sourceHandle:'star'};
 const kind:'star'|'planet'|'custom'=presentation.kind;void kind;
 const phase:number|undefined=w.spaceEntities.asharu.surfacePhase;void phase;
 const status:'unavailable'=w.markets.jangala.metadata.tradeState;void status;
 // @ts-expect-error immutable position
 w.spaceEntities.asharu.position[0]=0;
 // @ts-expect-error immutable market inputs
 w.markets.jangala.metadata.definition.industries.push('fake');
 // @ts-expect-error unknown overrides not allowed
 createCorvusDevelopmentCampaign({terrain:[]});
 // @ts-expect-error no numeric/native generator seed
 createCorvusDevelopmentCampaign({seed:123});`;
 const options={target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,types:['node'],skipLibCheck:false};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);host.readFile=p=>p.replace(/\\/g,'/')===filename?source:read(p);host.fileExists=p=>p.replace(/\\/g,'/')===filename||exists(p);
 const errors=ts.getPreEmitDiagnostics(ts.createProgram([filename],options,host));assert.equal(errors.length,0,ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>project,getNewLine:()=>'\n'}));
});
