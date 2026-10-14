import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root = process.cwd(), out = path.resolve(root, 'artifacts/rust-combat-core-20261008/verification-content-compiler');
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'compiler-check.mjs');
const entry = path.resolve(root, 'scripts/lib/rust-content-compiler-check.ts');
const define = { 'import.meta.env': JSON.stringify({ BASE_URL: './', DEV: false, PROD: true }) };
const plugins = [{ name: 'source-raw', setup(build) {
  build.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-source' }));
  build.onLoad({ filter: /.*/, namespace: 'raw-source' }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
} }];
await build({ entryPoints: [entry], outfile: file,
  bundle: true, platform: 'neutral', format: 'esm', target: 'es2023',
  define, plugins });
const check = (await import(pathToFileURL(file).href)).checkRustContentCompiler;
const wasm = process.argv[2] ? fs.readFileSync(path.resolve(process.argv[2])) : undefined;
const node = await check(wasm);
const worker = await build({ stdin: { contents: `import {checkRustContentCompiler} from ${JSON.stringify(entry.replaceAll('\\', '/'))};self.onmessage=async()=>{try{const source=${wasm ? "await(await fetch('/core.wasm')).arrayBuffer()" : 'undefined'};self.postMessage({result:await checkRustContentCompiler(source),windowAbsent:typeof window==='undefined'});}catch(e){self.postMessage({error:String(e),stack:e?.stack});}};`,
  resolveDir: root, sourcefile: 'content-compiler-worker.ts', loader: 'ts' }, bundle: true,
  platform: 'browser', format: 'esm', target: 'es2023', write: false, define, plugins });
const server = http.createServer((req, res) => {
  if (req.url === '/core.wasm') { res.setHeader('Content-Type', 'application/wasm'); res.end(wasm); }
  else if (req.url === '/worker.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(worker.outputFiles[0].contents); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Rust content compiler verification</title>'); }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dedicatedWorker = await page.evaluate(() => new Promise((resolve, reject) => {
    const w = new Worker('/worker.mjs', { type: 'module' }), timer = setTimeout(() => { w.terminate(); reject(Error('Compiler Worker timeout')); }, 45000);
    w.onerror = e => { clearTimeout(timer); w.terminate(); reject(Error(e.message)); };
    w.onmessage = e => { clearTimeout(timer); w.terminate(); resolve(e.data); }; w.postMessage({ run: true });
  }));
  if (dedicatedWorker.error || !dedicatedWorker.result?.passed || !dedicatedWorker.windowAbsent) throw Error(JSON.stringify(dedicatedWorker));
  const result = { passed: true, node, dedicatedWorker, visibleWindows: false, productionIntegrated: false, fullBattleReady: false };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
