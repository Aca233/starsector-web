/** Headless real WebGL smoke test. Uses a fresh temporary browser profile and
 * isolated canvas; never opens the actual game UI or connects to a live room. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const {chromium}=createRequire(import.meta.url)('playwright');
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
let browser;
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:640,height:360}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__visual_layer_check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"><canvas id="battle" width="640" height="360"></canvas></body>'}));
 await page.goto(`http://127.0.0.1:${port}/__visual_layer_check.html`);
 const result=await page.evaluate(async()=>{
  window.__LAN_BUILD_ID__='visual-render-test';
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');
  const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
  const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {AnchoredProjectilePublisher}=await import('/src/network/AnchoredProjectileVisual.mjs');
  const {ProjectileVisualReplica}=await import('/src/network/ProjectileVisualReplica.ts');
  const {projectileVisualLayer}=await import('/src/engine/render/ProjectileVisualLayer.ts');
  await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
  const match={id:'visual-render',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}};
  const engine=createLanWorld(match).engine,original=engine.projectiles,random=JSON.stringify([engine.random,engine.visualRandom]);
  const canvas=document.getElementById('battle'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});if(!gl)throw Error('WebGL2 unavailable');
  const renderer=new WebGLCombatRenderer(canvas,gl),publisher=new AnchoredProjectilePublisher(match.id),view=new ProjectileVisualReplica(match.id);
  const context={visualTime:1,random:new VisualRandom(917),layers:new Set(['weapon']),damageEnabled:true};
  const row={id:.123456789,specId:'tpc',spawnType:'BALLISTIC_AS_BEAM',pos:{$vector:[40,0]},vel:{$vector:[120,0]},ballisticTail:{$vector:[-60,0]},projLength:100,projWidth:35,facingRad:0,elapsedTime:1,fadeProgress:0,color:[255,0,0],fringeColor:[255,0,0,255],coreColor:[255,255,255,255],radius:10};
  const sample=(energyOnly=false)=>{
   renderer.render(combatRenderView(engine),1,new Vector2(),1,context);
   const pixels=new Uint8Array(640*360*4);gl.readPixels(0,0,640,360,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let bright=0,energy=0;for(let i=0;i<pixels.length;i+=4){energy+=pixels[i]+pixels[i+1]+pixels[i+2];if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>40)bright++;}
   if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error');return energyOnly?energy:bright;
  };
  try{
   await renderer.prepareAssets(combatRenderView(engine));const empty=sample();
   const p=publisher.publish({tick:3,time:.05,rows:[row]});view.receive(p.key,'baseline',p.baseline,0,0);view.render(engine,0,0);const shown=sample();
   if(shown<=empty+100)throw Error('Decoded visual did not reach actual renderer pixels: '+JSON.stringify({empty,shown}));
   if(projectileVisualLayer(engine).projectiles[0].id!==row.id)throw Error('Identity changed');
   const removed=publisher.publish({tick:6,time:.1,rows:[]});view.receive(removed.key,'update',removed.update,50,0);view.render(engine,100,0);const gone=sample();
   if(gone!==empty)throw Error('Removed visual remains visible');
   const missile={...row,isRocket:true,teamId:1,isPlayer:false,radius:45,renderTargetIndicator:false};
   const hiddenIndicator=publisher.publish({tick:9,time:.15,rows:[missile]});view.receive(hiddenIndicator.key,hiddenIndicator.update?'update':'baseline',hiddenIndicator.update??hiddenIndicator.baseline,150,0);view.render(engine,250,0);const withoutIndicator=sample(true);
   const visibleIndicator=publisher.publish({tick:12,time:.2,rows:[{...missile,renderTargetIndicator:true}]});view.receive(visibleIndicator.key,visibleIndicator.update?'update':'baseline',visibleIndicator.update??visibleIndicator.baseline,300,0);view.render(engine,450,0);const withIndicator=sample(true);
   if(withIndicator<=withoutIndicator)throw Error('Passive missile identification did not use the read-only visual layer');
   if(engine.projectiles!==original||engine.projectiles.length!==0||JSON.stringify([engine.random,engine.visualRandom])!==random)throw Error('Read-only renderer layer mutated authority');
   view.clear();return {emptyPixels:empty,displayPixels:shown,removedPixels:gone,indicatorEnergyDelta:withIndicator-withoutIndicator,glRenderer:gl.getParameter(gl.RENDERER),scope:'Actual headless WebGL renderer and local textures with synthetic known projectile; no real network or hardware FPS claim'};
  }finally{view.clear();renderer.dispose();}
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,pageErrors:errors},null,2));
}finally{await browser?.close();await server.close();}
