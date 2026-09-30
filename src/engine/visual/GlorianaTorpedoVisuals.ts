/** Two loaded rounds are part of ammo, never extra ammunition. Visual state only. */
export type LoadedMissileLevels = readonly [number, number];
export const GLORIANA_TORPEDO_ID = 'web_gloriana_torpedo';
export const TORPEDO_RELOAD_WINDOW = 1.2;
export const glorianaTorpedoTextures = ['torpedo-empty', 'torpedo-left', 'torpedo-right']
  .map(name => `/game-assets/graphics/weapons/web_gloriana/${name}.png`);
interface RackState {
  spec: {id: string}; ammo: number; barrelIndex: number; burstRemaining: number;
  cooldownTimer: number; isDisabled: boolean; loadedMissileLevels?: LoadedMissileLevels;
}
function nextRail(mount: RackState): number { return ((mount.barrelIndex % 2) + 2) % 2; }
/** Immutable pairs also remain safe when a presentation snapshot borrows the previous pair. */
function store(mount: RackState, levels: [number, number]): void {
  if (mount.loadedMissileLevels?.[0] !== levels[0] || mount.loadedMissileLevels?.[1] !== levels[1]) mount.loadedMissileLevels = levels;
}
export function validLoadedMissileLevels(value: unknown): value is LoadedMissileLevels {
  return Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1);
}
/** Called on the weapon clock, not render frames. Retain the still-loaded rail if a burst is interrupted. */
export function advanceGlorianaTorpedoLoad(mount: RackState, alive = true): void {
  if (mount.spec.id !== GLORIANA_TORPEDO_ID) return;
  const next = nextRail(mount), other = 1 - next;
  const count = Math.max(0, Math.min(2, Math.floor(mount.ammo)));
  const levels: [number, number] = mount.loadedMissileLevels ? [...mount.loadedMissileLevels] : [0, 0];
  if (!mount.loadedMissileLevels && mount.cooldownTimer <= 0) {
    levels[next] = count >= 1 ? 1 : 0;
    levels[other] = count >= 2 && mount.burstRemaining <= 0 ? 1 : 0;
  }
  if (count < 2) levels[other] = 0;
  if (count < 1) levels[next] = 0;
  if (alive && !mount.isDisabled && mount.burstRemaining <= 0 && mount.cooldownTimer <= TORPEDO_RELOAD_WINDOW) {
    const progress = Math.max(0, Math.min(1, 1 - mount.cooldownTimer / TORPEDO_RELOAD_WINDOW));
    if (count >= 1) levels[next] = Math.max(levels[next], progress);
    if (count >= 2) levels[other] = Math.max(levels[other], progress);
  }
  store(mount, levels);
}
/** Invoke only after all actual-fire checks, on the exact barrel that spawned the projectile. */
export function clearGlorianaTorpedoRail(mount: RackState, barrel: number): void {
  if (mount.spec.id !== GLORIANA_TORPEDO_ID) return;
  const levels: [number, number] = mount.loadedMissileLevels ? [...mount.loadedMissileLevels] : [1, 1];
  levels[barrel % 2] = 0;
  if (mount.ammo < 1) { levels[0] = 0; levels[1] = 0; }
  store(mount, levels);
}
/** Retract through a fixed breech: no alpha fade, stretching or colored covering patch. */
export function torpedoLoadSlice(level: number): { shift: number; height: number } {
  const p = Math.max(0, Math.min(1, level)), smooth = p * p * (3 - 2 * p);
  const shift = 52 * (1 - smooth);
  return { shift, height: 52 - shift };
}
