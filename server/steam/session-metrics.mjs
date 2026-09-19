import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const validPeer = value => typeof value === 'string' && /^[0-9]{16,20}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const unavailable = reason => ({ available: false, reason });
// Windows x64 P2PSessionState_t: four uint8 flags, two int32 counters,
// uint32 remoteIP, uint16 remotePort, and two padding bytes (sizeof = 20).
// Remote addressing is intentionally NEVER exposed, cached or logged.
export const P2P_SESSION_STATE_BYTES = 20;
export function decodeP2PSessionState(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== P2P_SESSION_STATE_BYTES) throw Error('Invalid P2P session buffer');
  const bytes = buffer.readInt32LE(4), packets = buffer.readInt32LE(8);
  return { available: true, active: buffer[0] !== 0, connecting: buffer[1] !== 0, errorCode: buffer[2], usingRelay: buffer[3] !== 0,
    queuedBytes: bytes >= 0 ? bytes : null, queuedPackets: packets >= 0 ? packets : null };
}
/** Bind TWO fixed read-only exports. No Steam initialization, session acceptance,
 * send, close, config mutation, arbitrary DLL/function selector or renderer IPC. */
export function bindSteamSessionReader(library) {
  const getNetworking = library.func('void *SteamAPI_SteamNetworking_v006()');
  const getState = library.func('bool SteamAPI_ISteamNetworking_GetP2PSessionState(void *self, uint64_t remote, void *state)');
  return remote => {
    if (!validPeer(remote)) return unavailable('invalid-peer');
    const networking = getNetworking();
    if (!networking) return unavailable('interface-unavailable');
    const buffer = Buffer.alloc(P2P_SESSION_STATE_BYTES);
    if (!getState(networking, BigInt(remote), buffer)) return unavailable('no-session');
    return decodeP2PSessionState(buffer);
  };
}
/** Called ONLY after this process successfully initialized its real Steam SDK.
 * Pin the same DLL instance as the addon; do not unload it while Steam owns it.
 * Binding failures disable diagnostics only, never game transport. */
export function loadSteamSessionReader() {
  if (process.platform !== 'win32' || process.arch !== 'x64') return { read: null, reason: 'unsupported-platform' };
  try {
    const nativeRoot = path.dirname(require.resolve('steamworks.js'));
    const besideExe = path.join(path.dirname(process.execPath), 'steam_api64.dll');
    const file = fs.existsSync(besideExe) ? besideExe : path.join(nativeRoot, 'dist', 'win64', 'steam_api64.dll');
    const library = require('koffi').load(file);
    return { read: bindSteamSessionReader(library), reason: null };
  } catch { return { read: null, reason: 'binding-unavailable' }; }
}
/** Bounded, rate-limited, observation-only sampler. SDK counter semantics do not
 * separate unsent from unacknowledged bytes: do not use them as congestion credit.
 * Even a failing sampler cannot drop packets, change timeouts or close a peer. */
export class SteamSessionMetrics {
  constructor({ read = null, reason = 'not-initialized' } = {}) {
    this.read = read; this.reason = reason; this.cache = new Map(); this.nextSampleAt = 0; this.lastSampleMs = null; this.peakSampleMs = 0;
  }
  status() { return { available: !!this.read, source: 'legacy-p2p-session', reason: this.read ? null : this.reason, lastSampleMs: this.lastSampleMs, peakSampleMs: this.peakSampleMs }; }
  sample(remotes, now = Date.now()) {
    const allowed = new Set();
    for (const peer of remotes) { if (validPeer(peer)) allowed.add(peer); if (allowed.size >= 10) break; }
    for (const peer of this.cache.keys()) if (!allowed.has(peer)) this.cache.delete(peer);
    if (!this.read || now < this.nextSampleAt) return;
    this.nextSampleAt = now + 1000;
    const started = performance.now();
    for (const remote of allowed) {
      let value;
      try {
        const raw = this.read(remote);
        // Copy only the allowlisted numeric fields, even for injected readers.
        if (raw?.available === true) value = { available: true, active: !!raw.active, connecting: !!raw.connecting,
          errorCode: Number.isInteger(raw.errorCode) && raw.errorCode >= 0 && raw.errorCode <= 255 ? raw.errorCode : null,
          usingRelay: !!raw.usingRelay,
          queuedBytes: Number.isInteger(raw.queuedBytes) && raw.queuedBytes >= 0 && raw.queuedBytes <= 0x7fffffff ? raw.queuedBytes : null,
          queuedPackets: Number.isInteger(raw.queuedPackets) && raw.queuedPackets >= 0 && raw.queuedPackets <= 0x7fffffff ? raw.queuedPackets : null };
        else value = unavailable(['no-session', 'interface-unavailable'].includes(raw?.reason) ? raw.reason : 'query-unavailable');
      } catch { value = unavailable('query-failed'); }
      this.cache.set(remote, { at: now, value });
    }
    this.lastSampleMs = Math.round((performance.now() - started) * 1000) / 1000;
    this.peakSampleMs = Math.max(this.peakSampleMs, this.lastSampleMs);
  }
  get(remote, now = Date.now()) {
    const cached = this.cache.get(remote);
    if (!cached) return unavailable(this.read ? 'not-sampled' : this.reason);
    return { ...cached.value, sampleAgeMs: Math.max(0, now - cached.at) };
  }
  forget(remote) { this.cache.delete(remote); }
  clear() { this.cache.clear(); this.nextSampleAt = 0; this.lastSampleMs = null; this.peakSampleMs = 0; }
}
