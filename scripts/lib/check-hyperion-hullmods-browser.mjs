import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Uses only this script's isolated page/server, never the user's browser/profile or game port. */
export async function checkHyperionHullmodsUI(page,url,out) {
 const dir=resolve(out,'hullmods');await mkdir(dir,{recursive:true});const results=[];
 const focus='web_sc2_hyperion_yamato_focus',repair='web_sc2_hyperion_field_repair';
 for(const [fit,id] of [['雷诺旗舰 · 大和压制',focus],['雷诺旗舰 · 战地续航',repair]]) {
  await page.goto(url+'?view=design');
  await page.locator('#refit-hull-search').fill('休伯利安');await page.locator('button[data-hull-id="web_sc2_hyperion"]').click();
  await page.waitForFunction(()=>document.querySelector('button[data-hull-id="web_sc2_hyperion"]')?.getAttribute('aria-pressed')==='true');
  await page.mouse.move(1420,950);
  if(await page.locator('.dwell-popover[data-dwell-locked="true"]').count())await page.keyboard.press('Escape');
  assert((await page.locator('.refit-mod-row.builtin').allTextContents()).some(x=>x.includes('旗舰反应堆')&&x.includes('内置')));
  await page.getByRole('button',{name:/装配方案\.\.\./}).click();
  await page.getByRole('button',{name:'预览装配方案：'+fit,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/确认/}).click();
  await page.getByRole('button',{name:/安装舰船插件/}).click();
  await page.getByRole('searchbox',{name:'搜索舰船插件'}).fill('休伯利安');
  const selected=page.locator(`button[data-inspect-mod="${id}"]`),other=page.locator(`button[data-inspect-mod="${id===focus?repair:focus}"]`);
  assert.equal(await selected.getAttribute('aria-pressed'),'true');assert.equal(await other.getAttribute('aria-disabled'),'true');
  // Removing and reinstalling changes the real refit draft and clears/reapplies the conflict.
  await selected.click();assert.equal(await selected.getAttribute('aria-pressed'),'false');assert.equal(await other.getAttribute('aria-disabled'),'false');
  await selected.click();assert.equal(await selected.getAttribute('aria-pressed'),'true');assert.equal(await other.getAttribute('aria-disabled'),'true');
  await page.mouse.move(900,850);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#refit-mod-picker img,.refit-mod-row img')).every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:resolve(dir,id+'-refit.png'),animations:'disabled'});
  results.push({fit,phase:'refit',installed:id,mutualExclusion:true,uninstallReinstall:true});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/模拟战斗/}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('页面加载或运行失败')||(window.__combatSession&&document.querySelector('canvas')&&!document.body.innerText.includes('准备模拟战斗...')),{},{timeout:90000});
  assert(!(await page.locator('body').innerText()).includes('页面加载或运行失败'),await page.locator('body').innerText());
  await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
  await page.waitForFunction(()=>window.__combatReadView?.playerShip?.systems?.[0]?.passiveStatusText?.includes('反应堆'));
  assert(await page.evaluate(()=>window.__combatEngine===undefined),'expected actual Worker');
  if(id===focus){
   const command=await page.evaluate(async()=>{
    const session=window.__combatSession;session.pause();await session.barrier();
    const s=session.read.playerShip;const aim=[s.pos.x+Math.cos(s.facingRad)*1500,s.pos.y+Math.sin(s.facingRad)*1500];
    return session.dispatchControl({kind:'ship',command:{kind:'system',value:0},aim});
   });
   assert(command.accepted,JSON.stringify(command));
   await page.evaluate(()=>window.__combatSession.start());
   await page.waitForFunction(()=>window.__combatReadView.playerShip.systems[0].state==='COOLDOWN'&&window.__combatReadView.playerShip.systems[0].charges<65);
  } else {
   await page.waitForFunction(()=>window.__combatReadView.playerShip.systems[0].passiveStatusText.includes('抢修'));
  }
  await page.evaluate(async()=>{window.__combatSession.pause();await window.__combatSession.barrier();});
  const state=await page.evaluate(()=>{const s=window.__combatReadView.playerShip;return {hullMods:s.spec.hullMods,builtIn:s.spec.builtInHullMods,hp:s.hullHp,systems:s.systems.map(x=>({type:x.type,state:x.state,charges:x.charges,cooldown:x.cooldownTimer,status:x.passiveStatusText}))};});
  assert(state.builtIn.includes('web_sc2_hyperion_reactor'));assert(state.hullMods.includes(id));
  assert(state.systems[0].status.includes(id===focus?'大和45':'抢修'));
  if(id===focus){assert(state.systems[0].charges>=55&&state.systems[0].charges<65);assert(state.systems[0].cooldown<=14);}
  const paused=state.systems[0].charges;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>window.__combatReadView.playerShip.systems[0].charges),paused);
  await page.mouse.move(720,500);await page.screenshot({path:resolve(dir,id+'-worker.png'),animations:'disabled'});
  results.push({fit,phase:'worker',state,pauseVerified:true});
 }
 await writeFile(resolve(dir,'browser-check.json'),JSON.stringify({results,scope:'Real isolated Worker/refit. Repair damage/energy/caps verified separately in production engine scenarios; not a multiplayer/resumable-checkpoint test.'},null,2));
 console.log('PASS Hyperion hullmods: two legal UI fits, builtin display, exclusivity/uninstall, actual Worker consumption and repair status');
}
