import {RustCombatCore,RustCoreCommandError} from '../../src/engine/runtime/rust/RustCombatCore';
import {RustEventKind as E,RustShipFlag as F,RustEngineState,RustHullSize,RustWeaponSize,RustWeaponMount,
  RustLifecycleFlag as L,RustLifecycleGate as G,RustUpkeepControl as U,encodeRustCommands,
  type RustBodyHandle,type RustEngineSlotConfig,type RustEngineMotionStats,type RustDamagePolicy,
  type RustWeaponHealthConfig} from '../../src/engine/runtime/rust/RustCoreProtocol';
// Actual game module initialization retains its Ship-first order.
import {Ship} from '../../src/engine/simulation/Ship';
import {EngineController,type EngineStatus} from '../../src/engine/simulation/systems/EngineController';
import {applyComponentDamage} from '../../src/engine/simulation/systems/weapon/ComponentDamage';
import {shipMotionStats} from '../../src/engine/simulation/systems/ShipMotion';
import {ShipSystem} from '../../src/engine/simulation/ShipSystem';
import {shipSystemDefinitions} from '../../src/engine/extensions/ship-systems/Registry';
import {ArmorGrid,type DamageType} from '../../src/engine/simulation/ArmorGrid';
import {ShipDamageState,type ScorchMark} from '../../src/engine/simulation/ShipDamageState';
import {Shield} from '../../src/engine/simulation/Shield';
import {FluxTracker} from '../../src/engine/simulation/FluxTracker';
import {SimulationRandom} from '../../src/engine/simulation/SimulationRandom';
import {Vector2} from '../../src/engine/math/Vector2';
import type {EngineSlotConfig,ShipSpec} from '../../src/engine/content/ShipSpec';
import type {WeaponMount} from '../../src/engine/simulation/Weapon';
import {weaponHealthProfile,createWeaponHealthTracker,damageWeaponComponent,advanceWeaponComponent} from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import {MOTION_WIDTH} from '../../src/engine/simulation/systems/MotionKernel';
import {checkRustCore as checkDamage} from './rust-core-damage-check';

function insist(value:unknown,label:string):asserts value{if(!value)throw Error(label);}
function exact(a:number,b:number,label:string){if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);}
function rejected(fn:()=>void,code:number){try{fn();}catch(e){insist(e instanceof RustCoreCommandError&&e.code===code,'Unexpected rejection '+String(e));return;}throw Error('Missing rejection '+code);}
interface EnginePrivate {sinceAcceleration:number;sinceSpread:number;forcePending:boolean;suppressMessage:boolean}
interface Weapon {config:RustWeaponHealthConfig;mount:WeaponMount}
interface Fixture {id:number;handle:RustBodyHandle;owner:Ship;controller:EngineController;system:ShipSystem;armor:ArmorGrid;
  scars:ShipDamageState;weapons:Weapon[];motion:Float64Array;motionStats:RustEngineMotionStats;damage:RustDamagePolicy;
  policy:[boolean,number,boolean,number,number];clock:number[];size:keyof typeof RustHullSize;slots:RustEngineSlotConfig[];healthMultiplier:number;
  observe:boolean;explicitCritical:boolean;radius:number}
type Expected=readonly [number,number,number,number,number,number,number];
const neutral:RustDamagePolicy={empMultiplier:1,weaponMultiplier:1,engineMultiplier:1,damageToWeapons:1,damageToEngines:1,
  baseCriticalDamage:170,criticalDamageMultiplier:1,crDamageMultiplier:1};
function damageWords(p:RustDamagePolicy){return [p.empMultiplier,p.weaponMultiplier,p.engineMultiplier,p.damageToWeapons,p.damageToEngines,
  p.baseCriticalDamage,p.criticalDamageMultiplier,p.crDamageMultiplier];}
function motionWords(s:RustEngineMotionStats){return [s.accelerationBase,s.accelerationPercent,s.accelerationMultiplier,s.decelerationBase,s.decelerationPercent,s.decelerationMultiplier,
  s.speedBase,s.speedPercent,s.speedMultiplier,s.turnAccelerationBaseDeg,s.turnAccelerationPercent,s.turnAccelerationMultiplier,
  s.turnRateBaseDeg,s.turnRatePercent,s.turnRateMultiplier,s.terrainMultiplier,s.readinessMultiplier,s.specAcceleration,s.specTurnAccelerationDeg,s.zeroFluxSpeedBonus,s.zeroFluxTurnMultiplier];}
function controllerWords(f:Fixture){const c=f.controller,p=c as unknown as EnginePrivate;
  return [RustHullSize[f.size],f.radius,f.healthMultiplier,f.slots.length,RustEngineState[c.state],c.cooldown,c.permanentlyDisabledFraction,
    Number(c.justFlamedOut),Number(c.justRestarted),Number(c.flameAccelerating),p.sinceAcceleration,p.sinceSpread,Number(p.forcePending),Number(p.suppressMessage),
    Number(f.policy[0]),f.policy[1],Number(f.policy[2]),f.policy[3],f.policy[4],1,...motionWords(f.motionStats),c.disabledFraction(true),c.disabledFraction(),c.movementMultiplier];}
function engineWords(e:EngineStatus,slot:RustEngineSlotConfig,index:number){const t=e.healthTracker;
  return [index,slot.x,slot.y,slot.width,slot.length,Number(slot.systemActivated??false),Number(!!slot.maneuver),...(slot.maneuver??[0,0,0]),
    e.health,e.maxHealth,Number(e.isDisabled),Number(e.isPermanentlyDisabled),t.repairDuration,t.hitAgo,t.interval,t.elapsed,Number(t.intervalElapsed),
    e.contribution,e.driftContribution,Number(e.temporaryMalfunction),Number(e.glowDisabled),e.currentThrust,e.prevThrust,e.spread,e.prevSpread];}
function weaponWords(w:Weapon){const m=w.mount,t=m.healthTracker,c=w.config;
  return [c.componentId,RustWeaponSize[c.size],RustWeaponMount[c.mount],c.x??0,c.y??0,m.health,m.maxHealth,Number(m.isDisabled),Number(m.isPermanentlyDisabled),
    m.disabledDuration,m.disabledTimer,Number(!!t),t?.repairDuration??0,t?.hitAgo??0,t?.interval??0,t?.elapsed??0,Number(t?.intervalElapsed??false),1,1,0];}
function scarWords(m:ScorchMark){return [m.cellIndex,m.localPos.x,m.localPos.y,m.opacity,m.intensity,m.heat,Number(m.justHit),m.flash,m.flashElapsed,m.phase,m.pulsePeriod,m.size,m.rotationRad,['cracks','burns','holes'].indexOf(m.kind),m.variant];}

/** Narrow owner inputs, real EngineController/Ship motion and critical methods,
 * real ComponentDamage/ArmorGrid/weapon health. No mock solver or full battle claim. */
export async function checkRustCore(source:BufferSource){
  const prior=await checkDamage(source),core=await RustCombatCore.create(source,917);
  const random=new SimulationRandom(917),visual=new SimulationRandom((917^0x9e3779b9)>>>0),fixtures:Fixture[]=[],events:Expected[]=[];
  let tick=0,time=0,sequence=0,exactFields=0,eventsChecked=0,rngFields=0,geometryFields=0,maxGeometryDifference=0;
  const geometryLog:{label:string;actual:number;expected:number;difference:number;limit:number}[]=[];
  let directCritical=0,armorCritical=0,zeroHealthSeen=0,flameouts=0,restarts=0,repairs=0,zeroCriticalChanceFailures=0;
  let scheduledCriticalDamage=0,nonlethalArmorCritical=0;
  const emit=(f:Fixture,kind:number,value=0,a=0,b=0,system=0)=>events.push([f.id,kind,value,a,b,system,tick]);
  function geometry(a:number,b:number,label:string){geometryFields++;
    if(Object.is(a,b))return;const difference=Math.abs(a-b),limit=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)));
    insist(Number.isFinite(a)&&Number.isFinite(b)&&difference<=limit,`${label}: geometry ${a} differs from ${b} by ${difference}`);
    maxGeometryDifference=Math.max(maxGeometryDifference,difference);geometryLog.push({label,actual:a,expected:b,difference,limit});
  }
  function setDamage(f:Fixture,p:RustDamagePolicy){f.damage=p;
    Object.assign(f.owner,{empDamageTakenMultiplier:p.empMultiplier,weaponDamageTakenMultiplier:p.weaponMultiplier,engineDamageTakenMultiplier:p.engineMultiplier,
      damageToTargetWeaponsMultiplier:p.damageToWeapons,damageToTargetEnginesMultiplier:p.damageToEngines,baseCriticalMalfunctionDamage:p.baseCriticalDamage,
      criticalMalfunctionDamageMultiplier:p.criticalDamageMultiplier});
    Object.defineProperty(f.owner,'crDamageTakenMultiplier',{value:p.crDamageMultiplier,configurable:true});
    core.apply([{kind:'damage-policy',id:f.id,handle:f.handle,policy:p}]);
  }
  function setPolicy(f:Fixture,p:Fixture['policy']){f.policy=p;f.owner.combatEngineRepairTimeMultiplier=p[1];f.owner.canRepairModulesUnderFire=p[2];
    Object.defineProperty(f.owner,'crEffects',{value:{engineMalfunctionChance:p[3],criticalMalfunctionChance:p[4]},configurable:true});
    core.apply([{kind:'engine-policy',id:f.id,handle:f.handle,canRepair:p[0],repairMultiplier:p[1],underFire:p[2],malfunctionChance:p[3],criticalChance:p[4]}]);}
  function context(f:Fixture){return {extendedGlow:f.owner.isEngineGlowExtended,systemActive:f.system.isActive};}
  function engine(f:Fixture,operation:'damage'|'disable'|'critical'|'force-flameout'|'restore'|'clear-events',index=0,value=0){
    if(operation==='damage')f.controller.damage(index,value,f.owner.isEngineGlowExtended);
    else if(operation==='disable'){const newly=f.controller.disable(index,context(f),value===1);emit(f,E.EngineDisableResult,Number(newly),index,value);}
    else if(operation==='critical'){f.explicitCritical=true;try{f.owner.applyCriticalMalfunction({kind:'engine',index},value===1);}finally{f.explicitCritical=false;}}
    else if(operation==='force-flameout')f.controller.forceFlameout(value===1);
    else if(operation==='restore'){f.observe=false;f.controller.restore();f.observe=true;}
    else f.controller.clearEvents();
    core.apply([{kind:'engine',id:f.id,handle:f.handle,operation,index,damage:value,permanent:value===1,suppressMessage:value===1}]);
  }
  const hulls=(Object.keys(RustHullSize) as Fixture['size'][]);
  try{
    for(let i=0;i<12;i++){
      const id=1700+i,size=hulls[i%6],radius=i===8?0:100;
      let slots:RustEngineSlotConfig[]=[{x:-20,y:-20,width:12,length:15},{x:-20,y:20,width:31,length:27},
        {x:20,y:0,width:99,length:50,systemActivated:true},{x:20,y:20,width:1,length:1,maneuver:[.7,-1,.5]}];
      if(i===6)slots=[{x:-20,y:0,width:20,length:20},{x:20,y:0,width:20,length:20,systemActivated:true}];
      if(i===7)slots=Array.from({length:3},(_,j)=>({x:-20,y:j*20-20,width:20,length:20}));
      if(i===8)slots=[{x:0,y:-20,width:10,length:10,systemActivated:true},{x:20,y:20,width:20,length:30,maneuver:[0,1,0]}];
      if(i===9)slots=[];
      if(i===10)slots=[{x:0,y:0,width:20,length:20,maneuver:[1,0,-1]}];
      const healthMultiplier=i===11?0:1.17;
      const motion=new Float64Array(MOTION_WIDTH);motion.set([i*100,-200,7,11,.2,.07,0,0,0,0,0,size==='FIGHTER'?128:0,35,33,110,.7,1.4,0,1,0,0,0]);
      core.apply([{kind:'spawn',id,motion}]);const handle=core.snapshot().bodies.at(-1)!.handle;
      const owner=Object.create(Ship.prototype) as Ship,flux=new FluxTracker(10000,35,size==='UNKNOWN'?'FRIGATE':size);
      const shield=new Shield(i===5?'PHASE':i===4?'OMNI':'NONE',360,100,1,0,amount=>flux.increaseFluxClamped(amount,true));
      const armor=new ArmorGrid(11,9,20,20,1100.37),scars=new ShipDamageState(armor,visual);
      const spec={id:'engine-domain-'+i,engineSlots:slots as EngineSlotConfig[],hullSize:size==='UNKNOWN'?undefined:size,
        collisionRadius:radius,acceleration:35,maxSpeed:110,deceleration:33,turnAccelerationDeg:40,maxTurnRateDeg:80,
        hullMods:[],builtInHullMods:[]} as ShipSpec;
      Object.assign(owner,{spec,flux,shield,armor,damageDecals:scars,random,hullHp:1e6,hullDamageSuppressed:false,hullDamageInterceptors:new Set(),
        hullStats:{hitpoints:1e6,phaseTimeBonusMultiplier:.8,fluxDissipation:35,systemUsesBonus:0,systemRegenMultiplier:1,systemCooldownMultiplier:1,systemFluxCostMultiplier:1,
          hardFluxDissipationFraction:0,zeroFluxMinimumFluxLevel:0,allowZeroFluxAtAnyLevel:0,peakCRSec:0,
          accelerationBonus:2.1,accelerationPercent:13,accelerationMultiplier:1.1,decelerationBonus:-1.1,decelerationPercent:-3,decelerationMultiplier:1.07,
          speedBonus:3.3,speedPercent:9,speedMultiplier:1.15,turnAccelerationPercent:7,turnAccelerationMultiplier:.94,turnRatePercent:11,turnRateMultiplier:1.03,
          zeroFluxSpeedBonus:2.7,zeroFluxTurnMultiplier:.7,forcedRightTurn:0},
        runtimeModifiers:{empty:false,value:{timeMultiplier:i%2?1.13:1}},moduleHardFluxFraction:0,
        parentShip:null,moduleMount:null,childModules:[],currentCR:.7,damageTakenModifiers:new Map(),
        statusEffects:new Map(),engineBoostLevel:0,phaseGhosts:[],justCriticalDamage:[],isDead:false,isRetreated:false,isDocked:false,retreating:false,
        terrainSpeedMult:.93,fleetSpeedBonusPercent:4,fireControlMode:'MANUAL',combatShips:[],
        pos:new Vector2(motion[0],motion[1]),prevPos:new Vector2(motion[0],motion[1]),vel:new Vector2(motion[2],motion[3]),facingRad:motion[4],angularVelRad:motion[5],
        aimTargetWorld:new Vector2(700,350),turnInput:0,brakeInput:false,throttle:0,strafeInput:0,
        advanceDeploymentReadiness:()=>{},applyCombatReadiness:(dt:number)=>{shield.sinceLastDamageTaken+=dt;}});
      const controller=new EngineController(spec,random,healthMultiplier);Object.assign(owner,{engineController:controller});
      const modifiers={speedFlat:1.7,accelerationFlat:1.2,decelerationFlat:.6,turnAccelerationFlat:2.3,turnRateFlat:-.7};
      Object.assign(owner.runtimeModifiers.value,modifiers);
      const name='RUST_ENGINE_POLICY_'+id,specId=id*100;
      shipSystemDefinitions.register({id:name,name,sourceIds:[],chargeUp:.1,active:12,chargeDown:.2,cooldown:.7,
        controls:{suppressZeroFlux:i===6,cancelOnFlameout:i===7},onInterrupt:()=>{const f=fixtures[i];emit(f,E.SystemInterrupt,0,0,0,1);}});
      const system=new ShipSystem(name,10000,owner);Object.assign(owner,{system,systems:[system],defenseSystem:system});
      Object.defineProperty(owner,'allSystems',{value:[system]});
      const stats:RustEngineMotionStats={accelerationBase:spec.acceleration+owner.hullStats.accelerationBonus+modifiers.accelerationFlat,accelerationPercent:13,accelerationMultiplier:1.1,
        decelerationBase:spec.deceleration+owner.hullStats.decelerationBonus+modifiers.decelerationFlat,decelerationPercent:-3,decelerationMultiplier:1.07,
        speedBase:spec.maxSpeed+owner.hullStats.speedBonus+modifiers.speedFlat,speedPercent:13,speedMultiplier:1.15,
        turnAccelerationBaseDeg:spec.turnAccelerationDeg+modifiers.turnAccelerationFlat,turnAccelerationPercent:7,turnAccelerationMultiplier:.94,
        turnRateBaseDeg:spec.maxTurnRateDeg+modifiers.turnRateFlat,turnRatePercent:11,turnRateMultiplier:1.03,
        terrainMultiplier:.93,readinessMultiplier:owner.crMovementMultiplier,specAcceleration:35,specTurnAccelerationDeg:40,zeroFluxSpeedBonus:2.7,zeroFluxTurnMultiplier:.7};
      const f:Fixture={id,handle,owner,controller,system,armor,scars,weapons:[],motion,motionStats:stats,damage:neutral,
        policy:[true,1,false,0,0],clock:[.8,0,i%2?1.13:1,0,0,0,0,0,0],size,slots,healthMultiplier,observe:true,explicitCritical:false,radius};fixtures.push(f);
      core.apply([{kind:'initialize-ship',id,handle,config:{maxFlux:10000,baseDissipation:35,hullSize:size==='UNKNOWN'?1:RustHullSize[size],flags:F.AllowDissipation,phaseTimeBonus:.8,externalTimeMultiplier:f.clock[2]}},
        {kind:'initialize-shield',id,handle,config:{type:shield.type,maxArc:360,radius:100,efficiency:1,upkeepRate:0}},
        {kind:'initialize-armor',id,handle,config:{cols:11,rows:9,cellWidth:20,cellHeight:20,armorRating:1100.37,maxHull:1e6}},
        {kind:'define-lifecycle',id:specId,spec:{chargeUp:.1,active:12,chargeDown:.2,cooldown:.7,maxCharges:0,chargeRegen:0,fluxCostPerUse:0,flags:L.Available|(i===7?L.CancelOnFlameout:0)}},
        {kind:'install-system',id,handle,systemId:1,specId},
        {kind:'system-upkeep',id,handle,systemId:1,policy:{gate:G.Applied,controls:i===6?U.ExtendEngineGlow:0}},
        {kind:'initialize-engines',id,handle,hullSize:size,radius,healthMultiplier,slots},
        {kind:'engine-motion-stats',id,handle,stats}]);
      setDamage(f,i===3?{...neutral,empMultiplier:.73,weaponMultiplier:1.19,engineMultiplier:.84,damageToWeapons:1.3,damageToEngines:.67,criticalDamageMultiplier:1.2,crDamageMultiplier:.9}:neutral);
      setPolicy(f,[true,1,false,0,0]);
      const nativeHull=Ship.prototype.applyHullDamage;
      owner.applyHullDamage=(damage:number)=>{const dealt=nativeHull.call(owner,damage);emit(f,E.HullApplied,dealt);return dealt;};
      const nativeDamage=EngineController.prototype.damage,nativeMalfunction=EngineController.prototype.malfunction;
      controller.damage=(index,damage,extended)=>{const before=controller.engines[index]?.health??0;nativeDamage.call(controller,index,damage,extended);
        emit(f,E.EngineDamage,before-(controller.engines[index]?.health??0),index);};
      controller.malfunction=(index,c,permanent=false)=>{const newly=nativeMalfunction.call(controller,index,c,permanent);
        if(!f.explicitCritical&&f.policy[4]===0)zeroCriticalChanceFailures++;
        if(f.explicitCritical)emit(f,E.EngineDisableResult,Number(newly),index,Number(permanent));return newly;};
      for(const [index,e]of controller.engines.entries()){
        let disabled=e.isDisabled;
        Object.defineProperty(e,'isDisabled',{get:()=>disabled,set:(value:boolean)=>{if(f.observe&&disabled&&!value){emit(f,E.EngineRepaired,0,index);repairs++;}disabled=value;},enumerable:true});
      }
      const pendingPush=controller.justDisabledEngines.push;
      controller.justDisabledEngines.push=function(...indices:number[]){for(const index of indices)emit(f,E.EngineDisabled,0,index);return pendingPush.apply(this,indices);};
      let justFlamed=controller.justFlamedOut,justRestarted=controller.justRestarted;
      Object.defineProperty(controller,'justFlamedOut',{get:()=>justFlamed,set:(v:boolean)=>{if(f.observe&&v){emit(f,E.EngineFlameout);flameouts++;}justFlamed=v;},enumerable:true});
      Object.defineProperty(controller,'justRestarted',{get:()=>justRestarted,set:(v:boolean)=>{if(f.observe&&v){emit(f,E.EngineRestart);restarts++;}justRestarted=v;},enumerable:true});
      owner.justCriticalDamage.push=function(...records:Ship['justCriticalDamage']){for(const record of records){
        if(record.armorDamage>0)armorCritical++;else directCritical++;
        if(!f.explicitCritical)scheduledCriticalDamage++;
        emit(f,E.CriticalArmor,record.armorDamage,record.local.x,record.local.y);emit(f,E.CriticalHull,record.hullDamage,record.local.x,record.local.y);
      }return Array.prototype.push.apply(this,records);};
      owner.applyCriticalMalfunctionDamage=local=>{
        const wasSafelyNonlethal=owner.hullHp>f.damage.baseCriticalDamage*1.25*f.damage.criticalDamageMultiplier;
        Ship.prototype.applyCriticalMalfunctionDamage.call(owner,local);
        if(wasSafelyNonlethal&&owner.justCriticalDamage.at(-1)!.armorDamage>0)nonlethalArmorCritical++;
      };
      armor.onCellDamage=(c,r,damage)=>{scars.onCellDamage(c,r,damage);emit(f,E.CellDamage,damage,c,r);};
      armor.takeDamage=(...args)=>{const result=ArmorGrid.prototype.takeDamage.apply(armor,args);
        emit(f,E.ArmorDamage,result.armorDamage);emit(f,E.ArmorHullDamage,result.hullDamage);emit(f,E.ResidualArmor,result.residualArmor);return result;};
      for(let w=0;w<7;w++){
        const config:RustWeaponHealthConfig={componentId:w+1,size:w%3===0?'LARGE':'SMALL',mount:w===6?'HIDDEN':w===5?'HARDPOINT':'TURRET',
          x:(w%4-2)*20,y:(Math.floor(w/4)-1)*20,deferTracker:w===4};
        const p=weaponHealthProfile(config.size,config.mount),mount={spec:{mountSize:config.size},mountType:config.mount,relativePos:new Vector2(config.x,config.y),
          health:p.health,maxHealth:p.health,isDisabled:false,isPermanentlyDisabled:false,disabledDuration:0,disabledTimer:0,
          healthTracker:config.deferTracker?undefined:createWeaponHealthTracker(p.repairDuration,random)} as WeaponMount;
        f.weapons.push({config,mount});core.apply([{kind:'install-weapon-health',id,handle,config}]);
      }
      Object.assign(owner,{weaponControl:{weapons:f.weapons.map(w=>w.mount),damageComponent:(mount:WeaponMount,damage:number)=>{
        const before=mount.health;damageWeaponComponent(mount,damage,random);emit(f,E.ComponentDamage,before-mount.health,f.weapons.find(w=>w.mount===mount)!.config.componentId);
      }}});
    }
    function check(label:string){const snapshot=core.snapshot();exact(snapshot.tick,tick,label+' tick');exact(snapshot.combatTime,time,label+' world time');
      random.checkpointWitness().forEach((n,i)=>{exact(snapshot.random[i],n,label+' combat RNG '+i);rngFields++;});
      visual.checkpointWitness().forEach((n,i)=>{exact(snapshot.visualRandom[i],n,label+' visual RNG '+i);rngFields++;});
      snapshot.bodies.forEach((body,i)=>{const f=fixtures[i],ship=body.ship!,c=ship.engines!,o=f.owner;
        controllerWords(f).forEach((n,k)=>{exact(c.values[k],n,`${label} controller ${i}/${k}`);exactFields++;});
        exact(c.engines.length,f.slots.length,label+' engine count');
        c.engines.forEach((e,j)=>engineWords(f.controller.engines[j],f.slots[j],j).forEach((n,k)=>{
          if(f.slots[j].maneuver&&(k===23||k===24))geometry(e[k],n,`${label} maneuver thrust ${i}/${j}/${k}`);
          else {exact(e[k],n,`${label} engine ${i}/${j}/${k}`);exactFields++;}
        }));
        exact(c.justDisabled.length,f.controller.justDisabledEngines.length,label+' disabled list count');
        c.justDisabled.forEach((n,k)=>{exact(n,f.controller.justDisabledEngines[k],label+' disabled list');exactFields++;});
        const flags=F.AllowDissipation|(o.shield.isActive?F.ShieldActive:0)|(o.isDead?F.Dead:0)|(o.isRetreated?F.Retreated:0)
          |(o.getFlameoutRatio()>=1||f.controller.isFlamedOut?F.FlamedOut:0);
        exact(ship.flags,flags,label+' flags '+i);
        f.clock[1]=o.shield.phaseEffectLevel;f.clock.forEach((n,k)=>{exact(ship.clock[k],n,`${label} clock ${i}/${k}`);exactFields++;});
        damageWords(f.damage).forEach((n,k)=>{exact(ship.damagePolicy[k],n,label+' damage policy');exactFields++;});
        exact(ship.armor!.values[14],o.hullHp,label+' hull '+i);exact(ship.armor!.values[12],f.armor.dirtyVersion,label+' armor revision');
        f.armor.copyCells().forEach((n,k)=>{exact(ship.armor!.cells[k],n,`${label} armor cell ${i}/${k}`);exactFields++;});
        f.weapons.forEach((w,j)=>weaponWords(w).forEach((n,k)=>{exact(ship.components[j].values[k],n,`${label} weapon ${i}/${j}/${k}`);exactFields++;}));
        exact(ship.armor!.scars.length,f.scars.marks.length,label+' scars count');
        ship.armor!.scars.forEach((m,j)=>scarWords(f.scars.marks[j]).forEach((n,k)=>{exact(m[k],n,`${label} scar ${i}/${j}/${k}`);exactFields++;}));
        for(let k=0;k<6;k++)geometry(body.motion[k],f.motion[k],`${label} motion ${i}/${k}`);
        for(let k=6;k<MOTION_WIDTH;k++){exact(body.motion[k],f.motion[k],`${label} motion rule ${i}/${k}`);exactFields++;}
        if(o.hullHp<=0)zeroHealthSeen++;
      });
      exact(snapshot.events.length,events.length,label+' event count');snapshot.events.forEach((e,i)=>{const expected=events[i],f=fixtures.find(f=>f.id===e.id)!;
        exact(e.sequence,sequence+i+1,label+' sequence');exact(e.id,expected[0],label+' event owner');exact(e.kind,expected[1],label+' event kind');
        exact(e.value,expected[2],label+' event value');exact(e.detail[0],expected[3],label+' event detail 0');exact(e.detail[1],expected[4],label+' event detail 1');
        exact(e.systemId,expected[5],label+' event system');exact(e.tick,expected[6],label+' event tick');exact(e.handle.slot,f.handle.slot,label+' event slot');exact(e.handle.generation,f.handle.generation,label+' event generation');eventsChecked++;});
      insist(JSON.stringify(core.snapshot())===JSON.stringify(snapshot),'Repeated engine publication changed authority');
      sequence=snapshot.lastEventSequence;core.acknowledgeEvents(sequence);events.length=0;
    }
    function syncMotionFlags(f:Fixture){f.motion[11]=((f.motion[11]&~1)|(f.controller.isFlamedOut?1:0));}
    // Initial engine stats remain the spawn row until the first resident motion stage.
    check('initial');
    function propagate(f:Fixture,x:number,y:number,armorDamage:number,hullDamage:number,emp:number,source?:Fixture){
      applyComponentDamage(f.owner,new Vector2(x,y),{armorDamage,hullDamage},emp,source?.owner);
      core.apply([{kind:'propagate-components',id:f.id,handle:f.handle,x,y,armorDamage,hullDamage,emp,source:source?{id:source.id,handle:source.handle}:undefined}]);
    }
    function impact(f:Fixture,x:number,y:number,damage:number,damageType:DamageType,emp:number,source?:Fixture,applyHull=true){
      const result=f.armor.takeDamage(new Vector2(x,y),damage,damageType);
      if(applyHull)f.owner.applyHullDamage(result.hullDamage);applyComponentDamage(f.owner,new Vector2(x,y),result,emp,source?.owner);
      core.apply([{kind:'armor-component-impact',id:f.id,handle:f.handle,x,y,damage,damageType,emp,applyHull,source:source?{id:source.id,handle:source.handle}:undefined}]);
    }
    for(const f of fixtures){if(f.slots.length)engine(f,'damage',0,f.controller.engines[0].maxHealth*.3);propagate(f,-20,0,17,13,19,fixtures[3]);}
    for(const [index,f]of fixtures.entries())if(index===6||index===7){insist(f.system.activate(),'Reference system activation failed');
      emit(f,E.SystemResult,1,0,0,1);core.apply([{kind:'system',id:f.id,handle:f.handle,systemId:1,operation:'activate'}]);}
    check('commands');
    for(let step=0;step<150;step++){
      if(step===2){engine(fixtures[0],'disable',0);engine(fixtures[0],'disable',1);engine(fixtures[1],'force-flameout');engine(fixtures[2],'force-flameout',0,1);engine(fixtures[9],'force-flameout',0,1);}
      if(step===3){engine(fixtures[6],'critical',0,1);syncMotionFlags(fixtures[6]);
        insist(fixtures[6].controller.engines[0].isPermanentlyDisabled&&!fixtures[6].controller.engines[0].isDisabled,'Extended last-engine veto not reached');
        engine(fixtures[6],'critical',0,1);syncMotionFlags(fixtures[6]);}
      if(step===4){engine(fixtures[7],'disable',0);engine(fixtures[7],'disable',1);setPolicy(fixtures[7],[false,.2,false,0,0]);}
      if(step===5){fixtures[5].owner.shield.setActive(true);emit(fixtures[5],E.ShieldResult);core.apply([{kind:'shield',id:fixtures[5].id,handle:fixtures[5].handle,operation:'raise-raw'}]);
        engine(fixtures[5],'damage',2,1e4);}
      if(step===8)setPolicy(fixtures[7],[true,.2,true,0,0]);
      if(step===10){engine(fixtures[3],'restore');syncMotionFlags(fixtures[3]);setPolicy(fixtures[3],[true,.83,true,1,1]);setPolicy(fixtures[4],[true,1,true,.8,0]);}
      if(step===11){engine(fixtures[8],'damage',0,1e4);engine(fixtures[8],'disable',0,1);}
      if(step===20){setDamage(fixtures[0],{...neutral,empMultiplier:-1});propagate(fixtures[0],0,0,0,0,100);propagate(fixtures[0],-1e8,1e8,0,0,-100,fixtures[3]);}
      if(step===22)setDamage(fixtures[0],neutral);
      if(step===25){for(const f of fixtures.slice(0,4)){engine(f,'restore');syncMotionFlags(f);}setPolicy(fixtures[3],[true,.83,true,0,0]);}
      if(step===27)for(let attempt=0;attempt<12&&nonlethalArmorCritical===0;attempt++)engine(fixtures[2],'critical',0);
      if(step===30){
        // Use direct damage to reach the low-HP boundary without replacing authority.
        const current=core.snapshot().bodies[1].ship!.armor!.values[14];fixtures[1].owner.hullHp=current;
        fixtures[1].owner.applyHullDamage(current-20);core.apply([{kind:'hull-damage',id:fixtures[1].id,handle:fixtures[1].handle,damage:current-20}]);
        engine(fixtures[1],'critical',0,1);syncMotionFlags(fixtures[1]);}
      if(step===35){setPolicy(fixtures[0],[true,0,true,0,0]);engine(fixtures[0],'disable',0);}
      if(step===42){fixtures[2].owner.hullDamageSuppressed=true;core.apply([{kind:'armor-stats',id:fixtures[2].id,handle:fixtures[2].handle,
        stats:{effectiveMultiplier:1,dynamicMultiplier:1,maxReduction:.85,minResidualMultiplier:1,incoming:[1,1,1,1,1,1,1,1],hullSuppressed:true}}]);engine(fixtures[2],'critical',0);}
      if(step===48){fixtures[2].owner.hullDamageSuppressed=false;core.apply([{kind:'armor-stats',id:fixtures[2].id,handle:fixtures[2].handle,
        stats:{effectiveMultiplier:1,dynamicMultiplier:1,maxReduction:.85,minResidualMultiplier:1,incoming:[1,1,1,1,1,1,1,1]}}]);}
      if(step%13===0)for(const f of fixtures.slice(0,6))impact(f,step%26===0?-20:20,step%39===0?0:20,57.3,['ENERGY','KINETIC','HIGH_EXPLOSIVE','FRAGMENTATION'][step%4] as DamageType,17.2,fixtures[3],step%2===0);
      if(step%17===0)for(const f of fixtures){engine(f,'clear-events');syncMotionFlags(f);}
      for(const [i,f]of fixtures.entries()){
        const control=step%8;f.owner.turnInput=control===0?.3:control===3?-.4:0;f.owner.throttle=control===1?.7:control===4?-.3:0;
        f.owner.strafeInput=control===2?.4:control===5?-.6:0;f.owner.brakeInput=control===6;
        f.motion[7]=f.owner.turnInput;f.motion[8]=Number(f.owner.brakeInput);f.motion[9]=f.owner.throttle;f.motion[10]=f.owner.strafeInput;syncMotionFlags(f);
        core.apply([{kind:'controls',id:f.id,handle:f.handle,turn:f.motion[7],brake:f.owner.brakeInput,throttle:f.motion[9],strafe:f.motion[10],flags:f.motion[11]}]);
        if(step===60&&i===3)setDamage(f,{...f.damage,damageToWeapons:.77,damageToEngines:1.5});
      }
      check('commands '+step);
      const dt=[1/60,.04,.05,.1,.31,.61,1.7,3][step%8];time+=dt;tick++;
      for(const f of fixtures){const o=f.owner;
        const state=o.prepareStep(dt,null);if(!state)continue;
        f.clock[3]=dt;f.clock[4]=state.tacticalDt;f.clock[5]=state.effectiveDt;f.clock[6]+=dt;f.clock[7]+=state.tacticalDt;f.clock[8]+=state.effectiveDt;
        const stats=shipMotionStats(o);f.motion[6]=state.effectiveDt;f.motion.set([stats.acceleration,stats.deceleration,stats.maxSpeed,stats.turnAcceleration,stats.maxTurnRate,stats.driftAcceleration,stats.strafeMultiplier],12);
        o.integrateStep(state);f.motion.set([o.pos.x,o.pos.y,o.vel.x,o.vel.y,o.facingRad,o.angularVelRad],0);
        f.motion[19]=Number(state.engineCommands.accelerating);f.motion[20]=Number(state.engineCommands.spreading);
        for(const w of f.weapons){const e=advanceWeaponComponent(w.mount,state.effectiveDt,random,true);
          if(e.disabled)emit(f,E.ComponentDisabled,0,w.config.componentId);if(e.repaired)emit(f,E.ComponentRepaired,0,w.config.componentId);}
        if(f.policy[0])o.finishStep(state);
        else {o.updateScorchMarks(dt);f.controller.advance(state.effectiveDt,{...context(f),...state.engineCommands,maneuver:state.maneuver,
          canRepair:false,repairTimeMultiplier:f.policy[1],canRepairUnderFire:f.policy[2],malfunctionChance:f.policy[3],criticalMalfunctionChance:f.policy[4],
          onCriticalMalfunction:index=>o.applyCriticalMalfunctionDamage(new Vector2(f.slots[index].x,f.slots[index].y))});}
        syncMotionFlags(f);
      }
      core.step(dt);check('step '+step);
    }
    insist(flameouts>0&&restarts>0&&repairs>0&&armorCritical>0&&directCritical>0&&zeroHealthSeen>0&&zeroCriticalChanceFailures>0
      &&scheduledCriticalDamage>0&&nonlethalArmorCritical>0,'Engine coverage branch missing');
    const f=fixtures[0],before=core.snapshot(),newSlot:RustEngineSlotConfig={x:0,y:0,width:20,length:20};
    // Earlier operations create scars/lazy health RNG; later source generation
    // rejection must roll all domains and both streams back together.
    const lazy=f.weapons[4];const lazyBefore=before.bodies[0].ship!.components[4].values[11];
    const newScar=f.armor.getCellCenterLocal(8,2);
    insist(!f.scars.marks.some(m=>m.cellIndex===2*f.armor.cols+8),'Rollback visual allocation witness missing');
    rejected(()=>core.apply([{kind:'install-weapon-health',id:f.id,handle:f.handle,config:{componentId:900,size:'LARGE',mount:'TURRET'}},
      {kind:'armor-component-impact',id:f.id,handle:f.handle,x:newScar.x,y:newScar.y,damage:1e4,damageType:'ENERGY',applyHull:true},
      {kind:'propagate-components',id:f.id,handle:f.handle,x:0,y:0,armorDamage:1,hullDamage:0,emp:2,
        source:{id:fixtures[3].id,handle:{...fixtures[3].handle,generation:fixtures[3].handle.generation+1}}}]),4);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(before),'Failed propagation transaction committed damage/RNG');
    rejected(()=>core.apply([{kind:'initialize-engines',id:f.id,handle:f.handle,hullSize:f.size,radius:f.radius,slots:[newSlot]}]),8);
    const incomplete=encodeRustCommands([{kind:'initialize-engines',id:f.id,handle:f.handle,hullSize:f.size,radius:f.radius,slots:[newSlot]}]);
    const emptyId=99999;core.apply([{kind:'spawn',id:emptyId,motion:new Float64Array(MOTION_WIDTH)}]);const emptyHandle=core.snapshot().bodies.at(-1)!.handle;
    core.apply([{kind:'initialize-ship',id:emptyId,handle:emptyHandle,config:{maxFlux:100,baseDissipation:0,hullSize:1}}]);
    incomplete[1]=emptyId;incomplete[2]=emptyHandle.slot;incomplete[3]=emptyHandle.generation;
    const emptyBefore=core.snapshot();rejected(()=>core.applyPacked(incomplete.subarray(0,26)),8);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(emptyBefore),'Partial engine topology committed');
    rejected(()=>core.apply([{kind:'engine-policy',id:emptyId,handle:emptyHandle,canRepair:true,repairMultiplier:1,underFire:false,malfunctionChance:1}]),8);
    core.apply([{kind:'despawn',id:emptyId,handle:emptyHandle}]);
    const copied=core.snapshot();copied.bodies[0].ship!.engines!.values[4]=99;copied.bodies[0].ship!.engines!.engines[0][10]=1e8;
    if(copied.bodies[0].ship!.engines!.justDisabled.length)copied.bodies[0].ship!.engines!.justDisabled[0]=99;
    insist(JSON.stringify(core.snapshot())===JSON.stringify(before),'Published engine data wrote authority');
    // Ensure an earlier engine has a pending interval so the failed step reaches
    // a real RNG draw, then overflow the last ship's sampled clock.
    core.step(6);insist(core.snapshot().bodies[0].ship!.engines!.engines.some(e=>e[18]===1&&e[13]===0),'Rollback RNG interval witness missing');
    const bad=fixtures.at(-1)!;core.apply([{kind:'clock-input',id:bad.id,handle:bad.handle,phaseTimeBonus:.8,phaseEffect:bad.owner.shield.phaseEffectLevel,externalTimeMultiplier:1e308}]);
    const badBefore=core.snapshot();rejected(()=>core.step(2),7);insist(JSON.stringify(core.snapshot())===JSON.stringify(badBefore),'Failed engine step consumed state or RNG');
    core.apply([{kind:'despawn',id:f.id,handle:f.handle}]);core.apply([{kind:'spawn',id:f.id,motion:f.motion}]);
    rejected(()=>core.apply([{kind:'engine',id:f.id,handle:f.handle,operation:'damage',index:0,damage:1}]),4);
    return {passed:true,fullBattleReady:false,prior,fixtures:fixtures.length,engines:fixtures.reduce((n,f)=>n+f.slots.length,0),weapons:fixtures.reduce((n,f)=>n+f.weapons.length,0),steps:150,
      exactEnginePropagationDamageClockFields:exactFields,exactOrderedEvents:eventsChecked,rngWitnessFields:rngFields,geometryFields,maxGeometryDifference,geometryLog,
      flameouts,restarts,repairs,armorCritical,directCritical,zeroHealthSeen,zeroCriticalChanceFailures,scheduledCriticalDamage,nonlethalArmorCritical,
      actualEngineController:true,actualShipMotionStats:true,actualShipPrepareIntegrateFinish:true,actualComponentDamage:true,actualShipCriticalDamage:true,
      sourceHandlesValidated:true,extendedLastEnginePermanentVeto:true,emptyForcePending:true,restorePreservesRandomIntervals:true,
      atomicDamageAndRng:true,atomicStepAndRng:true,ownedPublication:true,partialTopologyRejected:true,
      fullFiringExcluded:true,crProducerAndDeploymentExcluded:true,fullHitSelectionExcluded:true,productionConnected:false,performanceMeasured:false,
      lazyTrackerWitness:{componentId:lazy.config.componentId,trackerPresentBeforeRollback:lazyBefore}};
  }finally{core.dispose();}
}
