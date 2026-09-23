// Test-only source instrumentation. Never imported by production code.
import assert from 'node:assert/strict';
export function hzProbePlugin({noRender=false}={}) {
 return {name:'test-only-hz-probe',enforce:'pre',transform(source,id){
  const file=id.replaceAll('\\','/').split('?')[0]; let code=source;
  const replace=(from,to)=>{assert.equal(code.split(from).length,2,'Unique probe anchor: '+file+' '+from);code=code.replace(from,to);};
  if(file.endsWith('/src/network/host.worker.ts')){
   code=
authorityPrefix+code;
   replace('async function step() {','async function step() { __hzCount("timerCalls"); if (steppingLifecycle === lifecycle) __hzCount("busyTimerCalls");');
   replace('const generation = lifecycle, authority = engine;','__hzCount("callbacks"); const __callbackStart=performance.now(); const generation = lifecycle, authority = engine;');
   replace('function snapshot(final = false) {','function snapshot(final = false) { __hzCount("snapshotOffers");');
   replace('if (!display && !network) {','if (tick !== directLastTick && directInFlight !== null) __hzCount("ioHeldOffers"); if (tick !== lastSnapshotTick && snapshotInFlight !== null) __hzCount("displayHeldOffers"); if (!display && !network) {');
   replace('captureMs = captureMs * .7 + (performance.now() - started) * .3;','const __capture=performance.now()-started; __hzCost("capture",__capture); captureMs = captureMs * .7 + __capture * .3;');
   replace('captureReuses++;','captureReuses++; __hzCount("captureReuse");');
   replace('encodeMs = encodeMs * .7 + (performance.now() - encodingStarted) * .3;','const __encode=performance.now()-encodingStarted; __hzCost("encode",__encode); __hzCount("binaryEncodes",Number(!!binary)+Number(!!networkBinary && !(sameSounds && binary))+Number(!!visualBinary)); encodeMs = encodeMs * .7 + __encode * .3;');
   if (code.includes('function flushSnapshotEncoding()')) {
    replace('encodeMs = encodeMs * .7 + result.workerMs * .3;', '__hzCount("helperCompletions"); __hzCost("helperWorker",result.workerMs); encodeMs = encodeMs * .7 + result.workerMs * .3;');
    replace('directInFlight = directLastTick = job.tick;', '__hzCount("networkPublications"); __hzHist("networkTickGaps",job.tick-directLastTick); __hzNetAt=performance.timeOrigin+performance.now(); directInFlight = directLastTick = job.tick;');
    replace("type:'snapshot',tick:job.tick,binary:result.network.buffer", "type:'snapshot',probeSentAt:__hzNetAt,tick:job.tick,binary:result.network.buffer");
    replace('snapshotInFlight = lastSnapshotTick = job.tick;', '__hzCount("displayPublications"); snapshotInFlight = lastSnapshotTick = job.tick;');
    replace('snapshotEncoderWorker.submit(frame, encodeDisplay, encodeNetwork, networkFrame?.sounds ?? [])', '(() => { const at=performance.now(); const id=snapshotEncoderWorker.submit(frame, encodeDisplay, encodeNetwork, networkFrame?.sounds ?? []); __hzCost("prepareTape",performance.now()-at); if(id!==null)__hzCount("helperJobs"); return id; })()');
   }
   replace('directInFlight = directLastTick = tick;','__hzCount("networkPublications"); __hzHist("networkTickGaps",tick-directLastTick); __hzNetAt=performance.timeOrigin+performance.now(); directInFlight = directLastTick = tick;');
   replace('type: "snapshot", tick, binary: networkBinary.buffer','type: "snapshot", probeSentAt: __hzNetAt, tick, binary: networkBinary.buffer');
   replace('snapshotInFlight = tick;','__hzCount("displayPublications"); snapshotInFlight = tick;');
   replace('lastStepMs = performance.now() - start;','lastStepMs = performance.now() - start; __hzCost("physics",lastStepMs);');
   replace('await yieldHostTask();','const __yieldAt=performance.now(); await yieldHostTask(); __hzCost("yieldWait",performance.now()-__yieldAt);');
   const receiptGuard=code.includes('function acceptIoSnapshot(')?'if (value.tick !== directInFlight) return false;':'if (value.tick !== directInFlight) return;';
   replace(receiptGuard,receiptGuard+' const __ackAt=performance.timeOrigin+performance.now(); __hzCost("ioRoundTrip",__ackAt-__hzNetAt); if(Number.isFinite(value.probeReceivedAt)){__hzCost("ioForward",value.probeReceivedAt-__hzNetAt);__hzCost("ioService",value.probeDoneAt-value.probeReceivedAt);__hzCost("ioReturn",__ackAt-value.probeDoneAt);}');
   if(code.includes('function pollIoCompletion(')) replace('if (state && acceptIoSnapshot(state)) ioStats.sharedCompletions++;','if (state && acceptIoSnapshot(state)) { ioStats.sharedCompletions++; __hzCount("sharedCompletions"); }');
   replace("send({ type: 'performance', ...diagnostics() });","send({ type: 'performance', ...diagnostics() }); __hzFlush(tick);");
   replace('if (steppingLifecycle === generation) steppingLifecycle = null;','__hzCost("callbackWall",performance.now()-__callbackStart); __hzHist("stepsPerCallback",steps); if (steppingLifecycle === generation) steppingLifecycle = null;');
  } else if(file.endsWith('/src/network/AuthorityIoBridge.mjs')) {
   replace("const isState=m.type==='snapshot',now=this.now(),tick=m.tick;","const __receivedAt=performance.timeOrigin+performance.now(); const isState=m.type==='snapshot',now=this.now(),tick=m.tick;");
   replace("this.port.postMessage({type:isState?'io-snapshot':'io-motion',tick,delivery,nextSequence:this.seq});","this.port.postMessage({type:isState?'io-snapshot':'io-motion',tick,delivery,nextSequence:this.seq,probeReceivedAt:__receivedAt,probeDoneAt:performance.timeOrigin+performance.now()});");
  } else if(noRender&&file.endsWith('/src/network/LanBattle.tsx')) {
   replace('renderer.updateVisual(combatRenderView(engine), launched ? dt : 0, frameContext);','/* diagnostic ablation: skip visual update, not physics/restore/ACK */');
   replace('if (renderer.render(combatRenderView(engine), alpha, camera, zoom, frameContext)) frameCount++;','frameCount++; // RAF heartbeat only; NOT rendered FPS in this ablation');
  }
  return code===source?null:code;
 }};
}
const authorityPrefix="\nlet __hzNetAt=0;\nconst __hzNew=()=>({at:performance.timeOrigin+performance.now(),counts:{} as Record<string,number>,ms:{} as Record<string,number>,max:{} as Record<string,number>,hist:{} as Record<string,Record<string,number>>});\nlet __hz=__hzNew();\nfunction __hzCount(k:string,n=1){__hz.counts[k]=(__hz.counts[k]??0)+n;}\nfunction __hzCost(k:string,ms:number){__hzCount(k);__hz.ms[k]=(__hz.ms[k]??0)+ms;__hz.max[k]=Math.max(__hz.max[k]??0,ms);}\nfunction __hzHist(k:string,v:number){const h=__hz.hist[k]??(__hz.hist[k]={});h[v]=(h[v]??0)+1;}\nfunction __hzFlush(tick:number){const at=performance.timeOrigin+performance.now();self.postMessage({type:'hz-probe',...__hz,end:at,tick});__hz=__hzNew();}\n";
