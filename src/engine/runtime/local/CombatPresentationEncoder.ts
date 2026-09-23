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
import { prototypes, typed, Kind, Tag, LIMIT, VALUE_LIMIT, integer, forbidden, simulationTypes, metadataUnits, type NumericArray, type Shape, type CombatPresentationMode, type CombatPresentationPacket } from './CombatPresentationWire';
type WireValue = number | string;
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
  private readonly identities = new WeakMap<object, number>();
  private readonly metadataSizes = new WeakMap<object, number>();
  private priorMetadata = new Set<number>();
  private snapshots = new Map<number, Snapshot>();
  private nextIdentity = 1;
  private revision = 0;
  private failed = false;
  constructor(readonly epoch: number, readonly mode: CombatPresentationMode = 'render-strict') { if (!integer(epoch) || !epoch) throw new Error('Invalid presentation epoch'); if (mode !== 'render-strict' && mode !== 'render') throw new Error('Invalid presentation mode'); }
  capture(engine: CombatEngine, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    if (this.failed) throw new Error('Presentation encoder failed; a new epoch is required');
    try { return this.captureDelta(engine, tick, recycled, recycledVisuals); }
    catch (error) { this.failed = true; throw error; }
  }
  private captureDelta(engine: CombatEngine, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    if (!integer(tick)) throw new Error('Invalid presentation tick');
    let data = new Float64Array(recycled && recycled.byteLength >= 8192 && recycled.byteLength % 8 === 0 && recycled.byteLength <= VALUE_LIMIT * 8 ? recycled : new ArrayBuffer(8192));
    let cursor = 0, metadataSize = 0, fullUnits = 2, nodeCount = 0;
    const strings: string[] = [], stringIds = new Map<string, number>();
    const shapes: Shape[] = [], shapeIds = new Map<string, number>();
    const metadata: CombatPresentationPacket['metadata'] = [], usedMetadata = new Set<number>();
    const pending: object[] = [], ids: number[] = [], seen = new Set<object>(), next = new Map<number, Snapshot>();
    let scratch: WireValue[] = [];
    let at = 0, changed = false, previous: Snapshot | undefined;
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
    const scalar = (v: WireValue) => { if (!previous || !Object.is(scratch[at], v)) changed = true; scratch[at++] = v; };
    this.renderShips.begin();
    const supported = this.renderShips.supports([engine.playerShip, engine.enemyShip,
      ...engine.ships, ...engine.allCapitalShips, ...engine.hulkFragments.map(hulk => hulk.sourceShip)]);
    if (!supported) throw new Error('Display projection unsupported; an authority-side presentation adapter is required');
    const value = (v: unknown): void => {
      if (v instanceof Ship) v = this.renderShips.project(v);
      if (v === undefined) { scalar(Tag.Undefined); scalar(0); return; }
      if (v === null) { scalar(Tag.Null); scalar(0); return; }
      if (typeof v === 'boolean') { scalar(v ? Tag.True : Tag.False); scalar(0); return; }
      if (typeof v === 'number') { scalar(Tag.Number); scalar(v); return; }
      if (typeof v === 'string') { scalar(Tag.String); scalar(v); return; }
      if (typeof v !== 'object') throw new Error('Unsupported presentation value');
      let id = this.identities.get(v);
      if (!id) { id = this.nextIdentity++; this.identities.set(v, id); }
      if (isImmutableMetadata(v)) {
        if (!usedMetadata.has(id)) {
          let units = this.metadataSizes.get(v);
          if (units === undefined) { units = metadataUnits(v); this.metadataSizes.set(v, units); }
          metadataSize += units;
          if (metadataSize > VALUE_LIMIT || usedMetadata.size >= LIMIT) throw new Error('Presentation metadata budget exceeded');
          if (!this.priorMetadata.has(id)) metadata.push({ id, value: v });
          usedMetadata.add(id);
        }
        scalar(Tag.Metadata); scalar(id); return;
      }
      if (!seen.has(v)) {
        if (pending.length >= LIMIT) throw new Error('Presentation node budget exceeded');
        seen.add(v); pending.push(v); ids.push(id);
      }
      scalar(Tag.Ref); scalar(id);
    };
    const borrowed = combatRenderView(engine);
    const visuals = this.visuals.capture(borrowed, recycledVisuals);
    const view = { ...borrowed, kind: 'detached-combat-render-view', movingRayFades: borrowed.movingRayFades,
      trailStrips: Array.from(borrowed.trailStrips), projectileVisuals: borrowed.projectileVisuals,
      projectilePrediction: borrowed.projectilePrediction, localMuzzles: borrowed.localMuzzles, localParticles: borrowed.localParticles };
    view.playerWings = borrowed.playerWings.map(wing => ({ specId: wing.specId }));
    view.enemyWings = borrowed.enemyWings.map(wing => ({ specId: wing.specId }));
    omitPackedVisuals(view, visuals);
    value({ view,
      hud: { read: this.hud.capture(engine), map: this.map.capture(engine, this.epoch), deployment: this.deployment.capture(engine, this.epoch), tactical: { commandPoints: engine.commandPoints, selectedUnitId: engine.selectedUnitId, isTacticalMap: engine.isTacticalMap, orders: engine.orders },
        battleResult: engine.battleResult, isBattleResultReady: engine.isBattleResultReady,
        floatingTexts: engine.floatingTexts, shipLossNotifications: engine.shipLossNotifications, notificationTime: engine.notificationTime } });
    write(Tag.Ref); write(ids[0]);
    for (let index = 0; index < pending.length; index++) {
      const object = pending[index], id = ids[index];
      previous = this.snapshots.get(id); scratch = previous?.values ?? [];
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
        keys = Object.keys(object);
        if (keys.some(key => forbidden.has(key))) throw new Error('Invalid presentation property');
        for (const key of keys) value((object as Record<string, unknown>)[key]);
      }
      fullUnits += 4 + at;
      if (fullUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
      if (previous && (previous.kind !== kind || previous.type !== type)) throw new Error('Presentation identity changed type');
      changed ||= !previous || priorLength !== at || !sameKeys(previous.keys, keys);
      scratch.length = at;
      if (!changed) { next.set(id, previous!); continue; }
      const snapshot = previous ?? { kind, type, keys, values: scratch };
      snapshot.keys = keys; next.set(id, snapshot);
      nodeCount++; write(id); write(kind);
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
    for (const id of this.snapshots.keys()) if (!next.has(id)) removed.push(id);
    this.snapshots = next; this.priorMetadata = usedMetadata;
    this.renderShips.finish();
    return { epoch: this.epoch, revision: ++this.revision, tick, buffer: data.buffer as ArrayBuffer, length: cursor,
      nodeCount, liveNodeCount: pending.length, removed, strings, shapes, metadata, visuals };
  }
}
