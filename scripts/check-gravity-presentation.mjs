import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {createServer as netServer} from 'node:net';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const effectsOnly=process.argv.includes('--effects-only');
const areaOnly=effectsOnly||process.argv.includes('--area-only');
const leftOnly=process.argv.includes('--left-click-only'),selfOnly=process.argv.includes('--self-tow-only'),pushOnly=process.argv.includes('--push-only');
const out=effectsOnly?'artifacts/gravity/v15-feedback':areaOnly?'artifacts/gravity/v14-auto-area':pushOnly?'artifacts/gravity/v14-independent-input':selfOnly?'artifacts/gravity/v12-self-tow':leftOnly?'artifacts/gravity/v11-left-click':'artifacts/gravity/v10-support';await fs.mkdir(out,{recursive:true});
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
  const canvas=page.locator('canvas').first();const box=await canvas.boundingBox();assert(box);
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55);
  await page.waitForFunction(()=>document.querySelector('.gravity-tractor-hud')?.style.display==='none');
  await page.keyboard.down('f');
  await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-status')].some(e=>e.textContent.includes('操纵中')),{},{timeout:15000});
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);await page.keyboard.up('f');
  await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-status')].some(e=>e.textContent.includes('驻留')),{},{timeout:5000});
  await page.mouse.down({button:'right'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-status')].some(e=>e.textContent.includes('对准实体推送')||e.textContent==='定向推送'),{},{timeout:5000});
  await page.mouse.up({button:'right'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-status')].some(e=>e.textContent.includes('按住右键')),{},{timeout:5000});
  await page.keyboard.press('g');
  await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-button')].some(e=>e.textContent.includes('紧急排斥')&&e.textContent.includes('冷却')),{},{timeout:5000});
  if(areaOnly){
   await page.keyboard.down('f');await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-status')].some(e=>e.textContent.includes('操纵中')));await page.keyboard.up('f');
   await page.mouse.down({button:'right'});await page.waitForFunction(()=>document.querySelector('[data-gravity-area="repulsion"]')?.style.display==='block');await page.mouse.up({button:'right'});
   await page.waitForFunction(()=>document.querySelector('[data-gravity-area="attraction"]')?.style.display==='block');
   await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-status')].some(e=>e.textContent.includes('自动坍缩预警')||e.textContent.includes('到期潮汐爆')),{},{timeout:16000});
   await page.waitForFunction(()=>[...document.querySelectorAll('.hud-system-button')].some(e=>e.textContent.includes('区域操纵')&&e.textContent.includes('冷却')),{},{timeout:5000});
  }
  await page.screenshot({path:out+'/controls-in-cockpit.png',fullPage:true});
  await fs.writeFile(out+'/ui-check.json',JSON.stringify({fits,reload:true,simulatorLaunch:true,heldF:true,releasedF:true,heldRightPush:true,rightRelease:true,independentG:true,areaRepulsionByRight:areaOnly,autoExpiredWithoutG:areaOnly,pageErrors:errors,failedRequests:failed},null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);console.log('UI: both legal fits persist; real simulator launched');
 }
 await page.route('**/__gravity_render.html',async r=>r.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/__gravity_render.html','<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#091018;color:#d7e2e9;font:16px sans-serif}header{height:42px;box-sizing:border-box;padding:10px 18px}canvas{display:block}</style><header id="label">万有引力号 · 正式舰体 / 1XL · 4M · 6S / 闭合场驱动</header><canvas width="1440" height="950"></canvas>')}));
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
 if(areaOnly){
  await page.evaluate(async()=>{
   const {engine,s,t,frame,render,camera}=globalThis.__gravityPresentation;
   const {mountGravityHudPreview}=await import('/scripts/gravity-v8-scenarios.mjs'),{dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts'),{applyGravityPushHold,applyGravityControlHold}=await import('/src/engine/simulation/systems/GravityControlInput.ts');
   Object.assign(globalThis.__gravityPresentation,{dispatchShipCommand,applyGravityPushHold,applyGravityControlHold,ui:await mountGravityHudPreview(engine,camera,document.querySelector('canvas'))});
   s.pos.set(-650,250);s.prevPos.copy(s.pos);t.pos.set(550,0);t.prevPos.copy(t.pos);camera.set(50,0);s.aimTargetWorld.set(400,0);dispatchShipCommand(s,{kind:'system',value:0});for(let i=0;i<20;i++)engine.fixedUpdate(1/60);applyGravityControlHold(s,false);
   frame.layers.delete('beam');frame.layers.delete('explosion');frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='F区域：1100半径 / 2400布置 · 松手驻留10秒 · 到期自动爆，无组合键';
  });
  await page.waitForFunction(()=>document.querySelector('[data-gravity-area="attraction"] .gravity-area-label')?.textContent.includes('驻留'));
  const badge=await page.locator('.gravity-area-label').boundingBox(),ring=await page.locator('.gravity-area-lines path').evaluate(e=>({rx:Number(e.dataset.radiusX),ry:Number(e.dataset.radiusY),segments:(e.getAttribute('d').match(/ M |^M /g)??[]).length,arcs:(e.getAttribute('d').match(/ A /g)??[]).length}));const targetTop=await page.evaluate(()=>{const {t,camera}=globalThis.__gravityPresentation;const angle=t.facingRad;return Math.min(...t.spec.bounds.map(([x,y])=>t.pos.y+x*Math.sin(angle)+y*Math.cos(angle)))*.65-camera.y*.65+475+42;});assert(badge.y+badge.height<targetTop);assert(badge.height<26&&badge.width<230);assert.equal(ring.rx,715);assert.equal(ring.ry,715);assert.equal(ring.segments,8);assert.equal(ring.arcs,8);assert.equal(await page.locator('.gravity-area-lines ellipse').count(),0);await page.screenshot({path:out+'/parked-attraction.png'});
  let effects;
  await page.evaluate(value=>{globalThis.__gravityPresentation.effectsOnly=value;},effectsOnly);
  if(effectsOnly){
   await page.evaluate(async()=>{
    const p=globalThis.__gravityPresentation,{engine,frame,render}=p;
    const geometry=await import('/src/engine/render/GravityEffectGeometry.ts'),{updateGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');Object.assign(p,geometry,{updateGraphicsSettings});
    updateGraphicsSettings({screenShake:0,maxFrameRate:0});frame.layers.add('beam');frame.layers.add('explosion');frame.visualTime=engine.combatTime;render(.65);
    document.querySelector('#label').textContent='区域维持：局部轻折射与稀疏流向，没有蓝色圆面或常驻整圈';
   });await page.screenshot({path:out+'/field-effects.png'});
   const capture=await page.evaluate(()=>{const {engine,s,t,frame,render,gravityTractorEffect}=globalThis.__gravityPresentation;s.selectedGroupIndex=0;s.isFiringMain=true;s.aimTargetWorld.copy(t.pos);for(let i=0;i<5;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='捕获阶段：目标处局部建立反馈，没有炮口连接激光';const m=s.weapons.find(w=>w.spec.gravityTractor);return {phase:m.gravityTractor.phase,effect:gravityTractorEffect(s,m,1)};});
   assert.equal(capture.phase,'CAPTURE');assert.equal(capture.effect.kind,0);const captureBadge=await page.locator('[data-gravity-control="LEFT"] .gravity-grab-label').boundingBox(),fieldBadge=await page.locator('.gravity-area-label').boundingBox();assert(fieldBadge.y+fieldBadge.height<captureBadge.y);await page.screenshot({path:out+'/capture-effects.png'});
   const drag=await page.evaluate(()=>{const {engine,s,t,frame,render,gravityTractorEffect}=globalThis.__gravityPresentation;for(let i=0;i<16;i++)engine.fixedUpdate(1/60);s.aimTargetWorld.set(t.pos.x-260,t.pos.y+280);for(let i=0;i<16;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='已抓住：拉伸流向跟随真实拖锚，而不是指回本舰炮口';const m=s.weapons.find(w=>w.spec.gravityTractor),g=m.gravityTractor;return {phase:g.phase,effect:gravityTractorEffect(s,m,1),contact:[g.contactX,g.contactY],anchor:[g.anchorX,g.anchorY]};});
   assert.equal(drag.phase,'HOLD');assert.equal(drag.effect.kind,3);assert.equal(drag.effect.x,drag.contact[0]);assert.equal(drag.effect.y,drag.contact[1]);const ex=drag.effect.endX-drag.effect.x,ey=drag.effect.endY-drag.effect.y,ax=drag.anchor[0]-drag.contact[0],ay=drag.anchor[1]-drag.contact[1];assert(ex*ax+ey*ay>0&&Math.abs(ex*ay-ey*ax)<1e-6&&ey>0);assert(Math.hypot(drag.effect.endX-drag.effect.x,drag.effect.endY-drag.effect.y)<=160.00001);await page.screenshot({path:out+'/drag-effects.png'});
   const push=await page.evaluate(async()=>{
    const p=globalThis.__gravityPresentation,{engine,s,t,frame,render,Vector2,applyGravityPushHold,gravityPushEffect}=p;
    const {Ship}=await import('/src/engine/simulation/Ship.ts'),{SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
    const other=new Ship('fx-other',{...t.spec,weaponSlots:[],engineSlots:[],systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE'},false,new Vector2(t.pos.x,t.pos.y+560),Math.PI/2,new SimulationRandom(101));other.teamId=1;other.fireControlMode='MANUAL';other.visibilityMask=0xffffffff;engine.reinforcements.push(other);engine.externallyControlledShipIds.add(other.id);p.other=other;
    s.aimTargetWorld.copy(other.pos);applyGravityPushHold(s,true);for(let i=0;i<12;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='右键推另一目标：独立方向反馈，左键仍拖动原对象';
    return {effect:gravityPushEffect(s.defenseSystem),dx:s.defenseSystem.gravityPush.dx,dy:s.defenseSystem.gravityPush.dy,left:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor.target.id,right:s.defenseSystem.gravityPush.target.id};
   });assert.notEqual(push.left,push.right);assert(push.effect);assert((push.effect.endX-push.effect.x)*push.dx+(push.effect.endY-push.effect.y)*push.dy>0);await page.screenshot({path:out+'/push-effects.png'});
   const pixels=await page.evaluate(()=>{
    const {engine,s,t,gl,frame,render,renderer,updateGraphicsSettings}=globalThis.__gravityPresentation;
    // Native weapon range is not this ship's gravity boundary. Isolate it for exact pause comparisons.
    renderer.arcAnimProgress=0;renderer.arcFadeState='HIDDEN';
    const signature=()=>JSON.stringify({time:engine.combatTime,field:s.system.gravityField,grip:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor,push:s.defenseSystem.gravityPush,flux:s.flux.totalFlux,hp:t.hullHp});
    const before=signature(),read=()=>{frame.visualTime=engine.combatTime;render(.65);const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;},changed=(a,b)=>a.reduce((n,v,i)=>n+(v!==b[i]?1:0),0);
    const a=read(),b=read(),readOnly=before===signature(),onDraws=renderer.gravityLens?.drawCalls??0;
    frame.layers.delete('beam');frame.layers.delete('explosion');const off=read(),offDraws=renderer.gravityLens?.drawCalls??0;
    frame.layers.add('beam');frame.layers.add('explosion');for(let i=0;i<8;i++)engine.fixedUpdate(1/60);const next=read();
    updateGraphicsSettings({renderScale:.75});render(.65);const reducedError=gl.getError();updateGraphicsSettings({renderScale:1});render(.65);
    return {pauseChanges:changed(a,b),effectChanges:changed(a,off),animatedChanges:changed(a,next),readOnly,onDraws,offDraws,reducedError,error:gl.getError(),copyTextureBytes:renderer.gravityLens?.textureBytes??0,resources:renderer.getResourceStats()};
   });assert.equal(pixels.pauseChanges,0);assert(pixels.effectChanges>100&&pixels.animatedChanges>100);assert(pixels.readOnly&&pixels.onDraws>0);assert.equal(pixels.offDraws,0);assert.equal(pixels.reducedError,0);assert.equal(pixels.error,0);
   effects={capture,drag,push,pixels};
   await page.evaluate(()=>{const {engine,s,other,applyGravityPushHold}=globalThis.__gravityPresentation;s.isFiringMain=false;applyGravityPushHold(s,false);other.pos.set(10000,10000);other.prevPos.copy(other.pos);for(let i=0;i<18;i++)engine.fixedUpdate(1/60);});
  }
  await page.evaluate(()=>{const {engine,s,frame,render,applyGravityPushHold}=globalThis.__gravityPresentation;s.aimTargetWorld.set(-900,-600);applyGravityPushHold(s,true);for(let i=0;i<8;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='只按住右键：场向外推；松右键恢复吸引，不必再按F';});
  await page.waitForFunction(()=>document.querySelector('[data-gravity-area="repulsion"] .gravity-area-label')?.textContent.includes('排斥'));await page.screenshot({path:out+'/right-repulsion.png'});
  const before=await page.evaluate(()=>{const {engine,s,t,frame,render,applyGravityPushHold}=globalThis.__gravityPresentation;applyGravityPushHold(s,false);const f=s.system.gravityField;t.pos.set(f.x+420,f.y);t.prevPos.copy(t.pos);t.vel.set(0,0);t.armor.cells.fill(0);t.armor.minArmorFractionMultiplier=0;const hp=t.hullHp;for(let i=0;i<8;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);return {hp,x:f.x,y:f.y,now:engine.combatTime};});
  await page.waitForFunction(()=>document.querySelector('[data-gravity-area="attraction"]')?.style.display==='block');
  await page.evaluate(()=>{const {engine,s,frame,render}=globalThis.__gravityPresentation;while(s.system.gravityField?.kind==='WELL')engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='自然驻留到期：原位置自动坍缩预警，未按G/H';});
  await page.waitForFunction(()=>document.querySelector('[data-gravity-area="collapse"] .gravity-area-label')?.textContent.includes('到期坍缩'));await page.screenshot({path:out+'/automatic-warning.png'});
  if(effectsOnly){const warning=await page.evaluate(()=>{const {engine,s,frame,render,gravityFieldEffect}=globalThis.__gravityPresentation;for(let i=0;i<13;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);return gravityFieldEffect(s.system);});assert.equal(warning.kind,1);assert(warning.progress>0&&warning.progress<1);effects.warning=warning;await page.screenshot({path:out+'/compression-warning.png'});}
  const burst=await page.evaluate(()=>{const {engine,s,t,frame,render}=globalThis.__gravityPresentation;for(let i=0;i<(globalThis.__gravityPresentation.effectsOnly?15:28);i++)engine.fixedUpdate(1/60);frame.layers.add('beam');frame.layers.add('explosion');frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='到期潮汐爆：生产引擎真实单次伤害 / 盾弧与装甲照常结算';return {hp:t.hullHp,field:s.system.gravityField,state:s.system.state};});
  assert.equal(burst.state,'ACTIVE');assert.equal(burst.field.kind,'COLLAPSE');assert(burst.field.collapseApplied);assert.equal(burst.field.x,before.x);assert.equal(burst.field.y,before.y);assert(burst.hp<before.hp);await page.waitForFunction(()=>document.querySelector('.gravity-area-label')?.textContent==='到期潮汐爆');await page.screenshot({path:out+'/automatic-burst.png'});
  if(effectsOnly){
   const blast=await page.evaluate(()=>{const {engine,s,frame,render,gravityFieldEffect}=globalThis.__gravityPresentation;const first=gravityFieldEffect(s.system),f=s.system.gravityField,noEvent=gravityFieldEffect({gravityField:{...f,collapseApplied:false},isActive:true,state:'ACTIVE',disabled:false,effectLevel:1});for(let i=0;i<6;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);return {first,next:gravityFieldEffect(s.system),blockedUntilEvent:noEvent===undefined};});
   assert.equal(blast.first.kind,4);assert.equal(blast.next.kind,4);assert.equal(blast.first.forceSign,1);assert(blast.next.radius>blast.first.radius&&blast.next.power<blast.first.power&&blast.blockedUntilEvent);effects.blast=blast;await page.screenshot({path:out+'/outward-release.png'});
  }
  await page.evaluate(()=>{const {engine,t,frame,render}=globalThis.__gravityPresentation;const hp=t.hullHp;for(let i=0;i<60;i++)engine.fixedUpdate(1/60);if(t.hullHp!==hp)throw Error('Repeated burst damage');frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='爆发结束：区域边界与标签清理，空闲无大面板';});
  await page.waitForFunction(()=>document.querySelector('.gravity-area-hud')?.style.display==='none');await page.screenshot({path:out+'/area-cleanup.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await fs.writeFile(out+'/area-check.json',JSON.stringify({radius1100:true,sparseBoundary:ring,compact:badge,badgeOutsideHull:true,rightHoldRepels:true,rightReleaseAttracts:true,noCombo:true,naturalExpiryWarning:true,realOneShotHullDamage:before.hp-burst.hp,capturedCenter:true,effectsOffBoundary:true,cleanup:true,pageErrors:errors,failedRequests:failed,scope:'Production fixed-step engine/formal hull/production HUD; simulator actual mouse/UI checked separately, not human balance or multiplayer.'},null,2));
  if(effectsOnly){
   const cleanup=await page.evaluate(()=>{const {s,renderer,gravityFieldEffect,gravityTractorEffect,gravityPushEffect}=globalThis.__gravityPresentation;return {field:gravityFieldEffect(s.system)===undefined,drag:gravityTractorEffect(s,s.weapons.find(w=>w.spec.gravityTractor),1)===undefined,push:gravityPushEffect(s.defenseSystem)===undefined,lensDraws:renderer.gravityLens?.drawCalls??0};});assert(cleanup.field&&cleanup.drag&&cleanup.push);assert.equal(cleanup.lensDraws,0);effects.cleanup=cleanup;effects.boundary=ring;effects.pageErrors=errors;effects.failedRequests=failed;effects.scope='Actual fixed-step world, shared read-only sprite/lens geometry and formal production rendering; no altered damage, balance or native UI equivalence claim.';await fs.writeFile(out+'/fx-check.json',JSON.stringify(effects,null,2));console.log('Effects: sparse neutral boundary, capture/real drag/right directions, pause, animation, layer toggle, GPU scaling, real compression/outward burst and cleanup passed');
  }
  console.log('Area: enlarged parked field, right-held repulsion, automatic warning/burst damage and cleanup passed');
 }else if(pushOnly){
  await page.evaluate(async()=>{
   const {engine,s,t,frame,render,camera}=globalThis.__gravityPresentation;
   const {mountGravityHudPreview}=await import('/scripts/gravity-v8-scenarios.mjs');
   const {applyGravityPushHold,applyGravityControlHold}=await import('/src/engine/simulation/systems/GravityControlInput.ts');
   const {dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts');
   Object.assign(globalThis.__gravityPresentation,{applyGravityPushHold,applyGravityControlHold,dispatchShipCommand,ui:await mountGravityHudPreview(engine,camera,document.querySelector('canvas'))});
   s.pos.set(-450,220);s.prevPos.copy(s.pos);t.pos.set(350,-250);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=Math.PI/2;camera.set(-60,-10);s.selectedGroupIndex=1;
   s.aimTargetWorld.copy(t.pos);applyGravityPushHold(s,true);for(let i=0;i<36;i++)engine.fixedUpdate(1/60);
   frame.layers.delete('beam');frame.layers.delete('explosion');frame.visualTime=engine.combatTime;render(.65);
   document.querySelector('#label').textContent='右键直接推送 · 未按左键 / 未开F · 真实方向箭头 · 特效关闭';
  });
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="PUSH"] .gravity-grab-title')?.textContent==='定向推送');
  const right='[data-gravity-control="RIGHT"]',left='[data-gravity-control="LEFT"]';
  assert(await page.locator(right+' .gravity-grab-tether').isVisible());const arrow=await page.locator(right+' .gravity-push-arrow').boundingBox(),brackets=await page.locator(right+' .gravity-grab-bracket').boundingBox();assert(arrow.x>brackets.x+brackets.width);const compact=await page.locator(right+' .gravity-grab-label').boundingBox();assert(compact.height<26&&compact.width<140);await page.screenshot({path:out+'/right-only.png'});
  const grip=await page.evaluate(async()=>{
   const {engine,s,t,frame,render,applyGravityPushHold,Vector2}=globalThis.__gravityPresentation;applyGravityPushHold(s,false);s.selectedGroupIndex=0;s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;
   for(let i=0;i<18;i++)engine.fixedUpdate(1/60);if(s.weapons.find(w=>w.spec.gravityTractor).gravityTractor.phase!=='HOLD')throw Error('LMB grip failed');
   const {Ship}=await import('/src/engine/simulation/Ship.ts'),{SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
   const other=new Ship('independent-right-target',{...t.spec,weaponSlots:[],engineSlots:[],systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE'},false,new Vector2(350,300),Math.PI/2,new SimulationRandom(97));other.teamId=1;other.fireControlMode='MANUAL';other.visibilityMask=0xffffffff;engine.reinforcements.push(other);engine.externallyControlledShipIds.add(other.id);globalThis.__gravityPresentation.other=other;
   s.aimTargetWorld.copy(other.pos);applyGravityPushHold(s,true);for(let i=0;i<24;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);
   document.querySelector('#label').textContent='左键始终拖动已抓住对象；右键独立推另一个对象，不接管、不翻转';
   return {grip:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor,push:s.defenseSystem.gravityPush,leftId:t.id,rightId:other.id};
  });assert.equal(grip.grip.phase,'HOLD');assert.equal(grip.grip.target.id,grip.leftId);assert.equal(grip.push.target.id,grip.rightId);assert.notEqual(grip.grip.target.id,grip.push.target.id);
  await page.waitForFunction(()=>document.querySelector('[data-gravity-control="LEFT"][data-gravity-phase="HOLD"] .gravity-grab-title')?.textContent.startsWith('已抓住'));
  assert(await page.locator(right+' .gravity-grab-label').isVisible());assert(await page.locator(left+' .gravity-grab-anchor').isVisible());await page.screenshot({path:out+'/independent-targets.png'});
  const arbitration=await page.evaluate(()=>{
   const {engine,s,applyGravityControlHold,dispatchShipCommand}=globalThis.__gravityPresentation,push=s.defenseSystem.gravityPush,dir=[push.dx,push.dy];
   s.aimTargetWorld.set(200,-400);if(!dispatchShipCommand(s,{kind:'system',value:0}).accepted)throw Error('F rejected');applyGravityControlHold(s,true);for(let i=0;i<18;i++)engine.fixedUpdate(1/60);
   const frozen=push.dx===dir[0]&&push.dy===dir[1];applyGravityControlHold(s,false);for(let i=0;i<6;i++)engine.fixedUpdate(1/60);return {frozen,resumed:push.dy!==dir[1],grip:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor.phase};
  });assert(arbitration.frozen&&arbitration.resumed&&arbitration.grip==='HOLD');
  const self=await page.evaluate(()=>{
   const {engine,s,t,other,frame,render,applyGravityPushHold}=globalThis.__gravityPresentation;applyGravityPushHold(s,false);s.isFiringMain=false;for(let i=0;i<70;i++)engine.fixedUpdate(1/60);
   for(const ship of [t,other]){ship.pos.set(10000,10000);ship.prevPos.copy(ship.pos);}s.aimTargetWorld.copy(s.pos);s.isFiringMain=true;for(let i=0;i<18;i++)engine.fixedUpdate(1/60);
   s.aimTargetWorld.set(500,-250);applyGravityPushHold(s,true);for(let i=0;i<30;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);
   document.querySelector('#label').textContent='本舰仍只用左键拖动；同时按右键不会接管自牵引';return {target:s.defenseSystem.gravityPush?.target??null,grip:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor,velocity:[s.vel.x,s.vel.y],id:s.id};
  });assert.equal(self.target,null);assert.equal(self.grip.target.id,self.id);assert(self.velocity[0]>0&&self.velocity[1]<0);
  await page.waitForFunction(()=>document.querySelector('[data-gravity-control="LEFT"][data-gravity-phase="HOLD"] .gravity-grab-title')?.textContent.startsWith('本舰牵引'));assert(!await page.locator(right).isVisible());await page.screenshot({path:out+'/left-self-tow.png'});
  await page.evaluate(()=>{const {engine,s,frame,render,applyGravityPushHold}=globalThis.__gravityPresentation;applyGravityPushHold(s,false);s.isFiringMain=false;engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='全部松开 · 左右实体标记清理 · 无空闲说明面板';});
  await page.waitForFunction(()=>[...document.querySelectorAll('.gravity-tractor-hud')].every(e=>e.style.display==='none'));await page.screenshot({path:out+'/released.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await fs.writeFile(out+'/push-check.json',JSON.stringify({rightOnly:true,otherWeaponGroup:true,realDirectionArrow:true,arrowOutsideHull:true,effectsOff:true,compact,independentTargets:grip,simultaneousMarkers:true,arbitration,self,releaseCleanup:true,noIdlePanel:true,pageErrors:errors,failedRequests:failed,scope:'Production fixed-step engine, formal hull and production HUD; actual simulator mouse-down/up recorded separately in area UI check. Not human balance or multiplayer consent.'},null,2));
  console.log('Independent input: right-only, distinct left/right targets and markers, F direction freeze/resume, left-only self towing with right held, release passed');
 }else if(selfOnly){
  await page.evaluate(async()=>{
   const {engine,s,t,frame,render,camera}=globalThis.__gravityPresentation;
   const {mountGravityHudPreview}=await import('/scripts/gravity-v8-scenarios.mjs');
   const {dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts');
   const {applyGravityControlHold}=await import('/src/engine/simulation/systems/GravityControlInput.ts');
   globalThis.__gravityPresentation.ui=await mountGravityHudPreview(engine,camera,document.querySelector('canvas'));
   Object.assign(globalThis.__gravityPresentation,{dispatchShipCommand,applyGravityControlHold});
   s.pos.set(-200,200);s.prevPos.copy(s.pos);t.pos.set(10000,10000);t.prevPos.copy(t.pos);camera.set(0,0);
   frame.layers.delete('beam');frame.layers.delete('explosion');s.aimTargetWorld.copy(s.pos);s.isFiringMain=true;
   for(let i=0;i<3;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);
   document.querySelector('#label').textContent='本舰捕获中 · 点住真实舰体，准备自牵引 · 场景特效关闭';
  });
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="CAPTURE"] .gravity-grab-title')?.textContent.startsWith('本舰捕获中'));
  await page.screenshot({path:out+'/self-capture.png'});
  const held=await page.evaluate(()=>{
   const {engine,s,frame,render}=globalThis.__gravityPresentation;s.aimTargetWorld.set(650,-250);
   for(let i=0;i<60;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);
   document.querySelector('#label').textContent='本舰牵引 · 自身框角 / 真实拖锚 / 有限加速度 · 无自伤';
   return {state:{...s.weapons.find(w=>w.spec.gravityTractor).gravityTractor},position:[s.pos.x,s.pos.y],velocity:[s.vel.x,s.vel.y],flux:s.flux.totalFlux};
  });assert.equal(held.state.phase,'HOLD');assert(held.state.status.includes('本舰牵引'));assert(held.velocity[0]>0&&held.velocity[1]<0);assert(held.position[0]>-200&&held.position[1]<200);
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="HOLD"] .gravity-grab-title')?.textContent.startsWith('本舰牵引'));
  assert(await page.locator('.gravity-grab-bracket').isVisible());assert(await page.locator('.gravity-grab-tether').isVisible());assert(await page.locator('.gravity-grab-anchor').isVisible());
  const compact=await page.locator('.gravity-grab-label').boundingBox();assert(compact.width<140&&compact.height<26);await page.screenshot({path:out+'/self-held-effects-off.png'});
  await page.evaluate(()=>{const {engine,s,frame,render,dispatchShipCommand}=globalThis.__gravityPresentation;if(!dispatchShipCommand(s,{kind:'shield'}).accepted)throw Error('Self polarity rejected');for(let i=0;i<12;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);});
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="HOLD"]')?.dataset.gravityPolarity==='repulsion');await page.screenshot({path:out+'/self-repulsion.png'});
  const f=await page.evaluate(()=>{
   const {engine,s,frame,render,dispatchShipCommand,applyGravityControlHold}=globalThis.__gravityPresentation,state=s.weapons.find(w=>w.spec.gravityTractor).gravityTractor;
   const anchor=[state.anchorX,state.anchorY],age=state.age;s.aimTargetWorld.set(300,-400);
   if(!dispatchShipCommand(s,{kind:'system',value:0}).accepted)throw Error('Self F rejected');applyGravityControlHold(s,true);
   for(let i=0;i<18;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);
   const frozen=anchor[0]===state.anchorX&&anchor[1]===state.anchorY;applyGravityControlHold(s,false);for(let i=0;i<6;i++)engine.fixedUpdate(1/60);
   return {frozen,ageSpent:state.age>age,resumed:Math.hypot(state.anchorX-anchor[0],state.anchorY-anchor[1])>0,phase:state.phase};
  });assert(f.frozen&&f.ageSpent&&f.resumed&&f.phase==='HOLD');
  const released=await page.evaluate(()=>{
   const {engine,s,frame,render}=globalThis.__gravityPresentation;s.isFiringMain=false;engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);
   document.querySelector('#label').textContent='松开即释放 · 保留惯性 · 空闲没有说明面板';return {phase:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor.phase,velocity:[s.vel.x,s.vel.y]};
  });assert.equal(released.phase,'IDLE');await page.waitForFunction(()=>document.querySelector('.gravity-tractor-hud')?.style.display==='none');assert(!await page.locator('.gravity-grab-label').isVisible());await page.screenshot({path:out+'/self-released.png'});
  await page.evaluate(()=>{const {engine,s}=globalThis.__gravityPresentation;for(let i=0;i<66;i++)engine.fixedUpdate(1/60);s.aimTargetWorld.copy(s.pos);s.isFiringMain=true;for(let i=0;i<18;i++)engine.fixedUpdate(1/60);});
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="HOLD"] .gravity-grab-title')?.textContent.startsWith('本舰牵引'));
  await page.evaluate(()=>{globalThis.__gravityPresentation.s.selectedGroupIndex=1;});await page.waitForFunction(()=>document.querySelector('.gravity-tractor-hud')?.style.display==='none');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  await fs.writeFile(out+'/self-tow-check.json',JSON.stringify({selfCaptureLabel:true,selfHoldLabel:true,actualDisplacement:true,effectsOff:true,compactLabel:compact,bracketsAnchorAndTether:true,polarityKeepsHold:true,fOwnership:f,releaseClearsHud:true,otherGroupHidesHeldHud:true,noIdlePanel:true,held,released,pageErrors:errors,failedRequests:failed,scope:'Production fixed-step engine, formal hull, and CombatContacts/HUD; deterministic headless stage, not human usability, final balance or human multiplayer.'},null,2));
  console.log('Self tow: production capture, bounded displacement, compact HUD, effects-off, polarity, F arbitration, release and group hiding passed');
 }else if(leftOnly){
  await page.evaluate(async()=>{
   const {engine,s,t,frame,render,camera}=globalThis.__gravityPresentation;
   const {mountGravityHudPreview}=await import('/scripts/gravity-v8-scenarios.mjs');
   const ui=await mountGravityHudPreview(engine,camera,document.querySelector('canvas'));
   globalThis.__gravityPresentation.ui=ui;
   s.pos.set(-420,220);s.prevPos.copy(s.pos);t.pos.set(350,-250);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=Math.PI/2;
   camera.set(10,-20);s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;
   for(let i=0;i<3;i++)engine.fixedUpdate(1/60);
   frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='左键捕获中 · 同一目标锁定 / 琥珀虚线框及进度';
  });
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="CAPTURE"] .gravity-grab-title')?.textContent.includes('捕获中'));
  await page.screenshot({path:out+'/capture.png'});
  const held=await page.evaluate(()=>{
   const {engine,s,t,frame,render}=globalThis.__gravityPresentation;s.aimTargetWorld.set(t.pos.x+260,t.pos.y+190);
   for(let i=0;i<36;i++)engine.fixedUpdate(1/60);
   frame.layers.delete('beam');frame.layers.delete('explosion');frame.visualTime=engine.combatTime;render(.65);
   document.querySelector('#label').textContent='左键已抓住 · 实体框 / 剩余时间 / 拖锚 · 场景特效关闭';
   return {...s.weapons.find(w=>w.spec.gravityTractor).gravityTractor};
  });assert.equal(held.phase,'HOLD');
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="HOLD"] .gravity-grab-title')?.textContent.includes('已抓住'));
  assert(await page.locator('.gravity-grab-bracket').isVisible());assert(await page.locator('.gravity-grab-tether').isVisible());
  await page.screenshot({path:out+'/held-effects-off.png'});
  await page.evaluate(()=>{const {engine,s,frame,render}=globalThis.__gravityPresentation;if(!s.activateDefenseSystem())throw Error('Polarity rejected');for(let i=0;i<12;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);});
  await page.waitForFunction(()=>document.querySelector('[data-gravity-phase="HOLD"]')?.dataset.gravityPolarity==='repulsion');
  await page.screenshot({path:out+'/held-repulsion.png'});
  await page.mouse.move(1000,600);
  await page.evaluate(()=>{const {engine,s,frame,render}=globalThis.__gravityPresentation;s.isFiringMain=false;for(let i=0;i<2;i++)engine.fixedUpdate(1/60);frame.visualTime=engine.combatTime;render(.65);});
  await page.waitForFunction(()=>document.querySelector('.gravity-tractor-hud')?.style.display==='none');
  assert(!await page.locator('.gravity-grab-bracket').isVisible());assert(!await page.locator('.gravity-grab-anchor').isVisible());
  await page.screenshot({path:out+'/released.png'});
  await page.evaluate(()=>{globalThis.__gravityPresentation.s.selectedGroupIndex=1;});await page.waitForFunction(()=>document.querySelector('.gravity-tractor-hud')?.style.display==='none');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  await fs.writeFile(out+'/left-click-check.json',JSON.stringify({capture:true,stickyAcquisition:true,heldLabel:true,heldBrackets:true,realAnchorAndTether:true,effectsOff:true,polarityPreservesHold:true,releaseClearsMarkers:true,otherWeaponGroupHidesHud:true,idlePanelRemoved:true,compactSingleLineTag:true,held,pageErrors:errors,failedRequests:failed,scope:'Production engine and CombatContacts/HUD, deterministic headless visual scenario; not human usability or live multiplayer.'},null,2));
  console.log('Left-click: acquisition, sticky drag, clear hold HUD, effects-off, polarity, release and group cleanup passed');
 }else if(videoOnly){
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
     document.querySelector('#label').textContent=age<2?'单体牵引 · 区域场':age<3?'G紧急排斥':age<4.7?'右键极性反转':'排散与退场';
     frame.visualTime=engine.combatTime;const renderStart=performance.now();render(.65);renderMs.push(performance.now()-renderStart);count++;maxLensDraws=Math.max(maxLensDraws,renderer.gravityLens?.drawCalls??0);
     if(age>7)resolve();else requestAnimationFrame(animate);
    }requestAnimationFrame(animate);
   });
   renderMs.sort((a,b)=>a-b);
   return {pauseChanges,effectChanges,reducedError,error:gl.getError(),frames:count,maxLensDraws,copyTextureBytes:renderer.gravityLens?.textureBytes??0,renderCpuMs:{median:renderMs[Math.floor(renderMs.length*.5)],p95:renderMs[Math.floor(renderMs.length*.95)],scope:'CPU submission of the complete renderer, two-ship headless Edge scene; no GPU frame-time or fleet performance claim.'}};
  });
  assert.equal(fx.pauseChanges,0);assert(fx.effectChanges>100);assert.equal(fx.reducedError,0);assert.equal(fx.error,0);assert(fx.maxLensDraws>0);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);fx.pageErrors=errors;fx.failedRequests=failed;
  await page.close();await page.video().saveAs(out+'/gravity-support-v10.webm');await fs.writeFile(out+'/fx-check.json',JSON.stringify(fx,null,2));console.log(JSON.stringify(fx));
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
 const polarity=await page.evaluate(()=>{
  const {engine,s,gl,frame,render}=globalThis.__gravityPresentation;
  if(!s.activateDefenseSystem())throw Error('RMB not accepted');for(let i=0;i<12;i++)engine.fixedUpdate(1/60);
  frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='右键极性反转 · 排斥受力 / 保留单体牵引和区域场';
  return {mode:s.defenseSystem.gravityPolarity,well:s.system.gravityField,grip:s.weapons.find(w=>w.spec.gravityTractor).gravityTractor,error:gl.getError()};
 });assert.equal(polarity.error,0);assert.equal(polarity.mode,-1);assert(polarity.well);assert.equal(polarity.grip.phase,'HOLD');await page.screenshot({path:out+'/polarity-reversal.png'});
 const wave=await page.evaluate(()=>{
  const {engine,s,gl,frame,render}=globalThis.__gravityPresentation;
  if(!s.systems[1].activate())throw Error('G not accepted');for(let i=0;i<15;i++)engine.fixedUpdate(1/60);
  frame.visualTime=engine.combatTime;render(.65);document.querySelector('#label').textContent='G 紧急排斥 · 始终向外 / 成功松抓 / 区域场独立保留';
  return {wave:s.systems[1].gravityField,well:s.system.gravityField,error:gl.getError()};
 });assert.equal(wave.error,0);assert(wave.well);assert.equal(wave.wave.kind,'REPULSOR');assert(wave.wave.radius>300);await page.screenshot({path:out+'/emergency-wave.png'});
 const ai=await page.evaluate(async()=>{
  const {engine:e}=globalThis.__gravityPresentation;const {CapitalShipAI}=await import('/src/engine/ai/CapitalShipAI.ts');
  e.externallyControlledShipIds.clear();e.playerShip.fireControlMode=e.enemyShip.fireControlMode='AI';
  e.playerShip.pos.set(-650,0);e.enemyShip.pos.set(650,0);e.playerShip.vel.set(0,0);e.enemyShip.vel.set(0,0);e.playerShip.facingRad=0;e.enemyShip.facingRad=Math.PI;
  for(const ship of e.allCapitalShips){ship.flux.softFlux=0;for(const sys of ship.allSystems)sys.reset();for(const g of ship.weaponGroups)g.isAutofire=g.index!==0;}
  const playerAI=new CapitalShipAI(e.playerShip,e.enemyShip),seen=new Set(),systems=new Set();let holdTicks=0,ticks=0,minGap=Infinity,minReadyGap=Infinity;
  const armorSum=s=>{let sum=0;for(let c=0;c<s.armor.cols;c++)for(let r=0;r<s.armor.rows;r++)sum+=s.armor.getCell(c,r);return sum;};
  const start=e.allCapitalShips.map(s=>s.hullHp),armorBefore=e.allCapitalShips.map(armorSum);
  for(;ticks<2700&&!e.playerShip.isDead&&!e.enemyShip.isDead;ticks++){
   const gap=e.playerShip.pos.distanceTo(e.enemyShip.pos)-e.playerShip.spec.collisionRadius-e.enemyShip.spec.collisionRadius;minGap=Math.min(minGap,gap);
   if(e.allCapitalShips.some(s=>s.systems[1].state==='IDLE'&&s.flux.fluxPercent<=.7&&!s.flux.isVenting&&!s.flux.isOverloaded))minReadyGap=Math.min(minReadyGap,gap);
   e.updateShipAI(playerAI,1/60);e.fixedUpdate(1/60);
   for(const p of e.projectiles)if(p.specId)seen.add(p.specId);
   for(const s of e.allCapitalShips){for(const sys of s.allSystems)if(sys.isActive)systems.add(sys.type);if(s.weapons.some(w=>w.gravityTractor?.phase==='HOLD'))holdTicks++;}
  }
  if(!e.ships.every(s=>Number.isFinite(s.pos.x+s.pos.y+s.vel.x+s.vel.y)))throw Error('Invalid AI motion');
  return {minGap,minReadyGap,seconds:ticks/60,seen:[...seen],systems:[...systems],holdTicks,start,finish:e.allCapitalShips.map(s=>s.hullHp),armorBefore,armorAfter:e.allCapitalShips.map(armorSum),flux:e.allCapitalShips.map(s=>s.flux.totalFlux),positions:e.allCapitalShips.map(s=>[s.pos.x,s.pos.y])};
 });await fs.writeFile(out+'/ai-check.json',JSON.stringify(ai,null,2));console.log(JSON.stringify({ai},null,2));assert(ai.seen.includes('web_gravity_calibrator'));assert(ai.systems.includes('WEB_GRAVITY_BATTLE_WELL'));assert(ai.holdTicks>0);// A ranged duel may never present an emergency; do not force G spam to satisfy it.
 const emergencyAI=await page.evaluate(async()=>{
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {createGravityEscort,createGravityControl}=await import('/src/studio/GravityLoadouts.ts');
  const {CapitalShipAI}=await import('/src/engine/ai/CapitalShipAI.ts');
  const {engine:e}=createLanWorld({id:'gravity-ai-emergency',seed:92,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_gravity',design:createGravityEscort()},{id:'p1',seat:1,team:1,hull:'web_gravity',design:createGravityControl()}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  e.asteroids.length=0;e.nebulae.length=0;e.externallyControlledShipIds.clear();
  const s=e.playerShip,t=e.enemyShip;s.pos.set(0,0);t.pos.set(s.spec.collisionRadius+t.spec.collisionRadius+60,0);
  for(const ship of e.allCapitalShips){ship.prevPos.copy(ship.pos);ship.vel.set(0,0);ship.fireControlMode='AI';ship.visibilityMask=0xffffffff;for(const g of ship.weaponGroups)g.isAutofire=false;}
  s.facingRad=0;t.facingRad=Math.PI;
  const controller=new CapitalShipAI(s,t),seen=new Set();
  for(let i=0;i<30;i++){e.updateShipAI(controller,1/60);e.fixedUpdate(1/60);for(const sys of s.allSystems)if(sys.isActive)seen.add(sys.type);}
  return {initialSurfaceGap:60,seconds:.5,systems:[...seen],repulsorSerial:s.systems[1].activationSerial,repulsorState:s.systems[1].state,scope:'Production AI close-threat scenario, not the ranged-duel result.'};
 });assert(emergencyAI.systems.includes('WEB_GRAVITY_BATTLE_REPULSOR'));assert(emergencyAI.repulsorSerial>0);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 await fs.writeFile(out+'/presentation-check.json',JSON.stringify({installed,well,polarity,wave,ai,emergencyAI,pageErrors:errors,failedRequests:failed,scope:'Production WebGL, actual state stages, background UI and limited natural AI functional check. No live multiplayer or final balance claim.'},null,2));
 console.log(JSON.stringify({renderErrors:errors,ai,emergencyAI},null,2));
 }
}finally{await browser?.close();await server.close();}
