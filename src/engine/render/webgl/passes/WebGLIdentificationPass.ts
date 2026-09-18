import type { CombatEngine } from '../../../simulation/CombatEngine';
import { IDENTIFICATION_ALPHA, missileIdentification, shipIdentification, type IdentificationDiamond } from '../../../visual/IdentificationVisuals';
import type { WebGLPassContext } from '../WebGLPassContext';

/** Native FF_INDICATORS_LAYER. Not debug geometry and not the selected-target bracket. */
export function renderIdentificationIndicators(engine: CombatEngine, ctx: WebGLPassContext, layers: ReadonlySet<string>): void {
  const { batcher, ribbonBatcher, viewport, whiteTex, alpha } = ctx;
  let started = false;
  const draw = (indicator: IdentificationDiamond | null) => {
    if (!indicator || indicator.brightness <= 0) return;
    const { pos, radius, thickness, brightness } = indicator;
    const extent = radius * 1.3;
    if (pos.x + extent < viewport.left || pos.x - extent > viewport.right
      || pos.y + extent < viewport.bottom || pos.y - extent > viewport.top) return;
    if (!started) {
      batcher.flush();
      ribbonBatcher.begin(batcher.currentViewProj);
      started = true;
    }
    // OOoO draws three inset bands with normal alpha blending, not a solid glowing box.
    for (let i = 0; i < 3; i++) {
      ribbonBatcher.drawIdentificationDiamond(whiteTex, pos.x, pos.y,
        (radius - i * 0.25) * brightness, (thickness - i * 0.5) * brightness,
        indicator.color, Math.floor(255 * IDENTIFICATION_ALPHA * brightness * indicator.alpha) / 255);
    }
  };
  if (layers.has('hull')) for (const ship of engine.ships) if (ship !== engine.playerShip && ship.isVisibleTo(engine.playerShip.teamId)) draw(shipIdentification(ship, engine.playerShip.teamId, alpha, engine.combatTime));
  if (layers.has('weapon')) {
    const mineAges = new Map(engine.mines.map(mine => [mine.id, mine.age]));
    for (const projectile of engine.projectiles) draw(missileIdentification(projectile, engine.playerShip.teamId, alpha,
      projectile.isMine ? mineAges.get(projectile.id) ?? projectile.elapsedTime : projectile.elapsedTime));
  }
  if (started) {
    ribbonBatcher.end();
    batcher.resumeProgram();
  }
}
