import {attachAuthorityAdmission, createAuthorityAdmission, writeAuthorityAdmission, closeAuthorityAdmission, isAuthoritySnapshotBlocked} from '../src/network/AuthorityIoAdmission.mjs';
import {attachAuthorityCompletion, readAuthorityCompletion, createAuthorityCompletion, writeAuthorityCompletion, closeAuthorityCompletion} from '../src/network/AuthorityLocalCompletion.mjs';
import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {transform} from 'esbuild';
import {encodeProjectedBinaryFrame,decodeBinaryFrame,ProjectionEncodingCache} from '../src/network/BinarySnapshot.mjs';
import {normalizeNetworkRecord,summarizeNetworkFailure} from '../desktop/network-diagnostic-record.mjs';
// Function extraction must supply the real authority facade used by the worker.
const authorityCode=(await transform(fs.readFileSync('src/engine/runtime/CombatAuthority.ts','utf8'),{loader:'ts',format:'esm',target:'es2022'})).code;
const {CombatAuthority}=await import('data:text/javascript;base64,'+Buffer.from(authorityCode).toString('base64'));
const source=fs.readFileSync('src/network/host.worker.ts','utf8');
async function compile(source,env={}){const ast=ts.createSourceFile('host.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const names=['consumeSnapshotSounds','cancelSnapshotEncoding','ensureSnapshotEncoder','flushSnapshotEncoding','snapshot','acceptIoSnapshot','pollIoCompletion','acknowledgeSnapshot','handleMessage','clearControls','recover','fail','step'];return (await transform(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{loader:'ts',target:'es2022',define:{'import.meta.env':JSON.stringify(env)}})).code;}
const compiled=await compile(source);
function fixture(code=compiled){
 const shown=[],published=[],events=[],captures=[];let clock=0;const port={postMessage:(m,transfer=[])=>published.push(structuredClone(m,{transfer})),start(){},close(){}};
 const ship={id:'player',clearInput(){c.engine.value=-1;}};
 const c={summarizeNetworkFailure,serializerStartupFailed:false,snapshotEncoderWorker:null,pendingEncoding:null,ProjectionEncodingCache,encodedFragmentReuses:0,attachAuthorityAdmission,isAuthoritySnapshotBlocked,directAdmission:null,attachAuthorityCompletion,readAuthorityCompletion,directCompletion:null,motionInFlight:null,CombatAuthority,authorityRuntime:null,tick:1,lastSnapshotTick:0,snapshotInFlight:0,directReady:true,directLaunched:true,directInFlight:null,directLastTick:0,directSequence:0,directAttempt:0,directRetryAt:0,directIo:port,directFinish:null,
 capturedFrame:null,captures:0,captureReuses:0,running:true,steppingLifecycle:null,lifecycle:1,engine:{projectiles:[],value:1,externallyControlledShipIds:new Set(),combatTime:0,isBattleResultReady:false,fixedUpdate(dt){this.value++;this.combatTime+=dt;},deployment:{deploy(){c.engine.value=7;},requestRetreat(){c.engine.value=8;}}},
 controls:new Map([[0,{acknowledged:3,input:{seq:0,aim:[0,0]},queued:[],lastAction:-1,connected:true,online:true}]]),controlled:new Map([[0,ship]]),elapsedCost:0,samples:0,captureMs:0,encodeMs:0,muzzleEvents:null,compactParticles:true,localParticles:true,
 captureAuthorityCombat:(engine,tick,acknowledged,simulationMs)=>{captures.push(tick);return{tick,acknowledged,simulationMs,ships:[],world:{value:engine.value,combatTime:tick/60}};},performance:{now:()=>clock},LAN_SNAPSHOT_HZ:60,measureClock(){},realtimeRatio:1,combatRate:1,sounds:[],networkSounds:[],soundId:0,authoritySummaryShips:null,binarySnapshots:true,visualEnabled:false,
 snapshotEncoder:new TextEncoder(),encodeProjectedBinaryFrame,snapshotFlow:{count(){},reset(){}},ioFlow:{count(){}},ioStats:{sent:0,skipped:0,inputs:0,sharedCompletions:0,preflightSkips:0},send:(m,transfer=[])=>{if(m.type==='snapshot')shown.push(structuredClone(m,{transfer}));else events.push(structuredClone(m));},diagnostics(){return{};},multicore:null,timer:undefined,clearInterval(){},setInterval(){return 1;},aiBudget:{reset(){}},background:false,foregroundPending:false,backgroundThrottled:false,last:0,lastCallbackFinishedAt:0,accumulator:0,telemetryAt:0,lastStepMs:0,maxStepMs:0,config:{backgroundGraceMs:300000},recoveryBudget:{allow:()=>true},motionSnapshot(){},combatSnapshot(){},visualSnapshot(){},yieldHostTask:async()=>{},applyPlayerControls(){},Vector2:class{},DEFAULT_MOUSE_STEERING:false,deploymentReplies:new Map(),
 };
 c.captureLanDisplayCombat=(...args)=>c.captureAuthorityCombat(...args);
 c.authorityRuntime=new CombatAuthority(c.engine);
 vm.createContext(c);vm.runInContext(code,c);return{c,shown,published,events,captures,port,at:t=>clock=t};
}
const frame=m=>m.binary?decodeBinaryFrame(m.binary):JSON.parse(m.json);
test('actual network-first publication reuses exactly one projection for delayed display credit',()=>{
 const f=fixture();f.c.snapshot();assert.equal(f.c.captures,1);assert.ok(f.c.capturedFrame);assert.equal(f.shown.length,0);assert.equal(f.published.length,1);
 f.c.acknowledgeSnapshot(999);assert.equal(f.c.captureReuses,0);f.c.acknowledgeSnapshot(0);
 assert.equal(f.c.captures,1);assert.equal(f.c.captureReuses,1);assert.equal(f.c.capturedFrame,null);assert.deepEqual(frame(f.shown[0]).world,frame(f.published[0]).world);assert.equal(f.published.length,1);
});
test('display-first path reuses only on the exact I/O receipt, and drops retained frame when both lanes catch up',()=>{
 const f=fixture();f.c.handleMessage({type:'authority-port',port:f.port,matchId:'m'});Object.assign(f.c,{directReady:true,directLaunched:true,directInFlight:0,directLastTick:0,snapshotInFlight:null});f.c.snapshot();assert.ok(f.c.capturedFrame);
 f.port.onmessage({data:{type:'io-snapshot',tick:999,delivery:'sent',attempt:f.c.directAttempt,nextSequence:1}});assert.equal(f.c.captureReuses,0);
 f.port.onmessage({data:{type:'io-snapshot',tick:0,delivery:'sent',attempt:f.c.directAttempt,nextSequence:1}});assert.equal(f.c.captures,1);assert.equal(f.c.captureReuses,1);assert.equal(f.c.capturedFrame,null);
});
test('publication-owned sounds and simulation headers are never reused or replayed',()=>{
 const f=fixture();f.c.sounds=[{id:1},{id:2}];f.c.networkSounds=[{id:2}];f.c.samples=2;f.c.elapsedCost=8;f.c.snapshot();assert.deepEqual(frame(f.published[0]).sounds.map(s=>s.id),[2]);assert.equal(frame(f.published[0]).simulationMs,4);
 f.c.sounds.push({id:3});f.c.acknowledgeSnapshot(0);const displayed=frame(f.shown[0]);assert.deepEqual(displayed.sounds.map(s=>s.id),[1,2,3]);assert.equal(displayed.simulationMs,0);assert.equal(f.c.sounds.length,0);assert.equal(f.c.networkSounds.length,0);
});
test('pure input enqueue does not change projected world or acknowledge unexecuted input',()=>{
 const f=fixture();f.c.snapshot();f.c.handleMessage({type:'input',seat:0,input:{seq:5,aim:[8,9],actions:[]}});f.c.acknowledgeSnapshot(0);assert.equal(f.c.captureReuses,1);assert.equal(frame(f.shown[0]).acknowledged[0],3);
});
test('deployment, retreat and presence changes invalidate even within the same tick',()=>{
 for(const message of [{type:'deployment',operation:'deploy',ids:['x'],requestId:'a',seat:0},{type:'deployment',operation:'retreat',ids:['x'],requestId:'b',seat:0},{type:'presence',connected:true,online:false,seat:0}]){const f=fixture();f.c.snapshot();f.c.handleMessage(message);assert.equal(f.c.capturedFrame,null);f.c.acknowledgeSnapshot(0);assert.equal(f.c.captures,2);assert.equal(f.c.captureReuses,0);assert.notEqual(frame(f.shown[0]).world.value,1);}
});
test('next fixed step invalidates before mutating the engine, with no extra/dropped physics',async()=>{
 const f=fixture();f.c.snapshot();f.c.controlled.clear();f.at(17);await f.c.step();assert.equal(f.c.tick,2);assert.equal(f.c.engine.value,2);assert.equal(f.c.capturedFrame,null);f.c.acknowledgeSnapshot(0);assert.equal(frame(f.shown[0]).world.value,2);assert.equal(f.c.captures,2);
});
test('stop, start, recovery, failure and authority fallback discard retained projections',()=>{
 for(const action of [f=>f.c.handleMessage({type:'stop'}),f=>f.c.handleMessage({type:'start'}),f=>f.c.recover(30,300),f=>f.c.fail(Error('test')),f=>f.c.handleMessage({type:'authority-fallback'})]){const f=fixture();f.c.snapshot();assert.ok(f.c.capturedFrame);action(f);assert.equal(f.c.capturedFrame,null);}
});
test('legacy/single-consumer path never retains a projection; forced terminal publishes despite held credits',()=>{
 const single=fixture();single.c.directIo=null;single.c.snapshotInFlight=null;single.c.snapshot();assert.equal(single.c.capturedFrame,null);assert.equal(single.c.captureReuses,0);
 const f=fixture();f.c.snapshot();f.c.tick++;f.c.engine.value=4;f.c.snapshot(true);assert.equal(f.c.capturedFrame,null);assert.equal(frame(f.shown[0]).tick,2);assert.equal(frame(f.published.at(-1)).world.value,4);
});
test('credit-only churn does not add captures, and a new engine identity cannot hit an old cache',()=>{
 const f=fixture();f.c.snapshot();for(let i=0;i<20;i++)f.c.snapshot();assert.equal(f.c.captures,1);f.c.engine={...f.c.engine,value:9};f.c.acknowledgeSnapshot(0);assert.equal(f.c.captures,2);assert.equal(f.c.captureReuses,0);assert.equal(frame(f.shown[0]).world.value,9);
});
test('diagnostics expose actual capture/reuse counts without claiming extra physics/network Hz',()=>{
 const r=normalizeNetworkRecord({version:1,event:'sample',transport:'steam',hudAgeMs:0,hud:{hz:17,authority:{ageMs:0,captureReuse:{produced:12,reused:5,retained:true}}}});assert.deepEqual(r.hud.authority.captureReuse,{produced:12,reused:5,encodedFragments:null,retained:true});assert.equal(r.hud.hz,17);
});
// A frozen pre-change function is available in the development artifacts. Not
// required for portable CI: standalone contract tests above always run.
const baseline='artifacts/network-stream-20260921/phase19/host.before-reuse.ts';
if(fs.existsSync(baseline))test('frozen original and current publication bytes agree across 120 asymmetric ticks',async()=>{
 const before=fixture(await compile(fs.readFileSync(baseline,'utf8'))),after=fixture();
 for(let tick=1;tick<=120;tick++)for(const f of [before,after]){Object.assign(f.c,{tick,directInFlight:null,snapshotInFlight:tick-1});f.c.engine.value=tick;f.c.sounds=[{id:tick}];f.c.networkSounds=[{id:tick}];f.c.snapshot();f.c.acknowledgeSnapshot(tick-1);}
 for(const lane of ['shown','published'])for(let i=0;i<after[lane].length;i++)assert.deepEqual(new Uint8Array(after[lane][i].binary),new Uint8Array(before[lane][i].binary));
 assert.deepEqual(after.shown.map(frame),before.shown.map(frame));assert.deepEqual(after.published.map(frame),before.published.map(frame));assert.equal(after.c.captures,120);assert.equal(after.c.captureReuses,120);assert.equal(before.captures.length,240);
});
test('JSON fallback preserves fresh publication sounds and consumes the same captured world',()=>{
 const f=fixture();f.c.binarySnapshots=false;f.c.sounds=[{id:1}];f.c.networkSounds=[{id:2}];f.c.snapshot();f.c.acknowledgeSnapshot(0);
 assert.equal(f.c.captures,1);assert.equal(f.c.captureReuses,1);assert.deepEqual(frame(f.published[0]).sounds,[{id:2}]);assert.deepEqual(frame(f.shown[0]).sounds,[{id:1}]);assert.equal(f.c.capturedFrame,null);
});
test('encoding or transfer failure cannot pin a retained projection',()=>{
 for(const fail of [f=>f.c.encodeProjectedBinaryFrame=()=>{throw Error('encoding');},f=>f.c.send=()=>{throw Error('transfer');}]){
  const f=fixture();f.c.snapshot();assert.ok(f.c.capturedFrame);fail(f);assert.throws(()=>f.c.acknowledgeSnapshot(0));assert.equal(f.c.capturedFrame,null);
 }
});
test('receipt during an async step grants credit but cannot publish partially mutated state',()=>{
 const f=fixture();f.c.snapshot();f.c.steppingLifecycle=f.c.lifecycle;f.c.acknowledgeSnapshot(0);assert.equal(f.shown.length,0);assert.equal(f.c.captures,1);assert.equal(f.c.captureReuses,0);
});
test('init clears retained state and counters before publishing a new world',()=>{
 const f=fixture();f.c.snapshot();f.c.captureReuses=19;
 Object.assign(f.c,{AnchoredProjectilePublisher:class{},createLanWorld:()=>({engine:{projectiles:[],value:42,externallyControlledShipIds:new Set()},controlled:new Map()}),configureHostCosmetics:()=>null});
 f.c.handleMessage({type:'init',binarySnapshots:true,match:{id:'new',players:[],options:{aiHulls:[[],[]]}}});
 assert.deepEqual(f.events,[{type:'ready'}]);assert.equal(f.c.captures,1);assert.equal(f.c.captureReuses,0);assert.equal(frame(f.shown[0]).world.value,42);assert.equal(frame(f.shown[0]).tick,0);
});
test('atomic local completion releases next tick before a delayed receipt, without duplicate count or remote ACK',()=>{
 const f=fixture();f.c.directCompletion=createAuthorityCompletion(true);f.c.snapshot();assert.equal(f.c.directInFlight,1);
 writeAuthorityCompletion(f.c.directCompletion,'snapshot',{tick:1,nextSequence:8,delivery:'sent',attempt:f.c.directAttempt});
 f.c.tick=2;f.c.snapshot();assert.equal(f.published.length,2);assert.equal(f.c.directInFlight,2);assert.equal(f.c.directSequence,8);assert.equal(f.c.ioStats.sent,1);assert.equal(f.c.ioStats.sharedCompletions,1);
 assert.equal(f.c.acceptIoSnapshot({tick:1,nextSequence:8,delivery:'sent',attempt:f.c.directAttempt}),false);assert.equal(f.c.directInFlight,2);assert.equal(f.c.ioStats.sent,1);
 f.c.snapshot();assert.equal(f.published.length,2);assert.equal(f.c.ioStats.sent,1);
 writeAuthorityCompletion(f.c.directCompletion,'snapshot',{tick:2,nextSequence:8,delivery:'skipped',attempt:f.c.directAttempt});
 f.c.pollIoCompletion();assert.equal(f.c.directInFlight,null);assert.equal(f.c.ioStats.skipped,1);assert.equal(f.c.ioStats.sharedCompletions,2);
 assert.ok(!f.events.some(m=>m.type==='ack'||m.type==='state-consumed'));
});
test('closed/mismatched shared completion cannot free mailboxes; motion cannot free snapshot',()=>{
 const f=fixture();f.c.directCompletion=createAuthorityCompletion(true);f.c.snapshot();f.c.motionInFlight=1;
 writeAuthorityCompletion(f.c.directCompletion,'motion',{tick:1,nextSequence:7,delivery:'sent'});f.c.pollIoCompletion();assert.equal(f.c.motionInFlight,null);assert.equal(f.c.directInFlight,1);
 writeAuthorityCompletion(f.c.directCompletion,'snapshot',{tick:99,nextSequence:9,delivery:'sent',attempt:f.c.directAttempt});f.c.pollIoCompletion();assert.equal(f.c.directInFlight,1);
 writeAuthorityCompletion(f.c.directCompletion,'snapshot',{tick:1,nextSequence:9,delivery:'sent',attempt:f.c.directAttempt});closeAuthorityCompletion(f.c.directCompletion);f.c.pollIoCompletion();assert.equal(f.c.directInFlight,1);
 f.c.handleMessage({type:'authority-fallback'});assert.equal(f.c.directCompletion,null);
});
test('small state is offered at complete physics boundaries and before heavy capture, including catch-up',async()=>{
 const f=fixture(),order=[];f.c.controlled.clear();f.c.motionSnapshot=()=>order.push(['motion',f.c.tick,f.c.engine.value]);f.c.combatSnapshot=()=>order.push(['combat',f.c.tick,f.c.engine.value]);
 const capture=f.c.captureAuthorityCombat;f.c.captureAuthorityCombat=(...args)=>{order.push(['capture',f.c.tick,f.c.engine.value]);return capture(...args);};
 f.at(51);await f.c.step();assert.equal(f.c.tick,4);assert.equal(f.c.engine.value,4);
 assert.deepEqual(order.slice(0,6),[['motion',2,2],['combat',2,2],['motion',3,3],['combat',3,3],['motion',4,4],['combat',4,4]]);
 assert.equal(order.at(-1)[0],'capture');assert.equal(f.published.length,1);assert.equal(frame(f.published[0]).tick,4);
});
test('both live publication lanes reuse encoded bodies, but never retain them after the tick is fully dispatched',()=>{
 const f=fixture();f.c.snapshot();assert.ok(f.c.capturedFrame.encoding.bytes>0);assert.equal(f.c.encodedFragmentReuses,0);
 f.c.acknowledgeSnapshot(0);assert.ok(f.c.encodedFragmentReuses>=2);assert.equal(f.c.capturedFrame,null);
 f.c.tick=2;f.c.directInFlight=null;f.c.snapshotInFlight=null;const reuses=f.c.encodedFragmentReuses;f.c.snapshot();assert.equal(f.c.encodedFragmentReuses,reuses);assert.equal(f.c.capturedFrame,null);
});

test('encoding-cache rollback keeps original complete bytes and sound queues',async()=>{
 const f=fixture(await compile(source,{VITE_LAN_CAPTURE_ENCODING_CACHE:'false'}));f.c.snapshot();assert.equal(f.c.capturedFrame.encoding,null);f.c.acknowledgeSnapshot(0);assert.equal(f.c.encodedFragmentReuses,0);assert.deepEqual(frame(f.shown[0]).world,frame(f.published[0]).world);
});
// The production snapshot/flush/lifecycle functions above, with only the Worker
// transport substituted. The actual helper codec is covered by its own suite.
function asyncEncoder(f){
 let job=null,result=null,id=0,enabled=true;const b={get available(){return enabled&&!job;},get busy(){return job!==null;},submit(frame,display,network,networkSounds){job={id:++id,frame:structuredClone(frame),display,network,networkSounds:structuredClone(networkSounds)};return id;},poll(){if(!result)return null;const r=result;result=null;job=null;return r;},cancel(){job=null;result=null;enabled=false;},close(){this.cancel();}};
 f.c.snapshotEncoderWorker=b;return{b,finish(fallback=false){assert.ok(job);result={id:job.id,fallback,workerMs:2,display:job.display?encodeProjectedBinaryFrame(job.frame,true):null,network:job.network?encodeProjectedBinaryFrame({...job.frame,sounds:job.networkSounds},true):null};if(fallback)enabled=false;},inject(r){result=r;},get job(){return job;}};
}
test('async encoding never reserves remote credits or stops completed physics/motion, sounds retire on publication only',async()=>{
 const f=fixture(),helper=asyncEncoder(f),sound={id:1,key:'old'};f.c.snapshotInFlight=null;f.c.sounds=[sound];f.c.networkSounds=[sound];f.c.snapshot();
 assert.equal(f.published.length,0);assert.equal(f.shown.length,0);assert.equal(f.c.directInFlight,null);assert.equal(f.c.sounds.length,1);assert.equal(helper.job.frame.tick,1);
 f.c.controlled.clear();let motions=0;f.c.motionSnapshot=()=>motions++;f.at(35);await f.c.step();assert.ok(f.c.tick>1);assert.ok(motions>0);assert.equal(f.c.captures,1,'one pending job, not one per physics tick');
 f.c.sounds.push({id:2,key:'new'});f.c.networkSounds.push({id:2,key:'new'});helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.published.length,1);assert.equal(frame(f.published[0]).tick,1);assert.equal(frame(f.published[0]).world.value,1);assert.equal(f.c.directInFlight,1);assert.equal(f.c.snapshotInFlight,1);assert.equal(f.c.sounds.length,1);assert.equal(f.c.sounds[0].id,2);assert.equal(f.c.networkSounds[0].id,2);
});
test('async failure falls back to current tick with all unsent sounds and no lane-credit leak',()=>{
 const f=fixture(),helper=asyncEncoder(f);f.c.networkSounds=[{id:1,key:'kept'}];f.c.snapshot();helper.finish(true);f.c.tick=2;f.c.snapshot();assert.equal(f.published.length,1);assert.equal(frame(f.published[0]).tick,2);assert.equal(frame(f.published[0]).sounds[0].id,1);assert.equal(f.c.pendingEncoding,null);assert.equal(f.c.networkSounds.length,0);
});
test('terminal snapshot cancels helper, publishes final sounds synchronously and cannot rewind on late completion',()=>{
 const f=fixture(),helper=asyncEncoder(f);f.c.networkSounds=[{id:1,key:'kept'}];f.c.snapshot();f.c.tick=3;f.c.networkSounds.push({id:2,key:'final'});f.c.snapshot(true);assert.equal(f.published.length,1);assert.equal(frame(f.published[0]).tick,3);assert.equal(frame(f.published[0]).sounds.length,2);assert.equal(f.c.pendingEncoding,null);
 helper.inject({id:1,network:encodeProjectedBinaryFrame({tick:1,world:{},sounds:[]},true),workerMs:1});f.c.flushSnapshotEncoding();assert.equal(f.published.length,1);assert.equal(f.c.directLastTick,3);
});
test('rebind, fallback, recovery and stop discard pending helper results without publishing a stale tick',()=>{
 for(const action of ['authority-port','authority-fallback','recover','stop']){
  const f=fixture(),helper=asyncEncoder(f);f.c.networkSounds=[{id:1,key:'kept'}];f.c.snapshot();
  if(action==='recover')f.c.recover('test');else f.c.handleMessage({type:action,port:f.port,matchId:'m'});
  assert.equal(f.c.pendingEncoding,null,action);helper.inject({id:1,network:new Uint8Array([1]),workerMs:1});f.c.flushSnapshotEncoding();assert.equal(f.published.filter(m=>m.type==='snapshot').length,0,action);
 }
});
test('old lifecycle/engine/port cannot publish completed helper data',()=>{
 for(const change of [c=>c.lifecycle++,c=>c.engine={...c.engine},c=>c.directIo={postMessage(){throw Error('stale');}}]){const f=fixture(),helper=asyncEncoder(f);f.c.snapshot();helper.finish();change(f.c);f.c.flushSnapshotEncoding();assert.equal(f.published.length,0);assert.equal(f.c.directInFlight,null);}
});
test('helper can join a lane only after its actual receipt; held lanes keep their events',()=>{
 for(const grant of [false,true]){const f=fixture(),helper=asyncEncoder(f);f.c.sounds=[{id:1,key:'display'}];f.c.snapshot();assert.equal(helper.job.display,true);assert.equal(f.c.snapshotInFlight,0);
  if(grant)f.c.acknowledgeSnapshot(0);helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.shown.length,Number(grant));assert.equal(f.c.sounds.length,Number(!grant));assert.equal(f.published.length,1);
 }
 const f=fixture(),helper=asyncEncoder(f);f.c.snapshotInFlight=null;f.c.directInFlight=0;f.c.networkSounds=[{id:1,key:'network'}];f.c.snapshot();assert.equal(helper.job.network,true);helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.published.length,0);assert.equal(f.c.networkSounds.length,1);assert.equal(f.c.directInFlight,0);
});
test('helper is opt-in and unsupported/legacy environments retain the proven synchronous path',async()=>{
 const stub=class {constructor(){} };for(const env of [{},{VITE_LAN_SERIALIZER_WORKER:'false'},{VITE_LAN_SERIALIZER_WORKER:'true'}]){
  const f=fixture(await compile(source,env));Object.assign(f.c,{Worker:stub,SnapshotEncoderBroker:stub,crossOriginIsolated:true});f.c.ensureSnapshotEncoder();assert.equal(f.c.snapshotEncoderWorker!==null,env.VITE_LAN_SERIALIZER_WORKER==='true');
 }
 for(const setup of [{crossOriginIsolated:false},{Worker:undefined},{binarySnapshots:false}]){const f=fixture(await compile(source,{VITE_LAN_SERIALIZER_WORKER:'true'}));Object.assign(f.c,{Worker:stub,SnapshotEncoderBroker:stub,crossOriginIsolated:true},setup);f.c.ensureSnapshotEncoder();assert.equal(f.c.snapshotEncoderWorker,null);}
});
test('helper dispatch failure at step entry is handled as an authority failure, not an unhandled rejection',async()=>{
 const f=fixture(),helper=asyncEncoder(f);f.c.networkSounds=[{id:1,key:'not-dispatched'}];f.c.snapshot();helper.finish();f.port.postMessage=()=>{throw Error('dispatch failed');};await f.c.step();assert.equal(f.c.running,false);assert.equal(f.events.at(-1).type,'error');assert.match(f.events.at(-1).message,/dispatch failed/);assert.equal(f.c.networkSounds.length,1);
});

test('a skipped full-state attempt can retry the same completed tick without another physics step',()=>{const f=fixture();f.c.snapshot();assert.equal(f.published.length,1);assert.equal(f.c.acceptIoSnapshot({tick:1,nextSequence:0,delivery:'skipped',attempt:f.c.directAttempt}),true);f.at(20);f.c.snapshot();assert.equal(f.published.length,2,'same-tick latest snapshot must retry after local skip');assert.equal(f.c.tick,1);assert.deepEqual(frame(f.published[1]).world,frame(f.published[0]).world);});

test('same-tick retry cannot be released by a duplicate port receipt or old shared record',()=>{for(const shared of [true,false]){const f=fixture();if(shared)f.c.directCompletion=createAuthorityCompletion(true);f.c.snapshot();const old={tick:1,nextSequence:0,delivery:'skipped',attempt:f.c.directAttempt};if(shared){writeAuthorityCompletion(f.c.directCompletion,'snapshot',old);f.c.pollIoCompletion();}else assert.equal(f.c.acceptIoSnapshot(old),true);for(let t=0;t<=16;t++){f.at(t);f.c.snapshot();}assert.equal(f.published.length,1,'rejected attempts must not hot-spin');f.at(17);f.c.snapshot();assert.equal(f.published.length,2);assert.ok(f.c.directAttempt>old.attempt);assert.equal(f.c.acceptIoSnapshot(old),false);f.c.pollIoCompletion();assert.equal(f.c.directInFlight,1);assert.equal(f.c.ioStats.skipped,1);const current={...old,attempt:f.c.directAttempt,delivery:'sent',nextSequence:1};for(const bad of [{...current,attempt:undefined},{...current,nextSequence:NaN},{...current,delivery:'ack'}])assert.equal(f.c.acceptIoSnapshot(bad),false);assert.equal(f.c.acceptIoSnapshot(current),true);f.at(100);f.c.snapshot();assert.equal(f.published.length,2,'one admitted tick never repeats');assert.equal(f.c.ioStats.sent,1);}});
test('rejected snapshots retry latest completed world, not a queue of old ticks; JSON path also carries tokens',()=>{for(const binary of [true,false]){const f=fixture();f.c.binarySnapshots=binary;f.c.snapshot();f.c.acceptIoSnapshot({tick:1,nextSequence:0,delivery:'skipped',attempt:f.c.directAttempt});f.c.tick=4;f.c.engine.value=4;f.at(17);f.c.snapshot();assert.deepEqual(f.published.map(m=>m.tick),[1,4]);assert.equal(frame(f.published[1]).world.value,4);assert.equal(f.published[1].attempt,2);}});
test('async encoder same-tick local skips use a fresh attempt and retain cooldown',()=>{const f=fixture(),helper=asyncEncoder(f);f.c.snapshot();helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.published.length,1);const old={tick:1,nextSequence:0,delivery:'skipped',attempt:f.c.directAttempt};assert.equal(f.c.acceptIoSnapshot(old),true);f.c.snapshot();assert.equal(f.published.length,1);f.at(20);f.c.snapshot();helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.published.length,2);assert.equal(f.published[1].tick,1);assert.ok(f.published[1].attempt>old.attempt);assert.equal(f.c.acceptIoSnapshot(old),false);});

test('repeated backpressure keeps one local flight with monotonic attempt IDs and no queued obsolete ticks',()=>{const f=fixture();for(let i=0;i<200;i++){f.at(i*20);f.c.tick=i+1;f.c.snapshot();assert.equal(f.published.length,i+1);const packet=f.published.at(-1);assert.equal(packet.tick,i+1);assert.equal(packet.attempt,i+1);assert.equal(f.c.acceptIoSnapshot({tick:packet.tick,attempt:packet.attempt,nextSequence:0,delivery:'skipped'}),true);f.c.snapshot();assert.equal(f.published.length,i+1);assert.equal(f.c.directInFlight,null);}assert.equal(f.c.directSequence,0);assert.equal(f.c.ioStats.skipped,200);assert.equal(f.c.ioStats.sent,0);});

function blockNetwork(f){const view=createAuthorityAdmission(true);writeAuthorityAdmission(view,true);f.c.directAdmission=view;return view;}
test('blocked network captures/encodes/transfers nothing while physics and bounded sound ownership continue',async()=>{
 const f=fixture(),view=blockNetwork(f);let encodes=0;const encode=f.c.encodeProjectedBinaryFrame;f.c.encodeProjectedBinaryFrame=(...args)=>{encodes++;return encode(...args);};
 f.c.networkSounds=[{id:1,key:'kept'}];f.c.controlled.clear();f.at(35);await f.c.step();
 assert.ok(f.c.tick>1);assert.equal(f.c.captures,0);assert.equal(encodes,0);assert.equal(f.published.length,0);assert.equal(f.c.directInFlight,null);assert.equal(f.c.directAttempt,0);assert.equal(f.c.networkSounds.length,1);assert.ok(f.c.ioStats.preflightSkips>0);
 writeAuthorityAdmission(view,false);f.c.snapshot();assert.equal(f.c.captures,1);assert.equal(encodes,1);assert.equal(f.published.length,1);assert.equal(frame(f.published[0]).tick,f.c.tick);assert.equal(frame(f.published[0]).world.value,f.c.engine.value);assert.equal(f.c.networkSounds.length,0);
});
test('blocked network leaves display cadence and same-tick capture reuse independent',()=>{
 const f=fixture(),view=blockNetwork(f);let fragments=0;f.c.ProjectionEncodingCache=class extends ProjectionEncodingCache{constructor(...args){super(...args);fragments++;}};let encodes=0;const encode=f.c.encodeProjectedBinaryFrame;f.c.encodeProjectedBinaryFrame=(...args)=>{encodes++;return encode(...args);};
 f.c.networkSounds=[{id:7,key:'network'}];
 for(let tick=1;tick<=10;tick++){f.c.tick=tick;f.c.engine.value=tick;f.c.snapshotInFlight=null;f.c.sounds=[{id:tick,key:'display'}];f.c.snapshot();}
 assert.equal(f.shown.length,10);assert.equal(f.published.length,0);assert.equal(f.c.captures,10);assert.equal(encodes,10);assert.equal(fragments,0,'do not build speculative encoding fragments for a blocked lane');assert.equal(f.c.networkSounds.length,1);
 writeAuthorityAdmission(view,false);f.c.snapshot();assert.equal(f.c.captures,10);assert.equal(f.c.captureReuses,1);assert.equal(encodes,11);assert.equal(f.c.capturedFrame,null);assert.equal(f.published.length,1);
 assert.deepEqual(frame(f.published[0]).world,frame(f.shown.at(-1)).world);assert.equal(frame(f.published[0]).sounds[0].id,7);
});
test('optional serializer does not speculatively encode blocked network or dispatch it after a mid-job rejection',()=>{
 const f=fixture(),helper=asyncEncoder(f),view=blockNetwork(f);f.c.snapshot();assert.equal(helper.job,null);
 f.c.snapshotInFlight=null;f.c.networkSounds=[{id:1,key:'kept'}];f.c.snapshot();assert.equal(helper.job.display,true);assert.equal(helper.job.network,false);
 writeAuthorityAdmission(view,false);helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.shown.length,1);assert.equal(f.published.length,0);
 f.c.snapshot();assert.equal(helper.job.network,true);writeAuthorityAdmission(view,true);helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.published.length,0);assert.equal(f.c.networkSounds.length,1);assert.equal(f.c.directInFlight,null);
 f.c.tick=4;f.c.engine.value=4;writeAuthorityAdmission(view,false);f.c.snapshot();helper.finish();f.c.flushSnapshotEncoding();assert.equal(f.published.length,1);assert.equal(frame(f.published[0]).tick,4);assert.equal(frame(f.published[0]).sounds[0].id,1);
});
test('terminal bypasses admission; missing, revoked and rebound hints cannot suppress fallback',()=>{
 const f=fixture(),view=blockNetwork(f);f.c.directInFlight=0;f.c.networkSounds=[{id:1,key:'final'}];f.c.snapshot(true);assert.equal(f.published.length,1);assert.equal(f.shown.length,1);assert.equal(frame(f.published[0]).sounds[0].id,1);
 for(const action of ['authority-port','authority-fallback']){const g=fixture();blockNetwork(g);g.c.handleMessage({type:action,port:g.port});assert.equal(g.c.directAdmission,null);}
 closeAuthorityAdmission(view);assert.equal(isAuthoritySnapshotBlocked(view),false);
 for(const binary of [true,false]){const g=fixture();g.c.binarySnapshots=binary;const hint=blockNetwork(g);closeAuthorityAdmission(hint);g.c.snapshot();assert.equal(g.published.length,1);}
});
test('frozen-before versus current blocked snapshot workload has exact successful recovery', {skip:!process.env.AUTHORITY_ADMISSION_BASELINE}, async()=>{
 const oldSource=fs.readFileSync(process.env.AUTHORITY_ADMISSION_BASELINE,'utf8');
 function run(code){const f=fixture(code),view=blockNetwork(f);let encodes=0,bytes=0;const encode=f.c.encodeProjectedBinaryFrame;f.c.encodeProjectedBinaryFrame=(...args)=>{encodes++;return encode(...args);};f.c.networkSounds=[{id:1,key:'kept'}];
  for(let i=1;i<=120;i++){f.at(i*20);f.c.tick=i;f.c.engine.value=i;f.c.snapshot();if(f.c.directInFlight!==null){const p=f.published.at(-1);bytes+=p.bytes;f.c.acceptIoSnapshot({tick:p.tick,attempt:p.attempt,nextSequence:0,delivery:'skipped'});}}
  const blocked={captures:f.c.captures,encodes,transfers:f.published.length,bytes,sounds:f.c.networkSounds.length,preflightSkips:f.c.ioStats.preflightSkips};
  f.at(2500);f.c.tick=121;f.c.engine.value=121;writeAuthorityAdmission(view,false);f.c.snapshot();const p=f.published.at(-1),recovery=frame(p);assert.equal(f.c.acceptIoSnapshot({tick:p.tick,attempt:p.attempt,nextSequence:1,delivery:'sent'}),true);
  return{blocked,recovery,accepted:f.c.ioStats.sent,sequence:f.c.directSequence};
 }
 const before=run(await compile(oldSource)),after=run(compiled);assert.equal(before.blocked.captures,120);assert.equal(before.blocked.encodes,120);assert.equal(before.blocked.transfers,120);assert.ok(before.blocked.bytes>0);
 assert.deepEqual(after.blocked,{captures:0,encodes:0,transfers:0,bytes:0,sounds:1,preflightSkips:120});assert.deepEqual(after.recovery.world,before.recovery.world);assert.equal(after.recovery.tick,121);assert.equal(after.accepted,1);assert.equal(before.accepted,1);assert.equal(after.sequence,1);assert.equal(before.sequence,1);
 if(process.env.AUTHORITY_ADMISSION_OUT)fs.writeFileSync(process.env.AUTHORITY_ADMISSION_OUT,JSON.stringify({scope:'Extracted real host functions with controlled local I/O blockage; empty DTO world, not throughput/FPS/WAN measurement',blockedAttempts:120,before,after,successfulRecoveryWorldEqual:true},null,2));
});
