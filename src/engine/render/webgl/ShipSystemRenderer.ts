import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { SystemVisuals, SystemVisualColor, SystemWeaponType } from '../../extensions/ship-systems/Types';
import type { Vector2 } from '../../math/Vector2';
import type { WebGLPassContext } from './WebGLPassContext';
import { visualRandom } from '../RenderDeterminism';

export interface ActiveSystemVisual { system: ShipSystem; profile: SystemVisuals; level: number; }
/** All slots, including RMB. No combat RNG, status changes or persisted visual state. */
export function activeSystemVisuals(ship: Ship): ActiveSystemVisual[] {
  if (ship.isDead || ship.isDocked || ship.isRetreated) return [];
  const carrier = ship.sourceCarrier;
  const systems = [...ship.allSystems.filter(s => s.definition.visuals?.recipient !== 'WINGS'),
    ...(carrier && !carrier.isDead && carrier.hullHp > 0 ? carrier.allSystems.filter(s => s.definition.visuals?.recipient === 'WINGS') : [])];
  return systems.flatMap(system => system.available && !system.disabled && system.isActive && system.effectLevel > 0 && system.definition.visuals
    ? [{ system, profile: system.definition.visuals, level: Math.min(1, system.effectLevel) }] : []);
}

export function systemEngineVisual(ship: Ship): { length: number; width: number; glow: number; level: number; colors: { color: SystemVisualColor; level: number }[] } {
  let length = 1, width = 1, glow = 1, level = 0;
  let lengthSuppression = 1, widthSuppression = 1, glowSuppression = 1;
  const colors: { color: SystemVisualColor; level: number }[] = [];
  for (const active of activeSystemVisuals(ship)) {
    // Preserve extension engineBoost compatibility. Native entries use their own
    // authored multipliers instead of every drive looking like Burn Drive.
    const engine = active.profile.engine ?? (active.profile.engineBoost ? { length: 2.5, width: 3, glow: 2 } : undefined);
    if (!engine) continue;
    length = Math.max(length, 1 + (engine.length - 1) * active.level);
    width = Math.max(width, 1 + (engine.width - 1) * active.level);
    glow = Math.max(glow, 1 + (engine.glow - 1) * active.level);
    lengthSuppression = Math.min(lengthSuppression, 1 + (engine.length - 1) * active.level);
    widthSuppression = Math.min(widthSuppression, 1 + (engine.width - 1) * active.level);
    glowSuppression = Math.min(glowSuppression, 1 + (engine.glow - 1) * active.level);
    level = Math.max(level, active.level);
    if (engine.color) colors.push({ color: engine.color, level: active.level });
  }
  // Strongest boost and strongest suppression coexist, independent of slot order.
  return { length: length * lengthSuppression, width: width * widthSuppression, glow: glow * glowSuppression, level, colors };
}

/** Source copies of the actual hull texture, not a generic circle or particle aura.
 * Alpha is normalized across copies to keep the Web additive pass from washing out
 * hull details. This is a Web rendering adaptation, not native renderer parity. */
export function renderSystemHull(visuals: ActiveSystemVisual[], layer: 'under' | 'over', ship: Ship, pos: Vector2, facing: number, texture: WebGLTexture, opacity: number, ctx: WebGLPassContext): void {
  const { batcher } = ctx;
  const { spriteWidth: w, spriteHeight: h, pivotX, pivotY } = ship.spec;
  batcher.setBlendMode('ADDITIVE');
  for (const { system, profile, level } of visuals) {
    const jitter = layer === 'under' ? profile.jitterUnder : profile.jitter;
    if (jitter) {
      const [r, g, b, a] = jitter.color;
      const range = Math.max(jitter.minRange, (jitter.range + ship.spec.collisionRadius * jitter.radiusFraction) * level);
      const copyAlpha = a / 255 * level * opacity / Math.sqrt(jitter.copies);
      for (let i = 0; i < jitter.copies; i++) {
        const key = `system-jitter:${ship.id}:${system.type}:${layer}:${i}`;
        const angle = visualRandom(key + ':angle') * Math.PI * 2;
        const distance = Math.sqrt(visualRandom(key + ':distance')) * range;
        batcher.drawSprite(texture, pos.x + Math.cos(angle) * distance, pos.y + Math.sin(angle) * distance,
          w, h, facing + Math.PI / 2, pivotX / w - .5, pivotY / h - .5, r / 255, g / 255, b / 255, copyAlpha);
      }
    }

  }
  batcher.setBlendMode('NORMAL');
}

export function weaponSystemGlows(visuals: ActiveSystemVisual[], type?: SystemWeaponType): { color: SystemVisualColor; level: number }[] {
  if (!type) return [];
  return visuals.flatMap(({ profile, level }) => profile.weaponGlow?.types.includes(type) ? [{ color: profile.weaponGlow.color, level }] : []);
}

export interface TeleportCopy { position: Vector2; facing: number; alpha: number; }
/** int.java advanceImpl: IN previews the accepted destination; OUT leaves a copy
 * at the successful departure. Source alpha split is 1 - level/2 vs level/2.
 * A moving ship, a blocked plan or a cancelled IN is not a successful teleport. */
export function systemTeleportCopies(ship: Ship): TeleportCopy[] {
  if (ship.isDead || ship.hullHp <= 0 || ship.isDocked || ship.isRetreated || ship.flux.isOverloaded || ship.flux.isVenting) return [];
  return ship.allSystems.flatMap(system => {
    const plan = system.teleportVisual;
    if (!plan || plan.serial !== system.activationSerial || !system.available || system.disabled
      || !system.isActive || !system.definition.visuals?.teleportCopy || system.effectLevel <= 0) return [];
    const entering = system.state === 'IN';
    const position = entering ? plan.destination : plan.origin;
    const facing = entering ? plan.destinationFacing : plan.originFacing;
    if (!position || facing === undefined) return [];
    return [{ position, facing, alpha: Math.min(1, system.effectLevel) * .5 }];
  });
}

export function systemTeleportBodyAlpha(ship: Ship): number {
  return 1 - Math.max(0, ...systemTeleportCopies(ship).map(copy => copy.alpha));
}
