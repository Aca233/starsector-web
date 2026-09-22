/** Exact regression against the pre-incremental-cell index, including extension reads. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {ProjectileInterceptionIndex as Reference} from './lib/projectile-interception-reference.mjs';
// Default checks the restored production baseline; archived candidates are opt-in.
const source = process.env.INTERCEPTION_INDEX_SOURCE ?? './src/engine/simulation/collision/ProjectileInterceptionIndex';
const expectCache = process.env.INTERCEPTION_EXPECT_CACHE === '1';
const dir=path.resolve('artifacts/interception-cells',`${Date.now()}-${process.pid}`);fs.mkdirSync(dir,{recursive:true});
await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:`export {ProjectileInterceptionIndex} from ${JSON.stringify(source)};`},outfile:path.join(dir,'index.mjs'),bundle:true,platform:'node',format:'esm'});
const {ProjectileInterceptionIndex:Candidate}=await import(pathToFileURL(path.join(dir,'index.mjs')));
let checks=0,seed=220922;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const rocket=(id,x=random()*10000,y=random()*10000)=>({id,isRocket:id%3!==0,pos:{x,y},prevPos:{x:x-20,y:y+20},radius:random()*30,targetProjectileId:1});
const ids=a=>a.map(p=>p.id);
for(let scene=0;scene<30;scene++){
 let a=Array.from({length:180},(_,i)=>rocket(i)),b=structuredClone(a),before=new Reference(),after=new Candidate();
 for(let n=0;n<220;n++){
  const i=Math.floor(random()*a.length),action=n%9;
  if(action===0){const dx=(random()-.5)*2000,dy=(random()-.5)*2000;for(const [list,index]of [[a,before],[b,after]]){list[i].pos.x+=dx;list[i].pos.y+=dy;index.update(list[i]);}}
  if(action===1){for(const [list,index]of [[a,before],[b,after]]){list[i].radius+=n%4;index.invalidate();}}
  if(action===2){for(const [list,index]of [[a,before],[b,after]]){const [p]=list.splice(i,1);index.remove(p);}}
  if(action===3){const p=rocket(1000+n);a.push(p);b.push(structuredClone(p));}
  if(action===4){const p=rocket(2000+n);a[i]=p;b[i]=structuredClone(p);before.invalidate();after.invalidate();}
  if(action===5){a.reverse();b.reverse();before.invalidate();after.invalidate();}
  if(action===6){for(const [list,index]of [[a,before],[b,after]]){list[i].isRocket=!list[i].isRocket;index.invalidate();}}
  if(action===7){before.invalidate();after.invalidate();} // unchanged impact/effect invalidation
  if(action===8){a=a.slice();b=b.slice();} // replacement array with the same members
  const p={...rocket(-1,random()*10000,random()*10000),isRocket:false},radius=random()*2000;
  eq(ids(after.query(p,b)),ids(before.query(p,a)),'ordered sweep candidates');
  eq(ids(after.queryRadius(p.pos,radius,b)),ids(before.queryRadius(p.pos,radius,a)),'ordered fuse candidates');
 }
}
{
 const a=Array.from({length:100},(_,i)=>rocket(i)),b=structuredClone(a),before=new Reference(),after=new Candidate();
 for(const coordinate of [NaN,Infinity,-Infinity,1e40,-0,0,255.999999999,256])for(const radius of [0,NaN,Infinity,-3,1e20]){
  for(const [list,index]of [[a,before],[b,after]]){list[1].pos={x:coordinate,y:coordinate};list[1].radius=radius;index.invalidate();}
  const p={...rocket(-1,0,0),isRocket:false};
  eq(ids(after.query(p,b)),ids(before.query(p,a)),'extreme indexed entry');
  eq(ids(after.queryRadius({x:coordinate,y:coordinate},radius,b)),ids(before.queryRadius({x:coordinate,y:coordinate},radius,a)),'extreme query');
 }
 a.push(a[1]);b.push(b[1]);before.invalidate();after.invalidate();
 eq(after.queryRadius({x:0,y:0},300,b),b,'duplicates use full source');
 eq(ids(after.queryRadius({x:0,y:0},300,b)),ids(before.queryRadius({x:0,y:0},300,a)),'duplicate positions preserved');
 for(const flag of [{isFlare:true},{didDamage:true},{isRocket:true,targetProjectileId:undefined},{spawnType:'BALLISTIC_AS_BEAM'}]){
  const p={...rocket(-1,0,0),isRocket:false,...flag};eq(ids(after.query(p,b)),ids(before.query(p,a)),'query eligibility');
 }
 eq(after.queryRadius({x:0,y:0},300,b.slice(0,24)),b.slice(0,24),'small lists unchanged');
}
{
 const events=[[],[]];const lists=events.map(log=>Array.from({length:80},(_,id)=>({id,isRocket:true,
  get pos(){log.push('pos');return {get x(){log.push('x');return id;},get y(){log.push('y');return 0;}};},
  get radius(){log.push('radius');return {valueOf(){log.push('radiusValue');return 5;}};}})));
 const indices=[new Reference(),new Candidate()];
 for(let n=0;n<4;n++){
  for(let k=0;k<2;k++){events[k].length=0;indices[k].invalidate();indices[k].queryRadius({x:0,y:0},20,lists[k]);}
  eq(events[1],events[0],'original getter/coercion order on each invalidation');
 }
 // An object coordinate can keep identity while changing value: never memoize it.
 for(let k=0;k<2;k++)lists[k][1]={id:1,isRocket:true,pos:{x:{valueOf(){events[k].push('coerce');return events[k].length*300;}},y:0},radius:3};
 for(let n=0;n<4;n++){
  const results=[];for(let k=0;k<2;k++){events[k].length=0;indices[k].invalidate();results.push(indices[k].queryRadius({x:0,y:0},20,lists[k]));}
  eq(ids(results[1]),ids(results[0]),'mutable numeric coercion candidates');eq(events[1],events[0],'mutable numeric coercion reads');
 }
}
// A mutable getter can delete an already-counted entry during rebuild; counts alone
// must not hide a different obsolete entry after a same-length source replacement.
{
 const outputs=[],reads=[];
 for(const Type of [Reference,Candidate]){
  const source=Array.from({length:100},(_,id)=>({id,isRocket:id<2,pos:{x:0,y:0},radius:3})),index=new Type();
  index.queryRadius({x:0,y:0},100,source);let count=0;
  Object.defineProperty(source[0],'isRocket',{get(){return ++count%2===1;}});
  source[1]={id:999,isRocket:false,pos:{x:0,y:0},radius:0};index.invalidate();
  outputs.push(ids(index.queryRadius({x:0,y:0},100,source)));reads.push(count);
 }
 eq(outputs,[[],[]],'reentrant removal cannot hide an obsolete entry');eq(reads[1],reads[0],'rocket getter retains read count');
}
// Returning from custom coordinate coercion must not reuse a stale numeric pose.
// Also cross bounded/unbounded and same-cell boundaries through both update paths.
for (const refresh of ['update', 'invalidate']) {
 const indices = [new Reference(), new Candidate()];
 const lists = indices.map(() => Array.from({length: 100}, (_, id) =>
  ({id, isRocket: id === 0, pos: {x: 0, y: 0}, radius: 3})));
 const poses = [
  () => ({x: 0, y: 0, radius: 3}),
  () => ({x: {valueOf: () => 10000}, y: 0, radius: 3}),
  () => ({x: 0, y: 0, radius: 3}),
  () => ({x: 1, y: 0, radius: 3}),
  () => ({x: 1, y: 0, radius: Infinity}),
  () => ({x: 1, y: 0, radius: -Infinity}),
  () => ({x: 1, y: 0, radius: 3}),
  () => ({x: 10000, y: 0, radius: 3}),
 ];
 for (const pose of poses) {
  const outputs = [];
  for (let k = 0; k < indices.length; k++) {
   const {x, y, radius} = pose();
   lists[k][0].pos = {x, y}; lists[k][0].radius = radius;
   if (refresh === 'update') indices[k].update(lists[k][0]);
   else indices[k].invalidate();
   outputs.push([0, 1].map(() => ids(indices[k].queryRadius({x: 0, y: 0}, 20, lists[k]))));
  }
  eq(outputs[1], outputs[0], refresh + ' cache representation transition');
 }
}
// Coordinate coercion can reenter update with a different numeric pose; outer
// cells must not inherit that nested pose's numeric cache.
{
 const outputs = [], reads = [];
 for (const Type of [Reference, Candidate]) {
  const index = new Type(), source = Array.from({length: 100}, (_, id) =>
   ({id, isRocket: id === 0, pos: {x: 0, y: 0}, radius: 3}));
  const projectile = source[0]; let count = 0;
  index.queryRadius({x: 0, y: 0}, 20, source);
  projectile.pos = {x: {valueOf() {
   if (++count === 1) {
    projectile.pos = {x: 10000, y: 0}; index.update(projectile);
   }
   return 0;
  }}, y: 0};
  index.update(projectile); index.update(projectile);
  outputs.push(ids(index.queryRadius({x: 0, y: 0}, 20, source))); reads.push(count);
 }
 eq(outputs, [[], []], 'coercion reentry cannot poison cached numeric pose');
 eq(reads[1], reads[0], 'reentrant coordinate coercion read count');
}
// Prove unchanged invalidation avoids computation, rather than merely returning fewer results.
const list=Array.from({length:100},(_,id)=>({...rocket(id,id*200,0),isRocket:true}));
const costs=[];
for(const Type of [Reference,Candidate]){
 const index=new Type(),cells=index.cells;let calls=0;index.cells=function(...args){calls++;return cells.apply(this,args);};
 index.queryRadius({x:0,y:0},50,list);calls=0;
 for(let i=0;i<10;i++){index.invalidate();index.queryRadius({x:0,y:0},50,list);}costs.push(calls);
 list[1].pos.x+=1;index.update(list[1]);
}
eq(costs,[1010,expectCache ? 10 : 1010],'cell calculation count for the explicitly selected variant');
const sweeps=[];
for(const Type of [Reference,Candidate]){
 const index=new Type(),source=Array.from({length:100},(_,id)=>({...rocket(id,id*200,0),isRocket:true}));
 index.queryRadius({x:0,y:0},50,source);
 const map=index.entries,iterator=map[Symbol.iterator];let visits=0;
 map[Symbol.iterator]=function(){const inner=iterator.call(this);return {next(){const result=inner.next();if(!result.done)visits++;return result;},[Symbol.iterator](){return this;}};};
 for(let i=0;i<10;i++){index.invalidate();index.queryRadius({x:0,y:0},50,source);}sweeps.push(visits);
 source.splice(0,1);index.invalidate();index.queryRadius({x:0,y:0},50,source);
 eq(map.size,99,'unknown removal still sweeps stale entries');
}
eq(sweeps,[1000,expectCache ? 0 : 1000],'second map sweep count for the explicitly selected variant');
const report={checks,source,expectCache,unchangedCellComputations:costs,unchangedSweepVisits:sweeps};fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(report);
