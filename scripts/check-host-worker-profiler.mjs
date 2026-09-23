import assert from 'node:assert/strict';import {test} from 'node:test';import {EventEmitter} from 'node:events';
import {startHostWorkerProfile} from './lib/host-worker-profiler.mjs';
function browser({workers=1,fail}={}) {
 const cdp=new EventEmitter(),calls=[];let detached=0;
 cdp.detach=async()=>{detached++;};
 cdp.send=async(method,params)=>{
  calls.push([method,params]);
  if(method==='Target.getTargets')return {targetInfos:[{type:'page',url:'host.worker',targetId:'not-a-worker'},...Array.from({length:workers},(_,i)=>({type:'worker',url:'http://localhost/src/network/host.worker.ts',targetId:'worker'+i}))]};
  if(method==='Target.attachToTarget')return {sessionId:'worker-session'};
  if(method==='Target.sendMessageToTarget'){
   const m=JSON.parse(params.message);
   queueMicrotask(()=>cdp.emit('Target.receivedMessageFromTarget',{sessionId:'worker-session',message:JSON.stringify({id:m.id,...(m.method===fail?{error:{message:'injected failure'}}:{result:m.method==='Profiler.stop'?{profile:{nodes:[],samples:[]}}:{}})})}));
  }
  return {};
 };
 return {newBrowserCDPSession:async()=>cdp,calls,get detached(){return detached;}};
}
test('profile the unique authority Worker, return its data and detach once',async()=>{
 const b=browser(),p=await startHostWorkerProfile(b);assert.equal(b.calls.find(([m])=>m==='Target.attachToTarget')[1].targetId,'worker0');assert.deepEqual(await p.stop(),{nodes:[],samples:[]});assert.equal(await p.stop(),null);assert.equal(b.detached,1);
});
for(const workers of [0,2])test('ambiguous/missing Worker fails closed and detaches ('+workers+')',async()=>{
 const b=browser({workers});await assert.rejects(startHostWorkerProfile(b),/exactly one/);assert.equal(b.detached,1);assert.equal(b.calls.some(([m])=>m==='Target.attachToTarget'),false);
});
for(const fail of ['Profiler.enable','Profiler.start','Profiler.stop'])test('cleanup when '+fail+' fails',async()=>{
 const b=browser({fail});if(fail==='Profiler.stop'){const p=await startHostWorkerProfile(b);await assert.rejects(p.stop(),/injected failure/);assert.equal(await p.stop(),null);}else await assert.rejects(startHostWorkerProfile(b),/injected failure/);
 assert.equal(b.detached,1);assert.equal(b.calls.filter(([m])=>m==='Target.detachFromTarget').length,1);
});
