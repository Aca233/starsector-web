/** Headless asset fit + production muzzle probe. No player catalogue writes. */
import {createRequire} from 'node:module';import fs from 'node:fs/promises';import {createServer} from 'vite';import {createServer as netServer} from 'node:net';import assert from 'node:assert/strict';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const version=process.argv[2]??'prepared-v01';assert.ok(['prepared-v01','prepared-v02'].includes(version));
const out='output/imagegen/rocinante/'+version;
const probe=netServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1150,height:975},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${port}/${out}/fit-review.html`);await page.waitForFunction(()=>window.rociArtBench?.ready);
 const initial=await page.locator('#fit').screenshot();await page.evaluate(()=>window.rociArtBench.renderAt(1));
 const rotated=await page.locator('#fit').screenshot();assert.notDeepEqual(initial,rotated,'Turret preview did not rotate');
 const layerCheck=await page.evaluate(()=>{const bench=window.rociArtBench;if(!bench.renderLayer)return null;return {seatIgnoresGunYaw:bench.renderLayer('seat',0,0)===bench.renderLayer('seat',80,0),seatFollowsHull:bench.renderLayer('seat',0,0)!==bench.renderLayer('seat',0,45),headTurns:bench.renderLayer('head',0,0)!==bench.renderLayer('head',80,0)};});
 if(layerCheck)assert.ok(Object.values(layerCheck).every(Boolean),'Fixed-seat/head layer ownership failed');
 await page.evaluate(()=>window.rociArtBench.renderAt(0));await page.screenshot({path:`${out}/fit-review.png`,fullPage:true});
 const result=await page.evaluate(async()=>{
  window.__LAN_BUILD_ID__='roci-sprite-fit';
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
  const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {weaponArtLayout,installationPose}=await import('/src/engine/content/WeaponInstallation.ts');
  await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
  const before=contentRegistry.getAllShips().map(s=>s.id).join('|');
  const engine=createLanWorld({id:'roci-sprite-fit',seed:920,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhuyuan'},{id:'p1',seat:1,team:1,hull:'web_zhuyuan'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  const meta=window.rociArtBench.assets,{hull,pdc,fitStudy}=meta,gun=contentRegistry.getWeapon('web_gloriana_bolter');
  const pt=fitStudy.hullSourcePoint.map((v,i)=>v*hull.sourceToTexture.scale[i]+hull.sourceToTexture.offset[i]);
  const worldPerTex=hull.previewWorld.spriteHeight/hull.textureSize[1];
  const local=[(hull.authorPivotTexture[1]-pt[1])*worldPerTex,(pt[0]-hull.authorPivotTexture[0])*worldPerTex];
  const slot={slotId:'material-fit-only',mountType:'TURRET',slotSize:'SMALL',weaponType:'BALLISTIC',x:local[0],y:local[1],baseAngleDeg:0,arcDeg:360,builtIn:true,defaultWeaponId:gun.id,...(meta.installation?{installation:meta.installation}:{})};
  const spec={...structuredClone(engine.playerShip.spec),id:'unregistered-art-fit',systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',weaponSlots:[slot],defaultWeaponGroups:[],modules:undefined,engineSlots:[],fighterWings:[],builtInHullMods:[],hullMods:[],sMods:[]};
  const ship=engine.addShip(spec,true,new Vector2(75,90),0,0),mount=ship.weapons[0];
  mount.spec={...gun,...pdc.previewWorld,minSpread:0,maxSpread:0,spreadPerShot:0,soundKey:undefined,soundLoopKey:undefined,soundIntroKey:undefined,fluxPerShot:0,maxAmmo:undefined};
  const layout=weaponArtLayout(mount.spec,...pdc.textureSize);const poses=[];let seatPoseChecks=0;
  for(const hullDegrees of [0,45,90,180])for(const gunDegrees of [-80,0,80]){
   ship.facingRad=hullDegrees*Math.PI/180;ship.vel.set(47,-21);mount.currentAngleRad=ship.facingRad+gunDegrees*Math.PI/180;mount.currentSpreadDeg=0;mount.ammo=Infinity;
   const bullets=[];const ok=ship.weaponControl.fireWeapon(mount,ship,p=>bullets.push(p),()=>{});
   if(!ok||bullets.length!==1)throw Error('Real firing probe failed');
   const bullet=bullets[0],mountX=ship.pos.x+local[0]*Math.cos(ship.facingRad)-local[1]*Math.sin(ship.facingRad),mountY=ship.pos.y+local[0]*Math.sin(ship.facingRad)+local[1]*Math.cos(ship.facingRad);
   // Art muzzle derived independently from exported pixels + production art layout.
   const artX=(pdc.authorMuzzleTexture[0]/pdc.textureSize[0]-layout.pivotX)*layout.width;
   const artY=(pdc.authorMuzzleTexture[1]/pdc.textureSize[1]-layout.pivotY)*layout.height;
   const drawAngle=mount.currentAngleRad+Math.PI/2;
   const expected={x:mountX+artX*Math.cos(drawAngle)-artY*Math.sin(drawAngle),y:mountY+artX*Math.sin(drawAngle)+artY*Math.cos(drawAngle)};
   const error=Math.hypot(expected.x-bullet.pos.x,expected.y-bullet.pos.y);if(error>1e-8)throw Error('Sprite muzzle differs from authority fire position: '+error);
   if(meta.installation){const fixed=installationPose(slot,ship.pos.x,ship.pos.y,ship.facingRad);if(!fixed||Math.hypot(fixed.x-mountX,fixed.y-mountY)>1e-8||Math.abs(fixed.facing-ship.facingRad)>1e-8)throw Error('Hull-fixed installation pose incorrect');seatPoseChecks++;}
   poses.push({hullDegrees,gunDegrees,error});
  }
  return {poses,seatPoseChecks,maxMuzzleError:Math.max(...poses.map(p=>p.error)),noCatalogueRegistration:before===contentRegistry.getAllShips().map(s=>s.id).join('|'),geometryScope:'Unregistered art fit only: production firing plus production art layout. Not final ship slots, side/ventral installation or natural battle.'};
 });
 assert.ok(result.noCatalogueRegistration);assert.deepEqual(errors,[]);result.pageErrors=errors;result.previewRotationChangesPixels=true;result.layerCheck=layerCheck;
 await fs.writeFile(`${out}/fit-check.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({poses:result.poses.length,seatPoseChecks:result.seatPoseChecks,layerCheck,maxMuzzleError:result.maxMuzzleError,pageErrors:errors,noCatalogueRegistration:result.noCatalogueRegistration}));
}finally{await browser?.close();await server.close();}
