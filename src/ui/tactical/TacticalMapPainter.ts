import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import type { Ship } from '../../engine/simulation/Ship';
import { tacticalContactVisible, tacticalObservers, TACTICAL_SIGHT_RADIUS } from './TacticalVisibility';
import { Vector2 } from '../../engine/math/Vector2';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { NEBULA_SPRITE_SIZE } from '../../engine/simulation/systems/NebulaSystem';

export interface MapView { center: Vector2; span: number }
export interface MapCamera { pos: Vector2; width: number; height: number; zoom: number }
const MIN_SPAN = 2400;
const MAX_SPAN = 64000;
export function fitTacticalView(engine: CombatEngine): MapView {
  const observers = tacticalObservers(engine);
  const ships = engine.capitalShips.filter(s => tacticalContactVisible(s, observers));
  if (!ships.length) return { center: engine.playerShip.pos.clone(), span: 20000 };
  const xs = ships.map(s => s.pos.x), ys = ships.map(s => s.pos.y);
  return { center: new Vector2((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2),
    span: Math.max(20000, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.5) };
}
/** Match combat and radar axes: +X right, +Y down. Allies deploy below enemies.
 * Drawing, picking, navigation and the viewport footprint share this transform. */
export function mapPoint(pos: { x: number; y: number }, view: MapView, size: number, height = size): Vector2 {
  return new Vector2(size / 2 + (pos.x - view.center.x) * size / view.span,
    height / 2 + (pos.y - view.center.y) * size / view.span);
}
export function mapWorld(point: { x: number; y: number }, view: MapView, size: number, height = size): Vector2 {
  return new Vector2(view.center.x + (point.x - size / 2) * view.span / size,
    view.center.y + (point.y - height / 2) * view.span / size);
}
export function zoomTacticalView(view: MapView, point: Vector2, size: number, factor: number, height = size): void {
  const anchor = mapWorld(point, view, size, height);
  view.span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, view.span * factor));
  view.center.add(anchor.sub(mapWorld(point, view, size, height)));
}
export function mapShipRadius(ship: Ship, view: MapView, size: number): number {
  return Math.max(8, Math.min(48, Math.max(ship.spec.spriteWidth, ship.spec.spriteHeight) * size / view.span / 2)) + 4;
}
export function pickMapShip(engine: CombatEngine, point: Vector2, view: MapView, size: number, height = size): Ship | undefined {
  const observers = tacticalObservers(engine);
  return engine.capitalShips.filter(s => tacticalContactVisible(s, observers))
    .map(ship => ({ ship, distance: mapPoint(ship.pos, view, size, height).distanceTo(point) }))
    .filter(hit => hit.distance <= mapShipRadius(hit.ship, view, size) + 4)
    .sort((a, b) => a.distance - b.distance)[0]?.ship;
}

/** Canvas is only an instrument surface; the combat scene remains WebGL2.
 * Every contact/terrain mark comes from the live engine. Chart sight uses the shared native-base visibility policy; no decorative RNG. */
export class TacticalMapPainter {
  private fog = document.createElement("canvas");
  private images = new Map<string, HTMLImageElement>();
  private image(path: string): HTMLImageElement | undefined {
    let image = this.images.get(path);
    if (!image) { image = new Image(); image.src = runtimeAssetUrl(path); this.images.set(path, image); }
    return image.complete && image.naturalWidth ? image : undefined;
  }
  draw(ctx: CanvasRenderingContext2D, size: number, view: MapView, engine: CombatEngine,
    camera: MapCamera, hoveredId: string | null, height = size, inspectedId: string | null = null): void {
    const observers = tacticalObservers(engine);
    const scale = size / view.span;
    ctx.clearRect(0, 0, size, height);
    ctx.fillStyle = 'rgba(0, 3, 6, .86)'; ctx.fillRect(0, 0, size, height);
    const bg = engine.environment.backgroundUrl && this.image(engine.environment.backgroundUrl);
    if (bg) { ctx.globalAlpha = .15; ctx.drawImage(bg, 0, 0, size, height); ctx.globalAlpha = 1; }
    // Real nebula tiles, using the same 4x4 atlas as combat.
    for (const cloud of engine.nebulae) {
      const p = mapPoint(cloud.pos, view, size, height), width = NEBULA_SPRITE_SIZE * scale;
      if (p.x < -width || p.y < -width || p.x > size + width || p.y > height + width) continue;
      const image = this.image(cloud.spriteUrl);
      if (!image) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, cloud.thickness)) * .28;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.drawImage(image, cloud.atlasColumn * image.naturalWidth / 4, cloud.atlasRow * image.naturalHeight / 4,
        image.naturalWidth / 4, image.naturalHeight / 4, -width / 2, -width / 2, width, width); ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#a19489';
    for (const asteroid of engine.asteroids) {
      const p = mapPoint(asteroid.pos, view, size, height), radius = Math.max(1, asteroid.radius * scale * .45);
      ctx.globalAlpha = .7; ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
    }
    ctx.globalAlpha = 1;
    if (this.fog.width !== Math.round(size) || this.fog.height !== Math.round(height)) { this.fog.width = Math.round(size); this.fog.height = Math.round(height); }
    const fog = this.fog.getContext('2d');
    if (fog) {
      fog.clearRect(0, 0, size, height); fog.globalCompositeOperation = 'source-over';
      fog.fillStyle = 'rgba(70, 92, 114, .39)'; fog.fillRect(0, 0, size, height);
      fog.globalCompositeOperation = 'destination-out';
      const mask = this.image('graphics/fx/fog_circle2.png');
      for (const observer of observers) {
        const p = mapPoint(observer.pos, view, size, height), radius = (TACTICAL_SIGHT_RADIUS + 250) * 1.05 * scale;
        if (mask) fog.drawImage(mask, p.x - radius, p.y - radius, radius * 2, radius * 2);
        else { const gradient = fog.createRadialGradient(p.x, p.y, radius * .87, p.x, p.y, radius); gradient.addColorStop(0, '#000'); gradient.addColorStop(1, 'transparent'); fog.fillStyle = gradient; fog.beginPath(); fog.arc(p.x, p.y, radius, 0, Math.PI * 2); fog.fill(); }
      }
      fog.globalCompositeOperation = 'source-over'; ctx.drawImage(this.fog, 0, 0, size, height);
    }
    // World-anchored grid. Major lines every four cells, like the original chart.
    const ideal = view.span / 20, step = 250 * Math.pow(2, Math.round(Math.log2(ideal / 250)));
    const visibleHeight = height / scale;
    const left = view.center.x - view.span / 2, top = view.center.y - visibleHeight / 2;
    ctx.lineWidth = 1;
    for (let i = Math.ceil(left / step); i * step < left + view.span; i++) {
      const x = Math.round((i * step - left) * scale) + .5;
      ctx.strokeStyle = i % 4 === 0 ? '#396076' : 'rgba(62, 99, 118, .4)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let i = Math.ceil(top / step); i * step < top + visibleHeight; i++) {
      const y = Math.round((i * step - top) * scale) + .5;
      ctx.strokeStyle = i % 4 === 0 ? '#396076' : 'rgba(62, 99, 118, .4)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    const living = engine.capitalShips.filter(s => tacticalContactVisible(s, observers));
    // Real viewport footprint, not a made-up sensor/reveal radius.
    const cam = mapPoint(camera.pos, view, size, height);
    const cw = camera.width / camera.zoom * scale, ch = camera.height / camera.zoom * scale;
    this.brackets(ctx, cam, cw / 2, ch / 2, '#90dcff', 8);
    for (const ship of living) {
      const order = engine.orders.get(ship.id) ?? (ship.isPlayer ? engine.orders.get('fleet') : undefined);
      const target = order && ['ENGAGE', 'ESCORT', 'AVOID'].includes(order.type) ? engine.ships.find(s => s.id === order.targetShipId && tacticalContactVisible(s, observers))?.pos
        : order?.type === 'WAYPOINT' || order?.type === 'DEFEND' ? order.targetPos : undefined;
      if (!target) continue;
      const a = mapPoint(ship.pos, view, size, height), b = mapPoint(target, view, size, height);
      ctx.strokeStyle = order?.type === 'ENGAGE' || order?.type === 'AVOID' ? 'rgba(255, 135, 58, .7)' : 'rgba(135, 220, 110, .75)';
      ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      if (order?.type === 'WAYPOINT' || order?.type === 'DEFEND') {
        const icon = this.image(order.type === 'DEFEND' ? 'graphics/warroom/taskicons/icon_defend.png' : 'graphics/warroom/icon_waypoint.png');
        if (icon) ctx.drawImage(icon, b.x - 10, b.y - 10, 20, 20);
        else { ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.stroke(); }
      } else { ctx.beginPath(); ctx.arc(b.x, b.y, 14, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const fragment of engine.hulkFragments) {
      const p = mapPoint(fragment.pos, view, size, height); ctx.fillStyle = 'rgba(141, 135, 124, .5)';
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    for (const fighter of [...engine.fighters, ...engine.bombers]) {
      if (!tacticalContactVisible(fighter, observers)) continue;
      const p = mapPoint(fighter.pos, view, size, height);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(fighter.facingRad);
      ctx.fillStyle = fighter.isPlayer ? '#63bc45' : '#e94128';
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -2.5); ctx.lineTo(-2, 0); ctx.lineTo(-3, 2.5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (const ship of living) {
      const p = mapPoint(ship.pos, view, size, height), r = mapShipRadius(ship, view, size);
      if (p.x < -r || p.y < -r || p.x > size + r || p.y > height + r) continue;
      const selected = engine.selectedUnitId === ship.id || (engine.selectedUnitId === 'fleet' && ship.isPlayer);
      const color = ship.isPlayer ? '#98bc51' : '#bc641e';
      const image = this.image(ship.spec.spriteUrl);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ship.facingRad + Math.PI / 2);
      if (image) {
        const hullScale = Math.min(scale, 88 / Math.max(ship.spec.spriteWidth, ship.spec.spriteHeight));
        ctx.drawImage(image, -ship.spec.pivotX * hullScale, -ship.spec.pivotY * hullScale,
          ship.spec.spriteWidth * hullScale, ship.spec.spriteHeight * hullScale);
      } else { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, -r / 2); ctx.lineTo(-r / 3, r / 2); ctx.lineTo(r / 3, r / 2); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = .85;
      if (ship.isPlayer) ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
      else { ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 1.35); ctx.lineTo(p.x + r * 1.35, p.y); ctx.lineTo(p.x, p.y + r * 1.35); ctx.lineTo(p.x - r * 1.35, p.y); ctx.closePath(); ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (selected || hoveredId === ship.id || inspectedId === ship.id) this.brackets(ctx, p, r + 5, r + 5, selected ? '#c5f29a' : '#a1d7e9', 5);
      if (selected) {
        ctx.fillStyle = '#101b14'; ctx.fillRect(p.x - r, p.y - r - 6, r * 2, 2);
        ctx.fillStyle = '#a0d16c'; ctx.fillRect(p.x - r, p.y - r - 6, r * 2 * Math.max(0, ship.hullHp / ship.maxHullHp), 2);
      }
      if (ship === engine.playerShip) {
        ctx.fillStyle = '#62cbff'; ctx.beginPath(); ctx.moveTo(p.x, p.y - r - 15); ctx.lineTo(p.x - 3, p.y - r - 9); ctx.lineTo(p.x + 3, p.y - r - 9); ctx.fill();
      }
    }
  }
  private brackets(ctx: CanvasRenderingContext2D, p: Vector2, rx: number, ry: number, color: string, length: number): void {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      ctx.moveTo(p.x + x * (rx - length), p.y + y * ry); ctx.lineTo(p.x + x * rx, p.y + y * ry); ctx.lineTo(p.x + x * rx, p.y + y * (ry - length));
    }
    ctx.stroke();
  }
}
