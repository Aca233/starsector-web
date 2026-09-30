import './offscreen-test-build-id.mts';
import { openWorkerFrameLoop } from './lan-presentation-loop-check.mts';
import { componentProbe } from './lan-presentation-components-check.mts';
import { uiGraph } from './lan-presentation-ui-check.mts';
// Test-only transport/driver: the actual receive+render owner is production code.
// Never send a restored world across this boundary. Pixels are a separate untimed test command.
import { assetManager } from '../../src/engine/assets/AssetResolver';
import { contentManifestManager } from '../../src/engine/content/ContentManifest';
import { decodeBinaryFrame, encodeProjectedBinaryFrame as encodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { lanCrc32 } from '../../src/network/LanBinaryDelta.mjs';
import { LanPresentationRuntime } from '../../src/network/LanPresentationRuntime';
import { Vector2 } from '../../src/engine/math/Vector2';
import { TextureCache, textureCache } from '../../src/engine/render/TextureCache';
import { WebGLTextureManager } from '../../src/engine/render/webgl/WebGLTextureManager';
let loopOwner;
let runtime, gl, progress, lastView, usePipeline, runtimeMatch; const canvases = new Map(); let lostResolve, restoredResolve, restoreReject;
const layers = new Set(['background', 'nebula', 'asteroid', 'trail', 'hull', 'weapon', 'beam', 'shield', 'explosion', 'markers']);
async function lifecycle() {
  const cache = new TextureCache(), url = '/game-assets/graphics/fx/glow64.png';
  const image = await cache.waitForTextureImage(url);
  if (!(image instanceof ImageBitmap) || !image.width) throw Error('Not a real decoded bitmap');
  const canvasImage = cache.getCanvasImage(url);
  if (!(canvasImage instanceof ImageBitmap) || !canvasImage.width) throw Error('No premultiplied canvas source');
  let callbacks = 0;
  cache.onImageReady(url, () => callbacks++, () => callbacks++)();
  await Promise.resolve();
  if (callbacks) throw Error('Unsubscribe did not suppress queued callback');
  const missing = '/game-assets/__offscreen-test/missing.png';
  const rejected = await cache.waitForTextureImage(missing).then(() => false, () => true);
  if (!rejected || cache.getImageState(missing) !== 'failed') throw Error('Failed texture was not rejected');
  const slow = '/game-assets/__offscreen-test/slow.png';
  const pending = cache.waitForTextureImage(slow).then(() => false, () => true);
  cache.disposeBitmapImages();
  if (!await pending || image.width !== 0 || canvasImage.width !== 0 || cache.getImageState(url) !== 'unrequested') throw Error('Bitmap disposal failed');
  // Dispose and invalidate the real GPU manager before a delayed image completes.
  const manager = new WebGLTextureManager(gl);
  const late = '/game-assets/__offscreen-test/late.png';
  manager.getTexture(late);
  if (manager.getStats().pendingUploads !== 1) throw Error('No pending upload to test');
  manager.dispose();
  await textureCache.waitForTextureImage(late);
  const stats = manager.getStats();
  if (stats.uploads || stats.residentTextures || stats.pendingUploads) throw Error('Late upload after manager disposal');
  const invalidated = new WebGLTextureManager(gl), late2 = '/game-assets/__offscreen-test/late2.png';
  invalidated.getTexture(late2); invalidated.invalidateGPU();
  await textureCache.waitForTextureImage(late2);
  if (invalidated.getStats().uploads || invalidated.getStats().pendingUploads) throw Error('Late upload after invalidation');
  invalidated.dispose();
  // Real decoded native bitmaps held past disposal: the old generation must
  // close both images, without deleting a replacement load for the same URL.
  const nativeDecode = self.createImageBitmap.bind(self), decoded = [];
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; });
  const atGate = new Promise(resolve => { reached = resolve; });
  self.createImageBitmap = async (...args) => {
    const bitmap = await nativeDecode(...args); decoded.push(bitmap);
    if (decoded.length === 2) { reached(); await gate; }
    return bitmap;
  };
  let replacement;
  try {
    const obsolete = cache.waitForTextureImage(url).then(() => false, () => true);
    await atGate; cache.disposeBitmapImages(); self.createImageBitmap = nativeDecode;
    replacement = await cache.waitForTextureImage(url);
    release();
    if (!await obsolete || decoded.some(image => image.width !== 0) || !replacement.width || cache.getTextureImage(url) !== replacement) throw Error('Generation disposal race');
  } finally { release(); self.createImageBitmap = nativeDecode; cache.disposeBitmapImages(); }
  const retained = [...textureCache.bitmapImages.values(), ...textureCache.canvasBitmapImages.values()];
  const decodedRGBABytes = retained.reduce((sum, image) => sum + image.width * image.height * 4, 0);
  return { generationRace: true, bitmapCount: retained.length, decodedRGBABytes, queuedUnsubscribe: true, failedLoad: true, abortPending: true, closedBitmap: true, noLateUpload: true };
}
let uiPublisher, uiPacket, uiOriginal;
let commandOwner, commandPacket, commandReplies = [];
const drainCommands = extra => {
  const packet = commandPacket, replies = commandReplies; commandPacket = undefined; commandReplies = [];
  return { ...extra, packet, replies, session:commandOwner.session,
    state:{ map:runtime.world.isTacticalMap, selected:runtime.world.selectedUnitId, floating:runtime.world.floatingTexts.length } };
};
async function command(message) {
  if (message.type === 'frame-loop-open') {
    if(loopOwner)throw Error('Frame loop already exists');
    runtime.resetPlayback();runtime.receive(decodeBinaryFrame(message.wire));
    loopOwner=openWorkerFrameLoop(runtime,gl.canvas,progress);
    await loopOwner.loop.start();return {stats:loopOwner.loop.stats,failures:loopOwner.failures};
  }
  if (message.type === 'frame-loop-state') return {stats:loopOwner.loop.stats,failures:loopOwner.failures,completions:loopOwner.completions,tick:runtime.appliedTick};
  if (message.type === 'frame-loop-visible') {loopOwner.loop.setVisible(message.visible);if(message.visible)await loopOwner.loop.start();return loopOwner.loop.stats;}
  if (message.type === 'frame-loop-reset') {loopOwner.loop.reset();return {stats:loopOwner.loop.stats,tick:runtime.appliedTick};}
  if (message.type === 'frame-loop-restart') {runtime.receive(decodeBinaryFrame(message.wire));await loopOwner.loop.start();return loopOwner.loop.stats;}

  if (message.type === 'component-retain') {
    const result = runtime.receiveComponent(message.packet, message.now ?? 1000, message.active ?? true, message.minTick ?? 0);
    return { result, probe: componentProbe(runtime, message.now ?? 1000) };
  }
  if (message.type === 'component-probe') return componentProbe(runtime, message.now ?? 1000);
  if (message.type === 'raw-recreate') {
    runtime.dispose(); runtime = new LanPresentationRuntime(runtimeMatch, 0, undefined, gl.canvas, gl);
    return { initialized: false };
  }
  if (message.type === 'raw-reset') {
    runtime.resetPlayback(); runtime.resetBinaryIngress(message.session); return { reset: true };
  }
  if (message.type === 'raw-cancel') { runtime.resetPlayback(); return { cancelled: true }; }
  if (message.type === 'raw-retain') {
    let probe;
    const result = runtime.receiveBinaryState(message.packet, message.minTick ?? 0, frame => {
      probe = { crc: lanCrc32(encodeBinaryFrame(frame)), tick: frame.tick, sounds: frame.sounds?.length ?? 0, muzzles: frame.muzzleEvents?.length ?? 0 };
    });
    if (message.applyOnly && result.retained) runtime.applyPlayback(1000, true);
    if (message.view && result.retained) {
      await runtime.prepareAssets();
      const now = result.tick * 1000 / 60, sample = runtime.applyPlayback(now, true);
      runtime.renderPose(now, () => ({seq:0,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]}), false);
      const view = { ...message.view, camera: new Vector2(...message.view.camera), layers, damageEnabled: true };
      if (!runtime.drawPlayback(sample, now, view, {running:true,projectilesActive:false,fireActive:false})) throw Error('Raw ingress render skipped');
      gl.finish(); if (gl.getError()) throw Error('Raw ingress GL error');
    }
    return { ...result, probe };
  }
  if (message.type === 'commands-open') {
    commandOwner = runtime.createUiCommandOwner(packet => { if(commandPacket)throw Error('Multiple queued command UI packets');commandPacket=packet; },reply=>commandReplies.push(reply),error=>{throw error;});
    commandOwner.publish();return drainCommands({});
  }
  if (message.type === 'commands-receive') return drainCommands({accepted:commandOwner.receive(message.request)});
  if (message.type === 'commands-ack') return drainCommands({accepted:commandOwner.completeUi(message.receipt)});
  if (message.type === 'commands-reset') { runtime.resetPlayback();return drainCommands({}); }
  if (message.type === 'commands-publish') { commandOwner.publish();return drainCommands({}); }
  if (message.type === 'commands-close') { commandOwner.close();commandPacket=undefined;commandReplies=[];return commandOwner.stats; }

  if (message.type === 'ui-open' || message.type === 'ui-publish') {
    if (message.type === 'ui-open') {
      uiOriginal = { spec:runtime.world.playerShip.spec, hp:runtime.world.playerShip.hullHp, map:runtime.world.isTacticalMap };
      uiPublisher = runtime.createUiPublisher(packet => { uiPacket = packet; }, error => { throw error; });
    }
    const ship = runtime.world.playerShip;
    runtime.world.isTacticalMap = message.mutation % 2 === 0;
    if (message.mutation === 1) ship.spec = {...ship.spec, spriteUrl:ship.spec.spriteUrl+'?worker-ui'};
    if (message.mutation === 2) { ship.spec.spriteUrl += '-changed'; ship.hullHp -= 1; }
    if (message.mutation === 3) ship.spec = uiOriginal.spec;
    if (!uiPublisher.publish(Math.max(0,runtime.appliedTick))) return { skipped:true, stats:uiPublisher.stats };
    const snapshot = runtime.views.captureForTransfer();
    return { packet:uiPacket, session:uiPublisher.session, player:uiGraph(snapshot.hud.playerShip),
      map:uiGraph(snapshot.map), deployment:uiGraph(snapshot.deployment), presence:uiGraph(snapshot.presence) };
  }
  if (message.type === 'ui-ack') {
    const detached = uiPacket.graph.buffer.byteLength === 0;
    return { accepted:uiPublisher.complete(message.receipt), detached, stats:uiPublisher.stats };
  }
  if (message.type === 'ui-reset') { runtime.resetPlayback(); return {session:uiPublisher.session}; }
  if (message.type === 'ui-close') {
    uiPublisher.close(); uiPacket = undefined;
    runtime.world.playerShip.spec = uiOriginal.spec; runtime.world.playerShip.hullHp = uiOriginal.hp; runtime.world.isTacticalMap = uiOriginal.map;
    return uiPublisher.stats;
  }

  if (message.type === 'init') {
    usePipeline = message.pipeline; runtimeMatch = message.match;
    if (typeof document !== 'undefined' || typeof Image !== 'undefined') throw Error('Not an actual worker realm');
    await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
    gl = message.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw Error('Worker WebGL2 required');
    runtime = new LanPresentationRuntime(message.match, 0, decodeBinaryFrame(message.wire), message.canvas, gl, {
      onContextLost: () => {loopOwner?.loop.setContextAvailable(false);lostResolve?.();},
      onContextRestored: () => {loopOwner?.loop.setContextAvailable(true);restoredResolve?.();},
      onContextRestoreFailed: error => {loopOwner?.loop.dispose();restoreReject?.(error);}
    });
    progress = new Int32Array(message.progress);
    await runtime.prepareAssets();
    const upload = runtime.renderer.textures.getCanvasTexture.bind(runtime.renderer.textures);
    if (message.trace) runtime.renderer.textures.getCanvasTexture = (id, canvas, revision) => { canvases.set(id, canvas); return upload(id, canvas, revision); };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), worker: true, isolated: self.crossOriginIsolated };
  }
  if (message.type === 'draw') {
    const start = performance.now(), frame = decodeBinaryFrame(message.wire), decoded = performance.now();
    let sample;
    if (usePipeline) {
      if (message.reset) runtime.resetPlayback();
      runtime.receive(frame); sample = runtime.applyPlayback(frame.tick * 1000 / 60, false);
    } else runtime.apply([frame], message.reset);
    const applied = performance.now();
    lastView = { ...message.view, alpha: 1, camera: new Vector2(...message.view.camera), layers, damageEnabled: true };
    let drawn;
    if (usePipeline) {
      const now = frame.tick * 1000 / 60;
      runtime.renderPose(now, () => ({ seq: 0, keys: 0, aim: [runtime.world.playerShip.aimTargetWorld.x, runtime.world.playerShip.aimTargetWorld.y], firing: false, pointerActive: false, actions: [] }), false);
      lastView = { ...lastView, alpha: sample.alpha, visualTime: sample.visualTime };
      drawn = runtime.drawPlayback(sample, now, lastView, { running: true, projectilesActive: false, fireActive: false });
    } else drawn = runtime.draw(lastView);
    if (!drawn) throw Error('Worker render skipped');
    gl.finish();
    const end = performance.now();
    if (gl.getError()) throw Error('Worker WebGL error');
    Atomics.add(progress, 0, 1);
    return { decodeMs: decoded - start, applyMs: applied - decoded, drawMs: end - applied, totalMs: end - start,
      combatTime: runtime.world.combatTime, resources: runtime.renderer.getResourceStats() };
  }
  if (message.type === 'redraw') { if (!runtime.draw({ ...lastView, dt: 0 })) throw Error('Redraw skipped'); gl.finish(); return { redrawn: true }; }
  if (message.type === 'canvases') return [...canvases].map(([id, c]) => ({ id, width: c.width, height: c.height, data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data }));
  if (message.type === 'pixels') {
    const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return bytes;
  }
  if (message.type === 'lifecycle') return lifecycle();
  if (message.type === 'context-cycle') {
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) throw Error('Context loss extension unavailable');
    const lost = new Promise(resolve => { lostResolve = resolve; });
    const restored = new Promise((resolve, reject) => { restoredResolve = resolve; restoreReject = reject; });
    const events = [];
    const record = event => events.push(event.type);
    for (const name of ['webglcontextlost','webglcontextrestored','contextlost','contextrestored']) gl.canvas.addEventListener(name, record);
    const bounded = async (promise, stage) => {
      let timer; try { await Promise.race([promise, new Promise((_,reject) => {timer = setTimeout(() => reject(Error(JSON.stringify({stage,events,lost:gl.isContextLost(),error:gl.getError(),stats:runtime.renderer.getResourceStats()}))),5000);})]); }
      finally { clearTimeout(timer); }
    };
    ext.loseContext(); await bounded(lost, 'lost');
    if (!gl.isContextLost()) throw Error('Not natively context-lost');
    if(loopOwner && (loopOwner.loop.stats.phase!=='suspended'||loopOwner.loop.stats.pendingFrames))throw Error('Context loss did not suspend RAF');
    await new Promise(resolve => setTimeout(resolve, 0));
    ext.restoreContext(); await bounded(restored, 'restored');
    for (const name of ['webglcontextlost','webglcontextrestored','contextlost','contextrestored']) gl.canvas.removeEventListener(name, record);
    if (gl.isContextLost() || runtime.renderer.getResourceStats().resourceRecreations !== 1) throw Error('Context not recreated');
    return { restored: true, resources: runtime.renderer.getResourceStats() };
  }
  if (message.type === 'control-trace') {
    const { controlTrace } = await import('./lan-presentation-controls-check.mts');
    return controlTrace(message.data, 'numeric', message.rows);
  }
  if (message.type === 'views') {
    const hud = runtime.views.hud, world = runtime.world;
    if (hud.playerShip.hullHp !== world.playerShip.hullHp || hud.ships.length !== world.ships.length
      || hud.playerShip.pos.x !== world.playerShip.pos.x || typeof hud.playerShip.interpolatedPos !== 'function'
      || !runtime.views.map.read().available || !runtime.views.deployment.read()) throw Error('Worker views lost live capabilities');
    if (runtime.views.tactical({action:'retreat',unitIds:[world.playerShip.id],full:true}).accepted) throw Error('Worker observer accepted authority command');
    return { sameRealm: true, hudShips: hud.ships.length, observerOnly: true, teams: runtime.views.presence().length };
  }
  if (message.type === 'invalid-frame') {
    const bad = decodeBinaryFrame(message.wire); bad.displayVersion = 999;
    let rejected = false, poisoned = false;
    try { runtime.apply([bad]); } catch { rejected = true; }
    try { runtime.draw({}); } catch (error) { poisoned = String(error).includes('not active'); }
    if (!rejected || !poisoned || runtime.views.tactical({action:'close'}).accepted) throw Error('Invalid frame did not fail closed');
    return { rejected, poisoned };
  }
  if (message.type === 'dispose') {
    const images = [...textureCache.bitmapImages.values(), ...textureCache.canvasBitmapImages.values()];
    loopOwner?.loop.dispose(); runtime.dispose(); runtime.dispose(); textureCache.disposeBitmapImages();
    if (images.some(image => image.width !== 0) || textureCache.bitmapImages.size || textureCache.canvasBitmapImages.size) throw Error('Bitmap resources not released');
    let drawRejected = false, applyRejected = false;
    try { runtime.draw({}); } catch { drawRejected = true; }
    try { runtime.apply([]); } catch { applyRejected = true; }
    let inputRejected = false;
    try { runtime.recordAcceptedInput({seq:1,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]}, 0, false); } catch { inputRejected = true; }
    if (!drawRejected || !applyRejected || !inputRejected || runtime.views.tactical({action:'close'}).accepted) throw Error('Disposed runtime remained active');
    return { drawRejected, applyRejected, inputRejected, closedBitmaps: images.length, resources: runtime.renderer.getResourceStats() };
  }
  throw Error('Unknown test command');
}
// Serialize async setup/lifecycle commands, not just synchronous receive operations.
let queue = Promise.resolve();
self.onmessage = event => {
  const message = event.data;
  queue = queue.then(async () => {
    try { const result = await command(message); self.postMessage({ id: message.id, result }, result instanceof Uint8Array ? [result.buffer] : result?.packet ? [result.packet.graph.buffer] : []); }
    catch (error) { self.postMessage({ id: message.id, error: String(error?.stack ?? error) }); }
  });
};

