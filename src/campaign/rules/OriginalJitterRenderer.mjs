/** Native JitterRenderer. Host seeds replace nanoTime, never the per-copy Java Random algorithm. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalJavaRandom,validateOriginalJavaRandom,originalJavaNextFloat} from './OriginalJavaRandom.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'INVALID_NATIVE_JITTER',m);
const number=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native jitter float required');return f(n);};
export function createOriginalJitterRenderer(seed){return {scope:'native-jitter-renderer',seed,random:createOriginalJavaRandom(seed),jitterDirection:null,jitterLength:0,setSeedOnRender:true,circular:false};}
export function updateOriginalJitterSeed(jitter,seed){check(jitter?.scope==='native-jitter-renderer','Actual native JitterRenderer required');createOriginalJavaRandom(seed);jitter.seed=seed;}
export function originalJitterRandom(jitter){check(jitter?.scope==='native-jitter-renderer','Actual native JitterRenderer required');validateOriginalJavaRandom(jitter.random);jitter.random.state=createOriginalJavaRandom(jitter.seed).state;return jitter.random;}
export function validateOriginalJitterRenderer(jitter){
 check(jitter?.scope==='native-jitter-renderer','Actual native JitterRenderer required');createOriginalJavaRandom(jitter.seed);validateOriginalJavaRandom(jitter.random);
 check(typeof jitter.setSeedOnRender==='boolean'&&typeof jitter.circular==='boolean','Actual jitter modes required');check(number(jitter.jitterLength)===jitter.jitterLength,'Non-native jitter length');
 if(jitter.jitterDirection!==null)check(Array.isArray(jitter.jitterDirection)&&jitter.jitterDirection.length===2&&jitter.jitterDirection.every(n=>number(n)===n),'Actual nullable jitter direction required');return jitter;
}
/** Render-side random writes are persistent; repeated draws normally reset the SAME random object. */
export function originalJitterOffsets(jitter,maxRange,copies,minRange=0){
 validateOriginalJitterRenderer(jitter);maxRange=number(maxRange);minRange=number(minRange);check(Number.isInteger(copies)&&copies>=0&&copies<=2147483647,'Nonnegative Java jitter copy count required');
 const random=jitter.setSeedOnRender?originalJitterRandom(jitter):jitter.random,offsets=[],next=()=>originalJavaNextFloat(random);
 for(let i=0;i<copies;i++){
  let x=0,y=0,mult=1;
  if(jitter.jitterDirection!==null){const n=next(),length=f(f(n*n)*jitter.jitterLength);x=f(jitter.jitterDirection[0]*length);y=f(jitter.jitterDirection[1]*length);mult=f(f(.1)+f(n*f(.9)));}
  if(jitter.circular){const radius=f(f(minRange+f(f(maxRange-minRange)*next()))*mult),angle=f(next()*Math.PI*2);x=f(f(Math.cos(angle)*radius)+x);y=f(f(Math.sin(angle)*radius)+y);}
  else{let dx,dy;if(minRange<=0){dx=f(f(next()*maxRange)-f(maxRange/2));dy=f(f(next()*maxRange)-f(maxRange/2));}
   else{dx=Math.max(minRange,f(f(next()*f(maxRange-minRange))+minRange));dy=Math.max(minRange,f(f(next()*f(maxRange-minRange))+minRange));dx=f(dx*Math.sign(f(next()-.5)));dy=f(dy*Math.sign(f(next()-.5)));}
   x=f(f(dx*mult)+x);y=f(f(dy*mult)+y);
  }
  offsets.push([x,y]);
 }
 return offsets;
}
