import {attachAuthorityAdmission, createAuthorityAdmission, writeAuthorityAdmission, closeAuthorityAdmission, isAuthoritySnapshotBlocked} from '../src/network/AuthorityIoAdmission.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AuthorityIoBridge} from '../src/network/AuthorityIoBridge.mjs';
import {encodeProjectedBinaryFrame,decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {normalizeNetworkRecord} from '../desktop/network-diagnostic-record.mjs';
function fixture(options={}){let buffered=0,now=0,throwSend=false;const wire=[],events=[];const port={onmessage:null,start(){},postMessage:m=>events.push(m),close(){this.closed=true;}};
 const bridge=new AuthorityIoBridge({...options,send:data=>{if(throwSend)throw Error('closed');wire.push(data);if(options.queuedOnSend)buffered+=options.queuedOnSend;},buffered:()=>buffered,now:()=>now});bridge.attach(port,'match',7);
 return {bridge,wire,events,port,at:n=>now=n,block:n=>buffered=n,refuse:()=>throwSend=true,receive:m=>bridge.observe(JSON.stringify(m)),publish:m=>port.onmessage({data:m})};}
const snapshot=tick=>{const binary=encodeProjectedBinaryFrame({tick,ships:[],world:{combatTime:tick/60}}).buffer;return {type:'snapshot',tick,binary,bytes:binary.byteLength};};
test('publication uses the original scope/sequence and no render-thread receipt, for binary and JSON',()=>{
 const f=fixture();f.publish(snapshot(0));assert.equal(f.wire.length,0);f.receive({type:'launch',matchId:'match'});
 for(let i=1;i<=120;i++){f.at(i*1000/60);f.publish(snapshot(i));assert.equal(decodeBinaryState(f.wire.at(-1)).seq,i+6);}
 assert.equal(f.wire.length,120);assert.equal(f.events.filter(e=>e.type==='io-snapshot').length,121);
 f.publish({type:'snapshot',tick:121,json:JSON.stringify({tick:121}),bytes:12});assert.equal(JSON.parse(f.wire.at(-1)).seq,127);
});
test('bound gate skips a blocked proposal; no payload retained, retransmit or fabricated remote ACK',()=>{
 const f=fixture();f.receive({type:'launch',matchId:'match'});f.block(1000000);f.publish(snapshot(1));assert.equal(f.wire.length,0);assert.equal(f.events.at(-1).delivery,'skipped');
 f.block(0);f.publish(snapshot(9));assert.equal(decodeBinaryState(f.wire[0]).frame.tick,9);assert.equal(decodeBinaryState(f.wire[0]).seq,7);
 assert.ok(!f.events.some(e=>e.type==='state-consumed'||e.type==='ack'));
});
test('matching ordered input/presence/deployment bypass the main queue; other scope does not',()=>{
 const f=fixture();for(const type of ['presence','input','deployment']){const m={type,matchId:'match',seat:2,input:{seq:1}};assert.equal(f.receive(m),true);assert.deepEqual(f.events.at(-1),m);}
 const n=f.events.length;for(const type of ['input','launch','resume','ended'])f.receive({type,matchId:'old',stateSeq:500});assert.equal(f.events.length,n);assert.equal(f.bridge.seq,7);
});
test('terminal barrier follows snapshot handling and stop prevents new publications',()=>{
 const f=fixture();f.receive({type:'launch',matchId:'match'});f.publish(snapshot(1));f.publish({type:'barrier',id:1});assert.equal(f.events.at(-2).type,'io-snapshot');assert.equal(f.events.at(-1).type,'io-barrier');
 f.receive({type:'ended',matchId:'match'});f.publish(snapshot(2));assert.equal(f.wire.length,1);assert.equal(f.events.at(-1).delivery,'skipped');
});
test('resume and fallback preserve sequence high water; malformed/send failure detaches instead of claiming success',()=>{
 const f=fixture();f.receive({type:'resume',matchId:'match',stateSeq:100});f.receive({type:'launch',matchId:'match'});f.publish(snapshot(4));assert.equal(decodeBinaryState(f.wire[0]).seq,101);
 f.refuse();f.publish(snapshot(5));assert.equal(f.port.closed,true);assert.equal(f.events.at(-1).type,'io-unavailable');assert.equal(f.events.at(-1).nextSequence,103);assert.equal(f.bridge.port,null);
 const g=fixture();g.receive({type:'launch',matchId:'match'});g.publish({...snapshot(3),bytes:1});assert.equal(g.wire.length,0);assert.equal(g.port.closed,true);
});
test('detach/rebind cannot reuse active state or forward former port traffic',()=>{
 const f=fixture();f.receive({type:'launch',matchId:'match'});const oldCallback=f.port.onmessage;
 f.bridge.close();oldCallback({data:snapshot(1)});assert.equal(f.wire.length,0);assert.equal(f.events.at(-1).type,'io-unavailable');
 const events=[],newPort={onmessage:null,start(){},postMessage:m=>events.push(m),close(){}};
 f.bridge.attach(newPort,'new-match',50);f.receive({type:'launch',matchId:'new-match'});
 oldCallback({data:snapshot(2)});assert.equal(f.wire.length,0,'already queued old callback cannot publish into a new battle');
 newPort.onmessage({data:snapshot(3)});const packet=decodeBinaryState(f.wire[0]);assert.equal(packet.matchId,'new-match');assert.equal(packet.seq,50);

});
test('motion and deployment retain their validated wire types and match scope',()=>{
 const f=fixture();f.receive({type:'launch',matchId:'match'});f.publish({type:'motion',tick:1,data:'AAAA'});assert.deepEqual(JSON.parse(f.wire[0]),{type:'motion',matchId:'match',data:'AAAA'});
 f.publish({type:'deployment-result',matchId:'injected',seat:2,requestId:'a',ok:true});assert.equal(JSON.parse(f.wire[1]).matchId,'match');
});
test('direct-path diagnostics retain actual use/counters without arbitrary data',()=>{
 const r=normalizeNetworkRecord({version:1,transport:'lan',event:'sample',hudAgeMs:0,hud:{authority:{ageMs:0,io:{enabled:true,sent:60,skipped:2,inputs:180,inflight:1,displaySounds:64,secret:'no'}}}});
 assert.equal(r.hud.authority.io.enabled,true);assert.equal(r.hud.authority.io.sent,60);assert.ok(!JSON.stringify(r).includes('secret'));
});

test('local admission is optional, single-cell, revocable and never resurrected',()=>{
 assert.equal(createAuthorityAdmission(false),null);
 for(const value of [null,undefined,{},new ArrayBuffer(4),new SharedArrayBuffer(8)])assert.equal(attachAuthorityAdmission(value),null);
 const view=createAuthorityAdmission(true),reader=attachAuthorityAdmission(view.buffer);assert.equal(view.byteLength,4);
 assert.equal(isAuthoritySnapshotBlocked(null),false);assert.equal(isAuthoritySnapshotBlocked(reader),false);
 writeAuthorityAdmission(view,true);assert.equal(isAuthoritySnapshotBlocked(reader),true);
 closeAuthorityAdmission(view);writeAuthorityAdmission(view,true);assert.equal(isAuthoritySnapshotBlocked(reader),false);
});
test('preflight never grants credit or bypasses the actual socket gate; drain has no new port message',()=>{
 const f=fixture({sharedCompletion:true,sharedAdmission:true,queuedOnSend:4096});
 const view=attachAuthorityAdmission(f.events[0].admission);assert.ok(view);assert.equal(isAuthoritySnapshotBlocked(view),true);
 f.receive({type:'launch',matchId:'match'});assert.equal(isAuthoritySnapshotBlocked(view),false);
 f.publish(snapshot(1));assert.equal(isAuthoritySnapshotBlocked(view),true);assert.equal(f.events.at(-1).delivery,'sent');
 const events=f.events.length;f.block(0);f.bridge.refreshAdmission();assert.equal(isAuthoritySnapshotBlocked(view),false);assert.equal(f.events.length,events);
 // Stale optimistic hint: another producer queues bytes before actual dispatch.
 f.block(4096);f.publish(snapshot(2));assert.equal(f.events.at(-1).delivery,'skipped');assert.equal(f.bridge.seq,8);assert.equal(f.wire.length,1);
 f.block(0);f.bridge.refreshAdmission();f.publish(snapshot(9));assert.equal(decodeBinaryState(f.wire.at(-1)).frame.tick,9);assert.equal(f.bridge.seq,9);
 assert.ok(!f.events.some(e=>e.type==='ack'||e.type==='state-consumed'));
});
test('motion-first companion survives zero-byte observation; hint expires without extending its deadline',()=>{
 for(const elapsed of [5,17]){
  const f=fixture({sharedCompletion:true,sharedAdmission:true,queuedOnSend:100});f.receive({type:'launch',matchId:'match'});
  const view=attachAuthorityAdmission(f.events[0].admission);f.publish({type:'motion',tick:1,data:'AAAA'});
  assert.equal(isAuthoritySnapshotBlocked(view),false);
  f.block(0);f.bridge.refreshAdmission();f.block(100);f.at(elapsed);f.bridge.refreshAdmission();
  assert.equal(isAuthoritySnapshotBlocked(view),elapsed>1000/60,'refresh must not reset or extend a batch');
  f.publish(snapshot(1));assert.equal(f.events.at(-1).delivery,elapsed===5?'sent':'skipped');
  assert.equal(isAuthoritySnapshotBlocked(view),true);
 }
});
test('admission stop, failed send, old port and no-SAB fallback keep lifecycle isolation',()=>{
 const f=fixture({sharedCompletion:true,sharedAdmission:true,queuedOnSend:4096}),old=attachAuthorityAdmission(f.events[0].admission);
 f.receive({type:'launch',matchId:'match'});f.receive({type:'ended',matchId:'match'});assert.equal(isAuthoritySnapshotBlocked(old),true);
 f.receive({type:'launch',matchId:'match'});f.refuse();f.publish(snapshot(1));assert.equal(isAuthoritySnapshotBlocked(old),false);assert.equal(f.port.closed,true);
 const events=[],port={start(){},close(){},postMessage:m=>events.push(m)};f.bridge.attach(port,'new',8);
 const next=attachAuthorityAdmission(events[0].admission);assert.notEqual(next.buffer,old.buffer);assert.equal(isAuthoritySnapshotBlocked(next),true);
 f.receive({type:'launch',matchId:'match'});assert.equal(isAuthoritySnapshotBlocked(next),true);
 for(const options of [{sharedCompletion:false,sharedAdmission:true},{sharedCompletion:true,sharedAdmission:false}]){
  const g=fixture(options);assert.equal(attachAuthorityAdmission(g.events[0].admission),null);g.receive({type:'launch',matchId:'match'});g.publish(snapshot(1));assert.equal(g.wire.length,1);
 }
});
test('admission diagnostics are separate from actual sends/skips and do not expose arbitrary data',()=>{
 const r=normalizeNetworkRecord({version:1,transport:'lan',event:'sample',hudAgeMs:0,hud:{authority:{ageMs:0,io:{sharedAdmission:true,preflightSkips:123,sent:7,skipped:2,secret:'no'}}}});
 assert.equal(r.hud.authority.io.sharedAdmission,true);assert.equal(r.hud.authority.io.preflightSkips,123);assert.equal(r.hud.authority.io.sent,7);assert.equal(r.hud.authority.io.skipped,2);assert.ok(!JSON.stringify(r).includes('secret'));
});
