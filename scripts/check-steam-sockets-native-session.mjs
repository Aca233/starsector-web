// Actual C++ message allocations and lifecycle on host; remote application peer
// simulated in JS. Neither side connects to Steam or the network.
import { SteamSocketSession } from '../server/steam/sockets-session.mjs';
import { bindSteamSocketsLifecycleV012 } from '../server/steam/sockets-lifecycle-v012.mjs';
import { SocketWireBudget } from '../server/steam/sockets-wire.mjs';
import { bindSteamSocketsStatusV012 } from '../server/steam/sockets-status-v012.mjs';
import { SteamSocketRoomPacer } from '../server/steam/sockets-room-pacer.mjs';
export function checkNativeSession({library,memory,check,metric,queue,next}){
 const HOST='76561198000000001',GUEST='76561198000000002',ROOM='10977524000000001';
 const incoming=library.func('uint32_t SW_TestIncoming(uint32_t listener, uint64_t identity)');
 const readLast=library.func('int SW_TestReadLast(void *output, int capacity)');
 const life=bindSteamSocketsLifecycleV012(library,memory,{statusReader:bindSteamSocketsStatusV012(library)});life.open({sdkInitialized:true,localId:HOST,ownerId:HOST,scope:ROOM,allowed:id=>id===GUEST,isCurrent:()=>true});
 incoming(metric(19),BigInt(GUEST));const ticket=life.poll(0).find(e=>e.type==='connected')?.ticket;check(Boolean(ticket),true,'native lifecycle ticket ready for wire session');
 const remoteTicket={handle:4000,lease:'123',remote:HOST,scope:ROOM},wireBudget=new SocketWireBudget(),toGuest=[];
 let dropSnapshots=false,blocked=false,hostNativePackets=0,guestNativePackets=0,deliberatelyLost=0;
 const hostTransport={send(t,data,kind){
  next(blocked?-25:1);const result=life.send(t,data,kind);hostNativePackets++;
  check(metric(8),ticket.handle,'native packet routed to owned lifecycle connection');check(metric(7),({control:0,anchor:1,snapshot:2})[kind],'session uses correct native lane');
  check(metric(6),kind==='snapshot'?5:9,'reliable versus replaceable native send flags');check(metric(0),0,'every host native send consumed message allocation');
  if(result.status==='accepted'){
   const output=Buffer.alloc(data.length);check(readLast(output,output.length),data.length,'read bytes actually copied by native SendMessages fixture');check(output,data,'native wire payload exact');
   if(dropSnapshots&&kind==='snapshot')deliberatelyLost++;else toGuest.push({ticket:remoteTicket,kind,data:output});
  }
  return result;
 },disconnect:t=>life.disconnect(t)};
 const guestTransport={send(_t,data,kind){guestNativePackets++;queue(ticket.handle,BigInt(GUEST),({control:0,anchor:1,snapshot:2})[kind],kind==='snapshot'?0:8,data,data.length);return {status:'accepted'};},disconnect:()=>true};
 const host=new SteamSocketSession({transport:hostTransport,ticket,localId:HOST,ownerId:HOST,build:'native-wire-fixture',gameProtocol:25,wireBudget});
 const guest=new SteamSocketSession({transport:guestTransport,ticket:remoteTicket,localId:GUEST,ownerId:HOST,build:'native-wire-fixture',gameProtocol:25,wireBudget});
 host.start(0);guest.start(0);
 function exchange(now,rounds=20){for(let i=0;i<rounds;i++){
  life.poll(now);host.pump({now,maxBytes:65536,maxPackets:16});for(const message of toGuest.splice(0))guest.receive(message,now);
  guest.pump({now,maxBytes:65536,maxPackets:16});for(const message of life.receive())host.receive(message,now);
 }}
 exchange(0);check(host.state,'ready','native-backed host completed nonce/build/lobby handshake');check(guest.state,'ready','remote simulated application peer ready');host.takeEvents();guest.takeEvents();
 guest.sendControl({type:'input',sequence:1,keys:['forward']});exchange(1);check(host.takeEvents(),[{type:'control',data:{type:'input',sequence:1,keys:['forward']}}],'guest control traverses native allocation, identity check, release and wire decode');
 let seed=97;const ballast=Array.from({length:24000},()=>String.fromCharCode(33+((seed=Math.imul(seed,1664525)+1013904223>>>0)%89))).join('');
 const state=(seq,matchId='native-battle')=>({type:'state',matchId,seq,frame:{tick:seq,ballast,x:seq*1.23}});
 host.offerState(JSON.stringify(state(1)),2);exchange(2);check(guest.takeEvents(),[{type:'state',data:state(1)}],'reliable anchor through actual native allocation/sends');check(host.stats.anchorAcks,1,'native receive path validates anchor ack');
 dropSnapshots=true;host.offerState(JSON.stringify(state(2)),3);exchange(3);check(deliberatelyLost>0,true,'fixture loses an already-admitted snapshot, not just rejects submission');check(guest.takeEvents(),[],'lost state not presented');
 dropSnapshots=false;host.offerState(JSON.stringify(state(3)),4);exchange(4);check(guest.takeEvents(),[{type:'state',data:state(3)}],'next independently anchored snapshot recovers through native send');
 // Genuine SDK-like negative return consumes its allocation but does not
 // advance a pending reliable job or silently drop a control message.
 blocked=true;host.sendControl({type:'roomChanged',test:true});exchange(5,1);check(host.controls.length,1,'native backpressure retains bounded reliable control');
 blocked=false;exchange(6);check(guest.takeEvents(),[{type:'control',data:{type:'roomChanged',test:true}}],'same reliable control retried once admitted');
 exchange(1000);check(host.lastPong,1000,'native-backed round trip heartbeat');check(guest.lastPong,1000,'remote simulated peer round trip heartbeat');
 const bad=Buffer.from('not an application frame');queue(ticket.handle,76561198000000099n,0,8,bad,bad.length);check(life.receive(),[],'foreign native identity rejected before wire parser');check(host.state,'ready','foreign packet cannot terminate valid wire session');
 host.offerState(JSON.stringify(state(1,'native-next-match')),1001);exchange(1001);check(guest.takeEvents().at(-1)?.data,state(1,'native-next-match'),'match epoch reset through native control and anchor lanes');
 const pacer=new SteamSocketRoomPacer({sample:t=>life.sample(t)}),setStatus=library.func('bool SW_TestStatusMode(uint32_t handle,int mode)');
 host.offerState(JSON.stringify(state(2,'native-next-match')),1030);const paced=pacer.tick([host],1030);check(paced.stateBytes>0,true,'room scheduler admits state using actual native status');
 for(const message of toGuest.splice(0))guest.receive(message,1030);check(guest.takeEvents().at(-1)?.data,state(2,'native-next-match'),'paced native snapshot preserves state');
 setStatus(ticket.handle,2);host.offerState(JSON.stringify(state(3,'native-next-match')),1060);host.sendControl({type:'metricsUnavailableControl'});
 const held=pacer.tick([host],1060);check(held.stateBytes,0,'invalid native status blocks state admission');check(held.controlBytes>0,true,'bounded control reserve survives telemetry failure');
 for(const message of toGuest.splice(0))guest.receive(message,1060);check(guest.takeEvents(),[{type:'control',data:{type:'metricsUnavailableControl'}}],'urgent control passes native boundary while state is withheld');
 setStatus(ticket.handle,0);const resumed=pacer.tick([host],1090);check(resumed.stateBytes>0,true,'fresh native status restores pending latest state admission');
 for(const message of toGuest.splice(0))guest.receive(message,1090);check(guest.takeEvents().at(-1)?.data,state(3,'native-next-match'),'withheld latest state arrives after metric recovery');
 const pacedDiagnostics=pacer.diagnostics();check(pacer.clear(),true,'room scheduler records cleared');
 host.close();guest.close();check(life.close(),true,'native-backed session teardown closes owned resources');
 check(wireBudget.bytes,0,'no wire fragment memory retained');check(metric(0),0,'no native message allocations retained');check(metric(10),0,'no native listeners retained');check(metric(11),0,'no native connections retained');check(metric(4),0,'no poll-group attachments retained');check(metric(13),0,'no native reentry inside callback during session traffic');
 return {pacer:pacedDiagnostics,scope:'Native C++ fixture host plus JS application peer, not a Steam networking test',hostNativePackets,guestNativePackets,deliberatelyLost,wireBytes:wireBudget.bytes,liveNativeMessages:metric(0),listeners:metric(10),connections:metric(11),hostState:host.state,guestState:guest.state};
}
