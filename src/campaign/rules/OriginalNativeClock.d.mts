import type {DeepReadonly} from '../Types.js';
import type {OriginalCalendarDate} from './OriginalCalendar.mjs';
export interface OriginalJavaZone {scope:'expanded-java-timezone';id:string;minTimestamp:number;maxTimestamp:number;initialOffset:number;transitions:{at:number;offset:number}[]}
export interface OriginalNativeClockState {schemaVersion:1;timestamp:number;secondsPerDay:number;zone:OriginalJavaZone}
export function originalJavaZoneOffset(zone:DeepReadonly<OriginalJavaZone>,timestamp:number):number;
export function restoreOriginalNativeClock(value:unknown):DeepReadonly<OriginalNativeClockState>;
export class OriginalNativeClock {
 constructor(state:DeepReadonly<OriginalNativeClockState>);
 snapshot():DeepReadonly<OriginalNativeClockState>;
 date():OriginalCalendarDate;
 calendarFrame(amountSeconds:number):DeepReadonly<{amountDays:number;month:number;day:number;daysInMonth:number}>;
 convertToDays(seconds:number):number;convertToSeconds(days:number):number;convertToMonths(seconds:number):number;elapsedDaysSince(timestamp:number):number;
 advance(amountSeconds:number):DeepReadonly<{amountSeconds:number;amountDays:number;civilSeconds:number;date:OriginalCalendarDate;timestamp:number}>;
}
