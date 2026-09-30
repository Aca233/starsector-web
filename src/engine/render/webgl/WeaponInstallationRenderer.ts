import type { WeaponMountSlotConfig } from '../../content/ShipSpec';
import { installationPose } from '../../content/WeaponInstallation';
import type { WebGLPassContext } from './WebGLPassContext';
/** Independent of equipped weapons: an empty bearing is still part of the hull. */
export function renderWeaponInstallations(ctx: WebGLPassContext, slots: readonly WeaponMountSlotConfig[],
  x: number, y: number, facing: number, color: readonly number[], alpha: number, ownedSlots?: readonly string[], layer: 'base' | 'foreground' = 'base', depth: 'ABOVE_HULL' | 'BELOW_HULL' = 'ABOVE_HULL'): void {
  ctx.batcher.setBlendMode('NORMAL');
  for (const slot of slots) {
    if ((slot.renderLayer ?? 'ABOVE_HULL') !== depth) continue;
    if (ownedSlots && !ownedSlots.includes(slot.slotId)) continue;
    const p = installationPose(slot, x, y, facing, layer);
    if (!p) continue;
    const info = ctx.textures.getTextureInfo(p.spriteUrl);
    if (!info.texture || info.width <= 0 || info.height <= 0) throw new Error('Installation art was not preloaded: ' + p.spriteUrl);
    ctx.batcher.drawSprite(info.texture,p.x,p.y,p.width,p.height,p.facing+Math.PI/2,
      p.pivotX-.5,p.pivotY-.5,color[0],color[1],color[2],alpha);
  }
}
