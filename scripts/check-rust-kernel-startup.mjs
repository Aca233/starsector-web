import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const argv=process.argv.slice(2),options={},positionals=[];
for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--wasm'||arg==='--out'){const value=argv[++i];if(!value||value.startsWith('--'))throw Error(`${arg} requires a path`);if(options[arg])throw Error(`Duplicate ${arg}`);options[arg]=value;}else if(arg.startsWith('--'))throw Error(`Unknown startup checker option ${arg}`);else positionals.push(arg);}
if(positionals.length>2)throw Error('Expected pack selection and tick limit');
const root = process.cwd(), out = path.resolve(options['--out']??'artifacts/rust-combat-core-20261008/verification-kernel-startup'); fs.mkdirSync(out, { recursive: true });
const compiler = 'C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe', sysroot = path.resolve('artifacts/rust-combat-core-20261008/toolchain/sysroot');
const wasmPath = options['--wasm']?path.resolve(options['--wasm']):path.join(out, 'production.wasm');
if(!options['--wasm']){
  const host = spawnSync(compiler, ['--print', 'sysroot'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
  const compiled = spawnSync(compiler, ['--edition=2021', '--crate-type=cdylib', '--target=wasm32-unknown-unknown', '--sysroot', sysroot, '-C', 'opt-level=3', '-C', `linker=${host.replaceAll('\\', '/')}/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe`, '-A', 'dead_code', path.resolve('native/combat-core/src/lib.rs'), '-o', wasmPath], { encoding: 'utf8', windowsHide: true }); if (compiled.status) throw Error(compiled.stderr);
}
const wasm = fs.readFileSync(wasmPath), sha256 = createHash('sha256').update(wasm).digest('hex'), entry = path.resolve('scripts/lib/rust-kernel-startup-check.ts'), define = { 'import.meta.env': JSON.stringify({ BASE_URL: './', DEV: false, PROD: true }) };
const plugins = [{ name: 'raw', setup(b) { b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' })); b.onLoad({ filter: /.*/, namespace: 'raw' }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' })); } }];
const onlyPack = positionals[0] === 'all' ? undefined : positionals[0], ticks = Number(positionals[1] ?? 12), nodeFile = path.join(out, 'node-check.mjs');
if(!Number.isSafeInteger(ticks)||ticks<0)throw Error('Tick limit must be a non-negative safe integer');
await build({ entryPoints: [entry], outfile: nodeFile, bundle: true, platform: 'neutral', format: 'esm', target: 'es2023', plugins, define });
const worker = await build({ stdin: { contents: `import {checkRustKernelStartup} from ${JSON.stringify(entry.replaceAll('\\', '/'))};self.onmessage=async()=>{try{self.postMessage({result:await checkRustKernelStartup(await(await fetch('/core.wasm')).arrayBuffer(),${JSON.stringify(sha256)},${JSON.stringify(onlyPack)},${ticks}),windowAbsent:typeof window==='undefined'});}catch(e){self.postMessage({error:String(e),stack:e?.stack});}}`, resolveDir: root, sourcefile: 'kernel-startup-worker.ts', loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2023', write: false, define, plugins });
const server = http.createServer((req, res) => { if (req.url === '/core.wasm') { res.setHeader('Content-Type', 'application/wasm'); res.end(wasm); } else if (req.url === '/worker.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(worker.outputFiles[0].contents); } else res.end('<!doctype html><title>Native production kernel acceptance</title>'); }); let browser;
try { await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); }); const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] })); browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dedicatedWorker = await page.evaluate(timeoutMs => new Promise((ok, no) => { const w = new Worker('/worker.mjs', { type: 'module' }), timer = setTimeout(() => { w.terminate(); no(Error('production kernel Worker timeout')); }, timeoutMs); w.onerror = e => { clearTimeout(timer); w.terminate(); no(Error(e.message)); }; w.onmessage = e => { clearTimeout(timer); w.terminate(); ok(e.data); }; w.postMessage({ run: true }); }), Math.max(45000, ticks * 25));
  fs.writeFileSync(path.join(out,'worker-result.json'),JSON.stringify({dedicatedWorker,wasmSHA256:sha256},null,2));
  console.log(JSON.stringify({stage:'browser-source-complete',passed:dedicatedWorker.result?.passed,failures:dedicatedWorker.result?.failures.map(({nativeOrdnance,sourceOrdnance,nativeMounts,sourceMounts,trace,...failure})=>failure),wasmSHA256:sha256},null,2));
  const node=await(await import(pathToFileURL(nodeFile).href)).replayBrowserKernelCanonical(wasm,sha256,dedicatedWorker.result?.canonicalJournals??[]);
  fs.writeFileSync(path.join(out,'node-result.json'),JSON.stringify({node,wasmSHA256:sha256},null,2));
  const result = { passed: node.passed && dedicatedWorker.result?.passed === true && dedicatedWorker.windowAbsent === true, node, dedicatedWorker, wasmSHA256: sha256, wasmPath,compiledByChecker:!options['--wasm'], visibleWindows: false, fullBattleReady: false,referenceRuntime:'Chromium actual unmodified LocalCombatKernel' }; fs.writeFileSync(path.join(out, onlyPack ? onlyPack + '.json' : 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ passed: result.passed, node, workerPassed: dedicatedWorker.result?.passed, wasmSHA256: sha256 }, null, 2)); if (!result.passed) process.exitCode = 1;
} finally { if (browser) await browser.close(); await new Promise(ok => server.close(ok)); }
