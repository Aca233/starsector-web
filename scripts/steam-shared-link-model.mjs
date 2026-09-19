// Deterministic shared host-uplink simulator around production SteamGateway.
// Link serialization is shared by ALL host destinations; guest uplinks remain
// independent. Service rate changes affect already queued bytes, not just new
// sends. This models one possible reliable scheduler, not Valve's native router.
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { build } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
export async function bundleGateway(entry=path.join(root,'server/steam/gateway.mjs'), overrides={}) {
 const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.url':JSON.stringify(pathToFileURL(entry).href)},plugins:[{name:'explicit-test-overrides',setup(b){b.onLoad({filter:/\.mjs$/},args=>Object.hasOwn(overrides,args.path)?{contents:overrides[args.path],loader:'js',resolveDir:path.dirname(args.path)}:null);}}]});
 return result.outputFiles[0].text;
}
const quantile=(values,q)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];};
export function simulateSharedLink(bundle,{guests=3,durationMs=40000,rttMs=300,upBytesPerSecond=128000,afterBytesPerSecond=upBytesPerSecond,changeAtMs=Infinity,stallAtMs=Infinity,stallMs=0,initialWindow=null,guestRtts=null,rotation=false,jitterMs=0,trace=false}={}) {
 const start=1000,clock={now:start},NativeDate=Date;
 const context=vm.createContext({module:{exports:{}},require,console,Buffer,URL,setTimeout,clearTimeout,setInterval,clearInterval,Date:class extends NativeDate{static now(){return clock.now;}},performance:{now:()=>clock.now}});
 new vm.Script(bundle).runInContext(context);const {SteamGateway}=context.module.exports;
 const ids=Array.from({length:guests+1},(_,i)=>String(76561198000000001n+BigInt(i))),inboxes=ids.map(()=>[]),links=ids.map(()=>({queue:[],bytes:0,peak:0,sent:0,byOp:{}})),propagation=[],closes=[],peers=[],logs=[];
 let budgetViolations=0,maxTotalFlightBytes=0,maxQueueAge=0,seq=0,nextState=start+500,nextInput=start+500,nextPing=start+1000,rotor=0;
 const samples=[], lastDelivery=new Map(); let nextTrace=start;
 const totals=ids.map(()=>({states:[],pongs:[],inputs:0,peakFrames:0,peakBytes:0,decodeFailures:0}));
 const gateways=ids.map((id,index)=>new SteamGateway({build:'shared-uplink-test',log:line=>{const value=JSON.parse(line.slice('[steam-transport] '.length));if(['peer-close','invalid-packet'].includes(value.event))logs.push({at:clock.now-start,index,...value});},client:{networking:{
  sendP2PPacket(remote,type,data){if(type!==2)throw Error('Reliable framing changed');const target=ids.indexOf(String(remote));if(target<0)throw Error('Unknown test peer');
   const packet={data:Buffer.from(data),steamId:id,target,remaining:data.length,enqueued:clock.now};const link=links[index];link.queue.push(packet);link.bytes+=data.length;link.peak=Math.max(link.peak,link.bytes);link.sent+=data.length;link.byOp[data[5]]=(link.byOp[data[5]]??0)+data.length;return true;},
  isP2PPacketAvailable(){return inboxes[index][0]?.data.length??0;},readP2PPacket(){return inboxes[index].shift();}
 }}}));
 for(let i=0;i<gateways.length;i++){const g=gateways[i];g.owner=ids[i];g.initialized=true;g.selected={id:'10977524000000001',owner:ids[0],code:'ABCDEF',lobby:{getMembers:()=>ids,getOwner:()=>ids[0]}};}
 const host=gateways[0];host.relay={acceptTransport(peer){const index=ids.indexOf(peer.remote);peers[index]=peer;if(initialWindow!==null)peer.snapshotWindow.limit=initialWindow;
  peer.on('close',()=>closes.push({index,side:'host',at:clock.now-start}));peer.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='input')totals[index].inputs++;if(m.type==='ping')peer.send(JSON.stringify({type:'pong',sent:m.sent}));});
 }};
 const browsers=gateways.map((g,index)=>{if(!index)return null;const ws=new EventEmitter();Object.assign(ws,{readyState:1,bufferedAmount:0,
  send(raw,done){const m=JSON.parse(raw);if(m.type==='state'){totals[index].states.push({at:clock.now-start,age:clock.now-m.frame.producedAt,seq:m.seq});if(m.frame.tick!==m.seq||m.frame.marker!=='exact-'+m.seq)totals[index].decodeFailures++;}
   if(m.type==='pong')totals[index].pongs.push({at:clock.now-start,age:clock.now-m.sent});done?.();},
  close(code,reason){if(this.readyState!==1)return;this.readyState=3;closes.push({index,side:'guest',at:clock.now-start,code,reason});this.emit('close');}
 });g.connectBrowser(ws,new URL('http://localhost/steam/ws?lobby=10977524000000001'));return ws;});
 let seed=218;const noise=length=>Array.from({length},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return String.fromCharCode(32+seed%90);}).join('');
 const ballast=noise(14000),moving=Array.from({length:60},(_,i)=>({id:i,name:noise(12)}));
 const sendGuest=(index,data)=>{if(browsers[index].readyState===1)browsers[index].emit('message',Buffer.from(JSON.stringify(data)),false);};
 const service=(index,ms)=>{const link=links[index],elapsed=clock.now-start;
  if(index===0&&elapsed>=stallAtMs&&elapsed<stallAtMs+stallMs)return;
  let available=(index===0?(elapsed>=changeAtMs?afterBytesPerSecond:upBytesPerSecond):1000000)*ms/1000;
  while(available>0&&link.queue.length){const packet=link.queue[0],used=Math.min(available,packet.remaining);packet.remaining-=used;link.bytes-=used;available-=used;maxQueueAge=Math.max(maxQueueAge,clock.now-packet.enqueued);
   if(packet.remaining<=.000001){link.queue.shift();const rtt=guestRtts?.[(index||packet.target)-1]??rttMs;const key=index+':'+packet.target;
    const variation=jitterMs*(.5+.5*Math.sin(clock.now*.009));
    const arrival=Math.max(lastDelivery.get(key)??0,clock.now+rtt/2+variation);
    lastDelivery.set(key,arrival);propagation.push({...packet,at:arrival});}}
 };
 for(;clock.now<start+durationMs;clock.now+=8){
  if(clock.now>=nextState){nextState+=1000/60;seq++;
   const text=JSON.stringify({type:'state',matchId:'shared-battle',seq,frame:{tick:seq,marker:'exact-'+seq,producedAt:clock.now,ballast,ships:moving.map((item,i)=>({...item,pos:[Math.sin((seq+i)*.013)*10000,Math.cos((seq-i)*.019)*10000],angle:(seq*.13+i)%6.28}))}});
   const targets=rotation?Array.from({length:guests},(_,i)=>peers[1+(i+rotor)%guests]):peers.slice(1);rotor=(rotor+1)%guests;
   for(const peer of targets)if(peer?.snapshotWritable){
    const before=peers.reduce((sum,p)=>sum+(p?.inflightBytes??0),0);peer.send(text);
    const after=peers.reduce((sum,p)=>sum+(p?.inflightBytes??0),0);
    if(host.snapshotBudget&&after>before&&before>0&&after>host.snapshotBudget.limitBytes)budgetViolations++;
   }
  }
  if(clock.now>=nextInput){nextInput+=1000/60;for(let i=1;i<gateways.length;i++)sendGuest(i,{type:'input',matchId:'shared-battle',syncId:'sync',input:{seq,keys:seq%2,aim:[seq,0],pointerActive:true,firing:false,actions:[]}});}
  if(clock.now>=nextPing){nextPing+=1000;for(let i=1;i<gateways.length;i++)sendGuest(i,{type:'ping',sent:clock.now});}
  for(let i=0;i<links.length;i++)service(i,8);
  for(let i=0;i<propagation.length;)if(propagation[i].at<=clock.now){const packet=propagation.splice(i,1)[0];inboxes[packet.target].push(packet);}else i++;
  for(const g of gateways)g.poll();
  let sum=0;for(let i=1;i<peers.length;i++){const peer=peers[i];if(!peer)continue;sum+=peer.inflightBytes;totals[i].peakFrames=Math.max(totals[i].peakFrames,peer.inflight.size);totals[i].peakBytes=Math.max(totals[i].peakBytes,peer.inflightBytes);}
  maxTotalFlightBytes=Math.max(maxTotalFlightBytes,sum);
  if(trace&&clock.now>=nextTrace){nextTrace+=1000;samples.push({at:clock.now-start,queued:links[0].bytes,wireByOp:{...links[0].byOp},shared:host.snapshotBudget.diagnostics(),peers:peers.slice(1).map(p=>({window:p.snapshotWindow.limit,base:p.snapshotWindow.baseRtt,ack:p.ackMs,sent:p.sentStates,oldest:p.diagnostics().oldestAckMs,bytes:p.inflightBytes}))});}
 }
 const rows=totals.slice(1).map((t,index)=>{const steady=t.states.filter(s=>s.at>=durationMs-5000),healthy=t.states.filter(s=>s.at>=5000&&s.at<Math.min(changeAtMs,durationMs));
  return {index:index+1,states:t.states.length,steadyHz:steady.length/5,steadyAgeP95:quantile(steady.map(s=>s.age),.95),maxAge:quantile(t.states.map(s=>s.age),1),healthyAgeP95:quantile(healthy.map(s=>s.age),.95),maxPongAge:quantile(t.pongs.map(s=>s.age),1),inputs:t.inputs,coalesced:gateways[index+1].guestOutbound?.diagnostics().coalesced??null,peakFrames:t.peakFrames,peakBytes:t.peakBytes,decodeFailures:t.decodeFailures,transport:peers[index+1]?.diagnostics(),lastStateAt:t.states.at(-1)?.at??null};});
 const result={config:{guests,durationMs,rttMs,upBytesPerSecond,afterBytesPerSecond,changeAtMs,stallAtMs,stallMs,initialWindow,guestRtts,rotation,jitterMs},samples,offeredStates:seq,budgetViolations,peers:rows,closes,logs,peakHostQueueBytes:links[0].peak,maxTotalFlightBytes,maxQueueAge,hostBytesSent:links[0].sent,remainingHostQueueBytes:links[0].bytes,sharedBudget:host.snapshotBudget?.diagnostics()??null};
 for(const gateway of gateways)gateway.wss.close();
 return result;
}
