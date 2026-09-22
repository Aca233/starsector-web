import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assets, world } from './lib/native-projectile-fixture.mts';
import { captureCombat, captureProjectileProjection, applyCombatSnapshots as controlApply } from '../src/network/CombatSnapshot';
import { captureCombat as candidate, applyCombatSnapshots as apply } from 'entity-candidate';
import { NativeProjectileCapsules, ProjectileCapsuleReceiver, restoreEntityValue } from '../src/network/ProjectileEntityCapsule';
import { expandSnapshotProjectiles } from '../src/network/ProjectileProjection';
import { encodeProjectedBinaryFrame, decodeBinaryFrame } from '../src/network/BinarySnapshot.mjs';
import { Vector2 } from '../src/engine/math/Vector2';
const copy = <T,>(x:T):T => structuredClone(x);
const binary = (x:any) => decodeBinaryFrame(encodeProjectedBinaryFrame(x,true));
const take = (e:any,t:number,fn:any=candidate) => fn(e,t,{0:t,1:t},0,true,true,true,true,true);
let assertions=0; const ok=(x:any,m?:string)=>{assert.ok(x,m);assertions++};
const equal=(a:any,b:any,m?:string)=>{assert.deepEqual(a,b,m);assertions++};
const rejects=(f:()=>any)=>{assert.throws(f);assertions++};
await assets();
// Synthetic native rows exercise lifecycle independent of fixtures.
const source=world(2), viewer=world(2);
source.projectiles=Array.from({length:4},(_,i)=>({id:i+1,specId:'test',pos:new Vector2(i,0),vel:new Vector2(60,0),elapsedTime:0,nested:{a:[1,2],gone:true},optional:undefined,inf:Infinity} as any));
let receiver=new ProjectileCapsuleReceiver();
const expected=()=>expandSnapshotProjectiles(binary(captureProjectileProjection(source)));
const frame0=take(source,0), p0=frame0.world.projectiles.$projectileEntityCapsule;
ok(p0,'candidate must actually activate'); equal(receiver.decode(p0,0),expected());
apply(viewer,[binary(frame0)],true,undefined,{nativeTargeting:true});
const oldView=viewer.projectiles[0]; (oldView as any).localRenderField=1;
source.projectiles[0].pos.x+=2; source.projectiles[0].nested.a[0]=9;
delete source.projectiles[0].nested.gone; source.projectiles[0].newField='added';
source.projectiles=source.projectiles.slice(1).concat(source.projectiles[0]);
source.projectiles.splice(1,1,{id:99,specId:'test',pos:new Vector2(9,7),vel:new Vector2(),nested:{born:true}} as any);
take(source,5); // abandoned capture must never create a baseline dependency
const f=take(source,8), p=f.world.projectiles.$projectileEntityCapsule;
equal(receiver.decode(p,8),expected());equal(new ProjectileCapsuleReceiver().decode(p,8),expected());
apply(viewer,[binary(f)],false,undefined,{nativeTargeting:true});
const reused=viewer.projectiles.find(p=>p.id===1)!; equal(reused,oldView);ok(!('gone' in reused.nested));equal(reused.localRenderField,1);
reused.pos.x=999;reused.nested.a[0]=100;apply(viewer,[binary(f)],false,undefined,{nativeTargeting:true});equal(reused.pos.x,2);equal(reused.nested.a[0],9);
const owned=new ProjectileCapsuleReceiver().decode(copy(p),8); rejects(()=>{owned[0].id=400});
const wire=copy(p);const owned2=new ProjectileCapsuleReceiver().decode(wire,8);wire[4][0][1].pos={$vector:[90,90]};equal(owned2,expected());
source.projectiles[0].pos.x=123;equal(new ProjectileCapsuleReceiver().decode(p,8),owned2,'source does not alias packet');
const cache=new ProjectileCapsuleReceiver();cache.decode(p0,0);
for(const mutate of [
 (p:any)=>p[0]=-1,(p:any)=>p[2]++, (p:any)=>p[1]='!!!!', (p:any)=>p[1]='A'.repeat(200000),
 (p:any)=>p[4]=[[0,{id:9},[]]],(p:any)=>p[4]=[[500,{},[]]],(p:any)=>p[4]=[[0,{},[]],[0,{},[]]],
 (p:any)=>p[4]=[[0,{bad:{$ship:'x'}},[]]], (p:any)=>p[4]=[[0,{bad:{$vector:[1,NaN]}},[]]],
 (p:any)=>p[4]=[[0,{bad:{$undefined:2}},[]]],(p:any)=>p[4]=[[0,{bad:{$number:'no'}},[]]],
 (p:any)=>p[4]=[[0,{bad:NaN},[]]],(p:any)=>p[4]=[[0,{bad:'x'.repeat(65537)},[]]],
 (p:any)=>p[4]=[[0,{bad:JSON.parse('{"__proto__":1}')},[]]],
 (p:any)=>p[4]=[[0,{bad:Array(4097).fill(1)},[]]],
 (p:any)=>p[4]=[[0,{bad:Array.from({length:33}).reduce(a=>({a}),{})},[]]],
 (p:any)=>p[6]=[0,0,2,3],(p:any)=>p[5]=[0],(p:any)=>p[3]=[[0,{},[]]],
 (p:any)=>p[4]=[[0,{bad:Array(100).fill('x'.repeat(65536))},[]]],
]) {const bad=copy(p0);mutate(bad);rejects(()=>cache.decode(bad,0));equal(cache.decode(p0,0),new ProjectileCapsuleReceiver().decode(p0,0),'invalid packets do not poison cache');}
const invalid=copy(f);invalid.world.projectiles.$projectileEntityCapsule[4]=[[999,{},[]]];invalid.ships[0].state.hullHp=1;
const hp=viewer.allCapitalShips[0].hullHp;rejects(()=>apply(viewer,[invalid],false,undefined,{nativeTargeting:true}));equal(viewer.allCapitalShips[0].hullHp,hp,'validate before viewer mutation');
// Reference overflow without a correction is invalid even if the anchor is finite.
const extreme=Array.from({length:4},(_,i)=>({id:i,specId:'x',pos:{$vector:[Number.MAX_VALUE,0]},vel:{$vector:[Number.MAX_VALUE,0]}}));
const bytes=encodeProjectedBinaryFrame({world:{projectiles:extreme}},true);const anchor=Buffer.from(bytes).toString('base64');
rejects(()=>new ProjectileCapsuleReceiver().decode([0,anchor,30,[],[],[],null],30));
const native=new NativeProjectileCapsules(new Set(),()=>false), simple=Array.from({length:4},(_,i)=>({id:i,specId:'x',pos:new Vector2(),n:{a:1}}));
const baseline=()=>({world:{projectiles:simple.map(r=>({...r,pos:{$vector:[0,0]}}))}});
ok(native.capture(simple,0,baseline));
for(const bad of [new Uint8Array(2),new Date(),source.allCapitalShips[0],{$ship:'bad'},Array(2),Object.assign([1],{extra:2})]) {
 const input=simple.map(r=>({...r,bad}));equal(native.capture(input,1,baseline),null);ok(native.capture(simple,2,baseline));
}
const cycle:any={};cycle.self=cycle;equal(native.capture(simple.map(r=>({...r,cycle})),2,baseline),null);
equal(native.capture(simple.map(r=>({...r,id:Number.MAX_SAFE_INTEGER+1})),2,baseline),null);
// Native 22-ship trajectory, real births/deaths, rotations, cold and warm decode.
const engine=world();for(const s of engine.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
for(let i=0;i<120;i++)engine.fixedUpdate(1/60);
receiver=new ProjectileCapsuleReceiver();const nativeViewer=world(), controlViewer=world();let min=Infinity,max=0,active=0;
for(let tick=1;tick<=300;tick++) {
 engine.fixedUpdate(1/60); const rng=JSON.stringify(engine.random);
 const frame=take(engine,tick), packet=frame.world.projectiles.$projectileEntityCapsule;ok(packet,'native fixture must use candidate, not silent fallback');active++;
 const oracle=expandSnapshotProjectiles(binary(captureProjectileProjection(engine)));
 equal(receiver.decode(packet,tick),oracle,`native tick ${tick}`);
 if(tick%17===0)equal(new ProjectileCapsuleReceiver().decode(packet,tick),oracle,'arbitrary skipped states');
 apply(nativeViewer,[binary(frame)],tick===1,undefined,{nativeTargeting:true});
 controlApply(controlViewer,[binary(take(engine,tick,captureCombat))],tick===1,undefined,{nativeTargeting:true});
 equal(expandSnapshotProjectiles(binary(captureProjectileProjection(nativeViewer))),oracle,'applied projectile semantics');
 if(tick%30===0){const actual=take(nativeViewer,tick,captureCombat);const control=take(controlViewer,tick,captureCombat);equal(actual.ships,control.ships,'ships unchanged');}
 equal(JSON.stringify(engine.random),rng,'capture does not advance authoritative RNG');
 min=Math.min(min,engine.projectiles.length);max=Math.max(max,engine.projectiles.length);
}
const report={passed:true,assertions,nativeTicks:300,active,minProjectiles:min,maxProjectiles:max,productionEnabled:false};
fs.writeFileSync('artifacts/network-stream-20260921/phase31/correctness.json',JSON.stringify(report,null,2));console.log(report);

