import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamBinarySnapshotEncoder, SteamBinarySnapshotSender, SteamBinarySnapshotReceiver, STEAM_BINARY_MAX_BYTES } from '../server/steam/binary-snapshot.mjs';
import { motionFrame } from './lib/motion-reference-fixture.mjs';
const nonce = 'a'.repeat(32);
const state = (seq, matchId = 'test') => ({ type: 'state', matchId, seq, frame: { ...motionFrame(), tick: 100 + seq } });
function fixture() {
  const encoder = new SteamBinarySnapshotEncoder(), sender = new SteamBinarySnapshotSender(), receiver = new SteamBinarySnapshotReceiver();
  const codec = new SteamPacketCodec({ binaryStates: true }), decoder = new SteamPacketCodec({ binaryStates: true });
  const decode = choice => {
    let received;
    const framed = codec.frame(nonce, 'data', choice.prepared);
    for (const packet of framed.packets) received = decoder.receive('host', packet);
    assert.ok(received); assert.equal(decoder.bytes, 0); return { ...received, framed };
  };
  const send = (value, now=100) => {
    const text = JSON.stringify(value), choice = sender.prepare(text, encoder, codec, now), wire = decode(choice);
    assert.equal(sender.commit(choice), true);
    const result = receiver.receive(wire.data);
    assert.equal(result.needsFull, false); assert.equal(JSON.stringify(result.data), text);
    return { choice, wire, result };
  };
  return { encoder, sender, receiver, codec, decoder, decode, send };
}
test('binary full and skipped-tick motion deltas reconstruct canonical JSON exactly', () => {
  const f=fixture();
  const first=f.send(state(1)); assert.equal(first.wire.binary,true); assert.equal(first.choice.delta,false);
  for(const seq of [2,5,12,70,150]) {
    const {choice,result}=f.send(state(seq),100+seq);
    assert.equal(result.canonicalText,JSON.stringify(state(seq))); assert.equal(choice.delta,true);
    assert.equal(!!choice.motionSteps,seq!==150);
  }
  assert.equal(f.sender.diagnostics().binaryDeltaStates,5); assert.equal(f.receiver.diagnostics().binaryDeltaStates,5);
});
test('old/default codec rejects binary; binary only allowed for data, bounded inflation and fragmentation', () => {
  const f=fixture(), first=f.send(state(1));
  for(const p of first.wire.framed.packets) assert.equal(new SteamPacketCodec().receive('host',p),null);
  assert.throws(()=>new SteamPacketCodec().prepareBinaryState(Buffer.alloc(20)));
  assert.throws(()=>f.codec.frame(nonce,'open',first.choice.prepared));
  assert.throws(()=>f.codec.prepareBinaryState(Buffer.alloc(STEAM_BINARY_MAX_BYTES+1)));
  const prepared=f.codec.prepareBinaryState(randomBytes(180000));
  const frames=f.codec.frame(nonce,'data',prepared).packets; assert.ok(frames.length>1);
  const changed=Buffer.from(frames[1]); changed[6]^=1;
  assert.equal(f.decoder.receive('host',frames[0]),null); assert.throws(()=>f.decoder.receive('host',changed));
  assert.equal(f.decoder.bytes,0);
  const oversized=Buffer.from(frames[0]); oversized.writeUInt32LE(STEAM_BINARY_MAX_BYTES+1,20);
  assert.throws(()=>f.decoder.receive('host',oversized));
});
test('fallback preserves legacy extra keys, key order, surrogate strings, unsafe keys and huge state', () => {
  const samples=[{...state(3),extra:true},{seq:3,...state(3)},state(3),state(3),state(3)];
  samples[2].frame.text='\ud800'; samples[3].frame.data=JSON.parse('{"__proto__":{"safe":1},"constructor":2}');
  samples[4].frame.huge='x'.repeat(2200000);
  for(const value of samples) {
    const f=fixture(); f.send(state(1)); const next=f.send(value);
    assert.equal(next.wire.binary,undefined); assert.equal(f.receiver.receiver.retainedBytes,0);
    assert.equal(f.send(state(4)).choice.delta,false);
  }
});
test('small states keep old format; parse/eligibility cache shared including unsupported broadcasts',()=>{
  const f=fixture(), value=state(1); delete value.frame.ballast;
  assert.equal(f.send(value).wire.binary,undefined);
  const text=JSON.stringify(state(1)), first=f.encoder.prepare(text); assert.ok(first);
  assert.equal(f.encoder.prepare(text),first);
  const incompatible=JSON.stringify({...state(2),extra:true}); assert.equal(f.encoder.prepare(incompatible),null); assert.equal(f.encoder.prepare(incompatible),null);
  f.encoder.clear(); assert.equal(f.encoder.current,null); assert.equal(f.encoder.text,null);
});
test('only committed state becomes base; duplicate/reset/stale choices cannot commit',()=>{
  const f=fixture(); const prepare=n=>f.sender.prepare(JSON.stringify(state(n)),f.encoder,f.codec,n);
  const abandoned=prepare(1); const current=prepare(2); assert.equal(f.sender.commit(current),true);
  assert.equal(f.sender.commit(abandoned),false); assert.equal(f.sender.commit(current),false);
  const next=prepare(4); assert.equal(next.choice.packet[7]&1,1); assert.equal(next.choice.packet.length>36,true);
  f.sender.reset(); assert.equal(f.sender.commit(next),false); assert.equal(prepare(5).delta,false);
});
test('missing base requests repair without forwarding or accepting predicted values',()=>{
  const f=fixture(); f.send(state(1)); const choice=f.sender.prepare(JSON.stringify(state(3)),f.encoder,f.codec,300), wire=f.decode(choice);
  const fresh=new SteamBinarySnapshotReceiver(), miss=fresh.receive(wire.data);
  assert.deepEqual(miss,{data:null,needsFull:true}); assert.equal(fresh.diagnostics().misses,1); assert.equal(fresh.receiver.retainedBytes,0);
  f.sender.reset(); const full=f.sender.prepare(JSON.stringify(state(4)),f.encoder,f.codec,400); assert.equal(full.delta,false);
  assert.equal(fresh.receive(f.decode(full).data).canonicalText,JSON.stringify(state(4)));
});
test('SHA256, canonical size and inner CRC are independently checked before forwarding',()=>{
  for(const defect of ['hash','size','target','flags','base-crc']) {
    const f=fixture(); f.send(state(1)); const choice=f.sender.prepare(JSON.stringify(state(2)),f.encoder,f.codec,200);
    const {data}=f.decode(choice), b=Buffer.from(data);
    if(defect==='hash') b[8]^=1;
    if(defect==='size') b.writeUInt32LE(b.readUInt32LE(4)+1,4);
    if(defect==='target') b[b.length-1]^=1;
    if(defect==='flags') b.writeUInt32BE(0xffffffff,44);
    if(defect==='base-crc') b[68]^=1;
    assert.throws(()=>f.receiver.receive(b)); assert.equal(f.receiver.receiver.retainedBytes,0); assert.equal(f.receiver.base,null);
  }
});
test('new match, sequence restart and ten-second checkpoints are full and recoverable',()=>{
  const f=fixture(); f.send(state(10)); f.send(state(11));
  assert.equal(f.send(state(1,'new'),200).choice.delta,false);
  assert.equal(f.send(state(2,'new'),300).choice.delta,true);
  assert.equal(f.send(state(3,'new'),10201).choice.delta,false);
  assert.equal(f.send(state(4,'new'),10300).choice.delta,true);
  assert.equal(f.sender.diagnostics().binaryFullStates,3);
});
test('multiple peers share binary preparation, retain independent committed baselines and bounded patch work',()=>{
  const f=fixture(), peers=Array.from({length:9},()=>new SteamBinarySnapshotSender());
  const encode=(sender,n)=>sender.prepare(JSON.stringify(state(n)),f.encoder,f.codec,n);
  const first=peers.map(p=>encode(p,1)); for(let i=0;i<peers.length;i++) peers[i].commit(first[i]);
  for(let i=1;i<9;i++) assert.equal(first[i].prepared,first[0].prepared);
  const next=peers.map(p=>encode(p,2)); for(let i=1;i<9;i++) assert.equal(next[i].prepared,next[0].prepared);
  assert.equal(f.encoder.current.delta.patchBuilds,1);
  for(let i=0;i<3;i++) peers[i].commit(next[i]);
  for(let i=3;i<6;i++) peers[i].commit(encode(peers[i],3));
  const divergent=peers.map(p=>encode(p,5)); assert.ok(f.encoder.current.delta.patchBuilds<=2);
  assert.ok(divergent.some(c=>c.choice.budgetFallback));
});
test('binary envelope SHA names the canonical state, not the reference or compressed representation',()=>{
  const f=fixture(); f.send(state(1)); const {wire}=f.send(state(2));
  assert.equal(wire.data.subarray(8,40).toString('hex'),createHash('sha256').update(JSON.stringify(state(2))).digest('hex'));
  assert.equal(wire.data.readUInt32LE(4),Buffer.byteLength(JSON.stringify(state(2))));
});

test('original key order and JSON numeric fidelity survive a binary full and delta',()=>{
  const f=fixture(), before=state(1);
  before.frame.values=[Math.PI,Number.MIN_VALUE,Number.MAX_VALUE,Number.MAX_SAFE_INTEGER,-1e-200,-0];
  before.frame.keys={'19':'x','0':'n',z:'\uFEFF汉字😀',a:{b:true,c:null}};
  f.send(before);const after=JSON.parse(JSON.stringify(before));after.seq=2;after.frame.tick++;
  after.frame.keys={a:{c:null,b:false},z:'汉字😀',19:'y',0:'n'};after.frame.values[0]=Math.E;
  const result=f.send(after);assert.equal(result.wire.binary,true);assert.equal(result.result.canonicalText,JSON.stringify(after));
});
