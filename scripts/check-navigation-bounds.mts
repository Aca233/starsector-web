import assert from 'node:assert/strict';import {test} from 'node:test';
import {avoidCollisions as control} from 'navigation-control';import {avoidCollisions as candidate,navigationGeometryCounts as counts} from 'navigation-candidate';
import {tacticalPolicy} from '../src/engine/ai/TacticalWorld';
import {assets,world} from './lib/native-projectile-fixture.mts';import {Vector2} from '../src/engine/math/Vector2';import {WeaponThreatEnvelope} from '../src/engine/ai/WeaponThreatEnvelope';
await assets();const e=world(22),ship=e.playerShip;
const scene:any={ships:[ship],projectiles:[],beams:[],asteroids:[],weaponThreatEnvelope:new WeaponThreatEnvelope()};
let seed=1917;const r=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function compare(desired:Vector2){const rng=JSON.stringify([e.random,e.visualRandom]);const a=control(ship,desired,scene),b=candidate(ship,desired,scene);assert.deepEqual(b,a);assert.equal(b.velocity===desired,a.velocity===desired,'original-vector identity');assert.equal(JSON.stringify([e.random,e.visualRandom]),rng);return a;}
function obstacle(x:number,y:number,radius:number,vx=0,vy=0){return {pos:new Vector2(x,y),vel:new Vector2(vx,vy),radius,hp:100};}
function ordinary(){ship.pos.set(0,0);ship.vel.set(100,0);ship.facingRad=0;scene.asteroids=[obstacle(100,0,80),obstacle(50,160,60)];}
test('native finite navigation keeps exact choices/risk across 6000 dense, sparse and moving geometries',()=>{
 for(let i=0;i<6000;i++){
  ship.pos.set((r()-.5)*3000,(r()-.5)*3000);ship.vel.set((r()-.5)*600,(r()-.5)*600);ship.facingRad=(r()-.5)*Math.PI*4;
  scene.asteroids=Array.from({length:Math.floor(r()*20)},()=>obstacle(ship.pos.x+(r()-.5)*1800,ship.pos.y+(r()-.5)*1800,r()*200,(r()-.5)*400,(r()-.5)*400));
  compare(new Vector2((r()-.5)*600,(r()-.5)*600));
 }
 assert.ok(counts.segments>100);assert.ok(counts.boxes>100);assert.ok(counts.distances>10);console.log('exercised exact geometry branches',counts);
});
test('zero/near-threshold directions, degenerate/extreme and nonfinite geometry preserve exact legacy output',()=>{
 for(const n of [0,-0,Number.MIN_VALUE,1e-9,1e-8,1-1e-10,1,1+1e-10,1e150,Number.MAX_VALUE,NaN,Infinity,-Infinity]){
  ordinary();for(const direction of [new Vector2(n,0),new Vector2(n,n),new Vector2(100,n)])compare(direction);
  for(const radius of [n,-n]){ordinary();scene.asteroids=[obstacle(80,0,radius)];compare(new Vector2(100,0));}
  ordinary();ship.vel.set(n,0);compare(new Vector2(100,0));ordinary();ship.pos.set(n,0);compare(new Vector2(100,0));
  ordinary();scene.asteroids=[obstacle(n,0,100,n,0)];compare(new Vector2(100,0));
 }
});
test('custom motion reader and dependency recorder retain original count/order',()=>{
 ordinary();const desired=new Vector2(100,0),original=ship.getMotionStats;let trace:string[]=[];
 ship.getMotionStats=function(){trace.push('motion');return original.call(this);};
 scene.ships=[ship,e.enemyShip];e.enemyShip.pos.set(200,0);scene.noteNavigationObstacle=()=>trace.push('obstacle');
 try {const a=control(ship,desired,scene),calls=[...trace];trace=[];const b=candidate(ship,desired,scene);assert.deepEqual(b,a);assert.deepEqual(trace,calls);}
 finally{ship.getMotionStats=original;delete scene.noteNavigationObstacle;scene.ships=[ship];}
});
test('custom vector and Math callback read order is preserved',()=>{
 for(const kind of ['method','coordinate','math']){
  ordinary();const desired=new Vector2(100,0),hypot=Math.hypot;let trace:string[]=[];
  if(kind==='method')desired.length=function(){trace.push('length');return Vector2.prototype.length.call(this);};
  if(kind==='coordinate')Object.defineProperty(desired,'x',{get(){trace.push('x');return 100;},configurable:true});
  if(kind==='math')Math.hypot=function(...v:number[]){trace.push('hypot');return hypot(...v);};
  try{const a=control(ship,desired,scene),calls=[...trace];trace=[];const b=candidate(ship,desired,scene);assert.deepEqual(b,a);assert.deepEqual(trace,calls);}
  finally{Math.hypot=hypot;}
 }
});
test('without an audited phase the geometry remains exact',()=>{
 ordinary();const envelope=scene.weaponThreatEnvelope;delete scene.weaponThreatEnvelope;try{compare(new Vector2(100,0));}finally{scene.weaponThreatEnvelope=envelope;}
});

test('touching axes and neighboring floating point values preserve the exact boundary',()=>{
 for(const radius of [0,Number.MIN_VALUE,1e-12,60,1e150,Infinity,NaN,-Infinity]){
  ordinary();const own=Math.max(ship.spec.collisionRadius,ship.shield.isActive&&ship.shield.type!=='PHASE'?ship.shield.radius:0);
  const combined=own+radius+tacticalPolicy.collisionMargin;
  for(const gap of [0,-0,combined,combined*(1-Number.EPSILON),combined*(1+Number.EPSILON),1e-150,1e150]){
   ordinary();ship.vel.set(0,0);scene.asteroids=[obstacle(gap,0,radius),obstacle(0,-gap,radius)];
   compare(new Vector2());compare(new Vector2(100,0));compare(new Vector2(0,100));
  }
 }
});
test('Math accessors and changes during motion reads preserve callback order and count',()=>{
 const originalMotion=ship.getMotionStats;
 for(const field of ['min','max','hypot'] as const)for(const dynamic of [false,true]){
  const descriptor=Object.getOwnPropertyDescriptor(Math,field)!;const original=descriptor.value;let trace:string[]=[];
  const wrapper=(...v:number[])=>{trace.push(field);return original(...v);};
  const install=()=>Object.defineProperty(Math,field,{get(){trace.push('get:'+field);return wrapper;},configurable:true});
  const run=(impl:typeof control)=>{
   ordinary();trace=[];
   if(dynamic)ship.getMotionStats=function(){install();return originalMotion.call(this);};else install();
   try {const result=impl(ship,new Vector2(100,0),scene);return {result,trace:[...trace]};}
   finally {Object.defineProperty(Math,field,descriptor);ship.getMotionStats=originalMotion;}
  };
  const a=run(control),b=run(candidate);assert.deepEqual(b,a,field+' dynamic='+dynamic);
 }
});
