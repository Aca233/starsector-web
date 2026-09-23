import assert from 'node:assert/strict';import {test} from 'node:test';
import {AnchoredProjectilePublisher,AnchoredProjectileReceiver,ANCHORED_VISUAL_LIMITS as L} from '../src/network/AnchoredProjectileVisual.mjs';
import {ProjectileVisualSender,ProjectileVisualReceiver} from '../src/network/ProjectileVisualCodec.mjs';
import {packProjectileVisual,unpackProjectileVisual} from '../src/network/ProjectileVisualColumns.mjs';
const row=(tick,id=.123)=>({id,specId:'missile',pos:{$vector:[tick*1.2345,-tick]},vel:{$vector:[74.07,-60]},facingRad:tick*.001,elapsedTime:tick/60,flightTimeRemaining:20-tick/60,rangeRemaining:1000-tick,isRocket:true,color:[255,190,15]});
const frame=(tick,rows=[row(tick)])=>({tick,time:tick/60,rows});
const expected=f=>f.rows.map(p=>unpackProjectileVisual(packProjectileVisual(p)));
function receive(r,p){let out=r.baseline(p.key,p.baseline);if(p.update)out=r.update(p.key,p.update);return out;}
test('committed sender/receiver forks are isolated across competing commit, mutation and reset',()=>{
 const sender=new ProjectileVisualSender('fork'),receiver=new ProjectileVisualReceiver('fork'),first=sender.prepare(frame(0));sender.commit(first);receiver.receive(first.bytes);
 const a=sender.fork(),b=sender.fork(),ra=receiver.fork(),rb=receiver.fork(),pa=a.prepare(frame(3)),pb=b.prepare(frame(9));
 assert.equal(sender.commit(pa),false);assert.ok(a.commit(pa));assert.ok(b.commit(pb));assert.deepEqual(ra.receive(pa.bytes).rows,expected(frame(3)));assert.deepEqual(rb.receive(pb.bytes).rows,expected(frame(9)));
 assert.equal(sender.stats().tick,0);assert.equal(receiver.stats().tick,0);a.reset('other');ra.reset('other');assert.equal(b.stats().tick,9);assert.equal(rb.stats().tick,9);
});
for(const guests of [2,3,4])test(`${guests+1} players: one shared encoding survives stalled/skipping/out-of-order guests without history`,()=>{
 const publisher=new AnchoredProjectilePublisher('room'),peers=Array.from({length:guests},()=>new AnchoredProjectileReceiver('room'));let last;
 for(let tick=0;tick<240;tick+=3){
  const f=frame(tick,tick%30<24?[row(tick),row(tick,.9999999999)]:[row(tick)]),p=publisher.publish(f);last=p;
  for(let i=0;i<guests;i++)if(i===0||tick%(3*(i+2))===0){const back=receive(peers[i],p);assert.deepEqual(back.rows,expected(f));assert.ok(peers[i].stats().retainedBaselineBytes<=L.baselineBytes);}
  assert.ok(publisher.stats().retainedBytes<=L.baselineBytes+L.updateBytes);
 }
 for(const peer of peers){const out=receive(peer,last);if(out)assert.deepEqual(out.rows,expected(frame(last.tick,last.tick%30<24?[row(last.tick),row(last.tick,.9999999999)]:[row(last.tick)])));assert.equal(peer.stats().tick,last.tick);}
 assert.equal(publisher.stats().encodes,80,'guest count never multiplies prepare');assert.equal(publisher.stats().baselines,4);
});
test('late join uses cached baseline plus latest update, not the missed ordered revision chain',()=>{
 const p=new AnchoredProjectilePublisher('late');p.publish(frame(0));for(let tick=3;tick<=57;tick+=3)p.publish(frame(tick));const r=new AnchoredProjectileReceiver('late'),latest=p.latest;
 assert.throws(()=>r.update(latest.key,latest.update),{code:'VISUAL_MISSING_BASE'});assert.equal(r.stats().tick,-1);assert.deepEqual(receive(r,latest).rows,expected(frame(57)));assert.equal(r.stats().baselineTick,0);
});
test('new anchors, duplicate/out-of-order updates and old epochs cannot rewind or corrupt a display',()=>{
 const p=new AnchoredProjectilePublisher('epoch'),r=new AnchoredProjectileReceiver('epoch'),a=p.publish(frame(0));receive(r,a);const b=p.publish(frame(3)),c=p.publish(frame(9));receive(r,c);assert.equal(r.update(b.key,b.update),null);assert.equal(r.stats().tick,9);
 const next=p.publish(frame(60));receive(r,next);assert.equal(r.baseline(a.key,a.baseline),null);assert.throws(()=>r.update(b.key,b.update),{code:'VISUAL_MISSING_BASE'});assert.equal(r.stats().tick,60);
 const before=r.stats(),bad=next.baseline.slice();bad[bad.length-1]^=1;assert.throws(()=>r.baseline(next.key,bad));assert.deepEqual(r.stats(),before);
 r.reset('other');assert.throws(()=>r.baseline(next.key,next.baseline));assert.equal(r.stats().tick,-1);
});
test('corrupt updates and refused publications retain the exact previous anchor and view',()=>{
 const p=new AnchoredProjectilePublisher('atomic'),r=new AnchoredProjectileReceiver('atomic');receive(r,p.publish(frame(0)));const next=p.publish(frame(3)),bad=next.update.slice();bad[bad.length-1]^=1;
 const before=r.stats();assert.throws(()=>r.update(next.key,bad));assert.deepEqual(r.stats(),before);assert.deepEqual(r.update(next.key,next.update).rows,expected(frame(3)));
 const held=p.latest;assert.throws(()=>p.publish(frame(2)));assert.equal(p.latest,held);assert.throws(()=>p.publish(frame(6,Array(4097).fill(row(6)))));assert.equal(p.latest,held);
 assert.throws(()=>r.baseline(0,next.baseline));assert.throws(()=>r.baseline(1,new Uint8Array(L.baselineBytes+1)));assert.throws(()=>r.update(1,new Uint8Array(L.updateBytes+1)));
});
