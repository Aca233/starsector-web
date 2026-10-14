/** Immutable source FX certificates; no running Ship survives compilation. */
import type { Ship } from '../../simulation/Ship';
import type { WeaponSpec } from '../../simulation/Weapon';
import { weaponSizeBaseline } from '../../content/WeaponSizes';
import { installedHullMods } from '../../extensions/HullMods';
import { ENGINE_VISUAL_PROFILES } from '../../visual/VisualProfiles';
import { i18n } from '../../i18n/LocalizationManager';
import type { RustCompiledContent } from './RustContentCompiler';
import { RUST_COMMAND_WIDTH, type RustBodyHandle } from './RustCoreProtocol';
export interface RustVisualStatic {
  readonly overloadText: string; readonly malfunctionText: string; readonly fighter: boolean; readonly surface: boolean;
  readonly engines: readonly { readonly color: readonly number[]; readonly width: number }[];
  readonly mounts: readonly { readonly component: number; readonly slot: string; readonly size: string; readonly name: string;
    readonly below: boolean; readonly beam: boolean; readonly sound?: string; readonly intro?: string; readonly loop?: string;
    readonly muzzleSize: number; readonly muzzleColor?: readonly number[]; readonly flash?: WeaponSpec['muzzleFlashSpec'];
    readonly smoke?: WeaponSpec['launcherSmokeSpec']; readonly projectileLength?: number; readonly engine?: WeaponSpec['missileEngineVisualSpec'];
    readonly trail?: WeaponSpec['missileTrailSpec']; readonly splitSound?: string; readonly splitSmoke?: WeaponSpec['launcherSmokeSpec'] }[];
}
export function compileRustVisualStatic(ship: Ship): RustVisualStatic {
  return { overloadText: i18n.t('combat.overloaded'), malfunctionText: i18n.t('combat.shield_malfunction'),
    fighter: ship.spec.hullSize === 'FIGHTER', surface: installedHullMods(ship.spec).some(m => !!m.surfaceFeedback),
    engines: ship.spec.engineSlots.map(s => ({ width: s.width, color: (ENGINE_VISUAL_PROFILES[s.style] ?? ENGINE_VISUAL_PROFILES.LOW_TECH).flameColor.map(v => v * 255) })),
    mounts: ship.weapons.map((m, i) => ({ component: i + 1, slot: m.slotId, size: weaponSizeBaseline(m.spec.mountSize).toLowerCase(),
      name: i18n.t(m.spec.nameKey).split(' ')[0] || m.slotId,
      below: ship.spec.weaponSlots.find(s => s.slotId === m.slotId)?.renderLayer === 'BELOW_HULL', beam: !!m.spec.isBeam,
      sound: m.spec.soundKey, intro: m.spec.soundIntroKey, loop: m.spec.soundLoopKey,
      muzzleSize: m.spec.muzzleFlashSize || 25, muzzleColor: m.spec.muzzleFlashColor, flash: m.spec.muzzleFlashSpec, smoke: m.spec.launcherSmokeSpec,
      projectileLength: m.spec.projLength, engine: m.spec.missileEngineVisualSpec, trail: m.spec.missileTrailSpec,
      splitSound: m.spec.mirv?.splitSound, splitSmoke: m.spec.mirv?.smokeSpec })) };
}
export function encodeRustVisualAdmission(content: RustCompiledContent, id: number, handle: RustBodyHandle): number[][] {
  const value = { version: 1, ships: content.pending.visual };
  const raw = JSON.stringify(value); if (!raw.length || raw.length > 16_000_000) throw Error('Rust visual admission exceeds bound');
  const row = (tag: number, data: readonly number[]) => { const a = Array<number>(RUST_COMMAND_WIDTH).fill(0); a.splice(0, 4, tag, id, handle.slot, handle.generation); a.splice(4, data.length, ...data); return a; };
  const out = [row(183, [1, raw.length, value.ships.length])];
  for (let at = 0; at < raw.length; at += 20) { const count = Math.min(20, raw.length - at); out.push(row(184, [at, count, ...Array.from({ length: count }, (_, i) => raw.charCodeAt(at + i))])); }
  out.push(row(185, [])); return out;
}
