import { Vector2 } from '../engine/math/Vector2';

type Wire = any;
type ValuePlan = { kind: 0; value: any } | { kind: 1; x: number; y: number }
  | { kind: 2; children: ValuePlan[] } | { kind: 3; keys: string[]; children: ValuePlan[] };

/** Compile the immutable FIXED wire subtree, not a prior viewer value. Every
 * application still overwrites all fields in their original order and retains
 * viewer-owned containers/vectors. Unknown/malformed tags use the old decoder.
 * Native-network caller only: frame/target are non-Proxy data and native objects. */
export function compileProjectileFixed(value: Wire, layouts: string[][], denied: ReadonlySet<string>, depth = 2, budget = { remaining: 8192 }): ValuePlan | null {
  if (--budget.remaining < 0 || depth > 64) return null;
  if (value === null || typeof value !== 'object') return { kind: 0, value };
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return null;
  if (Object.hasOwn(value, '$record')) {
    const keys = Number.isInteger(value.$record) && value.$record >= 0 ? layouts[value.$record] : undefined;
    if (!keys || !Array.isArray(value.values) || keys.length !== value.values.length) return null;
    const children: ValuePlan[] = [];
    for (let i = 0; i < value.values.length; i++) { const child = compileProjectileFixed(value.values[i], layouts, denied, depth + 1, budget); if (!child) return null; children.push(child); }
    return { kind: 3, keys, children };
  }
  if (value.$undefined) return { kind: 0, value: undefined };
  // Reference lookup/typed collections and recipes keep their original logic.
  if (value.$ship) return null;
  if (value.$vector) {
    const v = value.$vector;
    return Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? { kind: 1, x: v[0], y: v[1] } : null;
  }
  if (value.$number) return { kind: 0, value: value.$number === 'Infinity' ? Infinity : value.$number === '-Infinity' ? -Infinity : NaN };
  if (value.$typed || value.$map || value.$set || Object.hasOwn(value, '$records')
    || Object.hasOwn(value, '$explosionPuffs') || Object.hasOwn(value, '$dynamicParticles')) return null;
  if (Array.isArray(value)) {
    if (value.length && depth >= 64) return null;
    const children: ValuePlan[] = [];
    for (let i = 0; i < value.length; i++) { const child = compileProjectileFixed(value[i], layouts, denied, depth + 1, budget); if (!child) return null; children.push(child); }
    return { kind: 2, children };
  }
  const keys = Object.keys(value).filter(k => !denied.has(k));
  if (keys.length && depth >= 64) return null;
  const children: ValuePlan[] = [];
  for (const key of keys) { const child = compileProjectileFixed(value[key], layouts, denied, depth + 1, budget); if (!child) return null; children.push(child); }
  return { kind: 3, keys, children };
}
export function restoreProjectileFixed(plan: ValuePlan, target: any): any {
  switch (plan.kind) {
    case 0: return plan.value;
    case 1: return target instanceof Vector2 ? target.set(plan.x, plan.y) : new Vector2(plan.x, plan.y);
    case 2: {
      const out = Array.isArray(target) ? target : [];
      for (let i = 0; i < plan.children.length; i++) { const child = plan.children[i]; out[i] = child.kind === 0 ? child.value : restoreProjectileFixed(child, out[i]); }
      out.length = plan.children.length; return out;
    }
    case 3: {
      const out = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
      for (let i = 0; i < plan.keys.length; i++) { const key = plan.keys[i], child = plan.children[i]; out[key] = child.kind === 0 ? child.value : restoreProjectileFixed(child, out[key]); }
      return out;
    }
  }
}
