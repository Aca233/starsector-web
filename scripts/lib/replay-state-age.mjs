/** Continuous age of the latest successfully decoded state. Samples include
 * waits BETWEEN arrivals; missing initial state is reported, not a fake age 0.
 * This is still not browser apply/render/input-to-photon measurement. */
export function sampleStateAge(events, startMs, endMs, stepMs=20) {
  if (![startMs,endMs,stepMs].every(Number.isFinite) || startMs<0 || endMs<startMs || stepMs<=0 || (endMs-startMs)/stepMs>1e6) throw Error('Invalid replay age window');
  for(const event of events)if(!Number.isFinite(event.at)||event.at<0||!Number.isFinite(event.ageMs)||event.ageMs<0||!Number.isSafeInteger(event.tick)||event.tick<0)throw Error('Invalid replay age event');
  const sorted=events.slice().sort((a,b)=>a.at-b.at),ages=[];
  let at=0,latest=null,missingSamples=0;
  for(let t=startMs;t<endMs;t+=stepMs){
    while(at<sorted.length&&sorted[at].at<=t){
      const event=sorted[at++];
      if(!latest||event.tick>latest.tick)latest=event;
    }
    if(latest)ages.push(latest.ageMs+t-latest.at);else missingSamples++;
  }
  return {ages,missingSamples,samples:ages.length+missingSamples};
}
