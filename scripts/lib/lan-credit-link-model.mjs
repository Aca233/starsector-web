// Ordered TCP + native pong + renderer consumption model. No sockets/Steam SDK.
// The kernel-buffer boundary distinguishes bufferedAmount from bytes accepted
// by TCP but not yet delivered. Rate changes apply to queued bytes, not to a
// precomputed arrival timestamp. This models one receiver, not Wi-Fi loss.
export function modelLanCredits(Credits, {duration=45000,rtt=20,bytes=44324,rate=100000,fastRate=10000000,changeAt=4000,restoreAt=35000,consumeMs=5}={}) {
  const credits=new Credits(); let now=0,nextFrame=0,nextPing=1000,seq=0,probePending=false,queuedBytes=0;
  let delivered=0,skipSocket=0,skipCredit=0,maxWindow=0,maxFlight=0,maxQueue=0;
  const tx=[],samples=[],ages=[],events=[];
  const schedule=(at,fn)=>{events.push({at,fn});events.sort((a,b)=>a.at-b.at);};
  const currentRate=()=>now<changeAt||now>=restoreAt?fastRate:rate;
  const wire=(size,fn)=>{tx.push({remaining:size,fn});queuedBytes+=size;maxQueue=Math.max(maxQueue,queuedBytes);};
  credits.recordNetworkRtt(rtt); // An idle room/lobby sample before battle.
  while(now<=duration){
    let budget=currentRate()/1000;
    while(tx.length&&budget>0){const item=tx[0],sent=Math.min(budget,item.remaining);budget-=sent;item.remaining-=sent;queuedBytes-=sent;
      if(item.remaining===0){tx.shift();schedule(now+rtt/2,item.fn);}}
    while(events.length&&events[0].at<=now)events.shift().fn();
    if(now>=nextPing&&!probePending){nextPing=now+1000;probePending=true;const sent=now,probe=credits.beginNetworkProbe?.();
      wire(16,()=>schedule(now+rtt/2,()=>{credits.recordNetworkRtt(now-sent,probe);probePending=false;}));}
    if(now>=nextFrame){nextFrame+=1000/60;
      // Up to 1 MiB may already be in TCP even with bufferedAmount === 0.
      if(queuedBytes>1048576)skipSocket++;
      else if(credits.reserve(++seq,bytes)){
        const sent=now,id=seq;wire(bytes,()=>{delivered++;if(now>=10000&&now<restoreAt)ages.push(now-sent);
          schedule(now+consumeMs+rtt/2,()=>credits.ack(id));});
      }else skipCredit++;
    }
    const state=credits.stats();maxWindow=Math.max(maxWindow,state.capacity);maxFlight=Math.max(maxFlight,state.inflight);
    if(now%1000===0)samples.push({at:now,...state,queuedMs:queuedBytes/currentRate()*1000});
    now++;
  }
  ages.sort((a,b)=>a-b);
  return {scope:'synthetic ordered LAN, not two-PC measurements',bytes,rate,rtt,delivered,skipSocket,skipCredit,maxWindow,maxFlight,maxQueue,
    ageP95:ages[Math.floor(ages.length*.95)]??null,ageMax:ages.at(-1)??null,finalInflight:credits.stats().inflight,samples};
}
