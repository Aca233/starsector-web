/** Native write journal. Production builds notify at mutation sites; no getters,
 * Proxies or changed simulation object layouts. Uninstrumented diagnostic builds
 * retain a conservative shallow audit instead of silently trusting missing hooks. */
import {rememberComponentRecord} from './ComponentWireMetadata';
import {ArmorGrid} from '../engine/simulation/ArmorGrid';
import {observeComponentWrites,hasComponentMutationInstrumentation} from './ComponentMutation.mjs';
type Entry={version:number;value:any;children:Set<Node>;refs:Set<any>;changed?:Set<string>|null};
type Node={source:object;version:number;invalidatedAt:number;auditedAt:number;liveAt:number;active:boolean;
 structural:boolean;volatile:boolean;referenceOnly:boolean;armor:boolean;arrayLength:number;
 keys:string[];indices:Map<string,number>;values:unknown[];pending:Set<PropertyKey>;changing:Set<string>;
 parents:Set<Node>;entries:Map<string,Entry>;children:Set<Node>;armorRevision?:number|null;
 listener:{changed(key?:PropertyKey):void};unsubscribe:()=>void};
type Scope={children:Set<Node>;refs:Set<any>;volatile?:boolean};
const NO_CHANGED_FIELDS:ReadonlySet<string>=new Set<string>();
export class MutationJournal {
 private readonly nodes=new WeakMap<object,Node>();
 private readonly active=new Set<Node>();private readonly queued=new Set<Node>();private readonly polled=new Set<Node>();
 private roots=new Set<Node>();private previousRoots=new Set<Node>();private readonly stack:Scope[]=[];
 // Only detached, empty scratch buffers enter this pool; active scopes and
 // published entry/node dependency sets must never be cleared in place.
 private readonly scopePool:Scope[]=[];
 private readonly propagation:Node[]=[];private instrumented=false;private epoch=0;private sweep=0;private topology=0;private finishedTopology=-1;
 readonly stats={writes:0,audits:0,builds:0,reuses:0,retired:0};
 constructor(private readonly omit:(source:object,key:string)=>boolean=()=>false,private readonly referenceLeaf:(source:object)=>boolean=()=>false){}
 private changes(node:Node,keys:string|readonly string[]|null):void{
  if(keys!==null&&typeof keys!=='string'&&!keys.length)return;
  for(const entry of node.entries.values()){
   if(keys===null){entry.changed=null;continue;}
   if(entry.changed===null)continue;
   const changed=entry.changed??(entry.changed=new Set());
   if(typeof keys==='string')changed.add(keys);else for(const key of keys)changed.add(key);
  }
 }
 private invalidate(node:Node,keys:string|readonly string[]|null=null):void{
  this.changes(node,this.instrumented&&!node.armor?keys:null);
  if(node.invalidatedAt===this.epoch)return;
  node.invalidatedAt=this.epoch;node.version++;
  const pending=this.propagation;pending.push(node);
  while(pending.length){const n=pending.pop()!;
   for(const parent of n.parents){
    // Partial builders must revisit object/tag fields, even with an empty set:
    // this renews child dependencies and Ship discovery without reading stable
    // primitive fields. Only own-field changes need to be named here.
    if(!this.instrumented||parent.armor)this.changes(parent,null);
    if(parent.invalidatedAt===this.epoch)continue;
    parent.invalidatedAt=this.epoch;parent.version++;pending.push(parent);
   }
  }
 }
 private inspect(node:Node):void{
  const source=node.source as any;node.structural=false;node.volatile=ArrayBuffer.isView(source);
  node.arrayLength=Array.isArray(source)?source.length:-1;
  const keys:string[]=[],values:unknown[]=[],indices=new Map<string,number>();
  if(node.referenceOnly){
   // Ship references depend on the identifier, not on the whole simulated ship.
   // Inherited/accessor IDs cannot be proven stable by own-field write hooks.
   const descriptor=Object.getOwnPropertyDescriptor(source,'id');
   keys.push('id');indices.set('id',0);values.push(descriptor&&'value' in descriptor?descriptor.value:undefined);
   node.volatile=!descriptor||!('value' in descriptor);
  }else if(source instanceof Map){for(const [key,value] of source){values.push(key,value);}}
  else if(source instanceof Set){for(const value of source)values.push(value);}
  else if(!ArrayBuffer.isView(source))for(const key of Object.keys(source)){
   if(this.omit(source,key)||(node.armor&&key==='cells'))continue;
   const descriptor=Object.getOwnPropertyDescriptor(source,key)!;
   indices.set(key,keys.length);keys.push(key);values.push(descriptor.value);
   if(!('value' in descriptor)){node.volatile=true;node.changing.add(key);}
  }
  node.keys=keys;node.values=values;node.indices=indices;
  if(node.volatile||node.armor)this.polled.add(node);else this.polled.delete(node);
 }
 private audit(node:Node,conservative=false):void{
  if(node.auditedAt===this.epoch)return;node.auditedAt=this.epoch;this.stats.audits++;
  const source=node.source as any;
  if(conservative||node.structural){
   const keys=node.keys,values=node.values,indices=node.indices,length=node.arrayLength,volatile=node.volatile;this.inspect(node);
   let structural=volatile!==node.volatile||length!==node.arrayLength||keys.length!==node.keys.length;
   let changed=structural||values.length!==node.values.length;const changedKeys:string[]=[];
   for(let i=0;i<node.keys.length;i++){
    const key=node.keys[i],previous=indices.get(key);
    if(key!==keys[i]){changed=true;structural=true;}
    if(previous===undefined||!Object.is(node.values[i],values[previous])){node.changing.add(key);changedKeys.push(key);changed=true;
     if(typeof node.values[i]==='function'||typeof values[previous!]==='function')structural=true;
    }
   }
   // Maps/Sets have ordered values, but no enumerable field keys.
   if(!node.keys.length)for(let i=0;i<node.values.length;i++)if(!Object.is(node.values[i],values[i])){changed=true;break;}
   if(changed)this.invalidate(node,conservative||structural||!node.keys.length?null:changedKeys);
  }else for(const key of node.pending){
   const index=typeof key==='string'?node.indices.get(key):undefined;
   if(index===undefined){node.structural=true;node.auditedAt=-1;this.audit(node);return;}
   // Accessors are polled separately; do not introduce another getter invocation.
   const descriptor=Object.getOwnPropertyDescriptor(source,key);
   if(!descriptor||!('value' in descriptor)||!descriptor.enumerable&&!node.referenceOnly){
    node.structural=true;node.auditedAt=-1;this.audit(node);return;
   }
   const value=descriptor.value,previous=node.values[index];
   if(!Object.is(value,previous)){
    node.values[index]=value;node.changing.add(String(key));
    this.invalidate(node,typeof value==='function'||typeof previous==='function'?null:String(key));
   }
  }
  node.pending.clear();
  if(node.volatile)this.invalidate(node);
  if(node.armor){const revision=source.cellMutationRevision;if(revision===null||node.armorRevision!==revision){node.armorRevision=revision;this.invalidate(node);}}
 }
 private node(source:object,referenceOnly=false):Node{
  let node=this.nodes.get(source);
  if(!node){
   node={source,version:0,invalidatedAt:-1,auditedAt:-1,liveAt:0,active:false,structural:true,volatile:false,referenceOnly,
    armor:source instanceof ArmorGrid,arrayLength:-1,keys:[],indices:new Map(),values:[],pending:new Set(),changing:new Set(),
    parents:new Set(),entries:new Map(),children:new Set(),listener:{changed(){}},unsubscribe(){}};
   this.nodes.set(source,node);const owned=node;
   node.listener={changed:(key)=>{
    this.stats.writes++;
    if(key!==undefined){
     if(typeof key==='symbol')return;
     if(typeof key!=='string')key=String(key);
     if(owned.referenceOnly?key!=='id':this.omit(source,key)||(owned.armor&&key==='cells'))return;
     if(!owned.structural)owned.pending.add(key);
    }else{owned.structural=true;owned.pending.clear();}
    this.queued.add(owned);
   }};
  }else if(node.referenceOnly&&!referenceOnly){node.referenceOnly=false;this.inspect(node);this.invalidate(node);}
  if(!node.active){
   node.unsubscribe=observeComponentWrites(source,node.listener);this.inspect(node);
   if(node.armor)node.armorRevision=(source as ArmorGrid).cellMutationRevision;
   this.invalidate(node);node.active=true;this.active.add(node);this.topology++;
  }
  return node;
 }
 begin():void{
  this.epoch++;this.instrumented=hasComponentMutationInstrumentation();const roots=this.previousRoots;this.previousRoots=this.roots;this.roots=roots;roots.clear();
  if(!this.instrumented)for(const node of this.active)this.audit(node,true);
  else{
   for(const node of this.queued)this.audit(node);
   // Typed arrays/accessors and armor's private revision/escaped alias are the
   // only sources that require polling without a public-field write notification.
   for(const node of this.polled)this.audit(node);
  }
  this.queued.clear();
 }
 record(source:object,wire:object,keys:readonly string[]):void{const node=this.node(source);rememberComponentRecord(wire,source,keys,node.changing);}
 cycle():void{for(const scope of this.stack)scope.volatile=true;}
 reference(value:any):void{
  const scope=this.stack[this.stack.length-1];if(!scope)return;
  scope.refs.add(value);scope.children.add(this.node(value,true));
 }
 /** changed names only this source's own changed fields since this entry was
  * built. Child-only invalidation may supply an empty set: partial builders MUST
  * still visit object/tag fields to renew dependencies and reference discovery.
  * null means full rebuild (shape, armor, volatile, cycle or unaudited build). */
 memo<T>(source:object,key:string,refs:Map<string,any>,build:(previous:T|undefined,changed:ReadonlySet<string>|null)=>T):T{
  const node=this.node(source),parent=this.stack[this.stack.length-1];if(parent)parent.children.add(node);else this.roots.add(node);
  let entry=node.entries.get(key);
  if(entry&&entry.version===node.version)this.stats.reuses++;
  else{
   const scope=this.scopePool.pop()??{children:new Set<Node>(),refs:new Set<any>(),volatile:false};scope.volatile=false;
   this.stack.push(scope);let value:T;
   try{
    try{value=build(entry?.value,entry&&entry.version>=0?(entry.changed===null?null:entry.changed??NO_CHANGED_FIELDS):null);}finally{this.stack.pop();}
    freezeWire(value);
   }catch(error){
    // A failed build/freeze has not published any of these dependencies. Keep
    // the previous entry and its links intact, and discard partial discoveries.
    scope.children.clear();scope.refs.clear();this.scopePool.push(scope);throw error;
   }
   const oldChildren=entry?.children,oldRefs=entry?.refs;
   if(entry){
    entry.version=scope.volatile?-1:node.version;entry.value=value;
    entry.children=scope.children;entry.refs=scope.refs;entry.changed=undefined;
   }else{entry={version:scope.volatile?-1:node.version,value,children:scope.children,refs:scope.refs};node.entries.set(key,entry);}
   this.stats.builds++;
   if(node.entries.size===1)this.link(node,entry.children);
   else{const children=new Set<Node>();for(const e of node.entries.values())for(const child of e.children)children.add(child);this.link(node,children);}
   if(oldChildren){
    // The link diff above still saw the OLD set. Only now is it safe to rotate
    // the replaced entry's sets into scratch storage, even for unchanged links.
    scope.children=oldChildren;scope.refs=oldRefs!;
    scope.children.clear();scope.refs.clear();this.scopePool.push(scope);
   }
  }
  if(entry.version<0&&parent)parent.volatile=true;
  for(const ref of entry.refs){refs.set(ref.id,ref);if(parent)parent.refs.add(ref);}return entry.value;
 }
 private link(node:Node,children:Set<Node>):void{
  let changed=false;
  for(const child of node.children)if(!children.has(child)){child.parents.delete(node);changed=true;}
  for(const child of children)if(!node.children.has(child)){child.parents.add(node);changed=true;}
  // Equal membership still needs the new backing set: the replaced entry's
  // old set is about to be cleared and reused by another build.
  node.children=children;if(changed)this.topology++;
 }
 watch(source:object,seen=new Set<object>()):number{
  const node=this.node(source);if(seen.has(source))return node.version;seen.add(source);const children=new Set<Node>();
  const visit=(value:any)=>{if(value&&typeof value==='object'){
   if(this.referenceLeaf(value))children.add(this.node(value,true));
   else{this.watch(value,seen);children.add(this.node(value));}
  }};
  if(source instanceof Map)for(const [key,value] of source){visit(key);visit(value);}
  else if(source instanceof Set)for(const value of source)visit(value);
  else if(!ArrayBuffer.isView(source))for(const key of Object.keys(source))if(!this.omit(source,key)&&!(node.armor&&key==='cells'))visit((source as any)[key]);
  this.link(node,children);this.inspect(node);node.pending.clear();this.queued.delete(node);this.roots.add(node);return node.version;
 }
 revision(source:object):number{const node=this.node(source);this.roots.add(node);return node.version;}
 finish():void{
  if(this.finishedTopology===this.topology&&this.roots.size===this.previousRoots.size){
   let same=true;for(const root of this.roots)if(!this.previousRoots.has(root)){same=false;break;}if(same)return;
  }
  const sweep=++this.sweep,pending=this.propagation;for(const root of this.roots)pending.push(root);
  while(pending.length){const node=pending.pop()!;if(node.liveAt===sweep)continue;node.liveAt=sweep;for(const child of node.children)pending.push(child);}
  for(const node of this.active)if(node.liveAt!==sweep){
   node.active=false;this.active.delete(node);this.queued.delete(node);this.polled.delete(node);node.unsubscribe();
   for(const child of node.children)child.parents.delete(node);
   node.parents.clear();node.children.clear();node.entries.clear();node.pending.clear();
   node.keys=[];node.values=[];node.indices.clear();this.stats.retired++;this.topology++;
  }
  this.finishedTopology=this.topology;
 }
}
// Only skip graphs frozen by us, not arbitrary shallow-frozen caller objects.
// Mark before descending to terminate cycles; old memo children cost one lookup.
const frozenWires=new WeakSet<object>();
function freezeWire(value:any):void{
 if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||frozenWires.has(value))return;
 frozenWires.add(value);
 // Enumerate own keys even on arrays: sparse/custom wire arrays may carry
 // enumerable non-index children, which must remain immutable too.
 for(const key of Object.keys(value))freezeWire(value[key]);
 Object.freeze(value);
}
