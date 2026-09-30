import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { transformSync } from 'esbuild';

function extract(file, method) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), matches = [];
  const visit = node => {
    if (method ? ts.isMethodDeclaration(node) && node.name.getText(source) === method
      : ts.isVariableDeclaration(node) && node.name.getText(source) === 'frame' && node.initializer
        && ts.isArrowFunction(node.initializer) && node.initializer.body.getText(source).includes('requestAnimationFrame(frame)')) {
      matches.push(method ? 'function ' + node.getText(source) : node.initializer.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source); assert.equal(matches.length, 1, `${file}: ${method ?? 'frame'}`);
  return transformSync('globalThis.stage = ' + matches[0], { loader: 'tsx', define: { 'import.meta.env': '{}' } }).code;
}
const policy = process.env.LAN_FRAME_CLOCK_POLICY ?? (process.env.LAN_FRAME_CLOCK_EXPECT_EXECUTION === 'true' ? 'execution' : 'raf');
assert.ok(['raf', 'execution', 'late-pose'].includes(policy));
const execution = policy === 'execution', late = policy === 'late-pose';
const current = extract(process.env.LAN_FRAME_CLOCK_SOURCE ?? 'src/network/LanBattle.tsx');
function fixture(code = current) {
  const events = [], requests = [], failures = [], details = []; let reads = 0;
  const context = {
    wallNow: 170, applyCost: 0, poseCost: 0, allowed: true, focused: true,
    performance: { now: () => { reads++; return context.wallNow; } },
    disposed: false, stopped: false, remote: null, document: { visibilityState: 'visible' }, ready: true, engine: {},
    frameId: 0, lastFrame: 90, frameMs: 0, fpsWindowAt: 170, fps: 0, frameCount: 0, lastHUD: 1000000,
    launched: true, synced: true, receivedAt: 169, lastInput: 169, applyMs: 0, renderMs: 0, seq: 1, keys: 1, firing: false,
    LAYERS: new Set(), camera: { set() {} }, hudZoomRef: { current: 0 },
    canvas: { width: 16, height: 16, getBoundingClientRect: () => ({ left: 0, top: 0, width: 16, height: 16 }) }, window: { devicePixelRatio: 1 },
    requestAnimationFrame: callback => { requests.push(callback); return requests.length; },
    readCombatViewport: () => ({ width: 16, height: 16, rect: { left: 0, top: 0, width: 16, height: 16 } }),
    applyRate: { receive: now => events.push(['rate', now]) },
    active: () => context.allowed && context.focused && context.launched && context.synced,
    hasCombatInputFocus: () => context.focused,
    synchronize: (now, tick) => events.push(['sync', now, tick]), pushControls: () => events.push(['controls']), setStatus: () => {},
    controls: {
      hudZoom: () => 1, readInput: () => ({ seq: 1, keys: 1 }), zoom: 1,
      follow: (_world, alpha, _view, dt, active) => { events.push(['follow', dt]); details.push({ kind: 'camera', alpha, dt, active }); },
    },
    sample: { frames: [{}], alpha: .4, delayMs: 16, visualTime: 12, reset: false },
    presentation: {
      appliedTick: 12,
      applyPlayback: (now, _immediate, onApply, before) => {
        if (context.sample.frames.length) { before(); context.wallNow += context.applyCost; onApply(); }
        events.push(['apply', now]); return context.sample;
      },
      renderPose: (now, readInput, active) => { readInput(); events.push(['pose', now]); details.push({ kind: 'pose', active }); context.wallNow += context.poseCost; },
      drawPlayback: (sample, now, view, activity) => {
        assert.equal(sample, context.sample); events.push(['draw', now, view.dt, activity.fireActive]); details.push({ kind: 'draw', activity }); return true;
      },
    },
    fail: (message, kind) => failures.push({ message, kind }),
  };
  vm.createContext(context); vm.runInContext(code, context); context.frame = context.stage;
  return { context, events, requests, failures, details, reads: () => reads };
}
test('actual frame keeps the selected snapshot/pose clock policy and one RAF chain', () => {
  const f = fixture(); f.context.stage(90); assert.deepEqual(f.failures, []);
  const base = execution ? 170 : 90, pose = late || execution ? 170 : 90;
  assert.deepEqual(f.events.filter(row => ['apply', 'pose', 'sync', 'draw'].includes(row[0])),
    [['apply', base], ['sync', base, 12], ['pose', pose], ['draw', pose, execution ? .05 : 0, true]]);
  assert.equal(f.requests.length, 1); assert.equal(f.context.lastFrame, base);
  f.events.length = 0; f.context.wallNow = 200; f.context.stage(106);
  assert.deepEqual(f.events.find(row => row[0] === 'draw'), ['draw', late || execution ? 200 : 106, execution ? .03 : .016, true]);
  assert.equal(f.requests.length, 2);
});
test('late sampling waits for restore and shares its clock with effects, not dt/alpha', () => {
  const f = fixture(); f.context.applyCost = 8; f.context.poseCost = 5; f.context.stage(100);
  const expected = late ? 178 : execution ? 170 : 100;
  assert.equal(f.events.find(row => row[0] === 'pose')[1], expected);
  assert.equal(f.events.find(row => row[0] === 'draw')[1], expected);
  assert.deepEqual(f.details.find(row => row.kind === 'camera'), { kind: 'camera', alpha: .4, dt: execution ? .05 : .01, active: true });
  const empty = fixture(); empty.context.sample.frames = []; empty.context.stage(90);
  assert.equal(empty.events.find(row => row[0] === 'pose')[1], late || execution ? 170 : 90);
});
test('long stalls retain the 50ms visual dt cap', () => {
  const f = fixture(); f.context.wallNow = 1110; f.context.stage(1000);
  assert.equal(f.events.find(row => row[0] === 'draw')[2], .05);
  assert.equal(f.events.find(row => row[0] === 'follow')[1], .05);
});
test('hidden/unready/disposed paths never add draws or a second callback chain', () => {
  for (const kind of ['hidden', 'unready', 'disposed']) {
    const f = fixture(); if (kind === 'hidden') f.context.document.visibilityState = 'hidden';
    if (kind === 'unready') f.context.ready = false; if (kind === 'disposed') f.context.disposed = true;
    f.context.stage(90); assert.equal(f.events.length, 0); assert.equal(f.requests.length, kind === 'disposed' ? 0 : 1);
    if (kind === 'disposed') assert.equal(f.reads(), 0);
  }
});
test('fire freshness, permission, launch and focus gates cannot be bypassed', () => {
  const stale = fixture(); stale.context.receivedAt = -100; stale.context.stage(90);
  assert.equal(stale.events.find(row => row[0] === 'draw')[3], !execution && !late);
  for (const gate of ['allowed', 'focused', 'launched', 'synced']) {
    const f = fixture(); f.context[gate] = false; f.context.stage(90);
    assert.equal(f.details.find(row => row.kind === 'pose').active, false);
    assert.equal(f.details.find(row => row.kind === 'camera').active, false);
    assert.equal(f.events.find(row => row[0] === 'draw')[3], false);
    if (gate === 'launched' || gate === 'synced') assert.equal(f.details.find(row => row.kind === 'draw').activity.running, false);
    if (gate === 'focused') assert.equal(f.details.find(row => row.kind === 'draw').activity.projectilesActive, false);
  }
});
test('remote sync and draw failure retain prior branches and do not sample a late clock', () => {
  const remote = fixture(); remote.context.remote = { readRealtime: () => ({ tick: 15, cameraX: 1, cameraY: 2, hudZoom: 3 }) }; remote.context.stage(90);
  assert.deepEqual(remote.events, [['controls'], ['sync', execution ? 170 : 90, 15]]);
  assert.equal(remote.requests.length, 1); assert.equal(remote.context.hudZoomRef.current, 3); assert.equal(remote.reads(), execution ? 1 : 0);
  const failure = fixture(); failure.context.presentation.drawPlayback = () => { throw 'fixture draw failure'; }; failure.context.stage(90);
  assert.equal(failure.context.ready, false); assert.deepEqual(failure.failures, [{ message: 'fixture draw failure', kind: 'frame-loop' }]); assert.equal(failure.requests.length, 1);
});
test('baseline comparison uses actual source, not a copied implementation', { skip: !process.env.LAN_FRAME_CLOCK_BASELINE || policy === 'raf' }, () => {
  const before = fixture(extract(process.env.LAN_FRAME_CLOCK_BASELINE)); before.context.stage(90);
  const after = fixture(); after.context.stage(90);
  assert.ok(before.events.find(row => row[0] === 'pose')[1] < 100);
  assert.ok(after.events.find(row => row[0] === 'pose')[1] >= 100);
  if (late) assert.deepEqual(after.events.filter(row => ['apply', 'sync', 'follow'].includes(row[0])), before.events.filter(row => ['apply', 'sync', 'follow'].includes(row[0])));
});
function stage(file, method, globals = {}) {
  const context = vm.createContext(globals); vm.runInContext(extract(file, method), context); return context.stage;
}
test('actual runtime forwards pose/effects time while retaining confirmed sample time', () => {
  const world = {}, input = () => ({}), sample = { alpha: .3, visualTime: 4, reset: false }, calls = [], activity = {};
  const receiver = { assertActive() {}, world, appliedTick: 7, pipeline: {
    renderPose: (...args) => calls.push(['pose', ...args]), renderEffects: (...args) => calls.push(['effects', ...args]),
  }, draw: view => { calls.push(['draw', view]); return true; } };
  stage('src/network/LanPresentationRuntime.ts', 'renderPose').call(receiver, 178, input, true);
  stage('src/network/LanPresentationRuntime.ts', 'drawPlayback').call(receiver, sample, 178, { dt: .016 }, activity);
  assert.deepEqual(calls.slice(0, 2), [['pose', world, 7, 178, input, true], ['effects', world, sample, 178, activity]]);
  assert.equal(calls[2][1].visualTime, 4); assert.equal(calls[2][1].alpha, .3); assert.equal(calls[2][1].dt, .016);
});
test('actual pipeline sends late time to pose consumers and preserves inactive suspension', () => {
  const player = {}, world = { playerShip: player, capitalShips: [] }, calls = [], input = { seq: 2, keys: 1 };
  const receiver = { combat: { apply: () => {} }, motion: { render: (_w, now) => calls.push(['motion', now]), row: (_id, now) => { calls.push(['row', now]); return null; } },
    projectileVisuals: { render: (_w, now) => calls.push(['visuals', now]) }, prediction: { render: (_p, _input, now) => calls.push(['prediction', now]), suspend: (_p, reason) => calls.push(['suspend', reason]) },
    turretPrediction: { render: (_w, _input, now) => calls.push(['turrets', now]) } };
  const render = stage('src/network/LanPresentationPipeline.ts', 'renderPose', { projectileSnapshotTick: () => 7 });
  render.call(receiver, world, 7, 178, () => input, true);
  assert.deepEqual(calls, [['motion', 178], ['visuals', 178], ['row', 178], ['prediction', 178], ['turrets', 178]]);
  calls.length = 0; render.call(receiver, world, 7, 190, () => input, false);
  assert.ok(calls.some(row => row[0] === 'suspend' && row[1] === 'inactive')); assert.ok(!calls.some(row => row[0] === 'prediction'));
});
test('actual pipeline never substitutes predicted wall time for confirmed effects time', () => {
  const calls = [], world = {}, sample = { alpha: .3, visualTime: 4, reset: true };
  const receiver = { localContrails: { update: (_w, ...args) => calls.push(['contrails', ...args]) },
    localMuzzles: { update: (_w, ...args) => calls.push(['muzzles', ...args]) }, localParticles: { update: (_w, ...args) => calls.push(['particles', ...args]) },
    projectileFlight: { render: (_w, ...args) => calls.push(['flight', ...args]) }, firePrediction: { render: (_w, ...args) => calls.push(['fire', ...args]) } };
  stage('src/network/LanPresentationPipeline.ts', 'renderEffects').call(receiver, world, sample, 178, { running: true, projectilesActive: true, fireActive: false });
  assert.deepEqual(calls, [['contrails', 4, .3, true], ['muzzles', 4, true], ['particles', 4, true], ['flight', 178, true], ['fire', 178, false]]);
});
