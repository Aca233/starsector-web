/** Live room-roster regression. Uses an isolated relay/browser; never touches saved profiles.
 * Build artifacts/ai-destination-final first. Set PLAYWRIGHT_PACKAGE (or install playwright on NODE_PATH).
 * Optional LAN_TEST_DIST and BROWSER_PATH override the build and Chromium executable. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLanServer } from '../server/lan-server.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const app = await createLanServer({ host:'127.0.0.1', port:0, dist:resolve(process.env.LAN_TEST_DIST || 'artifacts/ai-destination-final') });
const base = 'http://127.0.0.1:' + app.server.address().port;
let browser;
const passed = [], errors = [];
const until = async (predicate, label) => { const end=Date.now()+8000; while(!predicate()) { if(Date.now()>end)throw Error('Timed out: '+label); await new Promise(r=>setTimeout(r,25)); } };
try {
  browser = await chromium.launch({ headless:true, ...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {}) });
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  context.setDefaultTimeout(8000);
  const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  let latest, serverRoute, heldAck, holdAck=false, rejectNext=false;
  const commands=[];
  await page.routeWebSocket('**/*', route => {
    const server=route.connectToServer(); serverRoute=server;
    route.onMessage(raw=>{
      const message=JSON.parse(String(raw)); commands.push(message);
      if(rejectNext&&message.type==='ai'){rejectNext=false;route.send(JSON.stringify({type:'error',requestId:message.requestId,message:'测试：编成已变化，请重试'}));return;}
      server.send(raw);
    });
    server.onMessage(raw=>{
      const message=JSON.parse(String(raw)); if(message.type==='room')latest=message.room;
      if(holdAck&&message.type==='ai-configured'){heldAck=()=>route.send(raw);return;}
      route.send(raw);
    });
  });
  await page.goto(base+'/?view=lan#host=1&name=侧栏验收');
  await page.getByRole('button',{name:'添加 AI 对手',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索 AI 舰船'}).fill('攻势');
  await page.getByRole('button',{name:'选择 攻势 舰体',exact:true}).click();
  for(const preset of ['标准','精英','老式']) {
    const rev=latest.options.aiRevision??0;
    await page.getByRole('button',{name:'配装 '+preset,exact:true}).hover();
    await page.getByRole('button',{name:preset+' · 添加 1 艘到 B 队',exact:true}).click();
    await until(()=>latest.options.aiRevision>rev,'preset added');
    await page.locator('.lan-ai-feedback').filter({hasText:'服务器已确认'}).waitFor();
  }
  await page.getByRole('button',{name:'完成编成',exact:true}).click();
  const roster=page.locator('.lan-room-roster'), rows=roster.locator('.lan-room-ai-row');
  const standard=rows.filter({hasText:'标准'}), elite=rows.filter({hasText:'精英'});
  assert.equal(await rows.count(),3);
  assert.equal(await roster.locator('.lan-team[data-team="1"] .lan-team-empty').count(),0);
  assert.equal(await page.locator('.lan-room-progress details').getAttribute('open'),null);
  assert.equal(await roster.getByRole('button',{name:'为B 队添加 AI',exact:true}).count(),1);
  passed.push('AI-only teams show separate preset groups directly in the left roster');
  await page.locator('.lan-ai-fleet-modal').waitFor({state:'detached'});
  await page.screenshot({path:resolve('artifacts/room-roster-overview.png')});

  holdAck=true; const before=commands.filter(c=>c.type==='ai').length;
  await standard.getByRole('button',{name:/增加一艘 AI/}).click();
  await until(()=>heldAck,'held acknowledgement');
  assert.equal(await roster.getAttribute('aria-busy'),'true');
  assert.equal(await elite.getByRole('button',{name:/增加一艘 AI/}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:/添加 \/ 批量管理 AI/}).isDisabled(),true);
  assert.equal(await page.locator('.lan-editor-primary .native-button').last().isDisabled(),true);
  await standard.getByRole('button',{name:/增加一艘 AI/}).evaluate(button=>button.click());
  assert.equal(commands.filter(c=>c.type==='ai').length-before,1);
  holdAck=false; heldAck(); heldAck=null;
  await page.locator('.lan-room-roster[aria-busy="false"]').waitFor();
  await standard.getByLabel('2 艘',{exact:true}).waitFor();
  await standard.getByRole('button',{name:/减少一艘 AI/}).click();
  await standard.getByLabel('1 艘',{exact:true}).waitFor();
  passed.push('inline quantity uses one acknowledged transaction; pending blocks duplicate edits and start');

  const beforeRemove=commands.filter(c=>c.type==='ai').length;
  await elite.getByRole('button',{name:/移除最后一艘 AI/}).click();
  await elite.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(commands.filter(c=>c.type==='ai').length,beforeRemove);
  await elite.getByRole('button',{name:/移除最后一艘 AI/}).click();
  await elite.getByRole('button',{name:'确认移除',exact:true}).click();
  await elite.waitFor({state:'detached'});
  passed.push('last ship requires confirmation; cancel does not send any command');

  rejectNext=true;
  await standard.getByRole('button',{name:/增加一艘 AI/}).click();
  await roster.getByRole('alert').filter({hasText:'测试：编成已变化'}).waitFor();
  assert.equal(await standard.getByLabel('1 艘',{exact:true}).count(),1);
  assert.equal(await standard.getByRole('button',{name:/增加一艘 AI/}).isEnabled(),true);
  await roster.getByRole('button',{name:'关闭编成提示'}).click();
  passed.push('correlated rejection preserves quantity, shows error and releases the lock');

  // Seed additional designs in this test-only room to exercise the shared scrollbar.
  const source=structuredClone(latest.options.aiLoadouts[latest.options.aiHulls[1][0]]);
  for(let i=0;i<6;i++) {
    const revision=latest.options.aiRevision;
    serverRoute.send(JSON.stringify({type:'ai',roomCode:latest.code,requestId:'roster-fixture-'+i,baseRevision:revision,
      assignment:'teams',team:1,operation:'add',count:i===0?20:1,design:{...source,name:'布局方案 '+(i+1),capacitors:source.capacitors-i-2}}));
    await until(()=>latest.options.aiRevision>revision,'fixture '+i);
  }
  await until(()=>latest.options.aiHulls[1].length===27,'fixture count');
  await page.waitForFunction(()=>document.querySelectorAll('.lan-room-ai-row').length===8);
  await page.setViewportSize({width:1280,height:740});
  await roster.getByRole('button',{name:'收起A 队',exact:true}).click();
  const personalBefore=await page.locator('.native-refit-app').innerText();
  await rows.filter({hasText:'布局方案 5'}).getByRole('button',{name:'改装',exact:true}).scrollIntoViewIfNeeded();
  const scrollBefore=await page.locator('.lan-teams').evaluate(e=>e.scrollTop);
  assert.ok(scrollBefore>30);
  await rows.filter({hasText:'布局方案 5'}).getByRole('button',{name:'改装',exact:true}).click();
  await page.getByRole('textbox',{name:'AI 方案名称'}).waitFor();
  await page.locator('.lan-editor-footer').getByRole('button',{name:'返回舰船列表',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
  await page.locator('.lan-room-roster').waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await roster.getByRole('button',{name:'展开A 队',exact:true}).getAttribute('aria-expanded'),'false');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.ok(Math.abs(await page.locator('.lan-teams').evaluate(e=>e.scrollTop)-scrollBefore)<3,'roster scroll restored');
  assert.equal(await page.locator('.native-refit-app').innerText(),personalBefore,'personal draft untouched');
  passed.push('inline AI editor returns directly to roster with collapsed team, scroll and personal draft preserved');

  await rows.filter({hasText:'布局方案 5'}).getByRole('button',{name:'改装',exact:true}).click();
  await page.getByRole('textbox',{name:'AI 方案名称'}).fill('侧栏改装确认');
  await page.getByRole('button',{name:'减少幅能容存器',exact:true}).click();
  // Use a different vent value too, so it cannot merge with an existing seeded design.
  await page.getByRole('button',{name:'减少耗散通道',exact:true}).click();
  await page.getByRole('button',{name:'应用修改',exact:true}).click();
  await rows.filter({hasText:'侧栏改装确认'}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  passed.push('applied inline AI refit updates only the target group and returns without opening bulk manager');

  const shots=resolve('artifacts/room-roster-tests'); await mkdir(shots,{recursive:true});
  const metrics=[];
  for(const viewport of [{width:1440,height:900},{width:1280,height:740},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.locator('.lan-teams').evaluate(e=>{e.scrollTop=0;});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const value=await page.evaluate(()=>{
      const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,scroll:e.scrollWidth,client:e.clientWidth};};
      return {sidebar:box('.lan-room-fleet-sidebar'),list:box('.lan-teams'),footer:box('.lan-editor-footer'),body:document.body.scrollWidth,view:innerWidth,
        overflow:[...document.querySelectorAll('.lan-room-ai-row,.lan-team-heading')].some(e=>e.scrollWidth>e.clientWidth+1)};
    });
    assert.ok(value.list.h>240); assert.ok(value.sidebar.b<=value.footer.y); assert.equal(value.body,value.view); assert.equal(value.overflow,false);
    metrics.push({viewport,...value});
    await page.screenshot({path:resolve(shots,viewport.width+'x'+viewport.height+'.png')});
  }
  passed.push('1440×900 / 1280×740 / 390×844: bounded rows, shared scroll, no footer overlap or document overflow');
  console.log('LAYOUT',JSON.stringify(metrics));

  await page.setViewportSize({width:1440,height:900});
  const guestContext=await browser.newContext({viewport:{width:1280,height:740}});guestContext.setDefaultTimeout(8000);
  const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));
  await guest.goto(base+'/?view=lan&room='+latest.code+'#name=只读验证');
  await guest.getByRole('button',{name:'加入房间',exact:true}).click();
  await guest.locator('.lan-room-ai-row').first().waitFor();
  assert.equal(await guest.locator('.lan-room-ai-actions').count(),0);
  assert.equal(await guest.getByRole('button',{name:/为.*添加 AI/}).count(),0);
  await guest.locator('.lan-room-ai-inspect').first().click();
  await guest.getByRole('button',{name:'返回舰船列表',exact:true}).click();
  passed.push('guest sees AI ships and loadouts but has no mutation controls');
  await guest.locator('.lan-editor-footer').getByRole('button',{name:'离开房间',exact:true}).click();
  await guest.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
  await until(()=>latest.members.length===1,'guest leaves test room');
  await guestContext.close();

  await page.getByRole('button',{name:'编队规则 · 2 队',exact:true}).click();
  await page.getByRole('button',{name:'每人独立一队',exact:true}).click();
  await until(()=>latest.options.assignment==='solo','solo options');
  await page.getByRole('button',{name:'返回改装',exact:true}).click();
  await page.locator('.lan-solo-ai .lan-room-ai-row').first().waitFor();
  assert.equal(await page.locator('.lan-room-roster .lan-team').count(),2);
  assert.match(await page.locator('.lan-solo-ai').innerText(),/每艘独立成队 · 同配装仅合并显示/);
  assert.equal(latest.options.aiHulls.filter(row=>row.length>1).length,0,'every solo AI stays independent');
  const group=page.locator('.lan-solo-ai .lan-room-ai-row').filter({hasText:'布局方案 1'});
  await group.getByLabel('20 艘',{exact:true}).waitFor();
  const revision=latest.options.aiRevision;
  await group.getByRole('button',{name:/增加一艘 AI/}).click();
  await until(()=>latest.options.aiRevision>revision,'solo increment');
  await group.getByLabel('21 艘',{exact:true}).waitFor();
  assert.equal(latest.options.aiHulls.filter(row=>row.length>1).length,0);
  passed.push('solo mode groups identical AI for display only; each ship retains its own combat team');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed,errors},null,2));
} finally { await browser?.close(); await app.close(); }
