import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeNetworkRecord, parseNetworkConsole, NetworkDiagnosticBuffer, NETWORK_LOG_PREFIX, MAX_RECORD_BYTES } from '../desktop/network-diagnostic-record.mjs';
import { DesktopNetworkLog } from '../desktop/network-log.mjs';
const sample = (extra = {}) => ({ version: 1, event: 'sample', transport: 'lan', build: '2026-09-19T09:19:59.837Z',
  monotonicMs: 1000, wallTimeMs: 100000, role: 'guest', seat: 1, hudAgeMs: 10, pipelineAgeMs: 100, steamAgeMs: 100,
  hud: { hz: 17, appliedHz: 16, fps: 60, bytes: 328200, authority: { ageMs: 10, flow: { windowMs: 1000, rates: { simulated: 60, produced: 60, blocked: 0 } } } },
  pipeline: { version: 1, role: 'guest', authority: { knownAgeMs: 500, stale: false, performance: { tick: 100 } }, receivers: [{ seat: 1, consumptionCredits: true, stages: { windowMs: 1000, rates: { queued: 20, skippedSocket: 0, skippedCredit: 40, consumed: 17 } } }] }, ...extra });
const message = extra => NETWORK_LOG_PREFIX + JSON.stringify(sample(extra));
test('sample preserves low Hz, zero and unknown distinctly; never clamps guest rates to target', () => {
  const r=normalizeNetworkRecord(sample()); assert.equal(r.hud.hz,17); assert.equal(r.hud.parse,null);
  assert.equal(r.hud.authority.flow.rates.blocked,0); assert.equal(r.pipeline.receivers[0].stages.rates.skippedCredit,40);
  assert.equal(r.hudFresh,true); assert.equal(r.pipelineFresh,true);
});
test('allowlist strips identities, URLs, credentials, raw world and free text at every level', () => {
  const secret={token:'SECRET',name:'SECRET',ip:'SECRET',steamId:'SECRET',matchId:'SECRET',reason:'SECRET'};
  const r=normalizeNetworkRecord(sample({...secret,hud:{...sample().hud,...secret,world:secret},
    pipeline:{...sample().pipeline,...secret,receivers:[{...secret,...sample().pipeline.receivers[0]}]},
    steam:{...secret,role:'guest',nativeHostSession:{...secret,available:true,usingRelay:false,queuedBytes:1024}}}));
  assert.ok(!JSON.stringify(r).includes('SECRET')); assert.equal(r.steam.nativeHostSession.usingRelay,false);
});
test('stale HUD, heartbeat, Steam and authority become unknown; report age is not copied into RTT', () => {
  const r=normalizeNetworkRecord(sample({hudAgeMs:2501,pipelineAgeMs:5001,steamAgeMs:5001}));
  assert.equal(r.hud,null); assert.equal(r.pipeline,null);assert.equal(r.lan,null);assert.equal(r.steam,null);
  const a=normalizeNetworkRecord(sample({pipelineAgeMs:4600})); assert.equal(a.pipeline.authority.performance,null);assert.equal(a.hud.rtt,null);
  const b=sample(); b.hud.authority.ageMs=3000;assert.equal(normalizeNetworkRecord(b).hud.authority,null);
});
test('nonfinite, negative, arbitrary event/build and oversized input rejected or unknown', () => {
  assert.equal(normalizeNetworkRecord(sample({event:'SECRET'})),null);assert.equal(normalizeNetworkRecord(sample({transport:'secret'})),null);
  const r=normalizeNetworkRecord(sample({build:'SECRET',hud:{hz:NaN,fps:Infinity,age:-1}}));
  assert.equal(r.build,null);assert.equal(r.hud.hz,null);assert.equal(r.hud.fps,null);assert.equal(r.hud.age,null);
  assert.equal(parseNetworkConsole('hello'),null);assert.equal(parseNetworkConsole(NETWORK_LOG_PREFIX+'{'),null);
  assert.equal(parseNetworkConsole(NETWORK_LOG_PREFIX+' '.repeat(MAX_RECORD_BYTES)),null);
});
test('receiver arrays bounded, detached and stable after original objects mutate', () => {
  const s=sample();s.pipeline.receivers=Array.from({length:100},()=>sample().pipeline.receivers[0]);
  const r=normalizeNetworkRecord(s);assert.equal(r.pipeline.receivers.length,9);s.pipeline.receivers[0].stages.rates.queued=999;
  assert.equal(r.pipeline.receivers[0].stages.rates.queued,20);assert.ok(JSON.stringify(r).length<MAX_RECORD_BYTES);
});
test('Steam keeps actual ACK gating enums, application bytes and unknown consumption credits', () => {
  const r=normalizeNetworkRecord(sample({transport:'steam',steam:{mode:'legacy-p2p',role:'host',peers:[{blockedBy:'renderer-consumption',lastSnapshotSkip:'wire-byte-window',lastSnapshot:{rawBytes:300000,wireBytes:95000,fragments:12}}]}}));
  assert.equal(r.steam.peers[0].blockedBy,'renderer-consumption');assert.equal(r.steam.peers[0].lastSnapshot.wireBytes,95000);
});
test('ring retains disconnect and recovery across battles with bounded record count', () => {
  const ring=new NetworkDiagnosticBuffer({maxRecords:3});
  for(const [i,event] of ['sample','reconnecting','disconnected','battle-stop','welcome'].entries())ring.write(sample({event,monotonicMs:i*1000}));
  const rows=ring.text().trim().split('\n').map(JSON.parse);assert.equal(rows[0].records,3);assert.equal(rows[0].dropped,2);
  assert.deepEqual(rows.slice(1).map(r=>r.event),['disconnected','battle-stop','welcome']);
});
test('byte bound, error storm rate limit, broken sink and long sampling gaps are nonfatal', () => {
  const ring=new NetworkDiagnosticBuffer({maxBytes:12000,sink:()=>{throw Error('console unavailable');}});
  for(let i=0;i<100;i++)ring.write(sample({event:'error',sampleGapMs:9000}));
  assert.equal(ring.windowCount,12);assert.ok(ring.bytes<=12000);assert.ok(ring.dropped>=88);
  assert.equal(ring.write(sample({monotonicMs:10000,sampleGapMs:9000})),true);
  const last=JSON.parse(ring.rows.at(-1).line);assert.equal(last.sampleGapMs,9000);
});
test('desktop writes only validated trusted messages, reports drops and survives filesystem failure', async () => {
  const writes=[];let fail=true;
  const log=new DesktopNetworkLog('test',{io:{stat:async()=>({size:0}),appendFile:async(_f,line)=>{if(fail)throw Error('disk full');writes.push(line);}},now:()=>1000});
  assert.equal(log.accept(message(),false),false);assert.equal(log.accept('other log',true),false);
  assert.equal(log.accept(message(),true),true);await log.flush();assert.equal(log.dropped,1);
  fail=false;log.accept(message(),true);await log.flush();assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0]).desktopDropped,1);
});
test('desktop pending queue cannot grow with a stalled disk', async () => {
  let release;const wait=new Promise(r=>release=r);let writes=0;
  const log=new DesktopNetworkLog('test',{maxPending:2,io:{stat:async()=>({size:0}),appendFile:async()=>{await wait;writes++;}}});
  assert.equal(log.accept(message(),true),true);assert.equal(log.accept(message(),true),true);assert.equal(log.accept(message(),true),false);
  assert.equal(log.pending,2);release();await log.flush();assert.equal(writes,2);assert.equal(log.pending,0);
});
test('desktop independently limits console spam and resumes next window', async () => {
  let now=0;const log=new DesktopNetworkLog('test',{now:()=>now,io:{stat:async()=>({size:0}),appendFile:async()=>{}}});
  for(let i=0;i<12;i++){assert.equal(log.accept(message(),true),true);await log.flush();}
  assert.equal(log.accept(message(),true),false);now=1001;assert.equal(log.accept(message(),true),true);await log.flush();
});
test('real filesystem appends beyond the former limit without rotating or losing early rows', async () => {
  await fs.mkdir(path.resolve('artifacts'),{recursive:true});
  const dir=await fs.mkdtemp(path.resolve('artifacts/network-log-test-'));
  const file=path.join(dir,'network-performance.jsonl');let now=0;
  const log=new DesktopNetworkLog(file,{maxBytes:4500,now:()=>now});
  for(let i=0;i<12;i++){now+=1000;assert.equal(log.accept(message({battle:i}),true),true);await log.flush();}
  const current=await fs.readFile(file,'utf8');
  assert.ok(Buffer.byteLength(current)>4500);
  assert.deepEqual(current.trim().split('\n').map(line=>JSON.parse(line).battle),Array.from({length:12},(_,i)=>i));
  await assert.rejects(fs.stat(file+'.previous'),{code:'ENOENT'});
});

test('export preserves ACK path stages, exact host consumption and native unavailability without identities',()=>{
 const r=normalizeNetworkRecord(sample({transport:'steam',steam:{mode:'legacy-p2p',role:'guest',receipts:{rendererPending:1,rendererWritten:12,networkAttempts:12,networkAccepted:11,networkErrors:1,networkAgeMs:42,secret:'SECRET'},
  polling:{calls:70,packetsRead:12,maxGapMs:1001,errors:2,secret:'SECRET'},
  nativeHostSession:{available:false,reason:'interface-unavailable',ip:'SECRET'},
  peers:[{ackedStates:12,sentStates:15,consumption:{enabled:true,inflight:3,consumed:12,oldestMs:8100,rawBytes:2000},nativeSession:{available:false,reason:'SECRET'}}]}}));
 assert.equal(r.steam.receipts.networkErrors,1);assert.equal(r.steam.receipts.consumptionAccepted,null);assert.equal(r.steam.polling.maxGapMs,1001);
 assert.equal(r.steam.peers[0].consumption.inflight,3);assert.equal(r.steam.peers[0].ackedStates,12);assert.equal(r.steam.nativeHostSession.reason,'interface-unavailable');
 assert.equal(r.steam.peers[0].nativeSession.reason,null);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('bounded per-transport lifecycle summaries survive sample eviction without pretending old Steam samples remain',()=>{
 const ring=new NetworkDiagnosticBuffer({maxRecords:3});
 ring.write(sample({event:'battle-failed',transport:'steam',battle:1,failureStage:'worker-runtime',reason:'SECRET',monotonicMs:1}));
 ring.write(sample({event:'disconnected',transport:'steam',monotonicMs:2}));
 for(let i=1;i<=20;i++)ring.write(sample({transport:'lan',monotonicMs:i*1000}));
 const [header,...rows]=ring.text().trim().split('\n').map(JSON.parse);
 assert.deepEqual(header.retainedByTransport,{lan:3,steam:0});assert.deepEqual(header.writtenByTransport,{lan:20,steam:2});assert.deepEqual(header.evictedByTransport,{lan:17,steam:2});
 assert.equal(header.latestEvents.find(e=>e.event==='battle-failed').failureStage,'worker-runtime');assert.equal(header.latestEvents.length,2);assert.ok(rows.every(r=>r.transport==='lan'));assert.ok(!ring.text().includes('SECRET'));
 ring.write(sample({event:'battle-failed',transport:'steam',battle:2,failureStage:'SECRET',monotonicMs:22000}));
 const latest=JSON.parse(ring.text().split('\n')[0]).latestEvents;assert.equal(latest.length,2);assert.equal(latest.at(-1).battle,2);assert.equal(latest.at(-1).failureStage,null);
 assert.ok(JSON.stringify(header).length<MAX_RECORD_BYTES);
});
test('nine complete Steam receipt/consumption diagnostics fit the existing record budget',()=>{
 const numberFields='rendererPending rendererWritten rendererWriteErrors maxRendererWriteMs networkAttempts networkAccepted networkErrors consumptionAttempts consumptionAccepted consumptionErrors fastAttempts fastAccepted fastRejected networkAgeMs consumptionAgeMs';
 const receipts=Object.fromEntries(numberFields.split(' ').map(k=>[k,Number.MAX_SAFE_INTEGER]));
 const peer={inflight:32,window:32,inflightBytes:65536,oldestAckMs:8000,ackMs:300,baseAckMs:100,sentStates:10000,skippedStates:9000,ackedStates:9000,
  consumption:{enabled:true,inflight:32,bytes:65536,rawBytes:33554432,consumed:9000,oldestMs:8000},nativeSession:{available:true,active:true,connecting:false,usingRelay:true,queuedBytes:65536,queuedPackets:32,errorCode:0,sampleAgeMs:1000},
  lastSnapshot:{rawBytes:800000,wireBytes:60000,fragments:2,prepareMs:4},delta:{fullStates:100,deltaStates:9000,legacyStates:0}};
 const record=normalizeNetworkRecord(sample({transport:'steam',steam:{mode:'legacy-p2p',role:'host',receipts,peers:Array.from({length:9},()=>peer)}}));
 assert.ok(new TextEncoder().encode(JSON.stringify(record)).length<MAX_RECORD_BYTES);const ring=new NetworkDiagnosticBuffer();assert.equal(ring.write(record),true);
});


test('control-lane diagnostics preserve counters but never capability, URL or identity', () => {
  const r = normalizeNetworkRecord(sample({ lan: { mode: 'lan-websocket', role: 'guest', receivers: [{
    seat: 2, controlLane: { active: true, received: 12, sent: 7, fallbacks: 2, bufferedBytes: 0,
      token: 'SECRET', url: 'SECRET', primary: { name: 'SECRET' }, peer: { id: 'SECRET' } }
  }] } }));
  assert.deepEqual(r.lan.receivers[0].controlLane, { active: true, received: 12, sent: 7, fallbacks: 2, bufferedBytes: 0, motionWire:null });
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('layered state metrics retain real rates/windows without leaking entity data',()=>{
 const record=normalizeNetworkRecord(sample({hud:{motionHz:58,motionAgeMs:12,motionTick:999,hz:4.6,fps:144},lan:{mode:'lan-websocket',role:'guest',receivers:[{seat:1,detailSkipped:300,motion:{active:true,fresh:false,sent:100,consumed:99,skipped:12,inflight:1,bytes:1800,capacity:4,idleRttMs:60,deliveryHz:58,acknowledgementMs:75,detailIntervalMs:200,data:'SECRET',ships:['SECRET']}}]}}));
 assert.equal(record.hud.motionHz,58);assert.equal(record.hud.hz,4.6);assert.equal(record.hud.fps,144);
 assert.equal(record.lan.receivers[0].motion.fresh,false);assert.equal(record.lan.receivers[0].motion.idleRttMs,60);assert.equal(record.lan.receivers[0].detailSkipped,300);
 assert.ok(!JSON.stringify(record).includes('SECRET'));
});

test('codec-work deferral is reported distinctly from network/renderer ACK starvation',()=>{
 const r=normalizeNetworkRecord(sample({transport:'steam',steam:{mode:'legacy-p2p',role:'host',peers:[{lastSnapshotSkip:'codec-work-budget'}]},lan:{mode:'lan-websocket',role:'guest',receivers:[{seat:1,codecDeferred:7}]}}));
 assert.equal(r.steam.peers[0].lastSnapshotSkip,'codec-work-budget');assert.equal(r.lan.receivers[0].codecDeferred,7);
});
test('chunk scheduler diagnostics separate transport delivery, cancellation debt and teardown loss without tokens',()=>{
 const record=normalizeNetworkRecord(sample({lan:{mode:'lan-websocket',role:'host',bulk:{adaptive:true,wireBytes:20480,flightBytes:4096,retiredBytes:2048,abandonedBytes:10240,retainedBytes:80000,ownedJobs:2,jobs:1,receipts:10,completed:1,limit:8192,token:'SECRET',ledger:'SECRET'},receivers:Array.from({length:9},(_,seat)=>({seat,bulkChunks:true,chunkDeferred:33,codecDeferred:5}))}}));
 assert.equal(record.lan.bulk.wireBytes,20480);assert.equal(record.lan.bulk.abandonedBytes,10240);assert.equal(record.lan.bulk.retiredBytes,2048);
 assert.equal(record.lan.bulk.completed,1);assert.equal(record.lan.receivers[0].chunkDeferred,33);assert.equal(record.lan.receivers[8].bulkChunks,true);
 assert.ok(!JSON.stringify(record).includes('SECRET'));assert.ok(Buffer.byteLength(JSON.stringify(record))<MAX_RECORD_BYTES);
 const ring=new NetworkDiagnosticBuffer();assert.equal(ring.write(record),true);
 const unknown=normalizeNetworkRecord(sample({lan:{mode:'lan-websocket'}}));assert.equal(unknown.lan.bulk,null);
});

test('capture demand and projectile credits survive normalization without payloads, epochs or identities',()=>{
 const r=normalizeNetworkRecord(sample({hud:{input:{projectileVisuals:{tick:123,received:40,entities:90,rows:['SECRET']}}},lan:{mode:'lan-websocket',captureDemand:{held:true,reason:'relay',heldTick:123,heldMs:200,granted:30,withheld:29,worker:'SECRET'},projectileVisuals:{publications:50,sent:49,fragment:5,consumed:44,flightBytes:7000,baseline:'SECRET'},receivers:[{seat:1,visualBulkSent:3}]}}));
 assert.equal(r.lan.captureDemand.held,true);assert.equal(r.lan.captureDemand.reason,'relay');assert.equal(r.lan.captureDemand.withheld,29);
 assert.equal(r.lan.projectileVisuals.fragment,5);assert.equal(r.lan.receivers[0].visualBulkSent,3);assert.equal(r.hud.input.projectileVisuals.received,40);
 assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(Buffer.byteLength(JSON.stringify(r))<MAX_RECORD_BYTES);
 const absent=normalizeNetworkRecord(sample());assert.equal(absent.lan,null);assert.equal(absent.hud.input,null);
});

test('motion wire diagnostics count actual full/delta admissions without serializing the retained base',()=>{
 const r=normalizeNetworkRecord(sample({lan:{mode:'lan-websocket',receivers:[{seat:1,controlLane:{active:true,motionWire:{full:1,delta:30,rawBytes:43000,packetBytes:23000,fallbacks:2,retainedBytes:1388,base:'SECRET',scope:'SECRET',choices:'SECRET'}}}]}}));
 assert.equal(r.lan.receivers[0].controlLane.motionWire.delta,30);assert.equal(r.lan.receivers[0].controlLane.motionWire.retainedBytes,1388);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('critical combat clocks, browser receipt debt and wire costs remain distinct from motion/whole-world Hz',()=>{
 const r=normalizeNetworkRecord(sample({hud:{input:{criticalCombat:{tick:20,hz:19.5,ageMs:52,frame:'SECRET'}}},lan:{mode:'lan-websocket',criticalCombat:{publications:20,sent:40,consumed:35,discarded:2,abandonedBytes:900,wireBytes:5000,retainedBytes:700,payload:'SECRET'},receivers:[{seat:1,combat:{tick:19,inflight:2,bytes:1700,acknowledgementMs:120,scope:'SECRET'}}]}}));
 assert.equal(r.hud.input.criticalCombat.hz,19.5);assert.equal(r.lan.criticalCombat.discarded,2);assert.equal(r.lan.receivers[0].combat.inflight,2);assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('relay decode diagnostics retain real activation counters, detach, strip secrets and expire',()=>{
  const source=sample();source.pipeline.relayDecode={metadataFrames:17,fullFrames:2,lastMs:0.81,token:'SECRET',frame:{ships:['SECRET']}};
  const result=normalizeNetworkRecord(source);
  assert.deepEqual(result.pipeline.relayDecode,{metadataFrames:17,fullFrames:2,lastMs:0.81});assert.ok(!JSON.stringify(result).includes('SECRET'));
  source.pipeline.relayDecode.metadataFrames=99;assert.equal(result.pipeline.relayDecode.metadataFrames,17);
  source.pipelineAgeMs=5001;assert.equal(normalizeNetworkRecord(source).pipeline,null);
});

test('local firing diagnostics distinguish predictions, matches and no-projectile resolutions without leaking state',()=>{
  const source=sample();source.hud.input={firePrediction:{predicted:8,matched:4,resolvedWithoutProjectile:2,expired:1,suppressed:3,pending:1,lastResponseMs:16.667,shipId:'SECRET',projectiles:['SECRET']}};
  const r=normalizeNetworkRecord(source);assert.equal(r.hud.input.firePrediction.predicted,8);assert.equal(r.hud.input.firePrediction.pending,1);
  assert.equal(r.hud.input.firePrediction.lastResponseMs,16.667);assert.ok(!JSON.stringify(r).includes('SECRET'));
  source.hudAgeMs=2501;assert.equal(normalizeNetworkRecord(source).hud,null);
});

test('render culling reports active flags and frame work without raw scene data', () => {
  const hud={...sample().hud,renderCulling:{spritesEnabled:true,hullOverlaysEnabled:false,shipSpritesRejected:123,hullOverlaysRejected:0,world:'SECRET'}};
  assert.deepEqual(normalizeNetworkRecord(sample({hud})).hud.renderCulling,{spritesEnabled:true,hullOverlaysEnabled:false,shipSpritesRejected:123,hullOverlaysRejected:0});
  assert.equal(normalizeNetworkRecord(sample()).hud.renderCulling,null);
  hud.renderCulling.shipSpritesRejected=Infinity;
  assert.equal(normalizeNetworkRecord(sample({hud})).hud.renderCulling.shipSpritesRejected,null);
});
test('serializer diagnostics distinguish explicit opt-in, real progress, and failure without logging arbitrary reasons',()=>{
 for(const reason of ['opt-in','active','job-timeout','no-shared-memory']){
  const input=sample();input.hud.authority.serializer={enabled:reason==='active',reason,ready:reason==='active',busy:false,submitted:12,completed:11,fallbacks:0,prepareMs:1,workerMs:2,transferBytes:4096};
  const result=normalizeNetworkRecord(input).hud.authority.serializer;assert.equal(result.reason,reason);assert.equal(result.completed,11);assert.equal(result.enabled,reason==='active');
 }
 const input=sample();input.hud.authority.serializer={reason:'SECRET',url:'SECRET',enabled:false};assert.ok(!JSON.stringify(normalizeNetworkRecord(input)).includes('SECRET'));
});
test('capture plan diagnostics preserve actual reuse counts separately from network Hz',()=>{
 const input=sample();input.hud.authority.capturePlans={enabled:true,hits:1200,compiled:80,fallbacks:1,shapes:79,world:'SECRET'};
 const result=normalizeNetworkRecord(input);assert.deepEqual(result.hud.authority.capturePlans,{enabled:true,hits:1200,compiled:80,fallbacks:1,shapes:79});assert.equal(result.hud.hz,17);assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('movement prediction diagnostics report real activation and bounded errors, never fake network Hz',()=>{
 const source=sample();source.hud.input={motionPrediction:{active:true,reason:'active',renderedFrames:60,suspendedFrames:4,reconciliations:10,hardSnaps:1,correctionDistance:2.5,correctionAngleDeg:1,replayMs:50,pendingInputs:3,ship:'SECRET',keys:'SECRET'}};
 const r=normalizeNetworkRecord(source);assert.equal(r.hud.input.motionPrediction.active,true);assert.equal(r.hud.input.motionPrediction.replayMs,50);assert.equal(r.hud.hz,17);assert.ok(!JSON.stringify(r).includes('SECRET'));
 source.hud.input.motionPrediction.reason='SECRET';source.hud.input.motionPrediction.correctionDistance=Infinity;
 const invalid=normalizeNetworkRecord(source).hud.input.motionPrediction;assert.equal(invalid.reason,null);assert.equal(invalid.correctionDistance,null);
 source.hudAgeMs=2501;assert.equal(normalizeNetworkRecord(source).hud,null);
});

test('local turret and held-repeat telemetry is bounded, privacy-safe and separate from Hz',()=>{
 const source=sample();source.hud.input={turretPrediction:{active:true,reason:'active',renderedFrames:60,reconciliations:10,hardSnaps:0,mounts:2,pendingInputs:3,angles:'SECRET'},firePrediction:{predicted:10,repeated:8,observedCycles:1,recoveredCycles:2}};
 const r=normalizeNetworkRecord(source);assert.equal(r.hud.input.turretPrediction.mounts,2);assert.equal(r.hud.input.firePrediction.repeated,8);assert.equal(r.hud.input.firePrediction.recoveredCycles,2);assert.equal(r.hud.hz,17);assert.ok(!JSON.stringify(r).includes('SECRET'));
 source.hud.input.turretPrediction.reason='SECRET';assert.equal(normalizeNetworkRecord(source).hud.input.turretPrediction.reason,null);
});

test('projectile flight diagnostics report display work, not authority Hz or identities',()=>{
 const source=sample();source.hud.input={projectileFlight:{active:true,tick:10,entities:43,renderedFrames:60,extrapolationMs:100,projectiles:'SECRET'}};
 const r=normalizeNetworkRecord(source);assert.equal(r.hud.input.projectileFlight.entities,43);assert.equal(r.hud.input.projectileFlight.active,true);
 assert.equal(r.hud.hz,17);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
