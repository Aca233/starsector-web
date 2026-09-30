// Headless paired Canvas probe. Optional frozen-old/current source comparison;
// no production debug exports, desktop interaction, or gameplay input injection.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const {chromium} = createRequire(import.meta.url)('playwright');
const out = path.resolve(process.env.DAMAGE_CANVAS_OUT ?? 'artifacts/network-stream-20260921/phase21/canvas-probe');
const baseline = process.env.DAMAGE_CANVAS_BASELINE;
const angle = process.env.DAMAGE_CANVAS_ANGLE ?? 'd3d11';
const warmFrames = Number(process.env.DAMAGE_CANVAS_WARM_FRAMES ?? 40);
const measureFrames = Number(process.env.DAMAGE_CANVAS_MEASURE_FRAMES ?? 80);
assert.ok(Number.isInteger(warmFrames) && warmFrames >= 0 && warmFrames <= 1000);
assert.ok(Number.isInteger(measureFrames) && measureFrames > 0 && measureFrames <= 2000);
const sourceFile = path.resolve('src/engine/render/ShipDamageVisuals.ts');
const candidateFile = process.env.DAMAGE_CANVAS_CANDIDATE ? path.resolve(process.env.DAMAGE_CANVAS_CANDIDATE) : sourceFile;
const modules = new Map();
const sources = [];
if (baseline) {
  for (const [name, file] of [['old', path.resolve(baseline)], ['new', candidateFile]]) {
    const code = await fs.readFile(file, 'utf8');
    sources.push({name, file, sha256: createHash('sha256').update(code).digest('hex')});
    // Resolve beside the real source so both copies share the resource/class graph,
    // but keep independent module-private pixel/tile caches, including overlay lanes.
    for (const suffix of ['', '-overlay']) {
      const id = path.join(path.dirname(sourceFile), `__damage_canvas_${name}${suffix}.ts`).replaceAll('\\', '/');
      modules.set(id, code + '\nexport {tintGlowTile as testTintGlowTile, tintedGlowTiles as testTintedGlowTiles};\n');
    }
  }
}
const probePlugin = {
  name: 'damage-canvas-source-comparison', enforce: 'pre',
  resolveId(id) {
    const absolute = id.startsWith('/src/') ? path.resolve('.' + id).replaceAll('\\', '/') : id;
    if (modules.has(absolute)) return absolute;
  },
  load(id) { return modules.get(id); },
};
await fs.mkdir(out, {recursive: true});
const server = await createServer({
  configFile: false, plugins: [probePlugin], optimizeDeps: {noDiscovery: true, entries: []},
  server: {host: '127.0.0.1', port: 0, open: false, watch: null},
  define: {__LAN_BUILD_ID__: '"canvas-probe"'}, logLevel: 'error',
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless: true, args: [`--use-angle=${angle}`]});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const report = await page.evaluate(async ({paired, warmFrames, measureFrames}) => {
    const {assetManager} = await import('/src/engine/assets/AssetResolver.ts');
    await assetManager.ensureManifestLoaded();
    const {createLanWorld} = await import('/src/network/LanWorld.ts');
    const {textureCache} = await import('/src/engine/render/TextureCache.ts');
    const {WebGLTextureManager} = await import('/src/engine/render/webgl/WebGLTextureManager.ts');
    const {Vector2} = await import('/src/engine/math/Vector2.ts');
    const variants = paired
      ? await Promise.all(['old', 'new'].map(n => import(`/src/engine/render/__damage_canvas_${n}.ts`)))
      : [await import('/src/engine/render/ShipDamageVisuals.ts')];
    const overlays = paired
      ? await Promise.all(['old', 'new'].map(n => import(`/src/engine/render/__damage_canvas_${n}-overlay.ts`)))
      : [variants[0], variants[0]];
    const engine = createLanWorld({
      id: 'probe', seed: 917, hostId: 'a',
      players: [{id: 'a', seat: 0, team: 0, hull: 'onslaught'}, {id: 'b', seat: 1, team: 1, hull: 'onslaught'}],
      options: {assignment: 'teams', battleSize: 3200, aiHulls: [[], []]},
    }).engine;
    const ship = engine.playerShip;
    const glowUrls = ['cracks', 'burns', 'holes'].flatMap(kind => [0, 1].map(i => `/game-assets/graphics/damage/damage_${kind}48_${i}_glow.png`));
    await Promise.all([ship.spec.spriteUrl, ...glowUrls].map(u => textureCache.waitForImage(u)));
    const images = glowUrls.map(u => textureCache.getImage(u));
    for (let i = 0; i < 100; i++) ship.damageDecals.marks.push({
      cellIndex: i, localPos: new Vector2((i % 10 - 5) * 22, (Math.floor(i / 10) - 5) * 22),
      opacity: .8, intensity: .9, heat: 220, justHit: false, flash: 0, flashElapsed: 0,
      phase: 0, pulsePeriod: .5, size: 45, rotationRad: i * .27,
      kind: ['cracks', 'burns', 'holes'][i % 3], variant: i % 2,
    });
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) throw Error('WebGL2 unavailable');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const runtime = {
      userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
    const stats = values => {
      const sorted = [...values].sort((a, b) => a - b);
      return {n: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
        median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1)};
    };
    const diff = (a, b) => {
      if (a.length !== b.length) throw Error('Pixel lengths differ');
      let different = 0, max = 0, nonzeroAlpha = 0;
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d) different++;
        max = Math.max(max, d);
        if (i % 4 === 3 && a[i]) nonzeroAlpha++;
      }
      return {bytes: a.length, different, max, nonzeroAlpha};
    };
    const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const lanes = overlays.map((module, index) => {
      const canvas = document.createElement('canvas');
      if (!paired) canvas.getContext('2d', {willReadFrequently: index === 1});
      return {name: paired ? ['old', 'new'][index] : `overlay-software-${index === 1}`, canvas, module, samples: [], cold: null};
    });
    const manager = new WebGLTextureManager(gl);
    try {
      const tileCounts = () => paired ? overlays.map(v => images.map(image => v.testTintedGlowTiles.get(image)?.size ?? 0)) : null;
      let measuredStartTiles;
      // No readback/parity instrumentation in the timed draw + WebGL upload window.
      for (let tick = 0; tick < warmFrames + measureFrames; tick++) {
        if (tick === warmFrames) measuredStartTiles = tileCounts();
        for (const [i, m] of ship.scorchMarks.entries()) m.intensity = ((tick * 7 + i * 11) % 255) / 255;
        for (const index of tick % 2 ? [0, 1] : [1, 0]) {
          const lane = lanes[index], t = performance.now();
          if (!lane.module.renderShipDamageOverlayCanvas(lane.canvas, ship, 'glow')) throw Error('Missing overlay image');
          const draw = performance.now();
          manager.getCanvasTexture(String(index), lane.canvas, tick);
          gl.finish();
          const sample = {draw: draw - t, all: performance.now() - t};
          if (tick === 0) lane.cold = sample;
          if (tick >= warmFrames) lane.samples.push(sample);
        }
      }
      const finalPixels = diff(pixels(lanes[0].canvas), pixels(lanes[1].canvas));
      const result = {
        mode: paired ? 'frozen-old-vs-current' : 'legacy-overlay-backend', runtime, marks: 100,
        size: [lanes[0].canvas.width, lanes[0].canvas.height], finalPixels,
        warmFrames, measureFrames, measuredStartTiles, measuredEndTiles: tileCounts(),
        overlay: lanes.map(l => ({name: l.name, cold: l.cold, draw: stats(l.samples.map(s => s.draw)),
          all: stats(l.samples.map(s => s.all)), samples: l.samples})),
      };
      if (!paired) return result;
      result.rawSourceComparison = images.map((image, imageIndex) => {
        const canvases = [false, true].map(willReadFrequently => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          canvas.getContext('2d', {willReadFrequently}).drawImage(image, 0, 0);
          return canvas;
        });
        const comparison = diff(pixels(canvases[0]), pixels(canvases[1]));
        canvases.forEach(canvas => { canvas.width = canvas.height = 1; });
        return {imageIndex, ...comparison};
      });
      // Every cold call receives a new image identity, but decoded resources are
      // loaded beforehand. Time CPU transform + its one source readback, not I/O.
      const coldImages = [];
      for (let round = 0; round < 8; round++) coldImages.push(await Promise.all(glowUrls.map(async url => {
        const img = new Image(); img.src = url; await img.decode(); return img;
      })));
      const coldSamples = [[], []], warmSamples = [[], []], cacheErrors = [];
      for (const [round, set] of coldImages.entries()) for (const [imageIndex, image] of set.entries()) {
        for (const index of (round + imageIndex) % 2 ? [0, 1] : [1, 0]) {
          const start = performance.now();
          const tile = variants[index].testTintGlowTile(image, 143, 55);
          coldSamples[index].push(performance.now() - start);
          const cachedStart = performance.now();
          for (let repeat = 0; repeat < 1000; repeat++) {
            if (variants[index].testTintGlowTile(image, 143, 55) !== tile) cacheErrors.push({index, round, imageIndex, repeat});
          }
          warmSamples[index].push((performance.now() - cachedStart) / 1000);
        }
      }
      result.tintTiming = variants.map((_, i) => ({name: ['old', 'new'][i], cold: stats(coldSamples[i]),
        cachedPerCall: stats(warmSamples[i]), coldSamples: coldSamples[i]}));
      const tileComparison = {images: images.length, heats: 256, comparisons: 0, bytes: 0, different: 0, max: 0, cacheErrors: cacheErrors.length, failures: []};
      const seen = images.map(() => [new Map(), new Map()]);
      for (const [imageIndex, image] of images.entries()) for (let heat = 0; heat < 256; heat++) {
        const green = Math.floor(heat * .65), blue = Math.floor(heat * .25), key = green * 256 + blue;
        const tiles = variants.map((v, i) => {
          const tile = v.testTintGlowTile(image, green, blue), previous = seen[imageIndex][i].get(key);
          if ((previous && previous !== tile) || v.testTintGlowTile(image, green, blue) !== tile) tileComparison.cacheErrors++;
          seen[imageIndex][i].set(key, tile);
          return tile;
        });
        const comparison = diff(pixels(tiles[0]), pixels(tiles[1]));
        tileComparison.comparisons++; tileComparison.bytes += comparison.bytes;
        tileComparison.different += comparison.different; tileComparison.max = Math.max(tileComparison.max, comparison.max);
        if (comparison.different && tileComparison.failures.length < 12) tileComparison.failures.push({imageIndex, heat, ...comparison});
      }
      tileComparison.pairsPerImage = seen.map(m => m[0].size);
      result.tileComparison = tileComparison;
      // Complete hull-alpha overlays, including piece filtering/clip, all integer
      // heat levels. Compare after timing so GPU readback cannot bias that window.
      const before = JSON.stringify(ship.scorchMarks);
      const savedIntensities = ship.scorchMarks.map(m => m.intensity);
      const piece = [new Vector2(-160, -90), new Vector2(160, -90), new Vector2(160, 90), new Vector2(-160, 90)];
      const overlayComparison = {comparisons: 0, bytes: 0, different: 0, max: 0, visibleComparisons: 0, failures: []};
      for (const bounds of [undefined, piece]) {
        for (let heat = 0; heat < 256; heat++) {
          // One read per canvas: repeated readbacks can adaptively move only one
          // lane to a CPU backend and contaminate the renderer parity comparison.
          const canvases = [document.createElement('canvas'), document.createElement('canvas')];
          for (const mark of ship.scorchMarks) mark.intensity = heat / 255;
          for (let i = 0; i < 2; i++) if (!overlays[i].renderShipDamageOverlayCanvas(canvases[i], ship, 'glow', bounds)) throw Error('Unloaded overlay');
          const comparison = diff(pixels(canvases[0]), pixels(canvases[1]));
          canvases.forEach(canvas => { canvas.width = canvas.height = 1; });
          overlayComparison.comparisons++; overlayComparison.bytes += comparison.bytes;
          overlayComparison.different += comparison.different; overlayComparison.max = Math.max(overlayComparison.max, comparison.max);
          if (comparison.nonzeroAlpha) overlayComparison.visibleComparisons++;
          if (comparison.different && overlayComparison.failures.length < 12) overlayComparison.failures.push({heat, piece: Boolean(bounds), ...comparison});
        }
      }
      ship.scorchMarks.forEach((mark, i) => {mark.intensity = savedIntensities[i];});
      result.overlayComparison = overlayComparison;
      result.marksUnchanged = JSON.stringify(ship.scorchMarks) === before;
      result.glError = gl.getError();
      return result;
    } finally { manager.dispose(); }
  }, {paired: Boolean(baseline), warmFrames, measureFrames});
  Object.assign(report, {sources, angle, browserVersion: browser.version(), errors});
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  const {overlay, tintTiming, ...compact} = report;
  console.log(JSON.stringify({...compact,
    overlay: overlay.map(({samples: _samples, ...rest}) => rest),
    tintTiming: tintTiming?.map(({coldSamples: _samples, ...rest}) => rest),
  }, null, 2));
  assert.deepEqual(errors, [], 'Browser errors');
  assert.equal(report.finalPixels.different, 0, 'Final overlay pixels differ');
  if (baseline) {
    assert.equal(report.tileComparison.different, 0, 'Tint tile pixels differ');
    assert.equal(report.tileComparison.cacheErrors, 0, 'Tint cache identity changed');
    assert.equal(report.overlayComparison.different, 0, 'Hull/piece overlay pixels differ');
    assert.ok(report.overlayComparison.visibleComparisons > 100, 'Empty overlay fixture');
    assert.equal(report.marksUnchanged, true, 'Rendering mutated damage marks');
    assert.equal(report.glError, 0, 'WebGL error');
  }
} finally {
  await browser?.close();
  await server.close();
}
