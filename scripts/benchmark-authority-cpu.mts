// Isolated, deterministic authority CPU probe. No renderer, network, campaign,
// simulation rate cap or changes to production methods/prototype identity.
import fs from 'node:fs';
import path from 'node:path';
import {Session} from 'node:inspector';
import {createHash} from 'node:crypto';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureAuthorityCombat, configureHostCosmetics} from '../src/network/HostSnapshot';
import {encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(root,String(input).replace(/^\//,''));if(!p.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const args=process.argv.slice(2),arg=(k:string,d:string)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const out=path.resolve(arg('--out','artifacts/network-stream-20260921/phase19/cpu-before'));
fs.mkdirSync(out,{recursive:true});
const match:any={id:'authority-cpu-probe',seed:917,hostId:'p0',snapshotHz:60,players:Array.from({length:5},(_,i)=>({id:'p'+i,seat:i,team:i%2,hull:'onslaught'})),options:{assignment:'teams',battleSize:3200,aiHulls:[Array(9).fill('hammerhead'),Array(8).fill('hammerhead')]}};
const engine=createLanWorld(match).engine,muzzle=configureHostCosmetics(engine,true,true);
const warm=240,steps=Number(arg('--steps','600')),every=Number(arg('--capture-every','1'));
if(!Number.isInteger(steps)||steps<60||steps>3600||!Number.isInteger(every)||every<1||every>60)throw Error('Invalid bounds');
for(let tick=1;tick<=warm;tick++){engine.fixedUpdate(1/60);if(tick%every===0)encodeProjectedBinaryFrame(captureAuthorityCombat(engine,tick,{0:0,1:0,2:0,3:0,4:0},0,muzzle,true),true);}
const session=new Session();const post=(method:string,params?:any)=>new Promise<any>((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
if(args.includes('--profile')){session.connect();await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});await post('Profiler.start');}
const samples:any[]=[],hash=createHash('sha256');let bytes=0,peakProjectiles=0;const cpuAt=process.cpuUsage(),started=performance.now();
for(let i=1;i<=steps;i++){
 const tick=warm+i,at=performance.now();engine.fixedUpdate(1/60);const simulated=performance.now();
 let captured=simulated,encoded=simulated,length=0;
 if(tick%every===0){const frame=captureAuthorityCombat(engine,tick,{0:0,1:0,2:0,3:0,4:0},0,muzzle,true);captured=performance.now();const binary=encodeProjectedBinaryFrame(frame,true);encoded=performance.now();length=binary.length;bytes+=length;hash.update(binary);}
 peakProjectiles=Math.max(peakProjectiles,engine.projectiles.length);
 samples.push({tick,simulationMs:simulated-at,captureMs:captured-simulated,encodeMs:encoded-captured,bytes:length,ships:engine.ships.length,projectiles:engine.projectiles.length});
}
const elapsed=performance.now()-started,cpu=process.cpuUsage(cpuAt);
if(args.includes('--profile')){const {profile}=await post('Profiler.stop');fs.writeFileSync(path.join(out,'cpu.cpuprofile'),JSON.stringify(profile));session.disconnect();}
const summarize=(key:string)=>{const a=samples.filter(s=>key==='simulationMs'||s.bytes).map(s=>s[key]).sort((a,b)=>a-b);return {mean:a.reduce((a,b)=>a+b,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1)};};
const result={scope:'Frozen-source 22-ship native authority CPU loop; no renderer, IPC, timers, network or rate cap; NOT playable/network Hz.',profiled:args.includes('--profile'),node:process.version,seed:917,warm,steps,captureEvery:every,elapsedMs:elapsed,cpuMs:(cpu.user+cpu.system)/1000,simulation:summarize('simulationMs'),capture:summarize('captureMs'),encode:summarize('encodeMs'),bytes,peakProjectiles,wireHash:hash.digest('hex')};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,'samples.json'),JSON.stringify(samples));console.log(JSON.stringify(result,null,2));
