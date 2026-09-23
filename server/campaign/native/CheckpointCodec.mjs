/** Private identity-graph transaction format, NOT a network message or a native save-game codec. */
import { immutableJSON, isRecord, requireThat } from '../../../src/campaign/core/Values.mjs';
const check=(ok,message)=>requireThat(ok,'INVALID_OFFLINE_CHECKPOINT',message);
// This is an entire offline world graph; each market/context still uses the ordinary JSON guard.
const MAX_BYTES=64*1024*1024,MAX_OBJECTS=1000000;
const safeKey=key=>typeof key==='string'&&!['__proto__','prototype','constructor'].includes(key);
function validateLinks(records,root,allowCycles=false){
 const refs=records.map(()=>[]);
 const edge=(value,list)=>{
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return;
  check(isRecord(value)&&Object.keys(value).length===1,'Invalid graph edge');
  if(Object.hasOwn(value,'negativeZero')){check(value.negativeZero===true,'Invalid signed zero');return;}
  check(Number.isSafeInteger(value.ref)&&value.ref>=0&&value.ref<records.length,'Dangling graph reference');list.push(value.ref);
 };
 for(const [i,record]of records.entries()){
  check(isRecord(record),'Invalid graph record');
  if(record.kind==='array'){
   check(Object.keys(record).length===2&&Array.isArray(record.items),'Invalid graph array');
   for(const value of record.items)edge(value,refs[i]);
  }else{
   check(record.kind==='object'&&Object.keys(record).length===2&&Array.isArray(record.entries),'Invalid graph object');const keys=new Set();
   for(const row of record.entries){
    check(Array.isArray(row)&&row.length===2&&safeKey(row[0])&&!keys.has(row[0]),'Unsafe or duplicate graph key');keys.add(row[0]);edge(row[1],refs[i]);
   }
  }
 }
 const roots=[];edge(root,roots);check(roots.length===1,'Checkpoint requires an object root');
 // v2 world graphs have genuine owner/location cycles. Validate reachability and
 // bounded shortest reference distance iteratively, rather than recursing through owners.
 if(allowCycles){const seen=new Set(roots),queue=roots.map(id=>[id,0]);for(let at=0;at<queue.length;at++){const [id,depth]=queue[at];check(depth<=48,'Too-deep checkpoint');for(const child of refs[id])if(!seen.has(child)){seen.add(child);queue.push([child,depth+1]);}}check(seen.size===records.length,'Unreachable checkpoint objects');return;}
 const visiting=new Set(),heights=new Map();
 const height=(id,depth)=>{
  check(depth<=48&&!visiting.has(id),'Cyclic or too-deep checkpoint');
  if(heights.has(id))return heights.get(id);
  visiting.add(id);let h=0;for(const child of refs[id])h=Math.max(h,1+height(child,depth+1));
  visiting.delete(id);heights.set(id,h);return h;
 };
 check(height(roots[0],0)<=48&&heights.size===records.length,'Unreachable or too-deep checkpoint objects');
}
function frame(records,root,allowCycles=false){return {scope:'web-offline-identity-graph',schemaVersion:allowCycles?2:1,root,records};}
export function encodeOfflineCheckpoint(value,{allowCycles=false}={}){
 check(typeof allowCycles==='boolean','Invalid checkpoint cycle option');
 const seen=new Map(),pending=[],records=[];
 const edge=value=>{
  if(value===null||['boolean','string','number'].includes(typeof value))return Object.is(value,-0)?{negativeZero:true}:value;
  check(Array.isArray(value)||isRecord(value),'Only plain state objects can be checkpointed');
  if(!seen.has(value)){check(pending.length<MAX_OBJECTS,'Offline checkpoint object limit');seen.set(value,pending.length);pending.push(value);}
  return {ref:seen.get(value)};
 };
 const root=edge(value);let bytes=Buffer.byteLength(JSON.stringify(frame([],root)));
 for(let i=0;i<pending.length;i++){
  const value=pending[i],keys=Reflect.ownKeys(value);
  check(keys.every(key=>typeof key==='string'),'Symbol state cannot be checkpointed');
  if(Array.isArray(value))check(keys.length===value.length+1,'Sparse or decorated arrays cannot be checkpointed');
  const read=key=>{const d=Object.getOwnPropertyDescriptor(value,key);check(d&&Object.hasOwn(d,'value')&&d.enumerable,'Accessors or hidden fields are not checkpoint state');return edge(d.value);};
  const record=immutableJSON(Array.isArray(value)?{kind:'array',items:Array.from({length:value.length},(_,n)=>read(String(n)))}
   :{kind:'object',entries:keys.map(key=>{check(safeKey(key),'Unsafe checkpoint key');return [key,read(key)];})});
  bytes+=Buffer.byteLength(JSON.stringify(record))+(i?1:0);check(bytes<=MAX_BYTES,'Offline checkpoint exceeds 64MiB');records.push(record);
 }
 validateLinks(records,root,allowCycles);return Object.freeze({...frame(Object.freeze(records),Object.freeze(root),allowCycles)});
}
export function decodeOfflineCheckpoint(checkpoint){
 check(isRecord(checkpoint)&&checkpoint.scope==='web-offline-identity-graph'&&[1,2].includes(checkpoint.schemaVersion)&&Object.keys(checkpoint).length===4,'Unsupported offline checkpoint');
 check(Array.isArray(checkpoint.records)&&checkpoint.records.length<=MAX_OBJECTS,'Offline checkpoint object limit');
 const root=immutableJSON(checkpoint.root),records=[];let bytes=Buffer.byteLength(JSON.stringify(frame([],root)));
 for(const value of checkpoint.records){
  const record=immutableJSON(value);bytes+=Buffer.byteLength(JSON.stringify(record))+(records.length?1:0);
  check(bytes<=MAX_BYTES,'Offline checkpoint exceeds 64MiB');records.push(record);
 }
 validateLinks(records,root,checkpoint.schemaVersion===2);
 const objects=records.map(r=>r.kind==='array'?[]:{});
 const edge=value=>isRecord(value)?Object.hasOwn(value,'ref')?objects[value.ref]:-0:value;
 for(const [i,record]of records.entries()){
  const target=objects[i];if(record.kind==='array')for(const value of record.items)target.push(edge(value));
  else for(const [key,value]of record.entries)target[key]=edge(value);
 }
 return edge(root);
}
