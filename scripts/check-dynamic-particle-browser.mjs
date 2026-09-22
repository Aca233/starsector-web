import {particleReferenceAngle,particleReferenceDrag} from '../src/engine/visual/ParticleMotionReference.mjs';
/** Node-authority to Chromium restore/render parity. Always headless, never live
 * rooms or desktop input. Also measures true unpack/replay cost, not just bytes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const {chromium}=createRequire(import.meta.url)('playwright');
const directory=process.env.PARTICLE_RECORDING_DIR || 'artifacts/network-stream-20260921/particle-paired-exact';
const fixtures=JSON.parse(fs.readFileSync(path.join(directory,'fixtures.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'ordinary/manifest.json'),'utf8'));
const allowedNames=new Set([...fixtures.rows,...manifest.rows].map(r=>r.name));
assert.ok([...allowedNames].every(name=>/^(?:fixture-)?[0-9]+\.bin$/.test(name)));
const samples=(rows)=>rows.map(row=>({...row,ordinary:'/__particle_frames/ordinary/'+row.name,recipe:'/__particle_frames/recipe/'+row.name}));
const stride=Number(process.env.PARTICLE_FRAME_STRIDE ?? 12);assert.ok(Number.isInteger(stride)&&stride>=1&&stride<=241);
const referenceSamples=Array.from({length:1024},(_,i)=>{const angle=i/1023*Math.PI*2,speed=(i-512)*.375,drag=-i/1023*.1;return {angle,speed,drag,expected:[...particleReferenceAngle(angle,speed),particleReferenceDrag(drag)]};});
const input={referenceSamples,fixtures:{...fixtures,rows:samples(fixtures.rows)},combat:{...manifest,rows:samples(manifest.rows.filter((_,i)=>i%stride===0))}};
// Stream fixture pairs instead of serializing >100MB in one CDP argument.
// Register BEFORE Vite's SPA fallback, which otherwise serves HTML with 200.
const fixturePlugin={name:'particle-fixture-stream',configureServer(server){server.middlewares.use((req,res,next)=>{const match=/^\/__particle_frames\/(ordinary|recipe)\/((?:fixture-)?[0-9]+\.bin)$/.exec(req.url??'');if(!match)return next();if(!allowedNames.has(match[2])){res.statusCode=404;res.end();return;}res.setHeader('Content-Type','application/octet-stream');res.end(fs.readFileSync(path.join(directory,match[1],match[2])));});}};
const server=await createServer({plugins:[fixturePlugin],server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});let browser;
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:640,height:360}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__particle_check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body><canvas id="battle" width="640" height="360"></canvas></body>'}));
 await page.goto(`http://127.0.0.1:${port}/__particle_check.html`);
 const result=await page.evaluate(async(input)=>{
  window.__LAN_BUILD_ID__='particle-parity';
  const reference=await import('/src/engine/visual/ParticleMotionReference.mjs');
  for(const s of input.referenceSamples){const got=[...reference.particleReferenceAngle(s.angle,s.speed),reference.particleReferenceDrag(s.drag)];for(let i=0;i<3;i++)if(!Object.is(got[i],s.expected[i]))throw Error('Cross-runtime reference mismatch');}
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {applyCombatSnapshot}=await import('/src/network/CombatSnapshot.ts');
  const {captureAuthorityCombat}=await import('/src/network/HostSnapshot.ts');
  const {decodeBinaryState,encodeProjectedBinaryFrame}=await import('/src/network/BinarySnapshot.mjs');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');
  const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
  const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
  const decode=async url=>{const response=await fetch(url);if(!response.ok||!response.headers.get('content-type')?.startsWith('application/octet-stream'))throw Error('Missing binary particle fixture '+url);return decodeBinaryState(new Uint8Array(await response.arrayBuffer())).frame;};
  const equal=(a,b,label)=>{if(a.length!==b.length)throw Error(label+' length '+a.length+' != '+b.length);for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(label+' byte '+i+': '+a[i]+' != '+b[i]);};
  const canvas=document.getElementById('battle'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});if(!gl)throw Error('WebGL2 unavailable');
  const renderer=new WebGLCombatRenderer(canvas,gl),pixels=[],timings={ordinary:[],recipe:[]};let compared=0,residualRows=0,absoluteRows=0;
  const countMotion=value=>{if(!value||typeof value!=='object')return;if(value.$dynamicParticles){for(const row of value.$dynamicParticles[2])if(Array.isArray(row)){if(row[3].length===5)residualRows++;else if(row[3].length===4)absoluteRows++;}}else for(const v of Object.values(value))countMotion(v);};
  const sample=engine=>{
   renderer.render(combatRenderView(engine),1,new Vector2(),1,{visualTime:1,random:new VisualRandom(917),layers:new Set(['explosion']),damageEnabled:true});
   const pixels=new Uint8Array(640*360*4);gl.readPixels(0,0,640,360,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error');return pixels;
  };
  try{
   for(const [suite,fixtures]of Object.entries({fixtures:input.fixtures,combat:input.combat})){
    const engines=[createLanWorld(fixtures.match).engine,createLanWorld(fixtures.match).engine];
    for(const row of fixtures.rows){
     for(const [i,mode]of ['ordinary','recipe'].entries()){
      const frame=await decode(row[mode]);if(mode==='recipe')countMotion(frame);const start=performance.now();applyCombatSnapshot(engines[i],frame,false);timings[mode].push(performance.now()-start);
     }
     const a=encodeProjectedBinaryFrame(captureAuthorityCombat(engines[0],row.tick,{},0,null,false)),b=encodeProjectedBinaryFrame(captureAuthorityCombat(engines[1],row.tick,{},0,null,false));
     try{equal(a,b,'complete restored world '+suite+' '+row.tick);}catch(error){
      const diffs=[];const walk=(a,b,p)=>{if(diffs.length>=12||Object.is(a,b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of Object.keys(a))walk(a[k],b[k],p+'.'+k);}else diffs.push([p,a,b]);};
      walk(engines[0].fxSystem.particles,engines[1].fxSystem.particles,'particles');walk(engines[0].fxSystem.debris,engines[1].fxSystem.debris,'debris');throw Error(error.message+' '+JSON.stringify(diffs));
     }compared++;
     if(suite==='fixtures'){
      for(const engine of engines)await renderer.prepareAssets(combatRenderView(engine));
      sample(engines[0]);sample(engines[1]); // stabilize both asset caches before comparison
      const p=sample(engines[0]),q=sample(engines[1]);equal(p,q,'render '+row.tick);
      let lit=0;for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])>40)lit++;
      pixels.push({tick:row.tick,litPixels:lit,identical:true});
     }
    }
   }
   if(pixels[0].litPixels<100)throw Error('FX pixel probe was blank');
   const quantile=(xs,f)=>xs.toSorted((a,b)=>a-b)[Math.floor((xs.length-1)*f)];
   return {referenceCases:input.referenceSamples.length,residualRows,absoluteRows,comparedCompleteWorlds:compared,pixels,applyMs:Object.fromEntries(Object.entries(timings).map(([k,xs])=>[k,{p50:quantile(xs,.5),p95:quantile(xs,.95),max:Math.max(...xs)}])),renderer:gl.getParameter(gl.RENDERER),scope:'Node-produced ordinary vs recipe binaries; exact restored full state and same Chromium WebGL FX pixels. Headless renderer (GPU backend not identified), NOT real-player FPS, native UI parity, LAN or Steam latency.'};
  }finally{renderer.dispose();}
 },input);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,pageErrors:errors},null,2));
}finally{await browser?.close();await server.close();}
