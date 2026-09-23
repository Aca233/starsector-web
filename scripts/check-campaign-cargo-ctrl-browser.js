// eslint-disable-next-line no-unused-expressions -- Callable headless Playwright scenario.
async (page) => {
 const assert=(ok,message)=>{if(!ok)throw Error(message);},results=[],errors=[];
 const capture=e=>errors.push(String(e));page.on('pageerror',capture);
 const panel=()=>page.getByRole('region',{name:'乘员与货物',exact:true});
 const hold=()=>page.getByRole('list',{name:'持有货物',exact:true}),discard=()=>page.getByRole('list',{name:'待抛弃货物',exact:true});
 const slot=(side,id)=>(side==='hold'?hold():discard()).locator(`[data-commodity-id="${id}"] button`);
 const value=async(side,id)=>await slot(side,id).count()?Number(await slot(side,id).innerText()):0;
 const idle=()=>page.waitForFunction(()=>document.querySelector('.cargo-panel')?.getAttribute('data-quick-pending')==='false');
 const move=async(side,id)=>{await slot(side,id).click({modifiers:['Control']});await idle();};
 const reset=async()=>{await page.keyboard.press('t');await idle();};
 const origin=new URL(page.url()).origin,headers={Authorization:'Bearer '+'A'.repeat(43)};
 const session=async()=>(await page.request.get(origin+'/campaign-api/session',{headers})).json(),own=s=>s.view.fleets.find(f=>f.id==='fleet-captain-a');
 const baseline=await session();
 try {
  await move('hold','crew');assert(await value('hold','crew')===60&&await value('discard','crew')===9,'native excess first');
  assert(await page.locator('.cargo-panel-held').count()===0,'Ctrl spawned held cursor');
  await page.screenshot({path:'C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-cargo-ctrl-1920-20260920.png'});
  await move('hold','crew');assert(await value('hold','crew')===0&&await value('discard','crew')===69,'second whole outgoing');
  await move('discard','crew');assert(await value('hold','crew')===60&&await value('discard','crew')===9,'first incoming fills capacity');
  await move('discard','crew');assert(await value('hold','crew')===69&&await value('discard','crew')===0,'second incoming permits overload');
  results.push('crew excess / second whole / incoming fill / incoming overload / no cursor');
  await move('hold','fuel');assert(await value('hold','fuel')===40&&await value('discard','fuel')===9,'fuel independent capacity');await reset();
  await move('hold','supplies');assert(await value('hold','supplies')===82&&await value('discard','supplies')===48,'shared cargo occupancy');
  await move('hold','supplies');await move('discard','supplies');assert(await value('hold','supplies')===82&&await value('discard','supplies')===48,'shared free cargo incoming');await reset();
  assert(JSON.stringify(own(await session()).private.cargo)===JSON.stringify(own(baseline).private.cargo),'Ctrl mutated authority');
  results.push('fuel and shared cargo capacities; all local until confirm');
  // Cancel a delayed read query, then perform an unrelated gesture before its late response.
  let release,seenResolve;const seen=new Promise(r=>seenResolve=r),gate=new Promise(r=>release=r);
  const route=async r=>{const q=JSON.parse(r.request().postData());if(!q.quickTransfer){await r.continue();return;}const response=await r.fetch();seenResolve();await gate;try{await r.fulfill({response});}catch{}};
  await page.route('**/campaign-api/cargo-preview',route);
  await slot('hold','crew').click({modifiers:['Control']});await seen;
  assert(await panel().getAttribute('data-quick-pending')==='true','missing async query guard');
  await page.keyboard.press('f');assert(await page.locator('main').getAttribute('data-core-panel')==='cargo','navigation escaped read query');
  await page.keyboard.press('Escape');await idle();assert(await value('hold','crew')===69,'cancel changed inventory');
  await slot('hold','heavy_machinery').click();release();await page.waitForTimeout(450);assert(await page.locator('.cargo-panel-held').innerText()==='16','late quote overwrote held cargo');
  await page.keyboard.press('Escape');await page.unroute('**/campaign-api/cargo-preview',route);
  results.push('pending navigation guard, Esc cancellation and late quote cannot overwrite next gesture');
  // Ctrl while already carrying follows ordinary placement, not a fresh shortcut.
  await slot('hold','heavy_machinery').click();
  await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click({modifiers:['Control']});
  assert(await value('discard','heavy_machinery')===16&&await page.locator('.cargo-panel-held').count()===0,'held Ctrl placement regressed');await reset();
  results.push('held Ctrl falls through to ordinary placement');
  // T cancels both a pending read and an existing local transfer; an old
  // response cannot resurrect it after closing and remounting the panel.
  await move('hold','crew');
  let finishReset,readyReset;const resetGate=new Promise(r=>finishReset=r),resetReady=new Promise(r=>readyReset=r);
  const resetRoute=async r=>{const q=JSON.parse(r.request().postData());if(!q.quickTransfer){await r.continue();return;}const response=await r.fetch();readyReset();await resetGate;try{await r.fulfill({response});}catch{}};
  await page.route('**/campaign-api/cargo-preview',resetRoute);await slot('hold','crew').click({modifiers:['Control']});await resetReady;
  await page.keyboard.press('t');await idle();assert(await value('hold','crew')===69&&await value('discard','crew')===0,'T failed to cancel pending read and draft');
  await page.keyboard.press('Escape');await page.keyboard.press('i');finishReset();await page.waitForTimeout(450);
  assert(await value('hold','crew')===69&&await value('discard','crew')===0,'old component response resurrected transfer');
  await page.unroute('**/campaign-api/cargo-preview',resetRoute);results.push('T resets pending query plus draft; close/reopen rejects late old-component reply');
  // Failure and bad-context responses do not degrade to whole-stack movement.
  for(const malformed of [false,true]) {
   await page.route('**/campaign-api/cargo-preview',async r=>{const q=JSON.parse(r.request().postData());if(!q.quickTransfer){await r.continue();return;}
    if(!malformed){await r.fulfill({status:503,contentType:'application/json',body:'{"error":{"code":"TEST_UNAVAILABLE"}}'});return;}
    const response=await r.fetch(),body=await response.json();body.epoch='wrong';await r.fulfill({response,json:body});});
   await move('hold','crew');assert(await value('hold','crew')===69&&await value('discard','crew')===0,'failed read mutated draft');
   assert((await panel().innerText()).includes('查询失败'),'failure not visible');await page.unroute('**/campaign-api/cargo-preview');
  }
  await move('hold','crew');assert(await value('discard','crew')===9,'retry failed');
  await page.setViewportSize({width:1024,height:768});await page.screenshot({path:'C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-cargo-ctrl-1024-20260920.png'});
  await page.keyboard.press('g');await page.getByRole('region',{name:'当前转移内容',exact:true}).waitFor({state:'detached'});
  const after=await session();assert(own(after).private.cargo.crew===60&&after.view.cargoPods.length===1&&after.view.cargoPods[0].items.crew===9,'confirmed partial transfer not conserved');
  results.push('503 and wrong-context reject without movement; retry; 1024 and actual 60 + 9 confirmation');
  // Fleet version changes while a read is pending: do not apply old amount.
  let finish,ready;const readyPromise=new Promise(r=>ready=r),blocked=new Promise(r=>finish=r);
  const staleRoute=async r=>{const q=JSON.parse(r.request().postData());if(!q.quickTransfer){await r.continue();return;}const response=await r.fetch();ready();await blocked;try{await r.fulfill({response});}catch{}};
  await page.route('**/campaign-api/cargo-preview',staleRoute);await slot('hold','fuel').click({modifiers:['Control']});await readyPromise;
  const fresh=await session(),fleet=own(fresh);
  const mutation=await page.request.post(origin+'/campaign-api/command',{headers,data:{worldId:fresh.view.worldId,epoch:fresh.epoch,requestId:await page.evaluate(()=>crypto.randomUUID()),type:'cargo.jettison',payload:{fleetId:fleet.id,items:{supplies:1}},expected:[{collection:'fleets',id:fleet.id,version:fleet.version},...fleet.private.members.map(m=>({collection:'members',id:m.id,version:m.version}))]}});
  assert(mutation.ok(),'fixture conflict mutation failed');await idle();finish();await page.waitForTimeout(450);
  assert(await value('hold','fuel')===49&&await value('discard','fuel')===0,'stale read applied transfer');assert(await value('hold','supplies')===129,'fresh inventory lost');
  await page.unroute('**/campaign-api/cargo-preview',staleRoute);results.push('concurrent authority change cancels pending read without inventing a draft');
  // A member-only version change must invalidate the quote too, even with
  // unchanged fleet version and identical cargo quantities.
  let finishMember,readyMember;const memberGate=new Promise(r=>finishMember=r),memberReady=new Promise(r=>readyMember=r);
  const memberRoute=async r=>{const q=JSON.parse(r.request().postData());if(!q.quickTransfer){await r.continue();return;}const response=await r.fetch();readyMember();await memberGate;try{await r.fulfill({response});}catch{}};
  await page.route('**/campaign-api/cargo-preview',memberRoute);await slot('hold','fuel').click({modifiers:['Control']});await memberReady;
  const ms=await session(),mf=own(ms),member=mf.private.members.find(m=>m.id==='wolf-captain-a');
  const repairs=await page.request.post(origin+'/campaign-api/command',{headers,data:{worldId:ms.view.worldId,epoch:ms.epoch,requestId:await page.evaluate(()=>crypto.randomUUID()),type:'logistics.set-repairs',payload:{memberId:member.id,suspended:true},expected:[{collection:'fleets',id:mf.id,version:mf.version},{collection:'members',id:member.id,version:member.version}]}});
  assert(repairs.ok(),'member fixture failed');await idle();finishMember();await page.waitForTimeout(450);
  assert(await value('hold','fuel')===49&&await value('discard','fuel')===0,'member-only stale quote applied');
  await page.unroute('**/campaign-api/cargo-preview',memberRoute);results.push('member-only version change rejects late reply with unchanged inventory');
  assert(errors.length===0,errors.join(';'));return {results};
 } finally {page.off('pageerror',capture);}
}
