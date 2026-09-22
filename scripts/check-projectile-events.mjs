import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Encoder,Decoder} from '@msgpack/msgpack';
import {ProjectileEventSender,ProjectileEventReceiver,PROJECTILE_STREAM_LIMITS as L} from '../src/network/ProjectileEventStream.mjs';
const row=(id=1)=>({id,specId:'pulse',pos:{$vector:[-0,1]},prevPos:{$vector:[0,1]},vel:{$vector:[60,0]},elapsedTime:0,rangeRemaining:100,sourceMoveSpeed:60,armingTimeRemaining:1,owner:{$ship:'玩家'},optional:{$undefined:1},nested:{color:[1,2,3],name:'测试🚀'}});
const step=(r,n=1)=>{r=structuredClone(r);for(let i=0;i<n;i++){r.prevPos.$vector=[...r.pos.$vector];r.pos.$vector[0]+=r.vel.$vector[0]/60;r.elapsedTime+=1/60;r.rangeRemaining-=r.sourceMoveSpeed/60;r.armingTimeRemaining=Math.max(0,r.armingTimeRemaining-1/60);}return r;};
const fixture=()=>({s:new ProjectileEventSender('epoch-1'),r:new ProjectileEventReceiver('epoch-1')});
function deliver(f,tick,rows){const c=f.s.prepare({tick,time:tick/60,rows}),out=f.r.receive(c.bytes);assert.deepEqual(out.rows,rows);assert.ok(f.s.commit(c));return {c,out};}
function change(bytes,fn){const body=new Decoder().decode(bytes.subarray(4));fn(body);const packed=new Encoder().encode(body),out=new Uint8Array(packed.length+4);out.set(bytes.subarray(0,4));out.set(packed,4);return out;}
test('entity events preserve every field, exact float64/negative zero and source order',()=>{
 const f=fixture(),a=row(),b=row(2);const first=deliver(f,0,[a,b]);assert.equal(first.c.stats.templates,1);assert.ok(Object.is(first.out.rows[0].pos.$vector[0],-0));
 a.pos.$vector[1]=999;assert.equal(first.out.rows[0].pos.$vector[1],1,'caller cannot mutate retained source/decoded state');
 const moved=step(b);moved.pos.$vector[1]=1.23456789012345;moved.didDamage=true;delete moved.nested;const c=row(3);c.specId='missile';
 const second=deliver(f,1,[c,moved]);assert.equal(second.c.stats.created,1);assert.equal(second.c.stats.removed,1);assert.equal(second.c.stats.changed,1);
 deliver(f,2,[]);deliver(f,3,[row(1)]);assert.equal(f.r.stats().entities,1,'ID reuse after removal is a new spawn');
});
test('frozen reference suppresses unchanged motion bytes but never predicts a displayed target without a packet',()=>{
 const f=fixture(),a=row();deliver(f,0,[a]);const c=f.s.prepare({tick:3,time:3/60,rows:[step(a,3)]});assert.equal(c.stats.changed,0);assert.ok(c.bytes.length<90);assert.equal(f.r.stats().tick,0);
 assert.deepEqual(f.r.receive(c.bytes).rows,[step(a,3)]);assert.ok(f.s.commit(c));
 const later=step(a,100);const after=deliver(f,100,[later]);assert.equal(after.c.stats.changed,1,'large gaps use explicit correction, not unlimited reference steps');
});
test('prepare/commit is admission-transactional; failed competing preparations and old epochs cannot become a base',()=>{
 const f=fixture(),a=row(),one=f.s.prepare({tick:0,time:0,rows:[a]}),two=f.s.prepare({tick:1,time:1/60,rows:[step(a)]});
 assert.equal(f.s.stats().revision,0);assert.ok(f.s.commit(one));assert.equal(f.s.commit(two),false);assert.equal(f.s.commit(one),false);assert.equal(f.s.commit({}),false);
 f.r.receive(one.bytes);assert.throws(()=>f.r.receive(one.bytes),/MISSING_BASE/);assert.throws(()=>f.r.receive(two.bytes),/MISSING_BASE/);
 f.s.reset('epoch-2');f.r.reset('epoch-2');assert.equal(f.s.commit(two),false);assert.throws(()=>f.r.receive(one.bytes),/MISSING_BASE/);deliver(f,0,[a]);
});
test('all malformed deltas are atomic, including checksum, base, duplicate IDs and order corruption',()=>{
 const f=fixture(),a=row();deliver(f,0,[a]);const c=f.s.prepare({tick:1,time:1/60,rows:[step(a),row(2)]}),stats=f.r.stats();
 for(const mutate of [b=>b[12]^=1,b=>b[1]=99,b=>b[0]='epoch-2',b=>b[8].push(b[8][0]),b=>b[11]=[2,2],b=>b[10]=[999],b=>b[9]=[[1,{id:2},[]]],b=>b[6]=61,b=>b[7]=[null]]){
  assert.throws(()=>f.r.receive(change(c.bytes,mutate)));assert.deepEqual(f.r.stats(),stats);
 }
 assert.deepEqual(f.r.receive(c.bytes).rows,[step(a),row(2)]);
});
test('wire/decode/template/depth limits apply before committing or growing retained state',()=>{
 const f=fixture();const c=f.s.prepare({tick:0,time:0,rows:[row()]});
 for(let n=0;n<c.bytes.length;n++)assert.throws(()=>f.r.receive(c.bytes.subarray(0,n)));
 assert.throws(()=>f.r.receive(new Uint8Array(L.packetBytes+1)));assert.throws(()=>f.r.receive(new Uint8Array([...c.bytes,0])));
 let nested=1;for(let i=0;i<50;i++)nested=[nested];assert.throws(()=>f.r.receive(change(c.bytes,b=>b[7][0].deep=nested)));
 assert.throws(()=>f.s.prepare({tick:0,time:0,rows:[row(),row()]}));assert.throws(()=>f.s.prepare({tick:0,time:0,rows:[{...row(),x:NaN}]}));
 assert.throws(()=>f.s.prepare({tick:0,time:0,rows:[{...row(),x:'\ud800'}]}));assert.throws(()=>f.s.prepare({tick:0,time:0,rows:[JSON.parse('{"id":1,"specId":"x","__proto__":{}}')]}));
 const many=Array.from({length:70},(_,i)=>({...row(i),specId:'spec-'+i}));deliver(f,0,many);assert.equal(f.r.stats().templates,64);assert.ok(f.r.stats().retainedTemplateBytes<=L.templateBytes);
 deliver(f,1,many.slice().reverse());assert.equal(f.r.stats().templates,64);
});
test('seeded lifecycle/shape/correction fuzz always reconstructs exact immutable states',()=>{
 const f=fixture();let seed=47,id=0,rows=[];const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2**32;};
 for(let tick=0;tick<180;tick++){
  rows=rows.map(r=>step(r));if(rand()<.65&&rows.length<40){const r=row(++id);r.specId='spec-'+(id%4);rows.push(r);}
  if(rows.length&&rand()<.45)rows.splice(Math.floor(rand()*rows.length),1);
  for(const r of rows){if(rand()<.2)r.vel.$vector[0]=rand()*200;if(rand()<.1)r.extra={flag:rand()<.5};if(rand()<.1)delete r.extra;if(rand()<.1)r.didDamage=true;}
  if(rand()<.1)rows.reverse();deliver(f,tick,rows);
 }
});

test('native PRNG float64 entity identities survive dense wire ordinals exactly',()=>{
 const f=fixture(),a=row(.954115638975054),b=row(.00000123456789012);deliver(f,0,[a,b]);deliver(f,1,[step(b),step(a)]);
 assert.throws(()=>f.s.prepare({tick:2,time:2/60,rows:[{...a,id:NaN}]}));
});
