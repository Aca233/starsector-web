import {checkRetiredAdunArmoryBrowser} from './lib/check-retired-adun-armory.mjs';
import {checkExtensionBallisticsBrowser} from './lib/check-extension-ballistics-browser.mjs';
import { checkAdunRetirement } from './lib/check-adun-retirement.mjs';
import { checkArkAircraft } from './lib/check-ark-aircraft.mjs';
import { checkArkSystemSurfaces } from './lib/check-ark-system-surfaces.mjs';
import { checkCombatHudSpeed } from './lib/check-combat-hud-speed.mjs';
import { checkArkDamage } from './lib/check-ark-damage-browser.mjs';
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=resolve('artifacts/adun-ark');await mkdir(out,{recursive:true});const server=await createServer({cacheDir:'node_modules/.vite-ark-check',server:{host:'127.0.0.1',port:5292,strictPort:true,open:false,watch:{ignored:['**/output/**','**/artifacts/**']}}});await server.listen();console.log('SERVER READY');
let browser,page;const errors=[],missing=[],steps=[];
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});console.log('BROWSER READY');page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/game-assets/'))missing.push(r.url());});
 console.log('NAVIGATING');await page.goto(server.resolvedUrls.local[0]+'?view=design',{waitUntil:'domcontentloaded'});console.log('DOM READY');await page.locator('#refit-hull-search').waitFor();console.log('DESIGN READY');
 if(process.argv.includes('--ballistics-only')) {
  await checkExtensionBallisticsBrowser(page,out);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 } else if(process.argv.includes('--armory-retirement-only')) {
  await checkRetiredAdunArmoryBrowser(page,out);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 } else if(process.argv.includes('--retirement-only')) {
  await checkAdunRetirement(page,out);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 } else {
 await page.evaluate(async()=>{const m=await import('/src/studio/DesignModel.ts'),p=await import('/src/studio/SpearOfAdunLoadouts.ts');const d=p.createAdunDesign();localStorage.setItem(m.storageKey,JSON.stringify({version:1,draft:d,designs:[]}));});
 console.log('SEED READY');await page.reload();await page.locator('.studio-ark-layer').first().waitFor({state:'attached'});await page.waitForFunction(()=>[...document.querySelectorAll('.studio-ark-layer,.studio-weapon-image,.studio-installation-image,.studio-installation-foreground')].every(e=>e.complete&&e.naturalWidth>0));
 if(process.argv.includes('--hud-only')) {
  await checkCombatHudSpeed(page,out);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log('PASS HUD identity removed / live speed / responsive layout / module and recall controls');
 } else {
 await page.waitForFunction(()=>document.querySelector('.studio-ark-animation')?.dataset.animationState==='playing');
 const samplePreview=()=>page.evaluate(()=>{const c=document.querySelector('.studio-ark-animation'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261;for(let i=0;i<pixels.length;i+=4)hash=Math.imul(hash^pixels[i]^pixels[i+1]^pixels[i+2]^pixels[i+3],16777619);return {frame:Number(c.dataset.frame),hash,heads:[...document.querySelectorAll('[data-weapon-art-slot]')].map(e=>({slot:e.dataset.weaponArtSlot,rect:e.getBoundingClientRect().toJSON()}))};});
 assert.deepEqual(await page.locator('.studio-ark-animation').evaluate(c=>[c.width,c.height]),[768,1536]);const firstPreview=await samplePreview();await page.waitForFunction(frame=>(Number(document.querySelector('.studio-ark-animation')?.dataset.frame)-frame+96)%96>=8,firstPreview.frame);const nextPreview=await samplePreview();assert.notEqual(firstPreview.hash,nextPreview.hash);assert.deepEqual(firstPreview.heads,nextPreview.heads);steps.push('refit baked pixels animate while all 12 installed weapon heads stay anchored');
 assert.equal(await page.locator('[data-installation-slot]').count(),12);const fixtureUrls=await page.locator('[data-installation-slot]').evaluateAll(els=>els.map(el=>el.getAttribute('src')));assert.equal(new Set(fixtureUrls).size,12);assert(fixtureUrls.every(url=>url.endsWith('-seat-baked-v16.png')));assert(await page.locator('[data-installation-foreground-slot]').evaluateAll(els=>els.every(el=>el.getAttribute('src').endsWith('-lip-baked-v16.png'))));assert.equal(await page.locator('[data-weapon-art-slot]').count(),12);await page.screenshot({path:resolve(out,'refit.png')});steps.push('real refit with 12 seated rotating heads and hull-native XL');

 if(process.argv.includes('--system-surfaces')) {
  assert((await page.getByRole('region',{name:'已安装舰体插件'}).innerText()).includes('方舟 · 太阳能核心'));
  await page.getByRole('button',{name:'安装舰船插件',exact:false}).click();
  await page.getByRole('searchbox',{name:'搜索舰船插件'}).fill('方舟');
  const matrix=page.locator('button[data-inspect-mod="web_ark_fast_matrix"]'),coupler=page.locator('button[data-inspect-mod="web_ark_corona_coupler"]');
  assert.equal(await matrix.getAttribute('aria-pressed'),'true');assert.equal(await coupler.getAttribute('aria-disabled'),'true');
  await matrix.click();await coupler.click();assert.equal(await coupler.getAttribute('aria-pressed'),'true');assert.equal(await matrix.getAttribute('aria-disabled'),'true');
  await page.screenshot({path:resolve(out,'plugins-v19.png')});await coupler.click();await matrix.click();
  await page.locator('.refit-hullmods button[aria-controls="refit-mod-picker"]').click();
  steps.push('dedicated built-in reactor visible; OP-bearing plugins can install/uninstall with live mutual-exclusion checks');
 }
 await page.getByRole('button',{name:/改装模块 FORE/}).click();await page.locator('.studio-mount[data-slot-id="FORE_PROJECTOR"]').waitFor();
 const selectedFrame=await page.locator('.studio-ark-animation').getAttribute('data-frame');await page.waitForFunction(frame=>(Number(document.querySelector('.studio-ark-animation')?.dataset.frame)-Number(frame)+96)%96>=8,selectedFrame);assert.equal(await page.locator('.studio-ship').getAttribute('data-active-module-path'),'["FORE"]');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const pausedFrame=await page.locator('.studio-ark-animation').getAttribute('data-frame');await page.waitForTimeout(350);assert.equal(await page.locator('.studio-ark-animation').getAttribute('data-frame'),pausedFrame);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(frame=>document.querySelector('.studio-ark-animation')?.dataset.frame!==frame,pausedFrame);steps.push('module selection survives animation, and visibility events pause/resume its clock');
 await page.locator('.studio-mount[data-slot-id="FORE_PROJECTOR"]').hover();await page.locator('.source-weapon-primary img[src*="solar-lance-detail-v12"]').waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('.source-weapon-primary img')].every(im=>im.complete&&im.naturalWidth>0));await page.screenshot({path:resolve(out,'solar-lance-details.png')});await page.mouse.move(10,10);steps.push('solar lance weapon detail displays the real animated mechanism portrait');
 assert.equal(await page.locator('.studio-mount').count(),5);await page.screenshot({path:resolve(out,'fore-refit.png')});steps.push('FORE click exposes built-in XL plus four removable S/M slots');
 await page.getByRole('button',{name:/改装模块 PORT/}).click();await page.screenshot({path:resolve(out,'wing-refit.png')});steps.push('side module refit exposes aviation decks');console.log('REFIT VERIFIED');
 await page.mouse.move(10,10);await page.keyboard.press('Escape');await page.keyboard.press('n');await page.waitForFunction(()=>document.querySelector('canvas')&&!document.body.innerText.includes('准备模拟战斗...'),{},{timeout:120000});
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');await page.waitForFunction(()=>window.__combatSession?.renderView?.playerShip?.spec?.sourceHullId==='web_spear_of_adun_ark');
 assert.equal(await page.locator('.studio-ark-animation').count(),0);
 const live=await page.evaluate(()=>{const e=window.__combatSession.renderView,s=e.playerShip;return {systems:s.allSystems.map(x=>({id:x.type})),parts:e.ships.filter(p=>p.isAttachedModule&&p.id.startsWith(s.id+':module:')).map(p=>({id:p.id,fireControl:p.fireControlMode,weapons:p.weapons.length})),wings:e.playerWings.length};});console.log('LIVE',JSON.stringify(live));assert.equal(live.parts.length,4);assert.equal(live.wings,4);assert.equal(live.parts[0].fireControl,'MANUAL');
 await page.locator('.hud-weapon-entry[data-weapon-id="web_ark_solar_lance"] img[src*="solar-lance-detail-v12"]').waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('.hud-weapon-entry img')].every(im=>im.complete&&im.naturalWidth>0));steps.push('HUD spec projection retains the same baked solar-lance detail icon');
 await page.evaluate(async()=>{const session=window.__combatSession;session.pause();await session.barrier();const advance=session.fixedUpdateControlled.bind(session);session.fixedUpdateControlled=()=>false;const renderer=window.__combatRenderer,art=await import('/src/engine/visual/AdunArkArt.ts');const layers=new Set(art.arkArtTextures.map(u=>renderer.textures.getTexture(u)));window.__arkLayerTextures=new Set();const draw=renderer.batcher.drawSprite.bind(renderer.batcher);renderer.batcher.drawSprite=(...args)=>{if(layers.has(args[0]))window.__arkLayerTextures.add(args[0]);return draw(...args);};window.__arkAdvance=async(frames,fire=false,thrust=false)=>{session.start();for(let i=0;i<frames;i++){const s=session.renderView.playerShip;await advance(1/60,{autopilot:false,blocked:false,keys:thrust?{KeyW:true}:{},aim:[s.pos.x+Math.cos(s.facingRad)*2200,s.pos.y+Math.sin(s.facingRad)*2200],firing:fire,mouseSteering:false,pointerActive:true});}session.pause();await session.barrier();};});
 // Isolated headless review: same stern camera at idle and under real authority thrust.
 const fieldState=()=>page.evaluate(async()=>{const m=await import('/src/engine/visual/ArkNativeField.ts');const s=window.__combatSession.renderView.playerShip;const aft=window.__combatSession.renderView.ships.find(p=>p.id.startsWith(s.id+':module:')&&p.spec.sourceHullId==='web_spear_of_adun_ark_aft');return {levels:aft.engineStatuses.map(s=>s.currentThrust),intensity:m.arkFieldIntensity(aft.engineStatuses,1)};});
 const hideHUD=()=>page.evaluate(()=>{const canvas=document.querySelector('canvas');const hidden=[];let node=canvas;while(node?.parentElement){for(const sibling of node.parentElement.children)if(sibling!==node&&sibling instanceof HTMLElement){hidden.push([sibling,sibling.style.visibility]);sibling.style.visibility='hidden';}node=node.parentElement;}window.__driveRestore=()=>hidden.forEach(([el,value])=>el.style.visibility=value);});
 const sternCamera=()=>page.evaluate(async()=>{const {Vector2}=await import('/src/engine/math/Vector2.ts');const session=window.__combatSession;window.__driveRender=session.render;const normal=session.render.bind(session);session.render=(alpha,_cam,_zoom)=>{const s=session.renderView.playerShip;normal(alpha,new Vector2(s.pos.x-700*Math.cos(s.facingRad),s.pos.y-700*Math.sin(s.facingRad)),1.2);};});
 const restore=()=>page.evaluate(()=>{window.__combatSession.render=window.__driveRender;window.__driveRestore();});
 await page.evaluate(()=>window.__arkAdvance(90));await page.screenshot({path:resolve(out,'exhaust-idle.png')});const fieldIdle=await fieldState();assert(fieldIdle.intensity<.01);await hideHUD();await sternCamera();await page.waitForTimeout(120);await page.screenshot({path:resolve(out,'field-stern-idle.png')});await restore();
 await page.evaluate(()=>window.__arkAdvance(120,false,true));await page.screenshot({path:resolve(out,'combat.png')});const fieldThrust=await fieldState();assert(fieldThrust.intensity>fieldIdle.intensity+.2);await hideHUD();await page.screenshot({path:resolve(out,'drive-overview.png')});await sternCamera();await page.waitForTimeout(120);await page.screenshot({path:resolve(out,'drive-stern.png')});await restore();
 console.log('NATIVE FIELD',JSON.stringify({fieldIdle,fieldThrust}));steps.push('native field responds to real Worker thrust without mother-ship exhaust');
 steps.push('real authority Worker running, 4 decks and module fire selection intact');
 let solar=null;
 if(!process.argv.includes('--fit-only')) {
 // Capture the actual Worker-driven cannon, not the offline authoring preview.
 const playback=resolve(out,'lance-playback');await mkdir(playback,{recursive:true});await hideHUD();
 await page.evaluate(async()=>{const {Vector2}=await import('/src/engine/math/Vector2.ts');const session=window.__combatSession;window.__driveRender=session.render;const normal=session.render.bind(session);session.render=(alpha,_cam,_zoom)=>{const s=session.renderView.playerShip;normal(alpha,new Vector2(s.pos.x+500*Math.cos(s.facingRad),s.pos.y+500*Math.sin(s.facingRad)),1.8);};});
 const lanceStates=[];
 await page.evaluate(async()=>{
  const fx=await import('/src/engine/visual/ArkWeaponFX.ts'),renderer=window.__combatRenderer;
  const lookup=new Map(fx.arkWeaponFxTextures.map(u=>[renderer.textures.getTexture(u),u.split('/').pop()]));
  const draw=renderer.batcher.drawSprite.bind(renderer.batcher),session=window.__combatSession,render=session.render.bind(session);
  window.__arkFxDraws=[];
  renderer.batcher.drawSprite=(...args)=>{const file=lookup.get(args[0]);if(file)window.__arkFxDraws.push({file,x:args[1],y:args[2],angle:args[5],alpha:args[11]});return draw(...args);};
  session.render=(...args)=>{window.__arkFxDraws=[];return render(...args);};
 });
 for(let i=0;i<=40;i++){
  if(i)await page.evaluate(()=>window.__arkAdvance(4,true,true));await page.waitForTimeout(45);
  const state=await page.evaluate(async()=>{const m=await import('/src/engine/visual/ArkLanceMotion.ts'),session=window.__combatSession,r=session.renderView.playerShip;const f=session.renderView.ships.find(s=>s.id.startsWith(r.id+':module:')&&s.spec.sourceHullId==='web_spear_of_adun_ark_fore');const w=f.weapons.find(w=>w.spec.id==='web_ark_solar_lance');return {pose:m.arkLancePose(w),glow:w.glowAlpha,recoil:w.recoil,refire:w.spec.refireDelay,projectiles:session.renderView.projectiles.filter(p=>p.specId==='web_ark_solar_lance').length};});
  state.fx=await page.evaluate(()=>window.__arkFxDraws);lanceStates.push(state);await page.screenshot({path:resolve(playback,String(i).padStart(3,'0')+'.png'),clip:{x:400,y:0,width:640,height:1000}});
 }
 await restore();assert.equal(lanceStates[0].pose,0);assert(lanceStates.every(s=>s.refire===5));assert(lanceStates.some(s=>s.pose>=24&&s.recoil===0));assert(lanceStates.some(s=>s.recoil>.9&&s.projectiles>0));assert(lanceStates.some(s=>s.pose>=34));assert.equal(lanceStates.at(-1).pose,0);
 assert(lanceStates.some(s=>s.fx.some(d=>d.file.startsWith('charge-'))));
 assert(lanceStates.some(s=>s.fx.some(d=>d.file.startsWith('muzzle-'))));
 assert(lanceStates.some(s=>s.fx.some(d=>d.file.startsWith('packet-'))));
 steps.push('new registered charge / attached muzzle / flight packet really draw in authority playback');
 await writeFile(resolve(playback,'states.json'),JSON.stringify(lanceStates,null,2));steps.push('actual Worker solar lance opens, charges, fires one projectile and closes; 41 real screenshot frames');
 await page.keyboard.press('f');await page.evaluate(()=>window.__arkAdvance(70,true,true));solar=await page.evaluate(()=>window.__combatSession.renderView.playerShip.allSystems.map(s=>({state:s.state,level:s.effectLevel})));console.log('SOLAR',JSON.stringify(solar));assert((await page.locator('body').innerText()).includes('太阳能 60/100'));assert.equal(solar[0].state,'ACTIVE');await page.screenshot({path:resolve(out,'forge-and-charge.png')});
 await page.evaluate(()=>window.__arkAdvance(330,true,true));assert(!(await page.locator('body').innerText()).includes('零载荷加速'));await page.screenshot({path:resolve(out,'firing.png')});steps.push('F activates resource-backed forge and manual XL runs inside real Worker');assert((await page.evaluate(()=>window.__arkLayerTextures.size))>12);
 await page.evaluate(()=>window.__arkAdvance(440));
 const systemDir=resolve(out,'systems-v18');await mkdir(systemDir,{recursive:true});await hideHUD();
 await page.evaluate(async()=>{const session=window.__combatSession,{Vector2}=await import('/src/engine/math/Vector2.ts');window.__driveRender=session.render;const normal=session.render.bind(session);session.render=(alpha)=>{const r=session.renderView.playerShip;normal(alpha,new Vector2(r.pos.x,r.pos.y),.4);};});
 const systemStates=[];
 const shot=async(name)=>{await page.waitForTimeout(60);const state=await page.evaluate(async()=>{const r=window.__combatSession.renderView.playerShip,m=await import('/src/engine/visual/ArkSystemFX.ts');return {time:window.__combatSession.renderView.combatTime,arc:r.shield.renderArcRad,alpha:r.shield.visualAlpha,deployed:r.shield.isVisuallyDeployed,barrier:m.arkBarrierLevel(r),core:m.arkSystemEmission(r,'CORE'),membrane:m.sampleArkMembrane(window.__combatSession.renderView.combatTime)};});systemStates.push({name,...state});await page.screenshot({path:resolve(systemDir,name+'.png')});return state;};
 assert.equal((await shot('00-off')).deployed,false);
 await page.mouse.click(1100,450,{button:'right'});await page.evaluate(()=>window.__arkAdvance(6));await shot('01-opening');
 await page.evaluate(()=>window.__arkAdvance(24));await shot('02-raised');
 await page.keyboard.press('g');await page.evaluate(()=>window.__arkAdvance(8));await shot('03-overcharge-in');
 await page.evaluate(()=>window.__arkAdvance(22));assert.equal(await page.evaluate(()=>window.__combatSession.renderView.playerShip.allSystems[1].state),'ACTIVE');await shot('04-overcharge');await page.screenshot({path:resolve(out,'barrier.png')});
 await page.evaluate(()=>window.__arkAdvance(25));await shot('05-surface-flow');
 await page.evaluate(()=>window.__arkAdvance(440));await shot('06-overcharge-ended');
 await page.mouse.click(1100,450,{button:'right'});await page.evaluate(()=>window.__arkAdvance(4));await shot('07-closing');
 await page.evaluate(()=>window.__arkAdvance(55));assert.equal((await shot('08-off')).deployed,false);
 await writeFile(resolve(systemDir,'states.json'),JSON.stringify(systemStates,null,2));await restore();
 steps.push('real Worker shield open / overcharge IN / active flowing membrane / release / close, collision geometry unchanged');
 await page.evaluate(()=>window.__arkAdvance(150));await page.screenshot({path:resolve(out,'exhaust-coast.png')});steps.push('native hull field and preserved escort plumes at idle, thrust and coast, with no missing textures');
 }
 if(process.argv.includes('--skill-worker')) {
  const dir=resolve(out,'skill-worker-v19');await mkdir(dir,{recursive:true});const states=[];
  await hideHUD();await page.evaluate(async()=>{const {Vector2}=await import('/src/engine/math/Vector2.ts'),session=window.__combatSession;window.__driveRender=session.render;const normal=session.render.bind(session);session.render=(alpha)=>{const r=session.renderView.playerShip;normal(alpha,new Vector2(r.pos.x,r.pos.y),.4);};});
  const capture=async(name,index)=>{await page.waitForFunction(i=>window.__combatSession.renderView.playerShip.allSystems[i].state==='ACTIVE'&&window.__combatRenderer.shipPass.arkMaterialDrawCalls>0,index);const state=await page.evaluate(async()=>{const s=window.__combatSession,r=s.renderView.playerShip,{arkSystemEmission}=await import('/src/engine/visual/ArkSystemFX.ts');return {time:s.renderView.combatTime,systems:r.allSystems.map(x=>({state:x.state,level:x.effectLevel})),hullMods:r.spec.hullMods,arc:r.shield.renderArcRad,drawCalls:window.__combatRenderer.shipPass.arkMaterialDrawCalls,material:arkSystemEmission(r,'CORE',r)};});states.push({name,...state});await page.screenshot({path:resolve(dir,name+'.png')});};
  await page.keyboard.press('f');await page.evaluate(()=>window.__arkAdvance(60));await capture('forge',0);
  const clip=resolve(dir,'forge-motion');await mkdir(clip,{recursive:true});
  for(let i=0;i<18;i++){await page.evaluate(()=>window.__arkAdvance(8));await page.waitForTimeout(35);await page.screenshot({path:resolve(clip,String(i).padStart(2,'0')+'.png')});}
  await page.evaluate(()=>window.__arkAdvance(500));
  await page.mouse.click(1100,450,{button:'right'});await page.evaluate(()=>window.__arkAdvance(190));
  await page.keyboard.press('g');await page.evaluate(()=>window.__arkAdvance(30));await capture('barrier',1);assert(states[1].arc>=Math.PI*2);
  await writeFile(resolve(dir,'report.json'),JSON.stringify({mode:'actual authority Worker; real F/G inputs and real elapsed shield unfold',states},null,2));await restore();
  steps.push('actual Worker F/G render painted skill materials; default fast matrix really unfolds protection in 3 seconds');
 }
 if(process.argv.includes('--system-surfaces')) { await hideHUD(); steps.push(await checkArkSystemSurfaces(page,out)); await page.evaluate(()=>window.__driveRestore()); }
 if(process.argv.includes('--aircraft')) { await hideHUD(); steps.push(await checkArkAircraft(page,out)); await page.evaluate(()=>window.__driveRestore()); }
 if(process.argv.includes('--damage')) { await hideHUD(); steps.push(await checkArkDamage(page,out)); await page.evaluate(()=>window.__driveRestore()); }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);await writeFile(resolve(out,'browser.json'),JSON.stringify({steps,live,solar,fieldIdle,fieldThrust,errors,missing},null,2));console.log('PASS '+steps.join(' / '));
 }
 }
}catch(e){if(page){await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});console.log('PAGE',await page.locator('body').innerText().catch(()=>''));}console.error('ERRORS',errors,'MISSING',missing);throw e;}finally{await browser?.close();await server.close();}
