/** Menu navigation regression. Requires Vite and Playwright on NODE_PATH.
 * COMBAT_TEST_URL: normal Vite server; optional STATIC_TEST_URL: GitHub Pages mode.
 * BROWSER_PATH optionally selects a browser. Uses isolated profiles, no Steam connections. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const targets = [[process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173', false]];
if (process.env.STATIC_TEST_URL) targets.push([process.env.STATIC_TEST_URL, true]);
const passed = [], errors = [];
async function checkMenu(page, staticHosted, label) {
  await page.locator('.native-home').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Steam 联机', exact: true }).count(), staticHosted ? 0 : 1, label + ': Steam entry');
  assert.equal(await page.getByRole('button', { name: '局域网联机', exact: true }).count(), staticHosted ? 0 : 1, label + ': LAN entry');
  if (!staticHosted) await page.getByRole('button', { name: 'Steam 联机', exact: true }).click({ trial: true });
  assert.equal(await page.locator('.native-static-note').count(), staticHosted ? 1 : 0, label + ': static hosting notice');
  console.log((staticHosted ? 'static' : 'local') + ': ' + label);
}
async function returnFromEditor(page) {
  await page.getByRole('button', { name: '返回主页面', exact: true }).click();
  await page.locator('.native-home').waitFor();
}
try {
  for (const [url, staticHosted] of targets) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(120000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await checkMenu(page, staticHosted, 'first visit');
    await page.getByRole('button', { name: /^舰船设计/ }).click();
    await returnFromEditor(page);
    await checkMenu(page, staticHosted, 'return from editor');
    await page.getByRole('button', { name: /^角色技能/ }).click();
    await page.getByRole('button', { name: /^返回主菜单/ }).click();
    await checkMenu(page, staticHosted, 'return from skills');
    await page.getByRole('button', { name: /^舰船设计/ }).click();
    await page.locator('.refit-shell').waitFor();
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await checkMenu(page, staticHosted, 'browser back');
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await page.locator('.refit-shell').waitFor();
    await returnFromEditor(page);
    await checkMenu(page, staticHosted, 'browser forward then return');
    for (const view of ['design', 'skills']) {
      await page.goto(url + '/?view=' + view, { waitUntil: 'domcontentloaded' });
      if (view === 'design') await returnFromEditor(page);
      else await page.getByRole('button', { name: /^返回主菜单/ }).click();
      await checkMenu(page, staticHosted, 'direct ' + view + ' entry then return');
    }
    passed.push((staticHosted ? 'static' : 'local') + ': fresh menu, editor/skills return, browser back/forward, direct entries');
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed }, null, 2));
} finally { await browser.close(); }
