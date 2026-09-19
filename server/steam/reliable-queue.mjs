// Application ACKs bound bytes handed to Steam's otherwise opaque reliable queue.
// 32 slots cover 60 Hz at 300+ ms RTT; the byte cap prevents a window of huge frames.
const MAX_MESSAGES = 32, MAX_BYTES = 256 * 1024;
export class SteamSendWindow {
  constructor() { this.pending = new Map(); this.bytes = 0; }
  get full() { return this.pending.size >= MAX_MESSAGES || this.bytes >= MAX_BYTES; }
  track(encoded, now = Date.now()) {
    const bytes = encoded.packets.reduce((sum, packet) => sum + packet.length, 0);
    this.pending.set(encoded.id, { bytes, since: now }); this.bytes += bytes;
  }
  ack(id) {
    const item = this.pending.get(id);
    if (!item) return false;
    this.pending.delete(id); this.bytes -= item.bytes; return true;
  }
  expired(now = Date.now()) {
    const oldest = this.pending.values().next().value;
    return !!oldest && now - oldest.since > 8000;
  }
  clear() { this.pending.clear(); this.bytes = 0; }
}
export function replaceableInput(text) {
  if (Buffer.byteLength(text) > 16384) return null;
  try {
    const m = JSON.parse(text), i = m?.input;
    if (m?.type !== 'input' || typeof m.matchId !== 'string' || typeof m.syncId !== 'string' ||
        !i || !Number.isSafeInteger(i.seq) || i.seq < 0 || !Number.isInteger(i.keys) || i.keys < 0 || i.keys > 255 ||
        typeof i.firing !== 'boolean' || typeof i.pointerActive !== 'boolean' ||
        !Array.isArray(i.aim) || i.aim.length !== 2 || !i.aim.every(n => Number.isFinite(n) && Math.abs(n) <= 100000) ||
        !Array.isArray(i.actions) || i.actions.length !== 0) return null;
    return { scope: JSON.stringify([m.matchId, m.syncId]), seq: i.seq };
  } catch { return null; }
}
/** Coalesce ONLY adjacent unsent movement. Actions/control messages are FIFO barriers. */
export class SteamReliableQueue {
  constructor(send) { this.send = send; this.window = new SteamSendWindow(); this.pending = []; this.bytes = 0; this.coalesced = 0; }
  diagnostics(now = Date.now()) {
    const oldest = this.window.pending.values().next().value;
    return { inflight: this.window.pending.size, inflightBytes: this.window.bytes,
      oldestAckMs: oldest ? now - oldest.since : 0, queued: this.pending.length, queuedBytes: this.bytes, coalesced: this.coalesced };
  }
  enqueue(text) {
    if (!this.window.full && !this.pending.length) { this.window.track(this.send(text)); return; }
    const item = { text, bytes: Buffer.byteLength(text), input: replaceableInput(text) };
    const last = this.pending.at(-1);
    if (item.input && last?.input && item.input.scope === last.input.scope && item.input.seq > last.input.seq) {
      this.bytes += item.bytes - last.bytes; this.pending[this.pending.length - 1] = item; this.coalesced++;
    } else {
      // One oversized control message is allowed, like one oversized snapshot in
      // the send window. Never accumulate many large frames or drop action edges.
      if (this.pending.length >= MAX_MESSAGES || this.bytes >= MAX_BYTES) throw Error('Steam reliable queue full');
      this.pending.push(item); this.bytes += item.bytes;
    }
  }
  ack(id) {
    if (!this.window.ack(id)) return;
    while (this.pending.length && !this.window.full) {
      const item = this.pending[0];
      this.window.track(this.send(item.text));
      this.pending.shift(); this.bytes -= item.bytes;
    }
  }
  clear() { this.window.clear(); this.pending.length = 0; this.bytes = 0; }
}
