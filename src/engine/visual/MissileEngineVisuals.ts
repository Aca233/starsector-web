import type { Projectile } from '../simulation/Weapon';

/** Standard powered-missile branch of combat/entities/G.java (no ship boost/spread).
 * The current missile simulation always commands acceleration while powered.
 * This is the steady engine appearance, not a port of engine spool/flameout state. */
export function missileEngineVisual(p: Projectile) {
  if (p.isMine || (p.isFlare && !p.flareBehavior) || !(p.isRocket || p.spawnType === 'MISSILE')) return null;
  if ((p.hitpoints !== undefined && p.hitpoints <= 0) || (p.flightTimeRemaining !== undefined && p.flightTimeRemaining <= 0)) return null;
  const source = p.missileEngineVisualSpec;
  const flareGlowDuration = p.flareBehavior ? p.flareBehavior.flameoutTime - p.flareBehavior.noEngineGlowTime : 0;
  const flameout = p.flareFizzling ? Math.max(0, 1 + (p.flareLife ?? 0) / Math.max(.001, flareGlowDuration)) : 1;
  if (flameout <= 0) return null;
  // Explicit legacy fallback for custom content without engine geometry; never a fixed 36px halo.
  const width = source?.width ?? (p.projWidth ?? 14) * 0.75;
  const length = source?.length ?? (p.projLength ?? 32);
  if (width <= 0 || length <= 0) return null;
  const color = source?.color ?? [...(p.engineFlameColor ?? [255, 140, 40]), 255] as [number, number, number, number];
  const glowColor = source?.glowAlternateColor ?? color;
  const glowAlpha = 0.6 * 0.75 * flameout;
  // G.java doubles the standard engine glow radius for missiles, then contracts at alpha < .5.
  const glowRadius = width * 2 * 2 * (0.15 + 0.85 * glowAlpha / 0.5);
  const glowSizeMult = Math.max(0, source?.glowSizeMult ?? 1);
  return {
    width, length, throat: Math.min(width / 2, length / 4),
    nozzleOffset: source?.nozzleOffset ?? -(p.projLength ?? 32) / 2,
    color, glowColor,
    throatAlpha: Math.floor(100 * color[3] / 255) / 255 * flameout,
    outlineAlpha: Math.floor(50 * color[3] / 255) / 255 * flameout,
    glowAlpha: glowAlpha * glowColor[3] / 255,
    coreAlpha: glowAlpha,
    glowDiameter: glowRadius * 2 * glowSizeMult,
    coreDiameter: glowRadius * 0.75 * glowSizeMult,
  };
}
