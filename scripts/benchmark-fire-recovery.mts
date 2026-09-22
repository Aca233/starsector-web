// Isolated receive CPU costs, not end-to-end latency/FPS. Real native weapon
// objects + stress projectile density; both arms read the SAME authoritative world.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {LocalFirePrediction as Before} from 'fire-recovery-control';
import {LocalFirePrediction as After} from '../src/network/LocalFirePrediction';
import {assetManager} from '../src/engine/assets/AssetResolver';import {createLanWorld} from '../src/network/LanWorld';import {captureCombat} from '../src/network/CombatSnapshot';
const root=path.resolve('public');globalThis.fetch=async(input:any)=>{const p=path.resolve(root,String(input).replace(/^\//,''));if(!p.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};await assetManager.ensureManifestLoaded();
const match:any={id:'receive-cost',seed:917,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(10).fill('hammerhead'),Array(10).fill('hammerhead')]}};
const rows:any[]=[];const q=(xs:number[],p:number)=>xs.toSorted((a,b)=>a-b)[Math.floor((xs.length-1)*p)];
for(const count of [128,1024,4096])for(const mode of ['idle','working','command-blocked'])for(const reverse of [false,true]){
 const engine=createLanWorld(match).engine,ship=engine.playerShip,mount=ship.weapons.find(m=>m.spec.id==='tpc')!;assert.ok(mount);
 ship.pos.set(0,0);ship.prevPos.set(0,0);ship.facingRad=0;mount.currentAngleRad=0;ship.aimTargetWorld.set(2000,0);
 ship.weaponGroups=[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:[mount.slotId],alternatingIndex:0}];ship.selectedGroupIndex=0;ship.isFiringMain=true;
 ship.weaponControl.update(1/60,ship,0,null,p=>engine.projectiles.push(p),()=>{});const template=engine.projectiles.find(p=>p.slotId===mount.slotId)!;assert.ok(template);mount.cooldownTimer=0;
 engine.projectiles=Array.from({length:count},(_,i)=>({...template,id:i+1,sourceShipId:i<8?ship.id:engine.enemyShip.id,elapsedTime:.05}));
 const arms=[{name:'before',prediction:new Before(),times:[] as number[]},{name:'after',prediction:new After(),times:[] as number[]}];if(reverse)arms.reverse();
 for(const a of arms){a.prediction.receive(engine,0,0,0);a.prediction.record(engine,{seq:1,keys:0,aim:[2000,0],pointerActive:true,firing:mode!=='idle',actions:mode==='command-blocked'?[{id:1,kind:'group',value:0}]:[]},0,true);}
 for(let i=1;i<=1400;i++){
  const now=i*1000/60;engine.combatTime=i/60;
  for(const a of arms){
   a.prediction.record(engine,{seq:i+1,keys:0,aim:[2000,0],pointerActive:true,firing:mode!=='idle',actions:[]},now,true);
   const start=performance.now();a.prediction.receive(engine,i,i+1,now,0);const elapsed=performance.now()-start;
   if(i>200)a.times.push(elapsed);
  }
 }
 const snapshot=captureCombat(engine,1400,{},0);
 for(const a of arms)a.prediction.receive(engine,1401,1401,1401*1000/60,0);
 assert.deepEqual(captureCombat(engine,1400,{},0),snapshot,'Prediction receive must never modify authority');
 rows.push({count,own:8,mode,order:reverse?'B/A':'A/B',arms:arms.map(a=>({name:a.name,p50Ms:q(a.times,.5),p95Ms:q(a.times,.95),maxMs:Math.max(...a.times)}))});
}
const output={scope:'Node receive() CPU only, same native authoritative world, synthetic projectile density, 200 warmup + 1200 samples per arm; not render/apply/transport performance.',rows};
fs.writeFileSync('artifacts/network-stream-20260922/phase37/receive-cpu.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
