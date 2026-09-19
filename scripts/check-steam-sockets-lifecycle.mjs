import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindSteamSocketsLifecycleV012, SOCKETS_CONNECT_TIMEOUT_MS, SOCKETS_EVENT_LIMIT } from '../server/steam/sockets-lifecycle-v012.mjs';
const HOST='76561198000000001',GUEST='76561198000000002',OUTSIDER='76561198000000099',ROOM='10977524000000001';
function fixture({guest=false,statusReader=null}={}) {
 const native=new Map(),listeners=new Map(),pending=[],calls=[],attached=new Map(),addresses=new Map(),registered=new Map(),members=new Set([HOST,GUEST]);
 let nextHandle=10,nextListener=100,addr=1000n,inCallback=false,registrations=0,current=true;
 const modes={earlyListen:false,earlyConnect:false,accept:1,setTag:true,attach:true,close:true,connectThrows:false,connectZero:false};
 function infoBuffer(c){const b=Buffer.alloc(696);if(c.remote){b.writeInt32LE(16,0);b.writeInt32LE(8,4);b.writeBigUInt64LE(BigInt(c.remote),8);}b.writeBigInt64LE(c.tag,136);b.writeUInt32LE(c.listener,144);b.writeInt32LE(c.state,176);b.writeInt32LE(c.endReason??0,180);b.writeInt32LE(c.flags??0,440);return b;}
 function fire(c,callback=c.callback){const b=Buffer.alloc(712);b.writeUInt32LE(c.h,0);infoBuffer(c).copy(b,8);const address=addr++;addresses.set(address,b);inCallback=true;try{registered.get(callback)(address);}finally{inCallback=false;b.fill(0xee);addresses.delete(address);}}
 function enqueue(c){pending.push({...c});}
 function options(count,b){assert.equal(count,2);assert.equal(b.length,32);assert.equal(b.readInt32LE(0),201);assert.equal(b.readInt32LE(4),5);assert.equal(b.readInt32LE(16),40);assert.equal(b.readInt32LE(20),2);return{callback:b.readBigUInt64LE(8),tag:b.readBigInt64LE(24)};}
 function incoming(listener,remote=GUEST,overrides={}){const l=listeners.get(listener);assert.ok(l);const c={h:nextHandle++,remote,listener,state:1,flags:0,...l,...overrides};native.set(c.h,c);enqueue(c);return c;}
 const memory={
  proto(name,result,args){assert.equal(result,'void');assert.deepEqual(args,['void *']);return{name};},pointer(type){return type;},
  register(fn){const p=0x10000n+BigInt(registrations++);registered.set(p,fn);return p;},unregister(){throw Error('Callback must remain valid for late native events');},
  decode(p,offset,type){const b=Buffer.isBuffer(p)?p:addresses.get(p);if(!b)throw Error('expired callback pointer');if(type==='int32_t')return b.readInt32LE(offset);if(type==='uint32_t')return b.readUInt32LE(offset);if(type==='int64_t')return b.readBigInt64LE(offset);if(type==='uint64_t')return b.readBigUInt64LE(offset);throw Error('Unexpected decode');},
 };
 const functions={
  SteamNetworkingSockets_SteamAPI_v012:()=>1n,
  ISteamNetworkingSockets_CreateListenSocketP2P(_s,port,count,b){const l={...options(count,b),port},h=nextListener++;listeners.set(h,l);if(modes.earlyListen){const c=incoming(h);pending.pop();fire(c);}return h;},
  ISteamNetworkingSockets_ConnectP2P(_s,id,port,count,b){const config=options(count,b);assert.equal(id.length,136);assert.equal(id.readInt32LE(0),16);if(modes.connectThrows)throw Error('PRIVATE native create error');if(modes.connectZero)return 0;const c={h:nextHandle++,remote:String(id.readBigUInt64LE(8)),listener:0,state:1,flags:0,...config,port};native.set(c.h,c);if(modes.earlyConnect)fire(c);else enqueue(c);return c.h;},
  ISteamNetworkingSockets_AcceptConnection(_s,h){const c=native.get(h);c.state=modes.accept===1?3:4;enqueue(c);return modes.accept;},
  ISteamNetworkingSockets_CloseConnection(_s,h,reason,debug,linger){assert.equal(reason,1000);assert.ok(debug.startsWith('Starsector '));assert.equal(linger,false);const c=native.get(h);if(!modes.close)return false;if(c){native.delete(h);enqueue({...c,state:0});}return !!c;},
  ISteamNetworkingSockets_CloseListenSocket(_s,h){listeners.delete(h);for(const c of native.values())if(c.listener===h)native.delete(c.h);return true;},
  ISteamNetworkingSockets_SetConnectionUserData(_s,h,tag){if(!modes.setTag)return false;native.get(h).tag=tag;return true;},
  ISteamNetworkingSockets_GetConnectionInfo(_s,h,out){const c=native.get(h);if(!c)return false;infoBuffer(c).copy(out);return true;},
  ISteamNetworkingSockets_RunCallbacks(){for(const c of pending.splice(0))fire(c);},
  SteamNetworkingIdentity_SetSteamID64(out,remote){out.writeInt32LE(16);out.writeInt32LE(8,4);out.writeBigUInt64LE(remote,8);},
 };
 const signatures=[];const library={func(signature){signatures.push(signature);const name=signature.match(/SteamAPI_(\w+)\(/)[1];assert.equal(typeof functions[name],'function',name);return(...args)=>{assert.equal(inCallback,false,'raw callbacks MUST NOT invoke native SDK functions');calls.push({name,args});return functions[name](...args);};}};
 let ioOpen=false;
 const io={open(){ioOpen=true;},attach(h,remote){if(!modes.attach)return false;assert.equal(native.get(h).remote,remote);attached.set(h,remote);return true;},detach(h){return attached.delete(h);},forget(h){calls.push({name:'forget',args:[h]});return attached.delete(h);},close(){attached.clear();ioOpen=false;return true;},diagnostics(){return{available:ioOpen};},send(h,data,kind){calls.push({name:'send',args:[h,data,kind]});return{status:'accepted'};},receive(){return [...attached].map(([connection,remote])=>({connection,remote,kind:'snapshot',data:Buffer.from('frame')}));}};
 const create=()=>bindSteamSocketsLifecycleV012(library,memory,{io,statusReader});
 const manager=create();
 const config={sdkInitialized:true,localId:guest?GUEST:HOST,ownerId:HOST,scope:ROOM,allowed:id=>members.has(id),isCurrent:()=>current};
 const open=()=>manager.open(config);
 const transition=(h,state,overrides={})=>{const c=native.get(h);assert.ok(c);Object.assign(c,{state},overrides);enqueue(c);};
 return{manager,create,open,config,memory,io,native,listeners,pending,calls,signatures,modes,members,fire,incoming,transition,registered,registrations:()=>registrations,current:value=>{current=value;}};
}
test('binding is inert; no listener/callback/SDK init without explicit valid initialized-room guards',()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.registrations(),0);assert.equal(f.signatures.length,10);
 assert.ok(!f.signatures.some(s=>/SteamAPI_Init|SetGlobal|Shutdown/.test(s)));
 assert.throws(()=>f.manager.open({...f.config,sdkInitialized:false}),/guards/);assert.equal(f.calls.length,0);assert.equal(f.registrations(),0);
});
test('listener creation inherits callback and tag atomically, including callback before CreateListen returns',()=>{
 const f=fixture();f.modes.earlyListen=true;f.open();assert.equal(f.manager.diagnostics().queuedCallbacks,1);assert.equal(f.registrations(),1);
 const notices=f.manager.poll(100);assert.equal(notices.filter(n=>n.type==='connected').length,1);assert.equal(f.manager.diagnostics().connections,1);assert.ok(f.manager.receive()[0].ticket.lease);
 assert.equal(f.manager.close(),true);assert.equal(f.native.size,0);assert.equal(f.listeners.size,0);
});
test('guest connects only to owner; early callback, ready ticket and control/data routing require native connected state',()=>{
 const f=fixture({guest:true});f.modes.earlyConnect=true;f.open();assert.equal(f.listeners.size,0);const ticket=f.manager.connect(0);assert.equal(ticket.remote,HOST);
 assert.equal(f.manager.send(ticket,Buffer.from('input'),'control').reason,'connection-not-ready');assert.equal(f.manager.connect(1),null);
 f.transition(ticket.handle,3);const events=f.manager.poll(1);assert.equal(events.filter(e=>e.type==='connected').length,1);assert.deepEqual(f.manager.send(ticket,Buffer.from('input'),'control'),{status:'accepted'});assert.equal(f.manager.receive().length,1);f.manager.close();
});
test('callbacks are hints: old terminal event cannot kill a currently connected native peer',()=>{
 const f=fixture({guest:true});f.open();const ticket=f.manager.connect(0);f.transition(ticket.handle,3);f.manager.poll(1);
 f.fire({...f.native.get(ticket.handle),state:5,endReason:999});assert.deepEqual(f.manager.poll(2),[]);assert.equal(f.manager.diagnostics().connections,1);assert.equal(f.manager.send(ticket,Buffer.from('x'),'control').status,'accepted');f.manager.close();
});
test('outsiders, duplicate peers and guest-to-guest attempts are rejected without replacing existing active peer',()=>{
 const f=fixture();f.open();const listener=[...f.listeners.keys()][0];const bad=f.incoming(listener,OUTSIDER);f.manager.poll(0);assert.equal(f.native.has(bad.h),false);
 const first=f.incoming(listener);const ready=f.manager.poll(1).find(e=>e.type==='connected').ticket;const duplicate=f.incoming(listener);f.manager.poll(2);
 assert.equal(f.native.has(first.h),true);assert.equal(f.native.has(duplicate.h),false);assert.equal(f.manager.send(ready,Buffer.from('x'),'control').status,'accepted');f.manager.close();
 const g=fixture({guest:true});g.open();g.members.delete(HOST);assert.equal(g.manager.connect(0),null);assert.equal(g.native.size,0);g.manager.close();
});
test('accept/setup failures close owned pending native handles without leaking records',()=>{
 for(const mode of ['accept','setTag','attach']){const f=fixture();f.open();const l=[...f.listeners.keys()][0];f.modes[mode]=mode==='accept'?11:false;const c=f.incoming(l);f.manager.poll(0);assert.equal(f.native.has(c.h),false,mode);assert.equal(f.manager.diagnostics().connections,0);f.manager.close();}
});
test('local lease prevents delayed sends/disconnect from touching a new attempt, even if numeric handle is reused',()=>{
 const f=fixture({guest:true});f.open();const old=f.manager.connect(0);f.transition(old.handle,3);f.manager.poll(1);assert.equal(f.manager.disconnect(old),true);
 const next=f.manager.connect(2);f.transition(next.handle,3);f.manager.poll(3);assert.notEqual(next.lease,old.lease);
 const forgedOld={...old,handle:next.handle};assert.equal(f.manager.disconnect(forgedOld),false);assert.equal(f.manager.send(forgedOld,Buffer.from('stale'),'control').status,'error');assert.equal(f.native.has(next.handle),true);f.manager.close();
});
test('fresh native ownership mismatch only forgets local handle association; no native close of foreign reused handle',()=>{
 const f=fixture({guest:true});f.open();const ticket=f.manager.connect(0);f.transition(ticket.handle,3);f.manager.poll(1);const old={...f.native.get(ticket.handle)};
 Object.assign(f.native.get(ticket.handle),{tag:old.tag+99n,remote:OUTSIDER,listener:999});f.fire({...old,state:5});const before=f.calls.filter(c=>c.name.endsWith('_CloseConnection')).length;
 const events=f.manager.poll(2);assert.equal(events[0].reason,'native-ownership-lost');assert.equal(f.calls.filter(c=>c.name.endsWith('_CloseConnection')).length,before);assert.equal(f.native.has(ticket.handle),true);f.manager.close();assert.equal(f.native.has(ticket.handle),true);
});
test('members leaving or room changing gate sends immediately and close owned connections on the next audit',()=>{
 const f=fixture();f.open();const l=[...f.listeners.keys()][0];f.incoming(l);const ticket=f.manager.poll(0).find(e=>e.type==='connected').ticket;f.members.delete(GUEST);
 assert.equal(f.manager.send(ticket,Buffer.from('x'),'control').status,'error');assert.deepEqual(f.manager.receive(),[]);f.manager.poll(251);assert.equal(f.native.size,0);
 f.current(false);assert.ok(f.manager.poll(252).some(e=>e.reason==='room-changed'));assert.equal(f.listeners.size,0);assert.equal(f.manager.diagnostics().state,'closed');
});
test('pending connection keeps the 8-second boundary; connected native state is checked before timeout',()=>{
 const f=fixture({guest:true});f.open();const ticket=f.manager.connect(0);f.manager.poll(SOCKETS_CONNECT_TIMEOUT_MS);assert.equal(f.native.has(ticket.handle),true);const events=f.manager.poll(SOCKETS_CONNECT_TIMEOUT_MS+1);assert.ok(events.some(e=>e.reason==='native-connect-timeout'));assert.equal(f.native.size,0);f.manager.close();
 const g=fixture({guest:true});g.open();const t=g.manager.connect(0);g.native.get(t.handle).state=3;assert.ok(g.manager.poll(8001).some(e=>e.type==='connected'));g.manager.close();
});
test('connected unauthenticated or unencrypted peers never become writable',()=>{
 for(const flags of [1,2,3]){const f=fixture({guest:true});f.open();const ticket=f.manager.connect(0);f.transition(ticket.handle,3,{flags});const e=f.manager.poll(1);assert.ok(e.some(e=>e.reason==='native-not-authenticated'));assert.ok(!e.some(e=>e.type==='connected'));assert.equal(f.native.size,0);f.manager.close();}
});
test('callback metadata coalesces by handle and native polling audits are rate-bounded when state is unchanged',()=>{
 const f=fixture({guest:true});f.open();const ticket=f.manager.connect(0);f.transition(ticket.handle,3);f.manager.poll(0);const c={...f.native.get(ticket.handle)};
 for(let i=0;i<1000;i++)f.fire(c);assert.equal(f.manager.diagnostics().queuedCallbacks,1);assert.ok(f.manager.diagnostics().coalesced>=999);f.manager.poll(1);
 const queries=f.calls.filter(c=>c.name.endsWith('_GetConnectionInfo')).length;for(let t=2;t<251;t++)f.manager.poll(t);assert.equal(f.calls.filter(c=>c.name.endsWith('_GetConnectionInfo')).length,queries);f.manager.close();
});
test('host has at most nine native peers and rejects excess pending connections',()=>{
 const f=fixture();f.open();const l=[...f.listeners.keys()][0];for(let i=0;i<10;i++){const id=String(BigInt(GUEST)+BigInt(i));f.members.add(id);f.incoming(l,id);}
 f.manager.poll(0);assert.equal(f.manager.diagnostics().connections,9);assert.equal(f.native.size,9);f.manager.close();assert.equal(f.native.size,0);
});
test('callback overflow closes listener including untracked pending handles; bounded queue cannot leak incoming resources',()=>{
 const f=fixture();f.open();const l=[...f.listeners.keys()][0];for(let i=0;i<SOCKETS_EVENT_LIMIT+5;i++)f.incoming(l,OUTSIDER);
 const events=f.manager.poll(0);assert.ok(events.some(e=>e.reason==='callback-queue-overflow'));assert.equal(f.native.size,0);assert.equal(f.listeners.size,0);assert.equal(f.manager.diagnostics().queuedCallbacks,0);
});
test('one process-lifetime callback survives close/reopen; old room callbacks do not retain or affect the new room',()=>{
 const f=fixture();f.open();const l=[...f.listeners.keys()][0];const c=f.incoming(l);const old={...c};f.manager.poll(0);f.manager.close();
 const next=f.create();next.open({...f.config,scope:String(BigInt(ROOM)+1n)});assert.equal(f.registrations(),1);f.fire(old);assert.deepEqual(next.poll(1),[]);assert.equal(next.diagnostics().connections,0);next.close();f.fire(old);
});
test('single active owner and uncertain native creation/close failures require process quarantine, not unlimited retries',()=>{
 const f=fixture({guest:true});f.open();assert.throws(()=>f.create().open(f.config),/occupied/);f.modes.connectThrows=true;assert.equal(f.manager.connect(0),null);assert.ok(f.manager.poll(1).some(e=>e.reason==='native-connect-failed'));assert.throws(()=>f.create().open(f.config),/quarantined/);
 const g=fixture({guest:true});g.open();const t=g.manager.connect(0);g.modes.close=false;assert.equal(g.manager.disconnect(t),false);g.manager.poll(1);assert.throws(()=>g.create().open(g.config),/quarantined/);
});
test('failed dial with an explicit zero handle is retryable and does not allocate a phantom connection',()=>{
 const f=fixture({guest:true});f.open();f.modes.connectZero=true;assert.equal(f.manager.connect(0),null);assert.equal(f.manager.diagnostics().connections,0);f.modes.connectZero=false;assert.ok(f.manager.connect(1));f.manager.close();
});

test('cleanup-discovered ownership uncertainty survives a later notice-queue overflow',()=>{
 const f=fixture({guest:true});f.open();const t=f.manager.connect(0);
 // Deliberately exhaust the consumer queue before cleanup discovers failure.
 for(let i=0;i<32;i++)f.manager.notice({type:'test'});
 f.modes.close=false;assert.equal(f.manager.close(),false);
 assert.equal(f.manager.diagnostics().failure,'notice-queue-overflow');
 assert.throws(()=>f.create().open(f.config),/quarantined/);
 assert.equal(f.native.has(t.handle),true,'fixture preserves the ambiguous handle');
});
test('native callback decode failure quarantines its ABI and cannot reopen',()=>{
 const f=fixture();f.open();const l=[...f.listeners.keys()][0];const c=f.incoming(l);
 const decode=f.memory.decode;f.memory.decode=()=>{throw Error('ABI decode failure');};
 assert.doesNotThrow(()=>f.fire(c));f.memory.decode=decode;
 assert.ok(f.manager.poll(0).some(e=>e.reason==='callback-decode-failed'));
 assert.throws(()=>f.create().open(f.config),/quarantined/);
});
test('status sampling checks membership, ticket and current native ownership before any metrics call',()=>{
 let samples=0;const f=fixture({guest:true,statusReader:()=>{samples++;return{available:true,pendingBytes:10};}});f.open();const ticket=f.manager.connect(0);
 assert.equal(f.manager.sample(ticket).available,false);assert.equal(samples,0);f.transition(ticket.handle,3);f.manager.poll(1);assert.equal(f.manager.sample(ticket).pendingBytes,10);assert.equal(samples,1);
 assert.equal(f.manager.sample({...ticket,lease:'1'}).available,false);f.members.delete(HOST);assert.equal(f.manager.sample(ticket).available,false);assert.equal(samples,1);f.members.add(HOST);
 const closeCalls=f.calls.filter(c=>c.name.endsWith('_CloseConnection')).length;f.native.get(ticket.handle).tag+=1n;assert.equal(f.manager.sample(ticket).reason,'native-ownership-lost');assert.equal(samples,1);assert.equal(f.calls.filter(c=>c.name.endsWith('_CloseConnection')).length,closeCalls);f.manager.close();
});
test('native peer/status failures cannot manufacture queue credit or leave a poisoned owner reusable',()=>{
 const f=fixture({guest:true,statusReader:()=>{throw Error('native status failure');}});f.open();const ticket=f.manager.connect(0);f.transition(ticket.handle,3);f.manager.poll(1);assert.equal(f.manager.sample(ticket).reason,'native-status-read-failed');f.manager.poll(2);assert.throws(()=>f.create().open(f.config),/quarantined/);
 let calls=0;const g=fixture({guest:true,statusReader:()=>{calls++;return{available:true};}});g.open();const t=g.manager.connect(0);g.transition(t.handle,3);g.manager.poll(1);g.native.get(t.handle).flags=1;assert.equal(g.manager.sample(t).reason,'native-peer-changed');assert.equal(calls,0);assert.equal(g.native.size,0);g.manager.close();
});
