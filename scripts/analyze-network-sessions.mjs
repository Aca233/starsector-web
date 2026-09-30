/** Read-only JSONL analysis. Logs are data; no contents are evaluated or imported. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex < 0 || !args[outIndex + 1]) throw new Error('Usage: node scripts/analyze-network-sessions.mjs <log.jsonl> ... --out <summary.json>');
const output = path.resolve(args[outIndex + 1]);
args.splice(outIndex, 2);
if (!args.length || args.some(arg => arg.startsWith('--'))) throw new Error('Provide JSONL input files and --out only');
const inputs = args.map(file => path.resolve(file));
if (inputs.some(file => file.toLowerCase() === output.toLowerCase())) throw new Error('Output must not overwrite an input');

const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round(value * 1000) / 1000;
const get = (record, field) => field.split('.').reduce((value, key) => value?.[key], record);
const counts = values => Object.fromEntries([...new Set(values)].map(value => [value, values.filter(v => v === value).length]));
function stats(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, min: null, mean: null, p50: null, p95: null, max: null };
  return { n: sorted.length, min: round(sorted[0]), mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    p50: round(sorted[Math.ceil(sorted.length * .5) - 1]), p95: round(sorted[Math.ceil(sorted.length * .95) - 1]), max: round(sorted.at(-1)) };
}
// These are distributions of sampled telemetry, NOT per-frame / per-input traces.
const hudFields = 'tick ships projectiles fps frameMs hz appliedHz motionHz rtt jitter acknowledgementMs realtimeRatio combatRate sim capture encode parse apply render gpu playbackDelay bytes'.split(' ').map(k => 'hud.' + k);
const metricFields = [...hudFields,
  'sampleGapMs', 'runtime.sampleDelayMs', 'hudAgeMs', 'pipelineAgeMs',
  'hud.authority.simulationMs', 'hud.authority.captureMs', 'hud.authority.encodeMs',
  'hud.authority.callbackGapMs', 'hud.authority.backlogMs', 'hud.authority.lastStepMs', 'hud.authority.maxStepMs',
  'hud.authority.flow.rates.simulated', 'hud.authority.flow.rates.produced', 'hud.authority.flow.rates.blocked',
  'hud.input.trackedPending', 'hud.input.oldestTrackedPendingMs', 'hud.input.pendingActions',
  'hud.decodeQueue.queued', 'hud.decodeQueue.waitMs', 'hud.decodeQueue.maxWaitMs',
  'pipeline.ingress.rates.received', 'pipeline.receivers.0.stages.rates.queued',
  'pipeline.receivers.0.stages.rates.consumed', 'pipeline.receivers.0.stages.rates.skippedCredit',
  'pipeline.receivers.0.stages.rates.skippedSocket', 'lan.receivers.0.credits.inflight',
  'lan.receivers.0.credits.capacity', 'lan.receivers.0.credits.deliveryHz',
  'lan.receivers.0.network.baselineRttMs', 'lan.receivers.0.network.latestRttMs'];
function metrics(rows) {
  const values = Object.fromEntries(metricFields.map(field => [field, stats(rows.map(r => get(r, field)))]));
  // receivedAt is reset to zero during resync in v0.2.11. With no applied tick,
  // now - receivedAt is page uptime, not a measured multi-minute network delay.
  values['hud.age.validTickOnly'] = stats(rows.filter(r => finite(r.hud?.tick) && r.hud.tick >= 0).map(r => r.hud.age));
  return values;
}
function counter(rows, field) {
  const values = rows.map(r => get(r, field)).filter(finite);
  let resets = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[i - 1]) resets++;
  return { observations: values.length, first: values[0] ?? null, last: values.at(-1) ?? null, observedResets: resets,
    delta: values.length >= 2 && resets === 0 ? round(values.at(-1) - values[0]) : null };
}
const summaries = [];
for (const [fileIndex, file] of inputs.entries()) {
  const bytes = await readFile(file), rows = [], parseErrors = [];
  for (const [i, line] of bytes.toString('utf8').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('not a record');
      rows.push({ ...row, _line: i + 1 });
    } catch { parseErrors.push(i + 1); }
  }
  let page = 0, run = null, active = null;
  const battles = [];
  for (const row of rows) {
    if (run !== row.processRunId) { run = row.processRunId; active = null; }
    if (row.source === 'desktop' && row.event === 'page-loaded') { page++; active = null; }
    row._page = page;
    if (row.event === 'battle-start') {
      active = { id: `${String.fromCharCode(65 + fileIndex)}${battles.length + 1}`, page, start: row, rows: [], events: [] };
      battles.push(active);
    }
    if (!active) continue;
    if (row.source !== 'desktop') {
      if (row.event !== 'sample') active.events.push(row);
      if (['ended', 'battle-failed'].includes(row.event) && !active.terminal) active.terminal = row;
      if (row.battle === active.start.battle) active.rows.push(row);
      if (row.event === 'battle-stop' && row.battle === active.start.battle) { active.stop = row; active = null; }
    }
  }
  const battleSummaries = battles.map(battle => {
    const start = battle.start;
    const end = battle.terminal ?? battle.stop ?? battle.rows.at(-1);
    const samples = battle.rows.filter(r => r.event === 'sample');
    const live = samples.filter(r => r.monotonicMs < end.monotonicMs);
    const selected = live.filter(r => r.hidden === false && r.connected === true && r.monotonicMs - start.monotonicMs >= 5000);
    const context = rows.filter(r => r.processRunId === start.processRunId && r._page === battle.page &&
      r.desktopMonotonicMs >= start.desktopMonotonicMs && r.desktopMonotonicMs < end.desktopMonotonicMs);
    const peers = live.flatMap(r => r.steam?.peers ?? []);
    const n2n = context.filter(r => r.event === 'n2n-sample');
    const counterRows = [start, ...live];
    const failure = battle.events.find(r => r.event === 'battle-failed');
    return { id: battle.id, page: battle.page, battle: start.battle, transport: start.transport, role: start.role,
      startLine: start._line, stopLine: battle.stop?._line ?? null, terminalLine: battle.terminal?._line ?? null,
      wallStartLabel: new Date(start.wallTimeMs).toISOString(), durationUntilTerminalSeconds: round((end.monotonicMs - start.monotonicMs) / 1000),
      mountSeconds: round(((battle.stop ?? battle.rows.at(-1)).monotonicMs - start.monotonicMs) / 1000),
      sampleCount: samples.length, preTerminalSamples: live.length, selectedSamples: selected.length,
      hiddenSamples: samples.filter(r => r.hidden === true).length, disconnectedSamples: samples.filter(r => r.connected !== true).length,
      selectedHudUnavailable: selected.filter(r => !r.hud).length,
      selectedHudWithoutTick: selected.filter(r => r.hud && !finite(r.hud.tick)).length,
      shipEntities: stats(live.map(r => r.hud?.ships)), metrics: metrics(selected),
      motionAdmission: counts(selected.map(r => r.lan?.receivers?.[0]?.motionAdmission?.status ?? 'unavailable')),
      motionFallbackReason: counts(selected.map(r => r.lan?.receivers?.[0]?.motionAdmission?.fallbackReason ?? 'unavailable')),
      localCounters: Object.fromEntries(['runtime.longTaskCount', 'runtime.longTaskTotalMs', 'steam.receivedStates',
        'steam.snapshotWorker.offered', 'steam.snapshotWorker.prepared', 'steam.snapshotWorker.accepted',
        'steam.snapshotWorker.workMs', 'steam.snapshotWorker.faults'].map(field => [field, counter(counterRows, field)])),
      longTaskMaxMs: stats(live.map(r => r.runtime?.longTaskMaxMs)).max,
      steam: { peerObservations: peers.length, oldestAckMs: stats(peers.map(p => p.oldestAckMs)), ackMs: stats(peers.map(p => p.ackMs)),
        blockedBy: counts(peers.map(p => p.blockedBy ?? 'none')), snapshotSkip: counts(peers.map(p => p.lastSnapshotSkip ?? 'none')),
        inputSentSequence: stats(live.map(r => r.hud?.input?.sentSequence)) },
      n2n: { samples: n2n.length, status: counts(n2n.map(r => r.status)), routes: counts(n2n.flatMap(r => r.tunnels ?? []).map(t => t.trafficRoute)) },
      desktop: Object.fromEntries(['main', 'renderer', 'backend', 'gpu'].map(process => [process, {
        cpuPercentRaw: stats(context.filter(r => r.event === 'desktop-sample').map(r => r.processes?.[process]?.cpuPercent)),
        workingSetBytes: stats(context.filter(r => r.event === 'desktop-sample').map(r => r.processes?.[process]?.workingSetBytes)),
      }])),
      events: battle.events.map(r => ({ line: r._line, event: r.event, elapsedSeconds: round((r.monotonicMs - start.monotonicMs) / 1000), failureStage: r.failureStage ?? null })),
      failure: failure ? { line: failure._line, stage: failure.failureStage, elapsedSeconds: round((failure.monotonicMs - start.monotonicMs) / 1000),
        hasFailureDetails: failure.failure != null,
        lastSamples: live.slice(-5).map(r => ({ line: r._line, elapsedSeconds: round((r.monotonicMs - start.monotonicMs) / 1000),
          tick: r.hud?.tick ?? null, ships: r.hud?.ships ?? null, sim: r.hud?.sim ?? null, capture: r.hud?.capture ?? null,
          encode: r.hud?.encode ?? null, realtimeRatio: r.hud?.realtimeRatio ?? null,
          lastStepMs: r.hud?.authority?.lastStepMs ?? null, maxStepMs: r.hud?.authority?.maxStepMs ?? null })) } : null };
  });
  const meta = rows.find(r => r.metadata)?.metadata ?? {};
  summaries.push({ file: path.basename(file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    records: rows.length, parseErrorLines: parseErrors, runs: new Set(rows.map(r => r.processRunId)).size, pages: page,
    metadata: { appVersion: meta.appVersion, logicalCores: meta.logicalCores, totalMemoryBytes: meta.totalMemoryBytes },
    builds: [...new Set(rows.map(r => r.build).filter(Boolean))],
    eventCounts: counts(rows.map(r => `${r.source ?? 'renderer'}/${r.event}`)),
    desktopDropped: stats(rows.map(r => r.desktopDropped)),
    n2nStatus: counts(rows.filter(r => r.event === 'n2n-sample').map(r => r.status)),
    n2nRoutes: counts(rows.filter(r => r.event === 'n2n-sample').flatMap(r => r.tunnels ?? []).map(t => t.trafficRoute)),
    hasSessionEnd: rows.some(r => r.event === 'session-end'), battles: battleSummaries });
}
const result = { schema: 1, method: {
  scope: 'Historical JSONL only; no runtime changes, replay or benchmark.',
  selection: 'sample; same process/page/battle; >=5 seconds after mount; before first ended/battle-failed; hidden=false; connected=true. No explicit pause flag: not an unpaused-only filter.',
  quantiles: 'Nearest-rank, per valid numeric metric; null omitted, not zero. Unweighted across 1Hz sample records, not individual frames or inputs.',
  telemetry: 'RTT and input ACK HUD values are EMA. Independent flow windows may repeat across heartbeat samples; no per-frame tail claims.',
  clocks: 'Durations within renderer clock; desktop joins within same process/page only. Wall times are labels, never cross-machine latency.',
  counters: 'First/last observed pre-terminal counter delta; null on observed reset. No final cumulative value is treated as per-second cost.',
  peers: 'Pipeline/lan .0 receiver fields refer only to first reported receiver (seat 1 in supplied paired battles), not every peer.',
  caveats: 'No end-to-end input-to-photon measurement; snapshot bytes are not IP bandwidth; CPU is raw Electron telemetry with no normalisation assumptions; n2n routes are sampled tunnel aggregates, not proof of a per-peer route; no session-end does not prove crash.'
}, files: summaries };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(`Wrote ${output}`);
console.table(summaries.flatMap(s => s.battles.map(b => ({ id: b.id, role: b.role, via: b.transport,
  n: b.selectedSamples, hzP50: b.metrics['hud.hz'].p50, fpsP50: b.metrics['hud.fps'].p50,
  ackP50: b.metrics['hud.acknowledgementMs'].p50, ackP95: b.metrics['hud.acknowledgementMs'].p95, failure: b.failure?.stage ?? '' }))));
if (summaries.some(s => s.parseErrorLines.length)) process.exitCode = 1;

