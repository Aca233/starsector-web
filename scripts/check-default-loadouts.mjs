import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out=process.argv[2]??'artifacts/default-first-template-20261001';
await fs.mkdir(out,{recursive:true});
const server=await createServer({logLevel:'error',cacheDir:'node_modules/.vite-first-default-review',server:{host:'127.0.0.1',port:0,open:false,watch:{ignored:['**/artifacts/**','**/output/**']}}});let browser;
const errors=[],missing=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});const page=await browser.newPage({viewport:{width:900,height:820}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/game-assets/'))missing.push(r.url());});
 await page.route('**/__first_defaults',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#091018;color:#d7e2e9;font:16px sans-serif}header{padding:14px}canvas{display:block}</style><header id="label">新舰船默认使用首个装配模板</header><canvas width="900" height="760"></canvas>'}));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__first_defaults');
 const report=await page.evaluate(async()=>{
  globalThis.__LAN_BUILD_ID__="first-default-review";
  let checks=0;const check=(ok,msg)=>{checks++;if(!ok)throw Error(msg);};
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
   const first=extensionVariantsForHull(hull.id)[0];check(first,'Missing first template '+hull.id);
   const expected=M.evaluate(first.create());check(!expected.errors.length,'First template invalid '+hull.id);
   for(const d of [M.createDesign(hull.id),M.createDesign(hull.id,'standard')]){
    const result=M.evaluate(d);check(!result.errors.length,'Default invalid '+hull.id+': '+result.errors.join(','));
    check(JSON.stringify(result.spec)===JSON.stringify(expected.spec),'Default differs from first template '+hull.id);M.decodeDesign(d);
   }
   {
    const d=M.createDesign(hull.id,'empty'),{spec,errors}=M.evaluate(d);check(!errors.length,'Empty errors '+hull.id+': '+errors.join(','));
    for(const s of walk(spec)){check(!s.weaponSlots.some(w=>w.defaultWeaponId&&!w.builtIn),'Autofitted gun '+s.id);check(!(s.fighterWings??[]).length,'Autofitted wing '+s.id);check(!(s.hullMods??[]).length&&!(s.sMods??[]).length,'Autofitted mod '+s.id);}
    check(d.capacitors===0&&d.vents===0,'Invested flux');M.decodeDesign(d);
   }
   const source=bundledHullTemplate(hull.id);for(const s of walk(hull))check(!s.weaponSlots.some(w=>w.defaultWeaponId&&!w.builtIn),'Runtime default gun '+s.id);
   defaults.push({hull:hull.id,firstTemplate:first.id,modules:walk(expected.spec).length-1,guns:fitted(expected.spec),wings:wings(expected.spec)});
   if(source){const old=M.designFromModule(source);const before=JSON.stringify(old),copy=M.decodeDesign(old),restored=M.evaluate(copy).spec;check(JSON.stringify(old)===before,'Save mutated');check(fitted(restored)===fitted(source),'Implicit old module guns lost');check(wings(restored)===wings(source),'Implicit old module wings lost');legacy.push(hull.id);}
   for(const choice of extensionVariantsForHull(hull.id)){
    const d=choice.create(),before=JSON.stringify(d),decoded=M.decodeDesign(d),result=M.evaluate(decoded);
    check(JSON.stringify(d)===before,'Preset mutated by decode');check(fitted(result.spec)>0,'Preset empty '+choice.id);check(!result.errors.length,'Preset validation '+choice.id+': '+result.errors.join(','));
    presets.push({id:choice.id,hull:hull.id,guns:fitted(result.spec),wings:wings(result.spec),modules:walk(result.spec).length-1});
   }
  }
  check(presets.length===13,'Preset catalogue changed: '+presets.length);
  const saved=extensionVariantsForHull('web_zhefeng')[0].create(),savedBefore=JSON.stringify(saved);
  const aiChoices=[];
  for(const hull of M.hulls){
   const snapshot=M.createDesign(hull.id);snapshot.id='extension:zhefeng-assault';
   const before=JSON.stringify(snapshot),registeredBefore=JSON.stringify(M.baseHull(hull.id));
   const fits=aiFitsForHull(hull.id,[snapshot,saved]),savedCount=[snapshot,saved].filter(d=>d.hullId===hull.id).length;
   check(fits.length===aiFitCountForHull(hull.id,savedCount),'AI choice count mismatch '+hull.id);
   check(new Set(fits.map(f=>f.display.id)).size===fits.length,'AI option identity collision');
   const defaultFit=fits.find(f=>f.display.id==='default:'+hull.id);check(defaultFit?.selection&&!defaultFit.display.error,'AI default unavailable');
   check(JSON.stringify(M.evaluate(defaultFit.selection.design).spec)===JSON.stringify(M.evaluate(M.createDesign(hull.id)).spec),'AI default mismatch');
   check(!fits.some(f=>f.display.name.includes('空白')),'AI still lists blank template');
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
   aiChoices.push({hull:hull.id,firstTemplate:true,presets:extensions.length,saved:savedCount,options:fits.length});
  }
  check(aiChoices.reduce((sum,hull)=>sum+hull.presets,0)===13,'AI lost presets');
  const roster=simulationRoster([saved]);check(roster.filter(o=>o.origin==='extension').length===13,'Simulator lost presets');
  check(roster.filter(o=>o.origin==='default').length===M.hulls.length,'Simulator missing default choice');
  for(const hull of M.hulls){
   const options=roster.filter(o=>o.hullId===hull.id);check(options[0].origin==='default','Simulator default is not first '+hull.id);
   const resolved=prepareSimulationOption(options[0]);check(!resolved.errors.length,'Simulator default invalid');
   check(JSON.stringify(M.evaluate(resolved.design).spec)===JSON.stringify(M.evaluate(M.createDesign(hull.id)).spec),'Simulator default mismatch');
  }
  const fromSave=prepareSimulationOption(roster.find(o=>o.origin==='saved'));check(fromSave.design.id===saved.id&&JSON.stringify(saved)===savedBefore,'Saved option changed');
  for(const [key,path] of Object.entries(soundPaths)){check(assetManager.hasPath(path),'Missing sound '+path);for(const v of soundVariants(key)??[])check(assetManager.hasPath(v.file),'Missing sound variant');}
  const {createLanWorld}=await import('/src/network/LanWorld.ts'),{Vector2}=await import('/src/engine/math/Vector2.ts'),{WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts'),{combatRenderView}=await import('/src/engine/render/CombatRenderView.ts'),{VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const make=design=>createLanWorld({id:'default-check',seed:41,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhefeng',...(design?{design}:{})},{id:'p1',seat:1,team:1,hull:'web_zhefeng'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  const defaultWorld=make();check(defaultWorld.playerShip.weapons.length===6&&defaultWorld.enemyShip.weapons.length===6,'Bare match missing default guns');
  const explicitEmpty=make(M.createDesign('web_zhefeng','empty'));check(explicitEmpty.playerShip.weapons.length===0&&explicitEmpty.enemyShip.weapons.length===6,'Explicit clear or opponent default changed');
  const {CombatEngine}=await import('/src/engine/simulation/CombatEngine.ts');
  const {defaultShipFit}=await import('/src/engine/content/DefaultShipFit.ts');
  const {isImmutableMetadata,immutableCopy}=await import('/src/engine/extensions/Immutable.ts');
  const {effectiveWeaponRange,combatWeaponRange}=await import('/src/engine/simulation/WeaponRange.ts');
  const {hullModDefinitions,hasOnlyNativeRangeModifiers,installedHullMods}=await import('/src/engine/extensions/HullMods.ts');
  const {shipSegmentEntry}=await import('/src/engine/ai/FireControlGeometry.ts');
  const certified=value=>{
   if(!value||typeof value!=='object')return;
   check(isImmutableMetadata(value)&&Object.isFrozen(value),'Uncertified default fit metadata');
   for(const child of Object.values(value))certified(child);
  };
  const metadataFits=[];
  for(const hull of M.hulls){
   const direct=new CombatEngine(hull.id,hull.id,43),expected=M.evaluate(M.createDesign(hull.id)).spec;
   check(JSON.stringify(direct.playerShip.spec)===JSON.stringify(expected),'Direct combat default mismatch '+hull.id);
   const extra=direct.addShip(hull.id,false,new Vector2());check(JSON.stringify(extra.spec)===JSON.stringify(expected),'Reinforcement default mismatch '+hull.id);
   direct.switchPlayerShip(hull.id,hull.id);check(JSON.stringify(direct.playerShip.spec)===JSON.stringify(expected),'Switch default mismatch '+hull.id);
   for(const ship of [direct.playerShip,direct.enemyShip,extra])certified(ship.spec);
   const completed=defaultShipFit(hull.id),snapshot=JSON.stringify(completed),draft=M.createDesign(hull.id),preview=M.evaluate(draft).spec;
   certified(completed);check(snapshot===JSON.stringify(preview),'Immutable factory changes equipment/numbers '+hull.id);
   check(completed!==preview&&!isImmutableMetadata(preview)&&!Object.isFrozen(preview),'Studio preview frozen '+hull.id);
   for(const part of walk(preview)){
    check(!Object.isFrozen(part)&&!Object.isFrozen(part.weaponSlots),'Module preview frozen '+part.id);
    if(part.bounds?.length){check(!Object.isFrozen(part.bounds)&&!Object.isFrozen(part.bounds[0]),'Studio geometry frozen '+part.id);part.bounds[0][0]+=1;}
    part.maxSpeed+=1;
   }
   draft.name+=' editable';draft.hullMods.push('isolated-draft-edit');preview.id+='-preview';
   check(JSON.stringify(completed)===snapshot,'Draft/preview edit leaked into combat metadata '+hull.id);
   const second=defaultShipFit(hull.id);check(second!==completed&&JSON.stringify(second)===snapshot,'Default factory shares or changes fit '+hull.id);
   metadataFits.push({hull:hull.id,modules:walk(completed).length-1,recursiveCertificate:true,editablePreviewIsolated:true});
  }
  // Explicit caller-owned metadata retains identity, mutability and live geometry.
  const mutable=M.evaluate(M.createDesign('web_zhefeng')).spec;
  mutable.bounds=[[-10,-10],[10,-10],[10,10],[-10,10]];
  const explicit=defaultWorld.addShip(mutable,false,new Vector2());
  check(explicit.spec===mutable&&explicit.spec.bounds===mutable.bounds&&!Object.isFrozen(mutable),'Explicit ShipSpec ownership changed');
  check(shipSegmentEntry(explicit,new Vector2(-20,0),new Vector2(20,0),true)===.25,'Mutable geometry initial contact');
  for(const point of mutable.bounds)point[0]+=100;
  check(shipSegmentEntry(explicit,new Vector2(-20,0),new Vector2(20,0),true)===null,'Mutable geometry stale cached bound');
  const plain=M.evaluate(M.createDesign('web_zhefeng')).spec;
  plain.builtInHullMods=[];plain.hullMods=['advancedcore','ballistic_rangefinder'];plain.sMods=[];plain.captainSkills={};
  const fixed=immutableCopy(plain);check(hasOnlyNativeRangeModifiers(fixed),'Range invalidation test misses native cache');
  const weapon={...defaultWorld.playerShip.weapons[0].spec,range:600,weaponType:'BALLISTIC',mountSize:'SMALL',mountTypeOverride:'BALLISTIC',isPointDefense:false,isBeam:false,isRocket:false,spawnType:'PROJECTILE',aiHints:[]};
  const compareRange=label=>{const oracle=effectiveWeaponRange(plain,weapon);check(effectiveWeaponRange(fixed,weapon)===oracle,'Mutable weapon stale: '+label);check(effectiveWeaponRange(fixed,weapon)===oracle,'Repeated range stale: '+label);return oracle;};
  const normalRange=compareRange('initial');weapon.range=735;compareRange('range');weapon.range=600;
  weapon.aiHints.push('PD');check(compareRange('in-place PD hints')!==normalRange,'PD hint fixture has no effect');weapon.aiHints.pop();
  weapon.isPointDefense=true;compareRange('point defense');weapon.aiHints=undefined;compareRange('missing hints');
  weapon.mountSize='MEDIUM';compareRange('size');weapon.mountTypeOverride='HYBRID';compareRange('hybrid');
  weapon.weaponType='MISSILE';weapon.spawnType='MISSILE';weapon.isRocket=true;compareRange('missile');
  weapon.weaponType='ENERGY';weapon.mountTypeOverride=undefined;weapon.isBeam=true;compareRange('beam');
  // Keep dynamic ECM and system inputs live even without advancing a tick.
  const live=defaultWorld.playerShip,liveOracle={spec:structuredClone(live.spec),system:live.system,ecmRangePenalty:0};
  let systemRange=0,systemReads=0;const originalRange=live.system.getWeaponRangePercent;
  live.system.getWeaponRangePercent=()=>{systemReads++;return systemRange;};
  const dynamicRanges=[];
  try{
   for(const [ecm,percent] of [[0,0],[20,0],[20,50],[0,50],[0,0]]){
    live.ecmRangePenalty=liveOracle.ecmRangePenalty=ecm;systemRange=percent;
    const range=combatWeaponRange(live,weapon);check(range===combatWeaponRange(liveOracle,weapon),'ECM/system range stale');dynamicRanges.push(range);
   }
   check(systemReads===10&&dynamicRanges[0]===dynamicRanges[4]&&dynamicRanges[0]!==dynamicRanges[1]&&dynamicRanges[1]!==dynamicRanges[2],'Dynamic range fixture/callback mismatch');
  }finally{live.system.getWeaponRangePercent=originalRange;live.ecmRangePenalty=0;}
  // Unknown extension behavior never gains result-caching permission by freezing metadata.
  let rangeCalls=0,rangeBonus=7;
  hullModDefinitions.register({id:'metadata-regression-live-range',name:'Metadata regression',status:'implemented',rangePercent:()=>{rangeCalls++;return rangeBonus;}});
  const unknownPlain={...plain,builtInHullMods:[],hullMods:['metadata-regression-live-range']},unknown=immutableCopy(unknownPlain);
  check(!hasOnlyNativeRangeModifiers(unknown),'Unknown hook admitted as native');
  const firstRange=effectiveWeaponRange(unknown,weapon);check(effectiveWeaponRange(unknown,weapon)===firstRange&&rangeCalls===2,'Unknown repeated callback cached');
  rangeBonus=37;const changedRange=effectiveWeaponRange(unknown,weapon);
  check(changedRange!==firstRange&&changedRange===effectiveWeaponRange(unknownPlain,weapon)&&rangeCalls===4,'Unknown live callback changed');
  const installed=installedHullMods(unknown);installed.length=0;check(installedHullMods(unknown).length===1,'Cached hullmod list exposed to caller');
  const chosenAi=aiFitsForHull('web_zhefeng').find(f=>f.display.id==='extension:zhefeng-assault').selection.design;
  const blankOptions={assignment:'teams',battleSize:400,aiHulls:[[],[]]},beforeOptions=JSON.stringify(blankOptions);
  const registered=registerAiLoadout(blankOptions,chosenAi);check(JSON.stringify(blankOptions)===beforeOptions,'Registering AI changed previous room options');
  const aiWorld=createLanWorld({id:'explicit-ai-check',seed:42,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhefeng'}],
   options:{...registered.options,aiHulls:[[],['web_zhefeng',registered.key]]}}).engine;
  const aiWeaponCounts=aiWorld.allCapitalShips.filter(s=>s.teamId===1).map(s=>s.weapons.length).sort((a,b)=>a-b);
  check(JSON.stringify(aiWeaponCounts)==='[6,6]'&&aiWorld.playerShip.weapons.length===6,'AI or player default missing');
  const engine=make(saved),ship=engine.playerShip;check(ship.weapons.length===6,'Explicit preset not deployed');engine.enemyShip.pos.set(10000,10000);engine.enemyShip.prevPos.copy(engine.enemyShip.pos);engine.asteroids.length=0;ship.pos.set(0,0);ship.prevPos.copy(ship.pos);ship.facingRad=ship.prevFacingRad=-Math.PI/2;
  for(const w of ship.weapons)w.currentAngleRad=w.prevAngleRad=ship.facingRad+w.baseAngleDeg*Math.PI/180;
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});check(gl,'No WebGL2');const renderer=new WebGLCombatRenderer(canvas,gl),view=combatRenderView(engine);await renderer.prepareAssets(view);
  const frame={visualTime:0,random:new VisualRandom(42),layers:new Set(['hull','weapon','trail','explosion','beam','shield']),damageEnabled:true};
  renderer.render(view,1,new Vector2(),1.85,frame);check(gl.getError()===0,'GL error');
  let shots=0;ship.isFiringMain=true;ship.aimTargetWorld.set(0,-1000);for(let i=0;i<120;i++)ship.update(1/120,null,()=>shots++,()=>{},undefined,{ships:[ship],missiles:[],asteroids:[]});check(shots>0,'Selected preset cannot fire');
  document.querySelector('#label').textContent='默认「折锋 · 突击破甲」：玩家与 AI 均装六门武器；每艘舰船使用首个模板';
  return {checks,metadataFits,dynamicRanges,unknownRangeHookCalls:rangeCalls,explicitMutableSpecPreserved:true,defaults,presets,aiChoices,aiWeaponCounts,legacySavesChecked:legacy,savedSnapshotPreserved:true,registeredSounds:Object.keys(soundPaths).length,defaultMatchGuns:defaultWorld.playerShip.weapons.length,explicitEmptyGuns:explicitEmpty.playerShip.weapons.length,explicitPresetGuns:ship.weapons.length,controlledShots:shots,glError:0,scope:'Production model + controlled LAN world and renderer; no natural battle or native desktop validation.'};
 });
 await page.screenshot({path:out+'/explicit-preset-installed.png'});assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 await fs.writeFile(out+'/loadout-validation.json',JSON.stringify({...report,errors,missing},null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();await server.close();}
