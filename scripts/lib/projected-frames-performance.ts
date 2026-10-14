import '../../src/engine/simulation/CombatEngine';
import { LocalWorkerHost } from '../../src/engine/runtime/local/LocalWorkerHost';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import { runtimeShipPacks } from '../../src/engine/modding/ShipPackCatalog';
import { assetManager } from '../../src/engine/assets/AssetResolver';
import { DirectEcsBatchRenderer } from '../../src/engine/render/webgl/DirectEcsBatchRenderer';
import { ProjectedSpriteUploader, planProjectedBatches } from '../../src/engine/render/webgl/ProjectedSpriteUploader';
import {
  PROJECTED_FLOATS_PER_SPRITE,
  PROJECTED_FLOATS_PER_SHIP_HUD,
  type ProjectedFrameViews,
} from '../../src/engine/runtime/rust/RustProjectionViews';
import manifest from '../../public/game-assets/asset-manifest.json';
import type { LocalCombatConfig } from '../../src/engine/runtime/local/LocalCombatContracts';
import type { CombatControlSample } from '../../src/engine/runtime/CombatControl';

/** Geometry tolerance: projected sprites are f32 casts of the f64 authority
 * pose the presenter reads, so only float32 rounding may differ. */
const poseTolerance = (value: number) => Math.max(1e-2, 1e-6 * Math.abs(value));

export async function measureProjected(projected: boolean, warm: number, steps: number) {
  await assetManager.loadManifest('data:application/json,' + encodeURIComponent(JSON.stringify(manifest)));
  const hulls = ['web_zhuyuan', 'web_gloriana', 'web_sc2_hyperion'];
  const config: LocalCombatConfig = {
    backend: 'rust-wasm', seed: 917, multicore: false, playerHull: hulls[0], enemyHull: hulls[0],
    projectedPresentation: projected,
    additionalShips: Array.from({ length: 20 }, (_, i) => ({
      hull: hulls[i % 3], isPlayer: i % 2 === 0,
      position: [((i >> 1) % 8 - 3.5) * 700, (i % 2 ? 1 : -1) * (1300 + Math.floor(i / 16) * 650)] as [number, number],
      facing: i % 2 ? -Math.PI / 2 : Math.PI / 2,
    })),
    content: { ships: contentRegistry.getAllShips(), weapons: contentRegistry.getAllWeapons(), packs: runtimeShipPacks() },
  };
  const sample: CombatControlSample = { autopilot: true, blocked: false, keys: {}, aim: [0, 0],
    firing: false, mouseSteering: false, pointerActive: false };
  const host = new LocalWorkerHost(config);
  try {
    const ready = await host.ready, problems: unknown[] = [], witnesses = [ready.witness];
    const initial = { capitals: ready.presentation.view.allCapitalShips.length, ships: ready.presentation.view.ships.length,
      asteroids: ready.presentation.view.asteroids.length, authority: ready.authority, projectedOn: projected };
    if (initial.capitals !== 22 || ready.authority.kind !== 'rust-wasm') throw Error('Actual benchmark roster/backend differs');
    const samples = [];
    for (let i = 0; i < warm + steps; i++) {
      const start = performance.now(), frame = await host.step(sample), roundtrip = performance.now() - start;
      witnesses.push(frame.witness);
      const p = frame.projected;
      if (i >= warm) {
        if (!projected && p !== undefined) problems.push({ kind: 'toggle', tick: frame.tick });
        if (projected && p === undefined) problems.push({ kind: 'missing', tick: frame.tick });
        if (p) {
          for (let w = 0; w < 22; w++) if (!Object.is(p.witness[w], frame.witness[w]))
            problems.push({ kind: 'witness', tick: frame.tick, word: w, projected: p.witness[w], snapshot: frame.witness[w] });
          if (p.tick !== frame.tick || p.witness.length !== 22) problems.push({ kind: 'shape', tick: frame.tick });
          if (p.sprite.length !== p.spriteCount * PROJECTED_FLOATS_PER_SPRITE
            || p.hud.length !== p.hudShipCount * PROJECTED_FLOATS_PER_SHIP_HUD
            || p.slices.length !== p.sliceCount * 4)
            problems.push({ kind: 'layout', tick: frame.tick, sprite: p.sprite.length, hud: p.hud.length, slices: p.slices.length });
          // The presenter exposes stableId strings while the projection carries
          // numeric entity ids, and no host-side channel maps between them per
          // tick; the id channel itself is pinned by the witness gate. Geometry
          // is therefore verified as a one-to-one pose matching: every projected
          // sprite must land on exactly one available presenter ship pose.
          const available: { x: number; y: number; rot: number }[] = [];
          for (const ship of frame.presentation.view.ships) {
            if (ship.isDead || ship.isDocked || ship.isRetreated) continue;
            available.push({ x: ship.pos.x, y: ship.pos.y, rot: ship.facingRad });
          }
          if (available.length !== p.hudShipCount) problems.push({ kind: 'count', tick: frame.tick, projected: p.hudShipCount, presenter: available.length });
          const taken = new Set<number>();
          for (let s = 0; s < Math.min(p.hudShipCount, available.length); s++) {
            const x = p.sprite[s * PROJECTED_FLOATS_PER_SPRITE], y = p.sprite[s * PROJECTED_FLOATS_PER_SPRITE + 1],
              rot = p.sprite[s * PROJECTED_FLOATS_PER_SPRITE + 4];
            let matched = -1;
            for (let k = 0; k < available.length; k++) {
              if (taken.has(k)) continue;
              const e = available[k];
              if (Math.abs(x - e.x) <= poseTolerance(e.x) && Math.abs(y - e.y) <= poseTolerance(e.y)
                && Math.abs(rot - e.rot) <= poseTolerance(e.rot)) { matched = k; break; }
            }
            if (matched < 0) problems.push({ kind: 'pose', tick: frame.tick, sprite: s, x, y, rot });
            else taken.add(matched);
          }
          const beams = frame.presentation.view.beams.length;
          if (p.witness[20] !== frame.presentation.view.projectiles.length || p.witness[21] !== beams)
            problems.push({ kind: 'ordnance', tick: frame.tick, projected: [p.witness[20], p.witness[21]], presenter: [frame.presentation.view.projectiles.length, beams] });
        }
        samples.push({ tick: frame.tick, simulation: frame.simulationMs, encode: frame.encodeMs,
          decode: frame.decodeMs, roundtrip, bytes: frame.packetBytes,
          projectedBytes: p ? p.sprite.byteLength + p.slices.byteLength + p.hud.byteLength + p.witness.byteLength : 0,
          ships: frame.presentation.view.ships.length, projectedShips: p?.hudShipCount ?? 0,
          projectiles: frame.presentation.view.projectiles.length });
      }
    }
    return { backend: 'rust-wasm' as const, projected, initial, config, sample, warm, steps, samples, problems, witnesses,
      finalTick: host.latest!.tick, actualProductionWorker: true };
  } finally { host.dispose(); }
}

/** Headless exercise of the texture-batching planner and uploader: synthetic
 * rows, null GL context, draw log asserted by the caller. */
export function exerciseProjectedUploader(): { plan: unknown; upload: unknown } {
  const rows = 8, ships = 6, projectiles = rows - ships;
  const keys = ['hull-a', 'hull-b', 'hull-c', 'hull-d', 'hull-e', 'hull-a']; // 5 distinct, capacity 4
  const sprite = new Float32Array(rows * PROJECTED_FLOATS_PER_SPRITE);
  for (let r = 0; r < rows; r++) {
    sprite[r * PROJECTED_FLOATS_PER_SPRITE] = r * 10; // x marks the original row
    sprite[r * PROJECTED_FLOATS_PER_SPRITE + 1] = r;
  }
  const hud = new Float32Array(ships * PROJECTED_FLOATS_PER_SHIP_HUD);
  for (let s = 0; s < ships; s++) hud[s * PROJECTED_FLOATS_PER_SHIP_HUD] = s + 1;
  const views: ProjectedFrameViews = { spriteInstances: sprite, spriteCount: rows, batchSlices: new Float32Array(8),
    batchSliceCount: 2, ribbons: new Float32Array(0), ribbonCount: 0, events: new Float32Array(0), eventCount: 0,
    particleBursts: new Float32Array(0), particleBurstCount: 0, hudTelemetry: hud, hudShipCount: ships };
  const textureKeyOf = (index: number) => index < ships ? keys[index] : null;
  const plan = planProjectedBatches(views, textureKeyOf, 4);
  const uploader = new ProjectedSpriteUploader(new DirectEcsBatchRenderer(null), 4);
  const bound: string[] = [];
  const upload = uploader.upload(views, textureKeyOf, key => { bound.push(key); return {}; });
  return {
    plan: { total: plan.total, groups: plan.groups, orderedX: Array.from(plan.ordered.subarray(0, plan.total * PROJECTED_FLOATS_PER_SPRITE)).filter((_, i) => i % PROJECTED_FLOATS_PER_SPRITE === 0) },
    upload: { stats: upload.stats, draws: upload.draws, groups: upload.groups, bound, projectiles },
  };
}
