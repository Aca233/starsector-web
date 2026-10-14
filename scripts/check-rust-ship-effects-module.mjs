import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const root = process.cwd(), out = path.resolve(root, 'artifacts/rust-combat-core-20261008/verification-ship-effects');
fs.mkdirSync(out, { recursive: true });
const compiler = 'C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe';
const sysroot = path.resolve(root, 'artifacts/rust-combat-core-20261008/toolchain/sysroot');
const hostSysroot = spawnSync(compiler, ['--print', 'sysroot'], { encoding: 'utf8' }).stdout.trim();
const wasmPath = path.join(out, 'ship-effects.wasm');
const compiled = spawnSync(compiler, ['--edition=2021', '--crate-type=cdylib', '--target=wasm32-unknown-unknown', '--sysroot', sysroot, '-C', 'opt-level=3',
  '-C', `linker=${hostSysroot.replaceAll('\\', '/')}/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe`, '-A', 'dead_code',
  path.resolve(root, 'scripts/lib/rust-core-ship-effects-harness.rs'), '-o', wasmPath], { encoding: 'utf8', windowsHide: true });
if (compiled.status) throw Error(compiled.stderr || compiled.stdout);
const wasm = fs.readFileSync(wasmPath), entry = path.resolve(root, 'scripts/lib/rust-core-ship-effects-check.ts');
const exposeState = { name: 'private-source-state-observer', setup(b) {
  b.onLoad({ filter: /(?:GlorianaBuiltins|HyperionHullMods|RocinanteHullMods)\.ts$/ }, args => {
    const name = path.basename(args.path), state = name === 'GlorianaBuiltins.ts' ? 'bulkheads' : name === 'HyperionHullMods.ts' ? 'repairs' : 'compensation';
    return { contents: fs.readFileSync(args.path, 'utf8') + `\nexport const rustEffectsVerifyState = ${state};\n`, loader: 'ts' };
  });
  b.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-source' }));
  b.onLoad({ filter: /.*/, namespace: 'raw-source' }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
} };
const define = { 'import.meta.env': JSON.stringify({ BASE_URL: './', DEV: false, PROD: true }) };
const nodeFile = path.join(out, 'node-check.mjs');
await build({ entryPoints: [entry], outfile: nodeFile, bundle: true, platform: 'neutral', format: 'esm', target: 'es2023', plugins: [exposeState], define });
const { checkRustShipEffects } = await import(pathToFileURL(nodeFile).href), node = await checkRustShipEffects(wasm);
const worker = await build({ stdin: { contents: `import {checkRustShipEffects} from ${JSON.stringify(entry.replaceAll('\\', '/'))};self.onmessage=async()=>{try{const wasm=await(await fetch('/core.wasm')).arrayBuffer();self.postMessage({result:await checkRustShipEffects(wasm),windowAbsent:typeof window==='undefined'});}catch(e){self.postMessage({error:String(e),stack:e?.stack});}};`, resolveDir: root, sourcefile: 'ship-effects-worker.ts', loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2023', write: false, plugins: [exposeState], define });
const server = http.createServer((req, res) => { if (req.url === '/core.wasm') { res.setHeader('Content-Type', 'application/wasm'); res.end(wasm); }
  else if (req.url === '/worker.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(worker.outputFiles[0].contents); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Rust ship effects validation</title>'); } });
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dedicated = await page.evaluate(() => new Promise((resolve, reject) => { const w = new Worker('/worker.mjs', { type: 'module' }), timer = setTimeout(() => { w.terminate(); reject(Error('Worker timeout')); }, 45000);
    w.onerror = e => { clearTimeout(timer); w.terminate(); reject(Error(e.message)); }; w.onmessage = e => { clearTimeout(timer); w.terminate(); resolve(e.data); }; w.postMessage({ run: true }); }));
  if (dedicated.error || !dedicated.result?.passed || !dedicated.windowAbsent) throw Error(JSON.stringify(dedicated));
  const result = { passed: true, node, dedicatedWorker: dedicated, visibleWindows: false, productionIntegrated: false, fullBattleReady: false };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, (k, v) => k === 'geometryLog' ? { recordedFields: v.length } : v, 2) + '\n');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
