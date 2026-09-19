// Invoked ONLY by check-steam-sockets-native after verifying the offline marker.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { bindSteamSocketsLifecycleV012, SOCKETS_EVENT_LIMIT } from '../server/steam/sockets-lifecycle-v012.mjs';
export async function checkNativeLifecycle({ library, memory, check, metric, queue, next }) {
 const HOST='76561198000000001',GUEST='76561198000000002',ROOM='10977524000000001',OUTSIDER='76561198000000099';
 const early=library.func('void SW_TestEarlyCallbacks(bool listen, bool connect)');
 const incoming=library.func('uint32_t SW_TestIncoming(uint32_t listener, uint64_t identity)');
 const state=library.func('bool SW_TestState(uint32_t connection, int state, int flags)');
 const stateQuiet=library.func('bool SW_TestStateQuiet(uint32_t connection, int state)');
 const save=library.func('int SW_TestSaveEvent(uint32_t connection, int state)');
 const fire=library.func('bool SW_TestDispatchSaved(int index, bool worker)');
 const retag=library.func('bool SW_TestRetagAsForeign(uint32_t connection, int64_t tag, uint64_t identity)');
 const releaseForeign=library.func('bool SW_TestReleaseForeign(uint32_t connection)');
 const create=()=>bindSteamSocketsLifecycleV012(library,memory);
 const config={sdkInitialized:true,localId:HOST,ownerId:HOST,scope:ROOM,allowed:id=>id===GUEST,isCurrent:()=>true};
 async function workerEvent(index) {
  const completed=metric(18);check(fire(index,true),true,'native worker starts without joining the JS callback thread');
  const deadline=performance.now()+5000;
  while(metric(22)!==0 && performance.now()<deadline) await delay(2);
  check(metric(22),0,'native callback worker returns without deadlock');
  check(metric(18),completed+1,'actual native-thread callback completed');
 }
 early(true,false);const host=create();host.open(config);
 check(metric(10),1,'native listener opened');check(metric(11),1,'inbound connection before listener creation returned');
 check(host.diagnostics().queuedCallbacks,1,'early native stack callback copied before poison');
 const beforeReady=save(metric(20),4);
 const ready=host.poll(0).find(e=>e.type==='connected');assert.ok(ready);const ticket=ready.ticket;
 check(ticket.remote,GUEST,'C++ identity decoded correctly');check(BigInt(ticket.lease)>0n,true,'positive int64 native lease');
 check(metric(14),1,'accepted via real native signature');
 next(7n);const body=Buffer.from('native lifecycle payload');
 check(host.send(ticket,body,'control').status,'accepted','lifecycle routes to actual native allocation/send fixture');
 queue(ticket.handle,BigInt(GUEST),2,0,body,body.length);
 const rx=host.receive();check(rx.length,1,'lifecycle receives native payload');check(rx[0].ticket,ticket,'receive maps current local lease');check(rx[0].data,body,'callback/message data survive poison');
 check(fire(beforeReady,false),true,'old inherited listener tag event delivered');
 check(host.poll(1),[],'stale terminal callback cannot close current connected native peer');
 check(host.diagnostics().connections,1,'connection preserved');
 const terminal=save(ticket.handle,5);await workerEvent(terminal);
 check(host.poll(2),[],'background native stale callback only schedules a current-state audit');
 check(metric(13),0,'raw callbacks never reenter any native SDK function');
 const listener=metric(19);incoming(listener,BigInt(OUTSIDER));incoming(listener,BigInt(GUEST));host.poll(3);
 check(metric(11),1,'outsider and duplicate native peers closed without replacing ready peer');
 const oldEvent=save(ticket.handle,3);check(host.close(),true,'host native ownership cleaned');
 check(metric(10),0,'listener closed');check(metric(11),0,'all native peer handles released');check(metric(4),0,'all poll group associations removed');
 await workerEvent(oldEvent);check(host.diagnostics().queuedCallbacks,0,'late native callback after close safely ignored');
 // The process-lifetime trampoline is reused, so queued old-room events reach
 // the new owner but must be rejected by their inherited/native lease tags.
 early(false,true);const guest=create();guest.open({...config,localId:GUEST,ownerId:HOST,scope:String(BigInt(ROOM)+1n),allowed:id=>id===HOST});
 check(fire(oldEvent,false),true,'old room callback safely delivered to reused trampoline');
 const guestTicket=guest.connect(10);assert.ok(guestTicket);
 check(guest.diagnostics().queuedCallbacks,1,'guest callback during native ConnectP2P copied');
 check(guest.send(guestTicket,body,'control').status,'error','no send before connected');
 guest.poll(10);check(guest.diagnostics().queuedCallbacks,0,'initial dialing callbacks drained');
 check(stateQuiet(guestTicket.handle,3),true,'fixture native state connected without RunCallbacks event');
 await workerEvent(save(guestTicket.handle,3));
 check(guest.diagnostics().queuedCallbacks,1,'connected notification came only from native worker');
 check(guest.poll(11).filter(e=>e.type==='connected').length,1,'guest connection ready');
 const staleGuest=save(guestTicket.handle,4);
 check(guest.disconnect(guestTicket),true,'guest close owned handle, no linger');
 const again=guest.connect(12);check(state(again.handle,3,0),true,'redial state connected');guest.poll(13);
 check(guest.send({...guestTicket,handle:again.handle},body,'control').status,'error','old lease cannot send through new native handle');
 check(guest.disconnect({...guestTicket,handle:again.handle}),false,'old lease cannot disconnect redial');
 await workerEvent(staleGuest);check(guest.poll(14),[],'late closed attempt callback cannot kill redial');
 const foreignEvent=save(again.handle,4),closes=metric(15);
 check(retag(again.handle,BigInt(again.lease)+100n,BigInt(OUTSIDER)),true,'simulate foreign native handle ownership');
 check(fire(foreignEvent,false),true,'deliver callback that names reused foreign handle');
 check(guest.poll(15).some(e=>e.reason==='native-ownership-lost'),true,'fresh native tag mismatch forgets local association');
 check(metric(15),closes,'does not close foreign native handle');check(metric(11),1,'foreign handle remains live');
 check(guest.close(),true,'local teardown does not touch foreign native handle');check(metric(11),1,'foreign preserved after teardown');
 check(releaseForeign(again.handle),true,'fixture, not lifecycle manager, cleans foreign resource');
 // Exact pending timeout retained, not relaxed to hide latency failures.
 const pending=create();pending.open({...config,localId:GUEST,allowed:id=>id===HOST});const waiting=pending.connect(0);
 pending.poll(8000);check(metric(11),1,'exact 8000ms not beyond timeout');
 check(pending.poll(8001).some(e=>e.reason==='native-connect-timeout'),true,'native pending handle times out immediately beyond 8s');
 check(metric(11),0,'timed-out native peer cleaned');check(pending.send(waiting,body,'control').status,'error','timeout invalidates ticket');pending.close();
 // Native SDK listener cleanup must cover handles beyond the bounded JS inbox.
 early(false,false);const overflow=create();overflow.open(config);
 for(let i=0;i<SOCKETS_EVENT_LIMIT+5;i++)incoming(metric(19),BigInt(OUTSIDER));
 check(overflow.poll(0).some(e=>e.reason==='callback-queue-overflow'),true,'bounded callback overflow surfaced');
 check(metric(10),0,'overflow closes native listener');check(metric(11),0,'including untracked pending peers');
 await workerEvent(oldEvent);
 check(metric(0),0,'zero live native message allocations');check(metric(4),0,'zero attached native handles');
 check(metric(23),1,'one native callback trampoline reused across room lifetimes');
 check(metric(13),0,'zero native SDK calls from every callback');check(metric(21),0,'zero invalid native calls');check(metric(22),0,'zero outstanding worker callbacks');
 return {callbackTrampolines:metric(23),callbacks:metric(12),workerCallbacks:metric(18),nativeCallsInCallback:metric(13),nativeOptionsValidated:metric(17),listeners:metric(10),connections:metric(11),accepted:metric(14),closedPeers:metric(15),closedListeners:metric(16),invalidCalls:metric(21),pendingWorkers:metric(22)};
}
