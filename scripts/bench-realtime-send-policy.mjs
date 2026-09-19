// Local send-FIFO A/B with the actual old/new browser entry and input producer.
// No network, Steam SDK, or gameplay simulation. Ages below are FIFO residence
// only, not RTT, remote receipt, or end-to-end player latency.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRealtimeFixtures } from './lib/realtime-send-fixture.mjs';
const inputDir = path.resolve(process.argv[2] ?? 'artifacts/shared-realtime-send-20260919');
const outDir = path.resolve(process.argv[3] ?? path.join(inputDir, 'fifo-1'));
fs.mkdirSync(outDir, { recursive: true });
const previousProtocol = fs.readFileSync(path.join(inputDir, 'protocol-before.ts'), 'utf8');
const previousBattle = fs.readFileSync(path.join(inputDir, 'LanBattle-before.tsx'), 'utf8');
const factory = {
  baseline: await createRealtimeFixtures({ protocolSource: previousProtocol, battleSource: previousBattle }),
  shared: await createRealtimeFixtures(),
};
const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1] ?? null;
const hash = text => createHash('sha256').update(text).digest('hex');
const provenance = { baselineProtocol: hash(previousProtocol), baselineBattle: hash(previousBattle),
  currentProtocol: hash(fs.readFileSync('src/network/protocol.ts')), currentBattle: hash(fs.readFileSync('src/network/LanBattle.tsx')),
  policy: hash(fs.readFileSync('src/network/RealtimeSendPolicy.mjs')), harness: hash(fs.readFileSync('scripts/lib/realtime-send-fixture.mjs')) };
function simulate(variant, transport, kind, scenario) {
  const f = factory[variant](transport), queue = [], completed = [], actions = []; let now = 0, queued = 0, peak = 0, next = 0, seq = 0, sent = 0, offered = 0;
  f.socket.send = raw => {
    const text = String(raw), bytes = Buffer.byteLength(text), value = JSON.parse(text);
    queue.push({ remaining: bytes, at: now, seq: value.seq ?? value.input.seq, actions: value.input?.actions.map(a => a.id) ?? [] });
    queued += bytes; f.socket.bufferedAmount = Math.ceil(queued); peak = Math.max(peak, queued); sent++;
  };
  const rate = t => scenario === 'healthy' ? 2500000 : scenario === 'collapse-recover' && (t < 4000 || t >= 12000) ? 2500000 : kind !== 'input' ? 131072 : 4096;
  for (now = 0; now < 40000; now++) {
    f.at(now);
    if (now < 16000 && now >= next) {
      next += 1000 / 60; offered++;
      const offerInput = () => { if (offered % 120 === 0) f.producer.action(offered / 120); f.producer.set({ x: now, keys: offered % 255 }); f.producer.tick(); };
      if (kind === 'mixed-input-first') offerInput();
      if (kind !== 'input') {
        const json = JSON.stringify({ tick: ++seq, ballast: 'x'.repeat(30000) });
        f.connection.sendSnapshot('battle', seq, { json, bytes: Buffer.byteLength(json) });
      }
      if (kind !== 'state' && kind !== 'mixed-input-first') offerInput();
    }
    let budget = rate(now) / 1000;
    while (queue.length && budget > 0) {
      const item = queue[0], take = Math.min(budget, item.remaining); budget -= take; item.remaining -= take; queued -= take;
      if (item.remaining < 1e-7) { queue.shift(); completed.push({ at: now, sourceAt: item.at, age: now - item.at, seq: item.seq }); actions.push(...item.actions); }
    }
    if (!queue.length) queued = 0;
    f.socket.bufferedAmount = Math.ceil(queued);
    if (now >= 16000 && !queue.length) break;
  }
  assert.equal(queue.length, 0); assert.equal(new Set(actions).size, actions.length, 'no duplicated admitted action');
  return { variant, transport, kind, scenario, offered, sent, completed: completed.length, queuedBytesAtEnd: queued,
    peakLocalQueuedBytes: Math.ceil(peak), localFifoAgeP95: percentile(completed.map(p => p.age), .95), maxLocalFifoAge: Math.max(...completed.map(p => p.age)),
    deliveredActionIds: actions, retainedActions: f.producer.actions.length, samples: completed };
}
const results = [];
for (const transport of ['lan', 'steam']) for (const kind of ['input', 'state', 'mixed', 'mixed-input-first']) for (const scenario of ['healthy', 'slow', 'collapse-recover']) for (const variant of ['baseline', 'shared']) {
  const r = simulate(variant, transport, kind, scenario); results.push(r);
  console.log(JSON.stringify({ transport, kind, scenario, variant, sent: r.sent, ageP95: r.localFifoAgeP95, peak: r.peakLocalQueuedBytes, retainedActions: r.retainedActions }));
}
const comparisons = results.filter(r => r.variant === 'shared').map(r => {
  const a = results.find(a => a.variant === 'baseline' && a.transport === r.transport && a.kind === r.kind && a.scenario === r.scenario);
  assert.ok(r.peakLocalQueuedBytes <= a.peakLocalQueuedBytes);
  assert.ok(r.localFifoAgeP95 <= a.localFifoAgeP95);
  if (r.scenario === 'healthy') assert.equal(r.sent, a.sent, 'healthy cadence must be unchanged');
  if (r.kind !== 'state') assert.equal(r.deliveredActionIds.length + r.retainedActions, 8, 'accepted or still retained, never discarded under pressure');
  return { transport: r.transport, kind: r.kind, scenario: r.scenario, baselineAgeP95: a.localFifoAgeP95, sharedAgeP95: r.localFifoAgeP95,
    baselinePeakBytes: a.peakLocalQueuedBytes, sharedPeakBytes: r.peakLocalQueuedBytes, baselineSent: a.sent, sharedSent: r.sent,
    lostActionsBefore: r.kind !== 'state' ? 8 - a.deliveredActionIds.length - a.retainedActions : null, lostActionsAfter: r.kind !== 'state' ? 0 : null };
});
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ scope: 'Actual browser client/producer over modeled LOCAL FIFO; not real LAN/Steam network delay. 60Hz offered in all cases; backpressure changes admitted rate, not physics.', provenance, comparisons, results }, null, 2) + '\n', { flag: 'wx' });
