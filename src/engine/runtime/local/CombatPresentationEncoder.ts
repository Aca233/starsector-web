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
import { RenderShipProjection } from './RenderShipProjection';
import { isImmutableMetadata } from '../../extensions/Immutable';
import { combatRenderView } from '../../render/CombatRenderView';
import { prototypes, typed, Kind, Tag, LIMIT, VALUE_LIMIT, integer, forbidden, simulationTypes, metadataUnits, type NumericArray, type Shape, type CombatPresentationMode, type CombatPresentationPacket, type CombatPresentationGraphPacket } from './CombatPresentationWire';
type WireValue = number | string;
interface Identity { id: number; queued?: object; snapshot?: Snapshot; metadataUnits?: number }
interface Snapshot { kind: Kind; type: number; keys: string[]; values: WireValue[] }
const sameKeys = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, i) => key === b[i]);
/** Lossless deltas of the explicit display projection, including mutable artwork.
 * IDs never alias another object in an epoch. This is not a replay checkpoint. */
export class CombatPresentationEncoder {
  private readonly visuals = new PackedVisualEncoder();
  private readonly hud = new CombatHudProjector();
  private readonly map = new TacticalMapViewProjector();
  private readonly deployment = new DeploymentViewProjector();
  private readonly renderShips = new RenderShipProjection();
  private readonly identities = new WeakMap<object, Identity>();
  // Identity rows contain no source object; retire their value snapshot immediately.
  private liveEntries: Identity[] = [];
  private priorFrame: object = {};
  private nextIdentity = 1;
  private revision = 0;
  private failed = false;
  constructor(readonly epoch: number, readonly mode: CombatPresentationMode = 'render-strict', private readonly channel: 'render' | 'ui' = 'render') { if (!integer(epoch) || !epoch) throw new Error('Invalid presentation epoch'); if (mode !== 'render-strict' && mode !== 'render') throw new Error('Invalid presentation mode'); }
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
  private captureDelta(engine: CombatEngine, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    this.renderShips.begin();
    const supported = this.renderShips.supports([engine.playerShip, engine.enemyShip,
      ...engine.ships, ...engine.allCapitalShips, ...engine.hulkFragments.map(hulk => hulk.sourceShip)]);
    if (!supported) throw new Error('Display projection unsupported; an authority-side presentation adapter is required');
    const borrowed = combatRenderView(engine);
    const visuals = this.visuals.capture(borrowed, recycledVisuals);
    const view = { ...borrowed, kind: 'detached-combat-render-view', movingRayFades: borrowed.movingRayFades,
      trailStrips: Array.from(borrowed.trailStrips), projectileVisuals: borrowed.projectileVisuals,
      projectilePrediction: borrowed.projectilePrediction, localMuzzles: borrowed.localMuzzles, localParticles: borrowed.localParticles };
    view.playerWings = borrowed.playerWings.map(wing => ({ specId: wing.specId }));
    view.enemyWings = borrowed.enemyWings.map(wing => ({ specId: wing.specId }));
    omitPackedVisuals(view, visuals);
    // Only the closed data-command Worker can treat a whole synchronous HUD
    // capture as read-only. Public/extension engines retain every original read.
    const root = { view,
      hud: { read: FireControlQueryRoster.isWorkerOwned(engine) ? this.hud.captureReadonly(engine) : this.hud.capture(engine), map: this.map.capture(engine, this.epoch), deployment: this.deployment.capture(engine, this.epoch), tactical: { commandPoints: engine.commandPoints, selectedUnitId: engine.selectedUnitId, isTacticalMap: engine.isTacticalMap, orders: engine.orders },
        battleResult: engine.battleResult, isBattleResultReady: engine.isBattleResultReady,
        floatingTexts: engine.floatingTexts, shipLossNotifications: engine.shipLossNotifications, notificationTime: engine.notificationTime } };
    const packet = this.captureGraph(root, tick, recycled);
    this.renderShips.finish();
    return { ...packet, visuals };
  }
  private captureGraph(root: object, tick: number, recycled?: ArrayBuffer): CombatPresentationGraphPacket {
    if (!integer(tick)) throw new Error('Invalid presentation tick');
    let data = new Float64Array(recycled && recycled.byteLength >= 8192 && recycled.byteLength % 8 === 0 && recycled.byteLength <= VALUE_LIMIT * 8 ? recycled : new ArrayBuffer(8192));
    let cursor = 0, metadataSize = 0, metadataCount = 0, fullUnits = 2, nodeCount = 0;
    const strings: string[] = [], stringIds = new Map<string, number>();
    const shapes: Shape[] = [], shapeIds = new Map<string, number>();
    const metadata: CombatPresentationPacket['metadata'] = [];
    // Reuse identity/snapshot indexes, never world values: all live fields below
    // are still sampled each frame. A unique token cannot wrap like a counter.
    const frame = {};
    const pending: object[] = [], entries: Identity[] = [];
    let scratch: WireValue[] = [];
    let at = 0, changed = false, previous: Snapshot | undefined;
    const changedFields: number[] = [];
    let trackFields = false;
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
      if (!previous || !Object.is(scratch[at], v)) {
        changed = true;
        if (trackFields) {
          const field = at >>> 1;
          if (changedFields[changedFields.length - 1] !== field) changedFields.push(field);
        }
      }
      scratch[at++] = v;
    };
    const value = (v: unknown): void => {
      if (v instanceof Ship) {
        if (this.channel === 'ui') throw Error('Simulation object in UI presentation');
        v = this.renderShips.project(v);
      }
      if (v === undefined) { scalar(Tag.Undefined); scalar(0); return; }
      if (v === null) { scalar(Tag.Null); scalar(0); return; }
      if (typeof v === 'boolean') { scalar(v ? Tag.True : Tag.False); scalar(0); return; }
      if (typeof v === 'number') { scalar(Tag.Number); scalar(v); return; }
      if (typeof v === 'string') { scalar(Tag.String); scalar(v); return; }
      if (typeof v !== 'object') throw new Error('Unsupported presentation value');
      let identity = this.identities.get(v);
      if (!identity) { identity = { id: this.nextIdentity++ }; this.identities.set(v, identity); }
      const id = identity.id;
      // UI definitions can share descendants with a mutable encounter fit.
      // Separate deep-copied metadata entries would split those aliases. Keep UI
      // metadata in the same identity/delta graph; unchanged fields are not sent.
      // The existing render metadata contract is intentionally unchanged.
      // Branding is permanent: immutableCopy only registers newly copied/frozen
      // objects, never an already observed mutable object. UI keeps the full graph.
      identity.metadataUnits ??= this.channel !== 'ui' && isImmutableMetadata(v) ? metadataUnits(v) : 0;
      if (identity.metadataUnits) {
        if (identity.queued !== frame) {
          metadataSize += identity.metadataUnits;
          if (metadataSize > VALUE_LIMIT || metadataCount >= LIMIT) throw new Error('Presentation metadata budget exceeded');
          if (identity.queued !== this.priorFrame) metadata.push({ id, value: v });
          metadataCount++; identity.queued = frame;
        }
        scalar(Tag.Metadata); scalar(id); return;
      }
      if (identity.queued !== frame) {
        if (pending.length >= LIMIT) throw new Error('Presentation node budget exceeded');
        identity.queued = frame; pending.push(v); entries.push(identity);
      }
      scalar(Tag.Ref); scalar(id);
    };
    value(root);
    write(Tag.Ref); write(entries[0].id);
    for (let index = 0; index < pending.length; index++) {
      const object = pending[index], identity = entries[index], id = identity.id;
      trackFields = false; changedFields.length = 0;
      previous = identity.snapshot; scratch = previous?.values ?? [];
      const priorLength = scratch.length; at = 0; changed = !previous;
      let kind: Kind, type = 0, keys: string[] = [];
      if (object instanceof Vector2 && Object.keys(object).length === 2) {
        kind = Kind.Vector; scalar(object.x); scalar(object.y);
      } else if (Array.isArray(object)) {
        kind = Kind.Array; for (const item of object) value(item);
      } else if (object instanceof Map) {
        kind = Kind.Map; for (const [key, item] of object) { value(key); value(item); }
      } else if (object instanceof Set) {
        kind = Kind.Set; for (const item of object) value(item);
      } else if (ArrayBuffer.isView(object)) {
        kind = Kind.Typed; type = typed.findIndex(ctor => object instanceof ctor);
        if (type < 0) throw new Error('Unsupported presentation typed array');
        for (const item of object as NumericArray) scalar(item);
      } else {
        kind = Kind.Object;
        const prototype = Object.getPrototypeOf(object); type = prototypes.get(prototype) ?? 0;
        if (!type && prototype !== Object.prototype && prototype !== null) throw new Error('Unaudited presentation class: ' + prototype?.constructor?.name);
        if (simulationTypes.has(type)) throw new Error('Simulation class in strict presentation');
        if (this.channel === 'ui' && type !== 0 && type !== 10 && type !== 14) throw Error('Non-UI presentation prototype');
        keys = Object.keys(object);
        if (keys.some(key => forbidden.has(key))) throw new Error('Invalid presentation property');
        trackFields = this.channel === 'render' && !!previous;
        for (const key of keys) value((object as Record<string, unknown>)[key]);
      }
      fullUnits += 4 + at;
      if (fullUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
      if (previous && (previous.kind !== kind || previous.type !== type)) throw new Error('Presentation identity changed type');
      const stableLayout = !!previous && priorLength === at && sameKeys(previous.keys, keys);
      changed ||= !stableLayout;
      scratch.length = at;
      if (!changed) continue;
      const snapshot = previous ?? { kind, type, keys, values: scratch };
      snapshot.keys = keys;
      if (!previous) identity.snapshot = snapshot;
      nodeCount++; write(id);
      // Only the local same-build render channel uses sparse records. UI/LAN
      // keeps the original format; new/reentered/reshaped objects stay full.
      if (trackFields && stableLayout && changedFields.length * 3 < at) {
        write(Kind.ObjectPatch); write(changedFields.length);
        for (const field of changedFields) {
          const tag = scratch[field * 2] as number, payload = scratch[field * 2 + 1];
          write(field); write(tag); write(tag === Tag.String || tag === Tag.System ? text(payload as string) : payload as number);
        }
        continue;
      }
      write(kind);
      let start = 0;
      if (kind === Kind.Vector || kind === Kind.Typed) {
        if (kind === Kind.Typed) { write(type); write(at); }
        for (let j = 0; j < at; j++) write(scratch[j] as number);
        continue;
      }
      if (kind === Kind.Object) {
        const signature = type + ':' + JSON.stringify(keys);
        let shape = shapeIds.get(signature);
        if (shape === undefined) { shape = shapes.length; shapeIds.set(signature, shape); shapes.push({ type, keys }); }
        write(shape);
      } else write(at / 2);
      for (let j = start; j < at; j += 2) {
        const tag = scratch[j] as number, payload = scratch[j + 1];
        write(tag); write(tag === Tag.String || tag === Tag.System ? text(payload as string) : payload as number);
      }
    }
    const removed: number[] = [];
    // Preserve the previous frame's BFS deletion order. The identity can remain
    // weakly associated with a live source, but its unreachable payload cannot.
    for (const identity of this.liveEntries) if (identity.queued !== frame) {
      removed.push(identity.id); identity.snapshot = undefined;
    }
    this.liveEntries = entries; this.priorFrame = frame;
    return { epoch: this.epoch, revision: ++this.revision, tick, buffer: data.buffer as ArrayBuffer, length: cursor,
      nodeCount, liveNodeCount: pending.length, removed, strings, shapes, metadata };
  }
}

