import {spriteCapacityExperiment} from './lib/sprite-capacity-experiment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)('playwright');
const out=path.resolve(process.env.BATCH_TEST_OUT??'artifacts/network-stream-20260922/phase39/battle-batch');await fs.mkdir(out,{recursive:true});
const server=await createServer({configFile:false,plugins:[{name:'test-only-capacity',enforce:'pre',load(id){if(id.split('?')[0].replaceAll('\\','/').endsWith('/SpriteBatcher.ts'))return spriteCapacityExperiment;}}],optimizeDeps:{noDiscovery:true,entries:[]},server:{host:'127.0.0.1',port:0,open:false,watch:null},define:{__LAN_BUILD_ID__:'"batch-parity"'},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,args:[...(process.env.MULTIPLAYER_ANGLE?['--use-angle='+process.env.MULTIPLAYER_ANGLE]:[]),'--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1280,height:360}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__batch_check.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"><canvas id="a" width="640" height="360"></canvas><canvas id="b" width="640" height="360"></canvas><canvas id="c" width="640" height="360"></canvas></body>'}));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__batch_check.html');
 const report=await page.evaluate(async()=>{
  window.__LAN_BUILD_ID__="batch-parity";
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const {createLanWorld}=await import('/src/network/LanWorld.ts');const {captureCombat}=await import('/src/network/CombatSnapshot.ts');const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');const {SpriteBatcher}=await import('/src/engine/render/webgl/SpriteBatcher.ts');const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const match={id:'batch-check',seed:917,hostId:'p0',snapshotHz:60,players:Array.from({length:5},(_,i)=>({id:'p'+i,seat:i,team:i%2,hull:'onslaught'})),options:{assignment:'teams',battleSize:3200,aiHulls:[Array(9).fill('hammerhead'),Array(8).fill('hammerhead')]}};
  const engine=createLanWorld(match).engine;for(let i=0;i<600;i++)engine.fixedUpdate(1/60);
  const contexts=['a','b','c'].map((id,i)=>{const canvas=document.getElementById(id),gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true}),renderer=new WebGLCombatRenderer(canvas,gl);if(renderer.batcher.textureCapacity!==4)throw Error('Production batcher default not active');renderer.batcher.dispose();renderer.batcher=new SpriteBatcher(gl,[4,8,16][i]);return {canvas,gl,renderer,times:[],draws:[],random:new VisualRandom(917)};});
  for(const c of contexts)await c.renderer.prepareAssets(combatRenderView(engine));
  const stateBefore=JSON.stringify(captureCombat(engine,600,{},0)),layers=new Set(['background','nebula','asteroid','trail','hull','weapon','beam','shield','explosion','markers']);
  const camera=engine.playerShip.pos.clone();
  for(let i=0;i<100;i++)for(const index of i%2?[2,1,0]:[0,1,2]){const c=contexts[index],frame={visualTime:10,random:c.random,layers,damageEnabled:true};c.renderer.updateVisual(combatRenderView(engine),0,frame);const at=performance.now();c.renderer.render(combatRenderView(engine),1,camera,.35,frame);c.gl.finish();if(i>=20){c.times.push(performance.now()-at);c.draws.push(c.renderer.getResourceStats().drawCalls);}if(c.gl.getError()!==0)throw Error('WebGL draw error');}
  const stateAfter=JSON.stringify(captureCombat(engine,600,{},0));const pixels=contexts.map(c=>{const p=new Uint8Array(640*360*4);c.gl.readPixels(0,0,640,360,c.gl.RGBA,c.gl.UNSIGNED_BYTE,p);return p;});let different=0,maxDifference=0;for(const candidate of pixels.slice(1))for(let i=0;i<pixels[0].length;i++){const d=Math.abs(pixels[0][i]-candidate[i]);if(d)different++;maxDifference=Math.max(maxDifference,d);}
  const q=(a,p)=>a.toSorted((a,b)=>a-b)[Math.floor((a.length-1)*p)];const stats=contexts.map(c=>({textureCapacity:c.renderer.batcher.textureCapacity,meanMs:c.times.reduce((a,b)=>a+b,0)/c.times.length,p50Ms:q(c.times,.5),p95Ms:q(c.times,.95),drawCalls:q(c.draws,.5),image:c.canvas.toDataURL('image/png')}));
  const gl=contexts[0].gl,debug=gl.getExtension('WEBGL_debug_renderer_info'),gpu=gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER);
  for(const c of contexts)c.renderer.dispose();return {gpu,ships:engine.allCapitalShips.length,tick:600,projectiles:engine.projectiles.length,different,maxDifference,unchangedState:stateBefore===stateAfter,stats};
 });
 for(let i=0;i<report.stats.length;i++){await fs.writeFile(path.join(out,'slots-'+[4,8,16][i]+'.png'),Buffer.from(report.stats[i].image.split(',')[1],'base64'));delete report.stats[i].image;}
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({...report,errors,scope:'Fixed-state alternating render+gl.finish work, NOT network Hz or RAF FPS'},null,2));console.log(JSON.stringify(report,null,2));assert.deepEqual(errors,[]);assert.equal(report.different,0);assert.equal(report.unchangedState,true);assert.equal(report.ships,22);
}finally{await browser?.close();await server.close();}
