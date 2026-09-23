// eslint-disable-next-line no-unused-expressions -- Callable Playwright scenario, not a Node entry.
async (page) => {
  const assert=(ok,why)=>{if(!ok)throw Error(why);}, results=[],errors=[];
  const capture=e=>errors.push(String(e));page.on('pageerror',capture);
  const hold=()=>page.getByRole('list',{name:'持有货物',exact:true}), discard=()=>page.getByRole('list',{name:'待抛弃货物',exact:true});
  const machinery=()=>hold().locator('[data-commodity-id="heavy_machinery"] button');
  const picker=()=>page.getByRole('status',{name:'分量选择',exact:true});
  const held=()=>page.locator('.cargo-panel-held');
  const origin=page.url().replace(/\/campaign\.html.*$/,''),headers={Authorization:'Bearer '+'A'.repeat(43)};
  const session=async()=> (await page.request.get(origin+'/campaign-api/session',{headers})).json();
  const own=s=>s.view.fleets.find(f=>f.id==='fleet-captain-a');
  const baseline=await session();
  const start=async()=>{const b=await machinery().boundingBox();assert(b,'source missing');await page.keyboard.down('Shift');await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await picker().waitFor();return b;};
  const moveTo=async fraction=>{const b=await picker().boundingBox();await page.waitForTimeout(260);await page.mouse.move(b.x+b.width*fraction,b.y+14);}; // tests the documented 250ms native grace
  const release=async()=>{await page.mouse.up();await page.keyboard.up('Shift');};
  const idle=async()=>page.waitForFunction(()=>document.querySelector('[data-cargo-preview]')?.getAttribute('data-cargo-preview')==='idle');
  try {
    await page.getByRole('button',{name:'拿起 金属 × 2',exact:true}).click({modifiers:['Shift']});
    assert(await picker().count()===0,'small stack showed a picker');assert((await held().innerText())==='1','small stack did not take one');
    assert((await page.getByRole('region',{name:'当前转移内容',exact:true}).innerText()).includes('金属 × 1'),'summary omitted cursor cargo');
    await hold().locator('[data-commodity-id="metals"] button').click({modifiers:['Shift'],button:'right'});await idle();assert(await held().count()===0,'returning last unit did not cancel');
    results.push('small stack direct one, held summary, Shift-right returns last unit');
    const source=await start();assert((await picker().innerText()).includes('1 / 16'),'initial native selection');
    // Chromium quantizes rendered CSS positions to 1/64px; width remains exact.
    const box=await picker().boundingBox();assert(box.width===88&&Math.abs(box.x-(source.x+source.width/2-13))<=1/64&&Math.abs(box.y-(source.y+source.height/2-28))<=1/64,'native anchor/size mismatch '+JSON.stringify({box,source}));
    await moveTo(0.75);assert((await picker().innerText()).includes('10 / 16'),'nonlinear pip mapping');
    await page.locator('[data-cargo-preview="ready"]').waitFor();assert((await page.getByTestId('hud-cargo-space').innerText())==='38 / 100','drag preview weight');
    await page.screenshot({path:'C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-cargo-quantity-1920-20260920.png'});
    await page.keyboard.up('Shift');assert(await picker().count()===1,'Shift release prematurely ended drag');await page.mouse.up();
    assert(await picker().count()===0&&(await held().innerText())==='10','mouse release did not hold selection');
    await machinery().click({modifiers:['Shift']});assert((await held().innerText())==='11','Shift-left did not add one');
    await machinery().click({modifiers:['Shift'],button:'right'});assert((await held().innerText())==='10','Shift-right did not return one');
    await page.keyboard.press('Escape');await idle();assert((await machinery().innerText())==='16','cancel did not merge into original remainder');
    results.push('native anchor, nonlinear 10/16, HUD 38, release semantics, add/remove one, source merge');
    await start();await moveTo(0.01);await release();await idle();assert(await held().count()===0,'zero selected a real held stack');assert((await machinery().innerText())==='16','zero lost cargo');
    await start();await page.keyboard.press('Escape');await release();await idle();assert(await picker().count()===0&&await held().count()===0,'Shift+Esc left an overlay or repicked via synthetic click');
    assert(await page.locator('main').getAttribute('data-core-panel')==='cargo','Shift+Esc closed cargo');
    await start();await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});await release();await idle();assert(await picker().count()===0,'right click did not cancel selection while Shift held');
    await start();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await release();await idle();assert(await picker().count()===0&&await held().count()===0,'blur stranded drag');
    results.push('zero release, Shift+Esc, Shift+right during picker, focus-loss cancellation');
    await page.getByRole('tab',{name:/资源/}).click();await start();await moveTo(0.75);
    const b=await picker().boundingBox();await page.mouse.move(b.x+b.width+300,b.y+14);await release();
    assert((await held().innerText())==='16','full selection lost capture in filtered view');
    await page.keyboard.press('Escape');await idle();await page.getByRole('tab',{name:/全部/}).click();
    results.push('filtered-grid source placeholder retains capture at full selection');
    await page.setViewportSize({width:1024,height:768});await start();await moveTo(0.75);
    const smallBox=await picker().boundingBox();assert(smallBox.x>=0&&smallBox.x+smallBox.width<=1024&&smallBox.y>=0,'small-screen picker clipped');
    await page.screenshot({path:'C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-cargo-quantity-1024-20260920.png'});
    await release();await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click();
    assert((await machinery().innerText())==='6','staged partial removed whole source');
    const preCommit=await session();assert(JSON.stringify(own(preCommit).private.cargo)===JSON.stringify(own(baseline).private.cargo),'local partial mutated authority');
    const sent=[];await page.route('**/campaign-api/command',async route=>{sent.push(JSON.parse(route.request().postData()));await route.continue();});
    try {await page.keyboard.press('g');await page.getByRole('region',{name:'当前转移内容',exact:true}).waitFor({state:'detached'});await idle();}
    finally {await page.unroute('**/campaign-api/command');}
    assert(sent.length===1&&sent[0].payload.items.heavy_machinery===10,'partial commit payload wrong');
    const after=await session();assert(own(after).private.cargo.heavy_machinery===6&&after.view.cargoPods.length===1&&after.view.cargoPods[0].items.heavy_machinery===10,'partial commit not conserved');
    results.push('1024 visible native picker; authority untouched until confirm; confirmed 6 retained + 10 pod');
    // Inventory changed during the drag: stop the picker but retain the held
    // draft until an explicit Esc, rather than silently rebasing on mouseup.
    await start();const fresh=await session(),fleet=own(fresh);
    const changed=await page.request.post(origin+'/campaign-api/command',{headers,data:{worldId:fresh.view.worldId,epoch:fresh.epoch,requestId:await page.evaluate(()=>crypto.randomUUID()),type:'cargo.jettison',payload:{fleetId:fleet.id,items:{supplies:1}},expected:[{collection:'fleets',id:fleet.id,version:fleet.version},...fleet.private.members.map(m=>({collection:'members',id:m.id,version:m.version}))]}});
    assert(changed.ok(),'concurrent fixture mutation failed');await page.locator('[data-cargo-preview="stale"]').waitFor();
    await release();assert(await picker().count()===0&&(await held().innerText())==='1','stale drag silently cancelled/rebased');
    assert(await page.getByRole('button',{name:'确认 [G]',exact:true}).isDisabled(),'stale quantity could confirm');
    await page.keyboard.press('Escape');await idle();assert((await page.getByTestId('hud-supplies').innerText())==='29'&&(await machinery().innerText())==='6','explicit cancellation failed to rebase');
    assert(await page.locator('main').getAttribute('data-core-panel')==='cargo','stale cancellation closed panel');
    results.push('concurrent change during picker retains held draft; explicit Esc rebases without closing');
    assert(errors.length===0,'runtime errors: '+errors.join(';'));return {results};
  } finally {await page.mouse.up();await page.keyboard.up('Shift');page.off('pageerror',capture);}
}
