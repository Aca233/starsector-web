import { LocalCombatKernel } from '../../src/engine/runtime/local/LocalCombatKernel';
import { CombatPresentationEncoder } from '../../src/engine/runtime/local/CombatPresentationEncoder';
import { CombatPresentationDecoder } from '../../src/engine/runtime/local/CombatPresentationDecoder';
import { captureCombat } from '../../src/network/AuthorityCombatSnapshot';
import { encodeProjectedBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
export function scenario(count: number, hull: string, enemyHull = hull) {
  const kernel = new LocalCombatKernel({ playerHull: hull, enemyHull, seed: 917, multicore: false,
    additionalShips: Array.from({ length: count - 2 }, (_, i) => ({ hull: i % 2 === 0 ? hull : enemyHull, isPlayer: i % 2 === 0,
      position: [((i >> 1) % 8 - 3.5) * 700, (i % 2 ? 1 : -1) * (1300 + Math.floor(i / 16) * 650)] as [number, number],
      facing: i % 2 ? -Math.PI / 2 : Math.PI / 2 })) });
  const encoder = new CombatPresentationEncoder(1), decoder = new CombatPresentationDecoder(1, 'render-strict');
  const sample = { autopilot: true, blocked: false, keys: {}, aim: [0, 0] as [number, number], firing: false, mouseSteering: false, pointerActive: false };
  let recycle: ArrayBuffer | undefined, recycleVisuals: ArrayBuffer | undefined;
  return {
    advance() {
      const start = performance.now();
      // Same kernel as local-combat.worker, without IPC, pacing or AI Workers.
      kernel.step(sample);
      const simulated = performance.now();
      const packet = encoder.capture(kernel.engine, kernel.tick, recycle, recycleVisuals);
      const captured = performance.now();
      const presentation = decoder.apply(packet);
      const decoded = performance.now();
      recycle = packet.buffer; recycleVisuals = packet.visuals.buffer;
      return { simulation: simulated - start, capture: captured - simulated, decode: decoded - captured, total: decoded - start,
        numericBytes: (packet.length + packet.visuals.length) * 8, nodes: packet.nodeCount,
        ships: kernel.engine.ships.length, projectiles: kernel.engine.projectiles.length,
        // Display state is compared outside the timing; metadata is deliberately not walked every tick.
        display: presentation.view.allCapitalShips.map(s => [s.id, s.pos.x, s.pos.y, s.facingRad, s.hullHp, s.weapons.map(w => [w.slotId, w.currentAngleRad, w.glowAlpha])]) };
    },
    wire() { return encodeProjectedBinaryFrame(captureCombat(kernel.engine, kernel.tick, {}, 0, true, true, true, true, true), true); },
    witness() { return kernel.replayWitness(); },
    // Hidden per-mount state is not present in authority snapshots. Compare it
    // outside timing so candidate pruning cannot silently change scan/RNG state.
    fireControlWitness() {
      return [...new Set([...kernel.engine.allCapitalShips, ...kernel.engine.ships])].map(ship => {
        const control = ship.weaponControl as any;
        return [ship.id, ship.weapons.map(mount => {
          const state = control.autofire.trackers.get(mount);
          return [mount.slotId, state && Object.fromEntries(Object.entries(state).map(([key, value]: [string, any]) => [key,
            key === 'target' ? value && [value.kind, value.entity.id]
              : key === 'spec' ? [value.id, value === mount.spec]
              : key === 'random' ? value.checkpointWitness() : value]))];
        })];
      });
    },
    dispose() { kernel.dispose(); },
  };
}
