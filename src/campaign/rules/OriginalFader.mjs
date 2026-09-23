/** com.fs.graphics.util.Fader: delayed endpoint transition, not a continuous triangle wave. */
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'INVALID_NATIVE_FADER',m);
const number=n=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native float required');return f(n);};
export function createOriginalFader(brightness,durationIn,durationOut=durationIn,bounceUp=false,bounceDown=false){
 check(typeof bounceUp==='boolean'&&typeof bounceDown==='boolean','Actual bounce flags required');
 return {currBrightness:number(brightness),durationIn:number(durationIn),durationOut:number(durationOut),state:'IDLE',bounceUp,bounceDown};
}
export function forceOriginalFader(s,direction){check(direction==='IN'||direction==='OUT','Invalid fade direction');s.currBrightness=direction==='IN'?1:0;s.state=direction==='IN'?(s.bounceDown?'OUT':'IDLE'):(s.bounceUp?'IN':'IDLE');return s;}
export function fadeOriginalFader(s,direction){check(direction==='IN'||direction==='OUT','Invalid fade direction');if((direction==='IN'?s.durationIn:s.durationOut)<=0)return forceOriginalFader(s,direction);s.state=direction;return s;}
export function advanceOriginalFader(s,seconds){
 const dt=number(seconds);if(s.state==='IDLE')return s;
 if(s.state==='IN'){
  if(s.currBrightness===1){s.state=s.bounceDown?'OUT':'IDLE';return s;}
  s.currBrightness=f(s.currBrightness+f(dt/s.durationIn));if(s.currBrightness>1)s.currBrightness=1;
 }else if(s.state==='OUT'){
  if(s.currBrightness===0){s.state=s.bounceUp?'IN':'IDLE';return s;}
  s.currBrightness=f(s.currBrightness-f(dt/s.durationOut));if(s.currBrightness<0)s.currBrightness=0;
 }else check(false,'Invalid fade state');return s;
}
export const originalFaderIsOut=s=>s.currBrightness===0&&(s.state==='IDLE'||s.state==='OUT');
export const originalFaderIsIn=s=>s.currBrightness===1&&s.state==='IDLE';
export function validateOriginalFader(s){check(s&&['IDLE','IN','OUT'].includes(s.state)&&typeof s.bounceUp==='boolean'&&typeof s.bounceDown==='boolean','Invalid native Fader');for(const key of ['currBrightness','durationIn','durationOut'])check(number(s[key])===s[key],'Non-native Fader float');return s;}
