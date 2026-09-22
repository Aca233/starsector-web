import {compressVisualBytes,VisualWireReceiver,encodeVisualWireEnvelope,decodeVisualWireEnvelope} from '../server/ProjectileVisualWire.mjs';
import {withoutBulkProjectiles} from '../src/network/ProjectileBulkVariant.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { AnchoredProjectilePublisher,AnchoredProjectileReceiver } from '../src/network/AnchoredProjectileVisual.mjs';
import { LanProjectileVisuals } from '../server/LanProjectileVisuals.mjs';
import { visualPacketBytes,visualReceipt,VisualPacketAssembler } from '../src/network/ProjectileVisualPacket.mjs';
const row=tick=>({id:.123,specId:'test',pos:{$vector:[tick*2,0]},vel:{$vector:[120,0]},isRocket:true,collisionDisabled:false,isDisarmed:false});
const frame=tick=>({tick,time:tick/60,rows:[row(tick)]});
const pub=()=>new AnchoredProjectilePublisher('match');
const entropy=Array.from({length:19000},(_,i)=>String.fromCharCode(33+((Math.imul(i+11,1103515245)^(i*i*1664525))>>>10)%90)).join('');
for(const guests of [2,3,4])test(`${guests+1} players: shared publications skip a stalled consumer without duplicating encoding or growing queues`,()=>{
 let now=0;const p=pub(),fanout=new LanProjectileVisuals('match',{now:()=>now}),peers=Array.from({length:guests},()=>({})),receivers=peers.map(()=>new AnchoredProjectileReceiver('match')),wireReaders=peers.map(()=>new VisualWireReceiver()),pending=peers.map(()=>[]),ticks=peers.map(()=>-1);
 const recipients=peers.map(peer=>({peer,syncId:'sync'}));
 const send=(peer,kind,m)=>{pending[peers.indexOf(peer)].push(m);};
 for(let tick=0;tick<=240;tick+=3){now=tick/60*1000;fanout.publish(p.publish(frame(tick)));fanout.flush(recipients,{writable:()=>true,send});
  for(let i=0;i<peers.length;i++)if(i!==peers.length-1||tick<30||tick>150){for(const m of pending[i].splice(0)){const decoded=wireReaders[i].take(m);if(decoded.receipt){assert.ok(fanout.acknowledge(peers[i],decoded.receipt));continue;}const bytes=visualPacketBytes(decoded.packet),r=receivers[i],f=m.kind==='baseline'?r.baseline(m.key,bytes):r.update(m.key,bytes);if(f)ticks[i]=f.tick;assert.ok(fanout.acknowledge(peers[i],visualReceipt(m)));}}
  assert.ok(fanout.stats().flightBytes<=65536);assert.ok(pending.every(a=>a.length<=2));
 }
 for(let i=0;i<peers.length;i++)assert.ok(ticks[i]>=237,'all consumers recover latest baseline, not backlog');
 assert.equal(p.stats().encodes,81);assert.ok(fanout.stats().peakFlightBytes>0);
});
test('exact receipts, discarded bases, sync resets and room close conserve outstanding byte ownership',()=>{
 const publisher=pub(),peer={},f=new LanProjectileVisuals('match'),packets=[];
 const send=(_peer,_kind,m)=>packets.push(m),flush=syncId=>f.flush([{peer,syncId}],{writable:()=>true,send});
 f.publish(publisher.publish(frame(0)));flush('old');const first=packets[0],debt=f.stats().flightBytes;assert.ok(debt>0);
 for(const changes of [{tick:999},{key:999},{syncId:'new'},{matchId:'other'},{kind:'update'},{status:'helper-received'}])assert.equal(f.acknowledge(peer,{...visualReceipt(first),...changes}),false);
 assert.equal(f.stats().flightBytes,debt);f.reset(peer);flush('new');assert.equal(packets.length,2);assert.ok(f.stats().flightBytes>debt);
 assert.ok(f.acknowledge(peer,visualReceipt(first)));assert.equal(f.peers.get(peer).key,0,'old sync ACK never grants new base');
 assert.ok(f.acknowledge(peer,visualReceipt(packets[1],'discarded')));assert.equal(f.peers.get(peer).key,0);flush('new');assert.equal(packets.length,3);
 f.close();assert.ok(f.hasDebt(peer));assert.ok(f.acknowledge(peer,visualReceipt(packets[2],'discarded')));assert.equal(f.stats().flightBytes,0);assert.equal(f.acknowledge(peer,visualReceipt(packets[2])),false);
});
test('writable/budget/refused sends cannot spend phantom credit; only real teardown abandons flight',()=>{
 const publisher=pub(),peer={},f=new LanProjectileVisuals('match');f.publish(publisher.publish(frame(0)));
 f.flush([{peer,syncId:'s'}],{writable:()=>false,send:()=>assert.fail()});assert.equal(f.stats().flightBytes,0);
 f.flush([{peer,syncId:'s'}],{writable:()=>true,send:()=>false});assert.equal(f.stats().flightBytes,0);
 f.flush([{peer,syncId:'s'}],{writable:()=>true,send:()=>true});assert.ok(f.hasDebt(peer));f.reset(peer);assert.ok(f.hasDebt(peer));f.abandon(peer);assert.equal(f.stats().flightBytes,0);
 const bounded=new LanProjectileVisuals('match',{maxFlightBytes:1});bounded.publish(publisher.latest);bounded.flush([{peer,syncId:'s'}],{writable:()=>true,send:()=>assert.fail()});assert.equal(bounded.stats().flightBytes,0);
});
test('visual packet parser rejects oversize/bad base64/shape and appearance patches remain exact',()=>{
 const sender=pub(),p=sender.publish(frame(0)),m={type:'projectile-visual',matchId:'match',syncId:'sync',key:p.key,tick:p.tick,kind:'baseline',data:Buffer.from(p.baseline).toString('base64')};assert.deepEqual(visualPacketBytes(m),p.baseline);
 for(const extra of [{data:'%%%='},{data:'A'.repeat(200000)},{key:-1},{kind:'unknown'},{tick:Infinity}])assert.throws(()=>visualPacketBytes({...m,...extra}));
 const rx=new AnchoredProjectileReceiver('match');rx.baseline(p.key,p.baseline);const next=sender.publish({tick:3,time:.05,rows:[{...row(3),collisionDisabled:true,isDisarmed:true}]});const back=rx.update(next.key,next.update);assert.equal(back.rows[0].collisionDisabled,true);assert.equal(back.rows[0].isDisarmed,true);
});
const code=(await build({stdin:{contents:"export {ProjectileVisualReplica} from './src/network/ProjectileVisualReplica'; export {projectileVisualLayer} from './src/engine/render/ProjectileVisualLayer';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',logLevel:'warning'})).outputFiles[0].text;
const {ProjectileVisualReplica,projectileVisualLayer}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('renderer layer is isolated from authority setters; interpolation holds, removes and never resurrects older bulk entities',()=>{
 const publisher=pub(),view=new ProjectileVisualReplica('match');const native=[{id:'authority'}],engine={get projectiles(){return native;},set projectiles(_v){assert.fail('must not hit delegated engine setter');}};
 const deliver=(tick,now,rows=[row(tick)])=>{const p=publisher.publish({tick,time:tick/60,rows});view.receive(p.key,'baseline',p.baseline,now,0);if(p.update)view.receive(p.key,'update',p.update,now,0);};
 deliver(0,0);view.render(engine,0,0);assert.equal(projectileVisualLayer(engine).projectiles[0].pos.x,0);
 deliver(3,50);view.render(engine,75,0);assert.equal(projectileVisualLayer(engine).projectiles[0].pos.x,3);view.render(engine,150,0);assert.equal(projectileVisualLayer(engine).projectiles[0].pos.x,6,'holds received endpoint, does not extrapolate');
 deliver(6,100,[]);view.render(engine,150,0);assert.equal(projectileVisualLayer(engine).projectiles.length,0);view.render(engine,800,0);assert.equal(projectileVisualLayer(engine).projectiles.length,0,'stale visual stream cannot restore old bulk projectile');assert.equal(engine.projectiles,native);
 const corrupt=publisher.publish({tick:9,time:.15,rows:[row(9)]}).update.slice();corrupt[corrupt.length-1]^=1;assert.throws(()=>view.receive(publisher.latest.key,'update',corrupt,801,0));assert.equal(view.stats().tick,6);view.render(engine,801,0);assert.equal(projectileVisualLayer(engine).projectiles.length,0,'failed decode never resurrects older bulk');
 view.render(engine,800,9);assert.equal(projectileVisualLayer(engine),undefined,'newer full authority can take over');view.clear();view.render(engine,801,0);assert.equal(projectileVisualLayer(engine),undefined);
});

import { once } from 'node:events';
import { mkdtemp,writeFile,unlink,rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createLanServer } from '../server/lan-server.mjs';
import { DesktopLanBridge } from '../server/desktop-lan-bridge.mjs';
import { encodeProjectedBinaryFrame,decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<300;i++){const x=fn();if(x)return x;await wait(10);}throw Error('Timed out: '+label);}
for(const players of [3,4,5])test(`${players} real socket desktops: dedicated authority -> helper -> independent control lane -> visual consumer with a stalled guest`,async t=>{
 const dist=await mkdtemp(path.join(tmpdir(),'visual-sync-'));await writeFile(path.join(dist,'lan-build.json'),' {"build":"visual-test"}');
 let worker;
 const app=await createLanServer({host:'127.0.0.1',port:0,dist,authorityFactory:(_match,receive)=>{
  worker={messages:[],emit:receive,postMessage(m){this.messages.push(m);},terminate(){return Promise.resolve();}};queueMicrotask(()=>receive({type:'ready'}));return worker;
 }});
 const origin='http://127.0.0.1:'+app.server.address().port,clients=[],locals=[];
 t.after(async()=>{for(const c of clients)c.ws.terminate();for(const {bridge,local}of locals){bridge.close();await local.close();}await app.close();await unlink(path.join(dist,'lan-build.json'));await rmdir(dist);});
 for(let i=0;i<players;i++){
  const local=await createLanServer({host:'127.0.0.1',port:0,dist}),localOrigin='http://127.0.0.1:'+local.server.address().port,bridge=new DesktopLanBridge(local.server.address().port);locals.push({local,bridge});
  local.server.removeAllListeners('upgrade');local.server.on('upgrade',(req,sock,head)=>{try{bridge.upgrade(req,sock,head);}catch{sock.destroy();}});
  const ws=new WebSocket(localOrigin.replace('http:','ws:')+'/desktop/lan/ws?target='+encodeURIComponent(origin),{origin:localOrigin,perMessageDeflate:false}),c={ws,rows:[],visuals:[],hold:false,pending:[],visualPackets:new VisualPacketAssembler()};clients.push(c);ws.on('error',()=>{});
  ws.on('message',(raw,binary)=>{const m=binary?decodeBinaryState(raw):JSON.parse(raw);c.rows.push(m);if(m.type==='projectile-visual'){c.visuals.push(m);if(c.hold)c.pending.push(m);else consume(c,m);}if(m.type==='state')ws.send(JSON.stringify({type:'state-consumed',matchId:m.matchId,seq:m.seq}));});
  await once(ws,'open');ws.send(JSON.stringify({type:'hello',name:'visual-'+i,instance:crypto.randomUUID(),build:'visual-test',protocol:protocol.version,stateCredits:1,motionState:1,visualState:1}));
  const welcome=await until(()=>c.rows.find(r=>r.type==='welcome'),'welcome');assert.equal(welcome.visualState,1);assert.equal(welcome.visualWire,1);
  if(i===0){ws.send('{"type":"create"}');await until(()=>app.rooms.size,'room');ws.send(JSON.stringify({type:'capacity',capacity:players}));await until(()=>[...app.rooms.values()][0].capacity===players,'capacity');}
  else{ws.send(JSON.stringify({type:'join',code:[...app.rooms.values()][0].code}));await until(()=>[...app.rooms.values()][0].peers.length===i+1,'join');}
 }
 const room=[...app.rooms.values()][0];await until(()=>room.peers.every(p=>p.controlLane?.socket),'lanes');
 for(const c of clients.slice(1))c.ws.send('{"type":"ready","ready":true}');await until(()=>room.peers.slice(1).every(p=>p.ready),'ready');clients[0].ws.send('{"type":"start"}');await until(()=>room.status==='loading','loading');
 for(const c of clients){c.receiver=new AnchoredProjectileReceiver(room.match.id);c.ws.send(JSON.stringify({type:'loaded',matchId:room.match.id}));}await until(()=>room.status==='running','running');
 const snapshot=tick=>{
  const f={tick,ships:room.match.players.map(p=>({id:'ship-'+p.seat,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{combatTime:tick/60,projectiles:[row(tick)],mineSystem:{kept:true},beams:[{kept:tick}]}};
  worker.emit({type:'snapshot',tick,binary:encodeProjectedBinaryFrame(f).buffer,visualBinary:encodeProjectedBinaryFrame(withoutBulkProjectiles(f)).buffer});
 };
 snapshot(1);await until(()=>clients.every(c=>c.rows.some(r=>r.type==='state')),'first worlds');
 for(let i=0;i<players;i++)clients[i].ws.send(JSON.stringify({type:'sync-ready',matchId:room.match.id,syncId:room.peers[i].sync.id,tick:1}));
 await until(()=>room.peers.every(p=>p.loaded),'loaded');await until(()=>worker.messages.some(m=>m.type==='visual-mode'&&m.enabled),'worker negotiated');
 const publisher=new AnchoredProjectilePublisher(room.match.id),publish=tick=>worker.emit({type:'projectile-visual',tick,publication:publisher.publish(frame(tick))});
 // The real desktop helper must retain a multi-fragment baseline while ordinary
 // primary messages are arriving; only the final application grants readiness.
 const originalSend=room.peers[0].controlLane.socket.send.bind(room.peers[0].controlLane.socket);
 let fragmentCount=0;
 room.peers[0].controlLane.socket.send=(data,...args)=>{
  const m=Buffer.isBuffer(data)?decodeVisualWireEnvelope(data):JSON.parse(data);
  if(m.type==='projectile-visual'&&m.kind==='baseline'){
   fragmentCount++;
   room.peers[0].ws.send(JSON.stringify({type:'room',room:{fragmentProbe:fragmentCount}}));
   setTimeout(()=>originalSend(data,...args),15);return;
  }
  return originalSend(data,...args);
 };
 worker.emit({type:'projectile-visual',tick:3,publication:publisher.publish({tick:3,time:.05,rows:[{...row(3),missileEngineVisualSpec:{fixture:entropy}}]})});
 await until(()=>clients.every(c=>c.receiver.stats().tick===3),'fragmented visual bases');
 assert.ok(fragmentCount>1);assert.ok(clients[0].rows.some(m=>m.room?.fragmentProbe));
 assert.ok(room.visuals.stats().fragment>0);
 room.peers[0].controlLane.socket.send=originalSend;
 const slow=clients.at(-1);slow.hold=true;
 for(let tick=6;tick<=75;tick+=3){publish(tick);await wait(12);}
 await until(()=>clients.slice(0,-1).every(c=>c.receiver.stats().tick>=72),'healthy consumers remain current');
 assert.ok(slow.pending.length<=2);assert.equal(slow.receiver.stats().tick,3);
 slow.hold=false;for(const m of slow.pending.splice(0))consume(slow,m);publish(78);
 await until(()=>clients.every(c=>c.receiver.stats().tick===78),'slow consumer skips to latest');
 assert.equal(worker.messages.filter(m=>m.type==='visual-consumed').length,26);assert.equal(publisher.stats().encodes,26);assert.ok(room.visuals.stats().peakFlightBytes<=65536);
 // A retired sync must not gain baseline-ready from an old receipt. Actual
 // resync drives a fresh authority world and base, not helper ACK invention.
 const oldSync=room.peers[0].sync.id;clients[0].ws.send(JSON.stringify({type:'resync',matchId:room.match.id}));await until(()=>room.peers[0].sync.id!==oldSync,'new sync');snapshot(79);
 await until(()=>clients[0].rows.some(r=>r.type==='state'&&r.frame.tick===79),'resync world');clients[0].ws.send(JSON.stringify({type:'sync-ready',matchId:room.match.id,syncId:room.peers[0].sync.id,tick:79}));await until(()=>room.peers[0].loaded,'resumed');publish(81);await until(()=>clients[0].receiver.stats().tick===81,'resumed visual');
 await until(()=>room.peers.every(p=>room.visuals.canReplaceBulk(p,p.sync.id,82,p.sync.tick)),'compact eligibility');
 snapshot(82);await until(()=>clients.every(c=>c.rows.some(r=>r.type==='state'&&r.frame.tick===82)),'compact worlds');
 for(const c of clients){const f=c.rows.find(r=>r.type==='state'&&r.frame.tick===82).frame;assert.equal(f.projectileVisuals,1);assert.deepEqual(f.world.projectiles,[]);assert.deepEqual(f.world.beams,[{kept:82}]);assert.deepEqual(f.world.mineSystem,{kept:true});}
 await wait(280);snapshot(83);await until(()=>clients.every(c=>c.rows.some(r=>r.type==='state'&&r.frame.tick===83)),'stale visual fallback');
 for(const c of clients){const f=c.rows.find(r=>r.type==='state'&&r.frame.tick===83).frame;assert.equal(f.projectileVisuals,undefined);assert.equal(f.world.projectiles.length,1);}
 function consume(c,m){const b=c.visualPackets.take(m);if(!b){c.ws.send(JSON.stringify(visualReceipt(m,'fragment')));return;}if(m.kind==='baseline')c.receiver.baseline(m.key,b);else c.receiver.update(m.key,b);c.ws.send(JSON.stringify(visualReceipt(m)));}
});

import vm from 'node:vm';
const clientCode=(await build({entryPoints:['src/network/protocol.ts'],bundle:true,platform:'browser',format:'cjs',write:false,define:{__LAN_BUILD_ID__:'"visual-client-test"','import.meta.env':'{"VITE_LAN_LAYERED_SYNC":"true"}'},logLevel:'warning'})).outputFiles[0].text;
function clientFixture(transport='lan',negotiate=true){
 const sockets=[];const document=new EventTarget();document.visibilityState='visible';
 class Socket{static OPEN=1;readyState=1;bufferedAmount=0;sent=[];constructor(){sockets.push(this);}send(m){this.sent.push(JSON.parse(m));}close(){this.readyState=3;}}
 const sandbox={module:{exports:{}},exports:{},WebSocket:Socket,EventTarget,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,URL,DOMException,atob,document,crypto:{getRandomValues:a=>a.fill(7)},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},performance:{now:()=>1},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(clientCode,sandbox);
 const c=new sandbox.module.exports.LanConnection(transport);c.connect('ws://127.0.0.1/lan/ws','test');const ws=sockets[0];ws.onopen();const receive=m=>ws.onmessage({data:JSON.stringify(m)});receive({type:'welcome',resumeToken:'a'.repeat(64),stateCredits:1,...(negotiate?{visualState:1}:{})});return {c,ws,receive};
}
test('production LanConnection ACKs decoded/retained visual state, explicitly discards without a consumer and never negotiates it on Steam',()=>{
 const publisher=pub(),p=publisher.publish(frame(0)),m={type:'projectile-visual',matchId:'match',syncId:'sync',key:p.key,tick:p.tick,kind:'baseline',data:Buffer.from(p.baseline).toString('base64')};
 for(const [transport,negotiate]of [['lan',true],['lan',false],['steam',true]]){
  const {c,ws,receive}=clientFixture(transport,negotiate);const offered=ws.sent[0];assert.equal(offered.visualState,transport==='lan'?1:undefined);assert.equal(c.visualState,transport==='lan'&&negotiate);
  const before=ws.sent.length;receive(m);
  if(c.visualState){assert.equal(ws.sent.at(-1).status,'discarded');const rx=new AnchoredProjectileReceiver('match');c.subscribe(message=>{if(message.type==='projectile-visual'){rx.baseline(message.key,message.visualBytes);message.visualHandled=true;}});receive(m);assert.equal(ws.sent.at(-1).status,'consumed');assert.equal(ws.sent.at(-1).syncId,'sync');const n=ws.sent.length;receive({...m,data:'bad'});assert.equal(ws.sent.length,n+1);assert.equal(ws.sent.at(-1).status,'discarded','malformed envelope never consumed');}
  else assert.equal(ws.sent.length,before);
  c.close();
 }
});

test('bulk replacement requires recent consumed visual authority for the exact sync; discard/old key/clock rewind never suffice',()=>{
 let now=0;const peer={},f=new LanProjectileVisuals('match',{now:()=>now}),publisher=pub(),packets=[];
 const flush=()=>f.flush([{peer,syncId:'s'}],{writable:()=>true,send:(_p,_kind,m)=>packets.push(m)});
 f.publish(publisher.publish(frame(3)));flush();assert.equal(f.canReplaceBulk(peer,'s',3),false);assert.ok(f.acknowledge(peer,visualReceipt(packets[0])));
 assert.equal(f.canReplaceBulk(peer,'s',3),true);assert.equal(f.canReplaceBulk(peer,'old',3),false);assert.equal(f.canReplaceBulk(peer,'s',3,4),false);assert.equal(f.canReplaceBulk(peer,'s',2),false);assert.equal(f.canReplaceBulk(peer,'s',19),false);
 now=251;assert.equal(f.canReplaceBulk(peer,'s',3),false);now=-1;assert.equal(f.canReplaceBulk(peer,'s',3),false);now=10;
 f.reset(peer);assert.equal(f.canReplaceBulk(peer,'s',3),false);flush();assert.ok(f.acknowledge(peer,visualReceipt(packets.at(-1),'discarded')));assert.equal(f.canReplaceBulk(peer,'s',3),false);
});

test('fragmented control-lane baseline is bounded; intermediate receipts never grant a visual base or bulk omission',()=>{
 let now=0;const peer={},fanout=new LanProjectileVisuals('match',{now:()=>now}),publisher=pub(),assembler=new VisualWireReceiver(),receiver=new AnchoredProjectileReceiver('match'),packets=[];
 const f={tick:3,time:.05,rows:[{...row(3),missileEngineVisualSpec:{fixture:Array.from({length:19000},(_,i)=>String.fromCharCode(33+((Math.imul(i+11,1103515245)^(i*i*1664525))>>>10)%90)).join('')}}]},publication=publisher.publish(f);assert.ok(publication.baseline.length>12288);
 fanout.publish(publication);let complete=false,fragments=0;
 while(!complete){fanout.flush([{peer,syncId:'sync'}],{writable:()=>true,send:(_p,_kind,m)=>{assert.ok(Buffer.byteLength(JSON.stringify(m))<16384);packets.push(m);}});
  const m=packets.at(-1),decoded=assembler.take(m),bytes=decoded.packet?visualPacketBytes(decoded.packet):null;fragments++;const debt=fanout.stats().flightBytes;
  for(const changes of [{offset:m.offset+1},{total:m.total+1}])assert.equal(fanout.acknowledge(peer,{...visualReceipt(m,bytes?'consumed':'fragment'),...changes}),false);
  assert.equal(fanout.stats().flightBytes,debt);
  if(!bytes){assert.equal(fanout.acknowledge(peer,visualReceipt(m)),false);assert.ok(fanout.acknowledge(peer,visualReceipt(m,'fragment')));assert.equal(fanout.canReplaceBulk(peer,'sync',3),false);assert.equal(receiver.stats().tick,-1);}
  else{assert.equal(fanout.acknowledge(peer,visualReceipt(m,'fragment')),false);receiver.baseline(m.key,bytes);assert.ok(fanout.acknowledge(peer,visualReceipt(m)));complete=true;assert.equal(fanout.canReplaceBulk(peer,'sync',3),true);}
  now+=60;
 }
 assert.equal(fragments,Math.ceil(fanout.latest.baselineBytes/6144));assert.equal(fanout.stats().flightBytes,0);assert.equal(fanout.stats().fragment,fragments-1);assert.equal(receiver.stats().tick,3);
 const first=packets[0],second=packets[1],rx=new VisualPacketAssembler();assert.throws(()=>rx.take(second));assert.equal(rx.pending,null);rx.take(first);const held=rx.pending;assert.throws(()=>rx.take({...second,offset:second.offset+1}));assert.equal(rx.pending,held);rx.reset();assert.equal(rx.pending,null);
});
test('a repeatedly discarded visual baseline cannot indefinitely starve the complete-world fallback',()=>{
 let now=0;const peer={},p=pub(),f=new LanProjectileVisuals('match',{now:()=>now}),packets=[];f.publish(p.publish(frame(0)));assert.equal(f.needsBaseline(peer,'sync'),true);
 for(let i=0;i<8;i++){f.flush([{peer,syncId:'sync'}],{writable:()=>true,send:(_peer,_kind,m)=>packets.push(m)});f.acknowledge(peer,visualReceipt(packets.at(-1),'discarded'));now+=100;}
 assert.equal(f.needsBaseline(peer,'sync'),false);assert.equal(f.canReplaceBulk(peer,'sync',0),false);
});

test('visual transport rejects false expansion sizes, unknown encodings and corrupted compressed data',()=>{
 const p=pub().publish(frame(1)),w=compressVisualBytes(p.baseline);
 assert.equal(w.encoding,'deflate-raw');
 const m={type:'projectile-visual',matchId:'match',syncId:'sync',key:p.key,tick:p.tick,kind:'baseline',...w};
 delete m.bytes;
 const receiver=new VisualWireReceiver();
 assert.deepEqual(visualPacketBytes(receiver.take(m).packet),p.baseline);
 for(const patch of [{encoding:'zip'},{rawBytes:1},{rawBytes:131073},{rawBytes:p.baseline.length+1},{data:'AAAA'}]){
  assert.throws(()=>receiver.take({...m,...patch}));receiver.reset();assert.equal(receiver.assembler.pending,null);
 }
});

test('binary visual envelope retains exact compressed fragment identity and rejects malformed sizes/flags/scopes',()=>{
 const p=pub().publish(frame(1)),w=compressVisualBytes(p.baseline),m={type:'projectile-visual',kind:'baseline',matchId:'match',syncId:'sync',key:p.key,tick:p.tick,data:w.data,encoding:w.encoding,rawBytes:w.rawBytes,offset:0,total:w.bytes};
 const encoded=encodeVisualWireEnvelope(m);assert.deepEqual(decodeVisualWireEnvelope(encoded),m);
 const decoded=new VisualWireReceiver().take(decodeVisualWireEnvelope(encoded));assert.deepEqual(visualPacketBytes(decoded.packet),p.baseline);assert.equal(visualReceipt(decoded.packet).total,w.bytes);
 for(const tweak of [b=>b[0]^=1,b=>b[4]=2,b=>b[5]=3,b=>b[6]=1,b=>b.writeUInt16BE(257,36),b=>b.writeUInt32BE(1,32),b=>b.writeDoubleBE(-1,8),b=>b[40]=255]){const b=Buffer.from(encoded);tweak(b);assert.throws(()=>decodeVisualWireEnvelope(b));}
 assert.throws(()=>decodeVisualWireEnvelope(encoded.subarray(0,40)));assert.throws(()=>decodeVisualWireEnvelope(Buffer.alloc(16385)));
});
