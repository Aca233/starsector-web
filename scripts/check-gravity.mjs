import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const { chromium } = createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out = 'artifacts/gravity'; await fs.mkdir(out, { recursive: true });
const v8 = process.argv.includes('--v8');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, open: false }, logLevel: 'error' });
let browser;
try {
  await server.listen(); const port = server.httpServer.address().port;
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/__gravity_check.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Nonvisual gravity production probes</title>' }));
  await page.goto(`http://127.0.0.1:${port}/__gravity_check.html`);
  const main = await page.evaluate(async v8 => v8 ? (await import('/scripts/gravity-v8-scenarios.mjs')).runGravityV8Scenarios() : (await import('/scripts/gravity-scenarios.mjs')).runGravityScenarios(), v8);
  const worker = await page.evaluate(v8 => new Promise((resolve, reject) => {
    const w = new Worker('/scripts/gravity-check-worker.mjs', { type: 'module' });
    const timer = setTimeout(() => { w.terminate(); reject(Error('Gravity Worker timeout')); }, 120000);
    w.onmessage = ({ data }) => { clearTimeout(timer); w.terminate(); if (data.error) reject(Error(data.error)); else resolve(data.result); };
    w.onerror = event => { clearTimeout(timer); w.terminate(); reject(Error(event.message)); }; w.postMessage(v8 ? 'v8' : 'run');
  }), v8);
  assert.deepEqual(worker.checks, main.checks); assert.deepEqual(worker.measurements, main.measurements); assert.deepEqual(errors, []);
  await fs.writeFile(out + (v8 ? '/rules-check-v8.json' : '/rules-check.json'), JSON.stringify({ main, worker, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ mainChecks: main.checks.length, workerChecks: worker.checks.length, measurements: main.measurements }, null, 2));
} finally { await browser?.close(); await server.close(); }
