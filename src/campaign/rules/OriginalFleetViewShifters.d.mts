import type {OriginalFader} from './OriginalFader.mjs';
export type ViewRGBA=[number,number,number,number];
export interface OriginalViewShifter<T=number|ViewRGBA> {scope:'native-view-shifter';kind:'value'|'color';base:T;curr:T;averageShift?:number;data:{source:unknown;to:T;shift:number;fader:OriginalFader}[]}
export function createOriginalViewShifter<T extends number|ViewRGBA>(base:T):OriginalViewShifter<T>;
export function setOriginalViewShifterBase<T extends number|ViewRGBA>(state:OriginalViewShifter<T>,base:T):void;
export function shiftOriginalViewShifter<T extends number|ViewRGBA>(state:OriginalViewShifter<T>,source:unknown,to:T|null,durationIn:number,durationOut:number,amount:number):void;
export function originalViewColorForBase(state:OriginalViewShifter<ViewRGBA>,base:ViewRGBA):ViewRGBA;
export function advanceOriginalViewShifter(state:OriginalViewShifter,seconds:number):void;
export function validateOriginalViewShifter<T extends OriginalViewShifter>(state:T):T;
