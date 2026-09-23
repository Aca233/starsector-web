/** Compare clean production builds, never the user's browser/profile or saves.
 * node scripts/check-web-loading-browser.mjs --before path/to/build --after path/to/build
 * Optional PLAYWRIGHT_MODULE / BROWSER_PATH, matching existing browser checks. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const args = process.argv.slice(2);
const arg = name => args[args.indexOf(name) + 1];
assert.ok(args.includes('--before') && args.includes('--after'), 'Supply two production build directories');
const output = path.resolve(args.includes('--out') ? arg('--out') : 'artifacts/web-loading-20260922');
await fs.mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.fnt': 'text/plain', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
async function serve(directory) {
  const root = path.resolve(directory), cache = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/starsector-web/')) { res.writeHead(404).end(); return; }
      const file = path.resolve(root, pathname.slice('/starsector-web/'.length) || 'index.html');
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      let resource = cache.get(file);
      if (!resource) {
        let bytes = await fs.readFile(file);
        const ext = path.extname(file), gzip = /\.(?:html|js|css|json|svg|fnt|ttf)$/.test(file);
        if (gzip) bytes = gzipSync(bytes);
        resource = { bytes, gzip, type: mime[ext] || 'application/octet-stream' };
        cache.set(file, resource);
      }
      res.writeHead(200, { 'Content-Type': resource.type, 'Content-Length': resource.bytes.length,
        'Cache-Control': 'no-store', ...(resource.gzip ? { 'Content-Encoding': 'gzip' } : {}) });
      res.end(resource.bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/starsector-web/` };
}
const before = await serve(arg('--before')), after = await serve(arg('--after'));
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const runs = [], errors = [];
async function measure(kind, target, index) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(kind + ': ' + error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(kind + ': HTTP ' + response.status() + ' ' + response.url()); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1024 * 1024, uploadThroughput: 1024 * 1024 });
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.getByRole('button', { name: /^舰船设计/ }).waitFor();
    const interactiveMs = await page.evaluate(() => performance.now());
    await page.waitForFunction(() => document.querySelectorAll('.native-home [data-bitmap-ready="true"]').length === 4, null, { timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    const fontReadyMs = await page.evaluate(() => performance.now());
    await page.waitForLoadState('networkidle', { timeout: 90000 });
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => ({ name: r.name.split('/').pop(), bytes: r.transferSize, decodedBytes: r.decodedBodySize })));
    const row = { kind, interactiveMs, fontReadyMs, bytes: resources.reduce((n, r) => n + r.bytes, 0), resources };
    runs.push(row); console.log(JSON.stringify({ ...row, resources: undefined }));
    if (index === 0) await page.screenshot({ path: path.join(output, kind + '.png'), animations: 'disabled' });
    if (kind === 'after') {
      assert.ok(!resources.some(r => /orbitron12condensed|native-zh\.ttf|native-heading-zh\.ttf/.test(r.name)), 'Home must not fetch unused/full native fonts');
      assert.ok(resources.some(r => r.name === 'native-home-zh.woff2'));
      assert.ok(resources.some(r => r.name === 'native-home-heading-zh.woff2'));
    }
    if (kind === 'after' && index === 0) {
      // The unchanged settings modal is portaled: full fonts still work outside home.
      await page.getByRole('button', { name: '游戏设置', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('tab', { name: '画面', exact: true }).click();
      await page.getByLabel('渲染分辨率', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: /^舰船设计/ }).click();
      await page.locator('.native-refit-app').waitFor({ timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 90000 });
      // A glyph outside the subset must continue to use the complete original font.
      const fallback = await page.evaluate(async () => {
        const label = document.createElement('span'); label.textContent = '龘';
        label.style.fontFamily = 'StarsectorHomeCN, StarsectorCN'; document.body.append(label);
        await document.fonts.ready;
        const full = performance.getEntriesByType('resource').some(r => r.name.endsWith('/native-zh.ttf'));
        label.remove(); return full;
      });
      assert.ok(fallback, 'Unknown text must retain the full native fallback');
    }
  } finally { await context.close(); }
}
try {
  // Paired reversed order; fresh profiles/cache every run.
  await measure('before', before, 0); await measure('after', after, 0);
  await measure('after', after, 1); await measure('before', before, 1);
  assert.deepEqual(errors, []);
  const samePixels = (await fs.readFile(path.join(output, 'before.png'))).equals(await fs.readFile(path.join(output, 'after.png')));
  assert.ok(samePixels, 'Fully loaded home screenshots must remain byte-identical');
  await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ throttle: { bytesPerSecond: 1048576, latencyMs: 40 }, samePixels, errors, runs }, null, 2));
  console.log('PASS: exact home appearance, reduced requests, settings/refit navigation, full-font fallback');
} finally {
  await browser.close();
  await Promise.all([before, after].map(({ server }) => new Promise(resolve => server.close(resolve))));
}
