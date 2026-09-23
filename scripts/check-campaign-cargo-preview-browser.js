// eslint-disable-next-line no-unused-expressions -- Callable browser scenario, not a Node entry.
async (page) => {
  const assert=(ok,why)=>{if(!ok)throw Error(why);}, results=[];
  const url='**/campaign-api/cargo-preview',hud=page.locator('[data-cargo-preview]');
  const status=async value=>page.waitForFunction(v=>document.querySelector('[data-cargo-preview]')?.getAttribute('data-cargo-preview')===v,value);
  const read=id=>page.getByTestId(id).innerText();
  const pick=name=>page.getByRole('button',{name,exact:true}).click();
  const discard=()=>page.getByRole('list',{name:'待抛弃货物',exact:true});
  const origin=page.url().replace(/\/campaign\.html.*$/,'');
  const headers={Authorization:'Bearer '+'A'.repeat(43)};
  const session=async()=> (await page.request.get(origin+'/campaign-api/session',{headers})).json();
  const own=s=>s.view.fleets.find(f=>f.id==='fleet-captain-a');
  const baseline=await session(), baselineText=await hud.innerText(), supplyRate=await page.locator('.campaign-supplies small').innerText();
  let release,arrival,finished;
  const waiting=new Promise(r=>{arrival=r;}),gate=new Promise(r=>{release=r;}),done=new Promise(r=>{finished=r;});
  let count=0;
  await page.route(url,async route=>{
    if(++count!==1){await route.continue();return;}
    const response=await route.fetch(),body=await response.json();body.logistics.suppliesPerDay=888;
    arrival();await gate;
    try{await route.fulfill({response,json:body});}catch{}finally{finished();}
  });
  try {
    await pick('拿起 重型机械 × 4');await waiting;await status('pending');
    assert((await read('hud-cargo-space'))==='— / —','pending quote reused authoritative capacity');
    await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click();
    await pick('拿起 船员 × 30');assert((await read('hud-crew'))==='0','retained crew not immediate');
    await status('ready');assert((await read('hud-cargo-space'))==='32 / 100','retained weight wrong');
    assert((await page.locator('.campaign-supplies small').innerText())!==supplyRate,'crew shortage did not recompute recovery');
    release();await done;
    assert(!(await hud.innerText()).includes('888'),'old quote overwrote current gesture');
    const authority=await session();assert(JSON.stringify(own(authority).private.cargo)===JSON.stringify(own(baseline).private.cargo),'preview mutated inventory');
    assert(authority.view.revision===baseline.view.revision,'preview wrote a revision');
    await page.keyboard.press('Escape');await status('ready');
    await page.keyboard.press('t');await status('idle');assert((await hud.innerText())===baselineText,'undo did not restore authoritative HUD');
    results.push('immediate retained counts, pending unknowns, derived crew recovery, old response ignored, undo restores, authority unchanged');
  } finally {release();await page.unroute(url);}
  // Read-only network failures do not become uncertain mutations or block navigation.
  await page.route(url,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'AUTHORITY_TIMEOUT'}})}));
  await pick('拿起 燃料 × 20');await status('unavailable');assert((await read('hud-fuel')).startsWith('0 /'),'failure lost retained quantity');
  assert(await page.getByRole('button',{name:'重试同一请求',exact:true}).count()===0,'quote failure entered command retry');
  assert(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('campaign-pending:')).length)===0,'quote stored pending mutation');
  await page.keyboard.press('Escape');await status('idle');await page.unroute(url);
  results.push('query failure is not a pending command; local cancel remains available');
  await page.route(url,async route=>{const response=await route.fetch(),body=await response.json();body.epoch='wrong-authority';await route.fulfill({response,json:body});});
  await pick('拿起 补给 × 30');await status('unavailable');assert((await read('hud-supplies'))==='补给不足','retained supplies not immediate');
  await page.keyboard.press('Escape');await status('idle');await page.unroute(url);
  results.push('mismatched authority response rejected');
  await pick('拿起 重型机械 × 4');await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click();await status('ready');
  // Same inventory, new member version: do not retain a quote from before repair suspension.
  const changeRepairs=async suspended=>{
    const s=await session(),f=own(s),m=f.private.members.find(m=>m.id==='wolf-captain-a');
    const r=await page.request.post(origin+'/campaign-api/command',{headers:{...headers,'Content-Type':'application/json'},data:{worldId:s.view.worldId,epoch:s.epoch,requestId:await page.evaluate(()=>crypto.randomUUID()),type:'logistics.set-repairs',payload:{memberId:m.id,suspended},expected:[{collection:'fleets',id:f.id,version:f.version},{collection:'members',id:m.id,version:m.version}]}});
    assert(r.ok(),'repair fixture failed');
  };
  const beforeRate=await page.locator('.campaign-supplies small').innerText();await changeRepairs(true);
  await page.waitForFunction(before=>{const h=document.querySelector('[data-cargo-preview]');return h?.getAttribute('data-cargo-preview')==='ready'&&document.querySelector('.campaign-supplies small')?.textContent!==before;},beforeRate);
  await changeRepairs(false);
  await page.waitForFunction(before=>document.querySelector('[data-cargo-preview]')?.getAttribute('data-cargo-preview')==='ready'&&document.querySelector('.campaign-supplies small')?.textContent===before,beforeRate);
  await page.keyboard.press('t');await status('idle');
  // Reopen is a new component lifetime, not a hit on its old quote key.
  await page.keyboard.press('Escape');await page.keyboard.press('i');await pick('拿起 重型机械 × 4');await status('ready');
  await page.keyboard.press('Escape');await status('idle');
  assert((await hud.innerText())===baselineText,'reopen left a stale preview');
  results.push('member-version refresh without cargo changes; close/reopen reset');
  return {passed:results};
}
