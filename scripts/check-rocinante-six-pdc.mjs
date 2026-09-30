/** Six real Rocinante art mounts, production firing/rendering/studio checks.
 * Ballistic numbers are borrowed only inside this isolated geometry probe, not a new playable ship. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {createServer as netServer} from 'node:net';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out='artifacts/rocinante/six-pdc-installation';await fs.mkdir(out,{recursive:true});
const calibration=JSON.parse(await fs.readFile('output/imagegen/rocinante/prepared-v02/pdc.json','utf8'));
const probe=netServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1140,height:940},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>罗西南特六炮安装</title><style>body{margin:24px;background:#10171f;color:#e2e7ed;font:14px/1.65 "Microsoft YaHei",sans-serif}h1{font-size:24px;margin:0}p{color:#aabccc;margin:5px 0 14px}.board{display:grid;grid-template-columns:590px 480px;gap:18px}canvas{display:block;background:#0a111b}h2{font-size:17px;margin:0 0 8px}.pair{display:flex;gap:10px}.pair div{width:235px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;border-bottom:1px solid #344250;padding:7px 4px}footer{color:#ddbd8f;margin-top:14px}#studio{position:absolute;left:-5000px;width:600px;height:600px}</style><h1>罗西南特 · 六门PDC安装</h1><p>四门侧炮 + 后段背、腹各一门。所有挂点锁定内置；图像为当前真实贴图，非原作精确坐标。</p><div class="board"><section><h2>生产WebGL渲染 · 船壳遮挡开启</h2><canvas id="battle" width="590" height="660"></canvas></section><section><div class="pair"><div><h2>正常视距 · 舰长约220</h2><canvas id="normal" width="235" height="265"></canvas></div><div><h2>腹炮单独剖视 · 仅诊断</h2><canvas id="cutaway" width="235" height="265"></canvas></div></div><table><thead><tr><th>挂点</th><th>位置 / 层</th><th>射界</th></tr></thead><tbody id="mounts"></tbody></table><p>背炮与腹炮处在同一投影位置，但各有独立ID、瞄准和弹体；腹炮不搬到顶面。</p></section></div><footer>安装工程验证，不是完整可玩舰船。侧面射界为Web改编；轨炮、鱼雷和最终军械数值不在本轮验收范围。</footer><div id="studio"></div></html>';
 await fs.writeFile(out+'/review-shell.html',html);
 await page.route('**/__roci_six.html',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(`http://127.0.0.1:${port}/__roci_six.html`);
 const result=await page.evaluate(async(calibration)=>{
  window.__LAN_BUILD_ID__='roci-six-mounts';
  const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
  const check=(c,m)=>{if(!c)throw Error(m);};
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {rocinanteInstallation:art,rocinanteHullArt,rocinantePdcArt,rocinantePdcSlots}=await import('/src/engine/content/RocinanteInstallation.ts');
  const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
  const {validateShipSpec}=await import('/src/engine/modding/ContentValidation.ts');
  const {weaponArtLayout,installationPose}=await import('/src/engine/content/WeaponInstallation.ts');
  const {advanceTurretAim}=await import('/src/engine/simulation/systems/weapon/WeaponAim.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');const {VisualRandom}=await import('/src/engine/runtime/VisualRandom.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');const {WebGLCombatRenderer}=await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
  const {WeaponDepthComposer}=await import('/src/engine/render/WeaponDepthFrame.ts');
  const {resetGraphicsSettings}=await import('/src/engine/runtime/GraphicsSettings.ts');
  await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();resetGraphicsSettings();
  const beforeShips=contentRegistry.getAllShips().map(s=>s.id).join('|');
  // Reuse an existing firing fixture, NOT its art or an asserted new balance profile.
  const fixture={...structuredClone(contentRegistry.getWeapon('web_gloriana_bolter')),...rocinantePdcArt,id:'roci-six-art-probe-pdc',nameKey:'roci-six-art-probe-pdc',minSpread:0,maxSpread:0,spreadPerShot:0,soundKey:undefined,soundLoopKey:undefined,soundIntroKey:undefined,fluxPerShot:0};
  contentRegistry.registerWeapon(fixture,false);
  const slots=rocinantePdcSlots(fixture.id);check(slots.length===6&&new Set(slots.map(s=>s.slotId)).size===6,'Six unique mounts required');
  check(slots.every(s=>s.builtIn&&s.slotSize==='SMALL'&&s.controlRole==='POINT_DEFENSE'),'Builtin/size/fire-control contract');
  check(slots.filter(s=>s.renderLayer==='BELOW_HULL').length===5,'Four side roots and belly must be below hull');
  check(slots[4].x===slots[5].x&&slots[4].y===slots[5].y,'Dorsal/ventral projection moved apart');
  const engine=createLanWorld({id:'roci-six-geometry',seed:921,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhuyuan'},{id:'p1',seat:1,team:1,hull:'web_zhuyuan'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  const spec={...structuredClone(engine.playerShip.spec),...rocinanteHullArt,id:'rocinante-installation-probe',sourceHullId:'rocinante-installation-probe',shieldType:'NONE',shieldRadius:0,voidShield:undefined,systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',weaponSlots:slots,defaultWeaponGroups:[{index:0,weaponSlotIds:slots.map(s=>s.slotId),mode:'LINKED',isAutofire:true}],engineSlots:[],modules:undefined,moduleSlots:undefined,modulePropulsion:undefined,fighterWings:[],builtInHullMods:[],hullMods:[],sMods:[]};
  validateShipSpec(spec,{allowExistingId:true,requireBundledAssets:false});
  const ship=engine.addShip(spec,true,new Vector2(),0,0);ship.visibilityMask=0xffffffff;
  engine.playerShip.pos.set(8000,8000);engine.playerShip.prevPos.set(8000,8000);engine.enemyShip.pos.set(-8000,-8000);engine.enemyShip.prevPos.set(-8000,-8000);
  const poses=[];const flashes=[];const spawn=(pos,angle,size,color,flash,velocity,smoke,owner)=>flashes.push({owner,position:[pos.x,pos.y],slot:currentSlot});let currentSlot='';
  for(const facing of [0,45,90,180])for(const mount of ship.weapons)for(const fraction of [-1,0,1]){
   const slot=slots.find(s=>s.slotId===mount.slotId),half=slot.arcDeg===360?170:slot.arcDeg/2;
   ship.facingRad=facing*Math.PI/180;ship.vel.set(47,-21);mount.currentAngleRad=ship.facingRad+(slot.baseAngleDeg+fraction*half)*Math.PI/180;mount.ammo=Infinity;mount.currentSpreadDeg=0;currentSlot=slot.slotId;
   const bullets=[];check(ship.weaponControl.fireWeapon(mount,ship,p=>bullets.push(p),()=>{},spawn),'Production shot failed');check(bullets.length===1,'Unexpected number of physical shots');
   const bullet=bullets[0],a=weaponArtLayout(mount.spec,...calibration.textureSize);
   const mountX=ship.pos.x+slot.x*Math.cos(ship.facingRad)-slot.y*Math.sin(ship.facingRad),mountY=ship.pos.y+slot.x*Math.sin(ship.facingRad)+slot.y*Math.cos(ship.facingRad);
   // Source-derived muzzle must rotate about the same local pivot as the artwork.
   const dx=(calibration.authorMuzzleTexture[0]/calibration.textureSize[0]-a.pivotX)*a.width;
    const dy=(calibration.authorMuzzleTexture[1]/calibration.textureSize[1]-a.pivotY)*a.height,angle=mount.currentAngleRad+Math.PI/2;
    const expected=[mountX+dx*Math.cos(angle)-dy*Math.sin(angle),mountY+dx*Math.sin(angle)+dy*Math.cos(angle)];
   const error=Math.hypot(expected[0]-bullet.pos.x,expected[1]-bullet.pos.y);check(error<1e-8,'Muzzle mismatch '+slot.slotId);
   check(a.width>0&&a.height>0&&bullet.slotId===slot.slotId&&bullet.sourceShipId===ship.id,'Art/projectile owner lost');
   const seat=installationPose(slot,ship.pos.x,ship.pos.y,ship.facingRad);check(seat&&Math.abs(seat.facing-ship.facingRad)<1e-8,'Seat inherited turret yaw');
   const base=ship.facingRad+slot.baseAngleDeg*Math.PI/180,clamped=advanceTurretAim(base,base,base+Math.PI*.99,slot.arcDeg,999,0,1);
   if(slot.arcDeg<360)check(Math.abs(clamped-base)<=slot.arcDeg*Math.PI/360+1e-8,'Aim escaped side sector');
   poses.push({slot:slot.slotId,facing,fraction,error});
  }
  check(flashes.length===72,'Missing muzzle callbacks');check(flashes.every(f=>f.owner===(slots.find(s=>s.slotId===f.slot).renderLayer==='BELOW_HULL'?ship.id:undefined)),'Muzzle under-hull ownership wrong');
  const allWeapons=[...ship.weapons],view=combatRenderView(engine);const canvas=document.getElementById('battle'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false});check(gl,'No WebGL2');
  const renderer=new WebGLCombatRenderer(canvas,gl),frame={visualTime:1,random:new VisualRandom(921),layers:new Set(['hull','weapon']),damageEnabled:false};
  const render=(zoom=2.5)=>{renderer.render(view,1,new Vector2(),zoom,frame);const bytes=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);check(gl.getError()===gl.NO_ERROR,'WebGL render error');return bytes;};
  const diff=(a,b,mask)=>{let n=0;for(let y=2;y<canvas.height-2;y++)for(let x=2;x<canvas.width-2;x++){if(mask&&!mask(x,y))continue;const i=((canvas.height-1-y)*canvas.width+x)*4;if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>9)n++;}return n;};
  const load=async url=>{const im=new Image();im.src=url;await im.decode();return im;};const hullImg=await load(rocinanteHullArt.spriteUrl),gunImg=await load(fixture.turretSpriteUrl),seatImg=await load(art.installation.spriteUrl);
  const masks=document.createElement('canvas');masks.width=canvas.width;masks.height=canvas.height;const mg=masks.getContext('2d',{willReadFrequently:true});
  const masksAt=facing=>{mg.resetTransform();mg.clearRect(0,0,masks.width,masks.height);mg.translate(masks.width/2,masks.height/2);mg.rotate(facing+Math.PI/2);mg.scale(2.5,2.5);mg.drawImage(hullImg,-spec.pivotX,-spec.pivotY,spec.spriteWidth,spec.spriteHeight);const bytes=mg.getImageData(0,0,masks.width,masks.height).data;return(x,y)=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(bytes[((y+dy)*masks.width+x+dx)*4+3]<254)return false;return true;};};
  const occlusion=[];
  try{
   await renderer.prepareAssets(view);ship.vel.set(0,0);ship.angularVelRad=0;
   for(const m of allWeapons){m.glowAlpha=0;m.recoil=0;}
   for(const facing of [0,Math.PI/4,Math.PI/2,Math.PI]){
    ship.facingRad=ship.prevFacingRad=facing;ship.spec=spec;ship.weapons=[];renderer.resetVisualState();const baseline=render(),mask=masksAt(facing);
    const ventral=allWeapons.find(w=>w.slotId==='PDC_06');ventral.currentAngleRad=facing+Math.PI;ship.weapons=[ventral];const lower=render();
    const inside=diff(baseline,lower,mask);check(inside===0,'Ventral head visible through solid hull '+facing+': '+inside);
    ship.spec={...spec,weaponSlots:slots.map(s=>s.slotId==='PDC_06'?{...s,renderLayer:'ABOVE_HULL'}:s)};renderer.resetVisualState();const upper=render(),positive=diff(lower,upper,mask);check(positive>5,'Above-hull negative control did not reveal belly gun');
    occlusion.push({facing,insideChanges:inside,aboveHullControl:positive});
   }
   ship.spec=spec;ship.weapons=allWeapons;ship.facingRad=ship.prevFacingRad=-Math.PI/2;
   for(const m of ship.weapons)m.currentAngleRad=ship.facingRad+m.baseAngleDeg*Math.PI/180;
   renderer.resetVisualState();render(1);const normal=document.getElementById('normal'),ng=normal.getContext('2d');ng.drawImage(canvas,canvas.width/2-117.5,canvas.height/2-132.5,235,265,0,0,235,265);
   render(2.5);
   // Truthful diagnostic: only the belly gun, behind a translucent copy of the same hull.
   const cg=document.getElementById('cutaway').getContext('2d');cg.translate(117.5,132.5);const v=slots[5],seat=v.installation;
   cg.save();cg.translate(v.y,-v.x);cg.drawImage(seatImg,-seat.width*seat.pivotX,-seat.height*seat.pivotY,seat.width,seat.height);cg.rotate(Math.PI);const ga=weaponArtLayout(fixture,gunImg.width,gunImg.height);cg.drawImage(gunImg,-ga.width*ga.pivotX,-ga.height*ga.pivotY,ga.width,ga.height);cg.restore();
   cg.globalAlpha=.24;cg.drawImage(hullImg,-spec.pivotX,-spec.pivotY,spec.spriteWidth,spec.spriteHeight);cg.globalAlpha=1;cg.strokeStyle='#dfb36f';cg.lineWidth=1;cg.beginPath();cg.arc(v.y,-v.x,13,0,Math.PI*2);cg.stroke();
   const label=document.getElementById('mounts');for(const m of art.mounts){const tr=document.createElement('tr');for(const t of [m.slotId,m.name+(m.surface==='DORSAL'?' · 上层':' · 壳下'),m.arcDeg+'°']){const td=document.createElement('td');td.textContent=t;tr.append(td);}label.append(tr);}
   // A real world-space shot stays detached when the hull moves or turns.
   engine.projectiles.length=0;currentSlot='PDC_06';const ventral=allWeapons[5];check(ship.weaponControl.fireWeapon(ventral,ship,p=>engine.projectiles.push(p),()=>{},spawn),'Belly shot failed');const shot=engine.projectiles[0],composer=new WeaponDepthComposer();const before=JSON.stringify(shot);composer.partition(view,1);ship.facingRad+=.4;ship.pos.set(14,-8);composer.partition(view,1);check(JSON.stringify(shot)===before,'Renderer moved a fired projectile with its ship');ship.facingRad=ship.prevFacingRad=-Math.PI/2;ship.pos.set(0,0);ship.prevPos.set(0,0);engine.projectiles.length=0;
   // Real React stage: all six independent buttons remain, including the coincident pair.
   const ReactModule=await import('/node_modules/.vite/deps/react.js'),React=ReactModule.default??ReactModule;const RD=await import('/node_modules/.vite/deps/react-dom_client.js');const {ShipStage}=await import('/src/studio/ShipStage.tsx');await import('/src/studio/studio.css');const createRoot=RD.createRoot??RD.default?.createRoot;check(typeof createRoot==='function','React createRoot missing');const root=createRoot(document.getElementById('studio')),selected=[];
   const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const Harness=()=>{const [chosen,setChosen]=React.useState('PDC_06');return React.createElement(ShipStage,{spec,selectedSlot:chosen,onSelect:id=>{selected.push(id);setChosen(id);}});};
   root.render(React.createElement(Harness));await settle();
   const slotButtons=[...document.querySelectorAll('#studio button[data-slot-id]')];
   // Match stable IDs via actual ARIA labels, not DOM order or coincident screen position.
   const buttons=[...document.querySelectorAll('#studio button')];for(const s of slots){const b=buttons.find(b=>b.getAttribute('aria-label')?.includes(' '+s.slotId+'，'));check(b,'Missing studio slot '+s.slotId);b.click();}
   check(new Set(selected).size===6,'Not all six slot callbacks exist');check(document.querySelectorAll('#studio [data-weapon-layer="BELOW_HULL"]').length>0,'No actual lower art layer');
   const studioSlots=[...selected];await settle();
   // Exercise hit-testing at the shared screen position, not a direct click on an obscured button.
   const stage=document.getElementById('studio');stage.style.left='0px';stage.style.top='0px';stage.style.zIndex='999';await settle();
   const overlapClicks=[];
   for(let i=0;i<2;i++){
    const r=document.querySelector('#studio [data-slot-id="PDC_06"]').getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);check(hit?.closest('[data-slot-id]'),'No actual pointer target');
    hit.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));await settle();overlapClicks.push(selected.at(-1));
   }
   check(overlapClicks.join('|')==='PDC_05|PDC_06','Repeated shared-point clicks did not cycle dorsal/ventral');stage.style.left='-5000px';root.unmount();
   for(const m of allWeapons){m.glowAlpha=0;m.recoil=0;}
   render(2.5);
   return {scope:'Six authored Rocinante mounts with real art and production renderer/firing/studio; probe borrows existing ballistic numbers only, not final combat balance. No playable ship registration.',poses,occlusion,muzzleCallbacks:72,studioSlots,overlapClicks,slotButtons:slotButtons.length,worldShotUnaffectedByHullMotion:true,noShipRegistration:beforeShips===contentRegistry.getAllShips().map(s=>s.id).join('|')};
  }finally{renderer.dispose();}
 },calibration);
 assert.deepEqual(errors,[]);assert.ok(result.noShipRegistration);await page.screenshot({path:out+'/six-pdc-review.png',fullPage:true});await fs.writeFile(out+'/check-result.json',JSON.stringify({...result,pageErrors:errors},null,2));console.log(JSON.stringify({poses:result.poses.length,maxError:Math.max(...result.poses.map(p=>p.error)),occlusion:result.occlusion,selected:result.studioSlots,errors}));
}finally{await browser?.close();await server.close();}
