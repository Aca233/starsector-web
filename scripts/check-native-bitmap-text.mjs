/** Regression for bitmap labels retaining a disabled/selected state's old CSS color.
 * Requires a Vite dev server (COMBAT_TEST_URL) and Playwright on NODE_PATH.
 * Runs in an isolated browser without loading the app or touching user saves. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const passed = [];

async function checkInk(locator, label) {
  await locator.locator('canvas').waitFor();
  const ink = await locator.locator('canvas').evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let best = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > pixels[best + 3]) best = i;
    const expected = document.createElement('canvas').getContext('2d');
    expected.fillStyle = getComputedStyle(canvas).color;
    expected.fillRect(0, 0, 1, 1);
    return { actual: Array.from(pixels.slice(best, best + 4)), expected: Array.from(expected.getImageData(0, 0, 1, 1).data) };
  });
  assert.ok(ink.actual[3] > 200, label + ': visible glyph pixels');
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(ink.actual[c] - ink.expected[c]) <= 2,
    `${label}: bitmap ${ink.actual} must match CSS ${ink.expected}`);
}

try {
  await page.route('**/__bitmap-regression__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="fixture"></div></body></html>' }));
  await page.goto((process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173') + '/__bitmap-regression__');
  await page.evaluate(async () => {
    const RefreshRuntime = (await import('/@react-refresh')).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { SimulationDeployment } = await import('/src/ui/tactical/SimulationDeployment.tsx');
    const root = createRoot(document.getElementById('fixture'));
    const engine = {
      simulationPointLimit: 200,
      simulationDeployedPoints: () => 150,
      deploySimulationShips: (entries, ally) => { window.__deployment = { entries, ally }; },
    };
    window.__fixtureRoot = root;
    root.render(React.createElement(SimulationDeployment, { engine, onClose() {}, onDeployed() {} }));
  });
  const deploy = page.getByRole('button', { name: '部署', exact: true });
  const ships25 = page.locator('.sim-deployment-ship[aria-disabled="false"][aria-label$=" · 25 部署点"]');
  const ship50 = page.locator('.sim-deployment-ship[aria-disabled="false"][aria-label$=" · 50 部署点"]').first();
  await checkInk(deploy, 'initial disabled');
  assert.equal(await deploy.isDisabled(), true);
  await deploy.locator('canvas').evaluate(canvas => { window.__originalDeployCanvas = canvas; });
  await ships25.first().click();
  assert.equal(await deploy.isEnabled(), true);
  assert.match(await page.locator('.sim-deployment-meter').innerText(), /175 \/ 200/);
  await checkInk(deploy, 'selected ship enables deployment');
  passed.push('175/200 deployment turns bright after selecting a 25-point ship');
  await ships25.first().click();
  assert.equal(await deploy.isDisabled(), true);
  await checkInk(deploy, 'deselected');
  await ships25.first().click();
  await ship50.click();
  assert.equal(await deploy.isDisabled(), true);
  await checkInk(deploy, 'over budget');
  await ship50.click();
  assert.equal(await deploy.isEnabled(), true);
  await checkInk(deploy, 'back within budget');
  await ships25.nth(1).click();
  assert.match(await page.locator('.sim-deployment-meter').innerText(), /200 \/ 200/);
  assert.equal(await deploy.isEnabled(), true);
  await checkInk(deploy, 'exact budget');
  assert.equal(await deploy.locator('canvas').evaluate(canvas => canvas === window.__originalDeployCanvas), true);
  passed.push('deselection, over-budget, recovery, and exact-limit states keep their colors without remounting');
  await deploy.locator('canvas').evaluate(canvas => {
    const ctx = canvas.getContext('2d'), clear = ctx.clearRect.bind(ctx);
    window.__deployRepaints = 0;
    ctx.clearRect = (...args) => { window.__deployRepaints++; return clear(...args); };
  });
  await page.getByRole('button', { name: /显示高级选项/ }).click();
  assert.equal(await page.evaluate(() => window.__deployRepaints), 0);
  passed.push('unrelated rerenders do not repaint unchanged labels');
  await page.getByRole('tab', { name: /盟军/ }).click();
  for (const name of [/盟军/, /敌军/]) await checkInk(page.getByRole('tab', { name }), 'switched tab');
  await page.getByRole('tab', { name: /敌军/ }).click();
  await deploy.click();
  const deployment = await page.evaluate(() => window.__deployment);
  assert.equal(deployment.ally, false);
  assert.equal(deployment.entries.reduce((sum, entry) => sum + entry.cost, 0), 50);
  passed.push('selected tab colors and real deployment handler remain correct');

  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { Button } = await import('/src/ui/core/UI.tsx');
    const { flushSync } = (await import('/node_modules/.vite/deps/react-dom.js')).default;
    window.__renderButton = props => flushSync(() => window.__fixtureRoot.render(React.createElement(Button, props, '部署')));
    window.__renderButton({ disabled: true });
  });
  await checkInk(deploy, 'shared UI Button disabled');
  for (const props of [{ disabled: false }, { variant: 'danger' }, { variant: 'secondary' }, { disabled: true }, { disabled: false }]) {
    await page.evaluate(props => window.__renderButton(props), props);
    await checkInk(deploy, 'shared UI Button ' + JSON.stringify(props));
  }
  passed.push('shared UI buttons also update disabled and variant colors');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  await browser.close();
}
