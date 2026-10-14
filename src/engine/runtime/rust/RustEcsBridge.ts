import type { ShipBlueprint } from '../../modding/ShipBlueprint';

export const ECS_FLOATS_PER_SPRITE = 16;
export const ECS_FLOATS_PER_BATCH_SLICE = 4;
export const ECS_FLOATS_PER_RIBBON = 10;
export const ECS_FLOATS_PER_EVENT = 8;
export const ECS_FLOATS_PER_PARTICLE_BURST = 8;
export const ECS_FLOATS_PER_SHIP_HUD = 12;

export const ECS_CMD_APPLY_FORCE = 1;
export const ECS_CMD_SET_TIME_SCALE = 2;
export const ECS_CMD_SET_COLLISION_MASK = 3;
export const ECS_CMD_SPAWN_PROJECTILE = 4;
export const ECS_CMD_RADIAL_FORCE = 5;
export const ECS_CMD_SET_AI_AGGRESSION = 6;

export const ECS_EVT_HIT_SHIELD = 1;
export const ECS_EVT_HIT_ARMOR = 2;
export const ECS_EVT_SHIP_OVERLOADED = 3;
export const ECS_EVT_SHIP_DESTROYED = 4;
export const ECS_EVT_HERO_SOUND = 5;

export interface RustEcsWasmExports extends WebAssembly.Exports {
  readonly memory: WebAssembly.Memory;
  readonly ecs_abi_version: () => number;
  readonly ecs_create: () => number;
  readonly ecs_destroy: (worldId: number) => number;
  readonly ecs_step: (worldId: number, dt: number) => number;
  readonly ecs_spawn_ship: (
    worldId: number,
    id: number,
    team: number,
    x: number,
    y: number,
    rot: number,
    radius: number,
    mass: number,
    spriteW: number,
    spriteH: number,
    maxSpeed: number,
    accel: number,
    turnRate: number,
    hp: number,
    baseArmor: number,
    maxFlux: number,
    fluxDissipation: number,
    shieldArcDeg: number,
    shieldRadius: number,
    shieldEfficiency: number,
    weaponDamage: number,
    projSpeed: number,
    texSlot: number
  ) => number;
  readonly ecs_spawn_projectile: (
    worldId: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    damage: number,
    ttl: number,
    team: number,
    ownerId: number,
    r: number,
    g: number,
    b: number,
    texSlot: number
  ) => number;
  readonly ecs_spawn_fighter: (
    worldId: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    team: number,
    role: number
  ) => number;
  readonly ecs_push_command: (
    worldId: number,
    opcode: number,
    targetId: number,
    a: number,
    b: number,
    c: number
  ) => number;
  readonly ecs_render_buffer_ptr: (worldId: number) => number;
  readonly ecs_render_sprite_count: (worldId: number) => number;
  readonly ecs_batch_slices_ptr: (worldId: number) => number;
  readonly ecs_batch_slice_count: (worldId: number) => number;
  readonly ecs_ribbon_buffer_ptr: (worldId: number) => number;
  readonly ecs_ribbon_count: (worldId: number) => number;
  readonly ecs_events_ptr: (worldId: number) => number;
  readonly ecs_event_count: (worldId: number) => number;
  readonly ecs_particle_bursts_ptr: (worldId: number) => number;
  readonly ecs_particle_burst_count: (worldId: number) => number;
  readonly ecs_hud_ptr: (worldId: number) => number;
  readonly ecs_hud_ship_count: (worldId: number) => number;
  readonly ecs_active_projectile_count: (worldId: number) => number;
}

export interface ZeroCopyFrameViews {
  readonly spriteInstances: Float32Array;
  readonly spriteCount: number;
  readonly batchSlices: Float32Array;
  readonly batchSliceCount: number;
  readonly ribbons: Float32Array;
  readonly ribbonCount: number;
  readonly events: Float32Array;
  readonly eventCount: number;
  readonly particleBursts: Float32Array;
  readonly particleBurstCount: number;
  readonly hudTelemetry: Float32Array;
  readonly hudShipCount: number;
}

/**
 * Zero-Object Direct Bridge to the Rust ECS Combat Core.
 * Exposes flat Float32Array views directly over Wasm linear memory without
 * allocating intermediate JS entity snapshots or triggering V8 GC pauses.
 */
export class RustEcsBridge {
  private readonly exports: RustEcsWasmExports;
  public readonly worldId: number;

  constructor(exports: RustEcsWasmExports) {
    const abi = exports.ecs_abi_version?.() ?? 0;
    if (abi !== 200) {
      throw new Error(`Unsupported Rust ECS ABI version: ${abi} (expected 200).`);
    }
    this.exports = exports;
    this.worldId = exports.ecs_create();
    if (!this.worldId) {
      throw new Error('Failed to create Rust ECS world instance.');
    }
  }

  public destroy(): void {
    this.exports.ecs_destroy(this.worldId);
  }

  public step(dtSeconds: number): number {
    return this.exports.ecs_step(this.worldId, dtSeconds);
  }

  public spawnShipFromBlueprint(
    blueprint: ShipBlueprint,
    numericId: number,
    team: number,
    x: number,
    y: number,
    rotRad: number,
    weaponDamage = 45,
    projSpeed = 720,
    texSlot = 0
  ): number {
    const k = blueprint.kinematics;
    const d = blueprint.defense;
    const f = blueprint.flux;
    const v = blueprint.visual;
    return this.exports.ecs_spawn_ship(
      this.worldId,
      numericId >>> 0,
      team >>> 0,
      x,
      y,
      rotRad,
      k.collisionRadius,
      k.mass,
      v.spriteWidth,
      v.spriteHeight,
      k.maxSpeed,
      k.acceleration,
      (k.maxTurnRateDeg * Math.PI) / 180,
      d.hitpoints,
      d.armorRating,
      f.maxFlux,
      f.fluxDissipation,
      d.shieldType === 'NONE' || d.shieldType === 'PHASE' ? 0 : d.shieldArcDeg,
      d.shieldRadius,
      d.shieldEfficiency,
      weaponDamage,
      projSpeed,
      texSlot
    );
  }

  public spawnProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    damage: number,
    ttl: number,
    team: number,
    ownerId = 0,
    r = 1.0,
    g = 0.85,
    b = 0.4,
    texSlot = 1
  ): number {
    return this.exports.ecs_spawn_projectile(
      this.worldId,
      x,
      y,
      vx,
      vy,
      radius,
      damage,
      ttl,
      team >>> 0,
      ownerId >>> 0,
      r,
      g,
      b,
      texSlot
    );
  }

  public spawnFighter(
    x: number,
    y: number,
    vx: number,
    vy: number,
    team: number,
    role: 'INTERCEPTOR' | 'BOMBER'
  ): number {
    return this.exports.ecs_spawn_fighter(
      this.worldId,
      x,
      y,
      vx,
      vy,
      team >>> 0,
      role === 'BOMBER' ? 1 : 0
    );
  }

  public applyForce(shipIndex: number, fx: number, fy: number, angularImpulse = 0): boolean {
    return (
      this.exports.ecs_push_command(
        this.worldId,
        ECS_CMD_APPLY_FORCE,
        shipIndex >>> 0,
        fx,
        fy,
        angularImpulse
      ) === 1
    );
  }

  public setTimeScale(shipIndex: number, scale: number): boolean {
    return (
      this.exports.ecs_push_command(
        this.worldId,
        ECS_CMD_SET_TIME_SCALE,
        shipIndex >>> 0,
        scale,
        0,
        0
      ) === 1
    );
  }

  public setCollisionMask(shipIndex: number, mask: number): boolean {
    return (
      this.exports.ecs_push_command(
        this.worldId,
        ECS_CMD_SET_COLLISION_MASK,
        shipIndex >>> 0,
        mask,
        0,
        0
      ) === 1
    );
  }

  public emitRadialForce(centerX: number, centerY: number, impulse: number): boolean {
    return (
      this.exports.ecs_push_command(
        this.worldId,
        ECS_CMD_RADIAL_FORCE,
        0,
        centerX,
        centerY,
        impulse
      ) === 1
    );
  }

  public getActiveProjectileCount(): number {
    return this.exports.ecs_active_projectile_count(this.worldId);
  }

  /**
   * Returns zero-copy Float32Array views directly into Wasm linear memory.
   * Zero JS object deserialization, zero heap clone.
   */
  public getZeroCopyFrameViews(): ZeroCopyFrameViews {
    const buf = this.exports.memory.buffer;

    const spriteCount = this.exports.ecs_render_sprite_count(this.worldId);
    const spritePtr = this.exports.ecs_render_buffer_ptr(this.worldId);
    const spriteInstances =
      spriteCount > 0 && spritePtr > 0
        ? new Float32Array(buf, spritePtr, spriteCount * ECS_FLOATS_PER_SPRITE)
        : new Float32Array(0);

    const batchSliceCount = this.exports.ecs_batch_slice_count(this.worldId);
    const slicePtr = this.exports.ecs_batch_slices_ptr(this.worldId);
    const batchSlices =
      batchSliceCount > 0 && slicePtr > 0
        ? new Float32Array(buf, slicePtr, batchSliceCount * ECS_FLOATS_PER_BATCH_SLICE)
        : new Float32Array(0);

    const ribbonCount = this.exports.ecs_ribbon_count(this.worldId);
    const ribbonPtr = this.exports.ecs_ribbon_buffer_ptr(this.worldId);
    const ribbons =
      ribbonCount > 0 && ribbonPtr > 0
        ? new Float32Array(buf, ribbonPtr, ribbonCount * ECS_FLOATS_PER_RIBBON)
        : new Float32Array(0);

    const eventCount = this.exports.ecs_event_count(this.worldId);
    const eventPtr = this.exports.ecs_events_ptr(this.worldId);
    const events =
      eventCount > 0 && eventPtr > 0
        ? new Float32Array(buf, eventPtr, eventCount * ECS_FLOATS_PER_EVENT)
        : new Float32Array(0);

    const particleBurstCount = this.exports.ecs_particle_burst_count(this.worldId);
    const burstPtr = this.exports.ecs_particle_bursts_ptr(this.worldId);
    const particleBursts =
      particleBurstCount > 0 && burstPtr > 0
        ? new Float32Array(buf, burstPtr, particleBurstCount * ECS_FLOATS_PER_PARTICLE_BURST)
        : new Float32Array(0);

    const hudShipCount = this.exports.ecs_hud_ship_count(this.worldId);
    const hudPtr = this.exports.ecs_hud_ptr(this.worldId);
    const hudTelemetry =
      hudShipCount > 0 && hudPtr > 0
        ? new Float32Array(buf, hudPtr, hudShipCount * ECS_FLOATS_PER_SHIP_HUD)
        : new Float32Array(0);

    return {
      spriteInstances,
      spriteCount,
      batchSlices,
      batchSliceCount,
      ribbons,
      ribbonCount,
      events,
      eventCount,
      particleBursts,
      particleBurstCount,
      hudTelemetry,
      hudShipCount,
    };
  }
}
