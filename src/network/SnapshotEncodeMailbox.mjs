/** Private, single-job result mailbox. Status is -job while reserved, +job only
 * after BOTH byte ranges and metadata have been written. CAS prevents cancelled
 * writers from marking cancelled work readable. The owner must terminate an
 * old writer before reusing storage; CAS alone cannot protect byte ranges from
 * two simultaneous writers. The broker never reuses a cancelled worker/mailbox.
 * Never a network ACK. */
export const ENCODE_SLOT_BYTES = 2 * 1024 * 1024;
const HEADER_BYTES = 32;
export const ENCODE_MAILBOX_BYTES = HEADER_BYTES + ENCODE_SLOT_BYTES * 2;
export function createEncodeMailbox() { return new SharedArrayBuffer(ENCODE_MAILBOX_BYTES); }
const header = buffer => {
 if (!(buffer instanceof SharedArrayBuffer) || buffer.byteLength !== ENCODE_MAILBOX_BYTES) throw Error('Invalid encode mailbox');
 return new Int32Array(buffer,0,8);
};
export function reserveEncodeMailbox(buffer,id) { if (!Number.isInteger(id)||id<1||id>0x7ffffffe) throw Error('Invalid encode job'); Atomics.store(header(buffer),0,-id); }
export function cancelEncodeMailbox(buffer) { Atomics.store(header(buffer),0,0); }
export function completeEncodeMailbox(buffer,id,display,network,workerMs,fallback=false) {
 const h=header(buffer); if(Atomics.load(h,0)!==-id)return false;
 fallback ||= (display?.length??0)>ENCODE_SLOT_BYTES || (network?.length??0)>ENCODE_SLOT_BYTES;
 if(!fallback){if(display)new Uint8Array(buffer,HEADER_BYTES,display.length).set(display);if(network)new Uint8Array(buffer,HEADER_BYTES+ENCODE_SLOT_BYTES,network.length).set(network);}
 Atomics.store(h,1,fallback?0:display?.length??0);Atomics.store(h,2,fallback?0:network?.length??0);
 Atomics.store(h,3,Math.max(0,Math.min(0x7fffffff,Math.round(workerMs*1000))));Atomics.store(h,4,fallback?1:0);
 return Atomics.compareExchange(h,0,-id,id)===-id;
}
export function takeEncodeMailbox(buffer,id) {
 const h=header(buffer);if(Atomics.load(h,0)!==id)return null;
 const a=Atomics.load(h,1),b=Atomics.load(h,2),fallback=Atomics.load(h,4)===1,workerMs=Atomics.load(h,3)/1000;
 if(a<0||b<0||a>ENCODE_SLOT_BYTES||b>ENCODE_SLOT_BYTES)throw Error('Invalid encode result lengths');
 const display=a?new Uint8Array(buffer,HEADER_BYTES,a).slice():null;
 const network=b?new Uint8Array(buffer,HEADER_BYTES+ENCODE_SLOT_BYTES,b).slice():null;
 Atomics.store(h,0,0);return{id,display,network,fallback,workerMs};
}
