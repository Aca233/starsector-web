export function enableComponentMutations():void;
export function hasComponentMutationInstrumentation():boolean;
export function markComponentWrite<T>(value:T,key?:PropertyKey):T;
export function observeComponentWrites(value:object,listener:{changed(key?:PropertyKey):void}):()=>void;
export function componentMutationVersion(value:object):{readonly version:number};
