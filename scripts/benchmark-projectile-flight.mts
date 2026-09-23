import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import {Vector2} from '../src/engine/math/Vector2';
import {ProjectileFlightPrediction} from '../src/network/ProjectileFlightPrediction';
import {projectileFlightLayer,projectileDisplayPose} from '../src/engine/render/ProjectileFlightLayer';
import {initializeSourceProjectile} from '../src/engine/simulation/systems/weapon/SourceProjectileLifecycle';
import type {Projectile} from '../src/engine/simulation/Weapon';
import type {CombatEngine} from '../src/engine/simulation/CombatEngine';
const out='artifacts/network-stream-20260921/phase29';
const q=(a:number[],f:number)=>a.toSorted((a,b)=>a-b)[Math.floor((a.length-1)*f)];
const stats=(a:number[])=>({p50:q(a,.5),p95:q(a,.95),p99:q(a,.99),max:Math.max(...a)});
let guard=0;
function setup(count:number){
 const rows=Array.from({length:count},(_,i)=>{
 const p={id:(i+.125)/8192,specId:'fixture',sourceShipId:'source',pos:new Vector2(i%300,i%177),prevPos:new Vector2(),vel:new Vector2(900,20),facingRad:0,
 spawnType:['BALLISTIC','BALLISTIC_AS_BEAM','PLASMA'][i%3],rangeRemaining:10000,totalRange:10000,damage:100,empDamage:12,damageType:'KINETIC',radius:2,color:[255,255,255],elapsedTime:.1,fadeTime:.3,projLength:100,projWidth:6} as Projectile;
 initializeSourceProjectile(p,900,new Vector2(0,20));return p;});return {projectiles:rows} as CombatEngine;
}
function run(count:number,hz:number,recipients:number,on:boolean){
 const engines=Array.from({length:recipients},()=>setup(count)),flights=engines.map(()=>new ProjectileFlightPrediction());const times:number[]=[],receives:number[]=[],renders:number[]=[];
 for(let frame=0;frame<900;frame++){
  const now=frame*1000/60;let receive=0,render=0;
  for(let index=0;index<recipients;index++){
   const e=engines[index],f=flights[index];
   if(frame%(60/hz)===0){
    // Common authority updates excluded, so compare the INCREMENTAL presentation
    // work, not simulation/network/packing/inflation/full-state restoration.
    for(const p of e.projectiles){p.pos.x+=900/hz;p.pos.y+=20/hz;p.elapsedTime+=1/hz;}
    if(on){const t=performance.now();f.receive(e,frame,now);receive+=performance.now()-t;}
   }
   const t=performance.now();if(on)f.render(e,now,true);const layer=projectileFlightLayer(e);
   for(const p of e.projectiles){const view=projectileDisplayPose(p,layer);guard+=view.pos.x*.00001+view.pos.y*.000001+(view.ballisticTail?.x??0)*.00001;}
   render+=performance.now()-t;
  }
  if(frame>=180){times.push(receive+render);receives.push(receive);renders.push(render);}
 }
 return {total:stats(times),receive:stats(receives),renderAndReads:stats(renders),frames:times};
}
const pairs=[];
for(const [count,hz,recipients] of [[100,20,1],[500,20,1],[1500,10,1],[1500,60,1],[500,20,3],[500,20,5]]){
 for(let pair=0;pair<3;pair++){
  let baseline:ReturnType<typeof run>,candidate:ReturnType<typeof run>;
  if(pair===1){candidate=run(count,hz,recipients,true);baseline=run(count,hz,recipients,false);}else{baseline=run(count,hz,recipients,false);candidate=run(count,hz,recipients,true);}
  pairs.push({count,hz,recipients,pair,baseline,candidate});
 }
}
const report={scope:'Synthetic known straight native-lifecycle shots, 60 render samples/sec, existing geometry property reads only; incremental receive+flight CPU. 3/5 recipients are sequential display replicas, NOT sockets or real players. No RTT/Hz/bytes claim. Does not include actual GPU draw.',guard,pairs};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/benchmark.json',JSON.stringify(report));
console.log(JSON.stringify(pairs.map(({count,hz,recipients,pair,baseline,candidate})=>({count,hz,recipients,pair,baseline:baseline.total,candidate:candidate.total})),null,2));
