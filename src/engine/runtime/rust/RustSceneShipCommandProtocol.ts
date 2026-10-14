/** Command edges and startup HUD metadata. No live TS rule callback. */
import type { Ship } from '../../simulation/Ship';
import type { ShipCommand } from '../CombatCommands';
import type { RustBodyHandle } from './RustCoreProtocol';
export interface RustSceneShipCommand { readonly command: ShipCommand; readonly aim?: readonly [number, number]; readonly facing?: number }
export interface RustSceneSystemMeta {
  readonly ship: RustBodyHandle; readonly id: number; readonly tacticalCount: number; readonly moduleSlot: string | undefined;
  readonly propulsion: { readonly slots: readonly (RustBodyHandle | undefined)[]; readonly reserves: readonly [number, number, number] } | undefined;
}
const integer = (n: number) => { if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw Error('Invalid Rust ship command integer'); return n; };
const finite = (n: number) => { if (!Number.isFinite(n)) throw Error('Invalid Rust ship command number'); return n; };
function handle(h: RustBodyHandle): number[] { if (!h || !integer(h.generation)) throw Error('Invalid Rust ship command handle'); return [integer(h.slot), h.generation]; }
function row(tag: number, id: number, h: RustBodyHandle, data: readonly number[]): number[] {
  if (!integer(id) || data.length > 22) throw Error('Invalid Rust ship command row');
  const v = [tag, id, ...handle(h), ...data.map(finite)]; while (v.length < 26) v.push(0); return v;
}
export function encodeRustSceneShipCommand(input: RustSceneShipCommand, id: number, h: RustBodyHandle): number[][] {
  const c = input.command; let tag: number, action: number, value = 0;
  switch (c.kind) {
    case 'system': tag = 160; action = integer(c.value ?? 0); break;
    case 'shield': case 'hullShield': case 'vent': tag = 161; action = c.kind === 'shield' ? 0 : c.kind === 'hullShield' ? 1 : 2; break;
    case 'module': tag = 162; action = integer(c.value); break;
    case 'group': case 'mode': case 'autofire': tag = 163; action = c.kind === 'group' ? 0 : c.kind === 'mode' ? 1 : 2; value = integer(c.value); break;
    case 'recall': case 'target': tag = 164; action = c.kind === 'recall' ? 0 : 1; break;
    default: throw Error('Unknown Rust ship command');
  }
  const aimState = input.aim === undefined ? 0 : input.aim.length === 2 && input.aim.every(Number.isFinite) ? 1 : 2;
  const facingState = input.facing === undefined ? 0 : Number.isFinite(input.facing) ? 1 : 2;
  return [row(tag, id, h, [action, value, aimState, ...(aimState === 1 ? input.aim! : [0, 0]), facingState, facingState === 1 ? input.facing! : 0])];
}
/** Read each actual authored declaration once; missing slots stay in denominator. */
export function compileRustSceneSystemMetadata(ships: readonly Ship[], handles: ReadonlyMap<Ship, RustBodyHandle>, ids: ReadonlyMap<Ship, number>): RustSceneSystemMeta[] {
  return ships.map(ship => {
    const h = handles.get(ship), id = ids.get(ship); if (!h || !id) throw Error('Missing Rust system read admission identity');
    const config = ship.spec.modulePropulsion;
    return { ship: h, id, tacticalCount: ship.systems.length, moduleSlot: ship.moduleMount?.slotId, propulsion: config ? {
      slots: config.slotIds.map(slotId => {
        const child = ship.childModules.find(child => child.parentShip === ship && child.moduleMount?.slotId === slotId);
        if (!child) return undefined;
        const value = handles.get(child); if (!value) throw Error('Missing Rust propulsion module identity'); return value;
      }),
      reserves: [config.reserveSpeed, config.reserveAcceleration, config.reserveTurn],
    } : undefined };
  });
}
export function encodeRustSceneSystemMetadata(metadata: readonly RustSceneSystemMeta[], anchorId: number, anchor: RustBodyHandle): number[][] {
  const rows = [row(189, anchorId, anchor, [metadata.length])];
  metadata.forEach((m, order) => {
    const label = m.moduleSlot ?? ''; if (label.length > 4096 || m.propulsion && m.propulsion.slots.length > 128) throw Error('Rust system read metadata exceeds limits');
    rows.push(row(190, m.id, m.ship, [order, label.length, +(m.propulsion !== undefined), m.propulsion?.slots.length ?? 0, ...(m.propulsion?.reserves ?? [0, 0, 0]), integer(m.tacticalCount)]));
    for (let offset = 0; offset < label.length; offset += 20) {
      const chunk = label.slice(offset, offset + 20); rows.push(row(191, m.id, m.ship, [offset, chunk.length, ...Array.from({ length: chunk.length }, (_, i) => chunk.charCodeAt(i))]));
    }
    m.propulsion?.slots.forEach((h, i) => rows.push(row(192, m.id, m.ship, [i, +(h !== undefined), ...(h ? handle(h) : [0, 0])])));
  });
  rows.push(row(193, anchorId, anchor, [])); return rows;
}
