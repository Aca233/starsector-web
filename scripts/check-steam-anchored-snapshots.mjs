import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamSnapshotEncoder, SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { SteamAnchoredSender, SteamAnchoredReceiver } from '../server/steam/anchored-snapshots.mjs';
let seed=918;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const ballast=Array.from({length:14000},()=>String.fromCharCode(33+Math.floor(random()*89))).join('');
const state=seq=>({type:'state',matchId:'anchored-fixture',seq,frame:{tick:seq,ballast,pos:[Math.sin(seq*.03)*1e4,Math.cos(seq*.07)*1e4],projectiles:Array.from({length:seq%11},(_,i)=>({id:i,ttl:seq*.19+i}))}});
function fixture(){const codec=new SteamPacketCodec(),decoder=new SteamPacketCodec(),encoder=new SteamSnapshotEncoder(),sender=new SteamAnchoredSender(),receiver=new SteamAnchoredReceiver();
 const prepare=(seq,now=seq*16)=>sender.prepare(JSON.stringify(state(seq)),encoder,codec,now);
 const wire=choice=>{let m;for(const p of codec.frame('a'.repeat(32),'data',choice.prepared).packets)m=decoder.receive('host',p);return m.data;};
 return {codec,decoder,encoder,sender,receiver,prepare,wire};
}
test('experimental anchored snapshots survive a dropped delta; v1 chained baseline does not',()=>{
 const f=fixture(),anchor=f.prepare(1);f.sender.commit(anchor);const envelope=f.wire(anchor);
 const baseline=new SteamSnapshotReceiver();baseline.receive(envelope);
 const first=f.receiver.receiveAnchor(envelope);f.sender.acknowledgeAnchor(first.anchorAck);
 const lost=f.prepare(2);f.sender.commit(lost);
 const next=f.prepare(3);f.sender.commit(next);const packet=f.wire(next);
 assert.equal(packet.base,envelope.token);assert.deepEqual(f.receiver.receiveSnapshot(packet).data,state(3));
 // V1's decoder can decode against the original baseline once, but then moves
 // its baseline to token 3. The next anchor-based packet still names token 1.
 assert.deepEqual(baseline.receive(packet).data,state(3));
 const future=f.wire(f.prepare(4));assert.equal(baseline.receive(future).needsFull,true);
 assert.deepEqual(f.receiver.receiveSnapshot(future).data,state(4));
});
test('delayed anchor ACK, duplicate ACK and preparation without successful send are safe',()=>{
 const f=fixture(),a=f.prepare(1);assert.equal(f.sender.pending,null);assert.equal(f.sender.commit(a),true);
 const b=f.prepare(2);assert.equal(b.kind,'snapshot');assert.equal(f.receiver.receiveSnapshot(f.wire(b)).needsAnchor,true);
 const received=f.receiver.receiveAnchor(f.wire(a));assert.equal(received.anchorAck,a.target.token);
 assert.deepEqual(f.receiver.receiveSnapshot(f.wire(b)).data,state(2));
 assert.equal(f.sender.acknowledgeAnchor(999),false);assert.equal(f.sender.acknowledgeAnchor(received.anchorAck),true);assert.equal(f.sender.acknowledgeAnchor(received.anchorAck),false);
 const neverSent=f.prepare(3,5100);assert.equal(neverSent.kind,'anchor');assert.equal(f.sender.pending,null);
 const duplicate=f.receiver.receiveAnchor(f.wire(a));assert.equal(duplicate.data,null);assert.equal(duplicate.anchorAck,a.target.token);
});
test('only two anchors survive rotations; late old frames cannot regress presentation',()=>{
 const f=fixture();
 const a=f.prepare(1,0);f.sender.commit(a);f.sender.acknowledgeAnchor(f.receiver.receiveAnchor(f.wire(a)).anchorAck);
 const old=f.prepare(2,100),b=f.prepare(3,5000);f.sender.commit(b);
 assert.equal(f.prepare(4,5010).kind,'snapshot');const bs=f.receiver.receiveAnchor(f.wire(b));f.sender.acknowledgeAnchor(bs.anchorAck);
 const c=f.prepare(5,10000);f.sender.commit(c);f.sender.acknowledgeAnchor(f.receiver.receiveAnchor(f.wire(c)).anchorAck);
 assert.equal(f.receiver.anchors.size,2);assert.equal(f.receiver.anchors.has(a.target.token),false);
 assert.equal(f.receiver.receiveAnchor(f.wire(a)).data,null);assert.equal(f.receiver.anchors.has(a.target.token),false);
 assert.equal(f.receiver.receiveSnapshot(f.wire(old)).data,null);assert.equal(f.receiver.deliveredToken,c.target.token);
});
test('in-flight anchor preserves old confirmed baseline until exact ACK; no list of raw-world histories',()=>{
 const f=fixture(),a=f.prepare(1,0);f.sender.commit(a);f.sender.acknowledgeAnchor(f.receiver.receiveAnchor(f.wire(a)).anchorAck);
 const b=f.prepare(2,5000),competing=f.prepare(3,5001);assert.equal(f.sender.commit(b),true);assert.equal(f.sender.commit(competing),false);
 assert.equal(f.sender.confirmed.token,a.target.token);assert.equal(f.sender.pending.token,b.target.token);assert.equal(f.sender.diagnostics().anchorCount,2);
 for(let seq=4;seq<20;seq++){const choice=f.prepare(seq,5000+seq);assert.equal(choice.kind,'snapshot');assert.equal(f.wire(choice).base,a.target.token);}
 f.sender.acknowledgeAnchor(b.target.token);assert.equal(f.sender.diagnostics().anchorCount,1);
});
test('reset rejects late commits/ACKs; unsupported large state requires explicit fallback, not lossy send',()=>{
 const f=fixture(),a=f.prepare(1);f.sender.reset();assert.equal(f.sender.commit(a),false);assert.equal(f.sender.acknowledgeAnchor(a.target.token),false);
 const b=f.prepare(2);f.sender.commit(b);
 const other=f.sender.prepare(JSON.stringify({...state(3),matchId:'different'}),f.encoder,f.codec,100);assert.equal(other.kind,'reset-required');
 const large=f.sender.prepare(JSON.stringify({...state(4),frame:{tick:4,payload:'x'.repeat(524288)}}),f.encoder,f.codec,200);assert.equal(large.kind,'unsupported');assert.equal(f.sender.commit(large),false);
 f.receiver.receiveAnchor(f.wire(b));f.receiver.reset();assert.equal(f.receiver.anchors.size,0);assert.equal(f.receiver.deliveredToken,null);
});
test('token wrap-around, wrong hashes and malformed anchors do not corrupt baseline state',()=>{
 const f=fixture();f.encoder.sequence=0xfffffffe;const a=f.prepare(1,0);f.sender.commit(a);const data=f.wire(a);assert.equal(data.token,0xffffffff);
 f.sender.acknowledgeAnchor(f.receiver.receiveAnchor(data).anchorAck);const b=f.prepare(2,16),next=f.wire(b);assert.equal(next.token,0);assert.deepEqual(f.receiver.receiveSnapshot(next).data,state(2));
 assert.equal(f.receiver.receiveAnchor(data).data,null);
 const bad={...f.wire(f.prepare(3,32)),hash:'f'.repeat(64)};assert.throws(()=>f.receiver.receiveSnapshot(bad));assert.equal(f.receiver.deliveredToken,0);
 assert.throws(()=>f.receiver.receiveAnchor(next),/complete/);assert.throws(()=>f.receiver.receiveSnapshot({...next,token:-1}));
});
test('1200 evolving snapshots with deterministic loss/reordering keep delivered JSON exact and anchors bounded',()=>{
 const f=fixture();let pending=[],delivered=0;
 for(let seq=1;seq<=1200;seq++){
  const c=f.prepare(seq,seq*16);assert.ok(['anchor','snapshot'].includes(c.kind));f.sender.commit(c);const envelope=f.wire(c);
  if(c.kind==='anchor'){const r=f.receiver.receiveAnchor(envelope);f.sender.acknowledgeAnchor(r.anchorAck);if(r.data){assert.deepEqual(r.data,state(r.data.seq));delivered++;}}
  else if(random()>.25)pending.push(envelope);
  if(pending.length>3||random()>.5){pending.reverse();for(const packet of pending){const r=f.receiver.receiveSnapshot(packet);assert.equal(r.needsAnchor,false);if(r.data){assert.deepEqual(r.data,state(r.data.seq));delivered++;}}pending=[];}
  assert.ok(f.sender.diagnostics().anchorCount<=2);assert.ok(f.receiver.diagnostics().anchorCount<=2);assert.ok(f.receiver.diagnostics().anchorCanonicalBytes<1048576);
 }
 assert.ok(delivered>400);assert.ok(f.receiver.stale>0);assert.equal(f.receiver.misses,0);
});

test('prepared choices cannot resurrect retired anchors after ACK or be committed twice/across senders', () => {
 const f = fixture(), a = f.prepare(1, 0), competing = f.prepare(2, 1);
 assert.equal(f.sender.commit(a), true);
 assert.equal(f.sender.acknowledgeAnchor(f.receiver.receiveAnchor(f.wire(a)).anchorAck), true);
 assert.equal(f.sender.commit(competing), false, 'empty pending slot after ACK is not permission to commit stale choice');
 assert.equal(f.sender.confirmed.token, a.target.token);
 const beforeRotation = f.prepare(3, 100), b = f.prepare(4, 5000);
 assert.equal(f.sender.commit(b), true);
 assert.equal(f.sender.commit(beforeRotation), false, 'prepared choice must use current anchor revision');
 f.sender.acknowledgeAnchor(f.receiver.receiveAnchor(f.wire(b)).anchorAck);
 const current = f.prepare(5, 5010);
 assert.equal(new SteamAnchoredSender().commit(current), false);
 assert.equal(f.sender.commit(current), true);
 assert.equal(f.sender.commit(current), false, 'same accepted send cannot increment counters twice');
 assert.equal(f.sender.sentSnapshots, 1);
});
test('valid foreign-match anchor/full snapshot cannot mutate receiver without an explicit reset', () => {
 const f = fixture(), a = f.prepare(1, 0);f.sender.commit(a);f.receiver.receiveAnchor(f.wire(a));
 const foreign = f.encoder.prepare(JSON.stringify({ ...state(2), matchId: 'other-match' }), f.codec);
 const envelope = f.wire({ prepared: foreign.full });
 const before = f.receiver.diagnostics();
 assert.throws(() => f.receiver.receiveAnchor(envelope), /explicit reset/);
 assert.throws(() => f.receiver.receiveSnapshot(envelope), /explicit reset/);
 assert.deepEqual(f.receiver.diagnostics(), before);
 assert.equal(f.receiver.matchId, 'anchored-fixture');
 f.receiver.reset();
 assert.equal(f.receiver.receiveAnchor(envelope).data.matchId, 'other-match');
});
test('corrupt or token-reused anchors leave the old anchor usable and do not generate an ACK', () => {
 const f = fixture(), a = f.prepare(1, 0);f.sender.commit(a);f.receiver.receiveAnchor(f.wire(a));
 f.sender.acknowledgeAnchor(a.target.token);
 const b = f.prepare(2, 5000), envelope = f.wire(b), before = f.receiver.diagnostics();
 assert.throws(() => f.receiver.receiveAnchor({ ...envelope, hash: 'f'.repeat(64) }));
 assert.throws(() => f.receiver.receiveAnchor({ ...envelope, token: a.target.token }), /reused/);
 assert.deepEqual(f.receiver.diagnostics(), before);
 assert.deepEqual(f.receiver.receiveSnapshot(f.wire(f.prepare(3, 100))).data, state(3));
});
