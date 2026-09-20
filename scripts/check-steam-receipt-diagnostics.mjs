// Explicit synchronous reference fixture; real-worker coverage lives in check-steam-snapshot-prepare.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { SteamGateway } from '../server/steam/gateway.mjs';
import { SteamReceiptDiagnostics, SteamPollDiagnostics } from '../server/steam/receipt-diagnostics.mjs';
const host='76561198000000001',guest='76561198000000002',lobby='10977524000000001';
function fixture(t){
  const sends=[],callbacks=[],inbox=[];let fast=true,reliable=true,writeThrows=false,readThrows=false;
  const g=new SteamGateway({ snapshotPreparation: false,build:'test',client:{networking:{
    sendP2PPacket(_remote,type,packet){sends.push({type,packet:Buffer.from(packet)});return type===1?fast:reliable;},
    isP2PPacketAvailable:()=>{if(readThrows)throw Error('SDK unavailable');return inbox[0]?.data.length??0;},
    readP2PPacket:()=>inbox.shift(),
  }}});
  t.after(()=>g.wss.close());g.owner=guest;g.initialized=true;g.selected={id:lobby,owner:host,lobby:{getMembers:()=>[host,guest],getOwner:()=>host}};
  function browser(){const ws=new EventEmitter();Object.assign(ws,{readyState:1,bufferedAmount:0,
    send(text,done){if(JSON.parse(text).type==='state'){if(writeThrows)throw Error('local write failed');callbacks.push(done);}else done?.();},
    close(code=1000){ws.readyState=3;ws.emit('close',code);}});g.connectBrowser(ws,new URL('http://localhost/steam/ws?lobby='+lobby));return ws;}
  const ws=browser();
  const dispatch=(id,data,connection=g.guestConnection)=>g.dispatch(host,{op:'data',connection,id,data});
  const state=(seq=1)=>dispatch(100+seq,{type:'state',matchId:'battle',seq,frame:{tick:seq}});
  return {g,ws,browser,sends,callbacks,inbox,dispatch,state,refuse:(f,r)=>{fast=f;reliable=r;},throwWrite:()=>{writeThrows=true;},throwRead:()=>{readThrows=true;}};
}
test('receipt stages distinguish decoded state, pending local write, SDK acceptance and renderer consumption',t=>{
  let now=100;t.mock.method(Date,'now',()=>now);const f=fixture(t);
  f.ws.emit('message',Buffer.from(JSON.stringify({type:'hello',stateCredits:1})),false);
  f.dispatch(20,{type:'welcome',stateCredits:1});f.state();
  let status=f.g.transportStatus();assert.equal(status.receivedStates,1);assert.equal(status.receipts.rendererPending,1);assert.equal(status.receipts.networkAttempts,0);
  now=150;f.callbacks.shift()(null);status=f.g.transportStatus();
  assert.equal(status.receipts.rendererPending,0);assert.equal(status.receipts.rendererWritten,1);assert.equal(status.receipts.maxRendererWriteMs,50);
  assert.equal(status.receipts.networkAttempts,1);assert.equal(status.receipts.networkAccepted,1);assert.equal(status.receipts.networkErrors,0);assert.equal(status.receipts.fastAccepted,1);
  now=160;f.ws.emit('message',Buffer.from(JSON.stringify({type:'state-consumed',matchId:'battle',seq:1})),false);
  status=f.g.transportStatus(180);assert.equal(status.receipts.consumptionAccepted,1);assert.equal(status.receipts.networkAgeMs,30);assert.equal(status.receipts.consumptionAgeMs,20);
  const copies=f.sends.slice(-2);assert.deepEqual(copies.map(p=>p.type),[1,2]);assert.deepEqual(copies[0].packet,copies[1].packet);
});
test('local write errors do not fabricate ACKs; native refusal stays visible without changing retry/close behavior',t=>{
  const f=fixture(t);f.state();f.callbacks.shift()(Error('local failure'));
  let r=f.g.transportStatus().receipts;assert.equal(r.rendererWriteErrors,1);assert.equal(r.networkAttempts,0);assert.equal(r.networkAgeMs,null);
  f.refuse(false,false);f.state(2);const before=f.sends.length;f.callbacks.shift()(null);
  r=f.g.transportStatus().receipts;assert.equal(r.networkAttempts,1);assert.equal(r.networkAccepted,0);assert.equal(r.networkErrors,1);assert.equal(r.fastRejected,1);
  assert.equal(f.sends.length-before,2);assert.equal(f.ws.readyState,1,'diagnostics must not introduce a new disconnect policy');
});
test('synchronous local send failure releases diagnostic pending count while preserving the error',t=>{
  const f=fixture(t);f.throwWrite();assert.throws(()=>f.state(),/local write failed/);
  const r=f.g.transportStatus().receipts;assert.equal(r.rendererPending,0);assert.equal(r.rendererWriteErrors,1);assert.equal(r.networkAttempts,0);
});
test('late old-renderer callback cannot update a replacement connection trace or transmit an ACK',t=>{
  const f=fixture(t);f.state();const old=f.callbacks.shift(),nonce=f.g.guestConnection;f.ws.close();f.browser();
  assert.notEqual(f.g.guestConnection,nonce);const before=f.g.transportStatus().receipts,sends=f.sends.length;old(null);
  assert.deepEqual(f.g.transportStatus().receipts,before);assert.equal(f.sends.length,sends);
});
test('poll observations retain the original 64-packet budget and expose gaps, invalid packets and SDK exceptions',t=>{
  let now=100;t.mock.method(Date,'now',()=>now);t.mock.method(performance,'now',()=>0);const f=fixture(t);
  const make=()=>({steamId:host,data:f.g.codec.encode(f.g.guestConnection,'ack',{id:999}).packets[0]});
  for(let i=0;i<70;i++)f.inbox.push(make());f.g.poll();
  let p=f.g.transportStatus().polling;assert.equal(p.packetsRead,64);assert.equal(p.budgetHits,1);assert.equal(f.inbox.length,6);
  now=170;f.g.poll();p=f.g.transportStatus(180).polling;assert.equal(p.packetsRead,70);assert.equal(p.maxGapMs,70);assert.equal(p.lastAgeMs,10);
  const invalid=make();invalid.data[6]=1;f.inbox.push(invalid);f.g.poll();assert.equal(f.g.transportStatus().polling.invalidPackets,1);
  f.throwRead();f.g.poll();assert.equal(f.g.transportStatus().polling.errors,1);assert.match(f.g.error,/网络暂不可用/);
});
test('trace snapshots contain detached scalars, duplicate callbacks are idempotent and clock reversal stays nonnegative',()=>{
  const r=new SteamReceiptDiagnostics(),write=r.beginWrite(100);r.endWrite(write,null,90);r.endWrite(write,Error('duplicate'),200);
  r.attempt(false);r.accepted(false,120);r.attempt(true);r.failed(true);r.fast(false);
  const s=r.snapshot(100);assert.equal(s.rendererPending,0);assert.equal(s.rendererWritten,1);assert.equal(s.rendererWriteErrors,0);assert.equal(s.maxRendererWriteMs,0);assert.equal(s.networkAgeMs,0);assert.equal(s.consumptionAgeMs,null);
  s.networkAccepted=99;assert.equal(r.snapshot().networkAccepted,1);
  const p=new SteamPollDiagnostics();assert.equal(p.snapshot().lastAgeMs,null);p.begin(100);p.begin(90);p.end(100,90);assert.equal(p.snapshot(80).lastAgeMs,0);assert.equal(p.snapshot().maxGapMs,0);
  for(const value of Object.values(r.snapshot()))assert.ok(value===null||typeof value==='number');
});

test('oversized native queue head is observed, not falsely reported as discarded',t=>{
  const f=fixture(t);f.inbox.push({steamId:host,data:Buffer.alloc(1024*1024+1)});f.g.poll();
  const p=f.g.transportStatus().polling;
  assert.equal(p.oversizedHeads,1);assert.equal(p.discardedPackets,0);assert.equal(p.packetsRead,0);assert.equal(f.inbox.length,1);
});
test('leaving during a poll cannot charge the completed poll to the next session',t=>{
  let now=1500;t.mock.method(Date,'now',()=>now);const f=fixture(t),old=f.g.pollTrace;
  f.g.selected.lobby.getOwner=()=>{now+=7;return guest;};f.g.poll();
  assert.equal(f.g.selected,null);assert.notEqual(f.g.pollTrace,old);
  assert.equal(old.snapshot().calls,1);assert.equal(old.snapshot().maxDurationMs,7);
  assert.deepEqual(f.g.pollTrace.snapshot(),new SteamPollDiagnostics().snapshot());
});
