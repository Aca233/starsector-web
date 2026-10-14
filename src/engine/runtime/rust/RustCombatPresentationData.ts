import { Vector2 } from '../../math/Vector2';

/** Copy presentation data, with no retained source aliases or executable values. */
export function copyRustPresentationData<T>(value: T): T {
  const seen = new Map<object, unknown>(); let units = 0, nodes = 0;
  const add = (size: number) => { units += size; if (units > 8_000_000) throw Error('Rust presentation data budget exceeded'); };
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > 128) throw Error('Rust presentation nesting budget exceeded');
    add(typeof value === 'string' ? value.length + 1 : 1);
    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value !== 'object') throw Error('Executable value in Rust presentation');
    const prior = seen.get(value); if (prior) return prior;
    if (++nodes > 250_000) throw Error('Rust presentation object budget exceeded');
    if (value instanceof Vector2) { const out = value.clone(); seen.set(value, out); return out; }
    if (ArrayBuffer.isView(value)) {
      const arrays = [Float64Array, Float32Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array, Uint8ClampedArray];
      if (!arrays.some(type => Object.getPrototypeOf(value) === type.prototype)) throw Error('Unsupported Rust presentation data view');
      const typed = value as unknown as { length: number; slice(): unknown }; add(typed.length); const out = typed.slice(); seen.set(value, out); return out;
    }
    if (value instanceof Map) { const out = new Map(); seen.set(value, out); for (const [key, child] of value) out.set(visit(key, depth + 1), visit(child, depth + 1)); return out; }
    if (value instanceof Set) { const out = new Set(); seen.set(value, out); for (const child of value) out.add(visit(child, depth + 1)); return out; }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw Error('Simulation/unknown prototype in Rust presentation: ' + prototype?.constructor?.name);
    const out = Array.isArray(value) ? [] : {};
    seen.set(value, out);
    for (const key of Object.keys(value)) {
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if (!descriptor || !descriptor.enumerable) continue;
      if (!('value' in descriptor) || key === '__proto__' || key === 'constructor' || key === 'prototype') throw Error('Invalid Rust presentation field');
      add(key.length); (out as Record<string, unknown>)[key] = visit(descriptor.value, depth + 1);
    }
    return out;
  };
  return visit(value, 0) as T;
}
export class RustPresentationReader {
  private offset = 0;
  constructor(readonly values: Float64Array) {}
  n(): number { if (this.offset === this.values.length) throw Error('Truncated Rust presentation record'); return this.values[this.offset++]; }
  flag(): boolean { const n = this.n(); if (n !== 0 && n !== 1) throw Error('Invalid Rust presentation flag'); return n === 1; }
  point(): Vector2 { return new Vector2(this.n(), this.n()); }
  count(): number { const n = this.n(); if (!Number.isSafeInteger(n) || n < 0 || n > this.values.length - this.offset) throw Error('Invalid Rust presentation count'); return n; }
  string(): string { const count = this.count(); let result = ''; for (let i = 0; i < count; i++) { const code = this.n(); if (!Number.isInteger(code) || code < 0 || code > 65535) throw Error('Invalid Rust presentation string'); result += String.fromCharCode(code); } return result; }
  skip(count: number): void { for (let i = 0; i < count; i++) this.n(); }
  finish(): void { if (this.offset !== this.values.length) throw Error('Trailing Rust presentation record'); }
}
export const rustHandleKey = (handle: { readonly slot: number; readonly generation: number }): string => handle.slot + ':' + handle.generation;
