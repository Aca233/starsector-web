import { effectState } from '../../../extensions/EffectState';
import type { Beam, WeaponMount } from '../../Weapon';
import type { Ship } from '../../Ship';
import { isWithinEmpShieldArc } from './TachyonLanceEffect';

/** GravitonBeamEffect.GravitonBeamDamageTakenMod: weapon identity, not ray,
 * slot id or firing cycle. TimeoutTracker.add(w, 1, 1) refreshes to one second. */
export class GravitonBeamDamageTakenMod {
  private readonly recentHits = new Map<WeaponMount, number>();

  public get size(): number { return this.recentHits.size; }

  public notifyHit(weapon: WeaponMount): void {
    this.recentHits.set(weapon, 1);
  }

  /** Called by the target's ship listener phase, before this frame's damage. */
  public advance(ship: Ship, amount: number): boolean {
    for (const [weapon, remaining] of this.recentHits) {
      const time = remaining - amount;
      if (time <= 0) this.recentHits.delete(weapon);
      else this.recentHits.set(weapon, time);
    }
    const count = this.recentHits.size;
    if (count) ship.shield.damageTakenModifiers.set('graviton', count >= 3 ? 1.10 : count === 2 ? 1.08 : 1.05);
    else ship.shield.damageTakenModifiers.delete('graviton');
    return count > 0;
  }
}

/** Only a full-brightness DPS pulse on the CURRENT endpoint's shield arc
 * refreshes the listener. A partial beam/lost target pauses wasZero too. */
export function advanceGravitonBeam(beam: Beam, target: Ship | undefined, weapon: WeaponMount | undefined): void {
  const state = effectState(beam, 'graviton', () => ({ wasZero: true }));
  if (!target || !weapon || (beam.brightness ?? 1) < 1 || beam.damageActive === false) return;
  const duration = beam.dpsDuration ?? 0;
  const amount = state.wasZero ? duration : 0;
  state.wasZero = duration <= 0;
  if (amount <= 0 || !isWithinEmpShieldArc(target, beam.endPos)) return;
  let listener = target.statusEffects.get('graviton') as GravitonBeamDamageTakenMod | undefined;
  if (!listener) { listener = new GravitonBeamDamageTakenMod(); target.statusEffects.set('graviton', listener); }
  listener.notifyHit(weapon);
}
