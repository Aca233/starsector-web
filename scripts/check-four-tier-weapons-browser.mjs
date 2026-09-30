/** Test content is registered only in this headless process; never alter the user's 5173 session. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const out=resolve('artifacts/four-tier-weapons');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5279,strictPort:true,open:false,watch:null}});await server.listen();await server.watcher.close();
let browser,page;const errors=[],steps=[];
try {
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'?view=design');await page.locator('#refit-hull-search').waitFor();
 await page.evaluate(async()=>{const fixture=await import('/scripts/fixtures/four-tier-weapons.ts');fixture.installFourTierFixture();});
 await page.locator('#refit-hull-search').fill('四档验收舰');await page.locator('button[data-hull-id="test_four_tier_hull"]').click();
 const xl=page.locator('.studio-mount[data-slot-id="XL01"]');await xl.waitFor();
 assert((await xl.getAttribute('aria-label')).includes('超大型'));assert((await xl.innerText()).includes('IV'));
 await page.screenshot({path:resolve(out,'xl-refit-empty.png'),animations:'disabled'});steps.push('fourth-tier XL slot has IV marker and accessible Chinese size');
 await xl.click();await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:/搜索.*势力筛选/}).click();
 const size=page.getByRole('combobox',{name:'武器尺寸筛选'});
 assert.equal(await size.locator('option').count(),5);
 for(const value of ['SMALL','MEDIUM','LARGE'])assert.equal(await size.locator('option[value="'+value+'"]').evaluate(option=>option.disabled),true,'XL rejects '+value);
 await page.getByRole('status').filter({hasText:'仅接受超大型武器'}).waitFor();
 assert.equal(await page.locator('[data-weapon-choice="web_sc2_hyperion_ata"]').count(),0);
 await size.selectOption('EXTRA_LARGE');
 assert.equal(await page.locator('[data-weapon-choice]').count(),1);
 await page.screenshot({path:resolve(out,'xl-picker.png'),animations:'disabled'});
 await page.locator('[data-weapon-choice="test_extra_large_weapon"]').click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert((await xl.getAttribute('aria-label')).includes('超大型验收炮'));steps.push('XL size filter and real 72 OP installation');
 await page.locator('.studio-mount[data-slot-id="L02"]').click();await page.getByRole('dialog').waitFor();
 assert.equal(await page.locator('[data-weapon-choice="test_extra_large_weapon"]').count(),0);
 await page.getByRole('button',{name:/搜索.*势力筛选/}).click();
 for(const value of ['SMALL','MEDIUM','EXTRA_LARGE'])assert.equal(await page.getByRole('combobox',{name:'武器尺寸筛选'}).locator('option[value="'+value+'"]').evaluate(option=>option.disabled),true,'large rejects '+value);
 await page.getByRole('status').filter({hasText:'仅接受大型武器'}).waitFor();
 await page.keyboard.press('Escape');steps.push('XL and large slots exclude both smaller and larger weapons');
 for(const [slotId,size] of [['M01','MEDIUM'],['S01','SMALL']]){
  await page.locator('.studio-mount[data-slot-id="'+slotId+'"]').click();await page.getByRole('dialog').waitFor();
  const choices=await page.evaluate(async()=>{const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');return [...document.querySelectorAll('[data-weapon-choice]')].map(el=>contentRegistry.getWeapon(el.getAttribute('data-weapon-choice')).mountSize);});
  assert(choices.length>0);assert(choices.every(value=>value===size));await page.keyboard.press('Escape');
 }
 steps.push('medium and small pickers show only same-size compatible weapons');
 await page.getByRole('button',{name:/模拟战斗/}).click();await page.waitForFunction(()=>document.querySelector('canvas')&&!document.body.innerText.includes('准备模拟战斗...'),{},{timeout:90000});
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
 await page.waitForFunction(()=>window.__combatSession?.renderView?.playerShip?.weapons?.some(w=>w.spec.id==='test_extra_large_weapon'));
 assert.equal(await page.evaluate(()=>window.__combatEngine===undefined),true);
 assert.equal(await page.evaluate(()=>window.__combatSession.renderView.playerShip.weapons.find(w=>w.spec.id==='test_extra_large_weapon').spec.mountSize),'EXTRA_LARGE');
 await page.evaluate(()=>window.__combatRenderer.canvas.focus());await page.mouse.move(720,70);await page.mouse.down();
 await page.waitForFunction(()=>window.__combatReadView.playerShip.weapons.some(w=>w.spec.id==='test_extra_large_weapon'&&w.ammo<24));await page.mouse.up();
 await page.keyboard.press('Space');await page.waitForFunction(()=>window.__combatSession.state==='paused');
 await page.evaluate(async()=>{await window.__combatSession.barrier();window.__combatSession.cameraController.reset();});
 const result=await page.evaluate(()=>({weapon:window.__combatReadView.playerShip.weapons.find(w=>w.spec.id==='test_extra_large_weapon').spec.mountSize,ammo:window.__combatReadView.playerShip.weapons.find(w=>w.spec.id==='test_extra_large_weapon').ammo,slot:window.__combatSession.renderView.playerShip.spec.weaponSlots.find(s=>s.slotId==='XL01').slotSize}));
 assert.equal(result.weapon,'EXTRA_LARGE');assert.equal(result.slot,'EXTRA_LARGE');assert(result.ammo<24);
 await page.screenshot({path:resolve(out,'xl-worker-fire.png'),animations:'disabled'});steps.push('real authority Worker retains XL slot/weapon and accepts mouse fire with actual ammo use');
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'browser-check.json'),JSON.stringify({steps,errors,result,testOnlyContent:true},null,2)+'\n');console.log('PASS '+steps.join(' / '));
} catch(e) {
 if(page){await page.screenshot({path:resolve(out,'browser-failure.png')});await writeFile(resolve(out,'browser-failure.txt'),await page.locator('body').innerText());}
 console.log('PAGE ERRORS',errors);throw e;
} finally {await browser?.close();await server.close();}
