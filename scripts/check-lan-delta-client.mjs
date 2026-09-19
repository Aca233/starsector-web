import assert from 'node:assert/strict';import{test}from'node:test';import vm from'node:vm';import{build}from'esbuild';
import{LanDeltaSender,lanDeltaTarget}from'../server/LanDeltaTransport.mjs';import{encodeBinaryState,encodeProjectedBinaryFrame}from'../src/network/BinarySnapshot.mjs';
const code=(await build({entryPoints:['src/network/protocol.ts'],bundle:true,platform:'browser',format:'cjs',write:false,define:{__LAN_BUILD_ID__:'"test"'}})).outputFiles[0].text;
function fixture(transport='lan',cap=true){
 const sockets=[],timers=new Map();let now=1,id=0;const document=new EventTarget();document.visibilityState='visible';
 class Socket{static OPEN=1;readyState=1;bufferedAmount=0;sent=[];constructor(){sockets.push(this);}send(m){this.sent.push(m);}close(){this.readyState=3;}}
 const sandbox={module:{exports:{}},exports:{},WebSocket:Socket,EventTarget,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,URL,DOMException,document,crypto:{getRandomValues:a=>a.fill(7)},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},performance:{now:()=>now},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:i=>timers.delete(i),setInterval:()=>++id,clearInterval(){}};
 sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 const c=new sandbox.module.exports.LanConnection(transport),seen=[];c.subscribe(m=>seen.push(m));c.connect('ws://127.0.0.1/lan/ws','test');const ws=sockets[0];ws.onopen();
 const receive=data=>{now++;ws.onmessage({data:typeof data==='string'||data instanceof ArrayBuffer?data:JSON.stringify(data)});};
 receive({type:'welcome',resumeToken:'a'.repeat(64),stateCredits:1,...(cap?{binaryDelta:1}:{})});
 return{c,ws,seen,receive,document,timers};
}
const target=seq=>lanDeltaTarget(encodeBinaryState('match',seq,encodeProjectedBinaryFrame({tick:seq,ships:[],ballast:'component-'.repeat(1500),value:seq})),seq);
const deliver=(f,s,seq)=>{const t=target(seq),choice=s.prepare(t);s.commit(choice);f.receive(choice.packet.buffer);return t;};
test('actual LanConnection negotiates, restores before subscribers/ACK, and reports COMPLETE snapshot bytes',()=>{
 const f=fixture(),s=new LanDeltaSender();assert.equal(JSON.parse(f.ws.sent[0]).binaryDelta,1);
 const t=deliver(f,s,1);assert.equal(f.c.snapshotBytes,t.bytes.length);assert.equal(f.seen.at(-1).frame.tick,1);
 assert.equal(JSON.parse(f.ws.sent.at(-1)).type,'state-consumed');s.ack(1);deliver(f,s,2);assert.equal(f.seen.at(-1).frame.tick,2);assert.equal(f.c.snapshotBytes,target(2).bytes.length);
 f.c.close();
});
test('CRC failure never emits/ACKs the state and uses existing bounded reconnect',()=>{
 const f=fixture(),s=new LanDeltaSender();deliver(f,s,1);s.ack(1);const c=s.prepare(target(2));c.packet[32]^=1;
 const receipts=f.ws.sent.length;f.receive(c.packet.buffer);assert.equal(f.ws.sent.length,receipts);assert.equal(f.seen.at(-1).type,'reconnecting');assert.equal(f.ws.readyState,3);assert.equal(f.seen.filter(m=>m.type==='state').length,1);f.c.close();
});
test('visibility and new-match epochs accept fresh anchors, never consume hidden deltas',()=>{
 const f=fixture(),s=new LanDeltaSender();deliver(f,s,1);s.ack(1);
 f.document.visibilityState='hidden';f.document.dispatchEvent(new Event('visibilitychange'));const count=f.seen.filter(m=>m.type==='state').length;deliver(f,s,2);assert.equal(f.seen.filter(m=>m.type==='state').length,count);
 f.document.visibilityState='visible';f.document.dispatchEvent(new Event('visibilitychange'));s.reset();deliver(f,s,3);assert.equal(f.seen.at(-1).frame.tick,3);
 f.receive({type:'match',match:{id:'match'}});s.reset();deliver(f,s,1);assert.equal(f.seen.at(-1).frame.tick,1);f.c.close();
});
test('LAN legacy server and Steam keep the existing full-frame route',()=>{
 for(const [transport,cap]of[['lan',false],['steam',true]]){const f=fixture(transport,cap);if(transport==='steam')assert.equal(JSON.parse(f.ws.sent[0]).binaryDelta,undefined);
 const t=target(1);f.receive(t.bytes.buffer);assert.equal(f.seen.at(-1).frame.tick,1);assert.equal(f.c.snapshotBytes,t.bytes.length);f.c.close();}
});
