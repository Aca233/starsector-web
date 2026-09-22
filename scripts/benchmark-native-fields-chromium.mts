import {captureCombat as oldCapture} from 'native-fields-control';
import {captureCombat as newCapture} from 'native-fields-candidate';
import {encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {configureHostCosmetics} from '../src/network/HostSnapshot';
(globalThis as any).runProducerComparison=async()=>{
 await assetManager.ensureManifestLoaded();
 const world=()=>{const e=createLanWorld({id:'native-projectile',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(10).fill('hammerhead'),Array(10).fill('hammerhead')]}} as any).engine;configureHostCosmetics(e,true,true,true);return e;};
 const q=(values:number[],f:number)=>values.toSorted((a,b)=>a-b)[Math.floor((values.length-1)*f)];
 const stats=(rows:any[])=>Object.fromEntries(['capture','encode','total'].map(k=>[k,{p50:q(rows.map(r=>r[k]),.5),p95:q(rows.map(r=>r[k]),.95)}]));
 const results=[];
 for(let round=0;round<2;round++){
  const e=world();for(const s of e.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}for(let i=0;i<120;i++)e.fixedUpdate(1/60);
  const control:any[]=[],candidate:any[]=[];
  const take=(fn:any,tick:number)=>{const started=performance.now(),frame=fn(e,tick,{0:tick,1:tick},0,true,true,true,true,true),captured=performance.now(),bytes=encodeProjectedBinaryFrame(frame,true)!,finished=performance.now();return{bytes,metrics:{capture:captured-started,encode:finished-captured,total:finished-started}};};
  for(let tick=0;tick<150;tick++){
   e.fixedUpdate(1/60);let a:any,b:any;
   if(round){b=take(newCapture,tick);a=take(oldCapture,tick);}else{a=take(oldCapture,tick);b=take(newCapture,tick);}
   if(a.bytes.length!==b.bytes.length||a.bytes.some((v:number,i:number)=>v!==b.bytes[i]))throw Error('Producer byte mismatch at '+tick);
   if(tick>=30){control.push(a.metrics);candidate.push(b.metrics);}
  }
  const before:any=stats(control),after:any=stats(candidate);
  results.push({round,control:before,candidate:after,ratios:{capture:after.capture.p50/before.capture.p50,total:after.total.p50/before.total.p50,p95:after.total.p95/before.total.p95},samples:{control,candidate}});
 }
 return {scope:'Same Chromium VM, same 22-ship authority tick, A/B then B/A. Capture+encode only, no renderer or remote network; all binary bytes equal.',samples:120,warmup:30,results};
};
