/** AnimationManager/BaseAnimation, 0.98a-RC8. No synthetic completion of unknown animations/tasks. */
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_ANIMATION',m);
const scalar=v=>{check(typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(f(v)),'Finite animation float required');return f(v);};
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual animation service required: '+k);const result=s[k](...args);check(!result||typeof result.then!=='function','Synchronous animation service required: '+k);return result;};
const base=a=>a?.scope==='native-base-animation'&&a.classAlias==='com.fs.graphics.anim.BaseAnimation';
export function createOriginalBaseAnimation(){return {scope:'native-base-animation',classAlias:'com.fs.graphics.anim.BaseAnimation',duration:1,numFrames:1,looping:false,reverse:false,before:null,after:null,elapsed:0,progress:0,currFrame:0,currLoop:0,stopNow:false};}
export function validateOriginalBaseAnimation(a){
 check(base(a),'Actual BaseAnimation required');for(const key of ['duration','elapsed','progress'])check(scalar(a[key])===a[key],'Native animation float required: '+key);
 for(const key of ['numFrames','currFrame','currLoop'])check(Number.isInteger(a[key])&&a[key]>=-2147483648&&a[key]<=2147483647,'Native animation int required: '+key);
 for(const key of ['looping','reverse','stopNow'])check(typeof a[key]==='boolean','Actual animation Boolean required');
 check(a.numFrames>0&&a.duration>=0&&(!a.looping||a.duration>0),'Invalid animation duration/frame count');for(const key of ['before','after'])check(a[key]===null||a[key]&&typeof a[key]==='object','Actual nullable animation task required');return a;
}
export function originalAnimationIsDone(a,services={}){if(base(a)){validateOriginalBaseAnimation(a);return a.stopNow||!a.looping&&a.elapsed>=a.duration;}const done=call(services,'isAnimationDone',a);check(typeof done==='boolean','Actual animation completion Boolean required');return done;}
export function startOriginalAnimation(a,services={}){if(!base(a))return call(services,'startAnimation',a);validateOriginalBaseAnimation(a);if(a.before!==null)call(services,'performAnimationTask',a.before);}
export function finishOriginalAnimation(a,services={}){if(!base(a))return call(services,'finishAnimation',a);validateOriginalBaseAnimation(a);if(a.after!==null)call(services,'performAnimationTask',a.after);}
export function advanceOriginalAnimation(a,seconds,services={}){
 const dt=scalar(seconds);check(dt>=0,'Negative animation dt');if(!base(a))return call(services,'advanceAnimation',a,dt);validateOriginalBaseAnimation(a);
 const perFrame=f(a.duration/f(a.numFrames));a.elapsed=f(a.elapsed+dt);
 if(a.elapsed>=a.duration){if(a.looping){while(a.elapsed>=a.duration){const next=f(a.elapsed-a.duration);check(next<a.elapsed,'Animation interval cannot make float progress');a.elapsed=next;}a.currLoop=(a.currLoop+1)|0;}else{a.progress=1;a.currFrame=a.numFrames-1;return;}}
 const index=Math.min(2147483647,Math.max(-2147483648,Math.trunc(f(a.elapsed/perFrame))));a.currFrame=a.reverse?(a.numFrames-index-1)|0:index;a.progress=f(a.elapsed/a.duration);
}
export function createOriginalAnimationManager(){return {scope:'native-animation-manager',paused:false,animations:[],added:[],removing:[],starting:[]};}
export function validateOriginalAnimationManager(s){check(s?.scope==='native-animation-manager'&&typeof s.paused==='boolean','Actual AnimationManager history required');const seen=new Set();for(const key of ['animations','added','removing','starting']){check(Array.isArray(s[key]),'Actual animation queue required: '+key);for(const a of s[key]){check(a&&typeof a==='object','Actual queued animation required');if(!seen.has(a)&&base(a)){validateOriginalBaseAnimation(a);seen.add(a);}}}return s;}
export function addOriginalAnimation(s,a){validateOriginalAnimationManager(s);check(a&&typeof a==='object','Actual animation required');if(base(a))validateOriginalBaseAnimation(a);s.added.push(a);return a;}
export function removeOriginalAnimation(s,a){validateOriginalAnimationManager(s);const i=s.added.indexOf(a);if(i>=0)s.added.splice(i,1);s.removing.push(a);}
export function clearOriginalAnimationManager(s){validateOriginalAnimationManager(s);for(const key of ['starting','added','animations','removing'])s[key].length=0;}
function finished(s,services){for(let i=0;i<s.animations.length;){const a=s.animations[i];if(!originalAnimationIsDone(a,services)){i++;continue;}finishOriginalAnimation(a,services);check(s.animations[i]===a,'Animation callback structurally changed active iterator');s.animations.splice(i,1);}}
export function advanceOriginalAnimationManager(s,seconds,services={}){
 validateOriginalAnimationManager(s);const dt=scalar(seconds);check(dt>=0,'Negative animation dt');if(s.paused)return;
 s.starting.length=0;s.starting.push(...s.added);s.added.length=0;
 for(const a of s.starting){startOriginalAnimation(a,services);s.animations.push(a);}finished(s,services);
 for(const a of s.animations)advanceOriginalAnimation(a,dt,services);
 for(let i=s.animations.length-1;i>=0;i--)if(s.removing.includes(s.animations[i]))s.animations.splice(i,1);s.removing.length=0;finished(s,services);
}
