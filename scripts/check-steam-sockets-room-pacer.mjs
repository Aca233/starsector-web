import assert from 'node:assert/strict';import {test} from 'node:test';
import {SteamSocketRoomPacer,SOCKET_ROOM_LIMITS as L} from '../server/steam/sockets-room-pacer.mjs';
function fixture(count=9){
 const events=[],queries=[],native=new Map();const sessions=Array.from({length:count},(_,i)=>{const session={state:'ready',ticket:{handle:i+1},control:[],states:[1088],loopState:true,clockCalls:0,sentState:0,sentControl:0,
  pump({now,maxBytes,maxPackets,traffic}){this.clockCalls++;if(maxPackets===0){if(this.expireAt!==undefined&&now>this.expireAt)this.state='closed';return {bytes:0,packets:0};}if(this.state==='closed')return{bytes:0,packets:0};
   const queue=traffic==='control'?this.control:this.control.length?[]:this.states,bytes=queue[0]??0;if(!bytes||bytes>maxBytes||this.backpressure)return{bytes:0,packets:0};
   queue.shift();if(traffic==='state'&&this.loopState)queue.push(bytes);this[traffic==='control'?'sentControl':'sentState']++;
   native.get(this.ticket).pending+=bytes;events.push({i,traffic,bytes,now});return {bytes,packets:1};}};
  native.set(session.ticket,{pending:0,unacked:0,queue:[0,0,0],available:true,rate:1000000});return session;});
 const pacer=new SteamSocketRoomPacer({sample(ticket){queries.push(ticket);const s=native.get(ticket);if(s.throw)throw Error('status failed');return{available:s.available,pendingBytes:s.pending,unackedReliableBytes:s.unacked,sendRateBytesPerSecond:s.rate,lanes:s.queue.map((queueMs,lane)=>({lane,queueMs}))};}});
 const drain=()=>{for(const n of native.values())n.pending=0;};return{pacer,sessions,events,queries,native,drain};
}
test('all peers controls are offered before any state, under one shared byte budget',()=>{
 const f=fixture();for(const s of f.sessions)s.control=[100];const r=f.pacer.tick(f.sessions,0);assert.equal(r.controlBytes,900);assert.equal(r.packets,18);assert.ok(f.events.slice(0,9).every(e=>e.traffic==='control'));assert.ok(f.events.slice(9).every(e=>e.traffic==='state'));assert.equal(r.sampled,9);assert.ok(f.pacer.diagnostics().pendingEstimate<=L.stateBytes);
});
test('shadow native admissions prevent cached zero metrics multiplying per-peer credit',()=>{
 const f=fixture();for(let i=0;i<100;i++)f.pacer.tick(f.sessions,0);assert.equal(f.queries.length,9);assert.ok(f.events.reduce((sum,e)=>sum+e.bytes,0)<=L.stateBytes);assert.ok(f.pacer.diagnostics().pendingEstimate<=L.stateBytes);
 f.drain();const before=f.events.length;f.pacer.tick(f.sessions,24);assert.equal(f.queries.length,9);f.pacer.tick(f.sessions,25);assert.equal(f.queries.length,18);assert.ok(f.events.length>before);
});
test('state saturation leaves reserved shared space for urgent control messages',()=>{
 const f=fixture();for(let i=0;i<100;i++)f.pacer.tick(f.sessions,0);const saturated=f.pacer.diagnostics().pendingEstimate;assert.ok(saturated>L.stateBytes-1088);
 for(const s of f.sessions)s.control=[200];const r=f.pacer.tick(f.sessions,1);assert.equal(r.controlBytes,1800);assert.equal(r.stateBytes,0);assert.ok(f.pacer.diagnostics().pendingEstimate<=L.allBytes);
});
test('fresh native pending overflow or high state-lane queue delay blocks more states but permits bounded controls',()=>{
 for(const configure of [n=>{n.pending=L.peerStateBytes;},n=>{n.queue[2]=251;},n=>{n.queue[1]=null;}]){
  const f=fixture(1);configure(f.native.get(f.sessions[0].ticket));f.sessions[0].control=[100];const r=f.pacer.tick(f.sessions,0);assert.equal(r.stateBytes,0);assert.equal(r.controlBytes,100);
 }
});
test('failed native reads never turn a known backlog into zero-credit telemetry',()=>{
 const f=fixture(1),s=f.sessions[0],n=f.native.get(s.ticket);n.pending=L.peerStateBytes;f.pacer.tick([s],0);assert.equal(s.sentState,0);
 n.pending=0;n.throw=true;s.control=[100];const r=f.pacer.tick([s],25);assert.equal(r.bytes,0);assert.equal(f.pacer.diagnostics().pendingEstimate,L.peerStateBytes);assert.equal(f.pacer.diagnostics().unavailable,1);
 n.throw=false;f.pacer.tick([s],50);assert.equal(s.sentControl,1);assert.equal(s.sentState,1);
});
test('unknown telemetry allows only finite bootstrap controls and never state; read retries are rate-limited',()=>{
 const f=fixture(1),s=f.sessions[0];f.native.get(s.ticket).available=false;
 for(let i=0;i<400;i++){s.control=[1000];f.pacer.tick([s],i);}
 assert.equal(s.sentState,0);assert.equal(s.sentControl,16);assert.ok(f.queries.length<=17);assert.ok(f.pacer.diagnostics().pendingEstimate<=L.unknownControlBytes);
});
test('per-peer queue limit prevents one congested peer consuming every other peers state credit',()=>{
 const f=fixture(3);f.native.get(f.sessions[0].ticket).pending=L.peerStateBytes;f.pacer.tick(f.sessions,0);
 assert.equal(f.sessions[0].sentState,0);assert.equal(f.sessions[1].sentState,1);assert.equal(f.sessions[2].sentState,1);
});
test('large reliable and small replaceable jobs both make fair progress across nine peers',()=>{
 const f=fixture();for(let i=0;i<9;i++)f.sessions[i].states=[i<3?L.maxPacket:1088];
 for(let now=0;now<2000;now+=8){if(now%32===0)f.drain();f.pacer.tick(f.sessions,now);}
 for(const s of f.sessions)assert.ok(s.sentState>20,'every peer progresses');assert.ok(f.pacer.diagnostics().peakPendingEstimate<=L.stateBytes);
 const big=f.sessions.slice(0,3).map(s=>s.sentState);assert.ok(Math.max(...big)-Math.min(...big)<12,JSON.stringify(big));
});
test('backpressure consumes no admission credit and does not prevent other peers progress',()=>{
 const f=fixture(2);f.sessions[0].backpressure=true;const r=f.pacer.tick(f.sessions,0);assert.equal(r.stateBytes,1088);assert.equal(f.pacer.diagnostics().pendingEstimate,1088);assert.equal(f.sessions[1].sentState,1);
});
test('unacked reliable is not miscounted as unsent backlog and connection capacity estimates are not summed as uplink',()=>{
 const f=fixture(1),s=f.sessions[0],n=f.native.get(s.ticket);n.unacked=1000000;n.rate=null;const r=f.pacer.tick([s],0);assert.equal(r.stateBytes,1088);assert.equal(f.pacer.diagnostics().pendingEstimate,1088);assert.equal(f.pacer.diagnostics().unackedReliableBytes,1000000);
});
test('timeouts run even without metrics/credit; removed sessions release cached records',()=>{
 const f=fixture(2);f.sessions[0].expireAt=0;for(const n of f.native.values())n.available=false;f.pacer.tick(f.sessions,0);f.pacer.tick(f.sessions,1);assert.equal(f.pacer.diagnostics().peers,1);assert.ok(f.sessions[0].clockCalls>0);
 f.pacer.tick([],2);assert.equal(f.pacer.diagnostics().peers,0);assert.equal(f.pacer.diagnostics().pendingEstimate,0);assert.equal(f.pacer.clear(),true);
});
test('invalid peer sets, clocks, reentry or over-budget session results fail closed',()=>{
 const f=fixture(10);assert.throws(()=>f.pacer.tick(f.sessions,0));const [s]=f.sessions;assert.throws(()=>f.pacer.tick([s,s],0));assert.throws(()=>f.pacer.tick([s],NaN));f.pacer.tick([s],5);assert.throws(()=>f.pacer.tick([s],4));
 const g=fixture(1);g.sessions[0].pump=opts=>opts.maxPackets?{bytes:opts.maxBytes+1,packets:1}:{bytes:0,packets:0};assert.throws(()=>g.pacer.tick(g.sessions,0),/exceeded/);assert.equal(g.pacer.busy,false);assert.equal(g.pacer.diagnostics().faulted,true);assert.throws(()=>g.pacer.tick(g.sessions,1),/quarantined/);
 const recursive=new SteamSocketRoomPacer({sample:()=>{recursive.tick([],0);return null;}});assert.equal(recursive.tick([s],0).stateBytes,0,'reader exception becomes unknown, never free credit');
});
