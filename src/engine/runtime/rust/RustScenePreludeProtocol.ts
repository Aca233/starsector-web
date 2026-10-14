/** One-time actual hull stats. Dynamic scene support stays in the Rust authority. */
import type { Ship } from '../../simulation/Ship';
import type { RustBodyHandle } from './RustCoreProtocol';
export interface RustScenePreludeShip {
  readonly id: number; readonly handle: RustBodyHandle;
  readonly stationModule: boolean; readonly combatModule: boolean; readonly sharedFlux: boolean;
  readonly ecm: number; readonly nav: number; readonly penaltyMultiplier: number; readonly speedPercent: number;
  readonly dissipation: number; readonly hardFraction: number; readonly moduleBonus: number; readonly moduleHard: number;
  readonly publicVisible: boolean;
}
export interface RustScenePreludeAdmission { readonly ships: readonly RustScenePreludeShip[] }
export function compileRustScenePrelude(ships: readonly Ship[], handles: ReadonlyMap<Ship, RustBodyHandle>, ids: ReadonlyMap<Ship, number>): RustScenePreludeAdmission {
  return { ships: ships.map(ship => {
    const handle = handles.get(ship), id = ids.get(ship); if (!handle || !id) throw Error('Missing scene prelude identity');
    const stats = ship.hullStats;
    return { id, handle, stationModule: !!ship.spec.sourceHullTraits?.includes('STATION_MODULE'), combatModule: ship.isCombatModule,
      sharedFlux: !!ship.spec.sourceHullTraits?.includes('shared_flux_sink'), ecm: stats.ecmRating, nav: stats.navRating,
      penaltyMultiplier: stats.ecmPenaltyMultiplier, speedPercent: stats.speedPercent, dissipation: stats.fluxDissipation,
      hardFraction: stats.hardFluxDissipationFraction, moduleBonus: ship.moduleFluxBonus, moduleHard: ship.moduleHardFluxFraction,
      publicVisible: !ship.isDead && !ship.isRetreated && !ship.isDocked };
  }) };
}
const integer = (n: number) => { if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw Error('Invalid scene prelude integer'); return n; };
const finite = (n: number) => { if (!Number.isFinite(n)) throw Error('Invalid scene prelude number'); return n; };
const flag = (v: boolean) => { if (typeof v !== 'boolean') throw Error('Invalid scene prelude flag'); return +v; };
const identity = (h: RustBodyHandle) => { if (!h || !integer(h.generation)) throw Error('Invalid scene prelude handle'); return [integer(h.slot), integer(h.generation)]; };
export function encodeRustScenePrelude(data: RustScenePreludeAdmission, id: number, h: RustBodyHandle): number[][] {
  const rows: number[][] = [], keys = new Set<string>();
  const append = (tag: number, id: number, h: RustBodyHandle, values: number[]) => {
    if (!integer(id)) throw Error('Invalid scene prelude body ID'); const row = [tag, id, ...identity(h), ...values.map(finite)];
    if (row.length > 26) throw Error('Scene prelude row overflow'); while (row.length < 26) row.push(0); rows.push(row);
  };
  append(176, id, h, [1, integer(data.ships.length)]);
  data.ships.forEach((m, i) => {
    const key = identity(m.handle).join(':'); if (keys.has(key)) throw Error('Duplicate scene prelude identity'); keys.add(key);
    if (m.dissipation < 0) throw Error('Invalid scene prelude dissipation');
    append(177, m.id, m.handle, [i, flag(m.stationModule) | flag(m.combatModule) * 2 | flag(m.sharedFlux) * 4,
      m.ecm, m.nav, m.penaltyMultiplier, m.speedPercent, m.dissipation, m.hardFraction, m.moduleBonus, m.moduleHard, flag(m.publicVisible), 0]);
  }); append(178, id, h, []); return rows;
}
