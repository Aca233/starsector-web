/** State owned by the lifetime of an entity, without adding effect-specific fields to core DTOs. */
const states = new WeakMap<object, Map<string, unknown>>();
export function effectState<T>(owner: object, id: string, create: () => T): T {
  let entries = states.get(owner);
  if (!entries) { entries = new Map(); states.set(owner, entries); }
  if (!entries.has(id)) entries.set(id, create());
  return entries.get(id) as T;
}

export function clearEffectState(owner: object): void { states.delete(owner); }
