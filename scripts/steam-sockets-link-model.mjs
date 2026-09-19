// Deterministic adverse-network model around the REAL room/session/wire/pacer.
// SDK pending lanes, native congestion flight, one external host FIFO, physical
// serialization, independent guest uplinks and propagation are separate states.
// This is an explicit scheduler model, NOT an implementation of Valve routing.
import { EventEmitter } from 'node:events';
import { SteamSocketRoom } from '../server/steam/sockets-room.mjs';
const HOST='76561198000000001',ROOM='10977524000000001';
const laneOf=kind=>({control:0,anchor:1,snapshot:2})[kind];
const quantile=(a,q)=>{if(!a.length)return null;const sorted=[...a].sort((x,y)=>x-y);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];};
export function simulateSocketLink({guests=9,durationMs=50000,rttMs=300,guestRtts=null,upBytesPerSecond=1000000,afterBytesPerSecond=upBytesPerSecond,
 changeAtMs=Infinity,stallAtMs=Infinity,stallMs=0,guestUpBytesPerSecond=128000,lossEvery=0,reorderEvery=0,nativeRate=256000,nativeWindow=65536,
 roomFactory=options=>new SteamSocketRoom(options),stateHz=60,ackIntervalMs=40,trace=false}={}){
 if(!Number.isInteger(guests)||guests<1||guests>9||!Number.isInteger(durationMs)||durationMs<1000||durationMs>180000)throw Error('Invalid model size');
 const ids=Array.from({length:guests+1},(_,i)=>String(BigInt(HOST)+BigInt(i))),closed=[],links=[],propagation=[],ends=[],peers=[],browsers=[],rooms=[];
 const fifos=ids.map(()=>({items:[],bytes:0,peak:0,sent:0,maxAge:0}));
 const totals=ids.map(()=>({states:[],inputs:[],pongs:0,maxPongAge:0,decodeFailures:0}));
 let now=0,seq=0,nextState=1500,nextInput=1500,serial=0,packetCounter=0,losses=0,retransmits=0,nativeDrops=0,maxNativePending=0,maxNativeFlight=0,maxWireRetained=0,steps=0;
 const timeline=[];const byTicket=new Map(),rtt=index=>guestRtts?.[index-1]??rttMs;
 const key=t=>[t.handle,t.lease,t.remote,t.scope].join(':');
 function enqueue(index,item){const f=fifos[index];item.remaining=item.wireBytes;item.enqueued=now;f.items.push(item);f.bytes+=item.remaining;f.peak=Math.max(f.peak,f.bytes);}
 function makeDirection(index,target,ticket,targetTicket){return{index,target,ticket,targetTicket,lanes:[[],[],[]],pending:0,flight:new Map(),flightBytes:0,
  rate:nativeRate,cwnd:nativeWindow,tokens:8256,ackPending:new Map(),ackDue:null,baseRtt:rtt(Math.max(index,target)),srtt:rtt(Math.max(index,target)),rateAt:0,
  laneSerial:[0,0,0],nextReceived:[1,1,1],ordered:[new Map(),new Map(),new Map()],peakPending:0,peakFlight:0,active:true};}
 function endpoint(index){return{
  notices:[],inbox:[],state:'new',
  open(options){this.options=options;this.state='open';ends[index]=this;},
  connect(){
   if(!index||!ends[0]||ends[0].state!=='open')return null;
   const ht=Object.freeze({handle:100+index,lease:String(100+index),remote:ids[index],scope:ROOM}),gt=Object.freeze({handle:200+index,lease:String(200+index),remote:HOST,scope:ROOM});
   const h=makeDirection(0,index,ht,gt),g=makeDirection(index,0,gt,ht),link={h,g,index,open:true};h.reverse=g;g.reverse=h;links.push(link);byTicket.set(key(ht),h);byTicket.set(key(gt),g);
   ends[0].notices.push({type:'connected',ticket:ht});this.notices.push({type:'connected',ticket:gt});return gt;
  },
  poll(){return this.notices.splice(0);},receive(){return this.inbox.splice(0,16);},
  send(ticket,data,kind){
   const d=byTicket.get(key(ticket));if(!d?.active||d.index!==index)return{status:'error'};
   // Preserve native backpressure rather than pretending accepted data drains.
   if(d.pending+data.length>256*1024)return{status:'backpressure'};
   if(kind==='snapshot'&&d.pending*1000/d.rate>200){nativeDrops++;return{status:'dropped'};}
   const lane=laneOf(kind),message={id:++serial,d,kind,lane,nativeSeq:++d.laneSerial[lane],data:Buffer.from(data),bytes:data.length,
    reliable:kind!=='snapshot',admitted:now,firstSent:null,lastSent:null,acked:false,delivered:false,attempts:0};
   d.lanes[lane].push(message);d.pending+=message.bytes;d.peakPending=Math.max(d.peakPending,d.pending);return{status:'accepted'};
  },
  sample(ticket){const d=byTicket.get(key(ticket));if(!d?.active)return{available:false,reason:'not-connected'};
   const lanes=d.lanes.map((q,lane)=>({lane,pendingBytes:q.reduce((n,m)=>n+m.bytes,0),queueMs:q.length?Math.max(0,now-q[0].admitted):0}));
   return{available:true,pendingBytes:d.pending,unackedReliableBytes:[...d.flight.values()].filter(m=>m.reliable).reduce((n,m)=>n+m.bytes,0),
    sendRateBytesPerSecond:d.rate,pingMs:d.srtt,lanes};
  },
  disconnect(ticket){const d=byTicket.get(key(ticket));if(!d?.active)return false;d.active=false;d.reverse.active=false;
   for(const side of[d,d.reverse]){side.pending=0;side.lanes=[[],[],[]];side.flight.clear();side.flightBytes=0;ends[side.index].notices.push({type:'disconnected',ticket:side.ticket});}
   return true;},
  close(){this.state='closed';for(const link of links)for(const d of[link.h,link.g])if(d.index===index)this.disconnect(d.ticket);},
 };}
 function transportAck(message){const d=message.d;
  d.ackPending.set(message.id,message);d.ackDue??=now+ackIntervalMs;
 }
 function flushAcks(d){
  if(!d.ackPending.size||now<d.ackDue)return;
  const messages=[...d.ackPending.values()].slice(0,64);for(const m of messages)d.ackPending.delete(m.id);
  enqueue(d.target,{type:'ack',messages,index:d.target,target:d.index,wireBytes:48+4*messages.length,delay:d.baseRtt/2});
  d.ackDue=d.ackPending.size?now+ackIntervalMs:null;
 }
 function deliver(message){const d=message.d;
  if(!d.active)return;transportAck(message);if(message.delivered)return;
  if(message.reliable){
   d.ordered[message.lane].set(message.nativeSeq,message);
   while(d.ordered[message.lane].has(d.nextReceived[message.lane])){
    const current=d.ordered[message.lane].get(d.nextReceived[message.lane]);d.ordered[message.lane].delete(d.nextReceived[message.lane]++);current.delivered=true;
    ends[d.target].inbox.push({ticket:d.targetTicket,kind:current.kind,data:current.data});
   }
  }else{message.delivered=true;ends[d.target].inbox.push({ticket:d.targetTicket,kind:message.kind,data:message.data});}
 }
 function receiveAck(message){const d=message.d;if(message.acked||!d.active)return;message.acked=true;
  if(d.flight.delete(message.id))d.flightBytes-=message.bytes;const sample=now-message.firstSent;d.srtt=.875*d.srtt+.125*sample;
  // Reactive native estimate only; no oracle access to future bandwidth or FIFO.
  // It cannot retract bytes already emitted before the RTT signal comes back.
  if(now-d.rateAt>=d.baseRtt){
   d.rateAt=now;
   if(d.srtt>d.baseRtt*1.5){d.rate=Math.max(4000,d.rate*.7);d.cwnd=Math.max(16512,Math.floor(d.cwnd*.7));}
   else{d.rate=Math.min(nativeRate,d.rate+2048);d.cwnd=Math.min(nativeWindow,d.cwnd+1088);}
  }
 }
 function drainNative(d,dt){
  if(!d.active)return;d.tokens=Math.min(16512,d.tokens+d.rate*dt/1000);
  for(const m of d.flight.values())if(!m.acked&&now-m.lastSent>=Math.max(2000,d.srtt*4)*2**Math.min(3,m.attempts-1)){
   if(!m.reliable){d.flight.delete(m.id);d.flightBytes-=m.bytes;continue;}
   // A resend is real additional FIFO traffic. ACKs for the first copy can
   // cancel a future resend, but cannot pull an already queued copy back.
   if(m.attempts>=4)continue;
   if(d.tokens>=m.bytes){d.tokens-=m.bytes;emit(m);retransmits++;}
  }
  for(let count=0;count<16;count++){
   const lane=d.lanes.findIndex(q=>q.length);if(lane<0)break;const m=d.lanes[lane][0];
   if(d.tokens<m.bytes||d.flightBytes+m.bytes>d.cwnd)break;
   d.lanes[lane].shift();d.pending-=m.bytes;d.tokens-=m.bytes;d.flight.set(m.id,m);d.flightBytes+=m.bytes;d.peakFlight=Math.max(d.peakFlight,d.flightBytes);emit(m);
  }
 }
 function emit(message){const d=message.d;message.firstSent??=now;message.lastSent=now;message.attempts++;
  // Charge an MTU-sized datagram's overhead per 1200 payload bytes. A native
  // message is atomic only for delivery; FIFO serialization is byte-granular.
  const wireBytes=message.bytes+48*Math.ceil(message.bytes/1200);
  enqueue(d.index,{type:'data',message,index:d.index,target:d.target,wireBytes,delay:d.baseRtt/2,number:++packetCounter});
 }
 function drainFifo(index,dt){const fifo=fifos[index];let budget=(index?guestUpBytesPerSecond:now>=changeAtMs?afterBytesPerSecond:upBytesPerSecond)*dt/1000;
  if(!index&&now>=stallAtMs&&now<stallAtMs+stallMs)budget=0;
  while(budget>0&&fifo.items.length){const item=fifo.items[0],n=Math.min(budget,item.remaining);item.remaining-=n;fifo.bytes-=n;fifo.sent+=n;budget-=n;fifo.maxAge=Math.max(fifo.maxAge,now-item.enqueued);
   if(item.remaining>1e-6)break;fifo.items.shift();
   if(item.type==='data'&&lossEvery>0&&item.number%lossEvery===0){losses++;continue;}
   const extra=item.type==='data'&&reorderEvery>0&&item.number%reorderEvery===0?120:0;
   propagation.push({...item,at:now+item.delay+extra});
  }
 }
 for(let index=0;index<=guests;index++){
  const lifecycle=endpoint(index),room=roomFactory({lifecycle,localId:ids[index],ownerId:HOST,scope:ROOM,build:'sockets-shared-fifo-model',gameProtocol:25,now:()=>now,
   allowed:id=>index?id===HOST:ids.includes(id)&&id!==HOST,isCurrent:()=>true,
   acceptTransport(peer,identity){const i=ids.indexOf(identity.identity);peers[i]=peer;peer.on('close',(code,reason)=>closed.push({index:i,side:'host',at:now,code,reason:String(reason)}));
    peer.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='input')totals[i].inputs.push({at:now,age:now-m.producedAt,seq:m.input.seq});});
    peer.send(JSON.stringify({type:'match',match:{id:'shared-battle'}}));}
  });rooms.push(room);
  if(index){const browser=new EventEmitter();Object.assign(browser,{readyState:1,bufferedAmount:0,
   send(raw,done){const m=JSON.parse(raw);if(m.type==='state'){totals[index].states.push({at:now,age:now-m.frame.producedAt,seq:m.seq});if(m.frame.tick!==m.seq||m.frame.marker!=='exact-'+m.seq)totals[index].decodeFailures++;}done?.();},
   close(code,reason){if(this.readyState!==1)return;this.readyState=3;closed.push({index,side:'guest',at:now,code,reason});this.emit('close');}
  });browsers[index]=browser;room.attachBrowser(browser);}
 }
 let seed=218;const noise=length=>Array.from({length},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return String.fromCharCode(32+seed%90);}).join('');
 const ballast=noise(14000),moving=Array.from({length:60},(_,i)=>({id:i,name:noise(12)}));
 const dt=4;
 for(now=0;now<durationMs;now+=dt){steps++;
  for(let i=propagation.length-1;i>=0;i--)if(propagation[i].at<=now){const item=propagation.splice(i,1)[0];if(item.type==='ack')for(const m of item.messages)receiveAck(m);else deliver(item.message);}
  if(now>=nextState){nextState+=1000/stateHz;seq++;const text=JSON.stringify({type:'state',matchId:'shared-battle',seq,frame:{tick:seq,marker:'exact-'+seq,producedAt:now,ballast,
   moving:moving.map((m,i)=>({...m,x:Math.sin((seq+i)*.07)*1000,y:Math.cos((seq-i)*.04)*1000,hp:10000-seq%700}))}});
   for(const peer of peers)if(peer?.snapshotWritable)peer.send(text);
  }
  if(now>=nextInput){nextInput+=1000/60;for(let i=1;i<=guests;i++)if(browsers[i].readyState===1)browsers[i].emit('message',Buffer.from(JSON.stringify({type:'input',matchId:'shared-battle',syncId:'sync',producedAt:now,
    input:{seq,keys:seq%8,aim:[seq%10000,0],firing:false,pointerActive:true,actions:[]}})),false);}
  if(now%8===0)for(const room of rooms)room.poll();
  for(const link of links)for(const d of[link.h,link.g]){drainNative(d,dt);flushAcks(d);}
  for(let i=0;i<=guests;i++)drainFifo(i,dt);
  const nativePending=links.reduce((n,l)=>n+l.h.pending,0),nativeFlight=links.reduce((n,l)=>n+l.h.flightBytes,0);
  maxNativePending=Math.max(maxNativePending,nativePending);maxNativeFlight=Math.max(maxNativeFlight,nativeFlight);
  maxWireRetained=Math.max(maxWireRetained,rooms.reduce((n,r)=>n+r.wireBudget.bytes,0));
  if(trace&&now%1000===0){const hs=rooms[0].records.get(ids[1])?.session,gs=rooms[1].records.get(HOST)?.session,link=links[0];timeline.push({at:now,external:fifos[0].bytes,flight:rooms[0].flightBudget.diagnostics(),host:hs?{pong:hs.lastPong,ping:hs.ping,controls:hs.controls.length}:null,guest:gs?{pong:gs.lastPong,ping:gs.ping,controls:gs.controls.length}:null,native:[link.h,link.g].map(d=>({pending:d.pending,flight:d.flightBytes,rate:d.rate,cwnd:d.cwnd,next:d.nextReceived[0],latest:d.laneSerial[0],ordered:d.ordered[0].size}))});}
  for(let i=1;i<=guests;i++){const session=rooms[i].records.get(HOST)?.session;if(session?.state==='ready'){totals[i].maxPongAge=Math.max(totals[i].maxPongAge,now-session.lastPong);totals[i].pongs=session.stats.matchedPongs;}}
 }
 const result={scope:'Real room/session/wire/pacer over modeled SDK lanes and external shared FIFO; NOT Valve routing',config:{guests,durationMs,rttMs,guestRtts,upBytesPerSecond,afterBytesPerSecond,changeAtMs,stallAtMs,stallMs,lossEvery,reorderEvery,nativeRate,nativeWindow,ackIntervalMs},closed:closed.slice(),
  timeline,offeredStates:seq,steps,losses,retransmits,nativeDrops,maxNativePending,maxNativeFlight,maxWireRetained,peakExternalHostBytes:fifos[0].peak,maxExternalQueueAge:fifos[0].maxAge,remainingExternalHostBytes:fifos[0].bytes,
  hostPacer:rooms[0].pacer.diagnostics(),hostFlight:rooms[0].flightBudget.diagnostics(),sessionFailures:rooms.map(r=>r.stats.lastFailure??null),peers:totals.slice(1).map((p,i)=>{const steady=p.states.filter(s=>s.at>=durationMs-5000),inputs=p.inputs.filter(s=>s.at>=durationMs-5000);return{index:i+1,frames:p.states.length,steadyHz:steady.length/5,ageP95:quantile(steady.map(s=>s.age),.95),maxAge:Math.max(0,...p.states.map(s=>s.age)),inputAgeP95:quantile(inputs.map(s=>s.age),.95),maxPongAge:p.maxPongAge,pongs:p.pongs,decodeFailures:p.decodeFailures,lastStateAt:p.states.at(-1)?.at??null};})};
 for(const room of rooms)room.close();result.finalWireBytes=rooms.reduce((n,r)=>n+r.wireBudget.bytes,0);result.finalNativePending=links.reduce((n,l)=>n+l.h.pending+l.g.pending,0);return result;
}
