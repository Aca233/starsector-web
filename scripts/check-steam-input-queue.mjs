// Production gateway/codec regressions in virtual time. No Steam SDK, sockets, services or workers.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { SteamReliableQueue, SteamSendWindow } from '../server/steam/reliable-queue.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry=path.join(root,'server/steam/gateway.mjs');
const config=JSON.parse(fs.readFileSync(path.join(root,'src/network/protocol.json')));
const require=createRequire(import.meta.url);
let assertions=0;
const check=(condition,label)=>{ assertions++; assert.ok(condition,label); };
async function subject(source){
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.url':JSON.stringify(pathToFileURL(entry).href)},plugins:[{name:'frozen-gateway',setup(b){b.onLoad({filter:/gateway\.mjs$/},args=>path.resolve(args.path)===entry?{contents:source,loader:'js',resolveDir:path.dirname(entry)}:null);}}]});
  return result.outputFiles[0].text;
}
function fixture(code,{rtt=300,outage=null}={}){
  const clock={now:100}, nativeDate=Date;
  const context=vm.createContext({require,module:{exports:{}},console,Buffer,URL,setTimeout,clearTimeout,setInterval,clearInterval,
    performance:{now:()=>clock.now},Date:class extends nativeDate{static now(){return clock.now;}}});
  new vm.Script(code).runInContext(context);
  const {SteamGateway}=context.module.exports;
  const ids=['76561198000000001','76561198000000002'];
  const pending=[], inbox=[[],[]], lastDue=[0,0], traffic=[[],[]], received=[], states=[], closes=[];
  let accepted=null, heldAck=null;
  const clients=ids.map((_,i)=>({networking:{
    sendP2PPacket(remote,type,packet){check(type===2,'all traffic remains Reliable, not Nagle/unreliable');const due=Math.max(lastDue[i],clock.now+rtt/2,outage&&clock.now>=outage[0]&&clock.now<outage[1]?outage[1]:0);lastDue[i]=due;
      pending.push({i:1-i,remote:ids[i],data:Buffer.from(packet),due});traffic[i].push({at:clock.now,packet:Buffer.from(packet)});return true;},
    isP2PPacketAvailable(){return inbox[i][0]?.data.length??0;},readP2PPacket(){const p=inbox[i].shift();return {steamId:p.remote,data:p.data};}
  }}));
  const gateways=clients.map(client=>new SteamGateway({build:'fixture',client}));
  for(let i=0;i<2;i++){const g=gateways[i];g.initialized=true;g.owner=ids[i];g.selected={id:'10977524000000001',owner:ids[0],code:'ABCDEF',lobby:{getMembers:()=>ids,getOwner:()=>ids[0]}};}
  gateways[0].relay={acceptTransport(peer){accepted=peer;let window=clock.now,count=0;
    peer.on('close',()=>closes.push({at:clock.now,side:'host'}));
    peer.on('message',raw=>{const data=JSON.parse(raw);if(clock.now-window>=1000){window=clock.now;count=0;}++count;
      received.push({at:clock.now,data,count});if(count>160){peer.close(1008,'Rate limit');return;}
      if(data.type==='hello')peer.send(JSON.stringify({type:'welcome'}));
      if(data.type==='ping')peer.send(JSON.stringify({type:'pong',sent:data.sent}));
    });
  }};
  const ws=new EventEmitter();Object.assign(ws,{readyState:1,bufferedAmount:0,
    send(raw,callback){const data=JSON.parse(raw);if(data.type==='state'){states.push({at:clock.now,data});if(heldAck){heldAck.push(callback);return;}}callback?.();},
    close(code,reason){if(ws.readyState!==1)return;ws.readyState=3;closes.push({at:clock.now,side:'guest',code,reason});ws.emit('close');}
  });
  const send=data=>ws.emit('message',Buffer.from(JSON.stringify(data)),false);
  gateways[1].connectBrowser(ws,new URL('http://localhost/steam/ws?lobby=10977524000000001'));
  send({type:'hello',protocol:config.version,build:'fixture'});
  const step=(until,fn)=>{while(clock.now<until){clock.now+=8;fn?.();const due=pending.filter(p=>p.due<=clock.now);for(const p of due)inbox[p.i].push(p);
    for(let i=pending.length-1;i>=0;i--)if(pending[i].due<=clock.now)pending.splice(i,1);
    for(const g of gateways)g.poll();
  }};
  const input=(seq,actions=[],extra={})=>({type:'input',matchId:'battle',syncId:'sync',input:{seq,keys:seq%2,aim:[seq,0],pointerActive:true,firing:false,actions},...extra});
  return {clock,gateways,ws,send,step,input,received,states,closes,traffic,pending,get peer(){return accepted;},holdAcks(){heldAck=[];return heldAck;}};
}
function snapshotRun(code){const f=fixture(code);f.step(1000);let next=1000,seq=0;f.step(6000,()=>{if(f.clock.now>=next){next+=1000/60;seq++;if(f.peer.readyState===1&&(f.peer.snapshotWritable??(f.peer.bufferedAmount===0)))f.peer.send(JSON.stringify({type:'state',seq,frame:{inputSeq:seq}}));}});f.step(6600);
  check(f.closes.length===0,'snapshot simulation stays connected');return {offered:seq,received:f.states.length,spanMs:5000,rtt:300};}
function outageRun(code){const f=fixture(code,{outage:[1000,4000]});f.step(1000);let next=1000,seq=0;f.step(5000,()=>{if(f.clock.now>=next&&f.ws.readyState===1){next+=1000/60;f.send(f.input(++seq));}});f.step(6000);
  return {offered:seq,received:f.received.filter(x=>x.data.type==='input').length,maxRelayWindowCount:Math.max(...f.received.map(x=>x.count)),closes:f.closes,lastSeq:f.received.filter(x=>x.data.type==='input').at(-1)?.data.input.seq};}
const report={scope:'Real SteamGateway and codec with virtual reliable link and relay/browser doubles; no Valve routing or actual gameplay.'};
{
  const code=await subject(fs.readFileSync(entry,'utf8'));
  report.candidate={snapshots:snapshotRun(code),outage:outageRun(code)};

  const cases=[];
  const run=(name,fn)=>{const count=assertions;const evidence=fn();cases.push({name,assertions:assertions-count,evidence,status:'passed'});};
  run('60Hz-inputs-at-300ms-without-overload',()=>{
    const f=fixture(code);f.step(1000);let seq=0,next=1000;f.step(6000,()=>{if(f.clock.now>=next){next+=1000/60;f.send(f.input(++seq));}});f.step(6700);
    const inputs=f.received.filter(x=>x.data.type==='input');check(inputs.length===seq,'no coalescing/rate reduction on a healthy 300ms link');check(!f.closes.length,'healthy input remains connected');check(f.gateways[1].guestOutbound.diagnostics().coalesced===0,'zero movement coalesces under window capacity');return {offered:seq,received:inputs.length};
  });
  run('snapshot-ack-credit-and-stale-nonce',()=>{
    const f=fixture(code);f.step(1000);f.holdAcks();for(let seq=1;seq<=20;seq++)f.peer.send(JSON.stringify({type:'state',seq,frame:{}}));
    check(f.peer.inflight.size===4,'four frame cap');check(f.peer.diagnostics().skippedStates===16,'extra replaceable snapshots dropped not queued');
    const ids=[...f.peer.inflight.keys()], remote=f.gateways[1].owner,connection=f.peer.connection;
    f.gateways[0].dispatch(remote,{connection,op:'ack',data:{id:999999}});check(f.peer.inflight.size===4,'unknown ACK grants no credit');
    f.gateways[0].dispatch(remote,{connection:'f'.repeat(32),op:'ack',data:{id:ids[0]}});check(f.peer.inflight.size===4,'old nonce grants no credit');
    f.gateways[0].dispatch(remote,{connection,op:'ack',data:{id:ids[0]}});check(f.peer.inflight.size===3,'matching ACK grants one credit');
    f.gateways[0].dispatch(remote,{connection,op:'ack',data:{id:ids[0]}});check(f.peer.inflight.size===3,'duplicate grants no credit');
    return f.peer.diagnostics();
  });
  run('delta-loss-releases-credit-without-forwarding-and-full-recovers',()=>{
    const f=fixture(code);f.step(1000);
    const ballast=Array.from({length:12000},(_,i)=>String.fromCharCode(33+(i*i+i*17)%89)).join('');
    const state=seq=>JSON.stringify({type:'state',matchId:'battle',seq,frame:{tick:seq,ballast}});
    f.peer.send(state(1));f.step(1400);check(f.states.length===1,'full state delivered');
    const live=f.gateways[1].lastStateAt, count=f.gateways[1].receivedStates;
    f.gateways[1].snapshotReceiver.base=null;
    f.peer.send(state(2));f.step(1800);
    check(f.states.length===1,'missing-base delta never forwarded to browser');check(f.gateways[1].lastStateAt===live&&f.gateways[1].receivedStates===count,'dropped delta cannot renew liveness');
    check(f.peer.inflight.size===0&&f.peer.inflightBytes===0,'needsFull releases exact in-flight credit');check(f.peer.snapshotSender.base===null,'matching needsFull resets sender');
    f.peer.send(state(3));f.step(2200);check(f.states.length===2&&f.states.at(-1).data.seq===3,'next full reconstructs fresh state');
    check(!f.closes.length,'baseline loss recovers without disconnect');return f.peer.diagnostics();
  });
  run('delta-skipped-window-stale-ack-and-native-failure',()=>{
    const f=fixture(code);f.step(1000);f.holdAcks();
    const ballast=Array.from({length:12000},(_,i)=>String.fromCharCode(33+(i*i+i*17)%89)).join('');
    const state=seq=>JSON.stringify({type:'state',matchId:'battle',seq,frame:{tick:seq,ballast}});
    for(let seq=1;seq<=20;seq++)f.peer.send(state(seq));
    check(f.peer.snapshotSender.base.value.seq===4,'window-skipped state never becomes baseline');
    const base=f.peer.snapshotSender.base,ids=[...f.peer.inflight.keys()],remote=f.gateways[1].owner,connection=f.peer.connection;
    const ack=(nonce,id)=>f.gateways[0].dispatch(remote,{connection:nonce,op:'ack',data:{id,needsFull:true}});
    ack('f'.repeat(32),ids[0]);ack(connection,999999);check(f.peer.snapshotSender.base===base,'wrong nonce and unknown needsFull cannot reset');
    f.gateways[0].dispatch(remote,{connection,op:'ack',data:{id:ids[0]}});
    ack(connection,ids[0]);check(f.peer.snapshotSender.base===base,'duplicate needsFull cannot reset');
    f.peer.send(state(21));check(f.peer.snapshotSender.base.value.seq===21,'next accepted state commits');
    f.step(1200);check(f.states.map(x=>x.data.seq).join(',')==='1,2,3,4,21','receiver reconstructs skipped sequence exactly');
    f.gateways[0].dispatch(remote,{connection,op:'ack',data:{id:ids[1]}});
    const sent=f.peer.snapshotSender.fullStates+f.peer.snapshotSender.deltaStates;
    f.gateways[0].client.networking.sendP2PPacket=()=>false;f.peer.send(state(22));
    check(f.peer.snapshotSender.fullStates+f.peer.snapshotSender.deltaStates===sent,'native failure never commits baseline or stats');
    check(f.peer.snapshotSender.base===null&&f.peer.inflight.size===0,'native failure closes and clears state');
    check(f.closes.some(x=>x.side==='host'),'native failure closes retryable stream');return f.peer.diagnostics();
  });
  run('partial-native-fragment-failure-cannot-commit-state',()=>{
    const f=fixture(code);f.step(1000);let seed=219;
    const ballast=Array.from({length:110000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return String.fromCharCode(32+seed%90);}).join('');
    const native=f.gateways[0].client.networking.sendP2PPacket;let fragments=0;
    f.gateways[0].client.networking.sendP2PPacket=(remote,type,packet)=>packet[5]===2&&++fragments===2?false:native(remote,type,packet);
    f.peer.send(JSON.stringify({type:'state',matchId:'battle',seq:1,frame:{tick:1,ballast}}));
    check(fragments===2,'multi-fragment transmission fails at second fragment');check(f.peer.sentStates===0,'partially transmitted state not counted as sent');
    check(f.peer.snapshotSender.fullStates===0&&f.peer.snapshotSender.base===null,'partial native failure cannot commit baseline');
    f.step(1500);check(f.states.length===0,'incomplete state never reaches browser');return {fragments,closes:f.closes};
  });
  run('byte-budget-rejection-keeps-last-successful-delta-baseline',()=>{
    const f=fixture(code);f.step(1000);f.holdAcks();let seed=223;
    const noise=()=>Array.from({length:60000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return String.fromCharCode(32+seed%90);}).join('');
    const original=noise(),state=(seq,ballast)=>JSON.stringify({type:'state',matchId:'battle',seq,frame:{tick:seq,ballast}});
    f.peer.send(state(1,original));const base=f.peer.snapshotSender.base;
    check(f.peer.inflightBytes>32768&&f.peer.inflightBytes<65536,'first full state occupies most byte budget');
    f.peer.send(state(2,noise()));check(f.peer.inflight.size===1&&f.peer.skippedStates===1,'full replacement is refused by bytes, not frame count');
    check(f.peer.snapshotSender.base===base,'byte-refused preparation cannot advance baseline');
    f.peer.send(state(3,original));check(f.peer.inflight.size===2,'small delta against last sent frame fits remaining bytes');
    f.step(1200);check(f.states.map(x=>x.data.seq).join(',')==='1,3','skipped byte-budget frame is not required to decode next state');
    check(!f.closes.length,'byte-constrained delta remains connected');return f.peer.diagnostics();
  });
  run('snapshot-byte-window-and-large-frame-alone',()=>{
    const f=fixture(code);f.step(1000);f.holdAcks();f.peer.send(JSON.stringify({type:'state',seq:1,frame:{}}));
    let seed=7,noise='';for(let i=0;i<180000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise+=String.fromCharCode(33+(seed>>>24)%90);}
    const large=JSON.stringify({type:'state',seq:2,frame:{noise}});const prepared=f.gateways[0].codec.encode(f.peer.connection,'data',large);check(prepared.bytes>65536,'fixture really exceeds compressed 64KiB');
    f.peer.send(large);check(f.peer.inflight.size===1,'oversize frame never stacks behind earlier frame');
    for(const id of [...f.peer.inflight.keys()])f.peer.acknowledge(id);
    f.peer.send(large);check(f.peer.inflight.size===1&&f.peer.inflightBytes>65536,'one valid large frame can progress');
    f.peer.send(JSON.stringify({type:'state',seq:3,frame:{}}));check(f.peer.inflight.size===1,'large frame occupies whole window');return {largeCompressedBytes:prepared.bytes,window:f.peer.diagnostics()};
  });
  run('oldest-snapshot-ack-still-times-out-at-eight-seconds',()=>{
    const f=fixture(code);f.step(1000);f.holdAcks();f.peer.send(JSON.stringify({type:'state',seq:1,frame:{}}));f.step(8500);
    check(f.peer.readyState===1,'no early timeout');f.step(10100);check(f.peer.readyState===3,'stuck ACK still expires with unchanged deadline');return {closes:f.closes};
  });
  run('guest-window-ack-identity-and-disconnect-cleanup',()=>{
    const f=fixture(code);f.step(1000);const g=f.gateways[1];for(let seq=1;seq<=200;seq++)f.send(f.input(seq));const q=g.guestOutbound;
    check(q.window.pending.size===32,'native outstanding guest data bounded to 32');check(q.pending.length===1,'one latest unsent movement');check(JSON.parse(q.pending[0].text).input.seq===200,'latest movement wins');
    const id=[...q.window.pending.keys()][0];g.dispatch(g.selected.owner,{connection:'f'.repeat(32),op:'ack',data:{id}});check(q.pending.length===1,'old nonce cannot flush');
    q.ack(999999);check(q.pending.length===1,'unknown id cannot flush');q.ack(id);check(q.pending.length===0,'known ACK flushes latest');const count=q.window.pending.size;q.ack(id);check(q.window.pending.size===count,'duplicate cannot remove another entry');
    f.ws.close(1001,'Fixture disconnect');check(q.pending.length===0&&q.window.pending.size===0&&q.bytes===0&&q.window.bytes===0,'all owned queue memory released');check(g.guestOutbound===null&&g.guestConnection===null,'connection no longer owns queue');
    const sent=f.traffic[1].length;f.send(f.input(201));check(f.traffic[1].length===sent,'stale socket callback sends nothing');return {nativeFramesBeforeClose:count};
  });
  run('action-control-sync-and-match-fifo-barriers',()=>{
    const sent=[];let id=0;const queue=new SteamReliableQueue(text=>{sent.push(JSON.parse(text));return {id:++id,packets:[Buffer.alloc(200)]};});
    const f=fixture(code);const put=m=>queue.enqueue(JSON.stringify(m));for(let seq=1;seq<=32;seq++)put(f.input(seq));
    put(f.input(33));put(f.input(34));const action={id:81,kind:'system',value:2,aim:[2,3]};put(f.input(35,[action]));put(f.input(36));put(f.input(37));put({type:'ping',sent:44});put(f.input(38));put(f.input(39,[],{syncId:'next'}));put(f.input(40,[],{matchId:'next'}));put(f.input(41,[],{matchId:'next'}));
    for(let ack=1;ack<=id;ack++)queue.ack(ack);
    check(JSON.stringify(sent.slice(32).map(m=>m.type==='input'?m.input.seq:m.type))===JSON.stringify([34,35,37,'ping',38,39,41]),'coalescing never crosses action/control/sync/match boundaries');check(JSON.stringify(sent[33].input.actions[0])===JSON.stringify(action),'action id/value/aim survive exactly');check(queue.window.bytes===0&&queue.bytes===0,'all byte credits released after ACKs');return {sequence:sent.slice(32).map(m=>m.type==='input'?m.input.seq:m.type)};
  });
  run('malformed-and-out-of-order-inputs-are-not-coalesced',()=>{
    const sent=[];let id=0;const q=new SteamReliableQueue(text=>{sent.push(text);return {id:++id,packets:[Buffer.alloc(200)]};});const f=fixture(code);for(let seq=1;seq<=32;seq++)q.enqueue(JSON.stringify(f.input(seq)));
    const list=[JSON.stringify(f.input(33)),'not-json',JSON.stringify({...f.input(34),input:{...f.input(34).input,keys:999}}),JSON.stringify(f.input(35)),JSON.stringify(f.input(34))];for(const text of list)q.enqueue(text);check(q.pending.length===5,'malformed/out-of-order packets remain validation barriers');for(let ack=1;ack<=id;ack++)q.ack(ack);check(JSON.stringify(sent.slice(32))===JSON.stringify(list),'original error/ordering semantics reach relay');return {retained:list.length};
  });
  run('bounded-action-overflow-closes-instead-of-silent-loss',()=>{
    const f=fixture(code);f.step(1000);for(let seq=1;seq<=65;seq++)f.send(f.input(seq,[{id:seq,kind:'vent'}]));check(f.closes.some(c=>c.code===1013),'overflow explicitly closes retryable instead of accepting dropped actions');check(f.gateways[1].guestOutbound===null,'overflow cleanup releases queue');return {closes:f.closes};
  });
  run('native-send-failure-is-retryable-and-cleans-up',()=>{
    const f=fixture(code);f.step(1000);f.gateways[1].client.networking.sendP2PPacket=()=>false;f.send(f.input(1));check(f.closes.some(c=>c.code===1013),'native failure causes retryable close');check(f.gateways[1].guestOutbound===null,'failed native send does not leak credits');return {closes:f.closes};
  });
  run('ack-flush-send-failure-is-retryable',()=>{
    const f=fixture(code);f.step(1000);for(let seq=1;seq<=33;seq++)f.send(f.input(seq));const g=f.gateways[1],q=g.guestOutbound,id=[...q.window.pending.keys()][0];g.client.networking.sendP2PPacket=()=>false;
    g.dispatch(g.selected.owner,{connection:g.guestConnection,op:'ack',data:{id}});check(f.closes.some(c=>c.code===1013),'failure while draining ACK closes retryably');check(q.pending.length===0&&q.window.pending.size===0,'flush failure cleanup clears window and tail');return {closes:f.closes};
  });
  run('guest-ack-stall-is-detected-even-with-fresh-state',()=>{
    const f=fixture(code);f.step(1000);const original=f.gateways[0].transmit.bind(f.gateways[0]);f.gateways[0].transmit=(remote,connection,op,data)=>op==='ack'?{}:original(remote,connection,op,data);f.send(f.input(1));let next=1000;
    f.step(10100,()=>{if(f.clock.now>=next){next+=200;f.peer.send(JSON.stringify({type:'state',seq:next,frame:{}}));}});
    check(f.states.length>20,'other direction remains live');check(f.closes.some(c=>c.code===1013&&c.reason==='Steam link stalled'),'oldest guest ACK expires despite inbound traffic');return {receivedStates:f.states.length,closes:f.closes};
  });
  run('window-accounts-wire-bytes-and-duplicate-acks',()=>{
    const w=new SteamSendWindow();w.track({id:1,packets:[Buffer.alloc(262145)]},100);check(w.full&&w.bytes===262145,'one large packet fills byte budget');check(!w.expired(8100)&&w.expired(8101),'exact existing eight-second boundary');check(!w.ack('1')&&w.full,'string-id ACK cannot free numeric credit');check(w.ack(1)&&!w.full&&w.bytes===0,'matching ACK releases exact wire bytes');check(!w.ack(1)&&w.bytes===0,'duplicate does not underflow');return {bytesAfterAck:w.bytes};
  });
  report.cases=cases;

  check(report.candidate.snapshots.received>=60,'preserved four-frame window removes single-frame stop-and-wait limit');
  check(report.candidate.outage.closes.length===0,'candidate survives three second outage without rate close');
  check(report.candidate.outage.lastSeq===report.candidate.outage.offered,'candidate drains latest input');
  check(report.candidate.outage.maxRelayWindowCount<=128,'candidate recovery burst remains below relay rate limit');
}
report.assertions=assertions;report.status='passed';console.log(JSON.stringify(report,null,2));
