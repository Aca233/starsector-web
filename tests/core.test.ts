import { describe, expect, it } from 'vitest';
import { ArmorGrid } from '../src/engine/simulation/ArmorGrid';
import { Vector2 } from '../src/engine/math/Vector2';
import { parseStarsectorCsv, parseStarsectorJson } from '../src/engine/data/StarsectorTextParsers';
import { contentRegistry } from '../src/engine/content/ContentRegistry';
import { ShipWeaponControlSystem } from '../src/engine/simulation/systems/ShipWeaponControlSystem';
import type { ShipSpec } from '../src/engine/modding/ModManager';
import type { WeaponSpec } from '../src/engine/simulation/Weapon';
import { FixedTimestepScheduler } from '../src/engine/simulation/FixedTimestepScheduler';
import { VisualRandom } from '../src/engine/runtime/VisualRandom';
import { CombatEngine } from '../src/engine/simulation/CombatEngine';
import { AssetResolver } from '../src/engine/assets/AssetResolver';

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
    const ship = {
      weaponSlots: [{ slotId: 'TEST', mountType: 'TURRET', slotSize: 'SMALL', x: 0, y: 0, baseAngleDeg: 0, arcDeg: 360, defaultWeaponId: weapon.id }]
    } as ShipSpec;
    const control = new ShipWeaponControlSystem();
    control.init(ship, 0);
    expect(control.weapons).toHaveLength(1);
    expect(control.weapons[0].spec).toBe(weapon);
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

describe('restart/switch lifecycle', () => {
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
