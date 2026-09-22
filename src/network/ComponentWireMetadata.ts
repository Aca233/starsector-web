export interface ComponentRecordOwner { source:object; keys:readonly string[]; changing:Set<string> }
const owners=new WeakMap<object,ComponentRecordOwner>();
export function rememberComponentRecord(wire:object,source:object,keys:readonly string[],changing:Set<string>):void{
 const owner={source,keys,changing};owners.set(wire,owner);
 if('$record' in wire&&Array.isArray((wire as any).values))owners.set((wire as any).values,owner);
}
export function componentRecordOwner(wire:any):ComponentRecordOwner|undefined{return owners.get(wire)??(wire?.values&&owners.get(wire.values));}
