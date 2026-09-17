/** Installed/empty mount inspection regression; isolated browser, no user save/profile.
 * Requires Vite (COMBAT_TEST_URL) and Playwright on NODE_PATH; optional BROWSER_PATH. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const passed = [];
try {
  await page.route('**/__refit-regression__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="fixture"></div></body></html>' }));
  await page.goto((process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173') + '/__refit-regression__');
  await page.evaluate(async () => {
    const RefreshRuntime = (await import('/@react-refresh')).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    await import('/src/studio/studio.css'); await import('/src/studio/source-weapon-picker.css');
    const { NativeRefit } = await import('/src/studio/NativeRefit.tsx');
    const { createDesign, withWeapon, evaluate } = await import('/src/studio/DesignModel.ts');
    const { i18n } = await import('/src/engine/i18n/LocalizationManager.ts');
    i18n.registerStrings('zh_CN', (await import('/src/engine/i18n/locales/zh_CN.ts')).zh_CN);
    const noop = () => {};
    const recordHome = () => { window.__homeRequests = (window.__homeRequests ?? 0) + 1; };
    function Fixture({ hullId, mode }) {
      const [draft, setDraft] = React.useState(() => {
        let draft = createDesign(hullId, mode);
        if (hullId === 'astral' && mode !== 'empty') {
          const slot = evaluate(draft).spec.weaponSlots.find(s => s.slotSize === 'SMALL' && s.weaponType === 'ENERGY');
          draft = withWeapon(draft, slot.slotId, 'pdlaser');
          window.__testSlotId = slot.slotId;
        }
        return draft;
      });
      React.useLayoutEffect(() => { window.__testDraft = draft; }, [draft]);
      return React.createElement(NativeRefit, {
        draft, designs: [], dirty: false, canUndo: false, status: '', warning: null,
        onChange: setDraft, onHull: noop, onOpen: noop, onSave: () => true, onRename: () => true,
        onCopy: noop, onNew: noop, onDelete: noop, onExport: noop, onImport: noop, onUndo: noop,
        onClear: noop, onLaunch: noop, onHome: recordHome, onSkills: noop,
        hullFilter: { query: '', hullClass: '', faction: '' }, onHullFilter: noop,
        readHullScroll: () => 0, writeHullScroll: noop,
      });
    }
    const root = createRoot(document.getElementById('fixture'));
    window.__mountRefit = (hullId, mode = 'standard') => root.render(React.createElement(Fixture, { key: hullId + mode, hullId, mode }));
    window.__mountRefit('astral');
  });
  await page.locator('.studio-mount').first().waitFor();
  const id = await page.evaluate(() => window.__testSlotId);
  const mount = page.locator(`.studio-mount[data-slot-id="${id}"]`);
  const card = page.getByRole('tooltip');
  await page.mouse.move(5, 5);
  assert.equal(await card.count(), 0);
  const inaccessible = await page.locator('.studio-mount').evaluateAll(elements => elements.filter(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.studio-mount') !== el;
  }).map(el => el.getAttribute('data-slot-id')));
  assert.deepEqual(inaccessible, [], 'larger rings must not block neighboring mount centers');
  const idle = await mount.evaluate(el => ({ opacity: +getComputedStyle(el).opacity, border: parseFloat(getComputedStyle(el).borderWidth), radius: getComputedStyle(el).borderRadius }));
  assert.ok(idle.opacity >= .8 && idle.border > 0, 'equipped rings are visible without hovering the ship');
  await mount.hover();
  await card.waitFor();
  const text = await card.innerText();
  for (const expected of ['PD 激光炮', '原始数据', '战术应用', '武器射程', '伤害 / 秒', '幅能 / 伤害', '精确度', '转向速度', '左键更换武器']) assert.ok(text.includes(expected), expected);
  assert.equal(await mount.getAttribute('aria-describedby'), await card.getAttribute('id'));
  assert.equal(await mount.getAttribute('title'), null, 'no duplicate browser title tooltip');
  assert.equal(await page.locator('.ship-arc path').count(), 1);
  const value = async label => card.locator('.source-weapon-detail-stat').filter({ has: page.locator('dt', { hasText: new RegExp('^' + label + '$') }) }).locator('dd').last().innerText();
  assert.equal(await value('武器射程'), '500');
  assert.equal(await value('装配点数'), '3');
  const highlight = await mount.evaluate(el => getComputedStyle(el).boxShadow);
  assert.notEqual(highlight, 'none');
  const box = await card.boundingBox(), anchor = await mount.boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 900, 'card stays in viewport');
  assert.ok(box.x + box.width < anchor.x || box.x > anchor.x + anchor.width || box.y + box.height < anchor.y || box.y > anchor.y + anchor.height, 'card does not cover hovered weapon');
  const hullBox = await page.locator('.refit-vessel .studio-ship').boundingBox();
  assert.ok(box.x + box.width < hullBox.x, 'desktop hover card sits beside the hull, not over its other mounts');
  assert.equal(await value('幅能 / 伤害'), '0.53');
  assert.equal(await card.locator('.source-weapon-attribution').isVisible(), false, 'hover shows short description; codex keeps full lore');
  await page.screenshot({ path: 'artifacts/refit-weapon-hover.png' });
  passed.push('PD laser hover shows original data, links the accessible card, highlights the slot and arc');
  await card.getByRole('button', { name: '原始数据', exact: true }).click();
  await card.getByRole('button', { name: '舰装后数据', exact: true }).waitFor();
  await card.getByRole('button', { name: '舰装后数据', exact: true }).click();
  await page.mouse.move(5, 5);
  await card.waitFor({ state: 'hidden' });
  await mount.focus();
  await card.waitFor();
  await page.keyboard.press('F2');
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /PD 激光炮/);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  passed.push('hover card is interactive; keyboard focus, F2 encyclopedia and Escape work');
  await mount.click();
  await page.locator('.source-weapon-picker').waitFor();
  assert.equal(await card.count(), 0, 'installed tooltip closes when opening the picker');
  await page.locator('.source-equipped-weapon').hover();
  await page.locator('.source-weapon-picker .source-weapon-details').waitFor();
  assert.match(await page.locator('.source-weapon-picker .source-weapon-details').innerText(), /武器射程[\s\S]*500/);
  const alternative = page.locator('[data-weapon-choice]').first();
  await alternative.hover();
  await page.keyboard.down('Control');
  await page.waitForFunction(() => document.querySelector('.source-weapon-detail-stat[data-compare="true"]'));
  await page.keyboard.up('Control');
  await page.keyboard.press('Escape');
  await page.locator('.source-weapon-picker').waitFor({ state: 'hidden' });
  await mount.click({ button: 'right' });
  await mount.hover();
  await card.waitFor();
  assert.match(await card.innerText(), /空武器槽位/);
  assert.match(await card.innerText(), /小型，能量/);
  assert.equal(await page.evaluate(id => window.__testDraft.weapons[id], id), null);
  passed.push('picker retains shared data and Ctrl comparison; right-click removal shows empty slot compatibility');
  await page.mouse.move(5, 5);
  await card.waitFor({ state: 'hidden' });
  assert.ok(await mount.evaluate(el => +getComputedStyle(el).opacity >= .8), 'empty rings remain visible');
  await mount.hover();
  await card.waitFor();
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'hidden' });
  await page.mouse.move(5, 5);
  await mount.hover();
  await card.waitFor();
  await page.setViewportSize({ width: 800, height: 640 });
  await card.waitFor({ state: 'hidden' });
  await page.mouse.move(5, 5);
  await mount.hover();
  await card.waitFor();
  const small = await card.boundingBox();
  assert.ok(small.x >= 0 && small.y >= 0 && small.x + small.width <= 800 && small.y + small.height <= 640);
  passed.push('empty mounts remain visible; Escape/resize dismiss stale cards and narrow layout stays in bounds');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.__mountRefit('onslaught'));
  const builtIn = page.locator('.studio-mount[data-built-in="true"]').first();
  await builtIn.hover();
  await card.waitFor();
  assert.match(await card.innerText(), /舰体内置，不能拆卸或替换/);
  const before = await builtIn.getAttribute('aria-label');
  await builtIn.click({ button: 'right' });
  assert.equal(await builtIn.getAttribute('aria-label'), before);
  passed.push('built-in weapon inspection does not allow removal');
  assert.equal(await page.evaluate(() => window.__homeRequests ?? 0), 0, 'Escape dismisses inspection without leaving refit');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed }, null, 2));
} finally { await browser.close(); }
