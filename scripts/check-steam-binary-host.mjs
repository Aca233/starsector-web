// Explicit synchronous reference fixture; real-worker coverage lives in check-steam-snapshot-prepare.mjs.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLanServer} from '../server/lan-server.mjs';
import {SteamGateway} from '../server/steam/gateway.mjs';
import {SteamPacketCodec} from '../server/steam/packet-codec.mjs';
import {SteamBinarySnapshotReceiver,SteamBinarySnapshotEncoder,SteamBinarySnapshotSender} from '../server/steam/binary-snapshot.mjs';
import {SteamSnapshotReceiver} from '../server/steam/snapshot-delta.mjs';
import {encodeBinaryState,encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
import {motionFrame} from './lib/motion-reference-fixture.mjs';
const hostId='76561198000000001',guestId='76561198000000002',lobby='109775240000000001',nonce='a'.repeat(32);
class MemoryServer extends EventEmitter {listen(_p,_h,fn){fn();}address(){return {port:32110};}close(fn){fn();}}
class Browser extends EventEmitter {
  readyState=1; bufferedAmount=0; rows=[];
  send(text){this.rows.push(JSON.parse(text));}ping(){}
  close(){this.readyState=3;this.emit('close',1000);}terminate(){this.close();}
  message(value){this.emit('message',Buffer.from(JSON.stringify(value)),false);}
  binary(value){this.emit('message',Buffer.from(value),true);}
}
async function fixture(t,{hostOffer=true,oldGuest=false}={}) {
  const dist=mkdtempSync(join(tmpdir(),'steam-binary-host-'));writeFileSync(join(dist,'lan-build.json'),JSON.stringify({build:'test'}));
  const mock=t.mock.method(http,'createServer',()=>new MemoryServer());let relay;
  try {relay=await createLanServer({dist,host:'127.0.0.1',port:32110});}finally{mock.mock.restore();}
  let refused=false;
  const messages=[],codec=new SteamPacketCodec({binaryStates:true});
  const gateway=new SteamGateway({ snapshotPreparation: false,build:'test',client:{networking:{sendP2PPacket(_id,_type,packet){if(refused && packet[5]===2)return false;const m=codec.receive(hostId,packet);if(m)messages.push(m);return true;}}}});
  gateway.owner=hostId;gateway.initialized=true;gateway.relay=relay;
  gateway.selected={id:lobby,owner:hostId,lobby:{getMembers:()=>[hostId,guestId],getOwner:()=>hostId}};
  t.after(async()=>{gateway.wss.close();await relay.close();unlinkSync(join(dist,'lan-build.json'));rmdirSync(dist);});
  const host=new Browser();gateway.connectBrowser(host,new URL('http://localhost/steam/ws?lobby='+lobby));
  const hello={type:'hello',name:'test',instance:'test',build:'test',protocol:protocol.version,stateCredits:1,binarySnapshots:1};
  host.message({...hello,binarySnapshots:hostOffer?1:0});
  gateway.dispatch(guestId,{connection:nonce,op:'open',data:{lobby,build:'test',protocol:protocol.version,stateConsumption:1,binaryState:oldGuest?0:1}});
  let id=0;
  const guest=value=>gateway.dispatch(guestId,{connection:nonce,op:'data',id:++id,data:value});
  guest(hello);host.message({type:'create',password:''});const room=[...relay.rooms.values()][0];
  guest({type:'join',code:room.code});guest({type:'ready',ready:true});host.message({type:'start'});
  host.message({type:'loaded',matchId:room.match.id});guest({type:'loaded',matchId:room.match.id});assert.equal(room.status,'running');
  const peer=gateway.peers.get(guestId), receiver=oldGuest?new SteamSnapshotReceiver():new SteamBinarySnapshotReceiver();
  const state=seq=>({type:'state',matchId:room.match.id,seq,frame:{...motionFrame(),tick:seq,ships:[{id:'a',state:{teamId:0}},{id:'b',state:{teamId:1}}],crafts:[],craftSpecs:[]}});
  const bytes=value=>encodeBinaryState(value.matchId,value.seq,encodeProjectedBinaryFrame(value.frame));
  const receive=()=>{const m=messages.filter(m=>m.op==='data').at(-1);const result=receiver.receive(m.data);gateway.dispatch(guestId,{connection:nonce,op:'ack',data:{id:m.id}});gateway.dispatch(guestId,{connection:nonce,op:'ack',data:{id:m.id,consumed:true}});return result;};
  return {host,peer,gateway,room,messages,state,bytes,receive,guest,refuse(){refused=true;}};
}
for(const oldGuest of [false,true])test('local Steam host binary negotiation -> validated relay -> '+(oldGuest?'legacy':'binary')+' peer retains exact state',async t=>{
  const f=await fixture(t,{oldGuest});assert.equal(f.host.rows[0].binarySnapshots,1);
  const welcome=f.messages.find(m=>m.op==='data'&&m.data.type==='welcome');assert.equal(welcome.data.binarySnapshots,undefined);
  for(const seq of [1,3,7]) {const value=f.state(seq);f.host.binary(f.bytes(value));assert.equal(f.peer.readyState,1);assert.deepEqual(f.receive().data,value);}
  assert.equal(f.peer.sentStates,3);assert.equal(f.peer.ackedStates,3);assert.equal(f.peer.consumption.consumed,3);
  assert.equal(f.peer.lastSnapshot.format,oldGuest?'delta':'binary-delta');
  if(!oldGuest)assert.ok(f.peer.snapshotSender.sender.base.bytes.length>0);
});
test('unoffered local capability rejects binary; JSON fallback remains accepted',async t=>{
  const f=await fixture(t,{hostOffer:false});assert.equal(f.host.rows[0].binarySnapshots,undefined);
  f.host.binary(f.bytes(f.state(1)));assert.equal(f.peer.sentStates,0);assert.equal(f.host.rows.at(-1).type,'error');
  f.host.message(f.state(1));assert.deepEqual(f.receive().data,f.state(1));
});
test('binary local state cannot bypass malformed frame, match, sequence or remote-host restrictions',async t=>{
  const f=await fixture(t);const wrong=f.state(1);wrong.matchId='wrong';f.host.binary(f.bytes(wrong));assert.equal(f.peer.sentStates,0);
  const bad=f.state(1);bad.frame.ships=[];f.host.binary(f.bytes(bad));assert.equal(f.peer.sentStates,0);
  f.host.binary(f.bytes(f.state(1)));f.receive();f.host.binary(f.bytes(f.state(1)));assert.equal(f.peer.sentStates,1);
  f.peer.emit('message',Buffer.from(f.bytes(f.state(2))),true);assert.equal(f.peer.sentStates,1);assert.equal(f.room.lastSeq,1);
  assert.throws(()=>f.gateway.dispatch(guestId,{connection:nonce,op:'data',data:Buffer.from(f.bytes(f.state(2))),binary:true}),/Unnegotiated/);
  f.host.binary(f.bytes(f.state(3)));assert.deepEqual(f.receive().data,f.state(3));
});
test('validated binary target is shared without reparse/re-encode; full raw fallback and SHA remain intact',()=>{
  const encoder=new SteamBinarySnapshotEncoder(),a=new SteamBinarySnapshotSender(),b=new SteamBinarySnapshotSender(),codec=new SteamPacketCodec({binaryStates:true});
  const state={type:'state',matchId:'relay',seq:1,frame:motionFrame()};const bytes=encodeBinaryState(state.matchId,state.seq,encodeProjectedBinaryFrame(state.frame));
  const relay={state,bytes},ca=a.prepare(relay,encoder,codec),cb=b.prepare(relay,encoder,codec);
  assert.equal(ca.target,cb.target);assert.equal(ca.prepared,cb.prepared);assert.equal(ca.target.delta.bytes.buffer,bytes.buffer);
  assert.equal(ca.rawBytes,Buffer.byteLength(JSON.stringify(state)));assert.equal(a.sender.base,null);a.commit(ca);
  const receiver=new SteamBinarySnapshotReceiver();const packets=codec.frame(nonce,'data',ca.prepared).packets;let m;for(const p of packets)m=codec.receive(hostId,p);assert.deepEqual(receiver.receive(m.data).data,state);
  const broken=Buffer.from(m.data);broken[8]^=1;assert.throws(()=>new SteamBinarySnapshotReceiver().receive(broken));
  const small={type:'state',matchId:'relay',seq:2,frame:{tick:2}};const fallback=a.prepare({state:small,bytes:encodeBinaryState('relay',2,encodeProjectedBinaryFrame(small.frame))},encoder,codec);assert.ok(fallback.legacy);assert.equal(fallback.prepared.binary,undefined);
});

 test('local binary handoff keeps oversized JSON fallback and failed native sends never commit a baseline',async t=>{
  const f=await fixture(t);const large=f.state(1);large.frame.padding='x'.repeat(2200000);
  f.host.binary(f.bytes(large));assert.deepEqual(f.receive().data,large);assert.equal(f.peer.lastSnapshot.format,'legacy-full');
  f.host.binary(f.bytes(f.state(2)));f.receive();const committed=f.peer.snapshotSender.diagnostics().fullStates;
  f.refuse();f.host.binary(f.bytes(f.state(3)));assert.equal(f.peer.readyState,3);
  assert.equal(f.peer.snapshotSender.diagnostics().fullStates,committed);assert.equal(f.peer.snapshotSender.sender.base,null);
 });
