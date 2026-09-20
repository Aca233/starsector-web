/** Captain retention regression. Requires Vite and Playwright on NODE_PATH.
 * Runs in an isolated browser profile; never reads or writes the user's saves.
 * COMBAT_TEST_URL defaults to http://127.0.0.1:5173; BROWSER_PATH is optional. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(120000);
const origin = process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173';
const errors = [], passed = [];
page.on('pageerror', error => errors.push(String(error)));
const skills = { helmsmanship: 1, missile_specialization: 2 };
const profile = { name: '换船保留测试', portrait: 'portrait_luddic14' };
async function library() {
  return page.evaluate(async () => {
    const { storageKey } = await import('/src/studio/DesignModel.ts');
    return JSON.parse(localStorage.getItem(storageKey));
  });
}
async function cachedHull(hullId, expectedSkills = skills) {
  await page.waitForFunction(async id => {
    const { storageKey } = await import('/src/studio/DesignModel.ts');
    return JSON.parse(localStorage.getItem(storageKey) ?? 'null')?.draft.hullId === id;
  }, hullId);
  const saved = await library();
  assert.deepEqual(saved.draft.captainSkills, expectedSkills, hullId + ': cached skills');
  assert.deepEqual(saved.draft.captainProfile, profile, hullId + ': cached captain profile');
  return saved;
}
async function checkSkills() {
  await page.locator('[data-skill-id="helmsmanship"].is-configured').waitFor();
  assert.equal(await page.locator('[data-skill-id="missile_specialization"]').evaluate(el => el.classList.contains('is-elite')), true);
  assert.match(await page.locator('.captain-name-button').innerText(), /换船保留测试/);
}
try {
  await page.goto(origin + '/?view=skills', { waitUntil: 'commit' });
  await page.locator('[data-skill-id="helmsmanship"]').click();
  await page.locator('[data-skill-id="missile_specialization"]').click();
  await page.locator('[data-skill-id="missile_specialization"]').click();
  await page.locator('.captain-name-button').click();
  await page.getByRole('textbox', { name: '舰长姓名' }).fill(profile.name);
  await page.getByRole('button', { name: '应用档案', exact: true }).click();
  await checkSkills();
  // Reproduce the reported path: configure the character, then change hulls.
  await page.getByRole('button', { name: '舰船改装', exact: true }).click();
  await page.locator('[data-hull-id="onslaught"]').click();
  await page.getByRole('button', { name: '保存并继续', exact: true }).click();
  const saved = await cachedHull('onslaught');
  assert.equal(saved.designs.length, 1);
  assert.equal(saved.designs[0].hullId, 'paragon');
  assert.deepEqual(saved.designs[0].captainSkills, skills, 'original saved design remains intact');
  await page.getByRole('button', { name: /^角色技能/ }).click();
  await checkSkills();
  await page.reload({ waitUntil: 'commit' });
  await checkSkills();
  await page.getByRole('button', { name: '舰船改装', exact: true }).click();
  await page.locator('[data-hull-id="doom"]').click();
  await cachedHull('doom');
  await page.locator('[data-hull-id="paragon"]').click();
  await cachedHull('paragon');
  passed.push('single-player: normal/elite skills and profile survive hull changes, switching back, autosave and reload');
  await page.getByRole('button', { name: /^角色技能/ }).click();
  await page.locator('[data-skill-id="helmsmanship"]').click();
  await page.getByRole('button', { name: '舰船改装', exact: true }).click();
  await page.locator('[data-hull-id="onslaught"]').click();
  await page.getByRole('button', { name: '放弃修改并继续', exact: true }).click();
  await cachedHull('onslaught', { ...skills, helmsmanship: 2 });
  assert.deepEqual((await library()).designs[0].captainSkills, skills, 'discarded ship fit does not overwrite its saved snapshot');
  await page.getByRole('button', { name: /^角色技能/ }).click();
  for (const id of Object.keys(skills)) await page.locator('[data-skill-id="' + id + '"]').click({ button: 'right' });
  await page.getByRole('button', { name: '舰船改装', exact: true }).click();
  await page.locator('[data-hull-id="doom"]').click();
  await page.getByRole('button', { name: '放弃修改并继续', exact: true }).click();
  await cachedHull('doom', {});
  await page.getByRole('button', { name: /^角色技能/ }).click();
  await page.reload({ waitUntil: 'commit' });
  await page.locator('[data-skill-id="helmsmanship"]').waitFor();
  assert.equal(await page.locator('.captain-skill-icon.is-configured').count(), 0);
  passed.push('unsaved captain edits follow hull changes; explicitly cleared skills stay empty after switching and reloading');

  // Exercise the shared copy contract, legacy drafts, empty fits, validation and combat handoff.
  const model = await page.evaluate(async ({ skills, profile }) => {
    const { createDesign, withDesignCaptain, decodeDesign, evaluate } = await import('/src/studio/DesignModel.ts');
    const source = { ...createDesign('paragon'), captainSkills: skills, captainProfile: profile };
    const before = JSON.stringify(source), results = [];
    for (const hullId of ['paragon', 'onslaught', 'doom', 'wolf', 'lasher']) {
      for (const mode of ['standard', 'empty']) {
        const inherited = withDesignCaptain(createDesign(hullId, mode), source);
        const next = decodeDesign(inherited);
        const spec = evaluate(next).spec;
        results.push(structuredClone({ hullId, mode, skills: next.captainSkills, profile: next.captainProfile, combatSkills: spec.captainSkills, freshId: next.id !== source.id }));
        inherited.captainSkills.helmsmanship = 2; inherited.captainProfile.name = 'new captain';
      }
    }
    const cleared = withDesignCaptain(source, { captainSkills: {} });
    const legacy = withDesignCaptain(source, {});
    const imported = decodeDesign({ ...createDesign('wolf', 'empty'), captainSkills: { helmsmanship: 2 } });
    return { results, unchanged: before === JSON.stringify(source), cleared: cleared.captainSkills, clearedProfile: cleared.captainProfile ?? null,
      legacy: legacy.captainSkills, legacyProfile: legacy.captainProfile ?? null, imported: imported.captainSkills };
  }, { skills, profile });
  for (const result of model.results) {
    assert.deepEqual(result.skills, skills); assert.deepEqual(result.profile, profile);
    assert.deepEqual(result.combatSkills, skills); assert.equal(result.freshId, true);
  }
  assert.equal(model.unchanged, true);
  assert.deepEqual(model.cleared, {}); assert.equal(model.clearedProfile, null);
  assert.deepEqual(model.legacy, {}); assert.equal(model.legacyProfile, null);
  assert.deepEqual(model.imported, { helmsmanship: 2 }, 'explicit complete-design import still restores its own captain');
  passed.push('model: 5 hulls × standard/empty, independent copies, combat spec, explicit reset, legacy and import semantics');

  // Apply a ship-equipment preset containing a DIFFERENT captain through the real picker.
  await page.route('**/__captain-retention__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><div id="fixture"></div></body></html>' }));
  await page.goto(origin + '/__captain-retention__');
  await page.evaluate(async ({ skills, profile }) => {
    const RefreshRuntime = (await import('/@react-refresh')).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { i18n } = await import('/src/engine/i18n/LocalizationManager.ts');
    i18n.registerStrings('zh_CN', (await import('/src/engine/i18n/locales/zh_CN.ts')).zh_CN);
    const { createDesign } = await import('/src/studio/DesignModel.ts');
    const { SourceVariantPicker } = await import('/src/studio/SourceVariantPicker.tsx');
    const { LanRefit } = await import('/src/network/LanRefit.tsx');
    const initial = { ...createDesign('paragon', 'empty'), captainSkills: skills, captainProfile: profile };
    const preset = { ...createDesign('paragon', 'empty'), name: 'different-captain-fit', vents: 1, captainSkills: { helmsmanship: 2 }, captainProfile: { ...profile, name: 'preset captain' } };
    const root = createRoot(document.getElementById('fixture'));
    root.render(React.createElement(SourceVariantPicker, { draft: initial, designs: [preset], onApply: value => { window.__applied = value; }, onClose: () => {}, onSave: () => true, onDelete: () => {}, onRename: () => true }));
    window.__mountLan = () => root.render(React.createElement(LanRefit, { initial, disabledReason: '', onApply: async value => { window.__applied = value; return value; }, onCancel: () => {} }));
  }, { skills, profile });
  await page.getByRole('button', { name: '预览装配方案：different-captain-fit', exact: true }).click();
  await page.getByRole('button', { name: /^确认/ }).click();
  const preset = await page.evaluate(() => window.__applied);
  assert.equal(preset.vents, 1); assert.deepEqual(preset.captainSkills, skills); assert.deepEqual(preset.captainProfile, profile);
  passed.push('equipment preset: changes equipment without replacing or clearing the current captain');

  await page.evaluate(() => window.__mountLan());
  await page.locator('[data-hull-id="onslaught"]').click();
  await page.getByRole('button', { name: /^角色技能/ }).click();
  await checkSkills();
  await page.getByRole('button', { name: '舰船改装', exact: true }).click();
  await page.getByRole('button', { name: /^撤消/ }).click();
  assert.equal(await page.locator('[data-hull-id="paragon"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-hull-id="onslaught"]').click();
  await page.getByRole('button', { name: '应用并返回房间', exact: true }).first().click();
  const applied = await page.evaluate(() => window.__applied);
  assert.equal(applied.hullId, 'onslaught');
  assert.deepEqual(applied.captainSkills, skills); assert.deepEqual(applied.captainProfile, profile);
  assert.deepEqual((await library()).designs, saved.designs, 'LAN edits do not rewrite the standalone library');
  passed.push('LAN: hull change, skill screen, undo and applied room loadout preserve the captain without modifying saved designs');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed }, null, 2));
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Page:', await page.locator('body').innerText({timeout:5000}).catch(()=>'unavailable'));
  throw error;
} finally { await browser.close(); }
