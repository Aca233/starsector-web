/** Flat projection buffer contract, shared by the authority kernel and the
 * renderer.
 *
 * The strides mirror the ECS sprite / HUD layout that
 * native/combat-core/src/ecs_core.rs defines and projection.rs reuses, so there
 * is a single source of truth on the Rust side. These constants are declared
 * here rather than imported from the ECS bridge because that module pulls the
 * ship-pack blueprint chain into the combat authority program. */
export const PROJECTED_FLOATS_PER_SPRITE = 16;
export const PROJECTED_FLOATS_PER_BATCH_SLICE = 4;
export const PROJECTED_FLOATS_PER_SHIP_HUD = 12;
export const PROJECTED_FLOATS_PER_SHIP_STATE = 16;
export const PROJECTED_WITNESS_WORDS = 22;

/** Shape expected by the direct batch renderer: one contiguous sprite buffer
 * plus the draw slices that index into it. Ribbons, events and particle bursts
 * are carried for shape parity and stay empty until the projection grows them. */
export interface ProjectedFrameViews {
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
