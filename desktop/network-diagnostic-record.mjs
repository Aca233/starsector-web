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
const performanceSchema = { capturePlans: {enabled:bool,...numbers('hits compiled fallbacks shapes')}, serializer: { reason:choice('opt-in','legacy-codec','no-worker','no-shared-memory','startup-error','inactive','starting','active','worker-error','job-id-exhausted','unsupported-tape','post-failed','startup-timeout','job-timeout','invalid-mailbox','worker-fallback','cancelled','closed'), enabled:bool, ready:bool, busy:bool, ...numbers('submitted completed cancelled fallbacks prepareMs workerMs tapeBytes transferBytes ageMs') }, captureReuse: { ...numbers('produced reused encodedFragments'), retained: bool }, ...numbers('tick simulationMs captureMs encodeMs callbackGapMs backlogMs lastStepMs maxStepMs ageMs realtimeRatio combatRate'), flow: flow('simulated produced blocked'), io: { enabled: bool, sharedCredit: bool, ...numbers('sent skipped inputs inflight displaySounds sharedCompletions'), flow: flow('uploaded uploadSkipped') } };
const pipelineSchema = { version: numeric, role: choice('host', 'guest'),
  relayDecode: numbers('metadataFrames fullFrames lastMs'),
  authority: { knownAgeMs: numeric, stale: bool, performance: performanceSchema }, ingress: flow('received'),
  receivers: list({ seat: numeric, consumptionCredits: bool, stages: flow('received queued skippedSocket skippedCredit consumed') }) };
const runtimeSchema = { ...numbers('sampleIntervalMs sampleDelayMs longTaskCount longTaskTotalMs longTaskMaxMs jsHeapUsedBytes jsHeapTotalBytes jsHeapLimitBytes'), longTaskSupported: bool, jsHeapAvailable: bool };
const hudSchema = { ...numbers('motionHz motionAgeMs motionTick tick sim bytes rtt jitter acknowledgementMs age hz appliedHz capture encode parse apply render renderDrawCalls spriteDrawCalls spriteTextureSlots gpu fps frameMs realtimeRatio combatRate playbackDelay ships projectiles explosions'),
  renderCulling: { spritesEnabled: bool, hullOverlaysEnabled: bool, ...numbers('shipSpritesRejected hullOverlaysRejected') },
  localFlow: flow('uploaded uploadSkipped'), authority: performanceSchema,
  input: { projectileFlight: { active: bool, ...numbers('tick entities renderedFrames extrapolationMs') }, turretPrediction: { active: bool, reason: choice('reset','active','inactive','stale','command','unavailable'), ...numbers('renderedFrames reconciliations hardSnaps mounts pendingInputs') }, motionPrediction: { active: bool, reason: choice('reset', 'active', 'inactive', 'collision', 'unavailable', 'stale'), ...numbers('renderedFrames suspendedFrames reconciliations hardSnaps correctionDistance correctionAngleDeg replayMs pendingInputs') }, localParticles: numbers('groups particles generated advances step'), firePrediction: numbers('predicted repeated observedCycles recoveredCycles matched resolvedWithoutProjectile expired cancelled suppressed pending lastResponseMs'), ...numbers('sentSequence acknowledgedSequence trackedPending oldestTrackedPendingMs pendingActions'), projectileVisuals: numbers('tick received entities'), criticalCombat: numbers('tick ageMs hz') },
  decodeQueue: numbers('queued queuedBytes peakQueued peakBytes decoded backpressure waitMs maxWaitMs') };
const lanSchema = { mode: choice('lan-websocket'), role: choice('host', 'guest'), relaySeq: numeric,
  captureDemand: { held: bool, reason: choice('audience','relay'), ...numbers('heldTick heldMs granted withheld') },
  criticalCombat: numbers('publications sent consumed discarded abandonedBytes skipped oversize peakFlightBytes wireBytes flightBytes peers retainedBytes baseBytes wireFull wireDelta tick'),
  projectileVisuals: numbers('publications sent consumed discarded fragment skippedWritable skippedBudget oversizeBaseline peakFlightBytes flightBytes peers retainedPublicationBytes'),
  bulk: { adaptive: bool, ...numbers('queued completed packets wireBytes receipts ignoredReceipts peakFlightBytes peakRetainedBytes cancelled retiredBytes failures increased reduced abandonedBytes abandonedChunks disconnectedPeers jobs ownedJobs flightBytes retainedBytes limit peerLimit ceiling') },
  compressionFanout: numbers('requests jobs shared savedInputBytes retries fallback activeJobs activeBytes'),
  authority: numbers('received lastBytes receiveMs'), receivers: list({ seat: numeric, motionAdmission: { mode: choice('auto'), status: choice('awaiting-world', 'eligible', 'fallback'), fallbackReason: choice('whole-state-late', 'whole-state-stalled'), ...numbers('worldSenderAgeMs pending maxAgeMs') }, visualBulkSent: numeric, bulkChunks: bool, chunkDeferred: numeric, detailSkipped: numeric, codecDeferred: numeric, combat: numbers('inflight bytes acknowledgementMs tick'), motion: { active: bool, fresh: bool, ...numbers("sent consumed skipped inflight bytes capacity idleRttMs deliveryHz acknowledgementMs detailIntervalMs") }, controlLane: { active: bool, ...numbers("received sent fallbacks bufferedBytes"), motionWire: numbers("full delta rawBytes packetBytes fallbacks retainedBytes") }, compression: bool, bufferedBytes: numeric,
    credits: numbers('inflight capacity idleCapacity deliveryHz bytes peakCount peakBytes sent acked rejected'), network: numbers('latestRttMs baselineRttMs busySamples'),
    flow: numbers('sent skippedSocket skippedCredit lastBytes lastSeq'), delta: numbers('full delta originalBytes encodedBytes budgetFallbacks motionDeltas anchors baseSeq pendingSeq retainedBytes') }) };
const nativeSchema = { ...numbers('queuedBytes queuedPackets errorCode sampleAgeMs'), available: bool, active: bool, connecting: bool, usingRelay: bool,
  reason: choice('not-initialized', 'injected-client', 'unsupported-platform', 'binding-unavailable', 'invalid-peer', 'interface-unavailable', 'no-session', 'not-sampled', 'query-unavailable', 'query-failed') };
const receiptSchema = numbers('rendererBinaryWrites rendererJsonWrites rendererPayloadBytes rendererCanonicalBytes rendererPending rendererWritten rendererWriteErrors maxRendererWriteMs networkAttempts networkAccepted networkErrors consumptionAttempts consumptionAccepted consumptionErrors fastAttempts fastAccepted fastRejected networkAgeMs consumptionAgeMs');
const pollSchema = numbers('calls packetsRead discardedPackets oversizedHeads invalidPackets errors budgetHits maxGapMs maxDurationMs lastAgeMs');
export const NETWORK_FAILURE_STAGES = ['snapshot-decode', 'snapshot-apply', 'server-rejected', 'graphics-context', 'worker-start', 'worker-runtime', 'snapshot-size', 'report-size', 'resource-load', 'initialization', 'frame-loop', 'unknown'];
const blockReason = choice('disconnected', 'frame-window', 'wire-byte-window', 'renderer-consumption', 'shared-uplink-window', 'codec-work-budget');
const steamSchema = { mode: choice('legacy-p2p', 'sockets'), role: choice('host', 'guest'), ...numbers('receivedStates lastStateAgeMs'),
  receipts: receiptSchema, polling: pollSchema,
  snapshotWorker: { ...numbers('offered replaced prepared accepted stale faults workMs maxWorkMs queueMs maxQueueMs maxRetained'), active: bool, pending: bool, ready: bool, failed: bool },
  sharedSnapshots: numbers('inflightBytes limitBytes waitingPeers estimatedQueueBytes'),
  outbound: numbers('inflight queued oldestAckMs inflightBytes queuedBytes coalesced'), nativeHostSession: nativeSchema,
  incomingSnapshots: numbers('fullStates deltaStates misses baselineBytes binaryFullStates binaryDeltaStates motionDeltas'),
  peers: list({ preparation: numbers('attempts discarded totalMs discardedMs maxMs'), ...numbers('byteLimit inflight window inflightBytes oldestAckMs ackMs baseAckMs sentStates skippedStates ackedStates queueAckMs'), probing: choice('drain', 'measure'),
    consumption: { enabled: bool, ...numbers('inflight bytes rawBytes consumed oldestMs') },
    blockedBy: blockReason, lastSnapshotSkip: blockReason,
    lastSnapshot: { ...numbers('rawBytes wireBytes fragments prepareMs'), format: choice('full', 'delta', 'legacy-full', 'binary-full', 'binary-delta') },
    delta: numbers('fullStates deltaStates legacyStates savedBytes baselineBytes binaryFullStates binaryDeltaStates motionDeltas budgetFallbacks'), nativeSession: nativeSchema }) };
export const NETWORK_EVENTS = ['sample', 'battle-start', 'battle-stop', 'battle-failed', 'welcome', 'reconnecting', 'disconnected', 'page-visibility', 'error', 'ended', 'left', 'roomClosed'];
export function normalizeNetworkRecord(input) {
  const v = fields(input);
  if (v.version !== 1 || !NETWORK_EVENTS.includes(v.event) || !['lan', 'steam'].includes(v.transport)) return null;
  // build IDs are generated ISO timestamps, not user-controlled descriptive strings.
  const build = typeof v.build === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v.build) && v.build.length <= 40 ? v.build : null;
  const record = { version: 1, event: v.event, build, transport: v.transport,
    ...project(v, { wallTimeMs: numeric, monotonicMs: numeric, battle: numeric, seat: numeric, role: choice('host', 'guest'),
      failureStage: choice(...NETWORK_FAILURE_STAGES), hidden: bool, connected: bool, socketBufferedBytes: numeric, sampleGapMs: numeric, hudAgeMs: numeric, pipelineAgeMs: numeric, steamAgeMs: numeric,
      features: { policy: choice('auto', 'off', 'experimental'), negotiated: bool, motionRequested: bool, motion: bool, visuals: bool, combat: bool, motionWire: bool, bulkChunks: bool, binaryDelta: bool, binarySnapshots: bool, reason: choice('steam-motion-not-implemented', 'disabled-by-build', 'awaiting-welcome', 'server-did-not-negotiate', 'no-helper-lane', 'check-receiver-activity') },
      runtime: runtimeSchema, hud: hudSchema, pipeline: pipelineSchema, lan: lanSchema, steam: steamSchema }) };
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
    this.writtenByTransport = { lan: 0, steam: 0 }; this.evictedByTransport = { lan: 0, steam: 0 }; this.latestEvents = new Map();
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
    this.writtenByTransport[record.transport]++;
    // At most one small summary per allowlisted lifecycle event and transport.
    // Switching LAN/Steam cannot erase all evidence of the previous transport.
    if (record.event !== 'sample') this.latestEvents.set(record.transport + ':' + record.event,
      Object.fromEntries(['transport', 'event', 'battle', 'failureStage', 'wallTimeMs', 'monotonicMs'].map(key => [key, record[key]])));
    this.rows.push({ line, bytes, transport: record.transport }); this.bytes += bytes;
    while (this.rows.length > this.maxRecords || this.bytes > this.maxBytes) { const row = this.rows.shift(); this.bytes -= row.bytes; this.evictedByTransport[row.transport]++; this.dropped++; }
    try { this.sink(NETWORK_LOG_PREFIX + line); } catch { /* optional desktop/console output */ }
    return true;
  }
  text() {
    const header = { version: 1, event: 'log-info', records: this.rows.length, dropped: this.dropped,
      writtenByTransport: { ...this.writtenByTransport }, evictedByTransport: { ...this.evictedByTransport },
      retainedByTransport: this.rows.reduce((counts, row) => { counts[row.transport]++; return counts; }, { lan: 0, steam: 0 }),
      latestEvents: [...this.latestEvents.values()].sort((a, b) => a.monotonicMs - b.monotonicMs),
      notes: 'Local diagnostics only. Hz windows are independent; appliedHz counts state endpoints, not FPS. sampleGapMs includes timer/main-thread stalls. runtime sampleIntervalMs is the actual timer interval; sampleDelayMs is excess over 1000ms, not RTT. Long-task totals/max cover this battle mount, not the last second; unsupported is null. JS heap is optional Chromium telemetry, not process memory. hud.input trackedPending is a bounded 120-input ACK tracker, not a transport queue; pendingActions is a local unsent action count. hudAgeMs and pipelineAgeMs are freshness, not network RTT. null means unknown/stale. Bytes are application metrics, not IP bandwidth. SDK receipt acceptance does not prove remote delivery. Steam ACK is not LAN consumption credit. dropped counts log eviction/rate limits, not network loss. latestEvents is bounded lifecycle history, not retained samples. No identity or world payload. Ring survives reconnect, not page reload.' };
    return JSON.stringify(header) + '\n' + this.rows.map(row => row.line).join('\n') + '\n';
  }
}
