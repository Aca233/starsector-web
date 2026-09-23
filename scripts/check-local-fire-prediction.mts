import {SnapshotPlayback} from '../src/network/SnapshotPlayback';
import {combatRenderView} from '../src/engine/render/CombatRenderView';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {createLanWorld} from '../src/network/LanWorld';
import {captureCombat,applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';
import {LocalFirePrediction} from '../src/network/LocalFirePrediction';
import {predictedProjectileLayer} from '../src/engine/render/PredictedProjectileLayer';
import {setProjectileVisualLayer} from '../src/engine/render/ProjectileVisualLayer';
import {sound} from '../src/engine/audio/SoundManager';
import {WebGLProjectilePass} from '../src/engine/render/webgl/passes/WebGLProjectilePass';
import type {PlayerInput} from '../src/network/protocol';
const root=path.resolve('public');
globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(file));};
await assetManager.ensureManifestLoaded();
const match:any={id:'fire-prediction',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'hammerhead'},{id:'b',seat:1,team:1,hull:'hammerhead'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
const eligible=(m:any)=>!m.spec.isBeam&&!m.spec.isRocket&&!m.spec.everyFrameEffect&&(m.spec.chargeTime??0)===0&&['BALLISTIC','BALLISTIC_AS_BEAM','PLASMA'].includes(m.spec.spawnType??'');
function setup(single=false){
 const roster=single?{...match,players:match.players.map((p:any)=>({...p,hull:'onslaught'}))}:match;
 const host=createLanWorld(roster).engine,view=createLanWorld(roster).engine,ship=host.playerShip;
 const mount=ship.weapons.find(m=>eligible(m)&&(!single||m.spec.id==='tpc'));assert.ok(mount,'native fixture needs a supported mount');
 ship.weaponGroups=[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:[mount.slotId],alternatingIndex:0}];ship.selectedGroupIndex=0;
 ship.pos.set(0,0);ship.prevPos.set(0,0);ship.facingRad=0;mount.currentAngleRad=0;ship.aimTargetWorld.set(2000,0);
 const snapshot=captureCombat(host,1,{0:0,1:0},0);applyCombatSnapshot(view,snapshot,true);
 const prediction=new LocalFirePrediction();prediction.receive(view,1,0,0);
 const input=(seq=1,firing=true):PlayerInput=>({seq,keys:0,aim:[2000,0],firing,pointerActive:true,actions:[]});
 const fire=(at=0)=>prediction.record(view,input(),at,true);
 return {host,view,prediction,input,fire,mount:view.playerShip.weapons.find(m=>m.slotId===mount.slotId)!};
}

test('native first-round prediction is isolated from authoritative state, RNG, ammunition, flux, cooldown and sound',()=>{
 const f=setup(),before=captureCombat(f.view,1,{0:0,1:0},0),rng=JSON.stringify([f.view.random,f.view.visualRandom]);
 const original=sound.play;let calls=0;sound.play=()=>{calls++;};
 try{
  f.fire();f.prediction.render(f.view,16,true);const layer=predictedProjectileLayer(f.view);assert.equal(layer?.projectiles.length,1);
  const p=layer!.projectiles[0];assert.equal(p.sourceShipId,f.view.playerShip.id);assert.equal(p.specId,f.mount.spec.id);assert.equal(p.damage,0);assert.equal(p.empDamage,0);assert.ok(p.id<0);
  assert.deepEqual(captureCombat(f.view,1,{0:0,1:0},0),before);assert.equal(JSON.stringify([f.view.random,f.view.visualRandom]),rng);assert.equal(calls,0);
  assert.equal(f.prediction.stats().lastResponseMs,16);assert.equal(f.view.projectiles.length,0);
  f.prediction.render(f.view,32,true);assert.ok(p.pos.x>p.prevPos.x-1e-6);assert.equal(f.prediction.stats().lastResponseMs,16);
 }finally{sound.play=original;}
});

test('only one first round per held trigger, no duplicate seq or same-baseline click spam, no stale/unsent fire',()=>{
 const f=setup();f.fire();for(let i=2;i<80;i++)f.prediction.record(f.view,f.input(i),i,true);
 assert.equal(f.prediction.stats().predicted,1);f.prediction.record(f.view,f.input(81,false),90,true);f.prediction.record(f.view,f.input(82),91,true);assert.equal(f.prediction.stats().predicted,1);
 f.prediction.render(f.view,251,true);assert.equal(f.prediction.stats().expired,1);assert.equal(predictedProjectileLayer(f.view),undefined);
 f.prediction.record(f.view,f.input(83,false),252,true);f.prediction.record(f.view,f.input(84),253,true);assert.equal(f.prediction.stats().predicted,1);
 const unsent=setup();unsent.prediction.render(unsent.view,16,true);assert.equal(unsent.prediction.stats().predicted,0);
 const off=setup();off.prediction.record(off.view,off.input(),0,false);assert.equal(off.prediction.stats().predicted,0);
});

for(const [name,mutate] of Object.entries({
 noAmmo:(f:any)=>f.mount.ammo=0, cooldown:(f:any)=>f.mount.cooldownTimer=.2, disabled:(f:any)=>f.mount.isDisabled=true,
 phase:(f:any)=>{f.view.playerShip.shield.type='PHASE';f.view.playerShip.shield.phaseState='ACTIVE';}, overloaded:(f:any)=>f.view.playerShip.flux.isOverloaded=true,
 noFlux:(f:any)=>f.view.playerShip.flux.softFlux=f.view.playerShip.flux.maxFlux,
 charging:(f:any)=>f.mount.firingState='CHARGING', dead:(f:any)=>f.view.playerShip.isDead=true,
 alternating:(f:any)=>f.view.playerShip.weaponGroups[0].mode='ALTERNATING', AI:(f:any)=>f.view.playerShip.fireControlMode='AI',
 burst:(f:any)=>f.mount.spec={...f.mount.spec,burstSize:33}, beam:(f:any)=>f.mount.spec={...f.mount.spec,isBeam:true},
 missile:(f:any)=>f.mount.spec={...f.mount.spec,isRocket:true}, chargeTime:(f:any)=>f.mount.spec={...f.mount.spec,chargeTime:.1},
 experimental:(f:any)=>setProjectileVisualLayer(f.view,{projectiles:[],tick:1,time:0})
}))test('conservative authority/fallback gate: '+name,()=>{const f=setup();mutate(f);f.fire();assert.equal(f.prediction.stats().predicted,0);});

test('newer applied full-world ACK hands a real native shot over once; partial/old ACK cannot erase or invent shots',()=>{
 const f=setup();f.fire();f.prediction.render(f.view,16,true);
 f.prediction.receive(f.view,2,0,20);assert.equal(f.prediction.stats().pending,1);
 const ship=f.host.playerShip;ship.isFiringMain=true;
 ship.weaponControl.update(1/60,ship,0,null,p=>f.host.projectiles.push(p),b=>f.host.beams.push(b));
 assert.equal(f.host.projectiles.length,1);
 applyCombatSnapshot(f.view,captureCombat(f.host,3,{0:1,1:0},0));f.prediction.receive(f.view,3,1,32);
 assert.equal(f.prediction.stats().matched,1);assert.equal(f.prediction.stats().pending,0);
 const before=captureCombat(f.view,3,{0:1,1:0},0);f.prediction.render(f.view,32,true);
 assert.equal(predictedProjectileLayer(f.view)?.projectiles.length??0,0);assert.deepEqual(captureCombat(f.view,3,{0:1,1:0},0),before);
 f.prediction.receive(f.view,3,1,33);assert.equal(f.prediction.stats().matched,1);
 f.view.projectiles.length=0;f.prediction.render(f.view,40,true);assert.equal(predictedProjectileLayer(f.view),undefined,'dead authority projectile is never prolonged');
});

test('acknowledged input with no surviving projectile resolves without inventing a hit; reset and commands clear ghosts',()=>{
 const f=setup();f.fire();f.prediction.receive(f.view,2,1,32);assert.equal(f.prediction.stats().resolvedWithoutProjectile,1);assert.equal(f.prediction.stats().matched,0);
 const g=setup();g.fire();g.prediction.render(g.view,16,true);g.prediction.record(g.view,{...g.input(2),actions:[{id:1,kind:'group',value:1}]},17,true);assert.equal(g.prediction.stats().pending,0);assert.equal(predictedProjectileLayer(g.view),undefined);
 const h=setup();h.fire();h.prediction.render(h.view,16,true);h.prediction.reset(h.view);assert.equal(predictedProjectileLayer(h.view),undefined);h.prediction.record(h.view,h.input(2),17,true);assert.equal(h.prediction.stats().predicted,1,'no new baseline after reset');
});

for(const hz of [10,20])for(const response of [50,100,200])test(`${hz}Hz full worlds, ${response}ms simulated ACK: immediate local display, bounded authoritative resolution`,()=>{
 const f=setup();f.fire();let first:number|undefined;
 for(let now=0;now<response;now+=1000/60){f.prediction.render(f.view,now,true);if(first===undefined&&predictedProjectileLayer(f.view)?.projectiles.length)first=now;}
 assert.ok(first!==undefined&&first<=1000/60);assert.equal(f.prediction.stats().predicted,1);
 f.prediction.receive(f.view,1+Math.ceil(response/(1000/hz)),1,response);f.prediction.render(f.view,response,true);
 assert.equal(f.prediction.stats().pending,0);assert.equal(predictedProjectileLayer(f.view),undefined);
});

test('production projectile renderer consumes ghost layer while authority array stays empty',()=>{
 const f=setup();f.fire();f.prediction.render(f.view,16,true);
 let draws=0;const texture:any={width:32,height:32};const noop=()=>{};
 const batcher:any=new Proxy({currentViewProj:new Float32Array(16),drawSprite:()=>{draws++;}}, {get:(o,k)=>k in o?o[k as keyof typeof o]:noop});
 const ctx:any={batcher,ribbonBatcher:new Proxy({drawBallisticProjectile:()=>{draws++;}},{get:(o,k)=>k in o?o[k as keyof typeof o]:noop}),textures:{getTexture:()=>texture,getTextureInfo:()=>({...texture,texture})},hitGlowTex:texture,alpha:1};
 new WebGLProjectilePass().renderProjectilesAndMuzzle(combatRenderView(f.view),ctx);assert.ok(draws>0);assert.equal(f.view.projectiles.length,0);
});

test('queued group/system command blocks a later click until the corresponding full-world ACK',()=>{
 const f=setup();f.prediction.record(f.view,{...f.input(1,false),actions:[{id:1,kind:'group',value:0}]},0,true);
 f.prediction.record(f.view,f.input(2),16,true);assert.equal(f.prediction.stats().predicted,0);
 f.prediction.receive(f.view,2,0,32);f.prediction.record(f.view,f.input(3,false),33,true);f.prediction.record(f.view,f.input(4),34,true);assert.equal(f.prediction.stats().predicted,0);
 f.prediction.receive(f.view,3,4,48);f.prediction.record(f.view,f.input(5,false),49,true);f.prediction.record(f.view,f.input(6),50,true);assert.equal(f.prediction.stats().predicted,1);
});

test('first burst round reserves the complete noninterruptible flux budget without mutating it',()=>{
 const f=setup();assert.ok((f.mount.spec.burstSize??1)>1);
 const cost=f.mount.spec.fluxPerShot*f.view.playerShip.system.getWeaponFluxCostMultiplier(f.mount.spec.weaponType);
 f.view.playerShip.flux.softFlux=f.view.playerShip.flux.maxFlux-cost*1.5;
 const before=f.view.playerShip.flux.totalFlux;f.fire();assert.equal(f.prediction.stats().predicted,0);assert.equal(f.view.playerShip.flux.totalFlux,before);
});

test('old projectile baseline cannot confirm a new shot; oversized groups and invalid clocks remain bounded',()=>{
 const f=setup();f.fire();f.prediction.render(f.view,16,true);const old={...predictedProjectileLayer(f.view)!.projectiles[0],id:.7};
 const g=setup();g.view.projectiles.push(old);g.fire();g.prediction.receive(g.view,2,1,32);assert.equal(g.prediction.stats().matched,0);assert.equal(g.prediction.stats().resolvedWithoutProjectile,1);
 const h=setup();h.view.playerShip.weapons=Array.from({length:33},(_,i)=>({...h.mount,slotId:'test'+i}));h.view.playerShip.weaponGroups[0].weaponSlotIds=h.view.playerShip.weapons.map(m=>m.slotId);h.fire();assert.equal(h.prediction.stats().predicted,0);
 const j=setup();j.fire();j.prediction.render(j.view,NaN,true);assert.equal(predictedProjectileLayer(j.view),undefined);assert.equal(j.prediction.stats().pending,0);
});

test('pause/focus-loss/stale world and own-ship lifecycle clear speculative presentation',()=>{
 for(const mode of ['pause','death','replacement','stale']){
  const f=setup();f.fire();f.prediction.render(f.view,16,true);assert.ok(predictedProjectileLayer(f.view));
  if(mode==='death')f.view.playerShip.isDead=true;
  if(mode==='replacement')f.view.playerShip=f.view.enemyShip;
  f.prediction.render(f.view,mode==='stale'?251:17,mode!=='pause');
  assert.equal(predictedProjectileLayer(f.view),undefined,mode);assert.equal(f.prediction.stats().pending,0,mode);
 }
});

test('pointer outside combat canvas never predicts fire even if a stale firing bit is true',()=>{
 const f=setup();f.prediction.record(f.view,{...f.input(),pointerActive:false},0,true);assert.equal(f.prediction.stats().predicted,0);
 f.prediction.record(f.view,f.input(2),16,true);assert.equal(f.prediction.stats().predicted,1);
});

test('reset cannot forget an outstanding discrete command or reaccept duplicate input',()=>{
 const f=setup();f.prediction.record(f.view,{...f.input(1,false),actions:[{id:1,kind:'mode',value:0}]},0,true);
 f.prediction.reset(f.view);f.prediction.receive(f.view,2,0,16);
 f.prediction.record(f.view,f.input(2),17,true);assert.equal(f.prediction.stats().predicted,0);
 f.prediction.receive(f.view,3,2,32);f.prediction.record(f.view,f.input(3,false),33,true);f.prediction.record(f.view,f.input(4),34,true);assert.equal(f.prediction.stats().predicted,1);
 f.prediction.reset(f.view);f.prediction.receive(f.view,4,4,48);f.prediction.record(f.view,f.input(4),49,true);assert.equal(f.prediction.stats().predicted,1);
});

test('stock loadout coverage is measured rather than confusing enabled policy with actual predicted shots',()=>{
 const engine=createLanWorld(match).engine,ship=engine.playerShip;
 const rows=ship.weaponGroups.map((group,index)=>{
  ship.selectedGroupIndex=index;const prediction=new LocalFirePrediction();prediction.receive(engine,1,0,0);
  prediction.record(engine,{seq:1,keys:0,aim:[ship.pos.x+1000,ship.pos.y],firing:true,pointerActive:true,actions:[]},0,true);
  const row={mode:group.mode,weapons:ship.weapons.filter(m=>group.weaponSlotIds.includes(m.slotId)).map(m=>m.spec.id),...prediction.stats()};prediction.reset(engine);return row;
 });
 fs.writeFileSync('artifacts/network-stream-20260921/phase16/stock-coverage.json',JSON.stringify({hull:'hammerhead',rows},null,2));
 assert.ok(rows.some(row=>row.predicted>0),'at least one unmodified default native group must actually predict');
});

test('pause/reset cannot use an unacknowledged old ready weapon state to paint another first round',()=>{
 const f=setup();f.fire();f.prediction.reset(f.view);f.prediction.receive(f.view,2,0,16);
 f.prediction.record(f.view,f.input(2),17,true);assert.equal(f.prediction.stats().predicted,1);
 f.prediction.receive(f.view,3,2,32);f.prediction.record(f.view,f.input(3,false),33,true);f.prediction.record(f.view,f.input(4),34,true);assert.equal(f.prediction.stats().predicted,2);
});

test('every created prediction is accounted for as pending, matched, missing, expired or cancelled',()=>{
 const f=setup();f.fire();f.prediction.render(f.view,16,true);f.prediction.reset(f.view);
 const s=f.prediction.stats();assert.equal(s.cancelled,1);assert.equal(s.predicted,s.pending+s.matched+s.resolvedWithoutProjectile+s.expired+s.cancelled);
 f.prediction.reset(f.view);assert.equal(f.prediction.stats().cancelled,1);
});

function confirmFirst(f:ReturnType<typeof setup>){
 f.fire();f.prediction.render(f.view,16,true);
 const ship=f.host.playerShip;ship.isFiringMain=true;
 ship.weaponControl.update(1/60,ship,0,null,p=>f.host.projectiles.push(p),b=>f.host.beams.push(b));
 applyCombatSnapshot(f.view,captureCombat(f.host,2,{0:1,1:0},0));f.prediction.receive(f.view,2,1,32);
 assert.equal(f.prediction.stats().matched,1);return f.mount.spec.refireDelay*1000;
}
test('confirmed native single-round weapon predicts one held repeat at cadence, not on each accepted input',()=>{
 const f=setup(true),due=confirmFirst(f);assert.ok(due<=250,'stock tpc fixture keeps authority fresh');
 f.prediction.record(f.view,f.input(2),due-1,true);assert.equal(f.prediction.stats().predicted,1);
 const before=captureCombat(f.view,2,{0:1,1:0},0),rng=JSON.stringify([f.view.random,f.view.visualRandom]);
 f.prediction.record(f.view,f.input(3),due,true);assert.equal(f.prediction.stats().repeated,1);assert.equal(f.prediction.stats().pending,1);
 for(let i=4;i<50;i++)f.prediction.record(f.view,f.input(i),due+i,true);
 assert.equal(f.prediction.stats().predicted,2);assert.deepEqual(captureCombat(f.view,2,{0:1,1:0},0),before);assert.equal(JSON.stringify([f.view.random,f.view.visualRandom]),rng);
 f.prediction.render(f.view,due+16,true);assert.equal(predictedProjectileLayer(f.view)?.projectiles.length,1);
});

test('repeat receives a distinct authoritative projectile, preserves accounting, and cannot duplicate an already-observed next cycle',()=>{
 const f=setup(true),due=confirmFirst(f);f.prediction.record(f.view,f.input(2),due,true);
 const ship=f.host.playerShip;
 for(let i=0;i<Math.ceil(due*60/1000)+1;i++)ship.weaponControl.update(1/60,ship,0,null,p=>f.host.projectiles.push(p),b=>f.host.beams.push(b));
 assert.equal(f.host.projectiles.filter(p=>p.slotId===f.mount.slotId).length,2);
 applyCombatSnapshot(f.view,captureCombat(f.host,20,{0:2,1:0},0));f.prediction.receive(f.view,20,2,due+32);assert.equal(f.prediction.stats().matched,2);
 // A later real round with no pending prediction rebases its next firing time.
 for(let i=0;i<Math.ceil(due*60/1000);i++)ship.weaponControl.update(1/60,ship,0,null,p=>f.host.projectiles.push(p),b=>f.host.beams.push(b));
 applyCombatSnapshot(f.view,captureCombat(f.host,40,{0:3,1:0},0));f.prediction.receive(f.view,40,3,due*2+32);
 assert.ok(f.prediction.stats().observedCycles>0);f.prediction.record(f.view,f.input(4),due*2+33,true);assert.equal(f.prediction.stats().predicted,2);
 const s=f.prediction.stats();assert.equal(s.predicted,s.pending+s.matched+s.resolvedWithoutProjectile+s.expired+s.cancelled);
});

for(const mode of ['missing','ambiguous','expired','release','command','rate','time','ammo','flux','reload','stale','burst'])test('held repeat safely withheld: '+mode,()=>{
 const f=setup(true);let due=f.mount.spec.refireDelay*1000;
 if(['missing','ambiguous','expired'].includes(mode)){
  f.fire();
  if(mode==='ambiguous'){
   const ship=f.host.playerShip;ship.isFiringMain=true;ship.weaponControl.update(1/60,ship,0,null,p=>f.host.projectiles.push(p),b=>f.host.beams.push(b));
   f.host.projectiles.push({...f.host.projectiles[0],id:f.host.projectiles[0].id+100000});applyCombatSnapshot(f.view,captureCombat(f.host,2,{0:1,1:0},0));
  }
  if(mode==='expired')f.prediction.render(f.view,251,true);else f.prediction.receive(f.view,2,1,32);
 }else due=confirmFirst(f);
 if(mode==='release')f.prediction.record(f.view,f.input(2,false),40,true);
 if(mode==='command')f.prediction.record(f.view,{...f.input(2),actions:[{id:1,kind:'group',index:1} as any]},40,true);
 if(mode==='rate')f.view.playerShip.system.getWeaponRateOfFireMultiplier=()=>2;
 if(mode==='time')Object.defineProperty(f.view.playerShip,'subjectiveTimeMultiplier',{value:2});
 if(mode==='ammo')f.mount.ammo=0;
 if(mode==='flux')f.view.playerShip.flux.softFlux=f.view.playerShip.flux.maxFlux;
 if(mode==='reload')f.mount.reloadDelayRemaining=.2;
 if(mode==='stale')due=400;
 if(mode==='burst')f.mount.spec={...f.mount.spec,burstSize:2};
 // Release stays released; a fresh click is intentionally still the old first-shot path.
 f.prediction.record(f.view,f.input(3,mode!=='release'),due+1,true);assert.equal(f.prediction.stats().repeated,0);
});

test('shipping default onslaught manual group has real single-round prediction coverage',()=>{
 const engine=createLanWorld({...match,players:match.players.map((p:any)=>({...p,hull:'onslaught'}))}).engine,ship=engine.playerShip;
 const rows=ship.weaponGroups.map((group,index)=>({index,mode:group.mode,weapons:ship.weapons.filter(m=>group.weaponSlotIds.includes(m.slotId)).map(m=>({id:m.spec.id,single:eligible(m)&&(m.spec.burstSize??1)===1}))}));
 fs.mkdirSync('artifacts/network-stream-20260921/phase27',{recursive:true});
 fs.writeFileSync('artifacts/network-stream-20260921/phase27/onslaught-coverage.json',JSON.stringify(rows,null,2));assert.ok(rows.some(row=>row.mode==='LINKED'&&row.weapons.length&&row.weapons.every(m=>m.single)));
});

test('held inputs before a credited cadence do not scan the battlefield projectile list',()=>{
 const f=setup(true),due=confirmFirst(f),rows=f.view.projectiles;let reads=0;
 Object.defineProperty(f.view,'projectiles',{get(){reads++;return rows;},configurable:true});
 for(let i=2;i<12;i++)f.prediction.record(f.view,f.input(i),32+i*10,true);
 assert.equal(reads,0);f.prediction.record(f.view,f.input(12),due,true);assert.ok(reads>0);assert.equal(f.prediction.stats().repeated,1);
});

for(const gate of ['ammo','flux','rate'])test('ready cadence with '+gate+' gate never scans battlefield projectiles',()=>{
 const f=setup(true),due=confirmFirst(f),rows=f.view.projectiles;let reads=0;
 if(gate==='ammo')f.mount.ammo=0;
 if(gate==='flux')f.view.playerShip.flux.softFlux=f.view.playerShip.flux.maxFlux;
 if(gate==='rate')f.view.playerShip.system.getWeaponRateOfFireMultiplier=()=>2;
 Object.defineProperty(f.view,'projectiles',{get(){reads++;return rows;},configurable:true});
 for(let i=2;i<30;i++)f.prediction.record(f.view,f.input(i),due+i,true);
 assert.equal(reads,0);assert.equal(f.prediction.stats().repeated,0);
});

test('RAF timestamp before a just-accepted performance.now input cannot expire the new prediction',()=>{
 const f=setup(true);f.fire(10);f.prediction.render(f.view,8,true);
 assert.equal(f.prediction.stats().pending,1);assert.equal(f.prediction.stats().expired,0);assert.equal(f.prediction.stats().lastResponseMs,null);
 f.prediction.render(f.view,26,true);assert.equal(f.prediction.stats().pending,1);assert.equal(f.prediction.stats().lastResponseMs,16);assert.equal(predictedProjectileLayer(f.view)?.projectiles.length,1);
 f.prediction.render(f.view,261,true);assert.equal(f.prediction.stats().expired,1,'original 250ms bound is unchanged');
});

// Phase37: the first rising edge may legitimately be blocked by a queued command.
// Keep holding through real weapon updates and complete-world ACKs; no synthetic
// credit/private-field injection. A newly observed round can credit only its NEXT shot.
function blockedHeldFire() {
 const f=setup(true);let sequence=1,tick=1,now=0;
 f.prediction.record(f.view,{...f.input(sequence),actions:[{id:1,kind:'group',value:0}]},now,true);
 assert.equal(f.prediction.stats().predicted,0);
 const step=(inspect?:(f:ReturnType<typeof setup>)=>void,options:{input?:(input:PlayerInput)=>PlayerInput;ack?:(seq:number)=>number;receiveAt?:(now:number)=>number;afterApply?:(f:ReturnType<typeof setup>)=>void;enabled?:boolean;receive?:boolean;leadMs?:number}={})=>{
  now+=1000/60;sequence++;tick++;
  f.prediction.record(f.view,options.input?.(f.input(sequence))??f.input(sequence),now,options.enabled??true);
  const ship=f.host.playerShip;ship.isFiringMain=true;
  ship.weaponControl.update(1/60,ship,0,null,p=>f.host.projectiles.push(p),b=>f.host.beams.push(b));
  f.host.combatTime+=1/60;for(const p of f.host.projectiles)p.elapsedTime+=1/60;
  inspect?.(f);
  if(options.receive===false)return;
  const ack=options.ack?.(sequence)??sequence;
  applyCombatSnapshot(f.view,captureCombat(f.host,tick,{0:ack,1:0},0));
  options.afterApply?.(f);
  f.prediction.receive(f.view,tick,ack,options.receiveAt?.(now)??now,options.leadMs??0);
 };
 step();assert.equal(f.host.projectiles.length,1);assert.equal(f.prediction.stats().predicted,0);
 assert.equal(f.prediction.stats().recoveredCycles??0,0,'first ACK/its existing round only establishes the baseline');
 return {f,step,get sequence(){return sequence;},get tick(){return tick;},get now(){return now;}};
}
test('a command-blocked continuously held trigger recovers only after a unique later authoritative round',()=>{
 const x=blockedHeldFire(),f=x.f;
 for(let i=0;i<60&&f.host.projectiles.length<2;i++)x.step();
 assert.equal(f.host.projectiles.length,2);assert.equal(f.prediction.stats().recoveredCycles,1);
 assert.equal(f.prediction.stats().predicted,0,'recovery never redraws the observed round');
 const due=x.now+f.mount.cooldownTimer*1000,before=captureCombat(f.view,x.tick,{0:x.sequence,1:0},0),rng=JSON.stringify([f.view.random,f.view.visualRandom]);
 f.prediction.record(f.view,f.input(x.sequence+1),due-1,true);assert.equal(f.prediction.stats().repeated,0);
 f.prediction.record(f.view,f.input(x.sequence+2),due+1,true);assert.equal(f.prediction.stats().repeated,1);
 assert.deepEqual(captureCombat(f.view,x.tick,{0:x.sequence,1:0},0),before);assert.equal(JSON.stringify([f.view.random,f.view.visualRandom]),rng);
 f.prediction.render(f.view,due+17,true);assert.equal(predictedProjectileLayer(f.view)?.projectiles.length,1);
});

for(const mode of ['old-id','ambiguous','old-age','nan-age','negative-age','nan-id','negative-id','wrong-spec','wrong-owner','wrong-slot','over-budget','backwards-time','flat-time','negative-cooldown','nan-cooldown','group','teleport'])test('observed recovery rejects '+mode,()=>{
 const x=blockedHeldFire(),f=x.f;
 for(let i=0;i<60&&f.host.projectiles.length<2;i++)x.step(f=>{
  if(f.host.projectiles.length<2)return;
  const p=f.host.projectiles.at(-1)!;
  if(mode==='old-id')p.id=f.host.projectiles[0].id;
  if(mode==='ambiguous')f.host.projectiles.push({...p,id:p.id+10});
  if(mode==='old-age')p.elapsedTime=10;
  if(mode==='nan-age')p.elapsedTime=NaN;
  if(mode==='negative-age')p.elapsedTime=-1;
  if(mode==='nan-id')p.id=NaN;
  if(mode==='negative-id')p.id=-1;
  if(mode==='wrong-spec')p.specId='wrong-spec';
  if(mode==='wrong-owner')p.sourceShipId=f.host.enemyShip.id;
  if(mode==='wrong-slot')p.slotId='wrong-slot';
  if(mode==='over-budget')for(let k=0;k<513;k++)f.host.projectiles.push({...p,id:k+100});
  if(mode==='backwards-time')f.host.combatTime=-1;
  if(mode==='flat-time')f.host.combatTime-=1/60;
  const mount=f.host.playerShip.weapons.find(m=>m.slotId===f.mount.slotId)!;
  if(mode==='negative-cooldown')mount.cooldownTimer=-1;
  if(mode==='nan-cooldown')mount.cooldownTimer=NaN;
  if(mode==='group'){const ship=f.host.playerShip;ship.weaponGroups.push({...ship.weaponGroups[0],index:1});ship.selectedGroupIndex=1;}
  if(mode==='teleport')f.host.playerShip.teleportSequence++;
 });
 assert.equal(f.prediction.stats().recoveredCycles,0);assert.equal(f.prediction.stats().predicted,0);
});
for(const mode of ['old-ack','future-ack','nan-ack','stale-input','backwards-clock','release','outside','command','disabled','reset','owner','AI','not-firing','overload','burst','rate','time','experimental'])test('observed recovery respects intent and authority gate: '+mode,()=>{
 const x=blockedHeldFire(),f=x.f;
 const inspect=(f:ReturnType<typeof setup>)=>{
  if(f.host.projectiles.length<2)return;
  if(mode==='AI')f.host.playerShip.fireControlMode='AI';
  if(mode==='not-firing')f.host.playerShip.isFiringMain=false;
  if(mode==='overload')f.host.playerShip.flux.isOverloaded=true;
 };
 for(let i=0;i<60&&f.host.projectiles.length<2;i++)x.step(inspect,{
  ack:seq=>mode==='old-ack'?0:mode==='future-ack'?seq+100:mode==='nan-ack'?NaN:seq,
  receiveAt:now=>mode==='stale-input'?now+251:mode==='backwards-clock'?-1:now,
  enabled:mode!=='disabled',
  input:input=>mode==='release'?{...input,firing:false}:mode==='outside'?{...input,pointerActive:false}:mode==='command'?{...input,actions:[{id:input.seq,kind:'group',value:0}]}:input,
  afterApply:f=>{
   if(mode==='reset')f.prediction.reset(f.view);
   if(mode==='owner'&&f.host.projectiles.length>=2)f.view.playerShip=f.view.enemyShip;
   if(mode==='burst')f.mount.spec={...f.mount.spec,burstSize:2};
   if(mode==='rate')f.view.playerShip.system.getWeaponRateOfFireMultiplier=()=>2;
   if(mode==='time')Object.defineProperty(f.view.playerShip,'subjectiveTimeMultiplier',{value:2,configurable:true});
   if(mode==='experimental')setProjectileVisualLayer(f.view,{projectiles:[],tick:x.tick,time:x.now});
  }
 });
 assert.equal(f.prediction.stats().recoveredCycles,0);assert.equal(f.prediction.stats().repeated,0);
});
for(const gate of ['ammo','flux','reload','stale','rate','time'])test('recovered credit does not bypass '+gate,()=>{
 const x=blockedHeldFire(),f=x.f;
 for(let i=0;i<60&&f.host.projectiles.length<2;i++)x.step();
 assert.equal(f.prediction.stats().recoveredCycles,1);
 let due=x.now+f.mount.cooldownTimer*1000+1;
 if(gate==='ammo')f.mount.ammo=0;
 if(gate==='flux')f.view.playerShip.flux.softFlux=f.view.playerShip.flux.maxFlux;
 if(gate==='reload')f.mount.reloadDelayRemaining=.2;
 if(gate==='stale')due=x.now+251;
 if(gate==='rate')f.view.playerShip.system.getWeaponRateOfFireMultiplier=()=>2;
 if(gate==='time')Object.defineProperty(f.view.playerShip,'subjectiveTimeMultiplier',{value:2});
 f.prediction.record(f.view,f.input(x.sequence+1),due,true);assert.equal(f.prediction.stats().predicted,0);
});
for(const every of [3,6])test('continuous blocked trigger recovers on actual '+60/every+'Hz full snapshot cadence',()=>{
 const x=blockedHeldFire(),f=x.f;let steps=0;
 for(;steps<90&&f.prediction.stats().recoveredCycles===0;steps++)x.step(undefined,{receive:(steps+1)%every===0});
 assert.ok(steps<90);assert.equal(f.prediction.stats().recoveredCycles,1);assert.equal(f.prediction.stats().predicted,0);
 const due=x.now+f.mount.cooldownTimer*1000+1;
 f.prediction.record(f.view,f.input(x.sequence+1),due,true);assert.equal(f.prediction.stats().repeated,1);
});
test('a credited round cannot be reused by duplicate/old full frames or many held inputs',()=>{
 const x=blockedHeldFire(),f=x.f;
 for(let i=0;i<60&&f.host.projectiles.length<2;i++)x.step();
 const due=x.now+f.mount.cooldownTimer*1000+1;
 f.prediction.receive(f.view,x.tick,x.sequence,due-1);f.prediction.receive(f.view,x.tick-1,x.sequence,due-1);
 for(let seq=x.sequence+1;seq<x.sequence+50;seq++)f.prediction.record(f.view,f.input(seq),due+seq/1000,true);
 assert.equal(f.prediction.stats().recoveredCycles,1);assert.equal(f.prediction.stats().repeated,1);
 assert.equal(f.prediction.stats().pending,1);
});

for(const lead of [0,16.667,33.334,100,250,-1,NaN,Infinity,251])test('confirmed complete-world lead adjusts cadence within the existing bound: '+String(lead),()=>{
 const x=blockedHeldFire(),f=x.f;
 for(let i=0;i<60&&f.host.projectiles.length<2;i++)x.step(undefined,{leadMs:lead});
 assert.equal(f.prediction.stats().recoveredCycles,1);
 const valid=Number.isFinite(lead)&&lead>=0&&lead<=250?lead:0;
 const due=Math.max(x.now,x.now+f.mount.cooldownTimer*1000-valid);
 if(due>x.now)f.prediction.record(f.view,f.input(x.sequence+1),due-.01,true);
 assert.equal(f.prediction.stats().repeated,0);
 f.prediction.record(f.view,f.input(x.sequence+2),due+.01,true);assert.equal(f.prediction.stats().repeated,1);
});
test('playback exposes only the newest received full-world combat time, never cursor/wall extrapolation',()=>{
 const playback=new SnapshotPlayback();
 const frame=(tick:number)=>({tick,world:{combatTime:tick/60}} as any);
 assert.equal(playback.sample(0).confirmedTime,0);
 playback.push(frame(1));assert.equal(playback.sample(16).confirmedTime,1/60);
 playback.push(frame(2));playback.push(frame(3));assert.equal(playback.sample(20).confirmedTime,3/60);
 assert.equal(playback.sample(10000).confirmedTime,3/60);
 assert.equal(playback.push({tick:2,world:{combatTime:9999}} as any),false);
 assert.equal(playback.sample(20000).confirmedTime,3/60);
});
