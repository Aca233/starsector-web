import '../../src/engine/simulation/CombatEngine';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { ContrailEngine } from '../../src/engine/simulation/ContrailEngine';
import { Shield } from '../../src/engine/simulation/Shield';
import { createArmorDamageParticles } from '../../src/engine/visual/ArmorImpactVisuals';
import { Ship } from '../../src/engine/simulation/Ship';
import { bundledShipPacks } from '../../src/engine/modding/BundledShipPacks';
import { validateShipPack } from '../../src/engine/modding/ShipPackValidation';
import { decodeRustVisualFrame } from '../../src/engine/runtime/rust/RustVisualProtocol';
import type { CombatAudioEvent } from '../../src/engine/audio/CombatAudioEvents';
interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_run(): number; test_output_words(): number }
export async function checkRustNativeVisual(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, publications = 0, guards = 0;
  const geometric = /(?:\.(?:x|y|rotation|angleRad|facingRad|diameter|radius|maxRadius|shockwaveRadius|maxShockwaveRadius|size|startSize|endSize|length|u|currentWidth|width|accumU|maxSize)|\.segments\[|\.points\[.*\.(?:x|y))$/;
  const compare = (a: unknown, b: unknown, path = '') => {
    if (a === undefined && b === undefined) { strict++; return; }
    if (typeof a === 'number' && typeof b === 'number') {
      if (geometric.test(path)) { geometry++; const diff = Math.abs(a - b), bound = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b))); if (!Number.isFinite(a) || diff > bound) throw Error(`${path}: geometry ${a} / ${b}`); maximumDifference = Math.max(maximumDifference, diff); }
      else { strict++; if (!Object.is(a, b)) throw Error(`${path}: strict ${a} / ${b}`); } return;
    }
    if (Array.isArray(a) || ArrayBuffer.isView(a)) { if (!Array.isArray(b) && !ArrayBuffer.isView(b)) throw Error(path + ': array type'); const aa = Array.from(a as ArrayLike<unknown>), bb = Array.from(b as ArrayLike<unknown>); compare(aa.length, bb.length, path + '.count'); aa.forEach((v, i) => compare(v, bb[i], path + '[' + i + ']')); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { const ak = Object.keys(a), bk = Object.keys(b); compare(ak.length, bk.length, path + '.keys'); if (ak.some(k => !bk.includes(k))) throw Error(`${path}: fields ${ak} / ${bk}`); for (const key of ak) compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path + '.' + key); return; }
    strict++; if (a !== b) throw Error(`${path}: value ${a} / ${b}`);
  };
  const run = (values: number[]) => { const ptr = wasm.test_input(values.length); new Float64Array(wasm.memory.buffer, ptr, values.length).set(values); const output = wasm.test_run(); if (!output) throw Error('Native visual rejected'); return Array.from(new Float64Array(wasm.memory.buffer, output, wasm.test_output_words())); };
  const spec = validateShipPack(bundledShipPacks[0], false, bundledShipPacks).compiled[0], anchor = new Ship('root', spec, true, new Vector2(12, 51), .17, new SimulationRandom(13), new SimulationRandom(17));
  const random = new SimulationRandom(19733), fx = new CombatFXSystem(random), trail = new ContrailEngine();
  const shield = new Shield('OMNI', 270, 80, 1, 0); shield.isActive = true; shield.currentArcDeg = 270; shield.facingAngleRad = .17; shield.recordVisualHit(180, .37);
  fx.spawnSparks(new Vector2(80, 12), 7, [255, 180, 70]);
  fx.particles.push(...createArmorDamageParticles(new Vector2(30, 17), 76, random));
  fx.spawnDebris(new Vector2(16, 5), 5, [120, 110, 90], 80, 'small');
  fx.spawnAuthenticExplosion(new Vector2(20, 15), 28, [255, 155, 60], true, 'impact', undefined, 2);
  fx.spawnSourceMissileExplosion(new Vector2(70, 8), { radius: 32, color: [180, 120, 90, 255] });
  fx.hitGlows.push({ id: random.next(), pos: new Vector2(50, 12), vel: new Vector2(3, -2), diameter: 24, life: .24, maxLife: .24, peakAlpha: .4, color: [180, 150, 90] });
  fx.movingRayFades.push({ id: random.next(), headPos: new Vector2(50, 15), tailPos: new Vector2(15, 15), direction: new Vector2(1, 0), moveSpeed: 70, life: .8, maxLife: .8, elapsedTime: .3, maxPulseLength: 48, width: 7, textureType: 'SMOOTH', textureScrollSpeed: -180, pixelsPerTexel: 1.5, fringeColor: [180, 150, 90, 255], coreColor: [255, 255, 255, 255] });
  fx.shieldRipples.push({ pos: new Vector2(17, 6), radius: 8, maxRadius: 50, life: .28, maxLife: .28, color: [80, 200, 255] });
  fx.muzzleFlashes.push({ id: random.next(), underHullShipId: 'root', pos: new Vector2(50, 7), angleRad: .27, size: 25, color: [255, 140, 50], life: .1, maxLife: .1 });
  fx.spawnAuthenticMuzzleFlash({ length: 20, spread: 30, particleSizeMin: 2, particleSizeRange: 5, particleDuration: .4, particleCount: 5, particleColor: [255, 200, 100, 180] }, new Vector2(50, 7), .27, new Vector2(3, -2), 'root');
  fx.spawnLauncherSmoke({ particleSizeMin: 4, particleSizeRange: 8, cloudParticleCount: 4, cloudDuration: .8, cloudRadius: 7, blowbackParticleCount: 3, blowbackDuration: .6, blowbackLength: 20, blowbackSpread: 32, particleColor: [140, 135, 130, 160] }, new Vector2(57, 9), .37, new Vector2(3, -2));
  fx.spawnEmpArc(new Vector2(20, 17), new Vector2(260, 120), { coreColor: [255, 255, 255], glowColor: [130, 155, 145], thickness: 3, life: .3, branchCount: 3 });
  fx.spawnNativeEmpArc(new Vector2(17, 55), new Vector2(82, 63), anchor, 4, [130, 140, 255, 200], [255, 255, 255, 255]);
  fx.contrails.push({ pos: new Vector2(5, 50), vel: new Vector2(-10, 3), life: .45, maxLife: .5, size: 5, maxSize: 15, alpha: .45, rotation: .3, color: [255, 125, 25] });
  trail.addPoint(.75, new Vector2(30, 4), .4, 11, 2.4, 5, [200, 200, 205, 215]); trail.addPoint(.75, new Vector2(42, 6), .4, 11, 2.4, 5, [200, 200, 205, 215]);
  trail.addPoint('system🚀', new Vector2(25, 6), .7, 8, 2, 8, [130, 130, 135, 160], 'GLOW');
  const sequence = 4; let boost = 0, previousBoost = 0; const ghosts = [{ pos: anchor.pos.clone(), facingRad: .17, alpha: 1, life: 1, maxLife: 1 }];
  const audio: CombatAudioEvent[] = [{ kind: 'play', key: 'plasma_cannon_fire', volume: .85, rate: 1 }, { kind: 'play', key: 'shield_hit', volume: .45, rate: 1, position: [20, 17], listener: [12, 51], maxDistance: 2800 }, { kind: 'loop', key: 'flux_flush_loop', volume: .65, active: true }, { kind: 'muffled', value: true }];
  const check = (raw: number[], birth: boolean) => {
    publications++; compare(raw.slice(-3), random.checkpointWitness(), 'random'); const frame = decodeRustVisualFrame(raw.slice(0, -3));
    const emp = fx.empArcs.map(p => p.native ? { ...p, native: { ...p.native, anchor: { slot: 0, generation: 1 } } } : p);
    const visual = { particles: fx.particles, contrails: fx.contrails, debris: fx.debris, explosions: fx.explosions.map(p => { const value = { ...p }; if (value.sourceShipId === undefined) delete value.sourceShipId; return value; }), hitGlows: fx.hitGlows, movingRayFades: fx.movingRayFades, empArcs: emp, muzzleFlashes: fx.muzzleFlashes, muzzleParticles: fx.muzzleParticles, shieldRipples: fx.shieldRipples, trailStrips: Array.from(trail.getStrips()) };
    compare(frame.visuals, visual, 'visuals'); compare(frame.audio, { sequence, events: audio }, 'audio'); compare(frame.cameraShakeIntensity, 0, 'shake');
    compare(frame.ships, [{ handle: { slot: 0, generation: 1 }, engineBoostLevel: boost, previousEngineBoostLevel: previousBoost, phaseGhosts: ghosts, surfaceFeedback: birth ? { mode: 'WAITING', level: .35, progress: 0 } : undefined, shieldHitSegmentLevels: shield.presentationHitSegmentLevels() }], 'ships');
  };
  const initial = run([0]); check(initial, true);
  const advance = (dt: number, detached: boolean, active: boolean, phase: boolean) => {
    if (detached) trail.detach(.75); anchor.pos.addScaled(new Vector2(3, -2), dt); anchor.facingRad += .2 * dt;
    previousBoost = boost; boost = active ? Math.min(1, boost + dt * 2) : Math.max(0, boost - dt * 2);
    if (phase) { ghosts.unshift({ pos: anchor.pos.clone(), facingRad: anchor.facingRad, alpha: 1, life: 1, maxLife: 1 }); if (ghosts.length > 7) ghosts.pop(); } else ghosts.length = 0;
    shield.update(dt, anchor.facingRad, anchor.facingRad); trail.update(dt); fx.update(dt);
    check(run([1, dt, +detached, +active, +phase]), false);
  };
  run([2]); advance(.03, false, true, true); const firstContinuation = run([2]);
  // Saved authority restores independent arrays/RNG, then repeats one exact operation.
  const continuation = run([1, .04, 0, 1, 1]); run([3]); compare(run([1, .04, 0, 1, 1]), continuation, 'clone');
  run([3]); compare(run([2]), firstContinuation, 'restore'); advance(.04, false, true, true);
  for (const dt of [.09, .16, .12, .18, .24, .5, .8, 1.4]) advance(dt, true, false, dt < .2);
  for (const bad of [[], initial.slice(0, -4), [2, 0], [1, 1, 1, 15, 0, 0, ...Array(13).fill(1)]]) { try { decodeRustVisualFrame(bad); throw Error('accepted malformed FX'); } catch (e) { if (String(e).includes('accepted malformed')) throw e; guards++; } }
  return { passed: true, publications, strict, geometry, maximumDifference, guards, clone: 1, actualSourceFactories: true, productionIntegrated: false, fullBattleReady: false };
}
