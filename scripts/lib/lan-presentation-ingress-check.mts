// Extends the existing Offscreen scenario: real socket I/O + LanConnection +
// production runtime in the rendering Worker. The peer echoes fixture bytes;
// it is not a production relay/authority or a latency benchmark.
import { LanConnection } from '../../src/network/protocol';
import { LanBinaryStateIngress, inspectLanBinaryState } from '../../src/network/LanBinaryStateIngress';
import { encodeBinaryState, decodeBinaryFrame, encodeProjectedBinaryFrame as encodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { encodeLanPacket, createLanBytePatch, lanCrc32 } from '../../src/network/LanBinaryDelta.mjs';
import { createMotionReference } from '../../src/network/SnapshotMotionReference.mjs';
import { base64, bytes } from './offscreen-presentation-page.mts';
const check = (ok, why) => { if (!ok) throw Error(why); };
const until = async (probe, why) => { const start = performance.now(); while (!probe()) { if (performance.now()-start>8000) throw Error(why); await new Promise(r=>setTimeout(r,5)); } };
const rejects = fn => { try { fn(); } catch { return true; } return false; };

export async function checkBinaryIngress(data, request, url) {
  const wires = data.cases.map(c=>bytes(c.wire)), state = (index,seq)=>encodeBinaryState(data.match.id,seq,wires[index]);
  const expected = index=>lanCrc32(encodeBinaryFrame(decodeBinaryFrame(wires[index])));
  const session = {owner:'b'.repeat(32),epoch:1,matchId:data.match.id,binaryDelta:true,motionReference:true,projectileVisuals:false};
  const packet = (wire,s=session) => { const buffer=wire.slice().buffer; return {owner:s.owner,epoch:s.epoch,...inspectLanBinaryState(buffer,s),data:buffer}; };
  const baseBytes=state(0,1), base={bytes:baseBytes,seq:1,crc:lanCrc32(baseBytes)}, nextBytes=state(1,2);
  const full=encodeLanPacket(base,null,null,true), patch=createLanBytePatch(baseBytes,nextBytes);
  check(patch,'Fixture needs a real delta');
  const delta=encodeLanPacket({bytes:nextBytes,seq:2,crc:lanCrc32(nextBytes)},base,patch);
  let cases=0;
  const ingress=new LanBinaryStateIngress(data.match.id); ingress.reset(session);
  check(lanCrc32(encodeBinaryFrame(ingress.decode(packet(full)).frame))===expected(0),'Full ingress frame differs');cases++;
  check(lanCrc32(encodeBinaryFrame(ingress.decode(packet(delta)).frame))===expected(1),'Delta ingress frame differs');cases++;
  const reference=createMotionReference(baseBytes,1);check(reference,'Fixture lacks motion reference');
  const motionPatch=createLanBytePatch(reference,nextBytes);check(motionPatch,'Fixture lacks corrected motion patch');
  const motion=encodeLanPacket({bytes:nextBytes,seq:2,crc:lanCrc32(nextBytes)},base,motionPatch,false,1);
  check(lanCrc32(encodeBinaryFrame(ingress.decode(packet(motion)).frame))===expected(1),'Corrected motion delta differs');cases++;
  check(ingress.decode({...packet(full),owner:'c'.repeat(32)})===null&&ingress.decode({...packet(full),epoch:0})===null,'Stale owner/epoch mutated ingress');cases++;
  check(rejects(()=>ingress.reset(session)),'Same epoch reset accepted');cases++;
  for(const kind of ['missing-base','crc','identity','budget','projection','unnegotiated']) {
    const test=new LanBinaryStateIngress(data.match.id),config={...session,binaryDelta:kind!=='unnegotiated',motionReference:kind!=='unnegotiated'};test.reset(config);
    let input;
    if(kind==='missing-base')input=packet(delta);
    else if(kind==='crc'){const corrupted=full.slice();corrupted[corrupted.length-1]^=1;input=packet(corrupted);}
    else if(kind==='identity')input={...packet(full),seq:99};
    else if(kind==='budget')input={...packet(full),bytes:1};
    else if(kind==='projection'){const frame=decodeBinaryFrame(wires[0]);frame.projectileVisuals=1;input=packet(encodeBinaryState(data.match.id,1,encodeBinaryFrame(frame)));}
    else input=packet(full);
    check(rejects(()=>test.decode(input)),kind+' accepted');check(test.stats.failed&&test.stats.retainedBytes===0,kind+' retained a failed baseline');cases++;
    test.reset({...config,epoch:2});check(test.decode(packet(baseBytes,{...config,epoch:2}))?.frame.tick===data.cases[0].tick,kind+' did not recover on explicit reset');test.close();
  }
  check(rejects(()=>inspectLanBinaryState(new ArrayBuffer(5),session)),'Truncated header accepted');cases++;
  check(rejects(()=>inspectLanBinaryState(encodeBinaryState('other-match',1,wires[0]).buffer,session)),'Foreign match admitted');cases++;
  ingress.close();check(rejects(()=>ingress.decode(packet(full)))&&ingress.stats.retainedBytes===0,'Closed ingress retained anchors');cases++;

  await request({type:'raw-recreate'});
  const connection=new LanConnection(), messages=[], acks=[], jobs=new Map(), failures=[], detached=[];
  let currentSession, latestReset=Promise.resolve(), decodedEvents=0, resetCount=0;
  connection.subscribe(m=>{messages.push(m);if(m.type==='test-ack')acks.push(m.seq);if(m.type==='state')decodedEvents++;if(m.type==='error')failures.push(m.message);});
  const owner={matchId:data.match.id,
    reset(s){currentSession=s;resetCount++;latestReset=request({type:'raw-reset',session:s});latestReset.catch(e=>failures.push(String(e)));},
    receive(p,receipt){
      const token=receipt.defer(()=>{void request({type:'raw-cancel'}).catch(e=>failures.push(String(e)));});
      const job={token,packet:{...p,data:undefined},result:null};jobs.set(p.seq,job);
      const c=data.cases[0],view=p.seq===1?{camera:c.camera,zoom:c.zoom,dt:c.dt}:undefined;
      const transferred=p.data;void request({type:'raw-retain',packet:p,view},[transferred]).then(result=>{job.result=result;},error=>{job.error=String(error);receipt.reject(error);});
      detached.push(transferred.byteLength===0);
    }};
  const release=connection.claimBinaryState(owner);check(release,'Fresh owner not admitted');check(connection.claimBinaryState(owner)===null,'Multiple binary owners admitted');
  const send=wire=>check(connection.send({type:'test-wire',data:base64(wire)}),'Fixture send failed');
  const control=message=>check(connection.send({type:'test-control',message}),'Control fixture send failed');
  const retained=async seq=>{await until(()=>jobs.get(seq)?.result||jobs.get(seq)?.error,'Worker did not retain '+seq);const job=jobs.get(seq);check(!job.error,job.error);return job;};
  const complete=seq=>connection.completePresentation(jobs.get(seq).token,jobs.get(seq).result.retained?'consumed':'discarded');
  let pixelDifference=0;
  try {
    connection.connect(url,'raw-ingress-fixture');await until(()=>connection.ready,'Fixture welcome timed out');await latestReset;
    send(baseBytes);const first=await retained(1);
    check(first.result.retained&&first.result.probe.crc===expected(0)&&acks.length===0&&decodedEvents===0,'Raw bootstrap/ACK boundary failed');cases++;
    const dom=bytes(window.dom.draw(0,true).pixels),workerPixels=await request({type:'pixels'});
    check(dom.length===workerPixels.length,'Pixel dimensions changed');for(let i=0;i<dom.length;i++)if(dom[i]!==workerPixels[i])pixelDifference++;
    check(pixelDifference===0,'Raw ingress bootstrap pixels differ: '+pixelDifference);cases++;
    check(complete(1),'First consumption rejected');await until(()=>acks.length===1,'First ACK missing');
    const anchorBytes=state(1,2),anchor={bytes:anchorBytes,seq:2,crc:lanCrc32(anchorBytes)},thirdBytes=state(2,3);
    const anchorWire=encodeLanPacket(anchor,null,null,true),thirdPatch=createLanBytePatch(anchorBytes,thirdBytes);check(thirdPatch,'Second delta fixture missing');
    send(anchorWire);send(encodeLanPacket({bytes:thirdBytes,seq:3,crc:lanCrc32(thirdBytes)},anchor,thirdPatch));
    await retained(2);await retained(3);
    check(jobs.get(2).result.probe.crc===expected(1)&&jobs.get(3).result.probe.crc===expected(2),'Real Worker full/delta differs');
    check(connection.presentationConsumption.units===anchorBytes.length+thirdBytes.length,'Budget counted patch size instead of decoded wire size');
    check(complete(3)&&acks.join(',')==='1','Later reply overtook earlier consumption');check(complete(2),'Second consumption failed');await until(()=>acks.length===3,'Ordered ACKs missing');check(acks.join(',')==='1,2,3','Cumulative ACK order changed');cases++;
    send(encodeLanPacket({bytes:state(3,4),seq:4,crc:lanCrc32(state(3,4))},null,null,true));await retained(4);
    const oldSession=currentSession;connection.resetPresentationConsumption();await latestReset;
    check(!complete(4)&&connection.presentationConsumption.pending===0,'Reset accepted old receipt');
    const stale=packet(state(3,4),oldSession),staleResult=await request({type:'raw-retain',packet:stale},[stale.data]);check(!staleResult.retained,'Old raw job crossed owner reset');cases++;
    send(encodeLanPacket({bytes:state(3,5),seq:5,crc:lanCrc32(state(3,5))},null,null,true));await retained(5);check(complete(5),'Fresh reset state rejected');await until(()=>acks.includes(5),'Fresh epoch ACK missing');cases++;
    // Legacy JSON remains explicit; reset the raw anchors before dispatching it.
    control({type:'state',matchId:data.match.id,seq:10,frame:decodeBinaryFrame(wires[3])});await until(()=>decodedEvents===1,'JSON fallback did not stay on legacy path');await latestReset;await until(()=>acks.includes(10),'JSON discard credit missing');cases++;
    send(encodeLanPacket({bytes:state(4,11),seq:11,crc:lanCrc32(state(4,11))},null,null,true));await retained(11);
    control({type:'ended',matchId:data.match.id});await until(()=>connection.presentationConsumption.terminalPending,'Terminal did not wait on owner');
    check(!messages.some(m=>m.type==='ended'),'Terminal overtook pending retain');check(complete(11),'Terminal state rejected');await until(()=>messages.some(m=>m.type==='ended'),'Terminal never released');await until(()=>acks.includes(11),'Final retained state ACK missing');await latestReset;cases++;
    check(detached.every(Boolean)&&failures.length===0&&connection.presentationConsumption.pending===0,'Transfer/cleanup/error mismatch: '+failures.join(';'));cases++;
  } finally { connection.close(false);release();await latestReset; }
  await request({type:'raw-reset',session:{...session,epoch:19}});
  const beforeMin=packet(full,{...session,epoch:19});
  const skipped=await request({type:'raw-retain',packet:beforeMin,minTick:data.cases[1].tick},[beforeMin.data]);
  check(!skipped.retained&&!skipped.probe,'Pre-sync frame was presented');
  const afterMin=packet(delta,{...session,epoch:19});
  const continued=await request({type:'raw-retain',packet:afterMin,minTick:data.cases[1].tick},[afterMin.data]);
  check(continued.retained&&continued.probe.crc===expected(1),'Skipped pre-sync anchor was not retained for later delta');cases++;
  // A bad payload that passed cheap admission must fail at the actual Worker,
  // never turn CRC/header acceptance into a consumption receipt.
  await request({type:'raw-reset',session:{...session,epoch:20}});
  const corrupt=full.slice();corrupt[corrupt.length-1]^=1;const bad=packet(corrupt,{...session,epoch:20});
  let workerRejected=false;try{await request({type:'raw-retain',packet:bad},[bad.data]);}catch{workerRejected=true;}
  check(workerRejected,'Actual Worker accepted bad CRC');cases++;
  const fallback=new LanConnection();let fallbackFrames=0;
  fallback.subscribe(m=>{if(m.type==='state')fallbackFrames++;});
  try{fallback.connect(url,'legacy-fixture');await until(()=>fallback.ready,'Fallback welcome');check(fallback.send({type:'test-wire',data:base64(baseBytes)}),'Legacy fixture send');await until(()=>fallbackFrames===1,'Unclaimed binary default stopped decoding');check(fallback.claimBinaryState(owner)===null,'Mid-stream owner switch admitted');cases++;}finally{fallback.close(false);}
  for (const receive of [()=>{},()=>Promise.reject(Error('Invalid async owner'))]) {
  const unclaimed=new LanConnection(),unclaimedEvents=[];
  unclaimed.subscribe(m=>unclaimedEvents.push(m));
  try {
    unclaimed.claimBinaryState({matchId:data.match.id,reset(){},receive});
    unclaimed.connect(url,'unclaimed-owner-fixture');await until(()=>unclaimed.ready,'Unclaimed owner welcome');
    unclaimed.send({type:'test-wire',data:base64(baseBytes)});
    await until(()=>unclaimedEvents.some(m=>m.code==='PRESENTATION_CONSUMPTION'),'Missing explicit raw consumption silently ACKed');
    check(!unclaimedEvents.some(m=>m.type==='test-ack')&&unclaimed.presentationConsumption.pending===0,'Unclaimed raw owner got an ACK');cases++;
  } finally {unclaimed.close(false);}
  }
  const mixed=new LanConnection(),mixedEvents=[];let mixedToken;
  mixed.subscribe(m=>mixedEvents.push(m));
  try {
    mixed.claimBinaryState({matchId:data.match.id,reset(){},receive(_p,receipt){mixedToken=receipt.defer(()=>{});}});
    mixed.connect(url,'mixed-owner-fixture');await until(()=>mixed.ready,'Mixed owner welcome');
    mixed.send({type:'test-wire',data:base64(baseBytes)});await until(()=>mixed.presentationConsumption.pending===1,'Mixed raw state not pending');
    mixed.send({type:'test-control',message:{type:'state',matchId:data.match.id,seq:20,frame:decodeBinaryFrame(wires[0])}});
    await until(()=>mixedEvents.some(m=>m.type==='reconnecting'),'JSON overtook pending raw data without explicit recovery');
    check(!mixedEvents.some(m=>m.type==='state'||m.type==='test-ack')&&!mixed.completePresentation(mixedToken,'consumed'),'Mixed fallback granted stale consumption');cases++;
  } finally {mixed.close(false);}
  return {cases,pendingJsonHandoffFailsClosed:true,explicitRawConsumptionRequired:true,preSyncAnchorRetained:true,actualConnection:true,actualSocket:true,actualWorker:true,bootstrapWithoutDecodedWorld:true,rawTransfers:detached.length,
    completeFrameCrcParity:true,correctedMotionDelta:true,bootstrapPixelDifference:pixelDifference,orderedConsumption:true,decodedWireBudget:true,
    resetAndStaleReply:true,jsonFallback:true,legacyBinaryDefault:true,terminalBarrier:true,badCrcWorkerRejected:true,resetCount,acks,errors:failures,
    scope:'Fixture WebSocket peer, not full authority/relay LAN or performance; no DOM/key/mouse inputs'};
}
