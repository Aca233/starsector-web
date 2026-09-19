// Experimental native boundary, NOT imported by SteamGateway. This deliberately
// targets Sockets v012, NOT v013 (whose SendMessages ABI/ownership is different).
// SDK reference: SteamworksSDK 494c2d680b9e47bbc369496b57568f44ef2f6796 (v1.63).
// No Steam initialization, listener/connection creation, arbitrary exports or
// registered JS callbacks here. A future authorized connection manager owns those.
export const SOCKETS_V012_ABI = Object.freeze({
  identityBytes: 136, messageBytes: 216, connectionInfoBytes: 696, pointerBytes: 8,
  data: 0, size: 8, connection: 12, identity: 16, flags: 196, lane: 208,
});
export const SOCKETS_MAX_MESSAGE = 512 * 1024;
export const SOCKETS_LANES = Object.freeze({ control: 0, anchor: 1, snapshot: 2 });
export const SOCKETS_FLAGS = Object.freeze({ reliableNoNagle: 9, unreliableNoDelay: 5 });
const MAX_CONNECTIONS = 10, MAX_BATCH = 16;
const handle = value => Number.isInteger(value) && value > 0 && value <= 0xffffffff;
const steamId = value => typeof value === 'string' && /^[1-9][0-9]{15,19}$/.test(value) && BigInt(value) <= 0xffffffffffffffffn;
const ptr = value => typeof value === 'bigint' && value > 0n && value <= 0xffffffffffffffffn;
const error = reason => ({ status: 'error', reason });

/** Binding is inert. Even accessors are not called until open is explicitly
 * invoked AFTER the process owns a successfully initialized SDK. Memory is Koffi
 * 3-compatible; injection permits the same ownership paths to be tested offline. */
export function bindSteamSocketsV012(library, memory) {
  const api = {
    sockets: library.func('void *SteamAPI_SteamNetworkingSockets_SteamAPI_v012()'),
    utils: library.func('void *SteamAPI_SteamNetworkingUtils_SteamAPI_v004()'),
    createGroup: library.func('uint32_t SteamAPI_ISteamNetworkingSockets_CreatePollGroup(void *self)'),
    destroyGroup: library.func('bool SteamAPI_ISteamNetworkingSockets_DestroyPollGroup(void *self, uint32_t group)'),
    setGroup: library.func('bool SteamAPI_ISteamNetworkingSockets_SetConnectionPollGroup(void *self, uint32_t connection, uint32_t group)'),
    lanes: library.func('int SteamAPI_ISteamNetworkingSockets_ConfigureConnectionLanes(void *self, uint32_t connection, int count, const int *priorities, const uint16_t *weights)'),
    info: library.func('bool SteamAPI_ISteamNetworkingSockets_GetConnectionInfo(void *self, uint32_t connection, void *info)'),
    allocate: library.func('void *SteamAPI_ISteamNetworkingUtils_AllocateMessage(void *self, int bytes)'),
    // v012 takes ownership of EVERY message even for negative send results.
    // Never add v013's bDeleteFailedMessages argument or release after this call.
    send: library.func('void SteamAPI_ISteamNetworkingSockets_SendMessages(void *self, int count, void *messages, void *results)'),
    receive: library.func('int SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnPollGroup(void *self, uint32_t group, void *messages, int count)'),
    identity: library.func('uint64_t SteamAPI_SteamNetworkingIdentity_GetSteamID64(void *identity)'),
    release: library.func('void SteamAPI_SteamNetworkingMessage_t_Release(void *message)'),
  };
  return new SteamSocketsV012(api, memory);
}

class SteamSocketsV012 {
  constructor(api, memory) {
    this.api = api; this.memory = memory; this.sockets = null; this.utils = null; this.group = 0;
    this.connections = new Map(); this.allowed = null; this.faulted = false; this.busy = false;
    this.stats = { accepted: 0, ignored: 0, backpressure: 0, sendErrors: 0, received: 0, discarded: 0, uncertainSends: 0 };
  }
  open({ sdkInitialized = false, allowed } = {}) {
    if (this.sockets || this.faulted) throw Error('Native boundary already opened or faulted');
    if (sdkInitialized !== true || typeof allowed !== 'function') throw Error('Initialized SDK and membership guard required');
    const sockets = this.api.sockets(), utils = this.api.utils();
    if (!ptr(sockets) || !ptr(utils)) throw Error('Native sockets interface unavailable');
    const group = this.api.createGroup(sockets);
    if (!handle(group)) throw Error('Native poll group unavailable');
    this.sockets = sockets; this.utils = utils; this.group = group; this.allowed = allowed;
  }
  authorized(remote) { try { return steamId(remote) && this.allowed?.(remote) === true; } catch { return false; } }
  attach(connection, remote) {
    // Handles must come from the future connection manager after native identity
    // authentication. Lobby membership is rechecked on EVERY send and receive.
    if (!this.sockets || this.faulted || this.busy || !handle(connection) || !this.authorized(remote)) return false;
    if (this.connections.has(connection)) return this.connections.get(connection) === remote;
    if (this.connections.size >= MAX_CONNECTIONS) return false;
    this.busy = true;
    try {
      // Do not trust the manager's handle-to-peer bookkeeping alone. The native
      // peer identity must match; no IP, description or debug text is decoded.
      const info = Buffer.alloc(SOCKETS_V012_ABI.connectionInfoBytes);
      if (!this.api.info(this.sockets, connection, info) || String(this.api.identity(info)) !== remote) return false;
      // Smaller priority value is sent first. Reliable control/input order is
      // lane 0 only; there is NO cross-lane delivery-order promise for anchors.
      if (this.api.lanes(this.sockets, connection, 3, [0, 1, 2], [1, 1, 1]) !== 1) return false;
      if (!this.api.setGroup(this.sockets, connection, this.group)) return false;
      this.connections.set(connection, remote);
      return true;
    } catch { this.faulted = true; return false; }
    finally { this.busy = false; }
  }
  detach(connection) {
    if (this.busy || !this.connections.has(connection)) return false;
    // Membership revocation takes effect even if detaching in the native layer
    // fails. The connection manager must then close its owned connection.
    this.connections.delete(connection);
    return this.api.setGroup(this.sockets, connection, 0);
  }
  // Lifetime owner proved this native handle was invalidated/reused. Remove
  // ONLY its local association; mutating the foreign native handle is unsafe.
  forget(connection) { return !this.busy && this.connections.delete(connection); }
  send(connection, data, kind) {
    if (!this.sockets || this.faulted || this.busy) return error('native-unavailable');
    if (!this.connections.has(connection) || !this.authorized(this.connections.get(connection))) return error('peer-not-authorized');
    if (!Object.hasOwn(SOCKETS_LANES, kind) || !Buffer.isBuffer(data) || !data.length || data.length > SOCKETS_MAX_MESSAGE) return error('invalid-message');
    const reliable = kind !== 'snapshot', { api, memory } = this;
    let message = null, transferred = false;
    this.busy = true;
    try {
      message = api.allocate(this.utils, data.length);
      if (!ptr(message)) return error('allocation-failed');
      const body = memory.decode(message, SOCKETS_V012_ABI.data, 'void *');
      if (!ptr(body) || memory.decode(message, SOCKETS_V012_ABI.size, 'int32_t') !== data.length) throw Error('Invalid allocation');
      // Copy into SDK-owned memory. No pointers into JS buffers and no JS free
      // callback that the native networking thread could call after GC/shutdown.
      memory.encode(body, 'uint8_t', data, data.length);
      memory.encode(message, SOCKETS_V012_ABI.connection, 'uint32_t', connection);
      memory.encode(message, SOCKETS_V012_ABI.flags, 'int32_t', reliable ? SOCKETS_FLAGS.reliableNoNagle : SOCKETS_FLAGS.unreliableNoDelay);
      memory.encode(message, SOCKETS_V012_ABI.lane, 'uint16_t', SOCKETS_LANES[kind]);
      const pointers = Buffer.alloc(8), results = Buffer.alloc(8);
      pointers.writeBigUInt64LE(message);
      transferred = true;
      api.send(this.sockets, 1, pointers, results);
      const result = results.readBigInt64LE();
      if (result > 0n) { this.stats.accepted++; return { status: 'accepted', messageNumber: result.toString() }; }
      if (!reliable && result === -41n) { this.stats.ignored++; return { status: 'dropped', reason: 'native-no-delay' }; }
      if (result === -25n) { this.stats.backpressure++; return { status: 'backpressure', reason: 'native-limit' }; }
      this.stats.sendErrors++;
      return { ...error('native-send-failed'), result: result >= -2147483648n && result <= 0n ? Number(result) : null };
    } catch {
      if (transferred) {
        // A native/FFI exception does not prove ownership returned. Double-free
        // is worse than a single uncertain allocation: stop all further sends.
        this.faulted = true; this.stats.uncertainSends++;
        return error('native-ownership-uncertain');
      }
      this.stats.sendErrors++;
      return error('native-prepare-failed');
    } finally {
      try { if (ptr(message) && !transferred) api.release(message); }
      catch { this.faulted = true; }
      this.busy = false;
    }
  }
  receive() {
    if (!this.sockets || this.faulted || this.busy) return [];
    const { api, memory } = this, pointers = Buffer.alloc(MAX_BATCH * 8), decoded = [];
    let count = 0;
    this.busy = true;
    try {
      count = api.receive(this.sockets, this.group, pointers, MAX_BATCH);
      if (!Number.isInteger(count) || count < 0 || count > MAX_BATCH) throw Error('Native batch invalid');
      const seen = new Set();
      for (let i = 0; i < count; i++) {
        const message = pointers.readBigUInt64LE(i * 8);
        if (!ptr(message) || seen.has(message)) throw Error('Native message invalid');
        seen.add(message);
        const size = memory.decode(message, SOCKETS_V012_ABI.size, 'int32_t');
        const connection = memory.decode(message, SOCKETS_V012_ABI.connection, 'uint32_t');
        const lane = memory.decode(message, SOCKETS_V012_ABI.lane, 'uint16_t');
        const flags = memory.decode(message, SOCKETS_V012_ABI.flags, 'int32_t');
        const remote = this.connections.get(connection);
        const kind = Object.keys(SOCKETS_LANES).find(name => SOCKETS_LANES[name] === lane);
        // Bound length BEFORE copying, and authenticate handle + SDK identity,
        // not a peer id declared inside attacker-controlled message payload.
        if (!remote || !this.authorized(remote) || !Number.isInteger(size) || size <= 0 || size > SOCKETS_MAX_MESSAGE
          || !kind || Boolean(flags & 8) !== (kind !== 'snapshot')
          || String(api.identity(message + BigInt(SOCKETS_V012_ABI.identity))) !== remote) {
          this.stats.discarded++; continue;
        }
        const body = memory.decode(message, SOCKETS_V012_ABI.data, 'void *');
        if (!ptr(body)) { this.stats.discarded++; continue; }
        // A copy, not koffi.view: external ArrayBuffer views are not universally
        // supported by Electron and must never outlive Steam's Release below.
        const data = Buffer.from(memory.decode(body, 'uint8_t', size));
        decoded.push({ connection, remote, kind, data });
      }
      this.stats.received += decoded.length;
      return decoded;
    } catch {
      // Corrupt native output/decoding is not a peer protocol violation. Quarantine
      // the ABI boundary without propagating partial batches or raw native data.
      this.faulted = true;
      return [];
    } finally {
      const released = new Set();
      for (let i = 0; i < MAX_BATCH; i++) {
        const message = pointers.readBigUInt64LE(i * 8);
        if (ptr(message) && !released.has(message)) {
          released.add(message);
          try { api.release(message); } catch { this.faulted = true; }
        }
      }
      this.busy = false;
    }
  }
  close() {
    if (this.busy) return false;
    if (!this.sockets) return true;
    let okay = true;
    for (const connection of this.connections.keys()) {
      try { if (!this.api.setGroup(this.sockets, connection, 0)) okay = false; } catch { okay = false; }
    }
    this.connections.clear();
    try { if (!this.api.destroyGroup(this.sockets, this.group)) okay = false; } catch { okay = false; }
    this.sockets = null; this.utils = null; this.group = 0; this.allowed = null;
    // Do not auto-reopen a failed or closed boundary with old handles/nonces.
    this.faulted = true;
    return okay;
  }
  diagnostics() { return { available: !!this.sockets && !this.faulted, connections: this.connections.size, ...this.stats }; }
}
