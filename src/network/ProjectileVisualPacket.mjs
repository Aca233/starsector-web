import { ANCHORED_VISUAL_LIMITS as L } from './AnchoredProjectileVisual.mjs';
// A multiple of three permits shared base64 slices without per-peer re-encode.
export const VISUAL_FRAGMENT_BYTES=6144;
export function visualPacketBytes(m){
 if(!m||m.type!=='projectile-visual'||typeof m.matchId!=='string'||typeof m.syncId!=='string'||m.matchId.length>64||m.syncId.length>64||!Number.isSafeInteger(m.key)||m.key<=0||!Number.isSafeInteger(m.tick)||m.tick<0||!['baseline','update'].includes(m.kind)||typeof m.data!=='string')throw Error('Invalid visual packet');
 const limit=m.kind==='baseline'?L.baselineBytes:L.updateBytes;
 if(m.encoding!==undefined&&(m.encoding!=='deflate-raw'||!Number.isSafeInteger(m.rawBytes)||m.rawBytes<=0||m.rawBytes>limit))throw Error('Invalid visual compression');
 if(m.receiptOffset!==undefined&&(!Number.isSafeInteger(m.receiptOffset)||!Number.isSafeInteger(m.receiptTotal)||m.kind!=='baseline'||m.receiptOffset<0||m.receiptOffset>=m.receiptTotal||m.receiptTotal>L.baselineBytes))throw Error('Invalid visual forwarded receipt');
 if(m.data.length>Math.ceil(limit/3)*4||!m.data.length||m.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data))throw Error('Invalid visual bytes');
 const text=atob(m.data);if(text.length>limit)throw Error('Visual packet limit');
 if(m.offset!==undefined||m.total!==undefined){
  if(m.kind!=='baseline'||!Number.isSafeInteger(m.total)||m.total<=0||m.total>L.baselineBytes||!Number.isSafeInteger(m.offset)||m.offset<0||m.offset>=m.total||m.offset%VISUAL_FRAGMENT_BYTES||text.length!==Math.min(VISUAL_FRAGMENT_BYTES,m.total-m.offset))throw Error('Invalid visual fragment');
 }
 return Uint8Array.from(text,c=>c.charCodeAt(0));
}
/** At most one bounded partial baseline. Fragment receipt is NOT a committed
 * visual revision: only the final complete CRC-checked baseline grants readiness. */
export class VisualPacketAssembler {
 pending=null;
 reset(){this.pending=null;}
 take(m){
  const bytes=visualPacketBytes(m);if(m.offset===undefined)return bytes;
  const id=JSON.stringify([m.matchId,m.syncId,m.key,m.tick,m.total,m.encoding,m.rawBytes]);
  let p=this.pending;
  if(m.offset===0)p={id,bytes:new Uint8Array(m.total),next:0};
  if(!p||p.id!==id||p.next!==m.offset)throw Error('Missing visual fragment');
  p.bytes.set(bytes,p.next);p.next+=bytes.length;
  if(p.next===p.bytes.length){this.pending=null;return p.bytes;}
  this.pending=p;return null;
 }
}
export function visualReceipt(m,status='consumed'){return {type:'visual-consumed',matchId:m.matchId,syncId:m.syncId,key:m.key,tick:m.tick,kind:m.kind,status,...(m.offset!==undefined?{offset:m.offset,total:m.total}:m.receiptOffset!==undefined?{offset:m.receiptOffset,total:m.receiptTotal}:{})};}
