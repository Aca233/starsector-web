import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {crc32} from 'node:zlib';
import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {LAN_DELTA_MAX_BYTES,createLanBytePatch,encodeLanPacket,LanDeltaReceiver,lanCrc32,isLanDelta} from '../src/network/LanBinaryDelta.mjs';
import {encodeBinaryState,encodeProjectedBinaryFrame,decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
const raw=(seq,extra={})=>encodeBinaryState('match',seq,encodeProjectedBinaryFrame({tick:seq,ships:[{id:'a',state:{ballast:'stable-state-'.repeat(2500),value:seq}}],...extra}));
const target=(seq,extra={},now=seq*17)=>lanDeltaTarget(raw(seq,extra),seq,now);
const deliver=(s,r,t)=>{const choice=s.prepare(t);const full=r.decode(choice.packet);assert.deepEqual(full,t.bytes);assert.equal(decodeBinaryState(full).seq,t.seq);assert.equal(s.commit(choice),true);return choice;};

test('CRC32 agrees with Node for empty, random and bounded large inputs',()=>{
 for(const length of [0,1,15,256,65536,LAN_DELTA_MAX_BYTES]){const b=randomBytes(length);assert.equal(lanCrc32(b),crc32(b));}
});
test('lossless confirmed-anchor deltas, no per-snapshot RTT stop-and-wait',()=>{
 const s=new LanDeltaSender(),r=new LanDeltaReceiver();deliver(s,r,target(1));
 assert.equal(s.stats().baseSeq,null);assert.equal(s.stats().pendingSeq,1);
 assert.equal(deliver(s,r,target(2)).delta,false); // First anchor unconfirmed; full view, not a new anchor.
 s.ack(2);for(let i=3;i<=60;i++)assert.equal(deliver(s,r,target(i)).delta,true);
 assert.equal(s.stats().baseSeq,1);assert.equal(s.stats().delta,58);assert.ok(r.retainedBytes<=LAN_DELTA_MAX_BYTES*2);
});
test('discarded preparations never become baselines; reset/cross-sender/stale/duplicate commits fail',()=>{
 const s=new LanDeltaSender(),r=new LanDeltaReceiver(),other=new LanDeltaSender();
 const skipped=s.prepare(target(1));deliver(s,r,target(2));assert.equal(s.commit(skipped),false);assert.equal(other.commit(skipped),false);
 s.ack(2);const c=s.prepare(target(3));s.reset();assert.equal(s.commit(c),false);r.reset();const full=deliver(s,r,target(4));assert.equal(s.commit(full),false);
});
test('refresh retains only two marked anchors while older-anchor deltas are still in flight',()=>{
 const s=new LanDeltaSender(),r=new LanDeltaReceiver();deliver(s,r,target(1));s.ack(1);
 const a=deliver(s,r,target(80,{},2000));assert.equal(a.anchor,true);assert.equal(s.stats().pendingSeq,80);
 assert.equal(deliver(s,r,target(81,{},2017)).delta,true);assert.equal(s.stats().baseSeq,1);
 s.ack(80);assert.equal(deliver(s,r,target(82,{},2034)).delta,true);assert.equal(s.stats().baseSeq,80);
 assert.ok(r.retainedBytes<=LAN_DELTA_MAX_BYTES*2);
});
test('receiver privately owns anchors and never mutates them during reconstruction',()=>{
 const s=new LanDeltaSender(),r=new LanDeltaReceiver(),t=target(1),c=s.prepare(t),view=r.decode(c.packet);s.commit(c);s.ack(1);
 view.fill(0);c.packet.fill(0);assert.equal(deliver(s,r,target(2)).delta,true);
});
test('same acknowledged base is computed once for multiple peers; divergent work is bounded',()=>{
 const initial=target(1),receivers=Array.from({length:9},()=>new LanDeltaSender());
 for(const s of receivers){s.commit(s.prepare(initial));s.ack(1);}
 const next=target(2);for(const s of receivers)s.commit(s.prepare(next));assert.equal(next.patchBuilds,1);
 const divergent=Array.from({length:9},(_,i)=>{const s=new LanDeltaSender();s.commit(s.prepare(target(i+3)));s.ack(i+3);return s;});
 const shared=target(20);for(const s of divergent)s.commit(s.prepare(shared));assert.ok(shared.patchBuilds<=2);
 assert.ok(divergent.reduce((n,s)=>n+s.stats().budgetFallbacks,0)>=7);
});
test('incompressible/tiny/oversized input falls back without retaining unsafe data',()=>{
 assert.equal(lanDeltaTarget(new Uint8Array(4095),1),null);
 assert.equal(lanDeltaTarget(new Uint8Array(LAN_DELTA_MAX_BYTES+1),1),null);
 assert.equal(createLanBytePatch(randomBytes(8000),randomBytes(8000)),null);
 const r=new LanDeltaReceiver();assert.deepEqual(r.decode(raw(1)),raw(1));assert.equal(r.retainedBytes,0);
});
test('CRC, missing base, invalid flags/seq/length, truncated operations and amplification are rejected',()=>{
 const s=new LanDeltaSender(),r=new LanDeltaReceiver();deliver(s,r,target(1));s.ack(1);const delta=s.prepare(target(2)).packet;
 for(const mutate of [b=>b[32]^=1,b=>new DataView(b.buffer).setUint32(4,4),b=>new DataView(b.buffer).setUint32(24,0xffffffff),b=>new DataView(b.buffer).setFloat64(16,NaN),b=>new DataView(b.buffer).setFloat64(8,999),b=>b[36]=0]){
  const receiver=new LanDeltaReceiver(),c=new LanDeltaSender();receiver.decode(c.prepare(target(1)).packet);
  const bytes=delta.slice();mutate(bytes);assert.throws(()=>receiver.decode(bytes));assert.equal(receiver.retainedBytes,0);
 }
 assert.throws(()=>new LanDeltaReceiver().decode(delta));assert.throws(()=>r.decode(delta.subarray(0,delta.length-1)));
 const t=target(4),wrong=encodeLanPacket({...t,seq:5},null,null,true);assert.throws(()=>new LanDeltaReceiver().decode(wrong));
 assert.equal(isLanDelta(delta),true);assert.equal(isLanDelta(raw(1)),false);
});
test('skips and dropped non-anchor views do not break the independently anchored next view',()=>{
 const s=new LanDeltaSender(),r=new LanDeltaReceiver();deliver(s,r,target(1));s.ack(1);
 deliver(s,r,target(2)); // Receive candidate anchor but withhold its ACK.
 const notReceived=s.prepare(target(3));assert.equal(notReceived.anchor,false);s.commit(notReceived);
 assert.equal(deliver(s,r,target(9)).delta,true);assert.equal(deliver(s,r,target(100)).delta,true);
});

test('seeded changing-length payloads reconstruct exactly across delayed ACKs and skipped non-anchor states',()=>{
 let seed=0x51d1;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const s=new LanDeltaSender(),r=new LanDeltaReceiver(),acks=[];
 let body=Uint8Array.from({length:24000},()=>random()>>>24),delivered=0;
 for(let seq=1;seq<=240;seq++){
  while(acks.length&&acks[0].at<=seq)s.ack(acks.shift().seq);
  if(seq%7===0){const at=random()%body.length,extra=Uint8Array.from({length:1+random()%200},()=>random()>>>24);body=Uint8Array.from([...body.subarray(0,at),...extra,...body.subarray(at)]);}
  if(seq%11===0){const at=random()%(body.length-500),length=1+random()%300;body=Uint8Array.from([...body.subarray(0,at),...body.subarray(at+length)]);}
  for(let k=0;k<10;k++)body[random()%body.length]=random()>>>24;
  const bytes=encodeBinaryState('fuzz-byte-envelope',seq,body),target=lanDeltaTarget(bytes,seq),choice=s.prepare(target);
  // A sent candidate must arrive on the reliable ordered LAN stream. A later
  // ordinary view may be discarded without changing anchor membership.
  if(!choice.anchor&&seq%13===0){s.commit(choice);continue;}
  assert.deepEqual(r.decode(choice.packet),bytes);assert.equal(s.commit(choice),true);delivered++;
  acks.push({seq,at:seq+9});assert.ok(r.retainedBytes<=LAN_DELTA_MAX_BYTES*2);
 }
 assert.ok(delivered>220);assert.ok(s.stats().delta>200);
});
