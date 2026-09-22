import {captureCombat as previousCapture} from 'damage-view-previous';
import assert from 'node:assert/strict';import {test} from 'node:test';
import {captureCombat as oldCapture,applyCombatSnapshots as oldApply} from 'receiver-fields-control';
import {captureCombat as newCapture,applyCombatSnapshots as newApply,damageViewDiagnostics} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {Vector2} from '../src/engine/math/Vector2';
import {assets,world} from './lib/native-projectile-fixture.mts';
import {normalizedProjection,DAMAGE_INTERNAL_FIELDS,renderMark} from './lib/damage-view-oracle.mts';
await assets();
const take=(e:any,t:number,fn:any=oldCapture,native=true,view=true)=>fn(e,t,{0:t,1:t},0,true,true,true,native,true,view);
const bytes=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
function mark(){return {cellIndex:80,localPos:new Vector2(2,3),opacity:.7,intensity:.234,heat:117,justHit:false,flash:11,flashElapsed:.23,phase:1.72,pulsePeriod:.57,size:42,rotationRad:.98,kind:'burns',variant:1};}
function withMarks(marks:any){const e=world(2);(e.allCapitalShips[0].damageDecals as any).marks=marks;return e;}
test('explicit native render view removes only six internals; no-view and non-native remain byte-identical',()=>{
 const e=withMarks([mark(),mark()]);
 const a=take(e,1),b=take(e,1,newCapture);
 assert.deepEqual(normalizedProjection(b),normalizedProjection(a,true));
 assert.ok(bytes(b).length<bytes(a).length);
 const projected=normalizedProjection(b).ships[0].state.damageDecals.marks[0];
 for(const key of DAMAGE_INTERNAL_FIELDS)assert.ok(!Object.hasOwn(projected,key));
 for(const native of [true,false])assert.deepEqual(bytes(take(e,2,newCapture,native,false)),bytes(take(e,2,oldCapture,native,false)));
 assert.deepEqual(bytes(take(e,3,newCapture,false,true)),bytes(take(e,3,oldCapture,false,true)));
});
test('unknown mark layouts, reordered fields, subclasses and custom arrays retain the full original contract',()=>{
 class CustomMark { constructor(){Object.assign(this,mark());} }
 const missing:any=mark();delete missing.heat;
 const changed:any=mark();delete changed.cellIndex;changed.cellIndex=80;
 class Marks extends Array<any>{}
 const mapped:any=[mark()];mapped.map=()=>[mark()];
 for(const marks of [[{...mark(),modValue:17}],[missing],[changed],[new CustomMark()],new Marks(mark()),mapped]){
  const e=withMarks(marks);assert.deepEqual(bytes(take(e,1,newCapture)),bytes(take(e,1)));
 }
});
test('direct path preserves the first view wire for scalar extremes, nonstandard vectors and late-row fallback',()=>{
 class OtherVector extends Vector2 {}
 for(const field of ['cellIndex','opacity','intensity','size','rotationRad','kind','variant'])for(const value of [-0,NaN,Infinity,-Infinity,Number.MAX_VALUE,null,undefined,false,'changed',()=>0]){
  const changed:any=mark();changed[field]=value;const e=withMarks([mark(),changed]);
  assert.deepEqual(bytes(take(e,1,newCapture)),bytes(take(e,1,previousCapture)));
 }
 for(const position of [new OtherVector(1,2),new Vector2(Infinity,0),{x:2,y:3},null]){
  const changed:any=mark();changed.localPos=position;const e=withMarks([mark(),changed]);
  assert.deepEqual(bytes(take(e,1,newCapture)),bytes(take(e,1,previousCapture)));
 }
});
test('sparse native arrays and mixed default/custom records preserve order, holes and unknown fields',()=>{
 const rows=Object.assign(new Array(4),{0:mark(),2:{...mark(),custom:'retained'},3:mark()});const e=withMarks(rows);
 assert.deepEqual(normalizedProjection(take(e,1,newCapture)),normalizedProjection(take(e,1),true));
});
test('non-native getter and Proxy reads/throws retain original eager capture ordering',()=>{
 const e=withMarks([]),ship:any=e.allCapitalShips[0],trace:string[]=[];let fail=false;
 const item:any=mark();Object.defineProperty(item,'heat',{enumerable:true,get(){trace.push('heat');if(fail)throw Error('sentinel');return 5;}});
 (ship.damageDecals as any).marks=[new Proxy(item,{get(t,k,r){if(typeof k==='string')trace.push('get:'+k);return Reflect.get(t,k,r);}})];
 for(const throws of [false,true]){
  fail=throws;trace.length=0;let a:any,b:any,ae:any,be:any;
  try{a=take(e,1,oldCapture,false);}catch(error){ae=(error as Error).message;}const before=trace.slice();trace.length=0;
  try{b=take(e,1,newCapture,false);}catch(error){be=(error as Error).message;}
  assert.deepEqual(trace,before);assert.equal(be,ae);if(!throws)assert.deepEqual(b,a);
 }
});
test('cold joins, skips, repeats and backward ticks restore every P1 field and visible mark, without aliasing frames',()=>{
 const source=withMarks([mark()]),a=world(2),b=world(2);let retained:any,owned:any;
 for(const tick of [1,2,12,12,3,220]){
  source.allCapitalShips[0].scorchMarks[0].intensity=tick/500;
  const x=take(source,tick),y=take(source,tick,newCapture);
  assert.deepEqual(normalizedProjection(y),normalizedProjection(x,true));
  oldApply(a,[decodeBinaryFrame(bytes(x))],true,undefined,{nativeTargeting:true,nativeProjection:true});
  newApply(b,[decodeBinaryFrame(bytes(y))],true,undefined,{nativeTargeting:true,nativeProjection:true});
  assert.deepEqual(normalizedProjection(take(b,tick),true),normalizedProjection(take(a,tick),true));
  assert.deepEqual(renderMark(b.allCapitalShips[0].scorchMarks[0]),renderMark(a.allCapitalShips[0].scorchMarks[0]));
  if(tick===1){retained=y;owned=bytes(y).slice();}
 }
 assert.deepEqual(bytes(retained),owned);
});
test('22-ship 1200-tick combat: full independent P1 oracle, RNG/state ownership, recovery and lifecycle',()=>{
 const source=world(),a=world(),b=world();for(const ship of source.allCapitalShips){ship.pos.scale(.2);ship.prevPos.copy(ship.pos);ship.fireControlMode='AI';}
 let peak=0,marks=0,saved=0;
 for(let tick=0;tick<=1200;tick++){
  if(tick)source.fixedUpdate(1/60);peak=Math.max(peak,source.projectiles.length);if(tick%10)continue;
  marks=Math.max(marks,source.allCapitalShips.reduce((n,s)=>n+s.scorchMarks.length,0));
  const rng=JSON.stringify([source.random,source.visualRandom]);const before=take(source,tick),after=take(source,tick,newCapture);
  assert.deepEqual(bytes(after),bytes(take(source,tick,previousCapture)),'direct vs first view bytes at '+tick);
  assert.deepEqual(normalizedProjection(after),normalizedProjection(before,true),'all P1 fields at '+tick);
  assert.equal(JSON.stringify([source.random,source.visualRandom]),rng);assert.deepEqual(bytes(take(source,tick)),bytes(before),'capture did not alter full authority');
  const x=bytes(before),y=bytes(after);assert.ok(y.length<=x.length);saved+=x.length-y.length;
  if(tick%70===0&&tick>0)continue; // Both receivers deliberately skip these self-contained frames.
  oldApply(a,[decodeBinaryFrame(x)],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});
  newApply(b,[decodeBinaryFrame(y)],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});
  assert.deepEqual(normalizedProjection(take(b,tick),true),normalizedProjection(take(a,tick),true),'entire reconstructed P1 at '+tick);
  if(tick%300===0){const cold=world(),coldOld=world();newApply(cold,[decodeBinaryFrame(y)],true,undefined,{nativeTargeting:true,nativeProjection:true});oldApply(coldOld,[decodeBinaryFrame(x)],true,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(normalizedProjection(take(cold,tick),true),normalizedProjection(take(coldOld,tick),true),'both cold receivers at '+tick);if(tick===300)assert.notDeepEqual(normalizedProjection(take(coldOld,tick),true),normalizedProjection(take(a,tick),true),'existing full legacy receiver also differs cold versus warm due retained beam fields');}
 }
 assert.ok(peak>30);assert.ok(marks>30);assert.ok(saved>100000);assert.ok(damageViewDiagnostics().directRows>10000);
});
