/** CampaignClock's saved timestamp and per-call float/int advancement. Separate from the fixed-civil Web epoch policy. */
import { immutableJSON, finite, requireThat, isRecord } from '../core/Values.mjs';
import { originalCalendarDateFromUnixMilliseconds, originalDaysInMonth } from './OriginalCalendar.mjs';
const f=Math.fround;
const check=(ok,message)=>requireThat(ok,'INVALID_NATIVE_CLOCK',message);
const exact=(n,label)=>{check(Number.isSafeInteger(n),'Inexact '+label);return n;};
function amount(value){finite(value,'native clock amount',0,Number.MAX_VALUE);const n=f(value);check(Number.isFinite(n),'Native clock amount overflows float');return n;}
export function originalJavaZoneOffset(zone,timestamp){
 exact(timestamp,'timestamp');check(timestamp>=zone.minTimestamp&&timestamp<zone.maxTimestamp,'Timestamp outside captured Java zone range');
 let low=0,high=zone.transitions.length;
 while(low<high){const mid=(low+high)>>>1;if(zone.transitions[mid].at<=timestamp)low=mid+1;else high=mid;}
 return low===0?zone.initialOffset:zone.transitions[low-1].offset;
}
export function restoreOriginalNativeClock(value){
 const state=immutableJSON(value);
 check(state.schemaVersion===1&&Number.isSafeInteger(state.timestamp),'Unsupported native clock');
 finite(state.secondsPerDay,'seconds per native day',Number.MIN_VALUE,2**24);check(state.secondsPerDay===f(state.secondsPerDay),'Clock rate must preserve native float');
 const z=state.zone;check(isRecord(z)&&z.scope==='expanded-java-timezone'&&typeof z.id==='string'&&z.id.length>0&&z.id.length<=256,'Explicit native Java zone required');
 exact(z.minTimestamp,'zone minimum');exact(z.maxTimestamp,'zone maximum');check(z.minTimestamp<z.maxTimestamp,'Invalid zone range');
 const offset=n=>{exact(n,'zone offset');check(Math.abs(n)<=86400000,'Unsupported zone offset');};offset(z.initialOffset);
 check(Array.isArray(z.transitions)&&z.transitions.length<=32768,'Java zone transition budget');let previous=z.minTimestamp-1;
 for(const row of z.transitions){exact(row.at,'transition timestamp');check(row.at>previous&&row.at>=z.minTimestamp&&row.at<z.maxTimestamp,'Unordered/out-of-range Java zone transition');offset(row.offset);previous=row.at;}
 originalCalendarDateFromUnixMilliseconds(state.timestamp,originalJavaZoneOffset(z,state.timestamp));return state;
}
/** Mutable transaction-local clock; snapshots are immutable and retain the original milliseconds. */
export class OriginalNativeClock {
 #state;
 constructor(state){this.#state=restoreOriginalNativeClock(state);}
 snapshot(){return this.#state;}
 date(){return originalCalendarDateFromUnixMilliseconds(this.#state.timestamp,originalJavaZoneOffset(this.#state.zone,this.#state.timestamp));}
 calendarFrame(amountSeconds){const date=this.date();return immutableJSON({amountDays:this.convertToDays(amountSeconds),month:date.month,day:date.day,daysInMonth:originalDaysInMonth(date.cycle,date.month)});}
 convertToDays(seconds){return f(amount(seconds)/this.#state.secondsPerDay);}
 convertToSeconds(days){const result=f(amount(days)*this.#state.secondsPerDay);check(Number.isFinite(result),'Clock seconds overflow');return result;}
 convertToMonths(seconds){return f(this.convertToDays(seconds)/30);}
 elapsedDaysSince(timestamp){exact(timestamp,'previous timestamp');return timestamp===0?f(3.4028234663852886e38):f((this.#state.timestamp-timestamp)/86400000);}
 advance(amountSeconds){
  const seconds=amount(amountSeconds),days=f(seconds/this.#state.secondsPerDay);
  // Java float -> int truncates toward zero and saturates at INT_MAX. No discarded fraction is accumulated.
  const civilSeconds=Math.min(2147483647,Math.trunc(f(days*86400)));
  const timestamp=exact(this.#state.timestamp+civilSeconds*1000,'advanced timestamp');
  const date=originalCalendarDateFromUnixMilliseconds(timestamp,originalJavaZoneOffset(this.#state.zone,timestamp));
  this.#state=Object.freeze({...this.#state,timestamp});
  return immutableJSON({amountSeconds:seconds,amountDays:days,civilSeconds,date,timestamp});
 }
}
