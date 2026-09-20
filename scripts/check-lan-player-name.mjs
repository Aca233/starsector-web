/** Browser nickname persistence against a real isolated LAN server; no user storage is touched. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createLanServer} from '../server/lan-server.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const key='starsector.multiplayer.player-name.v1';
const app=await createLanServer({host:'127.0.0.1',port:0,isolated:false,dist:resolve(process.env.LAN_TEST_DIST??'dist')});
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const passed=[], errors=[];
const until=async(predicate,label)=>{const end=Date.now()+12000;while(!predicate()){if(Date.now()>end)throw Error('Timed out: '+label);await new Promise(r=>setTimeout(r,20));}};
async function open(context,url='/?view=lan'){
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const state={page,room:null,id:null,messages:[]};
 await page.routeWebSocket('**/*',route=>{const server=route.connectToServer();route.onMessage(raw=>{const m=JSON.parse(String(raw));state.messages.push(m);server.send(raw);});server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='welcome')state.id=m.id;if(m.type==='room')state.room=m.room;route.send(raw);});});
 await page.goto(base+url);return state;
}
const mine=state=>state.room?.members.find(m=>m.id===state.id);
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'null'),key);
async function leave(state){await state.page.locator('.lan-editor-footer').getByRole('button',{name:'离开房间',exact:true}).click();await state.page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await state.page.locator('#lan-player-name').waitFor();}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const host=await open(context);const page=host.page;
 await page.locator('#lan-player-name').waitFor();
 const before=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
 await page.locator('#lan-player-name').fill('  房间小明  ');
 assert.deepEqual(await saved(page),{version:1,name:'房间小明'});
 await page.reload();assert.equal(await page.locator('#lan-player-name').inputValue(),'房间小明');
 await page.getByRole('button',{name:'创建房间',exact:true}).click();await until(()=>mine(host),'host room');
 assert.equal(mine(host).name,'房间小明');assert.equal(host.messages.find(m=>m.type==='hello').name,'房间小明');
 assert.notEqual(mine(host).design?.captainProfile?.name,'房间小明','entry nickname is not the captain profile');
 passed.push('typed Chinese nickname saves automatically, reload restores it, and real create/hello use the same trimmed name');
 const guestContext=await browser.newContext({viewport:{width:1440,height:1000}});
 const guest=await open(guestContext,'/?view=lan&room='+host.room.code);
 assert.equal(await guest.page.locator('#lan-player-name').inputValue(),'玩家','different browser does not inherit nickname');
 await guest.page.locator('#lan-player-name').fill('加入者');await guest.page.getByRole('button',{name:'加入房间',exact:true}).click();
 await until(()=>mine(guest)&&host.room.members.some(m=>m.name==='加入者'),'guest visible');
 assert.equal(mine(guest).name,'加入者');
 await leave(guest);await guest.page.getByRole('button',{name:'返回主菜单',exact:true}).click();await guest.page.waitForURL(url=>!url.search.includes('view=lan'));
 await guest.page.close();const freshGuest=await open(guestContext);
 assert.equal(await freshGuest.page.locator('#lan-player-name').inputValue(),'加入者');
 assert.equal(await freshGuest.page.evaluate(()=>sessionStorage.getItem('starsector.lan.session.v5')),null);
 passed.push('real joining sends the nickname; leaving, intentional disconnect and a new tab retain it without retaining a resume token');
 await leave(host);await page.getByRole('button',{name:'返回主菜单',exact:true}).click();await page.waitForURL(url=>!url.search.includes('view=lan'));await page.close();
 const fresh=await open(context);assert.equal(await fresh.page.locator('#lan-player-name').inputValue(),'房间小明');
 const after=await fresh.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k!== 'starsector.multiplayer.player-name.v1').map(k=>[k,localStorage.getItem(k)])));
 assert.deepEqual(after,before,'nickname changes do not overwrite the standalone design library or unrelated local storage');
 await fresh.page.close();
 const auto=await open(context,'/?view=lan#host=1');await until(()=>mine(auto),'automatic host using saved nickname');assert.equal(mine(auto).name,'房间小明');
 passed.push('new-tab and auto-host paths use the independent local preference, not the default or a deleted session');
 const explicitContext=await browser.newContext({viewport:{width:1440,height:1000}});
 const explicit=await open(explicitContext,'/?view=lan#host=1&name='+encodeURIComponent('链接名称'));await until(()=>mine(explicit),'explicit host');assert.equal(mine(explicit).name,'链接名称');assert.equal((await saved(explicit.page)).name,'链接名称');
 passed.push('explicit redirect nickname is persisted at the destination origin and used for the connection');
 await freshGuest.page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('quota','QuotaExceededError');return original.call(this,k,v);};},key);
 await freshGuest.page.locator('#lan-player-name').fill('本次临时名称');await freshGuest.page.getByRole('alert').filter({hasText:'玩家名称未能保存到浏览器'}).waitFor();
 assert.equal(await freshGuest.page.locator('#lan-player-name').inputValue(),'本次临时名称');assert.equal((await saved(freshGuest.page)).name,'加入者');
 await freshGuest.page.screenshot({path:'artifacts/lan-player-name-storage-warning.png'});
 passed.push('storage failure visibly warns, keeps the in-memory input, and preserves the last stored nickname');
 const legacyContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await legacyContext.addInitScript(()=>sessionStorage.setItem('starsector.lan.session.v5',JSON.stringify({name:'旧版昵称',build:'obsolete-build',token:'a'.repeat(64),url:location.origin.replace(/^http/,'ws')+'/lan/ws'})));
 const legacy=await open(legacyContext);await legacy.page.locator('#lan-player-name').waitFor();assert.equal(await legacy.page.locator('#lan-player-name').inputValue(),'旧版昵称');
 assert.equal((await saved(legacy.page)).name,'旧版昵称');assert.equal(legacy.messages.length,0,'migrating a name must not revive an expired session');
 passed.push('old-build nickname migrates without reconnecting with an obsolete resume token');
 // The Steam service is mocked only for entrance/default-name behavior; no real Steam lobby is created.
 const steamContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await steamContext.addInitScript(({key})=>localStorage.setItem(key,JSON.stringify({version:1,name:'玩家'})),{key});
 await steamContext.route('**/steam/status',route=>route.fulfill({json:{service:'starsector-web-steam',available:true,name:'Steam账号名称',lobby:null}}));
 const steam=await open(steamContext,'/?view=steam');await steam.page.locator('#steam-player-name').waitFor();assert.equal(await steam.page.locator('#steam-player-name').inputValue(),'玩家');
 await steam.page.locator('#steam-player-name').fill('Steam自选昵称');await steam.page.waitForTimeout(2200);assert.equal(await steam.page.locator('#steam-player-name').inputValue(),'Steam自选昵称');assert.equal((await saved(steam.page)).name,'Steam自选昵称');
 passed.push('Steam status polling does not overwrite a saved or edited nickname, including an explicitly saved 玩家');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed},null,2));
}finally{await browser.close();await app.close();}
