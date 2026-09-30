import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Isolated headless Worker launch, then controlled production-engine/WebGL contact review. */
export async function checkExtensionBallisticsBrowser(page,out){
 const dir=resolve(out,'extension-ballistics');await mkdir(dir,{recursive:true});
 await page.evaluate(async()=>{const m=await import('/src/studio/DesignModel.ts'),p=await import('/src/studio/SpearOfAdunLoadouts.ts');localStorage.setItem(m.storageKey,JSON.stringify({version:1,draft:p.createAdunDesign(),designs:[]}));});
 await page.reload();await page.locator('.studio-ark-layer').first().waitFor({state:'attached'});
 await page.getByRole('button',{name:/模拟战斗/}).click();await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
 await page.waitForFunction(()=>window.__combatSession?.workerHost?.status==='ready'&&window.__combatRenderer,{},{timeout:120000});
 const worker=await page.evaluate(async()=>{
  const s=window.__combatSession;s.pause();await s.barrier();const h=s.workerHost;let result;
  for(let i=0;i<180;i++){
   const root=h.latest.presentation.view.playerShip;
   const f=await h.step({autopilot:false,blocked:false,keys:{},aim:[root.pos.x+Math.cos(root.facingRad)*6000,root.pos.y+Math.sin(root.facingRad)*6000],firing:true,mouseSteering:false,pointerActive:true});
   s.acceptWorkerFrame(h,f);
   const p=f.presentation.view.projectiles.find(p=>p.specId==='web_ark_solar_lance');
   if(p){result={specId:p.specId,totalRange:p.totalRange,fadeTime:p.fadeTime,sourceMoveSpeed:p.sourceMoveSpeed};break;}
  }
  return {status:h.status,shot:result};
 });
 assert.equal(worker.status,'ready');assert(worker.shot,'actual Worker must fire XL');assert.equal(worker.shot.totalRange,3800);assert.equal(worker.shot.fadeTime,.55);assert(worker.shot.sourceMoveSpeed>0);
 await page.evaluate(async()=>{
  const {CombatEngine}=await import('/src/engine/simulation/CombatEngine.ts'),{combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const {spawnSystemProjectile}=await import('/src/engine/extensions/ship-systems/SystemProjectile.ts'),{Vector2:V}=await import('/src/engine/math/Vector2.ts');
  const {collectCombatTextureUrls}=await import('/src/engine/assets/CombatAssetClosure.ts');
  const renderer=window.__combatRenderer,previous=renderer.render,overlay=renderer.tacticalOverlayPass.render;
  const e=new CombatEngine(window.__combatSession.renderView.playerShip.spec.id,'web_sc2_hyperion',260928),view=combatRenderView(e);
  e.fighterSystem.fighters.length=0;e.fighterSystem.bombers.length=0;e.asteroids.length=0;e.nebulae.length=0;e.playerShip.pos.set(-10000,0);e.playerShip.prevPos.copy(e.playerShip.pos);e.playerShip.syncModuleTree(true);e.enemyShip.pos.set(15000,0);e.enemyShip.prevPos.copy(e.enemyShip.pos);
  const trio=['web_gloriana_siege','web_sc2_hyperion_yamato_shot','web_ark_solar_lance'];
  const scenario={e,view,revision:0,drawn:-1,camera:new V(170,0),ids:trio,
   reset(mode){this.camera.set(mode==='penetration'?400:170,mode==='penetration'?210:0);e.projectiles.length=0;e.hitGlows.length=0;e.explosions.length=0;e.particles.length=0;e.debris.length=0;e.asteroids.length=0;e.combatTime=0;
    for(let i=0;i<trio.length;i++){
     if(mode==='penetration'&&i!==2)continue;
     const p=spawnSystemProjectile(e.playerShip,trio[i],new V(0,(i-1)*210),0,{projectiles:e.projectiles,combatRandom:e.random});
     if(mode==='fade')p.rangeRemaining=0;
     else e.asteroids.push({id:100+i,pos:new V(240,(i-1)*210),vel:new V(),facingRad:0,angularVel:0,radius:24,mass:100,hp:mode==='penetration'?350:100000,maxHp:100000,spriteUrl:'/game-assets/graphics/asteroids/asteroid1.png'});
    }this.revision++;
   },
   step(n){for(let i=0;i<n;i++){e.weaponSystem.updateProjectiles(1/120,e.getWeaponSimContext());e.fxSystem.update(1/120);e.combatTime+=1/120;}this.revision++;},
   read(){return {time:e.combatTime,projectiles:e.projectiles.map(p=>({id:p.specId,x:p.pos.x,y:p.pos.y,fade:p.fadeProgress,damage:p.damage,didDamage:p.didDamage})),glows:e.hitGlows.map(g=>({x:g.pos.x,y:g.pos.y,life:g.life,sprite:g.spriteUrl})),explosions:e.explosions.map(x=>({x:x.pos.x,y:x.pos.y,life:x.life,puffs:x.puffs?.length}))};},
   restore(){renderer.render=previous;renderer.tacticalOverlayPass.render=overlay;renderer.resetVisualState();}
  };
  scenario.reset('fade');await renderer.textures.preload(collectCombatTextureUrls(e));window.__extensionBallistics=scenario;
  renderer.tacticalOverlayPass.render=()=>{};
  renderer.render=(_view,_alpha,_camera,_zoom,frame)=>{const rendered=previous.call(renderer,view,1,scenario.camera,1.4,{...frame,visualTime:e.combatTime,layers:new Set(['background','hull','weapon','beam','explosion'])});if(rendered)scenario.drawn=scenario.revision;return rendered;};
  // Hide UI only in this disposable page; leave production canvas rendering intact.
  let node=document.querySelector('canvas');while(node?.parentElement){for(const sibling of node.parentElement.children)if(sibling!==node&&sibling instanceof HTMLElement)sibling.style.visibility='hidden';node=node.parentElement;}
 });
 const frames=[];
 const capture=async(name)=>{await page.waitForFunction(()=>window.__extensionBallistics.drawn===window.__extensionBallistics.revision);const state=await page.evaluate(()=>window.__extensionBallistics.read());frames.push({name,...state});await page.screenshot({path:resolve(dir,name+'.png')});return state;};
 await capture('01-range-edge');await page.evaluate(()=>window.__extensionBallistics.step(27));const half=await capture('02-range-fading');
 assert.equal(half.projectiles.length,3);assert(half.projectiles.every(p=>p.fade>0&&p.fade<1));
 await page.evaluate(()=>window.__extensionBallistics.step(60));const ended=await capture('03-range-ended');assert.equal(ended.projectiles.length,0);
 await page.evaluate(()=>{window.__extensionBallistics.reset('impact');window.__extensionBallistics.step(40);});const first=await capture('04-solid-contact');assert(first.glows.length>0);assert(first.explosions.some(x=>x.puffs>0));
 await page.evaluate(()=>window.__extensionBallistics.step(18));const later=await capture('05-contact-followthrough');assert(later.explosions.length>0);assert(later.glows.length>0);
 await page.evaluate(()=>window.__extensionBallistics.step(360));const clean=await capture('06-contact-ended');assert.equal(clean.glows.length,0);assert.equal(clean.explosions.length,0);
 await page.evaluate(()=>{window.__extensionBallistics.reset('penetration');window.__extensionBallistics.step(24);});const pierced=await capture('07-solar-through-rock');
 assert.equal(pierced.projectiles.length,1);assert(pierced.projectiles[0].x>300&&!pierced.projectiles[0].didDamage);assert(pierced.projectiles[0].damage<6800);assert(pierced.glows.length>0);
 await page.evaluate(()=>window.__extensionBallistics.step(12));await capture('08-solar-continues');
 await page.evaluate(()=>window.__extensionBallistics.restore());
 await writeFile(resolve(dir,'browser.json'),JSON.stringify({worker,scope:'Worker real XL launch; controlled authoritative engine + production WebGL fade/rock contacts, not natural combat',frames},null,2));
 console.log('PASS actual Worker XL range/lifecycle and 8 production WebGL fade/contact frames');
}
