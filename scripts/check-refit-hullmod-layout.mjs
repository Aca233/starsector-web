/** Hullmod rail overflow regression; isolated browser, no user save/profile.
 * Requires Vite (COMBAT_TEST_URL) and Playwright on NODE_PATH; optional BROWSER_PATH. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const passed = [];
try {
  await mkdir('artifacts', { recursive: true });
  await page.route('**/__refit-hullmod-regression__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="fixture"></div></body></html>' }));
  await page.goto((process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173') + '/__refit-hullmod-regression__');
  await page.evaluate(async () => {
    const RefreshRuntime = (await import('/@react-refresh')).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    await import('/src/studio/studio.css');
    await import('/src/studio/source-weapon-picker.css');
    const { NativeRefit } = await import('/src/studio/NativeRefit.tsx');
    const { createDesign, editableMods, modReason, evaluate } = await import('/src/studio/DesignModel.ts');
    const { i18n } = await import('/src/engine/i18n/LocalizationManager.ts');
    i18n.registerStrings('zh_CN', (await import('/src/engine/i18n/locales/zh_CN.ts')).zh_CN);
    const noop = () => {};
    const recordLaunch = () => { window.__launches = (window.__launches ?? 0) + 1; };
    function Fixture({ count }) {
      const [draft, setDraft] = React.useState(() => {
        let draft = createDesign('paragon', 'empty');
        for (const id of editableMods) {
          if (draft.hullMods.length >= count || modReason(draft, id)) continue;
          const next = { ...draft, hullMods: [...draft.hullMods, id] };
          if (!evaluate(next).errors.length) draft = next;
        }
        return draft;
      });
      React.useLayoutEffect(() => { window.__testDraft = draft; window.__setDraft = setDraft; }, [draft]);
      return React.createElement(NativeRefit, {
        draft, designs: [], dirty: false, canUndo: true, status: '', warning: null,
        onChange: setDraft, onHull: noop, onOpen: noop, onSave: () => true, onRename: () => true,
        onCopy: noop, onNew: noop, onDelete: noop, onExport: noop, onImport: noop, onUndo: noop,
        onClear: noop, onLaunch: recordLaunch, onHome: noop, onSkills: noop,
        hullFilter: { query: '', hullClass: '', faction: '' }, onHullFilter: noop,
        readHullScroll: () => 0, writeHullScroll: noop,
      });
    }
    const root = createRoot(document.getElementById('fixture'));
    let revision = 0;
    window.__mountRefit = count => root.render(React.createElement(Fixture, { key: ++revision, count }));
    window.__mountRefit(24);
  });
  await page.locator('.refit-hullmods').waitFor();
  const count = await page.locator('.refit-mod-row').count();
  assert.ok(count >= 16, `fixture needs a long, valid hullmod list (got ${count})`);
  const list = page.getByRole('region', { name: '已安装舰体插件' });
  const install = page.locator('.refit-hullmods > .native-button');
  const assertControls = async () => {
    const geometry = await install.evaluate(el => {
      const r = el.getBoundingClientRect(), bottom = document.querySelector('.refit-bottom').getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { top: r.top, bottom: r.bottom, footerTop: bottom.top, viewport: innerHeight, hit: el.contains(hit) };
    });
    assert.ok(geometry.bottom <= geometry.footerTop, 'install/back button stays above footer: ' + JSON.stringify(geometry));
    assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.viewport && geometry.hit, 'install/back button is in bounds and hit-testable');
    const rail = await list.evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight }));
    assert.ok(rail.height >= 32 && rail.content > rail.height, 'long list scrolls without collapsing rows');
    return geometry;
  };
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 800, height: 640 }]) {
    await page.setViewportSize(viewport);
    const before = await assertControls();
    await install.click();
    await page.locator('#refit-mod-picker').waitFor();
    assert.equal(await install.getAttribute('aria-expanded'), 'true');
    const expanded = await assertControls();
    assert.equal(expanded.bottom, before.bottom, 'return action does not move on expansion');
    await install.click();
    await page.locator('#refit-mod-picker').waitFor({ state: 'hidden' });
    await list.focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('.refit-hullmod-list').scrollTop > 0);
    const lastRemove = list.getByRole('button', { name: /^卸下/ }).last();
    const removedId = await lastRemove.evaluate(el => el.closest('.refit-mod-row').dataset.inspectMod);
    const previous = await page.evaluate(() => window.__testDraft.hullMods.length);
    await lastRemove.click();
    await page.waitForFunction(previous => window.__testDraft.hullMods.length === previous - 1, previous);
    await assertControls();
    await install.click();
    await page.getByRole('searchbox', { name: '搜索舰船插件' }).fill(removedId);
    await page.locator('.source-mod-select[data-inspect-mod="' + removedId + '"]').click();
    await page.waitForFunction(previous => window.__testDraft.hullMods.length === previous, previous);
    await assertControls();
    await install.click();
    await page.getByRole('button', { name: '模拟战斗' }).click();
    await page.mouse.move(1, 1);
    passed.push(viewport.width + 'x' + viewport.height + ': scroll, remove/reinstall, install/back and footer clicks');
  }
  assert.equal(await page.evaluate(() => window.__launches), 6);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.__mountRefit(24));
  await page.waitForFunction(() => window.__testDraft.hullMods.length >= 19);
  const smod = list.getByRole('button', { name: /^固化/ }).first();
  await smod.click();
  await page.waitForFunction(() => window.__testDraft.sMods.length === 1);
  await list.getByRole('button', { name: /^撤销固化/ }).click();
  await page.waitForFunction(() => window.__testDraft.sMods.length === 0);
  const row = list.locator('.refit-mod-row').first();
  await row.hover();
  await page.getByRole('region', { name: '装备详情', exact: true }).waitFor();
  const bounds = await list.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => document.querySelector('.refit-hullmod-list').scrollTop > 0);
  await page.getByRole('region', { name: '装备详情', exact: true }).waitFor({ state: 'hidden' });
  passed.push('S-mod/revert clicks work; wheel scrolling dismisses the old tooltip');
  await page.evaluate(() => { window.__setDraft(draft => ({ ...draft, vents: 1000, capacitors: 1000, name: '' })); });
  await page.locator('.refit-stats > .native-errors').waitFor();
  await page.setViewportSize({ width: 1280, height: 720 });
  await assertControls();
  await install.click();
  await page.locator('#refit-mod-picker').waitFor();
  await install.click();
  passed.push('multiple validation errors stay bounded and do not hide install/back');
  await page.evaluate(() => window.__mountRefit(0));
  await page.waitForFunction(() => window.__testDraft.hullMods.length === 0);
  const short = await list.evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight }));
  assert.equal(short.height, short.content, 'short lists keep their natural height without unnecessary scrolling');
  await install.click();
  await page.locator('#refit-mod-picker').waitFor();
  await install.click();
  passed.push('short/empty loadouts retain a compact usable layout');
  await page.evaluate(() => window.__mountRefit(24));
  await page.waitForFunction(() => window.__testDraft.hullMods.length >= 19);
  await page.mouse.move(1, 1);
  await page.screenshot({ path: 'artifacts/refit-hullmod-layout.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ count, passed }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'artifacts/refit-hullmod-layout-failure.png' });
  throw error;
} finally { await browser.close(); }
