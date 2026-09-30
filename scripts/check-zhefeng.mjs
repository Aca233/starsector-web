import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {checkZhefengRender} from './lib/zhefeng-render-check.mjs';
import {createServer as netServer} from 'node:net';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out='artifacts/zhefeng';await fs.mkdir(out,{recursive:true});
const probe=netServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)requests.push([r.status(),r.url()]);});
 if(!process.argv.includes('--ui-only')&&!process.argv.includes('--render-only')){
  await page.route('**/__zhefeng_check.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Background production rule check</title>'}));
  await page.goto(`http://127.0.0.1:${port}/__zhefeng_check.html`);
  const main=await page.evaluate(async()=>{const {runZhefengScenarios}=await import('/scripts/zhefeng-scenarios.mjs');return runZhefengScenarios();});
  await fs.writeFile(out+'/main-check.json',JSON.stringify(main,null,2));
  const worker=await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('/scripts/zhefeng-check-worker.mjs',{type:'module'});const timer=setTimeout(()=>{w.terminate();reject(Error('Worker timed out'));},90000);w.onmessage=({data})=>{clearTimeout(timer);w.terminate();if(data.error)reject(Error(data.error));else resolve(data.result);};w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message));};w.postMessage('run');}));
  assert.deepEqual(worker.checks,main.checks);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await fs.writeFile(out+'/rules-check.json',JSON.stringify({main,worker,pageErrors:errors,scope:'Production rules and actual Dedicated Worker, not multiplayer or final balance'},null,2));
  console.log('RULES',JSON.stringify({main:main.checks.length,worker:worker.checks.length,measurements:main.measurements}));
 }
 if(!process.argv.includes('--rules-only')&&!process.argv.includes('--render-only')){
  await page.goto(`http://127.0.0.1:${port}/?view=design`);await page.locator('#refit-hull-search').fill('折锋');await page.locator('[data-hull-id="web_zhefeng"]').click();
  await page.locator('.refit-mod-row.builtin[data-inspect-mod="web_zhefeng_split_capacitor"]').waitFor();
  const fits=['折锋 · 突击破甲','折锋 · 压盾支援'];
  for(const [index,name] of fits.entries()){
   await page.getByRole('button',{name:/装配方案.*V/}).click();await page.getByRole('button',{name:'预览装配方案：'+name,exact:true}).click();
   await page.getByRole('button',{name:/^确认/}).click();await page.locator('.source-variant-picker').waitFor({state:'hidden'});
   const key=await page.evaluate(async()=>(await import('/src/studio/DesignModel.ts')).storageKey),expected=index?'web_zhefeng_steady_firecontrol':'web_zhefeng_assault_rack';
   await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)??'null')?.draft?.hullMods?.includes(id),{key,id:expected});
   await page.reload();await page.locator(`.refit-mod-row[data-inspect-mod="${expected}"]`).waitFor();await page.waitForTimeout(650);await page.screenshot({path:out+`/refit-${index}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:/安装舰船插件/}).click();await page.locator('.source-mod-picker').waitFor();
  assert.equal(await page.locator('button.source-mod-select[data-inspect-mod="web_zhefeng_assault_rack"]').getAttribute('aria-disabled'),'true');
  await page.keyboard.press('Escape');await page.locator('.source-mod-picker').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/^模拟战斗/}).click();await page.locator('canvas').first().waitFor({timeout:60000});
  await page.getByRole('button',{name:/^折锋级 · .*项配装/}).click();
  await page.locator('[data-loadout-option="zhefeng-assault"]').click();
  await page.getByRole('button',{name:'部署敌军',exact:true}).click();
  await page.waitForTimeout(1500);await page.screenshot({path:out+'/simulator.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await fs.writeFile(out+'/ui-check.json',JSON.stringify({fits,defaultBuiltin:true,reloadedBoth:true,exclusive:true,launchedSimulation:true,pageErrors:errors,failedRequests:requests},null,2));console.log('UI passed: two fits, persisted reload, exclusive plugins and real simulator launch');
 }
 if(!process.argv.includes('--rules-only'))await checkZhefengRender(browser,port,out,errors);
}finally{await browser?.close();await server.close();}
