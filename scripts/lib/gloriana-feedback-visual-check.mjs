import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Existing Gloriana UI/Worker plus controlled production engine frames. Headless only. */
export async function runGlorianaFeedbackCheck(out=resolve('artifacts/gloriana/armory/local-feedback')){
 await mkdir(out,{recursive:true});
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
 const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true,open:false,watch:null}});
 const report={scope:'real Worker edict + controlled production Ship sealing + shared WebGL',errors:[],failedAssets:[],frames:[]};let browser,page;
 try{
  await server.listen();await server.watcher.close();
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(60000);
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(()=>{window.__feedbackWorkerErrors=[];const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('error',e=>window.__feedbackWorkerErrors.push({message:e.message,filename:e.filename,line:e.lineno}));}};});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.failedAssets.push({url:r.url(),status:r.status()});});
  await page.goto(server.resolvedUrls.local[0]+'?view=design');
  await page.locator('#refit-hull-search').fill('荣光');await page.locator('button[data-hull-id="web_gloriana"]').click();
  await page.getByRole('button',{name:/模拟战斗/}).waitFor({state:'visible'});await page.mouse.move(1550,1050);
  await page.getByRole('button',{name:/模拟战斗/}).click();await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
  await page.waitForFunction(()=>!!window.__combatSession?.workerHost&&window.__combatReadView?.playerShip?.weapons?.length===12);
  await page.keyboard.press('Space');await page.evaluate(()=>window.__combatSession.barrier());
  await page.evaluate(async()=>{
   const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
   const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
   const canvas=document.createElement('canvas');canvas.id='feedback-canvas';canvas.width=1400;canvas.height=950;
   canvas.style.cssText='position:fixed;left:0;top:0;z-index:99999;background:#080c15';document.body.append(canvas);
   const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
   const renderer=new WebGLCombatRenderer(canvas,gl);const s=window.__combatSession,h=s.workerHost;
   const data=window.feedback={renderer,gl,VisualRandom,s,h,view:()=>h.latest.presentation.view,frame:null};
   data.read=()=>{const v=data.view();return {time:v.combatTime,state:v.playerShip.system.state,effect:v.playerShip.system.effectLevel,parts:v.ships.filter(p=>(p.spec.sourceHullId??p.spec.id).startsWith('web_gloriana')&&p.spec.hullSize!=='FIGHTER').map(p=>({id:p.spec.sourceHullId??p.spec.id,feedback:p.surfaceFeedback}))};};
   data.draw=()=>{const v=data.view(),frame={visualTime:v.combatTime,random:new VisualRandom(829),layers:new Set(['background','hull','weapon']),damageEnabled:true};renderer.updateVisual(v,0,frame);renderer.render(v,1,v.playerShip.pos,.49,frame);gl.finish();return {...data.read(),glError:gl.getError()};};
   data.advance=async(n,aimOtherSide=false)=>{let f=h.latest;const p=f.presentation.view.playerShip;
    const aim=[p.pos.x+Math.sin(p.facingRad)*3000*(aimOtherSide?-1:1),p.pos.y-Math.cos(p.facingRad)*3000*(aimOtherSide?-1:1)];
    const input={autopilot:false,blocked:false,keys:{},aim,firing:false,mouseSteering:false,pointerActive:true};
    for(let i=0;i<n;i++)f=await h.step(input);s.acceptWorkerFrame(h,f);return data.read();};
   data.order=async(side)=>{const p=h.latest.presentation.view.playerShip,k=side==='P'?1:-1;
    const aim=[p.pos.x+Math.sin(p.facingRad)*3000*k,p.pos.y-Math.cos(p.facingRad)*3000*k];
    const f=await h.commands([{kind:'ship',command:{kind:'system',value:0},aim}]);s.acceptWorkerFrame(h,f);return f.results;};
   await renderer.prepareAssets(data.view());
  });
  const shot=async(name)=>{const row=await page.evaluate(()=>window.feedback.draw());assert.equal(row.glError,0);await page.locator('#feedback-canvas').screenshot({path:resolve(out,name+'.png')});report.frames.push({name,...row});return row;};
  await shot('worker-idle');
  const accepted=await page.evaluate(()=>window.feedback.order('P'));assert(accepted[0].accepted);
  await page.evaluate(()=>window.feedback.advance(12));const charging=await shot('worker-left-in');assert(charging.effect>0&&charging.effect<1);
  await page.evaluate(()=>window.feedback.advance(48,true));const active=await shot('worker-left-active');
  assert.equal(active.state,'ACTIVE');assert.deepEqual(active.parts.filter(p=>p.feedback).map(p=>p.id).sort(),['web_gloriana_p1','web_gloriana_p2','web_gloriana_p3']);
  const activeHull=await page.screenshot({clip:{x:600,y:275,width:85,height:300}});
  const pausedBefore=await page.locator('#feedback-canvas').screenshot();const freeze=await page.evaluate(()=>window.feedback.read());
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.deepEqual(await page.evaluate(()=>window.feedback.read()),freeze);await page.evaluate(()=>window.feedback.draw());assert.deepEqual(await page.locator('#feedback-canvas').screenshot(),pausedBefore);report.pausedPixelsStable=true;
  await page.evaluate(()=>window.feedback.advance(60,true));await shot('worker-left-flow');
  assert.notDeepEqual(await page.screenshot({clip:{x:600,y:275,width:85,height:300}}),activeHull);report.activePortHullPixelsAnimate=true;
  await page.evaluate(async()=>{const d=window.feedback;let count=0;while(d.h.latest.presentation.view.playerShip.system.state!=='OUT'&&count++<500)await d.advance(1);if(count>=500)throw Error('No OUT phase');await d.advance(25);});
  const outFrame=await shot('worker-left-out');assert.equal(outFrame.state,'OUT');assert(outFrame.effect<1&&outFrame.effect>0);
  await page.evaluate(()=>window.feedback.advance(70));assert((await shot('worker-left-ended')).parts.every(p=>!p.feedback));
  await page.evaluate(async()=>{const d=window.feedback;let count=0;while(d.h.latest.presentation.view.playerShip.system.state!=='IDLE'&&count++<1600)await d.advance(1);if(count>=1600)throw Error('No cooldown end');});
  assert((await page.evaluate(()=>window.feedback.order('S')))[0].accepted);await page.evaluate(()=>window.feedback.advance(60));
  const right=await shot('worker-right-active');assert.deepEqual(right.parts.filter(p=>p.feedback).map(p=>p.id).sort(),['web_gloriana_s1','web_gloriana_s2','web_gloriana_s3']);
  const vent=await page.evaluate(async()=>{const d=window.feedback;const f=await d.h.commands([{kind:'ship',command:{kind:'vent'}}]);d.s.acceptWorkerFrame(d.h,f);await d.advance(2);return f.results;});
  assert(vent[0].accepted);assert((await shot('worker-vent-cancel')).parts.every(p=>!p.feedback));report.workerVentCancelled=true;
  // Use authoritative Ship.update for exact damage/flux preconditions, never alter a display replica.
  await page.evaluate(async()=>{
   const d=window.feedback;
   const {CombatEngine}=await import('/src/engine/simulation/CombatEngine.ts');
   const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
   const {createDesign,evaluate}=await import('/src/studio/DesignModel.ts');
   const e=new CombatEngine('web_gloriana','web_zhuyuan',82928);e.switchPlayerShip(evaluate(createDesign('web_gloriana')).spec);
   e.openBattlefield=true;e.asteroids.length=0;e.nebulae.length=0;
   const root=e.playerShip;root.facingRad=root.prevFacingRad=-Math.PI/2;
   // Moving modules are placed by the actual assembly synchronizer on the update path.
   e.enemyShip.pos.set(40000,40000);e.enemyShip.prevPos.copy(e.enemyShip.pos);e.enemyAI.update=()=>{};
   for(const p of root.assemblyShips){p.fireControlMode='MANUAL';p.isFiringMain=false;p.flux.softFlux=p.flux.hardFlux=0;}
   e.fixedUpdate(1/60);
   d.engine=e;d.part=root.childModules.find(p=>p.moduleMount.slotId==='P1');d.view=()=>combatRenderView(e);
   d.tickPart=(dt)=>{d.part.update(dt,null,()=>{},()=>{});e.combatTime+=dt;};
   d.part.hullHp=d.part.maxHullHp*.4;d.part.flux.hardFlux=d.part.flux.maxFlux*.9;
   await d.renderer.prepareAssets(d.view());
  });
  const waiting=await shot('controlled-seal-waiting');assert.equal(waiting.parts.find(p=>p.id==='web_gloriana_p1').feedback.mode,'WAITING');
  await page.evaluate(()=>{const d=window.feedback;d.part.flux.hardFlux=0;d.tickPart(1/60);d.tickPart(.12);});
  await shot('controlled-seal-closing');await page.evaluate(()=>window.feedback.tickPart(.55));await shot('controlled-seal-held');
  await page.evaluate(()=>window.feedback.tickPart(4.98));const ending=await shot('controlled-seal-releasing');assert(ending.parts.find(p=>p.id==='web_gloriana_p1').feedback.level<1);
  await page.evaluate(()=>window.feedback.tickPart(.35));assert((await shot('controlled-seal-ended')).parts.every(p=>!p.feedback));
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedAssets,[]);await page.evaluate(()=>window.feedback.renderer.dispose());
  console.log('PASS local feedback: Worker phases/side-lock/vent/pause + controlled sealing WebGL');
 }catch(error){report.failure=String(error);report.workerErrors=await page?.evaluate(()=>window.__feedbackWorkerErrors).catch(()=>[]);await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw error;}
 finally{await writeFile(resolve(out,'verification.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
 return report;
}
