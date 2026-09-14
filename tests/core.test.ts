import { describe, expect, it } from 'vitest';
import { ArmorGrid } from '../src/engine/simulation/ArmorGrid';
import { Vector2 } from '../src/engine/math/Vector2';
import { parseStarsectorCsv, parseStarsectorJson } from '../src/engine/data/StarsectorTextParsers';
import { contentRegistry } from '../src/engine/content/ContentRegistry';
import { ShipWeaponControlSystem } from '../src/engine/simulation/systems/ShipWeaponControlSystem';
import { modManager, type ShipSpec } from '../src/engine/modding/ModManager';
import type { WeaponSpec } from '../src/engine/simulation/Weapon';
import { FixedTimestepScheduler } from '../src/engine/simulation/FixedTimestepScheduler';
import { VisualRandom } from '../src/engine/runtime/VisualRandom';
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
});

describe('V01 controlled Visual Lab scenarios', () => {
  it('matches the twelve acceptance scenes from the M2 plan', () => {
    expect(VISUAL_SCENARIOS.map((scene) => [scene.id, scene.title])).toEqual([
      ['VIS-01', '攻势静止，四个朝向'],
      ['VIS-02', '怠速、推进、松键、侧移、冲刺'],
      ['VIS-03', '护盾开关与单次受击'],
      ['VIS-04', '多次连续护盾命中'],
      ['VIS-05', 'TPC 单发'],
      ['VIS-06', '实弹炮连续开火'],
      ['VIS-07', '光束充能、照射、停止'],
      ['VIS-08', '导弹直飞、转弯、命中'],
      ['VIS-09', '排散完整过程'],
      ['VIS-10', '小命中与舰船爆炸'],
      ['VIS-11', '固定状态 HUD'],
      ['VIS-12', '双舰加舰载机实战']
    ]);
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
    const missile = getWeaponVisualProfile('typhoon', 'MISSILE', true);
    expect(tpc.glowScale).toBeGreaterThan(1);
    expect(beam.coreScale).toBeLessThan(beam.trailScale);
    expect(missile.impactScale).toBeGreaterThan(tpc.impactScale);
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
