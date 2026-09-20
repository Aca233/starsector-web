/** Isolated headless browser + production component fixture. Does not touch desktop, running rooms or saved profiles. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { catalogDataPlugin } from './catalog-data-plugin.ts';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const root=resolve('.'), work=resolve('artifacts/native-description-tests');
await mkdir(work,{recursive:true});
const fixture=resolve(work,'fixture.html');
await writeFile(fixture,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import NativeCatalog from '/src/studio/NativeCatalog.tsx';
function Fixture(){const [open,setOpen]=React.useState(true);return open?React.createElement(NativeCatalog,{onClose:()=>setOpen(false),onRefit:()=>{},onVariant:()=>{}}):React.createElement('p',null,'目录已关闭');}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script></html>`);
const outDir=resolve(work,'build');
// No campaign entry, release packaging, user dist overwrite or development HMR/dependency scan.
const result=await build({configFile:false,root,base:'./',plugins:[react(),catalogDataPlugin()],build:{outDir,emptyOutDir:false,copyPublicDir:false,rollupOptions:{input:fixture}},logLevel:'warn'});
const bundle=Array.isArray(result)?result[0]:result;
const entry=bundle.output.find(file=>file.fileName.endsWith('.html')).fileName;
const server=await preview({configFile:false,root,base:'./',build:{outDir},preview:{host:'127.0.0.1',port:0,open:false}});
let browser;
try {
  const origin=server.resolvedUrls.local[0];
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/game-assets/**',async route=>{
    const suffix=decodeURIComponent(new URL(route.request().url()).pathname.split('/game-assets/')[1]);
    const assets=resolve(root,'public/game-assets'), path=resolve(assets,suffix);
    if(!path.startsWith(assets+sep))return route.abort();
    await route.fulfill({path});
  });
  await page.goto(origin+entry);
  await page.locator('.native-catalog').waitFor();
  const search=page.getByRole('searchbox',{name:'搜索原生名称或 ID'});
  const inspect=async(category,id)=>{
    await page.getByRole('tab').filter({has:page.locator('span',{hasText:new RegExp('^'+category+'$')})}).click();
    await search.fill(id);
    await page.locator('.nc-entry').filter({has:page.locator('code',{hasText:new RegExp('^'+id+'$')})}).click();
    await page.locator('.nc-detail-heading code').filter({hasText:new RegExp('^'+id+'$')}).waitFor();
    await page.locator('.nc-description').waitFor();
    const text=await page.locator('.nc-description').innerText();
    assert.doesNotMatch(text,/%s|【参数待核实】|保留占位符/,id);
    assert.doesNotMatch(await page.locator('.nc-properties').first().innerText(),/%s/,id+' table');
    return text;
  };
  let text=await inspect('船体插件','advancedshieldemitter');
  assert.match(text,/100%.*100%/s);assert.match(text,/S-mod 固化说明/);
  for(const size of ['DESTROYER','CRUISER','CAPITAL_SHIP','FRIGATE']){
    await page.getByRole('combobox',{name:'说明参考舰级'}).selectOption(size);
    assert.doesNotMatch(await page.locator('.nc-description').innerText(),/%s|【参数待核实】/);
  }
  await page.getByRole('button',{name:'JSON / 定义',exact:true}).click();
  assert.match(await page.locator('.nc-raw').innerText(),/%s/);
  await page.getByRole('button',{name:'说明 / 参数',exact:true}).click();
  await mkdir('artifacts/native-description-tests',{recursive:true});
  await page.locator('.nc-description').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve('artifacts/native-description-tests/hullmod-desktop.png')});
  text=await inspect('武器','breach');assert.match(text,/250/);
  text=await inspect('武器','devouring_swarm');assert.match(text,/碎片集群.*6.*不造成伤害/s);
  text=await inspect('武器','ioncannon_fighter');assert.match(text,/25%/);
  text=await inspect('舰船','onslaught_xiv');assert.match(text,/第十四战斗群/);assert.match(text,/历史悠久的设计/);
  await page.setViewportSize({width:390,height:844});
  text=await inspect('船体插件','adaptive_coils');assert.match(text,/50%.*50%.*75%/s);
  await page.locator('.nc-description').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve('artifacts/native-description-tests/hullmod-mobile.png')});
  const widths=await page.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth}));
  assert.ok(widths.body<=widths.viewport+1,JSON.stringify(widths));
  // Existing keyboard category navigation and close/cancel remain usable.
  await page.getByRole('tab',{name:'船体插件'}).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'舰船系统'}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('Escape');await page.locator('.native-catalog').waitFor({state:'detached'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:['native hullmod normal/S-mod','four hull sizes','raw templates preserved','weapon CSV parameters + verified ion fallback','XIV prefix and base lore','390px layout','keyboard navigation and close'],errors},null,2));
} finally {await browser?.close();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
