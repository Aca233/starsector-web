import {decodeMotionWireEnvelope} from '../server/MotionWire.mjs';
import {isSnapshotChunk,SnapshotChunkReceiver} from '../server/SnapshotChunkCodec.mjs';
import {randomBytes} from 'node:crypto';
import {LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';
import {encodeBinaryState,decodeBinaryState,encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtemp, writeFile, unlink, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, transform } from 'esbuild';
import ts from 'typescript';
import vm from 'node:vm';
import WebSocket from 'ws';
import { DesktopLanBridge } from '../server/desktop-lan-bridge.mjs';
import { LanControlLanes } from '../server/LanControlLane.mjs';
import { createLanServer } from '../server/lan-server.mjs';
import { encodeMotionFrame, decodeMotionFrame, motionFromText, motionToText, MOTION_MAX_BYTES } from '../src/network/MotionFrame.mjs';
import { MotionDeliveryWindow } from '../server/MotionDeliveryWindow.mjs';
import { RealtimeSendGate } from '../src/network/RealtimeSendPolicy.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
const sample = (tick=1) => ({tick,time:tick/60,acknowledged:{0:tick,1:tick},ships:[['a',1.23456789012345,-0,2,3,Math.PI,-.125,0,0],['b',9,8,7,6,5,4,0,0]]});
const data = tick => motionToText(encodeMotionFrame(sample(tick)));
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function until(fn, name) { for(let i=0;i<300;i++){const r=fn();if(r)return r;await wait(10);}throw Error('Timed out: '+name); }
async function socket(t, origin, route='/lan/ws') {
  const ws=new WebSocket(origin.replace('http:','ws:')+route,{origin,perMessageDeflate:false}); ws.rows=[];
  ws.on('error',()=>{}); ws.on('message',(raw,binary)=>{if(!binary)ws.rows.push(JSON.parse(raw));}); t.after(()=>ws.terminate());
  await once(ws,'open');return ws;
}
async function roomFixture(t, players=2, {bridged=false, motionEnabled=true, chunks=false}={}) {
  const dist=await mkdtemp(path.join(tmpdir(),'layered-sync-'));await writeFile(path.join(dist,'lan-build.json'),'{"build":"layer-test"}');
  const app=await createLanServer({host:'127.0.0.1',port:0,dist});const origin='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await app.close();await unlink(path.join(dist,'lan-build.json'));await rmdir(dist);});
  const clients=[];
  for(let i=0;i<players;i++){
    let localOrigin;
    if(bridged){
      // Each simulated desktop owns its own helper, just like separate installs.
      // Do not raise the production four-local-tab security/admission limit.
      const local=await createLanServer({host:'127.0.0.1',port:0,dist});localOrigin='http://127.0.0.1:'+local.server.address().port;
      const bridge=new DesktopLanBridge(local.server.address().port);
      local.server.removeAllListeners('upgrade');local.server.on('upgrade',(req,sock,head)=>{try{bridge.upgrade(req,sock,head);}catch{sock.destroy();}});
      t.after(async()=>{bridge.close();await local.close();});
    }
    const ws=await socket(t,bridged?localOrigin:origin,bridged?'/desktop/lan/ws?target='+encodeURIComponent(origin):'/lan/ws');ws.send(JSON.stringify({type:'hello',name:'test',instance:'test',build:'layer-test',protocol:protocol.version,stateCredits:1,...(chunks?{binaryDelta:1,motionReference:1}:{}),motionState:motionEnabled?1:0,controlLane:1}));
    const welcome=await until(()=>ws.rows.find(r=>r.type==='welcome'),'welcome');assert.equal(welcome.motionState,motionEnabled?1:undefined);
    const control=bridged?ws:await socket(t,origin,'/lan/control-ws?token='+welcome.controlLane.token);if(!bridged)await until(()=>control.rows.some(r=>r.type==='control-lane-ready'),'lane');
    clients.push({ws,control,welcome,origin:bridged?localOrigin:origin,route:bridged?'/desktop/lan/ws?target='+encodeURIComponent(origin):'/lan/ws'});
    if(i===0){ws.send('{"type":"create","password":""}');await until(()=>app.rooms.size,'room');ws.send(JSON.stringify({type:'capacity',capacity:players}));await until(()=>[...app.rooms.values()][0].capacity===players,'capacity');}
    else {ws.send(JSON.stringify({type:'join',code:[...app.rooms.values()][0].code}));await until(()=>[...app.rooms.values()][0].peers.length===i+1,'join');}
  }
  await until(()=>[...app.rooms.values()][0].peers.every(p=>p.controlLane?.socket),'all control lanes');
  for(const c of clients.slice(1))c.ws.send('{"type":"ready","ready":true}');
  const room=[...app.rooms.values()][0];await until(()=>room.peers.slice(1).every(p=>p.ready),'ready');
  clients[0].ws.send('{"type":"start"}');await until(()=>room.status==='loading','start');
  for(const c of clients)c.ws.send(JSON.stringify({type:'loaded',matchId:room.match.id}));await until(()=>room.status==='running','running');
  const state=tick=>({type:'state',matchId:room.match.id,seq:tick,frame:{tick,acknowledged:{0:0,1:0},ships:room.peers.map((p,i)=>({id:i===0?'a':i===1?'b':'c'+i,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{combatTime:tick/60}}});
  clients[0].ws.send(JSON.stringify(state(1)));await until(()=>clients[1].ws.rows.some(r=>r.type==='state'),'baseline');
  for(let i=0;i<clients.length;i++)clients[i].control.send(JSON.stringify({type:'sync-ready',matchId:room.match.id,syncId:room.peers[i].sync.id,tick:1}));
  await until(()=>room.peers.every(p=>p.loaded),'loaded');
  const motion=(tick,client=clients[0])=>client.ws.send(JSON.stringify({type:'motion',matchId:room.match.id,data:data(tick)}));
  return {app,room,clients,state,motion};
}

test('standalone critical state preserves float64, negative zero, UTF8 and execution ACKs exactly',()=>{
 const s=sample(),decoded=motionFromText(motionToText(encodeMotionFrame(s)));
 assert.deepEqual(decoded.ships,s.ships);assert.ok(Object.is(decoded.ships[0][2],-0));assert.deepEqual({...decoded.acknowledged},s.acknowledged);assert.equal(decoded.tick,s.tick);
 s.ships[0][0]='驱逐舰';assert.equal(decodeMotionFrame(encodeMotionFrame(s)).ships[0][0],'驱逐舰');
});
test('motion parser rejects truncated/oversized/unknown/trailing data and forged flags/IDs',()=>{
 const b=encodeMotionFrame(sample());for(let i=0;i<b.length;i++)assert.throws(()=>decodeMotionFrame(b.subarray(0,i)));
 assert.throws(()=>decodeMotionFrame(new Uint8Array(MOTION_MAX_BYTES+1)));assert.throws(()=>decodeMotionFrame(new Uint8Array([...b,0])));
 for(const mutate of [s=>s.tick=NaN,s=>s.ships[0][3]=Infinity,s=>s.ships[0][8]=4,s=>s.ships[1][0]='a',s=>s.acknowledged[10]=1,s=>s.ships[0][0]='\ud800']){const s=sample();mutate(s);assert.throws(()=>encodeMotionFrame(s));}
 for(const s of ['!!!!','AAAA=','A'.repeat(20000),'AAAA'])assert.throws(()=>motionFromText(s));
});
test('critical credit is bounded, exact, epoch-resettable and never stores payloads',()=>{
 let now=0;const w=new MotionDeliveryWindow({now:()=>now});assert.ok(w.reserve(1,2000));assert.ok(w.reserve(2,2000));assert.equal(w.reserve(3,2000),false);assert.equal(w.ack(9),false);
 now=60;assert.ok(w.ack(2));assert.equal(w.bytes,0);assert.equal(w.acked,2);assert.equal(w.capacity,2,'application ACK must not inflate idle RTT ceiling');w.recordNetworkRtt(60);assert.equal(w.capacity,6);assert.equal(w.ack(2),false);assert.ok(w.active);assert.equal(w.detailIntervalMs,200);
 for(let i=3;i<40;i++)w.reserve(i,4000);assert.ok(w.bytes<=32768);assert.ok(w.pending.size<=16);
 now=1000;assert.equal(w.active,false);assert.equal(w.detailIntervalMs,0);w.reset();assert.equal(w.ack(3),false);assert.equal(w.lastSeq,-1);
});
test('all publication orders admit only one input, motion and bulk state per bounded batch',()=>{
 for(const order of [['Input','Motion','Snapshot'],['Input','Snapshot','Motion'],['Snapshot','Motion','Input'],['Snapshot','Input','Motion'],['Motion','Input','Snapshot'],['Motion','Snapshot','Input']]){
  const g=new RealtimeSendGate();for(let i=0;i<3;i++){const k=order[i];assert.ok(g['canSend'+k](i?4000:0,100+i));g[k[0].toLowerCase()+k.slice(1)+'Sent'](100+i);}
  for(const k of order)assert.equal(g['canSend'+k](4000,104),false);
  assert.equal(g.canSendMotion(4000,150),false);assert.ok(g.canSendInput(0,200));
 }
});

test('critical replica never rewinds newer authority, mutates world state, or extrapolates indefinitely',async()=>{
 const result=await build({stdin:{contents:"export {MotionReplica,motionAuthority} from './src/network/MotionReplica';export {shipPresentationPose} from './src/engine/visual/ShipPresentation';export {Vector2} from './src/engine/math/Vector2';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
 const {MotionReplica,motionAuthority,shipPresentationPose,Vector2}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const ship={id:'a',pos:new Vector2(0,0),vel:new Vector2(),facingRad:0,angularVelRad:0,teleportSequence:0,spec:{collisionRadius:20},isDead:false,isRetreated:false};const engine={allCapitalShips:[ship]},r=new MotionReplica();
 const f=sample(10);assert.ok(r.receive(f,100,9));r.render(engine,120,9);assert.ok(shipPresentationPose(ship));assert.equal(ship.pos.x,0);assert.equal(r.tick,10);assert.equal(r.receive(sample(9),130,9),false);
 r.render(engine,220,9);const x=shipPresentationPose(ship).pos.x;r.render(engine,320,9);assert.equal(shipPresentationPose(ship).pos.x,x,'extrapolation stops at 100ms');r.render(engine,351,9);assert.equal(shipPresentationPose(ship),undefined);
 const f2=sample(11);f2.ships[0][1]=999;f2.ships[0][7]=1;assert.ok(r.receive(f2,400,9));r.render(engine,410,9);assert.equal(shipPresentationPose(ship).pos.x,999,'teleport snaps');
 const authority=motionAuthority(ship,f2.ships[0]);assert.equal(authority.pos.x,999);assert.equal(ship.pos.x,0);r.render(engine,420,12);assert.equal(shipPresentationPose(ship),undefined,'newer full world wins');r.clear();assert.equal(r.tick,-1);
});
test('worker motion publication is independent from the occupied heavy snapshot credit and bounds its mailbox',async()=>{
 const source=await readFile('src/network/host.worker.ts','utf8');const ast=ts.createSourceFile('worker.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const fn=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='motionSnapshot');
 const code=(await transform(fn.getText(ast),{loader:'ts'})).code;const c={pollIoCompletion(){},directIo:null,directReady:false,motionEnabled:true,engine:{},motionInFlight:null,tick:5,lastMotionTick:0,snapshotInFlight:1,controls:new Map([[0,{acknowledged:3}]]),captureMotion:()=>data(5),sent:[],send:m=>c.sent.push(m)};vm.createContext(c);vm.runInContext(code,c);c.motionSnapshot();assert.equal(c.sent.length,1);assert.equal(c.motionInFlight,5);c.tick=6;c.motionSnapshot();assert.equal(c.sent.length,1);c.motionInFlight=null;c.motionSnapshot();assert.equal(c.sent.length,2);assert.equal(c.snapshotInFlight,1);
 assert.match(source,/if \(m.tick === motionInFlight\) motionInFlight = null/);
});

for(const players of [3,4,5])test(players+' players: authority critical state and input execution receipt bypass stopped bulk readers',async t=>{
 const {room,clients,motion}=await roomFixture(t,players);
 for(const c of clients.slice(1))c.ws._socket.pause();for(const p of room.peers.slice(1))for(let i=0;i<8;i++)p.ws.send(Buffer.alloc(1024*1024));
 motion(2);for(let i=1;i<clients.length;i++){
  const m=await until(()=>clients[i].control.rows.find(m=>m.type==='motion'),'fast state');assert.equal(m.syncId,room.peers[i].sync.id);assert.equal(motionFromText(m.data).tick,2);assert.ok(room.peers[i].ws.bufferedAmount>0);
  clients[i].control.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:m.syncId,tick:999}));await wait(5);assert.equal(room.peers[i].motionWindow.acked,0);
  clients[i].control.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:m.syncId,tick:2}));
 }
 await until(()=>room.peers.slice(1).every(p=>p.motionWindow.acked===1),'consumed');
 for(const c of clients.slice(1))c.ws.terminate();
});
test('only the authority can publish; detail pacing requires a consumed lane and resets on resync',async t=>{
 const {room,clients,motion,state}=await roomFixture(t),guest=clients[1],p=room.peers[1];
 motion(2,guest);await until(()=>guest.ws.rows.some(m=>m.type==='error'),'forged authority');assert.equal(p.motionWindow.sent,0);
 motion(2);const m=await until(()=>guest.control.rows.find(m=>m.type==='motion'),'motion');guest.control.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:m.syncId,tick:2}));await until(()=>p.motionWindow.active,'active');
 clients[0].ws.send(JSON.stringify(state(2)));await wait(25);assert.ok(p.detailSkipped>0);assert.equal(p.motionWindow.detailIntervalMs,200);
 guest.ws.send(JSON.stringify({type:'resync',matchId:room.match.id}));await until(()=>!p.loaded,'resync');assert.equal(p.motionWindow.active,false);assert.equal(p.motionWindow.ack(2),false);
 guest.control.terminate();assert.equal(p.motionWindow.detailIntervalMs,0);
});


test('desktop bridge forwards critical state and consumption ACK; lane loss restores bulk without reconnect',async t=>{
 const {room,clients,motion,state}=await roomFixture(t,3,{bridged:true});
 motion(2);
 for(let i=1;i<clients.length;i++){
  const c=clients[i],p=room.peers[i],m=await until(()=>c.ws.rows.find(r=>r.type==='motion'),'bridged motion');
  c.ws.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:m.syncId,tick:2}));
  await until(()=>p.motionWindow.active,'bridged ACK');assert.ok(p.controlLane.received>0);assert.match(p.controlLane.socket.extensions,/permessage-deflate/);
 }
 const p=room.peers[1];p.controlLane.socket.terminate();await until(()=>!p.controlLane.socket,'closed lane');
 clients[0].ws.send(JSON.stringify(state(2)));await until(()=>clients[1].ws.rows.some(r=>r.type==='state'&&r.seq===2),'unpaced fallback');
 assert.equal(clients[1].ws.readyState,WebSocket.OPEN);
});
test('legacy peers keep complete state cadence with no fast-state capability',async t=>{
 const {room,clients,state}=await roomFixture(t,2,{motionEnabled:false});
 assert.equal(room.peers[1].motionWindow,null);clients[0].ws.send(JSON.stringify(state(2)));
 await until(()=>clients[1].ws.rows.some(r=>r.type==='state'&&r.seq===2),'legacy state');assert.equal(room.peers[1].detailSkipped,0);
});
test('a busy fast socket keeps detail pacing but never accepts another critical payload',async()=>{
 const lanes=new LanControlLanes(),primary={},p={ws:primary};p.controlLane={primary,socket:{readyState:WebSocket.OPEN,bufferedAmount:1,send(){assert.fail('must not queue');}}};
 assert.ok(lanes.motionActive(p));assert.equal(lanes.motionWritable(p),false);assert.equal(lanes.sendMotion(p,{type:'motion',data:data(2)}),false);
 p.controlLane.socket.readyState=WebSocket.CLOSED;assert.equal(lanes.motionActive(p),false);await lanes.close();
});
test('critical publisher has an independent bounded rate budget, never an unlimited authority bypass',async t=>{
 const {room,clients,motion}=await roomFixture(t);const host=room.peers[0];host.window=Date.now();host.count=159;
 motion(2);await until(()=>room.lastMotionTick===2,'independent critical budget');assert.equal(host.count,159);
 const closed=once(clients[0].ws,'close');host.motionUploadAt=Date.now();host.motionUploadCount=80;motion(3);
 assert.equal((await closed)[0],1008);
});
test('wrong sync, old match and hidden clients cannot grant critical delivery credits',async t=>{
 const {room,clients,motion}=await roomFixture(t);motion(2);const p=room.peers[1],c=clients[1],m=await until(()=>c.control.rows.find(r=>r.type==='motion'),'critical');
 for(const bad of [{matchId:'old',syncId:m.syncId},{matchId:room.match.id,syncId:'old'}])c.control.send(JSON.stringify({type:'motion-consumed',tick:2,...bad}));
 await wait(25);assert.equal(p.motionWindow.acked,0);
 c.ws.send(JSON.stringify({type:'visibility',hidden:true,matchId:room.match.id}));
 // The actual visibility message is validated by the production handler.
 await until(()=>p.background,'hidden');assert.equal(p.motionWindow.active,false);assert.equal(p.motionWindow.ack(2),false);
 motion(3);await wait(25);assert.equal(p.motionWindow.sent,0);
});

test('ongoing critical offers under ACK congestion never reopen the heavy-state floodgate',()=>{
 let now=0;const w=new MotionDeliveryWindow({now:()=>now});w.recordNetworkRtt(60);w.reserve(1,2000);now=70;w.ack(1);
 w.reserve(2,2000);now=800;w.offer(3);assert.equal(w.fresh,false);assert.ok(w.active);assert.equal(w.detailIntervalMs,500);
 now=1100;assert.equal(w.active,false);assert.equal(w.detailIntervalMs,0,'unsupported/stopped producer falls back');
});

test('unfinished layered rewrite stays opt-in in release/client builds',async()=>{
 for(const [env,expected] of [[{},false],[{VITE_LAN_LAYERED_SYNC:'false'},false],[{VITE_LAN_LAYERED_SYNC:'true'},true]]){
  const r=await build({stdin:{contents:"export {LAN_LAYERED_SYNC_ENABLED} from './src/network/protocol';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',define:{__LAN_BUILD_ID__:'"gate-test"','import.meta.env':JSON.stringify(env)}});
  const m=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));assert.equal(m.LAN_LAYERED_SYNC_ENABLED,expected);
 }
});

test('negotiated desktop bulk chunks restore exact delta state; transport receipt is not renderer consumption',async t=>{
 const {room,clients,state,motion}=await roomFixture(t,2,{bridged:true,chunks:true});const peer=room.peers[1],guest=clients[1],decoder=new LanDeltaReceiver({motionReference:true}),received=[];
 assert.equal(guest.welcome.bulkChunks,1);assert.equal(guest.welcome.binaryDelta,1);
 guest.ws.on('message',(raw,binary)=>{if(binary)received.push(decodeBinaryState(decoder.decode(raw)));});
 const send=tick=>{const m=state(tick);m.frame.world.ballast=randomBytes(80000).toString('base64');clients[0].ws.send(Buffer.from(encodeBinaryState(room.match.id,tick,encodeProjectedBinaryFrame(m.frame))));return m;};
 guest.control.send(JSON.stringify({type:'state-consumed',matchId:room.match.id,seq:1}));await until(()=>peer.stateCredits.stats().inflight===0,'baseline renderer consumption');
 motion(2);await until(()=>guest.ws.rows.some(m=>m.type==='motion'),'initial motion');guest.control.send(JSON.stringify({type:'motion-consumed',tick:2,matchId:room.match.id,syncId:peer.sync.id}));await until(()=>peer.motionWindow.active,'critical active');await wait(210);motion(3);await until(()=>peer.motionWindow.lastSeq===3,'fresh critical offer');guest.control.send(JSON.stringify({type:'motion-consumed',tick:3,matchId:room.match.id,syncId:peer.sync.id}));await until(()=>!peer.motionWindow.pending.has(3),'critical consumption');
 const baselineConsumed=peer.stateCredits.stats().acked;const first=send(2);
 await until(()=>received.length===1,'complete chunked frame');assert.deepEqual(received[0],first);await until(()=>room.bulkScheduler?.stats().completed===1,'chunk receipts');
 assert.equal(peer.stateCredits.stats().acked,baselineConsumed);assert.equal(peer.stateCredits.stats().inflight,1);assert.equal(peer.lanDelta.stats().baseSeq,2);
 assert.ok(room.bulkScheduler.stats().packets>1);assert.equal(room.bulkScheduler.stats().flightBytes,0);
 guest.control.send(JSON.stringify({type:'state-consumed',matchId:room.match.id,seq:2}));await until(()=>peer.stateCredits.stats().acked===baselineConsumed+1,'renderer consumption');
 // Loss of the optional control route must not strand chunk credit or alter its baseline.
 await wait(210);motion(4);await until(()=>peer.motionWindow.lastSeq===4,'next critical offer');guest.control.send(JSON.stringify({type:'motion-consumed',tick:4,matchId:room.match.id,syncId:peer.sync.id}));await until(()=>!peer.motionWindow.pending.has(4),'next critical consumption');
 peer.controlLane.socket.on('message',raw=>{if(JSON.parse(raw).type==='bulk-ack')peer.controlLane?.socket?.terminate();});const second=send(3);
 await until(()=>!peer.controlLane?.socket,'side lane lost mid-frame');
 guest.ws.send(JSON.stringify({type:'ping',sent:333}));await until(()=>guest.ws.rows.some(r=>r.type==='pong'&&r.sent===333),'primary fallback controls');
 await until(()=>received.length===2,'primary fallback chunk receipts');assert.deepEqual(received[1],second);assert.equal(guest.ws.readyState,WebSocket.OPEN);
 await until(()=>room.bulkScheduler.stats().completed===2,'fallback completion');assert.equal(peer.lanDelta.stats().baseSeq,3);
});
test('bulk transport capability remains off for ordinary and non-layered desktop clients',async t=>{
 const {clients,room}=await roomFixture(t,2,{bridged:true,chunks:true,motionEnabled:false});
 for(const c of clients)assert.equal(c.welcome.bulkChunks,undefined);assert.ok(room.peers.every(p=>!p.bulkChunks));
});
// Hold the real first WS write callback, not a fabricated ACK, so lifecycle can
// race an actually delivered partial frame without relying on machine timing.
async function partialChunkFixture(t,{pauseReceipts=false}={}){
 const fixture=await roomFixture(t,2,{bridged:true,chunks:true}),{room,clients,state,motion}=fixture;
 const peer=room.peers[1],guest=clients[1],received=[];let resumeWrite,oldReceipt;
 guest.ws.on('message',(_b,binary)=>{if(binary)received.push(_b);});
 guest.control.send(JSON.stringify({type:'state-consumed',matchId:room.match.id,seq:1}));await until(()=>!peer.stateCredits.stats().inflight,'baseline consumed');await wait(210);
 motion(2);await until(()=>peer.motionWindow.lastSeq===2,'motion sent');guest.control.send(JSON.stringify({type:'motion-consumed',tick:2,matchId:room.match.id,syncId:peer.sync.id}));await until(()=>peer.motionWindow.active,'motion consumed');
 if(pauseReceipts)peer.controlLane.socket.pause();
 const original=peer.ws.send;peer.ws.send=function(bytes,options,done){
  if(isSnapshotChunk(bytes)&&!resumeWrite){oldReceipt=new SnapshotChunkReceiver().receive(bytes).receipt;return original.call(this,bytes,options,error=>{resumeWrite=()=>done(error);});}
  return original.call(this,bytes,options,done);
 };
 t.after(()=>{peer.ws.send=original;resumeWrite?.();});
 const send=seq=>{const m=state(seq);m.frame.world.ballast=randomBytes(80000).toString('base64');clients[0].ws.send(Buffer.from(encodeBinaryState(room.match.id,seq,encodeProjectedBinaryFrame(m.frame))));return m;};
 const expected=send(2);await until(()=>resumeWrite&&room.bulkScheduler?.stats().packets===1&&(pauseReceipts||room.bulkScheduler.stats().receipts===1),'first real fragment write/receipt');
 assert.equal(received.length,0);assert.equal(room.bulkScheduler.stats().completed,0);
 return {...fixture,peer,guest,received,send,expected,oldReceipt,release(){peer.ws.send=original;resumeWrite();}};
}
for(const terminal of ['end','leave'])test('partial chunk job cannot forward a late world after '+terminal,async t=>{
 const {room,clients,guest,received,release}=await partialChunkFixture(t),scheduler=room.bulkScheduler;
 const event=terminal==='end'?'ended':'left';(terminal==='end'?clients[0]:guest).ws.send(JSON.stringify({type:terminal,matchId:room.match.id}));
 await until(()=>guest.ws.rows.some(m=>m.type===event),'terminal delivered');assert.equal(scheduler.stats().jobs,0);
 release();await until(()=>scheduler.stats().ownedJobs===0,'send ownership released');await wait(30);assert.equal(received.length,0);assert.equal(scheduler.stats().completed,0);
});
test('resync during partial transport abandons old world, restores a fresh binary baseline and isolates old receipts',async t=>{
 const {room,peer,guest,received,send,release}=await partialChunkFixture(t),oldSync=peer.sync.id;
 guest.ws.send(JSON.stringify({type:'resync',matchId:room.match.id}));await until(()=>peer.sync.id!==oldSync&&guest.ws.rows.some(m=>m.type==='launch'&&m.syncId===peer.sync.id),'new sync epoch');
 assert.equal(room.bulkScheduler.stats().jobs,0);release();await until(()=>room.bulkScheduler.stats().ownedJobs===0,'old allocation released');
 assert.equal(received.length,0);const expected=send(3);await until(()=>received.length===1,'replacement full baseline');
 assert.deepEqual(decodeBinaryState(new LanDeltaReceiver({motionReference:true}).decode(received[0])),expected);
 await until(()=>room.bulkScheduler.stats().completed===1,'fresh completion');assert.equal(peer.stateCredits.stats().inflight,1,'transport did not manufacture renderer consumption');
});
test('negotiated helper without consumed critical motion uses the original complete path',async t=>{
 const {room,clients,state}=await roomFixture(t,2,{bridged:true,chunks:true}),peer=room.peers[1],guest=clients[1],received=[];
 guest.ws.on('message',(b,binary)=>{if(binary)received.push(b);});guest.ws.send(JSON.stringify({type:'state-consumed',matchId:room.match.id,seq:1}));await until(()=>!peer.stateCredits.stats().inflight,'baseline credit');
 const m=state(2);m.frame.world.ballast=randomBytes(50000).toString('base64');clients[0].ws.send(Buffer.from(encodeBinaryState(room.match.id,2,encodeProjectedBinaryFrame(m.frame))));
 await until(()=>received.length===1,'ordinary full path');assert.equal(room.bulkScheduler,null);assert.equal(isSnapshotChunk(received[0]),false);
 assert.deepEqual(decodeBinaryState(new LanDeltaReceiver({motionReference:true}).decode(received[0])),m);
});
for(const players of [3,4,5])test(`${players} real desktop clients share one bounded chunk scheduler and independently consume exact worlds`,async t=>{
 const {room,clients,state,motion}=await roomFixture(t,players,{bridged:true,chunks:true}),received=clients.map(()=>[]);
 for(let i=1;i<players;i++){clients[i].ws.on('message',(b,binary)=>{if(binary)received[i].push(b);});clients[i].control.send(JSON.stringify({type:'state-consumed',matchId:room.match.id,seq:1}));}
 await until(()=>room.peers.slice(1).every(p=>!p.stateCredits.stats().inflight),'all baseline credits');await wait(210);
 motion(2);await until(()=>room.peers.slice(1).every(p=>p.motionWindow.lastSeq===2),'all critical poses');
 for(let i=1;i<players;i++)clients[i].control.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:room.peers[i].sync.id,tick:2}));
 await until(()=>room.peers.slice(1).every(p=>p.motionWindow.active),'all consumed critical');
 const m=state(2);m.frame.world.ballast=randomBytes(80000).toString('base64');clients[0].ws.send(Buffer.from(encodeBinaryState(room.match.id,2,encodeProjectedBinaryFrame(m.frame))));
 await until(()=>received.slice(1).every(rows=>rows.length===1),'all full worlds');await until(()=>room.bulkScheduler.stats().completed===players-1,'all transport completions');
 for(let i=1;i<players;i++)assert.deepEqual(decodeBinaryState(new LanDeltaReceiver({motionReference:true}).decode(received[i][0])),m);
 const stats=room.bulkScheduler.stats();assert.ok(stats.peakFlightBytes<=stats.ceiling);assert.equal(stats.flightBytes,0);assert.equal(stats.ownedJobs,0);
 assert.ok(room.peers.slice(1).every(p=>p.stateCredits.stats().inflight===1));
 clients[0].ws.send(JSON.stringify({type:'ping',sent:404}));const pong=await until(()=>clients[0].ws.rows.find(m=>m.type==='pong'&&m.sent===404),'real exported diagnostics');
 assert.equal(pong.lanTransport.bulk.completed,players-1);assert.ok(pong.lanTransport.receivers.every(p=>p.bulkChunks));
});
test('leave retains the old receipt owner until actual transport receipts arrive outside the room',async t=>{
 const {room,peer,guest,received,release}=await partialChunkFixture(t,{pauseReceipts:true}),scheduler=room.bulkScheduler,lane=peer.controlLane.socket;
 assert.equal(scheduler.flightBytes,2048);guest.ws.send('{"type":"leave"}');await until(()=>guest.ws.rows.some(m=>m.type==='left'),'left');
 assert.equal(peer.room,null);assert.equal(scheduler.stats().retiredBytes,2048);assert.equal(scheduler.stats().receipts,0);
 release();lane.resume();await until(()=>scheduler.flightBytes===0,'old room real receipt');assert.equal(scheduler.stats().receipts,1);assert.equal(scheduler.stats().completed,0);assert.equal(scheduler.stats().abandonedBytes,0);assert.equal(received.length,0);
});
test('abrupt primary disconnect recovers room admission; resumed helper rejects old transport receipts',async t=>{
 const {room,peer,guest,oldReceipt,received,send,release}=await partialChunkFixture(t,{pauseReceipts:true}),scheduler=room.bulkScheduler;
 assert.equal(scheduler.flightBytes,2048);guest.ws.terminate();await until(()=>peer.disconnected,'primary closed');
 assert.equal(scheduler.flightBytes,0);assert.equal(scheduler.stats().abandonedBytes,2048);assert.equal(scheduler.stats().receipts,0);assert.equal(scheduler.limit,8192);release();await until(()=>scheduler.stats().ownedJobs===0,'old send allocation released');assert.equal(received.length,0);
 const fresh=await socket(t,guest.origin,guest.route);fresh.send(JSON.stringify({type:'hello',name:'test',instance:'test',build:'layer-test',protocol:protocol.version,stateCredits:1,binaryDelta:1,motionReference:1,motionState:1,controlLane:1,resumeToken:guest.welcome.resumeToken}));
 await until(()=>fresh.rows.some(m=>m.type==='welcome'&&m.resumed),'resumed');await until(()=>peer.controlLane?.socket,'fresh side lane');
 fresh.send(JSON.stringify(oldReceipt));fresh.send(JSON.stringify({type:'loaded',matchId:room.match.id}));await until(()=>peer.sync,'fresh bootstrap sync');assert.equal(peer.stateCredits.stats().acked,0);
 const frames=[];fresh.on('message',(b,binary)=>{if(binary)frames.push(b);});const expected=send(3);await until(()=>frames.length===1,'resumed world');
 assert.deepEqual(decodeBinaryState(new LanDeltaReceiver({motionReference:true}).decode(frames[0])),expected);await until(()=>scheduler.stats().completed===1,'new token completed');assert.equal(peer.stateCredits.stats().inflight,1);
});

for(const players of [3,4,5])test(`${players} real helpers negotiate exact binary motion without exposing it to the browser`,async t=>{
 const {room,clients,motion}=await roomFixture(t,players,{bridged:true});
 for(const c of clients)assert.equal(c.welcome.motionWire,1);
 for(const tick of [2,3,5]){
  motion(tick);
  for(let i=1;i<players;i++){
   const c=clients[i],m=await until(()=>c.ws.rows.find(r=>r.type==='motion'&&motionFromText(r.data).tick===tick),'decoded exact motion');
   assert.equal(m.motionWire,undefined);assert.equal(m.data,data(tick));
   c.ws.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:m.syncId,tick}));
  }
  await until(()=>room.peers.slice(1).every(p=>p.motionWindow.acked>=([2,3,5].indexOf(tick)+1)),'application-owned receipts');
 }
 for(const p of room.peers.slice(1)){const stats=p.controlLane.motionWire.stats();assert.equal(stats.full,1);assert.equal(stats.delta,2);assert.ok(stats.retainedBytes<=11000);}
});
test('late old-sync binary motion is inert after primary launch; corrupt current data closes only the optional lane',async t=>{
 const {room,clients,state,motion}=await roomFixture(t,2,{bridged:true}),p=room.peers[1],guest=clients[1];
 motion(2);await until(()=>guest.ws.rows.some(m=>m.type==='motion'),'initial full');
 guest.ws.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:p.sync.id,tick:2}));await until(()=>p.motionWindow.active,'initial consumed');
 const lane=p.controlLane.socket,send=lane.send.bind(lane);let held=null,lastBinary=null;
 lane.send=(bytes,...args)=>{if(Buffer.isBuffer(bytes)){lastBinary=Buffer.from(bytes);if(!held){held=()=>send(bytes,...args);return;}}return send(bytes,...args);};
 motion(3);await until(()=>held,'held admitted delta');const old=p.sync.id;
 guest.ws.send(JSON.stringify({type:'resync',matchId:room.match.id}));await until(()=>p.sync.id!==old&&guest.ws.rows.some(m=>m.type==='launch'&&m.syncId===p.sync.id),'new primary epoch');
 assert.equal(decodeMotionWireEnvelope(lastBinary).syncId,old);held();lane.send=send;await wait(30);assert.equal(p.controlLane.socket,lane);
 clients[0].ws.send(JSON.stringify(state(2)));await until(()=>guest.ws.rows.some(m=>m.type==='state'&&m.seq===2),'new world');
 guest.ws.send(JSON.stringify({type:'sync-ready',matchId:room.match.id,syncId:p.sync.id,tick:2}));await until(()=>p.loaded,'new sync loaded');
 lane.send=(bytes,...args)=>{if(Buffer.isBuffer(bytes))lastBinary=Buffer.from(bytes);return send(bytes,...args);};motion(4);
 await until(()=>guest.ws.rows.some(m=>m.type==='motion'&&m.syncId===p.sync.id&&motionFromText(m.data).tick===4),'new full motion');
 assert.equal(p.controlLane.motionWire.stats().full,2);assert.ok(!guest.ws.rows.some(m=>m.type==='motion'&&motionFromText(m.data).tick===3));
 const corrupt=Buffer.from(lastBinary);corrupt[0]^=1;send(corrupt,{binary:true,compress:false});
 await until(()=>!p.controlLane.socket,'helper rejected corruption');assert.equal(p.controlLane.motionWire.stats().retainedBytes,0);assert.equal(guest.ws.readyState,WebSocket.OPEN);
 clients[0].ws.send(JSON.stringify(state(3)));await until(()=>guest.ws.rows.some(m=>m.type==='state'&&m.seq===3),'complete-state fallback');
});

test('duplicate LAN launch retains the live motion delta baseline and forwards the retry',async t=>{
 const {room,clients,motion}=await roomFixture(t,2,{bridged:true}),p=room.peers[1],guest=clients[1];
 const lane=p.controlLane.socket;
 const consume=async tick=>{
  const m=await until(()=>guest.ws.rows.find(r=>r.type==='motion'&&motionFromText(r.data).tick===tick),'motion '+tick);
  assert.equal(m.data,data(tick));assert.equal(m.motionWire,undefined);
  guest.ws.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:p.sync.id,tick}));
  await until(()=>!p.motionWindow.pending.has(tick),'exact motion receipt '+tick);
 };
 motion(2);await consume(2);motion(3);await consume(3);
 assert.equal(p.controlLane.motionWire.stats().full,1);assert.equal(p.controlLane.motionWire.stats().delta,1);
 const launch={type:'launch',matchId:room.match.id,syncId:p.sync.id,minTick:p.sync.tick};
 const before=guest.ws.rows.filter(r=>r.type==='launch').length;
 for(let i=0;i<3;i++)p.ws.send(JSON.stringify(launch));
 await until(()=>guest.ws.rows.filter(r=>r.type==='launch').length===before+3,'all repeated launches forwarded');
 motion(4);await consume(4);
 assert.equal(p.controlLane.socket,lane,'valid next delta must not close the low-latency lane');
 assert.equal(p.controlLane.motionWire.stats().full,1,'no replacement full baseline was needed');
 assert.equal(p.controlLane.motionWire.stats().delta,2);
 assert.equal(p.stateCredits.stats().acked,0,'motion and duplicate launch cannot consume the full world');
 assert.equal(guest.ws.readyState,WebSocket.OPEN);
});

test('duplicate LAN launch preserves an in-progress exact bulk reassembly without granting renderer credit',async t=>{
 const {room,peer,guest,received,send,expected,release}=await partialChunkFixture(t);
 const launches=guest.ws.rows.filter(r=>r.type==='launch').length;
 peer.ws.send(JSON.stringify({type:'launch',matchId:room.match.id,syncId:peer.sync.id,minTick:peer.sync.tick}));
 await until(()=>guest.ws.rows.filter(r=>r.type==='launch').length===launches+1,'duplicate between real chunks');
 const consumed=peer.stateCredits.stats().acked;
 release();await until(()=>received.length===1,'the original full world reassembled');
 const restored=decodeBinaryState(new LanDeltaReceiver({motionReference:true}).decode(received[0]));
 assert.deepEqual(restored,expected);
 assert.equal(room.bulkScheduler.stats().completed,1);assert.equal(peer.stateCredits.stats().acked,consumed);
 assert.equal(peer.stateCredits.stats().inflight,1,'transport reassembly is not renderer consumption');
 guest.ws.send(JSON.stringify({type:'state-consumed',matchId:room.match.id,seq:2}));
 await until(()=>peer.stateCredits.stats().inflight===0,'actual renderer receipt releases the world');
 assert.equal(guest.ws.readyState,WebSocket.OPEN);assert.ok(peer.controlLane.socket);
 // Still reusable after the interrupted publication: a fresh state can pass.
 await wait(210);send(3);await until(()=>received.length===2,'next complete world');
});

for(const reset of ['new-sync','new-min-tick','invalid-min-tick','invalid-match','ended'])test('LAN launch still resets missing baselines for '+reset,async t=>{
 const {room,clients,motion}=await roomFixture(t,2,{bridged:true}),p=room.peers[1],guest=clients[1];
 motion(2);await until(()=>guest.ws.rows.some(r=>r.type==='motion'),'initial full motion');
 guest.ws.send(JSON.stringify({type:'motion-consumed',matchId:room.match.id,syncId:p.sync.id,tick:2}));
 await until(()=>p.motionWindow.active,'initial motion consumed');
 const original={type:'launch',matchId:room.match.id,syncId:p.sync.id,minTick:p.sync.tick};
 const changed={...original,...(reset==='new-sync'?{syncId:'different-sync'}:reset==='new-min-tick'?{minTick:p.sync.tick+1}:
  reset==='invalid-min-tick'?{minTick:null}:reset==='invalid-match'?{matchId:null}:{type:'ended'})};
 const before=guest.ws.rows.filter(r=>r.type==='launch').length;
 p.ws.send(JSON.stringify(changed));p.ws.send(JSON.stringify(original));
 await until(()=>guest.ws.rows.filter(r=>r.type==='launch').length===before+(reset==='ended'?1:2),'reset lifecycle forwarded');
 // Deliberately send a real valid delta from the former encoder baseline.
 // After an actual reset it must NOT be accepted as if its base still exists.
 motion(3);await until(()=>!p.controlLane.socket,'missing baseline closes optional lane');
 assert.ok(!guest.ws.rows.some(r=>r.type==='motion'&&motionFromText(r.data).tick===3));
 assert.equal(guest.ws.readyState,WebSocket.OPEN,'primary fallback remains available');
});
