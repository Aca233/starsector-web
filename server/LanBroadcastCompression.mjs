import { createRequire } from 'node:module';
import protocol from '../src/network/protocol.json' with { type: 'json' };
// This is a guarded adapter to ws internals, NOT a new wire protocol. Unknown
// versions/shapes keep stock ws. Re-audit sender.frame and PMD on a ws upgrade.
let compatible = false;
try { compatible = createRequire(import.meta.url)('ws/package.json').version === '8.21.3'; } catch { /* ordinary ws remains available */ }
const diagnostics = new WeakMap();
export const lanCompressionStats = ws => diagnostics.get(ws)?.() ?? null;
export const LAN_COMPRESSION_LIMITS = Object.freeze({ jobs: 32, bytes: protocol.maxSnapshotBytes * 2, waiters: protocol.maxPlayers });
const counters = () => ({ requests: 0, jobs: 0, shared: 0, savedInputBytes: 0, retries: 0, fallback: 0 });
function profile(ws) {
  const ext = ws?._extensions?.['permessage-deflate'];
  if (!compatible || ws?._isServer !== true || ext?._isServer !== true ||
      ws._sender?._extensions?.['permessage-deflate'] !== ext || typeof ext.compress !== 'function' ||
      ext.params?.server_no_context_takeover !== true || ext._options?.serverNoContextTakeover !== true) return null;
  const options = ext._options.zlibDeflateOptions;
  if (!options || options.level !== 1 || options.memLevel !== 7 || options.chunkSize !== 16384 ||
      Object.keys(options).some(k => !['level', 'memLevel', 'chunkSize'].includes(k))) return null;
  const bits = ext.params.server_max_window_bits ?? 15;
  if (!Number.isInteger(bits) || bits < 8 || bits > 15) return null;
  return { ext, key: bits };
}
/** Deduplicate ONLY simultaneously pending compression of marked owned packets.
 * No completed-payload cache, history, timers, new queue or wire credit. Each
 * caller stays inside its original ws Sender until its own callback completes.
 */
export class LanBroadcastCompression {
  constructor() { this.marked = new WeakSet(); this.pending = new WeakMap(); this.attached = new WeakSet(); this.jobs = 0; this.bytes = 0; this.totals = counters(); }
  share(data) {
    if (ArrayBuffer.isView(data) && data.buffer instanceof ArrayBuffer && data.byteOffset === 0 &&
        data.byteLength === data.buffer.byteLength && data.byteLength >= 1024 && data.byteLength <= protocol.maxSnapshotBytes)
      this.marked.add(data.buffer);
    return data;
  }
  stats() { return { ...this.totals, activeJobs: this.jobs, activeBytes: this.bytes }; }
  attach(ws) {
    if (!ws || (typeof ws !== 'object' && typeof ws !== 'function')) return false;
    diagnostics.set(ws, () => this.stats());
    const supported = profile(ws);
    if (!supported || this.attached.has(ws)) return false;
    this.attached.add(ws);
    const { ext, key } = supported, original = ext.compress, shared = this;
    let fragmented = false;
    const count = (name, amount = 1) => { shared.totals[name] += amount; };
    ext.compress = function(data, fin, callback) {
      const fragment = fragmented || fin !== true; fragmented = fin !== true;
      count('requests');
      // Buffer views created by ws still cover the same owned ArrayBuffer.
      const eligible = !fragment && profile(ws)?.key === key && Buffer.isBuffer(data) &&
        data.byteOffset === 0 && data.byteLength === data.buffer.byteLength && shared.marked.has(data.buffer);
      if (!eligible) { count('fallback'); return original.call(this, data, fin, callback); }
      let groups = shared.pending.get(data.buffer), job = groups?.get(key);
      const waiter = { ws, ext: this, original, data, callback, count };
      if (job && job.waiters.length < LAN_COMPRESSION_LIMITS.waiters) {
        job.waiters.push(waiter); count('shared'); count('savedInputBytes', data.byteLength); return;
      }
      if (job || shared.jobs >= LAN_COMPRESSION_LIMITS.jobs || shared.bytes + data.byteLength > LAN_COMPRESSION_LIMITS.bytes) {
        count('fallback'); return original.call(this, data, fin, callback);
      }
      if (!groups) { groups = new Map(); shared.pending.set(data.buffer, groups); }
      job = { waiters: [waiter] }; groups.set(key, job); shared.jobs++; shared.bytes += data.byteLength; count('jobs');
      let completed = false;
      const finish = (error, compressed) => {
        if (completed) return; completed = true;
        groups.delete(key); shared.jobs--; shared.bytes -= data.byteLength;
        const waiters = job.waiters; job.waiters = [];
        for (const w of waiters) {
          if (!error && Buffer.isBuffer(compressed)) { w.callback(null, compressed); continue; }
          // The compressor owner may have closed. Healthy followers must use
          // their own stream, not inherit the owner's close/error or a partial
          // result. This is the ordinary ws path, retried at most once.
          if (w.ws.readyState !== 1 || w.ws._socket?.destroyed) {
            if (!w.ws._socket?.destroyed) w.ws.terminate();
            w.callback(error, Buffer.alloc(0)); continue;
          }
          w.count('retries');
          try { w.original.call(w.ext, w.data, true, (failure, output) => {
            if (failure || !Buffer.isBuffer(output)) w.ws.terminate();
            w.callback(failure, output ?? Buffer.alloc(0));
          }); } catch (failure) { w.ws.terminate(); w.callback(failure, Buffer.alloc(0)); }
        }
      };
      try { original.call(this, data, true, finish); } catch (error) { finish(error); }
    };
    return true;
  }
}
