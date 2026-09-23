// Headless Chromium, real WebGL renderer/native assets; no desktop interaction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)('playwright');
const out='artifacts/network-stream-20260921/phase16';await fs.mkdir(out,{recursive:true});
let vite,browser,browserServer,report;
const watchdog=setTimeout(()=>{console.error('prediction browser watchdog');void browserServer?.kill().finally(()=>process.exit(1));},90000);watchdog.unref();
try{
 vite=await createServer({configFile:false,root:process.cwd(),optimizeDeps:{noDiscovery:true,include:[]},define:{__LAN_BUILD_ID__:'"prediction-browser"'},
  plugins:[{name:'prediction-test-page',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__prediction.html')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#080b14;color:white;font:16px sans-serif}canvas{display:block}</style><div>Headless prediction check - native projectile renderer</div><canvas id="view" width="800" height="420"></canvas>');});}}],
  server:{host:'127.0.0.1',port:0,open:false,watch:{ignored:['**/artifacts/**']}},logLevel:'error'});
 await vite.listen();browserServer=await chromium.launchServer({headless:true,args:['--enable-unsafe-swiftshader']});browser=await chromium.connect(browserServer.wsEndpoint());
 const page=await browser.newPage({viewport:{width:800,height:450}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+vite.httpServer.address().port+'/__prediction.html');
 report=await page.evaluate(async()=>{
  window.__LAN_BUILD_ID__="prediction-browser";
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const {createLanWorld}=await import('/src/network/LanWorld.ts');const {captureCombat}=await import('/src/network/CombatSnapshot.ts');
  const {LocalFirePrediction}=await import('/src/network/LocalFirePrediction.ts');const {predictedProjectileLayer}=await import('/src/engine/render/PredictedProjectileLayer.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {updateGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');updateGraphicsSettings({maxFrameRate:0,renderScale:1,screenShake:0});
  const match={id:'prediction-browser',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'hammerhead'},{id:'b',seat:1,team:1,hull:'hammerhead'}],options:{assignment:'teams',battleSize:3200,aiHulls:[[],[]]}};
  const engine=createLanWorld(match).engine,ship=engine.playerShip;
  const mount=ship.weapons.find(m=>m.spec.id==='heavymortar');if(!mount)throw Error('Native heavy mortar missing');
  ship.weaponGroups=[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:[mount.slotId],alternatingIndex:0}];ship.selectedGroupIndex=0;
  ship.pos.set(0,0);ship.prevPos.set(0,0);ship.facingRad=ship.prevFacingRad=mount.currentAngleRad=0;ship.aimTargetWorld.set(2000,0);
  const prediction=new LocalFirePrediction(),input={seq:1,keys:0,aim:[2000,0],firing:true,pointerActive:true,actions:[]};prediction.receive(engine,1,0,0);
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
  const renderer=window.renderer=new WebGLCombatRenderer(canvas,gl);await renderer.prepareAssets(combatRenderView(engine));
  const frame={visualTime:0,random:new VisualRandom(match.seed),layers:new Set(['hull','weapon']),damageEnabled:false};
  const draw=()=>{renderer.render(combatRenderView(engine),1,new Vector2(80,0),1.6,frame);gl.finish();const bytes=new Uint8Array(800*420*4);gl.readPixels(0,0,800,420,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
  const before=draw(),state=JSON.stringify(captureCombat(engine,1,{0:0,1:0},0)),random=JSON.stringify([engine.random,engine.visualRandom]);
  prediction.record(engine,input,0,true);prediction.render(engine,1000/60,true);
  if(JSON.stringify(captureCombat(engine,1,{0:0,1:0},0))!==state||JSON.stringify([engine.random,engine.visualRandom])!==random)throw Error('Prediction changed authority');
  const after=draw();let changed=0;for(let i=0;i<before.length;i+=4)if(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2])changed++;
  if(changed===0)throw Error('No actual rendered projectile pixels');
  window.finishCheck=()=>{prediction.receive(engine,2,1,100);prediction.render(engine,100,true);const restored=draw();let difference=0;for(let i=0;i<before.length;i++)if(before[i]!==restored[i])difference++;return {resolved:prediction.stats(),noGhost:!predictedProjectileLayer(engine),restoredPixelDifference:difference};};
  return {scope:'Actual headless Chromium WebGL/native assets/local prediction only; simulated input time. Not native Steam/n2n/RTT or native desktop visual parity.',changedPixels:changed,weapon:mount.spec.id,authorityProjectileCount:engine.projectiles.length,stats:prediction.stats(),glError:gl.getError(),resources:renderer.getResourceStats()};
 });
 await page.screenshot({path:out+'/first-round.png'});
 const finish=await page.evaluate(()=>window.finishCheck());assert.equal(finish.noGhost,true);assert.equal(finish.restoredPixelDifference,0);assert.equal(finish.resolved.resolvedWithoutProjectile,1);
 assert.equal(report.authorityProjectileCount,0);assert.ok(report.stats.lastResponseMs<=17);assert.equal(report.glError,0);assert.deepEqual(errors,[]);
 report={...report,...finish,pageErrors:errors};await page.evaluate(()=>window.renderer.dispose());
}finally{await browser?.close();await browserServer?.kill();await vite?.close();clearTimeout(watchdog);}
report.cleanupCompleted=true;await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
