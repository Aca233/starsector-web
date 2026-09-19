// Experimental only: injected into SteamGateway by offline fixtures. No native
// loading/Steam initialization here; lifecycle is the sole native handle owner.
import { EventEmitter } from 'node:events';
import protocol from '../../src/network/protocol.json' with { type: 'json' };
import { SteamSocketSession } from './sockets-session.mjs';
import { SteamSocketStateCodec } from './sockets-state-codec.mjs';
import { SteamSnapshotEncoder } from './snapshot-delta.mjs';
import { SteamSocketFlightBudget } from './sockets-flight-budget.mjs';
import { SteamSocketRoomPacer } from './sockets-room-pacer.mjs';
import { SocketWireBudget } from './sockets-wire.mjs';
import { replaceableInput } from './reliable-queue.mjs';

const MAX_PRE_READY = 64 * 1024, MAX_PRE_MESSAGES = 32;
const MAX_BROWSER_BYTES = protocol.maxSnapshotBytes * 2;
const CLOSE_CODES = new Set([1000, 1001, 1008, 1009, 1013, 4001, 4003]);
const sameTicket = (a, b) => a && b && ['handle', 'lease', 'remote', 'scope'].every(k => a[k] === b[k]);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function closeReason(value) {
  let text = '';
  for (const c of String(value ?? 'Connection closed')) {
    if (Buffer.byteLength(text + c) > 100) break;
    text += c;
  }
  return text;
}
// Mirrors the relay's current match, not the arrival order of the state lane.
// An old in-flight state must never resurrect a finished or replaced match.
function matchAfter(current, value) {
  if (value.type === 'match') return value.match?.id ?? null;
  if (value.type === 'room') return ['loading', 'running'].includes(value.room?.status) ? value.room.match?.id ?? null : null;
  if (['ended', 'roomClosed', 'left'].includes(value.type)) return null;
  return current;
}
class SocketRelayPeer extends EventEmitter {
  constructor(room, record) {
    super(); this.room = room; this.record = record; this.readyState = 1;
  }
  get bufferedAmount() { return this.record.session.controlBytes; }
  // Session coalesces only ONE latest state. Allow the relay to replace that
  // value instead of replaying an obsolete unsent snapshot after congestion.
  get snapshotWritable() { return this.readyState === 1 && !this.record.closing; }
  send(text) {
    if (this.readyState !== 1) return;
    try {
      if (typeof text !== 'string' || Buffer.byteLength(text) > protocol.maxSnapshotBytes) throw Error('Invalid relay message');
      const value = JSON.parse(text);
      if (!object(value) || typeof value.type !== 'string') throw Error('Invalid relay message');
      if (value.type === 'state') {
        if (value.matchId !== this.record.match) return;
        if (this.record.session.offerState(text, this.room.now()).status !== 'queued') throw Error('Invalid relay state');
      } else {
        const match = matchAfter(this.record.match, value);
        if (match !== this.record.match) this.record.session.suspendStates();
        this.record.match = match;
        if (!this.record.session.sendControl({ type: 'app', data: value })) throw Error('Relay send failed');
      }
    } catch { this.room.drop(this.record, 1013, 'Relay send failed'); }
  }
  // Wire heartbeats run independently of relay timers. A relay pong is emitted
  // ONLY after a matching remote pong for an actually admitted wire ping.
  ping() {}
  close(code = 1000, reason = 'Connection closed') { this.room.beginClose(this.record, code, reason); }
  terminate() { this.room.drop(this.record, 1013, 'Steam link stalled'); }
  finish(code, reason) {
    if (this.readyState === 3) return;
    this.readyState = 3; this.emit('close', code, Buffer.from(reason));
  }
  diagnostics() { return this.record.session.diagnostics(); }
}
export class SteamSocketRoom {
  constructor({ lifecycle, localId, ownerId, scope, build, gameProtocol = protocol.version, appId = 480,
    allowed, isCurrent, acceptTransport, onClosed = () => {}, now = () => performance.now() }) {
    if (!lifecycle || ['open', 'connect', 'poll', 'receive', 'send', 'sample', 'disconnect', 'close'].some(k => typeof lifecycle[k] !== 'function')
      || [allowed, isCurrent, acceptTransport, onClosed, now].some(f => typeof f !== 'function')) throw Error('Invalid socket room adapter');
    Object.assign(this, { lifecycle, localId, ownerId, scope, build, gameProtocol, appId, allowed, isCurrent, acceptTransport, onClosed, now });
    this.host = localId === ownerId; this.records = new Map(); this.browser = null; this.pending = null;
    this.closed = false; this.busy = false; this.wireBudget = new SocketWireBudget();
    // Immutable broadcast preparation is shared; framing/nonces and anchors
    // remain per-session. A departing peer must not clear another peer's cache.
    this.encoder = new SteamSnapshotEncoder(); this.codec = new SteamSocketStateCodec();
    this.flightBudget = new SteamSocketFlightBudget({ inputOnly: !this.host });
    this.pacer = new SteamSocketRoomPacer({ sample: ticket => { const status = lifecycle.sample(ticket); const r = this.record(ticket); if (r) this.flightBudget.observeNative(r.session, status, this.now()); return status; } });
    this.stats = { receivedStates: 0, skippedBrowserStates: 0, staleTickets: 0 };
    try { lifecycle.open({ sdkInitialized: true, localId, ownerId, scope, allowed, isCurrent }); }
    catch (error) { lifecycle.close(); this.closed = true; throw error; }
  }
  current() { try { return !this.closed && this.isCurrent() === true; } catch { return false; } }
  permitted(remote) { try { return this.current() && this.allowed(remote) === true; } catch { return false; } }
  record(ticket) { const r = this.records.get(ticket?.remote); return sameTicket(r?.session.ticket, ticket) ? r : null; }
  attachBrowser(ws) {
    if (!this.current() || this.host) { ws.close(1008, 'Invalid Steam guest'); return; }
    if (this.browser?.ws.readyState === 1) { ws.close(4001, 'Browser already connected'); return; }
    // Retire any previous browser lease BEFORE dialing another native handle.
    for (const r of [...this.records.values()]) this.drop(r, 1001, 'Browser replaced');
    if (this.pending) this.lifecycle.disconnect(this.pending);
    const browser = { ws, queue: [], bytes: 0, ticket: null, since: this.now(), writing: false, writeSince: null };
    this.browser = browser; this.pending = null;
    ws.on('error', () => { if (this.browser === browser) this.detachBrowser(browser); });
    ws.on('close', () => this.detachBrowser(browser));
    ws.on('message', (raw, binary) => {
      if (this.browser !== browser || !this.current() || ws.readyState !== 1) return;
      if (binary) { this.failBrowser(browser, 1008, 'Text messages only'); return; }
      try {
        const bytes = Buffer.byteLength(raw), text = raw.toString();
        if (bytes > protocol.maxSnapshotBytes) { this.failBrowser(browser, 1009, 'Message too large'); return; }
        const data = JSON.parse(text);
        if (!object(data) || typeof data.type !== 'string') throw Error('Invalid application message');
        const r = this.record(browser.ticket);
        if (r?.closing) return;
        if (r?.session.state === 'ready') {
          if (!r.session.sendControl({ type: 'app', data }, { coalesce: replaceableInput(text) })) throw Error('Send failed');
        } else {
          if (browser.queue.length >= MAX_PRE_MESSAGES || browser.bytes + bytes > MAX_PRE_READY) throw Error('Pre-ready queue full');
          browser.queue.push(data); browser.bytes += bytes;
        }
      } catch { this.failBrowser(browser, 1008, 'Invalid or excessive messages'); }
    });
    try { browser.ticket = this.pending = this.lifecycle.connect(this.now()); }
    catch { /* fail closed, no retry of uncertain native ownership */ }
    if (!browser.ticket) this.failBrowser(browser, 1013, 'Steam connection failed');
  }
  detachBrowser(browser) {
    if (this.browser !== browser) return;
    this.browser = null; browser.queue.length = 0; browser.bytes = 0;
    if (sameTicket(this.pending, browser.ticket)) { this.lifecycle.disconnect(this.pending); this.pending = null; }
    const r = this.record(browser.ticket); if (r) this.drop(r, 1001, 'Browser disconnected');
  }
  failBrowser(browser, code, reason) {
    if (!browser || this.browser !== browser) return;
    this.detachBrowser(browser);
    if (browser.ws.readyState === 1) browser.ws.close(code, closeReason(reason));
  }
  add(ticket, now) {
    if (!ticket || ticket.scope !== this.scope || !this.permitted(ticket.remote) || !this.host && !sameTicket(ticket, this.pending)) {
      // lifecycle owns this notice's ticket; disconnect only through its lease guard.
      if (ticket) this.lifecycle.disconnect(ticket); return;
    }
    const old = this.records.get(ticket.remote);
    if (old) {
      if (sameTicket(old.session.ticket, ticket)) return;
      this.drop(old, 1001, 'Native connection replaced');
    }
    if (this.records.size >= 9) { this.lifecycle.disconnect(ticket); return; }
    const session = new SteamSocketSession({ transport: this.lifecycle, ticket, localId: this.localId, ownerId: this.ownerId,
      build: this.build, gameProtocol: this.gameProtocol, wireBudget: this.wireBudget, flightBudget: this.flightBudget, encoder: this.encoder, codec: this.codec });
    const r = { session, peer: null, match: null, closing: null, pongs: 0 };
    this.records.set(ticket.remote, r); session.start(now);
    if (!this.host) this.pending = null;
  }
  beginClose(r, code, reason) {
    if (r.closing || !this.record(r.session.ticket)) return;
    code = CLOSE_CODES.has(code) ? code : 1013; reason = closeReason(reason);
    r.peer?.finish(code, reason); r.match = null; r.session.suspendStates();
    // Keep native ownership until the peer acknowledges the close envelope.
    // Never infer delivery from local SDK admission or extend this deadline.
    r.closing = { code, reason, since: this.now() };
    if (!r.session.sendControl({ type: 'close', code, reason })) this.drop(r, code, reason);
  }
  drop(r, code = 1013, reason = 'Steam connection closed') {
    if (!this.record(r.session.ticket)) return;
    this.records.delete(r.session.ticket.remote);
    r.session.close('adapter-close'); r.peer?.finish(code, closeReason(reason));
    const browser = this.browser;
    if (browser && sameTicket(browser.ticket, r.session.ticket)) this.failBrowser(browser, code, reason);
  }
  sendBrowser(r, data, state = false) {
    const browser = this.browser;
    if (!browser || !sameTicket(browser.ticket, r.session.ticket) || browser.ws.readyState !== 1 || r.closing) return;
    const ws = browser.ws, text = JSON.stringify(data);
    if (ws.bufferedAmount + Buffer.byteLength(text) > MAX_BROWSER_BYTES) { this.failBrowser(browser, 1013, 'Browser too slow'); return; }
    // No retained queue of decoded megabyte states. Network ACK means native
    // receipt only; presentation remains separately bounded at localhost.
    if (state && (browser.writing || ws.bufferedAmount > 0)) { this.stats.skippedBrowserStates++; return; }
    if (state) { browser.writing = true; browser.writeSince = this.now(); }
    try {
      ws.send(text, error => {
        if (this.browser !== browser) return;
        if (state) { browser.writing = false; browser.writeSince = null; }
        if (error) this.failBrowser(browser, 1013, 'Browser send failed');
      });
      if (state) this.stats.receivedStates++;
    } catch { this.failBrowser(browser, 1013, 'Browser send failed'); }
  }
  events(r) {
    for (const event of r.session.takeEvents()) {
      if (!this.record(r.session.ticket)) break;
      if (event.type === 'closed') { this.stats.lastFailure = String(event.reason).slice(0, 80); this.drop(r, r.closing?.code ?? 1013, r.closing?.reason ?? 'Steam link stalled'); break; }
      if (event.type === 'ready') {
        if (this.host) {
          r.peer = new SocketRelayPeer(this, r);
          this.acceptTransport(r.peer, { identity: r.session.ticket.remote, scope: this.scope, canHost: false, appId: this.appId });
        } else if (sameTicket(this.browser?.ticket, r.session.ticket)) {
          const browser = this.browser;
          for (const data of browser.queue.splice(0)) if (!r.session.sendControl({ type: 'app', data })) { this.drop(r); break; }
          browser.bytes = 0;
        }
      } else if (event.type === 'state') {
        if (!this.host && event.data.matchId === r.match) this.sendBrowser(r, event.data, true);
      } else if (event.type === 'control') {
        const value = event.data;
        if (value.type === 'closeAck' && r.closing && !r.closing.remote) { this.drop(r, r.closing.code, r.closing.reason); break; }
        if (value.type === 'close') {
          if (!CLOSE_CODES.has(value.code) || typeof value.reason !== 'string' || Buffer.byteLength(value.reason) > 100) { this.drop(r); break; }
          r.peer?.finish(value.code, value.reason);
          // Close browser without letting its close listener tear down native
          // ownership before closeAck has had a bounded admission opportunity.
          const browser = this.browser;
          if (browser && sameTicket(browser.ticket, r.session.ticket)) {
            this.browser = null; browser.queue.length = 0; browser.bytes = 0;
            if (browser.ws.readyState === 1) browser.ws.close(value.code, value.reason);
          }
          r.match = null; r.session.suspendStates();
          if (!r.closing) {
            r.closing = { code: value.code, reason: value.reason, since: this.now(), remote: true };
            if (!r.session.sendControl({ type: 'closeAck' })) this.drop(r);
          }
          continue;
        }
        if (r.closing) continue;
        if (value.type !== 'app' || !object(value.data) || typeof value.data.type !== 'string' || value.data.type === 'state') { this.drop(r); break; }
        if (this.host) r.peer?.emit('message', Buffer.from(JSON.stringify(value.data)), false);
        else {
          r.match = matchAfter(r.match, value.data);
          this.sendBrowser(r, value.data);
        }
      }
    }
    if (r.peer?.readyState === 1 && r.session.stats.matchedPongs > r.pongs) {
      r.pongs = r.session.stats.matchedPongs; r.peer.emit('pong');
    }
  }
  poll() {
    if (this.closed) return;
    if (this.busy) throw Error('Socket room poll is not reentrant');
    this.busy = true;
    try {
      if (!this.current()) { this.close(); return; }
      const now = this.now();
      for (const notice of this.lifecycle.poll(now)) {
        if (notice.type === 'error') { this.close(1013, 'Steam native transport failed'); return; }
        if (notice.type === 'connected') this.add(notice.ticket, now);
        if (notice.type === 'disconnected') {
          const r = this.record(notice.ticket);
          if (r) this.drop(r, r.closing?.code, r.closing?.reason);
          else if (sameTicket(notice.ticket, this.pending)) this.failBrowser(this.browser, 1013, 'Steam connection failed');
        }
      }
      for (const r of [...this.records.values()]) if (!this.permitted(r.session.ticket.remote)) this.drop(r, 1008, 'Steam member left');
      for (const message of this.lifecycle.receive()) {
        const r = this.record(message.ticket);
        if (r) { r.session.receive(message, now); this.events(r); } else this.stats.staleTickets++;
      }
      this.pacer.tick([...this.records.values()].map(r => r.session), now);
      for (const r of [...this.records.values()]) {
        this.events(r);
        if (r.closing && now - r.closing.since > 2000) this.drop(r, r.closing.code, r.closing.reason);
      }
      const b = this.browser;
      if (b && (this.pending && now - b.since > 8000 || b.writeSince !== null && now - b.writeSince > 8000)) this.failBrowser(b, 1013, 'Steam link stalled');
    } catch { this.close(1013, 'Steam transport adapter failed'); }
    finally { this.busy = false; }
  }
  diagnostics() {
    return { closed: this.closed, peers: [...this.records.values()].map(r => r.session.diagnostics()),
      preReadyBytes: this.browser?.bytes ?? 0, reassemblyBytes: this.wireBudget.bytes, pacer: this.pacer.diagnostics(), flight: this.flightBudget.diagnostics(), ...this.stats };
  }
  close(code = 1000, reason = 'Left Steam lobby') {
    if (this.closed) return;
    this.closed = true;
    for (const r of [...this.records.values()]) this.drop(r, code, reason);
    if (this.browser) this.failBrowser(this.browser, code, reason);
    this.lifecycle.close(); this.pending = null; this.pacer.clear(); this.flightBudget.clear(); this.encoder.clear(); this.codec.clear(); this.onClosed(code, closeReason(reason));
  }
}
