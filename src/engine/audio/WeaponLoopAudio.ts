import type { Ship } from '../simulation/Ship';
import type { SoundManager } from './SoundManager';

/** One weapon scan per presentation frame; reuse sets instead of allocating arrays. */
export class WeaponLoopAudio {
  private previous = new Set<string>();
  private current = new Set<string>();

  sync(ships: readonly Ship[], enabled: boolean, audio: Pick<SoundManager, 'startLoop' | 'stopLoop'>): void {
    this.current.clear();
    if (enabled) {
      for (const ship of ships) {
        if (ship.isDead || ship.isPhased || ship.flux.isVenting || ship.flux.isOverloaded) continue;
        for (const mount of ship.weapons) {
          const key = mount.spec.soundLoopKey;
          if (key && !mount.isDisabled && (mount.firingState === 'ACTIVE' || mount.firingState === 'CHARGING')) {
            this.current.add(key);
          }
        }
      }
    }
    for (const key of this.previous) {
      if (!this.current.has(key)) audio.stopLoop(key);
    }
    // Retry active loops each frame: samples may still be decoding, or audio muted.
    for (const key of this.current) audio.startLoop(key, 0.7);
    const reuse = this.previous;
    this.previous = this.current;
    this.current = reuse;
  }
}
