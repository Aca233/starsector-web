import { Vector2 } from '../engine/math/Vector2';
import { Ship } from '../engine/simulation/Ship';
import type { CombatEngine } from '../engine/simulation/CombatEngine';

// Local, same-build presentation protocol. NOT a savegame or an authoritative checkpoint.
// These executable/decision caches stay on the simulation owner, never the renderer.
const OMIT = new Set(['__proto__', 'constructor', 'prototype', 'random', 'visualRandom',
  'autofire', 'combatShips', 'fireControlWorld', 'tacticalAI', 'statusEffects', 'damageTakenModifiers']);
export const PRESENTATION_KEYS = ['combatTime', 'cameraShakeIntensity', 'battleResult', 'environment',
  'projectiles', 'beams', 'fxSystem', 'contrailEngine', 'asteroidSystem', 'nebulaSystem',
  'mineSystem', 'commandSystem', 'statsTracker'] as const;
// The experimental fixture never refits or replaces system definitions mid-battle.
const TEMPLATE_OMIT = new Set([...OMIT, 'spec', 'definition', 'hullStats']);
const typed = [Float64Array, Float32Array, Int32Array, Uint32Array, Int16Array, Uint16Array,
  Int8Array, Uint8Array, Uint8ClampedArray] as const;
const enum Tag { Undefined, Null, False, True, Number, String, Ship, Ref, Vector, Array, Object, Map, Set, Typed }
const MAX_SLOTS = 8 * 1024 * 1024;

export interface PresentationPacket {
  buffer: ArrayBuffer;
  length: number;
  strings: string[];
  shapes: string[][];
  tick: number;
  templateStatics: boolean;
}

/** Float64 preserves JS simulation precision. Graph references avoid copying shared specs repeatedly. */
export class PresentationEncoder {
  constructor(private readonly templateStatics = true) {}
  capture(engine: CombatEngine, tick: number, recycled?: ArrayBuffer): PresentationPacket {
    const omit = this.templateStatics ? TEMPLATE_OMIT : OMIT;
    const ships = engine.capitalShips;
    if (engine.ships.length !== ships.length)
      throw new Error('Worker lab currently supports a fixed capital-only roster; use normal combat for carriers/drones.');
    const shipIndices = new Map(ships.map((ship, i) => [ship, i]));
    let data = new Float64Array(recycled && recycled.byteLength >= 8192 ? recycled : new ArrayBuffer(8192));
    let cursor = 0;
    const strings: string[] = [], stringIds = new Map<string, number>();
    const shapes: string[][] = [], shapeIds = new Map<string, number>();
    const seen = new Map<object, number>();
    const write = (value: number) => {
      if (cursor === data.length) {
        if (data.length >= MAX_SLOTS) throw new Error('Presentation packet exceeds bounded buffer size');
        const bigger = new Float64Array(Math.min(MAX_SLOTS, data.length * 2));
        bigger.set(data); data = bigger;
      }
      data[cursor++] = value;
    };
    const text = (value: string) => {
      let id = stringIds.get(value);
      if (id === undefined) { id = strings.length; strings.push(value); stringIds.set(value, id); }
      write(id);
    };
    const encode = (value: any, depth = 0): void => {
      if (depth > 128) throw new Error('Presentation graph exceeds depth limit');
      if (value === undefined) { write(Tag.Undefined); return; }
      if (value === null) { write(Tag.Null); return; }
      if (typeof value === 'number') { write(Tag.Number); write(value); return; }
      if (typeof value === 'boolean') { write(value ? Tag.True : Tag.False); return; }
      if (typeof value === 'string') { write(Tag.String); text(value); return; }
      if (typeof value !== 'object') throw new Error('Unsupported presentation value');
      if (value instanceof Ship) {
        const index = shipIndices.get(value);
        if (index === undefined) throw new Error('Presentation references a ship outside the fixed roster');
        write(Tag.Ship); write(index); return;
      }
      const prior = seen.get(value);
      if (prior !== undefined) { write(Tag.Ref); write(prior); return; }
      seen.set(value, seen.size);
      if (value instanceof Vector2) { write(Tag.Vector); write(value.x); write(value.y); return; }
      if (ArrayBuffer.isView(value)) {
        const type = typed.findIndex(ctor => value instanceof ctor);
        if (type < 0) throw new Error('Unsupported presentation typed array');
        const values = value as unknown as ArrayLike<number>;
        write(Tag.Typed); write(type); write(values.length);
        for (let i = 0; i < values.length; i++) write(values[i]);
        return;
      }
      if (value instanceof Map) {
        write(Tag.Map); write(value.size);
        for (const [key, item] of value) { encode(key, depth + 1); encode(item, depth + 1); }
        return;
      }
      if (value instanceof Set) {
        write(Tag.Set); write(value.size);
        for (const item of value) encode(item, depth + 1);
        return;
      }
      if (Array.isArray(value)) {
        write(Tag.Array); write(value.length);
        for (const item of value) encode(item, depth + 1);
        return;
      }
      const keys = Object.keys(value).filter(key => !omit.has(key) && typeof value[key] !== 'function');
      const signature = JSON.stringify(keys);
      let shape = shapeIds.get(signature);
      if (shape === undefined) { shape = shapes.length; shapes.push(keys); shapeIds.set(signature, shape); }
      write(Tag.Object); write(shape);
      for (const key of keys) encode(value[key], depth + 1);
    };
    const world: Record<string, unknown> = {};
    for (const key of PRESENTATION_KEYS) world[key] = engine[key];
    encode({ ships: ships.map(ship => ({ ...ship })), world });
    return { buffer: data.buffer as ArrayBuffer, length: cursor, strings, shapes, tick, templateStatics: this.templateStatics };
  }
}

/** Reuses component instances to retain their prototypes. Never advance this mirror as a simulation. */
export function applyPresentation(engine: CombatEngine, packet: PresentationPacket): void {
  if (!Number.isSafeInteger(packet.tick) || packet.tick < 0 || !Number.isSafeInteger(packet.length)
    || packet.length < 0 || packet.length > MAX_SLOTS || packet.length * 8 > packet.buffer.byteLength)
    throw new Error('Invalid local presentation packet');
  const omit = packet.templateStatics ? TEMPLATE_OMIT : OMIT;
  const shapeKeys = packet.shapes.map(keys => new Set(keys));
  const data = new Float64Array(packet.buffer, 0, packet.length), nodes: any[] = [];
  const ships = engine.capitalShips;
  const claimed = new Set<object>();
  const reusable = (value: any) => value && !claimed.has(value) && !Object.isFrozen(value);
  let cursor = 0;
  const read = () => {
    if (cursor >= data.length) throw new Error('Truncated local presentation packet');
    return data[cursor++];
  };
  const index = (length: number) => {
    const value = read();
    if (!Number.isSafeInteger(value) || value < 0 || value >= length) throw new Error('Invalid presentation index');
    return value;
  };
  const count = () => index(MAX_SLOTS + 1);
  const decode = (target?: any, depth = 0): any => {
    if (depth > 128) throw new Error('Presentation graph exceeds depth limit');
    const tag = read();
    switch (tag) {
      case Tag.Undefined: return undefined;
      case Tag.Null: return null;
      case Tag.False: return false;
      case Tag.True: return true;
      case Tag.Number: return read();
      case Tag.String: return packet.strings[index(packet.strings.length)];
      case Tag.Ship: return ships[index(ships.length)];
      case Tag.Ref: return nodes[index(nodes.length)];
    }
    let result: any;
    switch (tag) {
      case Tag.Vector:
        result = target instanceof Vector2 && reusable(target) ? target : new Vector2();
        nodes.push(result); claimed.add(result); result.set(read(), read()); return result;
      case Tag.Typed: {
        const ctor = typed[index(typed.length)], length = count();
        result = target instanceof ctor && target.length === length && reusable(target) ? target : new ctor(length);
        nodes.push(result); claimed.add(result);
        for (let i = 0; i < length; i++) result[i] = read();
        return result;
      }
      case Tag.Array: {
        const length = count(); result = Array.isArray(target) && reusable(target) ? target : [];
        nodes.push(result); claimed.add(result);
        for (let i = 0; i < length; i++) result[i] = decode(result[i], depth + 1);
        result.length = length; return result;
      }
      case Tag.Map: {
        const length = count(), old = target instanceof Map ? target : new Map();
        result = new Map(); nodes.push(result);
        for (let i = 0; i < length; i++) {
          const key = decode(undefined, depth + 1);
          result.set(key, decode(old.get(key), depth + 1));
        }
        return result;
      }
      case Tag.Set: {
        const length = count(); result = new Set(); nodes.push(result);
        for (let i = 0; i < length; i++) result.add(decode(undefined, depth + 1));
        return result;
      }
      case Tag.Object: {
        const shape = index(packet.shapes.length), keys = packet.shapes[shape], keySet = shapeKeys[shape];
        result = target && typeof target === 'object' && !Array.isArray(target)
          ? (reusable(target) ? target : Object.assign(Object.create(Object.getPrototypeOf(target)), target)) : {};
        nodes.push(result); claimed.add(result);
        // Remove disappeared optional data, but retain omitted executable state and methods.
        for (const key of Object.keys(result))
          if (!omit.has(key) && typeof result[key] !== 'function' && !keySet.has(key)) delete result[key];
        for (const key of keys) {
          if (omit.has(key)) throw new Error('Forbidden presentation property');
          result[key] = decode(result[key], depth + 1);
        }
        return result;
      }
      default: throw new Error('Unknown presentation tag');
    }
  };
  const world: Record<string, unknown> = {};
  for (const key of PRESENTATION_KEYS) world[key] = engine[key];
  const root = decode({ ships, world });
  if (cursor !== data.length || root.ships.length !== ships.length) throw new Error('Invalid presentation roster or length');
  for (const key of PRESENTATION_KEYS) (engine as any)[key] = root.world[key];
}


