import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {VisualPacketAssembler,visualPacketBytes,visualReceipt} from '../src/network/ProjectileVisualPacket.mjs';
/** Shared transport compression, not a semantic projectile revision. Bounded
 * input/output; the final application decoder still checks epoch, CRC and pose. */
export function compressVisualBytes(bytes){
 const raw=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),zipped=deflateRawSync(raw,{level:1,memLevel:7});
 return zipped.length<raw.length?{data:zipped.toString('base64'),bytes:zipped.length,encoding:'deflate-raw',rawBytes:raw.length}:{data:raw.toString('base64'),bytes:raw.length};
}
/** Desktop helper only. Nonfinal fragments release bounded transport retention,
 * never baseline readiness. Final receipt remains owned by the renderer. */
export class VisualWireReceiver {
 constructor(){this.assembler=new VisualPacketAssembler();}
 reset(){this.assembler.reset();}
 take(m){
  const bytes=this.assembler.take(m);
  if(!bytes)return {packet:null,receipt:visualReceipt(m,'fragment')};
  const raw=m.encoding==='deflate-raw'?inflateRawSync(bytes,{maxOutputLength:m.rawBytes}):bytes;
  if(m.encoding&&raw.length!==m.rawBytes)throw Error('Visual inflation length mismatch');
  const packet={...m,data:Buffer.from(raw).toString('base64'),...(m.offset!==undefined?{receiptOffset:m.offset,receiptTotal:m.total}:{})};
  delete packet.offset;delete packet.total;delete packet.encoding;delete packet.rawBytes;
  visualPacketBytes(packet);return {packet,receipt:null};
 }
}

// SVL1: binary control-lane envelope for an already compressed visual packet.
// Same exact fragment/consumption identity as JSON; only base64 overhead is gone.
const VISUAL_MAGIC=0x53564c31,HEADER=40,utf8=new TextDecoder('utf-8',{fatal:true});
export function encodeVisualWireEnvelope(m){
 const bytes=visualPacketBytes(m),match=Buffer.from(m.matchId),sync=Buffer.from(m.syncId);
 if(!match.length||!sync.length||match.length>256||sync.length>256)throw Error('Invalid visual envelope scope');
 const b=Buffer.alloc(HEADER+match.length+sync.length+bytes.length);b.writeUInt32BE(VISUAL_MAGIC);b[4]=m.kind==='baseline'?0:1;b[5]=m.encoding==='deflate-raw'?1:0;
 b.writeDoubleBE(m.key,8);b.writeDoubleBE(m.tick,16);b.writeUInt32BE(m.rawBytes??0,24);b.writeUInt32BE(m.offset??0xffffffff,28);b.writeUInt32BE(m.total??0,32);b.writeUInt16BE(match.length,36);b.writeUInt16BE(sync.length,38);
 match.copy(b,HEADER);sync.copy(b,HEADER+match.length);b.set(bytes,HEADER+match.length+sync.length);return b;
}
export function decodeVisualWireEnvelope(value){
 if(!ArrayBuffer.isView(value)||value.byteLength<=HEADER||value.byteLength>16384)throw Error('Invalid visual envelope size');
 const b=Buffer.from(value.buffer,value.byteOffset,value.byteLength),ml=b.readUInt16BE(36),sl=b.readUInt16BE(38),offset=b.readUInt32BE(28),total=b.readUInt32BE(32);
 if(b.readUInt32BE(0)!==VISUAL_MAGIC||b[4]>1||b[5]>1||b[6]||b[7]||!ml||!sl||ml>256||sl>256||HEADER+ml+sl>=b.length||!b[5]&&b.readUInt32BE(24)!==0||offset===0xffffffff&&total!==0)throw Error('Invalid visual envelope');
 const m={type:'projectile-visual',kind:b[4]?'update':'baseline',matchId:utf8.decode(b.subarray(HEADER,HEADER+ml)),syncId:utf8.decode(b.subarray(HEADER+ml,HEADER+ml+sl)),key:b.readDoubleBE(8),tick:b.readDoubleBE(16),data:b.subarray(HEADER+ml+sl).toString('base64'),...(b[5]?{encoding:'deflate-raw',rawBytes:b.readUInt32BE(24)}:{}),...(offset!==0xffffffff?{offset,total}:{})};
 visualPacketBytes(m);return m;
}
