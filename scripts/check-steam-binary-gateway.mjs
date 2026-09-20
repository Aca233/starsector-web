// Explicit synchronous reference fixture; real-worker coverage lives in check-steam-snapshot-prepare.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { SteamGateway } from '../server/steam/gateway.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { inflateRawSync } from 'node:zlib';
import { motionFrame } from './lib/motion-reference-fixture.mjs';
const hostId='76561198000000001', guestId='76561198000000002', lobby='109775240000000001';
const state=seq=>({type:'state',matchId:'binary-gateway',seq,frame:{...motionFrame(),tick:100+seq}});
function pair(t,{oldHost=false,oldGuest=false,binaryRenderer=false,rendererCredits=true}={}) {
  const incoming=[],sends=[],closes=[],packets=[]; let failedSend=false;
  const native=id=>({networking:{sendP2PPacket(remote,type,data){
    if(failedSend && id===hostId && data[5]===2) return false;
    packets.push({from:id,type,data:Buffer.from(data)});
    if(type===2) incoming.push({from:id,remote:String(remote),data:Buffer.from(data)});
    return true;
  }}});
  const host=new SteamGateway({ snapshotPreparation: false,build:'test',client:native(hostId)}), guest=new SteamGateway({ snapshotPreparation: false,build:'test',client:native(guestId)});
  t.after(()=>{host.wss.close();guest.wss.close();});
  for(const [g,id] of [[host,hostId],[guest,guestId]]) {g.owner=id;g.initialized=true;g.selected={id:lobby,owner:hostId,lobby:{getMembers:()=>[hostId,guestId],getOwner:()=>hostId}};}
  host.relay={acceptTransport(){}};
  const ws=Object.assign(new EventEmitter(),{readyState:1,bufferedAmount:0,
    send(text,callback){sends.push({text,callback});},close(...args){closes.push(args);this.readyState=3;this.emit('close',...args);}});
  const pump=()=>{
    let count=0;
    while(incoming.length) {
      assert.ok(++count<1000); const item=incoming.shift(), dest=item.remote===hostId?host:guest;
      const message=dest.codec.receive(item.from,item.data); if(!message)continue;
      if((oldHost||oldGuest)&&message.op==='open')delete message.data.binaryState;
      dest.dispatch(item.from,message);
    }
  };
  guest.connectBrowser(ws,new URL('http://localhost/steam/ws?lobby='+lobby)); pump();
  ws.emit('message',Buffer.from(JSON.stringify({type:'hello',stateCredits:rendererCredits?1:0,...(binaryRenderer?{binaryReceive:1}:{})})),false);pump();
  const peer=host.peers.get(guestId);peer.send(JSON.stringify({type:'welcome',seat:1}));pump();const welcome=JSON.parse(sends.at(-1).text);sends.length=0;packets.length=0;
  return {host,guest,peer,ws,pump,sends,closes,packets,welcome,fail(){failedSend=true;}};
}
test('production open/opened negotiation, corrected-only forwarding, separate network and renderer ACK',t=>{
  const f=pair(t); assert.equal(f.peer.binarySnapshots,true); assert.equal(f.guest.guestBinaryState,true);
  for(const seq of [1,3,7]) {
    const before=f.peer.ackedStates, consumed=f.peer.consumption.consumed;
    f.peer.send(JSON.stringify(state(seq))); f.pump();
    assert.equal(f.sends.at(-1).text,JSON.stringify(state(seq)));
    assert.equal(f.peer.ackedStates,before); assert.equal(f.peer.consumption.consumed,consumed);
    f.sends.at(-1).callback(); f.pump(); assert.equal(f.peer.ackedStates,before+1); assert.equal(f.peer.consumption.consumed,consumed);
    f.ws.emit('message',Buffer.from(JSON.stringify({type:'state-consumed',matchId:'binary-gateway',seq})),false);f.pump();
    assert.equal(f.peer.consumption.consumed,consumed+1);
  }
  assert.equal(f.peer.lastSnapshot.format,'binary-delta');assert.equal(f.peer.snapshotSender.diagnostics().motionDeltas,2);
  assert.deepEqual(f.closes,[]);
});
for(const option of ['oldHost','oldGuest'])test(option+' never receives unconfirmed binary packets',t=>{
  const f=pair(t,{[option]:true}); assert.equal(f.peer.binarySnapshots,false); assert.equal(f.guest.guestBinaryState,false);
  f.peer.send(JSON.stringify(state(1)));f.pump();assert.equal(f.sends.at(-1).text,JSON.stringify(state(1)));
  const old=new SteamPacketCodec();for(const p of f.packets.filter(p=>p.from===hostId))assert.ok(old.receive(hostId,p.data));
});
test('stale nonce/unsolicited opened cannot enable or reset negotiated receiver',t=>{
  const f=pair(t); f.peer.send(JSON.stringify(state(1))); f.pump(); const receiver=f.guest.snapshotReceiver, bytes=receiver.receiver.retainedBytes;
  f.guest.dispatch(hostId,{connection:f.guest.guestConnection,op:'opened',data:{binaryState:1}});
  assert.equal(f.guest.snapshotReceiver,receiver);assert.equal(receiver.receiver.retainedBytes,bytes);
  f.guest.guestBinaryState=null;f.guest.snapshotReceiver=new SteamSnapshotReceiver();
  f.guest.dispatch(hostId,{connection:'old',op:'opened',data:{binaryState:1}});assert.equal(f.guest.guestBinaryState,null);
  assert.doesNotThrow(()=>f.host.dispatch(guestId,{connection:'old',op:'data',binary:true,data:Buffer.alloc(1)}));
  assert.doesNotThrow(()=>f.guest.dispatch(hostId,{connection:'old',op:'data',binary:true,data:Buffer.alloc(1)}));
  assert.throws(()=>f.host.dispatch(guestId,{connection:f.peer.connection,op:'data',binary:true,data:Buffer.alloc(1)}),/Unnegotiated/);
  assert.throws(()=>f.guest.dispatch(hostId,{connection:f.guest.guestConnection,op:'data',binary:true,data:Buffer.alloc(1)}),/Unnegotiated/);
});
test('missing binary anchor requests full repair; does not renew frontend liveness',t=>{
  const f=pair(t);f.peer.send(JSON.stringify(state(1)));f.pump();f.sends.at(-1).callback();f.pump();
  const states=f.guest.receivedStates, at=f.guest.lastStateAt, writes=f.sends.length;
  f.guest.snapshotReceiver.reset();f.peer.send(JSON.stringify(state(2)));f.pump();
  assert.equal(f.sends.length,writes);assert.equal(f.guest.receivedStates,states);assert.equal(f.guest.lastStateAt,at);
  assert.equal(f.peer.snapshotSender.sender.base,null);
  f.peer.send(JSON.stringify(state(3)));f.pump();assert.equal(f.peer.lastSnapshot.format,'binary-full');assert.equal(f.sends.at(-1).text,JSON.stringify(state(3)));
});
test('native refusal cannot commit a prepared binary base',t=>{
  const f=pair(t);f.fail();f.peer.send(JSON.stringify(state(1)));f.pump();
  assert.equal(f.peer.snapshotSender.sender.base,null);assert.equal(f.peer.snapshotSender.diagnostics().binaryFullStates,0);assert.equal(f.peer.readyState,3);
});
test('invalid state never reaches local bridge or either ACK path',t=>{
  const f=pair(t);f.peer.send(JSON.stringify(state(1)));f.pump();f.sends.at(-1).callback();f.pump();
  const writes=f.sends.length,acks=f.peer.ackedStates;
  const choice=f.peer.snapshotSender.prepare(JSON.stringify(state(2)),f.host.binarySnapshotEncoder,f.host.codec);
  const packet=f.host.codec.frame(f.peer.connection,'data',choice.prepared);let message;
  for(const part of packet.packets)message=f.guest.codec.receive(hostId,part);
  message.data[8]^=1;
  assert.throws(()=>f.guest.dispatch(hostId,message));f.pump();assert.equal(f.sends.length,writes);assert.equal(f.peer.ackedStates,acks);
});

test('only an exact network ACK trains binary byte credit; consumed/stale/forged receipts cannot',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const f=pair(t);f.peer.send(JSON.stringify(state(1)));f.pump();const id=[...f.peer.inflight.keys()][0], connection=f.peer.connection;
  const before=JSON.stringify(f.peer.byteWindow);now+=100;
  for(const message of [{connection:'stale',op:'ack',data:{id}},{connection,op:'ack',data:{id:9999}},{connection,op:'ack',data:{id,consumed:true}}])f.host.dispatch(guestId,message);
  assert.equal(JSON.stringify(f.peer.byteWindow),before);assert.equal(f.peer.inflight.has(id),true);
  f.host.dispatch(guestId,{connection,op:'ack',data:{id}});assert.equal(f.peer.byteWindow.samples.length,1);
  const accepted=JSON.stringify(f.peer.byteWindow);f.host.dispatch(guestId,{connection,op:'ack',data:{id}});assert.equal(JSON.stringify(f.peer.byteWindow),accepted);
});

test('an over-64KiB keyframe still travels alone after binary byte credit has grown',t=>{
 const f=pair(t);f.peer.byteWindow.limit=224*1024;f.peer.consumption.maxBytes=224*1024;
 const large=state(1);large.frame.noise=randomBytes(110000).toString('base64');f.peer.send(JSON.stringify(large));
 assert.equal(f.peer.inflight.size,1);assert.ok(f.peer.inflightBytes>65536);assert.ok(f.peer.inflightBytes<224*1024);assert.equal(f.peer.snapshotWritable,false);
 const sent=f.peer.sentStates;f.peer.send(JSON.stringify(state(2)));assert.equal(f.peer.sentStates,sent);assert.equal(f.peer.inflight.size,1);
 f.pump();f.sends.at(-1).callback();f.pump();assert.equal(f.peer.inflight.size,0);
 f.ws.emit('message',Buffer.from(JSON.stringify({type:'state-consumed',matchId:'binary-gateway',seq:1})),false);f.pump();
 f.peer.send(JSON.stringify(state(3)));f.pump();assert.equal(f.sends.at(-1).text,JSON.stringify(state(3)));assert.deepEqual(f.closes,[]);
});


test('negotiated guest receives complete verified SWB1 while credit still charges canonical JSON and ACKs remain separate',t=>{
 const f=pair(t,{binaryRenderer:true});assert.equal(f.welcome.binaryReceive,1);assert.equal(f.welcome.binarySnapshots,undefined);
 let bytes=0,canonical=0;
 for(const seq of [1,3,7]){
  const value=state(seq),before=f.peer.ackedStates,consumed=f.peer.consumption.consumed;
  f.peer.send(JSON.stringify(value));f.pump();const row=f.sends.at(-1);assert.ok(ArrayBuffer.isView(row.text));
  assert.equal(Buffer.from(row.text).toString('ascii',0,4),'SWB1');assert.deepEqual(decodeBinaryState(row.text),value);
  const raw=Buffer.byteLength(JSON.stringify(value));assert.equal(f.guest.rendererReceipts.bytes,raw);assert.equal(f.peer.consumption.rawBytes,raw);
  assert.equal(f.peer.ackedStates,before);row.callback();f.pump();assert.equal(f.peer.ackedStates,before+1);assert.equal(f.peer.consumption.consumed,consumed);
  const receipt=Buffer.from(JSON.stringify({type:'state-consumed',matchId:value.matchId,seq}));f.ws.emit('message',receipt,false);f.pump();f.ws.emit('message',receipt,false);f.pump();assert.equal(f.peer.consumption.consumed,consumed+1);
  bytes+=row.text.byteLength;canonical+=raw;
 }
 assert.deepEqual(decodeBinaryState(f.sends[0].text),state(1),'later deltas must not mutate a queued local frame');
 const d=f.guest.receiptTrace.snapshot();assert.equal(d.rendererBinaryWrites,3);assert.equal(d.rendererJsonWrites,0);assert.equal(d.rendererPayloadBytes,bytes);assert.equal(d.rendererCanonicalBytes,canonical);assert.deepEqual(f.closes,[]);
});
for(const option of [{},{oldHost:true,binaryRenderer:true},{oldGuest:true,binaryRenderer:true},{binaryRenderer:true,rendererCredits:false}])test('local binary forwarding requires independent frontend, remote and consumption capabilities: '+JSON.stringify(option),t=>{
 const f=pair(t,option);assert.equal(f.welcome.binaryReceive,undefined);assert.equal(f.guest.rendererBinary,false);
 f.peer.send(JSON.stringify(state(1)));f.pump();assert.equal(typeof f.sends.at(-1).text,'string');assert.equal(f.sends.at(-1).text,JSON.stringify(state(1)));
 assert.equal(f.guest.receiptTrace.snapshot().rendererJsonWrites,1);
});
test('binary local bridge never forwards/ACKs a bad SHA and never bypasses canonical receipt budget',t=>{
 const f=pair(t,{binaryRenderer:true});const choice=f.peer.snapshotSender.prepare(JSON.stringify(state(1)),f.host.binarySnapshotEncoder,f.host.codec);
 const data=choice.prepared.zipped?inflateRawSync(choice.prepared.payload):Buffer.from(choice.prepared.payload);data[8]^=1;
 const packets=f.packets.length;assert.throws(()=>f.guest.dispatch(hostId,{connection:f.guest.guestConnection,op:'data',id:777,data,binary:true}));assert.equal(f.sends.length,0);assert.equal(f.packets.length,packets);assert.equal(f.guest.rendererReceipts.bytes,0);
 f.guest.rendererReceipts.maxBytes=Buffer.byteLength(JSON.stringify(state(1)))-1;
 f.peer.send(JSON.stringify(state(1)));f.pump();assert.equal(f.sends.length,0);assert.equal(f.peer.ackedStates,0);assert.equal(f.guest.receiptTrace.snapshot().rendererBinaryWrites,0);assert.equal(f.closes[0][0],1013);
});
test('binary local writes preserve errors and stale-callback isolation across close/reconnect',t=>{
 const f=pair(t,{binaryRenderer:true});f.peer.send(JSON.stringify(state(1)));f.pump();f.sends.at(-1).callback(Error('write'));f.pump();assert.equal(f.peer.ackedStates,0);assert.equal(f.guest.receiptTrace.snapshot().rendererWriteErrors,1);
 f.peer.send(JSON.stringify(state(2)));f.pump();const late=f.sends.at(-1).callback;f.ws.close();f.pump();assert.equal(f.guest.rendererBinary,false);assert.equal(f.guest.rendererRequestedBinary,false);
 const count=f.packets.length;late();f.pump();assert.equal(f.packets.length,count);assert.equal(f.peer.ackedStates,0);
});
test('negotiated binary guest still accepts small/large JSON fallbacks and later fresh full states',t=>{
 const f=pair(t,{binaryRenderer:true});const small={...state(1),frame:{tick:101}},large=state(2);large.frame.huge='x'.repeat(2200000);
 for(const value of [small,large,state(3)]){f.peer.send(JSON.stringify(value));f.pump();const row=f.sends.at(-1);assert.deepEqual(typeof row.text==='string'?JSON.parse(row.text):decodeBinaryState(row.text),value);row.callback();f.pump();f.ws.emit('message',Buffer.from(JSON.stringify({type:'state-consumed',matchId:value.matchId,seq:value.seq})),false);f.pump();}
 assert.equal(f.guest.receiptTrace.snapshot().rendererJsonWrites,2);assert.equal(f.guest.receiptTrace.snapshot().rendererBinaryWrites,1);assert.deepEqual(f.closes,[]);
});
