/** Focused native 22-ship cold-start check, not the full network suite.
 * --bench adds candidate-only render read-set capture/decode timings.
 * No full-LAN comparison, compression/RTT/FPS claim, or 40% total gate.
 */
import assert from 'node:assert/strict';
import { nativeRecordRestorer } from '../src/network/NativeRecordRestore.generated';
import { LAN_WEAPON_NUMBERS } from '../src/network/display/FixedDisplayRecords';
import { captureAuthorityCombat } from '../src/network/HostSnapshot';
import { captureCombat, applyCombatSnapshots } from '../src/network/AuthorityCombatSnapshot';
import { encodeProjectedBinaryFrame, decodeBinaryFrame, encodeProjectedSnapshotTape, decodeBinaryState, encodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { SnapshotTapeWriter } from '../src/network/SnapshotTape.mjs';
import { summarizeCombatFrame } from '../src/network/CombatFrameSummary.mjs';
import { deflateRawSync } from 'node:zlib';

import { encode, decode } from '@msgpack/msgpack';
import fs from 'node:fs';
import { assets, world } from './lib/native-projectile-fixture.mts';
import { ShipDisplayEncoder, ShipDisplayDecoder } from '../src/network/display/ShipDisplayLane';
import * as layout from '../src/network/display/ShipDisplayLayout';
import { Ship } from '../src/engine/simulation/Ship';
import { Vector2 } from '../src/engine/math/Vector2';
import { ProjectedRenderShip, renderWeaponRange, renderWeaponAngle, renderPulseOffset } from '../src/engine/runtime/local/RenderShipProjection';

// Deliberately audited against ShipRenderState.ts, not the transport schema.
const fields = {
  ship: ['id','spec','pos','prevPos','vel','facingRad','prevFacingRad','angularVelRad','hullHp','maxHullHp','isDead','isDocked','isRetreated','isAttachedModule','teamId','playerTargetId','visibilityMask','visibilityOverflow','phaseGhosts','phaseVisualAlpha','engineBoostLevel','prevEngineBoostLevel','scorchMarks','scorchMarkVersion','selectedGroupIndex'],
  shield: ['facingAngleRad','hitSegmentLevels','isPhaseEngaged','isVisuallyDeployed','phaseCooldownLevel','phaseEffectLevel','phaseState','radius','renderArcRad','type','visualAlpha'],
  flux: ['fluxPercent','hardFlux','hullSize','isOverloaded','isVenting','maxFlux','overloadTimer'],
  system: ['activationSerial','available','disabled','effectLevel','fortressVisualLevel','isActive','state','teleportVisual','type'],
  weapon: ['arcDeg','baseAngleDeg','currentAngleRad','currentSpreadDeg','glowAlpha','isDisabled','mountType','recoil','relativePos','slotId'],
  engine: ['prevThrust','currentThrust','prevSpread','spread'],
  weaponSpec: ['id','spawnType','isRocket','isBeam','hardpointUsesHullSprite','turretSpriteUrl','hardpointSpriteUrl','hardpointGunSpriteUrl','turretGunSpriteUrl','glowSpriteUrl','hardpointGlowSpriteUrl','mountSize','visualRecoil','renderBarrelBelow','weaponType','glowColor','animationType','projSpeed','projSpriteUrl','beamEffect','onHitEffect','everyFrameEffect'],
  child: ['onHitEffect','turretSpriteUrl','turretGunSpriteUrl','hardpointSpriteUrl','hardpointGunSpriteUrl','glowSpriteUrl','hardpointGlowSpriteUrl','projSpriteUrl'],
};
const pick = (value: any, keys: readonly string[]) => Object.fromEntries(keys.map(key => [key, value[key]]));
function normalized(value: any, seen = new Set<object>()): any {
  if (value === null || typeof value !== 'object') return value;
  assert.ok(!seen.has(value), 'Unexpected cycle in renderer values');
  seen.add(value);
  let result: any;
  if (ArrayBuffer.isView(value)) result = Array.from(value as any);
  else if (Array.isArray(value)) result = value.map(x => normalized(x, seen));
  else result = Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key], seen)]));
  seen.delete(value);
  return result;
}
function specRead(spec: any): any {
  return { ...pick(spec, fields.weaponSpec), mirv: spec.mirv ? {
    childProjectile: spec.mirv.childProjectile ? pick(spec.mirv.childProjectile, fields.child) : spec.mirv.childProjectile,
  } : spec.mirv };
}
function systemRead(system: any): any {
  return { ...pick(system, fields.system), definition: { visuals: system.definition.visuals }, pulseOffset: renderPulseOffset(system) };
}
function shipRead(ship: any): any {
  return normalized({
    ...pick(ship, fields.ship),
    shield: pick(ship.shield, fields.shield), flux: pick(ship.flux, fields.flux),
    armor: { cellWidth: ship.armor.cellWidth },
    engineController: { flameAccelerating: ship.engineController.flameAccelerating },
    engineStatuses: ship.engineStatuses.map((engine: any) => pick(engine, fields.engine)),
    weapons: ship.weapons.map((weapon: any) => ({ ...pick(weapon, fields.weapon), spec: specRead(weapon.spec),
      range: renderWeaponRange(ship, weapon), angles: [ship.facingRad, -0.75, 2.5].map(facing => renderWeaponAngle(weapon, facing)),
    })),
    weaponGroups: ship.weaponGroups, system: systemRead(ship.system), allSystems: ship.allSystems.map(systemRead),
    sourceCarrier: ship.sourceCarrier?.id,
    poses: [0, 0.3, 1].map(alpha => [ship.interpolatedPos(alpha), ship.interpolatedFacing(alpha),
      ship.getShieldCenter(ship.interpolatedPos(alpha), ship.interpolatedFacing(alpha))]),
    defaultShieldCenter: ship.getShieldCenter(), explicitShieldCenter: ship.getShieldCenter(new Vector2(71, -13), 0.7),
    visible: [true, false, 0, 1, 2, 30, 31, 40, 77].map(side => ship.isVisibleTo(side)),
  });
}
function checkDeclaredFields(): void {
  const source = fs.readFileSync('src/engine/render/ShipRenderState.ts', 'utf8');
  const aliases: Record<string, keyof typeof fields> = { ShipRenderState: 'ship', RenderShield: 'shield', RenderFlux: 'flux', RenderSystem: 'system', RenderWeapon: 'weapon', RenderEngineStatus: 'engine', RenderWeaponSpec: 'weaponSpec' };
  for (const [name, key] of Object.entries(aliases)) {
    const declaration = source.match(new RegExp('(?:type|interface) ' + name + '\\b[^\\n]+'))?.[0];
    assert.ok(declaration, `Missing declaration ${name}`);
    // Pick's source type can itself contain quoted indexed-access keys.
    const union = declaration.match(/,\s*((?:'[^']+'\s*\|?\s*)+)>/);
    assert.ok(union, `Cannot audit ${name}; update the checker for a changed type declaration`);
    const actual = [...union[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
    assert.deepEqual([...fields[key]].sort(), actual, `Read-set drift: ${name}`);
  }
  const interfaceBody = source.match(/export interface ShipRenderState[^\n]+\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(interfaceBody, 'Missing ShipRenderState body');
  const additional = [...interfaceBody.matchAll(/readonly\s+(\w+)\??:/g)].map(match => match[1]).sort();
  assert.deepEqual(additional, ['shield','flux','armor','engineController','engineStatuses','weapons','weaponGroups','system','allSystems','sourceCarrier','interpolatedPos','interpolatedFacing','getShieldCenter','isVisibleTo'].sort());
}
function checkGetters(target: any, keys: readonly string[]): void {
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    assert.equal(typeof descriptor?.get, 'function', `Direct accessor required: ${key}`);
    assert.equal(descriptor?.set, undefined, `Display field must be read-only: ${key}`);
    assert.equal(Object.hasOwn(descriptor!, 'value'), false, `No copied scalar slot: ${key}`);
  }
}

function rewritePacket(input: ArrayBuffer, change: (meta: any, values: Float64Array) => void): ArrayBuffer {
 const header = new DataView(input), length = header.getUint32(12, true), start = (40 + length + 7) & ~7;
 const meta = decode(new Uint8Array(input, 40, length)), values = new Float64Array(input.slice(start));
 change(meta, values);
 const bytes = encode(meta), nextStart = (40 + bytes.length + 7) & ~7;
 const output = new ArrayBuffer(nextStart + values.byteLength);
 new Uint8Array(output, 0, 40).set(new Uint8Array(input, 0, 40)); new DataView(output).setUint32(12, bytes.length, true);
 new Uint8Array(output, 40, bytes.length).set(bytes); new Float64Array(output, nextStart).set(values);
 return output;
}

const report: any = {
  scope: 'Native 22-ship cold-start renderer read-set only; not full LAN or a 40% total-performance gate',
  passed: [], failures: [],
  notCovered: ['active phase/teleport/pulse fixtures', 'paired baseline performance (separate benchmark script)', 'real WebGL image, actual prediction-controller replay and multi-machine network latency' ],
};
function check(name: string, run: () => void): void {
  try { run(); report.passed.push(name); console.log('PASS', name); }
  catch (error: any) { report.failures.push({ name, message: error?.message ?? String(error) }); console.error('FAIL', name, String(error?.message ?? error).slice(0, 3500)); }
}
try {
  check('ShipRenderState declaration/read-set coverage', checkDeclaredFields);
  await assets();
  const engine = world(22);
  const roots = [...engine.allCapitalShips];
  assert.equal(roots.length, 22, 'Native fixture must actually have 22 ships');
  report.ships = roots.length;
  report.weapons = roots.reduce((n, ship) => n + ship.weapons.length, 0);
  report.engines = roots.reduce((n, ship) => n + ship.engineStatuses.length, 0);
  // Lazy shield hit geometry is initialized by authority reads before capture.
  const expected = roots.map(shipRead);
  const encoder = new ShipDisplayEncoder(1), decoder = new ShipDisplayDecoder();
  let packet: ArrayBuffer | null = null, frame: ReturnType<ShipDisplayDecoder['decode']> | undefined;
  check('native 22-ship cold capture(reset=true) and decode', () => {
    const start = performance.now(); packet = encoder.capture(roots, 0, true);
    report.coldCaptureMs = performance.now() - start;
    assert.ok(packet, 'Native fixture unexpectedly fell back');
    const decodeStart = performance.now(); frame = decoder.decode(packet);
    report.coldDecodeMs = performance.now() - decodeStart;
    assert.equal(frame.epoch, 1); assert.equal(frame.tick, 0); assert.equal(decoder.lastTick, 0);
    assert.equal(frame.bytes, packet.byteLength); assert.equal(frame.ships.length, 22);
    report.bytes = packet.byteLength;
  });
  if (frame && packet) {
    check('all cold renderer values plus Range/Angle/PulseOffset and ship queries', () => {
      for (let i = 0; i < roots.length; i++) assert.deepEqual(shipRead(frame!.ships[i]), expected[i], `Ship ${i}: ${roots[i].id}`);
      assert.deepEqual(roots.map(shipRead), expected, 'Capture/decode must not mutate authority display values');
    });
    check('display-only facade and direct scalar/vector/component getters', () => {
      assert.equal(Object.getOwnPropertyDescriptor(frame!.ships[0], 'hullHp')!.get,
        Object.getOwnPropertyDescriptor(frame!.ships[1], 'hullHp')!.get, 'Fixed schema accessors must be shared');
      for (const ship of frame!.ships) {
        assert.ok(ship instanceof ProjectedRenderShip); assert.ok(!(ship instanceof Ship));
        for (const method of ['update','applyDamage','takeDamage','advance','reset']) assert.equal(typeof (ship as any)[method], 'undefined');
        checkGetters(ship, [...layout.SHIP_NUMBERS, ...layout.SHIP_BOOLEANS]);
        for (const vector of [ship.pos, ship.prevPos, ship.vel]) checkGetters(vector, ['x','y']);
        checkGetters(ship.shield, [...layout.SHIELD_NUMBERS, ...layout.SHIELD_BOOLEANS]);
        checkGetters(ship.flux, [...layout.FLUX_NUMBERS, ...layout.FLUX_BOOLEANS]);
        for (const system of ship.allSystems) checkGetters(system, [...layout.SYSTEM_NUMBERS, ...layout.SYSTEM_BOOLEANS]);
        for (const weapon of ship.weapons) { checkGetters(weapon, [...layout.WEAPON_NUMBERS, ...layout.WEAPON_BOOLEANS]); checkGetters(weapon.relativePos, ['x','y']); }
        for (const engine of ship.engineStatuses) checkGetters(engine, layout.ENGINE_NUMBERS);
      }
    });
    check('caller packet mutation cannot alter decoded display values', () => {
      const before = frame!.ships.map(shipRead); new Uint8Array(packet!).fill(0xa5);
      assert.deepEqual(frame!.ships.map(shipRead), before); assert.equal(decoder.lastTick, 0);
    });
    if (report.failures.length === 0) check('ACK only after successful read-set validation', () => {
      assert.equal(encoder.acknowledge(0), true); assert.equal(encoder.acknowledge(0), false); assert.equal(encoder.acknowledge(99), false);
    });

    check('live identities survive frame swaps and dropped presentation frames', () => {
      const ship = frame!.ships[0], position = ship.pos, weapon = ship.weapons[0];
      roots[0].pos.x += 17; roots[0].weapons[0].currentAngleRad += .125;
      frame = decoder.decode(encoder.capture(roots, 1)!);
      assert.equal(frame.ships[0], ship); assert.equal(ship.pos, position); assert.equal(ship.weapons[0], weapon);
      assert.deepEqual(frame.ships.map(shipRead), roots.map(shipRead));
      encoder.capture(roots, 2); // Intentionally never decoded or acknowledged.
      roots[0].pos.y -= 9;
      frame = decoder.decode(encoder.capture(roots, 3)!);
      assert.deepEqual(frame.ships.map(shipRead), roots.map(shipRead)); assert.equal(encoder.acknowledge(3), true);
    });
    check('changed definitions repeat until validated ACK; cold reset is self-contained', () => {
      roots[0].weapons[0].spec = { ...roots[0].weapons[0].spec, glowColor: [17, 23, 31] };
      const skipped = encoder.capture(roots, 4)!; assert.ok(skipped.byteLength > 0);
      frame = decoder.decode(encoder.capture(roots, 5)!);
      assert.deepEqual(frame.ships.map(shipRead), roots.map(shipRead)); assert.equal(encoder.acknowledge(5), true);
      const reset = encoder.capture(roots, 6, true)!;
      assert.deepEqual(new ShipDisplayDecoder().decode(reset).ships.map(shipRead), roots.map(shipRead));
      frame = decoder.decode(reset); assert.equal(encoder.acknowledge(6), true);
    });
    check('reused ship IDs start a new facade lifetime; carrier references target display objects', () => {
      const prior = frame!.ships[0], source = roots[0];
      roots[0] = new Ship(source.id, source.spec, source.isPlayer, new Vector2(51, -19), .3);
      roots[1].sourceCarrier = roots[0];
      frame = decoder.decode(encoder.capture(roots, 7)!);
      assert.notEqual(frame.ships[0], prior); assert.equal(frame.ships[0].id, prior.id);
      assert.equal(frame.ships[1].sourceCarrier, frame.ships[0]); assert.notEqual(frame.ships[1].sourceCarrier, roots[0]);
      assert.deepEqual(frame.ships.map(shipRead), roots.map(shipRead)); encoder.acknowledge(7);
    });
    check('malformed packets reject atomically before binding live records', () => {
      const valid = encoder.capture(roots, 8)!, before = frame!.ships.map(shipRead), identity = frame!.ships[0];
      const badMagic = valid.slice(0); new DataView(badMagic).setUint32(0, 0, true);
      const badPackets = [badMagic, valid.slice(0, valid.byteLength - 1),
        rewritePacket(valid, meta => { meta.ships[0].at = 9999999; }),
        rewritePacket(valid, (meta, values) => { values[meta.ships[0].at + layout.SHIP_NUMBERS.length] = .5; }),
        rewritePacket(valid, meta => { meta.ships[0].definition = 0; }),
        rewritePacket(valid, meta => { meta.ships[0].carrier = 9999999; }),
        rewritePacket(valid, meta => { meta.ships[1].life = meta.ships[0].life; }),
        rewritePacket(valid, meta => { meta.ships[0].extra = [4, [['__proto__', [4, []]]]]; }),
      ];
      for (const bad of badPackets) {
        assert.throws(() => decoder.decode(bad)); assert.equal(decoder.lastTick, 7);
        assert.equal(frame!.ships[0], identity); assert.deepEqual(frame!.ships.map(shipRead), before);
      }
      frame = decoder.decode(valid); assert.equal(decoder.lastTick, 8); assert.deepEqual(frame.ships.map(shipRead), roots.map(shipRead));
      assert.throws(() => decoder.decode(valid)); assert.equal(decoder.lastTick, 8);
    });

    check('actual LAN capture / binary decode / apply: fixed hot fields replace legacy leaves', () => {
      const source = world(22), baseline = world(22), candidate = world(22);
      const options = { nativeTargeting: true, nativeProjection: true };
      const capture = (tick: number, fixed: boolean) => captureAuthorityCombat(source, tick, { 0: tick }, 0, null, false, true, false, fixed);
      const restore = (receiver: ReturnType<typeof world>, frame: any, reset = false) => applyCombatSnapshots(receiver, [frame], reset, undefined, options);
      const apply = (receiver: ReturnType<typeof world>, frame: any, reset = false) => restore(receiver, decodeBinaryFrame(encodeProjectedBinaryFrame(frame, true)), reset);
      const compare = () => {
        assert.deepEqual(candidate.allCapitalShips.map(shipRead), baseline.allCapitalShips.map(shipRead));
        // Includes the HUD/control/armor/world fields, not only candidate schema keys.
        const a = captureCombat(baseline, 0, {0: 0}, 0), b = captureCombat(candidate, 0, {0: 0}, 0);
        assert.deepEqual(normalized(b), normalized(a), 'Whole replica presentation changed');
      };
      assert.equal(captureAuthorityCombat(source, 0, {0:0}, 0, null).fixedDisplay, undefined, 'Regressed CPU path must remain opt-in');
      const old = capture(0, false), fresh = capture(0, true);
      assert.ok(fresh.fixedDisplay && fresh.fixedDisplay.values.length > 0);
      assert.ok(fresh.layouts!.every(keys => !keys.includes('currentAngleRad') && !keys.includes('prevThrust')), 'Hot values remain in recursive dictionaries');
      for (const keys of fresh.layouts!) if (keys[0] === 'slotId') assert.ok(nativeRecordRestorer(keys), 'Fixed residual layout lost native restore path: ' + JSON.stringify(keys));
      const wire = encodeProjectedBinaryFrame(fresh, true);
      const decoded = decodeBinaryFrame(wire);
      apply(baseline, decodeBinaryFrame(encodeProjectedBinaryFrame(old, true)), true);
      apply(candidate, decoded, true); compare();
      for (const ship of source.allCapitalShips) for (const mount of ship.weapons) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(mount, 'currentAngleRad')!, 'value'), 'Authority was instrumented');
      const mount = candidate.playerShip.weapons[0], nativeMount = source.playerShip.weapons[0];
      assert.equal(typeof Object.getOwnPropertyDescriptor(mount, 'currentAngleRad')?.get, 'function');
      assert.equal(Object.getOwnPropertyDescriptor(mount, 'currentAngleRad')!.get,
        Object.getOwnPropertyDescriptor(candidate.playerShip.weapons[1], 'currentAngleRad')!.get);
      const originalDisabled = mount.isDisabled;
      assert.throws(() => { (mount as any).isDisabled = .5; }, /Invalid display prediction flag/);
      assert.equal(mount.isDisabled, originalDisabled);
      // Critical/fire/turret presentation writes remain legal and cannot mutate received bytes.
      const authorityAngle = mount.currentAngleRad;
      mount.currentAngleRad = authorityAngle + .25; mount.recoil = .6; mount.glowAlpha = .75; mount.isDisabled = true;
      assert.equal(mount.currentAngleRad, authorityAngle + .25); assert.equal(nativeMount.currentAngleRad, authorityAngle);
      new Uint8Array(wire.buffer, wire.byteOffset, wire.byteLength).fill(0);
      assert.equal(mount.currentAngleRad, authorityAngle + .25);
      for (let tick = 1; tick <= 3; tick++) source.fixedUpdate(1 / 60);
      const skipped = capture(3, true); // No intermediate snapshots required.
      apply(baseline, capture(3, false)); apply(candidate, skipped); compare();
      assert.equal(candidate.playerShip.weapons[0], mount, 'Stable mount identity');
      assert.equal(mount.currentAngleRad, nativeMount.currentAngleRad, 'Prediction overlay was not cleared');
      // JSON and helper-worker tape are deployed compatibility paths too.
      apply(candidate, JSON.parse(JSON.stringify(capture(4, true)))); apply(baseline, capture(4, false)); compare();
      const tape = new SnapshotTapeWriter().encode(capture(5, true)); assert.ok(tape);
      const encodedTape = encodeProjectedSnapshotTape(tape); assert.ok(encodedTape);
      apply(candidate, decodeBinaryFrame(encodedTape.bytes)); apply(baseline, capture(5, false)); compare();
      const joined = world(22); apply(joined, capture(6, true), true);
      assert.deepEqual(joined.allCapitalShips.map(shipRead), baseline.allCapitalShips.map(shipRead));
      // Old packets remain usable on an already bound replica.
      apply(candidate, capture(7, false)); apply(baseline, capture(7, false)); compare();
      const final = capture(8, true);
      assert.deepEqual(summarizeCombatFrame(final, 22, -1), summarizeCombatFrame(capture(8, false), 22, -1));
      const network = encodeBinaryState('fixed-display', 8, encodeProjectedBinaryFrame(final, true));
      assert.ok(network); apply(candidate, decodeBinaryState(network).frame); compare();
      const findMarker = (value: any, wanted?: number): any => {
        if (!value || typeof value !== 'object') return undefined;
        const tuple = value.$ds ?? value.$d;
        if (tuple && (!wanted || tuple[0] === wanted)) return tuple;
        for (const child of Object.values(value)) { const found = findMarker(child, wanted); if (found) return found; }
      };
      const malformed = JSON.parse(JSON.stringify(final)); findMarker(malformed)[1] = 1e9;
      assert.throws(() => apply(world(22), malformed), /Invalid fixed display/);
      const badFlag = JSON.parse(JSON.stringify(final)); badFlag.fixedDisplay.values[findMarker(badFlag, 1)[1] + LAN_WEAPON_NUMBERS.length] = .5;
      assert.throws(() => apply(world(22), badFlag), /Invalid fixed display/);
      assert.throws(() => apply(world(22), {...final, fixedDisplay: {...final.fixedDisplay, version: 2}}), /Invalid fixed display/);
      report.lanIntegration = {ships: 22, fixedValues: final.fixedDisplay!.values.length, paths: ['authority capture','SWF3 binary','relay state envelope','JSON','encoder helper tape','normal apply','cold join','skipped endpoints','prediction writes','legacy fallback'], oldBinaryBytes: encodeProjectedBinaryFrame(capture(8, false), true).byteLength, fixedBinaryBytes: encodeProjectedBinaryFrame(final, true).byteLength};

      if (process.argv.includes('--lan-bench')) {
        const samples: any[] = [];
        const run = (tick: number, fixed: boolean) => {
          const started = performance.now(), frame = capture(tick, fixed), captured = performance.now();
          const packet = encodeProjectedBinaryFrame(frame, true), encoded = performance.now();
          const received = decodeBinaryFrame(packet), parsed = performance.now();
          restore(fixed ? candidate : baseline, received); const applied = performance.now();
          return {fixed, capture: captured-started, encode:encoded-captured, decode:parsed-encoded, apply:applied-parsed, total:applied-started, bytes:packet.byteLength, deflateBytes:deflateRawSync(packet).byteLength};
        };
        for (let tick = 9; tick < 49; tick++) {
          source.fixedUpdate(1 / 60);
          // ABBA order, paired exact same authority state; warm up both arms.
          for (const fixed of tick % 2 ? [false,true,true,false] : [true,false,false,true]) {
            const result = run(tick, fixed); if (tick >= 25) samples.push(result);
          }
          if (tick === 24 || tick === 48) compare();
        }
        const stats = (values: number[]) => { const sorted = [...values].sort((a,b)=>a-b); return {p50:sorted[Math.floor((sorted.length-1)*.5)],p95:sorted[Math.floor((sorted.length-1)*.95)]}; };
        report.lanBenchmark = {scope:'Native 22-ship actual authority capture + SWF3 encode + decode + one replica apply; headless CPU only, not FPS/RTT. Deflate is full-packet diagnostic, not negotiated anchor/delta traffic.', samplesPerArm: samples.length / 2,
          baseline:Object.fromEntries(['capture','encode','decode','apply','total','bytes','deflateBytes'].map(key=>[key,stats(samples.filter(s=>!s.fixed).map(s=>s[key]))])),
          fixed:Object.fromEntries(['capture','encode','decode','apply','total','bytes','deflateBytes'].map(key=>[key,stats(samples.filter(s=>s.fixed).map(s=>s[key]))]))};
      }
    });

    if (process.argv.includes('--bench') && report.failures.length === 0) {
      const warmup = 10, samples = 30, captureMs: number[] = [], decodeMs: number[] = [], bytes: number[] = [];
      for (let tick = 9; tick < 9 + warmup + samples; tick++) {
        const start = performance.now(), next = encoder.capture(roots, tick)!;
        const middle = performance.now(); const decoded = decoder.decode(next); const end = performance.now();
        assert.equal(decoded.ships.length, roots.length); encoder.acknowledge(tick);
        if (tick >= 9 + warmup) { captureMs.push(middle - start); decodeMs.push(end - middle); bytes.push(next.byteLength); }
      }
      const stats = (values: number[]) => { const sorted = [...values].sort((a,b) => a-b); return { p50: sorted[Math.floor((sorted.length-1)*.5)], p95: sorted[Math.floor((sorted.length-1)*.95)] }; };
      report.benchmark = { scope: 'Candidate-only stationary 22-ship render read-set capture/decode. No full-world baseline, paired comparison, percentages, LAN/40% gate, RTT or FPS claim.', warmup, samples, captureMs: stats(captureMs), decodeMs: stats(decodeMs), meanBytes: bytes.reduce((a,b) => a+b,0)/samples };
    }
  }
} catch (error: any) {
  report.failures.push({ name: 'fixture/setup', message: error?.message ?? String(error) });
}
console.log('SHIP_DISPLAY_RESULT', JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
