import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

/** Focused continuation of the actual Ark refit -> Worker browser scenario. */
export async function checkCombatHudSpeed(page, out) {
 await page.keyboard.press('n');
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();
 await page.keyboard.press('Tab');
 await page.waitForFunction(()=>window.__combatReadView?.playerShip?.spec?.sourceHullId==='web_spear_of_adun_ark');
 await page.locator('.hud-ship-speed').waitFor();
 await page.evaluate(async()=>{
  const s=window.__combatSession;s.pause();await s.barrier();
  const advance=s.fixedUpdateControlled.bind(s);s.fixedUpdateControlled=()=>false;
  window.__hudAdvance=async(frames,thrust)=>{
   s.start();for(let i=0;i<frames;i++)await advance(1/60,{autopilot:false,blocked:false,keys:thrust?{KeyW:true}:{},aim:[0,-2000],firing:false,mouseSteering:false,pointerActive:false});
   s.pause();await s.barrier();
  };
 });
 const readSpeed=async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-speed-value]')?.textContent===window.__combatReadView.playerShip.vel.length().toFixed(1));
  return page.evaluate(()=>({shown:document.querySelector('[data-speed-value]').textContent,actual:window.__combatReadView.playerShip.vel.length()}));
 };
 const idle=await readSpeed();
 await page.evaluate(()=>window.__hudAdvance(90,true));const moving=await readSpeed();
 assert(moving.actual>idle.actual+1,'real authority thrust changes the readout');
 assert.equal(moving.shown,moving.actual.toFixed(1));
 const portrait=page.locator('canvas[aria-label="本舰装甲状况"]');
 await portrait.focus();await page.keyboard.press('Home');
 await page.waitForFunction(()=>window.__combatReadView.weaponShip.id===window.__combatReadView.playerShip.id);
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>window.__combatReadView.weaponShip.id!==window.__combatReadView.playerShip.id);
 const moduleSpeed=await readSpeed();assert.equal(moduleSpeed.shown,moving.shown,'speed remains the root ship speed');
 await page.getByRole('button',{name:'召回本舰联队',exact:true}).click();
 await page.getByRole('button',{name:'本舰联队出击',exact:true}).waitFor();
 await page.getByRole('button',{name:'本舰联队出击',exact:true}).click();
 await page.getByRole('button',{name:'召回本舰联队',exact:true}).waitFor();
 const layouts=[];
 for(const [width,height] of [[1920,1080],[1280,900],[820,900],[560,900]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const layout=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),rect=s=>q(s).getBoundingClientRect().toJSON();
   return {viewport:[innerWidth,innerHeight],identity:q('.hud-ship-identity,.hud-compact-identity,.combat-paperdoll')!==null,
    columns:getComputedStyle(q('.combat-console')).gridTemplateColumns.split(' ').length,
    console:rect('.combat-console'),body:rect('.combat-console-body'),speed:rect('.hud-ship-speed'),
    hull:rect('[data-meter="hull"]'),systems:rect('.hud-system-list'),
    speedCount:document.querySelectorAll('.hud-ship-speed').length,overflow:q('.hud-ship-speed').scrollWidth>q('.hud-ship-speed').clientWidth};
  });
  assert.equal(layout.identity,false);assert.equal(layout.columns,2);assert.equal(layout.speedCount,1);assert.equal(layout.overflow,false);
  assert(layout.speed.top>=layout.hull.bottom&&layout.speed.bottom<=layout.systems.top+1,'speed is between hull and systems');
  assert(layout.speed.left>=0&&layout.speed.right<=width&&layout.speed.top>=0&&layout.speed.bottom<=height,'speed stays in viewport');
  assert(Math.abs(layout.body.left-layout.console.left)<1,'no empty identity gutter');
  layouts.push(layout);
  await page.locator('.combat-console').screenshot({path:resolve(out,`speed-hud-${width}.png`),animations:'disabled'});
  if(width===1920)await page.screenshot({path:resolve(out,'speed-hud-full.png'),animations:'disabled'});
 }
 const result={idle,moving,moduleSpeed,layouts,controls:['module keyboard selection','carrier recall toggle']};
 await writeFile(resolve(out,'speed-hud.json'),JSON.stringify(result,null,2));
 return result;
}
