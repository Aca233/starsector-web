import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLanServer } from '../server/lan-server.mjs';
import { lanTransportMetrics } from '../server/LanTransportDiagnostics.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};

class MemoryServer extends EventEmitter {
  listen(_port,_host,callback){callback();}
  address(){return {port:32110};}
  close(callback){callback();}
}
class MemorySocket extends EventEmitter {
  readyState=1;bufferedAmount=0;extensions='permessage-deflate';rows=[];pings=[];
  send(data){this.rows.push(JSON.parse(String(data)));}
  ping(data){this.pings.push(data);}
  receive(message){this.emit('message',Buffer.from(JSON.stringify(message)),false);}
  close(){this.readyState=3;this.emit('close',1000);}
  terminate(){this.close();}
}

test('actual LAN relay: probe provenance, skip reasons, pong metrics and controls under pressure (memory sockets only)',async t=>{
  const dist=mkdtempSync(join(tmpdir(),'lan-flow-test-'));writeFileSync(join(dist,'lan-build.json'),JSON.stringify({build:'lan-flow-test'}));
  const stub=t.mock.method(http,'createServer',()=>new MemoryServer());let relay;
  try{
    relay=await createLanServer({dist,host:'127.0.0.1',port:32110});stub.mock.restore();
    const client=(options={})=>{const s=new MemorySocket();s.bufferedAmount=options.buffered??0;relay.acceptTransport(s,options.transport??null);
      s.receive({type:'hello',name:'Player',instance:'test',build:'lan-flow-test',protocol:protocol.version,...(options.legacy?{}:{stateCredits:1})});
      assert.ok(s.rows.some(m=>m.type==='welcome'),JSON.stringify(s.rows));return s;};
    const host=client(),guest=client();assert.equal(host.pings.length,1);assert.equal(guest.pings.length,1);
    host.receive({type:'create',password:''});const room=[...relay.rooms.values()][0];assert.ok(room);
    guest.receive({type:'join',code:room.code,password:''});assert.equal(room.peers.length,2);const gp=room.peers[1];
    gp.nativeProbe.at=performance.now()-20;guest.emit('pong',guest.pings[0]);assert.equal(gp.stateCredits.capacity,3);
    guest.receive({type:'ready',ready:true});host.receive({type:'start'});assert.equal(room.status,'loading',JSON.stringify(host.rows.at(-1)));
    for(const ws of [host,guest])ws.receive({type:'loaded',matchId:room.match.id});assert.equal(room.status,'running');
    let seq=0;const state=()=>{seq++;host.receive({type:'state',matchId:room.match.id,seq,frame:{tick:seq,ships:[{id:'a',state:{teamId:0}},{id:'b',state:{teamId:1}}],crafts:[],craftSpecs:[],world:{}}});};
    state();assert.equal(gp.lanFlow.sent,1);
    for(const [i,ws] of [host,guest].entries())ws.receive({type:'sync-ready',matchId:room.match.id,syncId:room.peers[i].sync.id,tick:seq});
    assert.ok(room.peers.every(p=>p.loaded));
    state();state();state();assert.equal(gp.lanFlow.skippedCredit,1);
    // Invoke the production pong callback with real helper tokens captured while
    // credits are occupied. Without passing the token this would grow to 64.
    for(let i=0;i<6;i++){const data=Buffer.from('probe'+i);gp.nativeProbe={data,at:performance.now()-2000,token:gp.stateCredits.beginNetworkProbe()};guest.emit('pong',data);}
    assert.equal(gp.stateCredits.capacity,3);assert.ok(gp.stateCredits.networkStats().latestRttMs>=2000);
    guest.receive({type:'ping',sent:123});const data=guest.rows.at(-1).lanTransport;
    assert.equal(data.authority.received,seq);assert.ok(data.authority.lastBytes>0);assert.ok(data.authority.receiveMs>=0);
    assert.equal(data.mode,'lan-websocket');assert.equal(data.receivers[0].flow.skippedCredit,1);
    assert.equal(data.receivers[0].credits.inflight,3);assert.equal(data.receivers[0].compression,true);
    assert.ok(!JSON.stringify(data).includes(gp.id));assert.ok(!JSON.stringify(data).includes(gp.token));
    guest.receive({type:'input',matchId:room.match.id,syncId:gp.sync.id,input:{seq:1,keys:1,aim:[0,0],firing:false,pointerActive:false,actions:[]}});
    assert.ok(host.rows.some(m=>m.type==='input'&&m.input.seq===1));
    guest.receive({type:'state-consumed',matchId:room.match.id,seq:999});assert.equal(gp.stateCredits.stats().inflight,3);
    guest.receive({type:'state-consumed',matchId:room.match.id,seq:3});assert.equal(gp.stateCredits.stats().inflight,0);
    guest.bufferedAmount=1;state();assert.equal(gp.lanFlow.skippedSocket,1);guest.bufferedAmount=0;
    state();assert.equal(gp.lanFlow.lastSeq,seq);assert.equal(gp.stateCredits.stats().inflight,1);
    host.receive({type:'ping',sent:456});assert.equal(host.rows.at(-1).lanTransport.receivers.length,1);
    host.receive({type:'end',matchId:room.match.id});assert.equal(room.status,'ended');assert.ok(guest.rows.some(m=>m.type==='ended'));
    const queued=client({buffered:1000});assert.equal(queued.pings.length,1); // Do not skip liveness probes.
    queued.receive({type:'create',password:''});const qp=[...relay.rooms.values()].flatMap(r=>r.peers).find(p=>p.ws===queued);
    assert.equal(qp.nativeProbe.token.idle,false);qp.nativeProbe.at=performance.now()-2000;queued.emit('pong',queued.pings[0]);
    assert.equal(qp.stateCredits.capacity,2);assert.equal(qp.stateCredits.networkStats().baselineRttMs,null);
    const legacy=client({legacy:true});legacy.receive({type:'ping',sent:1});assert.equal(legacy.rows.at(-1).lanTransport,undefined);
    const steam=client({transport:{canHost:true,scope:'steam-test',identity:'fake-steam'}});steam.receive({type:'ping',sent:1});
    assert.equal(steam.pings.length,0);assert.equal(steam.rows.at(-1).lanTransport,undefined);
  }finally{stub.mock.restore();if(relay)await relay.close();unlinkSync(join(dist,'lan-build.json'));rmdirSync(dist);}
});

test('diagnostics are bounded and omit identity and unrelated Steam peers',()=>{
  const p={id:'secret',stateCredits:{},room:{hostId:'secret',lastSeq:3,peers:[]}};
  const peer={ws:{bufferedAmount:0,extensions:''},seat:1,id:'private',token:'private'};
  p.room.peers=[p,...Array(30).fill(peer),{...peer,transport:{}}];
  const result=lanTransportMetrics(p);assert.equal(result.receivers.length,9);assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(lanTransportMetrics({...p,transport:{}}),null);
});

test('LAN UI preserves unknowns, scopes the path, and does not invent wire throughput',async()=>{
  const code=(await build({entryPoints:['src/network/LanNetworkDiagnostics.tsx'],bundle:true,jsx:'automatic',platform:'node',format:'cjs',packages:'external',write:false})).outputFiles[0].text;
  const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:createRequire(import.meta.url)});
  const render=transport=>renderToStaticMarkup(createElement(module.exports.LanNetworkDiagnostics,{transport}));
  assert.equal(render(null),'');assert.equal(render({mode:'legacy-p2p'}),'');
  const html=render({mode:'lan-websocket',receivers:[{credits:{inflight:NaN},network:{latestRttMs:2000,baselineRttMs:20}}]});
  assert.ok(html.includes('2000.0 ms'));assert.ok(html.includes('20.0 ms'));assert.ok(html.includes('未知'));
  assert.ok(html.includes('不是实际线上流量'));assert.ok(!html.includes('NaN'));
  assert.equal((render({mode:'lan-websocket',receivers:Array(100).fill({})}).match(/原生心跳最近/g)||[]).length,9);
});
