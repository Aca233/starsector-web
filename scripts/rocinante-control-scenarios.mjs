/** No-visual production-rule fixtures; no hull/spec is registered in the player catalogue. */
export async function runRocinanteControlScenarios() {
  globalThis.__LAN_BUILD_ID__ = 'rocinante-control-check';
  const { createLanWorld } = await import('/src/network/LanWorld.ts');
  const { assetManager } = await import('/src/engine/assets/AssetResolver.ts');
  const { contentManifestManager } = await import('/src/engine/content/ContentManifest.ts');
  const { contentRegistry } = await import('/src/engine/content/ContentRegistry.ts');
  const { validateShipSpec } = await import('/src/engine/modding/ContentValidation.ts');
  const { Ship } = await import('/src/engine/simulation/Ship.ts');
  const { Vector2 } = await import('/src/engine/math/Vector2.ts');
  const { SimulationRandom } = await import('/src/engine/simulation/SimulationRandom.ts');
  const { AutofireController } = await import('/src/engine/ai/AutofireController.ts');
  const { shipMotionStats } = await import('/src/engine/simulation/systems/ShipMotion.ts');
  const { CombatPresentationEncoder } = await import('/src/engine/runtime/local/CombatPresentationEncoder.ts');
  const { CombatPresentationDecoder } = await import('/src/engine/runtime/local/CombatPresentationDecoder.ts');
  const { ROCINANTE_ATTITUDE, ROCINANTE_FIRE_CONTROL } = await import('/src/engine/extensions/ship-systems/RocinanteSystems.ts');
  await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
  const engine = createLanWorld({ id: 'roci-rules', seed: 919, hostId: 'p0', snapshotHz: 60,
    players: [{ id: 'p0', seat: 0, team: 0, hull: 'web_zhuyuan' }, { id: 'p1', seat: 1, team: 1, hull: 'web_zhuyuan' }],
    options: { assignment: 'teams', battleSize: 400, aiHulls: [[], []] } }).engine;
  const catalogueBefore = contentRegistry.getAllShips().map(s => s.id).join('|');
  const base = structuredClone(engine.playerShip.spec), gun = contentRegistry.getWeapon('web_gloriana_bolter');
  const torpedo = contentRegistry.getWeapon('web_gloriana_torpedo');
  const slot = (id, role, overrides = {}) => ({ slotId: id, controlRole: role, mountType: role === 'AXIAL' ? 'HARDPOINT' : 'TURRET',
    slotSize: 'SMALL', weaponType: 'BALLISTIC', x: 0, y: 0, baseAngleDeg: 0, arcDeg: role === 'AXIAL' ? 10 : 360,
    builtIn: true, defaultWeaponId: gun.id, ...overrides });
  const spec = { ...base, id: 'unregistered-roci-rule-probe', sourceHullId: undefined, sourceVariantId: undefined,
    hullSize: 'FRIGATE', bounds: [[-20,-15],[20,-15],[20,15],[-20,15]], collisionRadius: 25,
    systemType: ROCINANTE_ATTITUDE, systemTypes: [ROCINANTE_ATTITUDE], rightClickSystemType: ROCINANTE_FIRE_CONTROL,
    defenseSystemType: 'NONE', shieldType: 'NONE', voidShield: undefined, modules: undefined, modulePropulsion: undefined,
    builtInHullMods: [], hullMods: [], sMods: [], captainSkills: undefined, maxSpeed: 200, acceleration: 100,
    deceleration: 120, maxTurnRateDeg: 60, turnAccelerationDeg: 90, fluxDissipation: 0, maxFlux: 5000,
    fighterBays: 0, fighterWings: [], engineSlots: [], systemWeaponSlots: [], decorativeWeapons: [],
    weaponSlots: [slot('pdc','POINT_DEFENSE'),slot('axis','AXIAL'),slot('unmanaged',undefined),
      slot('torpedo',undefined,{mountType:'HARDPOINT',slotSize:torpedo.mountSize,weaponType:'MISSILE',defaultWeaponId:torpedo.id})],
    defaultWeaponGroups: [ { index: 0, weaponSlotIds: ['axis'], mode: 'LINKED', isAutofire: false },
      { index: 1, weaponSlotIds: ['pdc'], mode: 'LINKED', isAutofire: true },
      { index: 2, weaponSlotIds: ['unmanaged'], mode: 'LINKED', isAutofire: true },
      { index: 3, weaponSlotIds: ['torpedo'], mode: 'LINKED', isAutofire: false } ] };
  validateShipSpec(spec, {allowExistingId: true, requireBundledAssets: false});
  let seq = 0; const checks = [];
  const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name); };
  const close = (a,b,tolerance=1e-7) => Math.abs(a-b)<tolerance;
  const fresh = (team=0, extra={}) => {
    const s = new Ship(`roci-check-${++seq}`, {...spec,...extra}, team===0, new Vector2(), 0, new SimulationRandom(seq));
    s.visibilityMask=0xffffffff; s.fireControlMode='MANUAL'; s.flux.softFlux=0; s.flux.hardFlux=0;
    for (const m of s.weapons) if (m.spec.id===gun.id) m.spec={...m.spec,maxAmmo:120,ammoRegenPerSec:0,chargeTime:0};
    for (const m of s.weapons) {m.ammo=90;m.cooldownTimer=0;}
    return s;
  };
  const world = ships => ({ships,missiles:[],asteroids:[]});
  const tick = (s,dt,fw=world([s]),shots=[]) => s.update(dt,s.currentTargetShip,p=>shots.push(p),()=>{},undefined,fw);
  {
    const s=fresh(), before=shipMotionStats(s);s.vel.set(40,25);s.throttle=1;s.strafeInput=1;s.turnInput=1;
    check(s.system.activate(),'R1 activation accepted');check(!s.system.activate(),'R1 duplicate activation rejected');
    tick(s,.1);check(close(s.flux.totalFlux,150),'R1 costs exactly 150 soft flux');check(s.flux.hardFlux===0,'R1 no hard flux');
    check(s.system.state==='ACTIVE','R1 enters ACTIVE at .1s');
    const active=shipMotionStats(s);check(close(active.maxTurnRate/before.maxTurnRate,1.8)&&close(active.turnAcceleration/before.turnAcceleration,2.2),'R1 +80/+120 angular stats');
    check(close(s.vel.x,40)&&close(s.vel.y,25)&&s.facingRad>0,'R1 turns hull without rotating/translating velocity');
    const clock=s.system.activeTimer;s.system.update(0);check(s.system.activeTimer===clock,'R1 simulation pause preserves clock');
    s.system.update(1.2);check(s.system.state==='OUT'&&!s.system.blocksAcceleration&&s.system.getTurnRatePercentBonus()===0,'R1 releases thrust and bonuses on OUT');
    s.system.update(.2);check(s.system.state==='COOLDOWN'&&close(s.system.cooldownTimer,8),'R1 enters 8s cooldown');
    s.system.update(8);check(s.system.state==='IDLE','R1 natural lifecycle completes');
  }
  for(const interruption of ['brake','retreat','overload','vent','flameout','death']) {
    const s=fresh();s.vel.set(60,0);s.system.activate();tick(s,.11);
    if(interruption==='brake')s.brakeInput=true;
    if(interruption==='retreat'){s.retreating=true;s.throttle=-1;}
    if(interruption==='overload'){s.flux.isOverloaded=true;s.flux.overloadTimer=2;}
    if(interruption==='vent'){s.flux.isVenting=true;s.flux.softFlux=1000;}
    if(interruption==='flameout'){s.engineController.state='DISABLED';s.engineController.cooldown=2;}
    if(interruption==='death'){s.isDead=true;s.hullHp=0;}
    tick(s,.01);
    check(s.system.state==='OUT'||s.system.state==='COOLDOWN',`R1 ${interruption} cancels`);
    check(s.system.getTurnRatePercentBonus()===0&&!s.system.blocksAcceleration,`R1 ${interruption} releases controls`);
    if(interruption==='brake'||interruption==='retreat')check(s.vel.x<60,`R1 ${interruption} motion honored in same step`);
    if(!['vent','death'].includes(interruption))check(s.flux.totalFlux>=149,'R1 cancellation no refund: '+interruption);
  }
  {
    const s=fresh();s.brakeInput=true;check(!s.system.activate(),'R1 cannot start while braking');s.brakeInput=false;
    s.engineController.state='DISABLED';check(!s.system.activate(),'R1 cannot start with disabled engine');
  }
  const combatFixture=()=>{
    const s=fresh(), enemy=fresh(1,{systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',weaponSlots:[],defaultWeaponGroups:[]});
    enemy.pos.set(420,0);enemy.prevPos.copy(enemy.pos);s.currentTargetShip=enemy;s.aimTargetWorld.set(420,0);
    const p={id:41,sourceShipId:enemy.id,teamId:1,pos:new Vector2(130,110),vel:new Vector2(-100,-60),radius:6,hitpoints:50,flightTimeRemaining:3,isRocket:true,spawnType:'MISSILE',damage:100};
    return {s,enemy,p,fw:{ships:[s,enemy],missiles:[p],asteroids:[]},m:s.weapons[0]};
  };
  {
    const {s,enemy,p,fw,m}=combatFixture(), ai=new AutofireController(), other=fresh();
    const originalHints=JSON.stringify(gun), ammo=m.ammo;
    check(ai.aim(.02,s,m,fw)?.target.entity===p,'R2 escort prioritizes reachable missile');
    check(s.activateDefenseSystem(),'R2 right-click requests suppress');check(!s.activateDefenseSystem(),'R2 cannot spam-toggle during IN');
    check(ai.aim(.02,s,m,fw)===null&&m.fireControl.reason==='REASSIGNING','R2 suppress IN suspends autofire');
    check(!other.system.autofirePolicy(other.weapons[0]).suspended,'R2 another instance remains in escort');
    const timer=s.defenseSystem.activeTimer;s.defenseSystem.update(0);check(timer===s.defenseSystem.activeTimer,'R2 pause preserves reassignment clock');
    s.defenseSystem.update(.3);check(ai.aim(.01,s,m,fw)?.target.entity===enemy,'R2 suppress immediately selects chosen reachable hull');
    enemy.pos.set(5000,0);check(ai.aim(.3,s,m,fw)?.target.entity===p,'R2 out-of-range hull falls back to escort');enemy.pos.set(420,0);
    m.arcDeg=60;enemy.pos.set(0,420);p.pos.set(180,0);check(ai.aim(.3,s,m,fw)?.target.entity===p,'R2 out-of-arc hull falls back to escort');m.arcDeg=360;
    enemy.pos.set(420,0);p.pos.set(100,180);fw.asteroids=[{pos:new Vector2(220,0),radius:42,hp:100,vel:new Vector2()}];
    check(ai.aim(.3,s,m,fw)?.target.entity===p,'R2 blocked chosen hull falls back to a clear missile');
    check(s.activateDefenseSystem(),'R2 right-click requests escort');check(ai.aim(.01,s,m,fw)===null,'R2 OUT also suspends autofire');
    s.defenseSystem.update(.3);check(s.defenseSystem.state==='IDLE'&&ai.aim(.3,s,m,fw)?.target.entity===p,'R2 returns to escort after .3s');
    check(m.ammo===ammo&&JSON.stringify(gun)===originalHints,'R2 policy does not mutate ammo or global WeaponSpec');
    check(!s.system.autofirePolicy(s.weapons[1])&&!s.system.autofirePolicy(s.weapons[2])&&!s.system.autofirePolicy(s.weapons[3]),'R2 excludes axis, untagged guns and torpedoes');
    s.defenseSystem.activate();s.defenseSystem.update(.3);s.defenseSystem.reset();check(s.defenseSystem.state==='IDLE'&&s.system.autofirePolicy(m).priority==='ESCORT','R2 reset defaults to escort');
  }
  {
    const {s,fw,m}=combatFixture();fw.missiles=[];const fighter=fresh(1,{hullSize:'FIGHTER',systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',weaponSlots:[],defaultWeaponGroups:[]});
    fighter.pos.set(160,150);fw.ships.push(fighter);check(new AutofireController().aim(.02,s,m,fw)?.target.entity===fighter,'R2 escort fighters outrank selected capital hull');
    fighter.teamId=0;check(new AutofireController().aim(.02,s,m,fw)?.target.entity===s.currentTargetShip,'R2 never targets friendly fighter');
  }
  {
    const {s,fw,m}=combatFixture(),shots=[];m.cooldownTimer=.5;m.burstRemaining=3;m.burstTimer=.02;m.burstFluxReserved=true;
    s.defenseSystem.activate();s.weaponControl.update(.1,s,0,s.currentTargetShip,p=>shots.push(p),()=>{},undefined,fw);
    check(!shots.some(p=>p.slotId==='pdc')&&m.burstRemaining===3&&close(m.burstTimer,.02),'R2 holds queued burst without an extra round');
    check(close(m.cooldownTimer,.4)&&m.ammo===90,'R2 cooldown advances normally, no ammo grant');
    s.selectedGroupIndex=1;s.isFiringMain=true;m.cooldownTimer=0;m.burstRemaining=0;m.burstFluxReserved=false;
    for(let i=0;i<8;i++)s.weaponControl.update(.02,s,0,s.currentTargetShip,p=>shots.push(p),()=>{},undefined,fw);
    check(shots.some(p=>p.slotId==='pdc')&&m.ammo<90,'R2 manually selected PDC still fires during reassignment');
    const spent=m.ammo;s.isFiringMain=false;for(let i=0;i<30;i++)s.weaponControl.update(.02,s,0,s.currentTargetShip,p=>shots.push(p),()=>{},undefined,fw);
    check(m.ammo>=spent-5,'R2 manual release does not create endless firing');
  }
  {
    const {s,enemy,fw,m}=combatFixture(),shots=[];s.selectedGroupIndex=0;s.isFiringMain=true;
    s.defenseSystem.activate();for(let i=0;i<5;i++)s.weaponControl.update(.02,s,0,enemy,p=>shots.push(p),()=>{},undefined,fw);
    check(shots.some(p=>p.slotId==='axis')&&!shots.some(p=>p.slotId==='pdc'),'R2 axis fires during automatic PDC reassignment');
    s.defenseSystem.update(.3);s.currentTargetShip=null;check(new AutofireController().aim(.3,s,m,fw)?.target.entity===fw.missiles[0],'R2 lost selected target falls back to escort');
    m.ammo=0;s.fireControlMode='AI';for(let i=0;i<4;i++)s.weaponControl.update(.05,s,0,enemy,p=>shots.push(p),()=>{},undefined,fw);
    check(!shots.some(p=>p.slotId==='pdc'),'R2 empty magazine cannot fire');
  }
  {
    const {s,fw,m}=combatFixture(),shots=[];s.defenseSystem.activate();m.burstRemaining=3;m.burstTimer=.02;m.burstFluxReserved=true;
    s.flux.isOverloaded=true;s.weaponControl.update(.05,s,0,s.currentTargetShip,p=>shots.push(p),()=>{},undefined,fw);
    check(m.burstRemaining===0&&!m.burstFluxReserved&&!shots.some(p=>p.slotId==='pdc'),'R2 overload cancels held burst rather than saving it for later');
  }
  const tactical = {allowOffensiveManeuver:true,desiredRange:500,withdrawing:false,waypoint:false,avoidingCollision:false,forwardClear:true,quietFor:1,
    threat:{threats:[],horizon:2,imminentDamage:0,actualDamage:0,imminentShieldFlux:0,earliest:Infinity,facing:null}};
  {
    const {s,enemy,fw}=combatFixture();s.fireControlMode='AI';enemy.pos.set(400,400);s.vel.set(50,0);
    const ctx={ship:s,system:s.system,target:enemy,distance:566,angleDiff:Math.PI/4,tactical,world:{ships:fw.ships,projectiles:[],beams:[],asteroids:[]}};
    s.system.definition.advanceAI(ctx);check(s.system.state==='IN','R1 AI opens a ready axial firing window');s.system.reset();
    ctx.world.asteroids=[{pos:new Vector2(60,0),radius:15,hp:100}];s.system.definition.advanceAI(ctx);check(s.system.state==='IDLE','R1 AI rejects a collision on inertial drift');
    ctx.world.asteroids=[];ctx.tactical={...tactical,withdrawing:true};s.system.definition.advanceAI(ctx);check(s.system.state==='IDLE','R1 AI rejects withdrawal');
    ctx.tactical=tactical;s.weapons[1].ammo=0;s.system.definition.advanceAI(ctx);check(s.system.state==='IDLE','R1 AI rejects empty axial weapon');
  }
  {
    const {s,enemy,fw}=combatFixture();s.fireControlMode='AI';const ctx={ship:s,system:s.defenseSystem,target:enemy,distance:420,angleDiff:0,tactical,
      world:{ships:fw.ships,projectiles:[],beams:[],asteroids:[]}};
    s.defenseSystem.definition.advanceAI(ctx);check(s.defenseSystem.state==='IN','R2 AI suppresses a clear hull window');s.defenseSystem.update(.3);
    ctx.world.projectiles=fw.missiles;s.defenseSystem.definition.advanceAI(ctx);check(s.defenseSystem.state==='OUT','R2 AI returns to escort for reachable incoming missile');
  }
  {
    const s=engine.addShip(spec,true,new Vector2(5000,5000),0,0);engine.playerShip=s;s.visibilityMask=0xffffffff;
    s.activateDefenseSystem();s.defenseSystem.update(.1);
    const packet=new CombatPresentationEncoder(919).capture(engine,1),decoded=new CombatPresentationDecoder(919).apply(packet);
    const hud=decoded.hud.read.playerShip;
    check(hud.defenseSystem.statusText.includes('护航 → 压制')&&hud.defenseSystem.statusText.includes('0.20s'),'Production display packet projects mode and reassignment remaining');
    check(s.system.hasNativeStats&&!s.system.hasExactThreatPhaseAI,'Rocinante projects audited stats without unsafe AI reuse');
  }
  for(const patch of [{controlRole:'UNKNOWN'},{controlRole:'POINT_DEFENSE',builtIn:false},{controlRole:'AXIAL',mountType:'TURRET'}]){
    let rejected=false;try{validateShipSpec({...spec,weaponSlots:[{...spec.weaponSlots[0],...patch}]},{allowExistingId:true,requireBundledAssets:false});}catch{rejected=true;}
    check(rejected,'Invalid control role contract rejected: '+JSON.stringify(patch));
  }
  check(contentRegistry.getAllShips().map(s=>s.id).join('|')===catalogueBefore,'No placeholder ship registered');
  return {checks,scope:'Production Ship/WeaponControl/Autofire plus presentation round-trip. No art or natural-battle certification.'};
}
