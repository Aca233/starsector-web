import {checkRocinanteFireControlUI} from './lib/rocinante-firecontrol-browser.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {createServer as netServer} from 'node:net';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out='artifacts/rocinante/delivery';await fs.mkdir(out,{recursive:true});
const probe=netServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)requests.push([r.status(),r.url()]);});
 await page.goto(`http://127.0.0.1:${port}/?view=design`);
 await page.locator('#refit-hull-search').fill('罗西南特');
 await page.locator('[data-hull-id="web_expanse_rocinante"]').click();
 await page.waitForTimeout(700);
 if(process.argv.includes('--fire-control-only')) {
  await checkRocinanteFireControlUI(page,out);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 } else {
 const text=await page.locator('body').innerText();await fs.writeFile(out+'/studio-text.txt',text);
 await page.screenshot({path:out+'/studio.png',fullPage:true});
 const delivery=await page.evaluate(async()=>{
  const {createRocinanteSkirmish,createRocinanteHunter}=await import('/src/studio/RocinanteLoadouts.ts');
  const {readLibrary,storageKey}=await import('/src/studio/DesignModel.ts');
  const fits=[createRocinanteSkirmish(),createRocinanteHunter()];
  const library={version:1,draft:fits[0],designs:fits};
  localStorage.setItem(storageKey,JSON.stringify(library));
  const read=readLibrary();if(read.error||read.library.designs.length!==2)throw Error('Actual browser save/read failed');
  const {rocinanteShips}=await import('/src/engine/content/RocinantePack.ts');
  const {rocinanteWeapons}=await import('/src/engine/content/RocinanteArmory.ts');
  return {id:'web_expanse_rocinante_pack',name:'罗西南特号',version:'1.0.0',author:'Local Web adaptation',description:'Requires the current Starsector Web host with Rocinante system/hullmod extensions. No other custom ship required.',ships:rocinanteShips(),weapons:rocinanteWeapons(),fits};
 });
 await fs.writeFile(out+'/package-data.json',JSON.stringify(delivery,null,2));
 await page.reload();await page.getByRole('region',{name:'已安装舰体插件'}).waitFor();
 assert.ok((await page.locator('body').innerText()).includes('反冲补偿架'));await page.waitForTimeout(700);await page.screenshot({path:out+'/skirmish-refit.png',fullPage:true});
 await page.getByRole('button',{name:/^模拟战斗/}).click();
 await page.locator('canvas').first().waitFor({timeout:60000});
 await page.waitForTimeout(1500);
 await page.getByRole('button',{name:/^罗西南特号 · .*项配装/}).click();
 await page.locator('[data-loadout-option="rocinante-hunter"]').click();
 await page.getByRole('button',{name:'部署敌军',exact:true}).click();
 await page.waitForTimeout(600);
 await fs.writeFile(out+'/simulator-text.txt',await page.locator('body').innerText());
 await page.screenshot({path:out+'/simulator.png',fullPage:true});
 // Separate background render surface using the REAL production renderer/specs.
 const p=await browser.newPage({viewport:{width:1100,height:880},deviceScaleFactor:1});p.on('pageerror',e=>errors.push(String(e)));
 await p.route('**/__roci_delivery.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#091018;color:#b6c6d4;font:16px sans-serif}header{padding:18px}canvas{display:block}</style><header>罗西南特 · 正式舰体 / 6门近防 / 腹侧轴炮 / 肩部鱼雷口<br>生产渲染：无护盾、单主引擎、按实际转动点亮的RCS</header><canvas id="battle" width="1100" height="770"></canvas>'}));
 await p.goto(`http://127.0.0.1:${port}/__roci_delivery.html`);
 const result=await p.evaluate(async()=>{
  window.__LAN_BUILD_ID__='roci-delivery';
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const engine=createLanWorld({id:'render',seed:929,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_expanse_rocinante'},{id:'p1',seat:1,team:1,hull:'web_expanse_rocinante'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  const ship=engine.playerShip;engine.enemyShip.pos.set(10000,10000);engine.enemyShip.prevPos.copy(engine.enemyShip.pos);engine.asteroids.length=0;
  ship.pos.set(0,25);ship.facingRad=-Math.PI/2;ship.throttle=1;ship.turnInput=1;ship.visibilityMask=0xffffffff;
  for(let i=0;i<30;i++)ship.update(1/60,null,()=>{},()=>{},undefined,{ships:[ship],missiles:[],asteroids:[]});
  ship.pos.set(0,25);ship.prevPos.copy(ship.pos);ship.facingRad=-Math.PI/2;ship.prevFacingRad=ship.facingRad;
  for(const m of ship.weapons){m.currentAngleRad=ship.facingRad+m.baseAngleDeg*Math.PI/180;m.prevAngleRad=m.currentAngleRad;}
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});if(!gl)throw Error('WebGL2 unavailable');
  const renderer=new WebGLCombatRenderer(canvas,gl),view=combatRenderView(engine);await renderer.prepareAssets(view);
  const frame={visualTime:1,random:new VisualRandom(929),layers:new Set(['hull','weapon','trail','explosion','beam']),damageEnabled:true};
  renderer.render(view,1,new Vector2(),2,frame);const before=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,before);
  renderer.render(view,1,new Vector2(),2,{...frame,visualTime:1.25});const after=new Uint8Array(before.length);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,after);
  let diff=0;for(let i=0;i<before.length;i++)if(before[i]!==after[i])diff++;
  if(!diff||gl.getError()!==gl.NO_ERROR)throw Error('Animation/GL check failed');
  return {animatedChannelChanges:diff,slots:ship.weapons.map(w=>({slot:w.slotId,weapon:w.spec.id})),engineLevels:ship.engineStatuses.map(e=>e.currentThrust)};
 });
 await p.screenshot({path:out+'/production-render.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 await fs.writeFile(out+'/visual-check.json',JSON.stringify({...result,errors,requests,actualBrowserSaveRead:true,port},null,2));
 console.log(JSON.stringify({result,errors,requests}));
 }
}finally{await browser?.close();await server.close();}
