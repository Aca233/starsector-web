import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/** Production engine + production WebGL, controlled positions/thrust/target HP.
 * Does not modify the live Worker, storage, damage values or user's desktop. */
export async function checkArkAircraft(page,out) {
 const dir=resolve(out,'aircraft-v20');await mkdir(dir,{recursive:true});
 await page.evaluate(async()=>{
  const {CombatEngine}=await import('/src/engine/simulation/CombatEngine.ts');
  const {combatRenderView}=await import('/src/engine/render/CombatRenderView.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const renderer=window.__combatRenderer,previous=renderer.render,overlays=renderer.tacticalOverlayPass.render;
  renderer.tacticalOverlayPass.render=()=>{};
  const test={e:null,view:null,revision:0,drawn:-1,camera:new Vector2(0,0),zoom:2.5,plumes:0,plasma:0,
   reset(id='web_ark_interceptor',duel=false){
    this.e=new CombatEngine(id,'web_ark_striker',260928);this.view=combatRenderView(this.e);
    const e=this.e;e.openBattlefield=true;e.asteroids.length=0;e.nebulae.length=0;e.externallyControlledShipIds.add(e.enemyShip.id);
    const p=e.playerShip,t=e.enemyShip;p.pos.set(duel?0:-120,duel?125:0);t.pos.set(duel?0:120,duel?-230:0);
    for(const s of [p,t]){s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=-Math.PI/2;s.vel.set(0,0);s.shield.isActive=false;}
    t.hullHp=100000;for(const w of t.weapons)w.isDisabled=true;
    p.aimTargetWorld.copy(t.pos);p.playerTargetId=t.id;this.camera.set(0,duel?-45:0);this.zoom=duel?2.0:2.5;this.revision++;
   },
   thrust(level,turn=0){for(const s of this.e.ships){s.engineController.flameAccelerating=true;s.angularVelRad=turn;for(const status of s.engineStatuses){status.currentThrust=status.prevThrust=level;}}this.revision++;},
   step(n){for(let i=0;i<n;i++){this.e.playerShip.isFiringMain=true;this.e.fixedUpdate(1/60);}this.revision++;},
   read(){return {time:this.e.combatTime,ships:this.e.ships.map(s=>({id:s.spec.id,sprite:s.spec.spriteUrl,engines:s.spec.engineSlots,thrust:s.engineStatuses.map(x=>x.currentThrust),ammo:s.weapons.map(w=>w.ammo),glow:s.weapons.map(w=>w.glowAlpha),pos:s.pos})),beams:this.e.beams.map(b=>({id:b.specId,start:b.startPos,end:b.endPos})),packets:this.e.projectiles.map(p=>({id:p.specId,origin:p.spawnLocation,barrel:p.barrelOffset,pos:p.pos})),impacts:this.e.hitGlows.length,plumes:this.plumes,plasma:this.plasma};},
   restore(){renderer.tacticalOverlayPass.render=overlays;renderer.render=previous;renderer.ribbonBatcher.drawEnginePlume=drawPlume;renderer.ribbonBatcher.drawPlasmaRay=drawPlasma;renderer.resetVisualState();}
  };
  const drawPlume=renderer.ribbonBatcher.drawEnginePlume,drawPlasma=renderer.ribbonBatcher.drawPlasmaRay;
  renderer.ribbonBatcher.drawEnginePlume=function(...args){test.plumes++;return drawPlume.apply(this,args);};
  renderer.ribbonBatcher.drawPlasmaRay=function(...args){test.plasma++;return drawPlasma.apply(this,args);};
  test.reset();window.__arkAircraft=test;
  renderer.render=(_view,_alpha,_camera,_zoom,frame)=>{test.plumes=0;test.plasma=0;const result=previous.call(renderer,test.view,1,test.camera,test.zoom,{...frame,visualTime:test.e.combatTime,layers:new Set(['background','hull','weapon','beam','explosion'])});if(result)test.drawn=test.revision;return result;};
 });
 const captures=[];
 const capture=async name=>{await page.waitForFunction(()=>window.__arkAircraft.drawn===window.__arkAircraft.revision);const state=await page.evaluate(()=>window.__arkAircraft.read());captures.push({name,...state});await page.screenshot({path:resolve(dir,name+'.png')});return state;};
 await page.evaluate(()=>window.__arkAircraft.thrust(.4));const idle=await capture('01-idle');assert.equal(idle.plumes,15);
 await page.evaluate(()=>window.__arkAircraft.thrust(1));await capture('02-thrust');
 await page.evaluate(()=>window.__arkAircraft.thrust(1,1.6));await capture('03-turn');
 for(const [kind,id] of [['interceptor','web_ark_interceptor'],['striker','web_ark_striker']]) {
  await page.evaluate(id=>window.__arkAircraft.reset(id,true),id);
  let shot=false,impact=false,charging=false;
  for(let i=0;i<38;i++) {
   await page.evaluate(()=>window.__arkAircraft.step(2));await page.waitForFunction(()=>window.__arkAircraft.drawn===window.__arkAircraft.revision);
   const s=await page.evaluate(()=>window.__arkAircraft.read());
   if(!charging&&s.ships[0].glow.some(v=>v>0)&&!s.packets.length){charging=true;await capture(kind+'-charge');}
   if(!shot&&(s.beams.length||s.packets.length)){shot=true;await capture(kind+'-fire');}
   if(!impact&&s.impacts>0){impact=true;await capture(kind+'-hit');}
   if(kind==='interceptor'&&i===15)await capture('interceptor-contact');
   if(kind==='striker'&&i>=3&&i<23){await page.screenshot({path:resolve(dir,'motion-'+String(i-3).padStart(2,'0')+'.png')});}
  }
  assert(shot,kind+' must fire real weapons');if(kind==='striker')assert(impact,'plasma must generate real impact');
 }
 assert(captures.some(s=>s.plasma>0),'native plasma must reach actual WebGL');
 await page.evaluate(()=>window.__arkAircraft.restore());
 await writeFile(resolve(dir,'report.json'),JSON.stringify({mode:'controlled production engine: stationary high-HP target, comparative idle/thrust forced only for visual review; shots/collisions/ammo use actual simulation',captures},null,2));
 return 'two distinct aircraft / native calibrated exhaust / calibrated real beams and plasma hits in controlled production WebGL';
}
