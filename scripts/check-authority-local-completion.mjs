import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAuthorityCompletion, attachAuthorityCompletion, closeAuthorityCompletion, readAuthorityCompletion, writeAuthorityCompletion} from '../src/network/AuthorityLocalCompletion.mjs';
import {AuthorityIoBridge} from '../src/network/AuthorityIoBridge.mjs';
import {encodeProjectedBinaryFrame,decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {normalizeNetworkRecord} from '../desktop/network-diagnostic-record.mjs';

test('fixed-size optional local journal handles both lanes and full safe-integer sequences',()=>{
 assert.equal(createAuthorityCompletion(false),null);assert.equal(attachAuthorityCompletion(new ArrayBuffer(52)),null);assert.equal(attachAuthorityCompletion(new SharedArrayBuffer(4)),null);
 const v=createAuthorityCompletion(true),r=attachAuthorityCompletion(v.buffer);assert.equal(v.byteLength,68);assert.equal(attachAuthorityCompletion(new SharedArrayBuffer(52)),null);assert.equal(readAuthorityCompletion(r,'snapshot',0),null);
 for(const tick of [0,0x7fffffff,0xffffffff,2**40,Number.MAX_SAFE_INTEGER])for(const delivery of ['sent','skipped']){
  const receipt={tick,nextSequence:Number.MAX_SAFE_INTEGER,delivery};writeAuthorityCompletion(v,'snapshot',receipt);assert.deepEqual(readAuthorityCompletion(r,'snapshot',tick),receipt);assert.equal(readAuthorityCompletion(r,'motion',tick),null);assert.equal(readAuthorityCompletion(r,'snapshot',null),null);
 }
 const receipt={tick:1,nextSequence:12,delivery:'skipped'};writeAuthorityCompletion(v,'motion',receipt);assert.deepEqual(readAuthorityCompletion(r,'motion',1),receipt);
 closeAuthorityCompletion(v);assert.equal(readAuthorityCompletion(r,'motion',1),null);writeAuthorityCompletion(v,'motion',{...receipt,tick:2});assert.equal(readAuthorityCompletion(r,'motion',2),null);
});
test('in-progress journal writes and invalid receipts never release a slot',()=>{
 const v=createAuthorityCompletion(true);writeAuthorityCompletion(v,'snapshot',{tick:1,nextSequence:1,delivery:'sent'});Atomics.add(v,1,1);assert.equal(readAuthorityCompletion(v,'snapshot',1),null);
 for(const receipt of [{tick:-1,nextSequence:2,delivery:'sent'},{tick:1,nextSequence:NaN,delivery:'sent'},{tick:1,nextSequence:2,delivery:'ack'}])assert.throws(()=>writeAuthorityCompletion(v,'snapshot',receipt));
});
function fixture(sharedCompletion=true){const events=[],wire=[];let bytes=0,fail=false;const port={start(){},close(){},postMessage:m=>events.push(m)};
 const bridge=new AuthorityIoBridge({sharedCompletion,send:m=>{if(fail)throw Error('closed');wire.push(m);},buffered:()=>bytes});bridge.attach(port,'match',7);
 const view=attachAuthorityCompletion(events[0].completion);return{bridge,port,view,events,wire,block:n=>bytes=n,fail:()=>fail=true};}
const snapshot=tick=>{const binary=encodeProjectedBinaryFrame({tick,ships:[],world:{combatTime:tick/60}}).buffer;return{type:'snapshot',tick,binary,bytes:binary.byteLength};};
test('journal becomes visible only after socket send returns; skip is not a send or a remote ACK',()=>{
 const f=fixture();f.bridge.observe('{"type":"launch","matchId":"match"}');f.bridge.publish(snapshot(1));assert.equal(decodeBinaryState(f.wire[0]).seq,7);assert.deepEqual(readAuthorityCompletion(f.view,'snapshot',1),{tick:1,nextSequence:8,delivery:'sent'});
 f.block(10000000);f.bridge.publish(snapshot(2));assert.equal(f.wire.length,1);assert.deepEqual(readAuthorityCompletion(f.view,'snapshot',2),{tick:2,nextSequence:8,delivery:'skipped'});
 f.bridge.publish({type:'barrier',id:3});assert.equal(f.events.at(-1).type,'io-barrier');assert.ok(!f.events.some(e=>e.type==='ack'||e.type==='state-consumed'));
});
test('send failure revokes journal, and rebound port never reuses old completion',()=>{
 const f=fixture();f.bridge.observe('{"type":"launch","matchId":"match"}');f.port.onmessage({data:snapshot(1)});const old=f.port.onmessage;
 f.fail();f.port.onmessage({data:snapshot(2)});assert.equal(readAuthorityCompletion(f.view,'snapshot',1),null);assert.equal(f.events.at(-1).type,'io-unavailable');assert.equal(f.events.at(-1).nextSequence,9);
 const events=[],port={start(){},close(){},postMessage:m=>events.push(m)};f.bridge.attach(port,'new',9);assert.notEqual(events[0].completion,f.view.buffer);old({data:snapshot(3)});assert.equal(f.wire.length,1);
});
test('non-isolated/disabled bridge preserves the original MessagePort fallback',()=>{
 const f=fixture(false);assert.equal(f.view,null);assert.deepEqual(f.events[0],{type:'io-ready'});f.bridge.observe('{"type":"launch","matchId":"match"}');f.bridge.publish(snapshot(1));assert.equal(f.events.at(-1).type,'io-snapshot');assert.equal(f.events.at(-1).nextSequence,8);
});
test('exported diagnostics identify actual shared completion use, without changing Hz',()=>{
 const r=normalizeNetworkRecord({version:1,event:'sample',transport:'lan',hudAgeMs:0,hud:{hz:37,authority:{ageMs:0,io:{enabled:true,sharedCredit:true,sharedCompletions:53,secret:'no'}}}});
 assert.equal(r.hud.hz,37);assert.equal(r.hud.authority.io.sharedCredit,true);assert.equal(r.hud.authority.io.sharedCompletions,53);assert.ok(!JSON.stringify(r).includes('secret'));
});
test('real concurrent writer cannot expose mixed tick/sequence/delivery records',async(t)=>{
 const {Worker}=await import('node:worker_threads');const {setImmediate:later}=await import('node:timers/promises');
 const view=createAuthorityCompletion(true);const path=new URL('../src/network/AuthorityLocalCompletion.mjs',import.meta.url).href;
 const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {writeAuthorityCompletion}=await import(workerData.path);const v=new Int32Array(workerData.buffer);for(let tick=1;tick<=2000;tick++){writeAuthorityCompletion(v,'snapshot',{tick,attempt:2**41+tick*5,nextSequence:2**40+tick*3,delivery:tick%2?'sent':'skipped'});if(tick===1){parentPort.postMessage('checkpoint');await new Promise(r=>parentPort.once('message',r));}if(tick%10===0)await new Promise(r=>setImmediate(r));}parentPort.postMessage('done');})()`,{eval:true,workerData:{path,buffer:view.buffer}});
 t.after(()=>worker.terminate());let done=false,reads=0,error;worker.once('error',e=>{error=e;done=true;});worker.on('message',m=>{if(m==='done')done=true;else {const r=readAuthorityCompletion(view,'snapshot',1);assert.equal(r.nextSequence,2**40+3);reads++;worker.postMessage('continue');}});
 const deadline=Date.now()+10000;
 while(!done&&Date.now()<deadline){const expected=Atomics.load(view,2)>>>0;const r=readAuthorityCompletion(view,'snapshot',expected);if(r){reads++;assert.equal(r.nextSequence,2**40+r.tick*3);assert.equal(r.attempt,2**41+r.tick*5);assert.equal(r.delivery,r.tick%2?'sent':'skipped');}await later();}
 if(error)throw error;assert.equal(done,true);const final=readAuthorityCompletion(view,'snapshot',2000);assert.equal(final.nextSequence,2**40+6000);assert.equal(final.attempt,2**41+10000);assert.ok(reads>0);
});

test('same-tick retries require exact safe-integer attempt identity in the shared journal',()=>{const view=createAuthorityCompletion(true);for(const attempt of [1,2,2**40,Number.MAX_SAFE_INTEGER]){const receipt={tick:61,nextSequence:8,delivery:'skipped',attempt};writeAuthorityCompletion(view,'snapshot',receipt);assert.deepEqual(readAuthorityCompletion(view,'snapshot',61,attempt),receipt);assert.equal(readAuthorityCompletion(view,'snapshot',61,attempt-1),null);}for(const attempt of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){assert.throws(()=>writeAuthorityCompletion(view,'snapshot',{tick:61,nextSequence:8,delivery:'sent',attempt}));assert.equal(readAuthorityCompletion(view,'snapshot',61,attempt),null);}});
test('bridge echoes attempt on send and skip without adding it to external LAN/Steam state packets',()=>{for(const shared of [true,false]){const f=fixture(shared);f.bridge.observe('{"type":"launch","matchId":"match"}');f.bridge.publish({...snapshot(61),attempt:7});assert.equal(f.events.at(-1).attempt,7);assert.equal(f.events.at(-1).delivery,'sent');assert.equal(Object.hasOwn(decodeBinaryState(f.wire[0]),'attempt'),false);f.block(10000000);f.bridge.publish({...snapshot(61),attempt:8});assert.equal(f.events.at(-1).attempt,8);assert.equal(f.events.at(-1).delivery,'skipped');assert.equal(f.wire.length,1);if(shared){assert.equal(readAuthorityCompletion(f.view,'snapshot',61,7),null);assert.equal(readAuthorityCompletion(f.view,'snapshot',61,8).delivery,'skipped');}for(const attempt of [0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>f.bridge.publish({...snapshot(61),attempt}));}});
