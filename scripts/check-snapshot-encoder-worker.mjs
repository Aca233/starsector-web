import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {Worker} from 'node:worker_threads';
import {transform} from 'esbuild';
import {SnapshotTapeWriter,readSnapshotTape,TAPE_MAX_BYTES} from '../src/network/SnapshotTape.mjs';
import {createEncodeMailbox,reserveEncodeMailbox,cancelEncodeMailbox,completeEncodeMailbox,takeEncodeMailbox,ENCODE_SLOT_BYTES} from '../src/network/SnapshotEncodeMailbox.mjs';
import {encodeSnapshotJob} from '../src/network/SnapshotEncodeJob.mjs';
import {encodeProjectedBinaryFrame,encodeProjectedSnapshotTape,replaceProjectedTapeSounds} from '../src/network/BinarySnapshot.mjs';
const roundtrip=v=>readSnapshotTape(new SnapshotTapeWriter().encode(v));
const plain=v=>JSON.parse(JSON.stringify(v));
const frame=(sounds=[])=>({tick:12,acknowledged:{0:23},world:{combatTime:1,pos:{$vector:[1,2]},record:{$record:['x',3]}},ships:[],sounds});
// eslint-disable-next-line no-sparse-arrays -- Deliberately test projected array holes.
const sample=[null,true,false,0,-0,Number.MIN_VALUE,Number.MAX_VALUE,1/3,Number.MAX_SAFE_INTEGER,'','汉字🙂','\ud800',undefined,[,1,undefined],{omit:undefined,n:null}];
test('tape scalar/array/object semantics match projected codec exactly',()=>{
 const value=frame();value.world.data=sample;
 const restored=roundtrip(value);
 assert.deepEqual(encodeProjectedBinaryFrame(restored,true),encodeProjectedBinaryFrame(value,true));
 assert.ok(Object.is(restored.world.data[4],-0));assert.equal(restored.world.data[11],'\ud800');
 assert.equal(Object.getPrototypeOf(restored),null);assert.ok(!Object.hasOwn(restored.world.data.at(-1),'omit'));
});
test('deterministic generated trees preserve every byte of the existing network format',()=>{
 let seed=917;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 const tree=depth=>{const k=depth>4?0:Math.floor(rand()*4);if(k===0)return sample[Math.floor(rand()*sample.length)];if(k===1)return Array.from({length:Math.floor(rand()*12)},()=>tree(depth+1));if(k===2)return Object.fromEntries(Array.from({length:Math.floor(rand()*8)},(_,i)=>['k'+i,tree(depth+1)]));return rand()*1e7;};
 for(let i=0;i<200;i++){const f=frame();f.world.data=tree(0);assert.deepEqual(encodeProjectedBinaryFrame(roundtrip(f),true),encodeProjectedBinaryFrame(f,true));assert.deepEqual(encodeProjectedSnapshotTape(new SnapshotTapeWriter().encode(f))?.bytes??null,encodeProjectedBinaryFrame(f,true));}
});
test('numeric array fast path grows after nested entries; transfer detaches then buffer can be reused',()=>{
 const w=new SnapshotTapeWriter();const v=[Array(66000).fill(3),...Array(100000).fill(123.5)];const t=w.encode(v);
 assert.ok(t.buffer.byteLength>512*1024);const copy=structuredClone(t,{transfer:[t.buffer]});assert.equal(t.buffer.byteLength,0);
 assert.deepEqual(plain(readSnapshotTape(copy)),v);assert.deepEqual(plain(readSnapshotTape(w.encode([7]))),[7]);
 w.reuse(copy.buffer);assert.equal(w.buffer,copy.buffer);assert.deepEqual(plain(readSnapshotTape(w.encode([8]))),[8]);
});
test('unsupported and excessive projections fall back without changing accepted network limit',()=>{
 const w=new SnapshotTapeWriter();for(const v of [NaN,Infinity,1n,new Date(),new Uint8Array(1),()=>{}])assert.equal(w.encode(v),null);
 const cyclic={};cyclic.x=cyclic;assert.equal(w.encode(cyclic),null);
 assert.equal(w.encode('x'.repeat(262145)),null);assert.equal(w.encode(Array.from({length:16385},(_,i)=>'s'+i)),null);
 assert.equal(w.encode(Array(TAPE_MAX_BYTES/8).fill(0)),null);
 assert.deepEqual(plain(readSnapshotTape(w.encode({ok:true}))),{ok:true});
});
test('malformed private tapes are rejected and __proto__ remains inert',()=>{
 const w=new SnapshotTapeWriter();const t=w.encode(JSON.parse('{"__proto__":{"polluted":true},"constructor":2}'));const r=readSnapshotTape(t);assert.equal(Object.getPrototypeOf(r),null);assert.equal({}.polluted,undefined);assert.equal(r.__proto__.polluted,true);
 for(const bad of [{...t,words:0},{...t,words:1e9},{...t,words:t.words-1},{...t,strings:[null]},{...t,buffer:new ArrayBuffer(3)}])assert.throws(()=>readSnapshotTape(bad));
 const malformed=w.encode([1]);new Uint32Array(malformed.buffer)[0]=0xffffffff;assert.throws(()=>readSnapshotTape(malformed));
 const duplicate=w.encode({a:1,b:2});new Uint32Array(duplicate.buffer)[6]=0;assert.throws(()=>readSnapshotTape(duplicate));
});
test('mailbox is exact-ID single-use, rejects late completion, owns outputs and preserves limits',()=>{
 const m=createEncodeMailbox();reserveEncodeMailbox(m,1);assert.equal(takeEncodeMailbox(m,1),null);assert.equal(completeEncodeMailbox(m,2,new Uint8Array([9]),null,1),false);
 const a=new Uint8Array([1,2]),b=new Uint8Array([3]);assert.ok(completeEncodeMailbox(m,1,a,b,1.234));const r=takeEncodeMailbox(m,1);a.fill(9);assert.deepEqual([...r.display],[1,2]);assert.deepEqual([...r.network],[3]);assert.notEqual(r.display.buffer,r.network.buffer);assert.equal(r.workerMs,1.234);assert.equal(takeEncodeMailbox(m,1),null);
 reserveEncodeMailbox(m,2);cancelEncodeMailbox(m);assert.equal(completeEncodeMailbox(m,2,a,b,0),false);assert.equal(takeEncodeMailbox(m,2),null);
 reserveEncodeMailbox(m,3);completeEncodeMailbox(m,3,new Uint8Array(ENCODE_SLOT_BYTES+1),null,0);assert.equal(takeEncodeMailbox(m,3).fallback,true);
 reserveEncodeMailbox(m,4);completeEncodeMailbox(m,4,new Uint8Array(ENCODE_SLOT_BYTES),null,0);assert.equal(takeEncodeMailbox(m,4).display.length,ENCODE_SLOT_BYTES);assert.deepEqual([...r.display],[1,2]);
 for(const id of [0,-1,1.5,0x7fffffff])assert.throws(()=>reserveEncodeMailbox(m,id));
});
test('real threaded helper publishes exact bytes with transferred tape and polled shared result',async()=>{
 const mailbox=createEncodeMailbox();reserveEncodeMailbox(mailbox,1);const f=frame([{id:1,key:'sound'}]);const tape=new SnapshotTapeWriter().encode(f);
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');parentPort.on('message',async m=>{const {encodeSnapshotJob}=await import(m.module);encodeSnapshotJob(m.job,m.mailbox);parentPort.postMessage({buffer:m.job.tape.buffer},[m.job.tape.buffer]);});`,{eval:true});
 try{const done=new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});worker.postMessage({module:new URL('../src/network/SnapshotEncodeJob.mjs',import.meta.url).href,mailbox,job:{id:1,tape,display:true,network:true,networkSounds:f.sounds}},[tape.buffer]);assert.equal(tape.buffer.byteLength,0);await done;const r=takeEncodeMailbox(mailbox,1);assert.equal(r.fallback,false);assert.deepEqual(r.display,encodeProjectedBinaryFrame(f,true));assert.deepEqual(r.network,r.display);}finally{await worker.terminate();}
});
test('helper respects independently captured sounds and per-lane enablement; invalid tape falls back',()=>{
 for(const display of [false,true])for(const network of [false,true]){const mailbox=createEncodeMailbox();reserveEncodeMailbox(mailbox,1);const f=frame([{id:1,key:'a'}]),networkSounds=[{id:2,key:'b'}];encodeSnapshotJob({id:1,tape:new SnapshotTapeWriter().encode(f),display,network,networkSounds},mailbox);const r=takeEncodeMailbox(mailbox,1);assert.equal(r.fallback,false);assert.deepEqual(r.display,display?encodeProjectedBinaryFrame(f,true):null);assert.deepEqual(r.network,network?encodeProjectedBinaryFrame({...f,sounds:networkSounds},true):null);}
 const m=createEncodeMailbox();reserveEncodeMailbox(m,2);encodeSnapshotJob({id:2,tape:{}},m);assert.equal(takeEncodeMailbox(m,2).fallback,true);
});
const brokerSource=(await transform(fs.readFileSync('src/network/SnapshotEncoderBroker.ts','utf8').replace(/^import .*;$/gm,'').replace('export class','class').replace('import.meta.url',JSON.stringify(import.meta.url))+'\nglobalThis.Broker=SnapshotEncoderBroker;',{loader:'ts',target:'es2022'})).code;
function brokerFixture(){let clock=0,worker,wakes=0;const context={SnapshotTapeWriter,createEncodeMailbox,reserveEncodeMailbox,cancelEncodeMailbox,takeEncodeMailbox,ArrayBuffer,URL,performance:{now:()=>clock},Worker:class{
 constructor(){worker=this;this.posts=[];this.terminated=false;}postMessage(m,transfer=[]){this.posts.push(structuredClone(m,{transfer}));}terminate(){this.terminated=true;}emit(data){this.onmessage({data});}
 }};vm.createContext(context);vm.runInContext(brokerSource,context);const broker=new context.Broker(()=>wakes++);return{broker,worker,at:t=>clock=t,wakes:()=>wakes,mailbox:worker.posts[0].mailbox};}
test('broker queues only one job, polls before events, returns buffers and never fabricates credit',()=>{
 const f=brokerFixture(),b=f.broker;assert.equal(b.available,false);f.worker.emit({type:'ready'});assert.equal(b.available,true);
 const id=b.submit(frame(),true,true,[]);assert.equal(id,1);assert.equal(b.busy,true);assert.equal(b.submit(frame(),true,true,[]),null);const job=f.worker.posts[1];assert.equal(b.stats.transferBytes,job.tape.buffer.byteLength);assert.equal(b.stats.tapeBytes,job.tape.words*8);encodeSnapshotJob(job,f.mailbox);const r=b.poll();assert.equal(r.id,1);assert.equal(b.available,true);assert.equal(b.stats.completed,1);f.worker.emit({type:'complete',id,buffer:job.tape.buffer});assert.equal(b.submit(frame(),true,false,[]),2);b.close();assert.ok(f.worker.terminated);
});
test('broker startup/job timeout, crash and cancellation terminate bounded work and fall back',()=>{
 for(const mode of ['timeout','crash','cancel']){const f=brokerFixture(),b=f.broker;f.worker.emit({type:'ready'});b.submit(frame(),true,true,[]);if(mode==='timeout')f.at(1001);if(mode==='crash')f.worker.onerror({preventDefault(){}});if(mode==='cancel')b.cancel();const result=b.poll();assert.equal(result?.fallback??null,mode==='cancel'?null:true);assert.equal(b.busy,false);assert.equal(b.available,false);assert.ok(f.worker.terminated);f.worker.emit({type:'complete',id:1,buffer:new ArrayBuffer(524288)});assert.equal(b.available,false);}
 const start=brokerFixture();start.at(3001);start.broker.poll();assert.ok(start.worker.terminated);assert.equal(start.broker.stats.fallbacks,1);
});
test('broker rejects failed initialization, post failure, oversized result and corrupted mailbox without leaving a live job',()=>{
 const f=brokerFixture();f.worker.emit({type:'ready'});f.worker.postMessage=()=>{throw Error('transfer failed');};assert.equal(f.broker.submit(frame(),true,true,[]),null);assert.ok(f.worker.terminated);assert.equal(f.broker.busy,false);assert.equal(f.broker.stats.reason,'post-failed');
 const g=brokerFixture();g.worker.emit({type:'ready'});g.broker.submit(frame(),true,true,[]);completeEncodeMailbox(g.mailbox,1,new Uint8Array(ENCODE_SLOT_BYTES+1),null,0);assert.equal(g.broker.poll().fallback,true);assert.equal(g.broker.stats.reason,'worker-fallback');
 const h=brokerFixture();h.worker.emit({type:'ready'});h.broker.submit(frame(),true,true,[]);completeEncodeMailbox(h.mailbox,1,new Uint8Array([1]),null,0);Atomics.store(new Int32Array(h.mailbox),1,ENCODE_SLOT_BYTES+1);assert.equal(h.broker.poll().fallback,true);assert.equal(h.broker.stats.reason,'invalid-mailbox');assert.ok(h.worker.terminated);
 let terminated=false;const context={SnapshotTapeWriter,createEncodeMailbox,reserveEncodeMailbox,cancelEncodeMailbox,takeEncodeMailbox,ArrayBuffer,URL,performance,Worker:class{postMessage(){throw Error('init failed');}terminate(){terminated=true;}}};vm.createContext(context);vm.runInContext(brokerSource,context);assert.throws(()=>new context.Broker(()=>{}),/init failed/);assert.equal(terminated,true);
});
test('private 2 MiB output cap falls back for a still-valid larger SWF2 frame, never shrinks protocol budget',()=>{
 const f=frame();f.world.values=Array(250000).fill(.5);const wire=encodeProjectedBinaryFrame(f,true);assert.ok(wire.length>ENCODE_SLOT_BYTES);const tape=new SnapshotTapeWriter().encode(f);assert.ok(tape);const m=createEncodeMailbox();reserveEncodeMailbox(m,1);encodeSnapshotJob({id:1,tape,display:true,network:true,networkSounds:[]},m);const result=takeEncodeMailbox(m,1);assert.equal(result.fallback,true);assert.equal(result.display,null);assert.equal(result.network,null);
});

test('direct tape transcoding preserves numeric widths, key order and owned output',()=>{
 const w=new SnapshotTapeWriter();
 const numbers=[-Number.MAX_SAFE_INTEGER,-4294967296,-2147483649,-2147483648,-32769,-32768,-129,-128,-33,-32,-1,-0,0,127,128,255,256,65535,65536,4294967295,4294967296,Number.MAX_SAFE_INTEGER,Number.MIN_VALUE,Number.MAX_VALUE,1/3];
 const values=[...numbers,null,true,false,'','中文 🚀','x'.repeat(300),[],{},Array(66000).fill(.25),{8:'index8',2:'index2','01':'string',a:{b:numbers}}];
 for(const value of values){const expected=encodeProjectedBinaryFrame(value,true),result=encodeProjectedSnapshotTape(w.encode(value));assert.deepEqual(result.bytes,expected);const saved=result.bytes.slice();encodeProjectedSnapshotTape(w.encode([1,2,3]));assert.deepEqual(result.bytes,saved);}
 const f=frame();f.world.data=numbers;const tape=w.encode(f);const transfer=structuredClone(tape,{transfer:[tape.buffer]});assert.equal(tape.buffer.byteLength,0);assert.deepEqual(encodeProjectedSnapshotTape(transfer).bytes,encodeProjectedBinaryFrame(f,true));
});
test('direct sound splice retains root field order, lane ID semantics and depth budget',()=>{
 const sound=(id,volume=1)=>({id,type:'fire',volume,x:1,y:2});
 // Sounds need not be the last map entry. Nested world.sounds is untouched.
 const f={sounds:[sound(1)],...frame(),after:12};f.sounds=[sound(1)];f.world.sounds=[sound(44)];
 const w=new SnapshotTapeWriter(),encoded=encodeProjectedSnapshotTape(w.encode(f));
 assert.deepEqual(encoded.bytes,encodeProjectedBinaryFrame(f,true));
 for(const sounds of [[],[sound(2)],[sound(2),sound(3)]])assert.deepEqual(replaceProjectedTapeSounds(encoded,sounds),encodeProjectedBinaryFrame({...f,sounds},true));
 const mailbox=createEncodeMailbox();reserveEncodeMailbox(mailbox,17);
 encodeSnapshotJob({id:17,tape:w.encode(f),display:true,network:true,networkSounds:[sound(1,.25)]},mailbox);
 const result=takeEncodeMailbox(mailbox,17);assert.equal(result.fallback,false);assert.deepEqual(result.network,result.display);assert.notEqual(result.network.buffer,result.display.buffer);
 let atLimit=0;for(let i=0;i<126;i++)atLimit=[atLimit];
 assert.deepEqual(replaceProjectedTapeSounds(encoded,atLimit),encodeProjectedBinaryFrame({...f,sounds:atLimit},true));
 assert.throws(()=>replaceProjectedTapeSounds(encoded,[atLimit]),/depth|deep/i);
 assert.throws(()=>encodeProjectedBinaryFrame({...f,sounds:[atLimit]},true),/depth|deep/i);
 assert.equal(replaceProjectedTapeSounds(encoded,['\ud800']),null);
});
test('direct tape reader rejects malformed tags, counts, keys and deep numeric arrays',()=>{
 const w=new SnapshotTapeWriter();
 for(const value of [JSON.parse('{"__proto__":1}'),{constructor:1},{a:'\ud800'}])assert.equal(encodeProjectedSnapshotTape(w.encode(value)),null);
 for(const edit of [t=>{t.words--;},t=>{t.words++;},t=>{new Uint32Array(t.buffer)[0]=0xffffffff;},t=>{new Uint32Array(t.buffer)[1]=0x7ff80077;}]){const t=w.encode([2]);edit(t);assert.throws(()=>encodeProjectedSnapshotTape(t),/Invalid snapshot tape/);}
 for(const value of [{a:1,b:2},{a:1,b:2,c:3}]){const t=w.encode(value);new Uint32Array(t.buffer)[6]=0;assert.throws(()=>encodeProjectedSnapshotTape(t),/Invalid snapshot tape/);}
 const wrongKey=w.encode({a:1});new Float64Array(wrongKey.buffer)[1]=42;assert.throws(()=>encodeProjectedSnapshotTape(wrongKey),/Invalid snapshot tape/);
 const noncanonical=w.encode({'1':1,'2':2});[noncanonical.strings[0],noncanonical.strings[1]]=[noncanonical.strings[1],noncanonical.strings[0]];assert.equal(encodeProjectedSnapshotTape(noncanonical),null);
 let deep=2;for(let i=0;i<128;i++)deep=[deep];const deepTape=w.encode(deep);assert.ok(deepTape);assert.throws(()=>readSnapshotTape(deepTape),/Invalid snapshot tape/);assert.throws(()=>encodeProjectedSnapshotTape(deepTape),/Invalid snapshot tape/);
 assert.deepEqual(encodeProjectedSnapshotTape(w.encode(frame())).bytes,encodeProjectedBinaryFrame(frame(),true));
});
