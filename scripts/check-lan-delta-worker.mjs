import assert from 'node:assert/strict';import{test}from'node:test';import vm from'node:vm';import{build}from'esbuild';
import{LanDeltaSender,lanDeltaTarget}from'../server/LanDeltaTransport.mjs';import{encodeBinaryState,encodeProjectedBinaryFrame,decodeBinaryState}from'../src/network/BinarySnapshot.mjs';
const code=(await build({entryPoints:['src/network/lan-socket.worker.ts'],bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0].text;
function fixture(cap=true){
 const messages=[],sockets=[],cells=new Int32Array(new SharedArrayBuffer(32));let closed=false;
 class Socket{readyState=1;bufferedAmount=0;sent=[];constructor(){sockets.push(this);}send(data){this.sent.push(data);}close(){this.readyState=3;}}
 const sandbox={WebSocket:Socket,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Int32Array,SharedArrayBuffer,Atomics,setTimeout:()=>1,clearTimeout(){},close(){closed=true;},postMessage:(m,transfer=[])=>messages.push(structuredClone(m,{transfer}))};vm.runInNewContext(code,sandbox);
 const command=data=>sandbox.onmessage({data});command({type:'init',shared:cells.buffer});command({type:'connect',url:'ws://fake/lan/ws'});const ws=sockets[0];ws.onopen();
 const send=m=>{const data=JSON.stringify(m),size=new TextEncoder().encode(data).length;Atomics.add(cells,0,size);Atomics.add(cells,2,size);Atomics.add(cells,4,1);command({type:'send',data,size});};
 const receive=data=>ws.onmessage({data:typeof data==='string'||data instanceof ArrayBuffer?data:JSON.stringify(data)});
 send({type:'hello',stateCredits:1,...(cap?{binaryDelta:1}:{})});receive({type:'welcome',stateCredits:1,binaryDelta:1});
 const release=()=>{for(const m of messages.splice(0))if(m.type==='message'){Atomics.sub(cells,3,m.size);Atomics.sub(cells,5,1);}};release();
 return{ws,receive,send,messages,cells,release,get closed(){return closed;}};
}
const target=seq=>lanDeltaTarget(encodeBinaryState('match',seq,encodeProjectedBinaryFrame({tick:seq,ships:[],ballast:'component-'.repeat(1500),value:seq})),seq);
const packet=(s,seq)=>{const t=target(seq),c=s.prepare(t);s.commit(c);return c.packet;};
test('I/O Worker restores off-thread, transfers owned bytes and charges EXPANDED queue size without auto-ACK',()=>{
 const f=fixture(),s=new LanDeltaSender();f.receive(packet(s,1).buffer);let m=f.messages.at(-1);assert.equal(decodeBinaryState(m.data).frame.tick,1);assert.equal(m.size,target(1).bytes.length);assert.equal(f.cells[3],m.size);f.release();s.ack(1);
 for(let seq=2;seq<10;seq++){f.receive(packet(s,seq).buffer);m=f.messages.at(-1);assert.equal(decodeBinaryState(m.data).frame.tick,seq);assert.equal(f.cells[3],target(seq).bytes.length);f.release();s.ack(seq);}
 assert.equal(f.ws.sent.length,1);assert.equal(f.cells[3],0);assert.equal(f.closed,false);
});
test('Worker does not decode unnegotiated packets and closes on negotiated baseline corruption',()=>{
 const legacy=fixture(false),s=new LanDeltaSender(),first=packet(s,1);legacy.receive(first.buffer);assert.equal(new Uint8Array(legacy.messages.at(-1).data)[1],76); // SLD1, untouched.
 const f=fixture(),sender=new LanDeltaSender();f.receive(packet(sender,1).buffer);f.release();sender.ack(1);const bad=packet(sender,2);bad[32]^=1;f.receive(bad.buffer);assert.equal(f.closed,true);assert.equal(f.messages.at(-1).type,'failed');assert.equal(f.cells[3],0);
});
test('Worker hidden/new-match epochs release baselines and accept a fresh full anchor',()=>{
 const f=fixture(),s=new LanDeltaSender();f.receive(packet(s,1).buffer);f.release();s.ack(1);
 f.send({type:'visibility',hidden:true});f.receive(packet(s,2).buffer);assert.equal(new Uint8Array(f.messages.at(-1).data)[1],76);f.release();
 f.send({type:'visibility',hidden:false});s.reset();f.receive(packet(s,3).buffer);assert.equal(decodeBinaryState(f.messages.at(-1).data).frame.tick,3);f.release();
 f.receive({type:'match',match:{id:'match'}});f.release();s.reset();f.receive(packet(s,1).buffer);assert.equal(decodeBinaryState(f.messages.at(-1).data).frame.tick,1);assert.equal(f.closed,false);
});
