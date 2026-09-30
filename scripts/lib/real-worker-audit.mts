import { captureCombat } from '../../src/network/AuthorityCombatSnapshot';
import { encodeProjectedBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import type { LocalCombatKernel } from '../../src/engine/runtime/local/LocalCombatKernel';

/** Test-build only: queried between transactions, outside every timed step. */
export function workerAudit(kernel: LocalCombatKernel) {
  const hidden = [...new Set([...kernel.engine.allCapitalShips, ...kernel.engine.ships])].map(ship => {
    const control = ship.weaponControl as any;
    return [ship.id, ship.weapons.map(mount => {
      const state = control.autofire.trackers.get(mount);
      return [mount.slotId, state && Object.fromEntries(Object.entries(state).map(([key, value]: [string, any]) => [key,
        key === 'target' ? value && [value.kind, value.entity.id]
          : key === 'spec' ? [value.id, value === mount.spec]
          : key === 'random' ? value.checkpointWitness() : value]))];
    })];
  });
  return { hidden, wire: encodeProjectedBinaryFrame(captureCombat(kernel.engine, kernel.tick, {}, 0, true, true, true, true, true), true) };
}
