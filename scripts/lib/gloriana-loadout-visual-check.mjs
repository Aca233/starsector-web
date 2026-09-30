import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Reuse the real refit + Worker; isolated headless profile, no player desktop or server. */
export async function runGlorianaLoadoutCheck(output=resolve('artifacts/gloriana/armory/loadouts-v2')){
 await mkdir(output,{recursive:true});
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
 const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true,open:false,watch:null}});
 const report={scope:'loadouts-v2 UI and real Worker',errors:[],failedAssets:[],variants:[]};let browser,page;
 try{
  await server.listen();await server.watcher.close();
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const role of ['arsenal','aviation']){
   page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(45000);
   page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.failedAssets.push({url:r.url(),status:r.status()});});
   await page.goto(server.resolvedUrls.local[0]+'?view=design');
   await page.locator('#refit-hull-search').fill('荣光');await page.locator('button[data-hull-id="web_gloriana"]').click();
   await page.getByRole('button',{name:/模拟战斗/}).waitFor({state:'visible'});
   const key=await page.evaluate(async()=>(await import('/src/studio/DesignModel.ts')).storageKey);
   await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)||'{}').draft?.hullId==='web_gloriana',key);
   const readDraft=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)).draft,key);
   const original=await readDraft();
   assert(!Object.values(original.weapons).includes('web_zhuyuan_star_needle'));
   const name=role==='arsenal'?'帝国军械 · 战列齐射 II':'帝国航空 · 盾矛协同 II';
   const select=async()=>{await page.mouse.move(1550,1050);await page.getByRole('button',{name:/装配方案/}).click();await page.getByRole('button',{name:'预览装配方案：'+name,exact:true}).click();};
   await select();
   assert.equal(await page.locator('.source-fit-budget').getAttribute('data-invalid'),'false');
   assert((await page.locator('.source-fit-budget').innerText()).includes('260 / 260'));
   await page.locator('.source-fit-notes summary').click();const warning=await page.locator('.source-fit-notes').innerText();
   assert(warning.includes(role==='arsenal'?'保留当前联队':'将联队替换'));
   await page.screenshot({path:resolve(output,role+'-preview.png'),animations:'disabled'});
   await page.locator('.source-fit-footer').getByRole('button',{name:/取消/}).click();
   await page.locator('.source-variant-picker').waitFor({state:'detached'});assert.deepEqual(await readDraft(),original);
   const waitFit=()=>page.waitForFunction(({key,role})=>{const d=JSON.parse(localStorage.getItem(key)||'{}').draft;return role==='arsenal'?d?.modules?.P1?.hullMods.includes('web_gloriana_edict_loader'):d?.hullMods?.includes('web_gloriana_flightline');},{key,role});
   const apply=async()=>{await select();await page.locator('.source-fit-footer').getByRole('button',{name:/确认/}).click();await page.locator('.source-variant-picker').waitFor({state:'detached'});await waitFit();};
   await apply();const applied=await readDraft();assert.equal(applied.id,original.id);assert.equal(applied.name,original.name);
   await page.getByRole('button',{name:/撤消/}).click();
   await page.waitForFunction(({key})=>{const d=JSON.parse(localStorage.getItem(key)||'{}').draft;return d?.vents===0&&d?.capacitors===0&&!d.modules;},{key});
   const restored=await readDraft();for(const field of ['weapons','wings','hullMods','modules','groups','vents','capacitors'])assert.deepEqual(restored[field],original[field]);
   await apply();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.studio-ship img[src*="/weapons/web_gloriana/"]')).filter(i=>i.complete&&i.naturalWidth>0).length===48);
   await page.mouse.move(1550,1050);await page.getByRole('button',{name:/模拟战斗/}).click();
   await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
   await page.waitForFunction(()=>!!window.__combatSession?.workerHost&&window.__combatReadView?.playerShip?.weapons?.length===12);
   await page.keyboard.press('Space');await page.evaluate(()=>window.__combatSession.barrier());
   const runtime=await page.evaluate(async()=>{
    const s=window.__combatSession,h=s.workerHost;let frame=h.latest;const p=frame.presentation.view.playerShip;
    const read=f=>{const v=f.presentation.view,root=v.playerShip;return{worker:h.status,mods:root.spec.hullMods,
     weapons:root.weapons.map(w=>({slot:w.slotId,id:w.spec.id})),
     batteries:v.ships.filter(c=>/^web_gloriana_[ps][123]$/.test(c.spec.sourceHullId??c.spec.id)).map(c=>({hull:c.spec.sourceHullId??c.spec.id,mods:c.spec.hullMods,macroDelay:c.weapons.find(w=>w.spec.id==='web_gloriana_macro').spec.refireDelay})),
     craftIds:v.ships.filter(c=>c.spec.hullSize==='FIGHTER'&&c.spec.id.startsWith('web_gloriana_')).map(c=>c.spec.id),
     state:root.system.state,effect:root.system.effectLevel,hud:f.presentation.hud.read.playerShip.system.statusText};};
    const before=read(frame),aim=[p.pos.x+Math.sin(p.facingRad)*3000,p.pos.y-Math.cos(p.facingRad)*3000];
    frame=await h.commands([{kind:'ship',command:{kind:'system',value:0},aim}]);const accepted=frame.results[0];
    const input={autopilot:false,blocked:false,keys:{},aim,firing:false,mouseSteering:false,pointerActive:true};
    for(let i=0;i<60;i++)frame=await h.step(input);s.acceptWorkerFrame(h,frame);return {before,accepted,active:read(frame)};
   });
   assert.equal(runtime.before.worker,'ready');assert.equal(runtime.before.batteries.length,6);assert.equal(runtime.before.craftIds.length,role==='arsenal'?14:15);
   for(const battery of runtime.before.batteries){assert.equal(battery.mods.includes('web_gloriana_edict_loader'),role==='arsenal');assert(Math.abs(battery.macroDelay-(role==='arsenal'?3.5:2.8))<1e-6);}
   assert.equal(runtime.before.mods.includes('web_gloriana_flightline'),role==='aviation');
   for(const slot of ['M12','M13'])assert.equal(runtime.before.weapons.find(w=>w.slot===slot).id,role==='arsenal'?'web_gloriana_torpedo':'web_gloriana_siege');
   assert.equal(runtime.accepted.accepted,true);assert.equal(runtime.active.state,'ACTIVE');assert.equal(runtime.active.effect,1);assert(runtime.active.hud.includes('左舷敕令'));
   await page.screenshot({path:resolve(output,role+'-worker.png'),animations:'disabled'});
   report.variants.push({role,warning,previewCancel:true,applyUndo:true,preservedShipIdentity:true,runtime});
   console.log('PASS loadouts UI/Worker '+role);await page.close();page=null;
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedAssets,[]);
 }catch(error){report.failure=String(error);report.pageText=await page?.locator('body').innerText().catch(()=>null);await page?.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});throw error;}
 finally{await writeFile(resolve(output,'verification.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
 return report;
}
