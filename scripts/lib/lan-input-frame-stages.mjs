// Offline analysis of actual main-thread input/frame probes, never a production scheduler.
import assert from 'node:assert/strict';
import {quantiles} from './lan-presentation-latency.mjs';
export function summarizeInputFrameStages(evidence, timeline, phaseName = 'normal') {
  const phase = evidence.phases.find(p => p.name === phaseName); assert.ok(phase, 'measured phase must exist');
  const rows = phase.edges.map((edge, index) => {
    const missing = (reason, extra = {}) => ({index, edge, missing: true, reason, ...extra});
    const until = evidence.edges.find(e => e.at > edge.at)?.at ?? evidence.end;
    if (!Number.isFinite(edge.controlSubmitAt) || edge.controlSubmitAt < edge.at || edge.controlSubmitAt >= until) return missing('no control submission inside its input window');
    const draws = evidence.frames.filter(f => f.at === edge.controlSubmitAt && f.active && f.keys === edge.keys);
    if (draws.length !== 1) return missing('no unique actual matching draw', {drawMatches: draws.length});
    const draw = draws[0], callbacks = timeline.frames.filter(f => f.start <= draw.at && f.end >= draw.at);
    if (callbacks.length !== 1) return missing('no unique actual callback', {callbackMatches: callbacks.length});
    const frame = callbacks[0], points = [edge.at, frame.start, frame.viewport, frame.apply, frame.pose, frame.follow, draw.at, frame.draw, frame.end];
    assert.ok(points.every((n, i) => Number.isFinite(n) && (!i || n >= points[i - 1])), 'monotonic input/frame phases');
    const stages = {viewport: frame.viewport - frame.start, apply: frame.apply - frame.viewport, pose: frame.pose - frame.apply, follow: frame.follow - frame.pose, render: draw.at - frame.follow};
    const wait = frame.start - edge.at, work = draw.at - frame.start, total = draw.at - edge.at;
    assert.ok(Math.abs(wait + work - total) < .001);
    assert.ok(Math.abs(Object.values(stages).reduce((a, b) => a + b, 0) - work) < .001);
    const receives = timeline.receives.filter(r => r.start < frame.start && r.end > edge.at);
    const receiveMs = receives.reduce((sum, r) => sum + Math.max(0, Math.min(r.end, frame.start) - Math.max(r.start, edge.at)), 0);
    const overlapping = (timeline.restores ?? []).filter(r => r.start < frame.apply && r.end > frame.start);
    const partial = overlapping.filter(r => r.start < frame.start || r.end > frame.apply);
    let restore = null;
    if (!partial.length) {
      for (const r of overlapping) assert.ok(Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start, 'valid restore interval');
      const worlds = overlapping.filter(r => r.kind === 'world'), ships = overlapping.filter(r => r.kind === 'ships'), validators = overlapping.filter(r => r.kind === 'validate');
      for (const r of ships) assert.ok([r.start, r.identity, r.records, r.end].every((n, i, a) => Number.isFinite(n) && (!i || n >= a[i - 1])), 'monotonic ship restore phases');
      restore = {worlds: worlds.length, ships: ships.length, validators: validators.length,
        worldMs: worlds.reduce((sum, r) => sum + r.end - r.start, 0), shipMs: ships.reduce((sum, r) => sum + r.end - r.start, 0),
        shipFieldsMs: ships.reduce((sum, r) => sum + r.records - r.identity, 0), shipPostcheckMs: ships.reduce((sum, r) => sum + r.end - r.records, 0),
        validationMs: validators.reduce((sum, r) => sum + r.end - r.start, 0)};
    }
    return {index, edge, frame, draw, missing: false, wait, work, total, stages, receiveCount: receives.length, receiveMs, restore, partialRestores: partial.length};
  });
  const valid = rows.filter(r => !r.missing);
  return {scope: 'Same-input main-thread callback partition only. Wait contains scheduling and queued work, not proven GPU/idle time. Restore functions can be nested: do NOT add worldMs and shipMs. No comparison with uninstrumented performance gates.',
    phase: phaseName, count: rows.length, missing: rows.length - valid.length,
    metrics: Object.fromEntries(['wait', 'work', 'total', 'receiveCount', 'receiveMs'].map(k => [k, quantiles(valid.map(r => r[k]))])),
    stages: Object.fromEntries(['viewport', 'apply', 'pose', 'follow', 'render'].map(k => [k, quantiles(valid.map(r => r.stages[k]))])), rows};
}
