import data from './native-flare-weapons.json';
import { nativeSystem } from './NativeSystemFactory';
import { systemWeaponLauncher } from './SystemWeaponLauncher';
import { Vector2 } from '../../math/Vector2';
import { sound } from '../../audio/SoundManager';
import type { LauncherSmokeSpec, Projectile } from '../../simulation/Weapon';

export const flareSystems = (Object.keys(data) as (keyof typeof data)[]).map(id => {
  const {weapon, row, projectile: source, engineStyle: style} = data[id];
  const number = (key: keyof typeof row) => Number(row[key] || 0);
  const engine = source.engineSlots[0];
  const jammer = source.missileType === 'FLARE_JAMMER';
  return nativeSystem(id, {
    description: jammer ? '按原生发射口释放500耐久的战机类诱饵，朝附近敌舰盾缘环绕，吸引敌方火控；不会虚构强制改写导弹锁定。' : '按舰体原生发射口投放热诱弹；敌方可见制导导弹进入300范围时按原版概率与ECCM判定，失败后不重复重骰。',
    implementationDetails: 'FlareAI/SeekerFlareAI 的连发、范围、概率、单诱饵免疫集合、延迟追踪与真实弹体锁定；使用原生引擎尺寸/颜色。追踪拦截点由Web制导计算，原版粒子尾迹和引擎逐帧推力光变尚未完整还原。',
    resources: {textures: ['/game-assets/' + source.sprite], sounds: [weapon.fireSoundTwo]},
    ...systemWeaponLauncher(number('burst size'), (ship, slot, world) => {
      if (!world.projectiles) throw new Error('System weapons require the combat projectile collection');
      const facing = ship.facingRad + slot.baseAngleDeg * Math.PI / 180;
      const angle = facing + (world.combatRandom.next() - .5) * number('min spread') * Math.PI / 180;
      const pos = ship.pos.clone().add(new Vector2(slot.x, slot.y).rotate(ship.facingRad));
      const p: Projectile = {
        id: world.combatRandom.next(), sourceShipId: ship.id, slotId: slot.slotId, isPlayer: ship.isPlayer, teamId: ship.teamId,
        specId: weapon.id, pos, prevPos: pos.clone(), vel: Vector2.fromAngle(angle, number('launch speed')).add(ship.vel),
        facingRad: angle, damage: number('damage/shot') * ship.crDamageDealtMultiplier, baseDamage: number('damage/shot'),
        damageType: 'ENERGY', empDamage: number('emp') * ship.crDamageDealtMultiplier, radius: source.collisionRadius,
        rangeRemaining: number('range'), totalRange: number('range'), elapsedTime: 0,
        color: source.explosionColor.slice(0, 3) as [number, number, number], spawnType: 'MISSILE',
        isRocket: true, isGuided: false, isFlare: true, isFighterDecoy: jammer, renderTargetIndicator: true,
        flareLife: number('flight time'), flareMaxLife: number('flight time'),
        flareBehavior: {mode: jammer ? 'JAMMER' : source.missileType === 'FLARE_SEEKER' ? 'SEEKER' : 'STANDARD',
          ...source.behaviorSpec, flameoutTime: source.flameoutTime, noEngineGlowTime: source.noEngineGlowTime, fadeTime: source.fadeTime},
        engineAcceleration: source.engineSpec.acc, missileDeceleration: source.engineSpec.dec, maxSpeed: number('proj speed'),
        maxTurnRate: source.engineSpec.turnRate * Math.PI / 180, maxTurnAcceleration: source.engineSpec.turnAcc * Math.PI / 180,
        hitpoints: number('proj hitpoints'), maxHitpoints: number('proj hitpoints'),
        projSpriteUrl: '/game-assets/' + source.sprite, projLength: source.size[1], projWidth: source.size[0],
        missileEngineVisualSpec: {nozzleOffset: engine.loc[0], width: engine.width, length: engine.length,
          color: style.engineColor as [number, number, number, number]},
        missileExplosionVisualSpec: {radius: source.explosionRadius, color: source.explosionColor as [number, number, number, number]},
      };
      world.projectiles.push(p);
      world.spawnSystemSmoke?.(weapon.smokeSpec as LauncherSmokeSpec, pos, facing, ship.vel);
      sound.play(weapon.fireSoundTwo, ship.isPlayer ? .85 : .45);
      return number('burst delay');
    }),
  });
});
