import '../../src/engine/simulation/CombatEngine';
import { LocalWorkerHost } from '../../src/engine/runtime/local/LocalWorkerHost';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import { runtimeShipPacks } from '../../src/engine/modding/ShipPackCatalog';
import { assetManager } from '../../src/engine/assets/AssetResolver';
import manifest from '../../public/game-assets/asset-manifest.json';
import type { LocalCombatConfig } from '../../src/engine/runtime/local/LocalCombatContracts';
import type { CombatControlSample } from '../../src/engine/runtime/CombatControl';

export async function measure(backend: 'typescript' | 'rust-wasm', warm: number, steps: number) {
  await assetManager.loadManifest('data:application/json,' + encodeURIComponent(JSON.stringify(manifest)));
  const hulls = ['web_zhuyuan', 'web_gloriana', 'web_sc2_hyperion'];
  const config: LocalCombatConfig = {
    backend, seed: 917, multicore: false, playerHull: hulls[0], enemyHull: hulls[0],
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
    const ready = await host.ready, witnesses = [ready.witness], samples = [];
    const initial = { capitals: ready.presentation.view.allCapitalShips.length, ships: ready.presentation.view.ships.length,
      asteroids: ready.presentation.view.asteroids.length, authority: ready.authority };
    if (initial.capitals !== 22 || ready.authority.kind !== backend) throw Error('Actual benchmark roster/backend differs');
    for (let i = 0; i < warm + steps; i++) {
      const start = performance.now(), frame = await host.step(sample), roundtrip = performance.now() - start;
      witnesses.push(frame.witness);
      if (i >= warm) samples.push({ tick: frame.tick, simulation: frame.simulationMs, encode: frame.encodeMs,
        decode: frame.decodeMs, roundtrip, bytes: frame.packetBytes, ships: frame.presentation.view.ships.length,
        projectiles: frame.presentation.view.projectiles.length, beams: frame.presentation.view.beams.length });
    }
    return { backend, initial, config, sample, warm, steps, samples, witnesses,
      finalTick: host.latest!.tick, finalAuthority: host.latest!.authority, actualProductionWorker: true };
  } finally { host.dispose(); }
}
