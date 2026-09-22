// SWC1 is an OPTIONAL helper-to-helper transport envelope, not a game snapshot.
// Compression is applied once before splitting. The unchanged SLD1/SWB1 decoder
// and renderer consumption ACK still own complete-state validation/admission.
import { crc32, deflateRaw, inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
export const SNAPSHOT_CHUNK_LIMITS = Object.freeze({ header:40, packet:2044, raw:2*1024*1024+128, compressed:2*1024*1024+128 });
const L=SNAPSHOT_CHUNK_LIMITS, MAGIC=0x53574331;
const invalid=()=>{throw Error('Invalid snapshot chunk');};
export function isSnapshotChunk(value){return ArrayBuffer.isView(value)&&value.byteLength>=4&&new DataView(value.buffer,value.byteOffset,value.byteLength).getUint32(0)===MAGIC;}
export function prepareSnapshotChunks(value){
 const raw=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
 if(!raw.length||raw.length>L.raw)invalid();
 // Owned copy: asynchronous zlib must not read a mutable relay/caller buffer.
 const owned=Buffer.from(raw);
 return new Promise((resolve,reject)=>deflateRaw(owned,{level:1,memLevel:7},(error,zipped)=>{
  if(error){reject(error);return;}
  const compressed=zipped.length<owned.length, payload=compressed?zipped:owned;
  resolve({payload,rawBytes:owned.length,checksum:crc32(owned),compressed});
 }));
}
export function snapshotChunkPacket(prepared,id,offset){
 if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id)||!Buffer.isBuffer(prepared?.payload)||!Number.isSafeInteger(offset)||offset<0||offset>=prepared.payload.length
  ||prepared.payload.length>L.compressed||!Number.isSafeInteger(prepared.rawBytes)||prepared.rawBytes<1||prepared.rawBytes>L.raw)invalid();
 const length=Math.min(L.packet-L.header,prepared.payload.length-offset),out=Buffer.allocUnsafe(L.header+length);
 out.writeUInt32BE(MAGIC);Buffer.from(id,'hex').copy(out,4);out.writeUInt32BE(offset,20);out.writeUInt32BE(prepared.payload.length,24);
 out.writeUInt32BE(prepared.rawBytes,28);out.writeUInt32BE(prepared.checksum>>>0,32);out.writeUInt32BE(prepared.compressed?1:0,36);
 prepared.payload.copy(out,L.header,offset,offset+length);return out;
}
export const newSnapshotChunkId=()=>randomBytes(16).toString('hex');
export class SnapshotChunkReceiver {
 constructor(){this.pending=null;this.completed=0;this.abandoned=0;}
 reset(){this.pending=null;}
 get retainedBytes(){return this.pending?.bytes.length??0;}
 receive(value){
  if(!ArrayBuffer.isView(value))invalid();const b=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
  if(!isSnapshotChunk(b)||b.length<=L.header||b.length>L.packet)invalid();
  const id=b.subarray(4,20).toString('hex'),offset=b.readUInt32BE(20),total=b.readUInt32BE(24),rawBytes=b.readUInt32BE(28),checksum=b.readUInt32BE(32),flags=b.readUInt32BE(36),length=b.length-L.header;
  if(!total||total>L.compressed||!rawBytes||rawBytes>L.raw||flags>1||offset+length>total||(!flags&&total!==rawBytes))invalid();
  let p=this.pending;
  if(offset===0){
   if(p?.id===id)invalid();
   if(p)this.abandoned++;
   p={id,total,rawBytes,checksum,flags,next:0,bytes:Buffer.allocUnsafe(total)};
  }
  if(!p||p.id!==id||p.total!==total||p.rawBytes!==rawBytes||p.checksum!==checksum||p.flags!==flags||p.next!==offset)invalid();
  b.copy(p.bytes,offset,L.header);p.next+=length;this.pending=p;
  let payload=null;
  if(p.next===p.total){
   // Bound expansion BEFORE inflate allocates an attacker-declared world.
   this.pending=null;
   payload=flags?inflateRawSync(p.bytes,{maxOutputLength:rawBytes}):p.bytes;
   if(payload.length!==rawBytes||crc32(payload)!==checksum)invalid();this.completed++;
  }
  return {receipt:{type:'bulk-ack',id,offset:p.next},payload};
 }
}
