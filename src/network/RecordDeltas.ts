/** Native record templates without write instrumentation or a temporal baseline.
 * The whole definition table accompanies each frame. SWF3's bounded immutable
 * byte cache and the existing ACKed byte delta reuse it; cold/skipped frames are
 * independently decodable. Only finite scalar constants enter a definition.
 */
import { componentCapsule, decodeComponent } from './ComponentReplication';

type Scalar = null | string | number | boolean;
interface Definition { keys: readonly string[]; fixed: readonly Scalar[]; dynamic: readonly number[] }
interface Entry { id: number; definition: Definition }
interface Plan extends Entry { changing: boolean[]; inputKeys: readonly string[]; constants: number[] }
const MAX_FIELDS = 256, MAX_DEFINITIONS = 8192;
const scalar = (v: unknown): v is Scalar => v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v);
const safeKey = (key: unknown): key is string => typeof key === 'string' && key.length > 0 && key.length <= 128 && !['__proto__', 'prototype', 'constructor'].includes(key);
const invalid = (): never => { throw Error('Invalid record delta'); };

export class RecordDeltaCapture {
  private readonly plans = new WeakMap<object, Plan>();
  private readonly shared = new Map<string, Entry>();
  private used = new Map<number, Definition>();
  private previous = new Map<number, Definition>();
  private frame: unknown;
  private nextId = 0;
  begin(): void { this.used.clear(); }
  /** Fast path for a shape already validated by nativeCaptureShape. No generic
   * key-identity assumption: the caller owns this immutable traversal plan.
   * Check constants directly, pack only dynamic fields; mutations fall back to
   * record(), which promotes exact values and invalidates the definition. */
  recordNative(source: object, keys: readonly string[], fields: readonly unknown[], indices: readonly number[],
    encode: (value: unknown, slot: number) => unknown): { $recordDelta: [number, unknown[]] } | null {
    const plan = this.plans.get(source);
    if (!plan || plan.inputKeys !== keys) return null;
    for (const i of plan.constants) if (!Object.is(fields[indices[i]], plan.definition.fixed[i])) return null;
    const dynamic = plan.definition.dynamic;
    for (const i of dynamic) if (typeof fields[indices[i]] === 'function') return null;
    const values = new Array(dynamic.length);
    for (let slot = 0; slot < dynamic.length; slot++) {
      const i = dynamic[slot], value = fields[indices[i]];
      values[slot] = scalar(value) ? value : encode(value, i);
    }
    this.used.set(plan.id, plan.definition);
    if (this.used.size > MAX_DEFINITIONS) invalid();
    return { $recordDelta: [plan.id, values] };
  }
  record(source: object, keys: readonly string[], values: readonly unknown[]): { $recordDelta: [number, unknown[]] } {
    if (keys.length !== values.length || !keys.length || keys.length > MAX_FIELDS) invalid();
    let plan = this.plans.get(source);
    const sameShape = plan && keys.length === plan.definition.keys.length && keys.every((key, i) => key === plan!.definition.keys[i]);
    let changing = sameShape ? plan!.changing : values.map(v => !scalar(v));
    let changed = !sameShape;
    if (sameShape) {
      for (let i = 0; i < keys.length; i++) if (!changing[i] && !Object.is(values[i], plan!.definition.fixed[i])) {
        if (!changed) changing = changing.slice();
        changing[i] = true; changed = true;
      }
    }
    if (changed) {
      if (keys.some(key => !safeKey(key)) || new Set(keys).size !== keys.length) invalid();
      const dynamic: number[] = [], fixed = values.map((v, i) => { if (changing[i]) { dynamic.push(i); return null; } return v as Scalar; });
      const signature = JSON.stringify([keys, fixed.map(v => Object.is(v, -0) ? { negativeZero: true } : v), dynamic]);
      let entry = this.shared.get(signature);
      if (!entry) {
        if (!Number.isSafeInteger(++this.nextId)) invalid();
        const definition = Object.freeze({ keys: Object.freeze([...keys]), fixed: Object.freeze(fixed), dynamic: Object.freeze(dynamic) });
        entry = { id: this.nextId, definition };
        if (this.shared.size >= MAX_DEFINITIONS) this.shared.delete(this.shared.keys().next().value!);
        this.shared.set(signature, entry);
      }
      plan = { ...entry, changing, inputKeys: keys, constants: keys.map((_, i) => i).filter(i => !changing[i]) }; this.plans.set(source, plan);
    }
    this.used.set(plan!.id, plan!.definition);
    if (this.used.size > MAX_DEFINITIONS) invalid();
    return { $recordDelta: [plan!.id, plan!.definition.dynamic.map(i => values[i])] };
  }
  finish(): unknown {
    if (this.frame && this.previous.size === this.used.size && [...this.used].every(([id, def]) => this.previous.get(id) === def)) return this.frame;
    this.previous = new Map(this.used);
    const schemas: (readonly string[])[] = [], schemaIds = new Map<string, number>();
    const rows: unknown[][] = [];
    for (const [id, definition] of this.used) {
      const signature = JSON.stringify(definition.keys);
      let schema = schemaIds.get(signature);
      if (schema === undefined) { schema = schemas.length; schemas.push(definition.keys); schemaIds.set(signature, schema); }
      rows.push([id, schema, definition.fixed, definition.dynamic]);
    }
    this.frame = componentCapsule({ schemas, rows });
    return this.frame;
  }
}

interface RestorePlan extends Definition { slots: Int16Array }
// Only decodeComponent-owned frozen data is cached; a caller's mutable table
// must always be checked again. The weak key cannot retain an expired packet.
const validated = new WeakMap<object, Map<number, RestorePlan>>();
export class RecordDeltaRestore {
  private readonly plans: Map<number, RestorePlan>;
  constructor(definitions: any) {
    const capsule = definitions?.$component === 1;
    const table = capsule ? decodeComponent(definitions) : definitions;
    if (!table || typeof table !== 'object' || Array.isArray(table)) invalid();
    const previous = capsule ? validated.get(table) : undefined;
    if (previous) { this.plans = previous; return; }
    let entries: [string, unknown][];
    if (Object.hasOwn(table, 'schemas') || Object.hasOwn(table, 'rows')) {
      if (Object.keys(table).length !== 2 || !Array.isArray(table.schemas) || !Array.isArray(table.rows)
        || table.schemas.length > MAX_DEFINITIONS || table.rows.length > MAX_DEFINITIONS) invalid();
      for (const keys of table.schemas) if (!Array.isArray(keys) || !keys.length || keys.length > MAX_FIELDS || keys.some((k: unknown) => !safeKey(k))) invalid();
      const ids = new Set<number>();
      entries = table.rows.map((row: unknown[]) => {
        if (!Array.isArray(row) || row.length !== 4 || !Number.isSafeInteger(row[0]) || (row[0] as number) < 1
          || ids.has(row[0] as number) || !Number.isInteger(row[1]) || (row[1] as number) < 0 || (row[1] as number) >= table.schemas.length) invalid();
        ids.add(row[0] as number);
        return [String(row[0]), { keys: table.schemas[row[1] as number], fixed: row[2], dynamic: row[3] }];
      });
    } else entries = Object.entries(table);
    if (entries.length > MAX_DEFINITIONS) invalid();
    this.plans = new Map();
    for (const [key, raw] of entries) {
      const id = Number(key), def = raw as Definition;
      if (!Number.isSafeInteger(id) || id < 1 || String(id) !== key || !def || typeof def !== 'object'
        || Object.keys(def).length !== 3 || !Array.isArray(def.keys) || !Array.isArray(def.fixed) || !Array.isArray(def.dynamic)
        || !def.keys.length || def.keys.length > MAX_FIELDS || def.keys.length !== def.fixed.length
        || Array.from(def.keys).some(k => !safeKey(k)) || new Set(def.keys).size !== def.keys.length || Array.from(def.fixed).some(v => !scalar(v))) invalid();
      const slots = new Int16Array(def.keys.length).fill(-1);
      let last = -1;
      for (let i = 0; i < def.dynamic.length; i++) {
        const slot = def.dynamic[i];
        if (!Number.isInteger(slot) || slot <= last || slot >= slots.length || def.fixed[slot] !== null) invalid();
        slots[slot] = i; last = slot;
      }
      this.plans.set(id, { keys: [...def.keys], fixed: [...def.fixed], dynamic: [...def.dynamic], slots });
    }
    if (capsule) validated.set(table, this.plans);
  }
  apply(tuple: [number, any[]], target: any, decode: (wire: any, previous: any) => any, nativeProjection = false): any {
    if (!Array.isArray(tuple) || tuple.length !== 2 || !Number.isSafeInteger(tuple[0]) || !Array.isArray(tuple[1])) invalid();
    const plan = this.plans.get(tuple[0]);
    if (!plan || tuple[1].length !== plan.dynamic.length) invalid();
    const output = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
    for (let i = 0; i < plan.keys.length; i++) {
      const key = plan.keys[i], slot = plan.slots[i];
      if (slot >= 0) {
        const value = tuple[1][slot];
        output[key] = value !== null && typeof value === 'object' ? decode(value, output[key]) : value;
      } else {
        const value = plan.fixed[i];
        // Prediction/HUD may have written the replica: never blindly skip a
        // static field based on the wire identity or a prior applied revision.
        if (!nativeProjection || !Object.is(output[key], value)) output[key] = value;
      }
    }
    return output;
  }
}
