import {Ship} from '../../src/engine/simulation/Ship';
import {RustCombatCore,RustCoreCommandError} from '../../src/engine/runtime/rust/RustCombatCore';
import {RustShipFlag as F,type RustBodyHandle,type RustEngineMotionStats} from '../../src/engine/runtime/rust/RustCoreProtocol';
import {SimulationRandom} from '../../src/engine/simulation/SimulationRandom';
import {FluxTracker} from '../../src/engine/simulation/FluxTracker';
import {Shield} from '../../src/engine/simulation/Shield';
import {ArmorGrid} from '../../src/engine/simulation/ArmorGrid';
import {ShipDamageState} from '../../src/engine/simulation/ShipDamageState';
import {ShipSystem} from '../../src/engine/simulation/ShipSystem';
import {EngineController} from '../../src/engine/simulation/systems/EngineController';
import {ShipWeaponControlSystem} from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import {RuntimeCombatModifiers} from '../../src/engine/extensions/RuntimeCombatModifiers';
import {Vector2} from '../../src/engine/math/Vector2';
import {weaponHealthProfile,createWeaponHealthTracker} from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import type {ShipSpec} from '../../src/engine/content/ShipSpec';
import type {WeaponMount,WeaponSpec} from '../../src/engine/simulation/Weapon';
import type {ComponentMalfunctionTarget} from '../../src/engine/simulation/systems/ComponentMalfunctions';

interface CRPrivate{crShieldMalfunctionTimer:number;crShieldMalfunctionInterval:number;crShieldMalfunctionIntervalElapsed:boolean}
const stats:RustEngineMotionStats={accelerationBase:25,accelerationPercent:0,accelerationMultiplier:1,decelerationBase:20,decelerationPercent:0,decelerationMultiplier:1,
  speedBase:120,speedPercent:0,speedMultiplier:1,turnAccelerationBaseDeg:40,turnAccelerationPercent:0,turnAccelerationMultiplier:1,
  turnRateBaseDeg:80,turnRatePercent:0,turnRateMultiplier:1,terrainMultiplier:1,readinessMultiplier:1,specAcceleration:25,specTurnAccelerationDeg:40,zeroFluxSpeedBonus:0,zeroFluxTurnMultiplier:1};
/** Actual Ship phases and real critical damage, ArmorGrid, component health and
 * FluxTracker. No replacement for deployment actions or readiness methods. */
export async function checkRustCore(wasm:BufferSource){
  let strictFields=0,geometryFields=0,maxGeometryDifference=0,criticalActions=0,armorActions=0,hullActions=0,shieldFailureSteps=0,steps=0;
  const compare=(a:number,b:number,label:string,geometry=false)=>{
    if(!geometry){strictFields++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);return;}
    geometryFields++;if(Object.is(a,b))return;const diff=Math.abs(a-b),limit=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)));
    if(!Number.isFinite(a)||!Number.isFinite(b)||diff>limit)throw Error(`${label}: geometry ${a} differs from ${b}`);maxGeometryDifference=Math.max(maxGeometryDifference,diff);
  };
  for(let scenario=0;scenario<14;scenario++){
    const seed=7107+scenario,core=await RustCombatCore.create(wasm,seed),random=new SimulationRandom(seed),visual=new SimulationRandom((seed^0x9e3779b9)>>>0);
    const fighter=scenario===12,cr=scenario===13?.01:[.7,.15,.05,0,.9,.001,.399][scenario%7],peak=scenario===13?0:scenario%3===0?.07:2,range=1;
    const owners:Ship[]=[],handles:RustBodyHandle[]=[];
    for(let i=0;i<2;i++){
      const id=i+1,motion=new Float64Array(22);motion[0]=i*170;
      core.apply([{kind:'spawn',id,motion}]);const handle=core.snapshot().bodies[i].handle;handles.push(handle);
      const slots=i===0?[{x:-20,y:-15,width:12,length:15,angleDeg:180,style:'LOW_TECH' as const},
        {x:-20,y:15,width:12,length:15,angleDeg:180,style:'LOW_TECH' as const},{x:20,y:0,width:12,length:15,angleDeg:0,style:'LOW_TECH' as const,systemActivated:true}]:[];
      const owner=Object.create(Ship.prototype)as Ship,flux=new FluxTracker(1000,0,fighter&&i===0?'FIGHTER':'FRIGATE'),shield=new Shield(i===0?'FRONT':'NONE',360,65,1,0);
      const armor=new ArmorGrid(9,7,10,10,27),scars=new ShipDamageState(armor,visual),hp=i===0&&scenario===10?90:1000;
      const spec={id:'resident-cr-'+i,hullSize:fighter&&i===0?'FIGHTER':'FRIGATE',collisionRadius:50,engineSlots:slots,weaponSlots:[],hullMods:[],builtInHullMods:[],
        acceleration:25,deceleration:20,maxSpeed:120,turnAccelerationDeg:40,maxTurnRateDeg:80,shieldCenterX:0,shieldCenterY:0}as unknown as ShipSpec;
      Object.assign(owner,{id:String(id),spec,flux,shield,armor,damageDecals:scars,random,hullHp:hp,hullDamageSuppressed:false,hullDamageInterceptors:new Set(),
        hullStats:{hitpoints:1000,phaseTimeBonusMultiplier:1,fluxDissipation:0,systemUsesBonus:0,systemRegenMultiplier:1,systemCooldownMultiplier:1,systemFluxCostMultiplier:1,
          hardFluxDissipationFraction:0,zeroFluxMinimumFluxLevel:0,allowZeroFluxAtAnyLevel:0,peakCRSec:i===0?peak:0,crLossPerSec:2.7,
          weaponMalfunctionChanceBonus:0,criticalMalfunctionChanceBonus:0,zeroFluxSpeedBonus:0,zeroFluxTurnMultiplier:1,
          accelerationBonus:0,accelerationPercent:0,accelerationMultiplier:1,decelerationBonus:0,decelerationPercent:0,decelerationMultiplier:1,
          speedBonus:0,speedPercent:0,speedMultiplier:1,turnAccelerationPercent:0,turnAccelerationMultiplier:1,turnRatePercent:0,turnRateMultiplier:1,forcedRightTurn:0},
        runtimeModifiers:new RuntimeCombatModifiers(),parentShip:null,moduleMount:null,childModules:[],currentCR:i===0?cr:.7,crAtDeployment:null,lowCRDamageSequence:null,peakPerformanceRemaining:i===0?peak:0,
        crMalfunctionRangeMultiplier:range,criticalMalfunctionChanceMultiplier:1,damageTakenModifiers:new Map(),statusEffects:new Map(),externalPhaseEffects:new Map(),
        engineBoostLevel:0,phaseGhosts:[],justCriticalDamage:[],moduleHardFluxFraction:0,terrainSpeedMult:1,fleetSpeedBonusPercent:0,
        isDead:false,isRetreated:false,isDocked:false,retreating:false,isPlayer:i===0,teamId:i,visibilityMask:3,
        pos:new Vector2(i*170,0),prevPos:new Vector2(i*170,0),vel:new Vector2(),facingRad:0,angularVelRad:0,fireControlMode:'MANUAL',
        aimTargetWorld:new Vector2(170,0),turnInput:0,brakeInput:false,throttle:0,strafeInput:0,combatEngineRepairTimeMultiplier:1,
        combatWeaponRepairTimeMultiplier:1,canRepairModulesUnderFire:false,weaponDamageTakenMultiplier:1,engineDamageTakenMultiplier:1,
        damageToTargetWeaponsMultiplier:1,damageToTargetEnginesMultiplier:1,empDamageTakenMultiplier:1,baseCriticalMalfunctionDamage:170,criticalMalfunctionDamageMultiplier:1});
      const system=new ShipSystem('NONE',1000,owner),defense=new ShipSystem('NONE',1000,owner);
      Object.assign(owner,{system,systems:[system],defenseSystem:defense});
      const control=new ShipWeaponControlSystem(random);control.init(spec,0);Object.assign(owner,{weaponControl:control});
      control.weaponGroups=[];
      armor.onCellDamage=(c,r,d)=>scars.onCellDamage(c,r,d);
      core.apply([{kind:'initialize-ship',id,handle,config:{maxFlux:1000,baseDissipation:0,hullSize:fighter&&i===0?0:1,flags:F.AllowDissipation}},
        {kind:'initialize-shield',id,handle,config:{type:shield.type,maxArc:360,radius:65,efficiency:1,upkeepRate:0}},
        {kind:'shield-input',id,handle,aimX:170,aimY:0},
        {kind:'initialize-armor',id,handle,config:{cols:9,rows:7,cellWidth:10,cellHeight:10,armorRating:27,maxHull:1000,hullHp:hp}},
        {kind:'initialize-combat',id,handle,geometry:{team:i,hullSize:fighter&&i===0?'FIGHTER':'FRIGATE',radius:50,bounds:[]}},
        {kind:'damage-policy',id,handle,policy:{empMultiplier:1,weaponMultiplier:1,engineMultiplier:1,damageToWeapons:1,damageToEngines:1,baseCriticalDamage:170,criticalDamageMultiplier:1,crDamageMultiplier:1}}]);
      if(i===0){
        for(let j=0;j<4;j++){
          const profile=weaponHealthProfile('SMALL',j===1?'HIDDEN':'TURRET'),ws={id:'cr-test-'+j,mountSize:'SMALL',weaponType:'BALLISTIC',refireDelay:.4,chargeTime:0,burstDelay:0,maxAmmo:40,ammoRegenPerSec:.1,minSpread:0,spreadDecay:5}as WeaponSpec;
          const mount={slotId:String(j+1),spec:ws,mountType:j===1?'HIDDEN':'TURRET',relativePos:new Vector2(j*10-20,0),currentAngleRad:0,
            cooldownTimer:0,ammo:40,ammoRechargeProgress:0,lifecycleDt:0,burstRemaining:0,burstTimer:0,burstFluxReserved:false,firingState:'IDLE',firingStateTimer:0,
            triggerHeld:false,firingCycleId:0,reloadDelayRemaining:0,recoil:0,glowAlpha:0,barrelIndex:0,currentSpreadDeg:0,
            health:profile.health,maxHealth:profile.health,isDisabled:false,isPermanentlyDisabled:false,disabledDuration:0,disabledTimer:0,
            healthTracker:createWeaponHealthTracker(profile.repairDuration,random)}as WeaponMount;
          control.weapons.push(mount);core.apply([{kind:'install-weapon-health',id,handle,config:{componentId:j+1,size:'SMALL',mount:mount.mountType,x:mount.relativePos.x,y:0}}]);
        }
        control.weaponGroups=[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:['1','2','1','3','4','99'],alternatingIndex:0}];
        core.apply([{kind:'initialize-weapons',id,handle,facing:0,mounts:control.weapons.map((m,j)=>({componentId:j+1,type:'BALLISTIC',refireDelay:.4,maxAmmo:40,ammoRegen:.1})),
          groups:[{index:0,mode:'LINKED',autofire:false,members:[1,2,1,3,4,99]}]}]);
      }
      Object.assign(owner,{engineController:new EngineController(spec,random)});
      core.apply([{kind:'initialize-engines',id,handle,hullSize:spec.hullSize!,radius:50,slots},{kind:'engine-motion-stats',id,handle,stats}]);
      owner.resetShieldMalfunctionState();
      core.apply([{kind:'initialize-readiness',id,handle,config:{cr:owner.currentCR,peakRemaining:owner.peakPerformanceRemaining,malfunctionRange:range,peakCRSeconds:i===0?peak:0,crLossPerSecond:2.7}}]);
      if(i===0&&scenario%3!==0){owner.applyDeploymentReadiness(cr,scenario===11||scenario===13);core.apply([{kind:'deploy-readiness',id,handle,cr,controlsLocked:scenario===11||scenario===13}]);}
      owners.push(owner);
    }
    owners.forEach(o=>{o.combatShips=owners;});
    try{for(let tick=0;tick<(scenario===13?1000:140);tick++){
      const dt=scenario!==13&&tick%17===0?1.7:.073;
      if(tick===37||tick===68){const edited=tick===37?.001:.25;owners[0].currentCR=edited;core.apply([{kind:'readiness-cr',id:1,handle:handles[0],cr:edited}]);}
      if(tick===85){owners[0].applyDeploymentReadiness(.01,scenario===13);core.apply([{kind:'deploy-readiness',id:1,handle:handles[0],cr:.01,controlsLocked:scenario===13}]);}
      if(owners[0].hullHp>0){
        const o=owners[0];o.shield.setActive(true);o.shield.absorbDamage(1,'ENERGY',0);o.flux.increaseFluxClamped(820,true);
        core.apply([{kind:'shield',id:1,handle:handles[0],operation:'raise-raw'},{kind:'shield-impact',id:1,handle:handles[0],damage:1,damageType:'ENERGY',hitAngle:0},
          {kind:'flux',id:1,handle:handles[0],operation:'increase-clamped',amount:820,hard:true}]);
      }
      const states=owners.map(o=>o.prepareStep(dt,null));
      owners.forEach((o,i)=>{if(states[i])o.integrateStep(states[i]!);});
      owners.forEach((o,i)=>{if(states[i])o.weaponControl.advanceState(states[i]!.effectiveDt,o);});
      owners.forEach((o,i)=>{if(states[i])o.finishStep(states[i]!);});
      core.step(dt);steps++;const snapshot=core.snapshot(),label=`scene ${scenario} tick ${tick}`;
      random.checkpointWitness().forEach((n,k)=>compare(snapshot.random[k],n,label+' rng '+k));visual.checkpointWitness().forEach((n,k)=>compare(snapshot.visualRandom[k],n,label+' visual '+k));
      owners.forEach((o,i)=>{
        const s=snapshot.bodies[i].ship!,a=s.readiness!.values,p=o as unknown as CRPrivate,e=o.crEffects,seq=o.lowCRDamageSequence;
        const fields=[o.currentCR,o.crAtDeployment??-1,o.peakPerformanceRemaining,p.crShieldMalfunctionTimer,p.crShieldMalfunctionInterval,Number(p.crShieldMalfunctionIntervalElapsed),Number(o.justShieldMalfunction),Number(!!seq),
          e.movementChangePercent,e.damageChangePercent,e.damageTakenChangePercent,e.weaponMalfunctionChance,e.engineMalfunctionChance,e.criticalMalfunctionChance,e.shieldMalfunctionChance,Number(e.systemDisabled),Number(e.defenseDisabled),
          ...(seq?[seq.severity,seq.elapsed,seq.beforeDamage,seq.interval,seq.intervalElapsed,Number(seq.intervalWasElapsed),seq.initialAttempts,seq.remainingAttempts,Number(seq.finished),(seq as unknown as {targets:unknown[]}).targets.length]:Array(10).fill(0))];
        fields.forEach((n,k)=>compare(a[k],n,label+' readiness '+i+'/'+k));
        const targets=seq?(seq as unknown as {targets:ComponentMalfunctionTarget[]}).targets.flatMap(t=>t.kind==='weapon'?[0,Number(t.mount.slotId)]:[1,t.index]):[];
        compare(s.readiness!.targets.length,targets.length,label+' queue length');targets.forEach((n,k)=>compare(s.readiness!.targets[k],n,label+' queue '+k));
        compare(s.armor!.values[14],o.hullHp,label+' hp '+i);compare(s.armor!.values[12],o.armor.dirtyVersion,label+' armor revision '+i);
        o.armor.copyCells().forEach((n,k)=>compare(s.armor!.cells[k],n,label+' armor '+i+'/'+k));
        compare(s.flux[8],o.flux.softFlux,label+' soft '+i);compare(s.flux[9],o.flux.hardFlux,label+' hard '+i);
        compare(s.flux[11],Number(o.flux.isOverloaded),label+' overloaded '+i);compare(s.shield![28],o.shield.sinceLastDamageTaken,label+' shield age '+i);
        compare(s.engines!.values[6],o.engineController.permanentlyDisabledFraction,label+' engine permanent '+i);
        compare(s.engines!.values[4],['READY','FLAMING_OUT','DISABLED'].indexOf(o.engineController.state),label+' engine state '+i);
        o.engineStatuses.forEach((x,k)=>{const b=s.engines!.engines[k];[x.health,x.maxHealth,Number(x.isDisabled),Number(x.isPermanentlyDisabled)].forEach((n,j)=>compare(b[10+j],n,label+' engine '+k+'/'+j));});
        o.weapons.forEach((m,k)=>{const b=s.components[k].values;[m.health,m.maxHealth,Number(m.isDisabled),Number(m.isPermanentlyDisabled),m.disabledDuration,m.disabledTimer].forEach((n,j)=>compare(b[5+j],n,label+' weapon health '+k+'/'+j));
          compare(s.weapons!.mounts[k][17],m.ammo,label+' ammo '+k);});
        if(o.weaponGroups.length){const expected=o.weaponGroups[0].weaponSlotIds.map(Number),actual=s.weapons!.groups[0].members;compare(actual.length,expected.length,label+' group length');expected.forEach((n,k)=>compare(actual[k],n,label+' group '+k));}
        [o.pos.x,o.pos.y,o.vel.x,o.vel.y,o.facingRad,o.angularVelRad].forEach((n,k)=>compare(snapshot.bodies[i].motion[k],n,label+' motion '+i+'/'+k,true));
        for(const damage of o.justCriticalDamage){criticalActions++;if(damage.armorDamage>0)armorActions++;if(damage.hullDamage>0)hullActions++;}o.justCriticalDamage.length=0;
        if(o.justShieldMalfunction)shieldFailureSteps++;
      });
      core.acknowledgeEvents(snapshot.lastEventSequence);
      if(tick===70){const old=JSON.stringify(core.snapshot());try{core.apply([{kind:'deploy-readiness',id:1,handle:handles[0],cr:0},
        {kind:'readiness-cr',id:2,handle:{slot:handles[1].slot,generation:handles[1].generation+1},cr:.4}]);throw Error('stale readiness accepted');}
        catch(e){if(!(e instanceof RustCoreCommandError)||e.code!==4)throw e;}if(JSON.stringify(core.snapshot())!==old)throw Error('readiness rollback differs');}
    }}finally{core.dispose();}
  }
  if(!criticalActions||!armorActions||!hullActions||!shieldFailureSteps)throw Error('Readiness real action coverage missing '+JSON.stringify({criticalActions,armorActions,hullActions,shieldFailureSteps}));
  return {passed:true,scenarios:14,steps,strictFields,geometryFields,maxGeometryDifference,criticalActions,armorActions,hullActions,shieldFailureSteps,
    realDamageCovered:true,productionIntegrated:false,fullBattleReady:false};
}
