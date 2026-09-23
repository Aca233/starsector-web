// Same-world paired measurement of the actual pre-change/current host snapshot().
// Forces asynchronous credit returns; this is dispatch CPU cost, NOT network Hz.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {transform} from 'esbuild';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureAuthorityCombat, configureHostCosmetics} from '../src/network/HostSnapshot';
import {encodeProjectedBinaryFrame, decodeBinaryFrame, ProjectionEncodingCache} from '../src/network/BinarySnapshot.mjs';
const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(root,String(input).replace(/^\//,''));if(!p.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const args=process.argv.slice(2),get=(key:string,def:string)=>args.includes(key)?args[args.indexOf(key)+1]:def;
const out=get('--out','artifacts/network-stream-20260921/phase19/paired-reuse.json');
const baseline=get('--baseline','artifacts/network-stream-20260921/phase19/host.before-reuse.ts');
const match:any={id:'authority-cpu-probe',seed:917,hostId:'p0',snapshotHz:60,players:Array.from({length:5},(_,i)=>({id:'p'+i,seat:i,team:i%2,hull:'onslaught'})),options:{assignment:'teams',battleSize:3200,aiHulls:[Array(9).fill('hammerhead'),Array(8).fill('hammerhead')]}};
const engine=createLanWorld(match).engine,muzzle=configureHostCosmetics(engine,true,true);
for(let tick=1;tick<=600;tick++)engine.fixedUpdate(1/60);
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const state=()=>sha(encodeProjectedBinaryFrame(captureAuthorityCombat(engine,600,{0:0,1:0,2:0,3:0,4:0},0,muzzle,true),true));
const stateBefore=state();
async function fixture(file:string){
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const code=(await transform(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='snapshot').map(n=>n.getText(ast)).join('\n'),{loader:'ts',target:'es2022',define:{'import.meta.env':'{}'}})).code;
 const received:any[]=[];let captureCount=0;
 const receive=(m:any,transfer:any[]=[])=>received.push(structuredClone(m,{transfer}));
 const c:any={running:true,snapshotEncoderWorker:null,flushSnapshotEncoding(){},cancelSnapshotEncoding(){},consumeSnapshotSounds(queue:any[],through:number){while(queue.length&&queue[0].id<=through)queue.shift();},ProjectionEncodingCache,encodedFragmentReuses:0,pollIoCompletion(){},tick:600,lastSnapshotTick:599,directLastTick:599,snapshotInFlight:599,directInFlight:null,directIo:{postMessage:receive},directReady:true,directLaunched:true,directSequence:0,directAttempt:0,directRetryAt:0,engine,muzzleEvents:muzzle,compactParticles:true,capturedFrame:null,captures:0,captureReuses:0,elapsedCost:0,samples:0,captureMs:0,encodeMs:0,
 controls:new Map(Array.from({length:5},(_,i)=>[i,{acknowledged:0}])),performance:{now:()=>0},LAN_SNAPSHOT_HZ:60,measureClock(){},realtimeRatio:1,combatRate:1,sounds:[],networkSounds:[],authoritySummaryShips:null,binarySnapshots:true,visualEnabled:false,snapshotEncoder:new TextEncoder(),encodeProjectedBinaryFrame,snapshotFlow:{count(){}},send:receive,
 captureAuthorityCombat:(...a:any[])=>{captureCount++;return (captureAuthorityCombat as any)(...a);}};
 vm.createContext(c);vm.runInContext(code,c);
 return {file,sourceHash:sha(source),c,received,get captures(){return captureCount;},run(order:number){
  received.length=0;Object.assign(c,{lastSnapshotTick:599,directLastTick:599,snapshotInFlight:order?null:599,directInFlight:order?599:null,capturedFrame:null,sounds:[{id:7,sound:'test'}],networkSounds:[{id:8,sound:'test'}]});
  const started=performance.now();c.snapshot();if(order)c.directInFlight=null;else c.snapshotInFlight=null;c.snapshot();const elapsed=performance.now()-started;
  assert.equal(c.capturedFrame,null);assert.equal(received.length,2);return elapsed;
 }};
}
const before=await fixture(baseline),after=await fixture('src/network/host.worker.ts');
function compare(){for(let i=0;i<2;i++){assert.deepEqual(new Uint8Array(after.received[i].binary),new Uint8Array(before.received[i].binary));assert.deepEqual(decodeBinaryFrame(after.received[i].binary),decodeBinaryFrame(before.received[i].binary));}}
for(let i=0;i<30;i++){before.run(i%2);after.run(i%2);compare();}
const rows:any[]=[];const countBefore=before.captures,countAfter=after.captures,reuses=after.c.captureReuses;
for(let i=0;i<120;i++){let a,b;if(i%2){b=after.run(i%2);a=before.run(i%2);}else{a=before.run(i%2);b=after.run(i%2);}compare();rows.push({order:i%2?'display-first':'network-first',beforeMs:a,afterMs:b});}
assert.equal(state(),stateBefore);
const stats=(key:string)=>{const a=rows.map(r=>r[key]).sort((a,b)=>a-b);return{mean:a.reduce((a,b)=>a+b,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
const result={scope:'Actual snapshot functions, one real frozen 22-ship world, alternating paired order, both receipt orders, transferred ArrayBuffers; no rendering/network/pacing; NOT multiplayer Hz.',ships:engine.ships.length,projectiles:engine.projectiles.length,tick:600,pairs:rows.length,before:stats('beforeMs'),after:stats('afterMs'),beforeCaptures:before.captures-countBefore,afterCaptures:after.captures-countAfter,reuses:after.c.captureReuses-reuses,publicationBytesEqual:true,worldUnchanged:true,stateBefore,sources:[{file:before.file,sha256:before.sourceHash},{file:after.file,sha256:after.sourceHash}],rows};
fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined},null,2));
