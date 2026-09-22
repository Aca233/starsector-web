import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import WebSocket from 'ws';
import { createLanServer } from '../server/lan-server.mjs';
import { DesktopLanBridge } from '../server/desktop-lan-bridge.mjs';
import { AutoMotionAdmission } from '../server/AutoMotionAdmission.mjs';
import { networkFeaturePolicy, networkHelloFeatures, networkFeatureStatus } from '../src/network/NetworkFeaturePolicy.mjs';
import { encodeMotionFrame, motionToText } from '../src/network/MotionFrame.mjs';
import { normalizeNetworkRecord } from '../desktop/network-diagnostic-record.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) { for (let i=0;i<300;i++) { const value=fn(); if(value)return value; await wait(10); } throw Error('Timed out: '+label); }
const bundles = new Map();
async function clientClass(origin, env = {}) {
  const key=JSON.stringify(env);
  if (!bundles.has(key)) {
    const output=await build({stdin:{contents:"export {LanConnection} from './src/network/protocol';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'NetworkClient',platform:'browser',logLevel:'silent',define:{__LAN_BUILD_ID__:'"activation-test"','import.meta.env':key}});
    bundles.set(key,output.outputFiles[0].text);
  }
  class OriginSocket extends WebSocket { constructor(url) { super(url,{origin,perMessageDeflate:false}); } }
  const storage=new Map(),document=new EventTarget();document.visibilityState='visible';
  const context=vm.createContext({WebSocket:OriginSocket,crypto:webcrypto,sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document,
    performance,console,EventTarget,Event,MessageEvent,Error,RangeError,URL,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Int32Array,DataView,SharedArrayBuffer,Atomics,DOMException,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,crossOriginIsolated:false});
  vm.runInContext(bundles.get(key),context);
  return context.NetworkClient.LanConnection;
}
async function fixture(t, players=3, env={}) {
  const dist=await mkdtemp(path.join(tmpdir(),'network-activation-'));
  await writeFile(path.join(dist,'lan-build.json'),' {"build":"activation-test"}');
  const app=await createLanServer({host:'127.0.0.1',port:0,dist}),origin='http://127.0.0.1:'+app.server.address().port;
  const locals=[],clients=[];
  t.after(async()=>{for(const c of clients)c.connection.close();for(const local of locals){local.bridge.close();await local.app.close();}await app.close();await unlink(path.join(dist,'lan-build.json'));await rmdir(dist);});
  for(let i=0;i<players;i++) {
    const local=await createLanServer({host:'127.0.0.1',port:0,dist}),localOrigin='http://127.0.0.1:'+local.server.address().port;
    const bridge=new DesktopLanBridge(local.server.address().port);locals.push({app:local,bridge});
    local.server.removeAllListeners('upgrade');local.server.on('upgrade',(req,socket,head)=>{try{bridge.upgrade(req,socket,head);}catch{socket.destroy();}});
    const clientOrigin=i===0?origin:localOrigin;
    const Client=await clientClass(clientOrigin,env),connection=new Client(),rows=[];
    connection.subscribe(m=>rows.push(m));clients.push({connection,rows});
    connection.connect(i===0?origin+'/lan/ws':localOrigin+'/desktop/lan/ws?target='+encodeURIComponent(origin),'test'+i);
    await until(()=>connection.ready,'real client welcome');
    if(i===0){connection.send({type:'create',password:''});await until(()=>app.rooms.size,'room');connection.send({type:'capacity',capacity:players});await until(()=>[...app.rooms.values()][0].capacity===players,'capacity');}
    else {connection.send({type:'join',code:[...app.rooms.values()][0].code});await until(()=>[...app.rooms.values()][0].peers.length===i+1,'join');}
  }
  const room=[...app.rooms.values()][0];await until(()=>room.peers.slice(1).every(p=>p.controlLane?.socket),'helper lanes');
  for(const c of clients.slice(1))c.connection.send({type:'ready',ready:true});await until(()=>room.peers.slice(1).every(p=>p.ready),'ready');
  clients[0].connection.send({type:'start'});await until(()=>room.status==='loading','start');
  for(const c of clients)c.connection.send({type:'loaded',matchId:room.match.id});await until(()=>room.status==='running','running');
  const state=tick=>({type:'state',matchId:room.match.id,seq:tick,frame:{tick,acknowledged:{},ships:room.peers.map((p,i)=>({id:'ship'+i,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{combatTime:tick/60}}});
  const motion=tick=>({type:'motion',matchId:room.match.id,data:motionToText(encodeMotionFrame({tick,time:tick/60,acknowledged:{},ships:room.peers.map((_,i)=>['ship'+i,i+tick,0,0,0,0,0,0,0])}))});
  assert.ok(clients[0].connection.send(state(1)));await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='state')),'retained world');
  for(let i=0;i<players;i++)clients[i].connection.send({type:'sync-ready',matchId:room.match.id,syncId:room.peers[i].sync.id,tick:1});
  await until(()=>room.peers.every(p=>p.loaded),'bootstrap');
  await until(()=>room.peers.slice(1).every(p=>p.stateCredits.stats().acked===1),'real client consumption');
  return {app,room,clients,state,motion};
}

test('default build requests additive motion; no experimental visual/combat/chunks and no invented Steam support',()=>{
  const policy=networkFeaturePolicy();assert.equal(policy.mode,'auto');
  const lan=networkHelloFeatures('lan',policy);assert.equal(lan.motionState,1);assert.equal(lan.motionAuto,1);assert.equal(lan.visualState,undefined);assert.equal(lan.combatState,undefined);
  assert.equal(networkHelloFeatures('steam',policy).motionState,undefined);
  const steam=networkFeatureStatus('steam',policy,{motionState:1,visualState:1,binarySnapshots:1});assert.equal(steam.motion,false);assert.equal(steam.reason,'steam-motion-not-implemented');
  assert.equal(networkHelloFeatures('lan',networkFeaturePolicy({VITE_LAN_LAYERED_SYNC:'false'})).motionState,undefined);
  const experimental=networkHelloFeatures('lan',networkFeaturePolicy({VITE_LAN_LAYERED_SYNC:'true',VITE_LAN_CRITICAL_COMBAT:'true'}));assert.equal(experimental.motionAuto,undefined);assert.equal(experimental.combatState,1);
  assert.equal(networkFeatureStatus('lan',policy,{}).reason,'server-did-not-negotiate');
});
test('admission needs real full-world receipt, counts sender age, remains bounded and never forgives credit',()=>{
  let now=0;const guard=new AutoMotionAdmission({now:()=>now});guard.resetEpoch('match');
  assert.equal(guard.allow(1),false);assert.equal(guard.consumed(999),false);
  guard.sent(1,1);now=40;assert.ok(guard.consumed(1));assert.ok(guard.allow(2));
  now=740;assert.ok(guard.allow(2));now=751;assert.equal(guard.allow(2),false);
  assert.equal(guard.stats().fallbackReason,'whole-state-stalled');guard.sent(2,100);guard.consumed(2);assert.equal(guard.allow(100),false);
  guard.resetEpoch('match');assert.equal(guard.stats().status,'fallback');guard.resetEpoch('next');assert.equal(guard.stats().status,'awaiting-world');
  guard.sent(3,3);now+=751;guard.consumed(3);assert.equal(guard.stats().fallbackReason,'whole-state-late');
  guard.resetEpoch('tick-gap');guard.sent(4,4);guard.consumed(4);assert.equal(guard.allow(50),false,'tick staleness also stops motion even with a recent ACK');
  guard.resetEpoch('third');for(let i=0;i<1000;i++)guard.sent(i,i);assert.equal(guard.stats().pending,64);
});

for(const players of [3,4,5])test(players+' real default clients negotiate and consume motion through production helper without slowing full state',async t=>{
  const {room,clients,state,motion}=await fixture(t,players);
  for(const c of clients){assert.equal(c.connection.networkFeatures.policy,'auto');assert.equal(c.connection.motionState,true);assert.equal(c.connection.visualState,false);assert.equal(c.connection.combatState,false);assert.equal(c.connection.networkFeatures.bulkChunks,false);}
  for(const p of room.peers)assert.equal(p.bulkChunks,false);
  assert.ok(clients[0].connection.send(motion(2)));
  for(let i=1;i<players;i++){
    const m=await until(()=>clients[i].rows.find(m=>m.type==='motion'),'actual motion received');
    assert.ok(clients[i].connection.send({type:'motion-consumed',matchId:room.match.id,syncId:m.syncId,tick:2}));
  }
  await until(()=>room.peers.slice(1).every(p=>p.motionWindow.acked===1),'actual motion receipts');
  // Eligible motion ordinarily installs a 200ms full-detail throttle. Auto must not.
  for(let tick=2;tick<=6;tick++){
    assert.ok(clients[0].connection.send(state(tick)));
    await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='state'&&m.seq===tick)),'unthrottled world '+tick);
    await until(()=>room.peers.slice(1).every(p=>p.stateCredits.stats().acked===tick),'world consumed '+tick);
  }
  assert.ok(room.peers.slice(1).every(p=>p.detailSkipped===0));
  assert.ok(clients.every(c=>!c.rows.some(m=>m.type==='error')));
  // Optional helper loss: primary still carries full state and consumption.
  room.peers[1].controlLane.socket.terminate();await until(()=>!room.peers[1].controlLane.socket,'lane loss');
  assert.ok(clients[0].connection.send(state(7)));await until(()=>clients[1].rows.some(m=>m.type==='state'&&m.seq===7),'primary fallback');
  assert.ok(clients[1].connection.ready);
});

test('actual opted-out client retains full state with no motion',async t=>{
  const {room,clients,state}=await fixture(t,3,{VITE_LAN_LAYERED_SYNC:'false'});
  assert.ok(room.peers.every(p=>!p.motionWindow));assert.ok(clients.every(c=>c.connection.motionState===false));
  clients[0].connection.send(state(2));await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='state'&&m.seq===2)),'old cadence');
});

test('default path stops additive traffic when full world stalls, preserves debt and sticky resync fallback',async t=>{
  const {room,clients,state,motion}=await fixture(t,3),guest=clients[1],peer=room.peers[1];
  const send=guest.connection.send.bind(guest.connection);guest.connection.send=m=>m?.type==='state-consumed'?true:send(m);
  clients[0].connection.send(state(2));await until(()=>peer.stateCredits.stats().inflight===1,'unconsumed world');
  clients[0].connection.send(motion(2));await until(()=>guest.rows.some(m=>m.type==='motion'),'initial additive state');
  const motionDebt=peer.motionWindow.pending.size;assert.equal(motionDebt,1);
  await wait(780);clients[0].connection.send(motion(200));
  await until(()=>peer.autoMotion.stats().status==='fallback','full-world safety fallback');
  assert.equal(peer.motionWindow.pending.size,motionDebt);assert.equal(peer.stateCredits.stats().inflight,1);
  assert.equal(guest.rows.filter(m=>m.type==='motion').length,1);assert.ok(!clients[0].rows.some(m=>m.type==='error'));
  guest.connection.send=send;send({type:'state-consumed',matchId:room.match.id,seq:2});
  await until(()=>peer.stateCredits.stats().inflight===0,'real outstanding receipt');
  assert.equal(peer.autoMotion.stats().status,'fallback');send({type:'resync',matchId:room.match.id});await until(()=>!peer.loaded,'resync');
  assert.equal(peer.autoMotion.stats().status,'fallback');assert.ok(clients[0].connection.send(state(3)));await until(()=>guest.rows.some(m=>m.type==='state'&&m.seq===3),'full resync still progresses');
  const welcomes=guest.rows.filter(m=>m.type==='welcome').length;guest.connection.socket.close();
  await until(()=>guest.connection.ready&&guest.rows.filter(m=>m.type==='welcome').length>welcomes,'real reconnect');
  assert.equal(room.peers[1],peer);assert.equal(peer.autoMotion.stats().status,'fallback','same-match reconnect must not reenable a congested additive stream');
});

test('diagnostics retain policy/negotiation/fallback separately without leaking tokens or payloads',()=>{
  const features=networkFeatureStatus('lan',networkFeaturePolicy(),{motionState:1,motionWire:1,controlLane:{token:'SECRET'}});
  const r=normalizeNetworkRecord({version:1,event:'sample',transport:'lan',pipelineAgeMs:0,features:{...features,token:'SECRET'},lan:{receivers:[{seat:1,motionAdmission:{mode:'auto',status:'fallback',fallbackReason:'whole-state-stalled',worldSenderAgeMs:800,pending:2,maxAgeMs:750,world:'SECRET'}}]}});
  assert.equal(r.features.policy,'auto');assert.equal(r.features.motion,true);assert.equal(r.features.visuals,false);
  assert.equal(r.lan.receivers[0].motionAdmission.fallbackReason,'whole-state-stalled');assert.ok(!JSON.stringify(r).includes('SECRET'));
});

for(const players of [3,4,5])test(players+' real LAN clients receive unchanged binary worlds via projected relay and production helpers',async t=>{
  const {room,clients,state}=await fixture(t,players);
  for(let tick=2;tick<=6;tick++){
    const value=state(tick);value.frame.world.projectiles=Array.from({length:200},(_,i)=>({id:'p'+i,x:tick+i/4,y:-i,visual:'plasma'}));
    value.frame.craftSpecs=[{id:'retained-spec',weapons:['laser']}];value.frame.ships[0].state.hull=932.25;
    const bytes=encodeProjectedBinaryFrame(value.frame);
    assert.equal(clients[0].connection.sendSnapshot(room.match.id,tick,{binary:bytes.buffer,bytes:bytes.byteLength}),'sent');
    await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='state'&&m.seq===tick)),'binary world '+tick);
    for(const c of clients.slice(1))assert.deepEqual(JSON.parse(JSON.stringify(c.rows.find(m=>m.type==='state'&&m.seq===tick))),{...value,frame:decodeBinaryFrame(bytes)});
    await until(()=>room.peers.slice(1).every(p=>p.stateCredits.stats().acked===tick),'real binary consumption '+tick);
  }
  assert.equal(room.relayDecode.metadataFrames,5);assert.equal(room.relayDecode.fullFrames,1);
  clients[1].connection.send({type:'ping',sent:123456});
  const pong=await until(()=>clients[1].rows.find(m=>m.type==='pong'&&m.sent===123456),'actual relay diagnostics');
  assert.equal(pong.snapshotPipeline.relayDecode.metadataFrames,5);assert.ok(pong.snapshotPipeline.relayDecode.lastMs>=0);
  assert.ok(clients.every(c=>!c.rows.some(m=>m.type==='error')));
});
