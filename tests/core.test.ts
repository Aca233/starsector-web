import { describe, expect, it } from 'vitest';
import { ArmorGrid } from '../src/engine/simulation/ArmorGrid';
import { Vector2 } from '../src/engine/math/Vector2';
import { parseStarsectorCsv, parseStarsectorJson } from '../src/engine/data/StarsectorTextParsers';
import { contentRegistry } from '../src/engine/content/ContentRegistry';
import { ShipWeaponControlSystem } from '../src/engine/simulation/systems/ShipWeaponControlSystem';
import { modManager, type ShipSpec } from '../src/engine/modding/ModManager';
import type { WeaponSpec } from '../src/engine/simulation/Weapon';
import { FixedTimestepScheduler } from '../src/engine/simulation/FixedTimestepScheduler';
import { ContrailEngine } from '../src/engine/simulation/ContrailEngine';
import { VisualRandom } from '../src/engine/runtime/VisualRandom';
import { PerformanceMetrics } from '../src/engine/runtime/PerformanceMetrics';
import { CombatEngine } from '../src/engine/simulation/CombatEngine';
import { AssetResolver, assetManager } from '../src/engine/assets/AssetResolver';
import { CameraController } from '../src/engine/runtime/CameraController';
import { CombatSession } from '../src/engine/runtime/CombatSession';
import { VISUAL_SCENARIOS, VisualScenarioController } from '../src/visual-lab/VisualScenarioController';
import type { ICombatRenderer } from '../src/engine/render/ICombatRenderer';
import { Shield } from '../src/engine/simulation/Shield';
import {
  ENGINE_VISUAL_PROFILES,
  SHIELD_VISUAL_PROFILES,
  getExplosionVisualProfile,
  getShipVisualProfile,
  getWeaponVisualFamily,
  getWeaponVisualProfile
} from '../src/engine/visual/VisualProfiles';
import { getHudDensity, getHudLayoutProfile } from '../src/ui/hud/HudLayout';
import { validateShipSpec, validateWeaponSpec } from '../src/engine/modding/ContentValidation';
import { SimulationRandom } from '../src/engine/simulation/SimulationRandom';
import { ContentManifestManager } from '../src/engine/content/ContentManifest';
import { beamVisualTime, selectRenderableBeams } from '../src/engine/render/BeamVisuals';
import { computeCanvasStripSegments } from '../src/engine/render/CanvasStripSampling';
import { advanceBeamContactPulse, getProjectileImpactVisualProfile } from '../src/engine/visual/ImpactVisuals';
import { FXRenderer } from '../src/engine/render/renderers/FXRenderer';
import { WebGLProjectilePass } from '../src/engine/render/webgl/passes/WebGLProjectilePass';
import { textureCache } from '../src/engine/render/TextureCache';
import { readFileSync } from 'node:fs';

describe('Starsector text import', () => {
  it('preserves JSON primitives and // inside quoted URLs', () => {
    const value = parseStarsectorJson(`{
      # comment
      "flag": true,
      "empty": null,
      "url": "https://example.test/a//b",
      "style": HIGH_TECH,
    }`) as Record<string, unknown>;
    expect(value.flag).toBe(true);
    expect(value.empty).toBeNull();
    expect(value.url).toBe('https://example.test/a//b');
    expect(value.style).toBe('HIGH_TECH');
  });

  it('parses quoted CSV commas and escaped quotes', () => {
    const rows = parseStarsectorCsv('id,name,desc\nfoo,"A, B","say ""hi"""\n');
    expect(rows).toEqual([{ id: 'foo', name: 'A, B', desc: 'say "hi"' }]);
  });
});

describe('ArmorGrid damage multiplier', () => {
  for (const [armor, expected] of [[100, 50], [1000, 15], [10000, 15]] as const) {
    it(`uses ${expected}% damage at effective armor ${armor}`, () => {
      const grid = new ArmorGrid(9, 9, 20, 20, armor);
      const result = grid.takeDamage(new Vector2(0, 0), 100, 'ENERGY', 100, false);
      expect(result.armorDamage).toBeCloseTo(expected, 3);
    });
  }
});

describe('ContentRegistry integration', () => {
  it('equips an imported weapon through the same registry used by ship mounts', () => {
    const weapon: WeaponSpec = {
      id: 'test_imported_weapon', nameKey: 'test.weapon', type: 'ENERGY', mountSize: 'SMALL',
      isBeam: false, damagePerShot: 10, damagePerSecond: 10, fluxPerShot: 5,
      range: 500, refireDelay: 1, projSpeed: 500, projRadius: 2, color: [255, 255, 255]
    };
    contentRegistry.registerWeapon(weapon);
    try {
      const ship = {
        weaponSlots: [{ slotId: 'TEST', mountType: 'TURRET', slotSize: 'SMALL', x: 0, y: 0, baseAngleDeg: 0, arcDeg: 360, defaultWeaponId: weapon.id }]
      } as ShipSpec;
      const control = new ShipWeaponControlSystem();
      control.init(ship, 0);
      expect(control.weapons).toHaveLength(1);
      expect(control.weapons[0].spec).toBe(weapon);
    } finally {
      contentRegistry.unregisterWeapon(weapon.id);
    }
  });
});

describe('content validation', () => {
  it('rejects incomplete and duplicate ship specs before registration', () => {
    expect(() => validateShipSpec({ id: 'bad', nameKey: 'bad.name', hitpoints: 1 })).toThrow(/descKey|spriteUrl|weaponSlots/);
    const engine = new CombatEngine('onslaught', 'paragon');
    expect(() => validateShipSpec(engine.playerShip.spec)).toThrow(/已注册/);
  });

  it('rejects missing weapon references in an otherwise valid ship spec', () => {
    const engine = new CombatEngine('onslaught', 'paragon');
    const original = engine.playerShip.spec;
    const copy = {
      ...original,
      id: 'invalid_weapon_reference_ship',
      weaponSlots: original.weaponSlots.map((slot, index) => index === 0
        ? { ...slot, defaultWeaponId: 'missing_weapon_for_validation' }
        : { ...slot }),
      engineSlots: original.engineSlots.map((slot) => ({ ...slot })),
      bounds: original.bounds.map(([x, y]) => [x, y] as [number, number])
    };
    expect(() => validateShipSpec(copy)).toThrow(/不存在的武器/);
  });

  it('rejects incomplete nested muzzle-flash specs before weapon registration', () => {
    const base = contentRegistry.getWeapon('tpc');
    expect(base).toBeDefined();
    const invalid = {
      ...base!,
      id: 'invalid_nested_muzzle_weapon',
      muzzleFlashSpec: { particleCount: 1 }
    } as unknown as WeaponSpec;

    expect(() => validateWeaponSpec(invalid)).toThrow(/muzzleFlashSpec\.(length|particleColor)/);
    expect(() => modManager.registerWeapon(invalid)).toThrow(/muzzleFlashSpec\.(length|particleColor)/);
    expect(contentRegistry.getWeapon(invalid.id)).toBeUndefined();
  });

  it('validates source-mapped projectile fade and texel-density fields before registration', () => {
    const base = contentRegistry.getWeapon('tpc');
    expect(base).toBeDefined();
    expect(() => validateWeaponSpec({ ...base!, id: 'valid_visual_contract', fadeTime: 0.3, pixelsPerTexel: 1 }, false)).not.toThrow();
    expect(() => validateWeaponSpec({ ...base!, id: 'invalid_texel_density', pixelsPerTexel: 0 }, false)).toThrow(/pixelsPerTexel/);
    expect(() => validateWeaponSpec({ ...base!, id: 'invalid_visual_spawn_type', visualSpawnType: 'RAY' }, false)).toThrow(/visualSpawnType/);
    const missile = contentRegistry.getWeapon('typhoon');
    expect(missile?.missileTrailSpec).toBeDefined();
    expect(() => validateWeaponSpec({
      ...missile!,
      id: 'invalid_missile_trail_blend',
      missileTrailSpec: { ...missile!.missileTrailSpec!, blendMode: 'SCREEN' }
    } as unknown as WeaponSpec, false)).toThrow(/missileTrailSpec\.blendMode/);
    expect(missile?.missileExplosionVisualSpec).toEqual({ radius: 350, color: [255, 100, 100, 255] });
    expect(() => validateWeaponSpec({
      ...missile!,
      id: 'invalid_missile_visual_explosion_radius',
      missileExplosionVisualSpec: { radius: -1, color: [255, 100, 100, 255] }
    } as unknown as WeaponSpec, false)).toThrow(/missileExplosionVisualSpec\.radius/);
    expect(() => validateWeaponSpec({
      ...missile!,
      id: 'invalid_missile_visual_explosion_color',
      missileExplosionVisualSpec: { radius: 350, color: [255, 100, 100] }
    } as unknown as WeaponSpec, false)).toThrow(/missileExplosionVisualSpec\.color/);
    const pd = contentRegistry.getWeapon('pdburst');
    expect(() => validateWeaponSpec({ ...pd!, id: 'invalid_hit_glow_brighten', hitGlowBrightenDuration: -0.1 }, false)).toThrow(/hitGlowBrightenDuration/);
  });
});

describe('deterministic simulation random source', () => {
  it('replays values and generated IDs after reset', () => {
    const random = new SimulationRandom(20260914);
    const first = [random.next(), random.next(), random.nextNumericId(), random.nextId('fx')];
    random.reset(20260914);
    expect([random.next(), random.next(), random.nextNumericId(), random.nextId('fx')]).toEqual(first);
  });

  it('keeps cosmetic muzzle-particle randomness isolated from combat randomness', () => {
    const seed = 20260914;
    const withExtraFx = new CombatEngine('onslaught', 'paragon', seed);
    const baseline = new CombatEngine('onslaught', 'paragon', seed);
    const muzzle = contentRegistry.getWeapon('tpc')?.muzzleFlashSpec;
    expect(muzzle).toBeDefined();

    withExtraFx.fxSystem.spawnAuthenticMuzzleFlash(
      { ...muzzle!, particleCount: muzzle!.particleCount + 1 },
      new Vector2(0, 0),
      0,
      new Vector2(0, 0)
    );

    expect(Array.from({ length: 8 }, () => withExtraFx.random.next()))
      .toEqual(Array.from({ length: 8 }, () => baseline.random.next()));
  });
});

describe('manifest startup contract', () => {
  it('validates the real asset/content manifests against the built-in registry', async () => {
    const assetEntries = JSON.parse(readFileSync(new URL('../public/game-assets/asset-manifest.json', import.meta.url), 'utf8'));
    const content = JSON.parse(readFileSync(new URL('../public/content/manifest.json', import.meta.url), 'utf8'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('asset-manifest') ? assetEntries : content;
      return { ok: true, status: 200, json: async () => body } as Response;
    }) as typeof fetch;
    try {
      await assetManager.loadManifest('asset-manifest');
      const manager = new ContentManifestManager();
      await manager.ensureLoaded('content-manifest');
      expect(manager.current?.ships).toHaveLength(5);
      expect(manager.current?.weapons).toHaveLength(17);
      expect(manager.current?.loadouts).toHaveLength(5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('FixedTimestepScheduler', () => {
  function simulate(renderHz: number): { ticks: number; simulatedSeconds: number } {
    const scheduler = new FixedTimestepScheduler(60);
    let ticks = 0;
    let simulatedSeconds = 0;
    const start = 10;
    scheduler.update(start, () => {}, () => {});
    for (let frame = 1; frame <= renderHz; frame++) {
      scheduler.update(start + frame / renderHz, (dt) => { ticks++; simulatedSeconds += dt; }, () => {});
    }
    return { ticks, simulatedSeconds };
  }

  it('produces equivalent simulation time at 30/60/144 Hz', () => {
    const results = [30, 60, 144].map(simulate);
    for (const result of results) {
      expect(Math.abs(result.ticks - 60)).toBeLessThanOrEqual(1);
      expect(result.simulatedSeconds).toBeCloseTo(1, 1);
    }
    expect(Math.max(...results.map((r) => r.ticks)) - Math.min(...results.map((r) => r.ticks))).toBeLessThanOrEqual(1);
  });

  it('does not drop all scaled backlog when max substeps are reached', () => {
    const scheduler = new FixedTimestepScheduler(60);
    scheduler.timeScale = 2;
    let ticks = 0;
    scheduler.update(10, () => {}, () => {});
    scheduler.update(10.1, () => { ticks++; }, () => {});
    expect(ticks).toBe(8);
    const before = scheduler.simTicks;
    scheduler.update(10.1167, () => {}, () => {});
    expect(scheduler.simTicks).toBeGreaterThan(before);
  });
});

describe('R02 timing and camera invariants', () => {
  it('advances approximately 2 simulated seconds during one wall-clock second at 2x', () => {
    const scheduler = new FixedTimestepScheduler(60);
    scheduler.timeScale = 2;
    let simulated = 0;
    scheduler.update(20, () => {}, () => {});
    for (let frame = 1; frame <= 60; frame++) {
      scheduler.update(20 + frame / 60, (dt) => { simulated += dt; }, () => {});
    }
    expect(simulated).toBeCloseTo(2, 1);
  });

  it('reports bounded backlog and explicitly counts catastrophic dropped simulation time', () => {
    const scheduler = new FixedTimestepScheduler(60);
    scheduler.timeScale = 4;
    scheduler.update(30, () => {}, () => {});
    scheduler.update(30.1, () => {}, () => {});
    expect(scheduler.backlogSeconds).toBeLessThanOrEqual((1 / 60) * 8 + 1e-8);
    expect(scheduler.droppedSimulationSeconds).toBeGreaterThan(0);
  });

  it('camera smoothing is refresh-rate independent at 30/60/144 Hz', () => {
    const simulateCamera = (hz: number) => {
      const camera = new Vector2(0, 0);
      const target = new Vector2(100, -50);
      const controller = new CameraController();
      for (let i = 0; i < hz; i++) controller.follow(camera, target, 1 / hz);
      return camera;
    };
    const positions = [30, 60, 144].map(simulateCamera);
    for (const pos of positions.slice(1)) {
      expect(pos.x).toBeCloseTo(positions[0].x, 8);
      expect(pos.y).toBeCloseTo(positions[0].y, 8);
    }
  });
});

describe('restart/switch lifecycle', () => {
  it('resets renderer-owned visual state when restarting a session', () => {
    const session = new CombatSession('onslaught', 'paragon');
    let resets = 0;
    const renderer: ICombatRenderer = {
      prepareAssets: async () => {},
      updateVisual: () => {},
      render: () => {},
      resetVisualState: () => { resets++; },
      dispose: () => {}
    };
    session.renderer = renderer;
    session.restart();
    session.switchPlayerShip('paragon');
    expect(resets).toBe(2);
  });

  it('clears battle timing, cooldowns and settlement through repeated switches', () => {
    const engine = new CombatEngine('onslaught', 'paragon');
    for (let i = 0; i < 20; i++) {
      engine.combatTime = 100 + i;
      engine.countermeasureCooldownTimer = 8;
      engine.enemyCountermeasureCooldownTimer = 7;
      engine.endBattle(true);
      engine.switchPlayerShip(i % 2 ? 'onslaught' : 'paragon');
      expect(engine.combatTime).toBe(0);
      expect(engine.countermeasureCooldownTimer).toBe(0);
      expect(engine.enemyCountermeasureCooldownTimer).toBe(0);
      expect(engine.battleResult).toBeNull();
    }
  });

  it('freezes combat FX and renderer-owned visual updates while paused', () => {
    const session = new CombatSession('onslaught', 'paragon', 8801);
    let visualUpdates = 0;
    session.renderer = {
      prepareAssets: async () => {},
      updateVisual: () => { visualUpdates++; },
      render: () => {},
      getResourceStats: () => ({
        residentTextures: 0,
        pendingUploads: 0,
        uploads: 0,
        invalidations: 0,
        resourceRecreations: 0,
        drawCalls: 0,
        gpuTimerAvailable: false,
        gpuTimeMs: null
      }),
      resetVisualState: () => {},
      dispose: () => {}
    };
    session.engine.fxSystem.particles.push({
      pos: new Vector2(0, 0),
      vel: new Vector2(10, 0),
      life: 1,
      maxLife: 1,
      size: 5,
      color: [255, 255, 255],
      alpha: 1
    });
    session.engine.contrailEngine.addPoint('pause-trail', new Vector2(0, 0), 1, 4, 1, 1);
    session.start();
    session.pause();

    const particleBefore = { x: session.engine.particles[0].pos.x, life: session.engine.particles[0].life };
    const trailBefore = Array.from(session.engine.contrailEngine.getStrips())[0].points[0].age;
    const clockBefore = session.visualClock.time;
    session.fixedUpdate(1 / 60);

    expect({ x: session.engine.particles[0].pos.x, life: session.engine.particles[0].life }).toEqual(particleBefore);
    expect(Array.from(session.engine.contrailEngine.getStrips())[0].points[0].age).toBe(trailBefore);
    expect(session.visualClock.time).toBe(clockBefore);
    expect(visualUpdates).toBe(0);

    session.start();
    session.fixedUpdate(1 / 60);
    expect(session.engine.particles[0].life).toBeLessThan(particleBefore.life);
    expect(Array.from(session.engine.contrailEngine.getStrips())[0].points[0].age).toBeGreaterThan(trailBefore);
    expect(session.visualClock.time).toBeGreaterThan(clockBefore);
    expect(visualUpdates).toBe(1);
  });

  it('clears weapon FX and detached trail ownership on restart and ship switch', () => {
    const session = new CombatSession('doom', 'paragon', 8802);
    const lab = new VisualScenarioController(session);
    lab.select('WPN-MSL-01', 8802);
    lab.seek(1.5);
    expect(session.engine.projectiles.some((p) => p.specId === 'typhoon')).toBe(true);
    expect(session.engine.contrailEngine.getStats().pointCount).toBeGreaterThan(0);
    expect(session.engine.muzzleParticles.length).toBeGreaterThan(0);

    session.restart('doom');
    expect(session.engine.projectiles).toHaveLength(0);
    expect(session.engine.beams).toHaveLength(0);
    expect(session.engine.contrailEngine.getStats()).toEqual({ stripCount: 0, pointCount: 0 });
    expect(session.engine.muzzleParticles).toHaveLength(0);
    expect(session.engine.explosions).toHaveLength(0);
    expect(session.engine.hitGlows).toHaveLength(0);
    expect(session.engine.empArcs).toHaveLength(0);
    expect(session.visualClock.time).toBe(0);

    session.engine.fxSystem.spawnSparks(new Vector2(0, 0), 3, [255, 255, 255]);
    session.engine.contrailEngine.addPoint('stale-after-restart', new Vector2(0, 0), 1, 3, 1, 1);
    session.switchPlayerShip('paragon');
    expect(session.engine.particles).toHaveLength(0);
    expect(session.engine.contrailEngine.getStats()).toEqual({ stripCount: 0, pointCount: 0 });
    expect(session.visualClock.time).toBe(0);
  });
});

describe('W09 weapon FX lifecycle invariants', () => {
  it('replays the same Reaper projectile and trail lifecycle at 30/60/144 Hz render cadence', () => {
    const simulate = (renderHz: number) => {
      const session = new CombatSession('doom', 'paragon', 9901);
      const lab = new VisualScenarioController(session);
      lab.select('WPN-MSL-01', 9901);
      lab.play();
      const scheduler = new FixedTimestepScheduler(60);
      const start = 10;
      scheduler.update(start, () => {}, () => {});
      const frames = Math.round(renderHz * 1.5);
      for (let frame = 1; frame <= frames; frame++) {
        scheduler.update(start + frame / renderHz, (dt) => { lab.tick(dt); }, () => {});
      }
      const projectile = session.engine.projectiles.find((p) => p.specId === 'typhoon');
      const strips = Array.from(session.engine.contrailEngine.getStrips());
      const firstStrip = strips[0];
      return {
        ticks: scheduler.simTicks,
        sceneTime: lab.time,
        projectile: projectile ? {
          x: projectile.pos.x,
          y: projectile.pos.y,
          elapsed: projectile.elapsedTime,
          rangeRemaining: projectile.rangeRemaining
        } : null,
        trail: session.engine.contrailEngine.getStats(),
        firstTrailAge: firstStrip?.points[0]?.age ?? null,
        lastTrailAge: firstStrip?.points[firstStrip.points.length - 1]?.age ?? null,
        muzzleParticles: session.engine.muzzleParticles.length
      };
    };

    const results = [30, 60, 144].map(simulate);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[0].ticks).toBe(90);
    expect(results[0].trail.pointCount).toBeGreaterThan(1);
  });

  it('keeps a detached trail visual-only, rejects new points and fully expires it', () => {
    const trails = new ContrailEngine();
    trails.addPoint(42, new Vector2(0, 0), 0.2, 5, 1, 1, [255, 100, 100, 50], 'GLOW');
    trails.addPoint(42, new Vector2(10, 0), 0.2, 5, 1, 1, [255, 100, 100, 50], 'GLOW');
    trails.addPoint(42, new Vector2(20, 0), 0.2, 5, 1, 1, [255, 100, 100, 50], 'GLOW');
    expect(trails.getStats()).toEqual({ stripCount: 1, pointCount: 3 });
    const originalPositions = Array.from(trails.getStrips())[0].points.map((point) => [point.pos.x, point.pos.y]);

    trails.detach(42);
    trails.addPoint(42, new Vector2(30, 0), 0.2, 5, 1, 1, [255, 100, 100, 50], 'GLOW');
    expect(trails.getStats()).toEqual({ stripCount: 1, pointCount: 3 });
    trails.update(0.1);
    expect(Array.from(trails.getStrips())[0].points.map((point) => [point.pos.x, point.pos.y])).toEqual(originalPositions);
    trails.update(0.2);
    expect(trails.getStats()).toEqual({ stripCount: 0, pointCount: 0 });
  });

  it('does not accumulate weapon FX ownership across repeated real-scene replay cycles', () => {
    const session = new CombatSession('doom', 'paragon', 9902);
    const lab = new VisualScenarioController(session);
    lab.select('WPN-MSL-01', 9902);
    let expectedActiveState: unknown = null;

    for (let cycle = 0; cycle < 60; cycle++) {
      lab.seek(1.5);
      const trail = session.engine.contrailEngine.getStats();
      const activeState = {
        projectiles: session.engine.projectiles.length,
        beams: session.engine.beams.length,
        trailStrips: trail.stripCount,
        trailPoints: trail.pointCount,
        muzzleParticles: session.engine.muzzleParticles.length,
        particles: session.engine.particles.length,
        hitGlows: session.engine.hitGlows.length
      };
      if (expectedActiveState == null) expectedActiveState = activeState;
      expect(activeState).toEqual(expectedActiveState);

      lab.replay();
      expect(session.engine.projectiles).toHaveLength(0);
      expect(session.engine.beams).toHaveLength(0);
      expect(session.engine.contrailEngine.getStats()).toEqual({ stripCount: 0, pointCount: 0 });
      expect(session.engine.muzzleParticles).toHaveLength(0);
      expect(session.engine.explosions).toHaveLength(0);
      expect(session.engine.hitGlows).toHaveLength(0);
      expect(session.engine.empArcs).toHaveLength(0);
    }
  });

  it('keeps performance CPU, GPU and trail telemetry semantically separate', () => {
    const metrics = new PerformanceMetrics();
    metrics.recordTiming('simulationMs', 1.2);
    metrics.recordTiming('visualUpdateMs', 0.3);
    metrics.recordTiming('renderPreparationMs', 0.1);
    metrics.recordTiming('drawSubmitMs', 0.8);
    metrics.finalizeFrame({
      gpuTimeMs: null,
      gpuTimerAvailable: false,
      projectileCount: 4,
      particleCount: 12,
      trailStripCount: 2,
      trailPointCount: 37,
      textureCount: 18,
      pendingTextureUploads: 0,
      textureUploads: 18,
      textureInvalidations: 0,
      resourceRecreations: 0,
      drawCalls: 9,
      memoryBytes: null,
      collisionKernelMs: 0.2,
      collisionTypeScriptBatches: 1,
      collisionWasmBatches: 0,
      collisionWasmFallbacks: 0,
      collisionProjectiles: 4,
      collisionCandidatePairs: 8,
      collisionMaxCandidatesPerProjectile: 3,
      collisionBackendState: 'ready'
    });
    const report = metrics.getReport();
    expect(report.counts).toMatchObject({ maxProjectiles: 4, maxParticles: 12, maxTrailStrips: 2, maxTrailPoints: 37, maxDrawCalls: 9 });
    expect(report.timings.drawSubmitMs.mean).toBe(0.8);
    expect(report.timings.frameCpuMs.mean).toBeCloseTo(2.4, 8);
    expect(report.gpuTimerAvailable).toBe(false);
    expect(report.gpuSampleCount).toBe(0);
    expect(report.timings.gpuTimeMs).toBeNull();
  });
});

describe('V01 controlled Visual Lab scenarios', () => {
  it('matches the twelve acceptance scenes from the M2 plan', () => {
    expect(VISUAL_SCENARIOS.filter((scene) => scene.id.startsWith('VIS-')).map((scene) => [scene.id, scene.title])).toEqual([
      ['VIS-01', '攻势静止，四个朝向'],
      ['VIS-02', '怠速、推进、松键、侧移、冲刺'],
      ['VIS-03', '护盾开关与单次受击'],
      ['VIS-04', '多次连续护盾命中'],
      ['VIS-05', 'TPC 单发'],
      ['VIS-06', '实弹炮连续开火'],
      ['VIS-07', '光束充能、照射、停止'],
      ['VIS-08', '导弹视觉层：直飞与命中'],
      ['VIS-09', '排散完整过程'],
      ['VIS-10', '小命中与舰船爆炸'],
      ['VIS-11', '固定状态 HUD'],
      ['VIS-12', '双舰加舰载机实战']
    ]);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-TPC-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-AUTOPULSE-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-MARK9-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-HEAVYMAULER-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-HVEL-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-LIGHTMG-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-FLAK-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-DUALFLAK-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-BEAM-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-BEAM-02' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-BEAM-03' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-HBLASTER-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-PDBURST-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-MSL-01' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-MSL-02' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-MSL-03' && scene.mode === 'REAL_WEAPON')).toBe(true);
    expect(VISUAL_SCENARIOS.some((scene) => scene.id === 'WPN-MSL-04' && scene.mode === 'REAL_WEAPON')).toBe(true);
  });

  it('constructs controlled shield, weapon, vent and HUD states at deterministic seek points', () => {
    const session = new CombatSession('onslaught', 'paragon', 1337);
    const lab = new VisualScenarioController(session);

    lab.select('VIS-03', 1337);
    lab.seek(1.8);
    expect(session.engine.playerShip.shield.isActive).toBe(true);
    expect(session.engine.playerShip.shield.ripples.length).toBeGreaterThan(0);

    lab.select('VIS-05', 1337);
    lab.seek(1.2);
    expect(session.engine.projectiles.some((p) => p.specId === 'tpc')).toBe(true);

    lab.select('VIS-09', 1337);
    lab.seek(1.5);
    expect(session.engine.playerShip.flux.isVenting).toBe(true);
    expect(session.engine.playerShip.flux.ventProgress).toBeGreaterThan(0);

    lab.select('VIS-11', 1337);
    lab.seek(2);
    expect(session.engine.playerShip.shield.isActive).toBe(true);
    expect(session.engine.playerShip.hullHp).toBeCloseTo(session.engine.playerShip.spec.hitpoints * 0.72, 5);
  });

  it('rebuilds the same scene, seed and timestamp to the same scripted state', () => {
    const session = new CombatSession('onslaught', 'paragon', 4242);
    const lab = new VisualScenarioController(session);
    lab.select('VIS-05', 4242);
    lab.seek(1.4);
    const first = session.engine.projectiles[0];
    const snapshot = { x: first.pos.x, y: first.pos.y, elapsed: first.elapsedTime };
    lab.seek(2.5);
    lab.seek(1.4);
    const replayed = session.engine.projectiles[0];
    expect({ x: replayed.pos.x, y: replayed.pos.y, elapsed: replayed.elapsedTime }).toEqual(snapshot);
  });

  it('replays WPN-TPC-01 through the actual weapon-control and projectile-simulation path', () => {
    const session = new CombatSession('onslaught', 'paragon', 9001);
    const lab = new VisualScenarioController(session);
    lab.select('WPN-TPC-01', 9001);
    lab.seek(0.98);

    const projectile = session.engine.projectiles.find((p) => p.specId === 'tpc');
    expect(projectile).toBeDefined();
    expect(projectile!.sourceShipId).toBe(session.engine.playerShip.id);
    expect(projectile!.fadeTime).toBe(0.3);
    expect(projectile!.pixelsPerTexel).toBe(1);
    expect(projectile!.elapsedTime).toBeGreaterThan(0);
    expect(projectile!.rangeRemaining).toBeLessThan(projectile!.totalRange);
    expect(session.engine.muzzleParticles.length).toBeGreaterThan(0);
    expect(session.engine.playerShip.weapons.filter((mount) => mount.spec.id === 'tpc' && mount.recoil > 0)).toHaveLength(1);

    const snapshot = { x: projectile!.pos.x, y: projectile!.pos.y, elapsed: projectile!.elapsedTime };
    lab.seek(0.98);
    const replayed = session.engine.projectiles.find((p) => p.specId === 'tpc');
    expect(replayed).toBeDefined();
    expect({ x: replayed!.pos.x, y: replayed!.pos.y, elapsed: replayed!.elapsedTime }).toEqual(snapshot);
  });

  it('replays WPN-AUTOPULSE-01 through one real Paragon hardpoint', () => {
    const session = new CombatSession('onslaught', 'paragon', 9101);
    const lab = new VisualScenarioController(session);
    lab.select('WPN-AUTOPULSE-01', 9101);
    lab.seek(0.98);

    const projectile = session.engine.projectiles.find((p) => p.specId === 'autopulse');
    expect(projectile).toBeDefined();
    expect(session.engine.playerShip.spec.id).toBe('paragon');
    expect(projectile!.sourceShipId).toBe(session.engine.playerShip.id);
    expect(projectile!.fadeTime).toBe(0.25);
    expect(projectile!.pixelsPerTexel).toBe(1);
    expect(projectile!.hitGlowRadius).toBe(50);
    expect(projectile!.elapsedTime).toBeGreaterThan(0);
    expect(session.engine.muzzleParticles.length).toBeGreaterThan(0);
    expect(session.engine.playerShip.weapons.filter((mount) => mount.spec.id === 'autopulse' && mount.recoil > 0)).toHaveLength(1);

    const snapshot = { x: projectile!.pos.x, y: projectile!.pos.y, elapsed: projectile!.elapsedTime };
    lab.seek(0.98);
    const replayed = session.engine.projectiles.find((p) => p.specId === 'autopulse');
    expect(replayed).toBeDefined();
    expect({ x: replayed!.pos.x, y: replayed!.pos.y, elapsed: replayed!.elapsedTime }).toEqual(snapshot);
  });

  it('replays WPN-MARK9-01 through the real WS 019 turret and alternates source barrel offsets', () => {
    const session = new CombatSession('onslaught', 'paragon', 9201);
    const lab = new VisualScenarioController(session);
    lab.select('WPN-MARK9-01', 9201);
    lab.seek(1.18);

    const projectiles = session.engine.projectiles.filter((p) => p.specId === 'mark9' && p.slotId === 'WS 019');
    expect(projectiles.length).toBeGreaterThanOrEqual(2);
    expect(projectiles[0].barrelOffset).toEqual({ x: 28, y: -4 });
    expect(projectiles[1].barrelOffset).toEqual({ x: 28, y: 4 });
    expect(projectiles[0].projWidth).toBe(7.5);
    expect(projectiles[0].fadeTime).toBe(0.2);
    expect(projectiles[0].pixelsPerTexel).toBe(5);
    expect(projectiles[0].fringeColor).toEqual([235, 255, 215, 235]);
    expect(projectiles[0].coreColor).toEqual([225, 255, 205, 200]);
    expect(session.engine.muzzleParticles.length).toBeGreaterThan(0);
    const mount = session.engine.playerShip.weapons.find((item) => item.slotId === 'WS 019');
    expect(mount).toBeDefined();
    expect(mount!.spec.visualRecoil).toBe(10);
    expect(mount!.barrelIndex).toBe(0);

    const snapshot = projectiles.map((p) => ({ x: p.pos.x, y: p.pos.y, elapsed: p.elapsedTime, barrel: p.barrelOffset }));
    lab.seek(1.18);
    const replayed = session.engine.projectiles.filter((p) => p.specId === 'mark9' && p.slotId === 'WS 019');
    expect(replayed.map((p) => ({ x: p.pos.x, y: p.pos.y, elapsed: p.elapsedTime, barrel: p.barrelOffset }))).toEqual(snapshot);
  });

  it('replays Heavy Mauler and HVD through a real medium-turret fire path', () => {
    const heavySession = new CombatSession('onslaught', 'paragon', 9301);
    const heavyLab = new VisualScenarioController(heavySession);
    heavyLab.select('WPN-HEAVYMAULER-01', 9301);
    heavyLab.seek(0.98);
    const heavy = heavySession.engine.projectiles.find((p) => p.specId === 'heavymauler' && p.slotId === 'WS 012');
    expect(heavy).toBeDefined();
    expect(heavy).toMatchObject({
      projLength: 50,
      projWidth: 9,
      fadeTime: 0.2,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      fringeColor: [255, 200, 70, 225],
      coreColor: [255, 200, 200, 180],
      barrelOffset: { x: 16, y: 0 }
    });
    expect(heavySession.engine.muzzleParticles.length).toBeGreaterThan(0);
    expect(heavySession.engine.playerShip.weapons.find((mount) => mount.slotId === 'WS 012')?.recoil).toBeGreaterThan(0);

    const hvelSession = new CombatSession('onslaught', 'paragon', 9302);
    const hvelLab = new VisualScenarioController(hvelSession);
    hvelLab.select('WPN-HVEL-01', 9302);
    hvelLab.seek(0.98);
    const hvel = hvelSession.engine.projectiles.find((p) => p.specId === 'hveldriver' && p.slotId === 'WS 012');
    expect(hvel).toBeDefined();
    expect(hvel).toMatchObject({
      projLength: 120,
      projWidth: 7.5,
      fadeTime: 0.3,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      fringeColor: [255, 220, 50, 255],
      coreColor: [255, 220, 200, 220],
      barrelOffset: { x: 15, y: 0 }
    });
    expect(hvelSession.engine.muzzleParticles.length).toBeGreaterThan(0);
    expect(hvelSession.engine.playerShip.weapons.find((mount) => mount.slotId === 'WS 012')?.recoil).toBeGreaterThan(0);
  });

  it('replays Light MG, Flak and Dual Flak through real fire-control paths without changing their gameplay-only gaps', () => {
    const lightSession = new CombatSession('broadsword', 'paragon', 9401);
    const lightLab = new VisualScenarioController(lightSession);
    lightLab.select('WPN-LIGHTMG-01', 9401);
    lightLab.seek(0.98);
    const light = lightSession.engine.projectiles.find((p) => p.specId === 'lightmg' && p.slotId === 'WS 001');
    expect(light).toBeDefined();
    expect(light).toMatchObject({
      spawnType: 'BALLISTIC',
      visualSpawnType: 'BALLISTIC_AS_BEAM',
      projLength: 35,
      projWidth: 3.5,
      fadeTime: 0.3,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      fringeColor: [240, 220, 220, 200],
      coreColor: [245, 245, 245, 80],
      barrelOffset: { x: 12, y: 0 }
    });
    expect(lightSession.engine.muzzleParticles.length).toBeGreaterThan(0);

    const flakSession = new CombatSession('onslaught', 'paragon', 9402);
    const flakLab = new VisualScenarioController(flakSession);
    flakLab.select('WPN-FLAK-01', 9402);
    flakLab.seek(0.98);
    const flak = flakSession.engine.projectiles.find((p) => p.specId === 'flak' && p.slotId === 'WS 014');
    expect(flak).toBeDefined();
    expect(flak).toMatchObject({
      projLength: 35,
      projWidth: 6.5,
      fadeTime: 0.2,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      coreColor: [255, 255, 200, 150],
      barrelOffset: { x: 20, y: 0 }
    });
    expect(flakSession.engine.muzzleParticles.length).toBeGreaterThan(0);

    const dualSession = new CombatSession('onslaught', 'paragon', 9403);
    const dualLab = new VisualScenarioController(dualSession);
    dualLab.select('WPN-DUALFLAK-01', 9403);
    dualLab.seek(1.12);
    const dual = dualSession.engine.projectiles.filter((p) => p.specId === 'dualflak' && p.slotId === 'WS 014');
    expect(dual.length).toBeGreaterThanOrEqual(2);
    expect(dual[0].barrelOffset).toEqual({ x: 18, y: -7 });
    expect(dual[1].barrelOffset).toEqual({ x: 18, y: 7 });
    expect(dual[0]).toMatchObject({ projLength: 35, projWidth: 4.5, fadeTime: 0.2, pixelsPerTexel: 5, textureScrollSpeed: 64, coreColor: [255, 255, 200, 150] });
    expect(dualSession.engine.muzzleParticles.length).toBeGreaterThan(0);
  });

  it('replays Tachyon, Graviton and Tactical Laser through real beam fire paths', () => {
    const tachyonSession = new CombatSession('paragon', 'onslaught', 9501);
    const tachyonLab = new VisualScenarioController(tachyonSession);
    tachyonLab.select('WPN-BEAM-01', 9501);
    tachyonLab.seek(0.98);
    const tachyon = tachyonSession.engine.beams.find((beam) => beam.specId === 'tachyonlance' && beam.slotId === 'WS 003');
    expect(tachyon).toMatchObject({
      width: 25,
      visualMode: 'BURST',
      textureScrollSpeed: 292,
      pixelsPerTexel: 5,
      fringeColor: [85, 25, 215, 255],
      coreColor: [255, 255, 255, 255],
      glowColor: [165, 100, 255, 235],
      barrelOffset: { x: -3, y: 0 }
    });
    expect(beamVisualTime(tachyon!, 9)).toBe(tachyon!.elapsedTime);

    const gravitonSession = new CombatSession('paragon', 'onslaught', 9502);
    const gravitonLab = new VisualScenarioController(gravitonSession);
    gravitonLab.select('WPN-BEAM-02', 9502);
    gravitonLab.seek(1.12);
    const graviton = gravitonSession.engine.beams.filter((beam) => beam.specId === 'gravitonbeam' && beam.slotId === 'WS 005');
    expect(graviton.length).toBeGreaterThan(0);
    expect(graviton[0]).toMatchObject({ width: 20, visualMode: 'SUSTAINED', textureScrollSpeed: 260, pixelsPerTexel: 5, barrelOffset: { x: 15, y: 0 } });
    expect(beamVisualTime(graviton[0], 1.12)).toBe(1.12);
    const duplicateGraviton = { ...graviton[0], id: graviton[0].id + 1, elapsedTime: graviton[0].elapsedTime + 0.1 };
    expect(selectRenderableBeams([graviton[0], duplicateGraviton])).toEqual([duplicateGraviton]);

    const tacSession = new CombatSession('paragon', 'onslaught', 9503);
    const tacLab = new VisualScenarioController(tacSession);
    tacLab.select('WPN-BEAM-03', 9503);
    tacLab.seek(1.12);
    const tac = tacSession.engine.beams.filter((beam) => beam.specId === 'taclaser' && beam.slotId === 'WS 007');
    expect(tac.length).toBeGreaterThan(0);
    expect(tac[0]).toMatchObject({ width: 13, visualMode: 'SUSTAINED', textureScrollSpeed: 72, pixelsPerTexel: 5, fringeColor: [0, 255, 0, 225], barrelOffset: { x: 10, y: 0 } });
    const duplicateTac = { ...tac[0], id: tac[0].id + 1, elapsedTime: tac[0].elapsedTime + 0.1 };
    expect(selectRenderableBeams([tac[0], duplicateTac])).toEqual([duplicateTac]);
  });

  it('replays Reaper, Atropos, Annihilator and Sabot through real missile fire paths', () => {
    const reaperSession = new CombatSession('doom', 'paragon', 9601);
    const reaperLab = new VisualScenarioController(reaperSession);
    reaperLab.select('WPN-MSL-01', 9601);
    reaperLab.seek(1.12);
    const reaper = reaperSession.engine.projectiles.find((p) => p.specId === 'typhoon' && p.slotId === 'WS 001');
    expect(reaper).toBeDefined();
    expect(reaper).toMatchObject({
      projLength: 23,
      projWidth: 14,
      fadeTime: 0.5,
      projSpriteUrl: '/game-assets/graphics/missiles/missile_torpedo_compact.png',
      barrelOffset: { x: 20, y: 0 },
      missileEngineVisualSpec: { nozzleOffset: -11, width: 10, length: 80, color: [255, 100, 100, 255], glowSizeMult: 2.5 },
      missileTrailSpec: { duration: 2, baseWidth: 15, widenMult: 1, minSeg: 5, color: [255, 100, 100, 50], blendMode: 'GLOW' },
      missileExplosionVisualSpec: { radius: 350, color: [255, 100, 100, 255] }
    });
    expect(reaper!.isGuided).not.toBe(true);
    expect(reaperSession.engine.muzzleParticles.some((p) => p.blendMode === 'NORMAL')).toBe(true);
    const reaperStrip = [...reaperSession.engine.contrailEngine.getStrips()].find((strip) => strip.stripId === reaper!.id);
    expect(reaperStrip).toMatchObject({ color: [255, 100, 100, 50], blendMode: 'GLOW', widenMult: 1, minSeg: 5 });
    expect(reaperStrip?.points[0]).toMatchObject({ duration: 2, baseWidth: 15 });

    const atroposSession = new CombatSession('dagger', 'onslaught', 9602);
    const atroposLab = new VisualScenarioController(atroposSession);
    atroposLab.select('WPN-MSL-02', 9602);
    atroposLab.seek(1.0);
    const atropos = atroposSession.engine.projectiles.find((p) => p.specId === 'atropos_single' && p.slotId === 'WS 002');
    expect(atropos).toBeDefined();
    expect(atropos).toMatchObject({
      isGuided: true,
      projLength: 21,
      projWidth: 10,
      projSpriteUrl: '/game-assets/graphics/missiles/torpedo_guided2.png',
      missileTrailSpec: { duration: 2, baseWidth: 10, widenMult: 2, minSeg: 5, spawnOffset: -15, color: [155, 100, 70, 75], blendMode: 'GLOW' },
      missileExplosionVisualSpec: { radius: 250, color: [255, 155, 100, 255] }
    });
    expect(atropos!.facingRad).toBeGreaterThan(0.03);

    const annihilatorSession = new CombatSession('onslaught', 'paragon', 9603);
    const annihilatorLab = new VisualScenarioController(annihilatorSession);
    annihilatorLab.select('WPN-MSL-03', 9603);
    annihilatorLab.seek(1.3);
    const rockets = annihilatorSession.engine.projectiles.filter((p) => p.specId === 'annihilatorpod' && p.slotId === 'WS 021');
    expect(rockets.length).toBeGreaterThanOrEqual(2);
    expect(rockets[0].barrelOffset).toEqual({ x: 8, y: -8 });
    expect(rockets[1].barrelOffset).toEqual({ x: 8, y: 8 });
    expect(rockets[0]).toMatchObject({
      projLength: 18,
      projWidth: 4,
      fadeTime: 0.5,
      missileTrailSpec: { duration: 0.5, baseWidth: 8, widenMult: 2, minSeg: 5, color: [75, 75, 75, 150], blendMode: 'NORMAL' },
      missileExplosionVisualSpec: { radius: 75, color: [255, 165, 0, 255] }
    });
    expect(annihilatorSession.engine.muzzleParticles.some((p) => p.blendMode === 'NORMAL')).toBe(true);

    const sabotSession = new CombatSession('doom', 'paragon', 9604);
    const sabotLab = new VisualScenarioController(sabotSession);
    sabotLab.select('WPN-MSL-04', 9604);
    sabotLab.seek(1.42);
    const sabot = sabotSession.engine.projectiles.find((p) => p.specId === 'sabot' && p.slotId === 'WS 003');
    expect(sabot).toBeDefined();
    expect(sabot).toMatchObject({
      isTwoStage: true,
      stageTriggered: true,
      projLength: 18,
      projWidth: 9,
      missileEngineVisualSpec: { nozzleOffset: -9, width: 8, length: 20, color: [255, 175, 100, 255], glowSizeMult: 1.5 },
      missileTrailSpec: { duration: 2, baseWidth: 8, widenMult: 2, minSeg: 7, spawnOffset: -10, color: [100, 100, 100, 150], blendMode: 'NORMAL' },
      missileExplosionVisualSpec: { radius: 125, color: [255, 165, 0, 255] }
    });
  });

  it('replays Heavy Blaster and Burst PD through real hit/contact paths', () => {
    const heavySession = new CombatSession('doom', 'paragon', 9701);
    const heavyLab = new VisualScenarioController(heavySession);
    heavyLab.select('WPN-HBLASTER-01', 9701);
    heavyLab.seek(0.82);
    const heavy = heavySession.engine.projectiles.find((p) => p.specId === 'heavyblaster' && p.slotId === 'WS 007');
    expect(heavy).toBeDefined();
    expect(heavy).toMatchObject({
      spawnType: 'BALLISTIC',
      visualSpawnType: 'BALLISTIC_AS_BEAM',
      projLength: 45,
      projWidth: 7,
      fadeTime: 0.3,
      textureScrollSpeed: 64,
      pixelsPerTexel: 5,
      fringeColor: [100, 100, 255, 255],
      coreColor: [255, 255, 255, 255],
      glowColor: [100, 100, 255, 75],
      glowRadius: 35,
      hitGlowRadius: 75
    });
    expect(heavySession.engine.muzzleParticles.length).toBeGreaterThan(0);
    heavyLab.seek(1.12);
    expect(heavySession.engine.projectiles.some((p) => p.specId === 'heavyblaster')).toBe(false);
    expect(heavySession.engine.enemyShip.armor.dirtyVersion).toBeGreaterThan(0);

    const pdSession = new CombatSession('doom', 'paragon', 9702);
    const pdLab = new VisualScenarioController(pdSession);
    pdLab.select('WPN-PDBURST-01', 9702);
    pdLab.seek(0.74);
    const pd = pdSession.engine.beams.find((beam) => beam.specId === 'pdburst' && beam.slotId === 'WS 009');
    expect(pd).toBeDefined();
    expect(pd).toMatchObject({
      width: 17,
      visualMode: 'BURST',
      textureType: 'ROUGH',
      textureScrollSpeed: 128,
      pixelsPerTexel: 5,
      fringeColor: [0, 0, 155, 255],
      coreColor: [255, 255, 255, 255],
      glowColor: [100, 100, 255, 255],
      hitGlowBrightenDuration: 0.25,
      isHitting: true,
      contactSurface: 'SHIELD'
    });
    expect(pd!.hitGlowRadius).toBeUndefined();
    expect(pdSession.engine.fxSystem.shieldRipples.length).toBeGreaterThan(0);
  });

  it('consumes Heavy Blaster in-flight glowRadius in both WebGL and Canvas draw paths', () => {
    const session = new CombatSession('doom', 'paragon', 9703);
    const lab = new VisualScenarioController(session);
    lab.select('WPN-HBLASTER-01', 9703);
    lab.seek(0.82);
    const heavy = session.engine.projectiles.find((p) => p.specId === 'heavyblaster' && p.slotId === 'WS 007');
    expect(heavy).toBeDefined();
    expect(heavy).toMatchObject({ glowRadius: 35, glowColor: [100, 100, 255, 75] });

    const webglDraws: unknown[][] = [];
    const hitGlowTex = { id: 'hit-glow' };
    const webglCtx = {
      alpha: 1,
      hitGlowTex,
      textures: { getTexture: (url: string) => ({ url }) },
      batcher: {
        setBlendMode: () => {},
        drawSprite: (...args: unknown[]) => webglDraws.push(args)
      }
    } as any;
    const webgl = new WebGLProjectilePass();
    webgl.renderProjectilesAndMuzzle(session.engine, webglCtx);
    const hasWebglGlow = () => webglDraws.some((call) => call[0] === hitGlowTex && call[3] === 70 && call[4] === 70);
    expect(hasWebglGlow()).toBe(true);

    heavy!.glowRadius = 0;
    webglDraws.length = 0;
    webgl.renderProjectilesAndMuzzle(session.engine, webglCtx);
    expect(hasWebglGlow()).toBe(false);
    heavy!.glowRadius = 35;

    const canvasDraws: unknown[][] = [];
    const fakeCtx = new Proxy<Record<PropertyKey, unknown>>({}, {
      get: (_target, prop) => {
        if (prop === 'drawImage') return (...args: unknown[]) => canvasDraws.push(args);
        if (prop === 'createPattern') return () => null;
        return () => {};
      },
      set: (target, prop, value) => { target[prop] = value; return true; }
    }) as unknown as CanvasRenderingContext2D;
    const originalTinted = textureCache.getTintedImage;
    (textureCache as any).getTintedImage = (url: string) => ({ width: 128, height: 32, __url: url });
    try {
      const canvas = new FXRenderer();
      canvas.drawProjectiles(fakeCtx, session.engine);
      const hasCanvasGlow = () => canvasDraws.some((call) => {
        const image = call[0] as { __url?: string } | undefined;
        return image?.__url === '/game-assets/graphics/fx/hit_glow.png' && call[3] === 70 && call[4] === 70;
      });
      expect(hasCanvasGlow()).toBe(true);

      heavy!.glowRadius = 0;
      canvasDraws.length = 0;
      canvas.drawProjectiles(fakeCtx, session.engine);
      expect(hasCanvasGlow()).toBe(false);
    } finally {
      (textureCache as any).getTintedImage = originalTinted;
      heavy!.glowRadius = 35;
    }
  });

  it('renders Reaper continuous ContrailEngine strips in the Canvas fallback', () => {
    const session = new CombatSession('doom', 'paragon', 9704);
    const lab = new VisualScenarioController(session);
    lab.select('WPN-MSL-01', 9704);
    lab.seek(1.5);
    expect(session.engine.contrails).toHaveLength(0);
    expect(session.engine.contrailEngine.getStats().pointCount).toBeGreaterThan(0);

    const drawCalls: unknown[][] = [];
    const blendModes: unknown[] = [];
    const fakeCtx = new Proxy<Record<PropertyKey, unknown>>({}, {
      get: (_target, prop) => {
        if (prop === 'drawImage') return (...args: unknown[]) => drawCalls.push(args);
        return () => {};
      },
      set: (target, prop, value) => {
        if (prop === 'globalCompositeOperation') blendModes.push(value);
        target[prop] = value;
        return true;
      }
    }) as unknown as CanvasRenderingContext2D;
    const originalTinted = textureCache.getTintedImage;
    (textureCache as any).getTintedImage = (url: string) => ({ width: 64, height: 64, __url: url });
    try {
      new FXRenderer().drawContrails(fakeCtx, session.engine);
    } finally {
      (textureCache as any).getTintedImage = originalTinted;
    }

    expect(drawCalls.length).toBeGreaterThan(0);
    expect(blendModes).toContain('lighter');
  });
});

describe('static-source Canvas strip sampling', () => {
  it('maps source texel density and signed scroll without stretching beam textures', () => {
    expect(computeCanvasStripSegments(128, 100, 1, 0)).toEqual([
      { sourceX: 0, sourceWidth: 100, destX: 0, destWidth: 100 }
    ]);
    expect(computeCanvasStripSegments(128, 50, 1, 0)).toEqual([
      { sourceX: 0, sourceWidth: 50, destX: 0, destWidth: 50 }
    ]);
    expect(computeCanvasStripSegments(128, 1000, 5, 0)).toEqual([
      { sourceX: 0, sourceWidth: 128, destX: 0, destWidth: 640 },
      { sourceX: 0, sourceWidth: 72, destX: 640, destWidth: 360 }
    ]);
    expect(computeCanvasStripSegments(64, 40, 5, 0)).toEqual([
      { sourceX: 0, sourceWidth: 8, destX: 0, destWidth: 40 }
    ]);
    expect(computeCanvasStripSegments(32, 40, 5, 0)).toEqual([
      { sourceX: 0, sourceWidth: 8, destX: 0, destWidth: 40 }
    ]);
    expect(computeCanvasStripSegments(128, 100, 1, -0.25)).toEqual([
      { sourceX: 96, sourceWidth: 32, destX: 0, destWidth: 32 },
      { sourceX: 0, sourceWidth: 68, destX: 32, destWidth: 68 }
    ]);
  });
});

describe('M3 reusable visual fidelity profiles', () => {
  it('maps Onslaught, Paragon and Doom to distinct reusable hull/shield/vent profiles', () => {
    const onslaught = getShipVisualProfile('onslaught');
    const paragon = getShipVisualProfile('paragon');
    const doom = getShipVisualProfile('doom');
    expect(onslaught.shieldProfile).toBe('lowTech');
    expect(paragon.shieldProfile).toBe('highTech');
    expect(paragon.fortressShieldProfile).toBe('fortress');
    expect(doom.phaseColor).not.toEqual(onslaught.phaseColor);
    expect(onslaught.vent.fringeColor).not.toEqual(paragon.vent.fringeColor);
    expect(SHIELD_VISUAL_PROFILES.fortress.brightness).toBeGreaterThan(SHIELD_VISUAL_PROFILES.highTech.brightness);
    expect(ENGINE_VISUAL_PROFILES.LOW_TECH.flameColor).not.toEqual(ENGINE_VISUAL_PROFILES.HIGH_TECH.flameColor);
  });

  it('classifies all four M3 weapon visual families and gives them distinct treatment', () => {
    expect(getWeaponVisualFamily('tpc', 'BALLISTIC_AS_BEAM')).toBe('TPC');
    expect(getWeaponVisualFamily('mark9', 'BALLISTIC')).toBe('BALLISTIC');
    expect(getWeaponVisualFamily('tachyonlance', 'BEAM', false, true)).toBe('BEAM');
    expect(getWeaponVisualFamily('typhoon', 'MISSILE', true)).toBe('MISSILE');
    const tpc = getWeaponVisualProfile('tpc', 'BALLISTIC_AS_BEAM');
    const beam = getWeaponVisualProfile('tachyonlance', 'BEAM', false, true);
    const genericBeam = getWeaponVisualProfile('unknown-beam', 'BEAM', false, true);
    const missile = getWeaponVisualProfile('typhoon', 'MISSILE', true);
    expect(tpc.glowScale).toBe(1);
    expect(tpc.trailScale).toBe(1);
    expect(genericBeam.coreScale).toBeLessThan(genericBeam.trailScale);
    expect(beam.coreScale).toBe(1);
    expect(beam.trailScale).toBe(1);
    expect(missile.impactScale).toBeGreaterThan(tpc.impactScale);
  });

  it('keeps confirmed TPC and Autopulse projectile source values in the content contract', () => {
    const tpc = contentRegistry.getWeapon('tpc');
    const autopulse = contentRegistry.getWeapon('autopulse');
    expect(tpc).toMatchObject({ projLength: 100, projWidth: 35, fadeTime: 0.3, pixelsPerTexel: 1, textureScrollSpeed: -256, coreColor: [255, 255, 255, 200] });
    expect(autopulse).toMatchObject({ projLength: 50, projWidth: 20, fadeTime: 0.25, pixelsPerTexel: 1, textureScrollSpeed: -256, fringeColor: [0, 0, 255, 255], coreColor: [255, 255, 255, 200] });
    expect(tpc?.hitGlowRadius).toBeUndefined();
    expect(autopulse?.hitGlowRadius).toBe(50);
    expect(tpc?.glowSpriteUrl).toBeUndefined();
    expect(tpc?.hardpointGlowSpriteUrl).toBe('/game-assets/graphics/weapons/onslaught_thermal_glow.png');
    expect(getWeaponVisualProfile('tpc', 'BALLISTIC_AS_BEAM').brightness).toBe(1);
    expect(getWeaponVisualProfile('autopulse', 'BALLISTIC_AS_BEAM').brightness).toBe(1);
  });

  it('keeps confirmed Mark IX projectile and muzzle source values in the content contract', () => {
    const mark9 = contentRegistry.getWeapon('mark9');
    expect(mark9).toMatchObject({
      projLength: 40,
      projWidth: 7.5,
      fadeTime: 0.2,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      fringeColor: [235, 255, 215, 235],
      coreColor: [225, 255, 205, 200],
      hitGlowRadius: 50,
      visualRecoil: 10,
      turretOffsets: [28, -4, 28, 4]
    });
    expect(mark9?.muzzleFlashSpec).toEqual({
      length: 45,
      spread: 25,
      particleSizeMin: 12,
      particleSizeRange: 22,
      particleDuration: 0.13,
      particleCount: 35,
      particleColor: [165, 225, 185, 175]
    });
  });

  it('keeps confirmed Heavy Mauler and HVD projectile source values in the content contract', () => {
    const heavy = contentRegistry.getWeapon('heavymauler');
    const hvel = contentRegistry.getWeapon('hveldriver');
    expect(heavy).toMatchObject({
      projLength: 50,
      projWidth: 9,
      fadeTime: 0.2,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      fringeColor: [255, 200, 70, 225],
      coreColor: [255, 200, 200, 180]
    });
    expect(hvel).toMatchObject({
      projLength: 120,
      projWidth: 7.5,
      fadeTime: 0.3,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      fringeColor: [255, 220, 50, 255],
      coreColor: [255, 220, 200, 220]
    });
  });

  it('keeps confirmed Light MG and flak-family visual source values while isolating gameplay-linked discrepancies', () => {
    const light = contentRegistry.getWeapon('lightmg');
    const flak = contentRegistry.getWeapon('flak');
    const dual = contentRegistry.getWeapon('dualflak');
    expect(light).toMatchObject({
      spawnType: 'BALLISTIC',
      visualSpawnType: 'BALLISTIC_AS_BEAM',
      projLength: 35,
      projWidth: 3.5,
      visualRecoil: 3,
      renderBarrelBelow: true,
      fadeTime: 0.3,
      pixelsPerTexel: 5,
      textureScrollSpeed: 64,
      fringeColor: [240, 220, 220, 200],
      coreColor: [245, 245, 245, 80],
      hitGlowRadius: 15,
      projSpriteUrl: '/game-assets/graphics/missiles/shell_small_yellow.png'
    });
    expect(flak).toMatchObject({ projLength: 35, projWidth: 6.5, fadeTime: 0.2, pixelsPerTexel: 5, textureScrollSpeed: 64, coreColor: [255, 255, 200, 150] });
    expect(dual).toMatchObject({ projLength: 35, projWidth: 4.5, fadeTime: 0.2, pixelsPerTexel: 5, textureScrollSpeed: 64, coreColor: [255, 255, 200, 150] });
    expect(dual?.muzzleFlashSpec).toEqual({
      length: 40,
      spread: 25,
      particleSizeMin: 8,
      particleSizeRange: 8,
      particleDuration: 0.12,
      particleCount: 46,
      particleColor: [255, 155, 75, 245]
    });
    // Source dualflak proximity gameplay is 15/30; the existing web gameplay value remains intentionally unchanged in this visual-only batch.
    expect(dual?.proximityFuse).toEqual({ range: 35, explosionRadius: 50, soundKey: 'flak_explosion' });
  });

  it('keeps confirmed source beam widths, texel density and RGBA in the content contract', () => {
    expect(contentRegistry.getWeapon('tachyonlance')).toMatchObject({
      beamWidth: 25,
      beamVisualMode: 'BURST',
      pixelsPerTexel: 5,
      textureScrollSpeed: 292,
      fringeColor: [85, 25, 215, 255],
      coreColor: [255, 255, 255, 255],
      glowColor: [165, 100, 255, 235]
    });
    expect(contentRegistry.getWeapon('gravitonbeam')).toMatchObject({
      beamWidth: 20,
      beamVisualMode: 'SUSTAINED',
      pixelsPerTexel: 5,
      textureScrollSpeed: 260,
      fringeColor: [5, 135, 175, 255],
      coreColor: [200, 225, 255, 255]
    });
    expect(contentRegistry.getWeapon('taclaser')).toMatchObject({
      beamWidth: 13,
      beamVisualMode: 'SUSTAINED',
      pixelsPerTexel: 5,
      textureScrollSpeed: 72,
      fringeColor: [0, 255, 0, 225],
      coreColor: [255, 255, 255, 255]
    });
    expect(contentRegistry.getWeapon('pdburst')).toMatchObject({
      beamWidth: 17,
      beamVisualMode: 'BURST',
      beamSourceChargeupTime: 0.1,
      beamSourceChargedownTime: 0.1,
      textureType: 'ROUGH',
      pixelsPerTexel: 5,
      textureScrollSpeed: 128,
      fringeColor: [0, 0, 155, 255],
      coreColor: [255, 255, 255, 255],
      glowColor: [100, 100, 255, 255]
    });
    expect(contentRegistry.getWeapon('tachyonlance')?.hitGlowRadius).toBeUndefined();
    expect(contentRegistry.getWeapon('gravitonbeam')?.hitGlowRadius).toBeUndefined();
    expect(contentRegistry.getWeapon('taclaser')?.hitGlowRadius).toBeUndefined();
    expect(contentRegistry.getWeapon('pdburst')?.hitGlowRadius).toBeUndefined();
  });

  it('keeps Heavy Blaster source rendering values without changing its Web collision spawn type', () => {
    expect(contentRegistry.getWeapon('heavyblaster')).toMatchObject({
      spawnType: 'BALLISTIC',
      visualSpawnType: 'BALLISTIC_AS_BEAM',
      projLength: 45,
      projWidth: 7,
      fadeTime: 0.3,
      textureScrollSpeed: 64,
      pixelsPerTexel: 5,
      fringeColor: [100, 100, 255, 255],
      coreColor: [255, 255, 255, 255],
      glowColor: [100, 100, 255, 75],
      glowRadius: 35,
      hitGlowRadius: 75,
      projSpriteUrl: '/game-assets/graphics/missiles/shell_gauss_cannon.png'
    });
    const visual = getWeaponVisualProfile('heavyblaster', 'BALLISTIC_AS_BEAM');
    expect(visual.trailScale).toBe(1);
    expect(visual.glowScale).toBe(1);
    expect(visual.coreScale).toBe(1);
    const pdVisual = getWeaponVisualProfile('pdburst', 'BEAM', false, true);
    expect(pdVisual.trailScale).toBe(1);
    expect(pdVisual.glowScale).toBe(1);
    expect(pdVisual.coreScale).toBe(1);
  });

  it('routes projectile impacts by surface without deriving fireball size from hit glow', () => {
    const shield = getProjectileImpactVisualProfile({
      specId: 'typhoon', damageType: 'HIGH_EXPLOSIVE', damage: 4000, isRocket: true, surface: 'SHIELD'
    });
    const hull = getProjectileImpactVisualProfile({
      specId: 'typhoon', damageType: 'HIGH_EXPLOSIVE', damage: 4000, isRocket: true, surface: 'HULL'
    });
    const energyShield = getProjectileImpactVisualProfile({
      specId: 'heavyblaster', damageType: 'ENERGY', damage: 500, isRocket: false, surface: 'SHIELD'
    });
    expect(shield.family).toBe('HEAVY_TORPEDO');
    expect(shield.shieldRippleRadius).toBeGreaterThan(0);
    expect(shield.sparkCount).toBeGreaterThan(0);
    expect(hull.family).toBe('HEAVY_TORPEDO');
    expect(hull.sparkCount).toBe(0);
    expect(energyShield.family).toBe('ENERGY');
    expect(energyShield.shieldRippleRadius).toBeGreaterThan(0);
  });

  it('keeps projectile hit glow and source missile explosion as independent visual channels', () => {
    const engine = new CombatEngine('onslaught', 'paragon', 9711);
    const pos = new Vector2(12, -8);
    engine.fxSystem.spawnHitGlow(pos, 75, [100, 100, 255]);
    expect(engine.hitGlows).toHaveLength(1);
    expect(engine.hitGlows[0]).toMatchObject({ radius: 75, color: [100, 100, 255] });
    expect(engine.explosions).toHaveLength(0);
    engine.fxSystem.update(0.19);
    expect(engine.hitGlows).toHaveLength(0);

    engine.fxSystem.spawnSourceMissileExplosion(pos, { radius: 350, color: [255, 100, 100, 255] });
    expect(engine.explosions).toHaveLength(1);
    expect(engine.explosions[0]).toMatchObject({
      maxRadius: 350,
      color: [255, 100, 100],
      visualKind: 'missile',
      sourceAuthored: true,
      hasShockwaveRing: false
    });
  });

  it('uses deterministic fixed-step cadence for sustained beam contact FX and sound events', () => {
    const run = () => {
      const state: { contactSurface?: 'SHIELD' | 'HULL'; contactFxCooldown?: number; contactSoundCooldown?: number } = {};
      let fx = 0;
      let soundEvents = 0;
      for (let i = 0; i < 18; i++) {
        const pulse = advanceBeamContactPulse(state, 'HULL', 1 / 60);
        if (pulse.emitFx) fx++;
        if (pulse.emitSound) soundEvents++;
      }
      return { fx, soundEvents, state };
    };
    const first = run();
    const replay = run();
    expect(replay).toEqual(first);
    expect(first.fx).toBeGreaterThan(1);
    expect(first.fx).toBeLessThan(18);
    expect(first.soundEvents).toBeGreaterThan(1);
    expect(first.soundEvents).toBeLessThan(first.fx);
    const surfaceChange = advanceBeamContactPulse(first.state, 'SHIELD', 1 / 60);
    expect(surfaceChange).toEqual({ emitFx: true, emitSound: true });
  });

  it('keeps confirmed missile body, engine, smoke and trail visual contracts without rewriting gameplay stats', () => {
    expect(contentRegistry.getWeapon('typhoon')).toMatchObject({
      projLength: 23,
      projWidth: 14,
      projSpriteUrl: '/game-assets/graphics/missiles/missile_torpedo_compact.png',
      engineAcceleration: 220,
      maxSpeed: 450,
      missileHp: 350,
      missileEngineVisualSpec: { nozzleOffset: -11, width: 10, length: 80, color: [255, 100, 100, 255], glowSizeMult: 2.5, glowAlternateColor: [255, 0, 0, 255] },
      missileTrailSpec: { duration: 2, baseWidth: 15, widenMult: 1, minSeg: 5, spawnOffset: 0, color: [255, 100, 100, 50], blendMode: 'GLOW' },
      missileExplosionVisualSpec: { radius: 350, color: [255, 100, 100, 255] }
    });
    expect(contentRegistry.getWeapon('typhoon')?.isGuided).not.toBe(true);
    expect(contentRegistry.getWeapon('annihilatorpod')).toMatchObject({
      projLength: 18,
      projWidth: 4,
      missileEngineVisualSpec: { nozzleOffset: -11, width: 4, length: 30, color: [255, 125, 25, 255] },
      missileTrailSpec: { duration: 0.5, baseWidth: 8, widenMult: 2, minSeg: 5, spawnOffset: 0, color: [75, 75, 75, 150], blendMode: 'NORMAL' },
      missileExplosionVisualSpec: { radius: 75, color: [255, 165, 0, 255] }
    });
    expect(contentRegistry.getWeapon('sabot')).toMatchObject({
      projLength: 18,
      projWidth: 9,
      projSpriteUrl: '/game-assets/graphics/missiles/missile_sabot.png',
      missileEngineVisualSpec: { nozzleOffset: -9, width: 8, length: 20, color: [255, 175, 100, 255], glowSizeMult: 1.5 },
      missileTrailSpec: { duration: 2, baseWidth: 8, widenMult: 2, minSeg: 7, spawnOffset: -10, color: [100, 100, 100, 150], blendMode: 'NORMAL' },
      missileExplosionVisualSpec: { radius: 125, color: [255, 165, 0, 255] }
    });
    expect(contentRegistry.getWeapon('atropos_single')).toMatchObject({
      projLength: 21,
      projWidth: 10,
      projSpriteUrl: '/game-assets/graphics/missiles/torpedo_guided2.png',
      missileEngineVisualSpec: { nozzleOffset: -10, width: 10, length: 30, color: [255, 150, 100, 255], glowSizeMult: 2, glowAlternateColor: [255, 200, 0, 255] },
      missileTrailSpec: { duration: 2, baseWidth: 10, widenMult: 2, minSeg: 5, spawnOffset: -15, color: [155, 100, 70, 75], blendMode: 'GLOW' },
      missileExplosionVisualSpec: { radius: 250, color: [255, 155, 100, 255] }
    });
    expect(contentRegistry.getWeapon('typhoon')?.hitGlowRadius).toBeUndefined();
    expect(contentRegistry.getWeapon('atropos_single')?.hitGlowRadius).toBeUndefined();
    expect(contentRegistry.getWeapon('annihilatorpod')?.hitGlowRadius).toBeUndefined();
    expect(contentRegistry.getWeapon('sabot')?.hitGlowRadius).toBeUndefined();
  });

  it('uses a layered capital explosion profile for sample-ship destruction', () => {
    const small = getExplosionVisualProfile(60);
    const capital = getExplosionVisualProfile(180);
    expect(capital.flash).toBeGreaterThan(small.flash);
    expect(capital.smoke).toBeGreaterThan(small.smoke);
    expect(capital.debris).toBeGreaterThan(small.debris);
  });

  it('keeps ordinary, missile and ship-destruction explosion profiles distinct', () => {
    const impact = getExplosionVisualProfile(60, 'impact');
    const missile = getExplosionVisualProfile(60, 'missile');
    const ship = getExplosionVisualProfile(180, 'ship', 'onslaught');
    expect(missile.shockwave).toBeGreaterThan(impact.shockwave);
    expect(ship.smoke).toBeGreaterThan(missile.smoke);
    expect(ship.debris).toBeGreaterThan(missile.debris);
  });

  it('caps shield hit ripples to the four shader slots while merging nearby hits', () => {
    const shield = new Shield('FRONT', 180, 250, 1, 0);
    shield.absorbDamage(100, 'ENERGY', 0);
    shield.absorbDamage(100, 'ENERGY', 0.05);
    expect(shield.ripples).toHaveLength(1);
    expect(shield.ripples[0].intensity).toBeGreaterThan(1);
    for (const angle of [0.6, 1.2, 1.8, 2.4, 3.0, 3.6]) shield.absorbDamage(100, 'KINETIC', angle);
    expect(shield.ripples).toHaveLength(4);
  });

  it('keeps every M3 capture checkpoint inside its deterministic VIS scene', () => {
    for (const scene of VISUAL_SCENARIOS) {
      expect(scene.checkpoints.length).toBeGreaterThan(0);
      expect(scene.checkpoints).toEqual([...scene.checkpoints].sort((a, b) => a - b));
      expect(scene.checkpoints.every((time) => time >= 0 && time <= scene.duration)).toBe(true);
    }
  });

  it('reuses the same controlled hull scene across Onslaught, Paragon and Doom profiles', () => {
    const session = new CombatSession('onslaught', 'paragon', 7331);
    const lab = new VisualScenarioController(session);
    lab.select('VIS-01', 7331);
    lab.seek(1.25);
    expect(session.engine.playerShip.spec.id).toBe('onslaught');
    lab.setPreviewShip('paragon');
    expect(session.engine.playerShip.spec.id).toBe('paragon');
    expect(lab.time).toBeCloseTo(1.25, 5);
    lab.setPreviewShip('doom');
    expect(session.engine.playerShip.spec.id).toBe('doom');
    expect(lab.time).toBeCloseTo(1.25, 5);
    lab.setPreviewShip(null);
    expect(session.engine.playerShip.spec.id).toBe('onslaught');
  });
});

describe('V08 target-resolution HUD layout', () => {
  it('selects compact, standard and expanded layouts at the three acceptance resolutions', () => {
    expect(getHudDensity(1280, 720)).toBe('compact');
    expect(getHudDensity(1920, 1080)).toBe('standard');
    expect(getHudDensity(2560, 1440)).toBe('expanded');
    expect(getHudLayoutProfile(1280, 720).panelScale).toBeLessThan(1);
    expect(getHudLayoutProfile(1920, 1080).panelScale).toBe(1);
    expect(getHudLayoutProfile(2560, 1440).panelScale).toBeGreaterThan(1);
  });
});

describe('deterministic visual primitives', () => {
  it('replays the same seeded samples', () => {
    const a = new VisualRandom(1234);
    const b = new VisualRandom(1234);
    expect(Array.from({ length: 20 }, (_, i) => a.sample('fx', i)))
      .toEqual(Array.from({ length: 20 }, (_, i) => b.sample('fx', i)));
    expect(a.frame('spark', 1.25)).toBe(b.frame('spark', 1.25));
  });

  it('rejects bundle-root traversal', () => {
    const resolver = new AssetResolver();
    expect(() => resolver.url('../../outside.txt')).toThrow(/escapes bundle root/);
    expect(resolver.url('graphics/../sounds/test.ogg')).toBe('/game-assets/sounds/test.ogg');
  });
});
