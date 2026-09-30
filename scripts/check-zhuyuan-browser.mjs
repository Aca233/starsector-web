/** Actual app, isolated browser storage; never opens a visible desktop window. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const output=resolve('artifacts/zhuyuan'); await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false,watch:null}}); await server.listen();
let browser;
const errors=[];
try {
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(60000); page.on('pageerror',e=>errors.push(e.message));
  const url=server.resolvedUrls.local[0];
  await page.goto(url+'?view=design');
  await page.waitForFunction(() => document.querySelector('#refit-hull-search') || document.querySelector('main[role="alert"]'));
  const startupError = await page.evaluate(() => document.querySelector('main[role="alert"]')?.textContent);
  if (startupError) throw new Error(startupError);
  await page.locator('#refit-hull-search').fill('烛渊');
  await page.locator('button[data-hull-id="web_zhuyuan"]').click();
  await page.waitForFunction(()=>document.querySelector('button[data-hull-id="web_zhuyuan"]')?.getAttribute('aria-pressed')==='true');
  await page.locator('.studio-hull-image[src*="web_zhuyuan"]').waitFor({state:'visible'});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.studio-hull-image,.studio-weapon-image')).every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('.studio-mount').count(),8);
  assert.equal(await page.locator('.studio-weapon-image[src*="star_needle_turret"]').count(),3);
  await page.screenshot({animations:'disabled',path:resolve(output,'refit.png')});
  await page.getByRole('button',{name:/装配舰船技能/}).click();
  await page.locator('.system-detail img[src*="web_zhuyuan_eclipse"]').waitFor({state:'visible'});
  assert(await page.locator('.system-detail-description').innerText().then(t=>t.includes('能量伤害')));
  await page.screenshot({animations:'disabled',path:resolve(output,'eclipse-skill.png')});
  await page.keyboard.press('Escape');
  await page.locator('.studio-mount[data-slot-id="WS 007"]').click();
  // The actual weapon picker must retain the custom weapon and its tooltip metadata.
  await page.screenshot({animations:'disabled',path:resolve(output,'weapon-picker.png')});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/模拟战斗/}).click();
  await page.waitForFunction(()=>document.querySelector('canvas') && !document.body.innerText.includes('准备模拟战斗...'),{},{timeout:90000});
  await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();
  await page.keyboard.press('Tab');
  await page.locator('.hud-system-list img[src*="web_zhuyuan_eclipse"]').waitFor({state:'visible'});
  await page.getByRole('button',{name:/激活技能 1：日蚀协议/}).click();
  await page.waitForFunction(()=>/启动中|日蚀：能量伤害|运行中/.test(document.querySelector('.hud-system-list')?.textContent??''));
  const hudText=await page.locator('body').innerText();
  assert(!hudText.includes('studio.prototype.name')); assert(hudText.includes('缝星针'));
  await page.screenshot({animations:'disabled',path:resolve(output,'combat-entry.png')});
  await writeFile(resolve(output,'browser-state.txt'),await page.locator('body').innerText());
  await writeFile(resolve(output,'browser-errors.json'),JSON.stringify(errors,null,2));
  assert.deepEqual(errors,[]);
  console.log('PASS actual app: select hull, 8 mounts, 3 custom turrets, skill icon, weapon picker, Worker simulation, HUD skill activation.');
  console.log('URL:',url);
} catch(error) {
  if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({animations:'disabled',path:resolve(output,'browser-failure.png')});await writeFile(resolve(output,'browser-state.txt'),await page.locator('body').innerText());}}
  console.error('Browser page errors:',errors);throw error;
} finally { await browser?.close(); await server.close(); }
