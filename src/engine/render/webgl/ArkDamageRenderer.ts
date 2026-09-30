import { arkOwner } from '../../content/AdunArkIds';
import { arkArt, arkFrame, type ArkDraw } from '../../visual/AdunArkArt';
import { renderArkDamageOverlayCanvas } from '../ArkDamageOverlay';
import { createRenderCanvas, type RenderCanvas } from '../RenderSurface';
import { getDamageGlowRevision, hasHotDamageGlow, type DamageDecalLayer } from '../ShipDamageVisuals';
import type { ShipRenderState } from '../ShipRenderState';
import { hullOverlayInViewport } from './HullOverlayVisibility';
import type { WebGLPassContext } from './WebGLPassContext';

type LayerCache = { canvas: RenderCanvas; revision: string; serial: number };
const layers: readonly DamageDecalLayer[] = ['base', 'glow'];
const textureId = (ship: ShipRenderState, index: number, layer: DamageDecalLayer) =>
  `ark-damage:${ship.id}:${index}:${layer}`;

/** Bounded per-owner/depth-slot caches, NOT one GPU canvas for every animation frame. */
export class ArkDamageRenderer {
  private states = new WeakMap<ShipRenderState, Map<string, LayerCache>>();
  private serial = 0;
  private maskCanvas?: RenderCanvas;

  reset(): void { this.states = new WeakMap(); this.maskCanvas = undefined; }

  retainTextures(ships: readonly ShipRenderState[], time: number, active: Set<string>): void {
    const frame = arkFrame(time);
    for (const ship of ships) {
      const owner = arkOwner(ship.spec.sourceHullId ?? ship.spec.id);
      if (!owner || ship.isDead || ship.hullHp <= 0 || ship.isRetreated || ship.isDocked || !ship.scorchMarks.length) continue;
      const hot = hasHotDamageGlow(ship);
      frame.forEach((draw, index) => {
        if (draw.owner !== owner) return;
        active.add(textureId(ship, index, 'base'));
        if (hot) active.add(textureId(ship, index, 'glow'));
      });
    }
  }

  renderLayer(ctx: WebGLPassContext, ship: ShipRenderState, draw: ArkDraw, index: number,
    pos: { x: number; y: number }, facing: number, alpha: number): void {
    if (!ship.scorchMarks.length) return;
    const shipPos = ship.interpolatedPos(ctx.alpha);
    if (import.meta.env.VITE_CULL_DAMAGE_OVERLAYS !== 'false'
      && !hullOverlayInViewport(shipPos.x, shipPos.y, facing, ship.spec, ctx.viewport, ctx.zoom)) return;
    let cache = this.states.get(ship);
    if (!cache) { cache = new Map(); this.states.set(ship, cache); }
    const anchor = arkArt.parts.CORE.anchor, [width, height] = draw.size;
    const hot = hasHotDamageGlow(ship);
    for (const layer of layers) {
      if (layer === 'glow' && !hot) continue;
      const key = `${index}:${layer}`;
      let state = cache.get(key);
      if (!state) {
        state = { canvas: createRenderCanvas(), revision: '', serial: 0 };
        cache.set(key, state);
      }
      const revision = `${draw.file}:${draw.box.join(',')}:${draw.size.join(',')}:${
        layer === 'base' ? ship.scorchMarkVersion : getDamageGlowRevision(ship)}`;
      if (state.revision !== revision) {
        // Do not show a previous pose's damage if its new mask is not decoded yet.
        if (!renderArkDamageOverlayCanvas(state.canvas, ship, draw, layer, this.maskCanvas ??= createRenderCanvas())) continue;
        state.revision = revision;
        state.serial = ++this.serial;
      }
      const texture = ctx.textures.getCanvasTexture(textureId(ship, index, layer), state.canvas, state.serial);
      ctx.batcher.setBlendMode(layer === 'glow' ? 'ADDITIVE' : 'NORMAL');
      ctx.batcher.drawSprite(texture, pos.x, pos.y, width * arkArt.scale, height * arkArt.scale,
        facing + Math.PI / 2, (anchor[0] - draw.box[0]) / width - .5,
        (anchor[1] - draw.box[1]) / height - .5, 1, 1, 1, alpha);
    }
    ctx.batcher.setBlendMode('NORMAL');
  }
}
