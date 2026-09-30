// Targeted branch of the existing Offscreen scenario. A loopback fixture peer
// exercises production connection/socket/owner code, not relay or WAN performance.
import { LanConnection } from '../../src/network/protocol';
import { LanPresentationRuntime } from '../../src/network/LanPresentationRuntime';
import { inspectLanComponent, LAN_COMPONENT_LIMITS } from '../../src/network/LanPresentationComponents';
import { PresentationReceipts } from '../../src/network/PresentationReceipts';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { decodeBinaryFrame, encodeBinaryState } from '../../src/network/BinarySnapshot.mjs';
import { encodeMotionFrame, motionToText, motionFromText } from '../../src/network/MotionFrame.mjs';
import { combatStateFromText } from '../../src/network/CriticalCombatState.mjs';
import { captureCriticalCombat } from '../../src/network/CriticalCombatReplica';
import { motionAuthority } from '../../src/network/MotionReplica';
import { shipPresentationPose } from '../../src/engine/visual/ShipPresentation';
import { base64, bytes } from './offscreen-presentation-page.mts';
const check = (ok, why) => { if (!ok) throw Error(why); };
const equal = (a,b,why) => {
  if(JSON.stringify(a)===JSON.stringify(b))return;
  const differences=[];
  const walk=(x,y,path)=>{if(differences.length>=8||JSON.stringify(x)===JSON.stringify(y))return;
    if(x&&y&&typeof x==='object'&&typeof y==='object')for(const key of new Set([...Object.keys(x),...Object.keys(y)]))walk(x[key],y[key],path+'.'+key);
    else differences.push({path,actual:typeof x==='string'?x.slice(0,90):x,expected:typeof y==='string'?y.slice(0,90):y});};
  walk(a,b,'');throw Error(why+': '+JSON.stringify(differences));
};
const rejects = fn => { try { fn(); } catch { return true; } return false; };
const until = async (probe, why) => { const start=performance.now(); while(!probe()) { if(performance.now()-start>8000)throw Error(why);await new Promise(r=>setTimeout(r,5)); } };
export function componentProbe(runtime, now) {
  const p=runtime.pipeline, world=runtime.world;
  p.combat.apply(world,runtime.appliedTick,true);p.motion.render(world,now,runtime.appliedTick);
  return { motion:p.motion.tick,combat:p.combat.tick,weapons:p.combat.weaponTick,applied:runtime.appliedTick,
    row:p.motion.row(world.playerShip.id,now,runtime.appliedTick)??null,
    authority:p.prediction.lastAuthority,receivedAt:Number.isFinite(p.prediction.receivedAt)?p.prediction.receivedAt:null,
    prediction:p.prediction.stats(),combatState:base64(captureCriticalCombat(world,0,true)),
    poses:world.allCapitalShips.map(s=>({id:s.id,pos:s.pos,vel:s.vel,facing:s.facingRad,pose:shipPresentationPose(s)??null})) };
}
export async function checkPresentationComponents(data, request, url) {
  const cases=[], pass=name=>cases.push(name), initial=decodeBinaryFrame(bytes(data.cases[0].wire));
  const make=()=>{const canvas=document.createElement('canvas');return new LanPresentationRuntime(data.match,0,decodeBinaryFrame(bytes(data.cases[0].wire)),canvas,canvas.getContext('webgl2'));};
  const direct=make(),legacy=make();direct.appliedTick=legacy.appliedTick=initial.tick;
  const source=createLanDisplayWorld(data.match,0,decodeBinaryFrame(bytes(data.cases[0].wire))).world;
  const motion=tick=>motionToText(encodeMotionFrame({tick,time:tick/60,acknowledged:{0:tick},ships:source.allCapitalShips.filter(s=>!source.deployment.isReserve(s.id)).map(s=>[s.id,s.pos.x+3,s.pos.y-2,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.teleportSequence,(s.isDead?1:0)|(s.isRetreated?2:0)])}));
  const combat=tick=>{const wire=captureCriticalCombat(source,tick,true);check(wire,'Combat fixture capture failed');return base64(wire);};
  const m1=motion(700),m2=motion(701),c1=combat(702);
  check(combatStateFromText(c1).weapons,'Fixture must exercise SCC2 weapons');
  const beforePose=direct.world.playerShip.pos.clone();
  let callbacks=0;
  const result=direct.receiveMotion(m1,1000,true,ack=>{callbacks++;check(ack===700&&direct.pipeline.prediction.lastAuthority===null,'Callback/prediction ordering changed');});
  const frame=motionFromText(m1);legacy.pipeline.motion.receive(frame,1000,legacy.appliedTick);
  const row=legacy.pipeline.motion.row(legacy.world.playerShip.id,1000,legacy.appliedTick);
  if(row&&!row[8])legacy.pipeline.prediction.receive(motionAuthority(legacy.world.playerShip,row),frame.acknowledged[0],1000);
  check(result.advanced&&result.status==='consumed'&&callbacks===1,'Direct motion retention failed');
  equal(componentProbe(direct,1000),componentProbe(legacy,1000),'Legacy motion/prediction parity');pass('legacy motion, prediction and render-pose parity');
  direct.receiveCombat(c1,702,1000,true,0);legacy.pipeline.combat.receive(combatStateFromText(c1),1000,legacy.appliedTick);
  equal(componentProbe(direct,1000),componentProbe(legacy,1000),'Legacy combat parity');pass('legacy combat including SCC2 weapons parity');
  check(direct.world.playerShip.pos.x===beforePose.x&&direct.world.playerShip.pos.y===beforePose.y,'Presentation changed authority position');pass('authority pose unchanged');
  const stable=componentProbe(direct,1000);
  check(!direct.receiveMotion(m1,1000,true,()=>callbacks++).advanced&&callbacks===1,'Old motion advanced Hz/ACK callback');
  check(!direct.receiveCombat(c1,702,1000,true,0).advanced,'Old combat advanced');
  equal(componentProbe(direct,1000),stable,'Old components rewound retained state');pass('older valid packets consumed without advancement');
  check(direct.receiveMotion(m2,1000,false).status==='discarded'&&direct.receiveCombat(c1,702,1000,false,0).status==='discarded','Inactive direct component consumed');
  check(direct.receiveCombat(c1,702,1000,true,703).status==='discarded','Pre-sync combat consumed');
  equal(componentProbe(direct,1000),stable,'Inactive components mutated state');pass('inactive and minimum tick discards');
  check(rejects(()=>direct.receiveCombat(c1,703,1000,true,0)),'Mismatched combat tick accepted');pass('full codec tick identity');
  for(const text of ['',m1.slice(0,-1),'!'.repeat(32),m1+'AAAA'.repeat(12000)])check(rejects(()=>inspectLanComponent('motion',text)),'Invalid component header admitted');
  check(inspectLanComponent('motion',m1)===700&&inspectLanComponent('combat',c1)===702,'Header identity mismatch');pass('bounded header admission');
  direct.receiveMotion(m2,1000,true);const expectedWorker=componentProbe(direct,1000);
  direct.dispose();legacy.dispose();

  // All four receipt lanes share a terminal barrier but not head-of-line ACK blocking.
  const limits={state:{count:2,units:100},visual:{count:2,units:100},...LAN_COMPONENT_LIMITS};
  for(const kind of ['motion','combat']) {
    let errors=0,cancels=0;const tokens=[],ledger=new PresentationReceipts(()=>errors++,limits);
    for(let i=0;i<limits[kind].count;i++)ledger.deliver(kind,1,()=>true,r=>tokens.push(r.defer(()=>cancels++)));
    check(ledger.stats[kind]===limits[kind].count,'Lane count bound wrong');
    ledger.deliver(kind,1,()=>true,()=>{});
    check(errors===1&&cancels===limits[kind].count&&!ledger.stats.pending&&!ledger.complete(tokens[0],'consumed'),'Overflow failed to fence tasks');
    ledger.deliver(kind,limits[kind].units+1,()=>true,()=>{});check(errors===2,'Encoded budget overflow admitted');
    ledger.reset();pass(kind+' count, encoded budget and reset bounds');
  }
  let ledgerErrors=0;const ledger=new PresentationReceipts(()=>ledgerErrors++,limits),order=[],tokens={};let terminal=false;
  for(const key of ['state','visual','motion1','motion2','combat'])ledger.deliver(key.startsWith('motion')?'motion':key,1,()=>{order.push(key);return true;},r=>tokens[key]=r.defer(()=>{}));
  ledger.afterPending('end',()=>terminal=true);
  check(ledger.complete(tokens.motion2,'consumed')&&order.length===0,'Cumulative motion overtook predecessor');
  ledger.complete(tokens.combat,'consumed');equal(order,['combat'],'Combat blocked on another lane');
  ledger.complete(tokens.motion1,'consumed');equal(order,['combat','motion1','motion2'],'Motion ACK ordering');
  check(!terminal,'Terminal ignored state/visual');ledger.complete(tokens.state,'consumed');ledger.complete(tokens.visual,'consumed');
  check(terminal&&!ledger.stats.pending&&!ledgerErrors,'All-lane terminal failed');pass('four-lane independence, cumulative motion and terminal barrier');
  ledger.reset();

  await request({type:'raw-recreate'});
  const connection=new LanConnection(),jobs=new Map(),acks=[],messages=[],errors=[],stateJobs=new Map();
  let session,reset=Promise.resolve(),componentEvents=0,stateEvents=0;
  connection.subscribe(m=>{messages.push(m);if(m.type==='test-component-ack')acks.push(m);if(m.type==='motion'||m.type==='combat-state')componentEvents++;if(m.type==='state')stateEvents++;if(m.type==='error')errors.push(m.message);});
  const owner={matchId:data.match.id,reset:s=>{session=s;reset=request({type:'raw-reset',session:s});reset.catch(e=>errors.push(String(e)));},
    receive:(packet,receipt)=>{const token=receipt.defer(()=>{void request({type:'raw-cancel'}).catch(e=>errors.push(String(e)));});const job={packet,token};stateJobs.set(packet.seq,job);request({type:'raw-retain',packet,applyOnly:true},[packet.data]).then(r=>job.result=r,e=>{job.error=String(e);receipt.reject(e);});},
    receiveComponent:(packet,receipt)=>{const token=receipt.defer(()=>{void request({type:'raw-cancel'}).catch(e=>errors.push(String(e)));});jobs.set(packet.kind+packet.tick,{packet,token,receipt});}};
  const release=connection.claimBinaryState(owner);check(release,'Component owner not admitted');
  const control=message=>check(connection.send({type:'test-control',message}),'Control send failed');
  const send=(kind,tick,text,extra={})=>control({type:kind==='motion'?'motion':'combat-state',matchId:data.match.id,syncId:'component-sync',...(kind==='combat'?{tick}:{}),data:text,...extra});
  const waitJob=async key=>{await until(()=>jobs.has(key),'Component delivery missing '+key);return jobs.get(key);};
  const consume=async (key,options={})=>{const job=await waitJob(key);job.result=await request({type:'component-retain',packet:job.packet,...options});return job;};
  const finish=key=>{const job=jobs.get(key);return connection.completePresentation(job.token,job.result.result.status);};
  const fence=async()=>{const marker='fence-'+messages.length;control({type:'test-fence',marker});await until(()=>messages.some(m=>m.marker===marker),'Control fence missing');};
  let actualOwner,actualEpoch;
  try {
    connection.connect(url,'component-fixture');await until(()=>connection.ready,'No welcome');await reset;
    check(connection.combatState&&connection.motionState,'Test flags did not negotiate components');
    control({type:'launch',matchId:data.match.id,syncId:'component-sync'});await until(()=>session.components.syncId==='component-sync','Launch reset used old sync');await reset;
    actualOwner=session.owner;actualEpoch=session.epoch;
    connection.send({type:'test-wire',data:base64(encodeBinaryState(data.match.id,1,bytes(data.cases[0].wire)))});
    await until(()=>stateJobs.get(1)?.result||stateJobs.get(1)?.error,'Binary bootstrap failed');check(!stateJobs.get(1).error,'Binary bootstrap error');
    send('motion',700,m1);send('motion',701,m2);send('combat',702,c1);
    await waitJob('motion700');await waitJob('motion701');await waitJob('combat702');await fence();
    check(acks.length===0&&connection.presentationConsumption.motion===2&&connection.presentationConsumption.combat===1,'Post/arrival granted early ACK');
    check(connection.presentationConsumption.units===stateJobs.get(1).packet.bytes+m1.length+m2.length+c1.length,'Encoded accounting mismatch');pass('actual connection holds credits before Worker consumption');
    await consume('motion700');await consume('motion701');await consume('combat702');
    equal(jobs.get('combat702').result.probe,expectedWorker,'Worker/main component effects or prediction differ');pass('actual Worker/main exact component effects and prediction parity');
    check(acks.length===0&&componentEvents===0&&stateEvents===0,'Owner decoded graph/early ACK leaked to default subscribers');pass('raw component strings retained inside actual Worker');
    finish('motion701');finish('combat702');await until(()=>acks.length===1,'Combat ACK blocked by state/motion');
    check(acks[0].kind==='combat-consumed'&&acks[0].tick===702,'Independent ACK mismatch');
    finish('motion700');await until(()=>acks.length===3,'Ordered motion ACKs missing');
    equal(acks.filter(a=>a.kind==='motion-consumed').map(a=>a.tick),[700,701],'Motion cumulative ACK order');pass('real socket independent combat and ordered motion receipts');
    check(connection.completePresentation(stateJobs.get(1).token,'consumed'),'State completion failed');
    // Valid older-than-world packets consume without advancing either lane.
    send('motion',590,motion(590));const old=await consume('motion590');check(!old.result.result.advanced&&old.result.result.status==='consumed'&&old.result.probe.motion===701,'Old Worker motion rewound');finish('motion590');
    send('combat',590,combat(590));const oldCombat=await consume('combat590');check(!oldCombat.result.result.advanced&&oldCombat.result.result.status==='consumed','Old Worker combat rewound');finish('combat590');pass('Worker stale frames consume without advancing');
    send('motion',703,motion(703));const inactive=await consume('motion703',{active:false});check(inactive.result.result.status==='discarded','Inactive Worker motion consumed');finish('motion703');
    send('combat',704,combat(704));await consume('combat704',{active:false});finish('combat704');
    send('combat',705,combat(705));await consume('combat705',{minTick:706});finish('combat705');await fence();
    check(!acks.some(a=>a.kind==='motion-consumed'&&a.tick===703)&&acks.some(a=>a.tick===704&&a.status==='discarded')&&acks.some(a=>a.tick===705&&a.status==='discarded'),'Inactive/minTick ACK semantics');pass('no inactive motion activation; explicit combat discard');
    const count=jobs.size;send('motion',706,motion(706),{syncId:'obsolete'});send('combat',707,combat(707),{matchId:'other'});await fence();check(jobs.size===count,'Wrong match/sync entered owner');pass('connection fences foreign match/sync');
    send('motion',708,motion(708));const cancelled=await waitJob('motion708');const oldSession=session;
    control({type:'launch',matchId:data.match.id,syncId:'next-sync'});await until(()=>session.components.syncId==='next-sync','New sync not reset');await reset;
    check(!connection.completePresentation(cancelled.token,'consumed'),'Old receipt survived reset');
    const stale=await request({type:'component-retain',packet:cancelled.packet});check(!stale.result.advanced&&stale.result.status==='discarded'&&stale.probe.motion===-1,'Stale Worker epoch mutated');pass('launch reset revokes epoch, sync, retained endpoints and receipts');
    const newPacket={...cancelled.packet,owner:session.owner,epoch:session.epoch,syncId:'next-sync'};
    const foreign=await request({type:'component-retain',packet:{...newPacket,owner:'f'.repeat(32)}});check(!foreign.result.advanced,'Foreign owner accepted');
    const wrongSync=await request({type:'component-retain',packet:{...newPacket,syncId:oldSession.components.syncId}});check(!wrongSync.result.advanced,'Wrong sync accepted inside Worker');pass('Worker explicitly checks owner and sync');
    send('motion',710,motion(710),{syncId:'next-sync'});await waitJob('motion710');
    send('combat',711,combat(711),{syncId:'next-sync'});await waitJob('combat711');
    control({type:'ended',matchId:data.match.id});await until(()=>connection.presentationConsumption.terminalPending,'Terminal failed to wait');
    await consume('motion710');finish('motion710');await fence();check(!messages.some(m=>m.type==='ended'),'Terminal ignored combat');
    await consume('combat711');finish('combat711');await until(()=>messages.some(m=>m.type==='ended'),'Terminal did not finish');await until(()=>acks.some(a=>a.tick===711),'Final combat ACK missing');await reset;
    check(!connection.presentationConsumption.pending&&!errors.length,'Terminal cleanup/errors: '+errors);pass('actual terminal waits for both component lanes');
  } finally {connection.close(false);release();await reset;}

  // Explicitly configure a new test owner after the real connection is closed.
  const testSession={owner:actualOwner,epoch:actualEpoch+100,matchId:data.match.id,binaryDelta:true,motionReference:true,projectileVisuals:false,components:{syncId:'test',motion:false,combat:false}};
  await request({type:'raw-reset',session:testSession});
  const pkt={owner:testSession.owner,epoch:testSession.epoch,matchId:data.match.id,syncId:'test',kind:'motion',tick:700,data:m1};
  check(!(await request({type:'component-retain',packet:pkt})).result.advanced,'Disabled component accepted');pass('unnegotiated Worker component disabled');
  await request({type:'raw-reset',session:{...testSession,epoch:++testSession.epoch,components:{syncId:'test',motion:true,combat:true}}});pkt.epoch=testSession.epoch;
  const malformed=m1.slice(0,-4)+'!!!!';check(inspectLanComponent('motion',malformed)===700,'Malformed-body fixture corrupted header');
  check(await request({type:'component-retain',packet:{...pkt,data:malformed}}).then(()=>false,()=>true),'Malformed full body accepted by Worker');
  check(await request({type:'component-retain',packet:pkt}).then(()=>false,()=>true),'Failed owner kept accepting components');pass('valid header does not bypass full decoder; failure closes owner');

  // Default (non-owner) connection still consumes synchronously; it does not
  // need a Worker, timer, or an added frame of buffering.
  const local=make(),sync=new LanConnection(),syncAcks=[],syncErrors=[];local.appliedTick=initial.tick;let deliveries=0,active=true;
  sync.subscribe((m,receipt)=>{
    if(m.type==='test-component-ack')syncAcks.push(m);
    if(m.type==='error')syncErrors.push(m.message);
    if(m.type==='motion'){deliveries++;check(sync.presentationConsumption.motion===1&&!syncAcks.some(a=>a.tick===inspectLanComponent('motion',m.data)),'Default ACK preceded retain');receipt.complete(local.receiveMotion(m.data,1000,active).status);}
    if(m.type==='combat-state'){deliveries++;receipt.complete(local.receiveCombat(m.data,m.tick,1000,active,0).status);}
  });
  try {
    sync.connect(url,'synchronous-components');await until(()=>sync.ready,'Default welcome failed');
    sync.send({type:'test-control',message:{type:'launch',matchId:data.match.id,syncId:'direct'}});
    const sendSync=(type,text,tick)=>sync.send({type:'test-control',message:{type,matchId:data.match.id,syncId:'direct',data:text,tick}});
    sendSync('motion',m1,700);sendSync('combat-state',c1,702);await until(()=>syncAcks.length===2,'Default synchronous ACKs missing');
    check(local.pipeline.motion.tick===700&&local.pipeline.combat.tick===702&&!sync.presentationConsumption.pending,'Default synchronous state mismatch');pass('default synchronous connection uses runtime consumption');
    active=false;sendSync('motion',m2,701);sendSync('combat-state',combat(704),704);await until(()=>deliveries===4&&syncAcks.length===3,'Default discard delivery failed');
    check(!syncAcks.some(a=>a.tick===701)&&syncAcks.at(-1).status==='discarded'&&!syncErrors.length,'Default inactive ACK/error mismatch');pass('default inactive receipt behavior');
  } finally {sync.close(false);local.dispose();}
  // Before the first binary anchor, component debt still belongs to the old
  // owner. Handoff must revoke tokens AND refresh remote credits.
  const handoff=new LanConnection(),handoffEvents=[];let handoffToken,cancelled=0;
  handoff.subscribe(m=>handoffEvents.push(m));
  const releaseHandoff=handoff.claimBinaryState({matchId:data.match.id,reset:()=>{},receive:()=>{throw Error('Unexpected binary');},
    receiveComponent:(_packet,receipt)=>{handoffToken=receipt.defer(()=>cancelled++);}});
  try {
    handoff.connect(url,'component-handoff');await until(()=>handoff.ready,'Handoff welcome failed');
    handoff.send({type:'test-control',message:{type:'launch',matchId:data.match.id,syncId:'handoff'}});
    handoff.send({type:'test-control',message:{type:'motion',matchId:data.match.id,syncId:'handoff',data:m1}});
    await until(()=>handoffToken,'Pre-anchor component not delivered');releaseHandoff();
    check(cancelled===1&&!handoff.completePresentation(handoffToken,'consumed')&&!handoff.presentationConsumption.pending,'Pre-anchor handoff retained debt');
    check(handoffEvents.some(m=>m.type==='reconnecting'&&m.close.cause==='presentation-owner-changed'),'Pre-anchor handoff did not refresh credits');
    pass('component-only owner handoff refreshes remote credits');
  } finally {handoff.close(false);releaseHandoff();}
  for(const mode of ['unclaimed','promise']) {
    const invalid=new LanConnection(),events=[];let cancelCount=0;
    invalid.subscribe(m=>events.push(m));
    const releaseInvalid=invalid.claimBinaryState({matchId:data.match.id,reset:()=>{},receive:()=>{},
      receiveComponent:(_packet,receipt)=>{if(mode==='promise'){receipt.defer(()=>cancelCount++);return Promise.resolve();}}});
    try {
      invalid.connect(url,'invalid-component-owner');await until(()=>invalid.ready,'Invalid owner welcome failed');
      invalid.send({type:'test-control',message:{type:'launch',matchId:data.match.id,syncId:'invalid'}});
      invalid.send({type:'test-control',message:{type:'motion',matchId:data.match.id,syncId:'invalid',data:m1}});
      await until(()=>events.some(m=>m.code==='PRESENTATION_CONSUMPTION'),'Implicit/asynchronous owner accepted');
      check(!events.some(m=>m.type==='test-component-ack')&&!invalid.presentationConsumption.pending&&cancelCount===(mode==='promise'?1:0),'Failed claim granted credits');
      pass(mode+' component owner fails closed');
    } finally {invalid.close(false);releaseInvalid();}
  }
  return {passed:true,checks:cases.length,cases,acks,scope:'Functional bounded ownership and parity, not a throughput/latency benchmark; strings still clone, production Worker remains opt-in.'};
}
