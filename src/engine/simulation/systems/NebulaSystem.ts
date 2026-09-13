import { Vector2 } from '../../math/Vector2';
import { NebulaCloud } from '../CombatTypes';
import { Ship } from '../Ship';
import { Projectile } from '../Weapon';

export class NebulaSystem {
  public nebulae: NebulaCloud[] = [];

  constructor() {}

  public init() {
    this.nebulae = [];
    const configs: { pos: Vector2; radius: number; type: 'AMBER' | 'BLUE' }[] = [
      { pos: new Vector2(0, 750), radius: 650, type: 'AMBER' },
      { pos: new Vector2(-150, -750), radius: 680, type: 'BLUE' },
      { pos: new Vector2(500, 350), radius: 520, type: 'AMBER' }
    ];

    for (let i = 0; i < configs.length; i++) {
      const c = configs[i];
      const spriteUrl = c.type === 'AMBER'
        ? '/game-assets/graphics/terrain/nebula_amber.png'
        : '/game-assets/graphics/terrain/nebula512_blue.png';

      this.nebulae.push({
        id: i,
        pos: c.pos,
        radius: c.radius,
        type: c.type,
        rotation: (i * Math.PI) / 3,
        angularVel: (i % 2 === 0 ? 1 : -1) * 0.012,
        scale: 1.6 + (i * 0.2),
        spriteUrl
      });
    }
  }

  public update(
    dt: number,
    allShips: Ship[],
    projectiles: Projectile[],
    spawnNebulaParticle?: (pos: Vector2, color: [number, number, number]) => void
  ) {
    for (const neb of this.nebulae) {
      neb.rotation += neb.angularVel * dt;
    }

    for (const ship of allShips) {
      if (ship.isDead) continue;
      let inNebula = false;
      for (const neb of this.nebulae) {
        if (ship.pos.distanceTo(neb.pos) < neb.radius) {
          inNebula = true;
          break;
        }
      }
      // 星云浓密等离子体阻尼：航速与推力降低 25% (对齐 settings.json nebulaSlowdown = 0.75f)
      ship.terrainSpeedMult = inNebula ? 0.75 : 1.0;
    }

    // 弹丸穿越星云离子阻尼与微粒
    for (const p of projectiles) {
      for (const neb of this.nebulae) {
        if (p.pos.distanceTo(neb.pos) < neb.radius) {
          if (p.isRocket) {
            p.vel.scale(Math.max(0, 1 - dt * 0.2));
          }
          if (spawnNebulaParticle && Math.random() < dt * 1.2) {
            spawnNebulaParticle(p.pos.clone(), neb.type === 'AMBER' ? [255, 170, 60] : [70, 140, 255]);
          }
          break;
        }
      }
    }
  }
}
