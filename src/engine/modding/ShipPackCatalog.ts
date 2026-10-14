import type { PackVariant, ShipPack } from './ShipPack';
import { immutableCopy } from '../extensions/Immutable';
import { validateRuntimeShipPacks } from './ShipPackCapabilities';
import type { ShipSpec } from '../content/ShipSpec';
let packs: readonly ShipPack[] = [];
let revision = 0;
let templates = new Map<string, ShipSpec>(), baselines = new Map<string, ShipSpec>();
let variants = new Map<string, readonly PackVariant[]>();
let refit: ShipPack['refit'] = {ships: {}, weapons: {}, wings: {}, shipStatus: {}, weaponStatus: {}};
/** Validate and build once, then publish atomically; reads never rescan all packages. */
export function setRuntimeShipPacks(next: readonly ShipPack[]): void {
  const copy = immutableCopy(structuredClone(next));
  validateRuntimeShipPacks(copy);
  const nextTemplates = new Map<string, ShipSpec>(), nextBaselines = new Map<string, ShipSpec>();
  const nextVariants = new Map<string, PackVariant[]>();
  const nextRefit: ShipPack['refit'] = {ships: {}, weapons: {}, wings: {}, shipStatus: {}, weaponStatus: {}};
  const variantIds = new Set<string>();
  const merge = <T>(target: Record<string, T>, source: Record<string, T>) => {
    for (const [id, entry] of Object.entries(source)) {
      if (Object.hasOwn(target, id)) throw new Error('重复单舰包目录项：' + id);
      target[id] = entry;
    }
  };
  for (const pack of copy) {
    for (const ship of pack.ships) {
      if (nextTemplates.has(ship.id)) throw new Error('重复单舰包舰体：' + ship.id);
      nextTemplates.set(ship.id, ship);
    }
    for (const [id, baseline] of Object.entries(pack.baselines)) {
      if (nextBaselines.has(id)) throw new Error('重复单舰包舰体基线：' + id);
      nextBaselines.set(id, baseline);
    }
    for (const variant of pack.variants ?? []) {
      if (variantIds.has(variant.id)) throw new Error('重复单舰包配装：' + variant.id);
      variantIds.add(variant.id);
      const list = nextVariants.get(variant.fit.hullId) ?? [];
      list.push(variant); nextVariants.set(variant.fit.hullId, list);
    }
    merge(nextRefit.ships, pack.refit.ships); merge(nextRefit.weapons, pack.refit.weapons);
    merge(nextRefit.wings!, pack.refit.wings ?? {}); merge(nextRefit.shipStatus, pack.refit.shipStatus);
    merge(nextRefit.weaponStatus!, pack.refit.weaponStatus ?? {});
  }
  const frozenRefit = immutableCopy(nextRefit);
  const frozenVariants = new Map([...nextVariants].map(([id, entries]) => [id, Object.freeze(entries)]));
  packs = copy; templates = nextTemplates; baselines = nextBaselines;
  variants = frozenVariants; refit = frozenRefit; revision++;
}
export function runtimeShipPacks(): readonly ShipPack[] { return packs; }
export function shipPackCatalogRevision(): number { return revision; }
export function packageHullTemplate(id: string) { return templates.get(id); }
export function packageHullBaseline(id: string) { return baselines.get(id); }
export function packageVariants(hullId: string): readonly PackVariant[] { return variants.get(hullId) ?? []; }
export function packageRefit(): ShipPack['refit'] { return refit; }
