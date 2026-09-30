import { ADUN_WEAPONS } from '../engine/content/SpearOfAdunIds';

const retired = new Set<string>(Object.values(ADUN_WEAPONS));
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Unload only the retired v05 arsenal, never substitute the new Ark's equipment.
 * Copy-on-write; caller must back up original library bytes before enabling saves.
 * Unknown hulls, unknown slots/weapons and other malformed data still reach decodeDesign. */
export function removeRetiredAdunWeapons(value: unknown): { value: unknown; removed: number } {
  let visited = 0;
  function visit(input: unknown, depth: number): { value: unknown; removed: number } {
    if (depth > 8 || ++visited > 128) throw new Error('模块编组超过限制。');
    if (!record(input)) return { value: input, removed: 0 };
    let result = input, removed = 0;
    if (record(input.weapons)) {
      const emptied = new Set(Object.entries(input.weapons)
        .filter(([, id]) => typeof id === 'string' && retired.has(id)).map(([slot]) => slot));
      if (emptied.size) {
        result = { ...result, weapons: Object.fromEntries(Object.entries(input.weapons)
          .map(([slot, id]) => [slot, emptied.has(slot) ? null : id])) };
        removed += emptied.size;
        if (Array.isArray(input.groups)) result.groups = input.groups.map(group =>
          record(group) && Array.isArray(group.weaponSlotIds)
            ? { ...group, weaponSlotIds: group.weaponSlotIds.filter(id => !emptied.has(id as string)) } : group);
      }
    }
    if (record(input.modules)) {
      const modules = input.modules;
      const children = Object.entries(modules).map(([id, child]) => {
        const changed = visit(child, depth + 1); removed += changed.removed;
        return [id, changed.value] as const;
      });
      if (children.some(([id, child]) => child !== modules[id])) result = { ...result, modules: Object.fromEntries(children) };
    }
    return { value: result, removed };
  }
  return visit(value, 0);
}
