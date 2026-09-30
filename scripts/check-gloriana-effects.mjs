/** Isolated real-app WebGL/Worker check. Never touches the user's browser or desktop. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const out=resolve('artifacts/gloriana/effects');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false,watch:null}});await server.listen();await server.watcher.close();
let browser,page;const errors=[],states={};
try {
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl|compile/i.test(m.text()))errors.push(m.text());});
 async function launch(inline=false){
  await page.goto(server.resolvedUrls.local[0]+'?view=design'+(inline?'&combat=inline':''));
  await page.locator('#refit-hull-search').fill('荣光');await page.locator('button[data-hull-id="web_gloriana"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-void-shield-refit]')?.textContent.includes('96000'));
  await page.getByRole('button',{name:/模拟战斗/}).click();
  await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
  await page.waitForFunction(()=>document.querySelector('[data-void-shield]')?.textContent.includes('96000 / 96000'));
  await page.evaluate(()=>{
   const renderer=window.__combatRenderer,render=renderer.render.bind(renderer);
   renderer.render=(view,alpha,camera,zoom,frame)=>{const p=view.playerShip;const c=p.pos.clone();c.x-=560;c.y+=110;return render(view,1,c,.43,frame);};
  });
 }
 async function capture(name){
  await page.waitForTimeout(180);
  states[name]=await page.evaluate(()=>{const s=window.__combatReadView.playerShip.shield.voidShield;return {...s,glError:window.__combatRenderer.gl.getError()};});
  assert.equal(states[name].glError,0,name+' WebGL error');
  await page.screenshot({path:resolve(out,name+'.png'),animations:'disabled'});
 }
 await launch();
 assert(await page.evaluate(()=>!!window.__combatSession.workerHost),'expected actual worker authority');
 await capture('worker-online');
 assert(await page.evaluate(()=>!!window.__combatRenderer.shieldShader.voidShader),'custom GPU shader did not run in worker presentation');
 await page.mouse.click(1200,200,{button:'right'});await page.waitForFunction(()=>document.querySelector('[data-void-shield]')?.textContent.includes('手动关闭'));
 await capture('worker-shutdown');assert(states['worker-shutdown'].visualShutdownRemaining>0);
 await page.mouse.click(1200,200,{button:'right'});await page.waitForFunction(()=>window.__combatReadView.playerShip.shield.voidShield.visualRestartRemaining>0);
 states.workerReactivation=await page.evaluate(()=>({...window.__combatReadView.playerShip.shield.voidShield}));
 await launch(true);
 await page.evaluate(()=>{
  const session=window.__combatSession,e=window.__combatEngine;session.pause();
  e.asteroids.length=0;e.nebulae.length=0;
  for(const ship of e.ships)for(const weapon of ship.weapons)weapon.isDisabled=true;
  for(const ship of e.playerShip.assemblyShips)ship.engineController.restore();
  e.playerShip.shield.update(2,e.playerShip.facingRad,0);
 });
 await capture('idle');
 await page.evaluate(()=>{const s=window.__combatEngine.playerShip.shield;s.setActive(false);s.update(.08,0,0);});
 await capture('shutdown-early');
 await page.evaluate(()=>window.__combatEngine.playerShip.shield.update(.17,0,0));
 await capture('shutdown');assert(states.shutdown.visualShutdownRemaining>0);assert(!states.shutdown.armed);
 await page.evaluate(()=>window.__combatEngine.playerShip.shield.update(.43,0,0));
 await capture('shutdown-late');
 await page.evaluate(()=>window.__combatEngine.playerShip.shield.update(.3,0,0));
 await capture('offline');assert.equal(states.offline.visualShutdownRemaining,0);
 await page.evaluate(()=>{const s=window.__combatEngine.playerShip.shield;s.setActive(true);s.update(.15,0,0);});
 await capture('startup-charge');
 await page.evaluate(()=>{
  const p=window.__combatEngine.playerShip;window.__effectsOriginalFacing=p.facingRad;p.facingRad+=.4;p.prevFacingRad=p.facingRad;p.syncModuleTree(true);
 });
 await capture('startup-turned');
 const orientation=await page.evaluate(()=>{
  const p=window.__combatEngine.playerShip,fx=window.__combatRenderer.shieldShader.voidShader,gl=window.__combatRenderer.gl;
  return {expected:[Math.cos(p.facingRad),Math.sin(p.facingRad)],actual:Array.from(gl.getUniform(fx.program,fx.uniforms.u_facing))};
 });
 assert(orientation.actual.every((v,i)=>Math.abs(v-orientation.expected[i])<1e-6),'field generators not hull-oriented');
 states.orientation=orientation;
 await page.evaluate(()=>{const p=window.__combatEngine.playerShip;p.facingRad=window.__effectsOriginalFacing;p.prevFacingRad=p.facingRad;p.syncModuleTree(true);p.shield.update(.4,0,0);});
 await capture('startup');assert(states.startup.visualRestartRemaining>0);assert.equal(states.startup.integrity,96000);
 await page.evaluate(()=>window.__combatEngine.playerShip.shield.update(.43,0,0));
 await capture('startup-settle');
 await page.evaluate(()=>window.__combatEngine.playerShip.shield.update(2,0,0));
 await page.evaluate(()=>{const s=window.__combatEngine.playerShip.shield;s.absorbImpact(6500,'ENERGY',-.65);s.update(.15,0,0);});
 await capture('impact');assert(states.impact.visualHitRemaining>0);assert.equal(states.impact.integrity,89500);
 await page.evaluate(()=>{const s=window.__combatEngine.playerShip.shield;s.absorbImpact(25000,'ENERGY',-.65);s.update(.2,0,0);});
 await capture('layer-break');assert(states['layer-break'].visualBreakRemaining>0);assert.equal(states['layer-break'].breaks,1);
 await page.evaluate(()=>{const s=window.__combatEngine.playerShip.shield;s.absorbImpact(1e6,'ENERGY',-.65);s.update(.15,0,0);});
 await capture('collapse');assert(states.collapse.visualCollapse);assert.equal(states.collapse.integrity,0);
 await page.evaluate(()=>window.__combatEngine.playerShip.shield.update(10.85,0,0));
 await capture('rebuilding');assert.equal(states.rebuilding.rebuild,12000);
 await page.evaluate(()=>window.__combatEngine.playerShip.shield.update(3.8,0,0));
 await capture('restart');assert(states.restart.visualRestartRemaining>0);assert(states.restart.integrity>=24000);
 const frozen=states.restart.visualRestartRemaining;
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__combatEngine.playerShip.shield.voidShield.visualRestartRemaining),frozen,'paused FX advanced');
 await page.evaluate(()=>{const e=window.__combatEngine,p=e.playerShip;for(let i=0;i<90;i++){p.throttle=1;e.fixedUpdate(1/60);}p.prevPos.copy(p.pos);for(const c of p.childModules)c.prevPos.copy(c.pos);});
 await capture('thrust');
 states.thrustEngines=await page.evaluate(()=>window.__combatEngine.playerShip.childModules.filter(c=>c.spec.inheritParentEngineCommands).map(c=>c.engineStatuses.map(e=>e.currentThrust)));
 assert(states.thrustEngines.flat().every(t=>t>.95),'engines did not inherit root thrust');
 await page.evaluate(()=>{const e=window.__combatEngine,p=e.playerShip;for(const c of p.childModules.filter(c=>c.spec.inheritParentEngineCommands)){for(let i=0;i<c.engineStatuses.length;i++)c.engineController.disable(i,{extendedGlow:false,systemActive:false},true);}for(let i=0;i<120;i++){p.throttle=1;e.fixedUpdate(1/60);}});
 await capture('engines-disabled');
 assert(await page.evaluate(()=>window.__combatEngine.playerShip.childModules.filter(c=>c.spec.inheritParentEngineCommands).every(c=>c.engineStatuses.every(e=>e.currentThrust===0))));
 states.alliedCover=await page.evaluate(async()=>{
  const {ProjectileExplosionSystem}=await import('/src/engine/simulation/systems/weapon/ProjectileExplosionSystem.ts');
  const {ShipCollisionSystem}=await import('/src/engine/simulation/systems/ShipCollisionSystem.ts');
  const e=window.__combatEngine,p=e.playerShip;
  for(const c of p.assemblyShips)c.engineController.restore();
  p.shield.configureVoidShield(p.spec.voidShield);p.shield.update(2,p.facingRad,p.facingRad);
  const inside=e.addShip('lasher',true,p.pos.clone().add({x:550,y:0}),0,p.teamId);
  const outside=e.addShip('lasher',true,p.pos.clone().add({x:970,y:130}),0,p.teamId);
  for(const s of [inside,outside]){s.shield.setActive(false);s.shield.update(1,0,0);for(const w of s.weapons)w.isDisabled=true;}
  const condition=s=>({armor:Array.from(s.armor.copyCells()).reduce((a,b)=>a+b,0),hp:s.hullHp,flux:s.flux.totalFlux});
  const before=condition(inside),outsideBefore=condition(outside),pos=inside.pos.clone();
  new ShipCollisionSystem().resolveShipToShipCollision(p,inside,{addFloatingDamage(){},spawnArmorDamageSparks(){},spawnDebris(){},addCameraShake(){},getPlayerPos:()=>p.pos},1/60);
  const origin=p.pos.clone().add({x:850,y:0});
  const shot={id:987654,sourceShipId:e.enemyShip.id,isPlayer:false,teamId:e.enemyShip.teamId,specId:'plasma',damage:1000,baseDamage:1000,empDamage:0,damageType:'ENERGY',pos:origin.clone(),prevPos:origin.clone(),vel:origin.clone().scale(0),radius:5,rangeRemaining:2000,totalRange:2000,elapsedTime:0,color:[140,140,255],spawnType:'PLASMA',projectileExplosionSpec:{radius:600,coreRadius:600,duration:.2,collisionClass:'PROJECTILE_NO_FF',particleCount:0,particleSizeMin:1,particleSizeRange:0,particleDuration:0,particleColor:[0,0,0,0]}};
  new ProjectileExplosionSystem().spawn(shot,origin,e.getWeaponSimContext());p.shield.update(.12,p.facingRad,p.facingRad);
  await window.__combatRenderer.prepareAssets(window.__combatSession.renderView);
  return {before,after:condition(inside),outsideBefore,outsideAfter:condition(outside),movement:inside.pos.distanceTo(pos),shield:p.shield.voidShield.integrity};
 });
 assert.deepEqual(states.alliedCover.after,states.alliedCover.before);
 assert.notDeepEqual(states.alliedCover.outsideAfter,states.alliedCover.outsideBefore);
 assert.equal(states.alliedCover.movement,0);assert.equal(states.alliedCover.shield,95000);
 await capture('friendly-cover');
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'verification.json'),JSON.stringify({passed:true,workerShader:true,workerReactivation:true,workerShutdown:true,manualStartupShutdown:true,fixedRadiusField:true,alliedCover:true,hullOrientedGenerators:true,pausedFx:true,states,errors},null,2)+'\n');
 console.log('PASS real WebGL/Worker: 96000 shield, online/hit/layer-break/collapse/rebuild/restart, paused envelopes, enlarged thrust and disabled-engine fade.');
} catch(e) {if(page)await page.screenshot({path:resolve(out,'failure.png')});console.error(errors);throw e;}
finally {await browser?.close();await server.close();}
