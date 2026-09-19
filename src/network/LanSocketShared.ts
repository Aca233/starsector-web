/** Private LAN I/O bridge. These bounds are independent of the AI/simulation. */
export const LAN_SOCKET_QUEUE_BYTES = 2 * 16 * 1024 * 1024;
// Byte limits alone do not bound queues of empty/small messages.
export const LAN_SOCKET_QUEUE_MESSAGES = 8192;
export const LAN_SOCKET_INIT_MS = 2000;
export const LAN_SOCKET_CLOSE_MS = 2000;

export const Cell = {
  pendingSend: 0,
  nativeBuffered: 1,
  outbound: 2,
  inbound: 3,
  outboundMessages: 4,
  inboundMessages: 5,
  transportState: 6,
  closing: 7,
} as const;
export const LAN_SOCKET_SHARED_BYTES = 8 * Int32Array.BYTES_PER_ELEMENT;

export type LanPayload = string | ArrayBuffer | Blob;
export type ToLanWorker =
  | { type: "init"; shared: SharedArrayBuffer }
  | { type: "connect"; url: string }
  | { type: "send"; data: LanPayload; size: number }
  | { type: "close"; code?: number; reason: string };
export type FromLanWorker =
  | { type: "ready" }
  // Only this reply certifies that construction failed WITHOUT a socket.
  | { type: "connect-failed" }
  | { type: "open" }
  | { type: "message"; data: string | ArrayBuffer; size: number }
  | { type: "error" }
  | { type: "failed"; reason: string }
  | { type: "close"; code: number; reason: string; wasClean: boolean };

const encoder = new TextEncoder();
export function payloadBytes(data: LanPayload): number {
  return typeof data === "string" ? encoder.encode(data).byteLength
    : data instanceof ArrayBuffer ? data.byteLength : data.size;
}

/** Reserve before posting, never after: the other thread can consume at once. */
export function reserve(cells: Int32Array, index: number, size: number, limit: number): boolean {
  let current = Atomics.load(cells, index);
  for (;;) {
    if (!Number.isSafeInteger(size) || size < 0 || size > limit - current) return false;
    const actual = Atomics.compareExchange(cells, index, current, current + size);
    if (actual === current) return true;
    current = actual;
  }
}

/** No counter is reset during shutdown: a queued event may still release it. */
export function releaseIncoming(cells: Int32Array, size: number): void {
  Atomics.sub(cells, Cell.inbound, size);
  Atomics.sub(cells, Cell.inboundMessages, 1);
}

/** Native WebIDL unsigned-short conversion and UTF-8 reason limit, even CLOSED. */
export function closeArguments(code?: number, reason = ""): { code?: number; reason: string } {
  let normalized: number | undefined;
  if (code !== undefined) {
    const number = +code;
    normalized = Number.isFinite(number) ? ((Math.trunc(number) % 65536) + 65536) % 65536 : 0;
    if (normalized !== 1000 && (normalized < 3000 || normalized > 4999)) {
      throw new DOMException("Close code must be 1000 or 3000–4999", "InvalidAccessError");
    }
  }
  const bytes = encoder.encode(`${reason}`);
  if (bytes.byteLength > 123) throw new DOMException("Close reason exceeds 123 UTF-8 bytes", "SyntaxError");
  return { code: normalized, reason: new TextDecoder().decode(bytes) };
}
