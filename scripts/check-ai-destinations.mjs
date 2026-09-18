/** Hover fit -> click destination regression. Isolated relay and browser, no user room/profile.
 * Build artifacts/ai-destination-final; PLAYWRIGHT_PACKAGE / NODE_PATH supplies Playwright.
 * LAN_TEST_DIST and BROWSER_PATH are optional overrides. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLanServer } from '../server/lan-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const app=await createLanServer({host:'127.0.0.1',port:0,dist:resolve(process.env.LAN_TEST_DIST||'artifacts/ai-destination-final')});
const base='http://127.0.0.1:'+app.server.address().port;
const until=async(fn,label)=>{const end=Date.now()+8000;while(!fn()){if(Date.now()>end)throw Error('Timed out: '+label);await new Promise(r=>setTimeout(r,25));}};
let browser;const passed=[],errors=[];
try {
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:900}});context.setDefaultTimeout(8000);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  let latest,wire,hold=false,release,reject=false;const commands=[];
  await page.routeWebSocket('**/*',route=>{
    const server=route.connectToServer();wire=server;
    route.onMessage(raw=>{const m=JSON.parse(String(raw));commands.push(m);if(reject&&m.type==='ai'){reject=false;route.send(JSON.stringify({type:'error',requestId:m.requestId,message:'测试：目标队伍已变化'}));return;}server.send(raw);});
    server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='room')latest=m.room;if(hold&&m.type==='ai-configured'){release=()=>route.send(raw);return;}route.send(raw);});
  });
  await page.goto(base+'/?view=lan#host=1&name=目标队伍验收');
  await page.getByRole('button',{name:'添加 AI 对手',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索 AI 舰船'}).fill('攻势');
  const hull=page.getByRole('button',{name:'选择 攻势 舰体',exact:true});
  await hull.hover();
  const popup=page.locator('.sim-loadout-picker'), fit=name=>popup.getByRole('button',{name:'配装 '+name,exact:true});
  const target=(preset,count,team)=>popup.getByRole('button',{name:preset+' · 添加 '+count+' 艘到 '+team,exact:true});
  await fit('标准').hover();
  assert.equal(await popup.locator('.sim-loadout-destination').count(),2);
  assert.equal(commands.filter(c=>c.type==='ai').length,0);
  const beforeBox=await popup.boundingBox();
  await fit('精英').hover();
  assert.equal(await target('精英',1,'A 队').count(),1);
  assert.equal(await target('标准',1,'A 队').count(),0);
  const afterBox=await popup.boundingBox();assert.deepEqual(afterBox,beforeBox,'hover does not move popup');
  await target('精英',1,'A 队').hover();
  await page.waitForTimeout(450);
  assert.equal(await popup.isVisible(),true,'unpinned pane crossing keeps flyout open');
  passed.push('hover previews destinations for the pointed fit without adding or moving the popup');

  // Click-to-pin supports touch, and crossing the pane stays inside the hover boundary.
  await fit('标准').click();
  assert.equal(await popup.getAttribute('data-pinned'),'true');
  assert.equal(commands.filter(c=>c.type==='ai').length,0);
  const destinationBox=await target('标准',1,'A 队').boundingBox();
  await page.mouse.move(destinationBox.x+destinationBox.width/2,destinationBox.y+destinationBox.height/2,{steps:20});
  assert.equal(await target('标准',1,'A 队').count(),1,'diagonal motion must not replace the selected fit');
  await page.waitForTimeout(450); // Longer than the existing 350ms hull hover-close grace period.
  assert.equal(await popup.isVisible(),true);
  let revision=latest.options.aiRevision??0;
  await target('标准',1,'A 队').click();await until(()=>latest.options.aiRevision>revision,'add A');
  await popup.getByRole('status').filter({hasText:'服务器已确认'}).waitFor();
  assert.equal(latest.options.aiHulls[0].length,1);assert.equal(latest.options.aiHulls[1].length,0);
  assert.equal(commands.filter(c=>c.type==='ai').at(-1).team,0);
  assert.equal(await popup.isVisible(),true);
  revision=latest.options.aiRevision??0;
  await target('标准',1,'B 队').click();await until(()=>latest.options.aiRevision>revision,'add B');
  await popup.getByRole('status').filter({hasText:'服务器已确认'}).waitFor();
  assert.equal(latest.options.aiHulls[1].length,1);
  assert.equal(latest.options.aiHulls[0][0],latest.options.aiHulls[1][0]);
  passed.push('clicking A then B directly distributes the same fit, independent of the selected top tab');

  await popup.getByRole('button',{name:'关闭配装选择'}).click();
  await page.getByRole('spinbutton',{name:'每次添加数量'}).fill('5');
  await hull.click();await fit('老式').hover();
  hold=true;const requests=commands.filter(c=>c.type==='ai').length;
  await target('老式',5,'A 队').click();await until(()=>release,'hold receipt');
  assert.equal(await target('老式',5,'B 队').isDisabled(),true);
  await target('老式',5,'B 队').evaluate(button=>button.click());
  assert.equal(commands.filter(c=>c.type==='ai').length,requests+1);
  assert.equal(commands.filter(c=>c.type==='ai').at(-1).count,5);
  hold=false;release();release=null;
  await popup.getByRole('status').filter({hasText:'服务器已确认'}).waitFor();
  assert.equal(latest.options.aiHulls[0].length,6);
  passed.push('batch size is honored; pending acknowledgement locks every destination and prevents duplicate add');

  reject=true;revision=latest.options.aiRevision??0;
  await target('老式',5,'B 队').click();
  await popup.getByRole('status').filter({hasText:'测试：目标队伍已变化'}).waitFor();
  assert.equal(latest.options.aiRevision,revision);assert.equal(await target('老式',5,'B 队').isEnabled(),true);
  passed.push('rejected target add leaves fleet unchanged, stays open and releases lock');

  await fit('标准').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await target('标准',5,'A 队').evaluate(e=>e===document.activeElement),true);
  await page.keyboard.press('ArrowLeft');assert.equal(await fit('标准').evaluate(e=>e===document.activeElement),true);
  const keyboardBefore=commands.filter(c=>c.type==='ai').length;
  await page.keyboard.press('Enter');assert.equal(commands.filter(c=>c.type==='ai').length,keyboardBefore);
  await page.keyboard.press('ArrowRight');revision=latest.options.aiRevision??0;await page.keyboard.press('Enter');
  await until(()=>latest.options.aiRevision>revision,'keyboard destination');
  passed.push('keyboard right enters target list, left returns to fit, Enter adds only on a target');

  await popup.getByRole('button',{name:'关闭配装选择'}).click();
  await page.getByRole('spinbutton',{name:'每次添加数量'}).fill('0');await hull.click();await fit('标准').hover();
  assert.equal(await popup.locator('.sim-loadout-destination:not(:disabled)').count(),0);
  assert.match(await popup.locator('.sim-loadout-destinations').innerText(),/数量须为正整数/);
  await popup.getByRole('button',{name:'关闭配装选择'}).click();
  await page.getByRole('spinbutton',{name:'每次添加数量'}).fill('1');
  passed.push('invalid quantity disables all team actions');

  // Add empty destination teams only to this fixture room; the popup must scroll, not grow.
  revision=latest.options.aiRevision??0;
  wire.send(JSON.stringify({type:'options',baseRevision:revision,options:{assignment:'teams',aiHulls:[...latest.options.aiHulls,...Array.from({length:14},()=>[])]}}));
  await until(()=>latest.options.aiHulls.length===16,'sixteen targets');
  await hull.click();await fit('标准').hover();
  const scroll=await popup.locator('.sim-loadout-destination-list').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));assert.ok(scroll.scroll>scroll.height);
  revision=latest.options.aiRevision??0;await target('标准',1,'P 队').click();await until(()=>latest.options.aiRevision>revision,'last team');
  assert.equal(latest.options.aiHulls[15].length,1);
  passed.push('many teams remain in a bounded scroll pane; last target receives the chosen design');

  const shots=resolve('artifacts/ai-destination-tests');await mkdir(shots,{recursive:true});
  for(const viewport of [{width:1440,height:900},{width:1280,height:740},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await fit('精英').hover();
    await popup.locator('.sim-loadout-destination-list').evaluate(e=>{e.scrollTop=0;});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const bounds=await popup.evaluate(e=>{const r=e.getBoundingClientRect(),list=e.querySelector('.sim-loadout-list').getBoundingClientRect(),right=e.querySelector('.sim-loadout-destinations').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,sideBySide:right.left>=list.right,overflow:e.scrollWidth>e.clientWidth};});
    assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=bounds.w&&bounds.bottom<=bounds.h);assert.equal(bounds.sideBySide,true);assert.equal(bounds.overflow,false);
    await page.screenshot({path:resolve(shots,viewport.width+'x'+viewport.height+'.png')});
  }
  passed.push('desktop, small and 390px layouts keep destinations on the right and within the viewport');

  await page.setViewportSize({width:1440,height:900});await popup.getByRole('button',{name:'关闭配装选择'}).click();
  await page.getByRole('button',{name:'完成编成',exact:true}).click();
  await page.getByRole('button',{name:'编队规则 · 16 队',exact:true}).click();
  await page.getByRole('button',{name:'每人独立一队',exact:true}).click();await until(()=>latest.options.assignment==='solo','solo');
  await page.getByRole('button',{name:'返回改装',exact:true}).click();
  await page.getByRole('button',{name:/添加 \/ 批量管理 AI/}).click();
  await page.getByRole('textbox',{name:'搜索 AI 舰船'}).fill('攻势');await hull.click();await fit('精英').hover();
  assert.equal(await popup.locator('.sim-loadout-destination').count(),1);
  revision=latest.options.aiRevision??0;await target('精英',1,'独立阵营').click();await until(()=>latest.options.aiRevision>revision,'solo add');
  assert.equal(latest.options.aiHulls.some(row=>row.length>1),false);
  passed.push('solo mode offers independent factions only and preserves one combat team per ship');

  const guestContext=await browser.newContext({viewport:{width:1280,height:740}});guestContext.setDefaultTimeout(8000);
  const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));
  await guest.goto(base+'/?view=lan&room='+latest.code+'#name=只读验收');await guest.getByRole('button',{name:'加入房间',exact:true}).click();
  await guest.getByRole('button',{name:/查看 AI 编成/}).click();await guest.getByRole('textbox',{name:'搜索 AI 舰船'}).fill('攻势');
  await guest.getByRole('button',{name:'选择 攻势 舰体',exact:true}).click();
  assert.equal(await guest.locator('.sim-loadout-destination').count(),0);assert.equal(await guest.locator('.sim-loadout-option').count(),3);
  passed.push('guest keeps selection-only picker with no destination mutation actions');await guestContext.close();

  const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});touchContext.setDefaultTimeout(8000);
  const touch=await touchContext.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(base+'/?view=lan#host=1&name=触屏验收');
  await touch.getByRole('button',{name:'添加 AI 对手',exact:true}).tap();await touch.getByRole('textbox',{name:'搜索 AI 舰船'}).fill('攻势');
  await touch.getByRole('button',{name:'选择 攻势 舰体',exact:true}).tap();await touch.getByRole('button',{name:'配装 标准',exact:true}).tap();
  await touch.getByRole('button',{name:'标准 · 添加 1 艘到 B 队',exact:true}).tap();
  await touch.locator('.sim-loadout-action-status').filter({hasText:'服务器已确认'}).waitFor();
  passed.push('touch can tap hull, fit and destination without needing hover');await touchContext.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,errors},null,2));
} finally {await browser?.close();await app.close();}
