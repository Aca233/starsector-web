import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
export async function checkZhefengRender(browser,port,out,errors){
 const p=await browser.newPage({viewport:{width:900,height:820}});p.on('pageerror',e=>errors.push(String(e)));
 await p.route('**/__zhefeng_render.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#091018;color:#d7e2e9;font:16px sans-serif}header{padding:14px}canvas{display:block}</style><header>折锋级 · 正式渲染：六炮位 / 四喷口 / 真实技能阶段</header><canvas id="battle" width="900" height="760"></canvas>'}));
 await p.goto(`http://127.0.0.1:${port}/__zhefeng_render.html`);
 const base=await p.evaluate(async()=>{
  globalThis.__LAN_BUILD_ID__='zhefeng-art-check';
  const {createLanWorld}=await import('/src/network/LanWorld.ts');const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const engine=createLanWorld({id:'zhefeng-render',seed:41,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhefeng'},{id:'p1',seat:1,team:1,hull:'web_zhefeng'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  const ship=engine.playerShip;engine.enemyShip.pos.set(10000,10000);engine.enemyShip.prevPos.copy(engine.enemyShip.pos);engine.asteroids.length=0;
  ship.pos.set(0,0);ship.prevPos.copy(ship.pos);ship.facingRad=ship.prevFacingRad=-Math.PI/2;ship.visibilityMask=0xffffffff;
  for(const w of ship.weapons)w.currentAngleRad=w.prevAngleRad=ship.facingRad+w.baseAngleDeg*Math.PI/180;
  for(const e of ship.engineStatuses){e.currentThrust=e.prevThrust=0;}
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});if(!gl)throw Error('No WebGL2');
  const renderer=new WebGLCombatRenderer(canvas,gl);const view=combatRenderView(engine);await renderer.prepareAssets(view);
  const frame={visualTime:0,random:new VisualRandom(42),layers:new Set(['hull','weapon','trail','explosion','beam','shield']),damageEnabled:true};
  const render=()=>renderer.render(view,1,new Vector2(),1.85,frame);render();
  globalThis.__zhefengArt={engine,ship,gl,canvas,frame,render};
  return {slots:ship.weapons.map(w=>({slot:w.slotId,id:w.spec.id,relative:[w.relativePos.x,w.relativePos.y]})),error:gl.getError()};
 });
 assert.equal(base.error,0);await p.screenshot({path:out+'/installed-hull.png'});
 const phases=await p.evaluate(()=>{
  const {ship,gl,render,frame}=globalThis.__zhefengArt;ship.shield.setActive(true);ship.shield.update(1,ship.facingRad,ship.facingRad);if(!ship.system.activate())throw Error('Render guard activation failed');ship.system.update(.75);frame.visualTime=.75;render();return {state:ship.system.state,shield:ship.shield.isActive,error:gl.getError()};
 });assert.equal(phases.state,'IN');assert.equal(phases.shield,true);assert.equal(phases.error,0);await p.screenshot({path:out+'/guard-stage.png'});
 const attack=await p.evaluate(()=>{const {ship,gl,render,frame}=globalThis.__zhefengArt;ship.system.update(.75);ship.throttle=1;ship.isFiringMain=true;ship.aimTargetWorld.set(0,-1000);
 const rounds=[];for(let i=0;i<120;i++)ship.update(1/120,null,r=>rounds.push(r),()=>{},undefined,{ships:[ship],missiles:[],asteroids:[]});frame.visualTime=2.5;ship.pos.set(0,0);ship.prevPos.copy(ship.pos);render();return {state:ship.system.state,shield:ship.shield.isActive,raise:ship.shield.isRaiseRequested,shots:rounds.length,thrust:ship.engineStatuses.map(e=>e.currentThrust),error:gl.getError()};});
 assert.equal(attack.state,'ACTIVE');assert.equal(attack.shield,false);assert.equal(attack.raise,false);assert.equal(attack.error,0);assert.ok(attack.shots>0);await p.screenshot({path:out+'/counterattack-stage.png'});
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/render-check.json',JSON.stringify({base,guard:phases,counterattack:attack,scope:'Actual production renderer and authoritative stages. Controlled presentation setup, not a natural AI match.'},null,2));
 await p.close();
}
