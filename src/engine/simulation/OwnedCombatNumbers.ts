/** Private descriptor certificates: exported predicates cannot mint ownership. */
interface Binding {
  readonly table: OwnedCombatNumbers; readonly slot: number; readonly field: number;
  readonly boolean: boolean; readonly descriptor: PropertyDescriptor;
  readonly object: object; readonly key: string;
}
const bindings = new WeakMap<object, Map<string, Binding>>();
const numericView = Symbol('combat-numeric-view');
interface NumericView { readonly table: OwnedCombatNumbers; readonly offset: number }
const views = new WeakMap<object, NumericView>();
function installedView(object: object): NumericView | undefined {
  return Object.getOwnPropertyDescriptor(object,numericView)?.value;
}
const accessors = new Map<string, PropertyDescriptor>();
export type NumberBinding = readonly [key: string, field: number, boolean?: boolean];
function certificate(object: object, key: string, descriptor = Object.getOwnPropertyDescriptor(object, key)): Binding | undefined {
  const binding = bindings.get(object)?.get(key), expected = binding?.descriptor;
  return expected && installedView(object) === views.get(object) && descriptor?.get === expected.get && descriptor?.set === expected.set
    && descriptor?.enumerable === expected.enumerable && descriptor?.configurable === expected.configurable ? binding : undefined;
}
export function isOwnedCombatNumber(object: object, key: string): boolean { return !!certificate(object, key); }
function readers(field: number, boolean: boolean): PropertyDescriptor {
  const key = `${field}/${boolean}`;
  let descriptor = accessors.get(key);
  if (!descriptor) {
    descriptor = {
      get(this: { [numericView]: NumericView }) {
        const view = this[numericView];
        const value = view.table.values[view.offset + field];
        return boolean ? value === 1 : value;
      },
      set(this: { [numericView]: NumericView }, value: number | boolean) {
        const view = this[numericView];
        if (view.table.poseReadOnly && field < 6) throw new Error('Combat pose write during observation');
        view.table.values[view.offset + field] = boolean ? Number(value) : value as number;
      }
    };
    accessors.set(key, descriptor);
  }
  return descriptor;
}
/** Permanent numerical storage, not a step packet. Compatibility fields have no
 * value of their own after admission. Buffer growth does not invalidate readers. */
export class OwnedCombatNumbers {
  values = new Float64Array(0);
  poseReadOnly = false;
  private readonly rows: Binding[][] = [];
  private readonly generations: number[] = [];
  private readonly free: number[] = [];
  constructor(readonly width: number) {}
  get capacity(): number { return this.values.length / this.width; }
  allocate(): number {
    const slot = this.free.pop() ?? this.rows.length;
    if (slot === this.rows.length) { this.rows.push([]); this.generations.push(1); }
    if (slot >= this.capacity) {
      const next = new Float64Array(Math.max(32, this.capacity * 2, slot + 1) * this.width);
      next.set(this.values); this.values = next;
    }
    this.values.fill(0, slot * this.width, (slot + 1) * this.width);
    return slot;
  }
  generation(slot: number): number { return this.generations[slot]; }
  canAttach(object: object, fields: readonly NumberBinding[]): boolean {
    return fields.every(([key, , boolean]) => {
      const d = Object.getOwnPropertyDescriptor(object, key);
      return !!d && 'value' in d && d.configurable === true && d.writable === true
        && typeof d.value === (boolean ? 'boolean' : 'number') && !bindings.get(object)?.has(key)
        && !installedView(object);
    });
  }
  attach(slot: number, object: object, fields: readonly NumberBinding[]): void {
    if (!this.canAttach(object, fields)) throw new Error('Unsafe combat numeric admission');
    let owned = bindings.get(object);
    if (!owned) { owned = new Map(); bindings.set(object, owned); }
    const view={table:this,offset:slot*this.width};
    views.set(object,view);Object.defineProperty(object,numericView,{value:view,configurable:true});
    for (const [key, field, boolean = false] of fields) {
      const before = Object.getOwnPropertyDescriptor(object, key)!;
      this.values[slot * this.width + field] = boolean ? Number(before.value) : before.value;
      const descriptor = { ...readers(field,boolean), enumerable: before.enumerable, configurable: before.configurable };
      const binding = { table: this, slot, field, boolean, descriptor, object, key };
      owned.set(key, binding); this.rows[slot].push(binding);
      Object.defineProperty(object, key, descriptor);
    }
  }
  intact(slot: number): boolean { return this.rows[slot].every(b => certificate(b.object, b.key) === b); }
  release(slot: number): void {
    const retired: Binding[] = [];
    for (const b of this.rows[slot]) {
      const descriptor = Object.getOwnPropertyDescriptor(b.object,b.key);
      if (descriptor?.get === b.descriptor.get && descriptor?.set === b.descriptor.set) {
        // A caller can freeze a formerly configurable adapter. It cannot be
        // materialized legally: retire this row instead of reusing its memory
        // under the surviving reader. Other fields still detach normally.
        if (!descriptor.configurable) { retired.push(b); continue; }
        const raw = this.values[slot * this.width + b.field];
        Object.defineProperty(b.object, b.key, { value: b.boolean ? raw === 1 : raw,
          writable: true, enumerable: b.descriptor.enumerable, configurable: true });
      }
      const owned = bindings.get(b.object);
      owned?.delete(b.key);
      if (!owned?.size) {
        bindings.delete(b.object);
        if (installedView(b.object) === views.get(b.object)) Reflect.deleteProperty(b.object,numericView);
        views.delete(b.object);
      }
    }
    this.rows[slot] = retired; this.generations[slot]++;
    if (!retired.length) this.free.push(slot);
  }
}
