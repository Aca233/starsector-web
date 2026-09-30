import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
/** Controlled production-engine scenario, not a live Worker battle capture.
 * Seed a fully unfolded shield so its real 64-second raise need not be faked.
 * The user session/save and collision/unfold rules are never mutated. */
export async function checkArkSystemSurfaces(page, out) {
 const dir=resolve(out,'system-surfaces-v19');await mkdir(dir,{recursive:true});
 const initial=await page.evaluate(async()=>{
  const {CombatEngine}=await import('/src/engine/simulation/CombatEngine.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const fx=await import('/src/engine/visual/ArkSystemFX.ts');
  const e=new CombatEngine(window.__combatSession.renderView.playerShip.spec.id,'web_sc2_hyperion',260928),r=e.playerShip;
  e.openBattlefield=true;e.asteroids.length=0;e.nebulae.length=0;e.enemyShip.pos.set(20000,20000);e.enemyShip.prevPos.copy(e.enemyShip.pos);
  r.pos.set(0,0);r.prevPos.copy(r.pos);r.facingRad=r.prevFacingRad=-Math.PI/2;r.syncModuleTree(true);
  r.shield.isActive=true;r.shield.currentArcDeg=360;r.shield.facingAngleRad=-Math.PI/2;
  r.systems[0].charges=100;
  const renderer=window.__combatRenderer,previous=renderer.render,view=combatRenderView(e);
  const scenario={e,r,revision:0,drawn:-1,step(n){for(let i=0;i<n;i++)e.fixedUpdate(1/60);this.revision++;},read(){return {time:e.combatTime,arc:r.shield.renderArcRad,alpha:r.shield.visualAlpha,barrier:fx.arkBarrierLevel(r),draws:renderer.shipPass.arkMaterialDrawCalls,core:fx.arkSystemEmission(r,'CORE',r),hp:r.childModules[0].hullHp,minimumContact:Math.min(...r.shield.hitSegmentLevels)};},restore(){renderer.render=previous;renderer.resetVisualState();}};
  window.__arkSystemScenario=scenario;
  renderer.render=(_view,_alpha,_camera,_zoom,frame)=>{const result=previous.call(renderer,view,1,r.pos,.4,{...frame,layers:new Set(['background','hull','shield'])});if(result)scenario.drawn=scenario.revision;return result;};
  return {mode:'controlled production engine; shield starts fully deployed; contact stimulus uses native recordVisualHit',unfoldSeconds:r.shield.unfoldDuration};
 });
 const states=[];
 const capture=async(name)=>{await page.waitForFunction(()=>window.__arkSystemScenario.drawn===window.__arkSystemScenario.revision);states.push({name,...await page.evaluate(()=>window.__arkSystemScenario.read())});await page.screenshot({path:resolve(dir,name+'.png')});};
 await capture('00-full-idle');
 await page.evaluate(()=>{const s=window.__arkSystemScenario;if(!s.r.systems[1].activate())throw Error('barrier activation failed');s.step(30);});await capture('01-full-barrier');
 await page.evaluate(()=>{const s=window.__arkSystemScenario;s.r.shield.recordVisualHit(2000,-Math.PI/4);s.revision++;});await capture('02-contact');
 await page.evaluate(()=>window.__arkSystemScenario.step(30));await capture('03-contact-recovery');
 await page.evaluate(()=>{const s=window.__arkSystemScenario;s.r.systems[1].deactivate();s.step(65);s.r.systems[0].charges=100;if(!s.r.systems[0].activate())throw Error('forge activation failed');s.step(60);});await capture('04-forge');
 await page.evaluate(()=>window.__arkSystemScenario.step(20));await capture('04-forge-flow');
 await page.evaluate(()=>{const s=window.__arkSystemScenario;s.r.systems[0].deactivate();s.step(65);s.r.systems[0].charges=100;s.r.childModules[0].hullHp-=5000;if(!s.r.systems[2].activate())throw Error('repair activation failed');s.step(60);});await capture('05-reconstruction');
 const repairHP=states.at(-1).hp;
 await page.evaluate(()=>window.__arkSystemScenario.step(90));await capture('06-reconstruction-advanced');assert(states.at(-1).hp>repairHP);
 await page.evaluate(()=>{const s=window.__arkSystemScenario;s.r.systems[2].deactivate();s.step(65);s.r.shield.toggle();s.step(6);});await capture('07-closing');
 await page.evaluate(()=>window.__arkSystemScenario.step(30));await capture('08-closed');
 assert(states.some(s=>s.core?.material==='forge'&&s.draws>0));assert(states.some(s=>s.core?.material==='repair'&&s.draws>0));assert.equal(states[1].barrier,1);assert.equal(states[2].minimumContact,0);assert(states[3].minimumContact>0);assert.equal(states.at(-1).alpha,0);
 await page.evaluate(()=>window.__arkSystemScenario.restore());
 await writeFile(resolve(dir,'report.json'),JSON.stringify({initial,states},null,2));
 return 'full deployed painted shield / native local contact / real F-H state and repair / native close: controlled engine scenario';
}
