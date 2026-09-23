import {MotionDeliveryWindow} from '../server/MotionDeliveryWindow.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deflateRawSync} from 'node:zlib';
import {motionWireTarget,MotionWireSender,MotionWireReceiver,encodeMotionWireEnvelope,decodeMotionWireEnvelope} from '../server/MotionWire.mjs';
import {encodeMotionFrame,motionToText,MOTION_MAX_BYTES} from '../src/network/MotionFrame.mjs';
const message=(tick,ships=22,extra={})=>({type:'motion',matchId:'match',syncId:'sync',data:motionToText(encodeMotionFrame({tick,time:tick/60,acknowledged:{0:tick,9:Number.MAX_SAFE_INTEGER},ships:Array.from({length:ships},(_,i)=>['ship-'+i,i?i*500+tick/60:-0,-0,1,2,.123456789012345+tick/60,1,i,0])})),...extra});
const prepared=(s,m)=>s.prepare(motionWireTarget(m.data),m);
const receive=(r,m,c)=>r.decode(decodeMotionWireEnvelope(encodeMotionWireEnvelope(m,c)));
test('all float64 bits, negative zero, ids, clocks and maximum ACK sequence round-trip through skipped motion ticks',()=>{
 const s=new MotionWireSender(),r=new MotionWireReceiver();
 for(const tick of [1,2,3,6,17,78,79,1000]){const m=message(tick),c=prepared(s,m);assert.deepEqual(receive(r,m,c),m);assert.ok(s.commit(c));assert.ok(s.stats().retainedBytes<=MOTION_MAX_BYTES);}
 assert.ok(s.stats().delta>0);assert.ok(s.stats().packetBytes<s.stats().rawBytes);
});
test('equal per-peer baselines reuse at most two shared divergent delta builds; no retained target/cache history',()=>{
 const senders=Array.from({length:9},()=>new MotionWireSender()),first=message(1),initial=motionWireTarget(first.data);
 for(const s of senders)assert.ok(s.commit(s.prepare(initial,first)));
 const m=message(2),target=motionWireTarget(m.data),choices=senders.map(s=>s.prepare(target,m));
 assert.equal(target.builds,1);for(const c of choices)assert.equal(c.packet,choices[0].packet);
 choices.forEach((c,i)=>senders[i].commit(c));
 for(let i=0;i<senders.length;i++){const m=message(3+i);senders[i].commit(prepared(senders[i],m));}
 const later=message(12),t=motionWireTarget(later.data),cs=senders.map(s=>s.prepare(t,later));assert.equal(t.builds,2);assert.equal(cs.filter(c=>c.fallback).length,7);
 for(const s of senders)assert.deepEqual(Object.keys(s.base).sort(),['bytes','crc','tick']);
});
test('preparing/skipping/refusing a send cannot advance the compression baseline; obsolete choices cannot commit',()=>{
 const s=new MotionWireSender(),r=new MotionWireReceiver(),a=message(1),ca=prepared(s,a);assert.equal(s.base,null);
 assert.deepEqual(receive(r,a,ca),a);assert.ok(s.commit(ca));assert.equal(s.commit(ca),false);
 const abandoned=prepared(s,message(2)),m=message(3),c=prepared(s,m);assert.deepEqual(receive(r,m,c),m);assert.ok(s.commit(c));assert.equal(s.commit(abandoned),false);
 const stale=prepared(s,message(4));s.reset();assert.equal(s.commit(stale),false);assert.equal(s.stats().retainedBytes,0);
});
test('new scope and roster-size changes use full frames, retired scope deltas and missing bases cannot be applied',()=>{
 const s=new MotionWireSender(),r=new MotionWireReceiver(),m=message(1),c=prepared(s,m);s.commit(c);receive(r,m,c);
 const next=message(2),delta=prepared(s,next);assert.ok(delta.delta);assert.throws(()=>receive(new MotionWireReceiver(),next,delta));
 assert.throws(()=>receive(r,{...next,syncId:'new'},delta));assert.equal(r.base.tick,1);
 const newEpoch=message(0,128,{matchId:'新战斗',syncId:'new'}),full=prepared(s,newEpoch);assert.equal(full.delta,false);assert.deepEqual(receive(r,newEpoch,full),newEpoch);assert.ok(s.commit(full));
 const changed=message(1,127,{matchId:'新战斗',syncId:'new'}),changedChoice=prepared(s,changed);assert.equal(changedChoice.delta,false);assert.deepEqual(receive(r,changed,changedChoice),changed);
});
test('CRC, epoch, codec flags, bounded inflation, UTF8 and envelope lengths fail transactionally',()=>{
 const s=new MotionWireSender(),r=new MotionWireReceiver(),m=message(1),c=prepared(s,m);s.commit(c);receive(r,m,c);const held=r.base;
 const n=message(2),good=prepared(s,n),envelope=encodeMotionWireEnvelope(n,good);
 for(const tweak of [b=>b[0]^=1,b=>b[4]=255,b=>b.writeUInt16BE(257,4),b=>b[8]=255]){const b=Buffer.from(envelope);tweak(b);assert.throws(()=>r.decode(decodeMotionWireEnvelope(b)));assert.equal(r.base,held);}
 const encoded={...n,motionWire:1,data:good.data};
 for(const tweak of [b=>b[4]=8,b=>b[5]=1,b=>b.writeUInt32BE(1,8),b=>b.writeUInt32BE(MOTION_MAX_BYTES+1,8),b=>b[12]^=1,b=>b.writeDoubleBE(999,24),b=>b[b.length-1]^=255]){const b=Buffer.from(good.packet);tweak(b);assert.throws(()=>r.decode({...encoded,data:b.toString('base64')}));assert.equal(r.base,held);}
 // Exact bounded output also rejects compressed bombs, not merely corrupt CRC.
 const bomb=Buffer.concat([good.packet.subarray(0,36),deflateRawSync(Buffer.alloc(MOTION_MAX_BYTES*4))]);bomb[4]=1;bomb.writeDoubleBE(0,24);bomb.writeUInt32BE(0,32);
 assert.throws(()=>r.decode({...encoded,data:bomb.toString('base64')}));assert.equal(r.base,held);
 assert.deepEqual(receive(r,n,good),n);assert.throws(()=>receive(r,n,good),'duplicate tick cannot rewind');
});

test('stalled consumers spend no shared motion compression work and preflight never manufactures delivery credit',()=>{
 const peers=Array.from({length:4},()=>({sender:new MotionWireSender(),window:new MotionDeliveryWindow()}));
 const healthy=motionWireTarget(message(3).data);
 for(let i=0;i<peers.length;i++){
  const p=peers[i],m=message(i<2?i+1:3),t=i<2?motionWireTarget(m.data):healthy;p.sender.commit(p.sender.prepare(t,m));
  if(i<2){assert.ok(p.window.reserve(1,100));assert.ok(p.window.reserve(2,100));}
 }
 const m=message(4),target=motionWireTarget(m.data);
 for(const p of peers){p.window.offer(4);if(p.window.mayPrepare(4)){const c=p.sender.prepare(target,m);assert.ok(p.window.reserve(4,c.bytes));p.sender.commit(c);}}
 assert.equal(target.builds,1,'two stalled divergent bases did not consume the two-build allowance');
 for(const p of peers.slice(0,2)){assert.equal(p.window.skipped,1);assert.equal(p.window.pending.size,2);assert.equal(p.window.bytes,200);assert.equal(p.window.ack(4),false);}
});
