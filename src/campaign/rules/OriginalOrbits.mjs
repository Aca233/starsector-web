import { finite, identifier, isRecord, requireThat } from '../core/Values.mjs';

const f = Math.fround;
const radiansPerDegree = f(f(Math.PI) / 180);
const normalize = angle => f(f(f(angle % 360) + 360) % 360);
const check = (ok, message) => requireThat(ok, 'INVALID_ORBIT', message);
const number = (value, label, min = -1e9, max = 1e9) => {
  check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `Invalid orbit ${label}`);
  return f(value);
};
/** Provider-owned descriptor, deliberately not hardcoded into the world kernel. */
export function validateOriginalOrbit(orbit) {
  check(isRecord(orbit) && orbit.schemaVersion === 1, 'Unsupported orbit schema');
  check(['circular', 'point-down', 'spin'].includes(orbit.kind), 'Unsupported orbit kind');
  const keys = ['schemaVersion', 'kind', 'focusId', 'radius', 'periodDays', 'angleDegrees'];
  if (orbit.kind === 'spin') keys.push('spinDegreesPerDay', 'facingDegrees');
  check(Object.keys(orbit).every(k => keys.includes(k)), 'Unknown orbit field');
  identifier(orbit.focusId, 'orbit focus');
  const radius = number(orbit.radius, 'radius', 0);
  check(orbit.radius === 0 || radius > 0, 'Orbital radius cannot underflow');
  const period = number(orbit.periodDays, 'period');
  number(orbit.angleDegrees, 'angle');
  // PointDown/WithSpin have no native zero-radius branch; do not persist native NaNs.
  check(orbit.kind === 'circular' || radius > 0, 'Only circular orbits support zero radius');
  check(period !== 0, 'Zero orbital periods are unsupported');
  if (radius > 0) {
    const circumference = f(f(f(Math.PI) * 2) * radius);
    const speed = f(circumference / period);
    check(Number.isFinite(speed) && speed !== 0, 'Orbital speed cannot underflow or overflow');
    check(Number.isFinite(f(360 / f(circumference / speed))), 'Invalid angular speed');
  }
  if (orbit.kind === 'spin') {
    number(orbit.spinDegreesPerDay, 'spin'); number(orbit.facingDegrees, 'facing');
  }
  return orbit;
}
/** Reproduce native single-orbit float operations; ordering is the scheduler's policy. */
export function advanceOriginalOrbit(entity, focus, seconds) {
  const o = validateOriginalOrbit(entity.orbit);
  finite(seconds, 'orbit seconds', 0, 10);
  check(focus?.id === o.focusId && focus.locationId === entity.locationId, 'Orbit focus is missing or foreign');
  const radius = f(o.radius), days = f(f(seconds) / 10);
  const circumference = f(f(f(Math.PI) * 2) * radius);
  const speed = f(circumference / f(o.periodDays));
  const angularSpeed = f(360 / f(circumference / speed));
  // Native computes location using the unnormalized angle, then stores the normalized one.
  const angle = radius === 0 ? 0 : f(f(o.angleDegrees) - f(angularSpeed * days));
  const radians = f(angle * radiansPerDegree);
  const position = [f(f(focus.position[0]) + f(f(Math.cos(radians)) * radius)),
    f(f(focus.position[1]) + f(f(Math.sin(radians)) * radius))];
  position.forEach(v => finite(v, 'orbital position', -1e12, 1e12));
  const orbit = { ...o, angleDegrees: normalize(angle) };
  const next = { ...entity, position, orbit };
  if (o.kind === 'point-down') next.facingDegrees = orbit.angleDegrees;
  if (o.kind === 'spin') {
    orbit.facingDegrees = normalize(f(f(o.facingDegrees) + f(f(o.spinDegreesPerDay) * days)));
    next.facingDegrees = orbit.facingDegrees;
  }
  return next;
}
/** Stable focus-first order, independent of JSON insertion order, without recursive stack growth. */
export function originalOrbitOrder(world) {
  const entities = world.spaceEntities, done = new Set(), result = [];
  for (const entity of Object.values(entities)) {
    check(entity.velocity === undefined, 'Spatial entity velocity integration is not supported');
    if (entity.facingDegrees !== undefined) number(entity.facingDegrees, 'entity facing');
  }
  for (const id of Object.keys(entities).sort()) {
    if (done.has(id)) continue;
    const path = [], visiting = new Set();
    let current = id;
    while (!done.has(current)) {
      check(!visiting.has(current), 'Cyclic orbit focus graph');
      visiting.add(current); path.push(current);
      const entity = entities[current];
      check(Boolean(entity), 'Missing orbital focus');
      if (entity.orbit === undefined) break;
      const orbit = validateOriginalOrbit(entity.orbit), focus = entities[orbit.focusId];
      check(focus && focus.locationId === entity.locationId, 'Orbit focus must exist in the same location');
      current = orbit.focusId;
    }
    for (const next of path.reverse()) {
      done.add(next);
      if (entities[next].orbit !== undefined) result.push(next);
    }
  }
  return result;
}
export function validateOriginalOrbitalWorld(world) {
  originalOrbitOrder(world);
  for (const fleet of Object.values(world.fleets)) check(fleet.orbit === undefined, 'Fleet orbits require a replacement fleet-motion provider');
}
export function advanceOriginalOrbitalWorld(world, seconds) {
  const entities = { ...world.spaceEntities }, changes = [];
  for (const id of originalOrbitOrder(world)) {
    const before = entities[id], focus = entities[before.orbit.focusId];
    const value = { ...advanceOriginalOrbit(before, focus, seconds), version: before.version + 1 };
    entities[id] = value;
    changes.push({ collection: 'spaceEntities', id, expectedVersion: before.version, value });
  }
  return { changes, events: [] };
}
export const originalOrbitsProvider = Object.freeze({
  id: 'reference.orbits', version: '0.1.0', service: 'spaceMotion', apiVersion: 1,
  capabilities: ['authoritative-space-motion', 'validated-orbit-graph'], requires: {},
  evidence: [
    { source: 'CircularOrbit / CircularOrbitPointDown / CircularOrbitWithSpin / CampaignClock.convertToDays / Utils',
      scope: 'Native float orbital period, negative angular motion, normalization, point-down facing and explicit persisted spin; ten seconds/day. No implicit random initialization.' },
    { source: 'Explicit Web multiplayer policy, differs from BaseLocation.advance collection order',
      scope: 'Fixed tick, stable focus-first space-entity updates before fleet observation; no viewport/fast-advance branch. No moving fleet focus, entity velocity, custom orbit or fleet orbit support.' },
  ],
  methods: { validateWorld: validateOriginalOrbitalWorld, advance: advanceOriginalOrbitalWorld },
});
