// Test-only reporting; no production clocks, input routing or prediction gates.
export const quantiles = values => {
 const sorted=values.toSorted((a,b)=>a-b);
 return {count:sorted.length,p50:sorted[Math.floor((sorted.length-1)*.5)]??null,p95:sorted[Math.floor((sorted.length-1)*.95)]??null,p99:sorted[Math.floor((sorted.length-1)*.99)]??null,max:sorted.at(-1)??null};
};
export function summarizePresentationPhase(evidence,name,start,end){
 const frames=evidence.frames.filter(f=>f.at>=start&&f.at<end),edges=evidence.edges.filter(e=>e.at>=start&&e.at<end);
 const trace=evidence.inputTrace??{sent:[],acks:[]};
 const measured=edges.map(edge=>{
  // The next input, not the phase boundary, closes a control response window.
  // This avoids censoring an edge simply because its response crosses phases.
  const next=evidence.edges.find(e=>e.at>edge.at)?.at??evidence.end;
  const matching=evidence.frames.filter(f=>f.at>=edge.at&&f.at<next&&f.keys===edge.keys&&f.active);
  const predicted=matching.find(f=>f.predicted);
  const sent=trace.sent.find(s=>s.at>=edge.at&&s.at<next&&s.keys===edge.keys);
  // Cumulative ACK coverage is NOT proof that an individual superseded input
  // ran for a simulation tick. Record observation at main and draw separately.
  const ack=sent?trace.acks.find(a=>a.at>=sent.at&&a.at<evidence.end&&a.ack>=sent.seq):null;
  const drawAck=sent?evidence.frames.find(f=>f.at>=sent.at&&f.at<evidence.end&&f.acknowledged>=sent.seq):null;
  return {...edge,controlSubmitAt:matching[0]?.at??null,controlLatency:matching.length?matching[0].at-edge.at:null,
   submitAt:predicted?.at??null,latency:predicted?predicted.at-edge.at:null,
   skipReasons:predicted?[]:[...new Set(matching.map(f=>f.predictionReason))],
   sentSeq:sent?.seq??null,sentAt:sent?.at??null,sendLatency:sent?sent.at-edge.at:null,
   mainAckAt:ack?.at??null,mainAckLatency:ack?ack.at-edge.at:null,
   drawAckAt:drawAck?.at??null,drawAckLatency:drawAck?drawAck.at-edge.at:null};
 });
 const metric=field=>quantiles(measured.map(e=>e[field]).filter(v=>v!==null));
 return {name,range:[start,end],frames:frames.length,edges:measured,missing:measured.filter(e=>e.latency===null).length,
  controlToSubmitMs:metric('controlLatency'),eventToPredictedSubmitMs:metric('latency'),eventToSendMs:metric('sendLatency'),
  eventToMainAckCoverageMs:metric('mainAckLatency'),eventToDrawAckCoverageMs:metric('drawAckLatency'),
  missingSent:measured.filter(e=>e.sentAt===null).length,missingMainAck:measured.filter(e=>e.mainAckAt===null).length,missingDrawAck:measured.filter(e=>e.drawAckAt===null).length,
  poseClockAgeMs:quantiles(frames.filter(f=>Number.isFinite(f.poseAt)&&f.poseAt>=0&&f.poseAt<=f.at).map(f=>f.at-f.poseAt)),
  frameGapMs:quantiles(frames.slice(1).map((f,i)=>f.at-frames[i].at)),authorityTicks:[frames[0]?.tick,frames.at(-1)?.tick],
  ships:frames.length?[Math.min(...frames.map(f=>f.ships)),Math.max(...frames.map(f=>f.ships))]:[null,null]};
}
