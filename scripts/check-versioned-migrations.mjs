import assert from 'node:assert/strict';
import test from 'node:test';
import {createVersionedMigration} from '../src/shared/VersionedMigration.mjs';
import {createNativeCheckpointMigrations,NATIVE_CHECKPOINT_SCHEMA} from '../server/campaign/native/NativeCheckpointMigrations.mjs';
import {encodeOfflineCheckpoint,decodeOfflineCheckpoint} from '../server/campaign/native/CheckpointCodec.mjs';

// Exercise historical transforms independently of source-data/bootstrap availability.
// The production owner injects its existing validated native factories unchanged.
const nativeCheckpointMigrations=createNativeCheckpointMigrations({
  createOriginalCampaignContrails:()=>({scope:'native-campaign-contrail-engine-v2',contrails:[]}),
  createNativeExperienceOutbox:()=>({scope:'web-native-experience-outbox',entries:[]}),
  createNativePromotionConfirmations:()=>({scope:'web-native-promotion-confirmations',next:'1',active:null}),
  validateNativePromotionConfirmations:s=>assert.equal(s.scope,'web-native-promotion-confirmations'),
});

const registration = steps => createVersionedMigration({family:'fixture',currentVersion:3,copy:structuredClone,version:s=>s.version,steps});
test('migration registration rejects holes, jumps and duplicate source versions', () => {
  assert.throws(()=>registration([{from:1,to:2,migrate:s=>s}]), /Missing/);
  assert.throws(()=>registration([{from:1,to:3,migrate:s=>s}]), /Invalid/);
  assert.throws(()=>registration([{from:2,to:3,migrate:s=>s},{from:2,to:3,migrate:s=>s}]), /duplicate/);
});
test('migrations preserve graph identity and source data even when a later step fails', () => {
  const shared={count:0}, input={version:1,a:shared,b:shared};input.self=input;
  const first={from:1,to:2,migrate(s){s.a.count++;s.version=2;return s;}};
  const migrations=registration([first,{from:2,to:3,migrate(s){s.version=3;return s;}}]);
  first.migrate=()=>{throw Error('mutated registration');};
  const result=migrations.migrate(input);
  assert.equal(result.version,3);assert.equal(result.a,result.b);assert.equal(result.self,result);
  assert.equal(result.a.count,1);assert.equal(input.version,1);assert.equal(input.a.count,0);
  assert.throws(()=>registration([{from:1,to:2,migrate(s){s.a.count=9;s.version=2;return s;}},{from:2,to:3,migrate(){throw Error('domain validation');}}]).migrate(input),/domain validation/);
  assert.equal(input.a.count,0);
  assert.throws(()=>migrations.migrate({version:4}),/Unsupported/);
  assert.throws(()=>registration([{from:2,to:3,migrate:s=>s}]).migrate({version:2}),/did not produce/);
});
test('all 37 existing native schema steps are contiguous and preserve legacy unknowns', () => {
  const source={scope:'web-native-live-economy-checkpoint',schemaVersion:1,markets:[],loadInputs:[]};
  const input=encodeOfflineCheckpoint(source), bytes=JSON.stringify(input), result=nativeCheckpointMigrations.migrate(input);
  assert.equal(nativeCheckpointMigrations.steps.length,37);assert.equal(result.schemaVersion,NATIVE_CHECKPOINT_SCHEMA);
  assert.equal(result.nativeSchedule,null);assert.equal(result.notificationMode,null);assert.equal(result.fleetServices,null);
  assert.deepEqual(result.encounters,{scope:'web-retained-native-encounters',serial:0,entries:[]});
  assert.deepEqual(result.experienceOutbox,{scope:'web-native-experience-outbox',entries:[]});
  assert.equal(result.promotionConfirmations.active,null);assert.equal(result.promotionConfirmations.next,'1');
  assert.equal(JSON.stringify(input),bytes);assert.equal(decodeOfflineCheckpoint(input).schemaVersion,1);
});
test('native v19 movement migration retains actual shared velocity identity', () => {
  const velocity={x:1,y:2}, entityVelocity={x:3,y:4};
  const fleet={logisticsEnvironment:{velocity},sensorProfile:10,sensorStrength:20,campaign:{movement:{velocity},entity:{velocity:entityVelocity}}};
  const input=encodeOfflineCheckpoint({scope:'web-native-live-economy-checkpoint',schemaVersion:19,fleetServices:{dataFactory:{fleets:[fleet]}}});
  const bytes=JSON.stringify(input), result=nativeCheckpointMigrations.migrate(input), migrated=result.fleetServices.dataFactory.fleets[0];
  assert.equal(migrated.logisticsEnvironment.velocity,migrated.campaign.entity.velocity);
  assert.notEqual(migrated.logisticsEnvironment.velocity,migrated.campaign.movement.velocity);
  assert.equal(migrated.campaign.entity.sensorProfile,10);assert.equal(JSON.stringify(input),bytes);
});
test('native loot migration protects shared sources, rejects injected history and unknown versions', () => {
  const loot={items:[]}, source={scope:'web-native-live-economy-checkpoint',schemaVersion:32,encounters:{entries:[{context:{loot},lootTransaction:{loot}}]}};
  const result=nativeCheckpointMigrations.migrate(encodeOfflineCheckpoint(source)), entry=result.encounters.entries[0];
  assert.equal(entry.lootTransaction.sourceLoot,entry.context.loot);assert.equal(entry.lootTransaction.legacySharedSource,true);
  assert.equal(entry.lootTransaction.panelConfirmed,false);
  const invalid=encodeOfflineCheckpoint({...source,experienceOutbox:{entries:[]}}), bytes=JSON.stringify(invalid);
  assert.throws(()=>nativeCheckpointMigrations.migrate(invalid),/Older checkpoint cannot contain experience delivery history/);
  assert.equal(JSON.stringify(invalid),bytes);
  assert.throws(()=>nativeCheckpointMigrations.migrate(encodeOfflineCheckpoint({...source,schemaVersion:39})),/Unsupported/);
});
test('native migration preserves defense aliases and refuses invented contrail/promotion history', () => {
  const defense={flat:[],percent:[],mult:[]},market={marketId:'fixture',governedState:{groundDefenses:defense},economyBonuses:{}};
  const result=nativeCheckpointMigrations.migrate(encodeOfflineCheckpoint({scope:'web-native-live-economy-checkpoint',schemaVersion:5,markets:[market],loadInputs:[['fixture',{input:{governedSkills:{groundDefenses:defense}}}]]}));
  assert.equal(result.markets[0].groundDefenses,result.markets[0].governedState.groundDefenses);
  assert.equal(result.markets[0].groundDefenses,result.markets[0].economyBonuses.ground_defenses_mod);
  const contrails={scope:'web-native-live-economy-checkpoint',schemaVersion:24,fleetServices:{dataFactory:{fleets:[{campaign:{view:{contrails:{contrails:[{point:1}]}}}}]}}};
  const input=encodeOfflineCheckpoint(contrails),bytes=JSON.stringify(input);
  assert.throws(()=>nativeCheckpointMigrations.migrate(input),/nonempty contrail history/);assert.equal(JSON.stringify(input),bytes);
  assert.throws(()=>nativeCheckpointMigrations.migrate(encodeOfflineCheckpoint({scope:'web-native-live-economy-checkpoint',schemaVersion:37,promotionConfirmations:{scope:'web-native-promotion-confirmations',next:'2',active:null}})),/promotion confirmation history/);
});
