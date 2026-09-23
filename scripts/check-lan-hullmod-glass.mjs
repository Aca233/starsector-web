/** Multiplayer hullmod backdrop regression. Isolated NativeRefit fixture and headless browser;
 * no saved profiles, desktop input, server traffic or release output.
 * Set PLAYWRIGHT_PACKAGE (or NODE_PATH) and optionally BROWSER_PATH. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { catalogDataPlugin } from './catalog-data-plugin.ts';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const root = resolve('.'), work = resolve('artifacts/lan-hullmod-glass-tests');
await mkdir(work, { recursive: true });
const fixture = resolve(work, 'fixture.html');
await writeFile(fixture, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {NativeRefit,NativeButton} from '/src/studio/NativeRefit.tsx';
import {createDesign,budget} from '/src/studio/DesignModel.ts';
import '/src/index.css';import '/src/studio/studio.css';import '/src/network/lan.css';
const h=React.createElement,noop=()=>{};
window.fixtureState={footerClicks:0};
function Fixture({mode}) {
  const [draft,setDraft]=React.useState(()=>createDesign('paragon','empty'));
  React.useLayoutEffect(()=>{window.fixtureState.draft=draft;window.fixtureState.op=budget(draft);},[draft]);
  const sidebar=h('aside',{className:'lan-room-sidebar '+(mode==='ai'?'lan-ai-editor-sidebar':'lan-room-fleet-sidebar')},
    h('header',null,h('strong',null,'房间 TEST01'),h('span',null,'真人 4/8')),
    h('div',{className:'lan-teams'},['A 队 · 舰长甲 · 已准备','B 队 · 舰长乙 · 正在改装','A 队 · 玩家丙 · 典范级战列舰','B 队 · 玩家丁 · 军团级航母'].map(text=>h('section',{className:'lan-team',key:text},h('h3',null,text),h('p',null,'等待其他玩家应用配置并准备')))),
    mode==='ai'?h('p',null,'这里只编辑 AI，不会覆盖你自己的舰船或本机已存方案。'):h('p',{className:'lan-room-guidance'},'选择舰船、改装并应用；服务器确认后准备。'));
  return h(NativeRefit,{draft,designs:[],dirty:false,canUndo:true,status:'',warning:null,onChange:setDraft,onHull:noop,onOpen:noop,onSave:()=>true,onRename:()=>true,onCopy:noop,onNew:noop,onDelete:noop,onExport:noop,onImport:noop,onUndo:noop,onClear:noop,onLaunch:noop,onHome:noop,onSkills:noop,hullFilter:{query:'',hullClass:'',faction:''},onHullFilter:noop,readHullScroll:()=>0,writeHullScroll:noop,
    roomLayout:mode==='solo'?undefined:{sidebar,onPickHull:noop,locked:false,footer:h('footer',{className:'lan-editor-footer'},h('div',{className:'lan-editor-sync'},h('strong',null,'配装已同步'),h('span',null,'等待其他玩家准备')),h('div',{className:'lan-editor-primary'},h(NativeButton,{onClick:()=>window.fixtureState.footerClicks++},'测试房间操作')))}});
}
const mount=createRoot(document.getElementById('root'));let revision=0;
window.mountFixture=mode=>mount.render(h(Fixture,{mode,key:++revision}));window.mountFixture('room');
</script></html>`);
const outDir = resolve(work, 'build');
const result = await build({ configFile: false, root, base: './', plugins: [react(), catalogDataPlugin()], build: { outDir, emptyOutDir: false, copyPublicDir: false, rollupOptions: { input: fixture } }, logLevel: 'warn' });
const bundle = Array.isArray(result) ? result[0] : result;
const entry = bundle.output.find(item => item.fileName.endsWith('.html')).fileName;
const server = await preview({ configFile: false, root, base: './', build: { outDir }, preview: { host: '127.0.0.1', port: 0, open: false } });
let browser, page;
const errors = [], passed = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/game-assets/**', async route => {
    const suffix = decodeURIComponent(new URL(route.request().url()).pathname.split('/game-assets/')[1]);
    const assets = resolve(root, 'public/game-assets'), path = resolve(assets, suffix);
    if (!path.startsWith(assets + sep)) return route.abort();
    await route.fulfill({ path });
  });
  await page.goto(server.resolvedUrls.local[0] + entry);
  const install = page.locator('.refit-hullmods > .native-button'), picker = page.locator('#refit-mod-picker');
  await install.waitFor();
  const saved = await page.evaluate(() => JSON.stringify(localStorage));
  const surface = () => picker.evaluate(el => {
    const s = getComputedStyle(el, "::before"), rect = el.getBoundingClientRect();
    const stats = document.querySelector('.refit-stats').getBoundingClientRect();
    const footer = document.querySelector('.lan-editor-footer').getBoundingClientRect();
    const heading = document.querySelector('.lan-room-sidebar header').getBoundingClientRect();
    const hit = document.elementFromPoint(heading.x + heading.width / 2, heading.y + heading.height / 2);
    return { background: s.backgroundColor, backdrop: s.backdropFilter, filter: getComputedStyle(el).filter, statsLeft: stats.left, right: rect.right, bottom: rect.bottom, footerTop: footer.top, coversSidebar: el.contains(hit) };
  });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await install.click();
    await picker.waitFor();
    await page.mouse.move(1, 1);
    const style = await surface();
    assert.match(style.backdrop, /blur\(12px\)/, 'room picker needs its own frosted backdrop: ' + JSON.stringify(style));
    assert.match(style.background, /0\.8[0-9]*\)/, 'tinted background prevents legible text bleed-through');
    assert.equal(style.filter, 'none', 'only the background is blurred, never the plugin text');
    assert.ok(style.right <= style.statsLeft + 1 && style.bottom <= style.footerTop, 'glass excludes live stats and room footer');
    assert.ok(style.coversSidebar, 'plugin panel intercepts clicks over the background room text');
    await page.screenshot({ path: resolve(work, 'room-' + viewport.width + '.png') });
    await page.getByRole('button', { name: '测试房间操作', exact: true }).click();
    const plus = page.getByRole('button', { name: '增加幅能容存器', exact: true });
    const before = await page.evaluate(() => fixtureState.draft.capacitors);
    await plus.click();
    assert.equal(await page.evaluate(() => fixtureState.draft.capacitors), before + 1);
    await install.click();
    await picker.waitFor({ state: 'hidden' });
    passed.push(viewport.width + 'x' + viewport.height + ': glass bounds, sidebar hit-test, stats, footer, back');
  }
  assert.equal(await page.evaluate(() => fixtureState.footerClicks), 4);
  await page.setViewportSize({ width: 1440, height: 900 });
  await install.click();
  await page.getByRole('searchbox', { name: '搜索舰船插件', exact: true }).fill('fluxdistributor');
  const mod = page.locator('.source-mod-select[data-inspect-mod="fluxdistributor"]');
  await mod.click();
  assert.ok(await page.evaluate(() => fixtureState.draft.hullMods.includes('fluxdistributor')));
  await mod.click();
  assert.equal(await page.evaluate(() => fixtureState.draft.hullMods.includes('fluxdistributor')), false);
  await mod.hover();
  const tooltip = page.getByRole('region', { name: '装备详情', exact: true });
  await tooltip.waitFor();
  assert.equal(await tooltip.evaluate(el => getComputedStyle(el).filter), 'none');
  const tip = await tooltip.boundingBox();
  assert.ok(tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= 1440 && tip.y + tip.height <= 900, 'tooltip remains viewport-positioned');
  await mod.focus();
  await page.keyboard.press('F2');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await picker.focus();
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'hidden' });
  await install.focus();
  await page.keyboard.press('a');
  await picker.waitFor();
  await page.keyboard.press('a');
  await picker.waitFor({ state: 'hidden' });
  passed.push('search, install/remove, sharp tooltip, F2, Escape and A toggle');
  await page.evaluate(() => mountFixture('ai'));
  await page.locator('.lan-ai-editor-sidebar').waitFor();
  await install.click();
  assert.match((await surface()).backdrop, /blur\(12px\)/);
  await page.mouse.move(1, 1);
  await page.screenshot({ path: resolve(work, 'ai.png') });
  // Remove only the progressive-enhancement CSS rule to exercise the no-blur fallback.
  const removed = await page.evaluate(() => {
    let count = 0;
    for (const sheet of document.styleSheets) for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const rule = sheet.cssRules[i];
      if (rule instanceof CSSSupportsRule && rule.cssText.includes('.lan-room-workbench .source-mod-picker') && rule.conditionText.includes('backdrop-filter')) { sheet.deleteRule(i); count++; }
    }
    return count;
  });
  assert.equal(removed, 1);
  assert.equal((await surface()).background, 'rgb(6, 18, 24)', 'no-blur fallback is opaque');
  assert.equal((await surface()).backdrop, 'none');
  passed.push('AI editor shares glass; unsupported backdrop-filter keeps an opaque readable fallback');
  await page.evaluate(() => mountFixture('solo'));
  await page.locator('.refit-roster').waitFor();
  await install.click();
  assert.equal(await picker.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await picker.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), saved);
  assert.deepEqual(errors, []);
  passed.push('solo appearance and localStorage unchanged; no page errors');
  console.log(JSON.stringify({ passed }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: resolve(work, 'failure.png') });
  throw error;
} finally {
  await browser?.close();
  await server.httpServer.close();
}

