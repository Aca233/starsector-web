import type { Ship } from '../../simulation/Ship';
import type { Vector2 } from '../../math/Vector2';
import type { WebGLPassContext } from './WebGLPassContext';
import { ENGINE_VISUAL_PROFILES } from '../../visual/VisualProfiles';
import { visualObjectRandom } from '../RenderDeterminism';

/** Standard (non-Omega) engine geometry and modulation from combat/entities/G.java. */
export function renderShipEngines(ship: Ship, pos: Vector2, facing: number, ctx: WebGLPassContext, time: number): void {
  const { batcher, ribbonBatcher: ribbon, textures, hitGlowTex, alpha } = ctx;
  const phaseLevel = ship.shield.type === 'PHASE' ? ship.shield.phaseEffectLevel : 0;
  const opacity = (1 - phaseLevel) * ship.phaseVisualAlpha;
  if (opacity <= 0) return;
  const boost = ship.prevEngineBoostLevel + (ship.engineBoostLevel - ship.prevEngineBoostLevel) * alpha;
  const burn = ship.system.engineVisualLevel;
  const lengthExtension = 1.5 * burn - phaseLevel;
  const widthExtension = 2 * burn - phaseLevel;
  const glowExtension = burn - phaseLevel;
  const fighter = ship.flux.hullSize === 'FIGHTER';
  const copies = fighter ? 3 : 6;
  const accelerating = ship.engineController.flameAccelerating;
  const texture = textures.getTexture('/game-assets/graphics/fx/engineglow32.png', true);
  const outline = textures.getTexture('/game-assets/graphics/fx/engineflame32.png');

  for (let i = 0; i < ship.spec.engineSlots.length; i++) {
    const slot = ship.spec.engineSlots[i];
    const status = ship.engineStatuses[i];
    if (!status) continue;
    let level = Math.max(0, Math.min(1, status.prevThrust + (status.currentThrust - status.prevThrust) * alpha));
    // G scales system-only engines by the regular system's flame-length shift.
    // Burn Drive is the current Web system supplying that shift (not phase cloak).
    if (slot.systemActivated) level *= Math.max(0, Math.min(1, burn));
    const shapeLevel = slot.systemActivated ? Math.max(0, (level - .25) / .75) : level;
    if (level <= 0) continue;
    const spread = status.prevSpread + (status.spread - status.prevSpread) * alpha;
    const brightness = Math.min(1, level / 0.4) * opacity;
    const widthFactor = accelerating ? Math.max(0.45, Math.pow(Math.min(shapeLevel, 0.8) / 0.8, 2)) : Math.max(0.09, shapeLevel - 0.8) / 0.2;
    const power = Math.max(0, shapeLevel - 0.8) / 0.2;
    const lengthFactor = 0.2 + 0.8 * (accelerating ? power * power : power);
    const fullLength = slot.length * (1 + 0.25 * boost + lengthExtension);
    const length = fullLength * lengthFactor;
    const unextendedWidth = slot.width * (0.1 + widthFactor * (1 + spread / 90) * 0.9);
    const width = unextendedWidth * (1 + widthExtension);
    if (length <= 0 || width <= 0) continue;
    const throat = Math.min(unextendedWidth / 2, length / 4);
    const angle = facing + slot.angleDeg * Math.PI / 180;
    const x = pos.x + slot.x * Math.cos(facing) - slot.y * Math.sin(facing);
    const y = pos.y + slot.x * Math.sin(facing) + slot.y * Math.cos(facing);
    const color = (ENGINE_VISUAL_PROFILES[slot.style] ?? ENGINE_VISUAL_PROFILES.LOW_TECH).flameColor;
    const bend = -ship.angularVelRad * 0.15;
    const fan = (1 - lengthFactor) * spread * Math.PI / 180;
    const phase = visualObjectRandom(`engine:${ship.id}:${i}`) - time;

    batcher.flush();
    ribbon.begin(batcher.currentViewProj);
    for (let layer = 0; layer < copies; layer++) {
      const turn = (copies - layer - 1) / copies * bend
        + (fighter ? 0 : (copies / 2 - (layer + 1) / 2 - 1) / (copies / 2) * (layer % 2 ? 1 : -1) * 2 * fan);
      const a = angle + turn;
      const shift = (copies - layer - 1) * throat / (copies * 2);
      const sx = 0.5 + 0.5 * (layer + 1) / copies;
      const sy = (copies - layer) / copies;
      ribbon.drawEnginePlume(texture, x + Math.cos(a) * shift, y + Math.sin(a) * shift,
        a, length * sx, width * sy, throat * sx, phase + layer / copies, level,
        color, layer * 5 / 255 * brightness, (fighter ? 1 : 100 / 255) * brightness);
    }
    ribbon.end();
    batcher.resumeProgram();
    batcher.setBlendMode('ADDITIVE');
    if (!fighter) {
      batcher.drawSprite(outline, x, y, length * 0.9, width, angle + Math.sin(time * 4) * Math.PI / 360,
        -0.5, 0, ...color, level * 50 / 255 * brightness, 0.01, 0.01, 0.99, 0.99);
    }
    let glowSize = width * (2 + boost);
    if (burn > 0 || phaseLevel > 0) {
      const base = (width - unextendedWidth * widthExtension) * 2;
      glowSize = base * (1 + 0.5 * boost + glowExtension);
    }
    const glowAlpha = Math.min(brightness, Math.max(0.6, boost * 0.25, spread / 180) * 0.75 * opacity);
    if (fighter) glowSize *= 0.66;
    if (glowAlpha < 0.5) glowSize *= 0.15 + 0.85 * glowAlpha / 0.5;
    const diameter = glowSize * 2 + Math.min(glowSize, 15) * boost;
    batcher.drawSprite(hitGlowTex, x, y, diameter, diameter, 0, 0, 0, ...color, glowAlpha);
    batcher.drawSprite(hitGlowTex, x, y, glowSize * 0.75, glowSize * 0.75, 0, 0, 0, 1, 1, 1, glowAlpha);
  }
}
