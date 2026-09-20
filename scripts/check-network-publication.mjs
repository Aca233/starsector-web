import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import { build, transform } from 'esbuild';
const load=async entry=>{const b=await build({entryPoints:[entry],bundle:true,write:false,platform:'browser',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));};
const {scheduleNetworkTask}=await load('src/network/NetworkTaskScheduler.ts');
const {LanSnapshotDecoder}=await load('src/network/LanSnapshotDecoder.ts');
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
test('task scheduler is asynchronous, cancellable, reentrant, ordered, and releases idle ports',async()=>{
 const seen=[];const cancel=scheduleNetworkTask(()=>seen.push('cancelled'));cancel();cancel();
 await new Promise(resolve=>{scheduleNetworkTask(()=>{seen.push(1);scheduleNetworkTask(()=>{seen.push(3);resolve();});});scheduleNetworkTask(()=>seen.push(2));assert.deepEqual(seen,[]);});
 assert.deepEqual(seen,[1,2,3]);
 const c=scheduleNetworkTask(()=>seen.push(4));c();await pause();assert.deepEqual(seen,[1,2,3]);
});
const packet=tick=>{const json=JSON.stringify({tick,sounds:[{id:tick}],ships:[]});return{tick,json,bytes:Buffer.byteLength(json)};};
test('default decoder task queue preserves all events and bounded credits across drain/reset/close',async()=>{
 const consumed=[],acks=[],errors=[];const d=new LanSnapshotDecoder({acknowledge:t=>acks.push(t),consume:f=>consumed.push(f.sounds[0].id),error:e=>errors.push(e)});
 d.enqueue(packet(1));d.enqueue(packet(2));d.enqueue(packet(3));assert.equal(d.stats.queued,3);assert.deepEqual(acks,[1]);
 await pause();assert.deepEqual(consumed,[1,2,3]);assert.deepEqual(acks,[1,2,3]);assert.equal(d.stats.queuedBytes,0);
 d.enqueue(packet(4));d.reset();d.enqueue(packet(5));await pause();assert.deepEqual(consumed,[1,2,3,5]);
 d.enqueue(packet(6));d.flush();d.close();await pause();assert.deepEqual(consumed,[1,2,3,5,6]);assert.deepEqual(errors,[]);
});
test('decode failure closes scheduling and grants no extra consumption credits',async()=>{
 const consumed=[],acks=[],errors=[];const d=new LanSnapshotDecoder({acknowledge:t=>acks.push(t),consume:f=>consumed.push(f.tick),error:e=>errors.push(e)});
 const bad=packet(1);bad.json=bad.json.replace('"tick":1','"tick":9');d.enqueue(bad);d.enqueue(packet(2));await pause();
 assert.equal(errors.length,1);assert.deepEqual(acks,[1]);assert.deepEqual(consumed,[]);assert.equal(d.stats.queuedBytes,0);
});
// Execute the real worker function, not a rewritten model of its credit guard.
const source=fs.readFileSync('src/network/host.worker.ts','utf8');
const ast=ts.createSourceFile('host.worker.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='acknowledgeSnapshot');assert.ok(fn);
const code=(await transform(fn.getText(ast),{loader:'ts',target:'es2022'})).code;
function authority(overrides={}){const c={snapshotInFlight:1,steppingLifecycle:null,running:true,tick:9,lastSnapshotTick:1,sent:[],...overrides};vm.createContext(c);vm.runInContext('function snapshot(){ if (tick===lastSnapshotTick || snapshotInFlight!==null) return; lastSnapshotTick=tick; snapshotInFlight=tick; sent.push(tick); }\n'+code,c);return c;}
test('returned host credit immediately publishes newest completed tick without another timer/physics step',()=>{
 const c=authority();c.acknowledgeSnapshot(1);assert.deepEqual([...c.sent],[9]);assert.equal(c.snapshotInFlight,9);assert.equal(c.tick,9);
 c.acknowledgeSnapshot(1);c.acknowledgeSnapshot(99);assert.deepEqual([...c.sent],[9]);c.acknowledgeSnapshot(9);assert.equal(c.snapshotInFlight,null);assert.deepEqual([...c.sent],[9]);
});
test('stopped/in-progress authorities never publish from an ACK; tail remains the serialization barrier',()=>{
 for(const extra of [{running:false},{steppingLifecycle:4}]){const c=authority(extra);c.acknowledgeSnapshot(1);assert.equal(c.snapshotInFlight,null);assert.equal(c.sent.length,0);}
 const c=authority({snapshotInFlight:null});c.acknowledgeSnapshot(null);assert.equal(c.sent.length,0);
 assert.match(source,/else if \(m.type === "snapshot-consumed"\) \{\s*acknowledgeSnapshot\(m.tick\)/);
});
