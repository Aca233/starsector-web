type Ship = { readonly systems: readonly unknown[] };
export interface SystemBindings { slots: (string | null)[]; wheelSelect: boolean; selectedKey: string | null }
const storageKey = 'starsector-web:system-bindings:v1';
export const defaultSystemBindings = (): SystemBindings => ({ slots: ['KeyF', 'KeyG', 'KeyH'], wheelSelect: false, selectedKey: 'KeyJ' });
// Cockpit controls and browser shortcuts are not available for reassignment here.
const reserved = new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyX','KeyV','KeyR','KeyZ','KeyU','KeyM']);
/** DOM button 3/4 are the back/forward side buttons (not left/right/middle). */
export function mouseBindingCode(button: number): string | undefined { return button === 3 || button === 4 ? `Mouse${button}` : undefined; }
export function bindingKeyLabel(code: string | null | undefined): string {
  if (code === 'Mouse3') return '侧键 1';
  if (code === 'Mouse4') return '侧键 2';
  return code ? code.replace(/^Key/, '').replace(/^Numpad/, '小键盘 ') : '未绑定';
}
export function bindingError(bindings: SystemBindings): string | undefined {
  if (!bindings || !Array.isArray(bindings.slots) || bindings.slots.length > 64 || typeof bindings.wheelSelect !== 'boolean') return '快捷键配置无效';
  const keys = [...bindings.slots, ...(bindings.wheelSelect ? [bindings.selectedKey] : [])].filter((key): key is string => key !== null);
  if (keys.some(key => typeof key !== 'string' || !/^(?:Key[A-Z]|Mouse[34])$/.test(key) || reserved.has(key))) return '请使用未占用的字母键或鼠标侧键；移动、防御、数字武器组及浏览器快捷键不可覆盖';
  if (new Set(keys).size !== keys.length) return '快捷键冲突：同一个键不能绑定多个技能槽或轮选释放';
  if (bindings.wheelSelect && !bindings.selectedKey) return '请为轮选模式指定释放键';
  return undefined;
}
let cached: SystemBindings | undefined;
export function readSystemBindings(): SystemBindings {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) { const value = JSON.parse(raw) as SystemBindings; if (!bindingError(value)) return cached = value; }
  } catch { /* Node checks / unavailable storage use safe defaults. */ }
  return cached = defaultSystemBindings();
}
export function saveSystemBindings(value: SystemBindings): void {
  const error = bindingError(value); if (error) throw new Error(error);
  cached = { ...value, slots: [...value.slots] };
  try { window.localStorage.setItem(storageKey, JSON.stringify(cached)); } catch { /* Session preference remains active. */ }
}
const selected = new WeakMap<Ship, number>();
export function selectedSystemSlot(ship: Ship): number { return Math.min(selected.get(ship) ?? 0, Math.max(0, ship.systems.length - 1)); }
export function selectNextSystem(ship: Ship, delta: number): void {
  if (!ship.systems.length || !Number.isFinite(delta) || delta === 0) return;
  selected.set(ship, (selectedSystemSlot(ship) + (delta > 0 ? 1 : -1) + ship.systems.length) % ship.systems.length);
}
export function systemBindingLabel(slot: number): string { return bindingKeyLabel(readSystemBindings().slots[slot]); }
