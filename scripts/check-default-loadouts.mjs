import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out=process.argv[2]??'artifacts/unused-native-media-20260929';
await fs.mkdir(out,{recursive:true});
const server=await createServer({logLevel:'error',cacheDir:'node_modules/.vite-empty-default-review',server:{host:'127.0.0.1',port:0,open:false,watch:{ignored:['**/artifacts/**','**/output/**']}}});let browser;
const errors=[],missing=[];
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:900,height:820}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/game-assets/'))missing.push(r.url());});
 await page.route('**/__empty_defaults',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#091018;color:#d7e2e9;font:16px sans-serif}header{padding:14px}canvas{display:block}</style><header id="label">新船空装：保留内置；预设由用户显式选择</header><canvas width="900" height="760"></canvas>'}));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__empty_defaults');
 const report=await page.evaluate(async()=>{
  globalThis.__LAN_BUILD_ID__="empty-default-review";
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const M=await import('/src/studio/DesignModel.ts'),{extensionVariantsForHull}=await import('/src/studio/ExtensionVariantCatalog.ts');
  const {bundledHullTemplate}=await import('/src/engine/content/BundledHullTemplates.ts');
  const {aiFitsForHull,aiFitCountForHull}=await import('/src/network/LanAiFits.ts');
  const {registerAiLoadout}=await import('/src/network/ai-loadouts.mjs');
  const {simulationRoster,prepareSimulationOption}=await import('/src/engine/content/SimulationCatalog.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const {soundPaths,soundVariants}=await import('/src/engine/audio/SoundBank.ts');
  const walk=s=>[s,...(s.modules??[]).flatMap(m=>walk(m.spec))];
  const fitted=s=>walk(s).reduce((n,s)=>n+s.weaponSlots.filter(w=>w.defaultWeaponId).length,0);
  const wings=s=>walk(s).reduce((n,s)=>n+(s.fighterWings??[]).length,0);
  const defaults=[],presets=[],legacy=[];
  for(const hull of M.hulls){
   for(const mode of ['standard','empty']){
    const d=M.createDesign(hull.id,mode),{spec,errors}=M.evaluate(d);check(!errors.length,'Empty errors '+hull.id+': '+errors.join(','));
    for(const s of walk(spec)){check(!s.weaponSlots.some(w=>w.defaultWeaponId&&!w.builtIn),'Autofitted gun '+s.id);check(!(s.fighterWings??[]).length,'Autofitted wing '+s.id);check(!(s.hullMods??[]).length&&!(s.sMods??[]).length,'Autofitted mod '+s.id);}
    check(d.capacitors===0&&d.vents===0,'Invested flux');M.decodeDesign(d);
   }
   const source=bundledHullTemplate(hull.id);for(const s of walk(hull))check(!s.weaponSlots.some(w=>w.defaultWeaponId&&!w.builtIn),'Runtime default gun '+s.id);
   defaults.push({hull:hull.id,modules:walk(hull).length-1,builtInGuns:fitted(hull)});
   if(source){const old=M.designFromModule(source);const before=JSON.stringify(old),copy=M.decodeDesign(old),restored=M.evaluate(copy).spec;check(JSON.stringify(old)===before,'Save mutated');check(fitted(restored)===fitted(source),'Implicit old module guns lost');check(wings(restored)===wings(source),'Implicit old module wings lost');legacy.push(hull.id);}
   for(const choice of extensionVariantsForHull(hull.id)){
    const d=choice.create(),before=JSON.stringify(d),decoded=M.decodeDesign(d),result=M.evaluate(decoded);
    check(JSON.stringify(d)===before,'Preset mutated by decode');check(fitted(result.spec)>0,'Preset empty '+choice.id);check(!result.errors.length,'Preset validation '+choice.id+': '+result.errors.join(','));
    presets.push({id:choice.id,hull:hull.id,guns:fitted(result.spec),wings:wings(result.spec),modules:walk(result.spec).length-1});
   }
  }
  check(presets.length===10,'Preset catalogue changed');
  const saved=extensionVariantsForHull('web_zhefeng')[0].create(),savedBefore=JSON.stringify(saved);
  const aiChoices=[];
  for(const hull of M.hulls){
   const snapshot=M.createDesign(hull.id);snapshot.id='extension:zhefeng-assault';
   const before=JSON.stringify(snapshot),registeredBefore=JSON.stringify(M.baseHull(hull.id));
   const fits=aiFitsForHull(hull.id,[snapshot,saved]),savedCount=[snapshot,saved].filter(d=>d.hullId===hull.id).length;
   check(fits.length===aiFitCountForHull(hull.id,savedCount),'AI choice count mismatch '+hull.id);
   check(new Set(fits.map(f=>f.display.id)).size===fits.length,'AI option identity collision');
   const blank=fits.find(f=>f.display.id==='default:'+hull.id);check(blank?.selection&&!blank.display.error,'AI blank unavailable');
   check(walk(M.evaluate(blank.selection.design).spec).every(s=>s.weaponSlots.every(w=>!w.defaultWeaponId||w.builtIn)),'AI blank auto-equipped');
   const extensions=fits.filter(f=>f.display.id.startsWith('extension:'));
   check(extensions.length===extensionVariantsForHull(hull.id).length,'AI preset missing '+hull.id);
   for(const option of extensions){
    check(option.selection&&!option.display.error,'AI preset invalid '+option.display.id+': '+option.display.error);
    const spec=M.evaluate(option.selection.design).spec;
    check(option.display.detail.startsWith(fitted(spec)+' 门武器'),'AI module weapon count wrong');
   }
   const savedOption=fits.find(f=>f.display.id==='saved:'+snapshot.id);check(savedOption?.selection,'AI saved choice missing');
   savedOption.selection.design.name='isolated local edit';
   check(JSON.stringify(snapshot)===before&&JSON.stringify(saved)===savedBefore,'AI listing/preview mutated saves');
   check(JSON.stringify(M.baseHull(hull.id))===registeredBefore,'AI listing mutated hull registry');
   if(extensions.length){
    extensions[0].selection.design.hullMods.push('invalid-local-edit');
    const fresh=aiFitsForHull(hull.id).find(f=>f.display.id===extensions[0].display.id);
    check(fresh.selection&&!fresh.selection.design.hullMods.includes('invalid-local-edit')&&!fresh.display.error,'AI preset template mutated');
   }
   aiChoices.push({hull:hull.id,blank:true,presets:extensions.length,saved:savedCount,options:fits.length});
  }
  check(aiChoices.reduce((sum,hull)=>sum+hull.presets,0)===10,'AI did not preserve all ten presets');
  const roster=simulationRoster([saved]);check(roster.filter(o=>o.origin==='extension').length===10,'Simulator lost presets');
  check(roster.filter(o=>o.origin==='default').length===M.hulls.length,'Simulator missing independent blank choice');
  const fromSave=prepareSimulationOption(roster.find(o=>o.origin==='saved'));check(fromSave.design.id===saved.id&&JSON.stringify(saved)===savedBefore,'Saved option changed');
  for(const [key,path] of Object.entries(soundPaths)){check(assetManager.hasPath(path),'Missing sound '+path);for(const v of soundVariants(key)??[])check(assetManager.hasPath(v.file),'Missing sound variant');}
  const {createLanWorld}=await import('/src/network/LanWorld.ts'),{Vector2}=await import('/src/engine/math/Vector2.ts'),{WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts'),{combatRenderView}=await import('/src/engine/render/CombatRenderView.ts'),{VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const make=design=>createLanWorld({id:'default-check',seed:41,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhefeng',...(design?{design}:{})},{id:'p1',seat:1,team:1,hull:'web_zhefeng'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  const empty=make();check(empty.playerShip.weapons.length===0&&empty.enemyShip.weapons.length===0,'Bare match reequipped guns');
  const chosenAi=aiFitsForHull('web_zhefeng').find(f=>f.display.id==='extension:zhefeng-assault').selection.design;
  const blankOptions={assignment:'teams',battleSize:400,aiHulls:[[],[]]},beforeOptions=JSON.stringify(blankOptions);
  const registered=registerAiLoadout(blankOptions,chosenAi);check(JSON.stringify(blankOptions)===beforeOptions,'Registering AI changed previous room options');
  const aiWorld=createLanWorld({id:'explicit-ai-check',seed:42,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhefeng'}],
   options:{...registered.options,aiHulls:[[],['web_zhefeng',registered.key]]}}).engine;
  const aiWeaponCounts=aiWorld.allCapitalShips.filter(s=>s.teamId===1).map(s=>s.weapons.length).sort((a,b)=>a-b);
  check(JSON.stringify(aiWeaponCounts)==='[0,6]'&&aiWorld.playerShip.weapons.length===0,'AI selection leaked into blank hulls');
  const engine=make(saved),ship=engine.playerShip;check(ship.weapons.length===6,'Explicit preset not deployed');engine.enemyShip.pos.set(10000,10000);engine.enemyShip.prevPos.copy(engine.enemyShip.pos);engine.asteroids.length=0;ship.pos.set(0,0);ship.prevPos.copy(ship.pos);ship.facingRad=ship.prevFacingRad=-Math.PI/2;
  for(const w of ship.weapons)w.currentAngleRad=w.prevAngleRad=ship.facingRad+w.baseAngleDeg*Math.PI/180;
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});check(gl,'No WebGL2');const renderer=new WebGLCombatRenderer(canvas,gl),view=combatRenderView(engine);await renderer.prepareAssets(view);
  const frame={visualTime:0,random:new VisualRandom(42),layers:new Set(['hull','weapon','trail','explosion','beam','shield']),damageEnabled:true};
  renderer.render(view,1,new Vector2(),1.85,frame);check(gl.getError()===0,'GL error');
  let shots=0;ship.isFiringMain=true;ship.aimTargetWorld.set(0,-1000);for(let i=0;i<120;i++)ship.update(1/120,null,()=>shots++,()=>{},undefined,{ships:[ship],missiles:[],asteroids:[]});check(shots>0,'Selected preset cannot fire');
  document.querySelector('#label').textContent='已手动选择「折锋 · 突击破甲」：六炮恢复；新建空装舰仍为零可换武器';
  return {defaults,presets,aiChoices,aiWeaponCounts,legacySavesChecked:legacy,savedSnapshotPreserved:true,registeredSounds:Object.keys(soundPaths).length,blankMatchGuns:0,explicitPresetGuns:ship.weapons.length,controlledShots:shots,glError:0,scope:'Production model + controlled LAN world and renderer; no natural battle or native desktop validation.'};
 });
 await page.screenshot({path:out+'/explicit-preset-installed.png'});assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 await fs.writeFile(out+'/loadout-validation.json',JSON.stringify({...report,errors,missing},null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();await server.close();}
