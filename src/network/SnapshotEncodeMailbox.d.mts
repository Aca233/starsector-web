export const ENCODE_SLOT_BYTES:number;
export const ENCODE_MAILBOX_BYTES:number;
export interface EncodedSnapshotResult {id:number;display:Uint8Array<ArrayBuffer>|null;network:Uint8Array<ArrayBuffer>|null;fallback:boolean;workerMs:number;}
export function createEncodeMailbox():SharedArrayBuffer;
export function reserveEncodeMailbox(buffer:SharedArrayBuffer,id:number):void;
export function cancelEncodeMailbox(buffer:SharedArrayBuffer):void;
export function completeEncodeMailbox(buffer:SharedArrayBuffer,id:number,display:Uint8Array|null,network:Uint8Array|null,workerMs:number,fallback?:boolean):boolean;
export function takeEncodeMailbox(buffer:SharedArrayBuffer,id:number):EncodedSnapshotResult|null;
