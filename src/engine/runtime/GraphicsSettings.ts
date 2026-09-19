/** Local presentation preferences. Never use these values in simulation or network state. */
export interface GraphicsSettings {
  renderScale: 0.5 | 0.75 | 1;
  maxFrameRate: 0 | 30 | 60 | 120;
  detailedParticles: boolean;
  background: boolean;
  screenShake: number;
}
export const GRAPHICS_SETTINGS_KEY = 'starsector-web:graphics-settings';
export const DEFAULT_GRAPHICS_SETTINGS: Readonly<GraphicsSettings> = Object.freeze({
  renderScale: 1, maxFrameRate: 0, detailedParticles: true, background: true, screenShake: 1,
});
export const GRAPHICS_PRESETS: Readonly<Record<'quality' | 'balanced' | 'performance', Readonly<GraphicsSettings>>> = Object.freeze({
  quality: DEFAULT_GRAPHICS_SETTINGS,
  balanced: Object.freeze({ renderScale: .75, maxFrameRate: 60, detailedParticles: true, background: true, screenShake: .5 }),
  performance: Object.freeze({ renderScale: .5, maxFrameRate: 30, detailedParticles: false, background: false, screenShake: 0 }),
});
export function normalizeGraphicsSettings(value: unknown): Readonly<GraphicsSettings> {
  const raw = value && typeof value === 'object' ? value as Partial<GraphicsSettings> : {};
  return Object.freeze({
    renderScale: [.5, .75, 1].includes(raw.renderScale) ? raw.renderScale! : 1,
    maxFrameRate: [0, 30, 60, 120].includes(raw.maxFrameRate) ? raw.maxFrameRate! : 0,
    detailedParticles: typeof raw.detailedParticles === 'boolean' ? raw.detailedParticles : true,
    background: typeof raw.background === 'boolean' ? raw.background : true,
    screenShake: typeof raw.screenShake === 'number' && Number.isFinite(raw.screenShake) ? Math.max(0, Math.min(1, raw.screenShake)) : 1,
  });
}
function readSettings(): Readonly<GraphicsSettings> {
  try { return normalizeGraphicsSettings(JSON.parse(localStorage.getItem(GRAPHICS_SETTINGS_KEY) ?? 'null')); }
  catch { return DEFAULT_GRAPHICS_SETTINGS; }
}
let settings = readSettings();
const listeners = new Set<() => void>();
export const getGraphicsSettings = (): Readonly<GraphicsSettings> => settings;
export function subscribeGraphicsSettings(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
function publish(next: Readonly<GraphicsSettings>) {
  if (Object.keys(DEFAULT_GRAPHICS_SETTINGS).every(key => settings[key] === next[key])) return;
  settings = next; listeners.forEach(listener => listener());
}
export function updateGraphicsSettings(patch: Partial<GraphicsSettings>): void {
  publish(normalizeGraphicsSettings({ ...settings, ...patch }));
  try { localStorage.setItem(GRAPHICS_SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* Keep session controls available with blocked/full storage. */ }
}
export function resetGraphicsSettings(): void { updateGraphicsSettings(DEFAULT_GRAPHICS_SETTINGS); }
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === GRAPHICS_SETTINGS_KEY || event.key === null) publish(readSettings());
});

/** Gate drawing only, never fixed updates, input processing or network playback. */
export class RenderFrameLimiter {
  private nextAt = 0;
  private previousLimit = -1;
  reset(): void { this.nextAt = 0; this.previousLimit = -1; }
  shouldRender(nowMs: number, limit: number): boolean {
    if (limit !== this.previousLimit) { this.nextAt = nowMs; this.previousLimit = limit; }
    if (limit === 0) return true;
    if (nowMs + .5 < this.nextAt) return false;
    const interval = 1000 / limit;
    this.nextAt = nowMs + interval - (Math.max(0, nowMs - this.nextAt) % interval);
    return true;
  }
}
