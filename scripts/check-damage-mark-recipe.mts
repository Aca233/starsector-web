import assert from 'node:assert/strict';import {test} from 'node:test';
import {captureCombat as oldCapture,applyCombatSnapshots as oldApply} from 'receiver-fields-control';
import {captureCombat as newCapture,applyCombatSnapshots as newApply} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {assets,world} from './lib/native-projectile-fixture.mts';
import {normalizedDamageRecipe as oracle} from './lib/damage-recipe-oracle.mts';
import {captureDamageRecipe,DamageRecipeDecoder,recordDamageBirths,damageRecipeDiagnostics,DAMAGE_RECIPE_LIMITS} from './lib/damage-mark-recipe-experiment';
import {Vector2} from '../src/engine/math/Vector2';
await assets();
const take=(e:any,t=1,fn:any=oldCapture,native=true,recipes=true)=>fn(e,t,{0:t,1:t},0,true,true,true,native,true,recipes);
const bytes=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
function damaged(){recordDamageBirths(true);const e=world(2),s=e.allCapitalShips[0];for(let c=3;c<7;c++){s.armor.setCell(c,3,0);s.damageDecals.onCellDamage(c,3,100);}return {e,s};}
test('self-contained recipe, exact authority state/RNG and default/non-native compatibility',()=>{
 const {e,s}=damaged(),a=take(e),rng=JSON.stringify([e.random,e.visualRandom]);
 const direct=captureDamageRecipe(s.scorchMarks,{rows:0});assert.ok(direct);assert.equal(direct.rows.length,4);
 const b=take(e,1,newCapture);assert.ok(bytes(b).length<bytes(a).length);assert.deepEqual(oracle(b),oracle(a));
 assert.equal(JSON.stringify([e.random,e.visualRandom]),rng);assert.deepEqual(bytes(take(e)),bytes(a));
 for(const n of [true,false])assert.deepEqual(bytes(take(e,1,newCapture,n,false)),bytes(take(e,1,oldCapture,n,false)));
 assert.deepEqual(bytes(take(e,1,newCapture,false,true)),bytes(take(e,1,oldCapture,false,true)));
 const out=new DamageRecipeDecoder().decode(direct,null,{rows:0});
 for(let i=0;i<4;i++)for(const key of Object.keys(out[i]))assert.deepEqual(out[i][key],(s.scorchMarks[i] as any)[key]);
});
test('unknown/changed mark shapes, custom vectors/arrays, missing birth and late row all fall back intact',()=>{
 const variations=[(m:any)=>{m.extra=4;},(m:any)=>{m.size+=1;},(m:any)=>{m.localPos.x+=1;},(m:any)=>{m.localPos={x:m.localPos.x,y:m.localPos.y};},(m:any)=>{m.localPos=null;},(m:any)=>{m.intensity=NaN;},(m:any)=>{delete m.heat;},(m:any)=>{Object.setPrototypeOf(m,{x:1});}];
 for(const mutate of variations){const {e,s}=damaged();mutate(s.scorchMarks[3]);const a=take(e),b=take(e,1,newCapture);assert.deepEqual(bytes(b),bytes(a));}
 const {e,s}=damaged();const original=s.scorchMarks[3];s.scorchMarks[3]={...original,localPos:new Vector2(original.localPos.x,original.localPos.y)};
 assert.deepEqual(bytes(take(e,1,newCapture)),bytes(take(e)));
 (s.scorchMarks as any).custom=true;assert.deepEqual(bytes(take(e,1,newCapture)),bytes(take(e)));
});
test('decoder preflight rejects malformed batches without touching display state and bounds cache/work',()=>{
 const {s}=damaged(),packet=captureDamageRecipe(s.scorchMarks,{rows:0})!,decoder=new DamageRecipeDecoder();
 const bad=[(p:any)=>{p.$damageMarks=2;},(p:any)=>{p.geometry[0][0]=0;},(p:any)=>{p.geometry[0][4]=Infinity;},(p:any)=>{p.geometry[0]=[1,1,0,0,1e308,1];},(p:any)=>{p.rows[3][0]=1e6;},(p:any)=>{p.rows[3][1]=-1;},(p:any)=>{p.rows[3][2]=.5;},(p:any)=>{p.rows[3][4]=NaN;},(p:any)=>{p.rows[3].push(0);},(p:any)=>{p.rows=Array(DAMAGE_RECIPE_LIMITS.marks+1).fill(p.rows[0]);}];
 for(const change of bad){const p=structuredClone(packet);change(p);const target=[{keep:42}];assert.throws(()=>decoder.decode(p,target,{rows:0}),/damage recipe/);assert.deepEqual(target,[{keep:42}]);}
 assert.equal(decoder.cacheSize,0);assert.throws(()=>decoder.decode(packet,null,{rows:DAMAGE_RECIPE_LIMITS.frameMarks}),/damage recipe/);
 const p=structuredClone(packet);for(let i=0;i<DAMAGE_RECIPE_LIMITS.cache+10;i++){p.rows=[packet.rows[0].slice()];p.rows[0][2]=i;decoder.decode(p,null,{rows:0});}assert.equal(decoder.cacheSize,DAMAGE_RECIPE_LIMITS.cache);
 const out=decoder.decode(packet,null,{rows:0}),before=structuredClone(packet);out[0].localPos.x=999;out[0].size=999;
 const other=decoder.decode(packet,null,{rows:0});assert.deepEqual(other[0].localPos,s.scorchMarks[0].localPos);assert.deepEqual(packet,before);assert.notEqual(out[0],other[0]);assert.notEqual(out[0].localPos,other[0].localPos);
});
test('22 ships 900 ticks: full P1, cold/skip/repeat/backward, ownership, births off/on physics parity',()=>{
 recordDamageBirths(false);const baseline=world();recordDamageBirths(true);const source=world();
 for(const e of [baseline,source])for(const s of e.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
 const a=world(),b=world();let marks=0,retained:any,saved:any;
 for(let t=0;t<=900;t++){
  if(t){recordDamageBirths(false);baseline.fixedUpdate(1/60);recordDamageBirths(true);source.fixedUpdate(1/60);}
  if(t%15)continue;
  const original=take(source,t),prior=take(baseline,t);assert.deepEqual(bytes(original),bytes(prior),'all original authority/RNG at '+t);
  assert.deepEqual([source.random,source.visualRandom],[baseline.random,baseline.visualRandom]);
  const next=take(source,t,newCapture);assert.deepEqual(oracle(next),oracle(original),'independent complete P1 at '+t);assert.ok(bytes(next).length<=bytes(original).length);
  marks=Math.max(marks,source.allCapitalShips.reduce((n,s)=>n+s.scorchMarks.length,0));
  if(t===450){retained=next;saved=bytes(next).slice();}if(t%105===0&&t>0)continue;
  oldApply(a,[decodeBinaryFrame(bytes(original))],t===0,undefined,{nativeTargeting:true,nativeProjection:true});newApply(b,[decodeBinaryFrame(bytes(next))],t===0,undefined,{nativeTargeting:true,nativeProjection:true});
  assert.deepEqual(oracle(take(b,t)),oracle(take(a,t)),'warm entire P1 at '+t);
  if(t%300===0){const coldA=world(),coldB=world();oldApply(coldA,[original],true,undefined,{nativeTargeting:true,nativeProjection:true});newApply(coldB,[next],true,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(oracle(take(coldA,t)),oracle(take(coldB,t)));}
 }
 assert.ok(marks>100);assert.ok(damageRecipeDiagnostics().captured>10000);assert.deepEqual(bytes(retained),saved);
 for(const tick of [902,902,400]){const old=take(source,tick),fresh=take(source,tick,newCapture);oldApply(a,[old],true,undefined,{nativeTargeting:true,nativeProjection:true});newApply(b,[fresh],true,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(oracle(take(a,tick)),oracle(take(b,tick)));}
});

test('sparse malicious rows, geometry replacement, numeric extremes and absent births never corrupt receivers',()=>{
 const {s}=damaged(),base=captureDamageRecipe(s.scorchMarks,{rows:0})!,decoder=new DamageRecipeDecoder();
 const sparse=structuredClone(base);delete sparse.rows[3][4];assert.throws(()=>decoder.decode(sparse,[{safe:true}],{rows:0}),/damage recipe/);
 const geom=structuredClone(base);delete geom.geometry[0];assert.throws(()=>decoder.decode(geom,null,{rows:0}),/damage recipe/);
 for(const number of [-0,Number.MIN_VALUE,-Number.MAX_VALUE,Number.MAX_VALUE]){
  const p=structuredClone(base);p.rows[0][3]=number;p.rows[0][4]=number;const x=decoder.decode(p,null,{rows:0});assert.equal(x[0].opacity,number);assert.equal(x[0].intensity,number);
 }
 const altered=structuredClone(base);altered.geometry[0][4]*=2;const one=decoder.decode(base,null,{rows:0}),two=decoder.decode(altered,null,{rows:0}),again=decoder.decode(base,null,{rows:0});
 assert.notEqual(one[0].localPos.x,two[0].localPos.x);assert.deepEqual(one,again);
 recordDamageBirths(false);const e=world(2),ship=e.allCapitalShips[0];for(let c=3;c<7;c++){ship.armor.setCell(c,3,0);ship.damageDecals.onCellDamage(c,3,100);}
 assert.equal(captureDamageRecipe(ship.scorchMarks,{rows:0}),null);assert.deepEqual(bytes(take(e,1,newCapture)),bytes(take(e)));
});
