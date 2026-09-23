export const VISUAL_FRAGMENT_BYTES:number;
export function visualPacketBytes(message:unknown):Uint8Array;
export class VisualPacketAssembler {reset():void;take(message:unknown):Uint8Array|null;}
export function visualReceipt(message:any,status?:'consumed'|'discarded'|'fragment'):Record<string,unknown>;
