import {motionFromText,motionToText} from '../src/network/MotionFrame.mjs';
import {encodeMotionDisplayFrame} from '../src/network/MotionDisplay.mjs';
import {decodeCombatState} from '../src/network/CriticalCombatState.mjs';
import {Worker} from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2), value=(key,fallback)=>{const at=args.indexOf(key);return at<0?fallback:args[at+1];};
const runtime=path.resolve(value('--runtime','artifacts/server-authority-20260920/runtime'));
const assets=path.resolve(value('--assets','public'));
const seconds=Number(value('--seconds','20'));
const captureDelay=Number(value('--capture-ms','0')),motion=args.includes('--motion'),combat=args.includes('--combat');
if(!Number.isFinite(captureDelay)||captureDelay<0||captureDelay>2000)throw Error('Invalid capture demand delay');
const sizes=String(value('--ships','2,8,16,32')).split(',').map(Number);
if(!Number.isFinite(seconds)||seconds<5||seconds>120||sizes.some(n=>!Number.isInteger(n)||n<2||n>128))throw Error('Invalid benchmark bounds');
const results=[];
for(const count of sizes){
 const match={id:'arm-bench-'+count,authority:'server',hostId:'p0',seed:1511506142,snapshotHz:60,
  players:[{id:'p0',name:'neutral-player-0',seat:0,team:0,hull:'hammerhead',design:null},{id:'p1',name:'neutral-player-1',seat:1,team:1,hull:'hammerhead',design:null}],
  options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.floor((count-2)/2)).fill('hammerhead'),Array(Math.ceil((count-2)/2)).fill('hammerhead')],initialDeploymentLimit:null}};
 let resolve;const done=new Promise(r=>resolve=r);const records=[],errors=[],recoveries=[];
 let start=0,first=null,last=null,frames=0,bytes=0,motionFrames=0,motionDisplayFrames=0,combatFrames=0,combatBytes=0,weaponFrames=0,weaponRows=0,timer,captureTimer,settled=false;
 const worker=new Worker(path.join(runtime,'authority-worker.mjs'),{workerData:{match,assets},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:768}});
 const complete=()=>{if(settled)return;settled=true;resolve();};
 const boot=setTimeout(()=>{errors.push('initialization timeout');complete();},30000);
 worker.on('error',error=>{errors.push(error.message);complete();});
 worker.on('exit',code=>{if(!settled){errors.push('unexpected exit '+code);complete();}});
 worker.on('message',m=>{
  if(m.type==='ready'){clearTimeout(boot);start=performance.now();if(motion)worker.postMessage({type:'motion-mode',enabled:true});if(combat)worker.postMessage({type:'combat-mode',enabled:true});worker.postMessage({type:'start'});timer=setTimeout(complete,seconds*1000);}
  if(m.type==='combat-state'){combatFrames++;combatBytes+=m.data.byteLength;const f=decodeCombatState(new Uint8Array(m.data));if(f.weapons){weaponFrames++;weaponRows+=f.weapons.reduce((n,s)=>n+s[1].length,0);}worker.postMessage({type:'combat-consumed',tick:m.tick});}
  if(m.type==='motion'){motionFrames++;if(motionToText(encodeMotionDisplayFrame(motionFromText(m.data)))===m.data)motionDisplayFrames++;worker.postMessage({type:'motion-consumed',tick:m.tick});}
  if(m.type==='snapshot'){const release=()=>worker.postMessage({type:'snapshot-consumed',tick:m.tick});if(captureDelay)captureTimer=setTimeout(release,captureDelay);else release();if(start){const now=performance.now();last={tick:m.tick,at:now};if(now-start>=Math.min(5,seconds/3)*1000){first??={tick:m.tick,at:now};frames++;bytes+=m.bytes;}}}
  if(m.type==='performance')records.push(m);
  if(m.type==='recovered')recoveries.push({pauseMs:m.pauseMs,diagnostics:m.diagnostics});
  if(m.type==='error'){errors.push(m.message);complete();}
  if(m.type==='finished'){errors.push('battle finished before measurement end');complete();}
 });
 await done;clearTimeout(boot);clearTimeout(timer);clearTimeout(captureTimer);const workerCpu=typeof worker.cpuUsage==='function'?await worker.cpuUsage():null;await worker.terminate();
 const duration=first&&last?(last.at-first.at)/1000:0;
 const summary={ships:count,captureDemandDelayMs:captureDelay,motionFrames,motionDisplayFrames,combatFrames,combatBytes,weaponFrames,weaponRows,workerCpuMs:workerCpu?(workerCpu.user+workerCpu.system)/1000:null,requestedSeconds:seconds,measuredSeconds:duration,ticks:last?.tick??0,
  physicsHz:duration?(last.tick-first.tick)/duration:null,snapshotHz:duration?(frames-1)/duration:null,
  meanUncompressedFrameBytes:frames?bytes/frames:null,errors,recoveries,records};results.push(summary);
 console.log(JSON.stringify({...summary,records:records.slice(-3)}));
}
const report={scope:'Actual production authority Worker on Node; fixed 60Hz physics; optional delayed full-capture consumption and independent motion; fixture demand delay models relay backpressure but does not test real network readiness, existing overload protection, 2 neutral human ships plus AI. No renderer, WAN or compression/fanout costs included. Not a public-server capacity guarantee.',node:process.version,arch:process.arch,results};
const out=path.resolve(value('--out',value('--output','artifacts/server-authority-20260920/authority-benchmark.json')));await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));
