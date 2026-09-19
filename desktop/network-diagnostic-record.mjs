/** Shared renderer/desktop allowlist. Never serialize connection objects or arbitrary messages. */
export const NETWORK_LOG_PREFIX = '[network-performance-v1] ';
export const MAX_RECORD_BYTES = 16384;
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? Math.round(value * 1000) / 1000 : null;
const bool = value => typeof value === 'boolean' ? value : null;
const choice = (...values) => value => values.includes(value) ? value : null;
const fields = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const numbers = names => Object.fromEntries(names.split(' ').map(key => [key, numeric]));
const list = (schema, max = 9) => value => Array.isArray(value) ? value.slice(0, max).map(row => project(row, schema)) : null;
function project(value, schema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(schema).map(([key, rule]) => [key, typeof rule === 'function' ? rule(value[key]) : project(value[key], rule)]));
}
const flow = names => ({ windowMs: numeric, rates: numbers(names) });
const performanceSchema = { ...numbers('tick simulationMs captureMs encodeMs callbackGapMs backlogMs lastStepMs maxStepMs ageMs'), flow: flow('simulated produced blocked') };
const pipelineSchema = { version: numeric, role: choice('host', 'guest'),
  authority: { knownAgeMs: numeric, stale: bool, performance: performanceSchema }, ingress: flow('received'),
  receivers: list({ seat: numeric, consumptionCredits: bool, stages: flow('received queued skippedSocket skippedCredit consumed') }) };
const hudSchema = { ...numbers('tick sim bytes rtt jitter acknowledgementMs age hz appliedHz capture encode parse apply render gpu fps frameMs realtimeRatio combatRate playbackDelay ships projectiles explosions'),
  localFlow: flow('uploaded uploadSkipped'), authority: performanceSchema,
  decodeQueue: numbers('queued queuedBytes peakQueued peakBytes decoded backpressure waitMs maxWaitMs') };
const lanSchema = { mode: choice('lan-websocket'), role: choice('host', 'guest'), relaySeq: numeric,
  authority: numbers('received lastBytes receiveMs'), receivers: list({ seat: numeric, compression: bool, bufferedBytes: numeric,
    credits: numbers('inflight capacity bytes'), network: numbers('latestRttMs baselineRttMs busySamples'),
    flow: numbers('sent skippedSocket skippedCredit lastBytes'), delta: numbers('full delta originalBytes encodedBytes budgetFallbacks') }) };
const nativeSchema = { ...numbers('queuedBytes queuedPackets'), available: bool, usingRelay: bool };
const blockReason = choice('disconnected', 'frame-window', 'wire-byte-window', 'renderer-consumption', 'shared-uplink-window');
const steamSchema = { mode: choice('legacy-p2p', 'sockets'), role: choice('host', 'guest'), ...numbers('receivedStates lastStateAgeMs'),
  sharedSnapshots: numbers('inflightBytes limitBytes waitingPeers'), outbound: numbers('inflight queued oldestAckMs'), nativeHostSession: nativeSchema,
  peers: list({ ...numbers('inflight window inflightBytes oldestAckMs ackMs baseAckMs'),
    blockedBy: blockReason, lastSnapshotSkip: blockReason,
    lastSnapshot: numbers('rawBytes wireBytes fragments prepareMs'), delta: numbers('fullStates deltaStates legacyStates'), nativeSession: nativeSchema }) };
export const NETWORK_EVENTS = ['sample', 'battle-start', 'battle-stop', 'battle-failed', 'welcome', 'reconnecting', 'disconnected', 'page-visibility', 'error', 'ended', 'left', 'roomClosed'];
export function normalizeNetworkRecord(input) {
  const v = fields(input);
  if (v.version !== 1 || !NETWORK_EVENTS.includes(v.event) || !['lan', 'steam'].includes(v.transport)) return null;
  // build IDs are generated ISO timestamps, not user-controlled descriptive strings.
  const build = typeof v.build === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v.build) && v.build.length <= 40 ? v.build : null;
  const record = { version: 1, event: v.event, build, transport: v.transport,
    ...project(v, { wallTimeMs: numeric, monotonicMs: numeric, battle: numeric, seat: numeric, role: choice('host', 'guest'),
      hidden: bool, connected: bool, socketBufferedBytes: numeric, sampleGapMs: numeric, hudAgeMs: numeric, pipelineAgeMs: numeric, steamAgeMs: numeric,
      hud: hudSchema, pipeline: pipelineSchema, lan: lanSchema, steam: steamSchema }) };
  // Stale values are explicitly unavailable, not a fresh repetition or measured zero.
  record.hudFresh = record.hudAgeMs !== null && record.hudAgeMs <= 2500;
  if (!record.hudFresh) record.hud = null;
  record.pipelineFresh = record.pipelineAgeMs !== null && record.pipelineAgeMs <= 5000;
  if (!record.pipelineFresh) { record.pipeline = null; record.lan = null; }
  record.steamFresh = record.steamAgeMs !== null && record.steamAgeMs <= 5000;
  if (!record.steamFresh) record.steam = null;
  // These reports travel with the heartbeat. Their age is NOT RTT.
  const authority = record.pipeline?.authority;
  if (authority && (authority.stale || authority.knownAgeMs === null || authority.knownAgeMs + record.pipelineAgeMs > 5000)) {
    authority.stale = true; authority.performance = null;
  }
  if (record.hud?.authority && (record.hud.authority.ageMs === null || record.hud.authority.ageMs > 2500)) record.hud.authority = null;
  return record;
}
export function parseNetworkConsole(message) {
  if (typeof message !== 'string' || !message.startsWith(NETWORK_LOG_PREFIX) || message.length > MAX_RECORD_BYTES) return null;
  try { return normalizeNetworkRecord(JSON.parse(message.slice(NETWORK_LOG_PREFIX.length))); } catch { return null; }
}
/** One tab's last ~10 minutes; retained across battle unmount/reconnect, not page reload. */
export class NetworkDiagnosticBuffer {
  constructor({ maxRecords = 660, maxBytes = 4 * 1024 * 1024, sink = () => {} } = {}) {
    this.rows = []; this.bytes = 0; this.dropped = 0; this.sink = sink;
    this.maxRecords = maxRecords; this.maxBytes = maxBytes; this.windowAt = -Infinity; this.windowCount = 0;
  }
  write(input) {
    const now = input.monotonicMs;
    if (!Number.isFinite(now)) return false;
    if (now < this.windowAt || now - this.windowAt >= 1000) { this.windowAt = now; this.windowCount = 0; }
    // Lifecycle/error storms must not turn diagnostics into the bottleneck.
    if (this.windowCount >= 12) { this.dropped++; return false; }
    const record = normalizeNetworkRecord(input);
    if (!record) return false;
    const line = JSON.stringify(record), bytes = new TextEncoder().encode(line).length + 1;
    if (bytes > MAX_RECORD_BYTES || bytes > this.maxBytes) { this.dropped++; return false; }
    this.windowCount++;
    this.rows.push({ line, bytes }); this.bytes += bytes;
    while (this.rows.length > this.maxRecords || this.bytes > this.maxBytes) { this.bytes -= this.rows.shift().bytes; this.dropped++; }
    try { this.sink(NETWORK_LOG_PREFIX + line); } catch { /* optional desktop/console output */ }
    return true;
  }
  text() {
    const header = { version: 1, event: 'log-info', records: this.rows.length, dropped: this.dropped,
      notes: 'Local diagnostics only. Hz windows are independent; appliedHz counts state endpoints, not FPS. sampleGapMs includes timer/main-thread stalls. hudAgeMs and pipelineAgeMs are freshness, not network RTT. null means unknown/stale. Bytes are application metrics, not IP bandwidth. Steam ACK is not LAN consumption credit. No identity or world payload. Ring survives reconnect, not page reload.' };
    return JSON.stringify(header) + '\n' + this.rows.map(row => row.line).join('\n') + '\n';
  }
}
