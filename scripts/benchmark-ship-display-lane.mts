import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serialize } from 'node:v8';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { assetManager } from '../src/engine/assets/AssetResolver';
import { createLanWorld } from '../src/network/LanWorld';
import { CombatPresentationEncoder, CombatPresentationDecoder } from '../src/engine/runtime/local/CombatPresentation';
import { packedVisualFields } from '../src/engine/runtime/local/PackedVisualState';
import { ProjectedRenderShip, renderWeaponRange, renderPulseOffset, renderWeaponAngle } from '../src/engine/runtime/local/RenderShipProjection';
import { ShipDisplayEncoder, ShipDisplayDecoder } from '../src/network/display/ShipDisplayLane';
import type { ShipRenderState } from '../src/engine/render/ShipRenderState';

const SEED = 917, WARMUP = 60, BLOCKS = 24, DT = 1 / 60;
// Independent of the candidate layout: an accidentally omitted hot field must
// fail equality rather than disappearing from the benchmark's oracle as well.
const shipFields = ['id', 'spec', 'pos', 'prevPos', 'vel', 'facingRad', 'prevFacingRad', 'angularVelRad',
  'hullHp', 'isDead', 'isDocked', 'isRetreated', 'isAttachedModule', 'teamId', 'playerTargetId',
  'visibilityMask', 'visibilityOverflow', 'phaseGhosts', 'phaseVisualAlpha', 'engineBoostLevel',
  'prevEngineBoostLevel', 'scorchMarks', 'scorchMarkVersion', 'selectedGroupIndex', 'weaponGroups'];
const shieldFields = ['facingAngleRad', 'isPhaseEngaged', 'isVisuallyDeployed', 'phaseCooldownLevel',
  'phaseEffectLevel', 'phaseState', 'radius', 'renderArcRad', 'type', 'visualAlpha'];
const fluxFields = ['fluxPercent', 'hardFlux', 'hullSize', 'isOverloaded', 'isVenting', 'maxFlux', 'overloadTimer'];
const systemFields = ['activationSerial', 'available', 'disabled', 'effectLevel', 'fortressVisualLevel',
  'isActive', 'state', 'teleportVisual', 'type'];
const weaponFields = ['arcDeg', 'baseAngleDeg', 'currentAngleRad', 'currentSpreadDeg', 'glowAlpha',
  'isDisabled', 'mountType', 'recoil', 'relativePos', 'slotId'];
const weaponSpecFields = ['id', 'spawnType', 'isRocket', 'isBeam', 'hardpointUsesHullSprite', 'turretSpriteUrl',
  'hardpointSpriteUrl', 'hardpointGunSpriteUrl', 'turretGunSpriteUrl', 'glowSpriteUrl', 'hardpointGlowSpriteUrl',
  'mountSize', 'visualRecoil', 'renderBarrelBelow', 'weaponType', 'glowColor', 'animationType', 'projSpeed',
  'projSpriteUrl', 'beamEffect', 'onHitEffect', 'everyFrameEffect'];
const childSpecFields = ['onHitEffect', 'turretSpriteUrl', 'turretGunSpriteUrl', 'hardpointSpriteUrl',
  'hardpointGunSpriteUrl', 'glowSpriteUrl', 'hardpointGlowSpriteUrl', 'projSpriteUrl'];
const engineFields = ['prevThrust', 'currentThrust', 'prevSpread', 'spread'];
const pick = (value: any, keys: readonly string[]) => Object.fromEntries(keys.map(key => [key, value[key]]));

/** Normalize prototypes only. Keep undefined, NaN, infinities and signed zero;
 * JSON stringify is NOT used for equality. Follow only the audited read set. */
function normalize(value: any, seen = new Set<object>()): any {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') throw new Error('Executable value in renderer read set');
    return value;
  }
  if (seen.has(value)) throw new Error('Unexpected cycle in renderer read set');
  seen.add(value);
  let result: any;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) result = Array.from(value as any, item => normalize(item, seen));
  else if (value instanceof Map) result = [...value].map(([key, item]) => [normalize(key, seen), normalize(item, seen)]);
  else if (value instanceof Set) result = [...value].map(item => normalize(item, seen));
  else result = Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key], seen)]));
  seen.delete(value);
  return result;
}
function specRead(spec: any): any {
  return { ...pick(spec, weaponSpecFields), mirv: spec.mirv ? {
    childProjectile: spec.mirv.childProjectile ? pick(spec.mirv.childProjectile, childSpecFields) : spec.mirv.childProjectile,
  } : spec.mirv };
}
function systemRead(system: any): any {
  return { ...pick(system, systemFields), visuals: system.definition.visuals, pulseOffset: renderPulseOffset(system) };
}
function shipRead(ship: ShipRenderState): any {
  const shield = ship.shield as any;
  // Native lazy hit geometry must be read without initializing authority state.
  const hitSegmentLevels = typeof shield.presentationHitSegmentLevels === 'function'
    ? shield.presentationHitSegmentLevels() : shield.hitSegmentLevels;
  return normalize({
    ...pick(ship, shipFields), shield: { ...pick(shield, shieldFields), hitSegmentLevels },
    flux: pick(ship.flux, fluxFields), armor: ship.armor.cellWidth,
    accelerating: ship.engineController.flameAccelerating,
    engines: ship.engineStatuses.map(engine => pick(engine, engineFields)),
    weapons: ship.weapons.map(weapon => ({ ...pick(weapon, weaponFields), spec: specRead(weapon.spec),
      range: renderWeaponRange(ship, weapon), angle: renderWeaponAngle(weapon, ship.facingRad) })),
    system: systemRead(ship.system), systems: ship.allSystems.map(systemRead), carrierId: ship.sourceCarrier?.id,
    poses: [0, 0.3, 1].map(alpha => {
      const pos = ship.interpolatedPos(alpha), facing = ship.interpolatedFacing(alpha);
      return [pos, facing, ship.getShieldCenter(pos, facing)];
    }),
    visible: [true, false, 0, 1, 2, 30, 31, 40, 77].map(team => ship.isVisibleTo(team)),
  });
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1800);
function stats(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: quantile(0.5), p95: quantile(0.95), min: sorted[0], max: sorted[sorted.length - 1] };
}
function summarize(rows: any[]) {
  return {
    samples: rows.length,
    ms: Object.fromEntries(['capture', 'cloneDelivery', 'decode', 'acknowledge', 'captureDecode', 'pipeline']
      .map(key => [key, stats(rows.map(row => row.ms[key]))])),
    bytes: Object.fromEntries(['packetBytes', 'v8ObjectSurrogateBytes', 'allocatedTransferBytes', 'usedNumericBytes']
      .map(key => [key, stats(rows.flatMap(row => typeof row.bytes[key] === 'number' ? [row.bytes[key]] : []))])),
  };
}

export async function runBenchmark(context: any): Promise<void> {
  const previousFetch = globalThis.fetch;
  const publicRoot = path.join(context.root, 'public');
  globalThis.fetch = (async (input: any) => {
    const file = path.resolve(publicRoot, String(input).replace(/^\//, ''));
    if (!file.startsWith(publicRoot + path.sep)) throw new Error('Asset request outside public');
    return new Response(fs.readFileSync(file));
  }) as typeof fetch;
  try {
    await assetManager.ensureManifestLoaded();
    const engine = createLanWorld({
      id: 'ship-display-benchmark', seed: SEED, hostId: 'p0', snapshotHz: 60,
      players: [{ id: 'p0', seat: 0, team: 0, hull: 'onslaught' }, { id: 'p1', seat: 1, team: 1, hull: 'onslaught' }],
      options: { assignment: 'teams', battleSize: 3200,
        aiHulls: [Array(10).fill('hammerhead'), Array(10).fill('hammerhead')] },
    } as any).engine;
    assert.equal(engine.allCapitalShips.length, 22, 'Native capital roster');
    assert.equal(engine.ships.length, 22, 'No additional fighter/drone renderer roots in this fixture');
    // Same native loadouts and seed in BOTH arms; compact formation only, no
    // synthetic DTO trace, state replay, disabled AI or altered weapon rules.
    for (const ship of engine.allCapitalShips) { ship.pos.scale(0.2); ship.prevPos.copy(ship.pos); }

    const baselineEncoder = new CombatPresentationEncoder(1, 'render');
    const baselineDecoder = new CombatPresentationDecoder(1);
    const candidateEncoder = new ShipDisplayEncoder(1);
    const candidateDecoder = new ShipDisplayDecoder();
    let recycle: ArrayBuffer | undefined, recycleVisuals: ArrayBuffer | undefined;
    let baselineFailure: string | null = context.isolation.available ? null : context.isolation.reason;
    let candidateFailure: string | null = null, readFailure: string | null = null;
    let tick = 0, verified = 0, pairedVerified = 0, minShips = 22, maxShips = 22, maxProjectiles = 0, maxBeams = 0;
    const rows: any[] = [], cold: any[] = [];
    const states = createHash('sha256');

    function baseline(): any {
      const start = performance.now();
      const packet = baselineEncoder.capture(engine, tick, recycle, recycleVisuals);
      const captured = performance.now();
      // Actual local presentation transport shape, not a network codec. Transfer
      // its buffers exactly as local-combat.worker does; retain clone CPU apart.
      const delivered = structuredClone(packet, { transfer: [packet.buffer, packet.visuals.buffer] });
      const cloned = performance.now();
      const view = baselineDecoder.apply(delivered);
      const decoded = performance.now();
      recycle = delivered.buffer; recycleVisuals = delivered.visuals.buffer;
      return { arm: 'A', packet: delivered, view, ms: {
        capture: captured - start, cloneDelivery: cloned - captured, decode: decoded - cloned,
        acknowledge: 0, captureDecode: captured - start + decoded - cloned, pipeline: decoded - start,
      } };
    }
    function candidate(): any {
      const start = performance.now();
      const packet = candidateEncoder.capture(engine.ships, tick, tick === 1);
      const captured = performance.now();
      if (packet === null) throw new Error(`Candidate rejected entire generation at tick ${tick}; capture=${captured - start}ms`);
      const view = candidateDecoder.decode(packet);
      const decoded = performance.now();
      assert.equal(candidateEncoder.acknowledge(tick), true, 'ACK only after successful original decoder validation');
      const acknowledged = performance.now();
      return { arm: 'B', packet, view, ms: {
        capture: captured - start, cloneDelivery: 0, decode: decoded - captured,
        acknowledge: acknowledged - decoded, captureDecode: decoded - start, pipeline: acknowledged - start,
      } };
    }
    function pair(order: 'AB' | 'BA', block: number, warmup: boolean): void {
      // ONE world, advanced ONCE per pair, never between its two arms.
      engine.fixedUpdate(DT); tick++;
      const source = engine.ships;
      minShips = Math.min(minShips, source.length); maxShips = Math.max(maxShips, source.length);
      maxProjectiles = Math.max(maxProjectiles, engine.projectiles.length); maxBeams = Math.max(maxBeams, engine.beams.length);
      let expected: any;
      try {
        assert.equal(source.length, 22, 'Fixture roster changed; not a fixed 22-ship comparison');
        expected = source.map(shipRead);
        states.update(serialize(expected));
      } catch (error) { readFailure ??= errorText(error); baselineFailure ??= 'Read-set oracle unavailable'; }
      let a: any, b: any;
      for (const arm of order) {
        if (arm === 'A' && !baselineFailure) {
          try { a = baseline(); } catch (error) { baselineFailure = errorText(error); }
        } else if (arm === 'B') {
          try { b = candidate(); } catch (error) { candidateFailure = errorText(error); }
        }
      }
      try {
        if (b && expected && !readFailure) {
          assert.deepEqual(b.view.ships.map(shipRead), expected, `Candidate renderer reads at tick ${tick}`);
          assert.deepEqual(source.map(shipRead), expected, 'Capture/decode changed authority renderer state');
          verified++;
        }
      } catch (error) { readFailure = errorText(error); baselineFailure ??= 'Candidate renderer equivalence failed'; }
      try {
        if (a && b && expected && !readFailure) {
          assert.deepEqual(Object.keys(a.view.hud), [], 'HUD must remain isolated (decoder may use a null prototype)');
          for (const key of context.isolation.emptyCollections) {
            assert.deepEqual((a.view.view as any)[key], [], `World collection leaked: ${key}`);
          }
          assert.equal(a.packet.visuals.fields.length, packedVisualFields.length, 'Every empty packed collection retained');
          assert.equal(a.packet.visuals.length, packedVisualFields.length, 'Only empty collection counts in packed payload');
          assert.ok(a.view.view.ships.every((ship: any) => ship instanceof ProjectedRenderShip), 'Original renderer mode silently fell back');
          assert.deepEqual(a.view.view.ships.map(shipRead), expected, `Baseline renderer reads at tick ${tick}`);
          assert.deepEqual(a.view.view.allCapitalShips.map((ship: any) => ship.id), engine.allCapitalShips.map(ship => ship.id));
          const lookup = new Map(b.view.ships.map((ship: any) => [ship.id, ship]));
          for (const ship of a.view.view.allCapitalShips) assert.deepEqual(shipRead(ship), shipRead(lookup.get(ship.id) as any));
          assert.deepEqual(shipRead(a.view.view.playerShip), shipRead(lookup.get(engine.playerShip.id) as any));
          assert.deepEqual(shipRead(a.view.view.enemyShip), shipRead(lookup.get(engine.enemyShip.id) as any));
          pairedVerified++;
        }
      } catch (error) { baselineFailure = errorText(error); }
      // Sizes and all equality/hash work are OUTSIDE every timed region. V8
      // object serialization is only a labelled size proxy, never network bytes.
      for (const run of [a, b].filter(Boolean)) {
        const bytes = run.arm === 'B' ? { packetBytes: run.packet.byteLength } : {
          v8ObjectSurrogateBytes: serialize(run.packet).byteLength,
          allocatedTransferBytes: run.packet.buffer.byteLength + run.packet.visuals.buffer.byteLength,
          usedNumericBytes: (run.packet.length + run.packet.visuals.length) * Float64Array.BYTES_PER_ELEMENT,
        };
        const row = { tick, block, order, arm: run.arm, ms: run.ms, bytes };
        if (!warmup) rows.push(row); else if (tick === 1) cold.push(row);
      }
    }

    console.error('Ship display benchmark: 60 warmup ticks, then 24 ABBA blocks (48 paired states), one native 22-ship world.');
    for (let i = 0; i < WARMUP && !candidateFailure; i++) pair(i % 2 ? 'BA' : 'AB', -1, true);
    for (let block = 0; block < BLOCKS && !candidateFailure; block++) {
      pair('AB', block, false);
      if (!candidateFailure) pair('BA', block, false);
    }
    const aRows = rows.filter(row => row.arm === 'A'), bRows = rows.filter(row => row.arm === 'B');
    const comparable = !baselineFailure && !candidateFailure && !readFailure
      && aRows.length === BLOCKS * 2 && bRows.length === BLOCKS * 2 && pairedVerified === WARMUP + BLOCKS * 2;
    const blockRatios: number[] = [];
    if (comparable) for (let block = 0; block < BLOCKS; block++) {
      const total = (arm: string) => rows.filter(row => row.block === block && row.arm === arm)
        .reduce((sum, row) => sum + row.ms.captureDecode, 0);
      blockRatios.push(total('B') / total('A'));
    }
    const report = {
      status: comparable ? 'FAIR_SHIP_READSET_CPU_COMPARISON_ONLY' : 'UNDETERMINED_CANDIDATE_STAGES_ONLY',
      performanceGate: 'NOT_EVALUATED', defaultEnablement: false,
      fixture: { seed: SEED, dt: DT, warmupTicks: WARMUP, abbaBlocks: BLOCKS, measuredStates: BLOCKS * 2,
        completedTicks: tick, capitalShips: 22, minShips, maxShips, maxProjectiles, maxBeams,
        hulls: '2 onslaught + 20 native AI-loadout hammerhead', positionScale: 0.2,
        stateReadsetSha256: states.digest('hex') },
      machine: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
      build: context.build, isolation: context.isolation,
      validation: { candidateVerifiedStates: verified, pairedVerifiedStates: pairedVerified,
        baselineFailure, candidateFailure, readFailure },
      candidate: summarize(bRows), baseline: comparable ? summarize(aRows) : null,
      candidateToBaselineCaptureDecodeBlockRatios: comparable ? stats(blockRatios) : null,
      blockRatios: comparable ? blockRatios : null, coldFirstFrameExcludedFromSteadyStats: cold,
      sampling: 'Each block: advance->A/B, advance->B/A. Same state within each pair. Paired block ratios use summed capture+decode; 48 states, 24 blocks, not 48 independent trials.',
      limitations: [
        'Single short Node process; no browser GPU/render draw, HUD, full world FX, LAN transport, compression, fanout, packet loss, resync or local prediction measurements.',
        'Baseline is the original render-mode graph encoder/decoder with ONLY a test-build HUD root and empty world collections patch. Validators and production files are unchanged.',
        'Baseline retains tiny world envelope scalars/environment and empty visual containers; candidate delivers only ship roots and their metadata. This is not a full-world-versus-ship-only comparison.',
        'Baseline structuredClone transfers both numeric buffers; returned buffers are reused next capture. Capture+decode excludes delivery clone; pipeline includes it. Candidate decode owns its input copy and pipeline includes ACK.',
        'Baseline V8 serialization bytes are an object-size surrogate, NOT real network payload. Candidate packetBytes are exact ArrayBuffer bytes. No payload ratio or network-byte gate is asserted.',
        'World advance, renderer-read snapshots, equality, state hashing and byte sizing are outside timings, but their allocations may still influence later GC. No forced GC, discarded outliers or repeated runs.',
        'Fixed native fixture does not exercise all optional states/extensions. Read-set equivalence is not pixel validation or a complete authority-state mutation audit.',
        'Warmup/reset definition traffic is excluded from steady stats and reported separately. This experiment cannot pass a default-enable gate or claim the production LAN has migrated.',
      ],
      samples: rows,
    };
    console.log(JSON.stringify(report, null, 2));
    if (candidateFailure || readFailure) process.exitCode = 1;
  } finally { globalThis.fetch = previousFetch; }
}