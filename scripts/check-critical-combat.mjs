import { WEAPON_NUMBERS } from '../src/network/WeaponPresentationState.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { COMBAT_FLAGS, COMBAT_NUMBERS, COMBAT_STATE_MAX_BYTES, encodeCombatState, decodeCombatState, combatStateFromText } from '../src/network/CriticalCombatState.mjs';
import { prepareCombatState, encodeCombatEnvelope, readCombatEnvelope, decodeCombatEnvelope, CombatWireSender, CombatWireReceiver } from '../server/CriticalCombatWire.mjs';
import { LanCriticalCombat } from '../server/LanCriticalCombat.mjs';
const frame = (tick, ships = 22) => ({tick, time: tick / 60, ships: Array.from({length:ships}, (_,i) => ['ship-'+i, (i+tick)%2**COMBAT_FLAGS.length, i%5, ...COMBAT_NUMBERS.map((_,j) => j ? Math.PI*(tick+i+j) : -0)])});
const receipt = m => ({type:'combat-consumed',matchId:m.matchId,syncId:m.syncId,tick:m.tick,status:'consumed'});
test('complete critical combat component preserves float64 bits, flags, enums and UTF8 identities', () => {
 for (const ships of [0,22,128]) { const f=frame(123,ships),b=encodeCombatState(f);assert.deepEqual(decodeCombatState(b),f);assert.deepEqual(combatStateFromText(Buffer.from(b).toString('base64')),f);assert.ok(b.length<=COMBAT_STATE_MAX_BYTES); }
 const f={...frame(1,1),tick:Number.MAX_SAFE_INTEGER};f.ships[0][0]='舰🚀';assert.deepEqual(decodeCombatState(encodeCombatState(f)),f);
});
test('bounded combat codec rejects invalid rows, numbers, ids, lengths and flags without accepting partial state',()=>{
 const f=frame(1,2),b=encodeCombatState(f);
 for(const n of [NaN,Infinity,1e13])assert.throws(()=>encodeCombatState({...f,ships:[[...f.ships[0].slice(0,3),n,...f.ships[0].slice(4)]]}));
 for(const value of [{...f,tick:-1},{...f,ships:[f.ships[0],f.ships[0]]},{...f,ships:[[...f.ships[0].slice(0,1),512,...f.ships[0].slice(2)]]},{...f,ships:[['\ud800',...f.ships[0].slice(1)]]}])assert.throws(()=>encodeCombatState(value));
 for(const value of [b.slice(0,-1),new Uint8Array([...b,0]),new Uint8Array(COMBAT_STATE_MAX_BYTES+1)])assert.throws(()=>decodeCombatState(value));
 for(const value of ['','@@==','YWJj','a'.repeat(50000)])assert.throws(()=>combatStateFromText(value));
});
test('combat wire shares one compression result; CRC, ticks, UTF8, reserved fields and inflation caps are checked',()=>{
 const f=frame(2),target=prepareCombatState(encodeCombatState(f)),packet=encodeCombatEnvelope(target,'战斗','sync');
 assert.deepEqual(combatStateFromText(decodeCombatEnvelope(readCombatEnvelope(packet)).data),f);
 for(const mutate of [b=>b[0]^=1,b=>b[4]=4,b=>b[5]=1,b=>b[10]=1,b=>b.writeUInt16BE(257,6),b=>b[40]=255,b=>b.writeDoubleBE(99,20),b=>b.writeUInt32BE(COMBAT_STATE_MAX_BYTES+1,12),b=>b[16]^=1,b=>b[b.length-1]^=255]){const b=Buffer.from(packet);mutate(b);assert.throws(()=>decodeCombatEnvelope(readCombatEnvelope(b)));}
 const envelope=readCombatEnvelope(packet);assert.throws(()=>decodeCombatEnvelope({...envelope,compressed:true,data:deflateRawSync(Buffer.alloc(COMBAT_STATE_MAX_BYTES*2))}));
 assert.throws(()=>encodeCombatEnvelope(target,'a'.repeat(257),'s'));
});
for(const guests of [2,3,4])test(`${guests+1} players: stalled browser holds only bounded exact credit; healthy peers consume current combat state`,()=>{
 let now=0;const fan=new LanCriticalCombat('match',{now:()=>now}),peers=Array.from({length:guests},()=>({})),readers=peers.map(()=>new CombatWireReceiver()),pending=peers.map(()=>[]),latest=peers.map(()=>-1);
 const recipients=peers.map(peer=>({peer,syncId:'s',idleRttMs:60})),send=(peer,bytes)=>{pending[peers.indexOf(peer)].push(readers[peers.indexOf(peer)].decode(readCombatEnvelope(bytes)));return true;};
 for(let tick=1;tick<=120;tick+=3){now=tick/60*1000;fan.publish(encodeCombatState(frame(tick)),tick);fan.flush(recipients,{writable:()=>true,send});
  for(let i=0;i<guests;i++)if(i!==guests-1||tick>90)for(const m of pending[i].splice(0)){latest[i]=m.tick;assert.ok(fan.acknowledge(peers[i],receipt(m)));assert.equal(fan.acknowledge(peers[i],receipt(m)),false);}
  assert.ok(fan.stats().flightBytes<=32768);assert.ok(pending.every(p=>p.length<=3));
 }
 assert.ok(latest.every(t=>t>=115));assert.equal(fan.stats().flightBytes,0);assert.equal(fan.stats().publications,40);assert.ok(fan.stats().retainedBytes<COMBAT_STATE_MAX_BYTES);
});
test('sync/room retirement never erases transport debt, stale ACKs cannot grant current state, teardown releases allocations',()=>{
 const peer={},fan=new LanCriticalCombat('m'),packets=[],flush=s=>fan.flush([{peer,syncId:s}],{writable:()=>true,send:(_,bytes)=>{packets.push(decodeCombatEnvelope(readCombatEnvelope(bytes)));return true;}});
 fan.publish(encodeCombatState(frame(1)),1);flush('old');const old=receipt(packets[0]),before=fan.stats().flightBytes;assert.ok(before>0);
 fan.reset(peer);assert.equal(fan.stats().flightBytes,before);flush('new');assert.ok(fan.stats().flightBytes>before);
 for(const changes of [{matchId:'bad'},{syncId:'bad'},{tick:2},{tick:'1'},{status:'helper-received'}])assert.equal(fan.acknowledge(peer,{...old,...changes}),false);
 assert.ok(fan.acknowledge(peer,old));assert.equal(fan.stats(peer).tick,-1);
 fan.close();assert.ok(fan.hasDebt(peer));assert.ok(fan.acknowledge(peer,{...receipt(packets[1]),status:'discarded'}));assert.equal(fan.stats().flightBytes,0);
 assert.equal(fan.publish(encodeCombatState(frame(2)),2),false);fan.abandon(peer);assert.equal(fan.stats().peers,0);
});
test('refused writes create no credit, worker tick mismatches do not replace the current target',()=>{
 const f=new LanCriticalCombat('m'),p={};f.publish(encodeCombatState(frame(1)),1);const held=f.target;
 assert.throws(()=>f.publish(encodeCombatState(frame(2)),3));assert.equal(f.target,held);
 f.flush([{peer:p,syncId:'s'}],{writable:()=>false,send:()=>assert.fail()});f.flush([{peer:p,syncId:'s'}],{writable:()=>true,send:()=>false});assert.equal(f.stats().flightBytes,0);assert.equal(f.stats(p).inflight,0);
});
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createLanServer } from '../server/lan-server.mjs';
import { DesktopLanBridge } from '../server/desktop-lan-bridge.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function until(fn,name) {for(let i=0;i<300;i++){const value=fn();if(value)return value;await wait(10);}throw Error('Timeout: '+name);}
async function helperFixture(t,players,makeFrame=frame) {
 const dist=await mkdtemp(path.join(tmpdir(),'combat-component-'));await writeFile(path.join(dist,'lan-build.json'),' {"build":"combat-test"}');
 let worker;const app=await createLanServer({host:'127.0.0.1',port:0,dist,authorityFactory:(_match,emit)=>{
  worker={emit,messages:[],postMessage(m){this.messages.push(m);},terminate(){return Promise.resolve();}};queueMicrotask(()=>emit({type:'ready'}));return worker;
 }}),origin='http://127.0.0.1:'+app.server.address().port,clients=[];
 t.after(async()=>{await app.close();await unlink(path.join(dist,'lan-build.json'));await rmdir(dist);});
 for(let i=0;i<players;i++){
  const local=await createLanServer({host:'127.0.0.1',port:0,dist}),bridge=new DesktopLanBridge(local.server.address().port),localOrigin='http://127.0.0.1:'+local.server.address().port;
  local.server.removeAllListeners('upgrade');local.server.on('upgrade',(req,sock,head)=>{try{bridge.upgrade(req,sock,head);}catch{sock.destroy();}});
  t.after(async()=>{bridge.close();await local.close();});
  const ws=new WebSocket(localOrigin.replace('http:','ws:')+'/desktop/lan/ws?target='+encodeURIComponent(origin),{origin:localOrigin});ws.rows=[];ws.on('error',()=>{});ws.on('message',(b,binary)=>{if(!binary)ws.rows.push(JSON.parse(b));});t.after(()=>ws.terminate());await once(ws,'open');
  ws.send(JSON.stringify({type:'hello',name:'test',instance:crypto.randomUUID(),build:'combat-test',protocol:protocol.version,stateCredits:1,motionState:1,combatState:1}));
  const welcome=await until(()=>ws.rows.find(m=>m.type==='welcome'),'welcome');assert.equal(welcome.combatState,1);assert.equal(welcome.motionWire,1);clients.push(ws);
  if(!i){ws.send('{"type":"create","password":""}');await until(()=>app.rooms.size,'room');ws.send(JSON.stringify({type:'capacity',capacity:players}));await until(()=>[...app.rooms.values()][0].capacity===players,'capacity');}
  else{ws.send(JSON.stringify({type:'join',code:[...app.rooms.values()][0].code}));await until(()=>[...app.rooms.values()][0].peers.length===i+1,'joined');}
 }
 const room=[...app.rooms.values()][0];await until(()=>room.peers.every(p=>p.controlLane?.socket),'side lanes');
 for(const ws of clients.slice(1))ws.send('{"type":"ready","ready":true}');await until(()=>room.peers.slice(1).every(p=>p.ready),'ready');clients[0].send('{"type":"start"}');await until(()=>room.status==='loading','loading');
 for(const ws of clients)ws.send(JSON.stringify({type:'loaded',matchId:room.match.id}));await until(()=>room.status==='running','running');
 const snapshot=tick=>worker.emit({type:'snapshot',tick,json:JSON.stringify({tick,ships:room.match.players.map(p=>({id:'ship-'+p.seat,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{time:tick/60}})});
 snapshot(1);await until(()=>clients.every(ws=>ws.rows.some(m=>m.type==='state')),'baseline');
 for(let i=0;i<players;i++)clients[i].send(JSON.stringify({type:'sync-ready',matchId:room.match.id,syncId:room.peers[i].sync.id,tick:1}));await until(()=>room.peers.every(p=>p.loaded),'synced');
 return {app,room,worker,clients,snapshot,publish:tick=>worker.emit({type:'combat-state',tick,data:encodeCombatState(makeFrame(tick,players)).buffer})};
}
for(const players of [3,4,5])test(`${players} real desktop helpers: only browser consumption frees critical combat debt, primary full fallback survives corruption`,async t=>{
 const {room,worker,clients,publish,snapshot}=await helperFixture(t,players);
 publish(2);await until(()=>clients.every(ws=>ws.rows.some(m=>m.type==='combat-state'&&m.tick===2)),'component');
 assert.equal(room.combatStates.stats().consumed,0);assert.ok(room.combatStates.stats().flightBytes>0);assert.ok(worker.messages.some(m=>m.type==='combat-consumed'&&m.tick===2),'worker mailbox is independent of browser credit');
 for(const ws of clients){const m=ws.rows.find(m=>m.type==='combat-state');assert.deepEqual(combatStateFromText(m.data),frame(2,players));ws.send(JSON.stringify(receipt(m)));}
 await until(()=>room.combatStates.stats().consumed===players,'real consumers');assert.equal(room.combatStates.stats().flightBytes,0);
 // A browser cannot produce authoritative combat state even if it owns the room.
 clients[0].send(JSON.stringify({type:'combat-state',matchId:room.match.id,data:Buffer.from(encodeCombatState(frame(99))).toString('base64'),tick:99}));await until(()=>clients[0].rows.some(m=>m.type==='error'),'reject upload');assert.equal(room.combatStates.target.tick,2);
 const peer=room.peers[1],ws=clients[1],lane=peer.controlLane.socket,oldSync=peer.sync.id,send=lane.send.bind(lane);let held;
 lane.send=(data,...args)=>{if(Buffer.isBuffer(data)&&data.readUInt32BE(0)===0x53434c31&&!held){held=()=>send(data,...args);return;}return send(data,...args);};publish(3);await until(()=>held,'held old-scope component');
 ws.send(JSON.stringify({type:'resync',matchId:room.match.id}));await until(()=>peer.sync.id!==oldSync&&ws.rows.some(m=>m.type==='launch'&&m.syncId===peer.sync.id),'new launch');held();lane.send=send;
 await until(()=>room.combatStates.stats().discarded>=1,'late helper packet released only as discarded');assert.equal(lane.readyState,WebSocket.OPEN);assert.ok(!ws.rows.some(m=>m.type==='combat-state'&&m.tick===3));
 snapshot(4);await until(()=>ws.rows.some(m=>m.type==='state'&&m.frame.tick===4),'new baseline');ws.send(JSON.stringify({type:'sync-ready',matchId:room.match.id,syncId:peer.sync.id,tick:4}));await until(()=>peer.loaded,'resumed');
 publish(5);await until(()=>ws.rows.some(m=>m.type==='combat-state'&&m.tick===5),'resumed component');
 const corrupted=encodeCombatEnvelope(prepareCombatState(encodeCombatState(frame(6,players))),room.match.id,peer.sync.id);corrupted[16]^=1;send(corrupted,{binary:true,compress:false});await until(()=>!peer.controlLane.socket,'optional lane closed');assert.equal(ws.readyState,WebSocket.OPEN);
 snapshot(7);await until(()=>ws.rows.some(m=>m.type==='state'&&m.frame.tick===7),'whole-world fallback');assert.equal(room.status,'running');
});

import { build } from 'esbuild';
test('critical combat requires its own opt-in as well as layered mode; no implicit Steam/default enablement',async()=>{
 for(const [env,expected] of [[{},false],[{VITE_LAN_LAYERED_SYNC:'true'},false],[{VITE_LAN_CRITICAL_COMBAT:'true'},false],[{VITE_LAN_LAYERED_SYNC:'true',VITE_LAN_CRITICAL_COMBAT:'true'},true]]){
  const r=await build({stdin:{contents:"export {LAN_CRITICAL_COMBAT_ENABLED} from './src/network/protocol';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',define:{__LAN_BUILD_ID__:'"combat-gate"','import.meta.env':JSON.stringify(env)}});
  const m=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));assert.equal(m.LAN_CRITICAL_COMBAT_ENABLED,expected);
 }
});
test('ordered combat XOR saves exact bytes without waiting for browser ACKs; skipped writes never change a base',()=>{
 const sender=new CombatWireSender(),rx=new CombatWireReceiver();let fullBytes=0,wireBytes=0;
 for(let tick=1;tick<=40;tick++){
  const f={...frame(1),tick,time:tick/60},target=prepareCombatState(encodeCombatState(f)),c=sender.prepare(target,'m','s');
  fullBytes+=encodeCombatEnvelope(target,'m','s').length;wireBytes+=c.data.length;
  assert.deepEqual(combatStateFromText(rx.decode(readCombatEnvelope(c.data)).data),f);assert.ok(sender.commit(c));assert.equal(sender.commit(c),false);
  const skipped=sender.prepare(prepareCombatState(encodeCombatState({...f,tick:tick+100})), 'm','s');assert.equal(sender.base.tick,tick);assert.ok(skipped.data.length);
 }
 assert.ok(sender.delta>=38);assert.ok(wireBytes<fullBytes*.5);assert.equal(sender.base.bytes.length,encodeCombatState(frame(1)).length);
 const old=sender.prepare(prepareCombatState(encodeCombatState(frame(41))),'m','s');sender.reset();assert.equal(sender.commit(old),false);
 const initial=sender.prepare(prepareCombatState(encodeCombatState(frame(1))),'new','s');sender.reset();assert.equal(sender.commit(initial),false,'reset also invalidates an uncommitted null-base choice');
});
test('combat wire CRC failures are transactional, scope resets require full packets and room encode work stays bounded',()=>{
 const senders=Array.from({length:9},()=>new CombatWireSender()),rx=new CombatWireReceiver(),a=prepareCombatState(encodeCombatState(frame(1)));
 for(const s of senders){const c=s.prepare(a,'m','s');s.commit(c);}rx.decode(readCombatEnvelope(senders[0].prepare(prepareCombatState(encodeCombatState(frame(2))),'m','new').data));
 const base=rx.base,c=senders[0].prepare(prepareCombatState(encodeCombatState({...frame(1),tick:2,time:2/60})),'m','s');assert.equal(c.delta,true);assert.throws(()=>rx.decode(readCombatEnvelope(c.data)));assert.equal(rx.base,base);
 const r=new CombatWireReceiver();r.decode(readCombatEnvelope(encodeCombatEnvelope(a,'m','s')));const held=r.base,b=Buffer.from(c.data);b[16]^=1;assert.throws(()=>r.decode(readCombatEnvelope(b)));assert.equal(r.base,held);assert.equal(combatStateFromText(r.decode(readCombatEnvelope(c.data)).data).tick,2);
 for(let i=0;i<senders.length;i++)senders[i].commit(senders[i].prepare(prepareCombatState(encodeCombatState(frame(3+i))),'m','s'));
 const target=prepareCombatState(encodeCombatState(frame(20)));for(const s of senders)s.prepare(target,'m','s');assert.equal(target.cache.size,2);assert.ok([...target.cache.values()].every(v=>!('base' in v)&&!('target' in v)&&!('cache' in v)));
});

for(const players of [3,4,5])test(`${players} real desktop helpers carry exact weapon sections with independent browser receipts`,async t=>{
 const weaponFrame=(tick,ships)=>{const f=frame(tick,ships);return {...f,weapons:f.ships.map(([id])=>[id,[['slot','beam',3,2,3,...WEAPON_NUMBERS.map((_,i)=>i===2||i===14?Infinity:i===0?-0:(tick+i)/7)]]])};};
 const {room,clients,publish}=await helperFixture(t,players,weaponFrame);
 for(const tick of [2,3]){
  publish(tick);await until(()=>clients.every(ws=>ws.rows.some(m=>m.type==='combat-state'&&m.tick===tick)),'weapon component');
  assert.ok(room.combatStates.stats().flightBytes>0);
  for(const ws of clients){const m=ws.rows.find(m=>m.type==='combat-state'&&m.tick===tick);assert.deepEqual(combatStateFromText(m.data),weaponFrame(tick,players));ws.send(JSON.stringify(receipt(m)));}
  await until(()=>room.combatStates.stats().consumed===(tick-1)*players,'weapon consumption');assert.equal(room.combatStates.stats().flightBytes,0);
 }
 assert.equal(room.combatStates.stats().weaponFallbacks,0);
});
