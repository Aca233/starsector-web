export type SnapshotNumbers = Float32Array | Float64Array | Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array;
export function validatePackedNumbers(bytes: Uint8Array): {new(buffer:ArrayBuffer,offset:number,length:number):SnapshotNumbers;readonly BYTES_PER_ELEMENT:number};
export class PackedSnapshotNumbers {
  constructor(bytes: Uint8Array);
  static capture(value: ArrayBufferView): PackedSnapshotNumbers | null;
  readonly byteLength:number;
  readonly length:number;
  copyBytesTo(target:Uint8Array,offset:number):void;
  copyNumbersTo(target:SnapshotNumbers):void;
  matchesBytes(bytes:Uint8Array):boolean;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly numbers: SnapshotNumbers;
  readonly type: string;
  toJSON(): number[];
}

export function readPackedNumbers(bytes:Uint8Array):PackedSnapshotNumbers;
export function packedNumberCacheStats():{entries:number;bytes:number;hits:number;misses:number};
