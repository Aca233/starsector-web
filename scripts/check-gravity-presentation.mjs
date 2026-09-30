import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {createServer as netServer} from 'node:net';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out='artifacts/gravity/v8';await fs.mkdir(out,{recursive:true});
const videoOnly=process.argv.includes('--video-only');
const probe=netServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:videoOnly?{width:1280,height:900}:{width:1440,height:1000},...(videoOnly?{recordVideo:{dir:out+'/video',size:{width:1280,height:900}}}:{})}),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()]);});
 page.on('console',message=>{if(message.type()==='warning'&&message.text().includes('WebGL'))console.log(message.text());});
 if(!process.argv.includes('--render-only')&&!videoOnly){
  await page.goto(`http://127.0.0.1:${port}/?view=design`);await page.locator('#refit-hull-search').fill('万有引力');await page.locator('[data-hull-id="web_gravity"]').click();
  const fits=['万有引力 · 潮汐攻坚','万有引力 · 引力控场'];
  for(const [i,name] of fits.entries()){
   await page.getByRole('button',{name:/装配方案.*V/}).click();await page.getByRole('button',{name:'预览装配方案：'+name,exact:true}).click();await page.getByRole('button',{name:/^确认/}).click();
   await page.locator('.source-variant-picker').waitFor({state:'hidden'});
   const key=await page.evaluate(async()=>(await import('/src/studio/DesignModel.ts')).storageKey);
   await page.waitForFunction(({key,count})=>Object.values(JSON.parse(localStorage.getItem(key)??'null')?.draft?.weapons??{}).filter(w=>w==='web_gravity_deflector').length===count,{key,count:i?4:2});
   await page.reload();await page.locator('[data-hull-id="web_gravity"]').waitFor();await page.waitForTimeout(600);await page.screenshot({path:out+`/refit-${i}.png`,fullPage:true});
   const saved=await page.evaluate(async()=>{const {readLibrary,evaluate}=await import('/src/studio/DesignModel.ts');const d=readLibrary().library.draft;return {name:d.name,weapons:d.weapons,errors:evaluate(d).errors};});
   assert.deepEqual(saved.errors,[]);assert.equal(Object.values(saved.weapons).filter(w=>w==='web_gravity_deflector').length,i?4:2);
  }
  await page.getByRole('button',{name:/^模拟战斗/}).click();await page.locator('canvas').first().waitFor({timeout:60000});
  await page.getByRole('button',{name:/^万有引力.*项配装/}).click();await page.locator('[data-loadout-option="gravity-escort"]').click();
  await page.getByRole('button',{name:'部署敌军',exact:true}).click();await page.waitForTimeout(1500);await page.screenshot({path:out+'/simulator.png',fullPage:true});
  await fs.writeFile(out+'/ui-check.json',JSON.stringify({fits,reload:true,simulatorLaunch:true,pageErrors:errors,failedRequests:failed},null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);console.log('UI: both legal fits persist; real simulator launched');
 }
 await page.route('**/__gravity_render.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#091018;color:#d7e2e9;font:16px sans-serif}header{height:42px;box-sizing:border-box;padding:10px 18px}canvas{display:block}</style><header id="label">万有引力号 · 正式舰体 / 1XL · 4M · 6S / 闭合场驱动</header><canvas width="1440" height="950"></canvas>'}));
 await page.goto(`http://127.0.0.1:${port}/__gravity_render.html`);
 if(videoOnly)await page.evaluate(()=>{const canvas=document.querySelector('canvas');canvas.width=1280;canvas.height=850;});
 const installed=await page.evaluate(async()=>{
  globalThis.__LAN_BUILD_ID__='gravity-presentation';
  const {createLanWorld}=await import('/src/network/LanWorld.ts');const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {createGravityEscort,createGravityControl}=await import('/src/studio/GravityLoadouts.ts');const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const {engine}=createLanWorld({id:'gravity-render',seed:91,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_gravity',design:createGravityEscort()},{id:'p1',seat:1,team:1,hull:'web_gravity',design:createGravityControl()}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  engine.asteroids.length=0;engine.nebulae.length=0;const s=engine.playerShip,t=engine.enemyShip;
  for(const ship of engine.allCapitalShips){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';ship.visibilityMask=0xffffffff;for(const g of ship.weaponGroups)g.isAutofire=false;}
  s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=-Math.PI/2;t.pos.set(10000,10000);t.prevPos.copy(t.pos);
  for(const w of s.weapons)w.currentAngleRad=w.prevAngleRad=s.facingRad+w.baseAngleDeg*Math.PI/180;
  for(const e of s.engineStatuses)e.currentThrust=e.prevThrust=0;
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:true});if(!gl)throw Error('WebGL2 unavailable');
  const renderer=new WebGLCombatRenderer(canvas,gl),view=combatRenderView(engine);await renderer.prepareAssets(view);
  const frame={visualTime:0,random:new VisualRandom(77),layers:new Set(['background','nebula','hull','weapon','trail','explosion','beam','shield']),damageEnabled:true};
  const camera=new Vector2(),render=(zoom=1.25)=>renderer.render(view,1,camera,zoom,frame);
  render();globalThis.__gravityPresentation={engine,s,t,gl,renderer,view,frame,render,camera,Vector2};
  return {slots:s.weapons.map(w=>({slot:w.slotId,id:w.spec.id})),error:gl.getError()};
 });assert.equal(installed.error,0);assert.equal(installed.slots.length,11);await page.screenshot({path:out+'/installed-hull.png'});
 if(videoOnly){
  const fx=await page.evaluate(async()=>{
   const {engine,s,t,gl,frame,render,camera,renderer}=globalThis.__gravityPresentation;
   const {updateGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');updateGraphicsSettings({screenShake:0,maxFrameRate:0});
   s.pos.set(-450,190);s.prevPos.copy(s.pos);t.pos.set(390,-230);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=Math.PI/2;
   camera.set(30,-10);s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;s.selectedGroupIndex=0;
   for(let i=0;i<30;i++)engine.fixedUpdate(1/60);s.system.activate();for(let i=0;i<20;i++)engine.fixedUpdate(1/60);
   renderer.arcAnimProgress=0;renderer.arcFadeState='HIDDEN';frame.visualTime=engine.combatTime;
   const pixels=()=>{render(.65);const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
   const first=pixels(),paused=pixels();let pauseChanges=0;for(let i=0;i<first.length;i++)if(first[i]!==paused[i])pauseChanges++;
   frame.layers.delete('beam');frame.layers.delete('explosion');const disabled=pixels();let effectChanges=0;for(let i=0;i<first.length;i++)if(first[i]!==disabled[i])effectChanges++;
   frame.layers.add('beam');frame.layers.add('explosion');updateGraphicsSettings({renderScale:.75});render(.65);const reducedError=gl.getError();updateGraphicsSettings({renderScale:1});
   const start=engine.combatTime,renderMs=[];let g=false,rmb=false,vent=false,count=0,maxLensDraws=0,last=performance.now();
   await new Promise(resolve=>{
    function animate(now){
     const dt=Math.min(.06,(now-last)/1000);last=now;for(let left=dt;left>1e-8;left-=1/60)engine.fixedUpdate(Math.min(1/60,left));
     const age=engine.combatTime-start;
     if(age>2&&!g){g=true;s.systems[1].activate();}
     if(age>3.7&&!rmb){rmb=true;s.activateDefenseSystem();}
     if(age>5&&!vent){vent=true;s.isFiringMain=false;s.flux.startVenting();}
     document.querySelector('#label').textContent=age<2?'潮汐牵引 · 重力井':age<3?'潮汐坍缩':age<4.7?'全向排斥':'排散与退场';
     frame.visualTime=engine.combatTime;const renderStart=performance.now();render(.65);renderMs.push(performance.now()-renderStart);count++;maxLensDraws=Math.max(maxLensDraws,renderer.gravityLens?.drawCalls??0);
     if(age>7)resolve();else requestAnimationFrame(animate);
    }requestAnimationFrame(animate);
   });
   renderMs.sort((a,b)=>a-b);
   return {pauseChanges,effectChanges,reducedError,error:gl.getError(),frames:count,maxLensDraws,copyTextureBytes:renderer.gravityLens?.textureBytes??0,renderCpuMs:{median:renderMs[Math.floor(renderMs.length*.5)],p95:renderMs[Math.floor(renderMs.length*.95)],scope:'CPU submission of the complete renderer, two-ship headless Edge scene; no GPU frame-time or fleet performance claim.'}};
  });
  assert.equal(fx.pauseChanges,0);assert(fx.effectChanges>100);assert.equal(fx.reducedError,0);assert.equal(fx.error,0);assert(fx.maxLensDraws>0);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);fx.pageErrors=errors;fx.failedRequests=failed;
  await page.close();await page.video().saveAs(out+'/gravity-effects-v8.webm');await fs.writeFile(out+'/fx-check.json',JSON.stringify(fx,null,2));console.log(JSON.stringify(fx));
 }else{
 const well=await page.evaluate(()=>{
  const {engine,s,t,gl,frame,render,camera}=globalThis.__gravityPresentation;
  s.pos.set(-320,200);s.prevPos.copy(s.pos);t.pos.set(380,-350);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=Math.PI/2;
  s.aimTargetWorld.set(380,-250);if(!s.system.activate())throw Error('F not accepted');s.selectedGroupIndex=0;s.isFiringMain=true;s.aimTargetWorld.copy(t.pos);
  for(let i=0;i<70;i++)engine.fixedUpdate(1/60);
  frame.visualTime=engine.combatTime;camera.set(80,-100);render(.65);
  document.querySelector('#label').textContent='F 固定引力井 + 左键实体牵引 · 目标位置、拖锚与受力来自真实状态';
  return {field:s.system.gravityField,grip:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor,error:gl.getError()};
 });assert.equal(well.error,0);assert.equal(well.grip.phase,'HOLD');assert.equal(well.field.kind,'WELL');await page.screenshot({path:out+'/well-and-tractor.png'});
 const wave=await page.evaluate(()=>{
  const {engine,s,gl,frame,render}=globalThis.__gravityPresentation;
  if(!s.activateDefenseSystem())throw Error('RMB not accepted');for(let i=0;i<28;i++)engine.fixedUpdate(1/60);
  frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='右键全向排斥 · 真实波前扩张 / 牵引已释放 / F 引力井独立维持';
  return {wave:s.defenseSystem.gravityField,well:s.system.gravityField,grip:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor,error:gl.getError()};
 });assert.equal(wave.error,0);assert(wave.wave.radius>300);assert(wave.well);assert.equal(wave.grip.phase,'IDLE');await page.screenshot({path:out+'/repulsor-wave.png'});
 const remote=await page.evaluate(()=>{
  const {engine,s,gl,frame,render}=globalThis.__gravityPresentation;
  if(!s.systems[1].activate())throw Error('G not accepted');for(let i=0;i<32;i++)engine.fixedUpdate(1/60);
  frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='G 潮汐坍缩 · 原井固定位置 / 0.45秒预警后真实范围伤害';
  return {wave:s.systems[1].gravityField,well:s.system.gravityField,error:gl.getError()};
 });assert.equal(remote.error,0);assert.equal(remote.well,undefined);assert.equal(remote.wave.kind,'COLLAPSE');assert(remote.wave.collapseApplied);await page.screenshot({path:out+'/collapse.png'});
 const ai=await page.evaluate(async()=>{
  const {engine:e}=globalThis.__gravityPresentation;const {CapitalShipAI}=await import('/src/engine/ai/CapitalShipAI.ts');
  e.externallyControlledShipIds.clear();e.playerShip.fireControlMode=e.enemyShip.fireControlMode='AI';
  e.playerShip.pos.set(-650,0);e.enemyShip.pos.set(650,0);e.playerShip.vel.set(0,0);e.enemyShip.vel.set(0,0);e.playerShip.facingRad=0;e.enemyShip.facingRad=Math.PI;
  for(const ship of e.allCapitalShips){ship.flux.softFlux=0;for(const sys of ship.allSystems)sys.reset();for(const g of ship.weaponGroups)g.isAutofire=g.index!==0;}
  const playerAI=new CapitalShipAI(e.playerShip,e.enemyShip),seen=new Set(),systems=new Set();let holdTicks=0,ticks=0;
  const armorSum=s=>{let sum=0;for(let c=0;c<s.armor.cols;c++)for(let r=0;r<s.armor.rows;r++)sum+=s.armor.getCell(c,r);return sum;};
  const start=e.allCapitalShips.map(s=>s.hullHp),armorBefore=e.allCapitalShips.map(armorSum);
  for(;ticks<2700&&!e.playerShip.isDead&&!e.enemyShip.isDead;ticks++){
   e.updateShipAI(playerAI,1/60);e.fixedUpdate(1/60);
   for(const p of e.projectiles)if(p.specId)seen.add(p.specId);
   for(const s of e.allCapitalShips){for(const sys of s.allSystems)if(sys.isActive)systems.add(sys.type);if(s.weapons.some(w=>w.gravityTractor?.phase==='HOLD'))holdTicks++;}
  }
  if(!e.ships.every(s=>Number.isFinite(s.pos.x+s.pos.y+s.vel.x+s.vel.y)))throw Error('Invalid AI motion');
  return {seconds:ticks/60,seen:[...seen],systems:[...systems],holdTicks,start,finish:e.allCapitalShips.map(s=>s.hullHp),armorBefore,armorAfter:e.allCapitalShips.map(armorSum),flux:e.allCapitalShips.map(s=>s.flux.totalFlux),positions:e.allCapitalShips.map(s=>[s.pos.x,s.pos.y])};
 });assert(ai.seen.includes('web_gravity_calibrator'));assert(ai.systems.includes('WEB_GRAVITY_BATTLE_WELL'));assert(ai.holdTicks>0);assert(ai.systems.includes('WEB_GRAVITY_COLLAPSE'));
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 await fs.writeFile(out+'/presentation-check.json',JSON.stringify({installed,well,wave,remote,ai,pageErrors:errors,failedRequests:failed,scope:'Production WebGL, actual state stages, background UI and limited natural AI functional check. No live multiplayer or final balance claim.'},null,2));
 console.log(JSON.stringify({renderErrors:errors,ai},null,2));
 }
}finally{await browser?.close();await server.close();}
