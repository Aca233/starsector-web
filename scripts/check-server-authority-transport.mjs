import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createLanServer } from '../server/lan-server.mjs';
import { createAuthorityFactory } from '../server/ServerBattleAuthority.mjs';
import { LanDeltaReceiver, isLanDelta } from '../src/network/LanBinaryDelta.mjs';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with { type:'json' };

const base = path.resolve('artifacts/server-authority-20260920');
const dist = path.join(base, 'test-transport-web');
await fs.mkdir(dist, { recursive:true });
await fs.writeFile(path.join(dist, 'lan-build.json'), JSON.stringify({build:'dedicated-transport-test'}));
const factory = createAuthorityFactory({ workerFile:path.join(base,'runtime/authority-worker.mjs'), assets:path.resolve('public'), maxBattles:1 });
// Emulate TLS termination at a reverse proxy which preserves Host/Origin.
const publicOrigin = 'https://combat.example.test';
const app = await createLanServer({host:'127.0.0.1', port:0, dist, authorityFactory:factory, publicOrigin});
const url = 'ws://127.0.0.1:' + app.server.address().port + '/lan/ws';
const clients = [], checks = [], errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout=15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if(errors.length) throw errors[0]; if(fn()) return; await sleep(20); }
  throw Error('Timed out: '+label);
}
async function rejected(host, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {headers:{Host:host}, origin, handshakeTimeout:3000});
    ws.on('unexpected-response', (_req, response) => { response.resume(); ws.terminate(); resolve(response.statusCode); });
    ws.on('open', () => { ws.terminate(); reject(Error('Unexpectedly accepted '+host+' / '+origin)); });
    ws.on('error', () => {});
  });
}
class Peer {
  constructor(name) {
    this.frames=0; this.deltaPackets=0; this.ack=true; this.messages=[]; this.decoder=new LanDeltaReceiver();
    this.ws = new WebSocket(url, {headers:{Host:new URL(publicOrigin).host}, origin:publicOrigin, perMessageDeflate:true});
    clients.push(this);
    this.ws.on('error', error => errors.push(error));
    this.ws.on('open', () => this.send({type:'hello', name, instance:crypto.randomUUID(), build:'dedicated-transport-test', protocol:protocol.version, stateCredits:1, binaryDelta:1, motionReference:1}));
    this.ws.on('message', (data, binary) => {
      try {
        if(binary && isLanDelta(data)) this.deltaPackets++;
        const m = binary ? decodeBinaryState(this.decoder.decode(data)) : JSON.parse(data);
        this.messages.push(m); if(this.messages.length>200) this.messages.shift();
        if(m.type==='welcome') { this.welcome=m; this.decoder.setMotionReference(m.motionReference===1); }
        if(m.type==='room') this.room=m.room;
        if(m.type==='match') { this.match=m.match; this.decoder.reset(); this.send({type:'loaded',matchId:m.match.id}); }
        if(m.type==='launch') this.launch=m;
        if(m.type==='controls-ready') this.controls=m;
        if(m.type==='state') {
          this.frames++; this.state=m;
          if(this.ack) this.send({type:'state-consumed',matchId:m.matchId,seq:m.seq});
          if(this.launch?.matchId===m.matchId && this.controls?.syncId!==this.launch.syncId && m.frame.tick>=this.launch.minTick)
            this.send({type:'sync-ready',matchId:m.matchId,syncId:this.launch.syncId,tick:m.frame.tick});
        }
      } catch(error) { errors.push(error); }
    });
  }
  send(m) { if(this.ws.readyState===WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
}
try {
  assert.equal(await rejected('evil.example.test',publicOrigin),403);
  assert.equal(await rejected(new URL(publicOrigin).host,'https://evil.example.test'),403);
  assert.equal(await rejected(new URL(publicOrigin).host,'http://combat.example.test'),403);
  const httpStatus = await new Promise((resolve,reject) => {
    http.get({hostname:'127.0.0.1',port:app.server.address().port,path:'/lan/info',headers:{Host:'evil.example.test'}}, res => {res.resume(); resolve(res.statusCode);}).on('error',reject);
  });
  assert.equal(httpStatus,403);
  checks.push('reject wrong HTTP Host, WebSocket Host, cross-origin and protocol downgrade');
  const a=new Peer('creator'), b=new Peer('guest');
  await until(()=>a.welcome&&b.welcome,'negotiation');
  for(const peer of [a,b]) {
    assert.match(peer.ws.extensions,/permessage-deflate/);
    assert.equal(peer.welcome.binaryDelta,1); assert.equal(peer.welcome.motionReference,1);
  }
  checks.push('public-origin proxy route negotiates PMD, binary deltas and motion reference for both seats');
  a.send({type:'create'}); await until(()=>a.room,'create');
  b.send({type:'join',code:a.room.code}); await until(()=>b.room?.members.length===2,'join');
  b.send({type:'ready',ready:true}); await until(()=>a.room.members.some(p=>p.id===b.welcome.id&&p.ready),'ready');
  a.send({type:'start'}); await until(()=>a.controls&&b.controls&&a.frames>=20&&b.frames>=20,'both replicas');
  const room=app.rooms.get(a.room.code);
  const seat0=room.peers.find(p=>p.id===a.welcome.id), seat1=room.peers.find(p=>p.id===b.welcome.id);
  for(const [peer,serverPeer] of [[a,seat0],[b,seat1]]) {
    assert.ok(peer.deltaPackets>0);
    assert.ok(serverPeer.lanDelta.stats().delta>0);
    assert.ok(serverPeer.stateCredits.stats().acked>0);
  }
  checks.push('production receiver decodes live server delta snapshots and ACKs seat 0 plus guest');
  a.ack=false;
  await until(()=>seat0.stateCredits.stats().inflight===seat0.stateCredits.capacity,'fill seat 0 credit window');
  await sleep(200);
  const sent=seat0.stateCredits.stats().sent, guestFrames=b.frames;
  const inflight=seat0.stateCredits.stats().inflight;
  a.send({type:'state-consumed',matchId:a.match.id,seq:a.state.seq+999999});
  await sleep(250);
  assert.equal(seat0.stateCredits.stats().inflight,inflight);
  assert.equal(seat0.stateCredits.stats().sent,sent);
  assert.ok(b.frames>guestFrames);
  assert.ok(seat0.stateCredits.stats().rejected>0);
  checks.push('seat 0 backpressure stops only its states; forged ACK cannot free credits; guest continues');
  const frames=a.frames; a.ack=true;
  a.send({type:'state-consumed',matchId:a.match.id,seq:a.state.seq});
  await until(()=>a.frames>=frames+8,'seat 0 resumes');
  a.send({type:'input',matchId:a.match.id,syncId:a.launch.syncId,input:{seq:50,keys:1,aim:[0,0],firing:false,pointerActive:true,actions:[]}});
  b.send({type:'input',matchId:b.match.id,syncId:b.launch.syncId,input:{seq:60,keys:1,aim:[0,0],firing:false,pointerActive:true,actions:[]}});
  await until(()=>a.state.frame.acknowledged[0]>=50&&b.state.frame.acknowledged[1]>=60,'input ACKs through compressed transport');
  checks.push('exact ACK resumes seat 0 without losing delta chain; both controls remain acknowledged');
  a.send({type:'end',matchId:a.match.id}); await until(()=>factory.activeCount()===0,'cleanup');
  const result={passed:true,checks};
  await fs.writeFile(path.join(base,'transport-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  for(const peer of clients) peer.ws.terminate();
  await app.close(); await factory.close();
}
