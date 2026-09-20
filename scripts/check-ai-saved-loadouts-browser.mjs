/** Isolated production AI component + real relay. Never opens a window or reads the user's browser profile. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { catalogDataPlugin } from './catalog-data-plugin.ts';
import { createLanServer } from '../server/lan-server.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const root = resolve('.'), work = resolve('artifacts/ai-saved-loadout-tests'), buildId = 'ai-saved-loadouts-test';
await mkdir(work, { recursive: true });
const fixture = resolve(work, 'fixture.html');
await writeFile(fixture, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {LanAiFleet} from '/src/network/LanAiFleet.tsx';import {LanConnection} from '/src/network/protocol.ts';
import {createDesign,readLibrary,storageKey,designModules,designFromModule,hulls,fluxLimit,nativeHull,isBuiltIn,weapons,compatibility,weaponOPCost,autoGroups} from '/src/studio/DesignModel.ts';
import {nativeVariantsForHull} from '/src/studio/NativeVariantCatalog.ts';import {aiFitsForHull} from '/src/network/LanAiFits.ts';
import {validateLanDesign} from '/src/network/LanDesign.ts';import {shipSystemDefinitions} from '/src/engine/extensions/ship-systems/Registry.ts';
import '/src/index.css';import '/src/studio/studio.css';import '/src/network/lan.css';
const own=createDesign('wolf','empty');own.name='我的草稿勿改';
const saved=createDesign('onslaught');saved.id='onslaught-standard';saved.name='标准';saved.vents=12;saved.capacitors=13;
saved.captainSkills={helmsmanship:1,missile_specialization:2};saved.captainProfile={name:'已存舰长',portrait:'portrait_luddic14'};
saved.systemTypes=[shipSystemDefinitions.all().find(s=>s.sourceIds.includes('burndrive')).id];saved.rightClickSystemType='NONE';
if(saved.hullMods.length)saved.sMods=[saved.hullMods[0]];
const modules=designModules(saved);if(modules.length){const mount=modules[0];saved.modules={[mount.slotId]:designFromModule(mount.spec)};}
const other={...structuredClone(saved),id:'same-name',systemTypes:[]};
const xiv=createDesign('onslaught_xiv','empty');xiv.id='xiv-save';xiv.name='XIV 私人装配';
const invalid={...structuredClone(saved),id:'bad-op',name:'超出预算',capacitors:fluxLimit(saved.hullId),vents:fluxLimit(saved.hullId),sMods:[]};
for(const slot of nativeHull(invalid.hullId).weaponSlots)if(!isBuiltIn(invalid.hullId,slot.slotId))invalid.weapons[slot.slotId]=weapons.filter(w=>!compatibility(slot,w)).sort((a,b)=>weaponOPCost(invalid,b.id)-weaponOPCost(invalid,a.id))[0]?.id??null;
invalid.groups=autoGroups(invalid);
const carrier=createDesign('legion_xiv','empty');carrier.id='carrier-save';carrier.name='航母私人装配';carrier.wings=[null,'broadsword_wing'];
const designs=[saved,other,xiv,invalid,carrier];
for(const d of designs.filter(d=>d!==invalid))validateLanDesign(d);
const baseline=structuredClone(own);localStorage.setItem(storageKey,JSON.stringify({version:1,draft:own,baseline,designs}));
window.testApi={storageKey,designs,own,baseline,aiFitsForHull,readLibrary,hulls,nativeVariantsForHull,validateLanDesign};
window.testCommands=[];window.testMessages=[];window.editTarget=null;
const connection=new LanConnection();const send=connection.send.bind(connection);connection.send=m=>{window.testCommands.push(structuredClone(m));return send(m);};
function Fixture(){const [room,setRoom]=React.useState(null);React.useEffect(()=>{const unsub=connection.subscribe(m=>{window.testMessages.push(m);if(m.type==='welcome')connection.send({type:'create',battleSize:400});if(m.type==='room'){window.testRoom=m.room;setRoom(m.room);}});connection.connect(location.origin.replace('http','ws')+'/lan/ws','装配验收');return unsub;},[]);
return room?React.createElement(LanAiFleet,{room,isHost:true,editable:true,connection,currentDesign:own,onEdit:t=>{window.editTarget=t;},openInitially:true,initialQuery:'攻势'}):React.createElement('p',null,'连接中');}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script></html>`);
const outDir = resolve(work, 'build');
const result = await build({ configFile: false, root, base: './', plugins: [react(), catalogDataPlugin()], define: { __LAN_BUILD_ID__: JSON.stringify(buildId) },
  build: { outDir, emptyOutDir: false, copyPublicDir: false, rollupOptions: { input: fixture } }, logLevel: 'warn' });
const bundle = Array.isArray(result) ? result[0] : result;
const entry = bundle.output.find(file => file.fileName.endsWith('.html')).fileName;
await writeFile(resolve(outDir, 'lan-build.json'), JSON.stringify({ build: buildId }));
await writeFile(resolve(outDir, 'empty.html'), '<!doctype html><title>storage test</title>');
const app = await createLanServer({ host: '127.0.0.1', port: 0, dist: outDir });
let browser;
const passed = [], errors = [];
try {
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => { errors.push(error.message); console.error('pageerror:', error.message); });
  await page.route('**/game-assets/**', async route => {
    const suffix = decodeURIComponent(new URL(route.request().url()).pathname.split('/game-assets/')[1]);
    const assets = resolve(root, 'public/game-assets'), path = resolve(assets, suffix);
    if (!path.startsWith(assets + sep)) return route.abort();
    await route.fulfill({ path });
  });
  await page.goto(origin + '/' + entry);
  await page.getByRole('searchbox', { name: '搜索 AI 舰船' }).waitFor();
  const initialRaw = await page.evaluate(() => localStorage.getItem(testApi.storageKey));
  const model = await page.evaluate(() => {
    const {designs,aiFitsForHull,nativeVariantsForHull,hulls}=testApi;
    const before=JSON.stringify(designs),fits=aiFitsForHull('onslaught',designs),saved=fits.filter(f=>f.display.id.startsWith('saved:'));
    const copy=JSON.stringify(saved[0].selection.design),expected=JSON.stringify(designs[0]);
    saved[0].selection.design.groups[0].weaponSlotIds.length=0;saved[0].selection.design.captainSkills.helmsmanship=2;
    if(saved[0].selection.design.modules)Object.values(saved[0].selection.design.modules)[0].name='changed';
    const fallbackHull=hulls.find(h=>nativeVariantsForHull(h.id).length===0);
    const carrierCopy=aiFitsForHull('legion_xiv',designs).find(f=>f.display.id==='saved:carrier-save');
    return {carrierWings:carrierCopy.selection.design.wings,ids:fits.map(f=>f.display.id),count:fits.length,nativeCount:nativeVariantsForHull('onslaught').length,savedCount:saved.length,
      collisionIds:aiFitsForHull('onslaught',[{...designs[0],id:'onslaught_Standard'}]).map(f=>f.display.id),cloneExact:copy===expected,unchanged:before===JSON.stringify(designs),invalid:fits.find(f=>f.display.id==='saved:bad-op').display.error,
      xiv:aiFitsForHull('onslaught_xiv',designs).filter(f=>f.display.id.startsWith('saved:')).map(f=>f.selection.design.hullId),
      fallback:fallbackHull?aiFitsForHull(fallbackHull.id,[]).map(f=>f.display.id):null,libraryError:testApi.readLibrary().error};
  });
  assert.deepEqual(model.carrierWings,[null,'broadsword_wing']);assert.equal(model.libraryError, null); assert.equal(model.savedCount, 3); assert.equal(model.count, model.nativeCount + 3);
  assert.equal(new Set(model.ids).size, model.ids.length); assert.ok(model.ids.includes('native:onslaught_Standard'));assert.equal(new Set(model.collisionIds).size,model.collisionIds.length);
  assert.ok(model.cloneExact && model.unchanged); assert.ok(model.invalid); assert.deepEqual(model.xiv, ['onslaught_xiv']);
  if (model.fallback) assert.match(model.fallback[0], /^default:/);
  passed.push('exact hull filtering, native ID collision, duplicate names, default fallback, complete deep copies and invalid fit reasons');

  const hull = page.getByRole('button', { name: '选择 攻势 舰体', exact: true });
  const popup = page.locator('.sim-loadout-picker');
  const option = id => popup.locator('[data-loadout-option="' + id + '"]');
  const aiCount = () => page.evaluate(() => testCommands.filter(m => m.type === 'ai').length);
  await hull.click();
  assert.equal(await popup.locator('.sim-loadout-option').count(), model.count);
  assert.match(await hull.innerText(), new RegExp(model.count + ' 项配装.*已存 3'));
  await option('saved:onslaught-standard').click(); assert.equal(await aiCount(), 0);
  assert.equal(await option('saved:onslaught-standard').getAttribute('aria-pressed'), 'true');
  await option('saved:bad-op').hover();
  await popup.locator('.sim-loadout-destination-error').waitFor();
  assert.equal(await popup.locator('.sim-loadout-destination:not(:disabled)').count(), 0);
  assert.equal(await aiCount(), 0);
  await option('saved:onslaught-standard').click();
  await page.screenshot({ path: resolve(work, 'saved-fit-desktop.png') });
  await popup.getByRole('button', { name: '标准 · 已保存 · 添加 1 艘到 B 队', exact: true }).click();
  await popup.locator('.sim-loadout-action-status').filter({ hasText: '服务器已确认' }).waitFor();
  assert.equal(await aiCount(), 1);
  let state = await page.evaluate(() => ({ room: testRoom, sent: testCommands.find(m => m.type === 'ai'), expected: testApi.validateLanDesign(testApi.designs[0]) }));
  const firstKey = state.room.options.aiHulls[1].at(-1);
  assert.deepEqual(state.sent.design, state.expected);
  assert.deepEqual(state.room.options.aiLoadouts[firstKey], state.expected);
  assert.deepEqual(app.rooms.get(state.room.code).options.aiLoadouts[firstKey], state.expected);
  assert.equal(await page.evaluate(() => localStorage.getItem(testApi.storageKey)), initialRaw);
  passed.push('selection never adds; invalid fits disabled; real relay preserves full saved fit and original local library');

  await option('saved:same-name').click();
  await popup.getByRole('button', { name: '标准 · 已保存 · 添加 1 艘到 B 队', exact: true }).click();
  await page.waitForFunction(() => testRoom.options.aiHulls[1].length === 2);
  state = await page.evaluate(() => ({ room: testRoom, expected: testApi.validateLanDesign(testApi.designs[1]) }));
  const secondKey = state.room.options.aiHulls[1].at(-1);
  assert.notEqual(firstKey, secondKey); assert.deepEqual(state.room.options.aiLoadouts[secondKey], state.expected);
  passed.push('same-named saved fits with different skills remain separate server configurations');

  await popup.getByRole('button', { name: '关闭配装选择' }).click();
  await page.getByRole('searchbox', { name: '搜索 AI 舰船' }).fill('onslaught_xiv');
  await page.locator('.lan-ai-catalog-choice').click();
  await option('saved:xiv-save').click();
  await popup.getByRole('button', { name: 'XIV 私人装配 · 已保存 · 添加 1 艘到 A 队', exact: true }).click();
  await page.waitForFunction(() => testRoom.options.aiHulls[0].length === 1);
  state = await page.evaluate(() => ({ room: testRoom, expected: testApi.validateLanDesign(testApi.designs[2]) }));
  assert.deepEqual(state.room.options.aiLoadouts[state.room.options.aiHulls[0][0]], state.expected);
  passed.push('XIV saved fit adds to the explicit destination, never substituted with the base hull');

  await popup.getByRole('button', { name: '关闭配装选择' }).click();
  await page.getByRole('searchbox', { name: '搜索 AI 舰船' }).fill('攻势');await hull.click();
  const peer=await context.newPage();await peer.goto(origin+'/empty.html');
  const key=await page.evaluate(()=>testApi.storageKey);
  await peer.evaluate(key=>{const value=JSON.parse(localStorage.getItem(key));value.designs.push({...value.designs[0],id:'new-save',name:'刚保存的方案'});localStorage.setItem(key,JSON.stringify(value));},key);
  await option('saved:new-save').waitFor();
  await option('saved:new-save').click();
  await peer.evaluate(key=>{const value=JSON.parse(localStorage.getItem(key));value.designs.find(d=>d.id==='new-save').name='更新后的方案';localStorage.setItem(key,JSON.stringify(value));},key);
  await page.waitForFunction(()=>document.querySelector('[data-loadout-option="saved:new-save"]')?.textContent.includes('更新后的方案'));
  assert.match(await page.locator('.lan-ai-selection').innerText(),/刚保存的方案/);
  assert.equal(await aiCount(),3);await peer.close();
  passed.push('cross-tab updates refresh the list without overwriting a selected snapshot or submitting');

  await popup.getByRole('button',{name:'关闭配装选择'}).click();
  await page.getByRole('button',{name:'完成编成',exact:true}).click();
  await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem(testApi.storageKey));value.designs.push({...value.designs[0],id:'reopen-save',name:'关闭期间保存'});localStorage.setItem(testApi.storageKey,JSON.stringify(value));});
  await page.getByRole('button',{name:/添加 \/ 批量管理 AI/}).click();await hull.click();await option('saved:reopen-save').waitFor();
  for(const width of [1440,390]){
    await popup.getByRole('button',{name:'关闭配装选择'}).click();
    await page.setViewportSize({width,height:900});await hull.click();await option('saved:onslaught-standard').click();
    const bounds=await popup.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};});
    assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=bounds.w+1&&bounds.bottom<=bounds.h+1,JSON.stringify(bounds));
    await page.screenshot({path:resolve(work,'saved-fit-'+width+'.png')});
  }
  await popup.getByRole('button',{name:'关闭配装选择'}).focus();await page.keyboard.press('Enter');
  await popup.waitFor({state:'detached'});
  passed.push('reopening refreshes local saves; desktop/mobile bounds and keyboard close work');

  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem(testApi.storageKey));value.designs=[];localStorage.setItem(testApi.storageKey,JSON.stringify(value));window.dispatchEvent(new Event('focus'));});
  await hull.click();await page.waitForFunction(()=>!document.querySelector('[data-loadout-option^="saved:"]'));
  assert.equal(await popup.locator('.sim-loadout-option').count(),model.nativeCount);
  await popup.getByRole('button',{name:'关闭配装选择'}).click();
  await page.evaluate(()=>{localStorage.setItem(testApi.storageKey,'{broken');window.dispatchEvent(new Event('focus'));});
  await page.getByRole('alert').filter({hasText:'未覆盖原方案数据'}).waitFor();await hull.click();
  assert.equal(await popup.locator('.sim-loadout-option').count(),model.nativeCount);
  assert.equal(await page.evaluate(()=>localStorage.getItem(testApi.storageKey)),'{broken');
  assert.equal(await aiCount(),3);assert.deepEqual(errors,[]);
  passed.push('empty/corrupt libraries keep native fits usable and never overwrite stored bytes');
  console.log(JSON.stringify({passed,errors},null,2));
} finally { await browser?.close(); await app.close(); }
