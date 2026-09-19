import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SteamGateway } from '../server/steam/gateway.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };
const code=(await build({entryPoints:['src/network/SteamNetworkDiagnostics.tsx'],bundle:true,jsx:'automatic',platform:'node',format:'cjs',packages:'external',write:false})).outputFiles[0].text;
const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:createRequire(import.meta.url)});
const Component=module.exports.SteamNetworkDiagnostics;
const render=transport=>renderToStaticMarkup(createElement(Component,{transport}));
function fixture(){
 const packets=[];const host='76561198000000001',guest='76561198000000002',lobby='109775240000000001',connection='a'.repeat(32);
 const gateway=new SteamGateway({build:'test',client:{networking:{sendP2PPacket:(_remote,type,data)=>{assert.equal(type,2);packets.push(data);return true;},isP2PPacketAvailable:()=>0}}});
 gateway.owner=host;gateway.selected={id:lobby,owner:host,lobby:{getOwner:()=>host,getMembers:()=>[host,guest]}};gateway.relay={acceptTransport(){}};
 gateway.dispatch(guest,{connection,op:'open',data:{lobby,build:'test',protocol:protocol.version}});packets.length=0;
 return {gateway,peer:gateway.peers.get(guest),packets};
}
const state=(seq,ballast='')=>JSON.stringify({type:'state',matchId:'battle',seq,frame:{tick:seq,ballast}});
test('wire diagnostics describe successful framing, not raw JSON size or a made-up RTT',()=>{
 const f=fixture(),text=state(1,'x'.repeat(20000));f.peer.send(text);const d=f.peer.diagnostics();
 assert.equal(d.lastSnapshot.rawBytes,Buffer.byteLength(text));assert.equal(d.lastSnapshot.wireBytes,f.packets.reduce((n,p)=>n+p.length,0));assert.equal(d.lastSnapshot.fragments,f.packets.length);
 assert.equal(d.lastSnapshot.format,'full');assert.ok(d.lastSnapshot.prepareMs>=0);assert.ok(d.lastSnapshot.wireBytes<d.lastSnapshot.rawBytes);
 assert.equal(d.ackMs,null);assert.equal(d.queueAckMs,null);f.gateway.wss.close();
});
test('oversized fallback and block reasons are visible without changing admission or control delivery',()=>{
 const f=fixture();f.peer.send(state(1,'x'.repeat(525000)));assert.equal(f.peer.diagnostics().lastSnapshot.format,'legacy-full');
 for(let i=2;i<5;i++)f.peer.send(state(i));assert.equal(f.peer.snapshotBlockReason,'frame-window');
 const last=f.peer.lastSnapshot;f.peer.send(state(6));assert.equal(f.peer.lastSnapshotSkip,'frame-window');assert.equal(f.peer.lastSnapshot,last);
 const n=f.packets.length;f.peer.send(JSON.stringify({type:'pong',sent:1}));assert.equal(f.packets.length,n+1);f.gateway.wss.close();
 const large=fixture();large.peer.send(state(1,randomBytes(80000).toString('base64')));assert.equal(large.peer.snapshotBlockReason,'wire-byte-window');large.gateway.wss.close();
});
test('LAN/missing/experimental data is not mislabelled as default Steam telemetry',()=>{
 for(const value of [undefined,null,{},'bad',{mode:'sockets-v012-app1'}])assert.equal(render(value),'');
});
test('host panel renders only bounded allowlisted fields and no identities',()=>{
 const peers=Array.from({length:20},()=>({steamId:'PRIVATE-ID',inflight:4,window:4,blockedBy:'frame-window',lastSnapshot:{rawBytes:336076,wireBytes:41000,fragments:2,prepareMs:3},delta:{fullStates:1,deltaStates:42,legacyStates:0},nativeSession:{available:true,queuedBytes:2000,queuedPackets:3,usingRelay:true}}));
 const html=render({mode:'legacy-p2p',role:'host',peers,sharedSnapshots:{inflightBytes:41000,limitBytes:65536,waitingPeers:1}});
 assert.match(html,/线上 40\.0 KiB/);assert.match(html,/等待网络 ACK/);assert.match(html,/Steam 中继 是/);assert.doesNotMatch(html,/PRIVATE-ID/);assert.equal((html.match(/：在途/g)||[]).length,10);
});
test('guest reports unknown SDK metrics honestly and exposes gateway receive/ACK state',()=>{
 const html=render({mode:'legacy-p2p',role:'guest',receivedStates:100,lastStateAgeMs:399,nativeHostSession:{available:false},outbound:{inflight:32,queued:1,oldestAckMs:2000}});
 assert.match(html,/399 ms/);assert.match(html,/2000 ms/);assert.match(html,/SDK 队列不可测/);
 assert.doesNotMatch(render({mode:'legacy-p2p',role:'host',peers:[{blockedBy:'<script>BAD</script>'}]}),/BAD/);
});
