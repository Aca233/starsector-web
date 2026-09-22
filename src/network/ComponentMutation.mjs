const records=new WeakMap();let compiled=false;
export function enableComponentMutations(){compiled=true;}
export function hasComponentMutationInstrumentation(){return compiled;}
function record(value){let result=records.get(value);if(!result){result={version:0,listeners:new Set()};records.set(value,result);}return result;}
export function componentMutationVersion(value){return record(value);}
/** Receiver is evaluated once. No getters/Proxies or simulated side effects.
 * WeakMap.get also accepts primitives (returning undefined), so unobserved
 * simulation writes need only one lookup and never allocate tracking state. */
export function markComponentWrite(value,key){
 const state=records.get(value);
 if(state){
  state.version++;
  if(state.listeners.size)for(const ref of state.listeners){const listener=ref.deref();if(listener)listener.changed(key);else state.listeners.delete(ref);}
 }
 return value;
}
export function observeComponentWrites(value,listener){const state=record(value),ref=new WeakRef(listener);state.listeners.add(ref);return()=>state.listeners.delete(ref);}
