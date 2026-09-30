import assert from 'node:assert/strict';

export function checkOwnerObservationWire(lab, fixture) {
  const { NumericStore, NumericReader, readPath, writePath, observationWire: W } = lab;
  let comparisons = 0, fieldInvalidations = 0, publisherFrames = 0, ownerFields = 0;
  const equal = (a, b, label) => { assert.deepEqual(a, b, label); comparisons++; };
  const primitives = [undefined, null, NaN, Infinity, -Infinity, -0, 0, .125, false, true, '', 'duplicate', 'duplicate', { object: true }];
  const normalizePacket = p => ({ count: p.count, dictionary: [...p.dictionary], values: Array.from(new Float64Array(p.values, 0, p.count)), tags: Array.from(new Uint8Array(p.tags, 0, p.count)) });
  const traceObject = (target, events, prefix = '') => new Proxy(target, {
    get(object, key) { const value = Reflect.get(object, key); events.push(['get', prefix + String(key)]); return value && typeof value === 'object' ? traceObject(value, events, prefix + String(key) + '.') : value; },
    set(object, key, value) { events.push(['set', prefix + String(key), value]); return Reflect.set(object, key, value); }
  });
  for (const kind of ['Ship', 'Mount']) {
    const lower = kind.toLowerCase(), paths = W[lower + 'Paths'], width = W[lower + 'ObservationWidth'];
    const encode = W['encode' + kind + 'Observation'], matches = W['matches' + kind + 'Observation'], apply = W['apply' + kind + 'Observation'];
    equal(width, paths.length, kind + ' width');
    const genericEncode = (store, node, offset) => { for (const p of paths) store.set(offset++, readPath(node, p)); };
    const genericMatches = (store, node, offset) => paths.every(p => store.equals(offset++, readPath(node, p)));
    const genericApply = (reader, node, offset) => { for (const p of paths) writePath(node, p, reader.get(offset++)); };
    for (let shift = 0; shift < primitives.length; shift++) for (const offset of [0, 3]) {
      const node = {};
      paths.forEach((p, i) => writePath(node, p, primitives[(i + shift) % primitives.length]));
      const before = new NumericStore(offset + width + 2), after = new NumericStore(offset + width + 2);
      for (let i = 0; i < before.values.length; i++) { before.set(i, 'sentinel'); after.set(i, 'sentinel'); }
      genericEncode(before, node, offset); encode(after, node, offset);
      equal(normalizePacket(after.packet(after.values.length)), normalizePacket(before.packet(before.values.length)), 'every tag/value/dictionary and boundary');
      equal(matches(after, node, offset), true, 'original identities match including object fields');
      for (const initial of [{}, Object.fromEntries(paths.filter(p => p.length > 1).map(p => [p[0], null]))]) {
        const a = structuredClone(initial), b = structuredClone(initial);
        genericApply(new NumericReader(before.packet(before.values.length)), a, offset);
        apply(new NumericReader(after.packet(after.values.length)), b, offset); equal(b, a, 'all decoded fields and nullish child creation');
      }
      for (const field of paths) {
        const prior = readPath(node, field); writePath(node, field, { different: true });
        equal(matches(after, node, offset), genericMatches(before, node, offset), 'changed field is never omitted');
        equal(matches(after, node, offset), false, 'field rejection'); fieldInvalidations++; writePath(node, field, prior);
      }
    }
    // Keep observable node reads, short circuits and reader-before-child-write order.
    const object = {}; paths.forEach((p, i) => writePath(object, p, i));
    const encodeTrace = fn => { const events = [], node = traceObject(structuredClone(object), events);
      fn({ set(i, value) { events.push(['write', i, value]); } }, node, 0); return events; };
    equal(encodeTrace(encode), encodeTrace(genericEncode), 'complete encode getter order');
    for (let stop = -1; stop < width; stop++) {
      const trace = fn => {
        const events = [], node = traceObject(structuredClone(object), events);
        const store = { equals(i) { events.push(['equals', i]); return i !== stop; } };
        return { result: fn(store, node, 0), events };
      };
      equal(trace(matches), trace(genericMatches), 'read order and short circuit/' + stop);
      const applyTrace = fn => {
        const events = [], target = {}, node = traceObject(target, events), reader = { get(i) { events.push(['read', i]); if (i === stop) throw Error('read failed'); return i; } };
        let error; try { fn(reader, node, 0); } catch (e) { error = e.message; }
        return { target, events, error };
      };
      equal(applyTrace(apply), applyTrace(genericApply), 'reader order and partial writes on exception/' + stop);
    }
    for (const parent of new Set(paths.filter(p => p.length > 1).map(p => p[0]))) {
      for (const value of [undefined, null]) {
        const node = { ...object, [parent]: value }, a = new NumericStore(width), b = new NumericStore(width);
        genericEncode(a, node, 0); encode(b, node, 0);
        equal(normalizePacket(b.packet(width)), normalizePacket(a.packet(width)), 'nullish source/' + parent);
      }
    }
  }
  const f = fixture(), ais = [new lab.CapitalShipAI(f.ship, f.target), ...f.engine.getNativeAIs()];
  const Reference = lab.BeforePublisher ?? lab.Publisher;
  const old = new Reference(f.ships, ais), next = new lab.Publisher(f.ships, ais);
  const owner = new lab.Owner(next.models, [0]);
  const normalizeFrame = frame => ({ ...frame, control: Array.from(new Int32Array(frame.control)), own: normalizePacket(frame.own), world: normalizePacket(frame.world), projectiles: normalizePacket(frame.projectiles) });
  for (let tick = 0; tick < 4; tick++) {
    f.target.pos.x += 17; f.target.vel.y += .75; f.target.flux.softFlux += 1; f.target.weapons[0].currentAngleRad += .01;
    const a = old.publish(f.engine, ais, 1 / 60), b = next.publish(f.engine, ais, 1 / 60);
    equal(normalizeFrame(b), normalizeFrame(a), 'frozen Publisher, entire packet'); publisherFrames++;
    for (const derived of [false, true]) { equal(old.matches(f.engine, ais, 1 / 60, derived), true, 'old valid'); equal(next.matches(f.engine, ais, 1 / 60, derived), true, 'new valid'); }
    owner.apply(b); const reader = new NumericReader(b.world); let offset = 0;
    for (const view of owner.views) {
      for (const p of W.shipPaths) { equal(readPath(view, p), reader.get(offset++), 'owner ship observation'); ownerFields++; }
      equal(view.ventTime, reader.get(offset++), 'owner vent');
      for (const key of ['maxSpeed','acceleration','deceleration','maxTurnRate','turnAcceleration','turnDeceleration','driftAcceleration','strafeMultiplier']) equal(view.motion[key], reader.get(offset++), 'owner motion');
      for (const mount of view.weapons) { for (const p of W.mountPaths) { equal(readPath(mount, p), reader.get(offset++), 'owner mount observation'); ownerFields++; } offset += 5; }
    }
    equal(offset, b.world.count, 'all world fields consumed at exact original offsets');
  }
  for (const [object, paths] of [[f.target, W.shipPaths], [f.target.weapons[0], W.mountPaths]]) for (const p of paths) {
    const missingParent = p.length > 1 && object[p[0]] == null;
    const parentDescriptor = missingParent ? Object.getOwnPropertyDescriptor(object, p[0]) : undefined;
    if (missingParent) object[p[0]] = {};
    const parent = p.length === 1 ? object : object[p[0]], key = p.at(-1), descriptor = Object.getOwnPropertyDescriptor(parent, key);
    const v = parent[key], changed = typeof v === 'number' ? (Object.is(v, 0) ? 1 : 0) : typeof v === 'boolean' ? !v : typeof v === 'string' ? v + '-changed' : 'changed';
    assert.ok(!Object.is(v, changed), 'fixture must really change ' + p.join('.'));
    Object.defineProperty(parent, key, { configurable: true, enumerable: true, value: changed });
    try {
      equal(next.matches(f.engine, ais, 1 / 60, true), false, 'derived world must reject changed ' + p.join('.'));
      for (const derived of [false, true]) equal(next.matches(f.engine, ais, 1 / 60, derived), old.matches(f.engine, ais, 1 / 60, derived), 'frozen post-await validation/' + p.join('.'));
    } finally {
      if (descriptor) Object.defineProperty(parent, key, descriptor); else delete parent[key];
      if (missingParent) { if (parentDescriptor) Object.defineProperty(object, p[0], parentDescriptor); else delete object[p[0]]; }
    }
    equal(next.matches(f.engine, ais, 1 / 60, true), true, 'restored derived world'); fieldInvalidations++;
  }
  return { comparisons, fieldInvalidations, publisherFrames, ownerFields, frozenPublisher: !!lab.BeforePublisher };
}
