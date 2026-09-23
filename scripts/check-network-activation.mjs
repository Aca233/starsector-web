import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {withoutBulkProjectiles} from '../src/network/ProjectileBulkVariant.mjs';
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
import { encodeMotionFrame, motionToText, motionFromText } from '../src/network/MotionFrame.mjs';
import { normalizeNetworkRecord } from '../desktop/network-diagnostic-record.mjs';

// Single ordinary-host upload; expected values come from the production codec.
function sendBulkWorld(connection, value) {
  value.frame.world.projectiles=Array.from({length:128},(_,i)=>({id:i,pos:{$vector:[i/4,value.seq]},trail:[1,2,3]}));
  value.frame.world.beams=[{id:'retained-beam',power:3.75}];
  value.frame.world.mines=[{id:'retained-mine',armed:true}];
  value.frame.sounds=[{id:'retained-sound',time:value.seq/60}];
  const bytes=encodeProjectedBinaryFrame(value.frame,true);
  assert.equal(connection.sendSnapshot(value.matchId,value.seq,{binary:bytes.buffer,bytes:bytes.byteLength}),'sent');
  return {...value,frame:decodeBinaryFrame(bytes)};
}
const plain = value => JSON.parse(JSON.stringify(value));
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
    performance,console,atob,btoa,EventTarget,Event,MessageEvent,Error,RangeError,URL,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Int32Array,DataView,SharedArrayBuffer,Atomics,DOMException,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,crossOriginIsolated:false});
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

test('default build requests additive motion; no experimental visual/combat/chunks; Steam requires a real negotiated datagram adapter',()=>{
  const policy=networkFeaturePolicy();assert.equal(policy.mode,'auto');
  assert.equal(policy.motionReference,false);
  assert.equal(networkHelloFeatures('lan',policy).motionReference,undefined);
  assert.equal(networkHelloFeatures('lan',networkFeaturePolicy({VITE_LAN_MOTION_REFERENCE:'true'})).motionReference,1);
  assert.equal(networkHelloFeatures('lan',networkFeaturePolicy({VITE_LAN_MOTION_REFERENCE:'false'})).motionReference,undefined);
  assert.equal(networkHelloFeatures('steam',networkFeaturePolicy({VITE_LAN_MOTION_REFERENCE:'true'})).motionReference,undefined);
  const lan=networkHelloFeatures('lan',policy);assert.equal(lan.motionState,1);assert.equal(lan.motionAuto,1);assert.equal(lan.visualState,undefined);assert.equal(lan.combatState,undefined);
  assert.equal(networkHelloFeatures('steam',policy).motionState,1);
  const steam=networkFeatureStatus('steam',policy,{motionState:1,visualState:1,binarySnapshots:1});assert.equal(steam.motion,false);assert.equal(steam.reason,'server-did-not-negotiate');
  assert.equal(networkFeatureStatus('steam',policy,{motionState:1,motionTransport:'steam-datagram-v1'}).motion,true);
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
// The real LAN connection, relay, preparation Worker and both production Steam
// gateways run here; only native packet delivery is injected. No Steam account/UI.
for (const layered of [false, true]) test('production Steam ' + (layered ? 'layered components and ' : '') + 'negotiates bounded motion end-to-end without waiting behind reliable snapshots', async t => {
  const { SteamGateway } = await import('../server/steam/gateway.mjs');
  const { isSteamMotionPacket } = await import('../server/steam/motion-channel.mjs');
  const { isSteamComponentPacket } = await import('../server/steam/component-channel.mjs');
  const { encodeCombatState, decodeCombatState } = await import('../src/network/CriticalCombatState.mjs');
  const { AnchoredProjectilePublisher, AnchoredProjectileReceiver } = await import('../src/network/AnchoredProjectileVisual.mjs');
  const dist = await mkdtemp(path.join(tmpdir(),'steam-motion-activation-'));
  await writeFile(path.join(dist,'lan-build.json'),' {"build":"activation-test"}');
  const ids=['76561198000000001','76561198000000002'],lobbyId='109775240000000001';
  const incoming=[[],[]],held=[],datagrams=[],gateways=[],apps=[],clients=[];let holdReliable=false,dropComponents=false;
  const data=new Map(),lobby={getOwner:()=>BigInt(ids[0]),getMembers:()=>ids.map(BigInt),getData:k=>data.get(k),setData:(k,v)=>{data.set(k,v);return true;},setJoinable:()=>true};
  let timer;
  t.after(async()=>{clearInterval(timer);for(const c of clients)c.connection.close();for(const g of gateways){for(const p of [...g.peers.values()])p.terminate();await g.snapshotPreparer?.close();g.wss.close();}for(const a of apps)await a.close();await unlink(path.join(dist,'lan-build.json'));await rmdir(dist);});
  for(let i=0;i<2;i++){
    const client={networking:{sendP2PPacket:(remote,type,packet)=>{
      assert.equal(String(remote),ids[1-i]);assert.ok(type===1||type===2);
      if (isSteamComponentPacket(packet)) { assert.equal(type,1); assert.ok(packet.length<=1200); if(dropComponents)return true; }
      const item={steamId:BigInt(ids[i]),data:Buffer.from(packet)};
      if(isSteamMotionPacket(packet)){assert.equal(type,1);assert.ok(packet.length<=1200);datagrams.push(item);}
      if(i===0&&type===2&&holdReliable)held.push(item);else incoming[1-i].push(item);return true;
    },isP2PPacketAvailable:()=>incoming[i][0]?.data.length??0,readP2PPacket:()=>incoming[i].shift()}};
    const gateway=new SteamGateway({build:'activation-test',client,log:()=>{}});gateways.push(gateway);
    gateway.owner=ids[i];gateway.initialized=true;gateway.selected={id:lobbyId,owner:ids[0],lobby,transport:'legacy-p2p'};
    const app=await createLanServer({host:'127.0.0.1',port:0,dist,isolated:true,extension:gateway.extension});apps.push(app);gateway.relay=app;
  }
  timer=setInterval(()=>{for(const g of gateways)g.poll();},2);
  for(let i=0;i<2;i++){
    const origin='http://127.0.0.1:'+apps[i].server.address().port,Client=await clientClass(origin,layered?{VITE_LAN_LAYERED_SYNC:'true',VITE_LAN_CRITICAL_COMBAT:'true'}:{}),connection=new Client('steam'),rows=[];
    let visuals;
    connection.subscribe(m=>{
      rows.push(m);
      if(m.type==='motion')connection.send({type:'motion-consumed',matchId:m.matchId,syncId:m.syncId,tick:motionFromText(m.data).tick});
      if(m.type==='combat-state'){assert.equal(decodeCombatState(Buffer.from(m.data,'base64')).tick,m.tick);connection.send({type:'combat-consumed',matchId:m.matchId,syncId:m.syncId,tick:m.tick,status:'consumed'});}
      if(m.type==='projectile-visual') { visuals??=new AnchoredProjectileReceiver(m.matchId);const b=Uint8Array.from(m.visualBytes);if(m.kind==='baseline')visuals.baseline(m.key,b);else visuals.update(m.key,b);m.visualHandled=true; }
    });
    clients.push({connection,rows});connection.connect(origin+'/steam/ws?lobby='+lobbyId,'steam-'+i);
    await until(()=>connection.ready,'Steam hello');assert.equal(connection.motionState,true);assert.equal(connection.networkFeatures.visuals,layered);assert.equal(connection.combatState,layered);
  }
  const [host,guest]=clients;host.connection.send({type:'create'});await until(()=>apps[0].rooms.size,'Steam create');
  const room=[...apps[0].rooms.values()][0];guest.connection.send({type:'join',code:room.code});await until(()=>room.peers.length===2,'Steam join');
  guest.connection.send({type:'ready',ready:true});await until(()=>room.peers[1].ready,'Steam ready');host.connection.send({type:'start'});await until(()=>room.status==='loading','Steam loading');
  for(const c of clients)c.connection.send({type:'loaded',matchId:room.match.id});await until(()=>room.status==='running','Steam running');
  const state=tick=>({type:'state',matchId:room.match.id,seq:tick,frame:{tick,acknowledged:{},ships:room.peers.map((p,i)=>({id:'ship'+i,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{combatTime:tick/60}}});
  const motion=tick=>({type:'motion',matchId:room.match.id,data:motionToText(encodeMotionFrame({tick,time:tick/60,acknowledged:{},ships:room.peers.map((_,i)=>['ship'+i,i+tick,0,0,0,0,0,0,0])}))});
  const full1=sendBulkWorld(host.connection,state(1));
  await until(()=>guest.rows.some(m=>m.type==='state'),'Steam full baseline');
  assert.deepEqual(plain(guest.rows.find(m=>m.type==='state')),full1);
  for(let i=0;i<2;i++)clients[i].connection.send({type:'sync-ready',matchId:room.match.id,syncId:room.peers[i].sync.id,tick:1});
  await until(()=>room.peers.every(p=>p.loaded),'Steam bootstrap');
  const peer=gateways[0].peers.get(ids[1]);
  // An exact consumed baseline, not open/welcome or network arrival, enables it.
  await until(()=>peer.motion.stats().world.status==='eligible','Steam renderer baseline receipt');
  assert.ok(gateways[0].snapshotPreparer.metrics.accepted>0,'real encoding Worker carried metadata');
  holdReliable=true;const full2=sendBulkWorld(host.connection,state(2));await until(()=>held.length>0,'hold reliable state');
  host.connection.send(motion(3));await until(()=>guest.rows.some(m=>m.type==='motion'),'Steam independent motion');
  await until(()=>peer.motion.stats().consumed===1,'Steam exact motion receipt');
  assert.ok(peer.inflight.size>0,'motion receipt cannot free full snapshot credit');
  assert.equal(guest.rows.filter(m=>m.type==='state').at(-1).frame.tick,1,'reliable baseline remains stalled');
  assert.ok(datagrams.length>0);
  if(layered){
    assert.ok(host.connection.sendAuthorityComponent(room.match.id,{type:'combat-state',tick:3,data:encodeCombatState({tick:3,time:.05,ships:[]})}));
    const publisher=new AnchoredProjectilePublisher(room.match.id);
    assert.ok(host.connection.sendAuthorityComponent(room.match.id,{type:'projectile-visual',tick:3,publication:publisher.publish({tick:3,time:.05,rows:[{id:.123,specId:'test',pos:{$vector:[6,0]},vel:{$vector:[120,0]},isRocket:true,collisionDisabled:false,isDisarmed:false,missileEngineVisualSpec:{fixture:Array.from({length:19000},(_,i)=>String.fromCharCode(33+((Math.imul(i+11,1103515245)^(i*i*1664525))>>>10)%90)).join('')}}]})}));
    await until(()=>guest.rows.some(m=>m.type==='combat-state')&&guest.rows.some(m=>m.type==='projectile-visual'),'independent complete combat and visual streams');
    await until(()=>peer.components.stats().consumed===2,'actual component receipts');
    assert.ok(peer.components.stats().fragment>0,'Steam also handles compressed multi-fragment visual baselines');
    // Freeze just the visual expiry clock after real consumption. The test
    // waits for the unchanged detail cadence without timing-race TTL expiry.
    const consumedNow=room.visuals.now();room.visuals.now=()=>consumedNow;
    assert.ok(peer.inflight.size>0,'component receipts cannot free a stalled complete world');
    assert.equal(room.combatStates.stats().flightBytes,0);assert.equal(room.visuals.stats().flightBytes,0);
  }
  const count=guest.rows.filter(m=>m.type==='motion').length;
  incoming[1].push(...datagrams.map(p=>({...p,data:Buffer.from(p.data)})));await wait(25);
  assert.equal(guest.rows.filter(m=>m.type==='motion').length,count,'duplicate datagrams do not rewind or reapply');
  holdReliable=false;incoming[1].push(...held.splice(0));await until(()=>guest.rows.some(m=>m.type==='state'&&m.frame.tick===2),'Steam reliable stream continues');
  assert.deepEqual(plain(guest.rows.find(m=>m.type==='state'&&m.seq===2)),full2,'no visual credit existed when full state2 was selected');
  if(layered){
    await until(()=>peer.inflight.size===0&&performance.now()-room.peers[1].lastDetailAt>=205,'Steam consumed world and unchanged detail interval');
    const full3=sendBulkWorld(host.connection,state(3));
    const stripped=await until(()=>guest.rows.find(m=>m.type==='state'&&m.seq===3),'Steam relay-derived variant through real preparation Worker');
    assert.deepEqual(plain(stripped),{...full3,frame:withoutBulkProjectiles(full3.frame)});
    assert.equal(room.peers[1].visualBulkSent,1);
    await until(()=>peer.inflight.size===0,'Steam variant actually consumed');
  }
  guest.connection.send({type:'visibility',hidden:true});await until(()=>room.peers[1].background,'Steam hidden');
  const beforeHide=guest.rows.filter(m=>m.type==='motion').length;
  incoming[1].push(...datagrams.map(p=>({...p,data:Buffer.from(p.data)})));
  guest.connection.send({type:'visibility',hidden:false});await until(()=>!room.peers[1].background,'Steam visible');
  host.connection.send(motion(4));await wait(20);
  assert.equal(guest.rows.filter(m=>m.type==='motion').length,beforeHide,'visibility cannot reuse old world credit');
  const full4=sendBulkWorld(host.connection,state(4));await until(()=>peer.motion.stats().world.status==='eligible','Steam fresh visible baseline');
  assert.deepEqual(plain(guest.rows.find(m=>m.type==='state'&&m.seq===4)),full4,'visibility invalidates visual eligibility; complete projectiles return');
  host.connection.send(motion(5));await until(()=>guest.rows.filter(m=>m.type==='motion').length===beforeHide+1,'Steam motion resumes after real consumption');
  if(layered){
    dropComponents=true;
    assert.ok(host.connection.sendAuthorityComponent(room.match.id,{type:'combat-state',tick:6,data:encodeCombatState({tick:6,time:.1,ships:[]})}));
    await until(()=>peer.components.pending.size===1,'lost optional component');
    const preparer = gateways[0].snapshotPreparer;
    await until(()=>!preparer.active&&!preparer.latest,'preparation idle before fallback race');
    preparer.ready=false; // Hold a not-yet-sent stripped-world proposal.
    assert.ok(preparer.offer(peer, {...state(6),frame:{...state(6).frame,projectileVisuals:1}}));
    const record=preparer.owners.get(peer), epoch=record.epoch;
    peer.components.now=()=>performance.now()+501;peer.components.poll();
    await until(()=>guest.rows.some(m=>m.type==='layered-unavailable'),'loss restores complete-world route');
    assert.equal(record.epoch,epoch+1,'fallback invalidates old Worker proposals before disabling projection');
    assert.equal(preparer.latest?.peers.has(record.key)??false,false,'no queued stripped world survives fallback');
    preparer.ready=true;
    assert.equal(room.combatStates.stats().flightBytes,0,'failed transport releases debt as abandonment, not consumption');
    const full7=sendBulkWorld(host.connection,state(7));await until(()=>guest.rows.some(m=>m.type==='state'&&m.frame.tick===7),'full world survives optional failure');
    assert.deepEqual(plain(guest.rows.find(m=>m.type==='state'&&m.seq===7)),full7);
    assert.equal(room.peers[1].visualBulkSent,1,'disabled component path never selects another stripped world');
    assert.equal(peer.readyState,1);assert.equal(guest.connection.visualState,false);
  }

});

test('ordinary LAN host publishes real combat and visual components through the production helper',async t=>{
  const {encodeCombatState,decodeCombatState}=await import('../src/network/CriticalCombatState.mjs');
  const {AnchoredProjectilePublisher,AnchoredProjectileReceiver}=await import('../src/network/AnchoredProjectileVisual.mjs');
  const {room,clients}=await fixture(t,3,{VITE_LAN_LAYERED_SYNC:'true',VITE_LAN_CRITICAL_COMBAT:'true'});
  for(const c of clients.slice(1)){
    const visual=new AnchoredProjectileReceiver(room.match.id);
    c.connection.subscribe(m=>{
      if(m.type==='combat-state'){assert.equal(decodeCombatState(Buffer.from(m.data,'base64')).tick,m.tick);c.connection.send({type:'combat-consumed',matchId:m.matchId,syncId:m.syncId,tick:m.tick,status:'consumed'});}
      if(m.type==='projectile-visual'){if(m.kind==='baseline')visual.baseline(m.key,Uint8Array.from(m.visualBytes));else visual.update(m.key,Uint8Array.from(m.visualBytes));m.visualHandled=true;}
    });
  }
  assert.equal(clients[0].connection.canPublishVisual,true);assert.equal(clients[0].connection.canPublishCombat,true);
  assert.ok(clients[0].connection.sendAuthorityComponent(room.match.id,{type:'combat-state',tick:2,data:encodeCombatState({tick:2,time:2/60,ships:[]})}));
  const visual=new AnchoredProjectilePublisher(room.match.id);
  assert.ok(clients[0].connection.sendAuthorityComponent(room.match.id,{type:'projectile-visual',publication:visual.publish({tick:2,time:2/60,rows:[]})}));
  await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='combat-state')&&c.rows.some(m=>m.type==='projectile-visual')),'LAN components reached real clients');
  await until(()=>room.combatStates.stats().consumed===2&&room.visuals.stats().consumed===2,'LAN exact component retention');
  assert.equal(room.combatStates.stats().flightBytes,0);assert.equal(room.visuals.stats().flightBytes,0);
});

test('Steam component diagnostics keep bounded scalar evidence but redact identities and payloads',()=>{
  const r=normalizeNetworkRecord({version:1,event:'sample',transport:'steam',steamAgeMs:0,features:{reason:'steam-components-check-receiver'},steam:{peers:[{components:{sent:3,consumed:2,fragment:1,bytes:100,active:true,fallback:'component-loss-or-consumer-stall',connection:'secret',data:'secret'},motion:{consumed:5,superseded:2,world:{status:'eligible'}}}]}});
  assert.equal(r.steam.peers[0].components.consumed,2);assert.equal(r.steam.peers[0].motion.superseded,2);
  assert.equal(r.features.reason,'steam-components-check-receiver');assert.equal(JSON.stringify(r).includes('secret'),false);
});


test('ordinary LAN single binary upload pairs consumed-visual recipients with complete stale-recipient fallback',async t=>{
  const {AnchoredProjectilePublisher,AnchoredProjectileReceiver}=await import('../src/network/AnchoredProjectileVisual.mjs');
  const {room,clients,state}=await fixture(t,3,{VITE_LAN_LAYERED_SYNC:'true',VITE_LAN_CRITICAL_COMBAT:'true'});
  const [host,fresh,stale]=clients;
  for(const c of clients.slice(1)){
    const visual=new AnchoredProjectileReceiver(room.match.id);
    c.connection.subscribe(m=>{
      if(m.type==='projectile-visual'){
        if(m.kind==='baseline')visual.baseline(m.key,Uint8Array.from(m.visualBytes));else visual.update(m.key,Uint8Array.from(m.visualBytes));
        m.visualHandled=true;
      }
    });
  }
  const waitDetail=()=>until(()=>room.peers.slice(1).every(p=>performance.now()-p.lastDetailAt>=205),'unchanged LAN detail interval');
  await waitDetail();const full2=sendBulkWorld(host.connection,state(2));
  await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='state'&&m.seq===2)),'full binary bootstrap without any visual consumer');
  for(const c of clients.slice(1))assert.deepEqual(plain(c.rows.find(m=>m.type==='state'&&m.seq===2)),full2);
  const publisher=new AnchoredProjectilePublisher(room.match.id);
  const publish=tick=>assert.ok(host.connection.sendAuthorityComponent(room.match.id,{type:'projectile-visual',publication:publisher.publish({tick,time:tick/60,rows:[{id:1,specId:'test',pos:{$vector:[tick,0]},vel:{$vector:[60,0]},isRocket:false,collisionDisabled:false,isDisarmed:false}]})}));
  publish(3);await until(()=>room.visuals?.stats().consumed===2,'both real baseline consumers');
  let clock=room.visuals.now();room.visuals.now=()=>clock;clock+=251;
  // Delivery is NOT consumption credit. Delay one exact application receipt
  // without pretending the missing receipt was a successful consume/discard.
  const held=[],send=stale.connection.send.bind(stale.connection);
  stale.connection.send=m=>m.type==='visual-consumed'&&m.tick===4?(held.push(m),true):send(m);
  publish(4);await until(()=>room.visuals.stats().consumed===3&&held.length===1,'fresh consumption and stale outstanding receipt');
  const debt=room.visuals.stats().flightBytes;assert.ok(debt>0);
  await waitDetail();const full4=sendBulkWorld(host.connection,state(4));
  await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='state'&&m.seq===4)),'same source sequence split per recipient');
  assert.deepEqual(plain(fresh.rows.find(m=>m.type==='state'&&m.seq===4)),{...full4,frame:withoutBulkProjectiles(full4.frame)});
  assert.deepEqual(plain(stale.rows.find(m=>m.type==='state'&&m.seq===4)),full4);
  assert.equal(room.peers[1].visualBulkSent,1);assert.equal(room.peers[2].visualBulkSent??0,0);
  assert.equal(room.visuals.stats().flightBytes,debt,'world receipt cannot repay visual debt');
  stale.connection.send=send;assert.ok(send(held[0]));
  await until(()=>room.visuals.stats().flightBytes===0&&room.visuals.stats().consumed===4,'only the exact delayed visual receipt releases credit');
  clock+=251;await waitDetail();const full5=sendBulkWorld(host.connection,state(5));
  await until(()=>clients.slice(1).every(c=>c.rows.some(m=>m.type==='state'&&m.seq===5)),'expired visual consumers return to complete worlds');
  for(const c of clients.slice(1))assert.deepEqual(plain(c.rows.find(m=>m.type==='state'&&m.seq===5)),full5);
  await until(()=>room.peers.slice(1).every(p=>p.stateCredits.stats().acked===4&&p.stateCredits.stats().inflight===0),'complete fallback consumed (four worlds, sequences 1/2/4/5)');
  assert.equal(room.relayDecode.metadataFrames,3,'one host binary upload per source state');
  assert.equal(room.peers[1].visualBulkSent,1);assert.equal(room.visuals.stats().flightBytes,0);
  assert.ok(clients.every(c=>!c.rows.some(m=>m.type==='error')));
});
