import { isGameUrl } from './policy.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseNetworkConsole, MAX_RECORD_BYTES } from './network-diagnostic-record.mjs';

const CLOSE_REASONS = new Set(['quit', 'window-close', 'before-quit', 'restart', 'update',
  'backend-failed', 'renderer-gone', 'startup-failed', 'shutdown', 'steam-relaunch', 'test']);
const SAMPLE_NUMBERS = 'uptimeMs cpuPercent rssBytes heapUsedBytes heapTotalBytes externalBytes arrayBuffersBytes eventLoopLagMs eventLoopMeanMs eventLoopMaxMs eventLoopP99Ms rendererCount'.split(' ');
const SAMPLE_BOOLEANS = ['backendRunning', 'windowVisible', 'windowFocused'];
const METADATA_TOKENS = ['sessionId', 'appVersion', 'build', 'platform', 'arch', 'electronVersion', 'chromeVersion', 'nodeVersion'];
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
const token = value => typeof value === 'string' && /^[a-zA-Z0-9._+:-]{1,128}$/.test(value) ? value : null;
const choice = (...values) => value => values.includes(value) ? value : null;
const mode = choice('local', 'lan', 'steam', 'campaign', 'studio', 'menu', 'unknown');
const exitCode = value => Number.isSafeInteger(value) ? value : null;
const numbers = names => Object.fromEntries(names.split(' ').map(key => [key, numeric]));
const processMetrics = numbers('cpuPercent workingSetBytes privateBytes');
const reason = choice('clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed',
  'integrity-failure', 'memory-eviction', 'error', 'exit', 'spawn-failed', 'start-failed', 'timeout', 'unknown');
function project(value, schema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(schema).map(([key, normalize]) =>
    [key, typeof normalize === 'function' ? normalize(value[key]) : project(value[key], normalize)]));
}
const tunnelCounters = numbers('p2pTx p2pRx relayTx relayRx');
const tunnelSchema = { ...numbers('peerP2p peerRelay peerUnknown intervalMs'),
  trafficRoute: choice('unknown', 'idle', 'p2p', 'relay', 'mixed'), totals: tunnelCounters, delta: tunnelCounters };
const EVENTS = new Map([
  ['n2n-sample', { mode, status: choice('available', 'partial', 'unavailable', 'not-detected'),
    tunnels: value => Array.isArray(value) ? value.slice(0, 3).map(row => project(row, tunnelSchema)) : null }],
  ['mode-change', { from: mode, to: mode, mode, previousMode: mode, stage: choice('requested', 'ready', 'failed', 'relaunch') }],
  ['backend-ready', { mode, build: token }],
  ['backend-failed', { mode, reason, exitCode, signal: choice('SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV', 'SIGHUP', 'SIGBREAK') }],
  ['renderer-gone', { mode, exitCode, reason }],
  ['renderer-unresponsive', { mode }], ['renderer-responsive', { mode }],
  ['page-loaded', { mode, durationMs: numeric }],
  ['desktop-sample', { mode, sampleGapMs: numeric, eventLoop: numbers('meanMs p95Ms maxMs'),
    processes: { main: processMetrics, renderer: processMetrics, backend: processMetrics, gpu: processMetrics },
    mainMemory: numbers('rssBytes heapUsedBytes heapTotalBytes externalBytes'),
    ...Object.fromEntries(SAMPLE_NUMBERS.map(key => [key, numeric])),
    ...Object.fromEntries(SAMPLE_BOOLEANS.map(key => [key, boolean])) }],
]);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/**
 * One append-only file per process session; the main process supplies a unique
 * path; start() creates its parent directory. Never rename, truncate or prune another run.
 * The former maxBytes option is intentionally ignored: only in-memory pending
 * work, record size and ingress rate are bounded, not the session's disk size.
 * No automatic start, for compatibility with existing console-only callers.
 */
export class DesktopNetworkLog {
  constructor(file, { maxPending = 32, now = () => performance.now(), wallNow = Date.now, io = fs } = {}) {
    this.file = file;
    this.sessionId = token(path.basename(file, '.jsonl')); this.processRunId = randomUUID();
    this.resumed = false;
    this.maxPending = Number.isInteger(maxPending) ? Math.min(256, Math.max(1, maxPending)) : 32;
    this.now = now; this.wallNow = wallNow; this.io = io;
    this.pending = 0; this.dropped = 0; this.tail = Promise.resolve(); this.size = 0;
    this.accepted = 0; this.written = 0; this.writeErrors = 0; this.exportErrors = 0;
    this.pendingDrops = 0; this.rateDrops = 0;
    this.windowAt = -Infinity; this.windowCount = 0;
    this.started = false; this.closed = false; this.closePromise = null;
    this.createdAt = this.now(); this.startedAt = this.createdAt;
  }

  /** First record only. Returns admission, not filesystem success; use flush(). */
  start(metadata = {}) {
    if (this.started || this.closed || this.accepted !== 0 || this.pending >= this.maxPending) return false;
    let fields;
    try {
      metadata = object(metadata);
      fields = Object.fromEntries(METADATA_TOKENS.map(key => [key, token(metadata[key])]));
      fields.pid = numeric(metadata.pid); fields.packaged = boolean(metadata.packaged);
      fields.logicalCores = numeric(metadata.logicalCores); fields.totalMemoryBytes = numeric(metadata.totalMemoryBytes);
      fields.mode = mode(metadata.mode); fields.resumed = metadata.resumed === true;
    } catch { return false; }
    this.startedAt = this.now();
    this.sessionId = fields.sessionId ?? this.sessionId;
    this.resumed = fields.resumed;
    this.started = true;
    return this._record(this._desktopRecord(this.resumed ? 'session-resume' : 'session-start', { metadata: fields,
      notes: 'Append-only desktop session; samples 1Hz in battle and desktop processes 0.2Hz. Steam overlay relaunch appends a new processRunId to the same session. Renderer clocks/battle IDs reset on page load; desktop monotonic time resets on process restart. Compare durations within their clock domain, not cross-computer wall times. Event-loop histogram includes its 20ms polling interval and OS timer granularity, not network RTT. Long tasks are cumulative per battle. Process memory is bytes; CPU is Electron percentCPUUsage and initially unknown. Drops count diagnostic write/admission loss, not packet loss. No session-end can mean crash or interrupted/disk-failed shutdown. Unknown/stale values are null. Export is a complete prefix at the moment of copying, not future records.' }), false, true);
  }

  accept(message, trusted) {
    if (!trusted || !this._admit()) return false;
    const record = parseNetworkConsole(message);
    if (!record) return false;
    return this._record(record, true);
  }

  /** Local main-process API only; never exposed via renderer IPC or preload. */
  event(event, fields = {}) {
    const schema = EVENTS.get(event);
    if (!schema || !this._admit()) return false;
    let sample;
    try {
      fields = object(fields);
      sample = project(fields, schema);
    } catch { return false; }
    return this._record(this._desktopRecord(event, sample), true);
  }

  _desktopRecord(event, fields) {
    return { version: 1, source: 'desktop', event, ...fields };
  }

  _admit() {
    if (this.closed) return false;
    if (this.pending >= this.maxPending) { this.dropped++; this.pendingDrops++; return false; }
    const now = this.now();
    if (now - this.windowAt >= 1000 || now < this.windowAt) { this.windowAt = now; this.windowCount = 0; }
    if (this.windowCount >= 12) { this.dropped++; this.rateDrops++; return false; }
    return true;
  }

  _line(record) {
    return JSON.stringify({ ...record, sessionId: this.sessionId, processRunId: this.processRunId, desktopMonotonicMs: this.now(), desktopReceivedAtMs: this.wallNow(), desktopDropped: this.dropped }) + '\n';
  }

  _record(record, rateLimited = false, initialize = false) {
    const line = this._line(record);
    if (Buffer.byteLength(line) > MAX_RECORD_BYTES + 512) { this.dropped++; return false; }
    if (rateLimited) this.windowCount++;
    this.accepted++;
    this._enqueue(() => line, false, initialize);
    return true;
  }

  _enqueue(makeLine, durable = false, initialize = false) {
    this.pending++;
    this.tail = this.tail.then(async () => {
      if (initialize) await this.io.mkdir(path.dirname(this.file), { recursive: true });
      const line = makeLine();
      // appendFile closes its descriptor on completion. Only shutdown fsyncs;
      // no synchronous filesystem work or per-sample durability overhead.
      await this.io.appendFile(this.file, line, { encoding: 'utf8', flush: durable });
      this.size += Buffer.byteLength(line);
      this.written++;
      return true;
    }).catch(() => {
      this.writeErrors++; this.dropped++;
      return false; // Disk errors must never reject into game/shutdown code.
    }).finally(() => { this.pending--; });
    return this.tail;
  }

  /**
   * Copy a consistent complete-line prefix on the same queue as writes. The
   * destination is supplied by main's save dialog, never by renderer data.
   * Failure rejects this operation only; later appends/close still run.
   */
  exportTo(destination) {
    let sourcePath, destinationPath;
    try {
      sourcePath = path.resolve(this.file); destinationPath = path.resolve(destination);
      if (process.platform === 'win32') {
        sourcePath = sourcePath.toLowerCase(); destinationPath = destinationPath.toLowerCase();
      }
    } catch (error) { return Promise.reject(error); }
    if (sourcePath === destinationPath) return Promise.reject(new Error('Cannot export onto the active session log'));
    if (this.pending >= this.maxPending) return Promise.reject(new Error('Session log queue is busy'));
    this.pending++;
    const operation = this.tail.then(() => this.io.copyFile(this.file, destination))
      .finally(() => { this.pending--; });
    this.tail = operation.catch(() => { this.exportErrors++; });
    return operation;
  }

  /** Wait for all writes queued so far (does not end the session). */
  flush() { return this.tail; }

  /**
   * Seal synchronously; drain accepted records, then append and fsync exactly
   * one final summary. This single reserved slot bypasses pending/rate limits.
   * Repeated calls return the same promise, with the first reason winning.
   * Counters in the summary describe records BEFORE the summary itself.
   * Returns false if the summary cannot be persisted; never rejects for I/O.
   */
  close(reason = 'quit') {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    const closedAt = this.now();
    const closeReason = CLOSE_REASONS.has(reason) ? reason : 'unknown';
    this.closePromise = this._enqueue(() => this._line(this._desktopRecord(closeReason === 'steam-relaunch' ? 'session-handoff' : 'session-end', {
      summaryScope: 'process', resumed: this.resumed,
      reason: closeReason, started: this.started,
      durationMs: Math.max(0, closedAt - this.startedAt),
      accepted: this.accepted, written: this.written, bytesWritten: this.size,
      dropped: this.dropped, pendingDrops: this.pendingDrops, rateDrops: this.rateDrops,
      writeErrors: this.writeErrors, exportErrors: this.exportErrors,
    })), true);
    return this.closePromise;
  }
}

/** Only the app's own main frame can feed the local performance log. */
export function attachDesktopNetworkLog(contents, origin, log) {
  const receive = details => {
    let localSource = false;
    try { localSource = new URL(details.sourceId).origin === origin; } catch { /* no anonymous/eval/extension logs */ }
    // Electron can attribute a srcdoc console event to the main frame. Require
    // a local script source as well; the game's Vite bundle has such a URL.
    log.accept(details.message, localSource && details.frame === contents.mainFrame && isGameUrl(contents.getURL(), origin));
  };
  contents.on('console-message', receive);
  return () => contents.off('console-message', receive);
}
