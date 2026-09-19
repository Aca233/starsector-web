import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';

// Uses the paired fixtures emitted by bench-cosmetic-sync.mjs, not hand-built recipes.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) {
  if (process.env.PLAYWRIGHT_MODULE) throw error;
  playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const base = path.resolve('artifacts/cosmetic-sync-20260919'), cases = [];
function expand(value, layouts) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => expand(v, layouts));
  if (Object.hasOwn(value, '$record')) return Object.fromEntries(layouts[value.$record].map((k, i) => [k, expand(value.values[i], layouts)]));
  if (Object.hasOwn(value, '$records')) return value.values.map(row => Object.fromEntries(layouts[value.$records].map((k, i) => [k, expand(row[i], layouts)])));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, layouts)]));
}
for (const scenario of ['', 'burst/']) for (const tick of [600, 660, 720]) {
  const full = decodeBinaryState(fs.readFileSync(`${base}/${scenario}full-${tick}.bin`)).frame;
  const candidate = decodeBinaryState(fs.readFileSync(`${base}/${scenario}recipe-${tick}.bin`)).frame;
  const a = expand(full.world.fxSystem, full.layouts).explosions, b = expand(candidate.world.fxSystem, candidate.layouts).explosions;
  for (let i = 0; i < b.length; i++) if (b[i].puffs?.$explosionPuffs) cases.push({ recipe: b[i].puffs.$explosionPuffs, expected: a[i].puffs.map(p => [p.texture, p.startSize, p.endSize, p.rotation, p.offset, p.velocity]) });
}
if (!cases.length) throw Error('Missing production recipe fixtures');
const code = (await build({ stdin: { contents: 'export {ExplosionPuffDecoder,puffRecipeBudget} from "./src/network/ExplosionPuffCodec";', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'iife', globalName: 'codec', write: false })).outputFiles[0].text;
const executablePath = process.env.CHROMIUM_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
const browser = await playwright.chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage(); await page.addScriptTag({ content: code });
  const result = await page.evaluate(cases => {
    const times = [], first = [], decoder = new codec.ExplosionPuffDecoder();
    let particles = 0, vectorDifferences = 0, maxAbsoluteVectorDifference = 0;
    for (let pass = 0; pass < 4; pass++) for (const item of cases) {
      const at = performance.now(), wire = decoder.expand(item.recipe, codec.puffRecipeBudget()), ms = performance.now() - at;
      if (wire.length !== item.expected.length) throw Error('Puff count differs');
      for (let i = 0; i < wire.length; i++) for (let j = 0; j < 6; j++) {
        if (j < 4) { if (wire[i][j] !== item.expected[i][j]) throw Error('Non-vector scalar differs'); }
        else for (let axis = 0; axis < 2; axis++) {
          const delta = Math.abs(wire[i][j].$vector[axis] - item.expected[i][j].$vector[axis]);
          // ECMAScript sin/cos are implementation-approximated. Different V8
          // versions need not be bit-identical; allow only a tiny visual epsilon.
          if (!Number.isFinite(delta) || delta > 1e-10) throw Error('Visual reconstruction exceeds 1e-10 world units');
          if (delta) vectorDifferences++; maxAbsoluteVectorDifference = Math.max(maxAbsoluteVectorDifference, delta);
        }
      }
      if (pass === 0) first.push(ms); else times.push(ms); particles += wire.length;
    }
    const stat = a => { a.sort((a, b) => a - b); return { mean: a.reduce((s, v) => s + v, 0) / a.length, p95: a[Math.ceil(a.length * .95) - 1] }; };
    return { scope: 'Production decoder in headless Edge vs Node full SWF2 captures; natural plus synthetic burst. No rendering/network/FPS claim. Trig-derived vectors permit absolute error <= 1e-10 world units; all other fields exact.', cases: cases.length, passes: 4, particleComparisons: particles, bitIdentical: vectorDifferences === 0, vectorDifferences, maxAbsoluteVectorDifference, visualTolerancePassed: true, firstPassMs: stat(first), cachedMs: stat(times) };
  }, cases);
  result.browserVersion = browser.version(); result.nodeVersion = process.version;
  fs.writeFileSync(path.join(base, 'edge-recipe.json'), JSON.stringify(result, null, 2)); console.log(result);
} finally { await browser.close(); }
