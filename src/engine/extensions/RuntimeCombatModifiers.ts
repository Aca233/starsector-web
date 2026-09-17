import type { SystemModifiers } from './ship-systems/Types';
import { combineSystemModifiers } from './ship-systems/Modifiers';
/** Per-instance, source-keyed temporary effects. Removal cannot erase another effect or compound a saved spec. */
export class RuntimeCombatModifiers {
  private readonly sources = new Map<string, SystemModifiers>();
  private cached: SystemModifiers = {};
  private dirty = false;
  public set(id: string, modifiers: SystemModifiers): void { this.sources.set(id,modifiers); this.dirty = true; }
  public delete(id: string): void { if (this.sources.delete(id)) this.dirty = true; }
  public clear(): void { this.sources.clear(); this.cached = {}; this.dirty = false; }
  public get empty(): boolean { return this.sources.size === 0; }
  public get value(): SystemModifiers {
    if (this.dirty) { this.cached = {}; for (const value of this.sources.values()) this.cached = combineSystemModifiers(this.cached,value); this.dirty = false; }
    return this.cached;
  }
}
