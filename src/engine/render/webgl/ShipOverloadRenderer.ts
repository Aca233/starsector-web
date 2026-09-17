import type { Ship } from '../../simulation/Ship';
import type { VisualRandom } from '../../runtime/VisualRandom';
import { OverloadFlicker, overloadFade, overloadTiles } from '../../visual/OverloadVisuals';
import { textureCache } from '../TextureCache';
import type { WebGLPassContext } from './WebGLPassContext';
import type { Vector2 } from '../../math/Vector2';

/** Native I.java EMP decal: source texture, hull-alpha mask, additive tint, below weapons.
 * Rebuild/upload only when the random tile orientation changes, never per animation frame.
 */
export class ShipOverloadRenderer {
  private flicker = new OverloadFlicker();
  private canvas: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private drawnCycle = -1;
  private static serial = 0;
  private readonly instanceId = ++ShipOverloadRenderer.serial;
  public readonly textureId: string;

  constructor(ship: Ship) { this.textureId = 'ship-overload:' + ship.id; }

  public update(dt: number, ship: Ship, random: VisualRandom): void {
    this.flicker.update(dt, random, ship.id + ':overload');
  }

  private prepare(ship: Ship): boolean {
    if (this.drawnCycle === this.flicker.cycle && this.canvas) return true;
    const hull = textureCache.getImage(ship.spec.spriteUrl);
    const arcs = textureCache.getImage('/game-assets/graphics/fx/emp_arcs.png');
    if (!hull.complete || !hull.naturalWidth || !arcs.complete || !arcs.naturalWidth) return false;
    const { spriteWidth: width, spriteHeight: height } = ship.spec;
    if (!this.mask) {
      this.mask = document.createElement('canvas');
      this.mask.width = width; this.mask.height = height;
      const maskContext = this.mask.getContext('2d');
      if (!maskContext) { this.mask = null; return false; }
      maskContext.drawImage(hull, 0, 0, width, height);
      // Native stencil uses alpha != 0, not the collision polygon (which can omit fins).
      const pixels = maskContext.getImageData(0, 0, width, height);
      for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i] ? 255 : 0;
      maskContext.putImageData(pixels, 0, 0);
    }
    this.canvas ??= document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return false;
    ctx.globalCompositeOperation = 'lighter';
    for (const tile of overloadTiles(width, height)) {
      ctx.save();
      // Source sprite coordinates are Y-up; canvas is Y-down.
      ctx.translate(width / 2 + tile.x, height / 2 - tile.y);
      ctx.rotate(-this.flicker.angle - tile.angle);
      ctx.drawImage(arcs, -tile.size / 2, -tile.size / 2, tile.size, tile.size);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.mask, 0, 0);
    this.drawnCycle = this.flicker.cycle;
    return true;
  }

  public render(ship: Ship, pos: Vector2, facing: number, ctx: WebGLPassContext): void {
    if (!ship.flux.isOverloaded || ship.flux.isVenting || !this.prepare(ship) || !this.canvas) return;
    const color = ship.spec.overloadColor ?? [150, 150, 255];
    const alpha = ship.phaseVisualAlpha * overloadFade(ship.flux.overloadTimer) * this.flicker.alpha;
    if (alpha <= 0) return;
    const texture = ctx.textures.getCanvasTexture(this.textureId, this.canvas, this.instanceId + ':' + this.drawnCycle);
    ctx.batcher.setBlendMode('ADDITIVE');
    ctx.batcher.drawSprite(texture, pos.x, pos.y, ship.spec.spriteWidth, ship.spec.spriteHeight,
      facing + Math.PI / 2, ship.spec.pivotX / ship.spec.spriteWidth - .5, ship.spec.pivotY / ship.spec.spriteHeight - .5,
      color[0] / 255, color[1] / 255, color[2] / 255, alpha);
  }
}
