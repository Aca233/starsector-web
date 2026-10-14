/**
 * Staged authority adapter for the Rust ECS combat kernel (`ecs_*`, ABI 200).
 *
 * This is the TypeScript half of the single-player authority migration: it wraps the
 * raw exports with the contracts the Worker host needs, and normalises the two places
 * where Wasm and JavaScript disagree:
 *
 *  - every `u32` export arrives as a *signed* i32, so `u32::MAX` sentinels show up as
 *    `-1`; comparisons go through `asU32`.
 *  - the replay witness and the RNG cursors are f64 while the simulation is f32, so
 *    those buffers are read as `Float64Array` and never rounded through f32.
 *
 * NOT WIRED YET: nothing in `src/network` or `src/engine/runtime/local` imports this
 * class. It is exercised by `scripts/check-ecs-authority-foundation.mjs`. The Worker
 * integration still needs the host protocol envelope and the presentation channel,
 * so wiring it in early would only add a second unfinished authority path.
 *
 * Missing on purpose (tracked in docs/ecs-authority-baseline-2026-10-13.md):
 * control-sample input, content admission, presentation packets, audio/event
 * acknowledgement, reinforcements and beams.
 */

/** ABI this adapter was written against; the kernel is rejected on any other value. */
export const ECS_AUTHORITY_ABI = 200;
export const ECS_WITNESS_WORDS = 22;
export const ECS_SHIP_STATE_STRIDE = 16;
export const ECS_COMMAND_RESULT_STRIDE = 2;
/** Fixed authority step; the kernel rejects anything outside its published dt range. */
export const ECS_FIXED_DT = 1 / 60;

export const ECS_STEP_OK = 1;
export const ECS_STEP_UNKNOWN_WORLD = 0;
export const ECS_STEP_TICK_MISMATCH = 2;
export const ECS_STEP_INVALID_DT = 3;
export const ECS_APPLY_UNKNOWN_WORLD = 0xffffffff;

export const ECS_REASON_OK = 0;
export const ECS_REASON_UNKNOWN_OPCODE = 1;
export const ECS_REASON_UNKNOWN_TARGET = 2;

export const ECS_ROLE = { none: 0, player: 1, enemy: 2 } as const;
export type EcsAuthorityRole = 'none' | 'player' | 'enemy';

export const ECS_COMMAND = {
  applyForce: 1,
  setTimeScale: 2,
  setCollisionMask: 3,
  spawnProjectile: 4,
  radialForce: 5,
  setAiAggression: 6,
} as const;

/** Mirrors `SHIP_ROLE_*` in native/combat-core/src/ecs_core.rs. */
const ROLE_BY_NAME: Readonly<Record<EcsAuthorityRole, number>> = {
  none: ECS_ROLE.none, player: ECS_ROLE.player, enemy: ECS_ROLE.enemy,
};

/** Raw spawn scalars; there is no content admission yet, so callers pass numbers. */
export interface EcsAuthorityShip {
  readonly id: number;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly radius: number;
  readonly mass: number;
  readonly maxSpeed: number;
  readonly accel: number;
  readonly turnRate: number;
  readonly hp: number;
  readonly armor: number;
  readonly maxFlux: number;
  readonly dissipation: number;
  readonly shieldArcDeg: number;
  readonly shieldRadius: number;
  readonly shieldEfficiency: number;
  readonly weaponDamage: number;
  readonly projSpeed: number;
  readonly texSlot: number;
  /** Presentation size; defaults to 120x160 when omitted. */
  readonly spriteW?: number;
  readonly spriteH?: number;
  readonly role?: EcsAuthorityRole;
}

export interface EcsAuthorityConfig {
  readonly seed: number;
  readonly ships: readonly EcsAuthorityShip[];
}

export interface EcsCommandReceipt {
  readonly accepted: boolean;
  readonly reason: number;
}

/**
 * One tick of external control.
 *
 * This is the semantic kernel-level input, not the host's `CombatControlSample`:
 * mapping key names / pointer state onto `aim`/`thrust`/`strafe`/`firing` belongs to
 * the bridge layer that will replace `applyPlayerControls`. Omitted fields are zero,
 * so a pure `{thrust: 1}` means "hold facing, accelerate forward".
 */
export interface EcsControlInput {
  /** World-space point the hull turns toward; `(0, 0)` means hold current facing. */
  readonly aimX?: number;
  readonly aimY?: number;
  /** Forward acceleration in `[-1, 1]` of the hull's own acceleration. */
  readonly thrust?: number;
  /** Lateral acceleration in `[-1, 1]`, scaled by the kernel's strafe factor. */
  readonly strafe?: number;
  readonly firing?: boolean;
}

export interface EcsShipState {
  readonly id: number;
  readonly team: number;
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly rot: number;
  readonly vrot: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly softFlux: number;
  readonly hardFlux: number;
  readonly shieldActive: boolean;
  readonly overloadedTimer: number;
  readonly armorAverage: number;
}

export interface EcsAuthorityRollback {
  readonly tick: number;
  readonly combat: readonly [number, number, number];
  readonly visual: readonly [number, number, number];
}

/** Exact export surface this adapter depends on. */
export interface EcsAuthorityExports extends WebAssembly.Exports {
  readonly memory: WebAssembly.Memory;
  ecs_abi_version(): number;
  ecs_create_seeded(seed: number): number;
  ecs_destroy(worldId: number): number;
  ecs_tick(worldId: number): number;
  ecs_dt_min(): number;
  ecs_dt_max(): number;
  ecs_step_checked(worldId: number, expectedTick: number, dt: number): number;
  ecs_spawn_ship(
    worldId: number, id: number, team: number, x: number, y: number, rot: number,
    radius: number, mass: number, spriteW: number, spriteH: number, maxSpeed: number,
    accel: number, turnRate: number, hp: number, baseArmor: number, maxFlux: number,
    dissipation: number, shieldArcDeg: number, shieldRadius: number, shieldEfficiency: number,
    weaponDamage: number, projSpeed: number, texSlot: number,
  ): number;
  ecs_mark_ship_role(worldId: number, shipIndex: number, role: number): number;
  ecs_push_command(worldId: number, opcode: number, targetId: number, a: number, b: number, c: number): number;
  ecs_set_control(
    worldId: number, shipIndex: number, aimX: number, aimY: number,
    thrust: number, strafe: number, firing: number,
  ): number;
  ecs_apply_commands(worldId: number): number;
  ecs_command_results_ptr(worldId: number): number;
  ecs_command_results_count(worldId: number): number;
  ecs_command_result_stride(): number;
  ecs_witness_ptr(worldId: number): number;
  ecs_witness_words(): number;
  ecs_witness_roles_present(worldId: number): number;
  ecs_ship_state_ptr(worldId: number): number;
  ecs_ship_state_count(worldId: number): number;
  ecs_ship_state_stride(): number;
}

const asU32 = (value: number): number => value >>> 0;
const requireCount = (value: number, limit: number, what: string): number => {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) throw new Error(`Invalid ECS ${what}: ${value}`);
  return value;
};

export class EcsCombatAuthority {
  private disposed = false;
  private readonly f64View: () => Float64Array;
  private readonly f32View: () => Float32Array;

  private constructor(
    private readonly exports: EcsAuthorityExports,
    private readonly worldId: number,
    readonly seed: number,
    readonly wasmSha256: string,
  ) {
    // Memory can grow, which detaches existing views; every read rebuilds them.
    this.f64View = () => new Float64Array(exports.memory.buffer);
    this.f32View = () => new Float32Array(exports.memory.buffer);
  }

  public static async create(options: {
    readonly module: WebAssembly.Module | BufferSource;
    readonly config: EcsAuthorityConfig;
    readonly wasmSha256?: string;
  }): Promise<EcsCombatAuthority> {
    const { config } = options;
    if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff)
      throw new Error('Invalid ECS authority seed');
    const ships = config.ships ?? [];
    if (ships.length > 256) throw new Error('ECS authority roster exceeds the kernel limit');
    // `instantiate(Module)` resolves to an Instance; `instantiate(BufferSource)` resolves
    // to `{module, instance}`. Both paths must be handled explicitly.
    let exports: EcsAuthorityExports;
    if (options.module instanceof WebAssembly.Module) {
      const instance = await WebAssembly.instantiate(options.module, {});
      exports = instance.exports as unknown as EcsAuthorityExports;
    } else {
      const { instance } = await WebAssembly.instantiate(options.module, {});
      exports = instance.exports as unknown as EcsAuthorityExports;
    }
    if (typeof exports.ecs_abi_version !== 'function') throw new Error('ECS kernel exports are missing');
    const abi = exports.ecs_abi_version();
    if (abi !== ECS_AUTHORITY_ABI) throw new Error(`Unsupported ECS ABI ${abi}; expected ${ECS_AUTHORITY_ABI}`);
    if (exports.ecs_witness_words() !== ECS_WITNESS_WORDS) throw new Error('ECS witness word count differs');
    if (exports.ecs_ship_state_stride() !== ECS_SHIP_STATE_STRIDE) throw new Error('ECS ship state stride differs');
    if (exports.ecs_command_result_stride() !== ECS_COMMAND_RESULT_STRIDE) throw new Error('ECS command result stride differs');
    if (!(exports.ecs_dt_min() > 0) || !(exports.ecs_dt_max() > exports.ecs_dt_min())) throw new Error('ECS dt contract is invalid');
    const worldId = asU32(exports.ecs_create_seeded(config.seed));
    if (!worldId) throw new Error('ECS world creation failed');
    const authority = new EcsCombatAuthority(exports, worldId, config.seed, options.wasmSha256 ?? '');
    for (const ship of ships) authority.spawn(ship);
    return authority;
  }

  public get tick(): number { return this.exports.ecs_tick(this.worldId); }

  public get dtRange(): readonly [number, number] { return [this.exports.ecs_dt_min(), this.exports.ecs_dt_max()]; }

  /** Bit 0 = player role present, bit 1 = primary enemy role present. */
  public get rolesPresent(): number { return asU32(this.exports.ecs_witness_roles_present(this.worldId)); }

  public spawn(ship: EcsAuthorityShip): number {
    this.assertLive();
    const index = asU32(this.exports.ecs_spawn_ship(
      this.worldId, ship.id, ship.team, ship.x, ship.y, ship.rot,
      ship.radius, ship.mass, ship.spriteW ?? 120, ship.spriteH ?? 160, ship.maxSpeed,
      ship.accel, ship.turnRate, ship.hp, ship.armor, ship.maxFlux, ship.dissipation,
      ship.shieldArcDeg, ship.shieldRadius, ship.shieldEfficiency,
      ship.weaponDamage, ship.projSpeed, ship.texSlot,
    ));
    if (index === 0xffffffff) throw new Error(`ECS ship spawn failed for id ${ship.id}`);
    const role = ROLE_BY_NAME[ship.role ?? 'none'];
    if (role !== ECS_ROLE.none) {
      if (asU32(this.exports.ecs_mark_ship_role(this.worldId, index, role)) !== 1)
        throw new Error(`ECS role marking failed for id ${ship.id}`);
    }
    return index;
  }

  public pushCommand(opcode: number, targetId = 0, a = 0, b = 0, c = 0): void {
    this.assertLive();
    if (asU32(this.exports.ecs_push_command(this.worldId, opcode, targetId, a, b, c)) !== 1)
      throw new Error('ECS command queue rejected the command');
  }

  /** Drains queued commands without advancing the tick and returns their receipts. */
  public applyCommands(): readonly EcsCommandReceipt[] {
    this.assertLive();
    const applied = asU32(this.exports.ecs_apply_commands(this.worldId));
    if (applied === ECS_APPLY_UNKNOWN_WORLD) throw new Error('ECS world disappeared while applying commands');
    const count = asU32(this.exports.ecs_command_results_count(this.worldId));
    if (count !== applied) throw new Error(`ECS receipt count ${count} differs from applied ${applied}`);
    const ptr = this.exports.ecs_command_results_ptr(this.worldId);
    if (!ptr) throw new Error('ECS command results unavailable');
    const view = this.f32View();
    const base = ptr >>> 2;
    const receipts: EcsCommandReceipt[] = [];
    for (let i = 0; i < count; i++) {
      const at = base + i * ECS_COMMAND_RESULT_STRIDE;
      receipts.push({ accepted: view[at] === 1, reason: view[at + 1] });
    }
    return receipts;
  }

  /** Arms one tick of external control for a ship; the next step consumes it. */
  public setControl(index: number, control: EcsControlInput): void {
    this.assertLive();
    const accepted = asU32(this.exports.ecs_set_control(
      this.worldId, index, control.aimX ?? 0, control.aimY ?? 0,
      control.thrust ?? 0, control.strafe ?? 0, control.firing ? 1 : 0,
    ));
    if (accepted !== 1) throw new Error(`ECS control rejected for ship ${index}`);
  }

  /** Advances exactly one fixed step from the current tick, or throws. */
  public stepScheduled(): void {
    const status = this.stepChecked(this.tick);
    if (status !== ECS_STEP_OK) throw new Error(`ECS step rejected with status ${status}`);
  }

  /** Raw status code: 1 ok, 0 unknown world, 2 tick mismatch, 3 invalid dt. */
  public stepChecked(expectedTick: number, dt = ECS_FIXED_DT): number {
    this.assertLive();
    return asU32(this.exports.ecs_step_checked(this.worldId, expectedTick, dt));
  }

  /** Host replay witness: 22 finite numbers with `[0] === tick`. */
  public replayWitness(): number[] {
    this.assertLive();
    const ptr = this.exports.ecs_witness_ptr(this.worldId);
    if (!ptr) throw new Error('ECS witness unavailable');
    return Array.from(this.f64View().subarray(ptr >>> 3, (ptr >>> 3) + ECS_WITNESS_WORDS));
  }

  /**
   * Stream cursors for a rollback-free resume: re-seeding a fresh authority with the
   * same journal is what the host's replay recovery does, so this is diagnostics only.
   */
  public rngCursors(): EcsAuthorityRollback {
    const witness = this.replayWitness();
    return { tick: witness[0], combat: [witness[1], witness[2], witness[3]], visual: [witness[4], witness[5], witness[6]] };
  }

  public readShips(): readonly EcsShipState[] {
    this.assertLive();
    const count = requireCount(asU32(this.exports.ecs_ship_state_count(this.worldId)), 256, 'ship count');
    const ptr = this.exports.ecs_ship_state_ptr(this.worldId);
    if (count && !ptr) throw new Error('ECS ship state unavailable');
    const view = this.f32View();
    const base = ptr >>> 2;
    const ships: EcsShipState[] = [];
    for (let i = 0; i < count; i++) {
      const at = base + i * ECS_SHIP_STATE_STRIDE;
      ships.push({
        id: view[at], team: view[at + 1], active: view[at + 2] === 1,
        x: view[at + 3], y: view[at + 4], vx: view[at + 5], vy: view[at + 6],
        rot: view[at + 7], vrot: view[at + 8], hp: view[at + 9], maxHp: view[at + 10],
        softFlux: view[at + 11], hardFlux: view[at + 12], shieldActive: view[at + 13] === 1,
        overloadedTimer: view[at + 14], armorAverage: view[at + 15],
      });
    }
    return ships;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.exports.ecs_destroy(this.worldId);
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('ECS authority is disposed');
  }
}
