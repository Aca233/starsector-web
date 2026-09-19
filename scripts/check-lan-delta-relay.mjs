import assert from 'node:assert/strict';import {test} from 'node:test';import {EventEmitter} from 'node:events';import http from 'node:http';
import{mkdtempSync,writeFileSync,unlinkSync,rmdirSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{createLanServer}from'../server/lan-server.mjs';import protocol from '../src/network/protocol.json' with {type:'json'};
import{LanDeltaReceiver,isLanDelta}from'../src/network/LanBinaryDelta.mjs';
import{encodeBinaryState,encodeProjectedBinaryFrame,decodeBinaryState}from'../src/network/BinarySnapshot.mjs';
class MemoryServer extends EventEmitter{listen(_p,_h,fn){fn();}address(){return{port:32110};}close(fn){fn();}}
class Socket extends EventEmitter{
 readyState=1;bufferedAmount=0;extensions='permessage-deflate';rows=[];packets=[];decoder=new LanDeltaReceiver();
 send(data){if(typeof data==='string'){const m=JSON.parse(data);if(m.type==='state'||m.type==='match')this.decoder.reset();this.rows.push(m);}else{const bytes=Uint8Array.from(data);this.packets.push(bytes);this.rows.push(decodeBinaryState(this.decoder.decode(bytes)));}}
 ping(){} close(){this.readyState=3;this.emit('close',1000);}terminate(){this.close();}
 receive(m){this.emit('message',Buffer.from(JSON.stringify(m)),false);}binary(m){this.emit('message',Buffer.from(m),true);}
}
test('production relay negotiates remote LAN only, uses exact ACKs, and survives skipped states/resync/JSON/large fallback/reconnect',async t=>{
 const dist=mkdtempSync(join(tmpdir(),'lan-delta-'));writeFileSync(join(dist,'lan-build.json'),JSON.stringify({build:'test'}));
 const mock=t.mock.method(http,'createServer',()=>new MemoryServer());let relay;
 try{
  relay=await createLanServer({dist,host:'127.0.0.1',port:32110});mock.mock.restore();
  const client=(options={})=>{const ws=new Socket();ws.extensions=options.extensions??'permessage-deflate';relay.acceptTransport(ws,options.transport??null);ws.receive({type:'hello',name:'test',instance:'test',protocol:protocol.version,build:'test',stateCredits:1,binaryDelta:options.delta??1,resumeToken:options.token});assert.ok(ws.rows.some(m=>m.type==='welcome'));return ws;};
  const host=client({extensions:''});let guest=client();assert.equal(host.rows[0].binaryDelta,undefined);assert.equal(guest.rows[0].binaryDelta,1);
  host.receive({type:'create',password:''});const room=[...relay.rooms.values()][0];guest.receive({type:'join',code:room.code});guest.receive({type:'ready',ready:true});host.receive({type:'start'});
  for(const ws of [host,guest])ws.receive({type:'loaded',matchId:room.match.id});assert.equal(room.status,'running');
  let seq=0;const frame=(ballast='component-'.repeat(5000))=>({tick:seq,ships:[{id:'a',state:{teamId:0,ballast}},{id:'b',state:{teamId:1}}],crafts:[],craftSpecs:[],world:{time:seq/60}});
  const state=(options={})=>{seq++;const m={type:'state',matchId:room.match.id,seq,frame:frame(options.ballast)};if(options.json)host.receive(m);else host.binary(encodeBinaryState(m.matchId,seq,encodeProjectedBinaryFrame(m.frame)));return m;};
  const peer=()=>room.peers[1],ack=n=>guest.receive({type:'state-consumed',matchId:room.match.id,seq:n});
  const first=state();assert.ok(isLanDelta(guest.packets.at(-1)));assert.deepEqual(guest.rows.at(-1),first);assert.equal(peer().lanDelta.stats().baseSeq,null);
  ack(seq+100);assert.equal(peer().lanDelta.stats().baseSeq,null);ack(seq);assert.equal(peer().lanDelta.stats().baseSeq,seq);
  const next=state();assert.ok(guest.packets.at(-1).length<1000);assert.deepEqual(guest.rows.at(-1),next);const pending=peer().lanDelta.stats().pendingSeq;
  guest.bufferedAmount=1;state();guest.bufferedAmount=0;assert.equal(peer().lanDelta.stats().pendingSeq,pending);ack(pending);
  assert.deepEqual(guest.rows.at(-1),next);const afterSkip=state();assert.deepEqual(guest.rows.at(-1),afterSkip);
  while(peer().stateCredits.stats().inflight<peer().stateCredits.capacity)state();const before=peer().lanDelta.stats();state();assert.deepEqual(peer().lanDelta.stats(),before);
  const last=guest.rows.filter(m=>m.type==='state').at(-1);ack(last.seq);assert.ok(peer().lanDelta.stats().baseSeq>0);
  guest.receive({type:'ping',sent:12});assert.ok(guest.rows.at(-1).lanTransport.receivers[0].delta.delta>0);
  guest.receive({type:'visibility',hidden:true});guest.decoder.reset();assert.equal(peer().lanDelta.stats().retainedBytes,0);const count=guest.packets.length;state();assert.equal(guest.packets.length,count);
  guest.receive({type:'visibility',hidden:false});state();assert.equal(new DataView(guest.packets.at(-1).buffer).getUint32(4),2);ack(seq);
  state({json:true});ack(seq);assert.equal(peer().lanDelta.stats().retainedBytes,0);state();ack(seq);
  state({ballast:'x'.repeat(2*1024*1024)});ack(seq);assert.equal(isLanDelta(guest.packets.at(-1)),false);assert.equal(peer().lanDelta.stats().retainedBytes,0);state();ack(seq);
  const old=guest,token=peer().token;guest.close();guest=client({token});guest.receive({type:'loaded',matchId:room.match.id});assert.equal(peer().lanDelta.stats().retainedBytes,0);state();assert.deepEqual(guest.rows.at(-1).frame,frame());
  old.receive({type:'state-consumed',matchId:room.match.id,seq});assert.equal(peer().lanDelta.stats().baseSeq,null);ack(seq);assert.equal(peer().lanDelta.stats().baseSeq,seq);
  const legacy=client({delta:0});assert.equal(legacy.rows[0].binaryDelta,undefined);
  const steam=client({transport:{canHost:true,scope:'steam-test',identity:'test'}});assert.equal(steam.rows[0].binaryDelta,undefined);
  host.receive({type:'end',matchId:room.match.id});assert.equal(room.status,'ended');assert.ok(guest.rows.some(m=>m.type==='ended'));
 }finally{mock.mock.restore();if(relay)await relay.close();unlinkSync(join(dist,'lan-build.json'));rmdirSync(dist);}
});
