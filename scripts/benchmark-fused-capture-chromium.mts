import {normalizedProjection} from './lib/damage-view-oracle.mts';
import {captureCombat, applyCombatSnapshots} from 'receiver-fields-control';
import {captureCombat as newCapture,fusedCaptureDiagnostics} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {encodeProjectedBinaryFrame as fusedEncode} from 'capture-sink-codec';
import {assetManager} from '../src/engine/assets/AssetResolver';import {createLanWorld} from '../src/network/LanWorld';import {configureHostCosmetics} from '../src/network/HostSnapshot';
(globalThis as any).runReceiverComparison=async()=>{
 await assetManager.ensureManifestLoaded();
 const world=()=>{const e=createLanWorld({id:'native-projectile',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(10).fill('hammerhead'),Array(10).fill('hammerhead')]}} as any).engine;configureHostCosmetics(e,true,true,true);return e;};
 const capture=(e:any,t:number,fn:any=captureCombat)=>fn(e,t,{0:t,1:t},0,true,true,true,true,true,true),canonical=(f:any)=>JSON.stringify(normalizedProjection(f));
 const q=(v:number[],p:number)=>v.toSorted((a,b)=>a-b)[Math.floor((v.length-1)*p)];
 const stats=(rows:any[])=>Object.fromEntries(['capture','encode','producer','decode','apply','total'].map(k=>[k,{p50:q(rows.map(r=>r[k]),.5),p95:q(rows.map(r=>r[k]),.95)}]));const results=[];
 for(const peers of [3,5])for(let round=0;round<2;round++){
  const source=world();for(const ship of source.allCapitalShips){ship.pos.scale(.2);ship.prevPos.copy(ship.pos);ship.fireControlMode='AI';}for(let i=0;i<120;i++)source.fixedUpdate(1/60);
  const viewers={control:Array.from({length:peers},world),candidate:Array.from({length:peers},world)},rows={control:[],candidate:[]} as any;
  const step=(arm:string,tick:number)=>{const metrics={capture:0,encode:0,producer:0,decode:0,apply:0,total:0};let t=performance.now();const frame=capture(source,tick,arm==='candidate'?newCapture:captureCombat);metrics.capture=performance.now()-t;
   t=performance.now();const bytes=(arm==='candidate'?fusedEncode:encodeProjectedBinaryFrame)(frame,true)!;metrics.encode=performance.now()-t;let decoded:any;
   for(const viewer of viewers[arm]){t=performance.now();const f=decodeBinaryFrame(bytes);metrics.decode+=performance.now()-t;decoded??=f;t=performance.now();applyCombatSnapshots(viewer,[f],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});metrics.apply+=performance.now()-t;}
   metrics.producer=metrics.capture+metrics.encode;metrics.total=metrics.producer+metrics.decode+metrics.apply;return {metrics,bytes,decoded};};
  for(let tick=0;tick<240;tick++){
   source.fixedUpdate(1/60);const output:any={};for(const arm of round?['candidate','control']:['control','candidate'])output[arm]=step(arm,tick);
   if(canonical(output.control.decoded)!==canonical(output.candidate.decoded))throw Error('Complete P1 authority mismatch '+tick);
   if(output.candidate.bytes.length>output.control.bytes.length)throw Error('Wire growth '+tick);
   if(tick%30===0||tick===239)for(let p=0;p<peers;p++)if(canonical(capture(viewers.control[p],tick))!==canonical(capture(viewers.candidate[p],tick)))throw Error('Complete restored P1 viewer '+p+' tick '+tick);
   if(tick>=60)for(const arm of ['control','candidate'])rows[arm].push({...output[arm].metrics,bytes:output[arm].bytes.length});
  }
  const control:any=stats(rows.control),candidate:any=stats(rows.candidate);results.push({peers,round,control,candidate,ratios:{wire:rows.candidate.reduce((n:number,r:any)=>n+r.bytes,0)/rows.control.reduce((n:number,r:any)=>n+r.bytes,0),producer:candidate.producer.p50/control.producer.p50,capture:candidate.capture.p50/control.capture.p50,apply:candidate.apply.p50/control.apply.p50,total:candidate.total.p50/control.total.p50,p95:candidate.total.p95/control.total.p95},rows});
 }
 return {scope:'Fused capture to native SWF2. Candidate capture time INCLUDES subtree encoding and owned fragment copies; producer=sum capture+remaining outer encode. Original receiver and entire P1 contract, not damage-view omissions. Chromium 22 ships, 3/5 sequential receiver replicas, A/B+B/A. No compression/transport/render/RTT.',samples:180,warmup:60,diagnostics:fusedCaptureDiagnostics(),results};
};
