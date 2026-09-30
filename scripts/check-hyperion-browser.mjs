import {checkHyperionHullmodsUI} from './lib/check-hyperion-hullmods-browser.mjs';
/** Real refit -> isolated authority Worker -> user input; never touches shared 5173/browser storage. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const out=resolve('artifacts/hyperion');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5278,strictPort:true,open:false,watch:null}});await server.listen();await server.watcher.close();
let browser,page;const errors=[],badAssets=[];const steps=[],captures=[],loadedMedia=new Set();
async function captureBattle(name) {
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>window.__combatSession.state==='paused');
 await page.evaluate(async()=>{await window.__combatSession.barrier();});
 await page.mouse.move(720,500);
 await page.evaluate(()=>window.__combatSession.cameraController.reset());
 await page.waitForFunction(()=>{
   const core=window.__combatReadView.playerShip.systems[0];
   return document.querySelector('[aria-label="内置插件状态"]')?.textContent?.includes('反应堆 '+core.charges+'/');
 });
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:resolve(out,name+'.png'),animations:'disabled'});
 captures.push(await page.evaluate(name=>({name,paused:window.__combatSession.state,hud:document.querySelector('[aria-label="内置插件状态"]')?.textContent,
   visuals:window.__combatSession.renderView.playerShip.allSystems.map(s=>({state:s.state,effect:s.effectLevel,origin:!!s.teleportVisual?.origin})), projectiles:window.__combatSession.renderView.projectiles.map(p=>({spec:p.specId,age:p.elapsedTime})),systems:window.__combatReadView.playerShip.systems.map(s=>({type:s.type,state:s.state,charges:s.charges})),throttle:window.__combatReadView.playerShip.throttle}),name));
 await page.keyboard.press('Space');await page.waitForFunction(()=>window.__combatSession.state==='running');
}
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(!r.url().includes('/game-assets/'))return;if(r.status()>=400)badAssets.push(r.url());else loadedMedia.add(new URL(r.url()).pathname);});
 page.on('requestfailed',r=>{if(r.url().includes('/game-assets/'))badAssets.push(r.url());});
 if(process.argv.includes('--hullmods')) {
  await checkHyperionHullmodsUI(page,server.resolvedUrls.local[0],out);assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 } else {
 await page.goto(server.resolvedUrls.local[0]+'?view=design');
 await page.locator('#refit-hull-search').fill('休伯利安');await page.locator('button[data-hull-id="web_sc2_hyperion"]').click();
 await page.waitForFunction(()=>document.querySelector('button[data-hull-id="web_sc2_hyperion"]')?.getAttribute('aria-pressed')==='true');
 await page.mouse.move(1420,950);
 if(await page.locator('.dwell-popover[data-dwell-locked="true"]').count())await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/装配方案\.\.\./}).click();
 await page.getByRole('button',{name:'预览装配方案：雷诺旗舰 · 跃迁突破',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/确认/}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.studio-hull-image,.studio-weapon-image')).every(i=>i.complete&&i.naturalWidth>0));
 assert.equal(await page.locator('.studio-mount').count(),24);assert((await page.locator('.studio-weapon-image').count())>=24); // Glow layers share this class.
 await page.screenshot({path:resolve(out,'refit.png'),animations:'disabled'});steps.push('24 real refit mounts and loaded turrets');
 for(const id of ['L01','M05','S12']){await page.locator(`.studio-mount[data-slot-id="${id}"]`).click();await page.waitForSelector('[role="dialog"]');await page.keyboard.press('Escape');}steps.push('large/medium/small mounts open weapon picker');
 await page.getByRole('button',{name:/模拟战斗/}).click();await page.waitForFunction(()=>document.querySelector('canvas')&&!document.body.innerText.includes('准备模拟战斗...'),{},{timeout:90000});
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
 await page.getByRole('button',{name:'激活技能 1：大和炮',exact:true}).waitFor();await page.getByRole('button',{name:'激活技能 2：战术跃迁',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__combatEngine===undefined),true,'expected Worker, not inline engine');
 await page.evaluate(()=>window.__combatRenderer.canvas.focus());
 const facing=await page.evaluate(()=>window.__combatReadView.playerShip.facingRad);
 await page.mouse.move(Math.max(50,Math.min(1370,720+Math.cos(facing)*580)),Math.max(40,Math.min(710,500+Math.sin(facing)*580)));
 await page.waitForFunction(()=>!window.__combatReadView.playerShip.systems[0].activationFailureReason);
 await page.mouse.down();await page.waitForFunction(()=>window.__combatReadView.playerShip.weapons.some(w=>w.spec.id==='web_sc2_hyperion_ata'&&w.ammo<24));await page.mouse.up();
 await captureBattle('armory-fire');steps.push('custom ATA volley accepted through mouse input and actual magazine deduction');
 await page.mouse.move(720,100);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(async()=>{await window.__combatSession.barrier();window.__combatRenderer.canvas.focus();});
 await page.waitForFunction(()=>!window.__combatReadView.playerShip.systems[0].activationFailureReason);
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__combatReadView.playerShip.systems[0].state==='IN');
 await page.waitForFunction(()=>window.__combatSession.renderView.playerShip.allSystems[0].effectLevel>.68);
 await captureBattle('yamato-charge');
 await page.waitForFunction(()=>window.__combatSession.renderView.projectiles.some(p=>p.specId==='web_sc2_hyperion_yamato_shot'&&p.elapsedTime>.18));
 await captureBattle('yamato-flight');
 await page.waitForFunction(()=>window.__combatReadView.playerShip.systems[0].charges<50);
 steps.push('F accepted through Worker; warmup and shared stock deduction observed');
 await page.keyboard.down('w');await page.waitForFunction(()=>window.__combatReadView.playerShip.throttle>.7);
 await captureBattle('combat-engines');await page.keyboard.up('w');
 await page.waitForFunction(()=>window.__combatReadView.playerShip.systems[0].charges>=75,{},{timeout:30000});
 await page.mouse.move(1000,350);
 await page.waitForFunction(()=>!window.__combatReadView.playerShip.systems[1].activationFailureReason);
 const before=await page.evaluate(()=>({x:window.__combatReadView.playerShip.pos.x,y:window.__combatReadView.playerShip.pos.y,offset:{...window.__combatReadView.playerShip.teleportCameraOffset}}));
 await page.keyboard.press('g');await page.waitForFunction(()=>window.__combatSession.jumpTargeting.preview?.valid);
 const armStock=await page.evaluate(()=>window.__combatReadView.playerShip.systems[0].charges);
 assert.equal(await page.evaluate(()=>window.__combatReadView.playerShip.systems[1].state),'IDLE');
 await page.screenshot({path:resolve(out,'jump-target-position.png')});
 const shieldBefore=await page.evaluate(()=>window.__combatReadView.playerShip.shield.isActive);
 await page.mouse.click(1000,350,{button:'right'});assert(!await page.evaluate(()=>window.__combatSession.jumpTargeting.active));
 assert.equal(await page.evaluate(()=>window.__combatReadView.playerShip.shield.isActive),shieldBefore);
 await page.keyboard.press('g');await page.waitForFunction(()=>window.__combatSession.jumpTargeting.active);await page.keyboard.press('Escape');
 assert(!await page.evaluate(()=>window.__combatSession.jumpTargeting.active));assert.equal(await page.getByRole('dialog').count(),0);
 await page.keyboard.press('g');await page.waitForFunction(()=>window.__combatSession.jumpTargeting.active);await page.keyboard.press('g');assert(!await page.evaluate(()=>window.__combatSession.jumpTargeting.active));
 await page.getByRole('button',{name:'激活技能 2：战术跃迁',exact:true}).click();
 await page.waitForFunction(()=>window.__combatSession.jumpTargeting.active);
 await page.mouse.move(1000,350);await page.waitForFunction(()=>window.__combatSession.jumpTargeting.preview?.valid);
 await page.mouse.click(1000,350);await page.waitForFunction(()=>window.__combatSession.jumpTargeting.choosingFacing);
 const locked=await page.evaluate(()=>({...window.__combatSession.jumpTargeting.preview.position}));
 assert.equal(await page.evaluate(()=>window.__combatReadView.playerShip.systems[1].state),'IDLE');
 await page.mouse.move(1000,250);await page.waitForFunction(()=>window.__combatSession.jumpTargeting.preview?.phase==='facing'&&Math.abs(window.__combatSession.jumpTargeting.preview.facing)>1);
 const rotated=await page.evaluate(()=>({point:{...window.__combatSession.jumpTargeting.preview.position},facing:window.__combatSession.jumpTargeting.preview.facing,
    stock:window.__combatReadView.playerShip.systems[0].charges,firing:window.__combatReadView.playerShip.isFiringMain}));
 assert.deepEqual(rotated.point,locked);assert(rotated.stock>=armStock);assert(!rotated.firing);
 await page.screenshot({path:resolve(out,'jump-target-facing.png')});
 await page.mouse.click(1000,250);await page.waitForFunction(()=>window.__combatReadView.playerShip.systems[1].state==='IN');
 assert(!await page.evaluate(()=>window.__combatSession.jumpTargeting.active));
 await page.waitForFunction(()=>window.__combatSession.renderView.playerShip.allSystems[1].teleportVisual?.destination);
 const accepted=await page.evaluate(()=>window.__combatSession.renderView.playerShip.allSystems[1].teleportVisual);
 assert(Math.hypot(accepted.destination.x-locked.x,accepted.destination.y-locked.y)<.001);
 assert(Math.abs(accepted.destinationFacing-rotated.facing)<.15);
 steps.push('G/HUD arm only; right/Escape/G cancel; first click locks position, mouse rotates ghost, second click commits pose without firing');
 await page.waitForFunction(()=>window.__combatSession.renderView.playerShip.allSystems[1].effectLevel>.65);
 await captureBattle('jump-charge');
 await page.waitForFunction(stock=>window.__combatReadView.playerShip.systems[0].charges<=stock-70,rotated.stock);
 await captureBattle('jump-exit');
 const after=await page.evaluate(()=>({x:window.__combatReadView.playerShip.pos.x,y:window.__combatReadView.playerShip.pos.y,offset:{...window.__combatReadView.playerShip.teleportCameraOffset}}));
 assert(Math.hypot(after.offset.x-before.offset.x,after.offset.y-before.offset.y)>=200,'jump did not occur');steps.push('two-click destination/facing accepted through Worker; actual teleport offset and shared stock deduction');
 await page.waitForFunction(()=>document.querySelector('[aria-label="内置插件状态"]')?.textContent?.includes('跃迁突击'));
 await captureBattle('jump-arrival');steps.push('six-second assault window shown in actual Worker HUD');
 const byName=name=>captures.find(c=>c.name===name);
 assert(byName('yamato-charge').visuals[0].effect>.65);
 assert(byName('yamato-flight').projectiles.some(p=>p.spec==='web_sc2_hyperion_yamato_shot'&&p.age>.18));
 assert(byName('jump-charge').visuals[1].state==='IN'&&byName('jump-charge').visuals[1].effect>.6);
 assert(byName('jump-exit').visuals[1].origin&&byName('jump-exit').visuals[1].effect>0&&byName('jump-exit').visuals[1].state!=='IN');
 assert(byName('jump-arrival').visuals[1].state==='COOLDOWN'&&byName('jump-arrival').visuals[1].origin);
 steps.push('mid-charge, travelling Yamato, jump warmup, successful exit and assault frames verified in Worker render projection');
 for(const name of ['explosion4','explosion1','starburst_glow1','projtrail','beam_rough2_fringe','explosion_ring0','wormhole_corona','wormhole_ring_bright3'])assert(loadedMedia.has('/game-assets/graphics/fx/'+name+'.png'),'not loaded: '+name);
 assert(![...loadedMedia].some(p=>p.startsWith('/game-assets/graphics/original/')),'procedural substitute requested');
 steps.push('retained textured skill media loaded with no procedural substitutes');
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 await writeFile(resolve(out,'browser-check.json'),JSON.stringify({steps,errors,badAssets,loadedMedia:[...loadedMedia],before,after,captures},null,2)+'\n');console.log('PASS actual Worker UI: '+steps.join(' / '));
 }
} catch(e) {
 if(page){await page.screenshot({path:resolve(out,'browser-failure.png')});await writeFile(resolve(out,'browser-failure.txt'),await page.locator('body').innerText());console.log('STATE',await page.evaluate(()=>({systems:window.__combatReadView?.playerShip?.systems?.map(s=>({type:s.type,state:s.state,charges:s.charges,reason:s.activationFailureReason})),facing:window.__combatReadView?.playerShip?.facingRad})));}
 console.log('PAGE ERRORS',errors);throw e;
} finally {await browser?.close();await server.close();}
