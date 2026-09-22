/** One fixed-layout record, owned by the decoder, NOT by the renderer facade.
 * attach installs accessors once. bind only swaps an array reference and its
 * element offset; it never copies numbers or writes values onto the facade.
 *
 * Storage: numberKeys in order, followed by booleanKeys in order, all Float64.
 * Booleans must already be validated canonical 0/1 by the packet decoder.
 * Numeric values are returned unchanged (including -0, NaN and infinities);
 * packet admission/finite-value policy is deliberately not implemented here.
 *
 * The owner must keep a bound array alive and unchanged until rendering ends.
 * No copying, synchronization, detached-buffer detection or double buffering
 * is performed here. A frame is a live view, not an immutable snapshot. Publish
 * all records plus metadata together before exposing a completed render frame.
 * Never bind authoritative simulation storage or hand this controller to UI.
 */
interface DisplayStorage { values: Float64Array | undefined; offset: number; overrides: number[] | undefined }
const STORAGE = Symbol('display-buffer-storage');
type StoredTarget = { [STORAGE]: DisplayStorage };
// Sharing accessor functions avoids a different accessor shape/closure per mount.
// This cache contains schemas only, never worlds, targets or frame buffers.
const descriptorCache = new Map<string, PropertyDescriptorMap>();
function displayDescriptors(numbers: readonly string[], flags: readonly string[], overlay: boolean): PropertyDescriptorMap {
  const key = JSON.stringify([numbers, flags, overlay]);
  const previous = descriptorCache.get(key); if (previous) return previous;
  const descriptors: PropertyDescriptorMap = Object.create(null);
  const add = (field: string, slot: number, boolean: boolean): void => {
    const read = overlay ? function(this: StoredTarget): number {
      const state = this[STORAGE];
      if (!state.values) throw new Error('Display record is not bound');
      return state.overrides?.[slot] ?? state.values[state.offset + slot];
    } : function(this: StoredTarget): number {
      const state = this[STORAGE];
      if (!state.values) throw new Error('Display record is not bound');
      return state.values[state.offset + slot];
    };
    descriptors[field] = { enumerable: true, configurable: false,
      get: boolean ? function(this: StoredTarget) { return read.call(this) === 1; } : read,
    };
    if (overlay) descriptors[field].set = boolean ? function(this: StoredTarget, value: boolean) {
      if (typeof value !== 'boolean') throw new TypeError('Invalid display prediction flag');
      (this[STORAGE].overrides ??= [])[slot] = value ? 1 : 0;
    } : function(this: StoredTarget, value: number) {
      if (typeof value !== 'number') throw new TypeError('Invalid display prediction number');
      (this[STORAGE].overrides ??= [])[slot] = value;
    };
  };
  for (let i = 0; i < numbers.length; i++) add(numbers[i], i, false);
  for (let i = 0; i < flags.length; i++) add(flags[i], numbers.length + i, true);
  if (descriptorCache.size < 128) descriptorCache.set(key, descriptors);
  return descriptors;
}
export class DisplayBufferRecord {
  readonly stride: number;
  readonly #numberKeys: readonly string[];
  readonly #booleanKeys: readonly string[];
  readonly #storage: DisplayStorage = { values: undefined, offset: 0, overrides: undefined };
  #target: object | undefined;

  constructor(numberKeys: readonly string[], booleanKeys: readonly string[], private readonly predictionOverlay = false) {
    this.#numberKeys = Object.freeze([...numberKeys]);
    this.#booleanKeys = Object.freeze([...booleanKeys]);
    const seen = new Set<string>();
    for (const keys of [this.#numberKeys, this.#booleanKeys]) for (const key of keys) {
      if (typeof key !== 'string' || key.length === 0 || seen.has(key)) throw new TypeError(`Invalid or duplicate display field: ${String(key)}`);
      seen.add(key);
    }
    this.stride = this.#numberKeys.length + this.#booleanKeys.length;
  }

  /** Attach only to one decoder-owned display object. All collisions are checked
   * before installing accessors. Prediction overlays never mutate received values.
   * Never attach to an authoritative simulation object or a Proxy. */
  attach(target: object): void {
    if (this.#target !== undefined) {
      if (this.#target !== target) throw new Error('Display record is already attached');
      return;
    }
    if (target === null || typeof target !== 'object' || !Object.isExtensible(target)) throw new TypeError('Display target must be an extensible object');
    if (STORAGE in target) throw new TypeError('Display target is already bound');
    for (const keys of [this.#numberKeys, this.#booleanKeys]) for (const key of keys) {
      const own = Object.getOwnPropertyDescriptor(target, key);
      if (own ? !own.configurable || !Object.hasOwn(own, 'value') : key in target) throw new TypeError(`Display field collides with target: ${key}`);
    }
    Object.defineProperties(target, { ...displayDescriptors(this.#numberKeys, this.#booleanKeys, this.predictionOverlay),
      [STORAGE]: { value: this.#storage, enumerable: false, configurable: false },
    });
    this.#target = target;
  }

  /** O(1) frame switch, also clearing any local prediction overlay. Invalid
   * bindings preserve the old frame; either bind/attach order is supported. */
  bind(values: Float64Array, offset: number): void {
    if (!(values instanceof Float64Array)) throw new TypeError('Display records require Float64Array storage');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > values.length - this.stride) throw new RangeError('Display record exceeds its Float64Array view');
    this.#storage.overrides = undefined;
    this.#storage.values = values;
    this.#storage.offset = offset;
  }
}

/** Facade construction/integration recipe (no runtime simulation imports here):
 *
 *   const ship = new ProjectedRenderShip();
 *   const record = new DisplayBufferRecord(SHIP_NUMBERS, SHIP_BOOLEANS);
 *   record.attach(ship);
 *   // Parent supplies ONLY metadata fields on ship, plus nested display views.
 *   // Parent binds all records before publishing this ShipRenderState:
 *   record.bind(frameValues, shipOffset);
 *
 * Use ProjectedRenderSystem / ProjectedRenderWeapon in exactly the same way
 * with SYSTEM_* / WEAPON_*. Shield, flux and engine statuses can be plain
 * objects. Keep records separately in decoder-owned storage, not on a facade.
 *
 * ProjectedRender* has declaration-only fields and display-only queries, so
 * accessors can be attached directly without copying or inheriting simulation
 * behavior. If a subclass is desired, call super(), then record.attach(this)
 * in its constructor; use `declare` for field types, NEVER emitted field
 * initializers. Retain the ProjectedRender* prototype/instanceof identity for
 * renderWeaponRange, renderPulseOffset and renderWeaponAngle compatibility.
 *
 * Metadata types can omit the keys statically, e.g.:
 *   type ShipMetadata = Omit<ProjectedRenderShip,
 *     typeof SHIP_NUMBERS[number] | typeof SHIP_BOOLEANS[number] |
 *     'interpolatedPos' | 'interpolatedFacing' | 'getShieldCenter' | 'isVisibleTo'>;
 * Parent metadata updates must leave getters/methods alone. Do NOT Object.assign
 * a full projection/snapshot onto this target: strict-mode writes to read-only
 * getters throw. Never pass it to RenderShipProjection's Object.assign-based
 * sampling path. Assign metadata fields separately; do not materialize scalars.
 *
 * Required extra query state: ship.weaponRanges (actual facade weapon keys),
 * ship.presentationPose (may be undefined), system.pulseOffset (metadata), and
 * weapon.presentationRelativeAngle (metadata, number | undefined). Clear absent
 * optional metadata on a new frame so old presentation overrides do not stick.
 * Supply display sourceCarrier links rather than simulation objects, and stable
 * read-only Vector2 views for pos/prevPos/vel and weapon.relativePos. The existing
 * display queries only read those vectors and create writable result vectors.
 * Unknown/custom simulation queries must fall back at the parent admission
 * boundary, never be copied as methods onto these facades.
 *
 * This module creates no active transport and is not a prediction/HUD authority
 * API. The parent owns packet validation, vector bindings, metadata, renderer
 * publication and the performance gate before any default enablement.
 */
