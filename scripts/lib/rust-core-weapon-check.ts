import {RustCombatCore,RustCoreCommandError} from '../../src/engine/runtime/rust/RustCombatCore';
import {RustEventKind as E,RustShipFlag as F,RustWeaponSize,RustWeaponMount,RustWeaponType,RustFiringState,
  RustLifecycleFlag as L,RustLifecycleGate as G,RustUpkeepControl as U,encodeRustCommands,
  type RustBodyHandle,type RustWeaponStateConfig,type RustWeaponHealthConfig,type RustWeaponPolicy,type RustWeaponGroupConfig,
  type RustEngineMotionStats,type RustDamagePolicy} from '../../src/engine/runtime/rust/RustCoreProtocol';
// Preserve the game's Ship-first module initialization order.
import {Ship} from '../../src/engine/simulation/Ship';
import {ShipWeaponControlSystem} from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import {EngineController} from '../../src/engine/simulation/systems/EngineController';
import {ShipSystem} from '../../src/engine/simulation/ShipSystem';
import {shipSystemDefinitions} from '../../src/engine/extensions/ship-systems/Registry';
import {shipMotionStats} from '../../src/engine/simulation/systems/ShipMotion';
import {ArmorGrid} from '../../src/engine/simulation/ArmorGrid';
import {ShipDamageState,type ScorchMark} from '../../src/engine/simulation/ShipDamageState';
import {FluxTracker} from '../../src/engine/simulation/FluxTracker';
import {Shield} from '../../src/engine/simulation/Shield';
import {SimulationRandom} from '../../src/engine/simulation/SimulationRandom';
import {Vector2} from '../../src/engine/math/Vector2';
import {weaponHealthProfile,createWeaponHealthTracker} from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import {canPermanentlyDisableWeapon} from '../../src/engine/simulation/systems/ComponentMalfunctions';
import {MOTION_WIDTH} from '../../src/engine/simulation/systems/MotionKernel';
import type {WeaponMount,WeaponSpec,WeaponGroup} from '../../src/engine/simulation/Weapon';
import type {ShipSpec} from '../../src/engine/content/ShipSpec';
import {checkRustCore as checkEngines} from './rust-core-engine-check';

function insist(v:unknown,label:string):asserts v {if(!v)throw Error(label);}
function exact(a:number,b:number,label:string){if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);}
function rejected(fn:()=>void,code:number){try{fn();}catch(e){insist(e instanceof RustCoreCommandError&&e.code===code,'Unexpected rejection '+String(e));return;}throw Error('Missing rejection '+code);}
interface Weapon {health:RustWeaponHealthConfig;config:RustWeaponStateConfig;mount:WeaponMount}
interface Fixture {id:number;handle:RustBodyHandle;owner:Ship;control:ShipWeaponControlSystem;system:ShipSystem;
  armor:ArmorGrid;scars:ShipDamageState;weapons:Weapon[];motion:Float64Array;clock:number[];policy:RustWeaponPolicy;
  damage:RustDamagePolicy;explicit:boolean;observing:boolean;lastManual:number;lastFire:number;lastDt:number}
type Expected=readonly [number,number,number,number,number,number,number];
const neutral:RustDamagePolicy={empMultiplier:1,weaponMultiplier:1,engineMultiplier:1,damageToWeapons:1,damageToEngines:1,
  baseCriticalDamage:147,criticalDamageMultiplier:1,crDamageMultiplier:1};
const motionStats:RustEngineMotionStats={accelerationBase:25,accelerationPercent:0,accelerationMultiplier:1,
  decelerationBase:20,decelerationPercent:0,decelerationMultiplier:1,speedBase:120,speedPercent:0,speedMultiplier:1,
  turnAccelerationBaseDeg:40,turnAccelerationPercent:0,turnAccelerationMultiplier:1,turnRateBaseDeg:80,turnRatePercent:0,turnRateMultiplier:1,
  terrainMultiplier:1,readinessMultiplier:1,specAcceleration:25,specTurnAccelerationDeg:40,zeroFluxSpeedBonus:0,zeroFluxTurnMultiplier:1};
const initialPolicy:RustWeaponPolicy={manual:true,combatRepairMultiplier:1,underFire:false,malfunctionChance:0,criticalChance:0,currentCR:.7,
  repairMultiplier:1,recoilMultiplier:1,rate:[1,1,1],ammoRegen:[1,1,1]};
function controllerWords(f:Fixture){const p=f.policy,c=f.control;
  return [(c as unknown as {previousHullFacingRad:number}).previousHullFacingRad,f.weapons.length,c.weaponGroups.length,
    Number(p.manual??true),Number(p.blocked??false),Number(p.phased??false),p.combatRepairMultiplier??1,Number(p.underFire??false),
    p.malfunctionChance??0,p.criticalChance??0,p.currentCR??.7,p.repairMultiplier??1,p.recoilMultiplier??1,...(p.rate??[1,1,1]),
    ...(p.ammoRegen??[1,1,1]),f.lastManual,f.lastFire,f.lastDt,c.selectedGroupIndex];
}
function mountWords(w:Weapon){const c=w.config,m=w.mount,s=m.spec;
  return [c.componentId,RustWeaponType[c.type??'NONE'],Number(s.isBeam??false),Number(s.beamVisualMode==='BURST'),s.refireDelay,
    s.chargeTime??0,s.burstDelay??0,Number(s.beamBurstDelay!==undefined),s.beamBurstDelay??0,Number(s.maxAmmo!==undefined),s.maxAmmo??0,
    s.ammoRegenPerSec??0,s.minSpread||0,s.spreadDecay||5,Number(s.id==='web_gloriana_torpedo'),m.currentAngleRad,m.cooldownTimer,
    m.ammo,m.ammoRechargeProgress,m.lifecycleDt??0,m.burstRemaining,m.burstTimer,Number(m.burstFluxReserved??false),RustFiringState[m.firingState],
    m.firingStateTimer,Number(m.triggerHeld),m.firingCycleId,m.reloadDelayRemaining??0,m.recoil,m.glowAlpha,m.barrelIndex,m.currentSpreadDeg,
    Number(m.loadedMissileLevels!==undefined),m.loadedMissileLevels?.[0]??0,m.loadedMissileLevels?.[1]??0,Number(c.initial?.ammo===Infinity||c.initial?.ammo===undefined&&c.maxAmmo===undefined)];
}
function healthWords(w:Weapon){const m=w.mount,t=m.healthTracker,c=w.health;
  return [c.componentId,RustWeaponSize[c.size],RustWeaponMount[c.mount],c.x??0,c.y??0,m.health,m.maxHealth,Number(m.isDisabled),Number(m.isPermanentlyDisabled),
    m.disabledDuration,m.disabledTimer,Number(!!t),t?.repairDuration??0,t?.hitAgo??0,t?.interval??0,t?.elapsed??0,Number(t?.intervalElapsed??false),1,1,0];
}
function groupWords(g:WeaponGroup){return [g.index,Number(g.mode==='ALTERNATING'),Number(g.isAutofire),g.alternatingIndex,
  Number(g.alternatingElapsed!==undefined),g.alternatingElapsed??0,Number(g.alternatingWasFiring!==undefined),Number(g.alternatingWasFiring??false),
  Number(g.alternatingJustSwitched!==undefined),Number(g.alternatingJustSwitched??false),g.weaponSlotIds.length];}
function scarWords(m:ScorchMark){return [m.cellIndex,m.localPos.x,m.localPos.y,m.opacity,m.intensity,m.heat,Number(m.justHit),m.flash,m.flashElapsed,m.phase,
  m.pulsePeriod,m.size,m.rotationRad,['cracks','burns','holes'].indexOf(m.kind),m.variant];}

/** Actual pre-fire controller, health, modifier readers and synchronous Ship
 * critical damage. Initial cycles are installed once, never refreshed per step. */
export async function checkRustCore(source:BufferSource) {
  const prior=await checkEngines(source),core=await RustCombatCore.create(source,2917);
  const random=new SimulationRandom(2917),visual=new SimulationRandom((2917^0x9e3779b9)>>>0),fixtures:Fixture[]=[],events:Expected[]=[];
  let tick=0,time=0,sequence=0,exactFields=0,eventsChecked=0,rngFields=0,geometryFields=0,maxGeometryDifference=0;
  let disables=0,repairs=0,scheduledCritical=0,explicitCritical=0,armorCritical=0,directCritical=0,zeroCriticalFailures=0,sameStepRepair=0,permanentSameStepRepair=0;
  let midLoopZeroHull=0,scheduledZeroHull=0,removedDuplicates=0,positiveCRVeto=0,temporaryOtherPermitted=0;
  const geometryLog:{label:string;actual:number;expected:number;difference:number;limit:number}[]=[];
  const emit=(f:Fixture,kind:number,value=0,a=0,b=0,system=0)=>events.push([f.id,kind,value,a,b,system,tick]);
  function geometry(a:number,b:number,label:string){geometryFields++;if(Object.is(a,b))return;
    const difference=Math.abs(a-b),limit=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)));
    insist(Number.isFinite(a)&&Number.isFinite(b)&&difference<=limit,`${label}: geometry ${a} differs from ${b}`);
    maxGeometryDifference=Math.max(maxGeometryDifference,difference);geometryLog.push({label,actual:a,expected:b,difference,limit});
  }
  function setPolicy(f:Fixture,p:RustWeaponPolicy){f.policy=p;const o=f.owner;
    o.fireControlMode=(p.manual??true)?'MANUAL':'AI';o.currentCR=p.currentCR??.7;o.combatWeaponRepairTimeMultiplier=p.combatRepairMultiplier??1;o.canRepairModulesUnderFire=p.underFire??false;
    const r=p.rate??[1,1,1],a=p.ammoRegen??[1,1,1];
    Object.assign(o.runtimeModifiers.value,{disableWeapons:Number(p.blocked??false),repairTimeMultiplier:p.repairMultiplier??1,recoilMultiplier:p.recoilMultiplier??1,
      weapons:{BALLISTIC:{rateOfFireMultiplier:r[0],ammoRegenMultiplier:a[0]},ENERGY:{rateOfFireMultiplier:r[1],ammoRegenMultiplier:a[1]},MISSILE:{rateOfFireMultiplier:r[2],ammoRegenMultiplier:a[2]}}});
    o.externalPhaseEffects.clear();if(p.phased)o.externalPhaseEffects.set('domain',()=>.4);
    Object.defineProperty(o,'crEffects',{value:{weaponMalfunctionChance:p.malfunctionChance??0,criticalMalfunctionChance:p.criticalChance??0,engineMalfunctionChance:0},configurable:true});
    f.control.selectedGroupIndex=p.selectedGroupIndex??0;
    core.apply([{kind:'weapon-policy',id:f.id,handle:f.handle,policy:p}]);
  }
  function damage(f:Fixture,index:number,value:number){f.control.damageComponent(f.weapons[index].mount,value);
    core.apply([{kind:'component-damage',id:f.id,handle:f.handle,componentId:index+1,damage:value}]);}
  function disable(f:Fixture,index:number,permanent=false){f.explicit=true;try{f.control.disableComponent(f.weapons[index].mount,permanent);}finally{f.explicit=false;}
    core.apply([{kind:'component-disable',id:f.id,handle:f.handle,componentId:index+1,permanent}]);}
  function critical(f:Fixture,index:number,permanent=true){f.explicit=true;try{f.owner.applyCriticalMalfunction({kind:'weapon',mount:f.weapons[index].mount},permanent);}finally{f.explicit=false;}
    core.apply([{kind:'weapon-critical',id:f.id,handle:f.handle,componentId:index+1,permanent}]);}
  try {
    for(let i=0;i<11;i++) {
      const id=2700+i,motion=new Float64Array(MOTION_WIDTH);motion.set([i*90,-20,0,0,.2,.02,0,0,0,0,0,0,25,20,120,40*Math.PI/180,80*Math.PI/180,0,1,0,0,0]);
      core.apply([{kind:'spawn',id,motion}]);const handle=core.snapshot().bodies.at(-1)!.handle;
      const owner=Object.create(Ship.prototype) as Ship,flux=new FluxTracker(10000,0,'FRIGATE'),shield=new Shield(i===7?'PHASE':'NONE',360,100,1,0,amount=>flux.increaseFluxClamped(amount,true));
      const armor=new ArmorGrid(9,7,20,20,1300.37),scars=new ShipDamageState(armor,visual);
      const spec={id:'weapon-domain-'+i,weaponSlots:[],engineSlots:[],hullSize:'FRIGATE',collisionRadius:100,acceleration:25,deceleration:20,maxSpeed:120,
        turnAccelerationDeg:40,maxTurnRateDeg:80,hullMods:[],builtInHullMods:[]} as unknown as ShipSpec;
      Object.assign(owner,{spec,flux,shield,armor,damageDecals:scars,random,hullHp:1e6,hullDamageSuppressed:false,hullDamageInterceptors:new Set(),
        hullStats:{hitpoints:1e6,phaseTimeBonusMultiplier:.7,fluxDissipation:0,systemUsesBonus:0,systemRegenMultiplier:1,systemCooldownMultiplier:1,systemFluxCostMultiplier:1,
          hardFluxDissipationFraction:0,zeroFluxMinimumFluxLevel:0,allowZeroFluxAtAnyLevel:0,peakCRSec:0,zeroFluxSpeedBonus:0,zeroFluxTurnMultiplier:1,
          accelerationBonus:0,accelerationPercent:0,accelerationMultiplier:1,decelerationBonus:0,decelerationPercent:0,decelerationMultiplier:1,
          speedBonus:0,speedPercent:0,speedMultiplier:1,turnAccelerationPercent:0,turnAccelerationMultiplier:1,turnRatePercent:0,turnRateMultiplier:1,forcedRightTurn:0},
        runtimeModifiers:{empty:false,value:{timeMultiplier:i%2?1.17:1}},moduleHardFluxFraction:0,parentShip:null,moduleMount:null,childModules:[],
        currentCR:.7,damageTakenModifiers:new Map(),statusEffects:new Map(),engineBoostLevel:0,phaseGhosts:[],justCriticalDamage:[],externalPhaseEffects:new Map(),
        isDead:false,isRetreated:false,isDocked:false,retreating:false,terrainSpeedMult:1,fleetSpeedBonusPercent:0,fireControlMode:'MANUAL',combatShips:[],
        pos:new Vector2(motion[0],motion[1]),prevPos:new Vector2(motion[0],motion[1]),vel:new Vector2(),facingRad:motion[4],angularVelRad:motion[5],
        aimTargetWorld:new Vector2(700,350),turnInput:0,brakeInput:false,throttle:0,strafeInput:0,combatEngineRepairTimeMultiplier:1,
        advanceDeploymentReadiness:()=>{},applyCombatReadiness:(dt:number)=>{shield.sinceLastDamageTaken+=dt;}});
      Object.defineProperty(owner,'crMovementMultiplier',{value:1});
      const name='RUST_WEAPON_CONTROL_'+id;
      shipSystemDefinitions.register({id:name,name,sourceIds:[],chargeUp:.2,active:1.7,chargeDown:.3,cooldown:.6,
        controls:{blockWeapons:i===5,forceAutofire:i===6,releaseOnOut:i===6},onInterrupt:()=>emit(fixtures[i],E.SystemInterrupt,0,0,0,1)});
      const system=new ShipSystem(name,10000,owner);Object.assign(owner,{system,systems:[system],defenseSystem:system,engineController:new EngineController(spec,random)});
      Object.defineProperty(owner,'allSystems',{value:[system]});
      const control=new ShipWeaponControlSystem(random);control.init(spec,motion[4]);Object.assign(owner,{weaponControl:control});
      const f:Fixture={id,handle,owner,control,system,armor,scars,weapons:[],motion,clock:[.7,0,i%2?1.17:1,0,0,0,0,0,0],policy:initialPolicy,
        damage:neutral,explicit:false,observing:true,lastManual:0,lastFire:0,lastDt:0};fixtures.push(f);
      core.apply([{kind:'initialize-ship',id,handle,config:{maxFlux:10000,baseDissipation:0,hullSize:1,flags:F.AllowDissipation,phaseTimeBonus:.7,externalTimeMultiplier:f.clock[2]}},
        {kind:'initialize-shield',id,handle,config:{type:shield.type,maxArc:360,radius:100,efficiency:1,upkeepRate:0}},
        {kind:'initialize-armor',id,handle,config:{cols:9,rows:7,cellWidth:20,cellHeight:20,armorRating:1300.37,maxHull:1e6}},
        {kind:'initialize-engines',id,handle,hullSize:'FRIGATE',radius:100,slots:[]},{kind:'engine-motion-stats',id,handle,stats:motionStats},
        {kind:'define-lifecycle',id,spec:{chargeUp:.2,active:1.7,chargeDown:.3,cooldown:.6,maxCharges:0,chargeRegen:0,fluxCostPerUse:0,flags:L.Available}},
        {kind:'install-system',id,handle,systemId:1,specId:id},
        {kind:'system-upkeep',id,handle,systemId:1,policy:{gate:G.Applied,controls:i===5?U.BlockWeapons:i===6?U.ForceAutofire|U.ReleaseOnOut:0}},
        {kind:'damage-policy',id,handle,policy:neutral}]);
      Object.assign(owner,{empDamageTakenMultiplier:1,weaponDamageTakenMultiplier:1,engineDamageTakenMultiplier:1,damageToTargetWeaponsMultiplier:1,damageToTargetEnginesMultiplier:1,
        baseCriticalMalfunctionDamage:neutral.baseCriticalDamage,criticalMalfunctionDamageMultiplier:1});Object.defineProperty(owner,'crDamageTakenMultiplier',{value:1});
      const count=i===8?0:i>=9?2:8;
      for(let j=0;j<count;j++) {
        const h:RustWeaponHealthConfig={componentId:j+1,size:j===5?'EXTRA_LARGE':j%3===0?'LARGE':'SMALL',mount:j===7||i===9&&j===1?'HIDDEN':j===5?'HARDPOINT':'TURRET',x:(j%4-2)*20,y:j<4?-20:20,deferTracker:j===4};
        let c:RustWeaponStateConfig={componentId:j+1,type:(['BALLISTIC','ENERGY','MISSILE','NONE'] as const)[j%4],beam:j===2||j===3,burstBeam:j===2,
          refireDelay:j===4?0:j===1?.02:.8,chargeTime:j===1?0:.2,burstDelay:j===1?.02:.11,beamBurstDelay:j===2?1.3:undefined,
          maxAmmo:j===0?23:j===1?2:j===2?5:j===4?2:j===6?undefined:0,ammoRegen:j===0?4.7:j===1?.73:j===4?.9:0,
          minSpread:j===5?-1:0,spreadDecay:j%2?0:7.1,torpedoRack:j===4,
          initial:{angle:.2+j*.1,cooldown:j===3?0:j===0?20:j===1?1e-10:.93,ammo:j===6?Infinity:j===0?3:j===4?1:2,
            recharge:j===1?.97:.2,lifecycleDt:0,burstRemaining:j===1?3:0,burstTimer:.1,burstReserved:j===1,
            firingState:j===0?'CHARGING':j===2?'ACTIVE':j===3?'CHARGEDOWN':'IDLE',firingTimer:.12,triggerHeld:j<4,cycleId:31+j,
            reloadDelay:j===2?.13:0,recoil:.87,glow:.61,barrel:j===4?-1:0,spread:14,loaded:j===4?undefined:[.1,.7]}};
        if(i>=9)c={...c,maxAmmo:10,ammoRegen:0,initial:{...c.initial,ammo:2,cooldown:9,firingState:'CHARGING'}};
        const p=weaponHealthProfile(h.size,h.mount),s=c.initial!;
        const mount={slotId:String(j+1),spec:{id:c.torpedoRack?'web_gloriana_torpedo':'domain-'+j,mountSize:h.size,weaponType:c.type==='NONE'?undefined:c.type,
          isBeam:c.beam,beamVisualMode:c.burstBeam?'BURST':'CONTINUOUS',refireDelay:c.refireDelay,chargeTime:c.chargeTime,burstDelay:c.burstDelay,beamBurstDelay:c.beamBurstDelay,
          maxAmmo:c.maxAmmo,ammoRegenPerSec:c.ammoRegen,minSpread:c.minSpread,spreadDecay:c.spreadDecay} as WeaponSpec,mountType:h.mount,relativePos:new Vector2(h.x,h.y),
          currentAngleRad:s.angle,cooldownTimer:s.cooldown,ammo:s.ammo,ammoRechargeProgress:s.recharge,lifecycleDt:s.lifecycleDt,
          burstRemaining:s.burstRemaining,burstTimer:s.burstTimer,burstFluxReserved:s.burstReserved,firingState:s.firingState,firingStateTimer:s.firingTimer,
          triggerHeld:s.triggerHeld,firingCycleId:s.cycleId,reloadDelayRemaining:s.reloadDelay,recoil:s.recoil,glowAlpha:s.glow,barrelIndex:s.barrel,currentSpreadDeg:s.spread,
          loadedMissileLevels:s.loaded,health:p.health,maxHealth:p.health,isDisabled:false,isPermanentlyDisabled:false,disabledDuration:0,disabledTimer:0,
          healthTracker:h.deferTracker?undefined:createWeaponHealthTracker(p.repairDuration,random)} as WeaponMount;
        f.weapons.push({health:h,config:c,mount});control.weapons.push(mount);core.apply([{kind:'install-weapon-health',id,handle,config:h}]);
      }
      const groups:RustWeaponGroupConfig[]=count?[
        {index:2,mode:'LINKED',autofire:false,members:[1,1,2,999,...Array.from({length:count},(_,j)=>j+1)]},
        {index:4,mode:'ALTERNATING',autofire:true,members:[1,1,...Array.from({length:count},(_,j)=>j+1)],alternatingIndex:1,alternatingElapsed:.7,alternatingWasFiring:true,alternatingJustSwitched:false},
        {index:9,mode:'LINKED',autofire:false,members:[]}]:[];
      control.weaponGroups=groups.map(g=>({index:g.index,mode:g.mode,isAutofire:g.autofire,weaponSlotIds:g.members.map(String),alternatingIndex:g.alternatingIndex??0,
        alternatingElapsed:g.alternatingElapsed,alternatingWasFiring:g.alternatingWasFiring,alternatingJustSwitched:g.alternatingJustSwitched}));
      core.apply([{kind:'initialize-weapons',id,handle,facing:.2,mounts:f.weapons.map(w=>w.config),groups}]);setPolicy(f,initialPolicy);
      const nativeDamage=control.damageComponent,nativeDisable=control.disableComponent;
      control.damageComponent=(mount,amount)=>{const before=mount.health;nativeDamage.call(control,mount,amount);emit(f,E.ComponentDamage,before-mount.health,Number(mount.slotId));};
      control.disableComponent=(mount,permanent=false)=>{const was=mount.isDisabled;nativeDisable.call(control,mount,permanent);
        if(f.explicit)emit(f,E.ComponentDisableResult,Number(!was),Number(mount.slotId),Number(permanent));};
      control.justDisabledMounts.push=function(...mounts:WeaponMount[]){for(const m of mounts){emit(f,E.ComponentDisabled,0,Number(m.slotId),f.explicit?Number(m.isPermanentlyDisabled):0);disables++;
        if(!f.explicit&&(f.policy.malfunctionChance??0)>0&&(f.policy.criticalChance??0)===0)zeroCriticalFailures++;
      }return Array.prototype.push.apply(this,mounts);};
      control.justRepairedMounts.push=function(...mounts:WeaponMount[]){for(const m of mounts){emit(f,E.ComponentRepaired,0,Number(m.slotId));repairs++;}
        return Array.prototype.push.apply(this,mounts);};
      owner.applyHullDamage=amount=>{const dealt=Ship.prototype.applyHullDamage.call(owner,amount);emit(f,E.HullApplied,dealt);return dealt;};
      owner.justCriticalDamage.push=function(...records:Ship['justCriticalDamage']){for(const r of records){if(f.explicit)explicitCritical++;else scheduledCritical++;
        if(r.armorDamage>0)armorCritical++;else directCritical++;if(owner.hullHp<=0){midLoopZeroHull++;if(!f.explicit)scheduledZeroHull++;}
        emit(f,E.CriticalArmor,r.armorDamage,r.local.x,r.local.y);emit(f,E.CriticalHull,r.hullDamage,r.local.x,r.local.y);
      }return Array.prototype.push.apply(this,records);};
      armor.onCellDamage=(c,r,amount)=>{scars.onCellDamage(c,r,amount);emit(f,E.CellDamage,amount,c,r);};
      armor.takeDamage=(...args)=>{const result=ArmorGrid.prototype.takeDamage.apply(armor,args);
        emit(f,E.ArmorDamage,result.armorDamage);emit(f,E.ArmorHullDamage,result.hullDamage);emit(f,E.ResidualArmor,result.residualArmor);return result;};
    }
    function check(label:string){const snap=core.snapshot();exact(snap.tick,tick,label+' tick');exact(snap.combatTime,time,label+' time');
      random.checkpointWitness().forEach((n,i)=>{exact(snap.random[i],n,label+' combat RNG '+i);rngFields++;});
      visual.checkpointWitness().forEach((n,i)=>{exact(snap.visualRandom[i],n,label+' visual RNG '+i);rngFields++;});
      snap.bodies.forEach((b,i)=>{const f=fixtures[i],s=b.ship!,w=s.weapons!,o=f.owner;
        controllerWords(f).forEach((n,k)=>{if(k===0)geometry(w.values[k],n,`${label} facing ${i}`);else {exact(w.values[k],n,`${label} control ${i}/${k}`);exactFields++;}});
        f.weapons.forEach((m,j)=>{mountWords(m).forEach((n,k)=>{if(k===15)geometry(w.mounts[j][k],n,`${label} mount angle ${i}/${j}`);
          else {exact(w.mounts[j][k],n,`${label} mount ${i}/${j}/${k}`);exactFields++;}});
          healthWords(m).forEach((n,k)=>{exact(s.components[j].values[k],n,`${label} health ${i}/${j}/${k}`);exactFields++;});});
        for(const [actual,expected]of [[w.justDisabled,f.control.justDisabledMounts],[w.justRepaired,f.control.justRepairedMounts]] as const){exact(actual.length,expected.length,label+' queue size');
          actual.forEach((n,k)=>{exact(n,Number(expected[k].slotId),label+' queue member');exactFields++;});}
        exact(w.groups.length,f.control.weaponGroups.length,label+' group count');w.groups.forEach((g,j)=>{
          groupWords(f.control.weaponGroups[j]).forEach((n,k)=>{exact(g.values[k],n,`${label} group ${i}/${j}/${k}`);exactFields++;});
          const members=f.control.weaponGroups[j].weaponSlotIds.map(Number);exact(g.members.length,members.length,label+' members length');
          g.members.forEach((n,k)=>{exact(n,members[k],label+' member');exactFields++;});});
        exact(s.armor!.values[14],o.hullHp,label+' hull');exact(s.armor!.values[12],f.armor.dirtyVersion,label+' dirtyVersion');
        f.armor.copyCells().forEach((n,k)=>{exact(s.armor!.cells[k],n,`${label} cell ${i}/${k}`);exactFields++;});
        exact(s.armor!.scars.length,f.scars.marks.length,label+' scars');s.armor!.scars.forEach((m,j)=>scarWords(f.scars.marks[j]).forEach((n,k)=>{exact(m[k],n,`${label} scar ${i}/${j}/${k}`);exactFields++;}));
        f.clock[1]=o.shield.phaseEffectLevel;f.clock.forEach((n,k)=>{exact(s.clock[k],n,`${label} clock ${i}/${k}`);exactFields++;});
        for(let k=0;k<6;k++)geometry(b.motion[k],f.motion[k],`${label} pose ${i}/${k}`);
      });
      exact(snap.events.length,events.length,label+' event count');snap.events.forEach((e,i)=>{const a=events[i];
        exact(e.sequence,sequence+i+1,label+' sequence');[e.id,e.kind,e.value,...e.detail,e.systemId,e.tick].forEach((n,k)=>exact(n,a[k],label+' event '+i+'/'+k));eventsChecked++;});
      insist(JSON.stringify(core.snapshot())===JSON.stringify(snap),'Publication consumed weapon events or changed authority');
      sequence=snap.lastEventSequence;core.acknowledgeEvents(sequence);events.length=0;
    }
    function system(f:Fixture,op:'activate'|'interrupt'|'reset'){if(op==='activate'){const accepted=f.system.activate();core.apply([{kind:'system',id:f.id,handle:f.handle,systemId:1,operation:op}]);emit(f,E.SystemResult,Number(accepted),0,0,1);}
      else {if(op==='interrupt')f.system.deactivate();else {f.system.reset();emit(f,E.SystemReset,0,0,0,1);}
        core.apply([{kind:'system',id:f.id,handle:f.handle,systemId:1,operation:op}]);}}
    function clear(f:Fixture){f.control.justDisabledMounts.length=0;f.control.justRepairedMounts.length=0;core.apply([{kind:'clear-weapon-events',id:f.id,handle:f.handle}]);}
    check('initial');
    disable(fixtures[0],0);const cooldown=fixtures[0].weapons[0].mount.cooldownTimer;disable(fixtures[0],0,true);
    exact(fixtures[0].weapons[0].mount.cooldownTimer,cooldown,'Repeated disable changed cooldown');
    insist(fixtures[0].control.weaponGroups[0].weaponSlotIds.filter(id=>id==='1').length===3,'Generic permanent disable removed groups');
    critical(fixtures[0],0,true);insist(fixtures[0].control.weaponGroups.every(g=>!g.weaponSlotIds.includes('1')),'Permanent explicit malfunction kept duplicate group members');removedDuplicates++;
    disable(fixtures[1],6);insist(canPermanentlyDisableWeapon(fixtures[1].owner,fixtures[1].weapons[0].mount),'Temporarily disabled other usable weapon vetoed permanence');temporaryOtherPermitted++;
    check('explicit cancellation');
    const dying=fixtures[10];dying.owner.applyHullDamage(dying.owner.hullHp-20);
    core.apply([{kind:'hull-damage',id:dying.id,handle:dying.handle,damage:1e6-20}]);
    setPolicy(dying,{...initialPolicy,malfunctionChance:1,criticalChance:1,currentCR:0,combatRepairMultiplier:0});
    for(let step=0;step<100;step++) {
      if(step===0){setPolicy(fixtures[2],{...initialPolicy,rate:[25,.23,3.7],ammoRegen:[1.13,.77,1.4],recoilMultiplier:.83});
        setPolicy(fixtures[3],{...initialPolicy,rate:[0,2,0],ammoRegen:[0,2,0],repairMultiplier:1.17});
        setPolicy(fixtures[4],{...initialPolicy,malfunctionChance:1,criticalChance:0,combatRepairMultiplier:.6});
        setPolicy(fixtures[9],{...initialPolicy,malfunctionChance:1,criticalChance:1});insist(!canPermanentlyDisableWeapon(fixtures[9].owner,fixtures[9].weapons[0].mount),'Weak-only permanent veto failed');positiveCRVeto++;}
      if(step===1){system(fixtures[5],'activate');system(fixtures[6],'activate');fixtures[7].owner.shield.setActive(true);
        core.apply([{kind:'shield',id:fixtures[7].id,handle:fixtures[7].handle,operation:'raise-raw'}]);emit(fixtures[7],E.ShieldResult);}
      if(step===3){damage(fixtures[2],4,1000);setPolicy(fixtures[2],{...fixtures[2].policy,combatRepairMultiplier:0});}
      if(step===5){setPolicy(fixtures[1],{...initialPolicy,malfunctionChance:1,criticalChance:1,combatRepairMultiplier:0});}
      if(step===7){fixtures[7].owner.shield.setActive(false);core.apply([{kind:'shield',id:fixtures[7].id,handle:fixtures[7].handle,operation:'lower-raw'}]);emit(fixtures[7],E.ShieldResult);}
      if(step===11){setPolicy(fixtures[9],{...fixtures[9].policy,currentCR:0});}
      if(step===12){system(fixtures[6],'interrupt');setPolicy(fixtures[3],{...fixtures[3].policy,blocked:true});}
      if(step===16){setPolicy(fixtures[3],{...fixtures[3].policy,blocked:false,phased:true});}
      if(step===19){setPolicy(fixtures[3],{...fixtures[3].policy,phased:false,manual:false});}
      if(step===20){const f=fixtures[6];f.owner.flux.increaseFluxClamped(400,true);f.owner.flux.startVenting();
        core.apply([{kind:'flux',id:f.id,handle:f.handle,operation:'increase-clamped',amount:400,hard:true},{kind:'flux',id:f.id,handle:f.handle,operation:'start-vent'}]);emit(f,E.FluxResult);emit(f,E.FluxResult,1);}
      if(step===21){const f=fixtures[5];f.owner.flux.overloadFor(2);core.apply([{kind:'flux',id:f.id,handle:f.handle,operation:'overload-for',amount:2}]);emit(f,E.OverloadStarted);emit(f,E.FluxResult,1);}
      if(step===25){critical(fixtures[2],2,false);critical(fixtures[2],2,true);}
      if(step===30){const f=fixtures[4];f.owner.applyHullDamage(f.owner.hullHp-20);core.apply([{kind:'hull-damage',id:f.id,handle:f.handle,damage:core.snapshot().bodies[4].ship!.armor!.values[14]-20}]);critical(f,1);}
      if(step===33){setPolicy(fixtures[3],{...initialPolicy,combatRepairMultiplier:.67,underFire:true});damage(fixtures[3],0,77);damage(fixtures[3],7,5000);}
      if(step===40){const f=fixtures[9];critical(f,1);}
      if(step===50){const f=fixtures[5];f.owner.isDocked=true;core.apply([{kind:'ship-flags',id:f.id,handle:f.handle,flags:F.AllowDissipation|F.Docked,hardFluxDissipationFraction:0,zeroFluxMinimum:0,allowZeroFluxAtAnyLevel:0}]);}
      if(step===55){const f=fixtures[5];f.owner.isDocked=false;core.apply([{kind:'ship-flags',id:f.id,handle:f.handle,flags:F.AllowDissipation,hardFluxDissipationFraction:0,zeroFluxMinimum:0,allowZeroFluxAtAnyLevel:0}]);}
      if(step%17===0)for(const f of fixtures)clear(f);
      for(const [i,f]of fixtures.entries()){const o=f.owner;o.turnInput=i<4?(step%5===0?.27:step%5===3?-.13:0):0;f.motion[7]=o.turnInput;
        core.apply([{kind:'controls',id:f.id,handle:f.handle,turn:o.turnInput,brake:false,throttle:0,strafe:0,flags:0}]);
        if(step===70&&i===3)setPolicy(f,{...f.policy,rate:[.001,100,1.01],ammoRegen:[2,.37,1]});}
      check('commands '+step);const dt=[1/60,.03,.1,.31,.61,1.7,3][step%7];time+=dt;tick++;
      for(const f of fixtures){const o=f.owner,state=o.prepareStep(dt,null);if(!state)continue;
        f.clock[3]=dt;f.clock[4]=state.tacticalDt;f.clock[5]=state.effectiveDt;f.clock[6]+=dt;f.clock[7]+=state.tacticalDt;f.clock[8]+=state.effectiveDt;
        const stats=shipMotionStats(o);f.motion[6]=state.effectiveDt;f.motion.set([stats.acceleration,stats.deceleration,stats.maxSpeed,stats.turnAcceleration,stats.maxTurnRate,stats.driftAcceleration,stats.strafeMultiplier],12);
        o.integrateStep(state);f.motion.set([o.pos.x,o.pos.y,o.vel.x,o.vel.y,o.facingRad,o.angularVelRad],0);f.motion[19]=Number(state.engineCommands.accelerating);f.motion[20]=Number(state.engineCommands.spreading);
        const disabledBefore=f.control.justDisabledMounts.length,repairedBefore=f.control.justRepairedMounts.length;
        const result=f.control.advanceState(state.effectiveDt,o);f.lastManual=Number(result.manualControl);f.lastFire=Number(result.canShipFire);f.lastDt=state.effectiveDt;
        const newDisabled=f.control.justDisabledMounts.slice(disabledBefore),newRepaired=f.control.justRepairedMounts.slice(repairedBefore);
        for(const m of newDisabled)if(newRepaired.includes(m)){sameStepRepair++;if(m.isPermanentlyDisabled)permanentSameStepRepair++;}
        o.finishStep(state);
      }
      core.step(dt);check('step '+step);
    }
    insist(disables>0&&repairs>0&&scheduledCritical>0&&explicitCritical>0&&armorCritical>0&&directCritical>0&&zeroCriticalFailures>0
      &&sameStepRepair>0&&permanentSameStepRepair>0&&scheduledZeroHull>0,'Weapon branch coverage missing');
    const f=fixtures[3],before=core.snapshot(),fresh=f.armor.getCellCenterLocal(7,1);
    insist(!f.scars.marks.some(m=>m.cellIndex===f.armor.cols+7),'Fresh scar rollback witness missing');
    rejected(()=>core.apply([{kind:'weapon-critical',id:f.id,handle:f.handle,componentId:4,permanent:true},
      {kind:'armor-component-impact',id:f.id,handle:f.handle,x:fresh.x,y:fresh.y,damage:4000,damageType:'ENERGY',applyHull:true},
      {kind:'weapon-critical',id:f.id,handle:{...f.handle,generation:f.handle.generation+1},componentId:1}]),4);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(before),'Failed weapon/armor/RNG transaction committed');
    rejected(()=>core.apply([{kind:'install-weapon-health',id:f.id,handle:f.handle,config:{componentId:999,size:'SMALL',mount:'TURRET'}}]),8);
    rejected(()=>core.apply([{kind:'component-repair-policy',id:f.id,handle:f.handle,componentId:1,canRepair:true,multiplier:2,underFire:false}]),8);
    const replay=encodeRustCommands([{kind:'initialize-weapons',id:f.id,handle:f.handle,facing:0,mounts:[],groups:[]}]);
    rejected(()=>core.applyPacked(replay),8);
    const initial=encodeRustCommands([{kind:'initialize-weapons',id:fixtures[2].id,handle:fixtures[2].handle,facing:.2,mounts:fixtures[2].weapons.map(w=>w.config),groups:[]}]);
    initial[0]=43;initial.set([0,...Array(21).fill(0)],4);rejected(()=>core.applyPacked(initial.subarray(0,26)),8);
    const emptyId=77777;core.apply([{kind:'spawn',id:emptyId,motion:new Float64Array(MOTION_WIDTH)}]);const emptyHandle=core.snapshot().bodies.at(-1)!.handle;
    core.apply([{kind:'initialize-ship',id:emptyId,handle:emptyHandle,config:{maxFlux:100,baseDissipation:0,hullSize:1}},
      {kind:'install-weapon-health',id:emptyId,handle:emptyHandle,config:{componentId:1,size:'SMALL',mount:'TURRET',deferTracker:true}}]);
    const emptyBefore=core.snapshot(),partial=encodeRustCommands([{kind:'initialize-weapons',id:emptyId,handle:emptyHandle,facing:0,mounts:[{componentId:1,refireDelay:1}],groups:[]}]);
    rejected(()=>core.applyPacked(partial.subarray(0,26*2)),8);insist(JSON.stringify(core.snapshot())===JSON.stringify(emptyBefore),'Partial weapon topology committed');
    const earlyDisable=encodeRustCommands([{kind:'component-disable',id:emptyId,handle:emptyHandle,componentId:1}]);
    const earlyPacket=new Float64Array(52);earlyPacket.set(partial.subarray(0,26));earlyPacket.set(earlyDisable,26);
    rejected(()=>core.applyPacked(earlyPacket),8);insist(JSON.stringify(core.snapshot())===JSON.stringify(emptyBefore),'Early partial-topology disable trapped or committed');
    const invalidBarrel=new Float64Array(partial);invalidBarrel[26*2+4+16]=.5;
    rejected(()=>core.applyPacked(invalidBarrel),2);insist(JSON.stringify(core.snapshot())===JSON.stringify(emptyBefore),'Invalid rack barrel committed');
    rejected(()=>core.apply([{kind:'initialize-weapons',id:emptyId,handle:emptyHandle,facing:0,mounts:[{componentId:1,refireDelay:1}],groups:[]},
      {kind:'weapon-policy',id:emptyId,handle:emptyHandle,policy:{malfunctionChance:1}}]),8);
    core.apply([{kind:'despawn',id:emptyId,handle:emptyHandle}]);
    const copy=core.snapshot();copy.bodies[3].ship!.weapons!.mounts[0][16]=1e8;copy.bodies[3].ship!.weapons!.values[8]=1;
    if(copy.bodies[3].ship!.weapons!.groups[0].members.length)copy.bodies[3].ship!.weapons!.groups[0].members[0]=999;
    if(copy.bodies[3].ship!.weapons!.justDisabled.length)copy.bodies[3].ship!.weapons!.justDisabled[0]=999;
    const stable=core.snapshot();insist(JSON.stringify(stable)===JSON.stringify(before),'Copied weapon projection wrote authority');
    // A prior live nonpermanent tracker crosses/reset its interval before the
    // last entity overflows. Both streams and all earlier mounts must roll back.
    core.step(6);insist(core.snapshot().bodies.slice(0,4).some(b=>b.ship!.components.some(c=>c.values[16]===1&&c.values[8]===0)),'Weapon step RNG rollback witness missing');
    const bad=fixtures[8];core.apply([{kind:'clock-input',id:bad.id,handle:bad.handle,phaseTimeBonus:.7,phaseEffect:0,externalTimeMultiplier:1e308}]);
    const stepBefore=core.snapshot();rejected(()=>core.step(2),7);insist(JSON.stringify(core.snapshot())===JSON.stringify(stepBefore),'Failed weapon step consumed state/RNG');
    core.apply([{kind:'despawn',id:f.id,handle:f.handle}]);core.apply([{kind:'spawn',id:f.id,motion:f.motion}]);
    rejected(()=>core.apply([{kind:'weapon-critical',id:f.id,handle:f.handle,componentId:1}]),4);
    return {passed:true,fullBattleReady:false,prior,fixtures:fixtures.length,weapons:fixtures.reduce((n,f)=>n+f.weapons.length,0),steps:100,
      exactWeaponHealthGroupDamageClockFields:exactFields,exactOrderedEvents:eventsChecked,rngWitnessFields:rngFields,geometryFields,maxGeometryDifference,geometryLog,
      disables,repairs,scheduledCritical,explicitCritical,armorCritical,directCritical,zeroCriticalFailures,sameStepRepair,permanentSameStepRepair,midLoopZeroHull,scheduledZeroHull,
      removedDuplicates,positiveCRVeto,temporaryOtherPermitted,actualShipWeaponAdvanceState:true,actualDisableComponent:true,actualShipCriticalDamage:true,
      actualShipPrepareIntegrateFinish:true,initialStateOnly:true,partialTopologyRejected:true,atomicWeaponAndRng:true,atomicStepAndRng:true,ownedPublication:true,
      fullEmissionExcluded:true,modifierCRProducerExcluded:true,productionConnected:false,performanceMeasured:false};
  }finally{core.dispose();}
}
