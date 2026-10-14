/** Legacy v8 damage regressions plus current support controls, measured hulls and real Worker/codec paths. */
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
 let serial=0;const owner=()=>{const s=new Ship('v8-owner-'+serial++,{...evaluate(fits[0]).spec,systemTypes:[ID.battleWell,ID.collapse],rightClickSystemType:ID.battleRepulsor},true,new Vector2(),0,new SimulationRandom(31));s.teamId=0;s.fireControlMode='MANUAL';s.selectedGroupIndex=0;for(const g of s.weaponGroups)g.isAutofire=false;return s;};
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
  check(v.systems[1].type===ID.battleRepulsor&&v.weapons.find(m=>m.spec.gravityTractor).gravityTractor.phase==='IDLE'&&v.system.gravityField?.kind==='WELL','Actual LAN codec retains independent F after emergency G');
  s.isFiringMain=false;engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(3)));check(v.weapons.find(m=>m.spec.gravityTractor).gravityTractor.phase==='IDLE','Actual LAN clears released grip');
  let fake=0;check(!s.weaponControl.fireWeapon(mount(s),s,()=>fake++,()=>fake++)&&fake===0,'Special fire guard emits nothing');
  measurements.engine={seconds:engine.combatTime,hullDamage:hp-t.hullHp,energyDamage:engine.statsTracker.playerStats.energyDamage,flux:s.flux.totalFlux};
 }
 const support=await runGravitySupportScenarios(),push=await runGravityPushScenarios(),area=await runGravityAreaScenarios();
 return {checks:[...checks,...support.checks,...push.checks,...area.checks],measurements:{...measurements,support:support.measurements,push:push.measurements,area:area.measurements}};
}


/** Current production defaults: not the retired well/collapse control fixture above. */
export async function runGravitySupportScenarios(){
 const {Ship}=await import('/src/engine/simulation/Ship.ts');const {Vector2}=await import('/src/engine/math/Vector2.ts');
 const {SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
 const {createGravityEscort}=await import('/src/studio/GravityLoadouts.ts');const {evaluate,decodeDesign}=await import('/src/studio/DesignModel.ts');
 const {GRAVITY_SYSTEM_IDS:ID}=await import('/src/engine/content/GravityIds.ts');
 const {dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts');
 const {applyGravityControlHold,cursorGravityOwnsAim}=await import('/src/engine/simulation/systems/GravityControlInput.ts');
 const {advanceGravityFields}=await import('/src/engine/simulation/systems/GravityFieldPhysics.ts');
 const {advanceGravityDamage}=await import('/src/engine/simulation/systems/GravityDamage.ts');
 const {RenderShipProjection}=await import('/src/engine/runtime/local/RenderShipProjection.ts');
 const {createLanWorld}=await import('/src/network/LanWorld.ts');const {captureCombat}=await import('/src/network/AuthorityCombatSnapshot.ts');
 const {initializeLanDisplayWorld,applyLanDisplaySnapshot}=await import('/src/network/LanDisplaySnapshot.ts');
 const {copyWorkerControls,idleWorkerControls,copyAcceptedWorkerInput}=await import('/src/network/LanPresentationWorkerProtocol.ts');
 const checks=[],measurements={};const check=(condition,label)=>{if(!condition)throw Error('Support controls: '+label);checks.push(label);};
 // Explicit historical v10/v12 polarity fixture; production defaults are checked separately.
 const fit=createGravityEscort(),productionSpec=evaluate(fit).spec,spec={...productionSpec,rightClickSystemType:ID.polarity};let serial=0;
 const owner=()=>{const s=new Ship('support-owner-'+serial++,spec,true,new Vector2(),0,new SimulationRandom(51));s.fireControlMode='MANUAL';s.teamId=0;s.selectedGroupIndex=0;for(const g of s.weaponGroups)g.isAutofire=false;return s;};
 const target=(team=1,x=900,y=0)=>{const s=new Ship('support-target-'+serial++,{...spec,weaponSlots:[],engineSlots:[],systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE'},team===0,new Vector2(x,y),0,new SimulationRandom(52));s.teamId=team;return s;};
 const world=(ships)=>({ships,projectiles:[],asteroids:[],hulkFragments:[],missiles:[],combatRandom:new SimulationRandom(53),deployMine(){}});
 const mount=s=>s.weapons.find(m=>m.spec.gravityTractor);
 const events=(s,w)=>{for(const sys of s.allSystems){s.flux.increaseFlux(sys.consumePendingActivationFlux(),false);sys.dispatchEvents(s,w,0);}};
 const input=(s,w,dt=1/60)=>s.weaponControl.update(dt,s,0,null,()=>{},()=>{},undefined,w);
 const tick=(s,w,dt=1/60)=>{for(const sys of s.allSystems)sys.update(dt);events(s,w);input(s,w,dt);advanceGravityFields(dt,w.ships,w.projectiles,w.asteroids,w.hulkFragments);advanceGravityDamage(dt,w);};
 const capture=(s,t,w)=>{s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;for(let i=0;i<18;i++)input(s,w);check(mount(s).gravityTractor.phase==='HOLD','Single capture retains production interaction');};
 {
  const s=owner(),t=target(),w=world([s,t]);s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;input(s,w,.05);
  const state=mount(s).gravityTractor;check(state.phase==='CAPTURE'&&state.status.includes('捕获中'),'Acquisition reports capture, not a false successful hold');
  const progress=state.capture;t.pos.y=120;s.aimTargetWorld.set(-1100,700);input(s,w,.18);
  check(state.phase==='HOLD'&&state.target.id===t.id&&state.capture>progress,'Fast cursor drag and target movement preserve initial capture');
  check(state.status.startsWith('已抓住'),'Actual hold has explicit grabbed status');
  s.isFiringMain=false;input(s,w);check(state.phase==='IDLE'&&!state.target&&!state.waitRelease,'Release removes latch and hold immediately');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);t.spec.bounds=[[-60,-60],[60,-60],[60,60],[-60,60]];
  s.isFiringMain=true;s.aimTargetWorld.set(t.pos.x+85,t.pos.y);input(s,w,.05);
  check(mount(s).gravityTractor.phase==='CAPTURE','Near actual outline has forgiving manual acquisition');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);t.spec.bounds=[[-60,-60],[60,-60],[60,60],[-60,60]];
  s.isFiringMain=true;s.aimTargetWorld.set(t.pos.x+200,t.pos.y);input(s,w,.05);
  check(mount(s).gravityTractor.phase==='IDLE','Large empty collision-circle space is not a clickable hull');
 }
 {
  const s=owner(),a=target(1,900,70),b=target(1,1000),w=world([s,a,b]);a.spec.bounds=[[-60,-60],[60,-60],[60,60],[-60,60]];b.spec.bounds=[[-20,-20],[20,-20],[20,20],[-20,20]];
  s.isFiringMain=true;s.aimTargetWorld.set(985,0);input(s,w,.05);
  check(mount(s).gravityTractor.target?.id===b.id,'Real interior wins over another nearby padded outline');
  s.aimTargetWorld.copy(a.pos);input(s,w,.18);
  check(mount(s).gravityTractor.phase==='HOLD'&&mount(s).gravityTractor.target.id===b.id,'Acquisition never silently substitutes a nearby target');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);s.isFiringMain=true;s.aimTargetWorld.copy(t.pos);input(s,w,.05);
  w.asteroids.push({id:991,pos:new Vector2(450,0),vel:new Vector2(),radius:45,mass:500,hp:500,maxHp:500});input(s,w,.18);
  check(mount(s).gravityTractor.phase==='IDLE'&&mount(s).gravityTractor.waitRelease,'Sticky capture still interrupts on new occlusion');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);s.isFiringMain=true;s.aimTargetWorld.copy(t.pos);input(s,w,.05);s.isFiringMain=false;input(s,w,.05);
  check(mount(s).gravityTractor.phase==='IDLE'&&!mount(s).gravityTractor.target,'Short release cancels in-progress acquisition without completing it');
 }
 {
  const s=owner(),t=target(1,2000,0),w=world([s,t]);t.spec.bounds=[[-60,-60],[60,-60],[60,60],[-60,60]];
  check(mount(s).spec.range===2000&&mount(s).spec.gravityTractor.tidalDamagePerSecond===1200,'LMB range is 2000 without a damage increase');
  s.isFiringMain=true;s.aimTargetWorld.copy(t.pos);input(s,w,.05);
  check(mount(s).gravityTractor.phase==='CAPTURE','Extended real hull contact acquires beyond old 1450 range');
  input(s,w,.18);s.aimTargetWorld.set(4000,0);input(s,w,1);
  const {weaponMuzzle}=await import('/src/engine/ai/FireControlGeometry.ts');const muzzle=weaponMuzzle(s,mount(s));
  check(new Vector2(mount(s).gravityTractor.anchorX,mount(s).gravityTractor.anchorY).distanceTo(muzzle)<=2000.00001,'Dragged anchor stays inside new finite 2000 range');
 }
 {
  const s=owner(),t=target(1,2140,0),w=world([s,t]);t.spec.bounds=[[-60,-60],[60,-60],[60,60],[-60,60]];
  s.isFiringMain=true;s.aimTargetWorld.copy(t.pos);input(s,w,.05);
  check(mount(s).gravityTractor.phase==='IDLE','Extended range still rejects real contacts beyond 2000');
 }
 const field=(s,w,x=600,y=0)=>{s.aimTargetWorld.set(x,y);check(dispatchShipCommand(s,{kind:'system',value:0}).accepted,'F accepted independently');events(s,w);s.system.update(.26);};
 const flip=(s,w)=>{check(dispatchShipCommand(s,{kind:'shield'}).accepted,'Polarity edge accepted');events(s,w);s.defenseSystem.update(.2);};
 check(productionSpec.systemTypes.join(',')===[ID.battleWell,ID.battleRepulsor].join(',')&&productionSpec.rightClickSystemType===ID.push,'Production defaults are movable F / emergency G / held RMB directional push');
 check(!evaluate(fit).errors.length,'Production support fit compiles');
 {
  const old={...structuredClone(fit),systemTypes:[ID.battleWell,ID.collapse],rightClickSystemType:ID.battleRepulsor};const encoded=JSON.stringify(old),result=evaluate(decodeDesign(JSON.parse(encoded)));
  check(!result.errors.length&&result.spec.systemTypes[1]===ID.battleRepulsor&&result.spec.rightClickSystemType===ID.push,'Old default fit migrates at compilation');
  check(JSON.stringify(old)===encoded&&JSON.stringify(result.design?.weapons??old.weapons)===JSON.stringify(old.weapons),'Migration does not rewrite saved weapons');
  const custom={...old,rightClickSystemType:'NONE'};check(evaluate(custom).spec.rightClickSystemType==='NONE','Custom right-click choice is preserved');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);capture(s,t,w);const state=mount(s).gravityTractor,anchor=[state.anchorX,state.anchorY];
  flip(s,w);check(s.defenseSystem.gravityPolarity===-1&&state.phase==='HOLD'&&anchor[0]===state.anchorX&&anchor[1]===state.anchorY,'RMB repulsion does not release or move captured anchor');
  t.vel.set(100,0);advanceGravityFields(1/60,w.ships,[]);check(t.vel.x>0&&t.vel.x<100,'Repulsion preserves stabilizing damping rather than amplifying velocity');
  t.vel.set(0,0);state.anchorX=t.pos.x-100;advanceGravityFields(.1,w.ships,[]);check(t.vel.x>0,'Repulsion pushes away from actual anchor');
  flip(s,w);t.vel.set(0,0);advanceGravityFields(.1,w.ships,[]);check(t.vel.x<0&&state.phase==='HOLD','Attraction pulls toward same anchor after second flip');
 }
 {
  const s=owner(),t=target(1,1000,0),w=world([s,t]);field(s,w);const f=s.system.gravityField,initialX=f.x,serial=s.system.activationSerial;
  applyGravityControlHold(s,true);s.aimTargetWorld.set(1000,500);advanceGravityFields(.1,w.ships,[]);
  check(Math.hypot(f.x-initialX,f.y)<=65.0001&&f.y>0,'Held F moves authoritative center at finite speed');
  const parked=[f.x,f.y];applyGravityControlHold(s,false);s.aimTargetWorld.set(0,-900);advanceGravityFields(.5,w.ships,[]);
  check(f.x===parked[0]&&f.y===parked[1]&&f.lingerRemaining<10,'Released F stays at actual center and spends linger time');
  const age=f.age;const reserved=s.system.reservedFluxCost;check(dispatchShipCommand(s,{kind:'system',value:0}).accepted&&s.system.gravityField===f&&s.system.activationSerial===serial&&s.system.reservedFluxCost===reserved&&f.age===age,'Reacquisition keeps instance, lifetime and paid activation');
  events(s,w);applyGravityControlHold(s,true);advanceGravityFields(.1,w.ships,[]);applyGravityControlHold(s,false);
  advanceGravityFields(10.01,w.ships,[]);check(s.system.gravityField?.kind==='COLLAPSE'&&!cursorGravityOwnsAim(s),'Released F reaches automatic burst after bounded linger');
  check(!dispatchShipCommand(s,{kind:'system',value:0}).accepted&&!cursorGravityOwnsAim(s),'Closing/cooling F cannot capture mouse ownership');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);capture(s,t,w);const state=mount(s).gravityTractor;field(s,w,600,400);const anchor=[state.anchorX,state.anchorY],age=state.age;
  applyGravityControlHold(s,true);s.aimTargetWorld.set(0,-700);input(s,w,.1);
  check(state.anchorX===anchor[0]&&state.anchorY===anchor[1]&&state.age>age,'F owns cursor while existing single anchor and hold budget remain live');
  applyGravityControlHold(s,false);input(s,w,.1);check(state.anchorY<anchor[1]&&state.phase==='HOLD','Releasing F restores finite-speed single drag');
  applyGravityControlHold(s,true);s.isFiringMain=false;input(s,w,.1);check(state.phase==='IDLE','LMB release still releases under held F');
  s.isFiringMain=true;input(s,w,.1);check(state.phase!=='HOLD','F does not start new single capture');
  s.clearInput();check(!s.system.gravityControlHeld&&!s.isFiringMain,'Focus/input clear drops both continuous controls');
 }
 {
  const s=owner(),t=target(1,1000,0),w=world([s,t]);field(s,w,600,0);applyGravityControlHold(s,true);advanceGravityFields(.1,w.ships,[]);check(t.vel.x<0,'Regional attraction applies actual enemy velocity');
  flip(s,w);t.vel.set(0,0);advanceGravityFields(.1,w.ships,[]);check(s.system.gravityField.polarity===-1&&t.vel.x>0,'Regional repulsion reverses same field without producing a wave');
  const hp=t.hullHp,armor=Array.from(t.armor.cells);advanceGravityDamage(.1,w);check(t.hullHp===hp&&armor.every((v,i)=>v===t.armor.cells[i]),'F polarity adds no area damage');
  const projection=new RenderShipProjection().project(s);check(projection.allSystems.find(v=>v.type===ID.polarity).gravityPolarity===-1&&projection.system.gravityField.polarity===-1,'Local projection retains polarity and controlled field');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);check(dispatchShipCommand(s,{kind:'system',value:1}).accepted,'Emergency G works without F');events(s,w);s.systems[1].update(.11);advanceGravityFields(.4,w.ships,[]);check(t.vel.x>0,'Emergency G creates outward real impulse');
 }
 {
  const s=owner(),t=target(0),w=world([s,t]);capture(s,t,w);field(s,w,600,0);const f=s.system.gravityField;
  s.flux.softFlux=s.flux.maxFlux-1;check(!dispatchShipCommand(s,{kind:'system',value:1}).accepted&&mount(s).gravityTractor.phase==='HOLD'&&s.system.gravityField===f,'Failed G preserves grip and F transactionally');
  s.flux.softFlux=0;flip(s,w);check(dispatchShipCommand(s,{kind:'system',value:1}).accepted,'G remains available in repulsion mode');events(s,w);
  check(mount(s).gravityTractor.phase==='IDLE'&&s.system.gravityField===f,'Successful G releases grip but retains F');
  s.systems[1].update(.11);advanceGravityFields(.4,w.ships,[]);check(t.vel.x>0,'G remains outward irrespective of shared polarity');
 }
 {
  const s=owner(),w=world([s]);field(s,w);applyGravityControlHold(s,true);for(let i=0;i<1210;i++)tick(s,w);
  check(s.system.gravityField?.kind!=='WELL','Held F cannot exceed current total field budget');
  measurements.totalFieldSeconds=20;
 }
 for(const [label,mutate] of [['death',s=>{s.isDead=true;}],['vent',s=>{s.flux.isVenting=true;}],['overload',s=>{s.flux.isOverloaded=true;}],['retreat',s=>{s.retreating=true;}],['offline',s=>{s.system.disabled=true;}]]){
  const s=owner(),w=world([s]);field(s,w);applyGravityControlHold(s,true);mutate(s);advanceGravityFields(.1,w.ships,[]);check(!s.system.gravityField&&!s.system.gravityControlHeld,label+' cleans controlled field');
 }
 // v12: manual-only self tow uses the same production controller and force budget.
 {
  const s=owner(),w=world([s]),m=mount(s);check(m.spec.gravityTractor.selfTow===true,'Production tractor explicitly opts into self tow');
  s.aimTargetWorld.copy(s.pos);s.isFiringMain=true;input(s,w,.05);const state=m.gravityTractor;
  check(state.phase==='CAPTURE'&&state.target.id===s.id&&state.status.includes('本舰'),'Own real hull begins clearly identified self acquisition');
  s.aimTargetWorld.set(-900,700);input(s,w,.18);
  check(state.phase==='HOLD'&&state.target.id===s.id&&state.status.includes('本舰牵引'),'Self acquisition is sticky through immediate drag outside outward weapon arc');
  const pos=s.pos.clone();input(s,w,.1);const anchorDistance=Math.hypot(state.anchorX-pos.x,state.anchorY-pos.y);
  check(anchorDistance>0&&anchorDistance<=65.00001&&s.pos.distanceTo(pos)===0,'Self drag moves only the finite-speed real anchor, never teleports hull');
  const hp=s.hullHp,armor=Array.from(s.armor.cells),flux=s.flux.totalFlux;
  advanceGravityFields(.1,w.ships,[]);const speed=s.vel.length();advanceGravityDamage(.1,w);
  const maintenance=m.spec.gravityTractor.fluxPerSecond*.1*Math.min(2,Math.max(.75,s.spec.mass/3000));
  check(speed>0&&speed<=m.spec.gravityTractor.strength*Math.min(2.5,1000/s.spec.mass)*.1+1e-7,'Self force changes actual velocity within mass-scaled acceleration budget');
  check(s.pos.distanceTo(pos)===0&&s.hullHp===hp&&armor.every((v,i)=>v===s.armor.cells[i]),'Self force/damage pass neither teleports nor damages own hull or armor');
  check(Math.abs(s.flux.totalFlux-flux-maintenance)<1e-6,'Self pays only existing mass-scaled maintenance, no hostile tidal fee');
  s.vel.set(100,0);state.anchorX=s.pos.x;state.anchorY=s.pos.y;advanceGravityFields(.1,w.ships,[]);
  check(s.vel.x>0&&s.vel.x<100&&s.vel.y===0,'Self anchor damps world velocity instead of subtracting itself to zero');
  state.anchorX=s.pos.x+100;s.vel.set(0,0);advanceGravityFields(.1,w.ships,[]);check(s.vel.x>0,'Self attraction accelerates toward world anchor');
  flip(s,w);s.vel.set(0,0);advanceGravityFields(.1,w.ships,[]);
  check(s.vel.x<0&&state.phase==='HOLD','RMB self repulsion reverses force without releasing self');
  state.anchorX=s.pos.x;s.vel.set(100,0);advanceGravityFields(.1,w.ships,[]);
  check(s.vel.x>0&&s.vel.x<100,'Self repulsion does not reverse stabilizing damping');
  const velocity=s.vel.clone();s.isFiringMain=false;input(s,w);advanceGravityFields(.1,w.ships,[]);
  check(state.phase==='IDLE'&&!state.target&&s.vel.distanceTo(velocity)===0,'Self release clears grip without removing earned world momentum');
  measurements.selfTow={mass:s.spec.mass,maxAcceleration:m.spec.gravityTractor.strength*Math.min(2.5,1000/s.spec.mass),maintenancePerSecond:maintenance*10,measuredStepSpeed:Number(speed.toFixed(6))};
 }
 {
  const s=owner(),w=world([s]),right=Math.max(...s.spec.bounds.map(([x])=>x));s.aimTargetWorld.set(right+2,0);s.isFiringMain=true;input(s,w,.3);
  check(mount(s).gravityTractor.phase==='IDLE','Own near-outline padding never triggers accidental self tow');
 }
 for(const [label,mutate] of [
  ['disabled opt-in',s=>{const m=mount(s);m.spec={...m.spec,gravityTractor:{...m.spec.gravityTractor,selfTow:false}};}],
  ['AI',s=>{s.fireControlMode='AI';s.currentTargetShip=s;}],
  ['fixed hull',s=>{s.spec={...s.spec,sourceHullTraits:['GRAVITY_FIXED']};}],
  ['module hull',s=>{s.spec={...s.spec,isModuleHull:true};}],
  ['missing real outline',s=>{s.spec={...s.spec,bounds:[]};}]
 ]){
  const s=owner(),w=world([s]);mutate(s);s.isFiringMain=true;s.aimTargetWorld.copy(s.pos);for(let i=0;i<18;i++)input(s,w);
  check(mount(s).gravityTractor.phase==='IDLE',label+' cannot acquire self');
 }
 {
  const s=owner(),root=target(0,500,500),w=world([root,s]);s.parentShip=root;s.isFiringMain=true;s.aimTargetWorld.copy(s.pos);for(let i=0;i<18;i++)input(s,w);
  check(mount(s).gravityTractor.phase==='IDLE','Attached module cannot independently self tow assembly root');
 }
 for(const [label,mutate] of [
  ['opt-in revoked',s=>{const m=mount(s);m.spec={...m.spec,gravityTractor:{...m.spec.gravityTractor,selfTow:false}};}],
  ['AI handoff',s=>{s.fireControlMode='AI';}],
  ['fixed root',s=>{s.spec={...s.spec,sourceHullTraits:['GRAVITY_FIXED']};}]
 ]){
  const s=owner(),w=world([s]);capture(s,s,w);const state=mount(s).gravityTractor;state.anchorX=500;mutate(s);const flux=s.flux.totalFlux;advanceGravityFields(.1,w.ships,[]);
  check(state.phase==='IDLE'&&s.vel.length()===0&&s.flux.totalFlux===flux,'Authority rejects restored self hold after '+label+' before fee or force');
 }
 {
  const {validateWeaponSpec}=await import('/src/engine/modding/ContentValidation.ts');const m=mount(owner());let rejected=false;
  try{validateWeaponSpec({...m.spec,gravityTractor:{...m.spec.gravityTractor,selfTow:'true'}},false);}catch{rejected=true;}
  check(rejected,'Self-tow capability validates as boolean, not a truthy string');
 }
 {
  const s=owner(),w=world([s]);capture(s,s,w);const state=mount(s).gravityTractor;field(s,w,600,400);const f=s.system.gravityField;
  const anchor=[state.anchorX,state.anchorY],age=state.age,flux=s.flux.totalFlux;applyGravityControlHold(s,true);s.aimTargetWorld.set(900,700);input(s,w,.1);advanceGravityFields(.1,w.ships,[]);
  check(state.anchorX===anchor[0]&&state.anchorY===anchor[1]&&state.age>age&&s.flux.totalFlux>flux,'Held F freezes self anchor but not age or paid maintenance');
  applyGravityControlHold(s,false);input(s,w,.1);check(state.anchorX>anchor[0]&&state.phase==='HOLD','F release resumes same finite-speed self anchor');
  s.flux.softFlux=s.flux.maxFlux-1;check(!dispatchShipCommand(s,{kind:'system',value:1}).accepted&&state.phase==='HOLD'&&s.system.gravityField===f,'Failed G preserves self hold and F');
  s.flux.softFlux=0;s.vel.set(30,-10);const velocity=s.vel.clone();check(dispatchShipCommand(s,{kind:'system',value:1}).accepted,'G accepts while self towing');events(s,w);
  check(state.phase==='IDLE'&&s.system.gravityField===f&&s.vel.distanceTo(velocity)===0,'Successful G releases self grip and preserves F and velocity');
  s.systems[1].update(.11);advanceGravityFields(.4,w.ships,[]);check(s.vel.distanceTo(velocity)===0,'Own emergency repulsor adds no extra self impulse');
 }
 {
  const s=owner(),w=world([s]);capture(s,s,w);input(s,w,5);input(s,w);check(mount(s).gravityTractor.phase==='IDLE'&&mount(s).cooldownTimer>0,'Self tow respects original five-second lifetime and recovery');
 }
 {
  const s=owner(),w=world([s]);capture(s,s,w);s.flux.isVenting=true;advanceGravityFields(.1,w.ships,[]);
  check(mount(s).gravityTractor.phase==='IDLE'&&s.vel.length()===0,'Venting cleans self hold in authority pass');
 }
 {
  const {engine}=createLanWorld({id:'gravity-self-tow-engine',seed:82,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:spec.id,design:fit},{id:'p1',seat:1,team:1,hull:spec.id,design:fit}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  engine.asteroids.length=0;const s=engine.playerShip,t=engine.enemyShip;
  for(const ship of engine.allCapitalShips){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';for(const g of ship.weaponGroups)g.isAutofire=false;}
  s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;t.pos.set(10000,10000);t.prevPos.copy(t.pos);s.selectedGroupIndex=0;s.aimTargetWorld.copy(s.pos);s.isFiringMain=true;
  for(let i=0;i<18;i++)engine.fixedUpdate(1/60);const state=mount(s).gravityTractor;check(state.phase==='HOLD'&&state.target.id===s.id,'Actual production engine captures own stable ship ID');
  const start=s.pos.clone();s.aimTargetWorld.set(-900,650);for(let i=0;i<60;i++)engine.fixedUpdate(1/60);
  check(s.pos.x<start.x&&s.pos.y>start.y&&s.pos.distanceTo(start)<100&&s.vel.length()>0,'Actual engine integrates finite self tow displacement, not pointer teleport');
  const projection=new RenderShipProjection().project(s);check(projection.weapons.find(m=>m.slotId===mount(s).slotId).gravityTractor.target.id===s.id,'Local render projection preserves self target');
  const snapshot=n=>captureCombat(engine,n,{0:0,1:0},0,false,false,false,true,false,false,false,false,false,true,false,true,true);
  const {world:display}=initializeLanDisplayWorld(0,structuredClone(snapshot(1))),v=display.ships.find(v=>v.id===s.id),displayState=mount(v).gravityTractor;
  check(displayState.phase==='HOLD'&&displayState.target.id===v.id&&displayState.status.includes('本舰牵引'),'Actual LAN snapshot/display restores self target and compact status');
  s.isFiringMain=false;engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(2)));
  check(mount(v).gravityTractor.phase==='IDLE'&&!mount(v).gravityTractor.target,'Actual LAN display clears released self hold');
  measurements.selfTow.engineDisplacement=Number(s.pos.distanceTo(start).toFixed(6));
 }
 check(copyWorkerControls({...idleWorkerControls(),keys:256}).keys===256,'Presentation Worker accepts logical hold bit');
 check(copyAcceptedWorkerInput({seq:1,keys:256,aim:[0,0],firing:false,pointerActive:true,actions:[]}).keys===256,'Accepted Worker input retains logical hold bit');
 {
  const {engine}=createLanWorld({id:'gravity-support-engine',seed:81,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:spec.id,design:fit},{id:'p1',seat:1,team:1,hull:spec.id,design:fit}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  engine.asteroids.length=0;const s=engine.playerShip,t=engine.enemyShip;
  const {ShipSystem}=await import('/src/engine/simulation/ShipSystem.ts');s.spec={...s.spec,rightClickSystemType:ID.polarity};s.defenseSystem=new ShipSystem(ID.polarity,s.spec.maxFlux,s);
  for(const ship of engine.allCapitalShips){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';for(const g of ship.weaponGroups)g.isAutofire=false;}
  s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;t.pos.set(900,0);t.prevPos.copy(t.pos);s.aimTargetWorld.set(600,400);
  dispatchShipCommand(s,{kind:'system',value:0});applyGravityControlHold(s,true);dispatchShipCommand(s,{kind:'shield'});
  for(let i=0;i<30;i++)engine.fixedUpdate(1/60);
  const snapshot=n=>captureCombat(engine,n,{0:0,1:0},0,false,false,false,true,false,false,false,false,false,true,false,true,true);
  const {world:display}=initializeLanDisplayWorld(0,structuredClone(snapshot(1))),v=display.ships.find(v=>v.id===s.id);
  check(v.defenseSystem.gravityPolarity===-1&&v.system.gravityControlHeld&&v.system.gravityField?.polarity===-1,'Actual LAN snapshot/display restores polarity and held F');
  applyGravityControlHold(s,false);for(let i=0;i<12;i++)engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(2)));
  check(!v.system.gravityControlHeld&&v.system.gravityField.lingerRemaining<10,'Actual LAN display restores release/linger transition');
  s.aimTargetWorld.set(600,400);check(dispatchShipCommand(s,{kind:'system',value:0}).accepted,'Real engine reconnects existing field');applyGravityControlHold(s,true);
  const originalPoint=[s.system.gravityField.x,s.system.gravityField.y];s.aimTargetWorld.set(900,700);for(let i=0;i<12;i++)engine.fixedUpdate(1/60);
  check(s.system.gravityField.y>originalPoint[1]&&Math.hypot(s.system.gravityField.x-originalPoint[0],s.system.gravityField.y-originalPoint[1])<=131,'Actual engine moves same field within finite speed budget');
  measurements.snapshot={polarity:v.defenseSystem.gravityPolarity,linger:Number(v.system.gravityField.lingerRemaining.toFixed(3))};
 }
 return {checks,measurements};
}

/** Served through Vite so bare React imports resolve exactly as in the game UI. */
export async function mountGravityHudPreview(engine,camera,canvas){
 const React=await import('react'),{createRoot}=await import('react-dom/client');
 const {CombatContacts}=await import('/src/ui/hud/CombatContacts.tsx');const {combatHudView}=await import('/src/engine/runtime/CombatHudView.ts');
 const overlay=document.createElement('div');overlay.style.cssText='position:absolute;left:0;top:42px;width:1440px;height:950px;pointer-events:none';document.body.append(overlay);
 const ui=createRoot(overlay);ui.render(React.createElement(CombatContacts,{engine:combatHudView(engine),paused:false,canvasRef:{current:canvas},cameraPosRef:{current:camera},zoomRef:{current:.65}}));
 return ui;
}

/** v13 production defaults and held-right input, separate from historical polarity probes. */
export async function runGravityPushScenarios(){
 const {Ship}=await import('/src/engine/simulation/Ship.ts'),{Vector2}=await import('/src/engine/math/Vector2.ts'),{SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
 const {createGravityEscort}=await import('/src/studio/GravityLoadouts.ts'),{evaluate,decodeDesign}=await import('/src/studio/DesignModel.ts');
 const {GRAVITY_SYSTEM_IDS:ID}=await import('/src/engine/content/GravityIds.ts');
 const {applyGravityPushHold,applyGravityControlHold}=await import('/src/engine/simulation/systems/GravityControlInput.ts');
 const {advanceGravityFields}=await import('/src/engine/simulation/systems/GravityFieldPhysics.ts'),{advanceGravityDamage}=await import('/src/engine/simulation/systems/GravityDamage.ts');
 const {dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts');
 const {copyWorkerControls,idleWorkerControls,copyAcceptedWorkerInput}=await import('/src/network/LanPresentationWorkerProtocol.ts');
 const checks=[],measurements={},check=(v,label)=>{if(!v)throw Error('Directional push: '+label);checks.push(label);};
 const fit=createGravityEscort(),spec=evaluate(fit).spec;let serial=0;
 const owner=()=>{const s=new Ship('push-owner-'+serial++,spec,true,new Vector2(),0,new SimulationRandom(61));s.fireControlMode='MANUAL';s.teamId=0;s.selectedGroupIndex=0;for(const g of s.weaponGroups)g.isAutofire=false;return s;};
 const target=(x=900,y=0,team=1,mass=9000)=>{const s=new Ship('push-target-'+serial++,{...spec,mass,weaponSlots:[],engineSlots:[],systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE'},false,new Vector2(x,y),0,new SimulationRandom(62));s.teamId=team;return s;};
 const world=ships=>({ships,projectiles:[],asteroids:[],hulkFragments:[],missiles:[],combatRandom:new SimulationRandom(63),deployMine(){}}),mount=s=>s.weapons.find(m=>m.spec.gravityTractor);
 const events=(s,w)=>{for(const sys of s.allSystems){s.flux.increaseFlux(sys.consumePendingActivationFlux(),false);sys.dispatchEvents(s,w,0);}};
 const input=(s,w,dt=1/60)=>s.weaponControl.update(dt,s,0,null,()=>{},()=>{},undefined,w);
 const force=(s,w,dt=.1)=>{events(s,w);input(s,w,dt);advanceGravityFields(dt,w.ships,w.projectiles,w.asteroids,w.hulkFragments);advanceGravityDamage(dt,w);};
 const start=(s,w,point)=>{s.aimTargetWorld.copy(point);applyGravityPushHold(s,true);events(s,w);};
 const capture=(s,t,w)=>{s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;for(let i=0;i<18;i++)input(s,w);check(mount(s).gravityTractor.phase==='HOLD','Production LMB capture remains valid');};
 check(spec.rightClickSystemType===ID.push&&spec.systemTypes.join(',')===[ID.battleWell,ID.battleRepulsor].join(','),'New fits have held push, movable F and independent G');
 const old={...structuredClone(fit),systemTypes:[ID.battleWell,ID.battleRepulsor],rightClickSystemType:ID.polarity},before=JSON.stringify(old),upgraded=evaluate(decodeDesign(JSON.parse(before)));
 check(upgraded.spec.rightClickSystemType===ID.push&&JSON.stringify(old)===before,'Old polarity default migrates without rewriting stored fit');
 check(evaluate({...old,rightClickSystemType:'NONE'}).spec.rightClickSystemType==='NONE','Custom NONE right-click is not replaced');
 {
  const s=owner(),t=target(),w=world([s,t]),hp=t.hullHp,armor=Array.from(t.armor.cells);start(s,w,t.pos);const flux=s.flux.totalFlux;force(s,w);
  check(t.vel.x>0&&Math.abs(t.vel.y)<1e-7&&s.defenseSystem.gravityPush.target.id===t.id,'RMB alone immediately pushes real target without LMB or F');
  check(mount(s).gravityTractor.phase==='IDLE'&&!s.system.gravityField,'Independent push does not secretly create a grip or F');
  check(t.hullHp===hp&&armor.every((v,i)=>v===t.armor.cells[i]),'Right push itself adds no damage');
  check(Math.abs(s.flux.totalFlux-flux-70)<1e-6,'Heavy target pays finite existing mass-scaled maintenance');
  const first=t.vel.x;s.aimTargetWorld.set(700,500);force(s,w);check(s.defenseSystem.gravityPush.target.id===t.id&&t.vel.y>0&&t.vel.x>first,'Latched push target remains while actual force follows mouse direction');
  const velocity=t.vel.clone();applyGravityPushHold(s,false);force(s,w);check(!s.defenseSystem.gravityPush&&t.vel.distanceTo(velocity)===0,'RMB release stops force and preserves momentum');
  measurements.heavyAcceleration=first/.1;
 }
 {
  const s=owner(),t=target(900,0,1,500),w=world([s,t]);start(s,w,t.pos);force(s,w);check(t.vel.x<=26.000001&&t.vel.x>measurements.heavyAcceleration*.1,'Light ship moves more, still obeys shared acceleration cap');
 }
 {
  const s=owner(),t=target(),other=target(900,700),w=world([s,t,other]);capture(s,t,w);const state=mount(s).gravityTractor;state.anchorX=-800;start(s,w,other.pos);const flux=s.flux.totalFlux;force(s,w);
  check(state.phase==='HOLD'&&state.target.id===t.id&&s.defenseSystem.gravityPush.target.id===other.id,'LMB retains its target while RMB selects a different ungrabbed entity');
  check(t.vel.x<0&&other.vel.x>0&&other.vel.y>0,'LMB spring follows its opposing drag anchor while independent RMB pushes another body');
  check(Math.abs(s.flux.totalFlux-flux-200)<1e-6,'Two different recipients pay separate 70 maintenance costs plus unchanged 60 tidal cost');
  applyGravityPushHold(s,false);s.aimTargetWorld.set(-800,0);input(s,w,.1);t.vel.set(0,0);force(s,w);check(state.phase==='HOLD'&&t.vel.x<0,'RMB release leaves original LMB dragging uninterrupted, without reacquisition');
 }
 {
  const s=owner(),w=world([s]),hp=s.hullHp,armor=Array.from(s.armor.cells);capture(s,s,w);start(s,w,new Vector2(900,500));force(s,w);
  check(s.vel.x>0&&s.vel.y>0&&!s.defenseSystem.gravityPush.target&&mount(s).gravityTractor.target.id===s.id,'Self towing remains LMB-only and follows cursor with RMB held');
  check(s.hullHp===hp&&armor.every((v,i)=>v===s.armor.cells[i]),'Simultaneous right input never adds self-tow damage');
 }
 {
  const s=owner(),t=target(900,0,0),w=world([s,t]);start(s,w,t.pos);force(s,w);check(t.vel.length()===0&&!s.defenseSystem.gravityPush.target,'Uncaptured friendly ship is not auto pushed');
 }
 {
  const s=owner(),t=target(900,0,0),w=world([s,t]);capture(s,t,w);start(s,w,new Vector2(900,200));force(s,w);check(t.vel.y>0&&!s.defenseSystem.gravityPush.target&&mount(s).gravityTractor.phase==='HOLD','Friendly dragging remains LMB-only and is not taken over by RMB');
 }
 {
  const s=owner(),w=world([s]);start(s,w,s.pos);force(s,w);check(s.vel.length()===0&&!s.defenseSystem.gravityPush.target,'RMB alone does not select self or create free self propulsion');
 }
 for(const [label,mutate] of [['fixed',t=>{t.spec={...t.spec,sourceHullTraits:['GRAVITY_FIXED']};}],['beyond range',t=>t.pos.set(2600,0)]] ){
  const s=owner(),t=target(),w=world([s,t]);mutate(t);start(s,w,t.pos);force(s,w);check(t.vel.length()===0&&!s.defenseSystem.gravityPush.target,label+' target cannot be pushed');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);w.asteroids.push({id:993,pos:new Vector2(450,0),vel:new Vector2(),radius:40,mass:500,hp:500});start(s,w,t.pos);force(s,w);check(t.vel.length()===0&&!s.defenseSystem.gravityPush.target,'RMB cannot push through intervening real obstruction');
 }
 {
  const s=owner(),w=world([s]);const p={id:994,pos:new Vector2(900,100),vel:new Vector2(0,700),radius:3,damage:100,baseDamage:100,rangeRemaining:1600,spawnType:'BALLISTIC',sourceShipId:'enemy-source',teamId:1,isPlayer:false,didDamage:false,collisionDisabled:false};w.projectiles.push(p);start(s,w,p.pos);const source=p.sourceShipId,range=p.rangeRemaining;force(s,w);
  check(p.vel.x>0&&p.sourceShipId===source&&p.teamId===1&&p.damage===100&&p.rangeRemaining===range,'Real enemy projectile is deflected without ownership, damage or lifetime rewrite');
  check(p.vel.clone().sub(new Vector2(0,700)).length()<=140.00001,'Projectile push respects acceleration cap');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);start(s,w,t.pos);force(s,w);const dx=s.defenseSystem.gravityPush.dx,dy=s.defenseSystem.gravityPush.dy;
  s.aimTargetWorld.set(700,400);dispatchShipCommand(s,{kind:'system',value:0});events(s,w);applyGravityControlHold(s,true);force(s,w);
  check(s.defenseSystem.gravityPush.dx===dx&&s.defenseSystem.gravityPush.dy===dy&&s.system.gravityField,'Held F freezes existing right force direction without closing either action');
  applyGravityControlHold(s,false);force(s,w);check(s.defenseSystem.gravityPush.dy>dy,'F release resumes right force direction');
  check(dispatchShipCommand(s,{kind:'system',value:1}).accepted,'Independent G remains available during right push');events(s,w);check(s.system.gravityField&&s.defenseSystem.gravityPush,'G does not consume F or transform right push into an area blast');
 }
 for(const [label,mutate] of [['vent',s=>{s.flux.isVenting=true;}],['overload',s=>{s.flux.isOverloaded=true;}],['retreat',s=>{s.retreating=true;}],['death',s=>{s.isDead=true;}],['AI',s=>{s.fireControlMode='AI';}],['offline',s=>{s.defenseSystem.disabled=true;}],['input clear',s=>s.clearInput()]]){
  const s=owner(),t=target(),w=world([s,t]);start(s,w,t.pos);force(s,w);const vel=t.vel.clone();mutate(s);advanceGravityFields(.1,w.ships,[]);check(!s.defenseSystem.gravityPush&&t.vel.distanceTo(vel)===0,label+' immediately cleans right force');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);start(s,w,t.pos);s.flux.softFlux=s.flux.maxFlux-1;force(s,w);check(!s.defenseSystem.gravityPush&&t.vel.length()===0,'Insufficient maintenance stops without overspending or free force');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);start(s,w,t.pos);force(s,w);capture(s,t,w);
  t.vel.set(0,0);mount(s).gravityTractor.anchorX=-800;s.aimTargetWorld.set(-800,0);force(s,w);
  check(mount(s).gravityTractor.phase==='HOLD'&&!s.defenseSystem.gravityPush.target&&t.vel.x<0,'LMB capture relinquishes a previously latched RMB body and preserves drag direction');
 }
 const deploy=(s,w)=>{s.aimTargetWorld.set(600,0);check(dispatchShipCommand(s,{kind:'system',value:0}).accepted,'Independent F deploys');events(s,w);s.system.update(.26);events(s,w);applyGravityControlHold(s,false);};
 for(const kind of ['SHIP','ASTEROID','HULK','PROJECTILE']){
  const trial=withField=>{
   const s=owner(),w=world([s]);let body;
   if(kind==='SHIP'){body=target();w.ships.push(body);}
   else if(kind==='ASTEROID'){body={id:995,pos:new Vector2(900,0),vel:new Vector2(),radius:20,mass:500,hp:500};w.asteroids.push(body);}
   else if(kind==='HULK'){body={id:'held-hulk',pos:new Vector2(900,0),vel:new Vector2(),collisionRadius:29,sourceShip:target(),bounds:[new Vector2(-20,-20),new Vector2(20,-20),new Vector2(20,20),new Vector2(-20,20)],facingRad:0,localOffset:new Vector2()};w.hulkFragments.push(body);}
   else{body={id:996,pos:new Vector2(900,0),vel:new Vector2(),radius:3,damage:100,baseDamage:100,rangeRemaining:1600,spawnType:'BALLISTIC',gravityCoupling:'MASS_DRIVER',sourceShipId:'enemy-source',teamId:1,isPlayer:false,didDamage:false,collisionDisabled:false};w.projectiles.push(body);}
   if(withField)deploy(s,w);capture(s,body,w);mount(s).gravityTractor.anchorX=-800;start(s,w,new Vector2(1100,0));force(s,w);
   check(!s.defenseSystem.gravityPush.target&&mount(s).gravityTractor.phase==='HOLD',kind+' held recipient is excluded from right push');
   if(withField)check(s.system.gravityField.polarity===-1,kind+' own F really repels while right held');
   const outward=body.vel.clone();applyGravityPushHold(s,false);body.vel.set(0,0);force(s,w);
   return {outward,inward:body.vel.clone(),s,w,body};
  };
  const baseline=trial(false),area=trial(true);
  check(area.outward.distanceTo(baseline.outward)<1e-7&&area.inward.distanceTo(baseline.inward)<1e-7,kind+' direct LMB force is identical with own repelling or attracting F, including normal damping');
  check(area.outward.x<0&&area.inward.x<0,kind+' follows LMB anchor with RMB held or released');
  if(kind==='PROJECTILE')check(!area.body.gravityWellBinding,'Held mass-driver projectile does not consume own field calibration binding');
  if(kind==='SHIP'){
   // Use a real equipped owner on the opposite team, not a fabricated field.
   const counter=owner();counter.teamId=2;counter.pos.set(0,800);counter.prevPos.copy(counter.pos);area.w.ships.push(counter);deploy(counter,area.w);area.body.vel.set(0,0);force(area.s,area.w);
   check(area.body.vel.distanceTo(baseline.inward)>1e-5,'Another ship field still counteracts direct LMB dragging');
  }
 }
 check(copyWorkerControls({...idleWorkerControls(),keys:512}).keys===512&&copyAcceptedWorkerInput({seq:1,keys:512,aim:[0,0],firing:false,pointerActive:true,actions:[]}).keys===512,'Worker controls and accepted input carry held RMB bit512');
 {
  const {createLanWorld}=await import('/src/network/LanWorld.ts'),{captureCombat}=await import('/src/network/AuthorityCombatSnapshot.ts'),{initializeLanDisplayWorld,applyLanDisplaySnapshot}=await import('/src/network/LanDisplaySnapshot.ts');
  const {applyCombatControlSample}=await import('/src/engine/runtime/CombatControl.ts'),{RenderShipProjection}=await import('/src/engine/runtime/local/RenderShipProjection.ts');
  const {engine}=createLanWorld({id:'gravity-v13-input',seed:83,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:spec.id,design:fit},{id:'p1',seat:1,team:1,hull:spec.id,design:fit}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  engine.asteroids.length=0;const s=engine.playerShip,t=engine.enemyShip;for(const ship of engine.allCapitalShips){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';for(const g of ship.weaponGroups)g.isAutofire=false;}
  s.pos.set(0,0);s.prevPos.copy(s.pos);t.pos.set(900,0);t.prevPos.copy(t.pos);s.selectedGroupIndex=1;
  const sample={autopilot:false,blocked:false,firing:false,mouseSteering:false,pointerActive:true,keys:{GravityPush:true},aim:[900,0]};
  const startX=t.pos.x;for(let i=0;i<30;i++){applyCombatControlSample(engine,null,1/60,sample);engine.fixedUpdate(1/60);}
  check(t.pos.x>startX&&s.defenseSystem.gravityPush?.target.id===t.id,'Production control sample and fixed-step engine cause real right-only displacement from another weapon group');
  const projection=new RenderShipProjection().project(s);check(projection.allSystems.some(v=>v.gravityPush?.target.id===t.id),'Local render projection retains actual push target');
  const snapshot=n=>captureCombat(engine,n,{0:0,1:0},0,false,false,false,true,false,false,false,false,false,true,false,true,true),{world:display}=initializeLanDisplayWorld(0,structuredClone(snapshot(1))),v=display.ships.find(v=>v.id===s.id);
  check(v.defenseSystem.gravityPush?.target.id===t.id&&v.defenseSystem.gravityControlHeld,'Actual LAN snapshot/display restores held push direction and target');
  applyCombatControlSample(engine,null,1/60,{...sample,keys:{},pointerActive:false});engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(2)));
  check(!v.defenseSystem.gravityPush&&!v.defenseSystem.gravityControlHeld,'Actual LAN display clears released/stale-pointer right state');
  measurements.engineDisplacement=t.pos.x-startX;
  s.pos.set(0,0);s.prevPos.copy(s.pos);s.vel.set(0,0);t.pos.set(900,0);t.prevPos.copy(t.pos);t.vel.set(0,0);s.selectedGroupIndex=0;
  const both={...sample,firing:true};for(let i=0;i<22;i++){applyCombatControlSample(engine,null,1/60,both);engine.fixedUpdate(1/60);}
  check(mount(s).gravityTractor.phase==='HOLD'&&mount(s).gravityTractor.target.id===t.id&&!s.defenseSystem.gravityPush?.target,'Actual simultaneous LMB/RMB input captures without right takeover');
  const drag={...both,aim:[600,350]};for(let i=0;i<18;i++){applyCombatControlSample(engine,null,1/60,drag);engine.fixedUpdate(1/60);}
  check(t.vel.y>0&&mount(s).gravityTractor.polarity===1,'Production LMB anchor still follows new mouse direction with right held');
  applyLanDisplaySnapshot(display,structuredClone(snapshot(3)));const gripView=v.weapons.find(m=>m.spec.gravityTractor).gravityTractor;
  check(gripView.phase==='HOLD'&&gripView.target.id===t.id&&!v.defenseSystem.gravityPush?.target&&v.defenseSystem.gravityControlHeld,'Actual LAN display preserves LMB grip independently from held RMB with no recipient');
 }
 return {checks,measurements};
}


/** v14: current natural expiry, no manual detonation/chords, production damage and snapshot paths. */
export async function runGravityAreaScenarios(){
 const {Ship}=await import('/src/engine/simulation/Ship.ts'),{Vector2}=await import('/src/engine/math/Vector2.ts'),{SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
 const {createGravityEscort}=await import('/src/studio/GravityLoadouts.ts'),{evaluate}=await import('/src/studio/DesignModel.ts'),{GRAVITY_SYSTEM_IDS:ID}=await import('/src/engine/content/GravityIds.ts');
 const {dispatchShipCommand}=await import('/src/engine/runtime/CombatCommands.ts'),{applyGravityControlHold,applyGravityPushHold,cursorGravityOwnsAim}=await import('/src/engine/simulation/systems/GravityControlInput.ts');
 const {advanceGravityFields}=await import('/src/engine/simulation/systems/GravityFieldPhysics.ts'),{advanceGravityDamage}=await import('/src/engine/simulation/systems/GravityDamage.ts');
 const {createLanWorld}=await import('/src/network/LanWorld.ts'),{captureCombat}=await import('/src/network/AuthorityCombatSnapshot.ts'),{initializeLanDisplayWorld,applyLanDisplaySnapshot}=await import('/src/network/LanDisplaySnapshot.ts');
 const fit=createGravityEscort(),spec=evaluate(fit).spec,checks=[],measurements={},check=(v,label)=>{if(!v)throw Error('Area controls: '+label);checks.push(label);};let serial=0;
 const owner=()=>{const s=new Ship('area-owner-'+serial++,spec,true,new Vector2(),0,new SimulationRandom(71));s.teamId=0;s.fireControlMode='MANUAL';for(const g of s.weaponGroups)g.isAutofire=false;return s;};
 const target=(x=1500,y=0,team=1)=>{const t=new Ship('area-target-'+serial++,{...spec,bounds:[[-20,-20],[20,-20],[20,20],[-20,20]],collisionRadius:29,weaponSlots:[],engineSlots:[],systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE'},false,new Vector2(x,y),0,new SimulationRandom(72));t.teamId=team;return t;};
 const world=ships=>({ships,projectiles:[],missiles:[],asteroids:[],hulkFragments:[],combatRandom:new SimulationRandom(73),deployMine(){}});
 const events=(s,w)=>{for(const sys of s.allSystems){s.flux.increaseFlux(sys.consumePendingActivationFlux(),false);sys.dispatchEvents(s,w,0);}};
 const tick=(s,w,dt)=>{for(const sys of s.allSystems)sys.update(dt);events(s,w);advanceGravityFields(dt,w.ships,[],w.asteroids);advanceGravityDamage(dt,w);};
 const field=(s,w,x=600,y=0)=>{s.aimTargetWorld.set(x,y);check(dispatchShipCommand(s,{kind:'system',value:0}).accepted,'Current enlarged F deploys');events(s,w);s.system.update(.26);applyGravityControlHold(s,true);advanceGravityFields(.01,w.ships,[]);};
 {
  const s=owner(),f=s.system.definition.gravityField,b=s.system.definition.gravityCollapse;
  check(f.radius===1100&&f.placementRange===2400&&f.duration===20&&f.lingerSeconds===10,'Current field is 1100 radius / 2400 tether / 20s total / 10s linger');
  check(b.radius===1100&&b.damage===3200&&b.edgeDamage===800,'Automatic detonation expands radius without increasing original damage');
  check(s.systems.length===2&&s.systems[1].type===ID.battleRepulsor&&!s.systems.some(v=>v.type===ID.collapse),'No manually activated burst / third key is installed; old G only emergency');
  check(s.weapons.find(m=>m.spec.gravityTractor).spec.gravityTractor.holdTime===5,'Single-grip five-second lifetime is unchanged');
  check(!dispatchShipCommand(s,{kind:'system',value:2}).accepted,'H / nonexistent third slot cannot manually detonate');
  const encoded=JSON.stringify(fit),old={...structuredClone(fit),rightClickSystemType:ID.polarity};const text=JSON.stringify(old);
  check(evaluate(old).spec.rightClickSystemType===ID.push&&JSON.stringify(old)===text&&JSON.stringify(fit)===encoded,'Migration remains materialized-only, with no stored-fit mutation');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);field(s,w);const f=s.system.gravityField,serial=s.system.activationSerial,hp=t.hullHp;
  check(t.vel.x<0&&f.radius===1100,'Real enemy beyond old 650 radius receives attraction');t.vel.set(0,0);applyGravityControlHold(s,false);
  s.aimTargetWorld.set(-800,1000);applyGravityPushHold(s,true);events(s,w);advanceGravityFields(.1,w.ships,[]);
  check(f.polarity===-1&&t.vel.x>0,'RMB held alone changes parked area to real outward force without F chord');
  check(!s.defenseSystem.gravityPush?.target&&s.system.activationSerial===serial,'Area polarity works even without a single push recipient, without replacing field');
  advanceGravityDamage(.1,w);check(t.hullHp===hp,'Ordinary regional push adds no area damage');
  const age=f.age;applyGravityPushHold(s,false);t.vel.set(0,0);advanceGravityFields(.1,w.ships,[]);check(t.vel.x<0&&f.polarity===1&&f.age>age,'RMB release restores attraction without refreshing lifetime');
 }
 {
  const s=owner(),w=world([s]);field(s,w,2400);check(s.system.gravityField.x===2400,'Expanded placement accepts actual 2400 center');const f=s.system.gravityField,before=new Vector2(f.x,f.y);
  s.aimTargetWorld.set(5000,5000);advanceGravityFields(.1,w.ships,[]);check(before.distanceTo(new Vector2(f.x,f.y))<=65.00001&&Math.hypot(f.x,f.y)<=2400.00001,'Field still uses finite cursor speed and bounded tether');
  const bad=owner();bad.aimTargetWorld.set(2401,0);check(!dispatchShipCommand(bad,{kind:'system',value:0}).accepted&&!bad.system.gravityField,'Beyond 2400 deployment remains rejected');
 }
 {
  const s=owner(),w=world([s]);field(s,w);const f=s.system.gravityField;applyGravityControlHold(s,false);tick(s,w,5);
  check(s.system.gravityField===f&&f.lingerRemaining>4.9&&f.lingerRemaining<5.1,'Parked field remains beyond old three-second window');
  const age=f.age,total=s.system.activeTimer,serial=s.system.activationSerial,reserved=s.system.reservedFluxCost;dispatchShipCommand(s,{kind:'system',value:0});
  check(s.system.gravityField===f&&s.system.activeTimer===total&&f.age===age&&s.system.activationSerial===serial&&s.system.reservedFluxCost===reserved,'Reacquisition preserves instance, total life and activation fee');
  applyGravityControlHold(s,true);tick(s,w,.1);applyGravityControlHold(s,false);tick(s,w,9.9);check(s.system.gravityField?.kind==='WELL','Reacquired field can linger nearly ten seconds');
  const center=[f.x,f.y],flux=s.flux.totalFlux;tick(s,w,.2);check(s.system.gravityField?.kind==='COLLAPSE'&&s.system.state==='IN','Linger end automatically enters real warning stage');
  check(s.system.gravityField.x===center[0]&&s.system.gravityField.y===center[1]&&Math.abs(s.flux.totalFlux-flux-1800)<1e-6,'Auto burst captures final field position and pays existing 1800 flux once');
  check(!dispatchShipCommand(s,{kind:'system',value:0}).accepted&&!cursorGravityOwnsAim(s),'F cannot manually trigger, retarget or re-grab an automatic burst');
 }
 {
  const s=owner(),t=target(1500),ally=target(1500,100,0),w=world([s,t,ally]);t.armor.cells.fill(0);t.armor.minArmorFractionMultiplier=0;field(s,w);const f=s.system.gravityField,hp=t.hullHp,friend=ally.hullHp;
  tick(s,w,19.9);check(s.system.gravityField?.kind==='WELL','Held area reaches full twenty-second window');tick(s,w,.11);
  check(s.system.gravityField?.kind==='COLLAPSE'&&t.hullHp===hp,'Total-life end enters warning with no premature damage');
  s.aimTargetWorld.set(-1000,1400);const c=s.system.gravityField;tick(s,w,.4);check(t.hullHp===hp&&c.x===f.x&&c.y===f.y,'Automatic warning does not follow later aim or damage early');
  tick(s,w,.06);const damage=hp-t.hullHp;check(damage>800&&damage<=3200&&ally.hullHp===friend,'Auto expiry damages hostile hull at original falloff without friendly damage');
  tick(s,w,.1);check(hp-t.hullHp===damage&&c.collapseApplied,'Actual auto burst hits once, not on every active frame');measurements.outerHullDamage=damage;
  tick(s,w,.4);check(!s.system.gravityField&&s.system.isCoolingDown,'Auto sequence cleans up into normal field cooldown');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);t.armor.cells.fill(0);t.armor.minArmorFractionMultiplier=0;field(s,w);w.asteroids.push({id:7001,pos:new Vector2(1050,0),vel:new Vector2(),radius:90,mass:1000,hp:1000,gravityFixed:true});
  const hp=t.hullHp;applyGravityControlHold(s,false);tick(s,w,10.01);tick(s,w,.46);check(t.hullHp===hp,'Auto burst still respects actual intervening obstruction');
 }
 for(const [name,mutate]of [['death',s=>s.isDead=true],['vent',s=>s.flux.isVenting=true],['overload',s=>s.flux.isOverloaded=true],['retreat',s=>s.retreating=true],['offline',s=>s.system.disabled=true],['phase',s=>s.externalPhaseEffects.set('test',()=>true)],['range',s=>s.pos.set(-5000,0)],['explicit cancel',s=>s.system.deactivate()],['reset',s=>s.system.reset()]]){
  const s=owner(),t=target(),w=world([s,t]);field(s,w);const hp=t.hullHp;mutate(s);tick(s,w,21);check(s.system.gravityField?.kind!=='COLLAPSE'&&t.hullHp===hp,name+' cannot turn interruption into an expiry explosion');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);field(s,w);applyGravityControlHold(s,false);tick(s,w,10.01);s.flux.isVenting=true;tick(s,w,.5);check(!s.system.gravityField,'Venting during automatic warning cancels burst');
  const low=owner(),ww=world([low]);field(low,ww);low.flux.softFlux=low.flux.maxFlux-100;tick(low,ww,20);check(low.system.gravityField?.kind!=='COLLAPSE','Insufficient burst flux cannot create free detonation');
 }
 {
  const s=owner(),t=target(900),w=world([s,t]);s.aimTargetWorld.copy(t.pos);s.isFiringMain=true;for(let i=0;i<18;i++)s.weaponControl.update(1/60,s,0,null,()=>{},()=>{},undefined,w);
  const grip=s.weapons.find(m=>m.spec.gravityTractor).gravityTractor;field(s,w);applyGravityControlHold(s,false);s.system.gravityField.lingerRemaining=.001;tick(s,w,.01);check(grip.phase==='HOLD'&&grip.target.id===t.id,'Auto detonation itself does not release current left capture');
  const paused=s.system.activeTimer,serial=s.system.activationSerial;tick(s,w,0);check(s.system.activeTimer===paused&&s.system.activationSerial===serial,'Zero simulation time pauses warning and hit scheduling');
 }
 {
  const s=owner(),t=target(),w=world([s,t]);field(s,w);const f=s.system.gravityField;dispatchShipCommand(s,{kind:'system',value:1});events(s,w);check(s.system.gravityField===f&&f.kind==='WELL','G only fires emergency outward wave, never detonates field');
 }
 {
  const match={id:'gravity-v14-snapshot',seed:84,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:spec.id,design:fit},{id:'p1',seat:1,team:1,hull:spec.id,design:fit}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}};
  const {engine}=createLanWorld(match);engine.asteroids.length=0;const s=engine.playerShip;engine.externallyControlledShipIds.add(s.id);s.fireControlMode='MANUAL';s.pos.set(0,0);s.prevPos.copy(s.pos);s.aimTargetWorld.set(600,0);dispatchShipCommand(s,{kind:'system',value:0});for(let i=0;i<20;i++)engine.fixedUpdate(1/60);applyGravityControlHold(s,false);applyGravityPushHold(s,true);engine.fixedUpdate(1/60);
  const snapshot=n=>captureCombat(engine,n,{p0:n},0,false,false,false,true,false,false,false,false,false,true,false,true,true);
  const {world:display}=initializeLanDisplayWorld(0,structuredClone(snapshot(1)));const v=display.ships.find(v=>v.id===s.id);
  check(v.system.gravityField?.polarity===-1&&v.system.gravityField.radius===1100&&v.system.gravityField.lingerRemaining>9,'Actual LAN restores enlarged parked repulsion and linger');
  check(v.system.activeTimer>19&&v.system.definition.gravityCollapse?.radius===1100,'LAN HUD receives real total timer and automatic damage radius');
  applyGravityPushHold(s,false);s.system.gravityField.lingerRemaining=.001;engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(2)));
  check(v.system.gravityField?.kind==='COLLAPSE'&&v.system.state==='IN'&&v.system.activeTimer>0,'Actual LAN restores real expiry warning, not a client-generated explosion');
  for(let i=0;i<31;i++)engine.fixedUpdate(1/60);applyLanDisplaySnapshot(display,structuredClone(snapshot(3)));check(v.system.gravityField?.collapseApplied===true&&v.system.state==='ACTIVE','LAN display restores real one-shot burst event state');
 }
 return {checks,measurements};
}
