import {crc32,deflateRawSync,inflateRawSync} from 'node:zlib';
import {MOTION_MAX_BYTES,motionFromText} from '../src/network/MotionFrame.mjs';

// SMX1 is helper-to-relay transport only, not a new authority state. Exactly
// reconstructs canonical SWM1 bytes; no rounding or omitted ship. A temporary
// arithmetic reference is compression only: never publish it without the exact
// correction, CRC and SWM1 validation. It does not advance simulation/display.
// Ordered control WS is the prerequisite: the last admitted packet is the base.
const HEADER=36,MAGIC=0x534d5831;
const invalid=()=>{throw Error('Invalid motion wire packet');};
const scope=m=>{
 if(typeof m?.matchId!=='string'||!m.matchId.length||m.matchId.length>64||typeof m.syncId!=='string'||!m.syncId.length||m.syncId.length>64)invalid();
 return JSON.stringify([m.matchId,m.syncId]);
};
function reference(base,tick){
 const steps=tick-base.tick;if(!Number.isSafeInteger(steps)||steps<1||steps>60)invalid();
 const b=Buffer.from(base.bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength),count=v.getUint16(20);let at=23+b[22]*9,time=v.getFloat64(12);
 for(let n=0;n<steps;n++)time+=1/60;v.setFloat64(4,tick);v.setFloat64(12,time);
 for(let n=0;n<count;n++){
  at+=1+b[at];let x=v.getFloat64(at),y=v.getFloat64(at+8),facing=v.getFloat64(at+32);
  const vx=v.getFloat64(at+16),vy=v.getFloat64(at+24),spin=v.getFloat64(at+40);
  for(let step=0;step<steps;step++){x+=vx*(1/60);y+=vy*(1/60);facing+=spin*(1/60);}
  v.setFloat64(at,x);v.setFloat64(at+8,y);v.setFloat64(at+32,facing);at+=53;
 }
 return b;
}
function packet(target,base,predict=false){
 let payload=target.bytes;
 if(base){const source=predict?reference(base,target.tick):base.bytes;payload=Buffer.allocUnsafe(target.bytes.length);for(let i=0;i<payload.length;i++)payload[i]=target.bytes[i]^source[i];}
 const zipped=deflateRawSync(payload,{level:1,memLevel:7}),compressed=zipped.length<payload.length;
 if(compressed)payload=zipped;
 const b=Buffer.alloc(HEADER+payload.length);b.writeUInt32BE(MAGIC);b[4]=(compressed?1:0)|(base?2:0)|(predict?4:0);
 b.writeUInt32BE(target.bytes.length,8);b.writeUInt32BE(target.crc,12);b.writeDoubleBE(target.tick,16);
 b.writeDoubleBE(base?.tick??0,24);b.writeUInt32BE(base?.crc??0,32);payload.copy(b,HEADER);
 return {packet:b,data:b.toString('base64'),bytes:b.length,delta:!!base};
}
/** Call once per authority publication; equal last-send bases share compression.
 * At most two divergent delta builds per publication, then a shared full frame.
 * Never retain this cache in a sender baseline (which would create history). */
export function motionWireTarget(data){
 const frame=motionFromText(data),bytes=Buffer.from(data,'base64');
 const target={bytes,tick:frame.tick,crc:crc32(bytes),patches:new WeakMap(),builds:0};
 target.full=packet(target,null);return target;
}
export class MotionWireSender {
 constructor(){this.base=null;this.scope=null;this.revision=0;this.choices=new WeakSet();this.totals={full:0,delta:0,rawBytes:0,packetBytes:0,fallbacks:0};}
 prepare(target,message){
  const epoch=scope(message),base=this.scope===epoch?this.base:null;let selected=target.full,fallback=false;
  if(base&&target.tick<=base.tick)invalid();
  if(base&&base.bytes.length===target.bytes.length){
   if(!target.patches.has(base.bytes)&&target.builds<2){let candidate=packet(target,base);if(target.tick-base.tick<=60){const predicted=packet(target,base,true);if(predicted.bytes<candidate.bytes)candidate=predicted;}target.patches.set(base.bytes,candidate);target.builds++;}
   const candidate=target.patches.get(base.bytes);fallback=!candidate;
   if(candidate&&candidate.bytes<selected.bytes)selected=candidate;
  }
  const choice={packet:selected.packet,data:selected.data,delta:selected.delta,bytes:selected.bytes,rawBytes:target.bytes.length,
   base:{bytes:target.bytes,tick:target.tick,crc:target.crc},scope:epoch,revision:this.revision,fallback};
  this.choices.add(choice);return choice;
 }
 commit(choice){
  if(!this.choices.has(choice)||choice.revision!==this.revision)return false;
  this.choices.delete(choice);this.revision++;this.base=choice.base;this.scope=choice.scope;
  this.totals[choice.delta?'delta':'full']++;this.totals.rawBytes+=choice.rawBytes;this.totals.packetBytes+=choice.bytes;if(choice.fallback)this.totals.fallbacks++;return true;
 }
 reset(){this.base=null;this.scope=null;this.revision++;}
 stats(){return {...this.totals,retainedBytes:this.base?.bytes.length??0};}
}
export class MotionWireReceiver {
 constructor(){this.reset();}
 reset(){this.base=null;this.scope=null;}
 decode(m){
  const epoch=scope(m);
  if(m.type!=='motion'||m.motionWire!==1||typeof m.data!=='string'||m.data.length>Math.ceil((MOTION_MAX_BYTES+HEADER)/3)*4||m.data.length%4||!m.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data))invalid();
  const b=Buffer.from(m.data,'base64');
  if(b.length<=HEADER||b.readUInt32BE(0)!==MAGIC||b[4]>7||b[4]&4&&!(b[4]&2)||b[5]||b[6]||b[7])invalid();
  const flags=b[4],length=b.readUInt32BE(8),crc=b.readUInt32BE(12),tick=b.readDoubleBE(16),baseTick=b.readDoubleBE(24),baseCrc=b.readUInt32BE(32);
  if(length<23||length>MOTION_MAX_BYTES||!Number.isSafeInteger(tick)||tick<0)invalid();
  const base=this.scope===epoch?this.base:null;
  if(base&&tick<=base.tick)invalid();
  if(flags&2){if(!base||base.tick!==baseTick||base.crc!==baseCrc||base.bytes.length!==length)invalid();}
  else if(baseTick!==0||baseCrc!==0)invalid();
  const payload=b.subarray(HEADER),decoded=flags&1?inflateRawSync(payload,{maxOutputLength:length}):payload;
  if(decoded.length!==length)invalid();
  const bytes=Buffer.from(decoded);
  if(flags&2){const source=flags&4?reference(base,tick):base.bytes;for(let i=0;i<bytes.length;i++)bytes[i]^=source[i];}
  if(crc32(bytes)!==crc)invalid();
  const data=bytes.toString('base64');if(motionFromText(data).tick!==tick)invalid();
  // Transactional: corruption never becomes the next compression baseline.
  this.base={bytes,tick,crc};this.scope=epoch;const forwarded={...m,data};delete forwarded.motionWire;return forwarded;
 }
}

const ENVELOPE=0x534d4c31,utf8=new TextDecoder('utf-8',{fatal:true});
export function encodeMotionWireEnvelope(message,choice){
 scope(message);const match=Buffer.from(message.matchId),sync=Buffer.from(message.syncId);
 if(match.length>256||sync.length>256)invalid();
 const out=Buffer.allocUnsafe(8+match.length+sync.length+choice.packet.length);out.writeUInt32BE(ENVELOPE);out.writeUInt16BE(match.length,4);out.writeUInt16BE(sync.length,6);
 match.copy(out,8);sync.copy(out,8+match.length);choice.packet.copy(out,8+match.length+sync.length);return out;
}
export function decodeMotionWireEnvelope(value){
 if(!ArrayBuffer.isView(value)||value.byteLength<8+HEADER||value.byteLength>8+512+HEADER+MOTION_MAX_BYTES)invalid();
 const b=Buffer.from(value.buffer,value.byteOffset,value.byteLength);if(b.readUInt32BE(0)!==ENVELOPE)invalid();
 const ml=b.readUInt16BE(4),sl=b.readUInt16BE(6);if(!ml||!sl||ml>256||sl>256||8+ml+sl+HEADER>=b.length)invalid();
 const message={type:'motion',matchId:utf8.decode(b.subarray(8,8+ml)),syncId:utf8.decode(b.subarray(8+ml,8+ml+sl)),motionWire:1,data:b.subarray(8+ml+sl).toString('base64')};scope(message);return message;
}
