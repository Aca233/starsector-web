import assert from 'node:assert/strict';import {test} from 'node:test';import {Encoder,Decoder} from '@msgpack/msgpack';
import {ProjectileVisualSender,ProjectileVisualReceiver} from '../src/network/ProjectileVisualCodec.mjs';
import {ProjectileEventSender,ProjectileEventReceiver} from '../src/network/ProjectileEventStream.mjs';
import {packProjectileVisual,unpackProjectileVisual,PROJECTILE_VISUAL_COLUMNS,validateVisualColumns,referenceVisualColumns,diffVisualColumns,applyVisualColumnDiff} from '../src/network/ProjectileVisualColumns.mjs';
import {projectProjectileVisual} from '../src/network/ProjectileVisualProjection.mjs';
const row=(id=.1234567890123456)=>({id,specId:'missile',pos:{$vector:[-0.0001,123.123456789]},vel:{$vector:[91.99999,-12.55555]},ballisticTail:{$vector:[-3,4]},facingRad:.123456789,turnVelocityRad:.4,elapsedTime:2,flightTimeRemaining:4,rangeRemaining:1234.12345,fadeProgress:.123456789,isRocket:true,color:[1,2,3],sourceShipId:'must-not-transmit',damage:999});
const frame=(tick,rows)=>({tick,time:tick/60,rows});
const fixture=()=>({s:new ProjectileVisualSender('visual-1'),r:new ProjectileVisualReceiver('visual-1')});
const deliver=(f,tick,rows)=>{const c=f.s.prepare(frame(tick,rows)),back=f.r.receive(c.bytes);assert.deepEqual(back.rows,rows.map(r=>unpackProjectileVisual(packProjectileVisual(r))));assert.ok(f.s.commit(c));return {c,back};};
function mutate(bytes,fn){const body=new Decoder().decode(bytes.subarray(4));fn(body);const b=new Encoder().encode(body),out=new Uint8Array(b.length+4);out.set(bytes.subarray(0,4));out.set(b,4);return out;}
test('SVP1 explicitly quantizes only display columns; IDs/appearance exact and authority untouched',()=>{
 const a=row(),original=structuredClone(a),packed=packProjectileVisual(a),back=unpackProjectileVisual(packed);
 assert.deepEqual(a,original);assert.equal(back.id,a.id);assert.equal(back.damage,undefined);assert.equal(back.sourceShipId,undefined);
 for(const [key,axis,scale]of PROJECTILE_VISUAL_COLUMNS){const from=axis===null?a[key]:a[key]?.$vector[axis];if(typeof from==='number'){const to=axis===null?back[key]:back[key].$vector[axis];assert.ok(Math.abs(to-from)<=.5/scale+1e-12,key);}}
 assert.deepEqual(back.color,a.color);assert.equal(Object.is(packed.pose[0],-0),false);assert.equal(validateVisualColumns(packed.pose),packed.pose);
 assert.throws(()=>packProjectileVisual({...a,pos:{$vector:[Infinity,0]}}));assert.throws(()=>validateVisualColumns([...packed.pose.slice(0,16),Infinity]));
});
test('integer residuals exactly recover columns, null transitions, negative values and stationary mines',()=>{
 const a=packProjectileVisual(row()),r=referenceVisualColumns(a,.05),b=packProjectileVisual({...row(),missileFizzleTime:.001,ballisticTail:undefined,pos:{$vector:[-50,20]},elapsedTime:2.05});
 const d=diffVisualColumns(r.pose,b.pose);assert.deepEqual(applyVisualColumnDiff(r.pose,d),b.pose);assert.equal(diffVisualColumns(b.pose,b.pose),null);
 const mine={...a,appearance:{...a.appearance,isMine:true}};assert.equal(referenceVisualColumns(mine,1),mine);
 for(const changes of [[0],[2**17,1],[1],[1,Infinity],[1,2**42],[1,2,3],[1,null]])assert.throws(()=>applyVisualColumnDiff(a.pose,changes));
 for(const pose of [a.pose.slice(1),[...a.pose.slice(0,16),-0],a.pose.map((v,i)=>i===4?null:v)])assert.throws(()=>validateVisualColumns(pose));
});
test('create/correct/remove/reorder/template changes are precise after quantization, not predicted hits',()=>{
 const f=fixture(),a=row(),b=row(.999999999999);deliver(f,0,[a,b]);
 const c=deliver(f,3,[{...b,pos:{$vector:[10,9]},didDamage:true,color:[3,2,1]},{...a,elapsedTime:2.05}]);assert.equal(c.back.rows[0].didDamage,true);assert.equal(c.back.rows[1].didDamage,undefined);
 deliver(f,6,[{...a,isRocket:false}]);deliver(f,9,[]);deliver(f,12,[a]);assert.equal(f.r.stats().entities,1);
});
test('prepare/commit and reset keep independent exact bases; old epochs and SPE1 cannot masquerade as visuals',()=>{
 const f=fixture(),a=row(),x=f.s.prepare(frame(0,[a])),y=f.s.prepare(frame(3,[a]));assert.equal(f.s.stats().revision,0);f.r.receive(x.bytes);assert.ok(f.s.commit(x));assert.equal(f.s.commit(y),false);
 const before=f.r.stats();assert.throws(()=>f.r.receive(x.bytes));assert.deepEqual(f.r.stats(),before);
 const ordinary=new ProjectileEventSender('visual-1');assert.throws(()=>f.r.receive(ordinary.prepare(frame(3,[projectProjectileVisual(a)])).bytes));assert.deepEqual(f.r.stats(),before);
 f.s.reset('new');f.r.reset('new');assert.equal(f.s.commit(x),false);assert.throws(()=>f.r.receive(x.bytes));deliver(f,0,[a]);
});
test('malformed pose residuals/masks/magic/checksum never advance the renderer base',()=>{
 const f=fixture(),a=row();deliver(f,0,[a]);const good=f.s.prepare(frame(3,[{...a,pos:{$vector:[100,-20]},elapsedTime:2.05}])),before=f.r.stats();
 for(const change of [b=>b[9][0][3]=[0],b=>b[9][0][3]=[2**17,1],b=>b[9][0][3]=[1],b=>b[9][0][3]=[1,2**42],b=>b[9][0][1].pose=[],b=>b[13]='wrong',b=>b[12]^=1]){
  assert.throws(()=>f.r.receive(mutate(good.bytes,change)));assert.deepEqual(f.r.stats(),before);
 }
 for(let n=0;n<good.bytes.length;n++){assert.throws(()=>f.r.receive(good.bytes.subarray(0,n)));assert.deepEqual(f.r.stats(),before);}
 assert.deepEqual(f.r.receive(good.bytes).rows,[unpackProjectileVisual(packProjectileVisual({...a,pos:{$vector:[100,-20]},elapsedTime:2.05}))]);
});
test('projection validation is transactional even for a valid CRC from the generic sender',()=>{
 const raw=new ProjectileEventSender('visual-1',{visualColumns:true}),r=new ProjectileVisualReceiver('visual-1'),bad=packProjectileVisual(row());bad.appearance.secret='not-a-render-field';
 assert.throws(()=>r.receive(raw.prepare(frame(0,[bad])).bytes));assert.equal(r.stats().revision,0);
 const s=new ProjectileVisualSender('visual-1'),good=s.prepare(frame(0,[row()]));r.receive(good.bytes);assert.equal(r.stats().revision,1);
});
test('source and decoded view mutation cannot change committed column/reference state',()=>{
 const f=fixture(),a=row(),original=structuredClone(a),c=f.s.prepare(frame(0,[a]));a.color[0]=99;a.pos.$vector[0]=99999;const out=f.r.receive(c.bytes);assert.ok(f.s.commit(c));out.rows[0].pos.$vector[0]=8888;
 assert.deepEqual(out.rows[0].color,original.color);deliver(f,3,[original]);
});
test('seeded mixed missile lifecycle/clock/column fuzz restores all quantized targets exactly',()=>{
 let seed=431,serial=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),f=fixture();let rows=[];
 for(let tick=0;tick<360;tick+=3){
  if(rows.length<32&&random()<.7)rows.push(row(++serial/1000));if(rows.length&&random()<.25)rows.splice(Math.floor(random()*rows.length),1);
  rows=rows.map(p=>({...p,pos:{$vector:p.pos.$vector.map(n=>n+(random()-.5)*70)},vel:{$vector:p.vel.$vector.map(n=>n+(random()-.5)*12)},elapsedTime:p.elapsedTime+.05,flightTimeRemaining:p.flightTimeRemaining-.05,facingRad:p.facingRad+(random()-.5),...(random()<.05?{missileFizzleTime:random(),didDamage:true}:{})}));
  if(random()<.1)rows.reverse();deliver(f,tick,rows);
 }
});
test('generic receiver cannot change codec family in the middle of a revision chain',()=>{
 const s=new ProjectileEventSender('visual-1',{visualColumns:true}),r=new ProjectileEventReceiver('visual-1'),a=packProjectileVisual(row());const first=s.prepare(frame(0,[a]));r.receive(first.bytes);s.commit(first);
 const good=s.prepare(frame(3,[a])),before=r.stats();const switched=mutate(good.bytes,b=>{b.length=13;b[9]=b[9].map(row=>row.slice(0,3));});new DataView(switched.buffer).setUint32(0,0x53504531);
 assert.throws(()=>r.receive(switched));assert.deepEqual(r.stats(),before);r.receive(good.bytes);
});

test('nested appearance patches are exact, bounded and atomic, including deletion and malformed protocol variants',()=>{
 const f=fixture(),a={...row(),collisionDisabled:false,isDisarmed:false};deliver(f,0,[a]);
 const next={...a,collisionDisabled:true,didDamage:true};delete next.isDisarmed;
 const choice=f.s.prepare(frame(3,[next])),before=f.r.stats();
 for(const change of [b=>b[13]='visual-columns',b=>b[9][0][4]=[{},['missing']],b=>b[9][0][4]=[{},['isDisarmed','isDisarmed']],b=>b[9][0][4]=[{isDisarmed:true},['isDisarmed']],b=>b[9][0][4]={},b=>b[9][0][1].appearance={}]){
  assert.throws(()=>f.r.receive(mutate(choice.bytes,change)));assert.deepEqual(f.r.stats(),before);
 }
 const back=f.r.receive(choice.bytes);assert.equal(back.rows[0].collisionDisabled,true);assert.equal(back.rows[0].didDamage,true);assert.equal(back.rows[0].isDisarmed,undefined);assert.ok(f.s.commit(choice));
});
