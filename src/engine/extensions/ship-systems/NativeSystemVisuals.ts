import data from './native-system-visuals.json';
import type { ShipSystemDefinition, SystemVisuals } from './Types';

// Extracted from data/shipsystems/*.system. Script-only entries cite their Java
// class in docs/multi-ship-systems-2026-09-19.md; no hull-ID presentation branches.
const profiles = data as unknown as Record<string, SystemVisuals>;
export function withNativeSystemVisuals(definition: ShipSystemDefinition): ShipSystemDefinition {
  const profile = definition.sourceIds.map(id => profiles[id]).find(Boolean);
  return profile ? { ...definition, visuals: { ...profile, ...definition.visuals } } : definition;
}

export function validateSystemVisuals(visuals?: SystemVisuals): void {
  if (!visuals) return;
  if (visuals.recipient !== undefined && visuals.recipient !== 'WINGS') throw new Error('Invalid system visual recipient');
  const color = (value: readonly number[]) => {
    if (!Array.isArray(value) || value.length !== 4 || value.some(v => !Number.isFinite(v) || v < 0 || v > 255)) throw new Error('Invalid system visual color');
  };
  const nonnegative = (values: number[]) => {
    if (values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Invalid system visual dimensions');
  };
  for (const flag of [visuals.engineBoost, visuals.fortressShield, visuals.teleportCopy]) if (flag !== undefined && typeof flag !== 'boolean') throw new Error('Invalid system visual flag');
  for (const jitter of [visuals.jitter, visuals.jitterUnder]) if (jitter) {
    color(jitter.color); nonnegative([jitter.range, jitter.minRange, jitter.radiusFraction]);
    if (!Number.isInteger(jitter.copies) || jitter.copies < 1 || jitter.copies > 64) throw new Error('Invalid system jitter copies');
  }
  if (visuals.weaponGlow) {
    color(visuals.weaponGlow.color);
    if (!Array.isArray(visuals.weaponGlow.types) || visuals.weaponGlow.types.some(t => !['BALLISTIC', 'ENERGY', 'MISSILE'].includes(t))) throw new Error('Invalid system glow weapon types');
  }
  if (visuals.engine) {
    if (visuals.engine.color) color(visuals.engine.color);
    nonnegative([visuals.engine.length, visuals.engine.width, visuals.engine.glow]);
  }
}
