import {
  ECS_EVT_HERO_SOUND,
  ECS_EVT_HIT_ARMOR,
  ECS_EVT_HIT_SHIELD,
  ECS_EVT_SHIP_DESTROYED,
  ECS_EVT_SHIP_OVERLOADED,
  ECS_FLOATS_PER_EVENT,
} from '../runtime/rust/RustEcsBridge';

/**
 * 3-Tier Combat Audio Staging:
 * - Tier 1 (HERO): Superweapons (Yamato Cannon, Orbital Beam), Capital Ship Explosions, Flux Overloads.
 * - Tier 2 (TACTICAL): Medium cannons, torpedoes, heavy armor breaches.
 * - Tier 3 (AMBIENT_RAPID): Rapid-fire machineguns, PD vulcans, engine hum, minor sparks.
 */
export type CombatAudioTier = 1 | 2 | 3;

export interface AudioBusMixState {
  readonly tier1GainLinear: number;
  readonly tier2GainLinear: number;
  readonly tier3GainLinear: number;
  readonly tier3DuckingDb: number;
  readonly lowPassCutoffHz: number;
  readonly activeHeroEvents: number;
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Cinema-Grade Dynamic Audio Ducker & Spectral Feedback Controller.
 * Prevents the "white-noise machinegun storm" in large fleet battles by applying
 * millisecond-attack sidechain compression to Tier 3 rapid fire whenever Tier 1
 * hero weapons or capital ship explosions occur.
 */
export class DynamicAudioDucker {
  private currentDuckDb = 0; // 0 dB = no ducking, -16 dB = full hero sidechain ducking
  private targetDuckDb = 0;
  private holdTimerSec = 0;
  private lowPassCutoffHz = 20000;
  private activeHeroEvents = 0;

  private readonly maxDuckingDb: number;
  private readonly attackRateDbPerSec: number;
  private readonly releaseRateDbPerSec: number;

  constructor(options?: {
    maxDuckingDb?: number;
    attackTimeMs?: number;
    releaseTimeMs?: number;
  }) {
    this.maxDuckingDb = options?.maxDuckingDb ?? -15.5; // Attenuate Tier 3 by 15.5 dB (within 12-18dB spec)
    const attackSec = Math.max(0.002, (options?.attackTimeMs ?? 8) / 1000);
    const releaseSec = Math.max(0.05, (options?.releaseTimeMs ?? 450) / 1000);
    this.attackRateDbPerSec = Math.abs(this.maxDuckingDb) / attackSec;
    this.releaseRateDbPerSec = Math.abs(this.maxDuckingDb) / releaseSec;
  }

  /**
   * Triggers a sidechain ducking envelope for a Tier 1 Hero sound or heavy armor impact.
   */
  public triggerHeroImpulse(intensity = 1.0, holdDurationSec = 0.28): void {
    const clampedIntensity = Math.max(0.2, Math.min(1.25, intensity));
    const requestedDuck = this.maxDuckingDb * clampedIntensity;
    if (requestedDuck < this.targetDuckDb) {
      this.targetDuckDb = requestedDuck;
    }
    this.holdTimerSec = Math.max(this.holdTimerSec, holdDurationSec);
    this.activeHeroEvents += 1;
  }

  /**
   * Processes the low-frequency Event Outbox from RustEcsBridge (`events`) and
   * automatically triggers sidechain ducking and spectral filtering.
   */
  public ingestEcsEvents(events: Float32Array, eventCount: number): void {
    for (let i = 0; i < eventCount; i++) {
      const base = i * ECS_FLOATS_PER_EVENT;
      const evtType = events[base] | 0;
      const magnitude = events[base + 6];

      if (evtType === ECS_EVT_SHIP_DESTROYED) {
        this.triggerHeroImpulse(1.15, 0.55);
      } else if (evtType === ECS_EVT_HERO_SOUND) {
        this.triggerHeroImpulse(1.0, 0.35);
      } else if (evtType === ECS_EVT_SHIP_OVERLOADED) {
        this.triggerHeroImpulse(0.85, 0.25);
      } else if (evtType === ECS_EVT_HIT_ARMOR && magnitude >= 120) {
        // Heavy armor breach: sub-bass emphasis + partial ducking of chatter
        this.triggerHeroImpulse(0.65, 0.16);
      } else if (evtType === ECS_EVT_HIT_SHIELD && magnitude >= 200) {
        this.triggerHeroImpulse(0.45, 0.1);
      }
    }
  }

  /**
   * Advances the sidechain compressor envelope by `dtSec` and returns bus gains.
   */
  public step(dtSec: number): AudioBusMixState {
    const dt = Math.max(0, Math.min(0.1, dtSec));

    if (this.holdTimerSec > 0) {
      this.holdTimerSec = Math.max(0, this.holdTimerSec - dt);
    } else {
      this.targetDuckDb = 0;
      this.activeHeroEvents = 0;
    }

    if (this.currentDuckDb > this.targetDuckDb) {
      // Fast attack towards negative dB
      this.currentDuckDb = Math.max(
        this.targetDuckDb,
        this.currentDuckDb - this.attackRateDbPerSec * dt
      );
    } else if (this.currentDuckDb < this.targetDuckDb) {
      // Smooth exponential-feeling release back to 0 dB
      this.currentDuckDb = Math.min(
        this.targetDuckDb,
        this.currentDuckDb + this.releaseRateDbPerSec * dt
      );
    }

    // Duck Tier 3 background machineguns by full currentDuckDb (-12 to -18 dB),
    // and Tier 2 medium weapons by 35% of currentDuckDb (-4 to -6 dB).
    const tier3GainLinear = dbToLinear(this.currentDuckDb);
    const tier2GainLinear = dbToLinear(this.currentDuckDb * 0.35);
    const duckRatio = Math.min(1, Math.abs(this.currentDuckDb / this.maxDuckingDb));
    this.lowPassCutoffHz = 20000 - duckRatio * 14500; // Roll off high-frequency PD hiss down to 5.5kHz during hero blasts

    return {
      tier1GainLinear: 1.0,
      tier2GainLinear,
      tier3GainLinear,
      tier3DuckingDb: this.currentDuckDb,
      lowPassCutoffHz: this.lowPassCutoffHz,
      activeHeroEvents: this.activeHeroEvents,
    };
  }
}
