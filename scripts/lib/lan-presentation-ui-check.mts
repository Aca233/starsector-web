// Existing headless offscreen scenario extension; no DOM or OS input injection.
import { CombatPresentationEncoder } from '../../src/engine/runtime/local/CombatPresentationEncoder';
import { CombatPresentationDecoder } from '../../src/engine/runtime/local/CombatPresentationDecoder';
import { LanPresentationUiPublisher, LanPresentationUiReceiver } from '../../src/network/LanPresentationUiTransport';
import { createLanPresentationViews } from '../../src/network/LanPresentationViews';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { applyLanDisplaySnapshots } from '../../src/network/LanDisplaySnapshot';
import { createLanWorld } from '../../src/network/LanWorld';
import { Vector2 } from '../../src/engine/math/Vector2';
import { HudContactRecord } from '../../src/engine/runtime/CombatHudView';
import { decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { assets, bytes } from './offscreen-presentation-page.mts';
const check = (ok, why) => { if (!ok) throw Error(why); };
const rejects = (fn, why) => { let rejected = false; try { fn(); } catch { rejected = true; } check(rejected, why); };
/** Plain/null data prototypes are equivalent; the ONLY restored executable
 * prototypes are explicitly compared, as are aliases and non-JSON scalars. */
export function uiGraph(value) {
  const seen = new Map();
  const visit = v => {
    if (v === undefined) return ['undefined'];
    if (typeof v === 'number') return ['number', Object.is(v, -0) ? '-0' : String(v)];
    if (typeof v === 'function') throw Error('Executable data');
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return ['ref', seen.get(v)];
    const id = seen.size; seen.set(v, id);
    const type = Object.getPrototypeOf(v)?.constructor?.name ?? 'Object';
    if (v instanceof Map) return [id,type,[...v].map(([k,x])=>[visit(k),visit(x)])];
    if (v instanceof Set) return [id,type,[...v].map(visit)];
    return [id,type,Object.keys(v).sort().map(k=>[k,visit(v[k])])];
  };
  return JSON.stringify(visit(value));
}
export async function renderCodecTrace(data) {
  await assets();
  const engine = createLanWorld(data.match).engine;
  const encoder = new CombatPresentationEncoder(1), decoder = new CombatPresentationDecoder(1), result = [];
  for (let i=0;i<4;i++) {
    engine.fixedUpdate(1/60);
    const packet = encoder.capture(engine,i), value = decoder.apply(structuredClone(packet));
    const trace = uiGraph({ value, packet: {...packet, buffer:Array.from(new Float64Array(packet.buffer,0,packet.length)), visuals:{...packet.visuals,buffer:Array.from(new Uint8Array(packet.visuals.buffer))}} });
    result.push({tick:i,length:packet.length,nodes:packet.liveNodeCount,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(trace))),v=>v.toString(16).padStart(2,'0')).join('')});
  }
  return result;
}
export async function checkUiCodec(data) {
  await assets();
  const frames = data.cases.map(row=>decodeBinaryFrame(bytes(row.wire)));
  const world = createLanDisplayWorld(data.match,0,frames[0]).world, views = createLanPresentationViews(data.match,world);
  const encoder = new CombatPresentationEncoder(1,'render-strict','ui'), decoder = new CombatPresentationDecoder(1,'render-strict','ui');
  const lengths = []; let checks=0, original, mutableSpec;
  for (let i=0;i<frames.length;i++) {
    applyLanDisplaySnapshots(world,[frames[i]],i===0);
    world.isTacticalMap = i%2===0;
    world.playerShip.playerTargetId = world.enemyShip.id;
    if (i===3) {
      original=world.playerShip.spec;
      world.playerShip.spec=mutableSpec={...original,spriteUrl:original.spriteUrl+'?mutable-ui',customUiProbe:[NaN,Infinity,-Infinity,-0,undefined]};
    }
    if (i===4) { world.playerShip.spec=mutableSpec; mutableSpec.spriteUrl += '-updated'; }
    if (i===5) world.playerShip.spec=original;
    if (i===6) world.reinforcements.push(world.playerShip);
    const input=views.captureForTransfer(), expected=uiGraph(input), packet=encoder.captureUi(input,frames[i].tick);
    lengths.push({length:packet.length,nodes:packet.liveNodeCount,removed:packet.removed.length,metadata:packet.metadata.length});
    const received=structuredClone(packet,{transfer:[packet.buffer]}); check(packet.buffer.byteLength===0,'UI buffer not transferred');
    const output=decoder.applyUi(received);
    const actual = uiGraph(output);
    if (actual !== expected) { let n=0;while(actual[n]===expected[n]&&n<expected.length)n++;throw Error('UI graph parity frame '+i+' at '+n+' expected='+expected.slice(n-80,n+220)+' actual='+actual.slice(n-80,n+220)); }
    check(output.hud.playerShip instanceof HudContactRecord && output.hud.playerShip.pos instanceof Vector2,'UI methods lost');
    check(output.hud.playerShip===output.hud.ships.find(s=>s.id===output.hud.playerShip.id),'Player alias lost');
    check(output.hud.playerShip.interpolatedPos(.37).x===input.hud.playerShip.interpolatedPos(.37).x,'Interpolation changed');
    check(output.hud.playerShip.isVisibleTo(31)===input.hud.playerShip.isVisibleTo(31),'Visibility method changed');
    if (i===6) world.reinforcements.pop();
    checks++;
  }
  const snapshot=()=>views.captureForTransfer();
  const fresh=()=>new CombatPresentationEncoder(7,'render-strict','ui').captureUi(snapshot(),999);
  const hostile = [
    p=>{p.revision++;}, p=>{p.length--;}, p=>{p.liveNodeCount++;}, p=>{p.visuals={};}, p=>{p.metadata.push({id:999999,value:{x:1}});},
    p=>{p.shapes[0].keys[0]='__proto__';}, p=>{p.shapes[0].type=11;},
    p=>{p.strings[p.strings.indexOf('lan-presentation-ui')]='wrong-kind';},
    p=>{p.shapes.find(s=>s.type===14).keys.push('interpolatedPos');},
  ];
  for(const mutate of hostile){const p=fresh();mutate(p);const d=new CombatPresentationDecoder(7,'render-strict','ui');rejects(()=>d.applyUi(p),'Bad packet accepted');check(d.retainedObjects===0,'Bad graph partially published');checks++;}
  const wrong=new CombatPresentationEncoder(7,'render-strict','ui');
  rejects(()=>wrong.captureUi({...snapshot(),hud:world.playerShip},999),'Ship escaped UI encoder');
  const renderPacket=new CombatPresentationEncoder(7).capture(createLanWorld(data.match).engine,999);
  rejects(()=>new CombatPresentationDecoder(7,'render-strict','ui').applyUi(renderPacket),'Render graph entered UI receiver');
  rejects(()=>new CombatPresentationDecoder(7).apply(fresh()),'UI graph entered render receiver');
  const atomicEncoder=new CombatPresentationEncoder(8,'render-strict','ui'), atomicDecoder=new CombatPresentationDecoder(8,'render-strict','ui');
  const prior=atomicDecoder.applyUi(atomicEncoder.captureUi(snapshot(),1000)), priorGraph=uiGraph(prior);
  world.playerShip.hullHp-=1;
  const valid=atomicEncoder.captureUi(snapshot(),1001), corrupt=structuredClone(valid);corrupt.length--;
  rejects(()=>atomicDecoder.applyUi(corrupt),'Malformed delta accepted');check(uiGraph(prior)===priorGraph,'Rejected delta mutated live HUD');
  check(atomicDecoder.applyUi(valid).hud.playerShip.hullHp===world.playerShip.hullHp,'Rejected delta poisoned decoder');
  world.isTacticalMap=true;
  // Real transfer semantics, one capture only while blocked, epoch/owner fencing.
  let captured=0, outgoing, errors=[];
  const publisher=new LanPresentationUiPublisher(()=>{captured++;return snapshot();},(p,t)=>{outgoing=structuredClone(p,{transfer:t});},e=>errors.push(String(e)));
  const receiver=new LanPresentationUiReceiver(publisher.session);
  publisher.publish(1000); const first=outgoing;
  world.playerShip.hullHp-=1; world.playerShip.pos.x+=11;
  for(let i=0;i<200;i++)check(!publisher.publish(1001+i),'UI backlog admitted');
  check(captured===1 && publisher.stats.pending,'Busy publisher captured queued worlds');
  const ack=receiver.receive(first), oldDeployment=receiver.views.deployment.read(), oldMap=receiver.views.map.read();
  const history=uiGraph({oldDeployment,oldMap});
  const transferredAck=structuredClone(ack,{transfer:[ack.buffer]}); check(ack.buffer.byteLength===0,'Receipt buffer not transferred');
  check(publisher.complete(transferredAck),'Actual UI consumption did not release');
  check(!publisher.complete(transferredAck),'Duplicate completion accepted');
  publisher.publish(1300); const second=outgoing;
  check(receiver.receive({...second,owner:'0'.repeat(32)})===null,'Other owner installed state');
  const ack2=receiver.receive(second);
  check(receiver.views.hud.playerShip.hullHp===world.playerShip.hullHp,'Newest UI was not sampled');
  check(uiGraph({oldDeployment,oldMap})===history,'Delta mutated UI history');
  publisher.reset();check(receiver.reset(publisher.session),'Explicit reset failed');
  check(!publisher.complete(ack2),'Old completion crossed reset');
  rejects(()=>receiver.views.hud.playerShip,'Old UI visible after reset');
  publisher.publish(1301);check(!publisher.complete({...ack2,epoch:publisher.session.epoch,owner:'1'.repeat(32)}),'Other owner released new revision');
  check(receiver.receive(second)===null,'Old packet crossed reset');
  const finalAck=receiver.receive(outgoing);check(publisher.complete(finalAck),'New epoch failed');
  publisher.close();receiver.close();
  rejects(()=>publisher.publish(1400),'Closed publisher admitted');rejects(()=>receiver.views.map.read(),'Closed UI readable');
  check(receiver.retainedObjects===0 && errors.length===0,'Ownership leak');
  let timeoutError=0;
  const hung=new LanPresentationUiPublisher(snapshot,()=>{},()=>timeoutError++,15);hung.publish(1500);
  await new Promise(resolve=>setTimeout(resolve,30));check(timeoutError===1 && hung.stats.closed,'Hung receiver did not close');
  const failed=new LanPresentationUiPublisher(snapshot,()=>{throw Error('send failure');},()=>{});
  rejects(()=>failed.publish(1500),'Send failure accepted');check(failed.stats.closed,'Send failure left pending graph');
  views.dispose();
  return {checks,frames:frames.length,lengths,methods:true,aliases:true,mutableDefinitions:true,nonJsonNumbers:true,
    blockedCaptures:captured,skipped:publisher.stats.skipped,historyStable:true,rejectedDeltaAtomic:true,duplicateRoster:true,epochOwnerFences:true,timeout:true,sendFailure:true};
}

/** Runs against the actual Offscreen realm and actual runtime publisher, not a
 * Worker stub. Expected strings are an untimed oracle only, never production UI. */
export async function checkUiWorker(request) {
  let receiver;
  const rows=[];
  for(let i=0;i<5;i++) {
    const result=await request({type:i===0?'ui-open':'ui-publish',mutation:i});
    if(!receiver)receiver=new LanPresentationUiReceiver(result.session);
    const receipt=receiver.receive(result.packet), hud=receiver.views.hud;
    check(uiGraph(hud.playerShip)===result.player,'Real Worker HUD changed');
    check(uiGraph(receiver.views.map.read())===result.map,'Real Worker map changed');
    check(uiGraph(receiver.views.deployment.read())===result.deployment,'Real Worker deployment changed');
    check(uiGraph(receiver.views.presence())===result.presence,'Real Worker presence changed');
    check(hud.playerShip instanceof HudContactRecord && hud.playerShip.pos instanceof Vector2,'Real transfer lost methods');
    if(i===0){const blocked=await request({type:'ui-publish',mutation:0});check(blocked.skipped&&!blocked.packet,'Worker queued UI while unacknowledged');}
    const reply=await request({type:'ui-ack',receipt},[receipt.buffer]);
    check(receipt.buffer.byteLength===0 && reply.accepted && reply.detached,'Real Worker buffer recycle failed');
    rows.push({revision:result.packet.graph.revision,length:result.packet.graph.length,nodes:result.packet.graph.liveNodeCount,metadata:result.packet.graph.metadata.length});
  }
  const pending=await request({type:'ui-publish',mutation:0});
  const oldReceipt=receiver.receive(pending.packet);
  const reset=await request({type:'ui-reset'});check(receiver.reset(reset.session),'Worker epoch not announced');
  const late=await request({type:'ui-ack',receipt:oldReceipt},[oldReceipt.buffer]);check(!late.accepted,'Late worker ACK released new epoch');
  const next=await request({type:'ui-publish',mutation:0});
  const receipt=receiver.receive(next.packet);check((await request({type:'ui-ack',receipt},[receipt.buffer])).accepted,'New worker epoch failed');
  const close=await request({type:'ui-close'});check(close.closed,'Worker UI ownership retained');receiver.close();
  return {actualWorker:true,rows,recycled:true,backpressure:true,reset:true,closed:true,commands:'not transported'};
}
