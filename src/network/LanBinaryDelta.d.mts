export const LAN_DELTA_MAX_BYTES: number;
export const LAN_DELTA_HEADER: number;
export function isLanDelta(value: ArrayBuffer | ArrayBufferView): boolean;
export function lanCrc32(value: ArrayBuffer | ArrayBufferView): number;
export class LanDeltaReceiver {
  reset(): void;
  readonly retainedBytes: number;
  decode(value: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer>;
}
