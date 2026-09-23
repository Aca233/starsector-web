/** Run: node scripts/benchmark-ship-display-lane.mjs
 * In-memory, test-only build. Writes no bundle, cache, results or production file.
 * JSON results go to stdout; diagnostics/progress go to stderr.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const presentationPath = path.join(root, 'src/engine/runtime/local/CombatPresentation.ts');
// Keep EVERY empty collection property. PackedVisualDecoder and the graph
// decoder must validate the unmodified real packet; neither is patched here.
const emptyCollections = [
  'playerWings', 'enemyWings', 'nebulae', 'asteroids', 'projectiles', 'beams',
  'particles', 'contrails', 'debris', 'explosions', 'hitGlows', 'empArcs', 'mines',
  'muzzleFlashes', 'muzzleParticles', 'shieldRipples', 'hulkFragments',
  'movingRayFades', 'trailStrips', 'projectileVisuals', 'projectileFlight',
  'projectilePrediction', 'localMuzzles', 'localParticles',
];
const hash = data => createHash('sha256').update(data).digest('hex');
const isolation = { available: false, reason: 'Presentation module was not visited', emptyCollections };
const isolateRendererShips = {
  name: 'benchmark-only-ship-renderer-roots',
  setup(builder) {
    builder.onLoad({ filter: /[\\/]CombatPresentation\.ts$/ }, args => {
      if (path.resolve(args.path) !== presentationPath) return;
      const source = fs.readFileSync(args.path, 'utf8');
      const hud = /hud:\s*\{\s*read:\s*this\.hud\.capture\(engine\),[\s\S]*?notificationTime:\s*engine\.notificationTime\s*\}/g;
      const borrowed = 'const borrowed = combatRenderView(engine);';
      const hudMatches = [...source.matchAll(hud)].length;
      const borrowedMatches = source.split(borrowed).length - 1;
      if (hudMatches !== 1 || borrowedMatches !== 1) {
        isolation.reason = `Refused source drift: HUD roots=${hudMatches}, borrowed roots=${borrowedMatches}`;
        return { contents: source, loader: 'ts', resolveDir: path.dirname(args.path) };
      }
      const replacement = `const borrowed = { ...combatRenderView(engine),\n${emptyCollections.map(key => `      ${key}: [],`).join('\n')}\n    };`;
      const contents = source.replace(hud, 'hud: {}').replace(borrowed, replacement);
      Object.assign(isolation, {
        available: true, reason: null, hudMatches, borrowedMatches,
        originalSha256: hash(source), transformedSha256: hash(contents),
      });
      return { contents, loader: 'ts', resolveDir: path.dirname(args.path) };
    });
  },
};
const rawText = {
  name: 'benchmark-raw-assets',
  setup(builder) {
    builder.onResolve({ filter: /\?raw$/ }, args => ({
      path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'benchmark-raw',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'benchmark-raw' }, args => ({
      contents: fs.readFileSync(args.path, 'utf8'), loader: 'text',
    }));
  },
};

try {
  const result = await build({
    absWorkingDir: root, entryPoints: ['scripts/benchmark-ship-display-lane.mts'],
    outfile: 'scripts/ship-display-benchmark-memory.mjs', write: false, metafile: true,
    bundle: true, platform: 'node', format: 'esm', target: 'node20',
    plugins: [isolateRendererShips, rawText], logLevel: 'warning',
    banner: { js: `import { createRequire as benchmarkCreateRequire } from 'node:module'; const require = benchmarkCreateRequire(${JSON.stringify(import.meta.url)});` },
    define: {
      __LAN_BUILD_ID__: JSON.stringify('ship-display-benchmark-only'),
      'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, VITE_LAN_AI_WORKERS: 'false' }),
    },
  });
  const code = result.outputFiles[0].contents;
  const { runBenchmark } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  await runBenchmark({ root, isolation, build: { sha256: hash(code), inputCount: Object.keys(result.metafile.inputs).length } });
} catch (error) {
  console.log(JSON.stringify({
    status: 'UNDETERMINED', performanceGate: 'NOT_EVALUATED', defaultEnablement: false,
    stage: 'build-or-benchmark', reason: error instanceof Error ? error.message.slice(0, 3000) : String(error), isolation,
  }, null, 2));
  process.exitCode = 1;
}