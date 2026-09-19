import {
  Cell, LAN_SOCKET_CLOSE_MS, LAN_SOCKET_INIT_MS, LAN_SOCKET_QUEUE_BYTES,
  LAN_SOCKET_QUEUE_MESSAGES, LAN_SOCKET_SHARED_BYTES, closeArguments,
  payloadBytes, releaseIncoming, reserve,
} from "./LanSocketShared";
import type { FromLanWorker, LanPayload, ToLanWorker } from "./LanSocketShared";

/** Deliberately private subset, not a replacement for global WebSocket.
 * Worker mode supports arraybuffer reception only. send() accepts a queue
 * entry, not a delivery ACK; later native-send failures emit error then close. */
export interface LanSocket extends EventTarget {
  readonly url: string;
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: BinaryType;
  addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: ((event: WebSocketEventMap[K]) => void) | null, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

type Events = { open: Event; message: MessageEvent; error: Event; close: CloseEvent };

class WorkerLanSocket extends EventTarget implements LanSocket {
  private state = 0;
  private worker?: Worker;
  private cells?: Int32Array;
  private native?: WebSocket;
  private connectPosted = false;
  private finished = false;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly handlers = new Map<keyof Events, EventListener>();
  private readonly handlerListeners = new Map<keyof Events, EventListener>();

  constructor(readonly url: string) {
    super();
    try {
      this.cells = new Int32Array(new SharedArrayBuffer(LAN_SOCKET_SHARED_BYTES));
      const worker = this.worker = new Worker(new URL("./lan-socket.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = event => this.receive(event.data as FromLanWorker);
      worker.onerror = event => { event.preventDefault(); this.workerFailure("I/O worker error"); };
      worker.onmessageerror = () => this.workerFailure("I/O message decode failed");
      this.timer = setTimeout(() => this.workerFailure("I/O initialization timed out"), LAN_SOCKET_INIT_MS);
      this.post({ type: "init", shared: this.cells.buffer as SharedArrayBuffer });
    } catch {
      // Defer so the caller can install handlers before a possible native error.
      this.stopWorker();
      queueMicrotask(() => this.fallback());
    }
  }

  get readyState(): number { return this.native?.readyState ?? this.state; }
  get bufferedAmount(): number {
    return this.native?.bufferedAmount ?? (this.cells ? Atomics.load(this.cells, Cell.outbound) : 0);
  }
  get binaryType(): BinaryType { return "arraybuffer"; }
  set binaryType(value: BinaryType) {
    if (value !== "arraybuffer") throw new DOMException("LAN requires arraybuffer", "NotSupportedError");
  }

  // Attribute handlers participate in EventTarget order (including reassignment)
  // and native exception reporting, rather than being called outside dispatch.
  private setHandler<K extends keyof Events>(type: K, handler: ((event: Events[K]) => void) | null): void {
    if (typeof handler !== "function") {
      const listener = this.handlerListeners.get(type);
      if (listener) this.removeEventListener(type, listener);
      this.handlers.delete(type);
      this.handlerListeners.delete(type);
    } else {
      this.handlers.set(type, handler as EventListener);
      if (!this.handlerListeners.has(type)) {
        const listener: EventListener = event => this.handlers.get(type)?.call(this, event);
        this.handlerListeners.set(type, listener);
        this.addEventListener(type, listener);
      }
    }
  }
  get onopen(): LanSocket["onopen"] { return this.handlers.get("open") ?? null; }
  set onopen(value: LanSocket["onopen"]) { this.setHandler("open", value); }
  get onmessage(): LanSocket["onmessage"] { return this.handlers.get("message") ?? null; }
  set onmessage(value: LanSocket["onmessage"]) { this.setHandler("message", value); }
  get onerror(): LanSocket["onerror"] { return this.handlers.get("error") ?? null; }
  set onerror(value: LanSocket["onerror"]) { this.setHandler("error", value); }
  get onclose(): LanSocket["onclose"] { return this.handlers.get("close") ?? null; }
  set onclose(value: LanSocket["onclose"]) { this.setHandler("close", value); }

  private post(message: ToLanWorker, transfer: Transferable[] = []): void {
    if (!this.worker) throw new DOMException("I/O worker unavailable", "InvalidStateError");
    this.worker.postMessage(message, transfer);
  }
  private stopWorker(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.worker) return;
    this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = undefined;
  }
  private fallback(): void {
    if (this.finished || this.state !== 0) return;
    this.stopWorker(); // Must happen BEFORE constructing the native link.
    try {
      const socket = this.native = new WebSocket(this.url);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => { this.state = 1; this.dispatchEvent(new Event("open")); };
      socket.onmessage = event => this.dispatchEvent(new MessageEvent("message", { data: event.data, origin: event.origin }));
      socket.onerror = () => this.dispatchEvent(new Event("error"));
      socket.onclose = event => this.finish(event.code, event.reason, event.wasClean);
    } catch { this.fail("Native I/O initialization failed"); }
  }
  private workerFailure(reason: string): void {
    // Once connect was posted a socket MIGHT have opened. Never replace it,
    // even if the main thread has not yet dispatched its open event.
    if (!this.connectPosted && this.state === 0) this.fallback();
    else this.fail(reason);
  }
  private receive(message: FromLanWorker): void {
    if (message.type === "message") {
      try {
        if (!this.finished && this.state === 1) {
          this.dispatchEvent(new MessageEvent("message", { data: message.data, origin: new URL(this.url).origin }));
        }
      } finally {
        // Also release suppressed messages and callbacks that throw/close us.
        releaseIncoming(this.cells!, message.size);
      }
      return;
    }
    if (this.finished) return;
    switch (message.type) {
      case "ready":
        if (this.state !== 0 || this.connectPosted) return;
        clearTimeout(this.timer);
        // postMessage either queues successfully or throws; on throw no connect
        // has been sent, so startup fallback is still safe.
        try { this.post({ type: "connect", url: this.url }); this.connectPosted = true; }
        catch { this.fallback(); }
        break;
      case "connect-failed":
        if (this.state === 0) this.fallback();
        else this.fail("I/O connection cancelled");
        break;
      case "open":
        if (this.state !== 0) return;
        this.state = 1;
        this.dispatchEvent(new Event("open"));
        break;
      case "error": this.dispatchEvent(new Event("error")); break;
      case "failed": this.workerFailure(message.reason); break;
      case "close": this.finish(message.code, message.reason, message.wasClean); break;
    }
  }
  private finish(code: number, reason: string, wasClean = false): void {
    if (this.finished) return;
    this.finished = true;
    this.state = 3;
    this.stopWorker();
    if (this.native) {
      this.native.onopen = this.native.onmessage = this.native.onerror = this.native.onclose = null;
    }
    this.dispatchEvent(new CloseEvent("close", { code, reason, wasClean }));
  }
  private fail(reason: string): void {
    if (this.finished) return;
    this.state = 3;
    this.stopWorker();
    try { this.dispatchEvent(new Event("error")); }
    finally { this.finish(1006, reason); }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.native) { this.native.send(data); return; }
    if (this.state !== 1 || !this.cells || Atomics.load(this.cells, Cell.transportState) !== 1) {
      throw new DOMException("LAN socket is not OPEN", "InvalidStateError");
    }
    let size: number;
    if (typeof data === "string" || data instanceof ArrayBuffer || data instanceof Blob) size = payloadBytes(data);
    else if (ArrayBuffer.isView(data) && data.buffer instanceof ArrayBuffer) size = data.byteLength;
    else throw new TypeError("LAN send requires a string, Blob, ArrayBuffer or non-shared view");
    const cells = this.cells;
    if (!reserve(cells, Cell.outboundMessages, 1, LAN_SOCKET_QUEUE_MESSAGES)) {
      throw new DOMException("LAN send queue full", "QuotaExceededError");
    }
    if (!reserve(cells, Cell.outbound, size, LAN_SOCKET_QUEUE_BYTES)) {
      Atomics.sub(cells, Cell.outboundMessages, 1);
      throw new DOMException("LAN send queue full", "QuotaExceededError");
    }
    Atomics.add(cells, Cell.pendingSend, size);
    try {
      // Copy only the selected view. Transferring the caller's buffer would
      // detach game-owned storage; Blob/string are already immutable.
      let copy: LanPayload;
      if (typeof data === "string" || data instanceof Blob) copy = data;
      else if (data instanceof ArrayBuffer) copy = data.slice(0);
      else {
        const view = data as ArrayBufferView;
        copy = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
      }
      this.post({ type: "send", data: copy, size }, copy instanceof ArrayBuffer ? [copy] : []);
    } catch (error) {
      Atomics.sub(cells, Cell.pendingSend, size);
      Atomics.sub(cells, Cell.outbound, size);
      Atomics.sub(cells, Cell.outboundMessages, 1);
      // Copy/post failure is synchronous and never reported as accepted.
      throw error;
    }
  }

  close(code?: number, reason?: string): void {
    const args = closeArguments(code, reason);
    if (this.finished || this.readyState >= 2) return;
    if (this.native) { this.native.close(args.code, args.reason); return; }
    const connecting = this.state === 0;
    this.state = 2;
    if (this.cells) Atomics.store(this.cells, Cell.closing, 1);
    clearTimeout(this.timer);
    if (connecting) {
      // Covers boot, connect in flight, and a not-yet-delivered open. No native
      // fallback is allowed after a caller cancels. Termination aborts the link.
      this.stopWorker();
      queueMicrotask(() => this.fail("LAN closed while CONNECTING"));
      return;
    }
    this.timer = setTimeout(() => this.fail("LAN close timed out"), LAN_SOCKET_CLOSE_MS);
    try { this.post({ type: "close", ...args }); }
    catch { queueMicrotask(() => this.fail("I/O close failed")); }
  }
}

/** LAN/Steam I/O, paired with negotiated receiver credits at the protocol/relay.
 * Unsupported environments return the real native WebSocket, untouched. */
export function createLanSocket(url: string | URL): LanSocket {
  // Validate synchronously, before any Worker is allocated. Relative URLs are
  // resolved in the caller's realm, not relative to the Worker script.
  let parsed: URL;
  try { parsed = new URL(url, globalThis.location?.href); }
  catch { throw new DOMException("Invalid WebSocket URL", "SyntaxError"); }
  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  if (parsed.protocol === "https:") parsed.protocol = "wss:";
  if (!["ws:", "wss:"].includes(parsed.protocol) || parsed.href.includes("#")) {
    throw new DOMException("Invalid WebSocket URL", "SyntaxError");
  }
  if (globalThis.crossOriginIsolated !== true || typeof SharedArrayBuffer !== "function" ||
      typeof Worker !== "function" || typeof Atomics === "undefined") {
    const socket = new WebSocket(parsed.href);
    socket.binaryType = "arraybuffer";
    return socket;
  }
  return new WorkerLanSocket(parsed.href);
}
