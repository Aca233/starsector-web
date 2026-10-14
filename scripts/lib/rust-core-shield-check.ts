import { RustCombatCore, RustCoreCommandError } from '../../src/engine/runtime/rust/RustCombatCore';
import { RustEventKind as E, RustShipFlag as F, RustShieldField as S, RustShieldType,
  RustLifecycleFlag as L, RustLifecycleGate as G, RustUpkeepControl as U,
  type RustShieldConfig, type RustBodyHandle, type RustLifecycleSpec,
  type RustUpkeepPolicy, type RustShieldOperation, type RustVoidShieldSpec } from '../../src/engine/runtime/rust/RustCoreProtocol';
// Ship first: preserve the established module initialization order.
import { Ship } from '../../src/engine/simulation/Ship';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { Shield } from '../../src/engine/simulation/Shield';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Vector2 } from '../../src/engine/math/Vector2';
import { shipSystemDefinitions } from '../../src/engine/extensions/ship-systems/Registry';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { MOTION_WIDTH, MotionField as M, advanceMotionRow } from '../../src/engine/simulation/systems/MotionKernel';
import { checkRustCore as checkLifecycle } from './rust-core-lifecycle-check';

const insist=(condition:unknown,message:string):void=>{if(!condition)throw Error(message);};
function exact(actual:number,expected:number,label:string):void {
  if(!Object.is(actual,expected))throw Error(`${label}: ${actual} differs from ${expected}`);
}
function rejected(action:()=>void,code:number):void {
  try{action();}catch(e){insist(e instanceof RustCoreCommandError&&e.code===code,'Unexpected rejection '+String(e));return;}
  throw Error('Missing rejection '+code);
}
const states=['IDLE','IN','ACTIVE','OUT','COOLDOWN'];
type Expected=readonly [number,number,number,number,number];
interface Fixture {
  id:number;handle:RustBodyHandle;owner:Ship;shield:Shield;flux:FluxTracker;config:RustShieldConfig;
  motion:Float64Array;clock:number[];flags:number;policies:RustUpkeepPolicy[];systems:ShipSystem[];
  external:number[];blocked:boolean;defenseAim?:number;rightClick:boolean;
}
function fluxWords(f:FluxTracker):number[]{return [f.maxFlux,f.baseDissipation,1,f.ventRateMultiplier,f.overloadTimeMultiplier,
  f.shieldSoftFluxConversion,f.dissipationMultiplier,f.boostDelay,f.softFlux,f.hardFlux,f.timeSinceFluxIncrease,
  Number(f.isOverloaded),f.overloadTimer,f.overloadDuration,Number(f.isVenting),f.ventProgress,f.initialVentFlux,f.zeroFluxTimer,Number(f.isEngineBoostActive)];}
function shieldWords(f:Fixture):number[]{
  const s=f.shield,p=s as unknown as {closeTimeRemaining:number;pendingRaise:boolean;phaseStageTimer:number;pendingActivationCost:number};
  const v=s.voidShield;
  return [RustShieldType[s.type],s.maxArcDeg,s.radius,s.efficiency,s.upkeepRate,Number(s.toggleLocked),Number(s.isActive),s.currentArcDeg,
    s.facingAngleRad,s.targetFacingAngleRad,p.closeTimeRemaining,Number(p.pendingRaise),s.unfoldRateMultiplier,s.turnRateMultiplier,
    states.indexOf(s.phaseState),s.phaseEffectLevel,s.phaseMinSpeedFluxThresholdMultiplier,s.phaseChargeUpDuration,s.phaseChargeDownDuration,
    s.phaseCooldownDuration,s.phaseActivationCost,s.phaseUpkeepPerSecond,Number(s.phaseCanNotCauseOverload),p.phaseStageTimer,p.pendingActivationCost,
    Number(s.forcedPhaseEffectLevel!==undefined),s.forcedPhaseEffectLevel??0,s.getPhaseSpeedMultiplier(f.flux.hardFlux/f.flux.maxFlux),s.sinceLastDamageTaken,
    f.config.centerX??0,f.config.centerY??0,f.owner.aimTargetWorld.x,f.owner.aimTargetWorld.y,Number(f.defenseAim!==undefined),f.defenseAim??0,Number(f.blocked),
    ...f.external,Number(!!v),1.17,.91,1.03,Number(f.rightClick),
    ...(v?[v.layers,v.integrityPerLayer,v.rechargePerSecond,v.hitDelay,v.restartDelay,v.integrity,v.rebuild,v.quietRemaining,v.restartRemaining,
      Number(v.armed),Number(v.suppressed),v.breaks,v.visualHitRemaining,v.visualHitAngle,v.visualHitStrength,v.visualBreakRemaining,v.visualRestartRemaining,v.visualShutdownRemaining,Number(v.visualCollapse)]:Array(19).fill(0)),0];
}
function systemWords(s:ShipSystem,id:number,specId:number):number[]{
  const p=s as unknown as {pendingActivationFlux:number;pendingActivationEvents:number;pendingActiveEvents:number;chargeRegenTimer:number;stageTimer:number;outEntryEffectLevel:number};
  return [id,specId,states.indexOf(s.state),s.effectLevel,Number(s.isActive),Number(s.isCoolingDown),s.activeTimer,s.cooldownTimer,s.charges,s.activationSerial,
    p.pendingActivationFlux,p.pendingActivationEvents,p.pendingActiveEvents,p.chargeRegenTimer,p.stageTimer,p.outEntryEffectLevel,Number(s.disabled)];
}

/** Actual Shield + Ship.prepareStep/integrateStep. Owner adapters disable only
 * unported CR/deployment domains and inject already-resolved motion stats;
 * no fee, phase, shield, or hull-flux algorithm is stubbed or patched. */
export async function checkRustCore(source:BufferSource){
  const prior=await checkLifecycle(source),core=await RustCombatCore.create(source,917);
  const fixtures:Fixture[]=[],expected:Expected[]=[];
  let selected:Fixture|undefined,tick=0,time=0,sequence=0,exactFields=0,eventsChecked=0,geometryDifferences=0,maxGeometryDifference=0;
  const geometryLog:{field:string;actual:number;expected:number;difference:number}[]=[];
  function geometry(actual:number,expectedValue:number,label:string):void{
    insist(Number.isFinite(actual)&&Number.isFinite(expectedValue),label+' non-finite geometry differs');
    const difference=Math.abs(actual-expectedValue);
    insist(difference<=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(actual),Math.abs(expectedValue))),label+' geometry exceeds allowance');
    geometryDifferences++;maxGeometryDifference=Math.max(maxGeometryDifference,difference);
    geometryLog.push({field:label,actual,expected:expectedValue,difference});
  }
  const emit=(f:Fixture,kind:number,value=0,system=0)=>expected.push([f.id,system,kind,value,tick]);
  const audioKinds:Record<string,number>={overload:E.OverloadAudio,shield_up:E.ShieldUp,shield_down:E.ShieldDown,
    phase_activate:E.PhaseActivate,phase_deactivate:E.PhaseDeactivate,flux_vent:E.VentAudio};
  const stopAudio=captureCombatAudio(a=>{
    insist(selected,'Audio without selected owner');
    if(a.kind==='play'&&audioKinds[a.key])emit(selected!,audioKinds[a.key],a.key==='overload'?0:a.volume);
    else if(a.kind==='loop'&&a.key==='flux_flush_loop')emit(selected!,a.active?E.VentLoopStart:E.VentLoopStop,a.active?a.volume:0);
    else throw Error('Unexpected shield audio '+JSON.stringify(a));
  });
  const normal:RustShieldConfig={type:'FRONT',maxArc:180,radius:250,efficiency:.8,upkeepRate:44,initialActive:true};
  const phase:RustShieldConfig={...normal,type:'PHASE',initialActive:false,upkeepRate:26,phaseActivationCost:45,phaseUpkeep:26};
  const configs:RustShieldConfig[]=[
    {...normal,type:'NONE',initialActive:false,upkeepRate:0},normal,
    {...normal,type:'OMNI',maxArc:220,radius:150,initialActive:false},phase,
    {...phase,phaseChargeUp:0,phaseChargeDown:0,phaseCooldown:0,phaseActivationCost:1000,phaseUpkeep:1000},
    {...phase,phaseChargeUp:.17,phaseChargeDown:.7,phaseCooldown:0,phaseCannotOverload:false},
    {...normal,type:'OMNI',maxArc:360,upkeepRate:0},
    {...normal,type:'OMNI',maxArc:360,upkeepRate:0},
    {...normal,radius:0,upkeepRate:130},
    {...normal,type:'OMNI',maxArc:360,radius:600,centerX:30,centerY:-17},
    {...normal,type:'OMNI',rightClickSystem:true},
    {...normal,type:'OMNI'},
    {...normal,toggleLocked:true},
    {...phase,phaseThresholdMultiplier:0},
  ];
  const defaultSpec:RustLifecycleSpec={chargeUp:.15,active:1,chargeDown:.4,cooldown:.8,maxCharges:3,chargeRegen:.5,fluxCostPerUse:13,flags:L.Available|L.UsesCharges};
  const programs:Record<number,RustUpkeepPolicy[]>={
    9:[{gate:G.Applied,softFluxPerSecond:13.5,hardFluxCapacityFraction:.02,shieldUpkeepBase:1.2,shieldUpkeepEffectSlope:.2},
      {gate:G.ACTIVE,softFluxPerSecond:11.2,hardFluxPerSecond:4,shieldUpkeepBase:1.5,shieldUpkeepEffectSlope:-.25,controls:U.BlockDissipation|U.ReleaseOnOut},
      {gate:G.Applied,hardFluxCapacityFraction:.01,shieldUpkeepBase:.9,shieldUpkeepEffectSlope:.1}],
    10:[{gate:G.Applied,softFluxPerSecond:1,controls:U.BlockShields|U.BlockVenting|U.LockTurning},
      {gate:G.Applied,hardFluxCapacityFraction:.07,shieldUpkeepBase:0}],
    11:[{gate:G.Applied,shieldUpkeepBase:1,shieldUpkeepEffectSlope:.5},
      {gate:G.Applied,softFluxPerSecond:500,hardFluxCapacityFraction:.01},
      {gate:G.Applied,hardFluxPerSecond:700,controls:U.BlockShields}],
  };
  const actualBarrier=shipSystemDefinitions.all().find(d=>d.name==='护盾超载');
  insist(actualBarrier?.modifiers,'Registered Adun barrier resource reader missing');
  try{
    for(let index=0;index<configs.length;index++){
      const id=500+index,config=configs[index],motion=new Float64Array(MOTION_WIDTH);
      motion.set([30+index*19,-13-index,5,7,.2,.15,0,.1,0,.25,.3,0,33,29,110,.7,1.4,0,.5,0,0,0]);
      core.apply([{kind:'spawn',id,motion}]);const handle=core.snapshot().bodies.at(-1)!.handle;
      const flux=new FluxTracker(1000,55,'FRIGATE');
      Object.assign(flux,{softFlux:120,hardFlux:90,ventRateMultiplier:1.15,overloadTimeMultiplier:.65,shieldSoftFluxConversion:.17,boostDelay:.81});
      core.apply([{kind:'initialize-ship',id,handle,config:{maxFlux:1000,baseDissipation:55,hullSize:1,
        softFlux:120,hardFlux:90,ventRateMultiplier:1.15,overloadTimeMultiplier:.65,shieldSoftFluxConversion:.17,boostDelay:.81,
        phaseTimeBonus:.8,externalTimeMultiplier:1.13,hardFluxDissipationFraction:.23,zeroFluxMinimum:.2,allowZeroFluxAtAnyLevel:1}}]);
      const owner=Object.create(Ship.prototype) as Ship;
      const shield=new Shield(config.type,config.maxArc,config.radius,config.efficiency,config.upkeepRate,amount=>flux.increaseFluxClamped(amount,true));
      Object.assign(shield,{unfoldRateMultiplier:1,turnRateMultiplier:1,phaseChargeUpDuration:config.phaseChargeUp??.5,
        phaseChargeDownDuration:config.phaseChargeDown??.5,phaseCooldownDuration:config.phaseCooldown??2,
        phaseActivationCost:config.phaseActivationCost??0,phaseUpkeepPerSecond:config.phaseUpkeep??0,
        phaseMinSpeedFluxThresholdMultiplier:config.phaseThresholdMultiplier??1,toggleLocked:config.toggleLocked??false,
        phaseCanNotCauseOverload:config.phaseCannotOverload??true,energyDamageTakenMultiplier:.91});
      shield.damageTakenModifiers.set('domain',1.17);shield.externalDamageTakenMultiplier=()=>1.03;
      shield.setActive(config.initialActive??false);core.apply([{kind:'initialize-shield',id,handle,config},
        {kind:'shield-mitigation',id,handle,damageMultiplier:1.17,energyMultiplier:.91,externalMultiplier:1.03}]);
      const f:Fixture={id,handle,owner,shield,flux,config,motion,clock:[.8,shield.phaseEffectLevel,1.13,0,0,0,0,0,0],
        flags:F.AllowDissipation|(shield.isActive?F.ShieldActive:0),policies:programs[index]??[],systems:[],external:[1.03,index%2?3:0,index%3?4:0],blocked:false,rightClick:config.rightClickSystem??false};
      fixtures.push(f);selected=f;
      Object.assign(owner,{flux,shield,hullStats:{phaseTimeBonusMultiplier:.8,fluxDissipation:55,systemUsesBonus:0,systemRegenMultiplier:1,
        systemCooldownMultiplier:1,systemFluxCostMultiplier:1,hardFluxDissipationFraction:.23,zeroFluxMinimumFluxLevel:.2,allowZeroFluxAtAnyLevel:1,
        ventRateMultiplier:1.15,peakCRSec:0,weaponMalfunctionChanceBonus:0,criticalMalfunctionChanceBonus:0},moduleHardFluxFraction:0,
        parentShip:null,moduleMount:null,childModules:[],currentCR:.7,crMalfunctionRangeMultiplier:1,criticalMalfunctionChanceMultiplier:1,
        spec:{id:'shield-domain-'+index,engineSlots:[],hullMods:[],builtInHullMods:[],hullSize:'FRIGATE',shieldCenterX:config.centerX,shieldCenterY:config.centerY,
          acceleration:33,turnAccelerationDeg:40,rightClickSystemType:f.rightClick?'DOMAIN':undefined},
        statusEffects:new Map(),engineBoostLevel:0,engineController:{engines:[],isFlamedOut:false},
        runtimeModifiers:{empty:false,value:{timeMultiplier:1.13,shieldUpkeepMultiplier:f.external[0],softFluxPerSecond:f.external[1],hardFluxPerSecond:f.external[2]}},
        isDead:false,isRetreated:false,isDocked:false,retreating:false,hullHp:1,combatShips:[],
        aimTargetWorld:new Vector2(400,-200),pos:new Vector2(motion[0],motion[1]),prevPos:new Vector2(motion[0],motion[1]),vel:new Vector2(motion[2],motion[3]),facingRad:motion[4],angularVelRad:motion[5],
        fireControlMode:'MANUAL',advanceDeploymentReadiness:()=>{},applyCombatReadiness:(dt:number)=>{shield.sinceLastDamageTaken+=dt;}});
      flux.onOverloadStarted=()=>{
        if(shield.voidShield){shield.voidShield.suppressed=true;shield.isActive=false;shield.currentArcDeg=0;}
        else shield.setActive(false);
        emit(f,E.OverloadStarted);f.flags=(f.flags&~F.ShieldActive)|(shield.isActive?F.ShieldActive:0);f.clock[1]=shield.phaseEffectLevel;
      };
      for(let slot=0;slot<f.policies.length;slot++){
        const p=f.policies[slot],specId=id*100+slot,name='RUST_SHIELD_POLICY_'+specId;
        const spec={...defaultSpec,flags:index===11&&slot===1?0:defaultSpec.flags};
        shipSystemDefinitions.register({id:name,name,sourceIds:[],chargeUp:spec.chargeUp,active:spec.active,chargeDown:spec.chargeDown,cooldown:spec.cooldown,
          charges:3,chargeRegen:.5,fluxPerUseFlat:13,unavailable:spec.flags===0,
          controls:{blockShields:!!((p.controls??0)&U.BlockShields),blockFluxDissipation:!!((p.controls??0)&U.BlockDissipation),
            blockVenting:!!((p.controls??0)&U.BlockVenting),lockTurning:!!((p.controls??0)&U.LockTurning),releaseOnOut:!!((p.controls??0)&U.ReleaseOnOut)},
          modifiers:index===11&&slot===0?actualBarrier!.modifiers:(system,capacity)=>{
            if(!(p.gate&(1<<states.indexOf(system.state))))return {};
            return {softFluxPerSecond:p.softFluxPerSecond??0,hardFluxPerSecond:(p.hardFluxPerSecond??0)+capacity*(p.hardFluxCapacityFraction??0),
              shieldUpkeepMultiplier:(p.shieldUpkeepBase??1)+(p.shieldUpkeepEffectSlope??0)*system.effectLevel,zeroFluxBoostSuppressed:p.zeroFluxBoostSuppressed??0};
          },onInterrupt:()=>emit(f,E.SystemInterrupt,0,slot+1),onReset:()=>emit(f,E.SystemReset,0,slot+1)});
        const system=new ShipSystem(name,1000,owner);f.systems.push(system);
        core.apply([{kind:'define-lifecycle',id:specId,spec},{kind:'install-system',id,handle,specId,systemId:slot+1,defense:index===10&&slot===1},
          {kind:'system-upkeep',id,handle,systemId:slot+1,policy:p}]);
      }
      owner.system=f.systems[0]??new ShipSystem('NONE',1000,owner);
      owner.defenseSystem=index===10?f.systems[1]:new ShipSystem('NONE',1000,owner);
      owner.systems=f.systems.filter((_,slot)=>!(index===10&&slot===1));
      Object.defineProperty(owner,'allSystems',{value:f.systems});
      f.systems.forEach((s,slot)=>{s.auxiliary=f.systems[slot+1];});
      core.apply([{kind:'upkeep-stats',id,handle,shieldMultiplier:f.external[0],softFluxPerSecond:f.external[1],hardFluxPerSecond:f.external[2]},
        {kind:'shield-input',id,handle,aimX:400,aimY:-200}]);
      if(index===6||index===7){
        const v:RustVoidShieldSpec={layers:3,integrityPerLayer:200,rechargePerSecond:index===6?70:0,hitDelay:.6,restartDelay:1.2};
        shield.configureVoidShield(v);core.apply([{kind:'configure-void-shield',id,handle,spec:v}]);
        f.flags|=F.ShieldActive;
      }
    }
    function check(label:string){
      const snap=core.snapshot();exact(snap.tick,tick,label+' tick');exact(snap.combatTime,time,label+' world time');
      snap.bodies.forEach((b,index)=>{
        const f=fixtures[index],ship=b.ship!;
        f.flags=(f.flags&~F.ShieldActive)|(f.shield.isActive?F.ShieldActive:0);f.clock[1]=f.shield.phaseEffectLevel;
        exact(ship.flags,f.flags,label+' flags '+index);
        fluxWords(f.flux).forEach((n,i)=>{exactFields++;exact(ship.flux[i],n,`${label} flux ${index}/${i}`);});
        f.clock.forEach((n,i)=>{exactFields++;exact(ship.clock[i],n,`${label} clock ${index}/${i}`);});
        shieldWords(f).forEach((n,i)=>{
          const a=ship.shield![i];
          if([S.CurrentArc,S.Facing,S.TargetFacing,S.CenterX,S.CenterY,S.AimX,S.AimY,S.DefenseAim,S.VoidStart+13].includes(i)&&!Object.is(a,n)){
            geometry(a,n,`${label} shield ${index}/${i}`);
          }else{exactFields++;exact(a,n,`${label} shield ${index}/${i}`);}
        });
        f.systems.forEach((s,slot)=>systemWords(s,slot+1,f.id*100+slot).forEach((n,i)=>{exactFields++;exact(ship.systems[slot].values[i],n,`${label} system ${index}/${slot}/${i}`);}));
        b.motion.forEach((a,i)=>{
          const n=f.motion[i];if(i<=M.AngularVelocity&&!Object.is(a,n)){
            geometry(a,n,`${label} motion ${index}/${i}`);
          }else exact(a,n,label+' motion '+i);
        });
      });
      exact(snap.events.length,expected.length,label+' event count');
      snap.events.forEach((e,i)=>{
        const x=expected[i],f=fixtures.find(f=>f.id===e.id)!;
        exact(e.sequence,sequence+i+1,label+' event sequence');exact(e.id,x[0],label+' event owner');exact(e.systemId,x[1],label+' event system');
        exact(e.kind,x[2],label+' event kind');exact(e.value,x[3],label+' event value');exact(e.tick,x[4],label+' event tick');
        exact(e.handle.slot,f.handle.slot,label+' event slot');exact(e.handle.generation,f.handle.generation,label+' event generation');eventsChecked++;
      });
      exact(core.snapshot().events.length,expected.length,'repeat publication');
      sequence=snap.lastEventSequence;core.acknowledgeEvents(sequence);expected.length=0;
    }
    function shieldOp(f:Fixture,operation:RustShieldOperation){
      selected=f;let result=false;
      if(operation==='toggle-raw')result=f.shield.toggle();
      else if(operation==='raise-raw')f.shield.setActive(true);else if(operation==='lower-raw')f.shield.setActive(false);
      else if(operation==='toggle-hull')result=f.owner.toggleHullShield();else result=f.owner.startVenting();
      emit(f,E.ShieldResult,Number(result));core.apply([{kind:'shield',id:f.id,handle:f.handle,operation}]);
    }
    function systemOp(f:Fixture,slot:number,reset=false){
      selected=f;const s=f.systems[slot];if(reset)s.reset();else emit(f,E.SystemResult,Number(s.activate()),slot+1);
      core.apply([{kind:'system',id:f.id,handle:f.handle,systemId:slot+1,operation:reset?'reset':'activate'}]);
    }
    function impact(f:Fixture,damage:number,type:'ENERGY'|'KINETIC'|'HIGH_EXPLOSIVE'|'FRAGMENTATION',angle:number){
      selected=f;const result=f.shield.absorbImpact(damage,type,angle);
      emit(f,E.ImpactFlux,result.flux);emit(f,E.ImpactAbsorbed,result.absorbed);emit(f,E.ImpactRemaining,result.remainingFraction);
      core.apply([{kind:'shield-impact',id:f.id,handle:f.handle,damage,damageType:type,hitAngle:angle}]);
      if(!f.shield.voidShield){const overloaded=f.flux.increaseShieldFlux(result.flux,true);emit(f,E.FluxResult,Number(overloaded));
        core.apply([{kind:'flux',id:f.id,handle:f.handle,operation:'shield-hit',amount:result.flux,hard:true}]);}
    }
    function flags(f:Fixture,value:number){
      f.flags=(value&~F.ShieldActive)|(f.shield.isActive?F.ShieldActive:0);
      f.owner.isDead=!!(value&F.Dead);f.owner.isRetreated=!!(value&F.Retreated);f.owner.isDocked=!!(value&F.Docked);f.owner.retreating=!!(value&F.Retreating);
      core.apply([{kind:'ship-flags',id:f.id,handle:f.handle,flags:f.flags,hardFluxDissipationFraction:.23,zeroFluxMinimum:.2,allowZeroFluxAtAnyLevel:1}]);
    }
    function inputs(f:Fixture,forced?:number,blocked=false,aim?:number){
      f.blocked=blocked;f.defenseAim=aim;f.shield.forcedPhaseEffectLevel=forced;
      f.owner.runtimeModifiers.value.disableDefense=blocked?1:0;f.owner.defenseFacingRad=aim;f.owner.fireControlMode=aim===undefined?'MANUAL':'AI';
      core.apply([{kind:'shield-input',id:f.id,handle:f.handle,aimX:f.owner.aimTargetWorld.x,aimY:f.owner.aimTargetWorld.y,defenseBlocked:blocked,forcedPhaseEffect:forced,defenseAim:aim}]);
    }
    check('initial');
    for(const f of fixtures)shieldOp(f,'toggle-hull');
    // Closing shields queue a new raise; cancelling it must prevent free re-open.
    shieldOp(fixtures[1],'raise-raw');shieldOp(fixtures[1],'toggle-raw');shieldOp(fixtures[1],'raise-raw');shieldOp(fixtures[1],'toggle-raw');
    for(const f of fixtures)for(let slot=0;slot<f.systems.length;slot++)systemOp(f,slot);
    impact(fixtures[6],100,'ENERGY',-.71);impact(fixtures[7],700,'ENERGY',.27);
    check('initial commands');
    for(let step=0;step<100;step++){
      if(step===1){shieldOp(fixtures[2],'lower-raw');shieldOp(fixtures[2],'raise-raw');}
      if(step===2){shieldOp(fixtures[2],'raise-raw');shieldOp(fixtures[3],'toggle-hull');}
      if(step===3){shieldOp(fixtures[3],'toggle-hull');shieldOp(fixtures[12],'vent-ship');}
      if(step===4)for(const f of fixtures.slice(6,8))impact(f,800,'KINETIC',-.21);
      if(step===5)inputs(fixtures[6],undefined,true);
      if(step===6){inputs(fixtures[6]);shieldOp(fixtures[6],'raise-raw');}
      if(step===7)shieldOp(fixtures[9],'vent-ship');
      if(step===8)shieldOp(fixtures[10],'vent-ship');
      if(step===9){for(const f of fixtures.slice(9,12)){systemOp(f,0,true);shieldOp(f,'raise-raw');}}
      if(step===10)for(const f of fixtures.slice(9,12))systemOp(f,0);
      if(step===11)flags(fixtures[6],fixtures[6].flags|F.Retreating);
      if(step===12)flags(fixtures[6],F.AllowDissipation);
      if(step===14)impact(fixtures[1],600,'KINETIC',.17);
      if(step===15)inputs(fixtures[3],.3);
      if(step===16)inputs(fixtures[3],1.2,true);
      if(step===17)inputs(fixtures[3]);
      if(step===18){inputs(fixtures[9],undefined,false,3.2);inputs(fixtures[2],undefined,false,-3.2);}
      if(step===19){fixtures[9].owner.aimTargetWorld.set(100,-200);inputs(fixtures[9]);}
      if(step===20)inputs(fixtures[5],0);
      if(step===21)inputs(fixtures[5]);
      if(step===23)flags(fixtures[8],fixtures[8].flags|F.Dead);
      if(step===24)flags(fixtures[8],F.AllowDissipation);
      if(step===25)flags(fixtures[13],fixtures[13].flags|F.Retreated);
      if(step===26)flags(fixtures[13],F.AllowDissipation);
      if(step===27){const f=fixtures[5];f.clock[2]=0;f.owner.runtimeModifiers.value.timeMultiplier=0;
        core.apply([{kind:'clock-input',id:f.id,handle:f.handle,phaseTimeBonus:.8,phaseEffect:f.shield.phaseEffectLevel,externalTimeMultiplier:0}]);}
      if(step===28){const f=fixtures[5];f.clock[2]=1.13;f.owner.runtimeModifiers.value.timeMultiplier=1.13;
        core.apply([{kind:'clock-input',id:f.id,handle:f.handle,phaseTimeBonus:.8,phaseEffect:f.shield.phaseEffectLevel,externalTimeMultiplier:1.13}]);}
      if(step===29)for(const f of fixtures.slice(3,6))shieldOp(f,'toggle-hull');
      if(step===32)shieldOp(fixtures[3],'vent-ship');
      if(step===34){const f=fixtures[2];f.config={...f.config,radius:97,maxArc:100,unfoldMultiplier:.7,turnMultiplier:1.3};
        Object.assign(f.shield,{radius:97,maxArcDeg:100,unfoldRateMultiplier:.7,turnRateMultiplier:1.3});
        core.apply([{kind:'shield-stats',id:f.id,handle:f.handle,config:f.config}]);}
      if(step===36){const f=fixtures[11];f.external=[.83,7.3,11.7];Object.assign(f.owner.runtimeModifiers.value,{shieldUpkeepMultiplier:.83,softFluxPerSecond:7.3,hardFluxPerSecond:11.7});
        core.apply([{kind:'upkeep-stats',id:f.id,handle:f.handle,shieldMultiplier:.83,softFluxPerSecond:7.3,hardFluxPerSecond:11.7}]);}
      if(step%17===0)for(const f of fixtures)shieldOp(f,'toggle-hull');
      if(step%13===0)for(const f of fixtures)for(let slot=0;slot<f.systems.length;slot++)systemOp(f,slot);
      if(step%11===0){impact(fixtures[2],55,'HIGH_EXPLOSIVE',.23);impact(fixtures[6],77,'FRAGMENTATION',.61);}
      if(step%23===0){selected=fixtures[9];const result=fixtures[9].flux.overloadFor(.27);emit(fixtures[9],E.FluxResult,Number(result));
        core.apply([{kind:'flux',id:fixtures[9].id,handle:fixtures[9].handle,operation:'overload-for',amount:.27}]);}
      check('commands '+step);
      const dt=[1/60,.031,.25,.61,1.3,1e-10][step%6];tick++;time+=dt;
      for(const f of fixtures){
        selected=f;const state=f.owner.prepareStep(dt,null);if(!state)continue;
        f.clock[3]=dt;f.clock[4]=state.tacticalDt;f.clock[5]=state.effectiveDt;
        f.clock[6]+=dt;f.clock[7]+=state.tacticalDt;f.clock[8]+=state.effectiveDt;
        const base=f.motion[M.MaxSpeed];
        if(f.shield.type==='PHASE'&&f.shield.isPhaseEngaged)f.motion[M.MaxSpeed]*=f.shield.getPhaseSpeedMultiplier(f.flux.hardFlux/f.flux.maxFlux);
        f.motion[M.Dt]=state.effectiveDt;advanceMotionRow(f.motion,0);f.motion[M.MaxSpeed]=base;
        f.owner.pos.set(f.motion[0],f.motion[1]);f.owner.vel.set(f.motion[2],f.motion[3]);f.owner.facingRad=f.motion[4];f.owner.angularVelRad=f.motion[5];
        f.owner.integrateStep(state,{accelerating:!!f.motion[M.Accelerating],spreading:!!f.motion[M.Spreading]});
      }
      core.step(dt);check('step '+step);
    }
    // New domains obey the same generation/atomicity and display isolation contract.
    const f=fixtures[2],before=core.snapshot();
    rejected(()=>core.apply([{kind:'shield',id:f.id,handle:f.handle,operation:'toggle-hull'},
      {kind:'system-upkeep',id:f.id,handle:f.handle,systemId:999,policy:{gate:G.Applied}}]),8);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(before),'Invalid batch changed shield/fees/events');
    rejected(()=>core.apply([{kind:'clock-input',id:f.id,handle:f.handle,phaseTimeBonus:.8,phaseEffect:.123,externalTimeMultiplier:1}]),8);
    rejected(()=>core.apply([{kind:'ship-flags',id:f.id,handle:f.handle,flags:before.bodies[2].ship!.flags^F.ShieldActive,
      hardFluxDissipationFraction:.23,zeroFluxMinimum:.2,allowZeroFluxAtAnyLevel:1}]),8);
    const retained=core.snapshot();retained.bodies[6].ship!.shield![S.VoidStart+5]=1e9;
    insist(core.snapshot().bodies[6].ship!.shield![S.VoidStart+5]!==1e9,'Shield projection wrote authority');
    // Lifecycle fees must not depend on installing the optional shield domain.
    const feesId=9001,feesSource=fixtures[9],feesFlux=new FluxTracker(1000,55,'FRIGATE');
    const feesSystem=new ShipSystem('RUST_SHIELD_POLICY_'+feesSource.id*100,1000);
    core.apply([{kind:'spawn',id:feesId,motion:f.motion}]);
    const feesHandle=core.snapshot().bodies.at(-1)!.handle;
    core.apply([{kind:'initialize-ship',id:feesId,handle:feesHandle,config:{maxFlux:1000,baseDissipation:55,hullSize:1,flags:F.AllowDissipation}},
      {kind:'install-system',id:feesId,handle:feesHandle,systemId:1,specId:feesSource.id*100},
      {kind:'system-upkeep',id:feesId,handle:feesHandle,systemId:1,policy:feesSource.policies[0]},
      {kind:'system',id:feesId,handle:feesHandle,systemId:1,operation:'activate'}]);
    insist(feesSystem.activate(),'Shieldless upkeep reference failed to activate');
    feesSystem.update(.1);
    feesFlux.increaseFlux(feesSystem.getSoftFluxPerSecond()*.1,false);
    feesFlux.increaseFlux(feesSystem.getHardFluxPerSecond(1000)*.1,true);
    feesFlux.increaseFlux(feesSystem.consumePendingActivationFlux(),feesSystem.generatesHardFlux);
    feesFlux.update(.1,false,true);core.step(.1);
    const feesShip=core.snapshot().bodies.at(-1)!.ship!;
    insist(!feesShip.shield,'Shieldless fee fixture unexpectedly owns a shield');
    fluxWords(feesFlux).forEach((n,i)=>exact(feesShip.flux[i],n,'Shieldless system upkeep '+i));
    // Use a fresh, deployed OMNI shield so angle normalization is exercised
    // regardless of the main fixture's final vent/overload/closing state.
    const badId=9000;
    core.apply([{kind:'spawn',id:badId,motion:f.motion}]);
    const badHandle=core.snapshot().bodies.at(-1)!.handle;
    core.apply([{kind:'initialize-ship',id:badId,handle:badHandle,config:{maxFlux:1000,baseDissipation:55,hullSize:1}},
      {kind:'initialize-shield',id:badId,handle:badHandle,config:{...normal,type:'OMNI',initialActive:true}}]);
    core.step(.25);
    insist(core.snapshot().bodies.at(-1)!.ship!.shield![S.CurrentArc]>0,'Atomic angle fixture did not deploy');
    core.apply([{kind:'shield-input',id:badId,handle:badHandle,aimX:400,aimY:-200,defenseAim:1e308}]);
    const bad=core.snapshot();rejected(()=>core.step(1/60),7);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(bad),'Shield geometry failure committed earlier resources/timers');
    core.apply([{kind:'despawn',id:f.id,handle:f.handle}]);core.apply([{kind:'spawn',id:f.id,motion:f.motion}]);
    rejected(()=>core.apply([{kind:'shield',id:f.id,handle:f.handle,operation:'raise-raw'}]),4);
    return {passed:true,fullBattleReady:false,prior,fixtures:fixtures.length,steps:100,exactShieldFluxClockLifecycleFields:exactFields,
      exactOrderedEvents:eventsChecked,geometryDifferences,maxGeometryDifference,geometryLog,actualTsShield:true,actualShipPrepareAndIntegrate:true,
      crAndDeploymentExcluded:true,fullCollisionDamage:false,standardHitBrightnessExcluded:true,partialResourcePoliciesOnly:true,
      voidRecovery:true,queuedRaiseCancellation:true,worldPhaseFee:true,phaseMotionSpeed:true,shieldlessSystemUpkeep:true,atomicRejection:true,performanceMeasured:false};
  }finally{stopAudio();core.dispose();}
}
