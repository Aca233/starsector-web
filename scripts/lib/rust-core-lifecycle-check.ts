import { RustCombatCore, RustCoreCommandError } from '../../src/engine/runtime/rust/RustCombatCore';
import { RustEventKind as E, RustLifecycleFlag as L, RustShipFlag as F,
  type RustCommand, type RustFluxOperation, type RustSystemOperation, type RustLifecycleSpec,
  type RustBodyHandle, type RustShipConfig } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { FluxTracker, type HullSize } from '../../src/engine/simulation/FluxTracker';
import { Ship } from '../../src/engine/simulation/Ship';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { shipSystemDefinitions } from '../../src/engine/extensions/ship-systems/Registry';
import { Vector2 } from '../../src/engine/math/Vector2';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { MotionField, MOTION_WIDTH, advanceMotionRow } from '../../src/engine/simulation/systems/MotionKernel';
import { checkRustCore as checkFoundation } from './rust-core-foundation-check';

function insist(condition: unknown, label: string): asserts condition { if (!condition) throw Error(label); }
function exact(actual: number, expected: number, label: string): void {
  if (!Object.is(actual, expected)) throw Error(`${label}: ${actual} differs from ${expected}`);
}
function reject(operation: () => void, code: number): void {
  try { operation(); } catch (e) { insist(e instanceof RustCoreCommandError && e.code === code, String(e)); return; }
  throw Error('Missing rejection ' + code);
}
type ExpectedEvent = readonly [number, number, number, number, number];
const hullSizes: HullSize[] = ['FIGHTER', 'FRIGATE', 'DESTROYER', 'CRUISER', 'CAPITAL_SHIP'];
const states = ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'];
interface Internals {
  pendingActivationFlux: number; pendingActivationEvents: number; pendingActiveEvents: number;
  chargeRegenTimer: number; stageTimer: number; outEntryEffectLevel: number;
}
interface Fixture {
  id: number; handle: RustBodyHandle; owner: Ship; flux: FluxTracker;
  config: RustShipConfig; flags: number; systems: ShipSystem[]; specs: RustLifecycleSpec[];
  motion: Float64Array; clock: number[];
}
function fluxWords(f: FluxTracker): number[] {
  return [f.maxFlux, f.baseDissipation, hullSizes.indexOf(f.hullSize), f.ventRateMultiplier,
    f.overloadTimeMultiplier, f.shieldSoftFluxConversion, f.dissipationMultiplier, f.boostDelay,
    f.softFlux, f.hardFlux, f.timeSinceFluxIncrease, Number(f.isOverloaded), f.overloadTimer,
    f.overloadDuration, Number(f.isVenting), f.ventProgress, f.initialVentFlux, f.zeroFluxTimer, Number(f.isEngineBoostActive)];
}
function systemWords(s: ShipSystem, id: number, specId: number): number[] {
  const p = s as unknown as Internals;
  return [id, specId, states.indexOf(s.state), s.effectLevel, Number(s.isActive), Number(s.isCoolingDown),
    s.activeTimer, s.cooldownTimer, s.charges, s.activationSerial, p.pendingActivationFlux,
    p.pendingActivationEvents, p.pendingActiveEvents, p.chargeRegenTimer, p.stageTimer, p.outEntryEffectLevel, Number(s.disabled)];
}

/** Real TS trackers with a narrow owner/input adapter. This is deliberately not
 * a full Ship/battle test; callback witnesses record boundaries without effects. */
export async function checkRustCore(source: BufferSource) {
  // ABI changed: check the existing foundation once with 4k RNG samples.
  const foundation = await checkFoundation(source, false);
  const core = await RustCombatCore.create(source, 917);
  const fixtures: Fixture[] = [], expected: ExpectedEvent[] = [];
  let selected: Fixture | undefined, fields = 0, eventChecks = 0, sequence = 0, tick = 0, time = 0;
  const event = (f: Fixture, system: number, kind: number, value = 0) => expected.push([f.id, system, kind, value, tick]);
  const stopAudio = captureCombatAudio(a => {
    insist(selected, 'Audio emitted outside original tracker boundary');
    if (a.kind === 'play' && a.key === 'overload') event(selected, 0, E.OverloadAudio);
    else if (a.kind === 'loop' && a.key === 'flux_flush_loop' && !a.active) event(selected, 0, E.VentLoopStop);
    else throw Error('Unexpected tracker audio ' + JSON.stringify(a));
  });
  const generic: RustLifecycleSpec = {chargeUp:.4, active:.7, chargeDown:.3, cooldown:.5,
    maxCharges:2, chargeRegen:.8, fluxCostPerUse:30, flags:L.Available | L.UsesCharges};
  const fixtureSpecs: RustLifecycleSpec[][] = [
    [generic],
    [{...generic, chargeUp:0, active:0, chargeDown:0, cooldown:0, initialCharges:3}],
    [{...generic, active:Infinity, flags:L.Available | L.Toggle, fluxCostPerUse:0}],
    [{...generic, chargeUp:1, flags:L.Available | L.Toggle}],
    Array.from({length:3}, () => ({...generic, fluxCostPerUse:60})),
    [{...generic, fluxCostPerUse:10}, {...generic, fluxCostPerUse:5}],
    [{...generic, initialCharges:0, maxCharges:4, flags:L.Available}],
    [{...generic, flags:0}],
    [{...generic, flags:L.Available | L.CancelOnBrake | L.CancelOnRetreat | L.CancelOnFlameout}],
  ];
  try {
    for (let index = 0; index < 10 + fixtureSpecs.length; index++) {
      const id = index + 100;
      const config: RustShipConfig = {maxFlux:index === 14 ? 100 : 1000, baseDissipation:37 + index,
        hullSize:index % 5, softFlux: index < 10 ? 180 : 0, hardFlux:index < 10 ? 120 : 0,
        ventRateMultiplier:1.25, overloadTimeMultiplier:1.13, shieldSoftFluxConversion:(index % 4) * .25,
        dissipationMultiplier:1.17, boostDelay:.73, flags:index % 2 ? F.AllowDissipation : F.ShieldActive | F.AllowDissipation,
        phaseTimeBonus:.9, phaseEffect:index % 3 === 0 ? .35 : 0, externalTimeMultiplier:1.05,
        hardFluxDissipationFraction:.23, zeroFluxMinimum:index % 2 ? .2 : 0, allowZeroFluxAtAnyLevel:index % 4 === 0 ? 1 : 0};
      const motion = new Float64Array(MOTION_WIDTH);
      motion.set([id,0,1,2,.2,.1,0,.1,0,.4,.2,0,20,17,80,.5,1,0,.5,0,0,0]);
      core.apply([{kind:'spawn', id, motion}]);
      const handle = core.snapshot().bodies.at(-1)!.handle;
      core.apply([{kind:'initialize-ship',id,handle,config}]);
      const flux = new FluxTracker(config.maxFlux,config.baseDissipation,hullSizes[config.hullSize]);
      Object.assign(flux,{softFlux:config.softFlux,hardFlux:config.hardFlux,ventRateMultiplier:config.ventRateMultiplier,
        overloadTimeMultiplier:config.overloadTimeMultiplier,shieldSoftFluxConversion:config.shieldSoftFluxConversion,
        dissipationMultiplier:config.dissipationMultiplier,boostDelay:config.boostDelay});
      const owner = Object.create(Ship.prototype) as Ship;
      Object.assign(owner,{flux, hullStats:{phaseTimeBonusMultiplier:config.phaseTimeBonus,fluxDissipation:config.baseDissipation,
        systemUsesBonus:index === 11 ? -1 : 0,systemRegenMultiplier:1,systemCooldownMultiplier:1,systemFluxCostMultiplier:1,
        hardFluxDissipationFraction:config.hardFluxDissipationFraction,zeroFluxMinimumFluxLevel:config.zeroFluxMinimum,
        allowZeroFluxAtAnyLevel:config.allowZeroFluxAtAnyLevel}, moduleHardFluxFraction:0,
        shield:{phaseEffectLevel:config.phaseEffect,isActive:!!(config.flags! & F.ShieldActive)},
        runtimeModifiers:{empty:false,value:{timeMultiplier:config.externalTimeMultiplier}},
        spec:{hullSize:hullSizes[config.hullSize]},isDead:false,isRetreated:false,isDocked:false,retreating:false,hullHp:1,
        aimTargetWorld:new Vector2(),pos:new Vector2(),vel:new Vector2(),facingRad:0,currentTargetShip:null});
      const f: Fixture = {id,handle,owner,flux,config,flags:config.flags!,systems:[],
        specs:fixtureSpecs[index-10] ?? [],motion,clock:[config.phaseTimeBonus!,config.phaseEffect!,config.externalTimeMultiplier!,0,0,0,0,0,0]};
      fixtures.push(f);
      flux.onOverloadStarted = () => {
        f.flags &= ~F.ShieldActive; owner.shield.isActive = false; event(f,0,E.OverloadStarted);
      };
      for (let slot = 0; slot < f.specs.length; slot++) {
        const s = f.specs[slot], specId = id * 100 + slot, systemId = slot + 1, name = 'RUST_DOMAIN_' + specId;
        shipSystemDefinitions.register({id:name,name,sourceIds:[],chargeUp:s.chargeUp,active:s.active,
          chargeDown:s.chargeDown,cooldown:s.cooldown,charges:s.maxCharges+(index === 11 ? 1 : 0),initialCharges:s.initialCharges,
          chargeRegen:s.chargeRegen,fluxPerUseFlat:s.fluxCostPerUse,hardFlux:!!(s.flags & L.HardFlux),
          toggle:!!(s.flags & L.Toggle),usesChargesForActivation:!!(s.flags & L.UsesCharges),unavailable:!(s.flags & L.Available),
          controls:{cancelOnBrake:!!(s.flags & L.CancelOnBrake),cancelOnRetreat:!!(s.flags & L.CancelOnRetreat),cancelOnFlameout:!!(s.flags & L.CancelOnFlameout)},
          onActivate:() => event(f,systemId,E.SystemActivate),onActive:() => event(f,systemId,E.SystemActive),
          onAdvance:(_ship,dt) => event(f,systemId,E.SystemAdvance,dt),
          onInterrupt:() => event(f,systemId,E.SystemInterrupt),onReset:() => event(f,systemId,E.SystemReset)});
        const system = new ShipSystem(name,config.maxFlux,owner); f.systems.push(system);
        core.apply([{kind:'define-lifecycle',id:specId,spec:s},{kind:'install-system',id,handle,systemId,specId}]);
      }
      // Empty ships still have the actual neutral system reader, without an
      // installed Rust lifecycle slot. All input adapters are explicit.
      owner.system = f.systems[0] ?? new ShipSystem('NONE',config.maxFlux,owner);
      for (let slot = 0; slot + 1 < f.systems.length; slot++) f.systems[slot].auxiliary = f.systems[slot+1];
      Object.defineProperty(owner,'allSystems',{value:f.systems});
      Object.defineProperties(owner.system,{
        blocksFluxDissipation:{get:() => !(f.flags & F.AllowDissipation)},
        locksTurning:{get:() => !!(f.flags & F.LockedTurning)},
        suppressesZeroFluxBoost:{get:() => !!(f.flags & F.SuppressBoost)},
      });
      owner.system.getDissipationMultiplier = () => config.dissipationMultiplier!;
    }
    function check(label: string) {
      const snap = core.snapshot(); exact(snap.tick,tick,label+' tick'); exact(snap.combatTime,time,label+' time');
      snap.bodies.forEach((body,index) => {
        const f = fixtures[index], ship = body.ship; insist(ship,'Missing resident resource state');
        exact(ship.flags,f.flags,label+' flags '+index);
        fluxWords(f.flux).forEach((n,field) => { fields++; exact(ship.flux[field],n,`${label} flux ${index}/${field}`); });
        f.clock.forEach((n,field) => { fields++; exact(ship.clock[field],n,`${label} clock ${index}/${field}`); });
        exact(ship.systems.length,f.systems.length,'system roster');
        f.systems.forEach((s,slot) => systemWords(s,slot+1,f.id*100+slot).forEach((n,field) => {
          fields++; exact(ship.systems[slot].values[field],n,`${label} system ${index}/${slot}/${field}`);
        }));
        // Geometry only uses the already-approved allowance; motion dt is strict.
        body.motion.forEach((n,field) => {
          const old = f.motion[field];
          if (field <= MotionField.AngularVelocity) insist(Object.is(n,old) || Math.abs(n-old) <= Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(n),Math.abs(old))),label+' geometry');
          else exact(n,old,label+' motion field '+field);
        });
      });
      exact(snap.events.length,expected.length,label+' event count');
      snap.events.forEach((e,index) => {
        const x=expected[index]; exact(e.sequence,sequence+index+1,label+' sequence');
        exact(e.id,x[0],label+' event owner'); exact(e.systemId,x[1],label+' event system');
        exact(e.kind,x[2],label+' event kind'); exact(e.value,x[3],label+' event value'); exact(e.tick,x[4],label+' event tick');
        const owner=fixtures.find(f=>f.id===e.id)!;
        exact(e.handle.slot,owner.handle.slot,label+' event slot'); exact(e.handle.generation,owner.handle.generation,label+' event generation'); eventChecks++;
      });
      // Read twice before ack: publications must not consume these notices.
      exact(core.snapshot().events.length,expected.length,label+' retained journal');
      sequence = snap.lastEventSequence; core.acknowledgeEvents(sequence); expected.length=0;
    }
    function fluxOp(f: Fixture,operation: RustFluxOperation,amount=0,hard=false) {
      selected=f; let result=false;
      switch(operation) {
        case 'shield-hit': result=f.flux.increaseShieldFlux(amount,hard); break;
        case 'increase': result=f.flux.increaseFlux(amount,hard); break;
        case 'spend-soft': result=f.flux.trySpendSoftFlux(amount); break;
        case 'increase-clamped': f.flux.increaseFluxClamped(amount,hard); break;
        case 'trigger-overload': result=f.flux.triggerOverload(amount); break;
        case 'force-overload': result=f.flux.forceOverload(amount); break;
        case 'overload-for': result=f.flux.overloadFor(amount); break;
        case 'start-vent': result=f.flux.startVenting(); break;
        case 'cancel-vent': f.flux.cancelVenting(); break;
      }
      event(f,0,E.FluxResult,Number(result));
      core.apply([{kind:'flux',id:f.id,handle:f.handle,operation,amount,hard}]);
    }
    function systemOp(f: Fixture,slot: number,operation: RustSystemOperation) {
      const s=f.systems[slot]; selected=f;
      if(operation==='activate') event(f,slot+1,E.SystemResult,Number(s.activate()));
      else if(operation==='interrupt') s.deactivate(); else if(operation==='reset') s.reset();
      else s.disabled=operation==='disable';
      core.apply([{kind:'system',id:f.id,handle:f.handle,systemId:slot+1,operation}]);
    }
    function flags(f: Fixture,value: number) {
      f.flags=value; const owner=f.owner;
      owner.shield.isActive=!!(value & F.ShieldActive); owner.isDead=!!(value & F.Dead);
      owner.isRetreated=!!(value & F.Retreated); owner.isDocked=!!(value & F.Docked); owner.retreating=!!(value & F.Retreating);
      owner.brakeInput=!!(value & F.Brake); owner.runtimeModifiers.value.disableSystems=value & F.SystemsDisabled ? 1 : 0;
      core.apply([{kind:'ship-flags',id:f.id,handle:f.handle,flags:value,
        hardFluxDissipationFraction:f.config.hardFluxDissipationFraction!,zeroFluxMinimum:f.config.zeroFluxMinimum!,allowZeroFluxAtAnyLevel:f.config.allowZeroFluxAtAnyLevel!}]);
    }
    check('initialized');
    // Exact capacity does not overload, unaffordable soft costs refuse; every
    // hull-size base plus excess penalty is independently witnessed.
    for(const f of fixtures.slice(0,10)) {
      fluxOp(f,'spend-soft',f.flux.maxFlux-f.flux.totalFlux); fluxOp(f,'spend-soft',.01);
      fluxOp(f,'shield-hit',0,true); fluxOp(f,'shield-hit',25.5,true);
      fluxOp(f,'force-overload',2); fluxOp(f,'start-vent');
    }
    for(const f of fixtures.slice(10)) for(let slot=0;slot<f.systems.length;slot++) systemOp(f,slot,'activate');
    check('initial commands');
    const advanceFlux = (Ship.prototype as unknown as {advanceHullModFlux(this:Ship,dt:number):void}).advanceHullModFlux;
    for(let step=0;step<100;step++) {
      if(step===0) systemOp(fixtures[13],0,'interrupt'); // IN at effect 0: immediate OUT completion.
      if(step===3) systemOp(fixtures[11],0,'reset'); // initialCharges exceeds capacity on reset.
      if(step===4) systemOp(fixtures[12],0,'activate'); // Infinite toggle off.
      if(step===5) systemOp(fixtures[15],0,'interrupt');
      if(step===6) flags(fixtures[18],fixtures[18].flags | F.Brake);
      if(step===7) flags(fixtures[18],F.AllowDissipation | F.Retreating);
      if(step===8) { flags(fixtures[18],F.AllowDissipation); systemOp(fixtures[18],0,'activate'); }
      if(step===9) flags(fixtures[18],F.AllowDissipation | F.FlamedOut);
      if(step===10) { systemOp(fixtures[10],0,'disable'); systemOp(fixtures[10],0,'activate'); }
      if(step===11) { systemOp(fixtures[10],0,'enable'); flags(fixtures[10],fixtures[10].flags | F.SystemsDisabled); systemOp(fixtures[10],0,'activate'); }
      if(step===12) flags(fixtures[10],F.AllowDissipation);
      if(step===13) { flags(fixtures[16],fixtures[16].flags | F.Retreating); systemOp(fixtures[16],0,'activate'); }
      if(step===14) flags(fixtures[16],F.AllowDissipation);
      if(step===16) { flags(fixtures[9],F.AllowDissipation | F.Dead); systemOp(fixtures[10],0,'reset'); }
      if(step===17) flags(fixtures[9],F.AllowDissipation);
      if(step===19) { flags(fixtures[0],F.ShieldActive); fluxOp(fixtures[0],'cancel-vent'); }
      if(step===22) { flags(fixtures[0],F.ShieldActive | F.AllowDissipation | F.SuppressBoost); }
      if(step===24) flags(fixtures[0],F.AllowDissipation | F.LockedTurning);
      if(step===27) {
        const f=fixtures[5]; f.clock[1]=.67; f.owner.shield.phaseEffectLevel=.67;
        core.apply([{kind:'clock-input',id:f.id,handle:f.handle,phaseTimeBonus:f.clock[0],phaseEffect:.67,externalTimeMultiplier:f.clock[2]}]);
      }
      if(step===35 || step===36) {
        const f=fixtures[5], multiplier=step===35 ? 0 : 1.05;
        f.clock[2]=multiplier; Object.assign(f.owner.runtimeModifiers.value,{timeMultiplier:multiplier});
        core.apply([{kind:'clock-input',id:f.id,handle:f.handle,phaseTimeBonus:f.clock[0],phaseEffect:f.clock[1],externalTimeMultiplier:multiplier}]);
      }
      if(step%11===0) for(const f of fixtures.slice(10)) for(let slot=0;slot<f.systems.length;slot++) systemOp(f,slot,'activate');
      if(step%7===0) for(const [index,f] of fixtures.slice(0,10).entries()) {
        fluxOp(f,'increase',index%2 ? -13.125 : 71.13,index%3===0);
        fluxOp(f,'increase-clamped',5.7,index%2===0);
      }
      if(step===30) for(const f of fixtures.slice(0,10)) fluxOp(f,'force-overload',1.23);
      if(step===45) for(const f of fixtures.slice(0,10)) fluxOp(f,'overload-for',.333);
      if(step===60) for(const f of fixtures.slice(0,10)) fluxOp(f,'trigger-overload',123.456);
      if(step%13===0) for(const f of fixtures.slice(0,10)) fluxOp(f,'start-vent');
      if(step%17===0) for(const f of fixtures.slice(0,10)) fluxOp(f,'cancel-vent');
      check('commands '+step);
      const dt=[1/60,.007,.33,1.001,2,1e-10][step%6]; tick++; time+=dt;
      for(const f of fixtures) {
        selected=f; if(f.owner.isDead || f.owner.isRetreated) continue;
        const tactical=dt*f.owner.system.getTimeMultiplier(), effective=dt*f.owner.subjectiveTimeMultiplier;
        f.clock[3]=dt; f.clock[4]=tactical; f.clock[5]=effective; f.clock[6]+=dt; f.clock[7]+=tactical; f.clock[8]+=effective;
        for(const s of f.systems) {
          const c=s.definition.controls;
          if(effective>0 && ((c?.cancelOnBrake && f.owner.brakeInput)||(c?.cancelOnRetreat && f.owner.retreating))) s.deactivate();
          s.update(effective);
        }
        for(const s of f.systems) if(f.flux.isOverloaded || f.flux.isVenting || (s.isActive && s.definition.controls?.cancelOnFlameout && (f.flags & F.FlamedOut))) s.deactivate();
        for(const s of f.systems) { const cost=s.consumePendingActivationFlux(); if(cost>0) f.flux.increaseFlux(cost,s.generatesHardFlux); }
        advanceFlux.call(f.owner,tactical);
        f.motion[MotionField.Dt]=effective; advanceMotionRow(f.motion,0);
      }
      core.step(dt); check('step '+step);
      for(const f of fixtures) {
        selected=f;
        if(!f.owner.isDead && !f.owner.isRetreated && !f.owner.isDocked)
          for(const s of f.systems) s.dispatchEvents(f.owner,{} as Parameters<ShipSystem['dispatchEvents']>[1],dt*f.owner.subjectiveTimeMultiplier);
        core.apply([{kind:'dispatch-systems',id:f.id,handle:f.handle}]);
      }
      check('dispatch '+step);
    }
    // A valid resource operation followed by an invalid system reference must
    // roll back resources, notifications, pending counters and definitions.
    const before=core.snapshot(), f=fixtures[10];
    const batch: RustCommand[]=[{kind:'define-lifecycle',id:900_001,spec:generic},
      {kind:'flux',id:f.id,handle:f.handle,operation:'force-overload',amount:1},
      {kind:'system',id:f.id,handle:f.handle,systemId:999,operation:'reset'}];
    reject(() => core.apply(batch),8);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(before),'Failed resource batch committed');
    core.apply([{kind:'define-lifecycle',id:900_001,spec:generic}]);
    reject(() => core.apply([{kind:'define-lifecycle',id:900_001,spec:generic}]),8);
    reject(() => core.acknowledgeEvents(sequence+1),2);
    core.apply([{kind:'flux',id:f.id,handle:f.handle,operation:'spend-soft',amount:0},
      {kind:'flux',id:f.id,handle:f.handle,operation:'spend-soft',amount:0}]);
    const journal=core.snapshot(); exact(journal.events.length,2,'two unacknowledged results');
    journal.bodies[0].ship!.flux[8]=1e9; journal.bodies[10].ship!.systems[0].values[8]=1e9;
    insist(core.snapshot().bodies[0].ship!.flux[8]!==1e9,'Flux snapshot wrote authority');
    insist(core.snapshot().bodies[10].ship!.systems[0].values[8]!==1e9,'System snapshot wrote authority');
    core.acknowledgeEvents(journal.events[0].sequence);
    core.acknowledgeEvents(journal.events[0].sequence); // cumulative acknowledgement is idempotent.
    exact(core.snapshot().events.length,1,'partial event acknowledgement');
    core.acknowledgeEvents(journal.lastEventSequence);
    // State overflow in a later entity must roll back earlier ship clocks/flux.
    core.apply([{kind:'clock-input',id:f.id,handle:f.handle,phaseTimeBonus:1,phaseEffect:1,externalTimeMultiplier:1e308}]);
    const overflow=core.snapshot(); reject(() => core.step(2),7);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(overflow),'Domain overflow committed a partial tick');
    return {passed:true,fullBattleReady:false,foundation,fixtures:fixtures.length,steps:100,
      exactResourceLifecycleClockFields:fields,exactOrderedEvents:eventChecks,geometryPolicy:'approved P1a allowance only',
      originalTsFluxTracker:true,originalTsShipSystem:true,originalTsHullModFlux:true,
      genericCallbacksOnly:true,completeBattle:false,atomicRejection:true,retainedEventsUntilAck:true,performanceMeasured:false};
  } finally { stopAudio(); core.dispose(); }
}
