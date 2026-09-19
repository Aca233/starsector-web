// Experimental Sockets v012 connection owner. NOT enabled by SteamGateway.
// No Steam initialization or global callback replacement. SDK v1.63 reference:
// 494c2d680b9e47bbc369496b57568f44ef2f6796. See native fixture static_asserts.
import { randomBytes } from 'node:crypto';
import { bindSteamSocketsV012 } from './sockets-v012.mjs';
export const SOCKETS_CONNECT_TIMEOUT_MS = 8000;
export const SOCKETS_EVENT_LIMIT = 128;
const MAX_PEERS = 9, MAX_NOTICES = 32;
const validHandle = h => Number.isInteger(h) && h > 0 && h <= 0xffffffff;
const validId = id => typeof id === 'string' && /^[1-9][0-9]{15,19}$/.test(id) && BigInt(id) <= 0xffffffffffffffffn;
const pointer = p => typeof p === 'bigint' && p > 0n;
const int64 = value => typeof value === 'bigint' ? value : Number.isSafeInteger(value) ? BigInt(value) : null;
let tagSequence = (randomBytes(8).readBigUInt64LE() & 0x3fffffffffff0000n) + 1n;
const newTag = () => { if (tagSequence > 0x7fffffffffffffffn) throw Error('Connection tag space exhausted'); return tagSequence++; };
const hubs = new WeakMap();

function readInfo(memory, location, offset = 0) {
  const type = memory.decode(location, offset, 'int32_t'), size = memory.decode(location, offset + 4, 'int32_t');
  const id = type === 16 && size === 8 ? int64(memory.decode(location, offset + 8, 'uint64_t')) : null;
  return {
    remote: id !== null && validId(String(id)) ? String(id) : null,
    tag: int64(memory.decode(location, offset + 136, 'int64_t')),
    listener: memory.decode(location, offset + 144, 'uint32_t'),
    state: memory.decode(location, offset + 176, 'int32_t'),
    endReason: memory.decode(location, offset + 180, 'int32_t'),
    flags: memory.decode(location, offset + 440, 'int32_t'),
  };
}
function callbackHub(memory) {
  let hub = hubs.get(memory);
  if (hub) return hub;
  // ONE registered trampoline per native memory runtime, kept for process life.
  // Steam may still have a callback queued after CloseConnection/CloseListen.
  // Unregistering at room close would create a use-after-unregister. Closed
  // managers are not retained; only the current owner is referenced by this hub.
  hub = { active: null, sealed: false, callback: null };
  const type = memory.proto('StarsectorSocketStateV012', 'void', ['void *']);
  hub.callback = memory.register(address => {
    const owner = hub.active;
    if (!owner) return;
    try {
      if (!pointer(address)) throw Error('Invalid callback');
      const event = { handle: memory.decode(address, 0, 'uint32_t'), ...readInfo(memory, address, 8) };
      // Copy only bounded scalar metadata. No SDK calls, application dispatch,
      // logging, native pointer retention or JS exceptions across the callback.
      owner.enqueue(event);
    } catch { hub.sealed = true; owner.ownershipUncertain = true; owner.failure = 'callback-decode-failed'; }
  }, memory.pointer(type));
  if (!pointer(hub.callback)) throw Error('Native callback registration failed');
  hubs.set(memory, hub);
  return hub;
}
function options(callback, tag) {
  const out = Buffer.alloc(32); // Two Win64 SteamNetworkingConfigValue_t (16B each).
  out.writeInt32LE(201, 0); out.writeInt32LE(5, 4); out.writeBigUInt64LE(callback, 8);
  out.writeInt32LE(40, 16); out.writeInt32LE(2, 20); out.writeBigInt64LE(tag, 24);
  return out;
}

export function bindSteamSocketsLifecycleV012(library, memory, { io = bindSteamSocketsV012(library, memory), statusReader = null } = {}) {
  const api = {
    sockets: library.func('void *SteamAPI_SteamNetworkingSockets_SteamAPI_v012()'),
    listen: library.func('uint32_t SteamAPI_ISteamNetworkingSockets_CreateListenSocketP2P(void *self, int port, int count, const void *options)'),
    connect: library.func('uint32_t SteamAPI_ISteamNetworkingSockets_ConnectP2P(void *self, const void *identity, int port, int count, const void *options)'),
    accept: library.func('int SteamAPI_ISteamNetworkingSockets_AcceptConnection(void *self, uint32_t connection)'),
    close: library.func('bool SteamAPI_ISteamNetworkingSockets_CloseConnection(void *self, uint32_t connection, int reason, const char *debug, bool linger)'),
    closeListen: library.func('bool SteamAPI_ISteamNetworkingSockets_CloseListenSocket(void *self, uint32_t listener)'),
    setTag: library.func('bool SteamAPI_ISteamNetworkingSockets_SetConnectionUserData(void *self, uint32_t connection, int64_t tag)'),
    info: library.func('bool SteamAPI_ISteamNetworkingSockets_GetConnectionInfo(void *self, uint32_t connection, void *info)'),
    callbacks: library.func('void SteamAPI_ISteamNetworkingSockets_RunCallbacks(void *self)'),
    identity: library.func('void SteamAPI_SteamNetworkingIdentity_SetSteamID64(void *identity, uint64_t remote)'),
  };
  if (statusReader !== null && typeof statusReader !== 'function') throw Error('Invalid native status reader');
  return new SocketRoomOwner(api, memory, io, statusReader);
}

class SocketRoomOwner {
  constructor(api, memory, io, statusReader) {
    this.statusReader = statusReader;
    this.api = api; this.memory = memory; this.io = io; this.state = 'new'; this.sockets = null; this.hub = null;
    this.listener = 0; this.scopeTag = null; this.creating = null; this.records = new Map(); this.byPeer = new Map();
    this.events = new Map(); this.notices = []; this.busy = false; this.failure = null; this.ownershipUncertain = false; this.creatingNative = false;
    this.stats = { connected: 0, disconnected: 0, rejected: 0, staleCallbacks: 0, coalesced: 0, timeouts: 0 };
  }
  open({ sdkInitialized = false, localId, ownerId, scope, port = 14711, allowed, isCurrent } = {}) {
    if (this.state !== 'new') throw Error('Connection manager is single-use');
    if (sdkInitialized !== true || !validId(localId) || !validId(ownerId) || !validId(scope)
      || !Number.isInteger(port) || port < 0 || port > 65535 || typeof allowed !== 'function' || typeof isCurrent !== 'function') throw Error('Initialized SDK and valid room guards required');
    const hub = callbackHub(this.memory);
    if (hub.active || hub.sealed) throw Error('Native socket owner occupied or quarantined');
    this.hub = hub; hub.active = this;
    this.localId = localId; this.ownerId = ownerId; this.scope = scope; this.port = port;
    this.allowed = allowed; this.isCurrent = isCurrent; this.scopeTag = newTag(); this.state = 'opening';
    try {
      if (!this.current()) throw Error('Room changed');
      this.sockets = this.api.sockets(); if (!pointer(this.sockets)) throw Error('Sockets unavailable');
      this.creatingNative = true;
      this.io.open({ sdkInitialized: true, allowed: remote => this.authorized(remote) });
      this.creatingNative = false;
      if (localId === ownerId) {
        this.creating = { kind: 'listen', tag: this.scopeTag };
        this.creatingNative = true;
        this.listener = this.api.listen(this.sockets, port, 2, options(hub.callback, this.scopeTag));
        this.creatingNative = false; this.creating = null;
        if (!validHandle(this.listener)) throw Error('Listener unavailable');
      }
      this.state = 'open';
    } catch {
      this.ownershipUncertain ||= this.creatingNative; this.creatingNative = false;
      this.creating = null; this.close(); throw Error('Native room open failed');
    }
  }
  current() { try { return this.isCurrent?.() === true; } catch { return false; } }
  authorized(remote) {
    try { return this.current() && validId(remote) && remote !== this.localId && (this.localId === this.ownerId || remote === this.ownerId) && this.allowed(remote) === true; }
    catch { return false; }
  }
  enqueue(event) {
    if (!['opening','open'].includes(this.state) || this.failure || !validHandle(event.handle)) return;
    const record = this.records.get(event.handle);
    const existing = record && (event.tag === record.tag || record.inbound && event.tag === this.scopeTag);
    const incoming = this.localId === this.ownerId && event.tag === this.scopeTag
      && (event.listener === this.listener && this.listener !== 0 || this.creating?.kind === 'listen');
    const dialing = this.creating?.kind === 'connect' && event.tag === this.creating.tag;
    if (!existing && !incoming && !dialing) { this.stats.staleCallbacks++; return; }
    if (this.events.has(event.handle)) this.stats.coalesced++;
    else if (this.events.size >= SOCKETS_EVENT_LIMIT) { this.failure = 'callback-queue-overflow'; return; }
    this.events.set(event.handle, event);
  }
  fresh(h) {
    const data = Buffer.alloc(696);
    return this.api.info(this.sockets, h, data) ? readInfo(this.memory, data) : null;
  }
  notice(value) {
    if (this.notices.length >= MAX_NOTICES) { this.failure = 'notice-queue-overflow'; return; }
    this.notices.push(value);
  }
  record(h, remote, tag, inbound, now) {
    const ticket = Object.freeze({ handle: h, lease: String(tag), remote, scope: this.scope });
    const record = { h, remote, tag, inbound, since: now, ready: false, nextAudit: 0, ticket };
    this.records.set(h, record); this.byPeer.set(remote, record); return record;
  }
  connect(now = performance.now()) {
    if (this.state !== 'open' || this.busy || this.failure || this.localId === this.ownerId || !this.authorized(this.ownerId) || this.byPeer.has(this.ownerId)) return null;
    const tag = newTag(), identity = Buffer.alloc(136);
    this.busy = true; this.creating = { kind: 'connect', tag };
    try {
      this.api.identity(identity, BigInt(this.ownerId));
      this.creatingNative = true;
      const h = this.api.connect(this.sockets, identity, this.port, 2, options(this.hub.callback, tag));
      this.creatingNative = false;
      if (!validHandle(h)) return null;
      // If a handle somehow collides, do not replace/close an existing owner's
      // connection. A process quarantine is safer than guessing ownership.
      if (this.records.has(h)) { this.ownershipUncertain = true; this.failure = 'native-handle-collision'; return null; }
      return this.record(h, this.ownerId, tag, false, now).ticket;
    } catch { this.ownershipUncertain ||= this.creatingNative; this.creatingNative = false; this.failure = 'native-connect-failed'; return null; }
    finally { this.creating = null; this.busy = false; }
  }
  matching(ticket) {
    const record = this.records.get(ticket?.handle);
    return record && ticket.lease === String(record.tag) && ticket.remote === record.remote && ticket.scope === this.scope ? record : null;
  }
  drop(record, reason, info = this.fresh(record.h)) {
    // Remove local associations BEFORE native calls that can enqueue callbacks.
    this.records.delete(record.h); if (this.byPeer.get(record.remote) === record) this.byPeer.delete(record.remote);
    this.events.delete(record.h);
    const ours = info?.tag === record.tag;
    if (ours) {
      try { this.io.detach(record.h); } catch { this.ownershipUncertain = true; this.failure = 'native-detach-failed'; }
      if (!this.api.close(this.sockets, record.h, 1000, 'Starsector transport closed', false)) { this.ownershipUncertain = true; this.failure = 'native-close-failed'; }
    } else {
      // The native handle was invalidated/reused: never SetPollGroup/Close a
      // foreign connection merely because an OLD callback named that handle.
      this.io.forget(record.h);
    }
    this.stats.disconnected++;
    this.notice({ type: 'disconnected', ticket: record.ticket, reason,
      nativeEndReason: Number.isInteger(info?.endReason) && info.endReason >= 0 && info.endReason <= 65535 ? info.endReason : null });
  }
  disconnect(ticket) {
    if (this.state !== 'open' || this.busy) return false;
    const record = this.matching(ticket); if (!record) return false;
    this.busy = true;
    try { this.drop(record, 'local-close'); return !this.failure; }
    catch { this.ownershipUncertain = true; this.failure = 'native-close-failed'; return false; }
    finally { this.busy = false; }
  }
  incoming(event, now) {
    const info = this.fresh(event.handle);
    if (!info || this.localId !== this.ownerId || info.listener !== this.listener || info.tag !== this.scopeTag) return;
    if (!this.authorized(info.remote) || info.state !== 1 || this.byPeer.has(info.remote) || this.records.size >= MAX_PEERS) {
      this.stats.rejected++;
      if (!this.api.close(this.sockets, event.handle, 1000, 'Starsector session rejected', false)) { this.ownershipUncertain = true; this.failure = 'native-close-failed'; }
      return;
    }
    const record = this.record(event.handle, info.remote, newTag(), true, now);
    if (!this.api.setTag(this.sockets, record.h, record.tag)) {
      // setTag may fail without updating the inherited scope tag. The handle
      // still belongs to OUR listener and must not be left pending forever.
      this.records.delete(record.h); this.byPeer.delete(record.remote);
      const current = this.fresh(record.h);
      if (current?.listener === this.listener && current.tag === this.scopeTag
        && !this.api.close(this.sockets, record.h, 1000, 'Starsector session rejected', false)) { this.ownershipUncertain = true; this.failure = 'native-close-failed'; }
      this.stats.rejected++; return;
    }
    if (this.api.accept(this.sockets, record.h) !== 1) this.drop(record, 'native-accept-failed');
  }
  reconcile(record, now) {
    record.nextAudit = now + 250;
    const info = this.fresh(record.h);
    if (!info || info.tag !== record.tag) { this.drop(record, 'native-ownership-lost', info); return; }
    if (!this.authorized(record.remote)) { this.drop(record, 'peer-left', info); return; }
    if (info.remote !== record.remote && (info.remote !== null || ![1,2].includes(info.state))
      || info.listener !== (record.inbound ? this.listener : 0)) { this.drop(record, 'native-peer-mismatch', info); return; }
    // Callback state can be arbitrarily old; use the CURRENT native state only.
    if (info.state === 3) {
      if (info.flags & 3) { this.drop(record, 'native-not-authenticated', info); return; }
      if (!record.ready) {
        if (!this.io.attach(record.h, record.remote)) { this.drop(record, 'native-attach-failed', info); return; }
        record.ready = true; this.stats.connected++; this.notice({ type: 'connected', ticket: record.ticket });
      }
    } else if ([1,2].includes(info.state) && !record.ready) {
      if (now - record.since > SOCKETS_CONNECT_TIMEOUT_MS) { this.stats.timeouts++; this.drop(record, 'native-connect-timeout', info); }
    } else this.drop(record, 'native-connection-ended', info);
  }
  poll(now = performance.now()) {
    if (this.busy) return [];
    if (this.state !== 'open') return this.notices.splice(0);
    this.busy = true;
    try {
      if (!this.current()) this.failure = 'room-changed';
      if (!this.failure) this.api.callbacks(this.sockets);
      if (!this.failure) {
        const events = [...this.events.values()]; this.events.clear();
        for (const event of events) if (!this.records.has(event.handle)) this.incoming(event, now);
        const changed = new Set(events.map(event => event.handle));
        for (const record of [...this.records.values()]) {
          if (changed.has(record.h) || now >= record.nextAudit || !record.ready && now - record.since > SOCKETS_CONNECT_TIMEOUT_MS) this.reconcile(record, now);
        }
        if (!this.io.diagnostics().available) this.failure ??= 'native-transport-unavailable';
      }
    } catch { this.ownershipUncertain = true; this.failure = 'native-poll-failed'; }
    finally { this.busy = false; }
    if (this.failure) {
      const reason = this.failure; this.close();
      // Faults must be delivered even when a consumer let the notice queue fill.
      if (this.notices.length >= MAX_NOTICES) this.notices.length = MAX_NOTICES - 1;
      this.notices.push({ type: 'error', reason });
    }
    return this.notices.splice(0);
  }
  send(ticket, data, kind) {
    const record = this.matching(ticket);
    if (this.state !== 'open' || this.busy || this.failure || !record?.ready || !this.authorized(record.remote)) return { status: 'error', reason: 'connection-not-ready' };
    return this.io.send(record.h, data, kind);
  }
  sample(ticket) {
    const record = this.matching(ticket);
    if (!this.statusReader) return { available: false, reason: 'status-not-installed' };
    if (this.state !== 'open' || this.busy || this.failure || !record?.ready || !this.authorized(record.remote)) return { available: false, reason: 'connection-not-ready' };
    this.busy = true;
    try {
      const info = this.fresh(record.h);
      if (!info || info.tag !== record.tag) {
        this.drop(record, 'native-ownership-lost', info);
        return { available: false, reason: 'native-ownership-lost' };
      }
      if (info.remote !== record.remote || info.listener !== (record.inbound ? this.listener : 0) || info.flags & 3 || info.state !== 3) {
        this.drop(record, 'native-peer-changed', info);
        return { available: false, reason: 'native-peer-changed' };
      }
      return this.statusReader(this.sockets, record.h);
    } catch {
      // A failing read never becomes fabricated zero-queue credit. Let poll
      // execute the same owned cleanup/quarantine path as other native errors.
      this.ownershipUncertain = true; this.failure = 'native-status-read-failed';
      return { available: false, reason: this.failure };
    } finally { this.busy = false; }
  }
  receive() {
    if (this.state !== 'open' || this.busy || this.failure || !this.current()) return [];
    return this.io.receive().flatMap(message => {
      const record = this.records.get(message.connection);
      return record?.ready && record.remote === message.remote && this.authorized(record.remote) ? [{ ticket: record.ticket, kind: message.kind, data: message.data }] : [];
    });
  }
  close() {
    if (this.busy) return false;
    if (this.state === 'closed') return !this.hub?.sealed;
    this.state = 'closing';
    if (this.hub?.active === this) this.hub.active = null;
    this.events.clear(); this.creating = null;
    let okay = !this.ownershipUncertain;
    for (const record of [...this.records.values()]) {
      try { this.drop(record, 'room-closed'); } catch { okay = false; this.io.forget(record.h); }
    }
    // CloseListenSocket also closes unaccepted connections we could not retain
    // after callback overflow. This does not alter someone else's global handler.
    if (this.listener) { try { if (!this.api.closeListen(this.sockets, this.listener)) okay = false; } catch { okay = false; } }
    this.listener = 0; this.records.clear(); this.byPeer.clear();
    try { if (!this.io.close()) okay = false; } catch { okay = false; }
    // Cleanup itself can discover ambiguous ownership, and a later queue fault
    // can replace its error text. Never decide quarantine from the text alone.
    if (this.ownershipUncertain || this.hub?.sealed) okay = false;
    if (this.hub && !okay) this.hub.sealed = true;
    this.sockets = null; this.allowed = null; this.isCurrent = null; this.state = 'closed';
    return okay;
  }
  diagnostics() { return { state: this.state, role: this.localId === this.ownerId ? 'host' : 'guest', connections: this.records.size,
    queuedCallbacks: this.events.size, queuedNotices: this.notices.length, failure: this.failure, ...this.stats }; }
}
