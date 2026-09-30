import { immutableCopy } from '../../engine/extensions/Immutable';
import { validateDisplayDefinition } from './DisplayDefinition';
import { DISPLAY_DEFINITION_LIMITS as L, forbiddenDefinitionKey } from './DisplayDefinitionTable';
interface Entry { value: object; nodes: number }
function decode(text: string): Entry {
  let nodes = 0;
  const read = (node: unknown, depth: number): unknown => {
    if (++nodes > L.nodes || depth > L.depth) throw Error('Display definition budget exceeded');
    if (node === null || typeof node === 'boolean' || typeof node === 'number' && Number.isFinite(node)) return node;
    if (typeof node === 'string') { if (node.length > L.string) throw Error('Display definition string budget exceeded'); return node; }
    if (!Array.isArray(node)) throw Error('Invalid display definition grammar');
    if (node.length === 1 && node[0] === 2) return undefined;
    if (node.length !== 2 || !Array.isArray(node[1])) throw Error('Invalid display definition container');
    if (node[0] === 1) return node[1].map(child => read(child, depth + 1));
    if (node[0] !== 0) throw Error('Invalid display definition tag');
    const result: Record<string, unknown> = {};
    for (const pair of node[1]) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || pair[0].length > L.key
        || forbiddenDefinitionKey(pair[0]) || Object.hasOwn(result, pair[0])) throw Error('Invalid display definition key');
      result[pair[0]] = read(pair[1], depth + 1);
    }
    return result;
  };
  const value = read(JSON.parse(text), 0);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid display definition root');
  validateDisplayDefinition(value); // Including asset allowlist; never skipped for new content.
  return {value:immutableCopy(value), nodes};
}
/** Receiver-local cache: no sharing with authority, other viewers or mutable
 * fallback records. Immutable data alone may skip repeat validation. */
export class DisplayDefinitionReceiver {
  private readonly cache = new Map<string, Entry>();
  private readonly owned = new WeakSet<object>();
  private readonly sources = new WeakMap<object, object>();
  private characters = 0;
  private nodes = 0;
  get active(): boolean { return this.cache.size > 0; }
  prepare(table: unknown): readonly object[] {
    if (!Array.isArray(table) || table.length > L.entries) throw Error('Invalid display definition table');
    let characters = 0, nodes = 0;
    const pending = new Map<string, Entry>();
    const values: object[] = [];
    for (const text of table) {
      if (typeof text !== 'string' || (characters += text.length) > L.characters) throw Error('Display definition table budget exceeded');
      const entry = this.cache.get(text) ?? pending.get(text) ?? decode(text);
      if ((nodes += entry.nodes) > L.nodes) throw Error('Display definition table node budget exceeded');
      pending.set(text, entry); values.push(entry.value);
    }
    // Invalid tables never partially populate this receiver. The cache is only
    // a performance hint: every frame still carries ALL referenced content.
    for (const [text, entry] of pending) {
      this.owned.add(entry.value);
      if (this.cache.has(text)) continue;
      while (this.cache.size && (this.cache.size >= L.cacheEntries || this.characters + text.length > L.cacheCharacters || this.nodes + entry.nodes > L.cacheNodes)) {
        const first = this.cache.entries().next().value!;
        this.cache.delete(first[0]); this.characters -= first[0].length; this.nodes -= first[1].nodes;
      }
      this.cache.set(text, entry); this.characters += text.length; this.nodes += entry.nodes;
    }
    return values;
  }
  /** A definition's content is shared, but its root identifies a single binding
   * (e.g. one weapon mount). Do not intern these roots: range/speed readers use
   * spec identity to distinguish mounts with identical metadata. */
  bind(definition: object): object {
    if (!this.owned.has(definition)) throw Error('Unowned display definition');
    const value = Object.freeze({...definition});
    this.owned.add(value); this.sources.set(value, definition);
    return value;
  }
  sourceOf(value: unknown): object | undefined {
    return value && typeof value === 'object' ? this.sources.get(value) : undefined;
  }
  owns(value: unknown): boolean { return !!value && typeof value === 'object' && this.owned.has(value); }
}
export function resolveDisplayDefinition(table: readonly object[] | undefined, index: unknown): object {
  if (!table || !Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= table.length) throw Error('Invalid display definition reference');
  return table[index as number];
}
