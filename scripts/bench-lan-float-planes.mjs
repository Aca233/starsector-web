import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { deflateRawSync, inflateRawSync, constants } from 'node:zlib';
import { build } from 'esbuild';
import { encodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };
import { lanPerMessageDeflate } from '../server/lan-websocket.mjs';
import { plan, inputsFrom, runCodecBenchmark, stats, check, equalBytes } from './lib/lan-float-planes-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  browser: { type: 'boolean', default: false }, out: { type: 'string' },
  'playwright-module': { type: 'string' }, edge: { type: 'string' },
} });
const dir = path.resolve(values.out ?? path.join(root, 'artifacts', 'lan-float-planes-20260919', new Date().toISOString().replaceAll(':', '-')));
fs.mkdirSync(dir, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fixtures = positionals.length ? positionals : [0, 1, 2].map(i => path.join(root, 'artifacts', 'lan-worker-latency', `snapshot-32-${i}.bin`));
const buffers = fixtures.map(p => fs.readFileSync(path.resolve(p)));
const inputs = inputsFrom(buffers);
const sourceFiles = ['src/network/BinarySnapshot.mjs', 'src/network/KeyDictionary.mjs', 'src/network/protocol.json',
  'src/network/experimental/LanFloatPlanes.mjs', 'scripts/bench-lan-float-planes.mjs', 'scripts/lib/lan-float-planes-probe.mjs',
  'scripts/lib/lan-float-planes-worker.mjs', 'server/lan-websocket.mjs'];
const hashesBefore = Object.fromEntries(sourceFiles.map(p => [p, hash(fs.readFileSync(path.join(root, p)))]));
const provenance = { startedAt: new Date().toISOString(), node: process.version, v8: process.versions.v8,
  plan, sourceHashes: hashesBefore, fixtures: inputs.map((input, i) => ({ source: path.resolve(fixtures[i]), sha256: hash(buffers[i]),
    ships: input.state.frame.ships.length, tick: input.state.frame.tick, bytes: buffers[i].length,
    baselineBytes: input.baseline.length, candidateBytes: input.candidate.length, float64Count: new DataView(input.candidate.buffer).getUint32(8, true) })),
  limitations: ['Recorded frames only; no input, rendering, game simulation, transport queue, true WebSocket or physical two-machine LAN test.',
    'Node compression uses current server PMD settings and RFC7692 Z_SYNC_FLUSH, not a browser WebSocket compressor.',
    'Candidate is not negotiated and cannot be sent to old/default peers. No production imports or default change.'] };
write('plan-and-provenance.json', provenance);
console.log('Output:', dir);
const nodeResult = runCodecBenchmark(inputs);
write('node-codec.json', nodeResult);

// Match the current LAN server's no-context-takeover deflate settings. Each
// message is a fresh stream; strip/append the RFC7692 flush trailer, NOT a ZIP
// Z_FINISH comparison. No ports, ws listeners, Steam APIs, or user processes.
const options = lanPerMessageDeflate(), tail = Buffer.from([0, 0, 255, 255]);
const compress = bytes => {
  const z = deflateRawSync(bytes, { ...options.zlibDeflateOptions, finishFlush: constants.Z_SYNC_FLUSH });
  check(z.subarray(-4).equals(tail), 'RFC7692 trailer'); return z.subarray(0, -4);
};
const inflate = bytes => inflateRawSync(Buffer.concat([bytes, tail]), { ...options.zlibInflateOptions, finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: protocol.maxSnapshotBytes });
const compression = { options, scope: 'RFC7692 payload; includes SWB1 envelope, excludes TCP/TLS/WebSocket framing and async queue', byFrame: [] };
for (let index = 0; index < inputs.length; index++) {
  const input = inputs[index], wire = Object.fromEntries(['baseline', 'candidate'].map(key => [key, encodeBinaryState(input.state.matchId, input.state.seq, input[key])]));
  const packed = Object.fromEntries(Object.entries(wire).map(([key, bytes]) => [key, compress(bytes)]));
  for (const key of ['baseline', 'candidate']) check(equalBytes(inflate(packed[key]), wire[key]), 'deflate roundtrip');
  const samples = Object.fromEntries(['baseline', 'candidate'].map(key => [key, { deflate: [], inflate: [] }]));
  for (let i = 0; i < 20; i++) for (const key of ['baseline', 'candidate']) { compress(wire[key]); inflate(packed[key]); }
  for (let round = 0; round < 6; round++) for (const key of (round + index) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    for (let j = 0; j < 20; j++) {
      let at = performance.now(); const output = compress(wire[key]); samples[key].deflate.push(performance.now() - at);
      at = performance.now(); const restored = inflate(packed[key]); samples[key].inflate.push(performance.now() - at);
      check(equalBytes(output, packed[key]) && equalBytes(restored, wire[key]), 'compression changed');
    }
  }
  const entry = { index, keys: {}, saving: 1 - packed.candidate.length / packed.baseline.length };
  for (const key of ['baseline', 'candidate']) {
    entry.keys[key] = { uncompressedBytes: wire[key].length, compressedBytes: packed[key].length,
      deflateMs: stats(samples[key].deflate), inflateMs: stats(samples[key].inflate), samples: samples[key],
      // Sum of means, NOT observed end-to-end latency. One host encode, relay
      // validation decode, one guest decode, one deflate and one inflate.
      estimatedCpuMs: nodeResult.phases.host.byFrame[index][key].mean + 2 * nodeResult.phases.guest.byFrame[index][key].mean +
        stats(samples[key].deflate).mean + stats(samples[key].inflate).mean };
  }
  entry.estimatedCpuRatio = entry.keys.candidate.estimatedCpuMs / entry.keys.baseline.estimatedCpuMs;
  compression.byFrame.push(entry);
}
write('node-compression.json', compression);
console.log('Node:', JSON.stringify({ hostRatio: nodeResult.phases.host.meanRatio, guestRatio: nodeResult.phases.guest.meanRatio,
  compression: compression.byFrame.map(f => ({ index: f.index, saving: f.saving, cpuEstimateRatio: f.estimatedCpuRatio })) }));

let browserResult = null, context = null;
const cleanup = { browserRequested: values.browser, browserClosed: false, noServerStarted: true };
try {
  if (values.browser) {
    const require = createRequire(import.meta.url);
    const { chromium } = require(values['playwright-module'] ?? process.env.PLAYWRIGHT_MODULE ?? 'playwright');
    const bundled = await build({ entryPoints: [path.join(root, 'scripts/lib/lan-float-planes-worker.mjs')], bundle: true,
      format: 'esm', platform: 'browser', target: 'es2023', write: false, metafile: true });
    check(Object.keys(bundled.metafile.inputs).every(p => !p.includes('server/steam/')), 'Steam dependency in portable worker');
    write('worker-build-inputs.json', { inputs: Object.keys(bundled.metafile.inputs), sha256: hash(bundled.outputFiles[0].contents) });
    const profile = path.join(dir, 'owned-edge-profile');
    const executablePath = values.edge ?? path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe');
    const args = ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--enable-automation', '--no-first-run', '--no-default-browser-check'];
    context = await chromium.launchPersistentContext(profile, { executablePath, headless: true, ignoreDefaultArgs: true, chromiumSandbox: true,
      args, timeout: 30000, acceptDownloads: false, serviceWorkers: 'block' });
    const page = await context.newPage(), browserErrors = [];
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    page.on('pageerror', error => browserErrors.push(String(error)));
    // A module Worker needs a non-opaque origin in Edge. All requests are
    // fulfilled/aborted in-process: this .invalid hostname is never resolved.
    await page.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Offline LAN codec Worker benchmark</title><p>Recorded frames only. No game or network.</p>',
    }) : route.abort());
    await page.goto('https://lan-codec.invalid/');
    const cdp = await context.newCDPSession(page);
    const environment = { executablePath, args, version: await cdp.send('Browser.getVersion'), commandLine: await cdp.send('Browser.getBrowserCommandLine'),
      page: await page.evaluate(() => ({ visibilityState: document.visibilityState, hidden: document.hidden, crossOriginIsolated: window.crossOriginIsolated })) };
    browserResult = await page.evaluate(({ source, serialized }) => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const worker = new Worker(url, { type: 'module' });
      let transferred = null;
      const finish = () => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); };
      const timer = setTimeout(() => { finish(); reject(Error('180s bounded Worker benchmark timeout')); }, 180000);
      worker.onerror = error => { finish(); reject(Error(JSON.stringify({ message: error.message, filename: error.filename, lineno: error.lineno }))); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'transfer') { transferred = Array.from(data.bytes); return; }
        if (data.type === 'error') { finish(); reject(Error(data.error)); return; }
        if (data.type === 'result') { finish(); resolve({ ...data.result, parentReceivedTransfer: transferred }); }
      };
      const bytes = serialized.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
      worker.postMessage({ buffers: bytes }, bytes.map(b => b.buffer));
    }), { source: bundled.outputFiles[0].text, serialized: buffers.map(b => b.toString('base64')) });
    check(equalBytes(browserResult.parentReceivedTransfer, inputs[0].candidate), 'browser/Node candidate bytes differ');
    browserResult.parentReceivedSha256 = hash(new Uint8Array(browserResult.parentReceivedTransfer));
    delete browserResult.parentReceivedTransfer;
    browserResult.launch = environment; browserResult.browserErrors = browserErrors;
    write('edge-worker.json', browserResult);
    console.log('Edge:', JSON.stringify({ hostRatio: browserResult.phases.host.meanRatio, guestRatio: browserResult.phases.guest.meanRatio }));
  }
} catch (error) {
  write('browser-failure.json', { error: String(error.stack || error) }); throw error;
} finally {
  if (context) { await context.close(); cleanup.browserClosed = true; }
  write('cleanup.json', cleanup);
}
const reasons = [];
for (const frame of compression.byFrame) {
  if (frame.saving < plan.gates.minimumCompressionSaving) reasons.push(`frame ${frame.index}: compression saving below 10%`);
  if (frame.estimatedCpuRatio > plan.gates.maximumNodeCombinedRatio) reasons.push(`frame ${frame.index}: Node estimated CPU regression >10%`);
}
if (!browserResult) reasons.push('dedicated browser Worker measurement missing');
for (const [runtime, result] of [['Node', nodeResult], ['Edge Worker', browserResult]]) if (result) {
  for (const phase of ['host', 'guest']) for (const frame of result.phases[phase].byFrame) {
    const limit = phase === 'host' ? plan.gates.maximumHostWorkerRatio : plan.gates.maximumGuestWorkerRatio;
    if (frame.meanRatio > limit) reasons.push(`${runtime} ${phase} frame ${frame.index}: mean CPU regression >10%`);
    if (frame.p95ExtraMs > plan.gates.maximumWorkerP95ExtraMs) reasons.push(`${runtime} ${phase} frame ${frame.index}: p95 extra >1ms`);
  }
}
const hashesAfter = Object.fromEntries(sourceFiles.map(p => [p, hash(fs.readFileSync(path.join(root, p)))]));
check(JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter), 'benchmark source changed during run');
const decision = { at: new Date().toISOString(), defaultEnabled: false, preIntegrationGatesPassed: reasons.length === 0,
  decision: reasons.length ? 'HOLD: keep existing LAN encoding, no gameplay A/B or default integration' : 'Eligible for negotiated end-to-end gameplay A/B only; NOT approved for default',
  reasons, sourceHashesUnchanged: true, cleanup, limitations: provenance.limitations };
write('decision.json', decision);
console.log(JSON.stringify(decision, null, 2));
