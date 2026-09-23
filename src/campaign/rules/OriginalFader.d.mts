export interface OriginalFader {currBrightness:number;durationIn:number;durationOut:number;state:'IDLE'|'IN'|'OUT';bounceUp:boolean;bounceDown:boolean}
export function createOriginalFader(brightness:number,durationIn:number,durationOut?:number,bounceUp?:boolean,bounceDown?:boolean):OriginalFader;
export function forceOriginalFader<T extends OriginalFader>(state:T,direction:'IN'|'OUT'):T;
export function fadeOriginalFader<T extends OriginalFader>(state:T,direction:'IN'|'OUT'):T;
export function advanceOriginalFader<T extends OriginalFader>(state:T,seconds:number):T;
export function originalFaderIsOut(state:OriginalFader):boolean;
export function originalFaderIsIn(state:OriginalFader):boolean;
export function validateOriginalFader<T extends OriginalFader>(state:T):T;
