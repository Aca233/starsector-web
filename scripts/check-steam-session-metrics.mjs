import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decodeP2PSessionState, bindSteamSessionReader, loadSteamSessionReader, SteamSessionMetrics } from '../server/steam/session-metrics.mjs';
import { SteamGateway } from '../server/steam/gateway.mjs';
import protocol from '../src/network/protocol.json' with { type:'json' };
import { copySteamMetricsRuntime, steamMetricsExtraResources, verifySteamMetricsRuntime } from './package-steam-metrics-runtime.mjs';
const id='76561198000000002',host='76561198000000001',nonce='a'.repeat(32);
function nativeState(){const b=Buffer.alloc(20);b[0]=1;b[2]=4;b[3]=1;b.writeInt32LE(54321,4);b.writeInt32LE(123,8);b.writeUInt32LE(0x01020304,12);b.writeUInt16LE(27015,16);b.writeUInt16LE(0xffff,18);return b;}
test('Win64 legacy layout decodes counters/flags and never returns addressing or padding',()=>{
 assert.deepEqual(decodeP2PSessionState(nativeState()),{available:true,active:true,connecting:false,errorCode:4,usingRelay:true,queuedBytes:54321,queuedPackets:123});
 const b=nativeState();b.writeInt32LE(-1,4);b.writeInt32LE(-2147483648,8);const r=decodeP2PSessionState(b);assert.equal(r.queuedBytes,null);assert.equal(r.queuedPackets,null);
 for(const input of [Buffer.alloc(19),Buffer.alloc(21),new Uint8Array(20),null])assert.throws(()=>decodeP2PSessionState(input),/buffer/);
});
test('FFI surface binds exactly two read-only exports and passes SteamID losslessly as uint64',()=>{
 const functions=[],calls=[];const self={};
 const read=bindSteamSessionReader({func(signature){functions.push(signature);return signature.startsWith('void *')?()=>self:(pointer,remote,buffer)=>{calls.push({pointer,remote,length:buffer.length});nativeState().copy(buffer);return true;};}});
 assert.equal(functions.length,2);assert.ok(functions[0].includes('SteamNetworking_v006'));assert.ok(functions[1].includes('GetP2PSessionState'));assert.ok(functions.every(s=>!/Init|Send|Close|Accept|Config/.test(s)));
 const result=read(id);assert.equal(result.queuedBytes,54321);assert.equal(calls[0].pointer,self);assert.equal(calls[0].remote,76561198000000002n);assert.equal(calls[0].length,20);
 for(const invalid of [1,id+'x','18446744073709551616','1','steam://'+id])assert.equal(read(invalid).reason,'invalid-peer');assert.equal(calls.length,1);
});
test('uninitialized interface and missing session are unavailable, not zero queue or disconnect',()=>{
 let calls=0;const read=bindSteamSessionReader({func:s=>s.startsWith('void *')?()=>null:()=>{calls++;return true;}});
 assert.deepEqual(read(id),{available:false,reason:'interface-unavailable'});assert.equal(calls,0);
 const absent=bindSteamSessionReader({func:s=>s.startsWith('void *')?()=>({}):()=>false});assert.deepEqual(absent(id),{available:false,reason:'no-session'});
});
test('sampler rate limits, bounds membership, prunes on leave and never forwards unexpected native fields',()=>{
 let calls=0;const m=new SteamSessionMetrics({read:()=>{calls++;return {...decodeP2PSessionState(nativeState()),steamId:id,remoteIP:'1.2.3.4',remotePort:27015,message:'PRIVATE'};}});
 const peers=Array.from({length:30},(_,i)=>String(76561198000000002n+BigInt(i)));
 m.sample(peers,1000);assert.equal(calls,10);assert.equal(m.cache.size,10);
 for(let now=1001;now<2000;now++)m.sample(peers,now);assert.equal(calls,10);
 assert.equal(m.get(id,1500).sampleAgeMs,500);assert.ok(!/remoteIP|remotePort|steamId|PRIVATE|1\.2\.3\.4/.test(JSON.stringify(m.get(id,1500))));
 m.sample([id],2000);assert.equal(calls,11);assert.equal(m.cache.size,1);m.forget(id);assert.equal(m.get(id,2001).reason,'not-sampled');m.clear();assert.equal(m.cache.size,0);assert.equal(m.nextSampleAt,0);
});
test('query faults, malformed counter values and exception contents are contained',()=>{
 const failed=new SteamSessionMetrics({read:()=>{throw Error('PRIVATE '+id);}});failed.sample([id],1000);assert.deepEqual(failed.get(id,1000),{available:false,reason:'query-failed',sampleAgeMs:0});
 const bad=new SteamSessionMetrics({read:()=>({available:true,errorCode:256,queuedBytes:NaN,queuedPackets:Infinity})});bad.sample([id],1000);assert.equal(bad.get(id).queuedBytes,null);assert.equal(bad.get(id).queuedPackets,null);assert.equal(bad.get(id).errorCode,null);
 const missing=new SteamSessionMetrics({read:()=>({available:false,reason:'PRIVATE '+id})});missing.sample([id],1000);assert.equal(missing.get(id).reason,'query-unavailable');
 const unavailable=new SteamSessionMetrics();unavailable.sample([id],1000);assert.equal(unavailable.get(id).available,false);assert.equal(unavailable.cache.size,0);
});
function fixture(reader){
 const packets=[],logs=[],gateway=new SteamGateway({build:'native-diagnostics-test',sessionReader:reader,log:line=>logs.push(line),client:{networking:{sendP2PPacket:(_peer,type,packet)=>{packets.push({type,packet});return true;},isP2PPacketAvailable:()=>0}}});
 gateway.owner=host;gateway.selected={id:'10977524000000001',owner:host,lobby:{getMembers:()=>[host,id],getOwner:()=>host}};gateway.relay={acceptTransport(){}};
 gateway.dispatch(id,{connection:nonce,op:'open',data:{lobby:gateway.selected.id,build:gateway.build,protocol:protocol.version}});
 return {gateway,peer:gateway.peers.get(id),packets,logs};
}
test('host gateway samples allowed peer only and queue diagnostics do not throttle or change send types',t=>{
 t.mock.method(Date,'now',()=>10000);const requests=[];const f=fixture(remote=>{requests.push(remote);return {available:true,active:true,connecting:false,errorCode:0,usingRelay:true,queuedBytes:2000000000,queuedPackets:100000};});
 f.gateway.poll();assert.deepEqual(requests,[id]);const info=f.gateway.transportStatus().peers[0];assert.equal(info.nativeSession.queuedBytes,2000000000);
 f.peer.send(JSON.stringify({type:'state',frame:{tick:1}}));assert.equal(f.peer.sentStates,1,'opaque legacy counter cannot become admission credit');assert.ok(f.packets.every(p=>p.type===2),'no reliability change');
 assert.ok(!f.logs.join('').includes(id));f.peer.close();assert.equal(f.gateway.sessionMetrics.cache.size,0);f.gateway.wss.close();
});
test('guest samples owner only; failing diagnostics cannot terminate a connection',t=>{
 t.mock.method(Date,'now',()=>10000);const requests=[];const f=fixture(remote=>{requests.push(remote);throw Error('probe failure');});
 f.gateway.owner=id;f.gateway.peers.clear();f.gateway.renderer={readyState:1,send(){},close(){throw Error('unexpected close');}};
 f.gateway.poll();assert.deepEqual(requests,[host]);assert.equal(f.gateway.transportStatus().nativeHostSession.reason,'query-failed');assert.equal(f.gateway.error,'');f.gateway.wss.close();
});
test('runtime packaging explicitly includes both Koffi JS loader and Windows x64 native addon',async()=>{
 const calls=[];await copySteamMetricsRuntime('/project','/package',async(a,b)=>calls.push([a,b]));
 assert.deepEqual(calls,[[path.join('/project','node_modules','koffi'),path.join('/package','node_modules','koffi')],[path.join('/project','node_modules','@koromix/koffi-win32-x64'),path.join('/package','node_modules','@koromix/koffi-win32-x64')]]);
 const desktop=await fs.readFile(new URL('./package-electron.mjs',import.meta.url),'utf8');const portable=await fs.readFile(new URL('./package-windows.mjs',import.meta.url),'utf8');
 assert.ok(desktop.includes('copySteamMetricsRuntime(project, backend, copy)'));assert.ok(desktop.includes('...steamMetricsExtraResources(backend)'));assert.ok(desktop.includes('await verifySteamMetricsRuntime(packagedBackend)'));assert.ok(portable.includes('copySteamMetricsRuntime(project, destination, copy)'));assert.ok(portable.includes('await verifySteamMetricsRuntime(destination)'));
});
test('actual Windows addon and Steam exports bind without initializing Steam or querying a session', {skip:process.platform!=='win32'||process.arch!=='x64'},()=>{
 const result=loadSteamSessionReader();assert.equal(typeof result.read,'function');assert.equal(result.reason,null);
 // DO NOT call result.read: there is no initialized SDK/authorized test account.
});

test('native failure callback retains bounded SDK error code without logging Steam identities',async()=>{
 const handlers=new Map(),f=fixture(()=>decodeP2PSessionState(nativeState()));
 f.gateway.client.localplayer={getSteamId:()=>BigInt(host),getName:()=>'synthetic host'};
 f.gateway.client.callback={register:(event,fn)=>{handlers.set(event,fn);return {disconnect(){}};}};
 f.gateway.initialize();
 handlers.get(7)({remote:BigInt(id),error:4});
 const failure=f.logs.map(line=>JSON.parse(line.slice('[steam-transport] '.length))).find(line=>line.event==='native-link-failed');
 assert.equal(failure.errorCode,4);assert.deepEqual(failure.nativeSession,{available:false,reason:'not-sampled'});assert.equal(f.peer.readyState,3);assert.ok(!f.logs.join('').includes(id));
 const count=f.logs.length;handlers.get(7)({remote:76561198999999999n,error:4});assert.equal(f.logs.length,count,'unrelated native sessions cannot become a game failure report');
 await f.gateway.close();
});
test('a lobby member that already left is pruned before a native diagnostic query',t=>{
 t.mock.method(Date,'now',()=>10000);let calls=0;const f=fixture(()=>{calls++;return decodeP2PSessionState(nativeState());});
 f.gateway.selected.lobby.getMembers=()=>[host];f.gateway.poll();assert.equal(calls,0);assert.equal(f.gateway.sessionMetrics.cache.size,0);assert.equal(f.peer.readyState,3);f.gateway.wss.close();
});


test('Electron diagnostic resource FileSets and final dependency checks cannot fall through to parent node_modules', async () => {
 const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
 const absentBackend = path.join(root, 'artifacts', 'missing-metrics-backend-test');
 const entries = steamMetricsExtraResources(absentBackend);
 assert.deepEqual(entries, ['koffi', '@koromix/koffi-win32-x64'].map(name => ({ from: path.join(absentBackend, 'node_modules', name), to: 'backend/node_modules/' + name })));
 await assert.rejects(verifySteamMetricsRuntime(absentBackend), /escaped the packaged backend/);
});

test('native failure callback logs only the cached sample, never queries inside callback or leaks exception data', async () => {
 let queries = 0;
 const handlers = new Map(), f = fixture(() => {queries++;return {...decodeP2PSessionState(nativeState()), remoteIP:'PRIVATE'};});
 f.gateway.client.localplayer = {getSteamId:()=>BigInt(host),getName:()=>'synthetic host'};
 f.gateway.client.callback = {register:(event, fn)=>{handlers.set(event,fn);return {disconnect(){}};}};
 f.gateway.initialize();
 try {
  f.gateway.sessionMetrics.sample([id]);
  handlers.get(7)({remote:BigInt(id),error:'PRIVATE'});
  const failure = f.logs.map(line=>JSON.parse(line.slice('[steam-transport] '.length))).find(line=>line.event==='native-link-failed');
  assert.equal(failure.errorCode,null);
  assert.equal(failure.nativeSession.queuedBytes,54321);
  assert.equal(queries,1);
  assert.ok(!/PRIVATE|remoteIP/.test(f.logs.join('')));
  assert.equal(f.gateway.sessionMetrics.cache.size,0);
 } finally {await f.gateway.close();}
});
