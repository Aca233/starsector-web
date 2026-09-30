/** R3 production-rule checks only. No new hull, guessed installation or placeholder art is registered. */
export async function runRocinanteArmoryScenarios() {
  globalThis.__LAN_BUILD_ID__='roci-armory-rules';
  const {createLanWorld}=await import('/src/network/LanWorld.ts');
  const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
  const {createRocinanteWeaponRules,createRocinantePdcWeapon,ROCINANTE_WEAPONS}=await import('/src/engine/content/RocinanteArmory.ts');
  const {validateWeaponSpec}=await import('/src/engine/modding/ContentValidation.ts');
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');
  const {contentManifestManager}=await import('/src/engine/content/ContentManifest.ts');
  const {Ship}=await import('/src/engine/simulation/Ship.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const {SimulationRandom}=await import('/src/engine/simulation/SimulationRandom.ts');
  const {terrainPenetrationCost,spendTerrainPenetration}=await import('/src/engine/simulation/systems/weapon/TerrainPenetration.ts');
  await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
  const checks=[],measurements={};const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};const close=(a,b)=>Math.abs(a-b)<1e-7;
  const before=contentRegistry.getAllShips().map(s=>s.id).join('|');
  for(const kind of Object.keys(ROCINANTE_WEAPONS)){
    const spec=kind==='pdc'?createRocinantePdcWeapon():createRocinanteWeaponRules(kind);
    validateWeaponSpec(spec,false);if (!contentRegistry.getWeapon(spec.id)) contentRegistry.registerWeapon(spec,false);
  }
  const clone=createRocinanteWeaponRules('torpedo_agile');clone.missileLifecycleSpec.fadeTime=99;
  check(createRocinanteWeaponRules('torpedo_heavy').missileLifecycleSpec.fadeTime===.5,'Rule consumers cannot mutate other profiles');
  const engine=createLanWorld({id:'roci-r3',seed:928,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'web_zhuyuan'},{id:'p1',seat:1,team:1,hull:'web_zhuyuan'}],options:{assignment:'teams',battleSize:400,aiHulls:[[],[]]}}).engine;
  let seq=0;
  const fresh=kind=>{
    const weapon=contentRegistry.getWeapon(ROCINANTE_WEAPONS[kind]);
    const spec={...structuredClone(engine.playerShip.spec),id:'unregistered-roci-r3-rule-fixture',sourceHullId:undefined,sourceVariantId:undefined,
      systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',defenseSystemType:'NONE',shieldType:'NONE',voidShield:undefined,
      modules:undefined,modulePropulsion:undefined,builtInHullMods:[],hullMods:[],sMods:[],captainSkills:undefined,fluxDissipation:0,maxFlux:100000,
      fighterWings:[],engineSlots:[],systemWeaponSlots:[],decorativeWeapons:[],
      // Local origin is a rule fixture, never a proposed Rocinante rail/tube coordinate.
      weaponSlots:[{slotId:'rule-probe',mountType:kind==='pdc'?'TURRET':'HARDPOINT',slotSize:weapon.mountSize,weaponType:weapon.weaponType,x:0,y:0,baseAngleDeg:0,arcDeg:kind==='railgun'?6:360,builtIn:true,defaultWeaponId:weapon.id}],
      defaultWeaponGroups:[{index:0,weaponSlotIds:['rule-probe'],mode:'LINKED',isAutofire:false}]};
    const ship=new Ship('roci-r3-'+(++seq),spec,true,new Vector2(),0,new SimulationRandom(928+seq));
    ship.fireControlMode='MANUAL';ship.aimTargetWorld.set(2000,0);ship.flux.softFlux=0;ship.flux.hardFlux=0;ship.vel.set(0,0);
    return ship;
  };
  const fire=(s,shots=[])=>s.weaponControl.fireWeapon(s.weapons[0],s,p=>shots.push(p),()=>{});
  const tick=(s,dt,shots)=>s.weaponControl.update(dt,s,0,null,p=>shots.push(p),()=>{},undefined,{ships:[s],missiles:[],asteroids:[]});
  for(const facing of [0,Math.PI/4,Math.PI/2,Math.PI]){
    const s=fresh('railgun'),m=s.weapons[0],shots=[];s.facingRad=m.currentAngleRad=facing;s.vel.set(40,-20);
    const beforeVelocity=s.vel.clone(),beforePos=s.pos.clone();check(fire(s,shots),'Rail shot accepted at '+facing);
    check(close(s.vel.x,40-6*Math.cos(facing))&&close(s.vel.y,-20-6*Math.sin(facing)),'Physical recoil follows shot heading '+facing);
    check(s.pos.distanceTo(beforePos)===0,'Recoil never teleports hull '+facing);
    check(shots[0].sourceVelocity.distanceTo(beforeVelocity)<1e-8,'Projectile inherits PRE-recoil velocity '+facing);
    check(close(s.flux.totalFlux,480),'Rail charges exactly 480 flux '+facing);
    const velocity=shots[0].vel.clone(),position=shots[0].pos.clone();s.vel.set(99,88);s.facingRad+=.5;
    check(shots[0].vel.distanceTo(velocity)===0&&shots[0].pos.distanceTo(position)===0,'Old shot does not rotate/follow recoil owner '+facing);
  }
  for(const denial of ['flux','ammo','reload']){
    const s=fresh('railgun'),m=s.weapons[0],shots=[];s.vel.set(7,9);
    if(denial==='flux')s.flux.softFlux=s.flux.maxFlux-100;
    if(denial==='ammo')m.ammo=0;
    if(denial==='reload')m.reloadDelayRemaining=1;
    const beforeAmmo=m.ammo,beforeFlux=s.flux.totalFlux;
    check(!fire(s,shots)&&shots.length===0&&close(s.vel.x,7)&&close(s.vel.y,9)&&m.ammo===beforeAmmo&&s.flux.totalFlux===beforeFlux,'Rejected '+denial+' has no recoil/ammo/flux/spawn effects');
  }
  for(const disabled of ['overload','vent','weapon']){
    const s=fresh('railgun');s.isFiringMain=true;s.vel.set(7,9);
    if(disabled==='overload')s.flux.isOverloaded=true;
    if(disabled==='vent')s.flux.isVenting=true;
    if(disabled==='weapon')s.weapons[0].isDisabled=true;
    const shots=[];for(let i=0;i<30;i++)tick(s,1/60,shots);
    check(shots.length===0&&close(s.vel.x,7)&&close(s.vel.y,9),'Blocked '+disabled+' cannot charge/fire/recoil');
  }
  {
    const s=fresh('pdc');s.vel.set(7,9);check(fire(s)&&close(s.vel.x,7)&&close(s.vel.y,9),'Unopted PDC keeps original no-recoil motion');
    const m=s.weapons[0];m.ammo=0;s.isFiringMain=false;tick(s,1,[]);check(m.ammo===6,'PDC empty magazine replenishes six rounds in one second');
    tick(s,20,[]);check(m.ammo===60&&m.ammoRechargeProgress===0,'PDC magazine caps at 60 without stockpiling recharge credit');
  }
  for(const kind of ['pdc','railgun','torpedo_agile','torpedo_heavy']){
    const s=fresh(kind),times=[];s.isFiringMain=true;let now=0;
    for(let i=0;i<6000;i++){const shots=[];tick(s,1/600,shots);if(shots.length)times.push(now);now+=1/600;if(times.length>=3)break;}
    const expected=kind==='pdc'?1/15:kind==='railgun'?4.5:kind==='torpedo_agile'?2:3;
    check(times.length>=3,kind+' emits successive physical shots');
    const intervals=times.slice(1).map((t,i)=>t-times[i]);check(intervals.every(v=>Math.abs(v-expected)<=2/600+1e-7),kind+' full firing cycle matches declared cadence');
    measurements[kind]={shotTimes:times,intervals};
  }
  for(const kind of ['torpedo_agile','torpedo_heavy']){
    const s=fresh(kind),m=s.weapons[0],shots=[],amount=m.spec.maxAmmo;
    for(let i=0;i<amount;i++)check(fire(s,shots),kind+' consumes accepted round '+i);
    check(m.ammo===0&&!fire(s,shots)&&shots.length===amount,kind+' cannot emit a free extra torpedo');
    tick(s,60,[]);check(m.ammo===0,kind+' does not regenerate after 60s');
    const p=shots[0];check(close(p.vel.length(),m.spec.launchSpeed)&&p.armingTimeRemaining===.2,kind+' has actual low launch speed and arming period');
    check(p.hitpoints===m.spec.missileHp&&p.maxHitpoints===m.spec.missileHp,kind+' exposes finite interceptable hitpoints');
    // Real production guidance/movement/lifecycle, without a target or visual substitutes.
    engine.projectiles=[p];const ctx={...engine.getWeaponSimContext(),ships:[],capitalShips:[],fighters:[],hulkFragments:[],asteroids:[],queryAsteroidImpact:undefined,commitAsteroidImpact:undefined};
    let fizzleAt=null,fadeSeen=false,endedAt=null,pastNominal=false,safeThroughoutFizzle=true;
    for(let i=0;i<1200;i++){
      engine.weaponSystem.updateProjectiles(1/120,ctx);
      if(p.missileFizzleTime!==undefined){fizzleAt??=i/120;safeThroughoutFizzle &&= p.isDisarmed&&!p.isGuided&&p.collisionDisabled;}
      fadeSeen ||= (p.fadeProgress??0)>0&&(p.fadeProgress??0)<1;
      pastNominal ||= p.pos.distanceTo(p.missileRangeOrigin)>m.spec.range;
      if(!engine.projectiles.includes(p)){endedAt=i/120;break;}
    }
    check(safeThroughoutFizzle,kind+' exhausted torpedo stays disarmed and noncolliding');
    check(fizzleAt!==null&&fadeSeen&&endedAt!==null&&endedAt-fizzleAt>.8&&endedAt-fizzleAt<1.1,kind+' coasts/fades for bounded one-second retirement');
    check(pastNominal,kind+' does not vanish at the nominal range edge');
    check(engine.weaponSystem.explosions.active.length===0,kind+' expiration does not award a phantom area explosion');
    measurements[kind]={...measurements[kind],fizzleAt,endedAt,finalDistance:p.pos.distanceTo(p.missileRangeOrigin)};
  }
  {
    const s=fresh('railgun'),shots=[];fire(s,shots);const p=shots[0];
    check(terrainPenetrationCost(p,'asteroid',9,40)===150,'Rail small obstacle has minimum 150 cost');
    check(terrainPenetrationCost(p,'asteroid',11,40)===undefined,'Rail cannot ignore an oversized obstacle');
    check(terrainPenetrationCost(p,'asteroid',9,800)===undefined,'Rail cannot punch through an unaffordable surviving obstacle');
    spendTerrainPenetration(p,'asteroid:test',150);
    check(close(p.damage,550)&&close(p.baseDamage,550)&&close(p.unfadedDamage,550),'Penetration cost persists in current/base/unfaded budgets');
    engine.projectiles=[p];const ctx={...engine.getWeaponSimContext(),ships:[],capitalShips:[],fighters:[],hulkFragments:[],asteroids:[],queryAsteroidImpact:undefined,commitAsteroidImpact:undefined};
    let faded=false,retired=false,budgetPreserved=true;for(let i=0;i<150;i++){engine.weaponSystem.updateProjectiles(1/120,ctx);faded||=(p.fadeProgress??0)>0&&(p.fadeProgress??0)<1;budgetPreserved &&= p.damage<=550;if(!engine.projectiles.includes(p)){retired=true;break;}}
    check(budgetPreserved,'Rail cannot recover spent damage on next tick');
    check(faded&&retired,'Rail has a finite range-fade lifecycle, not edge deletion/infinite flight');
  }
  for(const patch of [{fireRecoilSpeed:-1},{fireRecoilSpeed:Infinity},{fireRecoilSpeed:101},{fireRecoilSpeed:6,isBeam:true}]){
    let rejected=false;try{validateWeaponSpec({...createRocinanteWeaponRules('railgun'),...patch},false);}catch{rejected=true;}
    check(rejected,'Invalid recoil rejected '+JSON.stringify(patch));
  }
  check(contentRegistry.getAllShips().map(s=>s.id).join('|')===before,'No incomplete ship registered');
  return {checks,measurements,scope:'R3 authority weapons, real firing/missile simulation, explicit terrain budget checks. No rail/tube art, physical mount placement, natural combat, balance or installation-pack certification.'};
}
