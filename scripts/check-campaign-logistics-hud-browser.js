// eslint-disable-next-line no-unused-expressions -- Callable headless Playwright scenario.
async (page) => {
 const assert=(ok,why)=>{if(!ok)throw Error(why);},results=[];
 const read=id=>page.getByTestId(id).innerText(),root=page.locator('.campaign-logistics');
 const status=value=>page.waitForFunction(v=>document.querySelector('[data-cargo-preview]')?.getAttribute('data-cargo-preview')===v,value);
 const base=async()=>{assert(await read('hud-crew')==='69','crew quantity');assert((await page.locator('.logistics-crew').innerText()).replace(/\s/g,'')==='69/30','crew requirement mistaken for capacity');assert(await read('hud-marines')==='5','marines missing');assert(await read('hud-personnel')==='74 / 60','shared personnel count');assert(await read('hud-supplies')==='30','supplies not truncated');assert(await read('hud-cargo-space')==='49 / 100','cargo not rounded');assert(await read('hud-fuel')==='50 / 40','fuel not rounded');};
 await base();assert(await root.getAttribute('data-expanded')==='true','cargo should expand');
 const geometry=await root.evaluate(node=>{
  const rows=['.logistics-credits','.campaign-supplies','.logistics-crew','.logistics-cargo','.logistics-personnel','.logistics-fuel'].map(s=>node.querySelector(s).getBoundingClientRect().y);
  const meter=node.querySelector('.logistics-cargo .logistics-meter').getBoundingClientRect(),icon=node.querySelector('.logistics-cargo .logistics-icon').getBoundingClientRect();
  const track=node.querySelector('.logistics-personnel .logistics-track').getBoundingClientRect(),fill=node.querySelector('.logistics-personnel .logistics-fill').getBoundingClientRect(),excess=node.querySelector('.logistics-personnel .logistics-excess').getBoundingClientRect();
  return {rows,meter:{width:meter.width,height:meter.height},icon:{width:icon.width,height:icon.height},ratio:fill.width/track.width,overRatio:excess.width/track.width,background:getComputedStyle(node).backgroundImage};
 });
 assert(geometry.rows.every((y,i)=>!i||y>geometry.rows[i-1]),'native row order');assert(geometry.meter.width===158&&geometry.meter.height===14,'native bar geometry');assert(geometry.icon.width===24&&geometry.icon.height===16,'native capacity icon');assert(Math.abs(geometry.ratio-60/74)<0.001&&Math.abs(geometry.overRatio-14/74)<0.001,'overload segments');assert(geometry.background.includes('campaign_infowidget4.png'),'wrong expanded art');
 assert((await page.locator('.campaign-supplies small').innerText()).startsWith('-'),'consumption missing minus');
 await page.screenshot({path:'C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-logistics-hud-1920-20260920.png'});
 results.push('native resource ordering, 24x16 icons, 158x14 bars, crew/minimum vs total/capacity, original overload segments and formatting');
 // Hold the first derived preview to verify no old capacity/minimum appears while waiting.
 let release,ready;const gate=new Promise(r=>release=r),seen=new Promise(r=>ready=r);
 const route=async r=>{const response=await r.fetch();ready();await gate;try{await r.fulfill({response});}catch{}};
 await page.route('**/campaign-api/cargo-preview',route);
 await page.getByRole('button',{name:'拿起 补给 × 30.8',exact:true}).click();await seen;
 assert(await read('hud-supplies')==='补给不足','native shortage missing');assert(await read('hud-personnel')==='— / —','old personnel capacity shown while pending');assert((await page.locator('.logistics-crew').innerText()).replace(/\s/g,'')==='69/—','old minimum crew shown while pending');
 assert(await page.locator('.logistics-personnel').getAttribute('data-known')==='false','unknown bar fabricated fill');
 release();await status('ready');assert(await read('hud-cargo-space')==='18 / 100','retained quantity not used');assert(await read('hud-personnel')==='74 / 60','personnel failed to restore from query');
 await page.unroute('**/campaign-api/cargo-preview',route);await page.keyboard.press('Escape');await status('idle');await base();
 results.push('pending unknown derived values, immediate native shortage, retained preview and cancel restore');
 await page.getByRole('button',{name:'拿起 陆战队员 × 5',exact:true}).click();await status('ready');assert(await read('hud-marines')==='0'&&await read('hud-personnel')==='69 / 60','marines pickup did not update shared capacity');
 await page.keyboard.press('Escape');await status('idle');await base();
 await page.setViewportSize({width:1024,height:768});await page.screenshot({path:'C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-logistics-hud-1024-20260920.png'});
 const box=await root.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=1024&&box.y+box.height<=768,'small HUD clipped');
 await page.keyboard.press('Escape');assert(await root.getAttribute('data-expanded')==='false','navigation should contract');
 assert(await page.locator('.logistics-personnel').isHidden(),'contracted personnel overlay');
 assert((await root.evaluate(n=>getComputedStyle(n).backgroundImage)).includes('campaign_infowidget_compact2.png'),'compact native art missing');
 await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:'C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-logistics-hud-compact-1920-20260920.png'});
 const supplyGeometry=await page.locator('.campaign-supplies').evaluate(n=>{
  const icon=n.querySelector('.logistics-icon').getBoundingClientRect(),value=n.querySelector('b').getBoundingClientRect(),delta=n.querySelector('small').getBoundingClientRect(),hud=n.closest('.campaign-logistics').getBoundingClientRect();
  return {valueWidth:value.width,iconGap:value.x-icon.right,deltaGap:delta.x-value.right,right:delta.right-hud.x};
 });
 assert(supplyGeometry.valueWidth===32&&supplyGeometry.iconGap===3&&supplyGeometry.deltaGap===10,'native supplies minimum width / following delta gap');
 assert(supplyGeometry.right<=166,'compact supplies consumption crosses upper frame');
 results.push('compact supplies fits upper frame, native four-digit minimum and 10px following delta');
 await page.getByRole('button',{name:/^燃料 50 \/ 40/}).click();assert(await root.getAttribute('data-expanded')==='true','fuel click did not open expanded cargo');
 results.push('marines preview, 1024 visible layout, compact navigation and click to expand');
 return {results,geometry,supplyGeometry};
}
