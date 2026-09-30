/** Actual v6 hull, fits, special fire control, force authority and codecs. */
export async function runGravityV6Scenarios(){
 const {Ship}=await import('/src/engine/simulation/Ship.ts');
 const {Vector2}=await import('/src/engine/math/Vector2.ts');
 const {SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
 const {modManager}=await import('/src/engine/modding/ModManager.ts');
 const {ContentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
 const {gravityShips}=await import('/src/engine/content/GravityPack.ts');
 const {gravityWeapons,GRAVITY_WEAPONS:W}=await import('/src/engine/content/GravityArmory.ts');
 const {createGravityEscort,createGravityControl}=await import('/src/studio/GravityLoadouts.ts');
 const {createDesign,evaluate,decodeDesign,budget,isBuiltIn,compatibility}=await import('/src/studio/DesignModel.ts');
 const {simulationRoster,prepareSimulationOption}=await import('/src/engine/content/SimulationCatalog.ts');
 const {advanceGravityFields:advance}=await import('/src/engine/simulation/systems/GravityFieldPhysics.ts');
 const {releaseGravityTractor}=await import('/src/engine/simulation/systems/GravityTractor.ts');
 const {advanceGravityTerrain}=await import('/src/engine/simulation/systems/GravityTerrain.ts');
 const {forwardPathClear}=await import('/src/engine/ai/TacticalNavigation.ts');
 const {CombatFXSystem}=await import('/src/engine/simulation/systems/CombatFXSystem.ts');
 const {projectileOutgoingMultiplier}=await import('/src/engine/simulation/systems/weapon/OutgoingDamage.ts');
 const {advanceSourceMissile}=await import('/src/engine/simulation/systems/weapon/SourceMissileLifecycle.ts');
 const {dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts');
 const {RenderShipProjection}=await import('/src/engine/runtime/local/RenderShipProjection.ts');
 const {captureCombat}=await import('/src/network/AuthorityCombatSnapshot.ts');
 const {initializeLanDisplayWorld,applyLanDisplaySnapshot}=await import('/src/network/LanDisplaySnapshot.ts');
 const {createLanWorld}=await import('/src/network/LanWorld.ts');
 const {isPointInPolygon}=await import('/src/engine/math/Geometry.ts');
 const checks=[],measurements={};const check=(v,n)=>{if(!v)throw Error(n);checks.push('v6 '+n);},near=(a,b)=>Math.abs(a-b)<1e-6;
 const fits=[createGravityEscort(),createGravityControl()],hull=modManager.requireShip('web_gravity');
 for(const d of fits){check(!evaluate(d).errors.length,d.name+' legal: '+evaluate(d).errors.join('|'));check(budget(d).used<=165,'Fit respects 165OP');
  check(!evaluate(decodeDesign(JSON.parse(JSON.stringify(d)))).errors.length,'Saved fit round-trip');}
 measurements.budgets=fits.map(d=>({name:d.name,...budget(d)}));
 check(hull.weaponSlots.length===11 && ['SMALL','MEDIUM','LARGE','EXTRA_LARGE'].map(size=>hull.weaponSlots.filter(s=>s.slotSize===size).length).join(',')==='6,4,1,0','1L / 4M / 6S / 0XL');
 check(hull.weaponSlots.every(s=>isPointInPolygon(s,hull.bounds)),'All seats lie on measured hull');
 check(isBuiltIn(hull.id,'TRACTOR') && hull.weaponSlots.filter(s=>isBuiltIn(hull.id,s.slotId)).length===1,'Only tractor is built in');
 const blank=createDesign(hull.id);check(Object.entries(blank.weapons).every(([slot,id])=>slot==='TRACTOR'?id===W.tractor:id===null),'Blank hull keeps only real built-in');
 check(!!compatibility(hull.weaponSlots.find(s=>s.slotId==='M1'),modManager.getWeapon(W.pdc)),'Small guns do not replace medium slots');
 const isolated=new ContentRegistry();isolated.registerPack(gravityShips(),gravityWeapons(),true);
 check(!!isolated.getShip(hull.id),'Independent content registration and asset closure');
 const options=simulationRoster().filter(o=>o.hullId===hull.id&&o.origin==='extension').map(prepareSimulationOption);
 check(options.length===2 && options.every(o=>!o.errors.length),'Both fits in real simulator catalogue');
 let serial=0;
 const owner=()=>{const s=new Ship('gravity-v6-'+serial++,evaluate(fits[0]).spec,true,new Vector2(),0,new SimulationRandom(33));s.teamId=0;s.fireControlMode='MANUAL';s.selectedGroupIndex=0;
  for(const w of s.weapons)w.currentAngleRad=w.prevAngleRad=0;
  for(const g of s.weaponGroups)g.isAutofire=false;return s;};
 const target=(team=1,x=600,y=0,extra={})=>{const s=new Ship('target-v6-'+serial++,{...hull,id:'target-v6',sourceHullId:'target-v6',weaponSlots:[],engineSlots:[],systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',
   bounds:[[-30,-30],[30,-30],[30,30],[-30,30]],collisionRadius:43,mass:1000,...extra},team===0,new Vector2(x,y),0,new SimulationRandom(34));s.teamId=team;return s;};
 const round=(id,x=600,y=0,extra={})=>({id,specId:W.calibrator,sourceShipId:'enemy-source',sourceWeaponType:'BALLISTIC',teamId:1,isPlayer:false,
   pos:new Vector2(x,y),prevPos:new Vector2(x,y),vel:new Vector2(),radius:2,damage:180,baseDamage:180,damageType:'KINETIC',rangeRemaining:2000,totalRange:2000,elapsedTime:0,spawnType:'BALLISTIC',color:[120,220,240],fadeTime:.2,...extra});
 const context=(ships,projectiles=[],asteroids=[],hulkFragments=[])=>({ships,projectiles,missiles:projectiles.filter(p=>p.isRocket),asteroids,hulkFragments,combatRandom:new SimulationRandom(6),deployMine(){}});
 const dispatch=(s,ctx)=>{for(const sys of s.allSystems)sys.dispatchEvents(s,ctx,0);};
 const input=(s,ctx,dt=1/60)=>s.weaponControl.update(dt,s,0,null,()=>{},()=>{},undefined,ctx);
 const capture=(s,body,ctx,seconds=.4)=>{s.aimTargetWorld.copy(body.pos);s.isFiringMain=true;for(let i=0;i<seconds*60;i++)input(s,ctx);return s.weapons.find(w=>w.spec.gravityTractor);};
 const well=(s,ctx,x=600,y=0)=>{s.aimTargetWorld.set(x,y);check(s.system.activate(),'F accepted');s.system.update(.36);dispatch(s,ctx);};
 {
  const s=owner(),t=target(0),ctx=context([s,t]),m=capture(s,t,ctx);
  check(m.gravityTractor.phase==='HOLD'&&m.gravityTractor.target.id===t.id,'Left grabs an actual allied hull');
  const projection=new RenderShipProjection();check(projection.project(s).weapons.find(w=>w.slotId===m.slotId).gravityTractor.target.id===t.id,'Render projection carries real grip');
  s.aimTargetWorld.set(600,240);for(let i=0;i<30;i++){input(s,ctx);advance(1/60,ctx.ships,[]);t.pos.addScaled(t.vel,1/60);}
  check(t.vel.y>0 && t.pos.y>0,'Mouse anchor pulls ally by acceleration');
  const held=t.vel.clone();s.isFiringMain=false;input(s,ctx);advance(1/60,ctx.ships,[]);
  check(m.gravityTractor.phase==='IDLE'&&t.vel.distanceTo(held)<1e-6,'Release preserves actual velocity');
  check(m.cooldownTimer>0,'Grip has real recovery');
 }
 {
  const s=owner(),t=target(0),other=target(0,0,600),enemy=target(1,-600,0),ctx=context([s,t,other,enemy]),m=capture(s,t,ctx);
  well(s,ctx,600,100);s.flux.softFlux=s.flux.maxFlux-1;
  check(!dispatchShipCommand(s,{kind:'shield'}).accepted && m.gravityTractor.phase==='HOLD' && !!s.system.gravityField,'Failed RMB preserves grip and well');
  s.flux.softFlux=0;check(dispatchShipCommand(s,{kind:'shield'}).accepted,'RMB accepted');dispatch(s,ctx);s.defenseSystem.update(.13);
  check(m.gravityTractor.phase==='IDLE'&&m.gravityTractor.waitRelease && !!s.system.gravityField,'Successful RMB releases grip and preserves F');
  input(s,ctx);check(m.gravityTractor.phase==='IDLE','Held LMB cannot instantly regrab after launch');
  advance(.6,ctx.ships,[]);
  check(t.vel.x>0&&near(other.vel.length(),0)&&enemy.vel.x<0,'RMB launches selected ally and enemies; untouched allies exempt');
 }
 {
  const s=owner(),p=round(410,600,0,{isRocket:true,isGuided:true,engineAcceleration:240,maxSpeed:300,targetShipId:s.id,flightTimeRemaining:3,hitpoints:90,maxHitpoints:90,
    missileLifecycleSpec:{flameoutTime:1,noEngineGlowTime:.25,fadeTime:.5,dudProbabilityOnFlameout:1,collisionClassAfterFlameout:'NONE',fizzleOnReachingWeaponRange:true,noCollisionWhileFading:true,reduceDamageWhileFading:true}}),ctx=context([s],[p]);
  const m=capture(s,p,ctx,.12);
  check(m.gravityTractor.phase==='HOLD' && p.sourceShipId===s.id && p.teamId===0 && !p.isGuided && p.maxSpeed===undefined,'Capture takes missile ownership and disables native steering/speed cap');
  check(p.damage===180&&p.flightTimeRemaining===3&&p.rangeRemaining===2000&&p.hitpoints===90,'Capture preserves damage, range, fuse and intercept HP');
  check(!advanceSourceMissile(p,.2)&&near(p.flightTimeRemaining,2.8),'Captured missile continues native fuel lifetime');
  check(projectileOutgoingMultiplier(p,target(1),p.pos,{ships:[s],playerShip:s,enemyShip:s,fighters:[]})===1,'Captured shot cannot gain new hit-time damage bonuses');
  s.aimTargetWorld.set(600,200);input(s,ctx,.1);advance(.1,ctx.ships,[p]);check(p.vel.y>0,'Held missile receives genuine force');
  releaseGravityTractor(m);const velocity=p.vel.clone();advance(.1,ctx.ships,[p]);check(p.vel.distanceTo(velocity)<1e-6,'Released missile keeps momentum and ownership');
  advanceSourceMissile(p,2.81);check(p.collisionDisabled&&p.isGuided===false,'Captured missile still disarms at original fuel expiry');
 }
 {
  const s=owner(),a={id:511,pos:new Vector2(600,0),vel:new Vector2(),radius:25,mass:500,hp:500,maxHp:500,facingRad:0,angularVel:0,spriteUrl:'/game-assets/graphics/asteroids/asteroid1.png'},ctx=context([s],[],[a]);
  check(capture(s,a,ctx).gravityTractor.phase==='HOLD','Can grab a zero-velocity rock');s.aimTargetWorld.set(600,200);input(s,ctx,.1);advance(.1,ctx.ships,[],ctx.asteroids);check(a.vel.y>0,'Static movable obstacle becomes real moving terrain');
  const fixedOwner=owner(),fixed={...a,id:512,gravityFixed:true,pos:new Vector2(600,0),vel:new Vector2()},fixedCtx=context([fixedOwner],[],[fixed]);
  capture(fixedOwner,fixed,fixedCtx);advance(.1,fixedCtx.ships,[],fixedCtx.asteroids);check(fixedOwner.vel.x>0&&fixed.vel.length()===0,'Fixed obstacle is an anchor, not a movable prop');
 }
 {
  const s=owner(),dead=target(1,600,0),h={id:601,pos:dead.pos.clone(),vel:new Vector2(),facingRad:0,angularVel:0,age:0,collisionRadius:43,
    sourceShip:dead,localOffset:new Vector2(),bounds:dead.spec.bounds.map(([x,y])=>new Vector2(x,y))},ctx=context([s],[],[],[h]);
  check(capture(s,h,ctx).gravityTractor.target.kind==='HULK','Can grab a real polygon wreck');s.aimTargetWorld.set(600,200);input(s,ctx,.1);advance(.1,ctx.ships,[],[],[h]);check(h.vel.y>0,'Wreck receives physical velocity');
  const events=[],fx=new Proxy({},{get:(_o,key)=>key==='getPlayerPos'?()=>s.pos:(...a)=>events.push([key,a.length])});
  const y=h.pos.y;advanceGravityTerrain(.1,[],[h],fx);check(h.pos.y>y&&h.gravityManaged,'Managed wreck moves before collision pass');
  h.breakup=null;h.visualBounds=null;h.mountSlotIds=[];const cosmetic=new CombatFXSystem(new SimulationRandom(44));cosmetic.hulkFragments=[h];const after=h.pos.clone();cosmetic.updateHulkFragments(.1);
  check(h.pos.distanceTo(after)===0&&h.age>0,'FX does not double-move managed wreck');
  const victim=target(1,h.pos.x+55,h.pos.y);h.vel.set(100,0);advanceGravityTerrain(0,[victim],[h],fx);
  check(victim.vel.x>0&&events.some(e=>e[0]==='spawnArmorDamageSparks'),'Moving polygon wreck collides and transfers momentum');
  h.pos.set(180,0);h.vel.set(0,0);const navigator=target(0,0,0),scene={ships:[navigator],projectiles:[],beams:[],asteroids:[],hulkFragments:[h]};
  check(!forwardPathClear(navigator,scene,85,3),'Navigation sees the same managed wreck');
  h.pos.set(600,600);check(forwardPathClear(navigator,scene,85,3),'Moving wreck clears the old navigation path');
 }
 {
  const s=owner(),t=target(1,600,0),blocker=target(0,400,0),ctx=context([s,t,blocker]);capture(s,t,ctx);
  check(s.weapons.find(w=>w.spec.gravityTractor).gravityTractor.phase!=='HOLD','Actual hull occludes tractor line');
  blocker.pos.set(400,300);capture(s,t,ctx);check(s.weapons.find(w=>w.spec.gravityTractor).gravityTractor.phase==='HOLD','Clear line restores capture');
  s.flux.isVenting=true;input(s,ctx);check(s.weapons.find(w=>w.spec.gravityTractor).gravityTractor.phase==='IDLE','Venting breaks the connection');
 }
 {
  const s=owner(),t=target(1,800,0),ctx=context([s,t]);
  check(!dispatchShipCommand(s,{kind:'system',value:1}).accepted && s.systems[1].reservedFluxCost===0,'G needs an active well and costs nothing when rejected');
  well(s,ctx,600,0);s.aimTargetWorld.set(-1000,0);check(dispatchShipCommand(s,{kind:'system',value:1}).accepted,'G accepts existing anchor');dispatch(s,ctx);s.systems[1].update(.01);
  check(!s.system.gravityField && s.systems[1].gravityField.x===600,'G consumes well and expands from committed anchor');advance(.3,ctx.ships,[]);
  check(t.vel.x>0,'Remote G pushes from well origin');
 }
 {
  const s=owner(),p=round(710,700,80,{vel:new Vector2(700,0),sourceShipId:s.id,teamId:0,gravityCoupling:'MASS_DRIVER'}),normal=round(711,700,80,{vel:new Vector2(700,0),sourceShipId:s.id,teamId:0}),ctx=context([s],[p,normal]);
  well(s,ctx,700,0);for(let i=0;i<50;i++)advance(1/60,ctx.ships,ctx.projectiles);
  check(p.vel.y<0&&normal.vel.y===0,'F calibrates own tagged rounds, ignores ordinary friendly rounds');
  check(p.gravityWellBinding.age<=.67 && p.gravityWellBinding.turn<=Math.PI/4+1e-6,'Friendly round has finite binding and turn budget');
 }
 {
  const s=owner(),p=round(810,520,0,{vel:new Vector2(-600,0)}),ctx=context([s],[p]);
  for(const g of s.weaponGroups)if(g.index===2)g.isAutofire=true;
  for(let i=0;i<30;i++){input(s,ctx);advance(1/60,ctx.ships,[p]);}
  check(Math.abs(p.vel.y)>0 && p.sourceShipId==='enemy-source' && p.teamId===1,'Autodeflector changes path without taking ownership');
  check(s.flux.totalFlux>0&&s.weapons.some(w=>w.spec.gravityDeflector&&w.cooldownTimer>0),'Autodeflector spends flux and cools down');
 }
 // Whole engine and actual display encoder/decoder, not a hand-authored DTO.
 {
  const {engine}=createLanWorld({id:'gravity-v6-engine',seed:71,hostId:'p0',snapshotHz:60,
    players:[{id:'p0',seat:0,team:0,hull:hull.id,design:fits[0]},{id:'p1',seat:1,team:1,hull:hull.id,design:fits[1]}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  engine.asteroids.length=0;const s=engine.playerShip,t=engine.enemyShip;
  s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;t.pos.set(700,0);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=0;
  for(const ship of engine.allCapitalShips){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';for(const g of ship.weaponGroups)g.isAutofire=false;}
  s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;s.selectedGroupIndex=0;
  for(let i=0;i<30;i++)engine.fixedUpdate(1/60);
  const m=s.weapons.find(w=>w.spec.gravityTractor);check(m.gravityTractor.phase==='HOLD','Production fixedUpdate actually captures');
  s.aimTargetWorld.set(700,240);for(let i=0;i<30;i++)engine.fixedUpdate(1/60);check(t.vel.y>0&&t.pos.y>0,'Production movement follows grip force');
  const snapshot=n=>captureCombat(engine,n,{0:0,1:0},0,false,false,false,true,false,false,false,false,false,true,false,true,true);
  const {world}=initializeLanDisplayWorld(0,structuredClone(snapshot(1))),viewer=world.ships.find(v=>v.id===s.id),grip=viewer.weapons.find(w=>w.slotId===m.slotId);
  check(grip.gravityTractor.target.id===t.id&&grip.gravityTractor.phase==='HOLD','Actual LAN display decode retains grip');
  s.isFiringMain=false;engine.fixedUpdate(1/60);applyLanDisplaySnapshot(world,structuredClone(snapshot(2)));
  check(grip.gravityTractor.phase==='IDLE','Subsequent display frame clears released grip');
  let shot;const gun=s.weapons.find(w=>w.spec.id===W.calibrator);check(s.weaponControl.fireWeapon(gun,s,p=>{shot=p;},()=>{}),'Production calibrator emits real round');
  check(shot.gravityCoupling==='MASS_DRIVER'&&shot.damage>0,'Mass coupling survives production fire');
  let fake=0;check(!s.weaponControl.fireWeapon(m,s,()=>fake++,()=>fake++)&&fake===0,'Tractor cannot emit a zero-damage fake');
  measurements.engine={seconds:engine.combatTime,dragY:t.pos.y,dragVy:t.vel.y,flux:s.flux.totalFlux,calibratorDamage:shot.damage};
 }
 return {checks,measurements};
}
