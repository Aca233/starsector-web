import assert from 'node:assert/strict';
import {summarizePresentationPhase} from './lan-presentation-latency.mjs';
// Test-only bounded timing probe in the SAME realm as the real draw owner.
// No frame IPC, restored-world copying, renderer substitutions, or shipping hooks.
export function presentationMeasurePlugin(mode){
 const replace=(code,needle,value)=>{assert.equal(code.split(needle).length-1,1,'presentation probe anchor: '+needle);return code.replace(needle,value);};
 return {name:'presentation-submit-measure',enforce:'pre',transform(code,id){
  if(!mode)return;
  const file=id.replaceAll('\\','/').split('?')[0];
  if(mode==='messages'&&file.endsWith('/src/network/LanPresentationWorkerClient.ts'))return replace(code,"const mode=options.realtime??'auto';","const mode=options.realtime??'messages';");
  if(file.endsWith('/src/network/LanBattle.tsx')){
   const trace=(kind,value)=>`const trace=(globalThis as any).__presentationInputTrace;if(trace){if(trace.${kind}.length<10000)trace.${kind}.push(${value});else trace.overflow++;}`;
   code=replace(code,'          seq = input.seq;','          seq = input.seq; '+trace('sent','{at:performance.timeOrigin+performance.now(),seq:input.seq,keys:input.keys}'));
   return replace(code,'      acknowledged = ack; lastAckAt = now;','      acknowledged = ack; lastAckAt = now; '+trace('acks','{at:performance.timeOrigin+performance.now(),ack}'));
  }
  if(file.endsWith('/src/network/LanPresentationRuntime.ts')){
   code='const submitFrames: unknown[]=[]; (globalThis as any).__presentationSubmitFrames=submitFrames;\n'+code;
   // Read on demand OUTSIDE the measured interval; no extra per-frame traversal.
   if(mode==='main')code=replace(code,'    this.random = new VisualRandom(match.seed);',`    this.random = new VisualRandom(match.seed);
    (globalThis as any).__presentationEntityCounts=()=>{
      const w=this.world, roots=w.allCapitalShips, deployed=w.capitalShips, assembled=w.combatShips;
      return {tick:this.appliedTick,rootHulls:roots.length,deployedRoots:deployed.length,
        attachedModules:assembled.filter(s=>s.isAttachedModule).length,assembledShips:assembled.length,
        fighters:w.fighters.length,bombers:w.bombers.length,drones:w.droneSystem.drones.length,
        activeEntities:w.ships.length,projectiles:w.projectiles.length,
        roots:roots.map(s=>({id:s.id,hull:s.spec.id,team:s.teamId,assembly:s.assemblyShips.length,reserve:w.deployment.isReserve(s.id)}))};
    };`);
   code=replace(code,'  readonly renderer: WebGLCombatRenderer;','  private measuredPoseAt = 0; private measuredInput: PlayerInput | null = null; private measuredActive = false; private measuredMotionAck = -1;\n  readonly renderer: WebGLCombatRenderer;');
   code=replace(code,'this.pipeline.renderPose(this.world, this.appliedTick, now, readInput, active);','this.measuredPoseAt=performance.timeOrigin+now; this.measuredActive=active; this.pipeline.renderPose(this.world, this.appliedTick, now, () => {const input=readInput();this.measuredInput=input;return input;}, active);');
   code=replace(code,'    onAdvanced?.(acknowledged);','    this.measuredMotionAck=Math.max(this.measuredMotionAck,acknowledged); onAdvanced?.(acknowledged);');
   code=replace(code,'    pipeline.motion.clear(); pipeline.combat.clear(); pipeline.projectileVisuals.clear();','    this.measuredMotionAck=-1; pipeline.motion.clear(); pipeline.combat.clear(); pipeline.projectileVisuals.clear();');
   return replace(code,'return this.renderer.render(world, view.alpha, view.camera, view.zoom, frame);',`const drawn=this.renderer.render(world, view.alpha, view.camera, view.zoom, frame);
    if(drawn){const p=this.world.playerShip.interpolatedPos(view.alpha);submitFrames.push({at:performance.timeOrigin+performance.now(),poseAt:this.measuredPoseAt,tick:this.appliedTick,acknowledged:Math.max(this.latest?.acknowledged[this.seat]??-1,this.measuredMotionAck),keys:this.measuredInput?.keys,seq:this.measuredInput?.seq,active:this.measuredActive,predicted:this.pipeline.prediction.stats().active,predictionReason:this.pipeline.prediction.stats().reason,x:p.x,y:p.y,ships:this.world.ships.length,projectiles:this.world.projectiles.length});if(submitFrames.length>10000)submitFrames.shift();}return drawn;`);
  }
  if(file.endsWith('/src/network/lan-presentation.worker.ts'))return replace(code,"    if(message.type==='init'){",`    if((message as any).type==='test-submit-frames'){scope.postMessage({type:'test-submit-frames',frames:(globalThis as any).__presentationSubmitFrames} as any);return;}
    if(message.type==='init'){`);
 }};
}
export async function beginPresentationMeasure(page,duration){
 await page.waitForFunction(()=>{const h=document.querySelector('.lan-hud');return h&&!h.inert;});
 return page.evaluate(duration=>{
  const start=performance.timeOrigin+performance.now();
  window.__presentationInputTrace={sent:[],acks:[],overflow:0};
  window.submitExperiment={start,end:start+duration,edges:[],blocks:[],next:0};
  const pulse=()=>{const e=window.submitExperiment,at=performance.timeOrigin+performance.now();if(at>=e.end){clearInterval(window.submitPulse);return;}
   for(const code of ['KeyW','KeyS'])window.dispatchEvent(new KeyboardEvent('keyup',{code,cancelable:true}));
   const index=e.next++,code=index%2?'KeyS':'KeyW';
   const edge={at:performance.timeOrigin+performance.now(),code,keys:index%2?2:1};e.edges.push(edge);
   window.dispatchEvent(new KeyboardEvent('keydown',{code,cancelable:true}));
   // Fixed 70ms task AFTER the actual DOM event, second half only. Record its
   // actual window; do not call this a measured real-user hardware input delay.
   if(at>=start+duration/2){const from=performance.timeOrigin+performance.now(),until=performance.now()+70;while(performance.now()<until){}e.blocks.push({from,to:performance.timeOrigin+performance.now()});}
  };
  window.submitPulse=setInterval(pulse,250);pulse();return {start,end:start+duration};
 },duration);
}
export async function finishPresentationMeasure(page,until,retain){
 await page.evaluate(()=>{clearInterval(window.submitPulse);for(const code of ['KeyW','KeyS'])window.dispatchEvent(new KeyboardEvent('keyup',{code,cancelable:true}));if(window.presentationMeasureWorker)window.presentationMeasureWorker.postMessage({type:'test-submit-frames'});});
 await until(()=>page.evaluate(()=>window.presentationMeasureWorker?!!window.workerSubmitFrames:!!window.__presentationSubmitFrames),'owner-local render timing report');
 const evidence=await page.evaluate(()=>({...window.submitExperiment,inputTrace:window.__presentationInputTrace,frames:window.workerSubmitFrames??window.__presentationSubmitFrames,mode:document.querySelector('.lan-canvas').dataset.presentation,transport:window.presentationRealtimeKind??'main'}));
 await retain?.(evidence);
 assert.ok(evidence.frames.length>100,'actual rendered frames must be recorded');
 assert.equal(evidence.inputTrace.overflow,0,'bounded input timing trace overflow');
 const middle=(evidence.start+evidence.end)/2;
 const phases=[['normal',evidence.start,middle],['main-busy',middle,evidence.end]].map(([name,start,end])=>{
  const phase=summarizePresentationPhase(evidence,name,start,end);
  assert.ok(phase.edges.length>=10,'enough actual DOM edges per phase');
  assert.ok(phase.controlToSubmitMs.count>=phase.edges.length*.8,'fresh controls must be sampled by actual active drawn frames');
  for(const edge of phase.edges.filter(e=>e.latency===null&&e.controlLatency!==null))assert.ok(edge.skipReasons.length&&edge.skipReasons.every(r=>['collision','unavailable','stale'].includes(r)),'missing prediction needs a real safety-gate reason; never silently count it as a visible response');
  return phase;
 });
 return {...evidence,phases,scope:'DOM flight control to WebGL submission sampling that key mask; a separate censored metric includes only active motion prediction (collision/unavailable gates remain unchanged and misses are explicit). NOT compositor/scanout or input-to-photon latency. Single-room pilot, normal versus synthetic main-thread task windows.'};
}
