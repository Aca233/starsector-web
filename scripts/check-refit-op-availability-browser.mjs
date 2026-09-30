/** Real NativeRefit component; headless, isolated storage, no release build or desktop input. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {build,preview} from 'vite';
import react from '@vitejs/plugin-react';
import {catalogDataPlugin} from './catalog-data-plugin.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=resolve('.'),work=resolve('artifacts/refit-op-availability-tests');await mkdir(work,{recursive:true});
const fixture=resolve(work,'fixture.html');
await writeFile(fixture,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {NativeRefit} from '/src/studio/NativeRefit.tsx';
import {createDesign,budget,evaluate,fluxLimit,nativeHull,isBuiltIn,weapons,weaponOPCost,compatibility,autoGroups,editableMods,modReason,designHullSpec,designModules,designFromModule,storageKey} from '/src/studio/DesignModel.ts';
import {hullModOPCost} from '/src/engine/extensions/HullMods.ts';import '/src/index.css';import '/src/studio/studio.css';
const noop=()=>{};
function empty(){return {...createDesign('onslaught','empty'),id:'op-fixture'};}
function withBudget(remaining){const d=empty();
for(const slot of nativeHull(d.hullId).weaponSlots){if(isBuiltIn(d.hullId,slot.slotId))continue;const allowance=budget(d).remaining-30;const choice=weapons.filter(w=>!compatibility(slot,w)&&weaponOPCost(d,w.id)<=allowance).sort((a,b)=>weaponOPCost(d,b.id)-weaponOPCost(d,a.id))[0];if(choice)d.weapons[slot.slotId]=choice.id;}
const flux=budget(d).remaining-remaining;if(flux<0||flux>2*fluxLimit(d.hullId))throw Error('fixture cannot allocate '+remaining+' OP');
d.capacitors=Math.floor(flux/2);d.vents=flux-d.capacitors;d.groups=autoGroups(d);if(budget(d).remaining!==remaining)throw Error('fixture budget mismatch');return d;}
const mod='fluxdistributor',cost=hullModOPCost(designHullSpec(empty()),mod),incompatible=editableMods.find(id=>modReason(empty(),id));
window.fixtureApi={empty,withBudget,budget,fluxLimit,mod,cost,incompatible};
localStorage.setItem(storageKey,'fixture original bytes');
function Fixture(){const [draft,setDraft]=React.useState(()=>withBudget(1));window.fixtureState={draft,op:budget(draft)};window.fixtureApi.setDraft=setDraft;
window.fixtureApi.moduleCase=()=>{const root=createDesign('onslaught_mk1','empty'),mount=designModules(root)[0];if(!mount)throw Error('missing module fixture');const child=designFromModule(mount.spec),left=budget(child).remaining;
const capRoom=fluxLimit(child.hullId)-child.capacitors,ventRoom=fluxLimit(child.hullId)-child.vents;if(left<0||left>capRoom+ventRoom)throw Error('module fixture cannot exhaust OP: '+JSON.stringify({left,capRoom,ventRoom}));
const add=Math.min(left,capRoom);child.capacitors+=add;child.vents+=left-add;root.modules={[mount.slotId]:child};setDraft(root);return {slot:mount.slotId,rootRemaining:budget(root).remaining,childRemaining:budget(child).remaining};};
return React.createElement(NativeRefit,{draft,designs:[],dirty:false,canUndo:false,status:'',warning:null,onChange:setDraft,onHull:noop,onOpen:noop,onSave:()=>true,onRename:()=>true,onCopy:noop,onNew:noop,onDelete:noop,onExport:noop,onImport:noop,onUndo:noop,onClear:noop,onLaunch:noop,onHome:noop,onSkills:noop,hullFilter:{query:'',hullClass:'',faction:''},onHullFilter:noop,readHullScroll:()=>0,writeHullScroll:noop});}
window.fixtureApi.storageKey=storageKey;createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script></html>`);
const outDir=resolve(work,'build');
const result=await build({configFile:false,root,base:'./',plugins:[react(),catalogDataPlugin()],build:{outDir,emptyOutDir:false,copyPublicDir:false,rollupOptions:{input:fixture}},logLevel:'warn'});
const bundle=Array.isArray(result)?result[0]:result,entry=bundle.output.find(x=>x.fileName.endsWith('.html')).fileName;
const server=await preview({configFile:false,root,base:'./',build:{outDir},preview:{host:'127.0.0.1',port:0,open:false}});
let browser;const errors=[],passed=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/game-assets/**',async route=>{const suffix=decodeURIComponent(new URL(route.request().url()).pathname.split('/game-assets/')[1]),assets=resolve(root,'public/game-assets'),path=resolve(assets,suffix);if(!path.startsWith(assets+sep))return route.abort();await route.fulfill({path});});
 await page.goto(server.resolvedUrls.local[0]+entry);
 const cap=page.getByRole('spinbutton',{name:'载荷容存器',exact:true}),vent=page.getByRole('spinbutton',{name:'耗散通道',exact:true});
 const plusCap=page.getByRole('button',{name:'增加载荷容存器',exact:true}),plusVent=page.getByRole('button',{name:'增加耗散通道',exact:true});
 const minusCap=page.getByRole('button',{name:'减少载荷容存器',exact:true});
 const state=()=>page.evaluate(()=>fixtureState);
 const load=async remaining=>{await page.evaluate(value=>fixtureApi.setDraft(fixtureApi.withBudget(value)),remaining);await page.waitForFunction(value=>fixtureState.op.remaining===value,remaining);};
 await cap.waitFor();assert.equal((await state()).op.remaining,1);assert.equal(await plusCap.isEnabled(),true);assert.equal(await plusVent.isEnabled(),true);
 await plusCap.click();assert.equal((await state()).op.remaining,0);assert.equal(await plusCap.isDisabled(),true);assert.equal(await plusVent.isDisabled(),true);
 const zero=await state();await plusCap.evaluate(e=>e.click());assert.deepEqual(await state(),zero);
 await cap.fill(String(zero.draft.capacitors+10));assert.equal(await cap.inputValue(),String(zero.draft.capacitors));
 await vent.focus();await page.keyboard.press('ArrowUp');assert.deepEqual(await state(),zero);
 await page.screenshot({path:resolve(work,'zero-op.png')});
 await minusCap.click();assert.equal((await state()).op.remaining,1);assert.equal(await plusCap.isEnabled(),true);assert.equal(await plusVent.isEnabled(),true);
 await plusVent.click();assert.equal((await state()).op.remaining,0);
 passed.push('one OP can be spent exactly once; both plus buttons and numeric/keyboard bypass stop at zero; reducing re-enables them');
 await load(-2);const negative=await state();assert.equal(await plusCap.isDisabled(),true);assert.equal(await plusVent.isDisabled(),true);
 await cap.fill(String(negative.draft.capacitors+1));assert.deepEqual(await state(),negative);
 await minusCap.click();assert.equal((await state()).op.remaining,-1);assert.equal(await plusCap.isDisabled(),true);
 await minusCap.click();assert.equal((await state()).op.remaining,0);assert.equal(await plusCap.isDisabled(),true);
 await minusCap.click();assert.equal((await state()).op.remaining,1);assert.equal(await plusCap.isEnabled(),true);
 await load(5);const five=await state();await cap.fill('999');assert.equal((await state()).draft.capacitors,five.draft.capacitors+5);assert.equal((await state()).op.remaining,0);
 await page.evaluate(()=>{const d=fixtureApi.empty();d.capacitors=fixtureApi.fluxLimit(d.hullId);fixtureApi.setDraft(d);});
 await page.waitForFunction(()=>fixtureState.draft.capacitors===fixtureApi.fluxLimit(fixtureState.draft.hullId));
 assert.equal(await plusCap.isDisabled(),true);assert.equal(await plusVent.isEnabled(),true);assert.ok((await state()).op.remaining>0);
 await cap.fill('-9');assert.equal((await state()).draft.capacitors,0);assert.equal(await minusCap.isDisabled(),true);
 passed.push('overbudget imports are not silently trimmed, can be reduced, and cannot grow; direct input obeys budget, hull cap and zero minimum');

 const {mod,cost,incompatible}=await page.evaluate(()=>({mod:fixtureApi.mod,cost:fixtureApi.cost,incompatible:fixtureApi.incompatible}));
 assert.ok(cost>0&&incompatible);await load(cost);
 await page.getByRole('button',{name:/安装舰船插件/}).click();
 const search=page.getByRole('searchbox',{name:'搜索舰船插件'}),row=id=>page.locator('.source-mod-scroll > .source-mod-row[data-inspect-mod="'+id+'"]');
 const color=id=>row(id).evaluate(e=>getComputedStyle(e).backgroundColor);
 await search.fill(mod);assert.equal(await row(mod).getAttribute('data-unavailable'),'false');assert.equal(await color(mod),'rgba(0, 0, 0, 0)');
 await row(mod).hover();assert.equal(await color(mod),'rgba(255, 255, 255, 0.04)');
 await row(mod).locator('button.source-mod-select').click();assert.equal((await state()).op.remaining,0);assert.ok((await state()).draft.hullMods.includes(mod));
 assert.equal(await row(mod).getAttribute('data-unavailable'),'false');assert.equal(await row(mod).locator('button').getAttribute('aria-pressed'),'true');assert.equal(await plusCap.isDisabled(),true);
 await row(mod).locator('button').focus();await page.keyboard.press('Enter');assert.equal((await state()).op.remaining,cost);assert.ok(!(await state()).draft.hullMods.includes(mod));
 await load(cost-1);assert.equal(await row(mod).getAttribute('data-unavailable'),'true');assert.equal(await row(mod).locator('button').getAttribute('aria-disabled'),'true');
 const blocked=await state();await row(mod).getByRole('cell').nth(2).click();assert.deepEqual(await state(),blocked);
 await row(mod).locator('button').focus();await page.keyboard.press('Enter');assert.deepEqual(await state(),blocked);
 await row(mod).hover();assert.equal(await color(mod),'rgba(11, 37, 45, 0.6)');assert.match(await row(mod).innerText(),/装配点不足/);
 await load(cost);assert.equal(await row(mod).getAttribute('data-unavailable'),'false');assert.notEqual(await color(mod),'rgba(11, 37, 45, 0.6)');
 await page.evaluate(()=>fixtureApi.setDraft(fixtureApi.empty()));await search.fill(incompatible);assert.equal(await row(incompatible).getAttribute('data-unavailable'),'true');assert.equal(await color(incompatible),'rgba(11, 37, 45, 0.6)');
 const incompatibleDraft=await state();await row(incompatible).getByRole('cell').nth(2).click();assert.deepEqual(await state(),incompatibleDraft);
 await search.fill('');await page.screenshot({path:resolve(work,'mod-availability.png')});
 passed.push('installable/exact-cost and removable mods have no blue marker; insufficient/incompatible mods are blue and cannot install, including cell/keyboard actions');
 // The invalid row stays keyboard-inspectable; opening its encyclopedia is not an install.
 await search.fill(mod);await row(mod).locator('button').focus();await page.keyboard.press('F2');
 await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 passed.push('mod inspection keyboard entry and close remain usable');

 const module=await page.evaluate(()=>fixtureApi.moduleCase());assert.ok(module.rootRemaining>0);assert.equal(module.childRemaining,0);
 const moduleTarget=page.getByRole('button',{name:new RegExp('^改装模块 '+module.slot+' · ')});
 await moduleTarget.waitFor();
 assert.equal(await page.getByRole('region',{name:'模块改装导航'}).count(),0);
 assert.equal(await page.locator('.assembly-editor').count(),0);
 await moduleTarget.press('Enter');
 assert.equal(await moduleTarget.getAttribute('aria-pressed'),'true');
 assert.equal(await plusCap.isDisabled(),true);assert.equal(await plusVent.isDisabled(),true);
 await page.mouse.move(5,5);await page.screenshot({path:resolve(work,'module-without-navigation.png')});
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'改装母舰',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await plusCap.isEnabled(),true);
 const stage=page.locator('.studio-ship'),vessel=await page.locator('.refit-vessel').boundingBox();
 const beforeTransform=await stage.evaluate(element=>element.style.transform);
 await page.mouse.move(vessel.x+vessel.width/2,vessel.y+vessel.height/2);await page.mouse.wheel(0,-100);
 await page.waitForFunction(previous=>document.querySelector('.studio-ship').style.transform!==previous,beforeTransform);
 const zoomedTransform=await stage.evaluate(element=>element.style.transform);
 await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(vessel.x+vessel.width/2+30,vessel.y+vessel.height/2+20);await page.mouse.up();await page.keyboard.up('Shift');
 await page.waitForFunction(previous=>document.querySelector('.studio-ship').style.transform!==previous,zoomedTransform);
 assert.equal(await page.getByRole('button',{name:'改装母舰',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>localStorage.getItem(fixtureApi.storageKey)),'fixture original bytes');
 passed.push('module zero-OP ceiling is independent of the parent ship budget; saved storage bytes never change');
 passed.push('module navigation panel removed; hull selection, Escape to parent, zoom and Shift pan remain usable');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,errors},null,2));
}finally{await browser?.close();await new Promise((res,rej)=>server.httpServer.close(e=>e?rej(e):res()));}
