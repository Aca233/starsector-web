import { LanPresentationRuntime } from '../../src/network/LanPresentationRuntime';
import { LanPresentationControls } from '../../src/network/LanPresentationControls';
import { Vector2 } from '../../src/engine/math/Vector2';
import { decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { assets, bytes } from './offscreen-presentation-page.mts';

function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function rejects(operation: () => unknown, message: string) {
  let rejected = false;
  try { operation(); } catch { rejected = true; }
  check(rejected, message);
}
/** Existing offscreen scenario extension, no input events or authority fixture.
 * All worlds/renderer resources are real; spies only record calls to the original
 * cleanup methods. A test-only latch delays genuine asset readiness. */
export async function checkLanPresentationOwner(data) {
  await assets();
  const frames = data.cases.map(row => decodeBinaryFrame(bytes(row.wire)));
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const gl = canvas.getContext('webgl2', { antialias: false });
  check(gl, 'WebGL2 required');
  const camera = new Vector2(), controls = new LanPresentationControls(camera);
  const owner = new LanPresentationRuntime(data.match, 0, undefined, canvas, gl, {}, controls);
  const trace: string[] = [];
  try {
    check(owner.controls === controls && owner.controls.camera === camera, 'Camera/control ownership changed');
    rejects(() => owner.world, 'Uninitialized world escaped');
    rejects(() => owner.views, 'Uninitialized UI escaped');
    check(owner.receive(frames[0]), 'Ingress before manifest-ready failed');
    check(!owner.receive(frames[0]), 'Duplicate tick accepted');
    const pendingPipeline = owner.pipeline;
    owner.resetPlayback();
    check(owner.appliedTick === -1 && owner.latest === null && owner.pipeline !== pendingPipeline, 'Pre-world epoch not reset');
    // A lower/equal authority tick is valid in the new playback epoch.
    check(owner.receive(frames[0]), 'New epoch rejected baseline');
    owner.initialize(frames[0]);
    const world = owner.world, views = owner.views;
    check(owner.controlledIds.size === data.match.players.length, 'Control roster missing');
    rejects(() => owner.initialize(frames[1]), 'World replaced in place');
    check(owner.world === world && owner.views === views, 'Rejected replacement mutated owner');
    await owner.prepareAssets();
    owner.applyPlayback(10000, true, frame => {
      check(owner.appliedTick === frame.tick && owner.latest === frame, 'Apply callback saw stale authority');
      trace.push('after');
    }, () => trace.push('before'));
    check(trace.join(',') === 'before,after', 'Apply measurement/callback ordering changed');
    check(owner.views.hud.playerShip.id === world.playerShip.id, 'HUD is not connected to owned world');
    const pipeline = owner.pipeline;
    const spy = (target, method: string, label: string) => {
      const original = target[method];
      target[method] = function (...args) { trace.push(label); return original.apply(this, args); };
    };
    for (const [name, method] of [['motion', 'clear'], ['combat', 'clear'], ['projectileVisuals', 'clear'],
      ['prediction', 'clear'], ['firePrediction', 'reset'], ['turretPrediction', 'reset'],
      ['projectileFlight', 'reset'], ['localContrails', 'reset'], ['localMuzzles', 'reset'], ['localParticles', 'reset']]) {
      spy(pipeline[name], method, name);
    }
    const expected = ['motion', 'combat', 'projectileVisuals', 'prediction', 'firePrediction', 'turretPrediction', 'projectileFlight', 'localContrails'];
    trace.length = 0;
    owner.receive(frames[1]); // Actual final snapshot retained before stop, no RAF yet.
    owner.stop();
    check(trace.join(',') === expected.join(','), 'Ordinary stop erased confirmed effects or changed cleanup ordering');
    check(owner.latest === frames[0] && owner.appliedTick === frames[0].tick, 'Stop rewrote displayed authority');
    owner.applyPlayback(10020, true);
    check(owner.latest === frames[1] && owner.appliedTick === frames[1].tick, 'Stop cancelled terminal endpoint');
    check(owner.views === views && owner.world === world, 'Stop detached final HUD/world');
    trace.length = 0;
    owner.resetPlayback();
    check(trace.join(',') === [...expected, 'localMuzzles', 'localParticles'].join(','), 'Resync failed to clear all effects');
    check(owner.latest === null && owner.appliedTick === -1, 'Resync inherited sync-ready evidence');
    check(owner.applyPlayback(10030, true).frames.length === 0, 'Old epoch endpoint replayed');
    owner.receive(frames[0]); owner.applyPlayback(10040, true);
    check(owner.appliedTick === frames[0].tick, 'World could not resume at new epoch');
    // Opt-in transport is owned by the actual runtime; no second lifecycle.
    let uiPacket;
    const publisher = owner.createUiPublisher(packet => { uiPacket = packet; }, () => {});
    rejects(() => owner.createUiPublisher(() => {}, () => {}), 'Duplicate UI owner accepted');
    publisher.publish(owner.appliedTick);
    const oldEpoch = publisher.session.epoch;
    owner.stop(); check(!publisher.stats.pending && publisher.session.epoch > oldEpoch, 'Stop retained UI credit');
    publisher.publish(owner.appliedTick);
    owner.resetPlayback(); check(!publisher.stats.pending && publisher.session.epoch > oldEpoch + 1, 'Reset retained UI credit');
    publisher.publish(0);
    const malformed = { ...frames[1], displayVersion: 999 };
    rejects(() => owner.apply([malformed]), 'Malformed frame accepted');
    check(!views.tactical({ action: 'close' }).accepted, 'Poisoned UI capability remained active');
    check(publisher.stats.closed && !publisher.complete({...publisher.session,revision:uiPacket.graph.revision,buffer:uiPacket.graph.buffer}), 'Failed owner retained UI publisher');
    rejects(() => owner.receive(frames[2]), 'Failed owner accepted ingress');
    owner.dispose(); owner.dispose();
    rejects(() => owner.initialize(frames[0]), 'Disposed owner reinitialized');
    check(owner.renderer.getResourceStats().residentTextures === 0, 'Disposed textures leaked');
  } finally { owner.dispose(); }

  // Exit before the first snapshot also owns a real renderer and must be safe.
  const early = new LanPresentationRuntime(data.match, 0, undefined, canvas, gl);
  early.stop(); early.resetPlayback(); early.dispose(); early.dispose();
  rejects(() => early.receive(frames[0]), 'Pre-world disposed owner accepted ingress');

  const delayed = new LanPresentationRuntime(data.match, 0, frames[0], canvas, gl);
  let release!: () => void;
  const latch = new Promise<void>(resolve => { release = resolve; });
  const prepare = delayed.renderer.prepareAssets.bind(delayed.renderer);
  delayed.renderer.prepareAssets = async view => { await prepare(view); await latch; };
  const lateCommands = delayed.createUiCommandOwner(() => {}, () => {}, () => {});
  lateCommands.publish();
  const lateRequest = { ...lateCommands.session, id:1, operation:{kind:'map',open:true} };
  const preparing = delayed.prepareAssets().then(() => false, () => true);
  try {
    delayed.dispose(); release();
    check(lateCommands.stats.closed && !lateCommands.receive(lateRequest), 'Disposed runtime accepted a queued UI command');
    check(await preparing, 'Late assets resurrected a disposed owner');
    check(!delayed.views.tactical({ action: 'close' }).accepted, 'Late load reopened UI');
  } finally { release(); delayed.dispose(); }

  const invalid = new LanPresentationRuntime(data.match, 0, undefined, canvas, gl);
  try {
    rejects(() => invalid.initialize({ ...frames[0], displayVersion: 999 }), 'Invalid bootstrap accepted');
    rejects(() => invalid.receive(frames[1]), 'Failed bootstrap accepted a new world');
  } finally { invalid.dispose(); invalid.dispose(); }
  return { sameCamera: true, preWorldIngress: true, resync: true, terminalEndpoint: true,
    uiCommandLifecycle: true, uiPublisherLifecycle: true, terminalEffectsPreserved: true, beforeApplyTiming: true, failClosed: true,
    disposeBeforeWorld: true, noLateReadiness: true, inputEvents: false };
}
