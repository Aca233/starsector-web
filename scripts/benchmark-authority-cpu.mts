// Isolated, deterministic authority CPU probe. No renderer, network, campaign,
// simulation rate cap or changes to production methods/prototype identity.
import fs from 'node:fs';
import path from 'node:path';
import {Session} from 'node:inspector';
import {createHash} from 'node:crypto';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureAuthorityCombat, captureLanDisplayCombat, configureHostCosmetics} from '../src/network/HostSnapshot';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {createLanDisplayWorld} from '../src/network/LanDisplayBootstrap';
import {applyLanDisplaySnapshot} from '../src/network/LanDisplaySnapshot';
import {serialize} from 'node:v8';
// v8 bytes are not canonical across object layouts (integer/double storage can
// differ). Canonicalize the complete owned graph without losing aliases, typed
// data, special numbers or own property flags; no renderer getters are invoked.
function replicaDigest(root:object):string {
 const seen=new Map<object,number>();
 const read=(value:any):any=>{
  if(typeof value==='number')return ['number',Object.is(value,-0)?'-0':String(value)];
  if(value===undefined)return ['undefined'];
  if(value===null||typeof value==='boolean'||typeof value==='string')return value;
  if(typeof value!=='object')throw Error('Non-data replica digest');
  if(seen.has(value))return ['ref',seen.get(value)];
  const id=seen.size;seen.set(value,id);
  if(ArrayBuffer.isView(value))return ['typed',id,Object.getPrototypeOf(value).constructor.name,Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('base64')];
  if(value instanceof Map)return ['map',id,[...value].map(([k,v])=>[read(k),read(v)])];
  if(value instanceof Set)return ['set',id,[...value].map(read)];
  return ['object',id,Object.getPrototypeOf(value)?.constructor?.name??null,Object.getOwnPropertyNames(value).sort().map(key=>{
   const d=Object.getOwnPropertyDescriptor(value,key)!;if(!('value' in d))throw Error('Accessor in replica digest');
   return [key,d.enumerable,d.configurable,d.writable,read(d.value)];
  })];
 };
 return createHash('sha256').update(JSON.stringify(read(root))).digest('hex');
}
const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(root,String(input).replace(/^\//,''));if(!p.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const args=process.argv.slice(2),arg=(k:string,d:string)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const out=path.resolve(arg('--out','artifacts/network-stream-20260921/phase19/cpu-before'));
const ships=Number(arg('--ships','22')),players=Number(arg('--players','5')),captureName=arg('--capture','authority');
if(!Number.isInteger(ships)||ships<2||ships>64||!Number.isInteger(players)||players<2||players>5||players>ships||!['authority','lan-display'].includes(captureName))throw Error('Invalid capture/roster');
const capture=captureName==='lan-display'?captureLanDisplayCombat:captureAuthorityCombat;
const acknowledged=Object.fromEntries(Array.from({length:players},(_,seat)=>[seat,0]));
const packedNumbers=args.includes('--packed-numbers'),applyReplica=args.includes('--apply-replica');
if(applyReplica&&captureName!=='lan-display')throw Error('--apply-replica requires --capture lan-display');
fs.mkdirSync(out,{recursive:true});
const match:any={id:'authority-cpu-probe',seed:917,hostId:'p0',snapshotHz:60,players:Array.from({length:players},(_,i)=>({id:'p'+i,seat:i,team:i%2,hull:'onslaught'})),options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.ceil((ships-players)/2)).fill('hammerhead'),Array(Math.floor((ships-players)/2)).fill('hammerhead')]}};
const engine=createLanWorld(match).engine,muzzle=configureHostCosmetics(engine,true,true);
const recordShapes=new Map<string,{keys:string[];frames:number}>();
const shapes=(frame:any)=>{for(const keys of frame.layouts??[]){const signature=JSON.stringify(keys),row=recordShapes.get(signature);if(row)row.frames++;else recordShapes.set(signature,{keys:keys.slice(),frames:1});}};
let replica:ReturnType<typeof createLanDisplayWorld>['world']|undefined;
const apply=(frame:any)=>{if(replica)applyLanDisplaySnapshot(replica,frame);else replica=createLanDisplayWorld(match,0,frame).world;};
const warm=240,steps=Number(arg('--steps','600')),every=Number(arg('--capture-every','1'));
if(!Number.isInteger(steps)||steps<60||steps>3600||!Number.isInteger(every)||every<1||every>60)throw Error('Invalid bounds');
for(let tick=1;tick<=warm;tick++){
 engine.fixedUpdate(1/60);
 if(tick%every===0){const binary=encodeProjectedBinaryFrame(capture(engine,tick,acknowledged,0,muzzle,true,packedNumbers),true);if(applyReplica){const frame=decodeBinaryFrame(binary);apply(frame);shapes(frame);}}
}
const session=new Session();const post=(method:string,params?:any)=>new Promise<any>((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
if(args.includes('--profile')){session.connect();await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});await post('Profiler.start');}
const samples:any[]=[],hash=createHash('sha256');let bytes=0,peakProjectiles=0;const cpuAt=process.cpuUsage(),started=performance.now();
for(let i=1;i<=steps;i++){
 const tick=warm+i,at=performance.now();engine.fixedUpdate(1/60);const simulated=performance.now();
 let captured=simulated,encoded=simulated,decoded=simulated,applied=simulated,length=0;
 if(tick%every===0){const frame=capture(engine,tick,acknowledged,0,muzzle,true,packedNumbers);captured=performance.now();const binary=encodeProjectedBinaryFrame(frame,true);encoded=performance.now();length=binary.length;bytes+=length;decoded=applied=encoded;if(applyReplica){const frame=decodeBinaryFrame(binary);decoded=performance.now();apply(frame);applied=performance.now();shapes(frame);}hash.update(binary);}
 peakProjectiles=Math.max(peakProjectiles,engine.projectiles.length);
 samples.push({tick,simulationMs:simulated-at,captureMs:captured-simulated,encodeMs:encoded-captured,decodeMs:decoded-encoded,applyMs:applied-decoded,bytes:length,ships:engine.ships.length,projectiles:engine.projectiles.length});
}
const elapsed=performance.now()-started,cpu=process.cpuUsage(cpuAt);
if(args.includes('--profile')){const {profile}=await post('Profiler.stop');fs.writeFileSync(path.join(out,'cpu.cpuprofile'),JSON.stringify(profile));session.disconnect();}
const summarize=(key:string)=>{const a=samples.filter(s=>key==='simulationMs'||s.bytes).map(s=>s[key]).sort((a,b)=>a-b);return {mean:a.reduce((a,b)=>a+b,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1)};};
// Hash/dump the viewer-owned data graph outside the timed/profiled phase.
const replicaHash=replica?replicaDigest(replica):undefined;
if(replica){fs.writeFileSync(path.join(out,'replica.v8'),serialize(replica));fs.writeFileSync(path.join(out,'record-shapes.json'),JSON.stringify([...recordShapes.values()].sort((a,b)=>b.frames-a.frames),null,2));}
const result={scope:'Frozen-source '+ships+'-ship '+captureName+(applyReplica?' + production display decode/apply':'')+' CPU loop; no renderer, IPC, timers, network or rate cap; NOT playable/network Hz.',applyReplica,replicaHash,...(applyReplica?{decode:summarize('decodeMs'),apply:summarize('applyMs')}:{}),ships,players,captureMode:captureName,packedNumbers,profiled:args.includes('--profile'),node:process.version,seed:917,warm,steps,captureEvery:every,elapsedMs:elapsed,cpuMs:(cpu.user+cpu.system)/1000,simulation:summarize('simulationMs'),capture:summarize('captureMs'),encode:summarize('encodeMs'),bytes,peakProjectiles,wireHash:hash.digest('hex')};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,'samples.json'),JSON.stringify(samples));console.log(JSON.stringify(result,null,2));
