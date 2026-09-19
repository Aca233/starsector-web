import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { SteamSocketSession } from '../server/steam/sockets-session.mjs';
import { SteamSocketFlightBudget } from '../server/steam/sockets-flight-budget.mjs';
import { SteamSocketRoomPacer } from '../server/steam/sockets-room-pacer.mjs';
import { SocketWireBudget,SocketWireReceiver,socketWireFrame,socketWireHeader,SOCKET_WIRE_HEADER,SOCKET_WIRE_MAX,SOCKET_SNAPSHOT_TTL,ZERO_NONCE } from '../server/steam/sockets-wire.mjs';
const HOST='76561198000000001',GUEST='76561198000000002',ROOM='10977524000000001',BUILD='wire-test-build';
const H='a'.repeat(32),G='b'.repeat(32),state=(seq,ballast='',matchId='battle')=>({type:'state',matchId,seq,frame:{tick:seq,ballast,x:Math.sin(seq)*100}});
const prepared=value=>{const payload=Buffer.from(JSON.stringify(value));return{payload,rawBytes:payload.length,zipped:false};};
function frame(op,value,{source=H,target=G,id=1,epoch=0}={}){return socketWireFrame({op,source,target,id,epoch,prepared:prepared(value)});}
function fixture({hostBuild=BUILD,guestBuild=BUILD,guestProtocol=25,hostFlight=false,guestFlight=hostFlight}={}){
 const ht={handle:1001,lease:'111',remote:GUEST,scope:ROOM},gt={handle:1002,lease:'222',remote:HOST,scope:ROOM},network=[],sent=[],closed=[];let policy=()=>({status:'accepted'});
 const budget=new SocketWireBudget();
 function transport(side){return {send(ticket,data,kind){const result=policy(side,data,kind);sent.push({side,data:Buffer.from(data),kind,status:result.status});if(result.status==='accepted')network.push({side:side==='host'?'guest':'host',ticket:side==='host'?gt:ht,data:Buffer.from(data),kind});return result;},disconnect(ticket){closed.push({side,ticket});return true;}};}
 const host=new SteamSocketSession({transport:transport('host'),ticket:ht,localId:HOST,ownerId:HOST,build:hostBuild,gameProtocol:25,nonce:H,wireBudget:budget,flightBudget:hostFlight?new SteamSocketFlightBudget():null});
 const guest=new SteamSocketSession({transport:transport('guest'),ticket:gt,localId:GUEST,ownerId:HOST,build:guestBuild,gameProtocol:guestProtocol,nonce:G,wireBudget:budget,flightBudget:guestFlight?new SteamSocketFlightBudget({inputOnly:true}):null});
 const sessions={host,guest};host.start(0);guest.start(0);
 function deliver(now,filter=()=>true){const batch=network.splice(0);for(const m of batch)if(filter(m))sessions[m.side].receive(m,now);return batch;}
 function pump(now,maxBytes=65536,maxPackets=64){host.pump({now,maxBytes,maxPackets});guest.pump({now,maxBytes,maxPackets});}
 function exchange(now=0,rounds=16){for(let i=0;i<rounds;i++){pump(now);deliver(now);}}
 function ready(){exchange();assert.equal(host.state,'ready');assert.equal(guest.state,'ready');host.takeEvents();guest.takeEvents();}
 function inject(side,f,now=0,ticket=side==='host'?ht:gt){for(let i=0;i<f.count;i++)sessions[side].receive({ticket,kind:f.kind,data:f.packet(i)},now);}
 return {host,guest,ht,gt,budget,network,sent,closed,deliver,pump,exchange,ready,inject,policy:fn=>{policy=fn;}};
}
function seededText(length){let n=91;return Array.from({length},()=>String.fromCharCode(33+((n=Math.imul(n,1664525)+1013904223>>>0)%89))).join('');}
test('three-way handshake validates build/protocol/capabilities and only then exposes application controls',()=>{
 const f=fixture();assert.equal(f.host.sendControl({type:'x'}),false);assert.equal(f.guest.sendControl({type:'x'}),false);f.ready();
 assert.equal(f.host.remoteNonce,G);assert.equal(f.guest.remoteNonce,H);
 assert.equal(f.guest.sendControl({type:'input',buttons:[1,2]}),true);f.exchange(1);assert.deepEqual(f.host.takeEvents(),[{type:'control',data:{type:'input',buttons:[1,2]}}]);
 assert.equal(f.closed.length,0);assert.equal(f.budget.bytes,0);
});
test('incompatible build and game protocol close before ready; missing capability is rejected',()=>{
 for(const config of [{guestBuild:'wrong'},{guestProtocol:24}]){const f=fixture(config);f.exchange();assert.equal(f.host.state,'closed');assert.ok(!f.host.takeEvents().some(e=>e.type==='ready'));}
 const f=fixture();f.inject('host',frame('hello',{wire:1,capabilities:3,scope:ROOM,build:BUILD,protocol:25},{source:G,target:ZERO_NONCE}));assert.equal(f.host.state,'closed');
});
test('wrong room, nonce and native ticket cannot allocate reassembly or enter a new session',()=>{
 const f=fixture();f.ready();const before=f.host.diagnostics();
 const payload=frame('control',{type:'oversized',data:'x'.repeat(40000)},{source:'c'.repeat(32),target:H,id:44});f.inject('host',payload);
 f.inject('host',frame('control',{type:'input'},{source:G,target:H,id:45}),0,{...f.ht,lease:'110'});
 f.inject('host',frame('control',{type:'input'},{source:G,target:H,id:46}),0,{...f.ht,scope:String(BigInt(ROOM)+1n)});
 assert.equal(f.budget.bytes,0);assert.deepEqual(f.host.takeEvents(),[]);assert.equal(f.host.state,'ready');assert.ok(f.host.diagnostics().staleSessionPackets>before.staleSessionPackets);
 const g=fixture();g.inject('host',frame('hello',{wire:1,capabilities:7,scope:'10977524000000002',build:BUILD,protocol:25},{source:G,target:ZERO_NONCE}));assert.equal(g.host.state,'closed');
});
test('old handshake cannot complete a new connection without echoing its fresh host nonce',()=>{
 const f=fixture();f.guest.pump({now:0,maxBytes:65536});f.deliver(0);f.host.pump({now:0,maxBytes:65536});
 f.inject('host',frame('ready',f.host.config(),{source:G,target:'c'.repeat(32),id:20}));assert.equal(f.host.state,'await-ready');assert.equal(f.host.wire.diagnostics().bytes,0);
 f.deliver(0);f.guest.pump({now:0,maxBytes:65536});f.deliver(0);assert.equal(f.host.state,'ready');
});
test('handshake remains bounded at 8s, including native backpressure before hello admission',()=>{
 const f=fixture();f.policy(()=>({status:'backpressure'}));f.pump(8000);assert.notEqual(f.guest.state,'closed');f.pump(8001);assert.equal(f.guest.failure,'wire-handshake-timeout');assert.equal(f.host.failure,'wire-handshake-timeout');assert.equal(f.budget.bytes,0);
});
test('only matching sent ping responses renew liveness; controls and replayed pongs cannot hide a broken path',()=>{
 const f=fixture();f.ready();f.exchange(1000);assert.equal(f.host.lastPong,1000);const pong=f.sent.find(m=>m.side==='guest'&&socketWireHeader(m.kind,m.data).op==='pong');
 f.host.receive({ticket:f.ht,kind:pong.kind,data:pong.data},7000);assert.equal(f.host.lastPong,1000);
 f.inject('host',frame('control',{type:'alive-but-not-pong'},{source:G,target:H,id:100}),8000);assert.equal(f.host.lastPong,1000);
 f.host.pump({now:9001,maxBytes:65536});assert.equal(f.host.failure,'wire-heartbeat-timeout');
});
test('stream acknowledgement precedes reliable anchor; a lost snapshot does not break later states',()=>{
 const f=fixture();f.ready();assert.equal(f.host.offerState(JSON.stringify(state(1,seededText(16000))),0).status,'queued');
 f.host.pump({now:0,maxBytes:65536});assert.ok(f.network.every(m=>m.kind==='control'));f.deliver(0);assert.equal(f.guest.epoch,1);f.exchange(0);
 assert.deepEqual(f.guest.takeEvents(),[{type:'state',data:state(1,seededText(16000))}]);assert.equal(f.host.sender.diagnostics().anchorCount,1);
 f.host.offerState(JSON.stringify(state(2,seededText(16000))),10);f.host.pump({now:10,maxBytes:65536});f.deliver(10,m=>m.kind!=='snapshot');
 f.host.offerState(JSON.stringify(state(3,seededText(16000))),20);f.exchange(20);assert.deepEqual(f.guest.takeEvents(),[{type:'state',data:state(3,seededText(16000))}]);assert.equal(f.closed.length,0);
});
test('snapshot before its anchor is dropped without regression or disconnection; later snapshot recovers',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,seededText(16000))),0);f.exchange(0,2); // stream / streamAck only
 f.host.pump({now:1,maxBytes:65536});const anchor=f.network.splice(0);assert.ok(anchor.some(m=>m.kind==='anchor'));
 f.host.offerState(JSON.stringify(state(2,seededText(16000))),2);f.host.pump({now:2,maxBytes:65536});f.deliver(2);assert.deepEqual(f.guest.takeEvents(),[]);assert.equal(f.guest.stats.missedAnchors,1);
 for(const m of anchor)f.guest.receive(m,3);f.exchange(3);f.guest.takeEvents();f.host.offerState(JSON.stringify(state(3,seededText(16000))),4);f.exchange(4);
 assert.equal(f.guest.takeEvents().at(-1).data.seq,3);assert.equal(f.closed.length,0);
});
test('new match epochs isolate late anchors, snapshots and acknowledgements from the previous game',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(8,'abc')),0);f.exchange();f.guest.takeEvents();
 const oldAnchor=f.sent.find(m=>m.side==='host'&&m.kind==='anchor'),oldAck=f.sent.find(m=>m.side==='guest'&&socketWireHeader(m.kind,m.data).op==='anchorAck');
 f.host.offerState(JSON.stringify(state(1,'new','second-game')),10);f.exchange(10);const before=f.host.stats.anchorAcks;
 f.guest.receive({ticket:f.gt,...oldAnchor},11);f.host.receive({ticket:f.ht,...oldAck},11);
 assert.equal(f.guest.takeEvents().at(-1).data.matchId,'second-game');assert.equal(f.host.stats.anchorAcks,before);assert.equal(f.closed.length,0);assert.equal(f.budget.bytes,0);
});
test('unsupported >512KiB state uses fragmented reliable full fallback without fidelity loss',()=>{
 const f=fixture();f.ready();const data=state(1,seededText(600000));assert.equal(f.host.offerState(JSON.stringify(data),0).status,'queued');f.exchange(0,64);
 assert.equal(f.host.state,'ready');assert.deepEqual(f.guest.takeEvents().at(-1).data,data);
 assert.ok(f.sent.filter(m=>m.side==='host'&&socketWireHeader(m.kind,m.data).op==='full').length>1);
 assert.equal(f.host.awaitingReliable,null);assert.equal(f.budget.bytes,0);
 f.host.offerState(JSON.stringify(state(2,'small')),10);f.exchange(10);assert.equal(f.guest.takeEvents().at(-1).data.seq,2);
});
test('large reliable state upload is incremental; control traffic preempts unsent state fragments',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,seededText(600000))),0);f.exchange(0,2);
 const once=f.host.pump({now:1,maxBytes:9000,maxPackets:1});assert.ok(once.bytes<=9000);assert.equal(once.packets,1);assert.ok(f.host.stateJob);f.deliver(1);
 f.host.sendControl({type:'urgent'});f.host.pump({now:2,maxBytes:9000,maxPackets:1});assert.equal(socketWireHeader(f.network[0].kind,f.network[0].data).op,'control');f.deliver(2);
 assert.equal(f.guest.takeEvents()[0].data.type,'urgent');f.exchange(3,64);assert.equal(f.guest.takeEvents().at(-1).data.seq,1);assert.equal(f.budget.bytes,0);
});
test('partial lossy admission failure never commits a baseline; later full/delta recovers',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,seededText(20000))),0);f.exchange();f.guest.takeEvents();
 f.host.offerState(JSON.stringify(state(2,seededText(30000))),1);let snapshots=0;f.policy((_side,_data,kind)=>kind==='snapshot'&&++snapshots===2?{status:'dropped'}:{status:'accepted'});
 f.host.pump({now:1,maxBytes:65536});f.deliver(1);assert.equal(f.host.stateJob,null);assert.ok(f.guest.wire.diagnostics().bytes>0);assert.equal(f.host.sender.sentSnapshots,0);
 f.policy(()=>({status:'accepted'}));f.host.offerState(JSON.stringify(state(3,seededText(24000))),2);f.exchange(2);assert.equal(f.guest.takeEvents().at(-1).data.seq,3);assert.equal(f.budget.bytes,0);
});
test('anchor ACK is admitted only after the complete reliable frame and must match id, token and epoch',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,seededText(30000))),0);f.exchange(0,2);f.host.pump({now:1,maxBytes:9000,maxPackets:1});
 const job=f.host.stateJob;assert.ok(job);const token=f.host.encoder.current.token;
 f.inject('host',frame('anchorAck',{id:job.frame.id,token},{source:G,target:H,id:100,epoch:1}),1);assert.equal(f.host.awaitingReliable,null);assert.equal(f.host.sender.confirmed,null);
 // Use a fresh fixture for normal completion: a forged high wire id correctly
 // prevents older control frames, but must never grant anchor credit itself.
 const g=fixture();g.ready();g.host.offerState(JSON.stringify(state(1)),0);g.exchange();const count=g.host.stats.anchorAcks;
 g.inject('host',frame('anchorAck',{id:900,token:900},{source:G,target:H,id:100,epoch:1}),1);assert.equal(g.host.stats.anchorAcks,count);assert.equal(g.host.awaitingReliable,null);
});
test('bounded outgoing control queue and application event queue fail explicitly instead of leaking',()=>{
 const f=fixture();f.ready();for(let i=0;i<65;i++)f.host.sendControl({type:'command',i});assert.equal(f.host.failure,'control-queue-overflow');assert.equal(f.host.controlBytes,0);
 const g=fixture();g.ready();for(let i=0;i<33;i++)g.inject('host',frame('control',{type:'cmd',i},{source:G,target:H,id:100+i}),0);assert.equal(g.host.failure,'application-queue-overflow');assert.equal(g.budget.bytes,0);
});
test('illegal lane, guest-supplied state and bad wire lengths close without retaining payloads',()=>{
 for(const mutate of [m=>({...m,kind:'snapshot'}),m=>{m.data.writeUInt32LE(0xffffffff,20);return m;}]){const f=fixture();f.ready();const p=frame('control',{type:'input'},{source:G,target:H,id:99});f.host.receive(mutate({ticket:f.ht,kind:p.kind,data:p.packet(0)}),0);assert.equal(f.host.state,'closed');assert.equal(f.budget.bytes,0);}
 const f=fixture();f.ready();f.inject('host',frame('full',state(1),{source:G,target:H,id:99,epoch:1}));assert.equal(f.host.state,'closed');
});
test('fragment receiver bounds shared bytes, rejects inconsistent duplicates and clears on close',()=>{
 const budget=new SocketWireBudget(9000),a=new SocketWireReceiver(budget),b=new SocketWireReceiver(budget),x=frame('full',state(1,'x'.repeat(30000)),{epoch:1});
 const packet=x.packet(0),header=socketWireHeader(x.kind,packet);a.receive(header,packet,0);assert.equal(budget.bytes,8192);
 assert.throws(()=>b.receive(header,packet,0),/budget/);assert.equal(budget.bytes,8192);a.clear();assert.equal(budget.bytes,0);
 a.receive(header,packet,0);const changed=Buffer.from(packet);changed[SOCKET_WIRE_HEADER]^=1;assert.throws(()=>a.receive(header,changed,0));assert.equal(budget.bytes,0);
});
test('out-of-order lossy chunks, deduplication, sequence wrap and fixed expiry do not retain stale worlds',()=>{
 const r=new SocketWireReceiver(),x=frame('snapshot',{value:seededText(5000)},{id:0xffffffff,epoch:1});let result;
 for(let i=x.count-1;i>=0;i--){const p=x.packet(i);result=r.receive(socketWireHeader(x.kind,p),p,0)??result;}assert.equal(result.data.value.length,5000);assert.equal(r.diagnostics().bytes,0);
 const next=frame('snapshot',{value:'y'.repeat(3000)},{id:0,epoch:1}),p=next.packet(0);r.receive(socketWireHeader(next.kind,p),p,1);r.receive(socketWireHeader(next.kind,p),p,400);
 assert.equal(r.sweep(1+SOCKET_SNAPSHOT_TTL),false);assert.equal(r.diagnostics().bytes,1024);r.sweep(2+SOCKET_SNAPSHOT_TTL);assert.equal(r.diagnostics().bytes,0);
 const later=next.packet(1);assert.equal(r.receive(socketWireHeader(next.kind,later),later,600),null);assert.equal(r.diagnostics().bytes,0);
});
test('reliable assembly does not extend its deadline per fragment; metadata conflicts and zip bombs are bounded',()=>{
 const r=new SocketWireReceiver(),x=frame('full',state(1,'z'.repeat(20000)),{epoch:1}),p=x.packet(0);r.receive(socketWireHeader(x.kind,p),p,0);
 const second=x.packet(1);r.receive(socketWireHeader(x.kind,second),second,7999);assert.equal(r.sweep(8000),false);assert.equal(r.sweep(8001),true);assert.equal(r.diagnostics().bytes,0);
 const bomb=deflateRawSync(Buffer.from('x'.repeat(1000000)));const f=socketWireFrame({op:'full',source:H,target:G,id:2,epoch:1,prepared:{payload:bomb,rawBytes:100,zipped:true}}),b=f.packet(0);
 assert.throws(()=>r.receive(socketWireHeader(f.kind,b),b,8002));assert.equal(r.diagnostics().bytes,0);
 assert.throws(()=>socketWireFrame({op:'full',source:H,target:G,id:3,prepared:{payload:Buffer.from('x'),rawBytes:SOCKET_WIRE_MAX+1,zipped:true}}));
});
test('session teardown frees partially received and unsent state and does not leak nonces in diagnostics',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,seededText(600000))),0);f.exchange(0,2);f.host.pump({now:1,maxBytes:9000,maxPackets:1});f.deliver(1);
 assert.ok(f.budget.bytes>0);f.host.close();f.guest.close();assert.equal(f.budget.bytes,0);assert.equal(f.host.diagnostics().pendingStateBytes,0);
 const d=JSON.stringify(f.guest.diagnostics());assert.ok(!d.includes(H));assert.ok(!d.includes(G));assert.ok(!d.includes(HOST));assert.ok(!d.includes(ROOM));
});
test('large application controls preserve the legacy payload ceiling instead of narrowing room/start compatibility',()=>{
 const f=fixture();f.ready();const data={type:'start',payload:seededText(1100000)};assert.equal(f.host.sendControl(data),true);f.exchange(0,128);
 assert.deepEqual(f.guest.takeEvents(),[{type:'control',data}]);assert.equal(f.closed.length,0);assert.equal(f.budget.bytes,0);
});
test('ready replay is inert and a forged pre-send pong cannot satisfy the outstanding challenge',()=>{
 const f=fixture();f.ready();const ready=f.sent.find(m=>m.side==='guest'&&socketWireHeader(m.kind,m.data).op==='ready');
 f.host.receive({ticket:f.ht,...ready},10);assert.equal(f.host.state,'ready');assert.deepEqual(f.host.takeEvents(),[]);
 f.host.pump({now:1000,maxBytes:0});assert.equal(f.host.ping.sentAt,null);
 f.inject('host',frame('pong',{serial:f.host.ping.serial},{source:G,target:H,id:100}),1001);assert.equal(f.host.lastPong,0);assert.ok(f.host.ping);
});
test('valid heartbeat traffic does not postpone a missing reliable-state ACK beyond 8 seconds',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1)),0);
 const deliver=now=>f.deliver(now,m=>socketWireHeader(m.kind,m.data).op!=='anchorAck');
 for(let i=0;i<16;i++){f.pump(0);deliver(0);}assert.ok(f.host.awaitingReliable);
 for(let now=1000;now<=8000;now+=1000)for(let round=0;round<3;round++){f.pump(now);deliver(now);}
 assert.equal(f.host.state,'ready');assert.equal(f.host.lastPong,8000);f.host.pump({now:8001,maxBytes:65536});assert.equal(f.host.failure,'wire-state-ack-timeout');
});
test('state presentation is monotonic even when a full lossy state overtakes its reliable anchor',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,'small')),0);f.exchange(0,2);f.host.pump({now:1,maxBytes:65536});const old=f.network.splice(0);
 f.host.offerState(JSON.stringify(state(2,'different small')),2);f.host.pump({now:2,maxBytes:65536});f.deliver(2);assert.equal(f.guest.takeEvents().at(-1).data.seq,2);
 for(const message of old)f.guest.receive(message,3);assert.deepEqual(f.guest.takeEvents(),[]);assert.equal(f.guest.lastSeq,2);
});
test('fragment floods remain bounded and superseded snapshots release all shared allocations',()=>{
 const budget=new SocketWireBudget(10000),r=new SocketWireReceiver(budget);
 for(let id=1;id<=3000;id++){const f=frame('snapshot',{value:'x'.repeat(4000)},{id,epoch:1}),p=f.packet(0);r.receive(socketWireHeader(f.kind,p),p,id*.01);assert.equal(r.diagnostics().assemblies,1);assert.equal(budget.bytes,1024);}
 r.clear();assert.equal(budget.bytes,0);assert.ok(budget.peak<=2048);
});
test('malformed headers and compressed payload fuzz cannot grow the receive budget after an error',()=>{
 const f=frame('snapshot',{value:seededText(2000)},{epoch:1});
 for(let offset=0;offset<64;offset++){
  const r=new SocketWireReceiver(),packet=Buffer.from(f.packet(0));packet[offset]^=255;
  try{r.receive(socketWireHeader('snapshot',packet),packet,0);}catch{ /* bounded parser rejection */ }
  assert.ok(r.diagnostics().bytes<=1024);r.clear();assert.equal(r.budget.bytes,0);
 }
});
test('stream ACK cannot precede native admission and matching pongs cannot extend a lost stream ACK',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1)),0);
 f.inject('host',frame('streamAck',{matchId:'battle'},{source:G,target:H,id:100,epoch:1}),0);assert.equal(f.host.streamReady,false);assert.equal(f.host.streamSentAt,null);
 const g=fixture();g.ready();g.host.offerState(JSON.stringify(state(1)),0);
 const exchange=now=>{for(let i=0;i<4;i++){g.pump(now);g.deliver(now,m=>socketWireHeader(m.kind,m.data).op!=='streamAck');}};
 exchange(0);for(let now=1000;now<=8000;now+=1000)exchange(now);
 assert.equal(g.host.state,'ready');assert.equal(g.host.lastPong,8000);g.host.pump({now:8001,maxBytes:65536});assert.equal(g.host.failure,'wire-stream-ack-timeout');
});
test('room-wide scheduler can drain only controls before granting any peer state admission',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,seededText(30000))),0);f.exchange(0,2);
 assert.deepEqual(f.host.pump({now:1,maxBytes:65536,traffic:'control'}),{bytes:0,packets:0});assert.equal(f.network.length,0);
 f.host.sendControl({type:'urgent'});assert.deepEqual(f.host.pump({now:1,maxBytes:65536,traffic:'state'}),{bytes:0,packets:0});
 f.host.pump({now:1,maxBytes:65536,traffic:'control'});assert.ok(f.network.every(m=>m.kind==='control'));f.deliver(1);
 const result=f.host.pump({now:1,maxBytes:9000,maxPackets:1,traffic:'state'});assert.equal(result.packets,1);assert.equal(f.network[0].kind,'anchor');
});
test('reliable state deadline counts from its first native fragment even with zero later state budget',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(1,seededText(30000))),0);f.exchange(0,2);f.host.pump({now:0,maxBytes:9000,maxPackets:1});f.deliver(0);
 assert.equal(f.host.stateJob.startedAt,0);
 for(let now=1000;now<=8000;now+=1000)for(let round=0;round<3;round++){
  f.host.pump({now,maxBytes:65536,traffic:'control'});f.guest.pump({now,maxBytes:65536,traffic:'control'});f.deliver(now);
 }
 assert.equal(f.host.lastPong,8000);f.host.pump({now:8001,maxBytes:0,maxPackets:0,traffic:'control'});assert.equal(f.host.failure,'wire-send-timeout');f.guest.close();assert.equal(f.budget.bytes,0);
 const g=fixture();g.ready();g.host.offerState(JSON.stringify(state(1,seededText(30000))),0);g.exchange(0,2);g.host.pump({now:0,maxBytes:9000,maxPackets:1});g.deliver(0);
 g.host.pump({now:3000,maxBytes:65536});assert.equal(g.host.awaitingReliable.since,0,'finishing submission cannot add another 8s ACK interval');g.host.close();g.guest.close();
});
test('continuous 60Hz updates cannot starve an already-started multi-fragment snapshot under room pacing',()=>{
 const f=fixture();f.ready();f.host.offerState(JSON.stringify(state(0,seededText(6000))),0);f.exchange();f.guest.takeEvents();
 const pacer=new SteamSocketRoomPacer({sample:()=>({available:true,pendingBytes:0,unackedReliableBytes:0,lanes:[0,1,2].map(lane=>({lane,queueMs:0}))})});
 let seq=0,delivered=0,lastSeq=0,maxHeld=0;
 for(let now=8;now<=992;now+=8){
  if(now%16===0)f.host.offerState(JSON.stringify(state(++seq,seededText(6000+seq%4))),now);
  pacer.tick([f.host],now);f.deliver(now);f.guest.pump({now,maxBytes:65536});f.deliver(now);
  for(const e of f.guest.takeEvents())if(e.type==='state'){delivered++;lastSeq=e.data.seq;}
  maxHeld=Math.max(maxHeld,f.guest.wire.diagnostics().bytes);
 }
 assert.equal(f.closed.length,0);assert.ok(delivered>10,`delivered=${delivered}`);assert.ok(seq-lastSeq<10,`latest=${seq}, presented=${lastSeq}`);
 assert.ok(maxHeld<10000);assert.ok(f.host.diagnostics().pendingStateBytes<10000);f.host.close();f.guest.close();assert.equal(f.budget.bytes,0);
});

test('flight receipt capability must be negotiated by both peers before exposing the application',()=>{
 for(const config of [{hostFlight:true,guestFlight:false},{hostFlight:false,guestFlight:true}]){
  const f=fixture(config);f.exchange();assert.ok(f.closed.length>0);assert.ok(f.host.state!=='ready'||f.guest.state!=='ready');
 }
 const f=fixture({hostFlight:true});f.ready();assert.equal(f.host.config().capabilities,31);assert.equal(f.guest.config().capabilities,31);
});
test('saturated reliable input cannot block heartbeat control, and healthy pongs cannot forgive eight-second input blackout',()=>{
 const f=fixture({hostFlight:true});f.ready();
 const controlsOnly=m=>socketWireHeader(m.kind,m.data).op!=='input';
 for(let seq=0;seq<60;seq++){
  assert.ok(f.guest.sendControl({type:'app',data:{type:'input',matchId:'battle',input:{seq,actions:[],keys:seq%4,aim:[seq,0]}}}));
  f.pump(1);f.deliver(1,controlsOnly);
 }
 assert.ok(f.guest.flightBudget.bytes>8000);assert.ok(f.guest.flightBudget.bytes<=8256);assert.ok(f.guest.controls.some(j=>j.frame.op==='input'));
 for(let now=1000;now<=8000;now+=1000)for(let round=0;round<4;round++){f.pump(now);f.deliver(now,controlsOnly);}
 assert.equal(f.guest.state,'ready');assert.ok(f.guest.stats.matchedPongs>=7);assert.equal(f.guest.lastPong,8000);
 assert.ok(f.sent.some(m=>m.side==='guest'&&m.kind==='control'&&socketWireHeader(m.kind,m.data).op==='pong'));
 f.guest.pump({now:8002,maxBytes:65536});assert.equal(f.guest.failure,'wire-delivery-timeout');assert.equal(f.guest.state,'closed');
 f.host.close();assert.equal(f.budget.bytes,0);
});
test('authenticated malformed receipts fail closed; unknown, duplicated and stale receipts cannot manufacture credit',()=>{
 for(const packets of [[],[[1,2]],[[1,2,-1]],Array.from({length:33},()=>[1,2,3])]){
  const f=fixture({hostFlight:true});f.ready();f.inject('guest',frame('receipt',{packets},{id:50}),1);
  assert.equal(f.guest.failure,'invalid-wire-message');assert.equal(f.guest.flightBudget.bytes,0);f.host.close();assert.equal(f.budget.bytes,0);
 }
 const f=fixture({hostFlight:true});f.ready();
 f.guest.sendControl({type:'app',data:{type:'input',input:{seq:1,actions:[]}}});f.guest.pump({now:1,maxBytes:65536});
 const bytes=f.guest.flightBudget.bytes;assert.ok(bytes>0);
 f.inject('guest',frame('receipt',{packets:[[99,999,0],[99,999,0]]},{id:50}),2);
 assert.equal(f.guest.state,'ready');assert.equal(f.guest.flightBudget.bytes,bytes);assert.equal(f.guest.flightBudget.stats.ignoredReceipts,2);
 f.host.close();f.guest.close();assert.equal(f.budget.bytes,0);
});

test('receipt-only capability cannot negotiate packed-state rooms, and packed state is rejected without negotiation',()=>{
 const f=fixture({hostFlight:true});f.inject('host',frame('hello',{wire:1,capabilities:15,scope:ROOM,build:BUILD,protocol:25},{source:G,target:ZERO_NONCE}));
 assert.equal(f.host.failure,'invalid-wire-message');assert.ok(!f.host.takeEvents().some(e=>e.type==='ready'));f.guest.close();
 const g=fixture();g.ready();const v=frame('snapshot',{bad:'unnegotiated'},{id:50,epoch:1}),b=v.packet(0);b[6]|=4;
 g.guest.receive({ticket:g.gt,kind:'snapshot',data:b},1);assert.equal(g.guest.failure,'invalid-wire-message');assert.equal(g.budget.bytes,0);g.host.close();
});

test('a stale packed-state nonce is inert before checking the current session encoding capability',()=>{
 const f=fixture();f.ready();const v=frame('snapshot',{bad:'stale'},{source:'c'.repeat(32),id:51,epoch:1}),b=v.packet(0);b[6]|=4;
 const before=f.guest.stats.staleSessionPackets;f.guest.receive({ticket:f.gt,kind:'snapshot',data:b},1);
 assert.equal(f.guest.state,'ready');assert.equal(f.guest.stats.staleSessionPackets,before+1);assert.equal(f.budget.bytes,0);f.host.close();f.guest.close();
});
