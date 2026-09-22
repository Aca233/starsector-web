import {MotionDeliveryWindow} from '../server/MotionDeliveryWindow.mjs';
import {encodeMotionFrame,motionToText} from '../src/network/MotionFrame.mjs';
import assert from 'node:assert/strict';
import {decodeBinaryState,encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {summarizeCombatFrame} from '../server/lan-state.mjs';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLanServer} from '../server/lan-server.mjs';
import {createAuthorityFactory} from '../server/ServerBattleAuthority.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};

const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await delay(10);}throw Error('timeout');}
class Socket extends EventEmitter {
  readyState=1;bufferedAmount=0;extensions='';rows=[];
  send(data){this.rows.push(typeof data === 'string' ? JSON.parse(data) : decodeBinaryState(data));}
  ping(data){queueMicrotask(()=>this.emit('pong',data??Buffer.alloc(0)));}
  close(){if(this.readyState===3)return;this.readyState=3;this.emit('close',1000);}
  terminate(){this.close();}
  receive(data){this.emit('message',Buffer.from(JSON.stringify(data)),false);}
}
async function setup(t, stateCredits=false, autoMotion=false){
  const dist=await fs.mkdtemp(path.join(os.tmpdir(),'authority-lifecycle-'));
  await fs.writeFile(path.join(dist,'lan-build.json'),JSON.stringify({build:'lifecycle'}));
  let worker;
  const app=await createLanServer({host:'127.0.0.1',port:0,dist,authorityFactory:(_match,receive)=>{
    worker={messages:[],terminated:0,emit:receive,postMessage(m){this.messages.push(m);},terminate(){this.terminated++;return Promise.resolve();}};
    queueMicrotask(()=>receive({type:'ready'}));return worker;
  }});
  t.after(async()=>{await app.close();await fs.unlink(path.join(dist,'lan-build.json'));await fs.rmdir(dist);});
  const peer=name=>{const s=new Socket();app.acceptTransport(s);s.receive({type:'hello',name,instance:crypto.randomUUID(),build:'lifecycle',protocol:protocol.version,...(stateCredits?{stateCredits:1}:{}),...(autoMotion?{motionState:1,motionAuto:1}:{})});return s;};
  const a=peer('creator'),b=peer('guest');a.receive({type:'create'});const room=[...app.rooms.values()][0];
  b.receive({type:'join',code:room.code});b.receive({type:'ready',ready:true});a.receive({type:'start'});
  await delay(0);for(const s of [a,b])s.receive({type:'loaded',matchId:room.match.id});
  assert.equal(room.status,'running');
  const frame=tick=>({tick,ships:room.match.players.map(p=>({id:'ship-'+p.seat,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{time:tick/60}});
  const snapshot=tick=>worker.emit({type:'snapshot',tick,json:JSON.stringify(frame(tick))});
  const report=tick=>({tick,seconds:tick/60,ships:room.match.players.map(p=>({id:'ship-'+p.seat,team:p.team,seat:p.seat,name:p.name,cost:10,status:'deployed',hull:100,hullMax:100,cr:1}))});
  const credits=()=>worker.messages.filter(m=>m.type==='snapshot-consumed');
  return {app,a,b,room,worker,snapshot,report,credits,frame};
}
test('one visible recipient keeps captures; all hidden holds one exact tick; repeated resume cannot invent credits',async t=>{
  const {a,b,room,worker,snapshot,credits}=await setup(t);
  snapshot(1);assert.deepEqual(credits().map(m=>m.tick),[1]);
  a.receive({type:'visibility',hidden:true});snapshot(2);assert.deepEqual(credits().map(m=>m.tick),[1,2]);
  b.receive({type:'visibility',hidden:true});snapshot(3);assert.equal(room.authoritySnapshotTick,3);assert.equal(credits().length,2);
  a.receive({type:'visibility',hidden:false});a.receive({type:'visibility',hidden:false});
  assert.deepEqual(credits().map(m=>m.tick),[1,2,3]);assert.equal(credits().at(-1).discardSounds,true);assert.equal(room.authoritySnapshotTick,null);
  const deadline=room.authorityDemandSince;a.receive({type:'resync',matchId:room.match.id});assert.equal(room.authorityDemandSince,deadline);
  snapshot(4);assert.equal(a.rows.filter(m=>m.type==='state').at(-1).frame.tick,4);
  assert.equal(worker.terminated,0);
});
test('unobserved progress is live but stale telemetry cannot mask a stalled worker',async t=>{
  const {a,b,room,worker,snapshot}=await setup(t);
  a.receive({type:'visibility',hidden:true});b.receive({type:'visibility',hidden:true});snapshot(1);
  room.lastState=Date.now()-20000;worker.emit({type:'performance',tick:100});
  await delay(1100);assert.equal(room.status,'running');
  room.authorityProgressAt=Date.now()-20000;const old=room.authorityProgressAt;
  worker.emit({type:'performance',tick:100});worker.emit({type:'performance',tick:99});
  assert.equal(room.authorityProgressAt,old);await until(()=>room.status==='ended');assert.equal(worker.terminated,1);
});
test('after demand returns, telemetry alone cannot hide a broken snapshot pipeline',async t=>{
  const {a,b,room,worker,snapshot}=await setup(t);
  a.receive({type:'visibility',hidden:true});b.receive({type:'visibility',hidden:true});snapshot(1);
  a.receive({type:'visibility',hidden:false});room.authorityDemandSince=room.lastState=Date.now()-20000;
  worker.emit({type:'performance',tick:1000});
  await until(()=>room.status==='ended');assert.equal(worker.terminated,1);
});
test('final snapshot/report still validates and terminates an unobserved match',async t=>{
  const {a,b,room,worker,snapshot,report}=await setup(t);
  a.receive({type:'visibility',hidden:true});b.receive({type:'visibility',hidden:true});snapshot(1);
  snapshot(120);worker.emit({type:'finished',winner:'draw',report:report(120)});
  assert.equal(room.lastTick,120);assert.equal(room.status,'ended');assert.equal(worker.terminated,1);
  assert.equal(room.authoritySnapshotTick,null);assert.ok(a.rows.some(m=>m.type==='ended'&&m.report?.tick===120));
});
test('room removal releases a held capture and cannot revive its old authority',async t=>{
  const {app,a,b,room,worker,snapshot}=await setup(t);
  a.receive({type:'visibility',hidden:true});b.receive({type:'visibility',hidden:true});snapshot(1);
  app.closeRoom(room.code);assert.equal(worker.terminated,1);assert.equal(app.rooms.size,0);
  snapshot(300);worker.emit({type:'performance',tick:300});assert.equal(room.lastTick,1);
});
test('actual worker boot failures release capacity; terminate is idempotent',async t=>{
  const factory=createAuthorityFactory({workerFile:path.resolve('artifacts/server-authority-20260920/no-such-worker.mjs'),maxBattles:1});
  t.after(()=>factory.close());const rows=[];
  const handle=factory({id:'boot-failure',players:[],options:{aiHulls:[[],[]]}},m=>rows.push(m));
  await until(()=>rows.some(m=>m.type==='error')&&factory.activeCount()===0);
  assert.strictEqual(handle.terminate(),handle.terminate());
  const second=factory({id:'retry',players:[],options:{aiHulls:[[],[]]}},m=>rows.push(m));
  await second.terminate();assert.equal(factory.activeCount(),0);
});

const binarySnapshot=f=>({type:'snapshot',tick:f.tick,binary:encodeProjectedBinaryFrame(f).buffer,summary:summarizeCombatFrame(f,2,-1)});
test('binary summary fast path forwards identical state and validates a hidden terminal report',async t=>{
  const {a,b,room,worker,frame,report,credits}=await setup(t);
  worker.emit(binarySnapshot(frame(1)));assert.equal(a.rows.find(m=>m.type==='state').frame.tick,1);
  assert.equal(credits().at(-1).tick,1);
  a.receive({type:'visibility',hidden:true});b.receive({type:'visibility',hidden:true});
  worker.emit(binarySnapshot(frame(120)));worker.emit({type:'finished',winner:'draw',report:report(120)});
  assert.equal(room.lastTick,120);assert.equal(room.status,'ended');assert.equal(worker.terminated,1);
  assert.ok(a.rows.some(m=>m.type==='ended'&&m.report?.tick===120));
});
test('invalid summary aborts authority without forwarding state or leaking a worker',async t=>{
  const {a,room,worker,frame}=await setup(t);
  const message=binarySnapshot(frame(10));message.summary.ships[0].state.teamId=-1;worker.emit(message);
  assert.equal(room.status,'ended');assert.equal(worker.terminated,1);
  assert.equal(room.lastTick,-1);assert.ok(!a.rows.some(m=>m.type==='state'));
});
test('decoded-state adapter keeps full state when dedicated summaries exist',async t=>{
  const {a,worker,frame}=await setup(t);let relay;
  a.sendSnapshot=snapshot=>{relay=snapshot;};
  worker.emit(binarySnapshot(frame(1)));
  assert.equal(relay.state.frame.world.time,1/60);assert.equal(relay.state.frame.ships.length,2);
  assert.equal(decodeBinaryState(relay.bytes).frame.tick,1);
});

test('independent critical Worker credit is released even when hidden bulk baseline is old',async t=>{
 const {a,b,room,worker,snapshot,credits}=await setup(t);snapshot(1);
 a.receive({type:'visibility',hidden:true});b.receive({type:'visibility',hidden:true});snapshot(2);
 const before=credits().length;
 worker.emit({type:'motion',tick:900,data:motionToText(encodeMotionFrame({tick:900,time:15,acknowledged:{0:1},ships:[['ship-0',0,0,0,0,0,0,0,0]]}))});
 assert.equal(room.status,'running');assert.equal(worker.terminated,0);assert.equal(credits().length,before);
 assert.equal(worker.messages.filter(m=>m.type==='motion-consumed').at(-1).tick,900);
});

test('full capture is withheld behind all consumer windows and exact consumption wakes only once',async t=>{
 const {a,b,room,snapshot,credits,worker}=await setup(t,true);
 snapshot(1);snapshot(2);assert.equal(credits().length,1);assert.equal(room.authoritySnapshotTick,2);
 const before=room.authorityDemandSince,firstSeq=a.rows.find(m=>m.type==='state').seq;
 a.receive({type:'state-consumed',matchId:room.match.id,seq:999});
 a.receive({type:'state-consumed',matchId:'other',seq:1});
 await delay(70);assert.equal(credits().length,1);assert.equal(room.authorityDemandSince,before);
 // Independent authority progress remains live while intentional backpressure
 // holds captures; it must not produce replacement transport/worker credits.
 worker.emit({type:'performance',tick:300});assert.equal(credits().length,1);
 a.receive({type:'state-consumed',matchId:room.match.id,seq:firstSeq});
 assert.deepEqual(credits().map(m=>m.tick),[1,2]);assert.equal(room.authoritySnapshotTick,null);
 a.receive({type:'state-consumed',matchId:room.match.id,seq:firstSeq});assert.equal(credits().length,2);
 snapshot(301);assert.equal(credits().length,2);assert.equal(room.authoritySnapshotTick,301);
 b.receive({type:'state-consumed',matchId:room.match.id,seq:firstSeq+1});assert.equal(credits().at(-1).tick,301);
 assert.equal(worker.terminated,0);
});
test('plain socket drain wakes a held full capture without traffic; closing cancels the wake timer',async t=>{
 const {a,b,app,room,snapshot,credits}=await setup(t);
 a.bufferedAmount=b.bufferedAmount=100;snapshot(1);assert.equal(credits().length,0);
 assert.ok(room.authorityCaptureTimer);
 a.bufferedAmount=0;await until(()=>credits().length===1);assert.equal(credits()[0].tick,1);
 a.bufferedAmount=100;snapshot(2);assert.ok(room.authorityCaptureTimer);
 app.closeRoom(room.code);a.bufferedAmount=b.bufferedAmount=0;await delay(50);
 assert.equal(credits().length,1);assert.equal(room.authorityCaptureTimer,null);
});
test('dedicated motion continues beyond a held full baseline; mismatched IPC tick still aborts',async t=>{
 const {a,b,room,worker,snapshot}=await setup(t);snapshot(1);
 for(const p of room.peers){p.loaded=true;p.motionState=true;p.motionWindow=new MotionDeliveryWindow();p.controlLane={primary:p.ws,socket:new Socket()};}
 a.bufferedAmount=b.bufferedAmount=100;snapshot(2);
 const f={tick:900,time:15,ships:room.frame.ships.map(s=>[s.id,0,0,0,0,0,0,0,0])};
 worker.emit({type:'motion',tick:900,data:motionToText(encodeMotionFrame(f))});
 assert.equal(room.status,'running');assert.equal(room.lastTick,2);assert.equal(room.lastMotionTick,900);
 assert.ok(room.peers.every(p=>p.controlLane.socket.rows.some(m=>m.type==='motion')));
 worker.emit({type:'motion',tick:902,data:motionToText(encodeMotionFrame({...f,tick:901}))});
 assert.equal(room.status,'ended');assert.equal(worker.terminated,1);
});

test('binary authority summary without frame still registers auto-motion whole-state receipt tick',async t=>{
  const {a,b,room,worker,frame}=await setup(t,true,true);
  worker.emit(binarySnapshot(frame(42)));
  assert.equal(room.status,'running');assert.equal(worker.terminated,0);
  for(const [index,socket] of [a,b].entries()){
    const state=socket.rows.find(m=>m.type==='state');assert.equal(state.frame.tick,42);
    const guard=room.peers[index].autoMotion;assert.equal(guard.pending.get(state.seq).tick,42);
    socket.receive({type:'state-consumed',matchId:room.match.id,seq:state.seq});
    assert.equal(guard.stats().status,'eligible');assert.equal(guard.allow(43),true);
  }
});
