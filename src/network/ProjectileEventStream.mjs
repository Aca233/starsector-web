import {referenceVisualColumns,diffVisualColumns,applyVisualColumnDiff,validateVisualColumns} from './ProjectileVisualColumns.mjs';
import { Encoder, Decoder } from '@msgpack/msgpack';
import { lanCrc32 } from './LanBinaryDelta.mjs';
/** SPE1: ordered, transactional projectile create/change/remove replication.
 * This module owns DECLARATIVE projection records, never live engine objects.
 * Prediction is an encoding reference only; every target field is corrected
 * exactly and the complete result is checked before a receiver commits it.
 */
export const PROJECTILE_STREAM_LIMITS = Object.freeze({packetBytes:2*1024*1024,stateBytes:4*1024*1024,entities:4096,templates:64,templateBytes:1024*1024,entityBytes:65536,fields:256,depth:32,nodes:262144,stringBytes:65536});
const L=PROJECTILE_STREAM_LIMITS, MAGIC=0x53504531, VISUAL_MAGIC=0x53565031, DT=1/60;
const denied=new Set(['__proto__','prototype','constructor']);
const safe=n=>Number.isSafeInteger(n)&&n>=0;
// Native projectiles use PRNG float64 identities, not integer counters. Preserve
// them exactly; dense per-base ordinals are only a transport representation.
const identity=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER&&!Object.is(n,-0);
const fail=(code='BAD_PACKET')=>{const error=new Error('Invalid projectile stream: '+code);error.code=code;throw error;};
const keys=o=>o&&typeof o==='object'&&!Array.isArray(o)?Object.keys(o):fail();
const epochOk=e=>typeof e==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(e);
const count=(a,max)=>{if(!Array.isArray(a)||a.length>max)fail('LIMIT');return a;};
// Pinned @msgpack/msgpack 3.1.3, as in BinarySnapshot. Its default integer path
// erases -0, which is not acceptable for this new exact-record contract.
class ExactEncoder extends Encoder {
 encodeNumber(n){if(Object.is(n,-0)){this.ensureBufferSizeToWrite(9);this.bytes[this.pos++]=0xcb;this.view.setFloat64(this.pos,n);this.pos+=8;}else super.encodeNumber(n);}
}
const encoder=new ExactEncoder({maxDepth:L.depth+8,ignoreUndefined:false});
const decoder=new Decoder({maxStrLength:L.stringBytes,maxArrayLength:L.nodes,maxMapLength:L.fields,maxBinLength:0,maxExtLength:0,mapKeyConverter:k=>{if(typeof k!=='string'||denied.has(k))fail();return k;}});
const stringOk=s=>s.length<=L.stringBytes&&!/[\uD800-\uDFFF]/u.test(s);
function canonical(value,budget,depth=0,previous){
 if(++budget.nodes>L.nodes||depth>L.depth)fail('LIMIT');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))fail();return value;}
 if(typeof value==='string'){if(!stringOk(value))fail('LIMIT');budget.chars+=value.length;if(budget.chars>L.stateBytes)fail('LIMIT');return value;}
 if(Array.isArray(value)){const before=Array.isArray(previous)?previous:null,out=count(value,L.nodes).map((v,i)=>canonical(v,budget,depth+1,before?.[i]));return before&&out.length===before.length&&out.every((v,i)=>Object.is(v,before[i]))?before:out;}
 const proto=value&&Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)fail();
 const output={},names=count(keys(value).sort(),L.fields),before=previous&&typeof previous==='object'&&!Array.isArray(previous)?previous:null;let same=before&&Object.keys(before).length===names.length;
 for(const k of names){if(denied.has(k)||k.length>256||!stringOk(k))fail();output[k]=canonical(value[k],budget,depth+1,before?.[k]);same=same&&Object.hasOwn(before,k)&&Object.is(output[k],before[k]);}return same?before:output;
}
function equal(a,b){
 if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a),bk=Object.keys(b);if(ak.length!==bk.length)return false;
 for(let i=0;i<ak.length;i++)if(ak[i]!==bk[i]||!equal(a[ak[i]],b[bk[i]]))return false;return true;
}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
const vector=v=>v&&Object.keys(v).length===1&&Array.isArray(v.$vector)&&v.$vector.length===2&&v.$vector.every(Number.isFinite);
/** Frozen reference math. Deliberately does not guide, collide, age out, fade,
 * spawn, or delete anything. Unsupported/new fields receive ordinary patches. */
function reference(state,steps,visual=false,seconds=0){
 if(visual)return steps?referenceVisualColumns(state,seconds):state;
 if(!steps||state.isMine)return state;
 const r={...state};
 let pos=vector(state.pos)?[...state.pos.$vector]:null,prev=vector(state.prevPos)?[...state.prevPos.$vector]:null;
 for(let i=0;i<steps;i++){
  if(pos){if(prev)prev=[...pos];if(vector(state.vel)&&!state.didDamage)pos=[pos[0]+state.vel.$vector[0]*DT,pos[1]+state.vel.$vector[1]*DT];}
  if(typeof r.elapsedTime==='number')r.elapsedTime+=DT;
  if(typeof r.flightTimeRemaining==='number')r.flightTimeRemaining-=DT;
  if(typeof r.armingTimeRemaining==='number')r.armingTimeRemaining=Math.max(0,r.armingTimeRemaining-DT);
  if(typeof r.rangeRemaining==='number'&&typeof r.sourceMoveSpeed==='number')r.rangeRemaining-=r.sourceMoveSpeed*DT;
 }
 if(pos)r.pos={$vector:pos};if(prev)r.prevPos={$vector:prev};return r;
}
function difference(base,target){
 const set={},remove=[];for(const key of Object.keys(target))if(!Object.hasOwn(base,key)||!equal(base[key],target[key]))set[key]=target[key];
 for(const key of Object.keys(base))if(!Object.hasOwn(target,key))remove.push(key);
 return [set,remove];
}
function visualDifference(base,target){
 const d=difference(base,target),appearance=difference(base.appearance??{},target.appearance??{});
 delete d[0].appearance;
 if(d[1].includes('appearance'))fail();
 return [...d,keys(appearance[0]).length||appearance[1].length?appearance:null];
}
function patchAppearance(value,changes,budget){
 if(changes!==null){if(!Array.isArray(changes)||changes.length!==2)fail();const next=patch(value.appearance??{},canonical(changes[0],budget),changes[1]);value.appearance=Object.fromEntries(Object.keys(next).sort().map(k=>[k,next[k]]));}
 value.appearance??={};return value;
}
function patch(base,set,remove){
 keys(set);count(remove,L.fields);const r={...base},seen=new Set();
 for(const k of remove){if(typeof k!=='string'||denied.has(k)||seen.has(k)||!Object.hasOwn(r,k)||Object.hasOwn(set,k)||k==='id')fail();seen.add(k);delete r[k];}
 for(const k of keys(set)){if(denied.has(k))fail();r[k]=set[k];}return r;
}
function image(rows,previous){
 const budget={nodes:0,chars:0},map=new Map(),order=[];
 for(const raw of count(rows,L.entities)){
  const row=canonical(raw,budget,0,previous?.get(raw?.id));if(!identity(row.id)||map.has(row.id)||typeof row.specId!=='string'||row.specId.length>256)fail();
  order.push(row.id);map.set(row.id,freeze(row));
 }
 return {map,order};
}
const weights=new WeakMap();
function nodeWeight(value){
 if(typeof value==='number'){if(!Number.isFinite(value))fail();return 1;}
 if(value===null||typeof value==='boolean'||typeof value==='string')return 1;
 const cached=weights.get(value);if(cached!==undefined)return cached;
 let total=1;for(const v of Object.values(value)){total+=nodeWeight(v);if(total>L.nodes)fail('LIMIT');}weights.set(value,total);return total;
}
function settle(result){
 let nodes=0;const map=new Map();
 for(const id of result.order){const row=result.map.get(id),names=keys(row);
  if(names.length>L.fields||!identity(row.id)||row.id!==id||typeof row.specId!=='string'||row.specId.length>256)fail();
  const ordered=Object.isFrozen(row)?row:Object.fromEntries(names.sort().map(k=>[k,row[k]]));
  if((nodes+=nodeWeight(ordered))>L.nodes)fail('LIMIT');map.set(id,freeze(ordered));
 }
 return {map,order:result.order};
}
function digest(state){const bytes=encoder.encode(state.order.map(id=>state.map.get(id)));if(bytes.length>L.stateBytes)fail('LIMIT');return {crc:lanCrc32(bytes),bytes:bytes.length};}
function wire(body,visual=false){const bytes=encoder.encode(body);if(bytes.length+4>L.packetBytes)fail('LIMIT');const out=new Uint8Array(bytes.length+4);new DataView(out.buffer).setUint32(0,visual?VISUAL_MAGIC:MAGIC);out.set(bytes,4);return out;}
// Bound MessagePack expansion BEFORE the library allocates decoded containers.
function preflight(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),stack=[1];let at=0,nodes=0;
 const take=n=>{if(n>bytes.length-at)fail();const start=at;at+=n;return start;};
 const uint=n=>{const p=take(n);return n===1?v.getUint8(p):n===2?v.getUint16(p):v.getUint32(p);};
 const utf8=new TextDecoder('utf-8',{fatal:true});
 while(stack.length){
  if(stack.at(-1)===0){stack.pop();continue;}stack[stack.length-1]--;if(++nodes>L.nodes)fail('LIMIT');
  const tag=uint(1);let array=null,map=null,string=null;
  if(tag<0x80||tag>=0xe0||tag===0xc0||tag===0xc2||tag===0xc3)continue;
  if((tag&0xf0)===0x90)array=tag&15;else if((tag&0xf0)===0x80)map=tag&15;else if((tag&0xe0)===0xa0)string=tag&31;
  else if(tag===0xdc||tag===0xdd)array=uint(tag===0xdc?2:4);
  else if(tag===0xde||tag===0xdf)map=uint(tag===0xde?2:4);
  else if(tag===0xd9||tag===0xda||tag===0xdb)string=uint(tag===0xd9?1:tag===0xda?2:4);
  else {const size=({0xcc:1,0xcd:2,0xce:4,0xcf:8,0xd0:1,0xd1:2,0xd2:4,0xd3:8,0xca:4,0xcb:8})[tag];if(!size)fail();take(size);continue;}
  if(string!==null){if(string>L.stringBytes)fail('LIMIT');utf8.decode(bytes.subarray(at,at+string));take(string);}
  else {const count=map!==null?map*2:array;if((map!==null&&map>L.fields)||count>L.nodes-nodes||count>bytes.length-at||stack.length>L.depth+8)fail('LIMIT');stack.push(count);}
 }
 if(at!==bytes.length)fail();
}
function read(bytes){
 if(bytes instanceof ArrayBuffer)bytes=new Uint8Array(bytes);
 if(!(bytes instanceof Uint8Array)||bytes.length<5||bytes.length>L.packetBytes)fail('LIMIT');
 const magic=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
 if(magic!==MAGIC&&magic!==VISUAL_MAGIC)fail();preflight(bytes.subarray(4));const body=decoder.decode(bytes.subarray(4));
 if(!Array.isArray(body)||(magic===MAGIC?body.length!==13:body.length!==14||body[13]!=='visual-columns-a1'))fail();
 return body;
}
function empty(){return {map:new Map(),order:[],tick:-1,time:0,revision:0,crc:0,bytes:0,templates:[],templateBytes:0};}
/** prepare never advances a stream; only commit after actual ordered transport
 * admission does. One base plus caller-owned bounded prepared payload, no queue.
 * A failed/ignored preparation cannot become another receiver's baseline. */
export class ProjectileEventSender {
 #epoch;#state;#generation=0;#choices=new WeakMap();#referenceSteps;#visual;
 constructor(epoch,{referenceSteps=true,visualColumns=false}={}){if(typeof referenceSteps!=='boolean'||typeof visualColumns!=='boolean')fail();this.#referenceSteps=referenceSteps;this.#visual=visualColumns;this.reset(epoch);}
 reset(epoch){if(!epochOk(epoch))fail();this.#epoch=epoch;this.#state=empty();this.#generation++;this.#choices=new WeakMap();}
 // Committed maps/rows/templates are immutable by ownership. A fork gets its
 // own proposal/commit generation; it cannot advance or reset its parent.
 fork(){const child=new ProjectileEventSender(this.#epoch,{referenceSteps:this.#referenceSteps,visualColumns:this.#visual});child.#state=this.#state;return child;}
 prepare({tick,time,rows}){
  const base=this.#state;if(!safe(tick)||tick<=base.tick||!Number.isFinite(time)||time<base.time)fail();
  const target=image(rows,base.map);if(this.#visual)for(const row of target.map.values())validateVisualColumns(row.pose);const templates=base.templates.slice(),add=[],create=[],update=[],remove=[];let templateBytes=base.templateBytes;
  const positions=new Map(base.order.map((id,index)=>[id,index]));
  const steps=this.#referenceSteps&&base.revision&&tick-base.tick<=60?tick-base.tick:0;
  for(const [id,row] of target.map){
   const before=base.map.get(id);
   if(before){
    const predicted=reference(before,steps,this.#visual,time-base.time),d=this.#visual?visualDifference(predicted,row):difference(predicted,row);
    if(this.#visual){const pose=diffVisualColumns(predicted.pose,row.pose);delete d[0].pose;if(d[1].includes('pose'))fail();if(keys(d[0]).length||d[1].length||pose||d[2])update.push([positions.get(id),d[0],d[1],pose,d[2]]);}
    else if(keys(d[0]).length||d[1].length)update.push([positions.get(id),...d]);
   }
   else {
    // Fixed/immutable fields of a spec are transmitted once. Every differing
    // owner/pose/lifecycle field is still carried as an exact spawn override.
    let index=templates.findIndex(t=>t.specId===row.specId);
    if(index<0&&templates.length<L.templates){const bytes=encoder.encode(row).length;if(bytes<=L.entityBytes&&templateBytes+bytes<=L.templateBytes){templateBytes+=bytes;index=templates.length;templates.push(row);add.push(row);}}
    const d=this.#visual?visualDifference(index<0?{}:templates[index],row):index<0?[row,[]]:difference(templates[index],row);create.push([id,index,...d]);
   }
  }
  for(const id of base.order)if(!target.map.has(id))remove.push(positions.get(id));
  const createdPositions=new Map(create.map((row,index)=>[row[0],-1-index]));
  const order=equal(base.order,target.order)?null:target.order.map(id=>positions.has(id)?positions.get(id):createdPositions.get(id));
  const hash=digest(target),revision=base.revision+1;
  const body=[this.#epoch,base.revision,revision,base.crc,tick,time,steps,add,create,update,remove,order,hash.crc];
  if(this.#visual)body.push('visual-columns-a1');
  const choice=Object.freeze({bytes:wire(body,this.#visual),revision,tick,stats:Object.freeze({created:create.length,changed:update.length,removed:remove.length,templates:add.length,stateBytes:hash.bytes}),
   });
  this.#choices.set(choice,{epoch:this.#epoch,generation:this.#generation,base:base.revision,state:{...target,...hash,tick,time,revision,templates,templateBytes}});return choice;
 }
 commit(choice){const c=this.#choices.get(choice);if(!c||c.generation!==this.#generation||c.epoch!==this.#epoch||c.base!==this.#state.revision)return false;this.#choices.delete(choice);this.#state=c.state;return true;}
 stats(){return {revision:this.#state.revision,tick:this.#state.tick,entities:this.#state.map.size,templates:this.#state.templates.length,retainedStateBytes:this.#state.bytes,retainedTemplateBytes:this.#state.templateBytes};}
}
export class ProjectileEventReceiver {
 #epoch;#state;#validate;#visual=null;
 constructor(epoch,{validate=null}={}){this.#validate=validate;this.reset(epoch);}
 reset(epoch){if(!epochOk(epoch))fail();this.#epoch=epoch;this.#state=empty();this.#visual=null;}
 fork(){const child=new ProjectileEventReceiver(this.#epoch,{validate:this.#validate});child.#state=this.#state;child.#visual=this.#visual;return child;}
 receive(bytes){
  const body=read(bytes),visual=body.length===14;
  const [epoch,baseRev,revision,baseCrc,tick,time,steps,newTemplates,create,update,remove,order,crc]=body,base=this.#state;
  if((base.revision&&this.#visual!==visual)||epoch!==this.#epoch||baseRev!==base.revision||baseCrc!==base.crc)fail('MISSING_BASE');
  if(!safe(revision)||revision!==baseRev+1||!safe(tick)||tick<=base.tick||!Number.isFinite(time)||time<base.time||!Number.isInteger(crc)||crc<0||crc>0xffffffff)fail();
  if(!safe(steps)||steps>60||(steps!==0&&(baseRev===0||steps!==tick-base.tick)))fail();
  const budget={nodes:0,chars:0},templates=base.templates.slice();let templateBytes=base.templateBytes;
  for(const row of count(newTemplates,L.templates)){if(templates.length>=L.templates)fail('LIMIT');const item=canonical(row,budget);if(!identity(item.id)||typeof item.specId!=='string')fail();const bytes=encoder.encode(item).length;if(bytes>L.entityBytes||(templateBytes+=bytes)>L.templateBytes)fail('LIMIT');templates.push(freeze(item));}
  const result={map:new Map(),order:base.order.slice()},touched=new Set();
  for(const [id,row] of base.map)result.map.set(id,reference(row,steps,visual,time-base.time));
  for(const row of count(create,L.entities)){
   if(!Array.isArray(row)||row.length!==(visual?5:4))fail();const [id,tid,set,removed,appearance]=row;
   if(!identity(id)||base.map.has(id)||touched.has(id)||!Number.isInteger(tid)||tid < -1||tid>=templates.length)fail();touched.add(id);
   const value=patch(tid<0?{}:templates[tid],canonical(set,budget),removed);if(visual){if(Object.hasOwn(set??{},'appearance')||removed.includes('appearance'))fail();patchAppearance(value,appearance,budget);}if(value.id!==id||typeof value.specId!=='string')fail();result.map.set(id,value);
  }
  for(const row of count(update,L.entities)){
   if(!Array.isArray(row)||row.length!==(visual?5:3))fail();const [index,set,removed,pose,appearance]=row,id=base.order[index];
   if(!safe(index)||index>=base.order.length||!base.map.has(id)||touched.has(id)||Object.hasOwn(set??{},'id'))fail();touched.add(id);
   const value=patch(result.map.get(id),canonical(set,budget),removed);
   if(visual){if(Object.hasOwn(set??{},'pose')||removed.includes('pose')||Object.hasOwn(set??{},'appearance')||removed.includes('appearance'))fail();if(pose!==null)value.pose=applyVisualColumnDiff(value.pose,pose);patchAppearance(value,appearance,budget);}
   result.map.set(id,value);
  }
  for(const index of count(remove,L.entities)){if(!safe(index)||index>=base.order.length)fail();const id=base.order[index];if(touched.has(id))fail();touched.add(id);result.map.delete(id);}
  if(order!==null)result.order=count(order,L.entities).map(index=>{if(!Number.isSafeInteger(index)||index>=base.order.length||index < -create.length)fail();return index>=0?base.order[index]:create[-1-index][0];});
  if(result.map.size>L.entities||result.order.length!==result.map.size||new Set(result.order).size!==result.order.length||result.order.some(id=>!identity(id)||!result.map.has(id)))fail();
  // Canonicalize after patching so property insertion order cannot alter the
  // checksum. Enforce the aggregate limit including unchanged referenced rows.
  const normalized=settle(result);if(visual)for(const row of normalized.map.values())validateVisualColumns(row.pose);const hash=digest(normalized);
  if(hash.crc!==crc)fail('CHECKSUM');
  // Additional negotiated projections validate BEFORE committing their base.
  this.#validate?.({tick,time,rows:normalized.order.map(id=>normalized.map.get(id))});
  this.#visual=visual;this.#state={...normalized,...hash,tick,time,revision,templates,templateBytes};
  return Object.freeze({tick,time,revision,rows:Object.freeze(normalized.order.map(id=>normalized.map.get(id)))});
 }
 stats(){return {revision:this.#state.revision,tick:this.#state.tick,entities:this.#state.map.size,templates:this.#state.templates.length,retainedStateBytes:this.#state.bytes,retainedTemplateBytes:this.#state.templateBytes};}
}

