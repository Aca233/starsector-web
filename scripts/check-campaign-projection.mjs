import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { projectCampaignPlayer } from '../server/campaign/PlayerProjection.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
const rules = createReferenceRuleset(), id = 'fleet-captain-a';
test('private HUD capacities and consumption come from effective rules, and projection is read-only', () => {
  const w=createDevelopmentCampaign(),before=JSON.stringify(w),f=w.fleets[id];
  const input=rules.services.fleetStats.resolve(f,f.memberIds.map(k=>w.members[k]),{world:w,aiMode:false});
  const quote=rules.services.logistics.quote(input),view=projectCampaignPlayer(w,'captain-a',rules),stats=view.fleets[0].private.logistics;
  assert.equal(stats.cargoCapacity,input.cargo.capacity);assert.equal(stats.fuelCapacity,input.cargo.fuelCapacity);assert.equal(stats.cargoSpaceUsed,30);
  assert.equal(stats.suppliesPerDay,quote.totalSuppliesPerDay);assert.equal(stats.fuelPerLightYear,quote.fuelPerLightYear);assert.equal(view.fleets[0].private.logisticsUnavailable,null);
  assert.equal(JSON.stringify(w),before);assert.equal(Object.isFrozen(stats),true);
});
test('party navigation never exposes another fleet statistics or unsupported private details', () => {
  const w=structuredClone(createDevelopmentCampaign()),other='fleet-captain-b';w.parties.p={id:'p',version:0,leaderFleetId:id,fleetIds:[id,other]};w.fleets[id].partyId='p';w.fleets[other].partyId='p';
  w.fleets[other].cargo.fuel=987654;const view=projectCampaignPlayer(w,'captain-a',rules);assert.equal(view.fleets.find(f=>f.id===other).private,null);assert.ok(!JSON.stringify(view).includes('987654'));
});
test('unavailable or unsupported rules yield unknown, not forged zeroes or a broken session', () => {
  const w=structuredClone(createDevelopmentCampaign());w.members['wolf-captain-a'].loadout.hullId='not-a-supported-hull';
  const p=projectCampaignPlayer(w,'captain-a',rules).fleets[0].private;assert.equal(p.logistics,null);assert.match(p.logisticsUnavailable,/^[A-Z_]+$/);
  const missing=projectCampaignPlayer(createDevelopmentCampaign(),'captain-a').fleets[0].private;assert.equal(missing.logistics,null);assert.equal(missing.logisticsUnavailable,'RULES_UNAVAILABLE');
  const mismatch=structuredClone(createDevelopmentCampaign());mismatch.rules.version='other';assert.throws(()=>projectCampaignPlayer(mismatch,'captain-a',rules),{code:'RULESET_MISMATCH'});
});
test('projection calls the selected replacement providers instead of hardcoding the reference formula', () => {
  const registry=new CampaignRuleRegistry();
  registry.register({id:'mod.stats',version:'1',service:'fleetStats',apiVersion:1,capabilities:[],methods:{resolve:()=>({cargo:{spaceUsed:11,capacity:222,fuelCapacity:333,crew:4,marines:5,personnelCapacity:444}})}});
  registry.register({id:'mod.logistics',version:'1',service:'logistics',apiVersion:1,capabilities:[],methods:{quote:()=>({totalSuppliesPerDay:7,maintenancePerDay:6,recoveryPerDay:1,fuelPerLightYear:8})}});
  const custom=registry.compile({id:'mod.campaign',version:'1',providers:{fleetStats:'mod.stats',logistics:'mod.logistics'}}),w=structuredClone(createDevelopmentCampaign());w.rules=custom.lock;w.extensions={};
  const stats=projectCampaignPlayer(w,'captain-a',custom).fleets[0].private.logistics;assert.equal(stats.cargoCapacity,222);assert.equal(stats.fuelCapacity,333);assert.equal(stats.personnelUsed,9);assert.equal(stats.suppliesPerDay,7);assert.equal(stats.fuelPerLightYear,8);assert.equal(stats.repairSuppliesPerDay,null);
});
test('worker projects authenticated-player DTOs using its pinned rules, without sending raw world collections', async t => {
  const service=new CampaignService({filename:':memory:'});t.after(()=>service.close());await service.create(createDevelopmentCampaign());
  const view=await service.projectPlayer('development-sector','captain-a');assert.ok(view.fleets[0].private.logistics.fuelCapacity>0);assert.equal(view.factions,undefined);assert.equal(view.extensions,undefined);assert.equal(view.accounts,undefined);
  await assert.rejects(service.projectPlayer('development-sector','non-member'),{code:'FORBIDDEN'});
});

test('non-jump orbital bodies are not mislabeled as portals, and moving jump projections use current authority coordinates', () => {
  const w = structuredClone(createDevelopmentCampaign());
  w.spaceEntities.star = { id: 'star', version: 0, name: 'Star', locationId: 'system', position: [0, 0], radius: 100, tags: [] };
  w.spaceEntities.exit.orbit = { schemaVersion: 1, kind: 'circular', focusId: 'star', radius: 240, periodDays: 10, angleDegrees: 0 };
  for (const change of rules.services.spaceMotion.advance(w, 1 / 60).changes) w.spaceEntities[change.id] = change.value;
  const view = projectCampaignPlayer(w, 'captain-a', rules);
  assert.deepEqual(view.points.map(p => p.id), ['exit']);
  assert.deepEqual(view.points[0].position, w.spaceEntities.exit.position);
  assert.notDeepEqual(view.points[0].position, [240, 0]);
});

test('native sidebar subtotal and mothball status remain owner-private and read-only', () => {
  const w = structuredClone(createDevelopmentCampaign()), m = w.members['wolf-captain-a'];
  m.logistics = { mothballed: true, suspendRepairs: false };
  const before = structuredClone(w), view = projectCampaignPlayer(w, 'captain-a', rules);
  assert.equal(view.fleets[0].private.members[0].mothballed, true);
  assert.equal(view.fleets[0].private.logistics.repairSuppliesPerDay, 0);
  assert.deepEqual(w, before);
  m.logistics.mothballed = false; m.condition.combatReadiness = 0.4;
  const input = rules.services.fleetStats.resolve(w.fleets[id], [m], {world: w, aiMode: false});
  const quote = rules.services.logistics.quote(input);
  assert.equal(projectCampaignPlayer(w, 'captain-a', rules).fleets[0].private.logistics.repairSuppliesPerDay, quote.repairSuppliesPerDay);
  assert.equal(quote.repairSuppliesPerDay, quote.maintenancePerDay + quote.recoveryPerDay);
});

test('replacement logistics provider owns the sidebar subtotal without a reference fallback',()=>{
  for(const value of [17,undefined,NaN,-1]) {
    const registry=new CampaignRuleRegistry();
    registry.register({id:'mod.stats',version:'1',service:'fleetStats',apiVersion:1,capabilities:[],methods:{resolve:()=>({cargo:{spaceUsed:11,capacity:222,fuelCapacity:333,crew:4,marines:5,personnelCapacity:444}})}});
    registry.register({id:'mod.logistics',version:'1',service:'logistics',apiVersion:1,capabilities:[],methods:{quote:()=>({totalSuppliesPerDay:7,maintenancePerDay:6,recoveryPerDay:1,fuelPerLightYear:8,...(value===undefined?{}:{repairSuppliesPerDay:value})})}});
    const custom=registry.compile({id:'mod.campaign',version:'1',providers:{fleetStats:'mod.stats',logistics:'mod.logistics'}}),w=structuredClone(createDevelopmentCampaign());w.rules=custom.lock;w.extensions={};
    const p=projectCampaignPlayer(w,'captain-a',custom).fleets[0].private;
    if(value===17||value===undefined) {assert.equal(p.logistics.repairSuppliesPerDay,value??null);assert.equal(p.logistics.suppliesPerDay,7);}
    else {assert.equal(p.logistics,null);assert.ok(p.logisticsUnavailable);}
  }
});
