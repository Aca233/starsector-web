import { contentRegistry } from '../../content/ContentRegistry';
import { arkChargeLevel, arkImpactPhase, arkWeaponFxProfile, ARK_WEAPON_FX_ROOT, sampleArkWeaponFx, type ArkWeaponFxClip } from '../../visual/ArkWeaponFX';
import { renderWeaponAngle } from '../ShipRenderQueries';
import type { ShipRenderState, RenderWeapon } from '../ShipRenderState';
import type { Projectile } from '../../simulation/Weapon';
import type { WebGLPassContext } from './WebGLPassContext';
type Point = { readonly x: number; readonly y: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function draw(ctx: WebGLPassContext, clip: ArkWeaponFxClip, phase: number, p: Point, angle: number,
  size: readonly [number, number], alpha: number, loop = false): void {
  if (alpha <= 0 || size[0] <= 0 || size[1] <= 0) return;
  ctx.batcher.setBlendMode('ADDITIVE');
  for (const { frame, weight } of sampleArkWeaponFx(clip, phase, loop)) {
    const info = ctx.textures.getTextureInfo(ARK_WEAPON_FX_ROOT + frame.file);
    if (!info.texture || info.width <= 0 || info.height <= 0) throw new Error('Ark weapon FX was not preloaded: ' + frame.file);
    ctx.batcher.drawSprite(info.texture, p.x, p.y, size[0], size[1], angle + Math.PI / 2,
      frame.pivotX - .5, frame.pivotY - .5, 1, 1, 1, clamp(alpha) * weight);
  }
  ctx.batcher.setBlendMode('NORMAL');
}
export function arkAperturePosition(p: Point, angle: number, offset: Point): Point {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: p.x + offset.x * c - offset.y * s, y: p.y + offset.x * s + offset.y * c };
}
/** Read the actual installed content's calibrated ports, not sprite-box centers.
 * No effect on hulks, ghosts, disabled mounts, venting or overload. */
export function renderArkWeaponCharge(ctx: WebGLPassContext, mount: RenderWeapon, pos: Point, angle: number,
  inhibited: boolean, opacity: number): void {
  const profile = arkWeaponFxProfile(mount.spec.id), q = arkChargeLevel(mount, inhibited);
  if (!profile || q <= 0 || profile.charge[0] <= 0) return;
  const spec = contentRegistry.getWeapon(mount.spec.id);
  const offsets = mount.mountType === 'HARDPOINT' ? spec?.hardpointOffsets ?? spec?.turretOffsets : spec?.turretOffsets ?? spec?.hardpointOffsets;
  if (!offsets) return;
  for (let i = 0; i + 1 < offsets.length; i += 2) {
    const p = arkAperturePosition(pos, angle, { x: offsets[i], y: offsets[i + 1] });
    draw(ctx, 'charge', q, p, angle, profile.charge, q * q * opacity * .88);
  }
}
/** Flight packet uses the same authority interpolation/fade as its collider. */
export function renderArkWeaponPacket(ctx: WebGLPassContext, p: Projectile, pos: Point, angle: number): boolean {
  const profile = arkWeaponFxProfile(p.specId); if (!profile) return false;
  const fade = (p.prevFadeProgress ?? p.fadeProgress ?? 0) * (1 - ctx.alpha) + (p.fadeProgress ?? 0) * ctx.alpha;
  draw(ctx, 'packet', (p.elapsedTime ?? 0) * 7, pos, angle, profile.packet, 1 - clamp(fade), true);
  return true;
}
/** The real projectile identifies the firing barrel and its shot age. The muzzle
 * remains on the live ship/rotating turret, never at the stale spawnLocation.
 * A lost source, consumed shot or replay without that event cannot invent fire. */
export function renderArkShotMuzzle(ctx: WebGLPassContext, p: Projectile, ships: readonly ShipRenderState[]): void {
  const profile = arkWeaponFxProfile(p.specId), age = p.elapsedTime;
  if (!profile || age === undefined || age < 0 || age >= profile.muzzleLife || !p.barrelOffset) return;
  const ship = ships.find(s => s.id === p.sourceShipId);
  if (!ship || ship.isDead || ship.hullHp <= 0 || ship.isDocked || ship.isRetreated) return;
  const mount = ship.weapons.find(w => w.slotId === p.slotId && w.spec.id === p.specId);
  if (!mount || mount.isDisabled) return;
  const facing = ship.interpolatedFacing(ctx.alpha);
  const angle = mount.mountType === 'HARDPOINT' ? facing + mount.baseAngleDeg * Math.PI / 180 : renderWeaponAngle(mount, facing) ?? mount.currentAngleRad;
  const mountPos = arkAperturePosition(ship.interpolatedPos(ctx.alpha), facing, mount.relativePos);
  const aperture = arkAperturePosition(mountPos, angle, p.barrelOffset);
  const phase = age / profile.muzzleLife;
  draw(ctx, 'muzzle', phase, aperture, angle, profile.muzzle, ship.phaseVisualAlpha * (1 - Math.pow(phase, 3)));
}
export function renderArkWeaponImpact(ctx: WebGLPassContext, pos: Point, diameter: number, age: number, duration: number, peak: number): void {
  if (duration <= 0 || age < 0 || age >= duration) return;
  const q = age / duration;
  draw(ctx, 'impact', arkImpactPhase(age, duration), pos, -Math.PI / 2,
    [diameter, diameter], peak * (q < .55 ? 1 : (1 - q) / .45));
}
