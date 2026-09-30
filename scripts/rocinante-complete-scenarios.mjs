/** Full ship integration, production rules and bounded AI combat. No visual fixtures. */
export async function runRocinanteCompleteScenarios() {
  globalThis.__LAN_BUILD_ID__='rocinante-complete';
  const {modManager}=await import('/src/engine/modding/ModManager.ts');
  const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');
  const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
  const {createRocinanteSkirmish,createRocinanteHunter}=await import('/src/studio/RocinanteLoadouts.ts');
  const {evaluate,budget,decodeDesign,isBuiltIn,compatibility}=await import('/src/studio/DesignModel.ts');
  const {ROCINANTE_HULL_ID,ROCINANTE_MODS}=await import('/src/engine/content/RocinanteIds.ts');
  const {ROCINANTE_WEAPONS:W}=await import('/src/engine/content/RocinanteArmory.ts');
  const {rocinanteHullMods,isRocinanteCompensating}=await import('/src/engine/content/RocinanteHullMods.ts');
  const {Ship}=await import('/src/engine/simulation/Ship.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
  const {ContentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {simulationRoster,prepareSimulationOption}=await import('/src/engine/content/SimulationCatalog.ts');
  const checks=[],measurements={};const check=(v,n)=>{if(!v)throw Error(n);checks.push(n);};const near=(a,b)=>Math.abs(a-b)<1e-7;
  await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
  const hull=modManager.requireShip(ROCINANTE_HULL_ID);
  check(hull.weaponSlots.length===9,'Nine slots registered');check(hull.weaponSlots.filter(s=>isBuiltIn(hull.id,s.slotId)).length===7,'Seven fixed bindings and two removable tubes');
  check(hull.shieldType==='NONE'&&hull.fighterBays===0&&!hull.modules,'No invented shield, fighters or modules');
  const fits=[createRocinanteSkirmish(),createRocinanteHunter()];
  for(const fit of fits){const e=evaluate(fit);check(!e.errors.length,'Fit legal: '+fit.name+' '+e.errors.join('|'));check(budget(fit).used===60&&budget(fit).weaponOP===20,'Real 60OP budget: '+fit.name);
    const decoded=decodeDesign(JSON.parse(JSON.stringify(fit)));check(!evaluate(decoded).errors.length&&JSON.stringify(decoded.weapons)===JSON.stringify(fit.weapons),'Save/decode preserves equipment: '+fit.name);}
  const illegal=structuredClone(fits[0]);illegal.hullMods.push(ROCINANTE_MODS.magazine);check(evaluate(illegal).errors.length>0,'Exclusive hullmods rejected');
  const tube=hull.weaponSlots.find(s=>s.slotId==='TORP_1'),torp=contentRegistry.getWeapon(W.torpedo_heavy);
  check(!compatibility(tube,torp),'Both M torpedoes fit M launcher');check(!!compatibility(tube,{...torp,mountSize:'SMALL'}),'Smaller tier is not silently accepted');
  check(!!compatibility({...tube,weaponType:'BALLISTIC'},contentRegistry.getWeapon(W.railgun)),'Fixed rail cannot be externally fitted');
  let n=0;const fresh=(fit=fits[0])=>{const s=new Ship('roci-test-'+(++n),evaluate(fit).spec,true,new Vector2(),0,new SimulationRandom(n+81));s.fireControlMode='MANUAL';s.aimTargetWorld.set(2000,0);return s;};
  const tick=(s,dt)=>s.update(dt,null,()=>{},()=>{},undefined,{ships:[s],missiles:[],asteroids:[]});
  const rail=s=>s.weapons.find(w=>w.slotId==='RAIL_01');
  const fire=s=>s.weaponControl.fireWeapon(rail(s),s,()=>{},()=>{});
  // Physical asteroid contacts must use the authored hull, not its enclosing circle.
  {
    const {AsteroidSystem}=await import('/src/engine/simulation/systems/AsteroidSystem.ts');
    const {getHullCircleContact}=await import('/src/engine/simulation/collision/HullGeometry.ts');
    const {getShieldCircleContact}=await import('/src/engine/simulation/collision/ShieldCollisionGeometry.ts');
    const vec=(x=0,y=0)=>new Vector2(x,y),world=(s,p)=>p.clone().rotate(s.facingRad).add(s.pos);
    const same=(a,b)=>near(a.x,b.x)&&near(a.y,b.y);
    const setup=(ship,local,radius=10)=>{
      const system=new AsteroidSystem(new SimulationRandom(431)),events=[];
      const asteroid={id:901,pos:world(ship,local),vel:vec(),facingRad:0,angularVel:0,radius,
        mass:radius*radius*.75,hp:2000,maxHp:2000,spriteUrl:'/game-assets/graphics/asteroids/asteroid1.png'};
      system.asteroids=[asteroid];
      const fx={getPlayerPos:()=>ship.pos,detachContrail:()=>{},
        ...Object.fromEntries(['spawnShieldRipple','addFloatingDamage','addFloatingText','spawnArmorDamageSparks',
          'spawnSparks','spawnDebris','spawnAuthenticExplosion'].map(key=>[key,(...args)=>events.push({key,args})]))};
      const resolve=()=>system.resolveShipCollisions([ship],fx);
      const state=()=>JSON.stringify({pos:asteroid.pos,vel:asteroid.vel,hp:asteroid.hp,hull:ship.hullHp,
        armor:[...ship.armor.cells],flux:ship.flux.totalFlux,events:events.length});
      return {system,asteroid,events,resolve,state};
    };
    const xs=hull.bounds.map(p=>p[0]),minX=Math.min(...xs),maxX=Math.max(...xs),radius=10;
    const contacts=[['bow',vec(maxX+radius-.5,0),vec(maxX,0),vec(1,0)],
      ['stern',vec(minX-radius+.5,0),vec(minX,0),vec(-1,0)],
      ['port',vec(25,-35.75-radius+.5),vec(25,-35.75),vec(0,-1)],
      ['starboard',vec(25,35.75+radius-.5),vec(25,35.75),vec(0,1)]];
    let hullContacts=0;
    for(const facing of [0,Math.PI/2,.371,-2.07]){
      for(const [label,local] of [['side gap',vec(0,80)],['bow gap',vec(maxX+radius+5,0)]]){
        const ship=fresh();ship.pos.set(370,-241);ship.facingRad=facing;
        const f=setup(ship,local),before=f.state();
        check(local.length()<ship.spec.collisionRadius+radius,'Fixture reproduces old circular false positive: '+label);
        f.resolve();check(f.state()===before,'No recoil, damage or FX in visible '+label+' at '+facing);
      }
      for(const [label,local,point,outward] of contacts){
        const ship=fresh();ship.pos.set(370,-241);ship.facingRad=facing;
        const f=setup(ship,local),contact=getHullCircleContact(ship,f.asteroid.pos,radius);
        const expectedPoint=world(ship,point),expectedNormal=outward.clone().rotate(facing);
        check(contact&&near(contact.penetration,.5)&&same(contact.point,expectedPoint)&&same(contact.normal,expectedNormal),
          'Exact rotated '+label+' surface and normal at '+facing);
        const start=f.asteroid.pos.clone(),armor=ship.armor.dirtyVersion;f.resolve();
        const spark=f.events.find(e=>e.key==='spawnArmorDamageSparks'),debris=f.events.find(e=>e.key==='spawnDebris');
        check(f.asteroid.hp<2000&&ship.armor.dirtyVersion>armor&&spark&&same(spark.args[1],point)
          &&debris&&same(debris.args[0],expectedPoint),'Actual contact damages hull armor and anchors FX on '+label);
        check(same(f.asteroid.pos,start.addScaled(expectedNormal,.5))&&same(f.asteroid.vel,expectedNormal.clone().scale(60)),
          'Recoil separates only the real overlap at '+label);
        const after=f.state();f.resolve();check(f.state()===after,'Separated '+label+' does not receive repeated damage');hullContacts++;
      }
    }
    // Synthetic outlines exercise geometry only; they never enter the catalogue.
    for(const reversed of [false,true]){
      let bounds=[[-100,-10],[100,-10],[100,10],[-100,10],[-100,10]];
      if(reversed)bounds=bounds.reverse();bounds=Object.freeze(bounds.map(p=>Object.freeze(p)));
      const ship={spec:{bounds,collisionRadius:5},pos:vec(170,-80),facingRad:.63};
      const query=(p,r)=>getHullCircleContact(ship,world(ship,p),r);
      check(near(query(vec(104,0),5)?.penetration,1),'Broadphase retains authored bow beyond nominal radius: '+reversed);
      check(!query(vec(105,0),5),'Exact tangent is not a damage event: '+reversed);
      for(const [p,depth] of [[vec(0,0),15],[vec(0,9),6],[vec(0,10),5]]){
        const contact=query(p,5);check(contact&&near(contact.penetration,depth)&&near(contact.normal.length(),1),'Embedded/boundary circle has finite outward contact');
        const separated=world(ship,p).addScaled(contact.normal,contact.penetration);
        check(!getHullCircleContact(ship,separated,5),'Embedded/boundary circle separates for either winding');
      }
      const corner=query(vec(103,14),6);
      check(corner&&same(corner.point,world(ship,vec(100,10)))&&near(corner.penetration,1),'Corner uses nearest vertex, not an expanded AABB');
    }
    const concave={spec:{collisionRadius:60,bounds:[[-40,-40],[40,-40],[40,40],[10,40],[10,0],[-10,0],[-10,40],[-40,40]]},pos:vec(),facingRad:0};
    check(!getHullCircleContact(concave,vec(0,20),5),'Concave notch remains empty');
    const notch=getHullCircleContact(concave,vec(8,20),5);
    check(notch&&same(notch.point,vec(10,20))&&same(notch.normal,vec(-1,0))&&near(notch.penetration,3),'Concave edge pushes toward the notch, not the ship-center radial');
    const circular={spec:{collisionRadius:50},pos:vec(),facingRad:.8};
    const fallback=getHullCircleContact(circular,vec(59,0),10);
    check(fallback&&near(fallback.penetration,1)&&same(fallback.point,vec(50,0))&&!getHullCircleContact(circular,vec(60,0),10),'Legacy hulls without bounds retain circular contact');
    const coincident=getHullCircleContact(circular,vec(),10);
    check(coincident&&near(coincident.penetration,60)&&near(coincident.normal.length(),1),'Coincident circular centers stay deterministic and finite');
    const degenerate={spec:{collisionRadius:50,bounds:[[0,0],[0,0],[0,0]]},pos:vec(),facingRad:0};
    check(!getHullCircleContact(degenerate,vec(),10),'Degenerate outline does not produce NaN recoil');
    for(const mode of ['dead','phase']){
      const ship=mode==='phase'?new Ship('asteroid-phase-'+(++n),{...hull,shieldType:'PHASE'},true,vec(),0,new SimulationRandom(91)):fresh();
      if(mode==='dead')ship.isDead=true;else ship.shield.phaseState='ACTIVE';
      const f=setup(ship,vec()),before=f.state();f.resolve();check(f.state()===before,'No asteroid interaction while '+mode);
    }
    // Private shield fixture (not registered): deployed arc priority and exposed rear hull.
    const shielded=()=>new Ship('asteroid-shield-'+(++n),{...hull,shieldType:'FRONT',shieldRadius:170,shieldArcDeg:120},true,vec(),0,new SimulationRandom(92));
    {
      const ship=shielded();ship.shield.isActive=true;ship.shield.currentArcDeg=120;
      const center=ship.getShieldCenter(),local=center.clone().sub(ship.pos).add(vec(ship.shield.radius+radius-.5,0));
      const f=setup(ship,local),beforeArmor=ship.armor.dirtyVersion,beforeHP=ship.hullHp;
      const shield=getShieldCircleContact(ship,f.asteroid.pos,radius);check(!!shield,'Shield fixture overlaps a deployed arc');
      f.resolve();check(ship.flux.totalFlux>0&&ship.armor.dirtyVersion===beforeArmor&&ship.hullHp===beforeHP&&f.asteroid.hp===2000
        &&f.events.some(e=>e.key==='spawnShieldRipple')&&!f.events.some(e=>e.key==='spawnArmorDamageSparks'),'Shield intercept remains ahead of hull contact');
      check(near(f.asteroid.pos.distanceTo(center),ship.shield.radius+radius),'Shield response separates the asteroid');
    }
    {
      const ship=shielded();ship.shield.isActive=true;ship.shield.currentArcDeg=120;
      const rear=ship.spec.bounds.reduce((a,b)=>a[0]<b[0]?a:b),local=vec(rear[0]-radius+.5,rear[1]);
      const f=setup(ship,local),armor=ship.armor.dirtyVersion;f.resolve();
      check(ship.flux.totalFlux===0&&ship.armor.dirtyVersion>armor&&f.asteroid.hp<2000,'Uncovered rear still collides with hull while front shield is active');
    }
    {
      const ship=fresh(),f=setup(ship,contacts[0][1]);f.asteroid.hp=1;f.resolve();
      check(f.system.asteroids.length===0&&f.events.some(e=>e.key==='spawnAuthenticExplosion'),'A real hull contact still shatters a depleted asteroid');
    }
    measurements.asteroidHullContacts={rotatedContacts:hullContacts,ghostContactGaps:8,concave:true,legacyFallback:true,shieldPriority:true};
  }
  // R4: visible built-in and heat-limited suppress mode, through production stats/fire.
  {
    const {hullModInstallReason,hullModOPCost}=await import('/src/engine/extensions/HullMods.ts');
    const {createDesign,editableMods}=await import('/src/studio/DesignModel.ts');
    const base=fresh(),pd=base.weapons.find(m=>m.spec.id===W.pdc),raw=contentRegistry.getWeapon(W.pdc);
    check(hull.builtInHullMods.includes(ROCINANTE_MODS.matrix),'Default hull exposes innate interception matrix');
    check(evaluate(createDesign(ROCINANTE_HULL_ID)).spec.builtInHullMods.includes(ROCINANTE_MODS.matrix),'Existing designs inherit builtin without rewriting their equipment');
    check(!editableMods.includes(ROCINANTE_MODS.matrix)&&hullModOPCost(hull,ROCINANTE_MODS.matrix)===0,'Matrix is free and not an installable duplicate');
    check(!!hullModInstallReason(hull,ROCINANTE_MODS.matrix),'Matrix cannot be uninstalled/reinstalled as an external mod');
    check(base.weapons.filter(m=>m.spec.id===W.pdc).every(m=>near(base.getWeaponDisplayRange(m.spec),700)&&near(m.spec.turnRateDegPerSec,315)),'All six PDCs actually reach 700 with 315 deg/s traverse');
    check(near(base.getWeaponDisplayRange(rail(base).spec),1350)&&near(raw.range,550)&&near(raw.turnRateDegPerSec,210),'Axis and shared weapon catalogue untouched');
    const active=fresh(),mount=active.weapons.find(m=>m.spec.id===W.pdc),rounds=[];
    check(active.activateDefenseSystem(),'Pressure mode activation accepted');active.defenseSystem.update(.3);
    check(near(active.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1.5)&&near(active.system.getWeaponRateOfFireMultiplier('MISSILE'),1),'Suppress accelerates guns but not torpedoes');
    check(near(active.system.getDissipationMultiplier(),.5)&&near(base.system.getDissipationMultiplier(),1),'Half dissipation is instance-local and real');
    const before=active.flux.totalFlux;check(active.weaponControl.fireWeapon(mount,active,p=>rounds.push(p),()=>{}),'Boosted PDC shot exists');
    check(near(active.flux.totalFlux-before,4.05)&&near(rounds[0].vel.length(),2000),'Actual shot spends 35 percent more flux and flies 25 percent faster');
    check(near(rounds[0].damage,10)&&mount.spec.ammoRegenPerSec===6,'No phantom damage buff or ammunition grant');
    const measure=suppress=>{
      const s=fresh(),gun=s.weapons.find(m=>m.spec.id===W.pdc),shots=[];
      for(const other of s.weapons)other.isDisabled=other!==gun;
      s.selectedGroupIndex=s.weaponGroups.findIndex(g=>g.weaponSlotIds.includes(gun.slotId));s.isFiringMain=true;
      gun.currentAngleRad=gun.baseAngleDeg*Math.PI/180;s.aimTargetWorld.set(Math.cos(gun.currentAngleRad)*2000,Math.sin(gun.currentAngleRad)*2000);
      if(suppress){s.activateDefenseSystem();s.defenseSystem.update(.3);}
      for(let i=0;i<480;i++)s.weaponControl.update(1/240,s,0,null,p=>shots.push(p),()=>{},undefined,{ships:[s],missiles:[],asteroids:[]});
      return shots.length;
    };
    measurements.fireControl={pdcShotsInTwoSeconds:[measure(false),measure(true)],range:base.getWeaponDisplayRange(pd.spec),turn:pd.spec.turnRateDegPerSec};
    const [normal,boosted]=measurements.fireControl.pdcShotsInTwoSeconds;
    check(normal>=29&&normal<=31&&boosted>=39&&boosted<=41,'Actual PDC cadence is 15 to 20 shots/sec, respecting host minimum refire');
    rail(base).cooldownTimer=4.15;rail(active).cooldownTimer=4.15;
    for(const s of [base,active])s.weaponControl.update(.2,s,0,null,()=>{},()=>{},undefined,{ships:[s],missiles:[],asteroids:[]});
    check(near(rail(base).cooldownTimer,3.95)&&near(rail(active).cooldownTimer,3.85),'Actual axial cooldown advances 1.5 times faster');
    const stock=mount.ammo;active.activateDefenseSystem();active.defenseSystem.update(.3);
    check(near(active.system.getDissipationMultiplier(),1)&&near(active.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1)&&mount.ammo===stock,'Exit restores rates without refilling magazines');
    active.activateDefenseSystem();active.defenseSystem.update(.3);active.flux.isVenting=true;
    check(near(active.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1),'Venting immediately removes bonus');
    active.defenseSystem.dispatchEvents(active,{ships:[active],asteroids:[],projectiles:[],combatRandom:new SimulationRandom(30),deployMine(){}},1/60);
    check(active.defenseSystem.state==='OUT','Venting exits suppress rather than rearming it after vent');
    active.flux.isVenting=false;active.defenseSystem.update(.3);active.activateDefenseSystem();active.defenseSystem.update(.3);active.flux.isOverloaded=true;
    active.defenseSystem.dispatchEvents(active,{ships:[active],asteroids:[],projectiles:[],combatRandom:new SimulationRandom(31),deployMine(){}},1/60);
    check(active.defenseSystem.state==='OUT'&&near(active.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1),'Overload exits suppress without leaving sticky buffs');
    const enemy=fresh();enemy.teamId=1;enemy.pos.set(250,0);enemy.visibilityMask=0xffffffff;
    const ai=fresh();ai.fireControlMode='AI';ai.currentTargetShip=enemy;
    const context={ship:ai,system:ai.defenseSystem,target:enemy,distance:250,angleDiff:0,world:{ships:[ai,enemy],projectiles:[],asteroids:[],beams:[]},tactical:{quietFor:1,withdrawing:false}};
    ai.flux.softFlux=ai.flux.maxFlux*.5;ai.defenseSystem.definition.advanceAI(context);check(ai.defenseSystem.state==='IDLE','AI does not start pressure above 45 percent heat');
    ai.flux.softFlux=0;ai.defenseSystem.definition.advanceAI(context);check(ai.defenseSystem.state==='IN','AI chooses low-heat pressure window');
    ai.defenseSystem.update(.3);ai.flux.softFlux=ai.flux.maxFlux*.75;ai.defenseSystem.definition.advanceAI(context);check(ai.defenseSystem.state==='OUT','AI drops pressure above 72 percent heat');
  }
  const comp=rocinanteHullMods.find(m=>m.id===ROCINANTE_MODS.compensator);
  for(const facing of [0,Math.PI/2,Math.PI]){
    const s=fresh();s.facingRad=rail(s).currentAngleRad=facing;s.vel.set(20,-10);check(fire(s),'Compensated shot accepted '+facing);
    check(near(s.flux.totalFlux,600),'Only accepted recoil charges extra flux '+facing);
    check(isRocinanteCompensating(s)&&!s.system.activate(),'Compensation excludes attitude burst '+facing);
    s.facingRad+=.8;comp.advance(s,.1,s.random);comp.advance(s,.15,s.random);
    check(near(s.vel.x,20-1.8*Math.cos(facing))&&near(s.vel.y,-10-1.8*Math.sin(facing)),'70% budget stays in original world direction '+facing);
    check(!isRocinanteCompensating(s),'Compensation budget consumed '+facing);
  }
  const low=fresh();low.flux.softFlux=low.flux.maxFlux-500;check(fire(low)&&!isRocinanteCompensating(low),'Rail fires when only compensation lacks flux');
  const busy=fresh();busy.system.activate();check(fire(busy)&&!isRocinanteCompensating(busy),'Attitude excludes new compensation');
  const broken=fresh();fire(broken);broken.flux.isOverloaded=true;const vx=broken.vel.x;comp.advance(broken,.25,broken.random);check(broken.vel.x===vx&&!isRocinanteCompensating(broken),'Interrupted compensation is discarded');
  const independent=fresh();check(!isRocinanteCompensating(independent),'No compensation leakage into another ship');
  const magazine=fresh(fits[1]);check(magazine.weapons.filter(m=>m.spec.id===W.pdc).every(m=>m.spec.maxAmmo===90&&m.spec.ammoRegenPerSec===6),'Magazine increases capacity, not regeneration');
  check(near(magazine.hullStats.accelerationMultiplier,.9),'Magazine acceleration trade-off');
  check(contentRegistry.getWeapon(W.pdc).maxAmmo===60&&fresh().weapons.filter(m=>m.spec.id===W.pdc).every(m=>m.spec.maxAmmo===60),'No shared-spec mutation or stacking');
  const jets=fresh();tick(jets,.02);check(jets.engineStatuses.slice(1).every(e=>e.currentThrust===0),'Reaction jets dark at rest');
  jets.turnInput=1;tick(jets,.02);check(jets.engineStatuses.slice(1).some(e=>e.currentThrust>0),'Accepted turn lights directional RCS');
  check(jets.spec.engineSlots.every((slot,i)=>!slot.maneuver||slot.maneuver[2]>=0||jets.engineStatuses[i].currentThrust===0),'Opposing yaw jets remain dark');
  jets.engineController.forceFlameout();tick(jets,.5);tick(jets,.1);check(jets.engineStatuses.slice(1).every(e=>e.currentThrust===0),'Flameout extinguishes RCS');
  check(near(jets.engineStatuses[0].contribution,1)&&jets.engineStatuses.slice(1).every(e=>e.contribution===0),'Auxiliary jets do not inflate drive health');
  const roster=simulationRoster().filter(s=>s.hullId===ROCINANTE_HULL_ID);check(roster.length>=3,'Default and both authored fits in actual simulation roster');
  for(const option of roster){const ready=prepareSimulationOption(option);check(!ready.errors.length,'Simulation roster compiles '+option.id);}
  // Real isolated registry install, with no other ship or weapon present.
  const isolated=new ContentRegistry(),weapons=Object.values(W).map(id=>contentRegistry.getWeapon(id));isolated.registerPack([hull],weapons,true);
  check(isolated.getAllShips().length===1&&isolated.getAllWeapons().length===4,'Single-ship data graph installs without other custom ships');
  // Head-to-head AI is a functional check, not a claim of final balance.
  const world=createLanWorld({id:'roci-complete-ai',seed:929,hostId:'p0',snapshotHz:60,
    players:[{id:'p0',seat:0,team:0,hull:ROCINANTE_HULL_ID,design:fits[0]},{id:'p1',seat:1,team:1,hull:ROCINANTE_HULL_ID,design:fits[1]}],
    options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}});
  const e=world.engine,{CapitalShipAI}=await import('/src/engine/ai/CapitalShipAI.ts');
  const playerAI=new CapitalShipAI(e.playerShip,e.enemyShip);e.playerShip.fireControlMode=e.enemyShip.fireControlMode='AI';
  e.playerShip.pos.set(-500,0);e.enemyShip.pos.set(500,0);e.playerShip.facingRad=0;e.enemyShip.facingRad=Math.PI;
  e.asteroids.length=0;const start=[e.playerShip.hullHp,e.enemyShip.hullHp],seen=new Set();let ticks=0;
  for(;ticks<3600&&!e.playerShip.isDead&&!e.enemyShip.isDead;ticks++){
    e.updateShipAI(playerAI,1/60);e.fixedUpdate(1/60);
    for(const p of e.projectiles)if(p.specId)seen.add(p.specId);
  }
  measurements.ai={seconds:ticks/60,start,finish:[e.playerShip.hullHp,e.enemyShip.hullHp],seen:[...seen],positions:e.ships.slice(0,2).map(s=>[s.pos.x,s.pos.y]),ammo:e.ships.slice(0,2).map(s=>s.weapons.map(w=>({slot:w.slotId,ammo:w.ammo}))) };
  check(e.playerShip.hullHp<start[0]||e.enemyShip.hullHp<start[1],'Natural AI exchange produces actual hull damage');
  check(e.ships.every(s=>Number.isFinite(s.pos.x+s.pos.y+s.vel.x+s.vel.y)),'No invalid motion during AI combat');
  // A real 100HP agile torpedo against the production six-PDC battery. No fake
  // removal, reduced missile HP or direct damage calls: shots and collision do it.
  const guard=fresh(fits[1]),attacker=new Ship('roci-interception-source',hull,false,new Vector2(650,0),Math.PI,new SimulationRandom(801));
  guard.teamId=0;attacker.teamId=1;guard.fireControlMode='MANUAL';
  for(const m of guard.weapons)if(m.spec.id!==W.pdc)m.isDisabled=true;
  const launcher=attacker.weapons.find(m=>m.slotId==='TORP_1');launcher.currentAngleRad=Math.PI;
  const missiles=[];attacker.weaponControl.fireWeapon(launcher,attacker,p=>missiles.push(p),()=>{});
  const incoming=missiles[0];incoming.targetShipId=guard.id;e.projectiles=[incoming];
  const guardHP=guard.hullHp;
  const ctx={...e.getWeaponSimContext(),playerShip:guard,enemyShip:attacker,ships:[guard,attacker],capitalShips:[guard,attacker],fighters:[],asteroids:[],hulkFragments:[],queryAsteroidImpact:undefined,commitAsteroidImpact:undefined};
  let interceptions=0;
  for(let i=0;i<360&&e.projectiles.includes(incoming);i++){
    guard.update(1/120,null,p=>{e.projectiles.push(p);interceptions++;},()=>{},undefined,{ships:[guard,attacker],missiles:e.projectiles.filter(p=>p.isRocket),asteroids:[]});
    e.weaponSystem.updateProjectiles(1/120,ctx);
  }
  measurements.interception={shots:interceptions,missileHp:incoming.hitpoints,remaining:e.projectiles.includes(incoming),hullDamage:guardHP-guard.hullHp};
  check(interceptions>0&&incoming.hitpoints<=0&&!e.projectiles.includes(incoming),'Production PDC actually destroys an incoming torpedo');
  check(near(guardHP,guard.hullHp),'Intercepted warhead causes no phantom hull damage');
  return {checks,measurements,scope:'Full registered ship; same-host isolated data install; production AI duel. Not multiplayer, old-host extension installation or final balance.'};
}
