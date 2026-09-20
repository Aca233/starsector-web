import assert from 'node:assert/strict';import {test} from 'node:test';import {once} from 'node:events';
import WebSocket,{WebSocketServer} from 'ws';
import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {LanStateCredits} from '../server/LanStateCredits.mjs';
import {LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';
import {encodeBinaryState,encodeProjectedBinaryFrame,decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {lanPerMessageDeflate} from '../server/lan-websocket.mjs';
test('real compressed WebSocket FIFO restores ordered bases while consumption ACKs are delayed',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0,perMessageDeflate:lanPerMessageDeflate()});await once(server,'listening');
 const accepted=once(server,'connection');const client=new WebSocket(`ws://127.0.0.1:${server.address().port}`,{perMessageDeflate:lanPerMessageDeflate()});
 const [peer]=await accepted;await once(client,'open');const sender=new LanDeltaSender({ordered:true}),receiver=new LanDeltaReceiver(),credits=new LanStateCredits();credits.recordNetworkRtt(60);
 let timer,deadline,seq=0,received=0,skipped=0;const timers=new Set(),expected=new Map();
 try {
  assert.match(peer.extensions,/permessage-deflate/);assert.equal(credits.capacity,5);
  await new Promise((resolve,reject)=>{
   deadline=setTimeout(()=>reject(Error('FIFO test timed out')),15000);
   client.on('error',reject);peer.on('error',reject);
   peer.on('message',raw=>{try{const {seq}=JSON.parse(raw);if(credits.ack(seq))sender.ack(seq);}catch(e){reject(e);}});
   client.on('message',(raw,binary)=>{try{
    if(!binary){assert.equal(JSON.parse(raw).type,'control');return;}
    const restored=receiver.decode(raw),state=decodeBinaryState(restored);assert.deepEqual(restored,new Uint8Array(expected.get(state.seq)));expected.delete(state.seq);received++;
    const handle=setTimeout(()=>{timers.delete(handle);if(client.readyState===1)client.send(JSON.stringify({seq:state.seq}));},80);timers.add(handle);
    if(received===30)resolve();
   }catch(e){reject(e);}});
   timer=setInterval(()=>{try{
    seq++;const bytes=encodeBinaryState('fifo',seq,encodeProjectedBinaryFrame({tick:seq,ships:[{id:'a',state:{ballast:'same-state-'.repeat(1500),x:seq}}]}));
    if(peer.bufferedAmount||!credits.reserve(seq,bytes.length)){skipped++;return;}
    const choice=sender.prepare(lanDeltaTarget(bytes,seq));expected.set(seq,bytes);peer.send(choice.packet);sender.commit(choice);peer.send(JSON.stringify({type:'control'}));
   }catch(e){reject(e);}},2);
  });
  assert.ok(skipped>0);assert.ok(sender.stats().delta>=29);assert.ok(expected.size<=5);assert.ok(credits.stats().inflight<=5);
 } finally {
  clearInterval(timer);clearTimeout(deadline);for(const t of timers)clearTimeout(t);client.terminate();peer.terminate();await new Promise(resolve=>server.close(resolve));
 }
});
