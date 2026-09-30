/** Isolated headless UI/authority-Worker acceptance; never touches the user's browser/5173 storage. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const out=resolve('artifacts/spear-of-adun/v05');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5286,strictPort:true,open:false,watch:null}});await server.listen();await server.watcher.close();
let browser,page;const errors=[],missing=[],steps=[];
try {
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/game-assets/'))missing.push(r.url());});
 await page.goto(server.resolvedUrls.local[0]+'?view=design');await page.locator('#refit-hull-search').waitFor();
 // Seed only this disposable context with the public recommended fit via the real library decoder on reload.
 await page.evaluate(async()=>{const m=await import('/src/studio/DesignModel.ts'),p=await import('/src/studio/SpearOfAdunLoadouts.ts');const d=p.createAdunDesign();localStorage.setItem(m.storageKey,JSON.stringify({version:1,draft:d,designs:[]}));});
 await page.reload();await page.locator('.studio-mount[data-slot-id="XL01"]').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('[data-installation-slot]').length===26 && [...document.querySelectorAll('.studio-weapon-image,.studio-installation-image,.studio-installation-foreground')].every(el=>el.complete&&el.naturalWidth>0));
 assert.equal(await page.locator('[data-installation-foreground-slot]').count(),2);assert.equal(await page.locator('[data-weapon-art-slot]').count(),26);assert.equal(await page.locator('[data-installation-slot]').count(),26);
 // Presentation-only close-up of the REAL refit component. No redrawn parts or fake weapon state.
 const refitDetail=async name=>{
  await page.mouse.move(10,10);
  const saved=await page.evaluate(()=>{
   const slot=document.querySelector('[data-installation-slot="XL01"]'),ship=slot.closest('.studio-ship'),stage=ship.closest('.ship-stage');
   const clean=document.createElement('style');clean.id='adun-art-review-only';clean.textContent='.studio-mount,.ship-arc{visibility:hidden!important}.studio-ship{transition:none!important}';document.head.append(clean);
   const original=ship.style.transform,worldWidth=489.6,scale=2.4*worldWidth/ship.offsetWidth;
   ship.style.transform=`scale(${scale})`;
   const r=slot.getBoundingClientRect(),b=stage.getBoundingClientRect();
   const x=b.x+b.width/2,y=b.y+b.height/2;
   ship.style.transform=`translate(${x-r.x-r.width/2}px,${y+75-r.y-r.height/2}px) scale(${scale})`;
   return {original,clip:{x:Math.round(x-240),y:Math.round(y-220),width:480,height:440}};
  });
  await page.screenshot({path:resolve(out,`xl-${name}.png`),clip:saved.clip,animations:'disabled'});
  await page.evaluate(original=>{document.querySelector('[data-installation-slot="XL01"]').closest('.studio-ship').style.transform=original;document.getElementById('adun-art-review-only')?.remove();},saved.original);
 };
 await refitDetail('installed-refit');
 await page.screenshot({path:resolve(out,'adun-refit.png'),animations:'disabled'});steps.push('recommended fit loads all 26 fixed seats and all 26 heads without missing images');
 const xl=page.locator('.studio-mount[data-slot-id="XL01"]');await xl.click();await page.getByRole('dialog').waitFor();
 const choices=await page.locator('[data-weapon-choice]').evaluateAll(els=>els.map(el=>el.getAttribute('data-weapon-choice')));
 assert(choices.includes('web_adun_solar_lance'));assert(!choices.includes('web_sc2_hyperion_ata'));await page.keyboard.press('Escape');
 // Inspect exact shared coordinates in CSS, then remove the head using the real design mutation and library load.
 const calibration=await page.locator('[data-weapon-art-slot="XL01"]').evaluate(el=>({width:el.style.width,height:el.style.height,origin:el.style.transformOrigin,transform:el.style.transform}));
 assert(calibration.origin.includes('82.902'));steps.push('XL picker excludes down-fitting and UI uses calibrated noncentral pivot');
 await page.evaluate(async()=>{const m=await import('/src/studio/DesignModel.ts');const l=JSON.parse(localStorage.getItem(m.storageKey));l.draft=m.withWeapon(l.draft,'XL01',null);localStorage.setItem(m.storageKey,JSON.stringify(l));});
 await page.reload();await page.locator('[data-installation-slot="XL01"]').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.studio-installation-image,.studio-installation-foreground,.studio-hull-image')].every(e=>e.complete&&e.naturalWidth>0));await refitDetail('empty-refit');assert.equal(await page.locator('[data-weapon-art-slot="XL01"]').count(),0);await page.screenshot({path:resolve(out,'adun-empty-seat.png'),animations:'disabled'});
 await page.evaluate(async()=>{const m=await import('/src/studio/DesignModel.ts');const l=JSON.parse(localStorage.getItem(m.storageKey));l.draft=m.withWeapon(l.draft,'XL01','web_adun_solar_lance');localStorage.setItem(m.storageKey,JSON.stringify(l));});await page.reload();await page.locator('[data-weapon-art-slot="XL01"]').waitFor();steps.push('remove/save/reload retains empty bearing; remount restores head');
 if(process.env.ADUN_REFIT_ONLY==='1'){assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PASS targeted XL refit art close-ups and empty seat');}else{
 await page.getByRole('button',{name:/模拟战斗/}).click();await page.waitForFunction(()=>document.querySelector('canvas')&&!document.body.innerText.includes('准备模拟战斗...'),{},{timeout:90000});
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
 await page.waitForFunction(()=>window.__combatSession?.renderView?.playerShip?.spec?.sourceHullId==='web_spear_of_adun');
 assert.equal(await page.evaluate(()=>window.__combatEngine===undefined),true);
 const worker=await page.evaluate(()=>{const s=window.__combatSession.renderView.playerShip;return {count:s.spec.weaponSlots.filter(x=>x.installation).length,calibration:s.weapons.find(w=>w.slotId==='XL01').spec.spritePivotY,system:s.system.type};});
 assert.equal(worker.count,26);assert(Math.abs(worker.calibration-737/889)<1e-8);assert.equal(worker.system,'WEB_ADUN_SOLAR_FORGE');
 // Gate only the disposable test context's RAF input sampling; every step still runs in the real authority Worker.
 await page.evaluate(async()=>{
  const session=window.__combatSession;session.pause();await session.barrier();
  const advance=session.fixedUpdateControlled.bind(session);session.fixedUpdateControlled=()=>false;
  window.__adunAdvance=async(frames,firing=false,thrust=false,aimOffset=0)=>{
   session.start();
   for(let i=0;i<frames;i++){
    const p=session.renderView.playerShip,angle=p.facingRad+aimOffset;
    await advance(1/60,{autopilot:false,blocked:false,keys:thrust?{KeyW:true}:{},aim:[p.pos.x+Math.cos(angle)*1500,p.pos.y+Math.sin(angle)*1500],firing,mouseSteering:false,pointerActive:true});
   }
   session.pause();await session.barrier();
  };
  const r=window.__combatRenderer,fx=await import('/src/engine/visual/AdunFXAssets.ts');
  const names=new Map(Object.entries(fx.ADUN_FX).map(([key,url])=>[r.textures.getTexture(url),{name:key,frame:'static'}]));
  for(const [key,clip] of Object.entries(fx.adunMotionClips))for(const [index,frame] of clip.frames.entries())names.set(r.textures.getTexture(frame.url),{name:key,frame:index});
  const xl=await import('/src/engine/content/spear-of-adun-xl-art.json');
  for(const [part,key] of [['body','xl-body'],['seat','xl-seat'],['foreground','xl-collar']])names.set(r.textures.getTexture('/game-assets/graphics/weapons/web_spear_of_adun/'+xl.default[part].file),{name:key,frame:'static'});
  const render=r.render.bind(r);
  r.render=(engine,alpha,cameraPos,zoom,frame)=>{
   if(window.__adunDetail){
    const p=engine.playerShip,w=p.weapons.find(w=>w.slotId==='XL01'),c=Math.cos(p.facingRad),s=Math.sin(p.facingRad);
    cameraPos=cameraPos.clone().set(p.pos.x+w.relativePos.x*c-w.relativePos.y*s+20*c,p.pos.y+w.relativePos.x*s+w.relativePos.y*c+20*s);zoom=2.4;
   }
   return render(engine,alpha,cameraPos,zoom,frame);
  };
  window.__adunDraws=[];
  for(const b of [r.batcher,r.effectBatcher].filter(Boolean)){
   const draw=b.drawSprite.bind(b);b.drawSprite=(...args)=>{const info=names.get(args[0]);if(info){window.__adunDraws.push({...info,x:args[1],y:args[2],width:args[3],height:args[4],angle:args[5],alpha:args[11]});if(window.__adunDraws.length>3000)window.__adunDraws.splice(0,1000);}return draw(...args);};
  }
 });
 const stages=[];
 const capture=async(name,expected)=>{
  await page.evaluate(()=>{window.__adunDraws=[];window.__combatSession.cameraController.reset();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await page.evaluate(()=>{const s=window.__combatSession.renderView.playerShip;return{phase:s.system.state,level:s.system.effectLevel,draws:window.__adunDraws,ammo:window.__combatSession.read.playerShip.weapons.filter(w=>w.spec.id==='web_adun_solar_lance').map(w=>w.ammo),speed:Math.hypot(s.vel.x,s.vel.y)};});
  for(const key of expected)assert(state.draws.some(d=>d.name===key),name+' missing '+key);
  await page.screenshot({path:resolve(out,`adun-fx-${name}.png`),animations:'disabled'});stages.push({name,...state});return state;
 };
 const xlDetail=async name=>{
  await page.evaluate(()=>{window.__adunDraws=[];window.__adunDetail=true;window.__combatSession.cameraController.reset();});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const state=await page.evaluate(()=>{const s=window.__combatSession.renderView.playerShip,w=s.weapons.find(w=>w.slotId==='XL01');return {facing:s.facingRad,yaw:w.currentAngleRad-s.facingRad,draws:window.__adunDraws};});
  await page.screenshot({path:resolve(out,`xl-${name}.png`),clip:{x:480,y:230,width:480,height:440},animations:'disabled'});
  await page.evaluate(()=>{window.__adunDetail=false;});return state;
 };
 const xlInstalled=await xlDetail('installed-combat');
 await page.evaluate(()=>window.__adunAdvance(250,false,false,.7));const xlTurned=await xlDetail('turned');
 assert(Math.abs(xlTurned.yaw-xlInstalled.yaw)>.4,'real Worker must turn the cannon');
 for(const frame of [xlInstalled,xlTurned]){
  const first=key=>frame.draws.find(d=>d.name===key),index=key=>frame.draws.findIndex(d=>d.name===key);
  assert(first('xl-seat')&&first('xl-body')&&first('xl-collar'));assert(index('xl-seat')<index('xl-body'));assert(index('xl-body')<index('xl-collar'));
  assert(Math.abs(first('xl-collar').angle-frame.facing-Math.PI/2)<1e-6,'lip must not follow turret aim');
 }
 await page.evaluate(()=>window.__adunAdvance(300));
 steps.push('XL empty/fitted collar in refit; actual Worker turns the body under a fixed upper lip in combat');
 await capture('idle',['exhaust']);
 await page.evaluate(()=>window.__combatRenderer.canvas.focus());await page.keyboard.press('f');
 await page.evaluate(()=>window.__adunAdvance(24));
 const ignition=await capture('ignition',['core','ignition','exhaust']);assert.equal(ignition.phase,'IN');
 await page.evaluate(()=>window.__adunAdvance(38,false,true));
 const active=await capture('active',['core','exhaust']);assert.equal(active.phase,'ACTIVE');assert(active.speed>0);
 await page.evaluate(async()=>{for(let i=0;i<120;i++){await window.__adunAdvance(1,true,true);if(window.__combatSession.read.playerShip.weapons.some(w=>w.spec.id==='web_adun_solar_lance'&&w.ammo<6))break;}});
 await page.evaluate(()=>window.__adunAdvance(1,false,true));
 const firing=await capture('firing',['core','exhaust','lance','muzzle']);assert(firing.ammo.some(a=>a<6));const xlFiring=await xlDetail('firing');assert(xlFiring.draws.some(d=>d.name==='muzzle'));
 // Hold simulation still while RAF/wall time continues: textures AND crossfade weights must freeze.
 const paused=await page.evaluate(async()=>{
  const sample=async()=>{window.__adunDraws=[];await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return [...new Set(window.__adunDraws.filter(d=>d.frame!=='static').map(d=>JSON.stringify([d.name,d.frame,Number(d.alpha.toFixed(6))])))].sort();};
  const before=await sample(),time=window.__combatSession.renderView.combatTime;
  await new Promise(r=>setTimeout(r,300));const after=await sample();
  return {before,after,timeBefore:time,timeAfter:window.__combatSession.renderView.combatTime};
 });
 assert(paused.before.length>0);assert.deepEqual(paused.after,paused.before);assert.equal(paused.timeBefore,paused.timeAfter);
 steps.push('pause freezes actual frame textures and blend weights while RAF continues');
 // Record the REAL rendered combat canvas while advancing the real Worker. No fabricated frames.
 const motion=await page.evaluate(async()=>{
  const canvas=window.__combatRenderer.canvas,stream=canvas.captureStream(30);
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)throw new Error('No WebM recorder; cannot provide a real motion preview');
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:7000000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});
  const frameSets={},timeBefore=window.__combatSession.renderView.combatTime;
  recorder.start();
  for(let i=0;i<90;i++){
   window.__adunDraws=[];await window.__adunAdvance(2,true,true);
   await new Promise(r=>requestAnimationFrame(r));await new Promise(r=>setTimeout(r,33));
   for(const d of window.__adunDraws)if(typeof d.frame==='number')(frameSets[d.name]??=new Set()).add(d.frame);
  }
  recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:mime});
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
  return {data,mime,frames:Object.fromEntries(Object.entries(frameSets).map(([k,v])=>[k,[...v].sort()])),timeBefore,timeAfter:window.__combatSession.renderView.combatTime};
 });
 for(const name of ['core','exhaust','lance'])assert(motion.frames[name]?.length===4,name+' must use all four real frames');
 await writeFile(resolve(out,'adun-motion.webm'),Buffer.from(motion.data,'base64'));delete motion.data;
 steps.push('real-canvas WebM: core, exhaust and lance cycle through all four generated frames');
 // Advance by real system phases, not wall-clock sleeps, to sample the short shutdown transition.
 await page.evaluate(async()=>{for(let i=0;i<400;i++){await window.__adunAdvance(1);const s=window.__combatSession.renderView.playerShip.system;if(s.state==='OUT'&&s.effectLevel<.6&&s.effectLevel>.3)break;}});
 const shutdown=await capture('shutdown',['core','shutdown','exhaust']);assert.equal(shutdown.phase,'OUT');
 await page.evaluate(()=>window.__adunAdvance(50));const off=await capture('off',['exhaust']);
 assert.equal(off.phase,'COOLDOWN');assert(!off.draws.some(d=>['core','ignition','shutdown','muzzle','lance'].includes(d.name)));
 steps.push('authority Worker: generated ignition/active/shutdown, projectile, muzzle and thrust textures; no lingering overlays after cooldown');
 // Spawn actual hostile ships through the existing Worker roster command, never mutate the display graph.
 const encounter=await page.evaluate(async()=>{
  const session=window.__combatSession,p=session.renderView.playerShip;
  const host=session.workerHost;
  const commands=[{kind:'add-ship',hull:'web_sc2_hyperion',isPlayer:false,position:[p.pos.x,p.pos.y-1000],facing:Math.PI/2},
    {kind:'add-ship',hull:'web_gloriana_fury',isPlayer:false,position:[p.pos.x+400,p.pos.y-100],facing:Math.PI}];
  const frame=await host.commands(commands);await session.barrier();session.refreshPresentationAssets();await session.prepareVisualAssets();
  return frame.results;
 });assert(encounter.every(r=>r.accepted));
 let sawImpact=false,sawBeam=false;
 for(let i=0;i<240&&(!sawImpact||!sawBeam);i++){
  const seen=await page.evaluate(async()=>{await window.__adunAdvance(1,true);const v=window.__combatSession.renderView;return {impact:v.hitGlows.some(g=>g.spriteUrl?.includes('web_spear_of_adun')),beam:v.beams.some(b=>b.specId==='web_adun_interception_prism'&&b.brightness>0)};});
  if(seen.beam&&!sawBeam){await capture('interception',['beam']);sawBeam=true;}
  if(seen.impact&&!sawImpact){await capture('impact',['impact']);sawImpact=true;}
 }
 assert(sawImpact,'actual collision must render the generated impact');assert(sawBeam,'actual prism must render the generated interception beam');
 steps.push('real hostile targets: textured interception and projectile impact verified through authority Worker');

 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);await writeFile(resolve(out,'browser-check.json'),JSON.stringify({steps,errors,missing,worker,firing,calibration,stages,paused,motion,xlInstalled,xlTurned,xlFiring},null,2)+'\n');console.log('PASS '+steps.join(' / '));
 }
} catch(e) {
 if(page){await page.screenshot({path:resolve(out,'browser-failure.png')});await writeFile(resolve(out,'browser-failure.txt'),await page.locator('body').innerText());}
 console.log('PAGE ERRORS',errors,'MISSING',missing);throw e;
} finally {await browser?.close();await server.close();}
