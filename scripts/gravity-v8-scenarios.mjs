/** Production v8 rules, real measured hulls, actual fixed-step and snapshot paths. */
export async function runGravityV8Scenarios(){
 globalThis.__LAN_BUILD_ID__='gravity-v8-check';
 const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
 const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');await contentManifestManager.ensureLoaded();
 const {modManager}=await import('/src/engine/modding/ModManager.ts');
 const {Ship}=await import('/src/engine/simulation/Ship.ts');const {Vector2}=await import('/src/engine/math/Vector2.ts');
 const {SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
 const {ContentRegistry,contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
 const {gravityShips}=await import('/src/engine/content/GravityPack.ts');const {gravityWeapons,GRAVITY_WEAPONS:W}=await import('/src/engine/content/GravityArmory.ts');
 const {GRAVITY_SYSTEM_IDS:ID}=await import('/src/engine/content/GravityIds.ts');
 const {createGravityEscort,createGravityControl}=await import('/src/studio/GravityLoadouts.ts');
 const {createDesign,evaluate,decodeDesign,budget,isBuiltIn,compatibility,weaponFluxPerSecond}=await import('/src/studio/DesignModel.ts');
 const {dps}=await import('/src/studio/WeaponTooltipData.ts');const {isPointInPolygon}=await import('/src/engine/math/Geometry.ts');
 const {advanceGravityFields}=await import('/src/engine/simulation/systems/GravityFieldPhysics.ts');
 const {advanceGravityDamage,applyGravityTidalHit}=await import('/src/engine/simulation/systems/GravityDamage.ts');
 const {dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts');const {createLanWorld}=await import('/src/network/LanWorld.ts');
 const {captureCombat}=await import('/src/network/AuthorityCombatSnapshot.ts');
 const {initializeLanDisplayWorld,applyLanDisplaySnapshot}=await import('/src/network/LanDisplaySnapshot.ts');
 const {RenderShipProjection}=await import('/src/engine/runtime/local/RenderShipProjection.ts');
 const checks=[],measurements={},check=(v,n)=>{if(!v)throw Error(n);checks.push(n);},near=(a,b)=>Math.abs(a-b)<1e-6;
 const hull=modManager.requireShip('web_gravity'),fits=[createGravityEscort(),createGravityControl()];
 for(const fit of fits){check(!evaluate(fit).errors.length,fit.name+' compiles');check(budget(fit).used<=280,fit.name+' legal OP');check(!evaluate(decodeDesign(JSON.parse(JSON.stringify(fit)))).errors.length,fit.name+' save roundtrip');}
 measurements.budgets=fits.map(d=>({name:d.name,...budget(d)}));
 check(hull.hullSize==='CAPITAL_SHIP'&&hull.deploymentPoints===60,'Actual 60DP capital');
 check(hull.weaponSlots.length===11&&['EXTRA_LARGE','LARGE','MEDIUM','SMALL'].map(size=>hull.weaponSlots.filter(s=>s.slotSize===size).length).join(',')==='1,0,4,6','Actual 1XL / 0L / 4M / 6S');
 check(hull.weaponSlots.every(s=>isPointInPolygon(s,hull.bounds)),'Every installation on measured hull');
 check(hull.weaponSlots.filter(s=>isBuiltIn(hull.id,s.slotId)).map(s=>s.slotId).join(',')==='TRACTOR','Only fixed core built in');
 check(Object.entries(createDesign(hull.id).weapons).every(([slot,id])=>slot==='TRACTOR'?id===W.tractor:id===null),'Blank fit leaves replaceable mounts empty');
 check(!!compatibility(hull.weaponSlots.find(s=>s.slotId==='M1'),modManager.getWeapon(W.pdc)),'Small cannot fill medium');
 new ContentRegistry().registerPack(gravityShips(),gravityWeapons(),true);check(true,'Isolated data and bundled asset closure');
 const replacement=structuredClone(fits[0]);replacement.weapons.S1=W.pdc;check(!evaluate(replacement).errors.length,'Alternate same-tier small fits');
 const medium=contentRegistry.getAllWeapons().find(w=>w.id!==W.calibrator&&w.mountSize==='MEDIUM'&&w.weaponType==='ENERGY'&&!w.systemOnly&&!compatibility(hull.weaponSlots.find(s=>s.slotId==='M1'),w));
 check(!!medium,'Alternate medium comparator exists');replacement.weapons.M1=medium.id;check(!evaluate(replacement).errors.length,'Alternate same-tier medium fits');
 let serial=0;const owner=()=>{const s=new Ship('v8-owner-'+serial++,evaluate(fits[0]).spec,true,new Vector2(),0,new SimulationRandom(31));s.teamId=0;s.fireControlMode='MANUAL';s.selectedGroupIndex=0;for(const g of s.weaponGroups)g.isAutofire=false;return s;};
 // Same real production silhouette; only explicit defense/loadout state varies for isolation.
 const target=(team=1,x=900,y=0,extra={})=>{const s=new Ship('v8-target-'+serial++,{...hull,weaponSlots:[],engineSlots:[],systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',...extra},team===0,new Vector2(x,y),0,new SimulationRandom(32));s.teamId=team;return s;};
 const world=(ships,projectiles=[],asteroids=[])=>({ships,projectiles,asteroids,hulkFragments:[],missiles:projectiles.filter(p=>p.isRocket),combatRandom:new SimulationRandom(33),deployMine(){}});
 const dispatch=(s,w)=>{for(const sys of s.allSystems)sys.dispatchEvents(s,w,0);};
 const input=(s,w,dt=1/60)=>s.weaponControl.update(dt,s,0,null,()=>{},()=>{},undefined,w);
 const mount=s=>s.weapons.find(m=>m.spec.gravityTractor);
 const capture=(s,t,w)=>{s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;for(let i=0;i<18;i++)input(s,w);return mount(s);};
 const damageStep=(dt,w)=>{advanceGravityFields(dt,w.ships,w.projectiles,w.asteroids,w.hulkFragments);advanceGravityDamage(dt,w);};
 const well=(s,w,x=900,y=0)=>{s.aimTargetWorld.set(x,y);if(!s.system.activate())throw Error(s.system.activationFailureReason);dispatch(s,w);s.system.update(.26);};
 check(dps(mount(owner()).spec)===1200&&weaponFluxPerSecond(mount(owner()).spec)===950,'Refit shows actual tidal damage and baseline flux');
 {
  const values=[];for(const hz of [30,60,120]){const s=owner(),t=target(),w=world([s,t]);capture(s,t,w);const hp=t.hullHp,armor=Array.from(t.armor.cells).reduce((a,b)=>a+b,0);for(let i=0;i<hz;i++)damageStep(1/hz,w);
   const armorLoss=armor-Array.from(t.armor.cells).reduce((a,b)=>a+b,0);
   check(armorLoss>0&&t.hullHp<=hp,'Real armor damage at '+hz+'Hz: '+JSON.stringify({phase:mount(s).gravityTractor?.phase,armorLoss,hull:hp-t.hullHp}));values.push({hz,hull:hp-t.hullHp,armorLoss,flux:s.flux.totalFlux});}
  check(near(values[0].armorLoss,values[1].armorLoss)&&near(values[1].armorLoss,values[2].armorLoss)&&near(values[0].hull,values[1].hull)&&near(values[1].hull,values[2].hull),'30/60/120Hz tidal damage consistent');measurements.tide=values;
 }
 {
  const s=owner(),t=target(1,900,0,{shieldType:'OMNI',shieldRadius:350,shieldArcDeg:360,shieldEfficiency:1}),w=world([s,t]);t.shield.setActive(true);t.shield.update(30,0,Math.PI);const hp=t.hullHp;capture(s,t,w);for(let i=0;i<60;i++)damageStep(1/60,w);
  check(t.hullHp===hp&&t.flux.hardFlux>0,'Real shield coverage takes hard flux, protects hull: '+JSON.stringify({hp:t.hullHp,start:hp,flux:t.flux.totalFlux,hardFlux:t.flux.hardFlux,phase:mount(s).gravityTractor.phase,shield:t.shield.type,arc:t.shield.currentArcDeg}));measurements.shieldFlux=t.flux.hardFlux;
  t.shield.setActive(false);t.shield.update(3,0,0);t.armor.cells.fill(0);t.armor.minArmorFractionMultiplier=0;for(let i=0;i<60;i++)damageStep(1/60,w);check(t.hullHp<hp,'Shield removal and depleted armor expose real hull');
 }
 {
  const s=owner(),t=target(0),w=world([s,t]),m=capture(s,t,w),hp=t.hullHp;s.aimTargetWorld.set(900,220);input(s,w,.1);for(let i=0;i<30;i++)damageStep(1/60,w);
  check(m.gravityTractor.phase==='HOLD'&&t.vel.y>0&&t.hullHp===hp,'Ally grip creates real force, no tidal damage');
  s.flux.softFlux=s.flux.maxFlux-1;check(!dispatchShipCommand(s,{kind:'shield'}).accepted&&m.gravityTractor.phase==='HOLD','Failed RMB preserves grip');s.flux.softFlux=0;
  check(dispatchShipCommand(s,{kind:'shield'}).accepted,'RMB accepted');dispatch(s,w);s.defenseSystem.update(.11);advanceGravityFields(.4,w.ships,[]);
  check(m.gravityTractor.phase==='IDLE'&&m.gravityTractor.waitRelease&&t.vel.x>0,'Successful RMB releases and pushes deliberately grabbed ally');
 }
 {
  const s=owner(),t=target(),a={id:191,pos:new Vector2(450,0),vel:new Vector2(),radius:35,mass:500,hp:500,maxHp:500,facingRad:0,angularVel:0,spriteUrl:'/game-assets/graphics/asteroids/asteroid1.png'},w=world([s,t],[],[a]);capture(s,t,w);
  check(mount(s).gravityTractor.phase!=='HOLD','Real obstacle blocks acquisition');a.pos.set(450,400);capture(s,t,w);check(mount(s).gravityTractor.phase==='HOLD','Clear line acquires');a.pos.set(450,0);const hp=t.hullHp;damageStep(.1,w);check(mount(s).gravityTractor.phase==='IDLE'&&t.hullHp===hp,'New occlusion interrupts before damage');
 }
 for(const [label,mutate]of [['vent',s=>s.flux.isVenting=true],['overload',s=>s.flux.triggerOverload()],['death',s=>s.isDead=true],['retreat',s=>s.retreatFromCombat()],['disabled mount',s=>mount(s).isDisabled=true]]){
  const s=owner(),t=target(),w=world([s,t]);capture(s,t,w);const hp=t.hullHp;mutate(s);input(s,w);damageStep(.1,w);check(t.hullHp===hp&&mount(s).gravityTractor.phase==='IDLE',label+' interrupts without late tide');
 }
 {
  const s=owner(),t=target(),ally=target(0,900,400),w=world([s,t,ally]);const g=s.systems[1];check(!dispatchShipCommand(s,{kind:'system',value:1}).accepted&&g.reservedFluxCost===0,'G rejected without well, no reservation');
  well(s,w);capture(s,t,w);s.aimTargetWorld.set(-900,200);const hp=t.hullHp,allyHp=ally.hullHp;
  check(dispatchShipCommand(s,{kind:'system',value:1}).accepted,'G uses existing well');dispatch(s,w);check(!s.system.gravityField&&g.gravityField.x===900&&g.gravityField.kind==='COLLAPSE','G consumes exactly committed well');
  advanceGravityDamage(.1,w);g.update(.44);advanceGravityDamage(.1,w);check(t.hullHp===hp,'No damage before warning ends');g.update(.02);advanceGravityDamage(.02,w);const after=t.hullHp;
  check(after<hp&&g.gravityField.shipHits.includes(t.id)&&ally.hullHp===allyHp,'Single real collapse damages enemy and exempts ally');advanceGravityDamage(.1,w);check(t.hullHp===after,'Collapse cannot repeat hit');
  check(mount(s).gravityTractor.phase==='HOLD','G preserves current grip');const p=new RenderShipProjection().project(s);check(p.allSystems.find(v=>v.type===ID.collapse).gravityField.collapseApplied,'Production projection carries damage latch');
  g.update(.8);advanceGravityDamage(.01,w);check(!g.gravityField,'Collapse state cleaned after active period');measurements.collapseHullDamage=hp-after;
 }
 {
  const s=owner(),t=target(),w=world([s,t]);well(s,w);s.systems[1].activate();dispatch(s,w);s.systems[1].update(.5);s.systems[1].disabled=true;const hp=t.hullHp;advanceGravityDamage(.01,w);check(t.hullHp===hp&&!s.systems[1].gravityField,'Disabled G cannot deliver queued damage');
 }
 {
  const s=owner(),t=target(1,900,0,{shieldType:'PHASE'}),w=world([s,t]);well(s,w);s.flux.softFlux=s.flux.maxFlux-1;check(!s.systems[1].activate()&&s.system.gravityField,'Unaffordable G preserves well');s.flux.softFlux=0;s.systems[1].activate();dispatch(s,w);s.systems[1].update(.5);const hp=t.hullHp;t.shield.setActive(true);t.shield.update(.6,0,0);advanceGravityDamage(.01,w);check(t.isPhased&&t.hullHp===hp,'Phase avoids collapse');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);well(s,w);s.systems[1].activate();dispatch(s,w);s.flux.isVenting=true;s.systems[1].update(.5);const hp=t.hullHp;advanceGravityDamage(.01,w);check(t.hullHp===hp&&!s.systems[1].gravityField,'Venting cancels warning attack');
 }
 {
  const s=owner(),root=target(1,900,0),child=target(1,900,300),w=world([s,root,child]);child.parentShip=root;root.childModules.push(child);well(s,w);s.systems[1].activate();dispatch(s,w);s.systems[1].update(.5);advanceGravityDamage(.01,w);
  check(s.systems[1].gravityField.shipHits.length===1&&s.systems[1].gravityField.shipHits[0]===root.id,'Attached assembly receives one collapse hit');
 }
 {
  const s=owner(),t=target(1,1300,0),a={id:192,pos:new Vector2(900,0),vel:new Vector2(),radius:40,mass:600,hp:600,maxHp:600,facingRad:0,angularVel:0,spriteUrl:'/game-assets/graphics/asteroids/asteroid1.png'},w=world([s,t],[],[a]);well(s,w,800,0);s.systems[1].activate();dispatch(s,w);s.systems[1].update(.5);const hp=t.hullHp,armor=Array.from(t.armor.cells);advanceGravityDamage(.01,w);check(t.hullHp===hp&&armor.every((n,i)=>n===t.armor.cells[i]),'Collapse respects real obstacle occlusion');
 }
 {
  const damageAt=x=>{const s=owner(),t=target(1,x,0),w=world([s,t]);t.armor.cells.fill(0);t.armor.minArmorFractionMultiplier=0;well(s,w,900,0);s.systems[1].activate();dispatch(s,w);s.systems[1].update(.5);const hp=t.hullHp;advanceGravityDamage(.01,w);return hp-t.hullHp;};
  const inner=damageAt(900),edge=damageAt(1800);check(inner>edge&&edge>=800,'Actual contact distance controls collapse falloff');measurements.collapseFalloff={inner,edge};
 }
 {
  const s=owner(),t=target(),hits=[];t.armor.cells.fill(0);t.armor.minArmorFractionMultiplier=0;t.hullHp=10;applyGravityTidalHit(s,t,s.pos,1200,1200,false,{spawnShieldRipple(){},spawnArmorDamageSparks(){},addFloatingDamage(){},recordDamage:(_s,_t,n,area)=>hits.push([area,n])});check(hits.find(([area])=>area==='HULL')[1]===10,'Statistics count actual hull damage, exclude overkill');
 }
 {
  const {engine}=createLanWorld({id:'gravity-v8-engine',seed:71,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:hull.id,design:fits[0]},{id:'p1',seat:1,team:1,hull:hull.id,design:fits[1]}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  engine.asteroids.length=0;const s=engine.playerShip,t=engine.enemyShip;s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;t.pos.set(900,0);t.prevPos.copy(t.pos);
  for(const ship of engine.allCapitalShips){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';for(const group of ship.weaponGroups)group.isAutofire=false;}
  s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;s.selectedGroupIndex=0;const hp=t.hullHp;for(let i=0;i<240;i++)engine.fixedUpdate(1/60);
  check(mount(s).gravityTractor.phase==='HOLD'&&t.hullHp<hp,'Actual CombatEngine capture and tide');check(engine.statsTracker.playerStats.energyDamage>0&&engine.statsTracker.enemyStats.hullDamageTaken>0,'Actual engine battle statistics');
  check(engine.projectiles.length===0&&engine.beams.length===0,'Tide has no fake projectile or beam');
  const snapshot=n=>captureCombat(engine,n,{0:0,1:0},0,false,false,false,true,false,false,false,false,false,true,false,true,true);
  const {world:display}=initializeLanDisplayWorld(0,structuredClone(snapshot(1))),v=display.ships.find(v=>v.id===s.id);check(v.weapons.find(m=>m.spec.gravityTractor).gravityTractor.phase==='HOLD','Actual LAN display retains grip');
  s.aimTargetWorld.copy(t.pos);s.system.activate();for(let i=0;i<18;i++)engine.fixedUpdate(1/60);s.systems[1].activate();for(let i=0;i<31;i++)engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(2)));
  check(v.allSystems.find(v=>v.type===ID.collapse).gravityField.collapseApplied,'Actual LAN codec retains collapse latch');
  s.isFiringMain=false;engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(3)));check(v.weapons.find(m=>m.spec.gravityTractor).gravityTractor.phase==='IDLE','Actual LAN clears released grip');
  let fake=0;check(!s.weaponControl.fireWeapon(mount(s),s,()=>fake++,()=>fake++)&&fake===0,'Special fire guard emits nothing');
  measurements.engine={seconds:engine.combatTime,hullDamage:hp-t.hullHp,energyDamage:engine.statsTracker.playerStats.energyDamage,flux:s.flux.totalFlux};
 }
 return {checks,measurements};
}
