import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeInputFrameStages} from './lib/lan-input-frame-stages.mjs';
const fixture = () => ({
  evidence: {end: 200, edges: [{at: 90, keys: 1}], frames: [{at: 110, keys: 1, active: true}], phases: [{name: 'normal', edges: [{at: 90, keys: 1, controlSubmitAt: 110}]}]},
  timeline: {frames: [{start: 100, viewport: 101, apply: 106, pose: 107, follow: 108, draw: 111, end: 112}], receives: [{start: 94, end: 97}],
    restores: [{kind: 'world', start: 101, end: 106}, {kind: 'ships', start: 101, identity: 102, records: 104, end: 105}, {kind: 'validate', start: 101, end: 101.25}]},
});
test('normal input partitions one actual draw and retains nested restore accounting', () => {
  const f = fixture(), result = summarizeInputFrameStages(f.evidence, f.timeline), row = result.rows[0];
  assert.equal(result.missing, 0); assert.equal(row.wait, 10); assert.equal(row.work, 10); assert.equal(row.total, 20);
  assert.deepEqual(row.stages, {viewport: 1, apply: 5, pose: 1, follow: 1, render: 2}); assert.equal(row.receiveMs, 3);
  assert.deepEqual(row.restore, {worlds: 1, ships: 1, validators: 1, worldMs: 5, shipMs: 4, shipFieldsMs: 2, shipPostcheckMs: 1, validationMs: .25});
});
test('missing draw, duplicate draw/callback and wrong control mask remain missing, not zero', () => {
  for (const kind of ['none', 'doubleDraw', 'doubleCallback', 'wrongKeys', 'noTimestamp']) {
    const f = fixture();
    if (kind === 'none') f.evidence.frames = [];
    if (kind === 'doubleDraw') f.evidence.frames.push({...f.evidence.frames[0]});
    if (kind === 'doubleCallback') f.timeline.frames.push({...f.timeline.frames[0]});
    if (kind === 'wrongKeys') f.evidence.frames[0].keys = 2;
    if (kind === 'noTimestamp') f.evidence.phases[0].edges[0].controlSubmitAt = null;
    const r = summarizeInputFrameStages(f.evidence, f.timeline); assert.equal(r.missing, 1); assert.equal(r.metrics.total.p95, null);
  }
});
test('out-of-window draw and missing phase cannot manufacture a response', () => {
  const f = fixture(); f.evidence.edges.push({at: 105, keys: 2});
  assert.equal(summarizeInputFrameStages(f.evidence, f.timeline).missing, 1);
  assert.throws(() => summarizeInputFrameStages(f.evidence, f.timeline, 'absent'), /measured phase/);
});
test('invalid frame or nested ship ordering fails explicitly', () => {
  const f = fixture(); f.timeline.frames[0].pose = 100;
  assert.throws(() => summarizeInputFrameStages(f.evidence, f.timeline), /monotonic input\/frame/);
  const g = fixture(); g.timeline.restores[1].identity = 107;
  assert.throws(() => summarizeInputFrameStages(g.evidence, g.timeline), /monotonic ship/);
});
test('partially overlapping restore is unknown; a real no-restore frame is zero', () => {
  const f = fixture(); f.timeline.restores[0].start = 99;
  const row = summarizeInputFrameStages(f.evidence, f.timeline).rows[0]; assert.equal(row.restore, null); assert.equal(row.partialRestores, 1);
  f.timeline.restores = [];
  assert.equal(summarizeInputFrameStages(f.evidence, f.timeline).rows[0].restore.shipFieldsMs, 0);
});
