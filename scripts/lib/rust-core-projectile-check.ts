import {Ship} from '../../src/engine/simulation/Ship';
import {RustCombatCore,RustCoreCommandError} from '../../src/engine/runtime/rust/RustCombatCore';
import {RustFiringState,type RustBodyHandle,type RustFireSpec} from '../../src/engine/runtime/rust/RustCoreProtocol';
import {ShipWeaponControlSystem} from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import {WeaponSimulationSystem} from '../../src/engine/simulation/systems/WeaponSimulationSystem';
import {ShipSystem} from '../../src/engine/simulation/ShipSystem';
import {Shield} from '../../src/engine/simulation/Shield';
import {FluxTracker} from '../../src/engine/simulation/FluxTracker';
import {ArmorGrid} from '../../src/engine/simulation/ArmorGrid';
import {ShipDamageState} from '../../src/engine/simulation/ShipDamageState';
import {SimulationRandom} from '../../src/engine/simulation/SimulationRandom';
import {Vector2} from '../../src/engine/math/Vector2';
import {weaponHealthProfile,createWeaponHealthTracker} from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import type {WeaponMount,WeaponSpec,Projectile,Beam} from '../../src/engine/simulation/Weapon';
import type {ShipSpec} from '../../src/engine/content/ShipSpec';
import type {WeaponSimContext} from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
import {fireStage} from './rust-core-fire-query-oracle';
import type {StageView} from '../../src/engine/ai/batch/StageBridge';
import {InFlightFireBudget} from '../../src/engine/ai/InFlightFireBudget';
import {AutofireController,type FireControlWorld} from '../../src/engine/ai/AutofireController';
import type {WeaponControlStep,WeaponFirePlan} from '../../src/engine/simulation/systems/ShipWeaponControlSystem';

function insist(v:unknown,label:string):asserts v{if(!v)throw Error(label);}
type Methods={requestWeaponFire(m:WeaponMount,s:Ship,p:(p:Projectile)=>void,b:(b:Beam)=>void):boolean;
  advanceWeaponLifecycle(dt:number,m:WeaponMount,s:Ship,can:boolean,p:(p:Projectile)=>void,b:(b:Beam)=>void):void;
  programFluxBudget(s:Ship,m:WeaponMount,dt:number):boolean;};
type NumericMethods=Methods&{planNumericFire(state:WeaponControlStep,world:FireControlWorld,v:StageView):WeaponFirePlan;autofire:AutofireController};
const reasons=['FIRE','NO_TARGET','ALIGNING','FRIENDLY_BLOCKED','OBSTACLE_BLOCKED','CONSERVING_AMMO','FLUX_BUDGET','UNAVAILABLE','DEFENSIVE_HOLD','REASSIGNING'];
function salt(text:string){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export async function runProjectileCore(wasm:BufferSource,queries=false,missiles=false,flares=false,effects=false){
  let strictFields=0,geometryFields=0,spawns=0,contacts=0,maxGeometryDifference=0;
  const geometryLog:{label:string;actual:number;expected:number;difference:number}[]=[];
  function compare(a:number,b:number,label:string,geometry=false){
    if(!geometry){strictFields++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);return;}
    geometryFields++;if(Object.is(a,b))return;const difference=Math.abs(a-b),limit=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)));
    insist(Number.isFinite(a)&&Number.isFinite(b)&&difference<=limit,`${label}: geometry ${a} differs from ${b}`);maxGeometryDifference=Math.max(maxGeometryDifference,difference);geometryLog.push({label,actual:a,expected:b,difference});
  }
  for(let scenario=0;scenario<12;scenario++){
    const core=await RustCombatCore.create(wasm,1917),random=new SimulationRandom(1917),visual=new SimulationRandom((1917^0x9e3779b9)>>>0),simulation=new WeaponSimulationSystem();
    const beam=!missiles&&scenario>=8,spawnType=missiles?'MISSILE':(['ORDINARY','BALLISTIC','BALLISTIC_AS_BEAM','PLASMA'] as const)[scenario%4];
    let serial=0;const serials=new Map<number,number>(),handles:RustBodyHandle[]=[],owners:Ship[]=[];
    const bounds: [number,number][]=[[-35,-35],[35,-35],[35,35],[-35,35]];
    for(let i=0;i<2;i++){
      const id=i+1,motion=new Float64Array(22);motion[0]=i===0?0:170;motion[4]=i===0?0:Math.PI;
      core.apply([{kind:'spawn',id,motion}]);const handle=core.snapshot().bodies[i].handle;handles.push(handle);
      const owner=Object.create(Ship.prototype) as Ship,flux=new FluxTracker(10000,0,'FRIGATE'),shield=new Shield(i===1&&scenario%3!==0?'FRONT':'NONE',360,65,1,0);
      const armor=new ArmorGrid(9,7,10,10,27),scars=new ShipDamageState(armor,visual);
      const spec={id:'resident-'+i,hullSize:'FRIGATE',collisionRadius:50,bounds,engineSlots:[],weaponSlots:[],hullMods:[],builtInHullMods:[],shieldCenterX:0,shieldCenterY:0} as unknown as ShipSpec;
      Object.assign(owner,{id:String(id),spec,flux,shield,armor,damageDecals:scars,random,hullHp:10000,hullDamageSuppressed:false,hullDamageInterceptors:new Set(),
        hullStats:{hitpoints:10000,phaseTimeBonusMultiplier:1,fluxDissipation:0,systemUsesBonus:0,systemRegenMultiplier:1,systemCooldownMultiplier:1,systemFluxCostMultiplier:1,
          weaponMalfunctionChanceBonus:0,criticalMalfunctionChanceBonus:0,damageToFightersPercent:0,damageToFightersMultiplier:1,damageToFrigatesPercent:0,damageToDestroyersPercent:0,damageToCruisersPercent:0},
        runtimeModifiers:{empty:true,value:{}},parentShip:null,moduleMount:null,childModules:[],currentCR:.7,crMalfunctionRangeMultiplier:1,criticalMalfunctionChanceMultiplier:1,
        damageTakenModifiers:new Map(),statusEffects:new Map(),externalPhaseEffects:new Map(),isDead:false,isRetreated:false,isDocked:false,retreating:false,isPlayer:i===0,teamId:i,visibilityMask:3,
        pos:new Vector2(motion[0],0),prevPos:new Vector2(motion[0],0),vel:new Vector2(),facingRad:motion[4],angularVelRad:0,fireControlMode:'MANUAL',
        aimTargetWorld:new Vector2(i===0?170:0,0),combatWeaponRepairTimeMultiplier:1,canRepairModulesUnderFire:false,
        weaponDamageTakenMultiplier:1,engineDamageTakenMultiplier:1,damageToTargetWeaponsMultiplier:1,damageToTargetEnginesMultiplier:1,shieldPiercedMultiplier:1,ecmRangePenalty:0});
      Object.defineProperty(owner,'effectiveEmpDamageTakenMultiplier',{value:1});
      if(queries){Object.defineProperty(owner,'hasNativeThreatPhaseHooks',{value:true});Object.defineProperty(owner,'hasNativeFireBudgetPolicyInputs',{value:true});}
      const system=new ShipSystem('NONE',10000,owner);Object.assign(owner,{system,systems:[system],defenseSystem:system});Object.defineProperty(owner,'allSystems',{value:[system]});
      const control=new ShipWeaponControlSystem(random);control.init(spec,motion[4]);Object.assign(owner,{weaponControl:control});
      armor.onCellDamage=(c,r,d)=>scars.onCellDamage(c,r,d);
      if(shield.type!=='NONE')shield.setActive(true);
      core.apply([{kind:'initialize-ship',id,handle,config:{maxFlux:10000,baseDissipation:0,hullSize:1}},
        {kind:'initialize-shield',id,handle,config:{type:shield.type,maxArc:360,radius:65,efficiency:1,upkeepRate:0,initialActive:shield.isActive}},
        {kind:'shield-input',id,handle,aimX:i===0?170:0,aimY:0},
        {kind:'initialize-armor',id,handle,config:{cols:9,rows:7,cellWidth:10,cellHeight:10,armorRating:27,maxHull:10000}},
        {kind:'initialize-combat',id,handle,geometry:{team:i,hullSize:'FRIGATE',radius:50,bounds:scenario===5?[]:bounds,player:i===0}}]);
      if(scenario===5)spec.bounds=[];
      owners.push(owner);
    }
    const source=owners[0],control=source.weaponControl,methods=control as unknown as Methods;
    const spec={id:'conventional-'+scenario,weaponType:'BALLISTIC',mountSize:'SMALL',isBeam:beam,beamVisualMode:scenario===9?'BURST':'SUSTAINED',
      refireDelay:.32,chargeTime:scenario%2?.07:0,burstDelay:.04,burstSize:scenario%3===1?3:1,interruptibleBurst:scenario%2===1,
      fluxPerShot:17,fluxPerSecond:beam?31:0,beamSourceChargeupTime:.13,beamSourceChargedownTime:.11,beamDuration:.3,beamBurstDelay:.4,
      beamFireOnlyOnFullCharge:scenario===10,maxAmmo:100,ammoRegenPerSec:1,minSpread:0,maxSpread:0,spreadPerShot:0,spreadDecay:5,
      type:'ENERGY',turnRateDegPerSec:120,damagePerShot:70,damagePerSecond:200,empPerShot:3,empPerSecond:5,projSpeed:600,range:scenario===4?160:500,projRadius:1,
      spawnType:spawnType==='ORDINARY'?undefined:spawnType,projLength:40,fadeTime:.2,color:[255,100,50],beamSpeed:1400} as WeaponSpec;
    const missile=missiles?{isRocket:true,isGuided:!flares&&scenario!==0,engineAcceleration:220,maxSpeed:360,maxTurnRate:1.7,
      maxTurnAcceleration:scenario%3?2.1:undefined,missileGuidanceBonus:.6,eccmChanceBonus:.3,missileHp:100,launchSpeed:120,
      flightTime:scenario===1?.05:3.2,angularVelocityRad:0,
      missileLifecycleSpec:{dudProbabilityOnFlameout:scenario===1?1:0,flameoutTime:.27,fadeTime:.13,fizzleOnReachingWeaponRange:scenario===4,
        noCollisionWhileFading:false,reduceDamageWhileFading:true,collisionClassAfterFlameout:'PROJECTILE_FF' as const},
      ...(scenario>=6&&!flares?{mirv:{splitRange:110,splitRangeRange:30,minTimeToSplit:.01,canSplitEarly:true,numShots:scenario%2?3:4,damage:23,emp:2,
        damageType:'ENERGY' as const,childHitpoints:5,evenSpread:scenario%2===0,arcDeg:10,spreadInaccuracyDeg:2,spreadSpeed:100,spreadSpeedRange:40,
        projectileRange:400,projectileSpec:'test-child',childProjectile:{spawnType:'BALLISTIC' as const,projRadius:1.75,projLength:30,fadeTime:.2}}}:{}),
      weaponType:'MISSILE' as const,projSpeed:120}:undefined;
    if(missile)Object.assign(spec,missile);
    const flare=flares?{mode:(['STANDARD','SEEKER','JAMMER'] as const)[scenario%3],effectRange:500,effectChance:.8,flameoutTime:.5,fadeTime:.25,life:.8}:undefined;
    if(flares){spec.missileLifecycleSpec=undefined;spec.flightTime=undefined;}
    const effect=effects?(scenario<4?(['Sabot','Mote','HyperionYamato','GlorianaSiege'] as const)[scenario]:scenario>=8?(scenario%2?'Graviton':'Tachyon'):undefined):undefined;
    const effectIds={Sabot:'com.fs.starfarer.api.impl.combat.SabotOnHitEffect',Mote:'com.fs.starfarer.api.impl.combat.MoteOnHitEffect',
      HyperionYamato:'web_sc2_hyperion_yamato_impact',GlorianaSiege:'web_gloriana_siege_impact',Tachyon:'com.fs.starfarer.api.impl.combat.TachyonLanceEffect',Graviton:'com.fs.starfarer.api.impl.combat.GravitonBeamEffect'};
    if(effect){if(beam)spec.beamEffect=effectIds[effect];else spec.onHitEffect=effectIds[effect];}
    const profile=weaponHealthProfile('SMALL','TURRET');
    const mount={slotId:'1',spec,mountType:'TURRET',relativePos:new Vector2(),baseAngleRad:0,baseAngleDeg:0,arcDeg:360,currentAngleRad:0,
      cooldownTimer:0,ammo:100,ammoRechargeProgress:0,burstRemaining:0,burstTimer:0,burstFluxReserved:false,firingState:'IDLE',firingStateTimer:0,
      triggerHeld:false,firingCycleId:0,reloadDelayRemaining:0,recoil:0,glowAlpha:0,barrelIndex:0,currentSpreadDeg:0,
      health:profile.health,maxHealth:profile.health,isDisabled:false,isPermanentlyDisabled:false,disabledDuration:0,disabledTimer:0,
      healthTracker:createWeaponHealthTracker(profile.repairDuration,random),fireControl:{},cycleTargetShipId:undefined,cycleTargetProjectileId:undefined} as unknown as WeaponMount;
    control.weapons.push(mount);
    const delivery:RustFireSpec['delivery']={spawnType,length:40,fadeTime:.2,damageType:'ENERGY',weaponType:missiles?'MISSILE':'BALLISTIC',radius:1,beamSpeed:1400,
      ...(missile?{sourceMissile:!flares,flameoutTime:.27,missileFadeTime:.13,reduceDamageWhileFading:true,fizzleAtRange:scenario===4&&!flares,
        guidance:{rocket:true,guided:missile.isGuided,hitpoints:100,acceleration:220,maxSpeed:360,maxTurnRate:1.7,maxTurnAcceleration:missile.maxTurnAcceleration,
          guidanceBonus:.6,eccmChance:.3,...(flare?{flare}:{}),...(missile.mirv?{mirv:{splitRange:110,splitRangeRange:30,minTime:.01,canSplitEarly:true,
            shots:missile.mirv.numShots,damage:23,emp:2,damageType:'ENERGY' as const,childHitpoints:5,evenSpread:missile.mirv.evenSpread,arcDeg:10,inaccuracyDeg:2,
            spreadSpeed:100,spreadSpeedRange:40,projectileRange:400,childSpec:1,childRadius:1.75,childSpawnType:'BALLISTIC' as const,
            childDelivery:{spawnType:'BALLISTIC' as const,length:30,fadeTime:.2,damageType:'ENERGY' as const,weaponType:'MISSILE' as const,radius:1.75}}}: {})}}:{})};
    const fire:RustFireSpec={burstSize:spec.burstSize,interruptible:spec.interruptibleBurst,fluxPerShot:17,fluxPerSecond:beam?31:0,
      beamChargeup:.13,beamChargedown:.11,beamDuration:.3,beamFireOnlyFull:scenario===10,sustained:scenario!==9,
      damagePerShot:70,damagePerSecond:200,empPerShot:3,empPerSecond:5,range:spec.range,speed:missiles?120:600,delivery,
      ...(missile?{rocket:true,launchSpeed:120,flightTime:flares?undefined:missile.flightTime,dudProbability:scenario===1?1:0}:{})};
    if(effect)Object.assign(delivery,{effect,beamWidth:12});
    core.apply([{kind:'install-weapon-health',id:1,handle:handles[0],config:{componentId:1,size:'SMALL',mount:'TURRET'}},
      {kind:'initialize-weapons',id:1,handle:handles[0],facing:0,mounts:[{componentId:1,type:missiles?'MISSILE':'BALLISTIC',beam,burstBeam:scenario===9&&!missiles,
        refireDelay:.32,chargeTime:spec.chargeTime,burstDelay:.04,beamBurstDelay:.4,maxAmmo:100,ammoRegen:1}],groups:[]},
      {kind:'initialize-fire',id:1,handle:handles[0],mounts:[fire]}]);
    if(queries){
      source.fireControlMode='AI';
      owners.forEach((o,i)=>core.apply([{kind:'initialize-fire-query',id:i+1,handle:handles[i],ship:{visibility:[{team:0,visible:true},{team:1,visible:true}],
        scope:handles.map((h,r)=>({id:r+1,handle:h})),player:o.isPlayer,finish:1,pressure:1,tieRank:i,adaptiveBudget:true},
        mounts:i===0?[{flags:beam?8:0,hints:0,baseAngleDeg:0,arcDeg:360,turnRateDeg:120,sizeScale:.25,schedulingSalt:salt('1/1')}]:[]}]));
      core.apply([{kind:'fire-controls',id:1,handle:handles[0],aim:[170,0],trigger:false,ai:true}]);
    }
    // Render callbacks are excluded from this rule-domain differential; all actual
    // lifecycle, collision, armor and component methods above remain the oracle.
    const fx=new Proxy({explosions:[]}, {get:(target,key)=>key==='explosions'?target.explosions:()=>{}}) as unknown as WeaponSimContext['fx'];
    const ctx={playerShip:owners[0],enemyShip:owners[1],fighters:[],ships:owners,hulkFragments:[],fx,random,visualRandom:visual,
      addRadioMessage:()=>{},addCameraShake:()=>{},handleShipDestruction:()=>{throw Error('Fixture unexpectedly destroyed a ship');}} satisfies WeaponSimContext;
    const onProjectile=(p:Projectile)=>{if(flare){p.isFlare=true;p.flareLife=flare.life;p.flareMaxLife=flare.life;p.flareBehavior={...flare,noEngineGlowTime:0};}
      serials.set(p.id,++serial);simulation.projectiles.push(p);spawns++;};
    const onBeam=(b:Beam)=>{serials.set(b.id,++serial);simulation.beams.push(b);spawns++;};
    try{
      for(let tick=0;tick<150;tick++){
        const dt=1/60,trigger=tick%45<32,request=trigger&&tick<120;
        if(!queries)core.apply([{kind:'fire-intent',id:1,handle:handles[0],index:0,requested:request,triggerHeld:trigger,angle:0,
          ...(missiles?{target:{id:2,handle:handles[1]}}:{})}]);
        if(missiles)mount.fireControlTargetShipId='2';
        for(const owner of owners){for(const [key,effect]of owner.statusEffects)if(!effect.advance(owner,dt))owner.statusEffects.delete(key);
          owner.shield.sinceLastDamageTaken+=dt;owner.flux.update(dt,owner.shield.isActive,true);
          owner.shield.update(dt,owner.facingRad,owner.facingRad);}
        const state=control.advanceState(dt,source);
        if(queries){const numeric=control as unknown as NumericMethods,view=fireStage(owners,simulation.projectiles,handles,serials);
          const world:FireControlWorld={ships:owners,missiles:[],asteroids:[],projectiles:simulation.projectiles,fireBudget:new InFlightFireBudget(owners,simulation.projectiles)};
          const plan=numeric.planNumericFire(state,world,view);view.close();control.commitFire(plan,onProjectile,onBeam);
        }else{mount.triggerHeld=trigger;const admitted=request&&methods.programFluxBudget(source,mount,dt);
          if(admitted&&state.canShipFire)methods.requestWeaponFire(mount,source,onProjectile,onBeam);
          methods.advanceWeaponLifecycle(mount.lifecycleDt??dt,mount,source,state.canShipFire,onProjectile,onBeam);
        }
        for(const o of owners)o.damageDecals.advance(dt,o.hullHp/o.maxHullHp);
        simulation.updateProjectiles(dt,ctx);simulation.updateBeams(dt,ctx);core.step(dt);
        if(missiles){for(const p of simulation.projectiles)if(!serials.has(p.id)){serials.set(p.id,++serial);spawns++;}}
        const snap=core.snapshot(),label=`scene ${scenario} tick ${tick}`;
        compare(snap.lastOrdnanceSerial,serial,label+' serial');compare(snap.projectiles.length,simulation.projectiles.length,label+' projectile count');compare(snap.beams.length,simulation.beams.length,label+' beam count');
        random.checkpointWitness().forEach((n,i)=>compare(snap.random[i],n,label+' RNG '+i));visual.checkpointWitness().forEach((n,i)=>compare(snap.visualRandom[i],n,label+' visual RNG '+i));
        owners.forEach((owner,i)=>{const s=snap.bodies[i].ship!;compare(s.armor!.values[14],owner.hullHp,label+' hp '+i);
          compare(s.flux[8],owner.flux.softFlux,label+' soft '+i);compare(s.flux[9],owner.flux.hardFlux,label+' hard '+i);
          compare(s.armor!.values[12],owner.armor.dirtyVersion,label+' armor revision '+i);owner.armor.copyCells().forEach((v,j)=>compare(s.armor!.cells[j],v,label+' cell '+i+'/'+j));
          if(effects){const listener=owner.statusEffects.get('graviton') as unknown as {recentHits:Map<WeaponMount,number>}|undefined;
            compare(s.graviton?.hits.length??0,(listener?.recentHits.size??0)*5,label+' graviton size '+i);
            if(s.graviton){compare(s.graviton.multiplier,owner.shield.damageTakenModifiers.get('graviton')??1,label+' graviton mult '+i);
              [...listener!.recentHits.values()].forEach((v,j)=>compare(s.graviton!.hits[j*5+4],v,label+' graviton expiry '+j));}}
        });
        const m=snap.bodies[0].ship!.weapons!.mounts[0];
        const fields=[mount.cooldownTimer,mount.ammo,mount.ammoRechargeProgress,mount.lifecycleDt??0,mount.burstRemaining,mount.burstTimer,Number(mount.burstFluxReserved),
          RustFiringState[mount.firingState],mount.firingStateTimer,Number(mount.triggerHeld),mount.firingCycleId,mount.reloadDelayRemaining??0,mount.recoil,mount.glowAlpha,mount.barrelIndex,mount.currentSpreadDeg];
        fields.forEach((v,j)=>compare(m[16+j],v,label+' tracker '+j));
        if(queries){const mem=(control as unknown as NumericMethods).autofire.fireProgramMemory(source,mount),a=snap.bodies[0].ship!.fireMemories[0];
          const target=mem.target?.kind==='SHIP'?owners.indexOf(mem.target.entity):-1;
          [1,target>=0?1:0,target>=0?handles[target].slot:0,target>=0?handles[target].generation:0,
            mem.scanIn,mem.firingTime,mem.idleFireTime,Number(mem.ammoAllowed),...mem.random.checkpointWitness(),mount.aimIdleSeconds??15.1,reasons.indexOf(mount.fireControl!.reason)]
            .forEach((v,j)=>compare(a[j+1],v,label+' fire memory '+j));
        }
        simulation.projectiles.forEach((p,i)=>{
          const a=snap.projectiles[i],strict:[[number,number],...Array<[number,number]>]=[[0,serials.get(p.id)!],[1,p.id],[19,p.damage],[20,p.empDamage??0],[21,p.baseDamage!],[22,p.rangeRemaining],[23,p.totalRange],
            [24,p.elapsedTime],[25,p.sourceMoveSpeed??(missiles?120:600)],[34,p.fadeProgress??0],[35,p.prevFadeProgress??0],[36,p.unfadedDamage??p.baseDamage!],[37,p.unfadedEmp??p.empDamage??3],[38,Number(p.didDamage??false)],[39,Number(p.softFlux??false)]];
          strict.forEach(([k,v])=>compare(a[k],v,label+' projectile '+i+'/'+k));
          [p.pos.x,p.pos.y,p.prevPos.x,p.prevPos.y,p.vel.x,p.vel.y,p.facingRad??0].forEach((v,k)=>compare(a[12+k],v,label+' projectile pose '+i+'/'+k,true));
          if(p.ballisticTail){[p.ballisticTail.x,p.ballisticTail.y,p.prevBallisticTail!.x,p.prevBallisticTail!.y].forEach((v,k)=>compare(a[30+k],v,label+' tail '+i+'/'+k,true));}
          if(missiles){const g=snap.guidance.find(g=>g.values[0]===a[0])!.values;
            const target=p.targetShipId===undefined?undefined:handles[Number(p.targetShipId)-1];
            const fields:[number,number][]=[[1,p.turnVelocityRad??0],[2,Number(p.hitpoints!==undefined)],[3,p.hitpoints??0],[4,Number(!!p.stageTriggered)],
              [5,Number(p.mirvSplitDistance!==undefined)],[6,p.mirvSplitDistance??0],[7,Number(target!==undefined)],
              [8,target?.slot??0],[9,target?.generation??0],[10,Number(p.targetProjectileId!==undefined)],[11,p.targetProjectileId===undefined?0:serials.get(p.targetProjectileId)!],
              [26,p.sourceDamageMultiplier??1],[27,Number(!!p.isRocket)],[28,Number(p.isPlayer!==undefined)],[29,Number(!!p.isPlayer)]];
            fields.push([12,Number(!!p.isFlare)],[13,Number(!!p.flareFizzling)],[14,p.flareLife??0]);
            fields.forEach(([k,v])=>compare(g[k],v,label+' guidance '+i+'/'+k));
          }
        });
        simulation.beams.forEach((b,i)=>{const a=snap.beams[i];compare(a[0],serials.get(b.id)!,label+' beam serial');
          [b.elapsedTime,b.duration,b.damagePerSec,b.empPerSec??0,b.brightness??0,Number(b.damageActive!==false),Number(b.isHitting),Number(b.elapsedSinceDamage!==undefined),b.elapsedSinceDamage??0,
            b.accumulatedBrightness??0,b.dpsDuration??0,b.damageMultiplier??0].forEach((v,k)=>compare(a[16+k],v,label+' beam '+i+'/'+k));
          [b.startPos.x,b.startPos.y,b.endPos.x,b.endPos.y,b.rayEndPrevFrame!.x,b.rayEndPrevFrame!.y].forEach((v,k)=>compare(a[8+k],v,label+' beam pose '+i+'/'+k,true));
        });
        contacts+=snap.events.filter(e=>e.kind===39).length;core.acknowledgeEvents(snap.lastEventSequence);
        if(tick===70){const old=core.snapshot(),packet=[{kind:'fire-intent',id:1,handle:handles[0],index:0,requested:false,triggerHeld:false,angle:0},
          {kind:'fire-intent',id:1,handle:handles[0],index:0,requested:true,triggerHeld:true,angle:0,target:{id:2,handle:{slot:handles[1].slot,generation:handles[1].generation+1}}}] as const;
          try{core.apply(packet);throw Error('Stale target accepted');}catch(e){insist(e instanceof RustCoreCommandError&&e.code===4,'wrong rejection');}
          insist(JSON.stringify(core.snapshot())===JSON.stringify(old),'intent failure partially committed');
          const owned=core.snapshot();if(owned.projectiles[0])owned.projectiles[0].fill(99);insist(JSON.stringify(core.snapshot())===JSON.stringify(old),'projection mutated authority');
        }
      }
    }finally{core.dispose();}
  }
  return {passed:true,scenarios:12,steps:1800,strictFields,geometryFields,maxGeometryDifference,geometryLog,spawns,contacts,
    fullBattleReady:false,productionIntegrated:false,scope:effects?'resident-real-fire-special-hit-beam-effects':flares?'resident-real-flare-drift-fizzle-memory':missiles?'resident-real-fire-guidance-mirv-contact':queries?'resident-post-motion-fire-query-real-emission-contact':'resident-real-fire-projectile-beam-conventional-contact-rules'};
}
export const checkRustCore=(wasm:BufferSource)=>runProjectileCore(wasm);
