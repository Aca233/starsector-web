import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Removal regression in the existing Ark headless scenario; no user storage/profile access. */
export async function checkAdunRetirement(page,out){
 const report={scope:'retired v05 catalogue/library + current Ark real Worker'};
 await page.locator('#refit-hull-search').fill('亚顿');
 assert.equal(await page.locator('button[data-hull-id="web_spear_of_adun"]').count(),0);
 assert.equal(await page.locator('button[data-hull-id="web_spear_of_adun_ark"]').count(),1);
 await page.screenshot({path:resolve(out,'legacy-removed-catalog.png')});
 report.original=await page.evaluate(async()=>{
  const m=await import('/src/studio/DesignModel.ts'),keep=m.createDesign('web_gloriana');keep.name='保留女王方案';keep.vents=7;
  const old={...structuredClone(keep),id:'retired-ui-fixture',hullId:'web_spear_of_adun',name:'旧亚顿配装',weapons:{XL01:'web_adun_solar_lance'}};
  const raw=JSON.stringify({version:1,draft:old,baseline:old,designs:[old,keep]});localStorage.setItem(m.storageKey,raw);
  return {raw,key:m.storageKey,keepId:keep.id};
 });
 await page.reload();await page.locator('.studio-ark-layer').first().waitFor({state:'attached'});
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'{}').draft?.hullId==='web_spear_of_adun_ark',report.original.key);
 report.library=await page.evaluate(({key})=>({current:JSON.parse(localStorage.getItem(key)),backup:localStorage.getItem(key+':removed:web_spear_of_adun')}),report.original);
 assert.equal(report.library.backup,report.original.raw);assert.equal(report.library.current.designs.length,1);
 assert.equal(report.library.current.designs[0].id,report.original.keepId);assert.equal(report.library.current.designs[0].name,'保留女王方案');assert.equal(report.library.current.designs[0].vents,7);
 assert.equal(report.library.current.draft.hullId,'web_spear_of_adun_ark');
 await page.waitForFunction(()=>[...document.querySelectorAll('.studio-ark-layer,.studio-weapon-image,.studio-installation-image,.studio-installation-foreground')].every(e=>e.complete&&e.naturalWidth>0));
 await page.mouse.move(1420,970);await page.getByRole('button',{name:/模拟战斗/}).click();
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
 await page.waitForFunction(()=>!!window.__combatSession?.workerHost&&window.__combatReadView?.playerShip?.spec?.sourceHullId==='web_spear_of_adun_ark');
 await page.keyboard.press('Space');await page.evaluate(()=>window.__combatSession.barrier());
 report.worker=await page.evaluate(async()=>{
  const s=window.__combatSession,h=s.workerHost,p=h.latest.presentation.view.playerShip;
  let f=await h.commands([{kind:'ship',command:{kind:'system',value:0},aim:[p.pos.x+5000,p.pos.y]}]);const accepted=f.results[0];
  const input={autopilot:false,blocked:false,keys:{},aim:[p.pos.x+5000,p.pos.y],firing:false,mouseSteering:false,pointerActive:true};
  for(let i=0;i<70;i++)f=await h.step(input);s.acceptWorkerFrame(h,f);
  const v=f.presentation.view,r=v.playerShip;
  return {status:h.status,accepted,root:r.spec.sourceHullId,parts:v.ships.filter(p=>p.teamId===r.teamId&&(p.spec.sourceHullId??p.spec.id).startsWith('web_spear_of_adun_ark')).map(p=>({id:p.spec.sourceHullId??p.spec.id,weapons:p.weapons.length})),systems:r.allSystems.map(s=>({type:s.type,state:s.state,effect:s.effectLevel})),aircraft:v.ships.filter(p=>p.teamId===r.teamId&&p.spec.hullSize==='FIGHTER').length,
   legacyInContent:h.checkpoint().config.content.ships.some(p=>p.id==='web_spear_of_adun')};
 });
 assert.equal(report.worker.status,'ready');assert.equal(report.worker.legacyInContent,false);assert.equal(report.worker.parts.length,5);assert.equal(report.worker.parts.reduce((n,p)=>n+p.weapons,0),13);assert.equal(report.worker.aircraft,14);
 assert(report.worker.accepted.accepted);assert.equal(report.worker.systems.find(s=>s.type==='WEB_ADUN_ARK_FORGE').state,'ACTIVE');
 await page.screenshot({path:resolve(out,'legacy-removed-ark-worker.png')});
 await writeFile(resolve(out,'legacy-removal.json'),JSON.stringify(report,null,2));
 console.log('PASS retired catalogue/library backup, 5 Ark parts/13 mounts/14 aircraft and real Worker forge');
}
