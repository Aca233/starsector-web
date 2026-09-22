// Production relay with both synchronous reference and default real preparation Worker.
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
async function fixture(t,{hostOffer=true,oldGuest=false,production=false}={}) {
  const dist=mkdtempSync(join(tmpdir(),'steam-binary-host-'));writeFileSync(join(dist,'lan-build.json'),JSON.stringify({build:'test'}));
  const mock=t.mock.method(http,'createServer',()=>new MemoryServer());let relay;
  try {relay=await createLanServer({dist,host:'127.0.0.1',port:32110});}finally{mock.mock.restore();}
  let refused=false;
  const messages=[],codec=new SteamPacketCodec({binaryStates:true});
  const gateway=new SteamGateway({ ...(production?{}:{snapshotPreparation:false}),build:'test',client:{networking:{sendP2PPacket(_id,_type,packet){if(refused && packet[5]===2)return false;const m=codec.receive(hostId,packet);if(m)messages.push(m);return true;}}}});
  gateway.owner=hostId;gateway.initialized=true;gateway.relay=relay;
  gateway.selected={id:lobby,owner:hostId,lobby:{getMembers:()=>[hostId,guestId],getOwner:()=>hostId}};
  t.after(async()=>{await gateway.snapshotPreparer?.close();gateway.wss.close();await relay.close();unlinkSync(join(dist,'lan-build.json'));rmdirSync(dist);});
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

test('patch-work exhaustion defers direct/worker proposals without native bytes, receipts or base commit',async t=>{
 const f=await fixture(t);f.host.binary(f.bytes(f.state(1)));f.receive();
 const sent=f.peer.sentStates,base=f.peer.snapshotSender.sender.base,credits=f.peer.consumption.pending.size;
 const original=f.peer.snapshotSender.prepare.bind(f.peer.snapshotSender);
 f.peer.snapshotSender.prepare=(...args)=>{const c=original(...args);return{...c,choice:{...c.choice,budgetFallback:true}};};
 f.host.binary(f.bytes(f.state(2)));assert.equal(f.peer.lastSnapshotSkip,'codec-work-budget');assert.equal(f.peer.sentStates,sent);assert.equal(f.peer.snapshotSender.sender.base,base);assert.equal(f.peer.inflight.size,0);assert.equal(f.peer.consumption.pending.size,credits);
 f.peer.snapshotSender.prepare=original;
 const proposal=original(JSON.stringify(f.state(3)),f.gateway.binarySnapshotEncoder,f.gateway.codec);
 assert.equal(f.peer.send(null,null,{prepared:proposal.prepared,stateBytes:proposal.rawBytes,budgetFallback:true}),false);
 assert.equal(f.peer.sentStates,sent);assert.equal(f.peer.snapshotSender.sender.base,base);assert.equal(f.peer.inflight.size,0);
 f.host.binary(f.bytes(f.state(4)));assert.deepEqual(f.receive().data,f.state(4));assert.equal(f.peer.sentStates,sent+1);
});

for(const oldGuest of [false,true])test('production relay -> default real preparation Worker -> exact '+(oldGuest?'legacy':'binary')+' world uses metadata-only decode',async t=>{
  const f=await fixture(t,{oldGuest,production:true});
  assert.equal(f.peer.relayBinaryOnly,true);
  const until=async predicate=>{const deadline=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<deadline,'real preparation Worker timeout');await new Promise(r=>setTimeout(r,5));}};
  for(const seq of [1,3,7]){
    const value=f.state(seq);f.host.binary(f.bytes(value));
    await until(()=>!f.gateway.snapshotPreparer.active&&!f.gateway.snapshotPreparer.latest&&!f.gateway.snapshotPreparer.scheduled);
    assert.equal(f.peer.readyState,1);assert.deepEqual(f.receive().data,value);
  }
  assert.equal(f.room.relayDecode.metadataFrames,3);assert.equal(f.room.relayDecode.fullFrames,0);
  assert.equal(f.peer.sentStates,3);assert.equal(f.peer.consumption.consumed,3);
  assert.ok(f.gateway.snapshotPreparer.diagnostics().accepted>=3);
  // Receipt/worker credits are still genuine; optimization does not clear debt.
  assert.equal(f.peer.consumption.pending.size,0);
});
test('synchronous Steam fallback receives full graph and refuses a metadata-only descriptor',async t=>{
  const f=await fixture(t,{oldGuest:true});const value=f.state(1);f.host.binary(f.bytes(value));
  assert.deepEqual(f.receive().data,value);assert.equal(f.room.relayDecode.fullFrames,1);assert.equal(f.room.relayDecode.metadataFrames,0);
  assert.equal(f.peer.relayBinaryOnly,false);
  f.peer.sendSnapshot({state:{...value,frame:{tick:2}},bytes:f.bytes(value),metadataOnly:true});
  assert.equal(f.peer.readyState,3);assert.equal(f.peer.sentStates,1);
});

for (const oldGuest of [false, true]) test('direct authority I/O uses real Steam preparation Worker and '+(oldGuest?'legacy':'binary')+' guest without host renderer forwarding', async t => {
  const {AuthorityIoBridge} = await import('../src/network/AuthorityIoBridge.mjs');
  const f=await fixture(t,{production:true,oldGuest}),received=[];
  const port={onmessage:null,start(){},postMessage:m=>received.push(m),close(){}};
  const bridge=new AuthorityIoBridge({buffered:()=>0,send:data=>typeof data==='string'?f.host.message(JSON.parse(data)):f.host.binary(data)});
  t.after(()=>bridge.close());bridge.attach(port,f.room.match.id,1);
  const original=f.host.send.bind(f.host);f.host.send=text=>{if(!bridge.observe(text))original(text);};
  bridge.observe(JSON.stringify({type:'launch',matchId:f.room.match.id}));
  const until=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Steam direct Worker timeout');};
  for(let tick=1;tick<=3;tick++) {
    const before=f.peer.sentStates, frame=f.state(tick), binary=encodeProjectedBinaryFrame(frame.frame).buffer;
    port.onmessage({data:{type:'snapshot',tick,binary,bytes:binary.byteLength}});
    await until(()=>f.peer.sentStates>before);assert.deepEqual(f.receive().data,frame);
    if(tick===1){
      for(const [i,send] of [[0,m=>f.host.message(m)],[1,m=>f.guest(m)]])send({type:'sync-ready',matchId:f.room.match.id,syncId:f.room.peers[i].sync.id,tick});
      assert.ok(f.room.peers.every(p=>p.loaded));
      f.guest({type:'input',matchId:f.room.match.id,syncId:f.room.peers[1].sync.id,input:{seq:1,keys:0,aim:[10,20],firing:false,pointerActive:true,actions:[]}});
      assert.ok(received.some(m=>m.type==='input'&&m.seat===1&&m.input.seq===1));
    }
  }
  assert.equal(received.filter(m=>m.type==='io-snapshot'&&m.delivery==='sent').length,3);
  assert.equal(f.peer.lastSnapshot.format,oldGuest?'delta':'binary-delta');
  assert.equal(f.peer.consumption.pending.size,0);
  assert.ok(f.gateway.snapshotPreparer.diagnostics().accepted>=3);
});
