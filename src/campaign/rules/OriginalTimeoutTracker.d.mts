export interface OriginalTimeoutTracker<T=object> {scope:'native-timeout-tracker';items:{item:T;remaining:number}[]}
export function createOriginalTimeoutTracker<T=object>():OriginalTimeoutTracker<T>;
export function validateOriginalTimeoutTracker<T>(state:OriginalTimeoutTracker<T>):OriginalTimeoutTracker<T>;
export function originalTimeoutContains<T>(state:OriginalTimeoutTracker<T>,item:T):boolean;
export function originalTimeoutItems<T>(state:OriginalTimeoutTracker<T>):T[];
export function originalTimeoutRemaining<T>(state:OriginalTimeoutTracker<T>,item:T):number;
export function setOriginalTimeout<T>(state:OriginalTimeoutTracker<T>,item:T,time:number):void;
export function addOriginalTimeout<T>(state:OriginalTimeoutTracker<T>,item:T,time:number,limit?:number):void;
export function removeOriginalTimeout<T>(state:OriginalTimeoutTracker<T>,item:T):void;
export function clearOriginalTimeoutTracker<T>(state:OriginalTimeoutTracker<T>):void;
export function advanceOriginalTimeoutTracker<T>(state:OriginalTimeoutTracker<T>,amount:number):void;
