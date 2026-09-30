import { HudContactRecord, type CombatHudView } from '../CombatHudView';
import type { TacticalMapSnapshot } from '../TacticalMapView';
import type { DeploymentView } from '../DeploymentView';
import type { PackedVisualPacket } from './PackedVisualState';
import { ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from '../../render/ProjectedRenderState';
import { Vector2 } from '../../math/Vector2';
import type { CombatEngine } from '../../simulation/CombatEngine';
import type { CombatRenderView } from '../../render/CombatRenderView';
// Local same-build projection, NOT a savegame/checkpoint. Executable code is never decoded.
export const classes = [null, null, null, null, null, null, null, null, null, null, Vector2, ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon, HudContactRecord] as const;
export const prototypes = new Map<object, number>(classes.flatMap((ctor, i) => ctor ? [[ctor.prototype, i] as [object, number]] : []));
export const behaviorKeys = classes.map(ctor => new Set(ctor ? Object.getOwnPropertyNames(ctor.prototype) : []));
export const typed = [Float64Array, Float32Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array, Uint8ClampedArray] as const;
export type NumericArray = InstanceType<typeof typed[number]>;
export const enum Kind { Object, Array, Map, Set, Typed, Vector, ObjectPatch }
export const enum Tag { Undefined, Null, False, True, Number, String, Ref, Metadata, System }
export const LIMIT = 250_000, VALUE_LIMIT = 8_000_000;
export const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
export const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
/** Both names now select the display-only contract. No simulation prototype mode. */
export type CombatPresentationMode = 'render' | 'render-strict';
export const simulationTypes = new Set([1,2,3,4,5,6,7,8,9]); // Retired protocol IDs are always rejected.
export interface Shape { type: number; keys: string[] }
export interface CombatPresentationGraphPacket {
  epoch: number; revision: number; tick: number;
  buffer: ArrayBuffer; length: number; nodeCount: number; liveNodeCount: number; removed: number[]; strings: string[]; shapes: Shape[];
  metadata: { id: number; value: unknown }[];
}
export interface CombatPresentationPacket extends CombatPresentationGraphPacket { visuals: PackedVisualPacket }
export interface DetachedCombatPresentation {
  view: CombatRenderView & { readonly kind: 'detached-combat-render-view' };
  hud: {
    read: CombatHudView;
    deployment: DeploymentView;
    map: TacticalMapSnapshot;
    tactical: { readonly commandPoints: number; readonly selectedUnitId: string | null; readonly isTacticalMap: boolean; readonly orders: ReadonlyMap<string, Readonly<import('../../simulation/CombatTypes').TacticalOrder>> };
    battleResult: CombatEngine['battleResult']; isBattleResultReady: boolean;
    floatingTexts: CombatEngine['floatingTexts']; shipLossNotifications: CombatEngine['shipLossNotifications']; notificationTime: number;
  };
}
/** Validate immutable dictionary entries before copying/freezing; no executable values. */
export function metadataUnits(value: unknown): number {
  const pending: [unknown, number][] = [[value, 0]], seen = new Set<object>();
  let units = 0;
  while (pending.length) {
    const [item, depth] = pending.pop()!;
    units += typeof item === 'string' ? item.length + 1 : 1;
    if (units > VALUE_LIMIT || depth > 128) throw new Error('Presentation metadata budget exceeded');
    if (item === null || item === undefined || ['boolean', 'number', 'string'].includes(typeof item)) continue;
    if (typeof item !== 'object' || seen.has(item)) throw new Error('Invalid presentation metadata');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error('Invalid metadata prototype');
    seen.add(item);
    for (const [key, child] of Object.entries(item)) {
      if (forbidden.has(key)) throw new Error('Invalid metadata key');
      units += key.length; pending.push([child, depth + 1]);
    }
  }
  return units;
}


