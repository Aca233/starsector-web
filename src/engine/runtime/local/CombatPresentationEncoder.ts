import { FireControlQueryRoster } from '../../ai/FireControlQueryBatch';
import type { LanPresentationUiSnapshot } from '../../../network/LanPresentationViews';
import '../../simulation/CombatEngine';
import type { CombatEngine } from '../../simulation/CombatEngine';
import { Ship } from '../../simulation/Ship';
import { Vector2 } from '../../math/Vector2';
import { CombatHudProjector } from '../CombatHudView';
import { TacticalMapViewProjector } from '../TacticalMapView';
import { DeploymentViewProjector } from '../DeploymentView';
import { PackedVisualEncoder, omitPackedVisuals } from './PackedVisualState';
import { RenderShipProjection, knownProjectionKeys } from './RenderShipProjection';
import { isImmutableMetadata } from '../../extensions/Immutable';
import { combatRenderView } from '../../render/CombatRenderView';
import { prototypes, typed, Kind, Tag, LIMIT, VALUE_LIMIT, integer, forbidden, simulationTypes, metadataUnits, type NumericArray, type Shape, type CombatPresentationMode, type CombatPresentationPacket, type CombatPresentationGraphPacket, type DetachedCombatPresentation } from './CombatPresentationWire';
type WireValue = number | string;
interface Identity { id: number; queued?: object; snapshot?: Snapshot; metadataUnits?: number }
interface Snapshot {
  kind: Kind;
  type: number;
  keys: readonly string[];
  values: WireValue[];
  knownShape?: boolean;
  objRefs?: (object | undefined)[];
  objIdentities?: (Identity | undefined)[];
}
const sameKeys = (a: readonly string[], b: readonly string[]): boolean => {
  if (a === b) return true;
  const len = a.length;
  if (len !== b.length) return false;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) return false;
  return true;
};
const isPlainVector2 = (v: Vector2): boolean => {
  if (Object.getPrototypeOf(v) !== Vector2.prototype) return false;
  let count = 0;
  for (const key in v) {
    if ((key !== 'x' && key !== 'y') || !Object.hasOwn(v, key)) return false;
    count++;
  }
  return count === 2;
};
/** Lossless deltas of the explicit display projection, including mutable artwork.
 * IDs never alias another object in an epoch. This is not a replay checkpoint. */
const wingSpecKeys = ['specId'];
const rootEnvelopeKeys = ['view', 'hud'];
const hudEnvelopeKeys = ['read', 'map', 'deployment', 'tactical', 'battleResult', 'isBattleResultReady', 'floatingTexts', 'radio', 'shipLossNotifications', 'notificationTime'];
const tacticalEnvelopeKeys = ['commandPoints', 'selectedUnitId', 'isTacticalMap', 'orders'];
const viewEnvelopeKeys = [
  'ships', 'allCapitalShips', 'playerShip', 'enemyShip', 'playerWings', 'enemyWings',
  'combatTime', 'cameraShakeIntensity', 'environment', 'nebulae', 'asteroids',
  'projectiles', 'beams', 'particles', 'contrails', 'debris', 'explosions', 'hitGlows',
  'empArcs', 'mines', 'muzzleFlashes', 'muzzleParticles', 'shieldRipples', 'hulkFragments',
  'kind', 'movingRayFades', 'trailStrips', 'projectileVisuals', 'projectilePrediction', 'localMuzzles', 'localParticles',
];
const nativeObjectIs = Object.is;
type ObjectReader = (rec: Record<string, unknown>, out: unknown[]) => void;
const stableObjectReaders = new WeakMap<readonly string[], ObjectReader | null>();

function getObjectReader(keys: readonly string[]): ObjectReader | null {
  let reader = stableObjectReaders.get(keys);
  if (reader !== undefined) return reader;
  try {
    let body = '';
    for (let i = 0; i < keys.length; i++) {
      body += `out[${i}]=rec[${JSON.stringify(keys[i])}];`;
    }
    reader = new Function('rec', 'out', body) as ObjectReader;
  } catch {
    reader = null;
  }
  stableObjectReaders.set(keys, reader);
  return reader;
}

export class CombatPresentationEncoder {
  private readonly visuals = new PackedVisualEncoder();
  private readonly hud = new CombatHudProjector();
  private readonly map = new TacticalMapViewProjector();
  private readonly deployment = new DeploymentViewProjector();
  private readonly renderShips = new RenderShipProjection();
  private readonly identities = new WeakMap<object, Identity>();
  private readonly wingSpecs = new WeakMap<object, { specId: string }>();
  private readonly viewShips: Ship[] = [];
  private readonly viewAllCapitalShips: Ship[] = [];
  private readonly viewPlayerWings: { specId: string }[] = [];
  private readonly viewEnemyWings: { specId: string }[] = [];
  private readonly viewTrailStrips: unknown[] = [];
  private readonly hudEnvelope: Record<string, unknown> = {};
  private readonly tacticalEnvelope: Record<string, unknown> = {};
  // Identity rows contain no source object; retire their value snapshot immediately.
  private liveEntries: Identity[] = [];
  private nextEntries: Identity[] = [];
  private readonly pendingNodes: object[] = [];
  private readonly pendingEntries: Identity[] = [];
  private readonly changedFields: number[] = [];
  private readonly fieldValues: unknown[] = [];
  private readonly stringIds = new Map<string, number>();
  private readonly shapeIds = new Map<string, number>();
  private readonly detachedShapeIds = new Map<string, number[]>();
  private readonly knownShapeIds = new Map<readonly string[], number>();
  private priorFrame: object = {};
  private nextIdentity = 1;
  private revision = 0;
  private failed = false;
  constructor(readonly epoch: number, readonly mode: CombatPresentationMode = 'render-strict', private readonly channel: 'render' | 'ui' = 'render') {
    if (!integer(epoch) || !epoch) throw new Error('Invalid presentation epoch');
    if (mode !== 'render-strict' && mode !== 'render') throw new Error('Invalid presentation mode');
    knownProjectionKeys.set(this.hudEnvelope, hudEnvelopeKeys);
    knownProjectionKeys.set(this.tacticalEnvelope, tacticalEnvelopeKeys);
  }
  capture(engine: CombatEngine, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    if (this.failed) throw new Error('Presentation encoder failed; a new epoch is required');
    try {
      if (this.channel !== 'render') throw Error('UI encoder cannot capture a render world');
      return this.captureDelta(engine, tick, recycled, recycledVisuals);
    }
    catch (error) { this.failed = true; throw error; }
  }
  captureUi(snapshot: LanPresentationUiSnapshot, tick: number, recycled?: ArrayBuffer): CombatPresentationGraphPacket {
    if (this.failed) throw Error('Presentation encoder failed; a new epoch is required');
    try {
      if (this.channel !== 'ui') throw Error('Render encoder cannot capture UI');
      return this.captureGraph(snapshot, tick, recycled);
    } catch (error) { this.failed = true; throw error; }
  }
  /** Completed authority data only. Rust callers never hydrate a TS simulation. */
  captureDetached(presentation: DetachedCombatPresentation, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    if (this.failed) throw Error('Presentation encoder failed; a new epoch is required');
    try {
      if (this.channel !== 'render' || presentation.view.kind !== 'detached-combat-render-view') throw Error('Detached render presentation required');
      const visuals = this.visuals.capture(presentation.view, recycledVisuals);
      const view = { ...presentation.view, trailStrips: Array.from(presentation.view.trailStrips) };
      omitPackedVisuals(view, visuals);
      return { ...this.captureGraph({ view, hud: presentation.hud }, tick, recycled, true, true), visuals };
    } catch (error) { this.failed = true; throw error; }
  }
  private projectWingSpec(wing: { specId: string }): { specId: string } {
    let projected = this.wingSpecs.get(wing);
    if (!projected) {
      projected = { specId: wing.specId };
      this.wingSpecs.set(wing, projected);
      knownProjectionKeys.set(projected, wingSpecKeys);
    } else if (projected.specId !== wing.specId) {
      projected.specId = wing.specId;
    }
    return projected;
  }
  private captureDelta(engine: CombatEngine, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    const workerOwned = FireControlQueryRoster.isWorkerOwned(engine);
    this.renderShips.begin(workerOwned);
    const ships = engine.ships;
    const allCapitalShips = engine.allCapitalShips;
    const supported = workerOwned
      ? this.renderShips.supportsEngine(engine.playerShip, engine.enemyShip, ships, allCapitalShips, engine.hulkFragments)
      : this.renderShips.supports([engine.playerShip, engine.enemyShip,
        ...ships, ...allCapitalShips, ...engine.hulkFragments.map(hulk => hulk.sourceShip)]);
    if (!supported) throw new Error('Display projection unsupported; an authority-side presentation adapter is required');
    const borrowed = combatRenderView(engine);
    const visuals = this.visuals.capture(borrowed, recycledVisuals, workerOwned);
    let view: Record<string, unknown>;
    if (workerOwned && visuals.fields.length === 12) {
      this.viewShips.length = ships.length;
      for (let i = 0; i < ships.length; i++) this.viewShips[i] = ships[i];
      this.viewAllCapitalShips.length = allCapitalShips.length;
      for (let i = 0; i < allCapitalShips.length; i++) this.viewAllCapitalShips[i] = allCapitalShips[i];
      const pWings = engine.playerWings;
      this.viewPlayerWings.length = pWings.length;
      for (let i = 0; i < pWings.length; i++) this.viewPlayerWings[i] = this.projectWingSpec(pWings[i]);
      const eWings = engine.enemyWings;
      this.viewEnemyWings.length = eWings.length;
      for (let i = 0; i < eWings.length; i++) this.viewEnemyWings[i] = this.projectWingSpec(eWings[i]);
      const env = engine.environment;
      if (env && !knownProjectionKeys.has(env)) knownProjectionKeys.set(env, Object.keys(env));
      const nebulae = engine.nebulae;
      for (let i = 0; i < nebulae.length; i++) {
        const n = nebulae[i];
        if (!knownProjectionKeys.has(n)) knownProjectionKeys.set(n, Object.keys(n));
      }
      const asteroids = engine.asteroids;
      for (let i = 0; i < asteroids.length; i++) {
        const a = asteroids[i];
        if (!knownProjectionKeys.has(a)) knownProjectionKeys.set(a, Object.keys(a));
      }
      view = {
        ships: this.viewShips,
        allCapitalShips: this.viewAllCapitalShips,
        playerShip: engine.playerShip,
        enemyShip: engine.enemyShip,
        playerWings: this.viewPlayerWings,
        enemyWings: this.viewEnemyWings,
        combatTime: engine.combatTime,
        cameraShakeIntensity: engine.cameraShakeIntensity,
        environment: env,
        nebulae,
        asteroids,
        projectiles: engine.projectiles,
        beams: engine.beams,
        particles: null,
        contrails: null,
        debris: null,
        explosions: null,
        hitGlows: null,
        empArcs: engine.empArcs,
        mines: engine.mines,
        muzzleFlashes: null,
        muzzleParticles: null,
        shieldRipples: null,
        hulkFragments: engine.hulkFragments,
        kind: 'detached-combat-render-view',
        movingRayFades: null,
        trailStrips: null,
        projectileVisuals: borrowed.projectileVisuals,
        projectilePrediction: borrowed.projectilePrediction,
        localMuzzles: null,
        localParticles: null,
      };
      knownProjectionKeys.set(view, viewEnvelopeKeys);
    } else {
      let trailStrips: unknown[];
      if (workerOwned) {
        this.viewTrailStrips.length = 0;
        for (const strip of borrowed.trailStrips) this.viewTrailStrips.push(strip);
        trailStrips = this.viewTrailStrips;
      } else {
        trailStrips = Array.from(borrowed.trailStrips);
      }
      const fallbackView = { ...borrowed, kind: 'detached-combat-render-view', movingRayFades: borrowed.movingRayFades,
        trailStrips: trailStrips as unknown as ReturnType<CombatEngine['contrailEngine']['getStrips']>, projectileVisuals: borrowed.projectileVisuals,
        projectilePrediction: borrowed.projectilePrediction, localMuzzles: borrowed.localMuzzles, localParticles: borrowed.localParticles };
      if (workerOwned) {
        knownProjectionKeys.set(fallbackView, viewEnvelopeKeys);
        this.viewShips.length = ships.length;
        for (let i = 0; i < ships.length; i++) this.viewShips[i] = ships[i];
        fallbackView.ships = this.viewShips;
        this.viewAllCapitalShips.length = allCapitalShips.length;
        for (let i = 0; i < allCapitalShips.length; i++) this.viewAllCapitalShips[i] = allCapitalShips[i];
        fallbackView.allCapitalShips = this.viewAllCapitalShips;
        const pWings = borrowed.playerWings;
        this.viewPlayerWings.length = pWings.length;
        for (let i = 0; i < pWings.length; i++) this.viewPlayerWings[i] = this.projectWingSpec(pWings[i]);
        fallbackView.playerWings = this.viewPlayerWings;
        const eWings = borrowed.enemyWings;
        this.viewEnemyWings.length = eWings.length;
        for (let i = 0; i < eWings.length; i++) this.viewEnemyWings[i] = this.projectWingSpec(eWings[i]);
        fallbackView.enemyWings = this.viewEnemyWings;
      } else {
        fallbackView.playerWings = borrowed.playerWings.map(wing => ({ specId: wing.specId }));
        fallbackView.enemyWings = borrowed.enemyWings.map(wing => ({ specId: wing.specId }));
      }
      omitPackedVisuals(fallbackView, visuals);
      view = fallbackView;
    }
    // Only the closed data-command Worker can treat a whole synchronous HUD
    // capture as read-only. Public/extension engines retain every original read.
    let hud: object;
    if (workerOwned) {
      this.tacticalEnvelope.commandPoints = engine.commandPoints;
      this.tacticalEnvelope.selectedUnitId = engine.selectedUnitId;
      this.tacticalEnvelope.isTacticalMap = engine.isTacticalMap;
      this.tacticalEnvelope.orders = engine.orders;
      this.hudEnvelope.read = this.hud.captureReadonly(engine);
      this.hudEnvelope.map = this.map.captureReadonly(engine, this.epoch);
      this.hudEnvelope.deployment = this.deployment.captureReadonly(engine, this.epoch);
      this.hudEnvelope.tactical = this.tacticalEnvelope;
      this.hudEnvelope.battleResult = engine.battleResult;
      this.hudEnvelope.isBattleResultReady = engine.isBattleResultReady;
      this.hudEnvelope.floatingTexts = engine.floatingTexts;
      this.hudEnvelope.radio = engine.radioMessages;
      this.hudEnvelope.shipLossNotifications = engine.shipLossNotifications;
      this.hudEnvelope.notificationTime = engine.notificationTime;
      hud = this.hudEnvelope;
    } else {
      hud = { read: this.hud.capture(engine), map: this.map.capture(engine, this.epoch), deployment: this.deployment.capture(engine, this.epoch), tactical: { commandPoints: engine.commandPoints, selectedUnitId: engine.selectedUnitId, isTacticalMap: engine.isTacticalMap, orders: engine.orders },
        battleResult: engine.battleResult, isBattleResultReady: engine.isBattleResultReady,
        floatingTexts: engine.floatingTexts, radio: engine.radioMessages, shipLossNotifications: engine.shipLossNotifications, notificationTime: engine.notificationTime };
    }
    const root = { view, hud };
    if (workerOwned) knownProjectionKeys.set(root, rootEnvelopeKeys);
    const packet = this.captureGraph(root, tick, recycled, workerOwned, false);
    this.renderShips.finish();
    return { ...packet, visuals };
  }
  private lastCapacity = 8192;
  private captureGraph(root: object, tick: number, recycled?: ArrayBuffer, fastShapes = false, detached = false): CombatPresentationGraphPacket {
    if (!integer(tick)) throw new Error('Invalid presentation tick');
    const fastIntrinsics = fastShapes
      && !Object.getOwnPropertyDescriptor(Ship, Symbol.hasInstance)
      && Object.getOwnPropertyDescriptor(Object, 'is')?.value === nativeObjectIs;
    let data = new Float64Array(recycled && recycled.byteLength >= 8192 && recycled.byteLength % 8 === 0 && recycled.byteLength <= VALUE_LIMIT * 8 ? recycled : new ArrayBuffer(this.lastCapacity));
    let cursor = 0, metadataSize = 0, metadataCount = 0, fullUnits = 2, nodeCount = 0;
    const strings: string[] = [], stringIds = this.stringIds; stringIds.clear();
    const shapes: Shape[] = [], shapeIds = this.shapeIds; shapeIds.clear();
    const detachedShapeIds = this.detachedShapeIds; detachedShapeIds.clear();
    const knownShapeIds = this.knownShapeIds; knownShapeIds.clear();
    const metadata: CombatPresentationPacket['metadata'] = [];
    // Reuse identity/snapshot indexes, never world values: all live fields below
    // are still sampled each frame. A unique token cannot wrap like a counter.
    const frame = {};
    const pending = this.pendingNodes; pending.length = 0;
    const pendingEntries = this.pendingEntries; pendingEntries.length = 0;
    const entries = this.nextEntries; entries.length = 0;
    let scratch: WireValue[] = [];
    let at = 0, priorLength = 0, changed = false, previous: Snapshot | undefined;
    let objRefs: (object | undefined)[] | undefined;
    let objIdentities: (Identity | undefined)[] | undefined;
    let inLoop = false;
    const changedFields = this.changedFields;
    let trackFields = false;
    const queueNode = (refObj: object, refIdentity: Identity) => {
      if (entries.length >= LIMIT) throw new Error('Presentation node budget exceeded');
      refIdentity.queued = frame;
      entries.push(refIdentity);
      const snap = fastIntrinsics ? refIdentity.snapshot : undefined;
      if (snap?.knownShape && snap.kind === Kind.Vector) {
        const vec = refObj as Vector2, vx = vec.x, vy = vec.y;
        const vals = snap.values, px = vals[0], py = vals[1];
        if ((vx === px ? vx !== 0 || nativeObjectIs(vx, px) : vx !== vx && px !== px)
          && (vy === py ? vy !== 0 || nativeObjectIs(vy, py) : vy !== vy && py !== py)) {
          fullUnits += 6;
          if (fullUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
          return;
        }
      }
      pending.push(refObj);
      pendingEntries.push(refIdentity);
    };
    const queueCachedRef = (refObj: object, refIdentity: Identity) => {
      if (refIdentity.queued === frame) return;
      if (refIdentity.metadataUnits) {
        metadataSize += refIdentity.metadataUnits;
        if (metadataSize > VALUE_LIMIT || metadataCount >= LIMIT) throw new Error('Presentation metadata budget exceeded');
        if (refIdentity.queued !== this.priorFrame) metadata.push({ id: refIdentity.id, value: refObj });
        metadataCount++; refIdentity.queued = frame;
      } else {
        queueNode(refObj, refIdentity);
      }
    };
    const write = (n: number) => {
      if (cursor >= VALUE_LIMIT) throw new Error('Presentation buffer budget exceeded');
      if (cursor === data.length) { const larger = new Float64Array(Math.min(VALUE_LIMIT, data.length * 2)); larger.set(data); data = larger; }
      data[cursor++] = n;
    };
    const text = (s: string) => {
      let id = stringIds.get(s);
      if (id === undefined) { id = strings.length; stringIds.set(s, id); strings.push(s); }
      return id;
    };
    const scalar = (v: WireValue) => {
      const same = previous !== undefined && (fastIntrinsics ? nativeObjectIs(scratch[at], v) : Object.is(scratch[at], v));
      if (!same) {
        changed = true;
        if (trackFields) {
          const field = at >>> 1;
          if (changedFields[changedFields.length - 1] !== field) changedFields.push(field);
        }
        scratch[at] = v;
      }
      at++;
    };
    const pair = (tag: number, payload: WireValue) => {
      const samePayload = previous !== undefined && scratch[at] === tag
        && (fastIntrinsics ? nativeObjectIs(scratch[at + 1], payload) : Object.is(scratch[at + 1], payload));
      if (!samePayload) {
        changed = true;
        if (trackFields) changedFields.push(at >>> 1);
        scratch[at] = tag;
        scratch[at + 1] = payload;
        if (objRefs && tag !== Tag.Ref && tag !== Tag.Metadata) {
          const slot = at >>> 1;
          if (slot < objRefs.length) {
            objRefs[slot] = undefined;
            objIdentities![slot] = undefined;
          }
        }
      }
      at += 2;
    };
    const value = (v: unknown): void => {
      if (typeof v === 'number') {
        if (fastIntrinsics) {
          if (previous && at < priorLength && scratch[at] === Tag.Number) {
            const prev = scratch[at + 1];
            if (v === prev ? v !== 0 || nativeObjectIs(v, prev) : v !== v && prev !== prev) {
              at += 2; return;
            }
          }
          changed = true;
          const slot = at >>> 1;
          if (trackFields) changedFields.push(slot);
          scratch[at] = Tag.Number;
          scratch[at + 1] = v;
          if (objRefs && slot < objRefs.length) { objRefs[slot] = undefined; objIdentities![slot] = undefined; }
          at += 2;
          return;
        }
        if (previous && at < priorLength && scratch[at] === Tag.Number && Object.is(scratch[at + 1], v)) { at += 2; return; }
        pair(Tag.Number, v); return;
      }
      if (typeof v === 'boolean') {
        const tag = v ? Tag.True : Tag.False;
        if (previous && at < priorLength && scratch[at] === tag && (fastIntrinsics || scratch[at + 1] === 0)) { at += 2; return; }
        if (fastIntrinsics) {
          changed = true;
          const slot = at >>> 1;
          if (trackFields) changedFields.push(slot);
          scratch[at] = tag; scratch[at + 1] = 0;
          if (objRefs && slot < objRefs.length) { objRefs[slot] = undefined; objIdentities![slot] = undefined; }
          at += 2;
          return;
        }
        pair(tag, 0); return;
      }
      if (v === undefined) {
        if (previous && at < priorLength && scratch[at] === Tag.Undefined && (fastIntrinsics || scratch[at + 1] === 0)) { at += 2; return; }
        if (fastIntrinsics) {
          changed = true;
          const slot = at >>> 1;
          if (trackFields) changedFields.push(slot);
          scratch[at] = Tag.Undefined; scratch[at + 1] = 0;
          if (objRefs && slot < objRefs.length) { objRefs[slot] = undefined; objIdentities![slot] = undefined; }
          at += 2;
          return;
        }
        pair(Tag.Undefined, 0); return;
      }
      if (v === null) {
        if (previous && at < priorLength && scratch[at] === Tag.Null && (fastIntrinsics || scratch[at + 1] === 0)) { at += 2; return; }
        if (fastIntrinsics) {
          changed = true;
          const slot = at >>> 1;
          if (trackFields) changedFields.push(slot);
          scratch[at] = Tag.Null; scratch[at + 1] = 0;
          if (objRefs && slot < objRefs.length) { objRefs[slot] = undefined; objIdentities![slot] = undefined; }
          at += 2;
          return;
        }
        pair(Tag.Null, 0); return;
      }
      if (typeof v === 'string') {
        if (previous && at < priorLength && scratch[at] === Tag.String && scratch[at + 1] === v) { at += 2; return; }
        if (fastIntrinsics) {
          changed = true;
          const slot = at >>> 1;
          if (trackFields) changedFields.push(slot);
          scratch[at] = Tag.String; scratch[at + 1] = v;
          if (objRefs && slot < objRefs.length) { objRefs[slot] = undefined; objIdentities![slot] = undefined; }
          at += 2;
          return;
        }
        pair(Tag.String, v); return;
      }
      if (typeof v !== 'object') throw new Error('Unsupported presentation value');
      const slot = at >>> 1;
      if (fastIntrinsics && previous && at < priorLength && objRefs && objRefs[slot] === v) {
        queueCachedRef(v as object, objIdentities![slot]!);
        at += 2;
        return;
      }
      let obj: object;
      let identity: Identity | undefined;
      if (fastIntrinsics && objRefs && objRefs[slot] === v) {
        obj = v as object;
        identity = objIdentities![slot]!;
      } else {
        const isShip = fastIntrinsics ? (v as object).constructor === Ship : v instanceof Ship;
        if (isShip && (this.channel === 'ui' || detached)) throw Error('Simulation object in detached presentation');
        obj = isShip ? this.renderShips.project(v as Ship) : v as object;
        if (fastIntrinsics && inLoop) {
          if (objRefs && objRefs[slot] === obj) {
            identity = objIdentities![slot]!;
          } else {
            identity = this.identities.get(obj);
            if (!identity) { identity = { id: this.nextIdentity++ }; this.identities.set(obj, identity); }
            if (!objRefs) { objRefs = []; objIdentities = []; }
            objRefs[slot] = obj;
            objIdentities![slot] = identity;
          }
        } else {
          identity = this.identities.get(obj);
          if (!identity) { identity = { id: this.nextIdentity++ }; this.identities.set(obj, identity); }
        }
      }
      const id = identity.id;
      // UI definitions can share descendants with a mutable encounter fit.
      // Separate deep-copied metadata entries would split those aliases. Keep UI
      // metadata in the same identity/delta graph; unchanged fields are not sent.
      // The existing render metadata contract is intentionally unchanged.
      // Branding is permanent: immutableCopy only registers newly copied/frozen
      // objects, never an already observed mutable object. UI keeps the full graph.
      identity.metadataUnits ??= this.channel !== 'ui' && isImmutableMetadata(obj) ? metadataUnits(obj) : 0;
      if (identity.metadataUnits) {
        if (identity.queued !== frame) {
          metadataSize += identity.metadataUnits;
          if (metadataSize > VALUE_LIMIT || metadataCount >= LIMIT) throw new Error('Presentation metadata budget exceeded');
          if (identity.queued !== this.priorFrame) metadata.push({ id, value: obj });
          metadataCount++; identity.queued = frame;
        }
        if (fastIntrinsics && previous && at < priorLength && scratch[at] === Tag.Metadata && scratch[at + 1] === id) { at += 2; return; }
        pair(Tag.Metadata, id); return;
      }
      if (identity.queued !== frame) queueNode(obj, identity);
      if (fastIntrinsics && previous && at < priorLength && scratch[at] === Tag.Ref && scratch[at + 1] === id) { at += 2; return; }
      pair(Tag.Ref, id);
    };
    const fieldValues = this.fieldValues;
    const scanStableObject = (rec: Record<string, unknown>, keys: readonly string[]) => {
      const kLen = keys.length;
      const reader = getObjectReader(keys);
      if (reader) reader(rec, fieldValues);
      for (let k = 0; k < kLen; k++) {
        const v = reader ? fieldValues[k] : rec[keys[k]];
        const base = k << 1;
        if (typeof v === 'number') {
          if (scratch[base] === Tag.Number) {
            const prev = scratch[base + 1];
            if (v === prev ? v !== 0 || nativeObjectIs(v, prev) : v !== v && prev !== prev) continue;
          }
          changed = true;
          if (trackFields) changedFields.push(k);
          scratch[base] = Tag.Number;
          scratch[base + 1] = v;
          if (objRefs && k < objRefs.length) { objRefs[k] = undefined; objIdentities![k] = undefined; }
          continue;
        }
        if (v === undefined) {
          if (scratch[base] === Tag.Undefined) continue;
          changed = true;
          if (trackFields) changedFields.push(k);
          scratch[base] = Tag.Undefined;
          scratch[base + 1] = 0;
          if (objRefs && k < objRefs.length) { objRefs[k] = undefined; objIdentities![k] = undefined; }
          continue;
        }
        if (typeof v === 'boolean') {
          const tag = v ? Tag.True : Tag.False;
          if (scratch[base] === tag) continue;
          changed = true;
          if (trackFields) changedFields.push(k);
          scratch[base] = tag;
          scratch[base + 1] = 0;
          if (objRefs && k < objRefs.length) { objRefs[k] = undefined; objIdentities![k] = undefined; }
          continue;
        }
        if (v === null) {
          if (scratch[base] === Tag.Null) continue;
          changed = true;
          if (trackFields) changedFields.push(k);
          scratch[base] = Tag.Null;
          scratch[base + 1] = 0;
          if (objRefs && k < objRefs.length) { objRefs[k] = undefined; objIdentities![k] = undefined; }
          continue;
        }
        if (typeof v === 'string') {
          if (scratch[base] === Tag.String && scratch[base + 1] === v) continue;
          changed = true;
          if (trackFields) changedFields.push(k);
          scratch[base] = Tag.String;
          scratch[base + 1] = v;
          if (objRefs && k < objRefs.length) { objRefs[k] = undefined; objIdentities![k] = undefined; }
          continue;
        }
        if (objRefs && objRefs[k] === v) {
          queueCachedRef(v as object, objIdentities![k]!);
          continue;
        }
        at = base;
        value(v);
      }
      at = kLen << 1;
    };
    value(root);
    write(Tag.Ref); write(entries[0].id);
    inLoop = true;
    for (let index = 0; index < pending.length; index++) {
      const object = pending[index], identity = pendingEntries[index], id = identity.id;
      previous = identity.snapshot;
      if (fastIntrinsics && (previous?.knownShape ? previous.kind === Kind.Vector : !previous && Object.getPrototypeOf(object) === Vector2.prototype)) {
        fullUnits += 6;
        if (fullUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
        const vec = object as Vector2, vx = vec.x, vy = vec.y;
        if (previous) {
          const vals = previous.values, px = vals[0], py = vals[1];
          if ((vx === px ? vx !== 0 || nativeObjectIs(vx, px) : vx !== vx && px !== px)
            && (vy === py ? vy !== 0 || nativeObjectIs(vy, py) : vy !== vy && py !== py)) continue;
          vals[0] = vx; vals[1] = vy;
        } else {
          identity.snapshot = { kind: Kind.Vector, type: 0, keys: [], values: [vx, vy], knownShape: true };
        }
        nodeCount++;
        if (cursor + 4 <= data.length) {
          data[cursor++] = id; data[cursor++] = Kind.Vector; data[cursor++] = vx; data[cursor++] = vy;
        } else {
          write(id); write(Kind.Vector); write(vx); write(vy);
        }
        continue;
      }
      if (fastIntrinsics && previous?.knownShape && previous.kind === Kind.Typed) {
        const arr = object as NumericArray, len = arr.length, vals = previous.values;
        if (vals.length === len) {
          fullUnits += 4 + len;
          if (fullUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
          let typedChanged = false;
          for (let k = 0; k < len; k++) {
            const v = arr[k], pv = vals[k];
            if (!(v === pv ? v !== 0 || nativeObjectIs(v, pv) : v !== v && pv !== pv)) {
              typedChanged = true;
              vals[k] = v;
            }
          }
          if (!typedChanged) continue;
          nodeCount++;
          if (cursor + 4 + len <= data.length) {
            data[cursor++] = id; data[cursor++] = Kind.Typed; data[cursor++] = previous.type; data[cursor++] = len;
            for (let k = 0; k < len; k++) data[cursor++] = vals[k] as number;
          } else {
            write(id); write(Kind.Typed); write(previous.type); write(len);
            for (let k = 0; k < len; k++) write(vals[k] as number);
          }
          continue;
        }
      }
      trackFields = false; changedFields.length = 0;
      scratch = previous?.values ?? [];
      objRefs = previous?.objRefs;
      objIdentities = previous?.objIdentities;
      priorLength = scratch.length; at = 0; changed = !previous;
      let kind: Kind, type = 0, keys: readonly string[] = [], knownShape = false;
      if (fastIntrinsics && previous?.knownShape) {
        kind = previous.kind; type = previous.type; keys = previous.keys; knownShape = true;
        if (kind === Kind.Object) {
          trackFields = this.channel === 'render';
          scanStableObject(object as Record<string, unknown>, keys);
        } else if (kind === Kind.Array) {
          const arr = object as unknown[], aLen = arr.length;
          if (objRefs && (aLen << 1) === priorLength) {
            for (let k = 0; k < aLen; k++) {
              const elem = arr[k];
              if (objRefs[k] === elem) {
                queueCachedRef(elem as object, objIdentities![k]!);
                continue;
              }
              at = k << 1;
              value(elem);
            }
            at = aLen << 1;
          } else {
            for (let k = 0; k < aLen; k++) value(arr[k]);
          }
        } else if (kind === Kind.Map) {
          for (const [key, item] of object as Map<unknown, unknown>) { value(key); value(item); }
        } else if (kind === Kind.Set) {
          for (const item of object as Set<unknown>) value(item);
        } else {
          const arr = object as NumericArray;
          for (let k = 0; k < arr.length; k++) scalar(arr[k]);
        }
      } else if (fastIntrinsics && previous && previous.kind === Kind.Object && Object.getPrototypeOf(object) === Object.prototype) {
        kind = Kind.Object; type = 0;
        const knownKeys = knownProjectionKeys.get(object);
        knownShape = !!knownKeys;
        keys = knownKeys ?? Object.keys(object);
        trackFields = this.channel === 'render';
        if (sameKeys(previous.keys, keys)) {
          keys = previous.keys;
          scanStableObject(object as Record<string, unknown>, keys);
        } else {
          if (!knownKeys && keys.some(key => forbidden.has(key))) throw new Error('Invalid presentation property');
          const rec = object as Record<string, unknown>;
          for (let k = 0; k < keys.length; k++) value(rec[keys[k]]);
        }
      } else if (object instanceof Vector2 && ((fastIntrinsics && Object.getPrototypeOf(object) === Vector2.prototype) || isPlainVector2(object))) {
        kind = Kind.Vector; knownShape = fastIntrinsics && Object.getPrototypeOf(object) === Vector2.prototype;
        scalar(object.x); scalar(object.y);
      } else if (Array.isArray(object)) {
        kind = Kind.Array; knownShape = fastIntrinsics; for (let k = 0; k < object.length; k++) value(object[k]);
      } else if (object instanceof Map) {
        kind = Kind.Map; knownShape = fastIntrinsics; for (const [key, item] of object) { value(key); value(item); }
      } else if (object instanceof Set) {
        kind = Kind.Set; knownShape = fastIntrinsics; for (const item of object) value(item);
      } else if (ArrayBuffer.isView(object)) {
        kind = Kind.Typed;
        type = fastIntrinsics && previous?.kind === Kind.Typed ? previous.type : typed.findIndex(ctor => object instanceof ctor);
        if (type < 0) throw new Error('Unsupported presentation typed array');
        knownShape = fastIntrinsics;
        const arr = object as NumericArray;
        for (let k = 0; k < arr.length; k++) scalar(arr[k]);
      } else {
        kind = Kind.Object;
        const prototype = Object.getPrototypeOf(object);
        type = prototype === Object.prototype ? 0 : prototypes.get(prototype) ?? 0;
        if (!type && prototype !== Object.prototype && prototype !== null) throw new Error('Unaudited presentation class: ' + prototype?.constructor?.name);
        if (simulationTypes.has(type)) throw new Error('Simulation class in strict presentation');
        if (this.channel === 'ui' && type !== 0 && type !== 10 && type !== 14) throw Error('Non-UI presentation prototype');
        const knownKeys = fastIntrinsics ? knownProjectionKeys.get(object) : undefined;
        knownShape = !!knownKeys;
        keys = knownKeys ?? Object.keys(object);
        if (previous && sameKeys(previous.keys, keys)) keys = previous.keys;
        else if (!knownKeys && keys.some(key => forbidden.has(key))) throw new Error('Invalid presentation property');
        trackFields = this.channel === 'render' && !!previous;
        const rec = object as Record<string, unknown>;
        const reader = knownShape ? getObjectReader(keys) : null;
        if (reader) {
          reader(rec, fieldValues);
          for (let k = 0; k < keys.length; k++) value(fieldValues[k]);
        } else {
          for (let k = 0; k < keys.length; k++) value(rec[keys[k]]);
        }
      }
      fullUnits += 4 + at;
      if (fullUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
      if (previous && (previous.kind !== kind || previous.type !== type)) throw new Error('Presentation identity changed type');
      const stableLayout = !!previous && priorLength === at && (knownShape || sameKeys(previous.keys, keys));
      changed ||= !stableLayout;
      scratch.length = at;
      if (objRefs) {
        const slots = at >>> 1;
        if (objRefs.length > slots) {
          objRefs.length = slots;
          objIdentities!.length = slots;
        }
        if (previous && !previous.objRefs) {
          previous.objRefs = objRefs;
          previous.objIdentities = objIdentities;
        }
      }
      if (!changed) continue;
      const snapshot = previous ?? { kind, type, keys, values: scratch, knownShape };
      snapshot.keys = keys;
      snapshot.knownShape = knownShape;
      if (objRefs) {
        snapshot.objRefs = objRefs;
        snapshot.objIdentities = objIdentities;
      }
      if (!previous) identity.snapshot = snapshot;
      nodeCount++;
      // Only the local same-build render channel uses sparse records. UI/LAN
      // keeps the original format; new/reentered/reshaped objects stay full.
      if (trackFields && stableLayout && changedFields.length * 3 < at) {
        const patchLen = changedFields.length;
        if (cursor + 3 + patchLen * 3 <= data.length) {
          data[cursor++] = id;
          data[cursor++] = Kind.ObjectPatch;
          data[cursor++] = patchLen;
          for (let f = 0; f < patchLen; f++) {
            const field = changedFields[f];
            const tag = scratch[field * 2] as number, payload = scratch[field * 2 + 1];
            data[cursor++] = field;
            data[cursor++] = tag;
            data[cursor++] = tag === Tag.String || tag === Tag.System ? text(payload as string) : payload as number;
          }
        } else {
          write(id); write(Kind.ObjectPatch); write(patchLen);
          for (let f = 0; f < patchLen; f++) {
            const field = changedFields[f];
            const tag = scratch[field * 2] as number, payload = scratch[field * 2 + 1];
            write(field); write(tag); write(tag === Tag.String || tag === Tag.System ? text(payload as string) : payload as number);
          }
        }
        continue;
      }
      write(id);
      write(kind);
      let start = 0;
      if (kind === Kind.Vector || kind === Kind.Typed) {
        if (kind === Kind.Typed) { write(type); write(at); }
        for (let j = 0; j < at; j++) write(scratch[j] as number);
        continue;
      }
      if (kind === Kind.Object) {
        let shape: number | undefined;
        if (fastIntrinsics) {
          if (knownShape) {
            shape = knownShapeIds.get(keys);
            if (shape === undefined) {
              shape = shapes.length; shapes.push({ type, keys });
              knownShapeIds.set(keys, shape);
            }
          } else {
            // Completed data graphs need no JSON shape string. The bucket only
            // narrows candidates; all keys/order and the first shape ID stay exact.
            const bucket = type + ':' + keys.length + ':' + (keys[0] ?? '');
            const candidates = detachedShapeIds.get(bucket);
            if (candidates) for (const id of candidates) if (sameKeys(shapes[id].keys, keys)) { shape = id; break; }
            if (shape === undefined) {
              shape = shapes.length; shapes.push({ type, keys });
              if (candidates) candidates.push(shape); else detachedShapeIds.set(bucket, [shape]);
            }
          }
        } else {
          // Public TS/UI captures preserve their observable JSON/toJSON hooks.
          const signature = type + ':' + JSON.stringify(keys);
          shape = shapeIds.get(signature);
          if (shape === undefined) { shape = shapes.length; shapeIds.set(signature, shape); shapes.push({ type, keys }); }
        }
        write(shape);
      } else write(at / 2);
      if (cursor + at - start <= data.length) {
        for (let j = start; j < at; j += 2) {
          const tag = scratch[j] as number, payload = scratch[j + 1];
          data[cursor++] = tag;
          data[cursor++] = tag === Tag.String || tag === Tag.System ? text(payload as string) : payload as number;
        }
      } else {
        for (let j = start; j < at; j += 2) {
          const tag = scratch[j] as number, payload = scratch[j + 1];
          write(tag); write(tag === Tag.String || tag === Tag.System ? text(payload as string) : payload as number);
        }
      }
    }
    const liveNodeCount = entries.length;
    pending.length = 0;
    pendingEntries.length = 0;
    const removed: number[] = [];
    // Preserve the previous frame's BFS deletion order. The identity can remain
    // weakly associated with a live source, but its unreachable payload cannot.
    for (let i = 0, len = this.liveEntries.length; i < len; i++) {
      const identity = this.liveEntries[i];
      if (identity.queued !== frame) {
        removed.push(identity.id); identity.snapshot = undefined;
      }
    }
    this.nextEntries = this.liveEntries;
    this.liveEntries = entries;
    this.priorFrame = frame;
    this.lastCapacity = data.buffer.byteLength;
    return { epoch: this.epoch, revision: ++this.revision, tick, buffer: data.buffer as ArrayBuffer, length: cursor,
      nodeCount, liveNodeCount, removed, strings, shapes, metadata };
  }
}
