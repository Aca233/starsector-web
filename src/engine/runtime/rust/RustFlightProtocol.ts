/** One-time complete flight admission. No running Ship or RNG tracker survives
 * compilation; Rust keeps the sole runtime owner after tag 135 completes. */
import type { RustCompiledContent } from './RustContentCompiler';
import type { RustFlightStaticShip, RustFlightWingSpec } from './RustContentCompilerFlight';
import { encodeRustCommands, RUST_COMMAND_WIDTH, type RustBodyHandle, type RustCommand } from './RustCoreProtocol';

export const RUST_FLIGHT_ADMISSION_VERSION = 1;
export const RUST_FLIGHT_TAG_FIRST = 133, RUST_FLIGHT_TAG_LAST = 135;
export const RUST_FLIGHT_MAX_UTF16 = 16_000_000;
const finiteJSON = (value: unknown, depth = 0): void => {
  if (depth > 64) throw Error('Rust flight admission exceeds nesting bound');
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Nonfinite Rust flight admission');
  if (Array.isArray(value)) { if (value.length > 1_000_000) throw Error('Rust flight collection exceeds bound'); value.forEach(v => finiteJSON(v, depth + 1)); }
  else if (value && typeof value === 'object') Object.values(value).forEach(v => finiteJSON(v, depth + 1));
  else if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string' && value !== undefined && value !== null)
    throw Error('Unsupported Rust flight admission value');
};
/** Shared startup/dynamic template format, with globally disjoint native IDs. */
export function rustFlightTemplateRows(content: RustCompiledContent, templateIds: ReadonlyMap<string, number>) {
  const byKey = new Map(content.dictionary.templates.map(t => [t.key,t]));
  const template = (key:string):number => { const t = byKey.get(key), id = t && templateIds.get(t.constructor.specId); if (!t || !id || t.constructor.hullSize !== 0) throw Error('Unknown native craft template'); return id; };
  const wings = (rows:readonly RustFlightWingSpec[]) => rows.map(w => ({...w,template:template(w.template)}));
  return content.dictionary.templates.map(t => {
    const fireCommands:RustCommand[] = [{kind:'initialize-fire',id:1,handle:{slot:0,generation:1},mounts:t.constructor.mounts.map(m => m.fire)},
      {kind:'initialize-fire-query',id:1,handle:{slot:0,generation:1},ship:{visibility:[],scope:[],player:false,finish:1,pressure:1,tieRank:0},mounts:t.constructor.mounts.map(m => m.query)},
      ...t.domains.filter((c):c is Extract<RustCommand,{kind:'recoil-source'}> => c.kind === 'recoil-source')];
    const words = encodeRustCommands(fireCommands), mounts:number[][][] = t.constructor.mounts.map(() => []);
    for (let i=0;i<words.length;i+=RUST_COMMAND_WIDTH) { const row = Array.from(words.slice(i,i+RUST_COMMAND_WIDTH)); if ([57,58,59].includes(row[0])) continue;
      if (!mounts[row[4]]) throw Error('Invalid native template mount'); mounts[row[4]].push([row[0],...row.slice(4)]); }
    const carrierStats = t.carrierSpecKey ? content.pending.flight.ships.find(s => s.carrierSpecKey === t.carrierSpecKey)?.carrierStats ?? byKey.get(t.carrierSpecKey)?.constructor.carrierStats : undefined;
    if (t.carrierSpecKey && !carrierStats) throw Error('Missing native template carrier certificate');
    const constructor = {...t.constructor,wings:wings(t.constructor.wings),systems:t.constructor.systems.map(s => ({...s,definition:{...s.definition,active:s.definition.active === Infinity ? 'INFINITY' : s.definition.active}})),
      mounts:t.constructor.mounts.map(({fire:_fire,query:_query,...m},index) => ({...m,fireRows:mounts[index]}))};
    return {key:t.key,carrierSpecKey:t.carrierSpecKey,pointDefense:carrierStats?.pointDefenseSkill,template:t.constructor.hullSize === 0 ? template(t.key) : 0,constructor};
  });
}

/** Authored names remain literal Intl keys. Only the exact lower-case ASCII
 * suffix grammar emitted by SimulationRandom may use the certified table. */
export function compileRustFlightCollation(content: RustCompiledContent) {
  const all = content.pending.flight.ships;
  const dronePrefixes = content.pending.drone.launchers.map(l => {
      const s = all.find(s => s.handle.slot === l.carrier.slot && s.handle.generation === l.carrier.generation);
      if (!s) throw Error('Missing authored drone collation carrier'); return s.stableId + '_drone_';
    });
  return compileRustFlightNames(all, content.dictionary.templates.flatMap(t => t.constructor.mounts.map(m => m.slot)), dronePrefixes);
}
export function compileRustFlightNames(all:readonly {readonly stableId:string;readonly wings:readonly unknown[];readonly bays:number;readonly mounts:readonly {readonly slot:string}[]}[], templateMounts:readonly string[], dronePrefixes:readonly string[] = []) {
  const prefixes = [...new Set([...all.filter(s => s.wings.length > 0 && s.bays > 0).map(s => s.stableId + '_craft_'), ...dronePrefixes])];
  const valid = (suffix: string) => /^[0-9a-z]{1,11}(?::module:[0-9]{1,10})*$/.test(suffix)
    && (suffix.match(/:module:/g)?.length ?? 0) <= 32;
  const literal = all.filter(s => !prefixes.some(prefix => s.stableId.startsWith(prefix) && valid(s.stableId.slice(prefix.length))))
    .map(s => s.stableId);
  if (prefixes.some((p, i) => prefixes.some((q, j) => i !== j && (p.startsWith(q) || q.startsWith(p))))
    || literal.some(s => prefixes.some(p => s.startsWith(p)))) throw Error('Overlapping Rust flight ID namespace');
  const chars = Array.from(':0123456789abcdefghijklmnopqrstuvwxyz');
  const compare = (a: string, b: string) => Math.sign(a.localeCompare(b));
  chars.sort((a, b) => compare(a, b));
  if (chars.some((c, i) => i && compare(chars[i - 1], c) >= 0)) throw Error('Non-distinct Rust flight suffix collation');
  const lex = (a: string, b: string) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const d = chars.indexOf(a[i]) - chars.indexOf(b[i]); if (d) return Math.sign(d);
    } return Math.sign(a.length - b.length);
  };
  // The emitted alphabet has no case/diacritics. Verify its character ordering,
  // prefix termination and context behavior before granting this contract.
  const contexts = ['', '0', 'a', 'z', ':module:', 'zzzzzzzzzzz:module:9999999999'];
  for (const prefix of prefixes) for (const left of contexts) for (const a of chars) {
    if (compare(prefix + left, prefix + left + a) !== -1) throw Error('Unsupported Rust flight suffix termination');
    for (const b of chars) for (const tail of ['', '0', 'z', ':module:9']) {
      if (compare(prefix + left + a + tail, prefix + left + b + tail) !== lex(a + tail, b + tail))
        throw Error('Unsupported Rust flight suffix context collation');
    }
  }
  const minimum = chars.filter(c => c !== ':')[0], maximum = chars.filter(c => c !== ':').at(-1)!;
  const low = minimum, high = maximum.repeat(11) + (':module:' + '9'.repeat(10)).repeat(32);
  const namespaces = [...literal.map(prefix => ({ prefix, dynamic: false, lower: prefix, upper: prefix })),
    ...prefixes.map(prefix => ({ prefix, dynamic: true, lower: prefix + low, upper: prefix + high }))]
    .sort((a, b) => compare(a.lower, b.lower));
  for (let i = 0; i < namespaces.length; i++) {
    const n = namespaces[i];
    if (n.dynamic && compare(n.lower, n.upper) >= 0 || i && compare(namespaces[i - 1].upper, n.lower) >= 0)
      throw Error('Rust flight namespace collation ranges overlap');
  }
  const result = { namespaces: namespaces.map(({ prefix, dynamic }, rank) => ({ prefix, dynamic, rank })),
    alphabet: chars.map((char, rank) => ({ code: char.charCodeAt(0), rank })),
    mounts: [...new Set([...all.flatMap(s => s.mounts.map(m => m.slot)),
      ...templateMounts])]
      .sort((a, b) => a.localeCompare(b)).map((slot, rank) => ({ slot, rank })) };
  // Cross-check every installed ID against the actual original comparator.
  const key = (s: string) => {
    const n = result.namespaces.find(n => n.dynamic ? s.startsWith(n.prefix) && valid(s.slice(n.prefix.length)) : s === n.prefix);
    if (!n) throw Error('Uncertified initial Rust flight ID');
    return [n.rank, ...(n.dynamic ? Array.from(s.slice(n.prefix.length), c => chars.indexOf(c)) : [])];
  };
  const native = (a: string, b: string) => {
    const x = key(a), y = key(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
    return Math.sign(x.length - y.length);
  };
  for (const a of all) for (const b of all) if (native(a.stableId, b.stableId) !== compare(a.stableId, b.stableId))
    throw Error('Initial Rust flight ID collation differs');
  return result;
}

export function encodeRustFlightAdmission(content: RustCompiledContent, id: number, anchor: RustBodyHandle): number[][] {
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(anchor.slot) || anchor.slot < 0 || !Number.isInteger(anchor.generation) || anchor.generation <= 0)
    throw Error('Invalid Rust flight admission anchor');
  const f = content.pending.flight, byKey = new Map(content.dictionary.templates.map(t => [t.key, t]));
  const templateIds = new Map<string, number>();
  for (const t of content.dictionary.templates) if (t.constructor.hullSize === 0 && !templateIds.has(t.constructor.specId))
    templateIds.set(t.constructor.specId, templateIds.size + 1);
  const template = (key: string): number => {
    const t = byKey.get(key), n = t && templateIds.get(t.constructor.specId);
    if (!t || n === undefined || t.constructor.hullSize !== 0) throw Error('Unknown Rust flight craft template: ' + key);
    return n;
  };
  const wings = (values: readonly RustFlightWingSpec[]) => values.map(w => ({ ...w, template: template(w.template) }));
  const staticShip = (s: RustFlightStaticShip, domains: readonly RustCommand[]) => {
    const fireCommands: RustCommand[] = [{ kind: 'initialize-fire', id: 1, handle: { slot: 0, generation: 1 }, mounts: s.mounts.map(m => m.fire) },
      { kind: 'initialize-fire-query', id: 1, handle: { slot: 0, generation: 1 }, ship: { visibility: [], scope: [], player: false,
        finish: 1, pressure: 1, tieRank: 0 }, mounts: s.mounts.map(m => m.query) },
      ...domains.filter((c): c is Extract<RustCommand, { kind: 'recoil-source' }> => c.kind === 'recoil-source')];
    const words = encodeRustCommands(fireCommands), mountRows: number[][][] = s.mounts.map(() => []);
    for (let i = 0; i < words.length; i += RUST_COMMAND_WIDTH) {
      const row = Array.from(words.slice(i, i + RUST_COMMAND_WIDTH));
      if (row[0] === 57 || row[0] === 58 || row[0] === 59) continue;
      if (!Number.isInteger(row[4]) || !mountRows[row[4]]) throw Error('Invalid Rust flight fire row');
      mountRows[row[4]].push([row[0], ...row.slice(4)]);
    }
    return { ...s, wings: wings(s.wings),
      systems: s.systems.map(system => ({ ...system, definition: { ...system.definition,
        active: system.definition.active === Infinity ? 'INFINITY' : system.definition.active } })),
      mounts: s.mounts.map(({ fire: _fire, query: _query, ...m }, i) => ({ ...m, fireRows: mountRows[i] })) };
  };
  const byId = new Map(f.ships.map(s => [s.id, s]));
  const bodyHandle = (numeric: number): RustBodyHandle => {
    const s = byId.get(numeric); if (!s) throw Error('Unknown Rust flight body identity'); return s.handle;
  };
  const templates = content.dictionary.templates.map(t => {
    const carrierStats = t.carrierSpecKey ? f.ships.find(s => s.carrierSpecKey === t.carrierSpecKey)?.carrierStats
      ?? byKey.get(t.carrierSpecKey)?.constructor.carrierStats : undefined;
    if (t.carrierSpecKey && !carrierStats) throw Error('Missing Rust flight template carrier certificate');
    return { key: t.key, carrierSpecKey: t.carrierSpecKey, pointDefense: carrierStats?.pointDefenseSkill,
      template: t.constructor.hullSize === 0 ? template(t.key) : 0, constructor: staticShip(t.constructor, t.domains) };
  });
  const data = { version: RUST_FLIGHT_ADMISSION_VERSION, initializeWings: f.initializeWings, templates, drone: content.pending.drone,
    collation: compileRustFlightCollation(content),
    ships: f.ships.map(s => ({ ...s, wings: wings(s.wings) })),
    roots: f.roots,
    carrierOrder: f.carrierOrder,
    wings: f.wings.map(w => {
      const carrier = byId.get(w.carrierId), t = f.templates.find(t => t.carrierSpecKey === carrier?.carrierSpecKey && byKey.get(t.craftSpecKey)?.constructor.specId === w.specId);
      if (!carrier || !t) throw Error('Missing Rust flight wing variant');
      return { carrier: carrier.handle, id: w.wingId, name: w.name, player: w.player, team: w.team, crr: w.crr,
        spec: { template: template(t.craftSpecKey), specId: w.specId, role: w.role, count: w.count, rebuildSeconds: w.rebuildSeconds,
          range: w.range, tags: w.tags ?? [], specialName: ['FURY', 'STARHAWK', 'THUNDERHAWK', 'ARK_INTERCEPTOR', 'ARK_STRIKER'].includes(byKey.get(t.craftSpecKey)!.constructor.role) },
        crafts: w.craftIds.map(bodyHandle) };
    }),
    craftModes: f.craftModes.map(m => ({ craft: bodyHandle(m.id), state: m.state, timer: m.timer,
      bomber: m.hasTorpedo !== undefined, hasPayload: m.hasTorpedo ?? true })), formation: f.formation };
  finiteJSON(data); const serialized = JSON.stringify(data);
  if (serialized.length > RUST_FLIGHT_MAX_UTF16) throw Error('Rust flight admission exceeds total bound');
  const rows: number[][] = [], append = (tag: number, values: number[]) => {
    const row = Array<number>(RUST_COMMAND_WIDTH).fill(0);
    row.splice(0, 4 + values.length, tag, id, anchor.slot, anchor.generation, ...values); rows.push(row);
  };
  append(133, [RUST_FLIGHT_ADMISSION_VERSION, serialized.length, f.ships.length]);
  for (let offset = 0; offset < serialized.length; offset += 20) {
    const count = Math.min(20, serialized.length - offset);
    append(134, [offset, count, ...Array.from({ length: count }, (_, i) => serialized.charCodeAt(offset + i))]);
  }
  append(135, []); return rows;
}
