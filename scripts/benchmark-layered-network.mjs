if(process.argv.includes('--shared-realtime'))throw Error('Rejected Phase12 shared combat/visual pool: projectile starvation; see report.');
import {sampleStateAge} from './lib/replay-state-age.mjs';
import {encodeMotionDisplayFrame} from '../src/network/MotionDisplay.mjs';
import { createHash } from 'node:crypto';
import { LanCriticalCombat } from '../server/LanCriticalCombat.mjs';
import { COMBAT_WIRE_MAGIC, readCombatEnvelope, CombatWireReceiver } from '../server/CriticalCombatWire.mjs';
import { COMBAT_FLAGS, COMBAT_NUMBERS, COMBAT_PHASES, encodeCombatState, decodeCombatState, combatStateFromText } from '../src/network/CriticalCombatState.mjs';
import {motionWireTarget,MotionWireSender,MotionWireReceiver,encodeMotionWireEnvelope,decodeMotionWireEnvelope} from '../server/MotionWire.mjs';
import {VisualWireReceiver,encodeVisualWireEnvelope,decodeVisualWireEnvelope} from '../server/ProjectileVisualWire.mjs';
import {build} from 'esbuild';
import {LanProjectileVisuals} from '../server/LanProjectileVisuals.mjs';
import {AnchoredProjectilePublisher,AnchoredProjectileReceiver} from '../src/network/AnchoredProjectileVisual.mjs';
import {visualPacketBytes,visualReceipt} from '../src/network/ProjectileVisualPacket.mjs';
import {withoutBulkProjectiles} from '../src/network/ProjectileBulkVariant.mjs';
// Headless replay, not a game/Steam/n2n performance claim. Every guest has its
// own Node process. Real WS/deflate/TCP bytes share ONE FIFO uplink bottleneck.
// Usage: node scripts/benchmark-layered-network.mjs <recording-dir> <output.json>
// Optional: --five (5 players only), --matrix (3/4/5 players x 1/2/4/32 Mbps x 20/60/120ms RTT).
import {LanBulkScheduler} from '../server/LanBulkScheduler.mjs';
import {SnapshotChunkReceiver,isSnapshotChunk} from '../server/SnapshotChunkCodec.mjs';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { LanDeltaSender, lanDeltaTarget } from '../server/LanDeltaTransport.mjs';
import { LanStateCredits } from '../server/LanStateCredits.mjs';
import { MotionDeliveryWindow } from '../server/MotionDeliveryWindow.mjs';
import { LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
import { encodeBinaryState, decodeBinaryState, encodeProjectedBinaryFrame } from '../src/network/BinarySnapshot.mjs';
import { encodeMotionFrame, motionToText, motionFromText } from '../src/network/MotionFrame.mjs';
import { lanPerMessageDeflate } from '../server/lan-websocket.mjs';
const MATCH='5fd3acbe-1240-4f66-9c20-7e86f78e4ad0',SYNC='217843bc-06a1-465f-8539-d4945f73ea62';
if(process.argv.includes('--shared-detail'))throw Error('Rejected shared-window prototype: see Phase7 report; do not silently benchmark without its gate');
const now = () => performance.timeOrigin + performance.now();
const wait = ms => new Promise(r => setTimeout(r, ms));
const quantile = (xs, q) => xs.length ? xs.toSorted((a,b)=>a-b)[Math.floor((xs.length-1)*q)] : null;
const distribution = xs => ({p50:quantile(xs,.5),p95:quantile(xs,.95),p99:quantile(xs,.99)});
async function client() {
  const [port, seat, layered] = process.argv.slice(3).map(Number), decoder = new LanDeltaReceiver({motionReference:true});
  const motionWireReceiver=new MotionWireReceiver(),combatWireReceiver=new CombatWireReceiver();
  const chunkReceiver=new SnapshotChunkReceiver(),visualReceiver=new AnchoredProjectileReceiver(MATCH),visualPackets=new VisualWireReceiver();
  const sockets = [], inputs = new Map();let stopped=false,inputSeq=0,lastAck=0;
  const consume = (kind, tick, acknowledged, ms, digest = null) => {
    const receivedAt=now(),ack=acknowledged?.[seat],inputAckMs=inputs.has(ack)&&ack>lastAck?receivedAt-inputs.get(ack):null;
    if(ack>lastAck){lastAck=ack;for(const seq of inputs.keys())if(seq<=ack)inputs.delete(seq);}
    process.send?.({kind,tick,receivedAt,decodeMs:ms,inputAckMs,digest});
  };
  for(const kind of layered?['bulk','critical']:['bulk']){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/${seat}/${kind}`,{perMessageDeflate:lanPerMessageDeflate()});sockets.push(ws);
    ws.on('error',error=>{if(!stopped)process.send?.({error:String(error)});});
    ws.on('message',(raw,binary)=>{
      try{
        const at=performance.now();
        if(binary&&kind==='critical'&&raw.readUInt32BE(0)===COMBAT_WIRE_MAGIC){const m=combatWireReceiver.decode(readCombatEnvelope(raw)),f=combatStateFromText(m.data);const hash=createHash('sha256').update(encodeCombatState(f)).digest('hex');consume('combat',f.tick,null,performance.now()-at,hash);if(f.weapons)consume('weapons',f.tick,null,performance.now()-at,hash);ws.send(JSON.stringify({type:'combat-consumed',matchId:m.matchId,syncId:m.syncId,tick:m.tick,status:'consumed'}));return;}
        if(binary&&kind==='critical'&&raw.readUInt32BE(0)===0x53564c31){raw=Buffer.from(JSON.stringify(decodeVisualWireEnvelope(raw)));binary=false;}
        if(binary&&kind==='critical'){
          const m=motionWireReceiver.decode(decodeMotionWireEnvelope(raw)),f=motionFromText(m.data);consume('critical',f.tick,f.acknowledged,performance.now()-at);ws.send(JSON.stringify({seq:f.tick}));return;
        }
        if(binary){if(isSnapshotChunk(raw)){const r=chunkReceiver.receive(raw);(sockets.at(-1)?.readyState===WebSocket.OPEN?sockets.at(-1):ws).send(JSON.stringify(r.receipt));if(!r.payload)return;raw=r.payload;}const full=decodeBinaryState(decoder.decode(raw));consume('bulk',full.seq,full.frame.acknowledged,performance.now()-at);ws.send(JSON.stringify({seq:full.seq}));}
        else {const m=JSON.parse(raw);if(m.type==='projectile-visual'){const decoded=visualPackets.take(m);if(decoded.receipt)ws.send(JSON.stringify(decoded.receipt));if(!decoded.packet)return;const b=visualPacketBytes(decoded.packet);const f=m.kind==='baseline'?visualReceiver.baseline(m.key,b):visualReceiver.update(m.key,b);if(f)consume('visual',f.tick,null,performance.now()-at);ws.send(JSON.stringify(visualReceipt(m)));return;}if(m.type!=='motion')throw Error('Unexpected critical frame');const f=motionFromText(m.data);consume('critical',f.tick,f.acknowledged,performance.now()-at);ws.send(JSON.stringify({seq:f.tick}));}
      }catch(error){process.send?.({error:String(error)});}
    });
    await once(ws,'open');
  }
  const inputSocket=sockets.at(-1);
  const timer=setInterval(()=>{if(inputSocket.bufferedAmount || inputSocket.readyState!==WebSocket.OPEN)return;inputSeq++;inputs.set(inputSeq,now());if(inputs.size>600)inputs.delete(inputs.keys().next().value);inputSocket.send(JSON.stringify({input:inputSeq}));},1000/60);
  process.send({ready:true});
  process.once('disconnect',()=>{stopped=true;clearInterval(timer);for(const ws of sockets)ws.terminate();});
}
// Packet-sized chunks, FIFO across ALL guests and BOTH downstream streams.
// No privileged critical queue and no per-guest bandwidth multiplication.
class SharedLink {
  constructor(bytesPerSecond, delay, errors){this.rate=bytesPerSecond;this.delay=delay;this.errors=errors;this.serial=0;this.queue=[];this.bytes=0;this.peak=0;this.total=0;this.sources=new Set();}
  add(src,dst){
    this.sources.add(src);
    src.on('data',data=>{
      for(let i=0;i<data.length;i+=1500){const part=data.subarray(i,i+1500);this.serial=Math.max(this.serial,performance.now())+part.length*1000/this.rate;this.queue.push({data:part,dst,at:this.serial+this.delay});this.bytes+=part.length;}
      this.peak=Math.max(this.peak,this.bytes);
      if(this.bytes>16*1024*1024){this.errors.push('shared proxy bound exceeded');src.destroy();dst.destroy();return;}
      if(this.bytes>1024*1024)for(const s of this.sources)s.pause();this.pump();
    });
  }
  pump(){
    clearTimeout(this.timer);
    while(this.queue.length && this.queue[0].at<=performance.now()){
      const item=this.queue.shift();this.bytes-=item.data.length;
      if(!item.dst.destroyed){item.dst.write(item.data);this.total+=item.data.length;}
    }
    if(this.bytes<512*1024)for(const s of this.sources)if(!s.destroyed)s.resume();
    if(this.queue.length)this.timer=setTimeout(()=>this.pump(),Math.max(1,this.queue[0].at-performance.now()));
  }
  close(){clearTimeout(this.timer);this.queue.length=0;}
  stats(){return {wireBytes:this.total,peakQueuedBytes:this.peak,remainingBytes:this.bytes};}
}
async function trial(frames, config, layered, visualRows, duration=10000, combatRows=null) {
  const combat=layered&&process.argv.includes('--combat'),combatFanout=new LanCriticalCombat(MATCH);
  const motionWire=layered&&process.argv.includes('--motion-wire');
  const motionDisplay=layered&&process.argv.includes('--display-motion');
  const chunked=layered&&process.argv.includes('--chunked'),chunks=new LanBulkScheduler({adaptive:true,maxFlightBytes:65536,initialFlightBytes:16384,maxPeerFlightBytes:16384});
  const visualWire=process.argv.includes('--visual-wire');
  const visuals=layered&&process.argv.includes('--visuals'),publisher=new AnchoredProjectilePublisher(MATCH),fanout=new LanProjectileVisuals(MATCH,{maxFlightBytes:Number(process.argv.find(a=>a.startsWith('--visual-flight='))?.split('=')[1]??32768)});
  const {players,mbps,rtt}=config, errors=[], rows=[], encodeMs=[], peers=new Map(), children=[], sockets=new Set();
  const down=new SharedLink(mbps*1e6/8,rtt/2,errors),up=new SharedLink(32e6/8,rtt/2,errors);
  const backend=new WebSocketServer({host:'127.0.0.1',port:0,perMessageDeflate:lanPerMessageDeflate()});
  let proxy,timer,probe,started=0,seq=0,stopped=false;const produced=new Map(),componentHashes=new Map();
  const flushCombat=()=>{if(!combat)return;combatFanout.flush([...peers.values()].map(peer=>({peer,syncId:SYNC,idleRttMs:rtt})),{
    writable:p=>p.critical?.readyState===WebSocket.OPEN&&!p.critical.bufferedAmount,
    send:(p,bytes)=>{p.critical.send(bytes,{binary:true,compress:false});return true;}
  });};
  const flushVisuals=()=>{if(!visuals)return;fanout.flush([...peers.values()].map(peer=>({peer,syncId:SYNC})),{
    encode:(_p,m)=>visualWire?encodeVisualWireEnvelope(m):JSON.stringify(m),
    writable:p=>p.critical?.readyState===WebSocket.OPEN&&!p.critical.bufferedAmount,
    send:(p,kind,m,encoded)=>{if(Buffer.byteLength(encoded)>16384)return false;p.critical.send(encoded,{binary:Buffer.isBuffer(encoded),compress:!Buffer.isBuffer(encoded)});return true;}
  });};
  try{
    await once(backend,'listening');
    backend.on('connection',(ws,req)=>{
      const [,seat,kind]=req.url.split('/');let peer=peers.get(+seat);
      if(!peer){peer={wire:new MotionWireSender(),bulk:null,critical:null,lastBulk:-Infinity,input:0,full:new LanStateCredits(),motion:new MotionDeliveryWindow(),delta:new LanDeltaSender({ordered:true,motionReference:true})};peer.full.recordNetworkRtt(rtt);peer.motion.recordNetworkRtt(rtt);peers.set(+seat,peer);}
      peer[kind]=ws;
      if(kind==='bulk'){peer.probes=new Map();ws.on('pong',raw=>{const at=Number(raw),token=peer.probes.get(at);if(token){peer.probes.delete(at);peer.full.recordNetworkRtt(performance.now()-at,token);}});}
      ws.on('error',e=>{if(!stopped)errors.push(String(e));});
      ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='combat-consumed'){assert.ok(combatFanout.acknowledge(peer,m));flushCombat();return;}if(m.type==='visual-consumed'){assert.ok(fanout.acknowledge(peer,m));flushVisuals();return;}if(m.type==='bulk-ack'){assert.ok(chunks.acknowledge(peer,m));flushVisuals();return;}if(m.input){peer.input=m.input;return;}if(kind==='critical'){assert.ok(peer.motion.ack(m.seq));chunks.observeCritical(peer,peer.motion.lastAckMs,peer.motion.networkRttMs);flushVisuals();}else {assert.ok(peer.full.ack(m.seq));peer.delta.ack(m.seq);}});
    });
    proxy=net.createServer(front=>{
      front.setNoDelay(true);const back=net.connect(backend.address().port,'127.0.0.1');back.setNoDelay(true);
      for(const s of [front,back]){sockets.add(s);s.on('error',e=>{if(!stopped)errors.push(String(e));});}
      down.add(back,front);up.add(front,back);
    });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
    await Promise.all(Array.from({length:players-1},async(_,i)=>{
      const child=fork(fileURLToPath(import.meta.url),['--client',String(proxy.address().port),String(i),String(+layered)],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});children.push(child);child.stderr.on('data',b=>{if(!stopped)errors.push(String(b));});
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('guest handshake timeout')),20000);child.once('error',reject);
        child.on('message',m=>{
          if(m.error){errors.push(m.error);return;}
          if(m.ready){clearTimeout(timeout);resolve();return;}
          if(m.digest && !componentHashes.get(m.tick)?.has(m.digest)){errors.push('Complete component mismatch '+m.tick);return;}
          const at=produced.get(m.tick);if(at!==undefined)rows.push({...m,seat:i,at:m.receivedAt-started,ageMs:m.receivedAt-at});else errors.push('Unknown replay tick '+m.tick);
        });
      });
    }));
    started=now();let next=performance.now();const cpu=process.cpuUsage();
    timer=setInterval(()=>{
      if(performance.now()<next)return;next+=1000/60;seq++;produced.set(seq,now());
      const recorded=frames[(seq-1)%frames.length],acknowledged=Object.fromEntries([...peers].map(([seat,p])=>[seat,p.input]));
      let target=null,visualTarget=null,motionData=null,wireTarget=null;
      if(combat&&seq%3===1){
        const component={...combatRows[(seq-1)%frames.length],tick:seq,time:seq/60},data=encodeCombatState(component);
        const core=encodeCombatState({...component,weapons:undefined});
        componentHashes.set(seq,new Set([data,core].map(b=>createHash('sha256').update(b).digest('hex'))));
        combatFanout.publish(data,seq);setImmediate(flushCombat);
      }
      if(visuals&&seq%3===1){fanout.publish(publisher.publish({tick:seq,time:seq/60,rows:visualRows[(seq-1)%frames.length]}));setImmediate(flushVisuals);}
      // Relay rotates recipients and shares target/delta cache exactly like production.
      const recipients=[...peers.values()];recipients.push(...recipients.splice(0,seq%recipients.length));
      for(const p of recipients){
        if(layered)p.motion.offer(seq); // Production records offered authority even when its socket is busy.
        if(layered&&p.critical?.readyState===WebSocket.OPEN&&!p.critical.bufferedAmount&&p.motion.mayPrepare(seq)){
          motionData??=motionToText((motionDisplay?encodeMotionDisplayFrame:encodeMotionFrame)({tick:seq,time:seq/60,acknowledged,ships:recorded.ships.map(({id,state:s})=>[id,...s.pos.$vector,...s.vel.$vector,s.facingRad,s.angularVelRad,s.teleportSequence,(s.isDead?1:0)|(s.isRetreated?2:0)])}));
          const m={type:'motion',matchId:MATCH,syncId:SYNC,data:motionData};
          if(motionWire)wireTarget??=motionWireTarget(motionData);
          const choice=motionWire?p.wire.prepare(wireTarget,m):null,packet=choice?encodeMotionWireEnvelope(m,choice):JSON.stringify(m);
          if(p.motion.reserve(seq,Buffer.byteLength(packet))){p.critical.send(packet,{binary:!!choice,compress:!choice});if(choice)assert.ok(p.wire.commit(choice));}
        }
        if(visuals&&fanout.needsBaseline(p,SYNC)){setImmediate(flushVisuals);continue;}
        if(layered&&p.motion.detailIntervalMs&&(performance.now()-p.lastBulk<p.motion.detailIntervalMs||p.full.stats().inflight>=1))continue;
        if((chunked&&chunks.busy(p))||p.bulk.bufferedAmount||p.full.stats().inflight>=p.full.capacity)continue;
        const at=performance.now();
        const compact=visuals&&fanout.canReplaceBulk(p,SYNC,seq);
        let selected=compact?visualTarget:target;
        if(!selected){let frame={...recorded,tick:seq,acknowledged};if(compact)frame=withoutBulkProjectiles(frame);const bytes=encodeBinaryState(MATCH,seq,encodeProjectedBinaryFrame(frame));selected=lanDeltaTarget(bytes,seq);if(compact)visualTarget=selected;else target=selected;}
        const choice=p.delta.prepare(selected);
        if(choice.budgetFallback||!p.full.reserve(seq,selected.bytes.length))continue;
        if(chunked){assert.ok(chunks.enqueue(p,choice.packet,{send(b,done){p.bulk.send(b,{binary:true,compress:false},done);return true;},started(){assert.ok(p.delta.commit(choice));p.lastBulk=performance.now();},failed(error){errors.push(String(error));}}));}
        else{p.bulk.send(choice.packet);p.delta.commit(choice);p.lastBulk=performance.now();}
        encodeMs.push(performance.now()-at);
      }
    },4);
    probe=setInterval(()=>{for(const p of peers.values())if(!p.probes.size){const at=performance.now();p.probes.set(at,p.full.beginNetworkProbe());p.bulk.ping(String(at));}},1000);
    await wait(duration);clearInterval(timer);clearInterval(probe);
    const warmup=3000,seconds=(duration-warmup)/1000,steady=rows.filter(r=>r.at>=warmup&&r.at<duration),usage=process.cpuUsage(cpu);
    assert.deepEqual(errors,[]);
    return {players,mbps,rtt,layered,chunked,motionWire,motionDisplay,combat,combatBudget:combatFanout.stats(),identityBytes:36,visualWire,visuals,visualBudget:fanout.stats(),visualPublisher:publisher.stats(),chunkBudget:chunks.stats(),durationMs:duration,warmupMs:warmup,offeredHz:seq/duration*1000,
      peers:[...peers].map(([seat,p])=>({seat,...Object.fromEntries(['critical','bulk','visual','combat','weapons'].map(kind=>{const a=steady.filter(r=>r.seat===seat&&r.kind===kind),observed=sampleStateAge(rows.filter(r=>r.seat===seat&&r.kind===kind),warmup,duration);return [kind,{hz:a.length/seconds,ageMs:distribution(a.map(r=>r.ageMs)),observedAgeMs:distribution(observed.ages),observedSamples:observed.samples,missingSamples:observed.missingSamples,decodeMs:distribution(a.map(r=>r.decodeMs))}];})),syntheticInputAckMs:distribution(steady.filter(r=>r.seat===seat&&r.inputAckMs!==null).map(r=>r.inputAckMs)),motion:p.motion.stats(),motionWire:p.wire.stats(),bulkWindow:p.full.stats()})),
      senderCpuMs:(usage.user+usage.system)/1000,encodeMs:distribution(encodeMs),downlink:down.stats(),uplink:up.stats(),errors};
  }finally{
    stopped=true;combatFanout.close();chunks.close();fanout.close();clearInterval(timer);clearInterval(probe);down.close();up.close();for(const s of sockets)s.destroy();
    for(const p of peers.values()){p.bulk?.terminate();p.critical?.terminate();}
    for(const c of children){if(c.connected)c.disconnect();if(c.exitCode===null){const exited=once(c,'exit');c.kill();await exited;}}
    await new Promise(r=>backend.close(r));if(proxy)await new Promise(r=>proxy.close(r));
  }
}
if(process.argv[2]==='--client')await client();
else{
  const duration=Number(process.argv.find(a=>a.startsWith('--duration-ms='))?.split('=')[1]??10000);assert.ok(Number.isInteger(duration)&&duration>=5000&&duration<=120000,'duration range');
  const folder=process.argv[2],output=process.argv[3];assert.ok(folder&&output,'recording-dir and output.json required');
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),frames=manifest.rows.map(r=>decodeBinaryState(fs.readFileSync(path.join(folder,r.name))).frame);
  let visualRows=null;
  if(process.argv.includes('--visuals')){const code=(await build({stdin:{contents:"export {expandSnapshotProjectiles} from './src/network/ProjectileProjection';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})).outputFiles[0].text;const {expandSnapshotProjectiles}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));visualRows=frames.map(expandSnapshotProjectiles);}
  let combatRows=process.argv.includes('--combat')?frames.map(f=>f.ships.map(({id,state})=>{
    const get=path=>{let v=state;for(const key of path.split('.')){if(v&&Object.hasOwn(v,'$record'))v=Object.fromEntries(f.layouts[v.$record].map((k,i)=>[k,v.values[i]]));v=v[key];}return v;};
    let flags=0;COMBAT_FLAGS.forEach((key,i)=>{const v=get(key);assert.equal(typeof v,'boolean');if(v)flags|=1<<i;});
    return [id,flags,COMBAT_PHASES.indexOf(get('shield.phaseState')),...COMBAT_NUMBERS.map(get)];
  })).map(ships=>({ships})):null;
  const weaponFile=process.argv.find(a=>a.startsWith('--weapon-components='))?.slice('--weapon-components='.length);
  if(weaponFile){
    assert.ok(combatRows,'--weapon-components requires --combat');const file=JSON.parse(fs.readFileSync(weaponFile,'utf8'));
    assert.equal(path.resolve(folder),file.recording);assert.equal(file.rows.length,frames.length);
    combatRows=file.rows.map((row,i)=>{assert.equal(row.name,manifest.rows[i].name);assert.equal(row.tick,manifest.rows[i].tick);const f=decodeCombatState(Buffer.from(row.data,'base64'));assert.ok(f.weapons);assert.equal(f.tick,frames[i].tick);assert.deepEqual(f.ships,combatRows[i].ships);return {ships:f.ships,weapons:f.weapons};});
  }
  const cases=process.argv.includes('--matrix')?[3,4,5].flatMap(players=>[1,2,4,32].flatMap(mbps=>[20,60,120].map(rtt=>({players,mbps,rtt})))):[3,4,5].flatMap(players=>[{players,mbps:4,rtt:60},{players,mbps:32,rtt:20}]);
  const results=[];fs.mkdirSync(path.dirname(output),{recursive:true});
  for(const c of cases.filter(c=>(!process.argv.includes('--five')||c.players===5)&&(!process.argv.includes('--slow-only')||c.mbps===4)))for(const layered of (process.argv.includes('--layered-only')?[true]:[false,true])){
    const r=await trial(frames,c,layered,visualRows,duration,combatRows);results.push(r);console.log(JSON.stringify({players:c.players,mbps:c.mbps,rtt:c.rtt,layered,peers:r.peers.map(p=>({critical:p.critical,bulk:p.bulk,visual:p.visual,combat:p.combat,weapons:p.weapons,syntheticInputAckMs:p.syntheticInputAckMs}))}));
    fs.writeFileSync(output,JSON.stringify({scope:'Recorded 22-ship state, separate Node guest processes, actual WS/deflate bytes over loopback TCP, one shared FIFO downlink. Upstream 32Mbps; no packet loss. Synthetic input echo sampled on replay 60Hz, NOT game execution/input-to-photon. No renderer, Steam, physical n2n or WAN. Warmup excluded. Arrival ages and 20ms sampled latest-decoded state ages (including gaps) reported separately; missing initial states counted. Optional bounded motion DISPLAY precision, not host physics. Whole-world decode; motion decode; optional independent critical combat/weapon decode with pre-expanded recording rows and full-component SHA-256 checks (no native capture/apply cost); optional actual shared visual codec decode and recent-credit bulk omission. Visual publisher captures pre-expanded recording rows (no native capture cost). No game apply/render cost. Chunk case uses pre-negotiated supported critical lanes throughout; production bootstrap/lane-loss/resync fallback is verified by check-layered-motion, not this steady-link replay.',node:process.version,recording:path.resolve(folder),weaponComponents:weaponFile??null,results},null,2));
  }
}
