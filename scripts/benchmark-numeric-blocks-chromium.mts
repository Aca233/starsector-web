import {encodeProjectedBinaryFrame as numericEncode,numericBlockDiagnostics} from 'numeric-block-codec';
import {captureCombat, applyCombatSnapshots as oldApply} from 'receiver-fields-control';
declare const __COMPARE_CAPTURE__: boolean;
import {captureCombat as newCapture,applyCombatSnapshots as newApply} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {assetManager} from '../src/engine/assets/AssetResolver';import {createLanWorld} from '../src/network/LanWorld';import {configureHostCosmetics} from '../src/network/HostSnapshot';
(globalThis as any).runReceiverComparison=async()=>{
 await assetManager.ensureManifestLoaded();
 const world=()=>{const e=createLanWorld({id:'native-projectile',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(10).fill('hammerhead'),Array(10).fill('hammerhead')]}} as any).engine;configureHostCosmetics(e,true,true,true);return e;};
 const capture=(e:any,t:number,fn=captureCombat)=>fn(e,t,{0:t,1:t},0,true,true,true,true,true),wire=(e:any,t:number)=>encodeProjectedBinaryFrame(capture(e,t),true)!;
 const equal=(a:Uint8Array,b:Uint8Array,where:string)=>{if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Bytes differ: '+where);};
 const q=(v:number[],p:number)=>v.toSorted((a,b)=>a-b)[Math.floor((v.length-1)*p)];
 const stats=(rows:any[])=>Object.fromEntries(['capture','encode','producer','decode','apply','total'].map(k=>[k,{p50:q(rows.map(r=>r[k]),.5),p95:q(rows.map(r=>r[k]),.95)}]));const results=[];
 for(const peers of [3,5])for(let round=0;round<2;round++){
  const source=world();for(const ship of source.allCapitalShips){ship.pos.scale(.2);ship.prevPos.copy(ship.pos);ship.fireControlMode='AI';}for(let i=0;i<120;i++)source.fixedUpdate(1/60);
  const viewers={control:Array.from({length:peers},world),candidate:Array.from({length:peers},world)},rows={control:[],candidate:[]} as any;
  const step=(arm:string,tick:number)=>{const metrics={capture:0,encode:0,producer:0,decode:0,apply:0,total:0};let t=performance.now();const frame=capture(source,tick,__COMPARE_CAPTURE__&&arm==='candidate'?newCapture:captureCombat);metrics.capture=performance.now()-t;t=performance.now();const bytes=(arm==='candidate'?numericEncode:encodeProjectedBinaryFrame)(frame,true)!;metrics.encode=performance.now()-t;
   for(const viewer of viewers[arm]){t=performance.now();const f=decodeBinaryFrame(bytes);metrics.decode+=performance.now()-t;t=performance.now();(arm==='control'?oldApply:newApply)(viewer,[f],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});metrics.apply+=performance.now()-t;}
   metrics.producer=metrics.capture+metrics.encode;metrics.total=metrics.capture+metrics.encode+metrics.decode+metrics.apply;return {metrics,bytes};};
  for(let tick=0;tick<240;tick++){
   source.fixedUpdate(1/60);const output:any={};for(const arm of round?['candidate','control']:['control','candidate'])output[arm]=step(arm,tick);
   equal(output.control.bytes,output.candidate.bytes,'authority '+tick);
   if(tick%30===0||tick===239)for(let p=0;p<peers;p++)equal(wire(viewers.control[p],tick),wire(viewers.candidate[p],tick),'restored viewer '+p+' tick '+tick);
   if(tick>=60)for(const arm of ['control','candidate'])rows[arm].push(output[arm].metrics);
  }
  const control:any=stats(rows.control),candidate:any=stats(rows.candidate);results.push({peers,round,control,candidate,ratios:{producer:candidate.producer.p50/control.producer.p50,capture:candidate.capture.p50/control.capture.p50,apply:candidate.apply.p50/control.apply.p50,total:candidate.total.p50/control.total.p50,p95:candidate.total.p95/control.total.p95},rows});
 }
 return {numericBlocks:numericBlockDiagnostics(),scope:'Numeric-block experiment: explicit old/new producers and separate old/new encoders, same receiver; Chromium, 22 ships, real fire, sequential 3/5 receiver replicas, A/B then B/A. Capture+encode+full decode+apply only; no transport/delta/compression/rendering/latency. Authority bytes identical each tick; restored world bytes checked every30ticks.',samples:180,warmup:60,results};
};
