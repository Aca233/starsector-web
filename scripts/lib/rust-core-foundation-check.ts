import { RustCombatCore, RustCoreCommandError } from '../../src/engine/runtime/rust/RustCombatCore';
import { RUST_COMMAND_WIDTH } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { advanceMotionRow, MotionField, MotionFlag, MOTION_WIDTH } from '../../src/engine/simulation/systems/MotionKernel';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function exact(actual: number, expected: number, label: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${label}: ${actual} differs from ${expected}`);
}
function rejected(operation: () => void, code: number): void {
  try { operation(); } catch (error) {
    requireValue(error instanceof RustCoreCommandError && error.code === code, `Unexpected rejection: ${String(error)}`);
    return;
  }
  throw new Error(`Expected Rust operation rejection ${code}`);
}

/** Domain differential, not a whole-battle benchmark or capacity claim. */
export async function checkRustCore(source: BufferSource, longCursor = false) {
  const core = await RustCombatCore.create(source, 917);
  const companion = await RustCombatCore.create(source, 1234);
  let geometryDifferences = 0, maximumGeometryDifference = 0, checkedFields = 0;
  let randomSamples = 0;
  try {
    requireValue(!core.fullBattleReady && core.implementedDomains === 524287, 'Foundation must not advertise complete battle support');
    exact(core.snapshot().bodies.length, 0, 'initial roster');
    const random = new SimulationRandom(917), visual = new SimulationRandom((917 ^ 0x9e3779b9) >>> 0);
    const samples = longCursor ? 5_000_000 : 4_000;
    for (let index = 0; index < samples; index++) {
      exact(core.nextRandom(), random.next(), `combat RNG sample ${index}`);
      if (index < 4000 || index % 10000 === 0) {
        exact(core.nextRandom(true), visual.next(), `visual RNG sample ${index}`);
        exact(core.nextNumericId(), random.nextNumericId(), `combat ID ${index}`);
        exact(core.nextNumericId(true), visual.nextNumericId(), `visual ID ${index}`);
      }
    }
    randomSamples = samples;
    const rngSnapshot = core.snapshot();
    random.checkpointWitness().forEach((value, index) => exact(rngSnapshot.random[index], value, `combat RNG witness ${index}`));
    visual.checkpointWitness().forEach((value, index) => exact(rngSnapshot.visualRandom[index], value, `visual RNG witness ${index}`));
    if (longCursor) requireValue(rngSnapshot.random[1] > Number.MAX_SAFE_INTEGER, 'Long-cursor check must cross binary64 integer precision boundary');
    requireValue(companion.snapshot().random[1] === 1234, 'Separate instance state leaked');
    const raw = (await WebAssembly.instantiate(source, {})).instance.exports as unknown as {
      core_create(seed:number,visualSeed:number):number;
      core_destroy(id:number):number;
      core_step(id:number,tick:number,dt:number):number;
      core_apply(id:number,words:number):number;
    };
    const rawId = raw.core_create(1,2) >>> 0;
    exact(raw.core_step(rawId,1,1/60),6,'raw stale tick');
    exact(raw.core_step(rawId,0,1/60),0,'raw accepted tick');
    exact(raw.core_destroy(rawId),1,'raw destroy');
    exact(raw.core_apply(rawId,0),1,'raw destroyed instance');
    exact(raw.core_step(rawId,1,1/60),1,'raw destroyed tick');
    const replacementId=raw.core_create(1,2) >>> 0;
    requireValue(replacementId!==rawId,'Destroyed instance ID was recycled');
    raw.core_destroy(replacementId);

    const flags = [0, MotionFlag.FlamedOut, MotionFlag.ForceForward, MotionFlag.LockedTurning,
      MotionFlag.ForcedRightTurn, MotionFlag.ForceBraking, MotionFlag.BlockAcceleration,
      MotionFlag.BlockStrafing, MotionFlag.Fighter, MotionFlag.ForceForward | MotionFlag.LockedTurning,
      MotionFlag.ForceForward | MotionFlag.BlockAcceleration, MotionFlag.ForceBraking | MotionFlag.ForceForward];
    const baseline = flags.flatMap((flag, index) => [false, true].map(brake => {
      const row = new Float64Array(MOTION_WIDTH);
      row.set([index * 127, -index * 21, index % 2 ? -260 : 200, 17 - index, -1.1 + index * .3,
        index % 3 ? 2.2 : -1.7, 0, index % 2 ? -.6 : .01, Number(brake), index % 2 ? -.5 : .7,
        index % 2 ? -.3 : .01, flag, 85, 70, 120, .8, 1.2, .013, .5, 0, 0, 0]);
      return row;
    }));
    // Actual production row layout is checked rather than duplicated in a probe.
    core.apply(baseline.map((motion, id) => ({kind: 'spawn' as const, id, motion})));
    const initial = core.snapshot();
    requireValue(initial.bodies.length === baseline.length, 'Spawn roster differs');
    initial.bodies.forEach((body, index) => {
      exact(body.id, index, 'semantic ID'); exact(body.order, index, 'semantic order');
      body.motion.forEach((value, field) => exact(value, baseline[index][field], 'initial row'));
    });
    let time = 0;
    for (let tick = 0; tick < 300; tick++) {
      if (tick === 100) {
        core.apply(initial.bodies.map((body, index) => ({kind: 'controls' as const, id: body.id, handle: body.handle,
          turn: index % 2 ? .009 : -.9, brake: false, throttle: .33, strafe: -.2, flags: flags[index >> 1]})));
        baseline.forEach((row, index) => {
          row[MotionField.Turn] = index % 2 ? .009 : -.9; row[MotionField.Brake] = 0;
          row[MotionField.Throttle] = .33; row[MotionField.Strafe] = -.2; row[MotionField.Flags] = flags[index >> 1];
        });
      }
      if (tick === 180) {
        const body = initial.bodies[0];
        core.apply([{kind:'motion-stats',id:body.id,handle:body.handle,acceleration:110,deceleration:95,
          maxSpeed:155,turnAcceleration:1.1,maxTurnRate:1.8,driftAcceleration:-.007,strafeMultiplier:.25}]);
        baseline[0].set([110,95,155,1.1,1.8,-.007,.25], MotionField.Acceleration);
      }
      const dt = tick % 9 === 0 ? .025 : 1 / 60;
      core.step(dt); time += dt;
      for (const row of baseline) { row[MotionField.Dt] = dt; advanceMotionRow(row, 0); }
      const snapshot = core.snapshot();
      exact(snapshot.tick, tick + 1, 'completed tick'); exact(snapshot.combatTime, time, 'combat clock');
      snapshot.bodies.forEach((body, index) => body.motion.forEach((value, field) => {
        const expected = baseline[index][field];
        checkedFields++;
        if (field > MotionField.AngularVelocity) { exact(value, expected, `motion state ${tick}/${index}/${field}`); return; }
        if (Object.is(value, expected)) return;
        const difference = Math.abs(value - expected);
        requireValue(difference <= Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(expected))),
          `Geometry exceeds policy ${tick}/${index}/${field}: ${value} vs ${expected}`);
        geometryDifferences++; maximumGeometryDifference = Math.max(maximumGeometryDifference, difference);
      }));
    }
    // Failed command batches and failed steps must leave every state word alone.
    const beforeFailure = core.snapshot();
    const packed = new Float64Array(RUST_COMMAND_WIDTH * 2);
    const first = beforeFailure.bodies[0];
    packed.set([2, first.id, first.handle.slot, first.handle.generation]);
    packed[4 + MotionField.Throttle] = 1;
    packed[RUST_COMMAND_WIDTH] = 99;
    packed[RUST_COMMAND_WIDTH + 1] = first.id;
    packed[RUST_COMMAND_WIDTH + 2] = first.handle.slot;
    packed[RUST_COMMAND_WIDTH + 3] = first.handle.generation;
    rejected(() => core.applyPacked(packed), 2);
    rejected(() => core.step(Number.POSITIVE_INFINITY), 2);
    const afterFailure = core.snapshot();
    exact(afterFailure.tick, beforeFailure.tick, 'failed transaction tick');
    exact(afterFailure.combatTime, beforeFailure.combatTime, 'failed transaction time');
    afterFailure.bodies.forEach((body, index) => body.motion.forEach((value, field) =>
      exact(value, beforeFailure.bodies[index].motion[field], 'failed transaction state')));
    const explosive=baseline[0].slice();
    explosive[MotionField.X]=1e308;explosive[MotionField.VelocityX]=1e308;explosive[MotionField.Flags]=MotionFlag.FlamedOut;
    companion.apply([{kind:'spawn',id:30_000,motion:explosive}]);
    rejected(()=>companion.step(2),7);
    const overflow=companion.snapshot();
    exact(overflow.tick,0,'overflow did not commit tick');
    exact(overflow.bodies[0].motion[MotionField.X],1e308,'overflow did not commit pose');
    companion.apply([{kind:'despawn',id:30_000,handle:overflow.bodies[0].handle}]);

    core.apply([{kind:'despawn',id:first.id,handle:first.handle}]);
    core.apply([{kind:'spawn',id:first.id,motion:baseline[0]}]);
    const respawned = core.snapshot().bodies.at(-1)!;
    exact(respawned.handle.slot, first.handle.slot, 'slot reuse');
    exact(respawned.handle.generation, first.handle.generation + 1, 'generation advance');
    requireValue(respawned.order > beforeFailure.bodies.at(-1)!.order, 'Reused slot changed semantic insertion order');
    rejected(() => core.apply([{kind:'despawn',id:first.id,handle:first.handle}]), 4);
    exact(core.snapshot().bodies.length, baseline.length, 'stale handle mutated roster');
    // A retained publication must remain owned and valid across memory growth.
    companion.apply([{kind:'spawn',id:20_000,motion:baseline[0]}]);
    const oldSnapshot = companion.snapshot(), epoch = companion.memoryEpoch;
    companion.apply(Array.from({length:10_000}, (_, index) => ({kind:'spawn' as const,id:index,motion:baseline[0]})));
    const grown = companion.snapshot();
    requireValue(companion.memoryEpoch > epoch && grown.bodies.length === 10_001, 'Memory growth path was not exercised');
    exact(oldSnapshot.bodies.length, 1, 'old publication aliased authority');
    exact(oldSnapshot.bodies[0].motion.length, MOTION_WIDTH, 'old publication detached after growth');
    oldSnapshot.bodies[0].motion.forEach((value, field) => exact(value, baseline[0][field], 'retained publication after growth'));
    initial.bodies[0].motion[0] = 1e9;
    requireValue(core.snapshot().bodies.at(-1)!.motion[0] !== 1e9, 'Display snapshot wrote authority');
    core.dispose(); core.dispose();
    let closed = false;
    try { core.step(); } catch { closed = true; }
    requireValue(closed, 'Closed core advanced');
    return {passed:true, fullBattleReady:false, randomSamples, motionSteps:300, motionBodies:baseline.length,
      checkedFields, geometryDifferences, maximumGeometryDifference, memoryGrowth:true,
      transactionsAtomic:true, generationReuse:true, instanceIsolation:true, performanceMeasured:false};
  } finally { core.dispose(); companion.dispose(); }
}
