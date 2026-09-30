import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out='artifacts/engine-apertures';await fs.mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});let browser;
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:800,height:650}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.route('**/__engine_fit.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#080d13;color:#cfe3ef;font:16px sans-serif}header{height:40px;padding:8px;box-sizing:border-box}canvas{display:block}</style><header id="title">真实渲染 / 喷口贴合</header><canvas width="800" height="610"></canvas>'}));
 await page.route('**/__exhaust_worker.mjs',r=>r.fulfill({contentType:'text/javascript',body:"globalThis.__LAN_BUILD_ID__='exhaust-check';self.onmessage=async()=>{try{const{checkExhaustRules}=await import('/scripts/engine-aperture-scenarios.mjs');self.postMessage({result:checkExhaustRules()});}catch(e){self.postMessage({error:String(e.stack||e)});}};"}));
 await page.goto(`http://127.0.0.1:${port}/__engine_fit.html`);
 if(!process.argv.includes('--render-only')){
  const rules=await page.evaluate(async()=>{globalThis.__LAN_BUILD_ID__='exhaust-check';const m=await import('/scripts/engine-aperture-scenarios.mjs');return m.checkExhaustRules();});
  const worker=await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('/__exhaust_worker.mjs',{type:'module'});const t=setTimeout(()=>{w.terminate();reject(Error('worker timeout'));},60000);w.onmessage=({data})=>{clearTimeout(t);w.terminate();if(data.error)reject(Error(data.error));else resolve(data.result);};w.onerror=e=>{clearTimeout(t);w.terminate();reject(Error(e.message));};w.postMessage('check');}));
  assert.deepEqual(worker,rules);await fs.writeFile(out+'/rules.json',JSON.stringify({main:rules,worker},null,2));console.log('Rules main/worker',rules.checks.length);
 }
 const renders=[];
 for(const hull of ['web_zhefeng','web_sc2_hyperion','web_gloriana','web_zhuyuan','web_expanse_rocinante'].filter(id=>!process.argv.includes('--zhefeng-only')||id==='web_zhefeng')){
  const setup=await page.evaluate(async(hull)=>{
   globalThis.__LAN_BUILD_ID__='engine-fit';globalThis.__fit?.renderer.dispose();
   const {updateGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');updateGraphicsSettings({maxFrameRate:0});
   const {createWorld}=await import('/scripts/engine-aperture-scenarios.mjs');const {Vector2}=await import('/src/engine/math/Vector2.ts');
   const {assemblyParts,assemblyShipIds}=await import('/src/engine/content/ModuleGeometry.ts');
   const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
   const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
   const engine=createWorld(hull),ship=engine.playerShip,parts=assemblyParts(ship.spec),ids=assemblyShipIds(ship.id,ship.spec);engine.asteroids.length=0;
   const own=engine.ships.filter(s=>ids.includes(s.id));
   // Content definitions are frozen: test-only visual variants must clone, never mutate the registry.
   for(const s of own)s.spec=structuredClone(s.spec);
   for(const s of engine.ships){const index=ids.indexOf(s.id);if(index<0){s.pos.set(100000,100000);s.prevPos.copy(s.pos);continue;}
    const part=parts[index];s.pos.set(part.y,-part.x);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=-Math.PI/2+part.angle;s.visibilityMask=0xffffffff;s.selectedGroupIndex=-1;s.shield.setActive(false);
    for(const w of s.weapons)w.currentAngleRad=w.prevAngleRad=s.facingRad+w.baseAngleDeg*Math.PI/180;
   }
   const mouths=own.flatMap(s=>s.spec.engineSlots.filter(e=>e.exhaust?.mode==='NATIVE').map(e=>({x:s.pos.x+e.x*Math.cos(s.facingRad)-e.y*Math.sin(s.facingRad),y:s.pos.y+e.x*Math.sin(s.facingRad)+e.y*Math.cos(s.facingRad),width:e.width})));
   const cx=(Math.min(...mouths.map(p=>p.x))+Math.max(...mouths.map(p=>p.x)))/2,cy=Math.max(...mouths.map(p=>p.y));
   const span=Math.max(130,Math.max(...mouths.map(p=>p.x+p.width))-Math.min(...mouths.map(p=>p.x-p.width)));
   const zoom=Math.min(2.7,650/span),cam=new Vector2(cx,cy-55/zoom);
   const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});const renderer=new WebGLCombatRenderer(canvas,gl);const view=combatRenderView(engine);await renderer.prepareAssets(view);
   const frame={visualTime:2,random:new VisualRandom(41),layers:new Set(['hull','weapon','trail']),damageEnabled:true};
   globalThis.__fit={engine,ship,own,renderer,frame,cam,zoom,view,gl,render:()=>renderer.render(view,1,cam,zoom,frame)};
   return {hull,mouths,own:own.length,camera:{x:cam.x,y:cam.y},zoom};
  },hull);
  const states=[];
  for(const mode of ['legacy','idle','full','flow-next','turn','off']){
   const result=await page.evaluate(({hull,mode})=>{
    const f=globalThis.__fit;document.querySelector('#title').textContent=hull+' / '+mode;
    for(const s of f.own){for(const [i,e]of s.spec.engineSlots.entries()){
      if(e.exhaust?.mode==='NATIVE')e.__savedExhaust=e.exhaust;
      if(e.__savedExhaust)e.exhaust=mode==='legacy'?undefined:e.__savedExhaust;
      const state=s.engineStatuses[i];state.currentThrust=state.prevThrust=e.maneuver||mode==='off'?0:mode==='idle'?.4:1;state.spread=state.prevSpread=0;
     }s.engineController.flameAccelerating=mode!=='idle';s.angularVelRad=mode==='turn'?.6:0;}
    if(mode==='turn'){const angle=.5,c=Math.cos(angle),s=Math.sin(angle);for(const ship of f.own){const dx=ship.pos.x-f.cam.x,dy=ship.pos.y-f.cam.y;ship.pos.set(f.cam.x+dx*c-dy*s,f.cam.y+dx*s+dy*c);ship.prevPos.copy(ship.pos);ship.facingRad+=angle;ship.prevFacingRad=ship.facingRad;for(const w of ship.weapons)w.currentAngleRad=w.prevAngleRad=ship.facingRad+w.baseAngleDeg*Math.PI/180;}}
    f.frame.visualTime=mode==='flow-next'?2.17:mode==='turn'?2.4:2;
    const modes=f.own.flatMap(s=>s.spec.engineSlots.map(e=>e.exhaust?.mode??'DEFAULT'));
    const rendered=f.render();const pixels=new Uint8Array(800*610*4);f.gl.readPixels(0,0,800,610,f.gl.RGBA,f.gl.UNSIGNED_BYTE,pixels);let hash=2166136261;for(const p of pixels)hash=Math.imul(hash^p,16777619)>>>0;
    return {mode,error:f.gl.getError(),rendered,modes,hash};
   },{hull,mode});assert.equal(result.error,0);assert.notEqual(result.rendered,false);states.push(result);await page.screenshot({path:`${out}/${hull}-${mode}.png`});
   if(hull==='web_zhefeng'&&mode==='full'){
    const whole=await page.evaluate(()=>{const f=globalThis.__fit;document.querySelector('#title').textContent='Zhefeng / full thrust / 1.4x';return f.renderer.render(f.view,1,new f.ship.pos.constructor(f.ship.pos.x,f.ship.pos.y+30),1.4,f.frame);});
    assert.notEqual(whole,false);await page.screenshot({path:`${out}/${hull}-whole.png`});
   }
  }
  assert.ok(!states[0].modes.includes('NATIVE'),'Comparison uses old narrow shared textures');
  assert.ok(states[2].modes.includes('NATIVE'),'Full-thrust frame uses isolated native resources');
  assert.notEqual(states[0].hash,states[2].hash,'Fitted original textures differ from the narrow shared replacements');
  assert.notEqual(states[2].hash,states[3].hash,'Flow changes with simulation visual time');
  renders.push({...setup,states});
 }
 await page.evaluate(()=>globalThis.__fit?.renderer.dispose());
 await page.setViewportSize({width:1440,height:1000});await page.goto(`http://127.0.0.1:${port}/?view=design`);
 for(const hull of ['web_zhefeng','web_sc2_hyperion','web_gloriana','web_zhuyuan','web_expanse_rocinante','web_spear_of_adun_ark']){
  await page.locator('#refit-hull-search').fill('');await page.locator(`[data-hull-id="${hull}"]`).click();await page.mouse.move(1300,900);await page.waitForTimeout(1100);
  if(hull==='web_spear_of_adun_ark')assert.equal(await page.locator('[data-engine-preview]').count(),0);
  else{await page.locator('[data-engine-preview]').waitFor();assert.equal(await page.locator('[data-engine-preview]').getAttribute('data-render-error'),null);}
  assert.equal(await page.locator('.native-engine-idle').count(),0);await page.screenshot({path:`${out}/refit-${hull}.png`});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/render.json',JSON.stringify({renders,errors,scope:'Controlled production WebGL / actual refit. Not natural flight or multiplayer.'},null,2));console.log('Production renders passed for',renders.length,'hulls; real refit pages passed');
}finally{await browser?.close();await server.close();}
