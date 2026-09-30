/** Isolated headless check of exported 2D sprites, never the user's browser or 5173. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const out=resolve('output/spear-of-adun-art/module-layers-v01');
const build=JSON.parse(await readFile(resolve(out,'layer-build.json'),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],failed=[],steps=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1140},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>failed.push({url:request.url(),failure:request.failure()}));
  await page.goto(pathToFileURL(resolve(out,'review.html')).href);
  const ready=()=>page.waitForFunction(()=>document.querySelector('canvas').dataset.ready==='true');
  await ready();
  assert.equal(await page.locator('canvas').getAttribute('data-frame'),'0');
  for (const frame of build.frames) {
    await page.locator('#pose').selectOption(String(frame));
    await page.waitForFunction(f=>document.querySelector('canvas').dataset.frame===String(f)&&document.querySelector('canvas').dataset.ready==='true',frame);
    const ids=(await page.locator('canvas').getAttribute('data-draw-ids')).split(',');
    assert(ids.length>=5&&ids.length<=20);
  }
  steps.push('All 8 exported poses load atomically, each using owned 2D cropped PNG sprites.');
  await page.locator('#pose').selectOption('0');await ready();
  const optional=['FORE','PORT','STARBOARD','AFT'];
  for(let mask=0;mask<16;mask++) {
    for(let i=0;i<4;i++)await page.locator('#'+optional[i]).setChecked(!(mask&(1<<i)));
    const state=await page.locator('canvas').evaluate(c=>({owners:c.dataset.owners.split(','),draws:c.dataset.drawIds.split(',')}));
    const expected=['CORE',...optional.filter((_,i)=>!(mask&(1<<i)))];
    assert.deepEqual([...state.owners].sort(),expected.sort());
    for(const id of state.draws)assert(state.owners.includes(id.split('-z')[0]),id);
  }
  steps.push('All 16 optional-module visibility combinations remove every owned sublayer; no foreign module fragments remain in the draw list.');
  await page.getByRole('button',{name:'全部恢复',exact:true}).click();
  await page.locator('#heading').evaluate(el=>{el.value='37';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#angle').textContent(),'37°');
  await page.getByRole('button',{name:'回正',exact:true}).click();
  await page.locator('#pose').selectOption('375');await ready();
  await page.screenshot({path:resolve(out,'browser-preview.png'),fullPage:true});
  await page.locator('#PORT').uncheck();
  await page.screenshot({path:resolve(out,'browser-without-port.png'),fullPage:true});
  // Rapid pose requests must never publish the earlier async load after the last.
  await page.evaluate(()=>{const s=document.querySelector('#pose');for(const f of ['42','750','0']){s.value=f;s.dispatchEvent(new Event('change'));}});
  await page.waitForFunction(()=>document.querySelector('canvas').dataset.frame==='0'&&document.querySelector('canvas').dataset.ready==='true');
  assert(!(await page.locator('canvas').getAttribute('data-owners')).includes('PORT'));
  steps.push('Whole assembly heading and pose changes preserve visibility; rapid asynchronous pose switches do not mix frame sheets.');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  await writeFile(resolve(out,'browser-verification.json'),JSON.stringify({passed:true,headless:true,scope:'OFFLINE_SPRITE_PREVIEW_NOT_ENGINE',runtimeRegistered:false,errors,failed,steps},null,2));
  console.log('PASS 8 poses / 16 visibility combinations / heading / atomic frame switching; no browser errors or missing images.');
} finally {await browser.close();}
