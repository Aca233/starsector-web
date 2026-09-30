import { isImmutableMetadata } from '../../engine/extensions/Immutable';
import { DISPLAY_DEFINITION_LIMITS as L, forbiddenDefinitionKey, type DefinitionFragment } from './DisplayDefinitionTable';

/** A private authority marker, converted to a wire tag by captureCombat. */
export class CapturedDisplayDefinition {
  constructor(public readonly index: number) {}
}
/** Defer metadata sampling until the original pack traversal reaches it: range/
 * speed and other projection reads may have changed a definition in between. */
export class DisplayDefinitionRequest {
  constructor(public readonly value: object, public readonly owner: DisplayDefinitionCapture) {}
}
const frozen = new WeakMap<object, DefinitionFragment | null>();
interface Shape { keys: string[]; values: unknown[]; fragment: DefinitionFragment | null }
const mutable = new WeakMap<object, Shape>();
function bounded(fragment: DefinitionFragment): DefinitionFragment | null {
  return fragment.text.length <= L.characters && fragment.nodes <= L.nodes && fragment.height <= L.depth ? fragment : null;
}
function leaf(value: unknown): DefinitionFragment | null {
  if (value === undefined) return {text:'[2]',nodes:1,height:0};
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string' && value.length <= L.string) return {text:JSON.stringify(value),nodes:1,height:0};
  if (!value || typeof value !== 'object' || !isImmutableMetadata(value)) return null;
  if (frozen.has(value)) return frozen.get(value)!;
  const result = inspect(value, true); frozen.set(value, result); return result;
}
function inspect(value: object, immutable: boolean): DefinitionFragment | null {
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? !immutable || prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return null;
  const keys = Object.keys(value);
  if (array && (keys.length !== value.length || keys.some((key, i) => key !== String(i)))) return null;
  const previous = !immutable ? mutable.get(value) : undefined;
  let unchanged = !!previous && keys.length === previous.keys.length;
  // Unchanged roots still sample EVERY descriptor/value. Reuse only the last
  // verified values, not object identity or a frame-level "already seen" flag.
  // A values array is needed only once a differing key/value has been found.
  let values: unknown[] | undefined = unchanged ? undefined : [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // Qualification never invokes accessors, even on a previously admitted root.
    if (!descriptor || !('value' in descriptor)) return null;
    const child = descriptor.value;
    if (unchanged && key === previous!.keys[i] && Object.is(child, previous!.values[i])) continue;
    if (key.length > L.key || forbiddenDefinitionKey(key)) return null;
    if (child !== null && typeof child === 'object' && !isImmutableMetadata(child)) return null;
    if (unchanged) { values = previous!.values.slice(0, i); unchanged = false; }
    values!.push(child);
  }
  if (unchanged) return previous!.fragment;
  const parts: string[] = []; let nodes = 1, height = 0;
  for (let i = 0; i < keys.length; i++) {
    const child = leaf(values![i]); if (!child) return null;
    nodes += child.nodes; height = Math.max(height, child.height + 1);
    if (nodes > L.nodes || height > L.depth) return null;
    parts.push(array ? child.text : '[' + JSON.stringify(keys[i]) + ',' + child.text + ']');
  }
  const fragment = bounded({text:'[' + (array ? 1 : 0) + ',[' + parts.join(',') + ']]', nodes, height});
  if (!immutable) mutable.set(value, {keys, values: values!, fragment});
  return fragment;
}
export class DisplayDefinitionCapture {
  readonly entries: string[] = [];
  private readonly indices = new Map<string, number>();
  private characters = 0;
  private nodes = 0;
  reference(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const fragment = isImmutableMetadata(value) ? leaf(value) : inspect(value, false);
    if (!fragment) return value;
    let index = this.indices.get(fragment.text);
    if (index === undefined) {
      // Admission is optional: oversized/custom metadata keeps the legacy path.
      if (this.entries.length >= L.entries || this.characters + fragment.text.length > L.characters || this.nodes + fragment.nodes > L.nodes) return value;
      index = this.entries.length; this.entries.push(fragment.text); this.indices.set(fragment.text, index);
      this.characters += fragment.text.length; this.nodes += fragment.nodes;
    }
    return new CapturedDisplayDefinition(index);
  }
}
