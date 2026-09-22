import {componentMutationVersion,hasComponentMutationInstrumentation} from './ComponentMutation.mjs';
import {componentRecordOwner} from './ComponentWireMetadata';
import {ArmorGrid} from '../engine/simulation/ArmorGrid';
import {MutationJournal} from './MutationJournal';
import {PackedSnapshotNumbers} from './PackedSnapshotNumbers.mjs';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from './BinarySnapshot.mjs';
import type {CombatSnapshot} from './CombatSnapshot';

type Capsule=Readonly<{$component:1;value:PackedSnapshotNumbers}>;
type DefinitionRef=readonly [number,Capsule];
const MAX_COMPONENT_BYTES=512*1024;
const payloads=new WeakMap<object,Capsule>();
const sealed=new WeakMap<object,any>();
const sealedRows=new WeakMap<object,Map<number,any>>();
const references=new WeakMap<object,readonly DefinitionRef[]>();
const decoded=new WeakMap<PackedSnapshotNumbers,any>();
const scalarBlocks=new WeakMap<object,PackedSnapshotNumbers>();
const counters={encoded:0,encodeReuses:0,decoded:0,decodeReuses:0,restored:0,restoreSkips:0};
/** Immutable SWF3 bodies use the existing bounded, reliable byte baseline. */
export function componentCapsule(value:any):Capsule {
 const previous=payloads.get(value);if(previous){counters.encodeReuses++;return previous;}
 const bytes=encodeProjectedBinaryFrame(value as CombatSnapshot,true);
 if(!bytes||bytes.length>MAX_COMPONENT_BYTES)return value;
 const result=Object.freeze({$component:1 as const,value:PackedSnapshotNumbers.capture(bytes)!});
 payloads.set(value,result);counters.encoded++;return result;
}
export function componentBlock(value:any):PackedSnapshotNumbers {
 const version=value?.$component;
 if((version!==1&&version!==2)||Object.keys(value).length!==(version===1?2:3)
   ||(version===2&&(!Number.isSafeInteger(value.definition)||value.definition<1)))throw Error('Invalid component envelope');
 let block=value.value;
 if(Array.isArray(block)){
  const raw=block;block=scalarBlocks.get(raw);
  if(!block){if(raw.length<4||raw.length>MAX_COMPONENT_BYTES||raw.some((n:any)=>!Number.isInteger(n)||n<0||n>255))throw Error('Invalid scalar component');
   block=PackedSnapshotNumbers.capture(new Uint8Array(raw))!;scalarBlocks.set(raw,block);}
 }
 if(!(block instanceof PackedSnapshotNumbers)||block.type!=='Uint8Array'||block.length<4||block.length>MAX_COMPONENT_BYTES)throw Error('Invalid component envelope');
 return block;
}
function sameBlock(a:PackedSnapshotNumbers,b:PackedSnapshotNumbers):boolean{return a===b||a.byteLength===b.byteLength&&a.matchesBytes(b.bytes);}
export function decodeComponent(value:any):any {
 const block=componentBlock(value),prior=decoded.get(block);if(prior){counters.decodeReuses++;return prior;}
 const data=decodeBinaryFrame(block.numbers as Uint8Array);
 if(!data||typeof data!=='object')throw Error('Invalid component body');
 const pending=[data];let count=0;
 while(pending.length){const item=pending.pop();if(++count>65536)throw Error('Component node budget');
  if(item instanceof PackedSnapshotNumbers)continue;
  if(item&&typeof item==='object'){
   if(Object.hasOwn(item,'$component')||Object.hasOwn(item,'$projectileColumns'))throw Error('Nonlocal component body');
   for(const child of Object.values(item))if(child&&typeof child==='object')pending.push(child);
   Object.freeze(item);
  }
 }
 decoded.set(block,data);counters.decoded++;return data;
}
function definitionBlock(wire:any,defs:Record<string,any>):PackedSnapshotNumbers|undefined {
 if(wire.$component===1)return undefined;
 defs=componentDefinitions(defs);const def=Object.hasOwn(defs,wire.definition)?defs[wire.definition]:undefined;
 if(def?.$component!==1)throw Error('Missing component definition');return componentBlock(def);
}
const definitionTables=new WeakMap<object,Record<string,any>>();
export function componentDefinitions(wire:any):Record<string,any>{
 if(wire?.$component!==1)return wire??{};
 const block=componentBlock(wire);let table=definitionTables.get(block);if(table)return table;
 const data=decodeComponent(wire);if(Array.isArray(data))throw Error('Invalid component definitions');
 table={};for(const [key,value] of Object.entries(data)){if(!Number.isSafeInteger(Number(key))||Number(key)<1)throw Error('Invalid component definition id');const envelope={$component:1,value};componentBlock(envelope);table[key]=envelope;}
 definitionTables.set(block,table);return table;
}
export function resolveComponent(wire:any,defs:Record<string,any>):any {
 defs=componentDefinitions(defs);
 if(wire.$component===3){const {definition,values}=recordComponent(wire,defs);const result=definition.fixed.slice();for(let i=0;i<definition.dynamic.length;i++)result[definition.dynamic[i]]=values[i];return {$record:definition.record,values:result};}
 const values=decodeComponent(wire);if(wire.$component===1)return values;
 definitionBlock(wire,defs);const def=decodeComponent(defs[wire.definition]);
 if(!Number.isInteger(def.record)||def.record<0||!Array.isArray(def.fixed)||!Array.isArray(def.dynamic)
  ||!Array.isArray(values)||values.length!==def.dynamic.length||Object.keys(def).length!==3)throw Error('Invalid component definition');
 const result=def.fixed.slice(),seen=new Set();
 for(let i=0;i<def.dynamic.length;i++){const index=def.dynamic[i];if(!Number.isInteger(index)||index<0||index>=result.length||seen.has(index))throw Error('Invalid component field');seen.add(index);result[index]=values[i];}
 return {$record:def.record,values:result};
}
const recordDefinitions=new WeakMap<object,any>();
function recordComponent(wire:any,defs:Record<string,any>):{definition:any;block:PackedSnapshotNumbers;values:any[]}{
 if(wire.$component!==3||Object.keys(wire).length!==2||!Array.isArray(wire.values)||!Number.isSafeInteger(wire.values[0])||wire.values[0]<1)throw Error('Invalid component record envelope');
 const id=wire.values[0],envelope=Object.hasOwn(defs,id)?defs[id]:undefined;if(envelope?.$component!==1)throw Error('Missing component definition');
 const block=componentBlock(envelope);let definition=recordDefinitions.get(block);
 if(!definition){definition=decodeComponent(envelope);
  if(!Number.isInteger(definition.record)||definition.record<0||!Array.isArray(definition.fixed)||!Array.isArray(definition.dynamic)||Object.keys(definition).length!==3)throw Error('Invalid component definition');
  const seen=new Set();for(const i of definition.dynamic){if(!Number.isInteger(i)||i<0||i>=definition.fixed.length||seen.has(i))throw Error('Invalid component field');seen.add(i);}
  recordDefinitions.set(block,definition);
 }
 if(wire.values.length!==definition.dynamic.length+1)throw Error('Invalid component values');
 return {definition,block,values:wire.values.slice(1)};
}
const TRANSPARENT=new Set(['pos','vel','prevPos','facingRad','prevFacingRad','sourceCarrier','moduleParent','teleportCameraOffset']);
export function sealShipComponents(state:any,capture?:ComponentCapture):any {
 const output:any={};
 for(const [key,value] of Object.entries(state))output[key]=value&&typeof value==='object'&&!TRANSPARENT.has(key)&&!['$ship','$vector','$undefined','$number'].some(tag=>Object.hasOwn(value,tag))?sealComponentTree(value,capture):value;
 return output;
}
function track(result:any,children:any[]):void {
 if(!result||typeof result!=='object')return;
 const defs=new Map<number,Capsule>(references.get(result));for(const child of children)if(child&&typeof child==='object')for(const [id,def] of references.get(child)??[])defs.set(id,def);
 if(defs.size)references.set(result,[...defs]);
}
/** Keep structured parents transparent; independently version leaf components. */
export function sealComponentTree(value:any,capture?:ComponentCapture):any {
 if(!value||typeof value!=='object')return value;
 const previous=sealed.get(value);if(previous){counters.encodeReuses++;capture?.claim(previous);return previous;}
 const structured=(v:any)=>v&&typeof v==='object'&&(!Object.keys(v).some(k=>k.startsWith('$'))||Object.hasOwn(v,'$record')||Object.hasOwn(v,'$records'));
 let result:any,children:any[]=[];
 if(Object.hasOwn(value,'$records')){
  result=value.values.map((row:any)=>{let variants=sealedRows.get(row);if(!variants){variants=new Map();sealedRows.set(row,variants);}let child=variants.get(value.$records);if(!child){child=sealComponentTree({$record:value.$records,values:row},capture);variants.set(value.$records,child);}capture?.claim(child);return child;});children=result;
 }else if(Object.hasOwn(value,'$record')){
  children=value.values.map((v:any)=>structured(v)?sealComponentTree(v,capture):v);result=capture?.record(value,children)??{$record:value.$record,values:children};
 }else if(Object.keys(value).some(k=>k.startsWith('$')))result=value;
 else if(Array.isArray(value)){result=value.map(v=>structured(v)?sealComponentTree(v,capture):v);children=result;}
 else{result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,structured(v)?sealComponentTree(v,capture):v]));children=Object.values(result);}
 Object.freeze(result);track(result,children);sealed.set(value,result);capture?.claim(result);return result;
}
type ScalarPlan={changeCount:number;record:number;keys:readonly string[];dynamic:number[];fixed:any[];id:number;definition:Capsule;values?:any[];wire?:any};
export class ComponentCapture {
 readonly journal:MutationJournal;
 private readonly definitionJournal=new MutationJournal();
 private readonly plans=new WeakMap<object,Map<number,ScalarPlan>>();
 private readonly sharedDefinitions=new Map<string,DefinitionRef>();
 private readonly used=new Map<number,Capsule>();private nextDefinition=0;private lastUsed=new Map<number,Capsule>();private lastFrame:any;
 begin():void{this.used.clear();this.journal.begin();this.definitionJournal.begin();}
 finish():void{this.journal.finish();this.definitionJournal.finish();}
 claim(wire:object):void{for(const [id,def] of references.get(wire)??[])this.used.set(id,def);}
 definitionFrame():Record<string,any>{
 if(this.lastFrame&&this.lastUsed.size===this.used.size&&[...this.used].every(([id,def])=>this.lastUsed.get(id)===def))return this.lastFrame;
 this.lastUsed=new Map(this.used);this.lastFrame=componentCapsule(Object.fromEntries([...this.used].map(([id,def])=>[id,def.value])));if(this.lastFrame.$component!==1)this.lastFrame=Object.fromEntries(this.used);return this.lastFrame;
 }
 record(wire:any,projected:any[]=wire.values):any {
  const owner=componentRecordOwner(wire);if(!owner)return componentCapsule(wire);
  let plans=this.plans.get(owner.source);if(!plans){plans=new Map();this.plans.set(owner.source,plans);}
  let plan=plans.get(wire.$record);
  if(!plan||plan.changeCount!==owner.changing.size){
   const dynamic:number[]=[],fixed=projected.map((v:any,i:number)=>{if(v&&typeof v==='object'||owner.changing.has(owner.keys[i])){dynamic.push(i);return null;}return v;});
   const definition=componentCapsule({record:wire.$record,fixed,dynamic});if(definition.$component!==1)return componentCapsule(wire);
   const signature=JSON.stringify({record:wire.$record,fixed,dynamic});let shared=this.sharedDefinitions.get(signature);
   if(!shared){shared=[++this.nextDefinition,definition];if(this.sharedDefinitions.size>=2048)this.sharedDefinitions.clear();this.sharedDefinitions.set(signature,shared);}
   plan={changeCount:owner.changing.size,record:wire.$record,keys:owner.keys,dynamic,fixed,id:shared[0],definition:shared[1]};plans.set(wire.$record,plan);
  }
  const values=plan.dynamic.map(i=>projected[i]);
  if(plan.values&&values.every((v,i)=>Object.is(v,plan!.values![i]))){counters.encodeReuses++;return plan.wire;}
  const result=Object.freeze({$component:3,values:Object.freeze([plan.id,...values])});references.set(result,[[plan.id,plan.definition]]);plan.values=values;plan.wire=result;return result;
 }
 private readonly generations=new WeakMap<object,number>();private nextGeneration=0;
 private readonly definitions=new WeakMap<object,{wire:object;signature:string;capsule:Capsule}>();
 constructor(omit:(source:object,key:string)=>boolean,referenceLeaf:(source:object)=>boolean){this.journal=new MutationJournal(omit,referenceLeaf);}
 generation(source:object):number{let g=this.generations.get(source);if(g===undefined){g=++this.nextGeneration;this.generations.set(source,g);}return g;}
 definition(source:object):{wire:object;signature:string;capsule:Capsule}{
  const refs=new Map();const clone=(v:any):any=>!v||typeof v!=='object'?v:this.definitionJournal.memo(v,'definition',refs,()=>Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])));
  const wire=clone(source),old=this.definitions.get(source);if(old?.wire===wire)return old;
  const result={wire,signature:JSON.stringify(wire),capsule:componentCapsule(wire)};this.definitions.set(source,result);return result;
 }
}
export class ComponentReceiver {
 private recordApplied=new WeakMap<object,{block:PackedSnapshotNumbers;values:any[];data:any;proof:Proof}>();
 private applied=new WeakMap<object,{block:PackedSnapshotNumbers;definition?:PackedSnapshotNumbers;proof:Proof;data:any}>();
 private readonly definitions=new Map<number,{block:PackedSnapshotNumbers;value:any}>();
 private epoch='';private keys:string[][]=[];private frameDefinitions:Record<string,any>={};
 private expanded=new WeakMap<PackedSnapshotNumbers,WeakMap<object,any>>();private readonly noDefinition={};
 constructor(_omit:(source:object,key:string)=>boolean,_referenceLeaf:(source:object)=>boolean){}
 begin(epoch:string,reset:boolean,keys:string[][]=[],defs:Record<string,any>={}):void{
  if(reset||epoch!==this.epoch){this.applied=new WeakMap();this.recordApplied=new WeakMap();this.expanded=new WeakMap();this.epoch=epoch;}this.keys=keys;this.frameDefinitions=componentDefinitions(defs);
 }
 definition(index:number,wire:any):any{
  if(!wire||!Object.hasOwn(wire,'$component'))return wire;
  const block=componentBlock(wire),old=this.definitions.get(index);if(old&&sameBlock(old.block,block))return old.value;
  const value=decodeComponent(wire);if(this.definitions.size>=512)this.definitions.clear();this.definitions.set(index,{block,value});return value;
 }
 restore(wire:any,target:any,restore:(data:any)=>any):any{
  if(wire.$component===3)return this.restoreRecord(wire,target,restore);
  const block=componentBlock(wire),definition=definitionBlock(wire,this.frameDefinitions),previous=target&&typeof target==='object'?this.applied.get(target):undefined;
  const equal=previous&&sameBlock(previous.block,block)&&(previous.definition===definition||previous.definition&&definition&&sameBlock(previous.definition,definition));
  const clean=previous&&validProof(previous.proof);
  if(equal&&clean){counters.restoreSkips++;return target;}
  let data=equal?previous.data:undefined;
  if(!data){let variants=this.expanded.get(block);if(!variants){variants=new WeakMap();this.expanded.set(block,variants);}data=variants.get(definition??this.noDefinition);
   if(!data){data=expandComponentRecords(resolveComponent(wire,this.frameDefinitions),this.keys);variants.set(definition??this.noDefinition,data);}}
  const patch=clean?changedFields(data,previous.data):data,result=patch===UNCHANGED?target:restore(patch);
  if(result&&typeof result==='object')this.applied.set(result,{block,definition,data,proof:componentProof(result,data)});counters.restored++;return result;
 }
 private restoreRecord(wire:any,target:any,restore:(data:any)=>any):any{
  const {definition,block,values}=recordComponent(wire,this.frameDefinitions),keys=this.keys[definition.record];
  if(!keys||keys.length!==definition.fixed.length)throw Error('Invalid component record');
  const previous=target&&typeof target==='object'?this.recordApplied.get(target):undefined;
  const clean=previous&&sameBlock(previous.block,block)&&validProof(previous.proof);
  let patch:any={};let changes=0;const data:any={};
  for(let i=0;i<values.length;i++)data[keys[definition.dynamic[i]]]=values[i];
  if(clean){
   for(let i=0;i<values.length;i++){const value=values[i];if(value&&typeof value==='object'||!Object.is(value,previous.values[i])){patch[keys[definition.dynamic[i]]]=value;changes++;}}
   if(!changes){counters.restoreSkips++;return target;}
  }else{const full=definition.fixed.slice();for(let i=0;i<values.length;i++)full[definition.dynamic[i]]=values[i];patch=Object.fromEntries(keys.map((key,i)=>[key,full[i]]));}
  const result=restore(patch);if(result&&typeof result==='object')this.recordApplied.set(result,{block,values,data,proof:componentProof(result,data)});counters.restored++;return result;
 }
 finish():void{}
}
export function componentReplicationDiagnostics(){return {...counters};}

const UNCHANGED=Symbol('unchanged component field');
/** Delta only against a known, locally-unmodified target. Tagged values and
 * array shape changes are atomic; ordinary component fields are sparse writes. */
function changedFields(next:any,previous:any):any {
  if(Object.is(next,previous))return UNCHANGED;
  if(next instanceof PackedSnapshotNumbers)return previous instanceof PackedSnapshotNumbers&&sameBlock(next,previous)?UNCHANGED:next;
  if(!next||!previous||typeof next!=='object'||typeof previous!=='object')return next;
  if(Array.isArray(next)){
    if(!Array.isArray(previous)||next.length!==previous.length)return next;
    return next.every((v,i)=>changedFields(v,previous[i])===UNCHANGED)?UNCHANGED:next;
  }
  if(Array.isArray(previous))return next;
  const keys=Object.keys(next);if(keys.some(k=>k.startsWith('$'))){
    return keys.length===Object.keys(previous).length&&keys.every(k=>Object.hasOwn(previous,k)&&changedFields(next[k],previous[k])===UNCHANGED)?UNCHANGED:next;
  }
  const result:any={};let changes=0;
  for(const key of keys){const field=Object.hasOwn(previous,key)?changedFields(next[key],previous[key]):next[key];if(field!==UNCHANGED){result[key]=field;changes++;}}
  return changes?result:UNCHANGED;
}

function expandComponentRecords(value:any,keys:string[][]):any {
 if(!value||typeof value!=='object'||value instanceof PackedSnapshotNumbers)return value;
 if(Array.isArray(value))return Object.freeze(value.map(v=>expandComponentRecords(v,keys)));
 const record=(id:any,values:any)=>{const names=Number.isInteger(id)&&id>=0?keys[id]:undefined;if(!names||!Array.isArray(values)||values.length!==names.length)throw Error('Invalid component record');
  return Object.freeze(Object.fromEntries(names.map((key,i)=>[key,expandComponentRecords(values[i],keys)])));};
 if(Object.hasOwn(value,'$record'))return record(value.$record,value.values);
 if(Object.hasOwn(value,'$records')){if(!Array.isArray(value.values))throw Error('Invalid component rows');return Object.freeze(value.values.map((v:any)=>record(value.$records,v)));}
 return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expandComponentRecords(v,keys)])));
}

type Proof={cells:Array<[{readonly version:number},number]>;armor:Array<[ArmorGrid,number|null]>;safe:boolean};
function componentProof(target:any,data:any,result:Proof={cells:[],armor:[],safe:hasComponentMutationInstrumentation()}):Proof {
 if(!target||typeof target!=='object'||!data||typeof data!=='object'||data.$ship)return result;
 if(ArrayBuffer.isView(target)){result.safe=false;return result;}
 const version=componentMutationVersion(target);result.cells.push([version,version.version]);
 if(target instanceof ArmorGrid)result.armor.push([target,target.cellMutationRevision]);
 if(data.$vector||data.$component)return result;
 if(data.$map&&target instanceof Map){const actual=[...target];for(let i=0;i<data.$map.length;i++){componentProof(actual[i]?.[0],data.$map[i][0],result);componentProof(actual[i]?.[1],data.$map[i][1],result);}return result;}
 if(data.$set&&target instanceof Set){const actual=[...target];for(let i=0;i<data.$set.length;i++)componentProof(actual[i],data.$set[i],result);return result;}
 for(const key of Object.keys(data)){if(target instanceof ArmorGrid&&key==='cells')continue;componentProof(target[key],data[key],result);}return result;
}
function validProof(proof:Proof):boolean{return proof.safe&&proof.cells.every(([cell,version])=>cell.version===version)&&proof.armor.every(([grid,revision])=>revision!==null&&grid.cellMutationRevision===revision);}
