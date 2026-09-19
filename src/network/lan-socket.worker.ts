import { LanDeltaReceiver } from "./LanBinaryDelta.mjs";
import {
  Cell, LAN_SOCKET_QUEUE_BYTES, LAN_SOCKET_QUEUE_MESSAGES, LAN_SOCKET_SHARED_BYTES,
  payloadBytes, releaseIncoming, reserve,
} from "./LanSocketShared";
import type { FromLanWorker, ToLanWorker } from "./LanSocketShared";

// This project compiles workers with lib DOM, not lib WebWorker. Do not merge
// both global libraries or depend on window/document/DedicatedWorkerGlobalScope.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ToLanWorker>) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: FromLanWorker, transfer?: Transferable[]): void;
  close(): void;
};
let cells: Int32Array | undefined;
let socket: WebSocket | undefined;
let ended = false;
let connectStarted = false;
let nativeBuffered = 0;
const deltaReceiver = new LanDeltaReceiver();
let offeredDelta = false, enabledDelta = false, hidden = false;
// Canonical protocol controls always put type first. Inspect only these bounded
// small messages, not every 60Hz input or any multi-megabyte state/design.
function outgoingDeltaControl(data: unknown): void {
  if (typeof data !== "string" || data.length > 4096 || !/^\{"type":"(?:hello|visibility|leave)"/.test(data)) return;
  const m = JSON.parse(data);
  if (m.type === "hello") { offeredDelta = m.binaryDelta === 1 && m.stateCredits === 1; enabledDelta = false; deltaReceiver.reset(); }
  if (m.type === "visibility") { hidden = m.hidden === true; deltaReceiver.reset(); }
  if (m.type === "leave") deltaReceiver.reset();
}
let poll: ReturnType<typeof setTimeout> | undefined;

function post(message: FromLanWorker, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

/** outbound is an atomic mirror of pendingSend + nativeBuffered. Updating the
 * two components then adding ONE delta avoids both torn-read undercounts and
 * resetting a concurrent main-thread reservation. During handoff it can only
 * overestimate. The main thread never spins on a worker-owned lock/seqlock. */
function accountNative(consumed = 0): void {
  const amount = socket?.bufferedAmount ?? 0;
  Atomics.store(cells!, Cell.nativeBuffered, amount);
  if (consumed) Atomics.sub(cells!, Cell.pendingSend, consumed);
  Atomics.add(cells!, Cell.outbound, amount - nativeBuffered - consumed);
  nativeBuffered = amount;
}

function sample(): void {
  poll = undefined;
  if (ended) return;
  accountNative();
  if (nativeBuffered > 0) poll = setTimeout(sample, 4);
}

function fail(reason: string): void {
  if (ended) return;
  ended = true;
  clearTimeout(poll);
  if (cells) Atomics.store(cells, Cell.transportState, 3);
  // Browser close() forbids 1006/1009/1011/1013; internal wire codes are private.
  try { socket?.close(4000, reason); } catch { /* Main thread terminates us. */ }
  try { post({ type: "failed", reason }); } finally { scope.close(); }
}

function connect(url: string): void {
  if (!cells || connectStarted) { fail("Invalid I/O initialization"); return; }
  connectStarted = true;
  if (Atomics.load(cells, Cell.closing)) { scope.close(); return; }
  try {
    socket = new WebSocket(url);
  } catch {
    // Unlike an arbitrary worker error, this proves no connection ever opened.
    ended = true;
    post({ type: "connect-failed" });
    scope.close();
    return;
  }
  socket.binaryType = "arraybuffer";
  socket.onopen = () => {
    if (ended || Atomics.load(cells!, Cell.closing)) return;
    Atomics.store(cells!, Cell.transportState, 1);
    post({ type: "open" });
  };
  socket.onmessage = event => {
    if (ended || Atomics.load(cells!, Cell.closing)) return;
    let data = event.data as string | ArrayBuffer;
    if (typeof data !== "string" && !(data instanceof ArrayBuffer)) {
      fail("Unexpected I/O payload"); return;
    }
    try {
      if (typeof data === "string") {
        if (data.length <= 16384 && data.startsWith('{"type":"welcome"')) {
          const m = JSON.parse(data); enabledDelta = offeredDelta && m.stateCredits === 1 && m.binaryDelta === 1;
          deltaReceiver.reset();
        } else if (data.startsWith('{"type":"match"') || data.startsWith('{"type":"state"')) deltaReceiver.reset();
      } else if (enabledDelta && !hidden) {
        // Restore in the existing I/O worker, before transferring to the render
        // thread. Accounting below uses EXPANDED bytes, not the smaller patch.
        const bytes = deltaReceiver.decode(data);
        data = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
      }
    } catch { fail("Invalid LAN delta baseline"); return; }
    const size = payloadBytes(data);
    if (!reserve(cells!, Cell.inboundMessages, 1, LAN_SOCKET_QUEUE_MESSAGES)) {
      fail("I/O receive queue full"); return;
    }
    if (!reserve(cells!, Cell.inbound, size, LAN_SOCKET_QUEUE_BYTES)) {
      Atomics.sub(cells!, Cell.inboundMessages, 1);
      fail("I/O receive queue full"); return;
    }
    try {
      post({ type: "message", data, size }, data instanceof ArrayBuffer ? [data] : []);
    } catch {
      releaseIncoming(cells!, size);
      fail("I/O receive transfer failed");
    }
  };
  socket.onerror = () => { if (!ended) post({ type: "error" }); };
  socket.onclose = event => {
    if (ended) return;
    ended = true;
    clearTimeout(poll);
    accountNative();
    Atomics.store(cells!, Cell.transportState, 3);
    try {
      post({ type: "close", code: event.code, reason: event.reason, wasClean: event.wasClean });
    } finally { scope.close(); }
  };
}

scope.onmessageerror = () => fail("I/O message decode failed");
scope.onmessage = event => {
  if (ended) return;
  const message = event.data;
  try {
    switch (message.type) {
      case "init":
        if (cells || !(message.shared instanceof SharedArrayBuffer) ||
            message.shared.byteLength !== LAN_SOCKET_SHARED_BYTES) {
          fail("Invalid I/O shared memory"); return;
        }
        cells = new Int32Array(message.shared);
        post({ type: "ready" }); // No socket is constructed until connect arrives.
        break;
      case "connect":
        connect(message.url);
        break;
      case "send": {
        if (!cells || !socket) { fail("I/O send before connect"); return; }
        let failure = false;
        try {
          // Native send silently drops CLOSING/CLOSED data; explicitly reject it.
          if (socket.readyState !== 1) throw new Error("Socket not open");
          outgoingDeltaControl(message.data);
          socket.send(message.data);
        } catch { failure = true; }
        finally {
          accountNative(message.size);
          Atomics.sub(cells, Cell.outboundMessages, 1);
        }
        if (failure) fail("I/O send failed");
        else if (Atomics.load(cells, Cell.outbound) > LAN_SOCKET_QUEUE_BYTES) fail("I/O send queue full");
        else if (nativeBuffered > 0 && poll === undefined) poll = setTimeout(sample, 4);
        break;
      }
      case "close":
        if (cells) Atomics.store(cells, Cell.transportState, 2);
        // Ordered after every earlier send, including when close follows send
        // in the same main-thread task. Do not drop those sends using closing.
        if (socket) socket.close(message.code, message.reason);
        else fail("I/O closed before connect");
        break;
    }
  } catch { fail("I/O worker failed"); }
};
