import { LanPresentationRuntime } from '../../src/network/LanPresentationRuntime';
import { LanPresentationFrameLoop, type LanFrameClock } from '../../src/network/LanPresentationFrameLoop';
import { decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { assets, bytes, pixels } from './offscreen-presentation-page.mts';
const layers = new Set(['background','nebula','asteroid','trail','hull','weapon','beam','shield','explosion','markers']);
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function equal(a: unknown, b: unknown, message: string) { check(JSON.stringify(a) === JSON.stringify(b), message); }
const defer = () => { let resolve, reject; const promise = new Promise<void>((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
class Clock implements LanFrameClock {
  next = 0; pending = new Map<number,(now:number)=>void>();
  request(callback: (now:number)=>void): number { const id=this.next++;this.pending.set(id,callback);return id; }
  cancel(id:number): void { this.pending.delete(id); }
  take() { check(this.pending.size===1,'Not exactly one scheduled RAF');const [id,callback]=this.pending.entries().next().value!;this.pending.delete(id);return callback; }
  step(now:number) { this.take()(now); }
}
function activity() { return {launched:true,running:true,active:false,projectilesActive:false,fireActive:false,layers,damageEnabled:true}; }
function layout() { return {viewport:{width:640,height:360,rect:{left:0,top:0,width:640,height:360}},immediate:true}; }
function input(owner,viewport) { return owner.controls.readInput(owner.world,viewport,0,0,false,[]); }
function make(data) {
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  const gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});check(gl,'Real WebGL2 required');
  const owner=new LanPresentationRuntime(data.match,0,decodeBinaryFrame(bytes(data.cases[0].wire)),canvas,gl);
  return {canvas,gl,owner};
}
/** Real renderers/worlds. A deterministic clock exposes cancellation races;
 * separate Worker checks below use actual native requestAnimationFrame. */
export async function checkPresentationFrameLoop(data) {
  await assets();const cases=[],trace=[],errors=[],current=make(data),reference=make(data),clock=new Clock();
  let state=activity(),view=layout(),completed,gate=()=>{},onFrame=()=>{};
  const owner=current.owner;
  const loop=new LanPresentationFrameLoop(owner,current.canvas,{
    readLayout:()=>view,
    synchronize:()=>{trace.push('gate');gate();},readActivity:()=>{trace.push('activity');return state;},
    readInput:viewport=>{trace.push('input');return input(owner,viewport);},
    onFrame:frame=>{completed=frame;onFrame();},onError:error=>errors.push(String(error)),
  },clock);
  for(const [target,key,label] of [[owner,'applyPlayback','apply'],[owner,'renderPose','pose'],[owner.controls,'follow','camera'],[owner,'drawPlayback','effects']]){
    const original=target[key].bind(target);target[key]=(...args)=>{trace.push(label);return original(...args);};
  }
  try{
    await reference.owner.prepareAssets();check(await loop.start(),'Loop never became ready');check(clock.pending.size===1,'Ready did not schedule');
    const repeat=await loop.start();check(repeat&&clock.pending.size===1,'Repeated start created another clock');
    let last;
    for(const [index,row] of data.cases.entries()){
      const now=1000+index*(1000/60),frame=decodeBinaryFrame(bytes(row.wire)),other=decodeBinaryFrame(bytes(row.wire));
      owner.receive(frame);reference.owner.receive(other);
      for(const runtime of [owner,reference.owner]){runtime.controls.zoom=row.zoom;runtime.controls.camera.set(...row.camera);}
      trace.length=0;clock.step(now);
      const dt=last===undefined?0:Math.min(.05,Math.max(0,now-last)/1000);last=now;
      const sample=reference.owner.applyPlayback(now,true);
      reference.owner.renderPose(now,()=>input(reference.owner,view.viewport),state.active);
      reference.owner.controls.follow(reference.owner.world,sample.alpha,view.viewport,dt,state.active);
      reference.owner.drawPlayback(sample,now,{dt,camera:reference.owner.controls.camera,zoom:row.zoom,layers,damageEnabled:true},state);
      equal(trace,['apply','gate','activity','pose','input','camera','effects'],'Frame stage order changed');
      const {applyMs,renderMs,gapMs,playbackDelay,...completion}=completed;
      check([applyMs,renderMs,gapMs,playbackDelay].every(n=>Number.isFinite(n)&&n>=0),'Invalid frame timing');
      equal(completion,{tick:row.tick,appliedFrames:sample.frames.length,reset:sample.reset,drawn:true,dt,hudZoom:row.zoom},'Completion data changed');
      current.gl.finish();reference.gl.finish();check(!current.gl.getError()&&!reference.gl.getError(),'GL error');
      const a=pixels(current.gl),b=pixels(reference.gl);let different=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])different++;
      check(different===0,row.name+' loop/manual pixels differ');cases.push({name:row.name,different});
      equal([owner.world.playerShip.pos,owner.controls.camera],[reference.owner.world.playerShip.pos,reference.owner.controls.camera],'Pose/camera mismatch');
      check(clock.pending.size===1,'RAF chain multiplied');
    }
    // A taken browser callback can still run after cancelAnimationFrame.
    const stale=clock.take(),count=loop.stats.frames;loop.setVisible(false);
    check(!clock.pending.size&&loop.stats.phase==='suspended','Hidden loop still scheduled');
    loop.setVisible(true);check(await loop.start(),'Visible did not restart');stale(3000);
    check(loop.stats.frames===count&&clock.pending.size===1,'Old callback stole new ticket');
    clock.step(10000);check(completed.dt===0,'Resume inherited old dt');clock.step(20000);check(completed.dt===.05,'dt clamp changed');
    loop.setContextAvailable(false);check(!clock.pending.size,'Lost context still scheduled');
    loop.setContextAvailable(true);await loop.start();clock.step(30000);check(completed.dt===0,'Restored context inherited old dt');
    // Activity is read after sync; revocation cannot render another stage.
    gate=()=>{state={...state,launched:false,active:false};};clock.step(30016);check(completed.dt===0,'Sync gate was sampled too early');
    gate=()=>loop.stop();trace.length=0;clock.step(30032);equal(trace,['apply','gate'],'Revoked frame continued to pose/render');
    check(!clock.pending.size&&loop.stats.phase==='stopped','Stop rescheduled');gate=()=>{};
    // Stop does not erase a retained terminal endpoint; reset does erase epochs.
    owner.receive({...decodeBinaryFrame(bytes(data.cases[0].wire)),tick:900});loop.stop();await loop.start();clock.step(40000);
    check(owner.appliedTick===900,'Stop lost terminal endpoint');
    loop.reset();check(owner.appliedTick===-1&&!clock.pending.size,'Reset retained epoch evidence');
    owner.receive(decodeBinaryFrame(bytes(data.cases[0].wire)));await loop.start();clock.step(50000);check(owner.appliedTick===600,'Reconnect rejected fresh lower tick');
    const before=loop.stats.frames;view=null;clock.step(50016);check(loop.stats.frames===before&&clock.pending.size===1,'Missing viewport drew/rescheduled twice');view=layout();
    // No new input generation/ACK/recording is performed by rendering.
    owner.recordAcceptedInput=()=>{throw Error('RAF must not record unaccepted input');};clock.step(50032);
    onFrame=()=>loop.dispose();clock.step(50048);check(!clock.pending.size&&loop.stats.phase==='disposed','onFrame disposal rescheduled');
    loop.dispose();check(!errors.length,'Unexpected loop error');
  }finally{loop.dispose();reference.owner.dispose();}

  // Old preparation resolve/reject, reset, failure and disposal are tested on
  // actual Runtime assets; the latch changes scheduling, not renderer behavior.
  const lifecycle=[];
  for(const finish of ['resolve','reject']){
    const c=make(data),q=new Clock(),latch=defer(),failures=[];const prepare=c.owner.prepareAssets.bind(c.owner);let calls=0;
    c.owner.prepareAssets=async()=>{if(++calls===1)await latch.promise;await prepare();};
    const l=new LanPresentationFrameLoop(c.owner,c.canvas,{readLayout:layout,readActivity:activity,readInput:v=>input(c.owner,v),onError:e=>failures.push(String(e))},q);
    try{
      const old=l.start();check(l.start()===old,'Pending readiness was duplicated');check(!q.pending.size,'Loading scheduled a frame');
      l.reset();c.owner.receive(decodeBinaryFrame(bytes(data.cases[0].wire)));check(await l.start(),'New epoch did not prepare');
      latch[finish](Error('obsolete asset preparation'));check(!await old,'Old readiness became current');
      check(!failures.length&&q.pending.size===1,'Old asset completion failed new epoch');q.step(1000);
      const taken=q.take();l.dispose();taken(1016);check(!q.pending.size&&l.stats.phase==='disposed','Disposed callback resumed');
      lifecycle.push(finish+' late readiness fenced');
    }finally{latch.resolve();l.dispose();}
  }
  for(const mode of ['assets','bad-clock','bad-frame','async-hook','throwing-observer']){
    const c=make(data),q=new Clock(),failures=[];
    if(mode==='assets')c.owner.prepareAssets=async()=>{throw Error('asset failure');};
    if(mode==='bad-frame')c.owner.receive({...decodeBinaryFrame(bytes(data.cases[0].wire)),displayVersion:99});
    const l=new LanPresentationFrameLoop(c.owner,c.canvas,{readLayout:layout,
      readActivity:mode==='async-hook'?async()=>activity():activity,readInput:v=>input(c.owner,v),
      onFrame:()=>{if(mode==='throwing-observer')throw Error('observer failure');},onError:e=>failures.push(String(e))},q);
    await l.start();if(mode!=='assets')q.step(mode==='bad-clock'?NaN:1000);
    check(l.stats.phase==='failed'&&!q.pending.size&&failures.length===1,'Failure was not terminal: '+mode);
    let rejected=false;try{await l.start();}catch{rejected=true;}check(rejected,'Failed loop restarted');
    check(c.owner.renderer.getResourceStats().residentTextures===0,'Failed owner kept GPU resources');l.dispose();l.dispose();
    lifecycle.push(mode+' fail-closed');
  }
  {
    const c=make(data),q=new Clock(),latch=defer(),failures=[];
    const prepare=c.owner.prepareAssets.bind(c.owner);c.owner.prepareAssets=async()=>{await latch.promise;await prepare();};
    const l=new LanPresentationFrameLoop(c.owner,c.canvas,{readLayout:layout,readActivity:activity,readInput:v=>input(c.owner,v),onError:e=>failures.push(String(e))},q);
    const pending=l.start();l.dispose();latch.resolve();check(!await pending&&!q.pending.size&&!failures.length,'Disposed loading owner returned ready');
    lifecycle.push('dispose during actual asset preparation fenced');
  }
  return {cases,lifecycle,errors,scope:'Deterministic scheduling + actual unchanged renderer; not an FPS benchmark.'};
}

export function openWorkerFrameLoop(runtime,canvas,progress) {
  const failures=[],completions=[];
  const loop=new LanPresentationFrameLoop(runtime,canvas,{
    readLayout:layout,readActivity:activity,readInput:v=>input(runtime,v),
    onFrame:frame=>{if(completions.length<8)completions.push(frame);if(frame.drawn)Atomics.add(progress,0,1);},onError:error=>failures.push(String(error)),
  });
  return {loop,failures,completions};
}
