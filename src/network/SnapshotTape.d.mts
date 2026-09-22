export interface SnapshotTape {buffer:ArrayBuffer;words:number;strings:string[]}
export class SnapshotTapeWriter {buffer:ArrayBuffer;constructor();reuse(buffer:ArrayBuffer):void;encode(frame:unknown):SnapshotTape|null;}
export function readSnapshotTape(tape:SnapshotTape):any;
export const TAPE_MAX_BYTES:number;

/** Private validated tape cursor; never a network frame. */
export class SnapshotTapeReader {
  constructor(tape:SnapshotTape);
  readonly numbers:Float64Array;readonly tags:Uint32Array;readonly words:number;readonly strings:string[];
  pos:number;value(depth:number):any;bad():never;
}
export const SNAPSHOT_TAPE_TAGS:Readonly<{NAN:number;NIL:number;FALSE:number;TRUE:number;STRING:number;ARRAY:number;MAP:number}>;
