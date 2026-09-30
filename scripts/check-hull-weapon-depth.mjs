/** Bounded real-asset / production-renderer test; never registers a placeholder ship.
 * Uses an isolated ephemeral Vite port, headless Edge, and a real Worker decoder. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {createServer as createNetServer} from 'node:net';
let chromium;
try { ({chromium}=createRequire(import.meta.url)('playwright')); }
catch { ({chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright')); }
const out='artifacts/rocinante/depth-implementation';
await fs.mkdir(out,{recursive:true});
const probe=createNetServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const isolatedPort=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=await createServer({server:{host:'127.0.0.1',port:isolatedPort,strictPort:true,open:false},logLevel:'error'});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__hull_depth_check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#080a0e"><canvas id="battle" width="800" height="600"></canvas><div id="studio"></div></body>'}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__hull_depth_check.html`);
 const result=await page.evaluate(async()=>{
  window.__LAN_BUILD_ID__='hull-depth-check';
  const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const {WeaponDepthComposer}=await import('/src/engine/render/WeaponDepthFrame.ts');
  const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');
  const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
  const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
  const {validateShipSpec}=await import('/src/engine/modding/ContentValidation.ts');
  const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {resetGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');
  const {CombatPresentationEncoder}=await import('/src/engine/runtime/local/CombatPresentationEncoder.ts');
  const {setMuzzleEventSink}=await import('/src/engine/simulation/systems/CombatFXSystem.ts');
  await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded(); resetGraphicsSettings();
  const engine=createLanWorld({id:'hull-depth-check',seed:918,hostId:'p0',snapshotHz:60,
    players:[{id:'p0',seat:0,team:0,hull:'web_zhuyuan'},{id:'p1',seat:1,team:1,hull:'web_zhuyuan'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  const native=structuredClone(engine.playerShip.spec);
  const gun=contentRegistry.getWeapon('web_gloriana_bolter'); check(gun?.spawnType==='BALLISTIC','Expected existing ballistic bolter');
  const slot={slotId:'depth-test',mountType:'TURRET',slotSize:'SMALL',weaponType:'BALLISTIC',x:0,y:0,baseAngleDeg:0,arcDeg:360,builtIn:true,defaultWeaponId:gun.id,renderLayer:'BELOW_HULL'};
  const spec={...native,id:'depth-check-only',weaponSlots:[slot],defaultWeaponGroups:[],engineSlots:[],modules:undefined,fighterWings:[]};
  validateShipSpec(spec,{allowExistingId:true,requireBundledAssets:false});
  for(const change of [{renderLayer:'BAD'},{builtIn:false},{mountType:'HIDDEN'},{defaultWeaponId:'web_gloriana_interceptor'}]) {
    let rejected=false;try{validateShipSpec({...spec,weaponSlots:[{...slot,...change}]},{allowExistingId:true,requireBundledAssets:false});}catch{rejected=true;}
    check(rejected,'Invalid depth contract accepted: '+JSON.stringify(change));
  }
  const ship=engine.addShip(spec,true,new Vector2(),0,0);
  ship.visibilityMask=0xffffffff;
  const other=engine.addShip({...spec,id:'depth-check-other'},true,new Vector2(2000,0),0,0);other.visibilityMask=0xffffffff;
  engine.playerShip.pos.set(8000,8000);engine.playerShip.prevPos.set(8000,8000);
  engine.enemyShip.pos.set(-8000,-8000);engine.enemyShip.prevPos.set(-8000,-8000);
  const legacySpec={...spec,weaponSlots:[{...slot,renderLayer:undefined}]};
  const composer=new WeaponDepthComposer(),view=combatRenderView(engine);
  let eventCalls=0;setMuzzleEventSink(engine.fxSystem,()=>{eventCalls++;return true;});
  const spawn=(pos,angle,size,color,flash,velocity,smoke,owner)=>{
    if(smoke)engine.fxSystem.spawnLauncherSmoke(smoke,pos,angle,velocity,owner);
    else if(flash)engine.fxSystem.spawnAuthenticMuzzleFlash(flash,pos,angle,velocity,owner);
    else engine.muzzleFlashes.push({id:1,pos:pos.clone(),angleRad:angle,size,color,life:.1,maxLife:.1,...(owner?{underHullShipId:owner}:{})});
  };
  check(ship.weaponControl.fireWeapon(ship.weapons[0],ship,p=>engine.projectiles.push(p),()=>{},spawn),'Production firing failed');
  const p=engine.projectiles[0];check(p&&p.slotId===slot.slotId&&p.sourceShipId===ship.id,'Projectile owner/slot mismatch');
  check(eventCalls===0,'Owner-tagged flash incorrectly entered legacy owner-less event fast path');
  check(engine.muzzleParticles.length+engine.muzzleFlashes.length>0,'Production gun emitted no flash');
  check([...engine.muzzleParticles,...engine.muzzleFlashes].every(f=>f.underHullShipId===ship.id),'Muzzle ownership lost');
  if(gun.muzzleFlashSpec){engine.fxSystem.spawnAuthenticMuzzleFlash(gun.muzzleFlashSpec,new Vector2(),0,new Vector2());check(eventCalls===1,'Legacy muzzle event fast path regressed');}
  setMuzzleEventSink(engine.fxSystem);
  p.pos.set(8,0);p.prevPos.set(8,0);p.ballisticTail=new Vector2(-5,0);p.prevBallisticTail=p.ballisticTail.clone();
  let frame=composer.partition(view,1);check(frame.below.get(ship.id)?.projectiles[0]===p,'Initial shot not below its own hull');
  check(!frame.below.get(other.id)?.projectiles.length,'Shot incorrectly assigned to another ship');
  check(frame.above.projectiles.length===0,'Shot duplicated above hull');
  const original=JSON.stringify(p);ship.facingRad=Math.PI/2;ship.prevFacingRad=0;ship.pos.set(12,7);ship.prevPos.set(0,0);
  composer.partition(view,.5);check(JSON.stringify(p)===original,'Render depth moved a world-space shot');
  p.pos.set(1400,0);p.prevPos.set(1400,0);p.ballisticTail.set(1380,0);p.prevBallisticTail.set(1380,0);
  frame=composer.partition(view,1);check(frame.above.projectiles[0]===p,'Clear tracer never promoted');
  p.pos.set(8,0);p.prevPos.set(8,0);p.ballisticTail.set(-5,0);p.prevBallisticTail.set(-5,0);
  check(composer.partition(view,1).above.projectiles[0]===p,'Released shot recaptured by parent hull');
  composer.reset();check(composer.partition(view,1).below.get(ship.id)?.projectiles[0]===p,'Epoch reset retained release state');
  ship.isDead=true;check(composer.partition(view,1).above.projectiles[0]===p,'Dead owner retained launch association');ship.isDead=false;
  // Real Worker transport + production presentation decoder, not a JSON-only field check.
  const packet=new CombatPresentationEncoder(918).capture(engine,1);
  const workerSource=`self.__LAN_BUILD_ID__='hull-depth-check';const decoder=import('${location.origin}/src/engine/runtime/local/CombatPresentationDecoder.ts');
    self.onmessage=async({data})=>{try{const {CombatPresentationDecoder}=await decoder;const v=new CombatPresentationDecoder(918).apply(data).view;
      self.postMessage({slots:v.ships.flatMap(s=>s.spec.weaponSlots.filter(x=>x.renderLayer==='BELOW_HULL').map(x=>x.slotId)),
      owners:[...v.muzzleParticles,...v.muzzleFlashes].map(p=>p.underHullShipId),shots:v.projectiles.map(p=>[p.sourceShipId,p.slotId])});
    }catch(e){self.postMessage({error:String(e)});}};`;
  const workerUrl=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'})),worker=new Worker(workerUrl,{type:'module'});
  let decoded;try{decoded=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker timeout')),30000);worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);};worker.postMessage(packet);});}finally{worker.terminate();URL.revokeObjectURL(workerUrl);}
  check(!decoded.error,decoded.error);check(decoded.slots.includes(slot.slotId),'Worker dropped render layer');
  check(decoded.owners.length>0&&decoded.owners.every(id=>id===ship.id),'Worker dropped muzzle ownership');
  check(decoded.shots.some(([id,s])=>id===ship.id&&s===slot.slotId),'Worker dropped shot ownership');
  const canvas=document.getElementById('battle'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});check(gl,'WebGL2 missing');
  const renderer=new WebGLCombatRenderer(canvas,gl),context={visualTime:1,random:new VisualRandom(918),layers:new Set(['hull','weapon']),damageEnabled:true};
  const render=()=>{renderer.render(view,1,new Vector2(),1,context);const bytes=new Uint8Array(800*600*4);gl.readPixels(0,0,800,600,gl.RGBA,gl.UNSIGNED_BYTE,bytes);check(gl.getError()===gl.NO_ERROR,'WebGL error');return bytes;};
  const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>6)n++;return n;};
  const particles=engine.muzzleParticles.slice(),flashes=engine.muzzleFlashes.slice(),pixels=[];
  try {
    await renderer.prepareAssets(view);
    for(const facing of [0,Math.PI/2,Math.PI,Math.PI/4]){
      ship.pos.set(0,0);ship.prevPos.set(0,0);ship.facingRad=facing;ship.prevFacingRad=facing;
      ship.spec=spec;renderer.resetVisualState();
      engine.projectiles.length=0;engine.muzzleParticles.length=0;engine.muzzleFlashes.length=0;
      const hull=render();engine.projectiles.push(p);engine.muzzleParticles.push(...particles);engine.muzzleFlashes.push(...flashes);
      const inside=render(),hiddenDiff=diff(hull,inside);check(hiddenDiff===0,'Launch art visible through hull at '+facing+': '+hiddenDiff);
      ship.spec=legacySpec;renderer.resetVisualState();const top=render(),visibleDiff=diff(inside,top);check(visibleDiff>10,'Control art did not render above hull');
      pixels.push({facing,hiddenDiff,visibleDiff});
    }
    ship.spec=spec;ship.facingRad=0;ship.prevFacingRad=0;renderer.resetVisualState();
    engine.muzzleParticles.length=0;engine.muzzleFlashes.length=0;
    let edgeVisible=false;
    for(const x of [20,40,60,80,100,120,140,180,230,320]) {
      ship.spec=spec;renderer.resetVisualState();engine.projectiles.length=0;const hullOnly=render();
      p.pos.set(x,0);p.prevPos.set(x,0);p.ballisticTail.set(x-16,0);p.prevBallisticTail.set(x-16,0);engine.projectiles.push(p);
      const lowerShot=render();
      if(diff(hullOnly,lowerShot)>5){edgeVisible=true;break;}
    }
    check(edgeVisible,'Lower projectile never emerges at hull edge');
    engine.muzzleParticles.push(...particles);engine.muzzleFlashes.push(...flashes);
    const extent=Math.max(spec.spriteWidth,spec.spriteHeight);
    p.pos.set(extent,0);p.prevPos.set(extent,0);p.ballisticTail.set(extent-20,0);p.prevBallisticTail.set(extent-20,0);
    render();const release=composer.partition(view,1);check(release.above.projectiles.includes(p),'Outside shot not visible');
    // Read-only validation applies to actual rendering as well as partitioning.
    const before=JSON.stringify([p,ship.pos,ship.vel,ship.facingRad,ship.flux,engine.random,engine.visualRandom]);render();
    check(before===JSON.stringify([p,ship.pos,ship.vel,ship.facingRad,ship.flux,engine.random,engine.visualRandom]),'Renderer mutated authority');
    // Omitted depth uses the original borrowed view with all sidecars untouched.
    ship.spec=legacySpec;other.spec=legacySpec;check(new WeaponDepthComposer().partition(view,1).above===view,'Legacy view allocation/path changed');
    ship.spec=spec;
    // React design stage: lower art is below the hull, but the slot remains selectable.
    const ReactModule=await import('/node_modules/.vite/deps/react.js');const React=ReactModule.default??ReactModule;
    const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=ReactDOM.createRoot??ReactDOM.default?.createRoot;
    const {ShipStage}=await import('/src/studio/ShipStage.tsx');
    await import('/src/studio/studio.css');
    const root=createRoot(document.getElementById('studio'));root.render(React.createElement(ShipStage,{spec,selectedSlot:slot.slotId,onSelect:()=>{}}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const lower=document.querySelector('[data-weapon-layer="BELOW_HULL"]');
    check(lower&&getComputedStyle(lower).zIndex==='-1','Studio lower layer missing');
    check(lower.querySelector('[data-weapon-art-slot="depth-test"]'),'Studio lower gun lost');
    check(document.querySelectorAll('[data-weapon-art-slot="depth-test"]').length===lower.querySelectorAll('[data-weapon-art-slot="depth-test"]').length,'Studio duplicated lower gun on top');
    const buttons=[...document.querySelectorAll('#studio button')];check(buttons.some(b=>b.getAttribute('aria-label')?.includes('船壳下层挂点')),'Studio lost selectable belly mount label');root.unmount();
    return {scope:'Existing approved ZhuYuan hull / Gloriana bolter assets on an isolated test hull; not Rocinante art or gameplay acceptance',pixels,worker:decoded,validators:4,authorityUnchanged:true,studioLayer:true,edgeVisible};
  }finally{renderer.dispose();}
 });
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/check-result.json',JSON.stringify({...result,pageErrors:errors},null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();await server.close();}
