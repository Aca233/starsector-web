import { legacyPresentationPipeline } from './legacy-presentation-pipeline.mts';
import { SnapshotPlayback } from '../../src/network/SnapshotPlayback';
// Browser-only fixture/DOM lane for the existing battle-batching scenario.
// Imports here deliberately exist in the frozen pre-change graph as well.
import { assetManager } from '../../src/engine/assets/AssetResolver';
import { contentManifestManager } from '../../src/engine/content/ContentManifest';
import { createLanWorld } from '../../src/network/LanWorld';
import { captureLanDisplayCombat } from '../../src/network/HostSnapshot';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { applyLanDisplaySnapshots } from '../../src/network/LanDisplaySnapshot';
import { decodeBinaryFrame, encodeProjectedBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { WebGLCombatRenderer } from '../../src/engine/render/webgl/WebGLCombatRenderer';
import { Vector2 } from '../../src/engine/math/Vector2';
import { TextureCache, textureCache } from '../../src/engine/render/TextureCache';
import { WebGLTextureManager } from '../../src/engine/render/webgl/WebGLTextureManager';
import { VisualRandom } from '../../src/engine/runtime/VisualRandom';

export async function assets() {
  await assetManager.ensureManifestLoaded();
  await contentManifestManager.ensureLoaded();
}
export const layers = ['background', 'nebula', 'asteroid', 'trail', 'hull', 'weapon', 'beam', 'shield', 'explosion', 'markers'];
export function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
export function bytes(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
export function gpu(gl) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
}
export function pixels(gl) {
  const result = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, result);
  return result;
}
export async function fixture(options = {}) {
  await assets();
  const match = { id: 'offscreen-check', seed: 917, hostId: 'p0', snapshotHz: 60,
    players: Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, seat: i, team: i % 2, hull: 'onslaught' })),
    options: { assignment: 'teams', battleSize: 3200, aiHulls: [Array(9).fill('hammerhead'), Array(8).fill('hammerhead')] } };
  const components = options.components ? (await import('./component-base64-fixtures.mts')).createComponentBase64Fixtures(match.id) : null;
  const engine = createLanWorld(match).engine;
  for (let i = 0; i < 600; i++) engine.fixedUpdate(1 / 60);
  const cases = [];
  const capture = (tick, name, camera, zoom) => {
    components?.capture(engine, tick);
    const frame = captureLanDisplayCombat(engine, tick, {}, 0, null, false, true);
    const wire = encodeProjectedBinaryFrame(frame, true);
    if (!wire) throw Error('Fixture did not use actual projected binary');
    cases.push({ name, wire: base64(wire), tick, camera, zoom, visualTime: tick / 60, dt: 1 / 60,
      ships: frame.ships.length, projectiles: engine.projectiles.length, marks: engine.ships.reduce((n, s) => n + s.scorchMarks.length, 0) });
  };
  for (let i = 0; i < 4; i++) {
    capture(600 + i, 'combat-' + i, [engine.playerShip.pos.x, engine.playerShip.pos.y], [.35, .5, 1, .7][i]);
    engine.fixedUpdate(1 / 60);
  }
  // Match the established hull-overlay fixture, preserving all real ship assets.
  for (const [si, s] of engine.ships.entries()) {
    s.pos.set(si === 0 ? 0 : 700 + (si % 5) * 500, si === 0 ? 0 : (Math.floor(si / 5) - 2) * 500);
    s.prevPos.copy(s.pos); s.facingRad = si * .51; s.prevFacingRad = s.facingRad;
    for (let i = 0; i < 60; i++) s.damageDecals.marks.push({ cellIndex: i,
      localPos: new Vector2((i % 10 - 5) * 16, (Math.floor(i / 10) - 3) * 16), opacity: .8, intensity: .9,
      heat: 220, justHit: false, flash: 0, flashElapsed: 0, phase: 0, pulsePeriod: .5,
      size: 45, rotationRad: i * .27, kind: ['cracks', 'burns', 'holes'][i % 3], variant: i % 2 });
    s.flux.isOverloaded = true; s.flux.overloadTimer = 2;
  }
  const source = engine.ships.at(-1), bounds = [new Vector2(-100, -70), new Vector2(100, -70), new Vector2(100, 70), new Vector2(-100, 70)];
  source.hullHp = 0;
  engine.hulkFragments.push({ id: 999, pos: new Vector2(-600, 0), vel: new Vector2(), facingRad: .7,
    angularVel: 0, sourceShip: source, age: .2, breakup: null, bounds, visualBounds: bounds, mountSlotIds: [],
    localOffset: new Vector2(20, 5), collisionRadius: 130 });
  for (const x of [0, 180, 900, 1900]) engine.fxSystem.spawnSparks(new Vector2(x, 40), 50);
  for (const [i, [x, y, zoom]] of [[0, 0, 1], [510, 0, 1], [514, 0, 1], [-600, 0, 1], [2000, 0, .5], [5000, 5000, 1], [0, 0, .5], [0, 0, 2]].entries()) {
    for (const s of engine.ships) for (const [j, m] of s.scorchMarks.entries()) m.intensity = ((i * 7 + j * 11) % 255) / 255;
    engine.combatTime = (604 + i) / 60;
    capture(604 + i, 'damage-' + i, [x, y], zoom);
  }
  return { match, cases, ...(components ? { components: components.data } : {}) };
}

export async function createDomLane(data, canvas, trace = false) {
  await assets();
  const wire = data.cases.map(c => bytes(c.wire));
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw Error('WebGL2 required');
  // Only the candidate opts into the actual LanBattle owner; frozen baseline
  // still executes the previous explicit playback/pipeline/renderer sequence.
  const owner = data.owner ? new (await import('../../src/network/LanPresentationRuntime')).LanPresentationRuntime(data.match, 0, undefined, canvas, gl) : null;
  if (owner) owner.initialize(decodeBinaryFrame(wire[0]));
  const world = owner?.world ?? createLanDisplayWorld(data.match, 0, decodeBinaryFrame(wire[0])).world;
  const renderer = owner?.renderer ?? new WebGLCombatRenderer(canvas, gl), random = new VisualRandom(data.match.seed);
  if (owner) await owner.prepareAssets(); else await renderer.prepareAssets(world.renderView());
  const pipeline = data.pipeline ? legacyPresentationPipeline(data.match.id, 0) : null; let playback = new SnapshotPlayback(), appliedTick = -1;
  const canvases = new Map(), upload = renderer.textures.getCanvasTexture.bind(renderer.textures);
  if (trace) renderer.textures.getCanvasTexture = (id, canvas, revision) => { canvases.set(id, canvas); return upload(id, canvas, revision); };
  return {
    gpu: gpu(gl),
    canvases() { return [...canvases].map(([id, c]) => ({ id, width: c.width, height: c.height, data: base64(c.getContext('2d').getImageData(0, 0, c.width, c.height).data) })); },
    draw(index, readPixels = false) {
      const c = data.cases[index], start = performance.now(), snapshot = decodeBinaryFrame(wire[index]), decoded = performance.now();
      let sample;
      if (owner) {
        if (index === 0) owner.resetPlayback();
        owner.receive(snapshot); sample = owner.applyPlayback(c.tick * 1000 / 60, false);
      } else if (pipeline) {
        if (index === 0) { pipeline.reset(world); playback = new SnapshotPlayback(); appliedTick = -1; }
        if (playback.push(snapshot)) pipeline.receive(snapshot);
        sample = playback.sample(c.tick * 1000 / 60, false);
        if (sample.frames.length) pipeline.applyEndpoints(world, sample, c.tick * 1000 / 60, frame => { appliedTick = frame.tick; });
      } else applyLanDisplaySnapshots(world, [snapshot], index === 0);
      const applied = performance.now();
      if (!owner && pipeline) {
        const now = c.tick * 1000 / 60;
        pipeline.renderPose(world, appliedTick, now, () => ({ seq: 0, keys: 0, aim: [world.playerShip.aimTargetWorld.x, world.playerShip.aimTargetWorld.y], firing: false, pointerActive: false, actions: [] }), false);
        pipeline.renderEffects(world, sample, now, { running: true, projectilesActive: false, fireActive: false });
      }
      const frame = { visualTime: sample?.visualTime ?? c.visualTime, random, layers: new Set(layers), damageEnabled: true };
      if (owner) {
        const now = c.tick * 1000 / 60;
        owner.renderPose(now, () => ({ seq: 0, keys: 0, aim: [world.playerShip.aimTargetWorld.x, world.playerShip.aimTargetWorld.y], firing: false, pointerActive: false, actions: [] }), false);
        if (!owner.drawPlayback(sample, now, { dt: c.dt, camera: new Vector2(...c.camera), zoom: c.zoom, layers: new Set(layers), damageEnabled: true },
          { running: true, projectilesActive: false, fireActive: false })) throw Error('Owner render skipped');
      } else {
        renderer.updateVisual(world.renderView(), c.dt, frame);
        if (!renderer.render(world.renderView(), sample?.alpha ?? 1, new Vector2(...c.camera), c.zoom, frame)) throw Error('Render skipped');
      }
      gl.finish();
      const end = performance.now();
      if (gl.getError()) throw Error('DOM WebGL error');
      return { decodeMs: decoded - start, applyMs: applied - decoded, drawMs: end - applied, totalMs: end - start,
        combatTime: world.combatTime, resources: renderer.getResourceStats(), pixels: readPixels ? base64(pixels(gl)) : null };
    },
    async lifecycle() {
      const cache = new TextureCache(), url = '/game-assets/__offscreen-test/dom.png';
      let loaded = 0, failed = 0;
      const unsubscribe = cache.onImageReady(url, () => loaded++, () => failed++);
      const image = await cache.waitForTextureImage(url); await Promise.resolve(); unsubscribe();
      if (!(image instanceof HTMLImageElement) || loaded !== 1 || failed) throw Error('DOM load event behavior changed');
      cache.onImageReady(url, () => loaded++, () => failed++)(); await Promise.resolve();
      if (loaded !== 1 || failed) throw Error('DOM queued callback not cancelled');
      const tinted = cache.getTintedImage(url, 90, 120, 200);
      cache.disposeBitmapImages();
      if (cache.getImageState(url) !== 'decoded' || cache.getImage(url) !== image || cache.getTintedImage(url, 90, 120, 200) !== tinted) throw Error('Bitmap disposal disturbed DOM cache');
      const missing = '/game-assets/__offscreen-test/missing.png';
      cache.onImageReady(missing, () => loaded++, () => failed++);
      await cache.waitForTextureImage(missing).then(() => { throw Error('Missing DOM texture resolved'); }, () => {});
      await Promise.resolve();
      if (failed !== 1 || cache.getImageState(missing) !== 'failed') throw Error('DOM failure not observable');
      const manager = new WebGLTextureManager(gl), late = '/game-assets/__offscreen-test/dom-late.png';
      manager.getTexture(late); manager.dispose(); await textureCache.waitForTextureImage(late);
      if (manager.getStats().pendingUploads || manager.getStats().uploads || manager.getStats().residentTextures) throw Error('DOM late upload after disposal');
      return { nativeImage: true, singleCallback: true, queuedUnsubscribe: true, failure: true, persistentDomCache: true, noLateUpload: true };
    },
    dispose() { if (owner) owner.dispose(); else renderer.dispose(); }
  };
}
