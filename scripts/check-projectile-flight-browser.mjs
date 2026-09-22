// Real native assets/WebGL in isolated headless Chromium; no OS input/windows.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)('playwright');
const out='artifacts/network-stream-20260921/phase29';await fs.mkdir(out,{recursive:true});
let vite,browser,browserServer,report;
const watchdog=setTimeout(()=>{console.error('flight browser watchdog');void browserServer?.kill().finally(()=>process.exit(1));},90000);watchdog.unref();
try{
 vite=await createServer({configFile:false,root:process.cwd(),optimizeDeps:{noDiscovery:true,include:[]},define:{__LAN_BUILD_ID__:'"flight-browser"'},
  plugins:[{name:'flight-page',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__flight.html')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#080b14;color:white;font:16px sans-serif}canvas{display:block}</style><div>Native confirmed projectile flight — headless test</div><canvas id="view" width="800" height="420"></canvas>');});}}],
  server:{host:'127.0.0.1',port:0,open:false,watch:{ignored:['**/artifacts/**']}},logLevel:'error'});
 await vite.listen();browserServer=await chromium.launchServer({headless:true,args:['--enable-unsafe-swiftshader']});browser=await chromium.connect(browserServer.wsEndpoint());
 const page=await browser.newPage({viewport:{width:800,height:450}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+vite.httpServer.address().port+'/__flight.html');
 report=await page.evaluate(async()=>{
  window.__LAN_BUILD_ID__='flight-browser';
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const {createLanWorld}=await import('/src/network/LanWorld.ts'),{captureCombat}=await import('/src/network/CombatSnapshot.ts');
  const {ProjectileFlightPrediction}=await import('/src/network/ProjectileFlightPrediction.ts'),{projectileFlightLayer}=await import('/src/engine/render/ProjectileFlightLayer.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts'),{WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts'),{VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {updateGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');updateGraphicsSettings({maxFrameRate:0,renderScale:1,screenShake:0});
  const match={id:'flight-browser',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'hammerhead'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
  const engine=createLanWorld(match).engine;
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
  const renderer=window.renderer=new WebGLCombatRenderer(canvas,gl),flight=new ProjectileFlightPrediction();
  const frame={visualTime:0,random:new VisualRandom(match.seed),layers:new Set(['hull','weapon']),damageEnabled:false};
  const draw=()=>{renderer.render(combatRenderView(engine),1,new Vector2(80,0),1.6,frame);gl.finish();const bytes=new Uint8Array(800*420*4);gl.readPixels(0,0,800,420,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
  const delta=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;};
  const checks=[];
  for(const [index,weapon] of ['heavymortar','tpc'].entries()){
   const ship=engine.allCapitalShips.find(s=>s.weapons.some(m=>m.spec.id===weapon)),mount=ship?.weapons.find(m=>m.spec.id===weapon);if(!mount)throw Error('Native fixture missing '+weapon);
   ship.pos.set(0,0);ship.prevPos.set(0,0);ship.facingRad=ship.prevFacingRad=mount.currentAngleRad=0;ship.aimTargetWorld.set(2000,0);
   ship.weaponGroups=[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:[mount.slotId],alternatingIndex:0}];ship.selectedGroupIndex=0;ship.isFiringMain=true;
   ship.weaponControl.update(1/60,ship,0,null,p=>engine.projectiles.push(p),b=>engine.beams.push(b));if(engine.projectiles.length!==1)throw Error('Expected one native shot');
   const p=engine.projectiles[0];p.pos.set(40,0);p.prevPos.copy(p.pos);p.ballisticTail?.copy(p.pos);p.prevBallisticTail?.copy(p.pos);p.vel.set(1000,0);p.sourceMoveSpeed=1000;p.sourceVelocity?.set(0,0);p.rangeRemaining=2000;
   await renderer.prepareAssets(combatRenderView(engine));engine.projectiles.length=0;const empty=draw();engine.projectiles.push(p);const state=JSON.stringify(captureCombat(engine,1,{0:0},0)),rng=JSON.stringify([engine.random,engine.visualRandom]);
   flight.receive(engine,index*3,0);flight.render(engine,0,true);const start=draw();flight.render(engine,50,true);const advanced=draw();
   if(JSON.stringify(captureCombat(engine,1,{0:0},0))!==state||JSON.stringify([engine.random,engine.visualRandom])!==rng)throw Error('Flight modified authority');
   const pixels=delta(start,advanced);if(!pixels)throw Error('No projectile flight pixels '+weapon);
   const display=projectileFlightLayer(engine).get(p);if(Math.abs(display.pos.x-90)>1e-6)throw Error('Unexpected head');
   checks.push({weapon,changedPixels:pixels,head:display.pos.x,tail:display.ballisticTail?.x,stats:flight.stats(),glError:gl.getError()});
   // Expose the TPC pose for screenshot; remove only after capture.
   window.finishFlight=()=>{engine.projectiles.length=0;flight.receive(engine,index*3+1,80);flight.render(engine,90,true);return {noLayer:!projectileFlightLayer(engine),removedPixels:delta(empty,draw())};};
   if(index===0){const end=window.finishFlight();if(!end.noLayer||end.removedPixels!==0)throw Error('Retained removed shot pixels');checks.at(-1).removed=true;}
  }
  return {scope:'Native heavymortar/TPC, isolated headless WebGL, synthetic snapshot times. Not original-game screenshot parity, Steam transport or RTT.',checks};
 });
 await page.screenshot({path:out+'/flight-tpc.png'});const finish=await page.evaluate(()=>window.finishFlight());assert.equal(finish.noLayer,true);
 assert.equal(finish.removedPixels,0,'removed authority projectile leaves no ghost pixels');
 assert.deepEqual(errors,[]);for(const c of report.checks)assert.equal(c.glError,0);report={...report,finish,errors};await page.evaluate(()=>window.renderer.dispose());
}finally{await browser?.close();await browserServer?.kill();await vite?.close();clearTimeout(watchdog);}
report.cleanupCompleted=true;await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
