// eslint-disable-next-line no-unused-expressions -- Callable page scenario for browser_run_code_unsafe, not a Node entry.
async (page) => {
  const assert = (ok, why) => { if (!ok) throw Error(why); };
  const results = [];
  const origin = page.url().replace(/\/campaign\.html.*$/, '');
  const hold = () => page.getByRole('list', {name:'持有货物',exact:true});
  const discard = () => page.getByRole('list', {name:'待抛弃货物',exact:true});
  const commandUrl = '**/campaign-api/command';
  const headers = {Authorization:'Bearer '+ 'A'.repeat(43)};
  const session = async () => (await page.request.get(origin + '/campaign-api/session',{headers})).json();
  const own = s => s.view.fleets.find(f => f.id === 'fleet-captain-a');
  const slotIds = list => list.locator('[data-commodity-id]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-commodity-id')));
  if (await page.getByRole('button',{name:'拿起 重型机械 × 4',exact:true}).count()) {
    await page.getByRole('button',{name:'拿起 重型机械 × 4',exact:true}).click();
    await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click();
  }
  await page.keyboard.press('Escape'); // cancel the staged mechanical stack
  assert(await discard().innerText()==='', 'Esc did not cancel transaction');
  assert(await page.locator('main').getAttribute('data-core-panel')==='cargo','Esc closed instead of cancel');
  await page.keyboard.press('Escape');
  assert(await page.locator('main').getAttribute('data-core-panel')===null,'second Esc did not leave');
  await page.keyboard.press('i');
  await page.getByRole('button',{name:'拿起 重型机械 × 4',exact:true}).click({modifiers:['Alt']});
  assert(await page.locator('.cargo-panel-held').count()===0,'unsupported Alt gesture picked whole stack');
  await page.getByRole('button',{name:'拿起 重型机械 × 4',exact:true}).click();
  await page.getByRole('region',{name:'乘员与货物',exact:true}).click({button:'right',position:{x:1700,y:300}});
  assert(await page.locator('.cargo-panel-held').count()===0,'right click failed to return held');
  results.push('Esc priority, close/reopen, safe unsupported modifiers, right-click return');
  await page.getByRole('button',{name:'排序持有货物',exact:true}).click();
  assert(JSON.stringify(await slotIds(hold()))===JSON.stringify(['supplies','fuel','crew','heavy_machinery','metals']),'hold order differs');
  for (const label of ['拿起 金属 × 2','拿起 重型机械 × 4']) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click();
  }
  const heldBeforeSort=await slotIds(hold());
  assert(JSON.stringify(await slotIds(discard()))===JSON.stringify(['metals','heavy_machinery']),'drop slots/order');
  await page.getByRole('button',{name:'排序抛弃货物',exact:true}).click();
  assert(JSON.stringify(await slotIds(discard()))===JSON.stringify(['heavy_machinery','metals']),'discard sort differs');
  assert(JSON.stringify(await slotIds(hold()))===JSON.stringify(heldBeforeSort),'sorting discard affected hold');
  await page.keyboard.press('f'); await page.keyboard.press('l');
  assert(await page.locator('main').getAttribute('data-core-panel')==='cargo','switch bypassed pending guard');
  assert(await page.getByRole('button',{name:/舰队管理/}).isDisabled(),'core tab not disabled');
  results.push('independent order sorts, pending keyboard/core navigation guard');
  const before=await session(); assert(own(before).private.cargo.heavy_machinery===4,'local preview changed authority');
  const commands=[]; let loseFirst=true;
  await page.route(commandUrl,async route=>{
    commands.push(JSON.parse(route.request().postData()));
    if (loseFirst) { loseFirst=false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  try {
    await page.keyboard.press('g');
    await page.getByRole('button',{name:'重试同一请求',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    assert(await page.locator('main').getAttribute('data-core-panel')==='cargo','uncertain command draft escaped');
    assert(await page.getByRole('button',{name:'撤销 [T]',exact:true}).isDisabled(),'uncertain transaction can be locally undone');
    await page.getByRole('button',{name:'重试同一请求',exact:true}).click();
    await page.getByRole('region',{name:'当前转移内容',exact:true}).waitFor({state:'detached'});
    const after=await session();
    assert(commands.length===2 && commands[0].requestId===commands[1].requestId,'retry changed request id');
    assert(after.view.cargoPods.length===1,'retry minted a second pod');
    assert((own(after).private.cargo.heavy_machinery??0)===0 && (own(after).private.cargo.metals??0)===0,'confirmed items not removed');
    assert(after.view.cargoPods[0].items.heavy_machinery===4 && after.view.cargoPods[0].items.metals===2,'pod contents not conserved');
    assert(await discard().innerText()==='','acknowledged retry revived local draft');
    assert(await page.locator('[data-cargo-preview]').getAttribute('data-cargo-preview')==='idle','acknowledged receipt retained preview');
    results.push('lost successful HTTP response: same-id retry, one pod, conserved inventory, draft cleared');
  } finally { await page.unroute(commandUrl); }
  await page.getByRole('button',{name:'拿起 补给 × 30',exact:true}).click();
  await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click();
  const fresh=await session(), fleet=own(fresh);
  const remote={worldId:fresh.view.worldId,epoch:fresh.epoch,requestId:'cargo-transfer-qa-stale-20260920',type:'cargo.jettison',payload:{fleetId:fleet.id,items:{supplies:1}},expected:[{collection:'fleets',id:fleet.id,version:fleet.version},...fleet.private.members.map(m=>({collection:'members',id:m.id,version:m.version}))]};
  const changed=await page.request.post(origin + '/campaign-api/command',{headers,data:remote});
  assert(changed.ok(),'QA concurrent command failed: '+await changed.text());
  await page.getByText('库存已变化；请先撤销当前转移，再从最新库存拿取。',{exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'确认 [G]',exact:true}).isDisabled(),'stale preview can confirm');
  assert(await page.locator('[data-cargo-preview]').getAttribute('data-cargo-preview')==='stale','stale inventory retained valid HUD quote');
  await page.keyboard.press('t');
  await page.getByRole('button',{name:'拿起 补给 × 29',exact:true}).waitFor();
  assert(await page.getByTestId('hud-supplies').innerText()==='29','rebase retained old HUD amount');
  results.push('concurrent authority cargo change: draft retained, confirmation blocked, T rebases');
  await page.setViewportSize({width:1024,height:768});
  await page.getByRole('button',{name:'拿起 补给 × 29',exact:true}).click();
  await discard().getByRole('button',{name:/放入抛弃区 空格/}).first().click();
  assert(await page.getByRole('button',{name:'确认 [G]',exact:true}).isVisible(),'small viewport lost confirm');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal document overflow');
  await page.keyboard.press('t');
  results.push('1024x768 transaction controls visible; no page horizontal overflow');
  const runtimeErrors = [], capture = e => runtimeErrors.push(String(e));
  page.on('pageerror', capture);
  for (const unavailable of ['missing', 'null', 'array']) {
    await page.route('**/campaign-api/session', async route => {
      const response = await route.fetch(), data = await response.json(), fleet = own(data);
      if (unavailable === 'missing') delete fleet.private;
      else fleet.private.cargo = unavailable === 'null' ? null : [];
      await route.fulfill({response, json:data});
    });
    try {
      await page.getByText('货舱数据不可用；未收到舰队私有库存。', {exact:true}).waitFor();
      assert(await hold().innerText() === '', 'unavailable cargo retained an actionable stack');
    } finally { await page.unroute('**/campaign-api/session'); }
    await page.getByRole('button', {name:'拿起 补给 × 29',exact:true}).waitFor();
  }
  page.off('pageerror', capture);
  assert(runtimeErrors.length === 0, 'runtime errors: ' + runtimeErrors.join('; '));
  results.push('missing/null/array private cargo: no render loop, inventory disabled, recovery verified');
  return {results,commands:commands.map(c=>({type:c.type,requestId:c.requestId,items:c.payload.items})),final:own(await session()).private.cargo};
}
