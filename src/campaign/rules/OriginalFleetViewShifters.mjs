/** Native ColorShifter/ValueShifter: ordered sources and delayed recomputation. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalFader,fadeOriginalFader,advanceOriginalFader,originalFaderIsOut,validateOriginalFader} from './OriginalFader.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'INVALID_NATIVE_VIEW_SHIFTER',m),num=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite shifter input required');return f(n);};
const color=c=>{check(Array.isArray(c)&&c.length===4&&c.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual RGBA required');return c;};
export function createOriginalViewShifter(base){const kind=Array.isArray(base)?'color':'value';base=kind==='color'?color(base):num(base);return {scope:'native-view-shifter',kind,base,curr:base,...(kind==='value'?{averageShift:0}:{}),data:[]};}
export function setOriginalViewShifterBase(s,base){s.base=s.kind==='color'?color(base):num(base);}
export function shiftOriginalViewShifter(s,source,to,durationIn,durationOut,amount){
 const at=s.data.findIndex(row=>row.source===source);if(s.kind==='color'&&to===null){if(at>=0)s.data.splice(at,1);return;}
 to=s.kind==='color'?color(to):num(to);durationIn=num(durationIn);durationOut=num(durationOut);amount=num(amount);
 let row=s.data[at];if(!row){row={source,to,shift:amount,fader:createOriginalFader(0,durationIn,durationOut,false,true)};s.data.push(row);}
 row.to=to;row.shift=amount;row.fader.durationIn=durationIn;row.fader.durationOut=durationOut;fadeOriginalFader(row.fader,'IN');
}
export function originalViewColorForBase(s,base){
 color(base);let total=0;for(const row of s.data)total=f(total+row.fader.currBrightness);if(total<=0)return base;
 const values=base.map(f);for(const row of s.data){const brightness=row.fader.currBrightness,den=f(f(total-brightness)+1);for(let i=0;i<4;i++)values[i]=f(values[i]+f(f(f(f(row.to[i]-base[i])*row.shift)*brightness)/den));}
 return values.map(n=>Math.trunc(Math.max(0,Math.min(255,n))));
}
export function advanceOriginalViewShifter(s,seconds){
 seconds=num(seconds);for(let i=0;i<s.data.length;){const row=s.data[i];advanceOriginalFader(row.fader,seconds);if(originalFaderIsOut(row.fader))s.data.splice(i,1);else i++;}
 if(s.data.length===0){s.curr=s.base;if(s.kind==='value')s.averageShift=0;return;}
 if(s.kind==='color'){s.curr=originalViewColorForBase(s,s.base);return;}
 let total=0;for(const row of s.data)total=f(total+row.fader.currBrightness);s.averageShift=f(total/s.data.length);if(total<=0){s.curr=s.base;return;}
 let curr=s.base;for(const row of s.data){const b=row.fader.currBrightness;curr=f(curr+f(f(f(f(row.to-s.base)*row.shift)*b)/f(f(total-b)+1)));}s.curr=curr;
}
export function validateOriginalViewShifter(s){check(s?.scope==='native-view-shifter'&&['color','value'].includes(s.kind)&&Array.isArray(s.data),'Actual shifter state required');const value=s.kind==='color'?color:num;value(s.base);value(s.curr);const sources=new Set();for(const row of s.data){check(!sources.has(row.source),'Duplicate shifter source');sources.add(row.source);value(row.to);num(row.shift);validateOriginalFader(row.fader);}if(s.kind==='value')num(s.averageShift);return s;}
