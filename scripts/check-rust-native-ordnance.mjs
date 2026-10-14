import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root = process.cwd(), out = path.resolve('artifacts/rust-combat-core-20261008/verification-native-ordnance'); fs.mkdirSync(out, { recursive: true });
const compiler = 'C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe', sysroot = path.resolve('artifacts/rust-combat-core-20261008/toolchain/sysroot');
const host = spawnSync(compiler, ['--print', 'sysroot'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
const oracle = fs.readFileSync('scripts/lib/rust-native-ordnance-harness.rs', 'utf8'), split = oracle.indexOf('#[no_mangle]'), lib = fs.readFileSync('native/combat-core/src/lib.rs', 'utf8');
const files = ['native/combat-core/src/lib.rs', ...[...lib.matchAll(/^mod ([a-z_]+);/gm)].map(m => 'native/combat-core/src/' + m[1] + '.rs'), 'scripts/lib/rust-native-ordnance-harness.rs', 'scripts/lib/rust-native-ordnance-check.ts'];
const fingerprints = Object.fromEntries(files.map(f => [f, createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const source = lib.replace(/^mod ([a-z_]+);/gm, (_, m) => m === 'state' ? `mod state { include!(${JSON.stringify(path.resolve('native/combat-core/src/state.rs').replaceAll('\\', '/'))});\n${oracle.slice(0, split)}\n}` : `#[path=${JSON.stringify(path.resolve('native/combat-core/src/' + m + '.rs').replaceAll('\\', '/'))}]mod ${m};`) + '\n' + oracle.slice(split);
const harness = path.join(out, 'harness.rs'), wasmPath = path.join(out, 'native-ordnance.wasm'); fs.writeFileSync(harness, source);
const compiled = spawnSync(compiler, ['--edition=2021', '--crate-type=cdylib', '--target=wasm32-unknown-unknown', '--sysroot', sysroot, '-C', 'opt-level=3', '-C', `linker=${host.replaceAll('\\', '/')}/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe`, '-A', 'dead_code', harness, '-o', wasmPath], { encoding: 'utf8', windowsHide: true }); if (compiled.status) throw Error(compiled.stderr);
const wasm = fs.readFileSync(wasmPath), entry = path.resolve('scripts/lib/rust-native-ordnance-check.ts'), define = { 'import.meta.env': JSON.stringify({ BASE_URL: './', DEV: false, PROD: true }) };
const plugins = [{ name: 'raw', setup(b) { b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' })); b.onLoad({ filter: /.*/, namespace: 'raw' }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' })); } }];
const nodeFile = path.join(out, 'node-check.mjs'); await build({ entryPoints: [entry], outfile: nodeFile, bundle: true, platform: 'neutral', format: 'esm', target: 'es2023', plugins, define }); const node = await (await import(pathToFileURL(nodeFile).href)).checkRustNativeOrdnance(wasm);
const worker = await build({ stdin: { contents: `import {checkRustNativeOrdnance} from ${JSON.stringify(entry.replaceAll('\\', '/'))};self.onmessage=async()=>{try{self.postMessage({result:await checkRustNativeOrdnance(await(await fetch('/core.wasm')).arrayBuffer()),windowAbsent:typeof window==='undefined'});}catch(e){self.postMessage({error:String(e),stack:e?.stack});}}`, resolveDir: root, sourcefile: 'ordnance-worker.ts', loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2023', write: false, define, plugins });
const server = http.createServer((req, res) => { if (req.url === '/core.wasm') { res.setHeader('Content-Type', 'application/wasm'); res.end(wasm); } else if (req.url === '/worker.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(worker.outputFiles[0].contents); } else res.end('<!doctype html><title>Native ordnance acceptance</title>'); }); let browser;
try { await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); }); const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] })); browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dedicated = await page.evaluate(() => new Promise((ok, no) => { const w = new Worker('/worker.mjs', { type: 'module' }), timer = setTimeout(() => { w.terminate(); no(Error('ordnance Worker timeout')); }, 45000); w.onerror = e => { clearTimeout(timer); w.terminate(); no(Error(e.message)); }; w.onmessage = e => { clearTimeout(timer); w.terminate(); ok(e.data); }; w.postMessage({ run: true }); })); if (dedicated.error || !dedicated.result?.passed || !dedicated.windowAbsent) throw Error(JSON.stringify(dedicated));
  const result = { passed: true, node, dedicatedWorker: dedicated, sourceFingerprints: fingerprints, wasmSHA256: createHash('sha256').update(wasm).digest('hex'), visibleWindows: false, fullBattleReady: false }; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { if (browser) await browser.close(); await new Promise(ok => server.close(ok)); }

