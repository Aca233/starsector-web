import { ARK_AIR_PLASMA_ID, ARK_AIR_BEAM_ID, ARK_AIR_PLASMA_TEXTURE, aircraftPlasmaRays } from '../../visual/ArkAircraftFX';
import { visualObjectRandom } from '../RenderDeterminism';
import { Vector2 } from '../../math/Vector2';
import type { Beam, Projectile } from '../../simulation/Weapon';
import type { RenderWeapon, ShipRenderState } from '../ShipRenderState';
import type { WebGLPassContext } from './WebGLPassContext';
type Point = { x: number; y: number };
const clamp = (n: number) => Math.min(1, Math.max(0, n));
function plasma(ctx: WebGLPassContext, key: string, pos: Point, time: number, size: number,
  alpha: number, core: readonly number[], fringe: readonly number[]) {
  if (alpha <= 0 || size <= 0) return;
  const { batcher, ribbonBatcher: ribbon, textures } = ctx;
  const texture = textures.getTexture(ARK_AIR_PLASMA_TEXTURE);
  batcher.flush(); ribbon.begin(batcher.currentViewProj);
  for (const ray of aircraftPlasmaRays(time, size * Math.min(alpha * 5, 1), i => visualObjectRandom(`${key}:${i}`))) {
    ribbon.drawPlasmaRay(texture, pos.x, pos.y, ray.angle, ray.size, core, fringe, alpha);
  }
  ribbon.end(); batcher.resumeProgram(); batcher.setBlendMode('NORMAL');
}
export function renderArkAircraftPlasma(ctx: WebGLPassContext, p: Projectile, pos: Point): boolean {
  if (p.specId !== ARK_AIR_PLASMA_ID) return false;
  const fade = (p.prevFadeProgress ?? p.fadeProgress ?? 0) * (1 - ctx.alpha) + (p.fadeProgress ?? 0) * ctx.alpha;
  plasma(ctx, `plasma:${p.id}`, pos, p.elapsedTime ?? 0, p.projWidth ?? 28, 1 - clamp(fade),
    p.coreColor ?? [225,250,255,255], p.fringeColor ?? [40,140,255,235]);
  return true;
}
/** Hull-painted fixed mouths share the exact [0,0] firing offset with simulation.
 * No separate launch flash: the charged packet becomes the emitted projectile. */
export function renderArkAircraftCharge(ctx: WebGLPassContext, mount: RenderWeapon, pos: Point,
  inhibited: boolean, opacity: number, simulationTime: number) {
  if (mount.spec.id !== ARK_AIR_PLASMA_ID || inhibited || mount.isDisabled) return;
  const q = clamp(mount.glowAlpha);
  // Recoil represents the actual shot; do not leave a second packet on the muzzle.
  if (q <= 0 || mount.recoil > .01) return;
  plasma(ctx, `charge:${mount.slotId}`, pos, simulationTime, 4 + 24 * q, q * opacity,
    [225,250,255,255], [40,140,255,235]);
}
/** Only the visual start follows the interpolated hull; actual hit endpoint,
 * damage and authoritative beam geometry are never modified. */
export function arkAircraftBeamPose(beam: Beam, ships: readonly ShipRenderState[], alpha: number): Beam {
  if (beam.specId !== ARK_AIR_BEAM_ID) return beam;
  const ship = ships.find(s => s.id === beam.sourceShipId);
  const mount = ship?.weapons.find(w => w.slotId === beam.slotId);
  if (!ship || !mount) return beam;
  const facing = ship.interpolatedFacing(alpha), center = ship.interpolatedPos(alpha);
  const offset = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(facing);
  const barrel = new Vector2(beam.barrelOffset?.x ?? 0, beam.barrelOffset?.y ?? 0).rotate(mount.currentAngleRad);
  return { ...beam, startPos: new Vector2(center.x + offset.x + barrel.x, center.y + offset.y + barrel.y) };
}
