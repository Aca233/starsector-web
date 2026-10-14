import '../../src/engine/simulation/CombatEngine';
import { bundledShipPacks } from '../../src/engine/modding/BundledShipPacks';
import { validateShipPack } from '../../src/engine/modding/ShipPackValidation';
import { compileRustContent } from '../../src/engine/runtime/rust/RustContentCompiler';
import { installRustCombat } from '../../src/engine/runtime/rust/RustCombatInstall';
import { decodeRustOrdnanceFacts } from '../../src/engine/runtime/rust/RustOrdnanceFacts';
import { rustPresentationOrdnance } from '../../src/engine/runtime/rust/RustCombatPresentationOrdnance';
import type { RustPresentationFacts } from '../../src/engine/runtime/rust/RustCombatPresentationFacts';
import { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';
import { Ship } from '../../src/engine/simulation/Ship';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { ContrailEngine } from '../../src/engine/simulation/ContrailEngine';
import { MineSystem } from '../../src/engine/simulation/systems/MineSystem';
import { spawnSystemProjectile } from '../../src/engine/extensions/ship-systems/SystemProjectile';
import { HYPERION_PROJECTILE_ID, HYPERION_YAMATO_ID } from '../../src/engine/content/HyperionIds';
import { WeaponSimulationSystem } from '../../src/engine/simulation/systems/WeaponSimulationSystem';
import { captureCombatAudio, type CombatAudioEvent } from '../../src/engine/audio/CombatAudioEvents';
import { clearEffectState } from '../../src/engine/extensions/EffectState';
import { deploymentCost } from '../../src/engine/simulation/CombatDeployment';
import type { WeaponMount, Projectile, Beam, MuzzleFlashSpec, LauncherSmokeSpec } from '../../src/engine/simulation/Weapon';
interface Oracle extends WebAssembly.Exports { memory: WebAssembly.Memory; test_fire(id: number, owner: number, dt: number): number; test_motion(id: number, dt: number): number; test_reset_mounts(id: number): number; test_generated(id: number, kind: number): number; test_ordnance(id: number): number; test_ordnance_len(id: number): number }
interface SourceMethods {
  requestWeaponFire(m: WeaponMount, s: Ship, p: (p: Projectile) => void, b: (b: Beam) => void, flash: Flash): boolean;
  advanceWeaponLifecycle(dt: number, m: WeaponMount, s: Ship, can: boolean, p: (p: Projectile) => void, b: (b: Beam) => void, flash: Flash): void;
}
type Flash = (p: Vector2, angle: number, size: number, color: [number, number, number], spec?: MuzzleFlashSpec, velocity?: Vector2, smoke?: LauncherSmokeSpec, owner?: string) => void;
export async function checkRustNativeOrdnance(wasm: BufferSource) {
  let strict = 0, geometry = 0, maximumDifference = 0, publications = 0, guards = 0, projectileBirths = 0, beamBirths = 0;
  const compare = (a: unknown, b: unknown, path: string): void => {
    if (typeof a === 'number' && typeof b === 'number') { if (/\.(x|y|facingRad|angleRad|sourceMoveSpeed|movingRayMoveSpeed|turnVelocityRad)$/.test(path)) { geometry++; const difference = Math.abs(a - b); if (difference > Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)))) throw Error(`${path}: geometry ${a} / ${b}`); maximumDifference = Math.max(maximumDifference, difference); } else { strict++; if (!Object.is(a, b)) throw Error(`${path}: ${a} / ${b}`); } return; }
    if (Array.isArray(a) || ArrayBuffer.isView(a)) { if (!Array.isArray(b) && !ArrayBuffer.isView(b)) throw Error(path + ': array type'); const aa = Array.from(a as ArrayLike<unknown>), bb = Array.from(b as ArrayLike<unknown>); compare(aa.length, bb.length, path + '.count'); aa.forEach((v, i) => compare(v, bb[i], `${path}[${i}]`)); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { const aa = Object.keys(a), bb = Object.keys(b); if (aa.length !== bb.length || aa.some(k => !bb.includes(k))) throw Error(`${path}: keys ${aa} / ${bb}`); strict++; for (const k of aa) compare((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k); return; }
    strict++; if (a !== b) throw Error(path + ': value differs');
  };
  const cases: { pack: string; actors: number; publications: number }[] = [];
  for (const pack of bundledShipPacks) {
    const spec = validateShipPack(pack, false, bundledShipPacks).compiled[0], seed = 733, visualSeed = (seed ^ 0x9e3779b9) >>> 0;
    const content = compileRustContent({ ships: [{ stableId: 'player', spec, team: 0, player: true, position: [12, 51], facing: .17, velocity: [3, -2] }, { stableId: 'enemy', spec, team: 1, player: false, position: [1012, 1000051], facing: 2.17, velocity: [-2, 3] }], seed, initializeWings: false });
    const random = new SimulationRandom(seed), visualRandom = new SimulationRandom(visualSeed);
    const player = new Ship('player', spec, true, new Vector2(12, 51), .17, random, visualRandom), enemy = new Ship('enemy', spec, false, new Vector2(1012, 1000051), 2.17, random, visualRandom); player.vel.set(3, -2); enemy.vel.set(-2, 3); enemy.teamId = 1; for (const s of enemy.assemblyShips) s.teamId = 1;
    const all = [...player.assemblyShips, ...enemy.assemblyShips], fx = new CombatFXSystem(visualRandom), weapons = new WeaponSimulationSystem(), contrails = new ContrailEngine(), mines = new MineSystem(random, visualRandom);
    const core = await RustCombatCore.create(wasm, seed), internals = core as unknown as { exports: Oracle; id: number }, native = internals.exports;
    const p = content.entities[0], e = content.entities.find(s => s.stableId === 'enemy')!;
    try {
      installRustCombat(core, content, { playerId: p.id, enemyId: e.id, asteroids: false, scene: { enemy: e.handle, enabled: false, limit: 9999, simulation: false, simulationLimit: 9999, primaryEnemyDeployed: true, multiTeam: false, open: false, autopilot: false, commandRate: 0, manualWeapon: p.handle, aiProfile: 'standard', multirate: false,
        roots: [p, e].map((r, i) => ({ handle: r.handle, cost: deploymentCost([player, enemy][i].spec), pending: false, station: [player, enemy][i].isStation, radius: [player, enemy][i].deploymentRadius })), automaticTeams: [], externallyControlled: [], fullRate: [] } });
      core.acknowledgeAudio(core.scenePublication().visual.audio.sequence);
      // Standalone source fixture performs the actual opening-radio allocation
      // that the complete native installer commits after restoring ctor RNG.
      visualRandom.nextNumericId();
      const audio: CombatAudioEvent[] = [], onProjectile = (p: Projectile) => weapons.projectiles.push(p);
      const onBeam = (b: Beam) => { const old = weapons.beams.find(e => e.sourceShipId === b.sourceShipId && e.slotId === b.slotId); if (!old) { weapons.beams.push(b); return; }
        const isNewCycle = b.firingCycleId !== undefined && old.firingCycleId !== b.firingCycleId;
        old.damagePerSec = b.damagePerSec; old.baseDamagePerSec = b.baseDamagePerSec;
        if (isNewCycle) { old.elapsedTime = 0; clearEffectState(old); old.elapsedSinceDamage = undefined; old.accumulatedBrightness = 0; old.dpsDuration = 0; old.damageMultiplier = 0; old.rayEndPrevFrame = undefined; old.startPos.copy(b.startPos); old.endPos.copy(b.endPos); old.hitGlowBrightness = 0; old.hitGlowSizeMult = 1; old.scaleGlowBasedOnDamageEffectiveness = b.scaleGlowBasedOnDamageEffectiveness ?? true; old.wasShortened = false; old.contactSurface = undefined; old.contactFxCooldown = old.contactSoundCooldown = 0; }
        for (const key of ['duration', 'maxDuration', 'barrelOffset', 'color', 'fringeColor', 'coreColor', 'glowColor', 'width', 'visualMode', 'textureType', 'textureScrollSpeed', 'pixelsPerTexel', 'hitGlowRadius', 'hitGlowBrightenDuration', 'useGlowColorForHitGlow', 'fringeScrollSpeedMult', 'coreWidthMult', 'darkCore', 'darkFringeIter', 'darkCoreIter', 'beamEffect', 'empPerSec', 'baseEmpPerSec', 'damageActive', 'firingCycleId'] as const) (old as unknown as Record<string, unknown>)[key] = b[key]; if (isNewCycle) old.hasRecordedHit = false;
      };
      const flash: Flash = (pos, angle, size, color, spec, vel, smoke, owner) => { if (smoke) fx.spawnLauncherSmoke(smoke, pos, angle, vel ?? new Vector2(), owner); else if (spec) fx.spawnAuthenticMuzzleFlash(spec, pos, angle, vel ?? new Vector2(), owner); else fx.muzzleFlashes.push({ id: visualRandom.next(), pos: pos.clone(), angleRad: angle, size, color, life: .1, maxLife: .1, ...(owner === undefined ? {} : { underHullShipId: owner }) }); };
      const stop = captureCombatAudio(event => audio.push(event));
      const publication = (label: string) => {
        const snapshot = core.snapshot(), scene = core.scenePublication(), ptr = native.test_ordnance(internals.id); if (!ptr) throw Error(label + ': native ordnance rejected');
        const words = Array.from(new Float64Array(native.memory.buffer, ptr, native.test_ordnance_len(internals.id))), facts = decodeRustOrdnanceFacts(words, content, snapshot, scene.ships);
        const names = new Map(scene.ships.map(s => [s.id, s.stableId])), handleName = (h: { slot: number; generation: number }) => { const s = scene.ships.find(s => s.handle.slot === h.slot && s.handle.generation === h.generation); if (!s) throw Error('Unknown oracle handle'); return s.stableId; };
        const projected = rustPresentationOrdnance(snapshot, { ordnance: facts.ordnance } as RustPresentationFacts, key => content.dictionary.weapons.find(w => w.key === key)!.spec, id => names.get(id)!, handleName);
        compare(projected.projectiles.length, weapons.projectiles.length, label + '.projectiles.count');
        projected.projectiles.forEach((p, i) => { try { compare(p, weapons.projectiles[i], `${label}.projectiles[${i}:${p.specId}]`); } catch (error) { throw Error(String(error) + ' actual ' + JSON.stringify(p) + ' expected ' + JSON.stringify(weapons.projectiles[i])); } });
        compare(projected.beams, weapons.beams, label + '.beams'); compare(snapshot.random, random.checkpointWitness(), label + '.random'); compare(snapshot.visualRandom, visualRandom.checkpointWitness(), label + '.visualRandom');
        compare(scene.visual.audio.events, audio, label + '.audio'); compare(scene.visual.visuals.muzzleFlashes, fx.muzzleFlashes, label + '.muzzles'); compare(scene.visual.visuals.muzzleParticles, fx.muzzleParticles, label + '.muzzleParticles'); compare(scene.visual.visuals.particles, fx.particles, label + '.particles'); publications++;
        compare(scene.visual.visuals.trailStrips, [...contrails.getStrips()], label + '.trails');
        compare(facts.layers.mines, mines.mines, label + '.mines');
        for (const bad of [words.slice(0, -1), [...words, 0]]) { try { decodeRustOrdnanceFacts(bad, content, snapshot, scene.ships); } catch { guards++; continue; } throw Error('Accepted malformed ordnance'); }
      };
      try {
        publication(pack.id + '.installed');
        const fire = () => { for (const [i, ship] of all.entries()) {
          const methods = ship.weaponControl as unknown as SourceMethods, dt = .25;
          for (const mount of ship.weapons) { mount.triggerHeld = true; methods.requestWeaponFire(mount, ship, onProjectile, onBeam, flash); methods.advanceWeaponLifecycle(dt, mount, ship, true, onProjectile, onBeam, flash); }
          const code = native.test_fire(internals.id, content.entities[i].id, dt); if (code) throw Error(pack.id + ' native fire ' + code);
        } };
        fire();
        projectileBirths += weapons.projectiles.length; beamBirths += weapons.beams.length; publication(pack.id + '.born');
        fire(); publication(pack.id + '.refreshed');
        const context = { playerShip: player, enemyShip: enemy, ships: all, capitalShips: [player, enemy], fighters: [], projectiles: weapons.projectiles,
          hulkFragments: [], fx, contrailEngine: contrails, random, visualRandom, addRadioMessage: () => {}, addCameraShake: () => {}, handleShipDestruction: () => {} };
        weapons.updateProjectiles(1 / 60, context); weapons.updateBeams(1 / 60, context);
        const motionCode = native.test_motion(internals.id, 1 / 60); if (motionCode) throw Error(pack.id + ' native motion ' + motionCode);
        publication(pack.id + '.motion');
        for (const ship of all) for (const m of ship.weapons) { m.cooldownTimer = 0; m.burstRemaining = 0; m.burstTimer = 0; m.firingState = 'IDLE'; m.firingStateTimer = 0; }
        const resetCode = native.test_reset_mounts(internals.id); if (resetCode) throw Error(pack.id + ' native mount reset ' + resetCode);
        fire(); publication(pack.id + '.new-cycle');
        let casePublications = 5;
        if (pack.id === 'foundry.hyperion') {
          const mount = player.spec.systemWeaponSlots!.find(m => m.slotId === 'SYS_YAMATO')!, point = new Vector2(mount.x, mount.y).rotate(player.facingRad).add(player.pos);
          spawnSystemProjectile(player, HYPERION_PROJECTILE_ID, point, player.facingRad, { ships: all, combatRandom: random, projectiles: weapons.projectiles, deployMine: () => {} }, { slotId: mount.slotId });
          const code = native.test_generated(internals.id, 0); if (code) throw Error(pack.id + ' native Yamato factory ' + code);
          publication(pack.id + '.system-yamato'); casePublications++;
          player.aimTargetWorld.copy(player.pos).add(new Vector2(Math.cos(player.facingRad) * 1500, Math.sin(player.facingRad) * 1500));
          const system = player.allSystems.find(s => s.type === HYPERION_YAMATO_ID)!;
          if (!system.activate()) throw Error(pack.id + ' source Yamato activation ' + system.activationFailureReason);
          system.update(2);
          for (const ship of all) for (const slot of ship.allSystems) slot.dispatchEvents(ship, { ships: all, combatRandom: random, projectiles: weapons.projectiles, deployMine: () => {} }, 0);
          const activeCode = native.test_generated(internals.id, 2); if (activeCode) throw Error(pack.id + ' native Yamato active dispatch ' + activeCode);
          publication(pack.id + '.yamato-active-audio'); casePublications++;
        }
        mines.deployMine(player.pos.clone().add(new Vector2(2000, 2000)), player, context, 1000);
        const mineCode = native.test_generated(internals.id, 1); if (mineCode) throw Error(pack.id + ' native mine factory ' + mineCode);
        publication(pack.id + '.spatial-mine'); casePublications++;
        cases.push({ pack: pack.id, actors: all.length, publications: casePublications });
      } finally { stop(); }
    } finally { core.dispose(); }
  }
  return { passed: true, cases, publications, strict, geometry, maximumDifference, guards, projectileBirths, beamBirths, actualNativeBirths: true, completeProductionInstaller: true, productionIntegrated: false, fullBattleReady: false };
}
