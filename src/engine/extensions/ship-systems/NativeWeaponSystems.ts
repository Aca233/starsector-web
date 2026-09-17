import data from './native-system-weapons.json';
import { nativeSystem } from './NativeSystemFactory';
import { Vector2 } from '../../math/Vector2';
import { sound } from '../../audio/SoundManager';
import type { Ship } from '../../simulation/Ship';
import { systemWeaponLauncher } from './SystemWeaponLauncher';
import type { WeaponMountSlotConfig } from '../../content/ShipSpec';
import type { LauncherSmokeSpec, Projectile } from '../../simulation/Weapon';
import type { SystemWorld } from './Types';

const native = data.canister_flak;
const number = (key: keyof typeof native.row) => Number(native.row[key] || 0);
function emit(ship: Ship, slot: WeaponMountSlotConfig, world: SystemWorld): number {
  if (!world.projectiles) throw new Error('System weapons require the combat projectile collection');
  const random = world.combatRandom;
  const facing = ship.facingRad + slot.baseAngleDeg * Math.PI / 180;
  const angle = facing + (random.next() - .5) * number('min spread') * Math.PI / 180;
  const pos = ship.pos.clone().add(new Vector2(slot.x,slot.y).rotate(ship.facingRad));
  const vel = Vector2.fromAngle(angle, number('launch speed')).add(ship.vel);
  // CanisterFlakPlugin.onFire: scale inherited velocity too, spin both directions,
  // shorten lifetime and override the weapon's next refire interval independently.
  vel.scale(.25 + .75 * random.next());
  const spin = (random.next() < .5 ? -1 : 1) * (.5 + random.next()) * 720 * Math.PI / 180;
  const lifetime = number('flight time') * (.25 + .75 * random.next());
  const delay = .25 + .75 * random.next();
  const source = native.projectile;
  const p: Projectile = {
    id: random.next(),sourceShipId:ship.id,slotId:slot.slotId,isPlayer: ship.isPlayer, teamId: ship.teamId,specId:native.weapon.id,
    pos,prevPos:pos.clone(),vel,facingRad:angle,angularVelocityRad:spin,
    damage:number('damage/shot') * ship.crDamageDealtMultiplier,baseDamage:number('damage/shot'),
    damageType:'HIGH_EXPLOSIVE',empDamage:0,radius:source.collisionRadius,
    rangeRemaining:number('range'),totalRange:number('range'),elapsedTime:0,
    color:source.explosionColor.slice(0,3) as [number,number,number],spawnType:'MISSILE',
    isRocket:true,isGuided:false,inertialFlight:true,fizzleAtRange:source.fizzleOnReachingWeaponRange,
    renderTargetIndicator:true,flightTimeRemaining:lifetime,maxFlightTime:lifetime,
    hitpoints:number('proj hitpoints'),maxHitpoints:number('proj hitpoints'),
    projSpriteUrl:'/game-assets/'+source.sprite,projLength:source.size[1],projWidth:source.size[0],
    // No engine slots in the source; suppress the ordinary missile fallback flame.
    missileEngineVisualSpec:{nozzleOffset:0,width:0,length:0,color:[0,0,0,0]},
    projectileExplosionSpec:{...source.explosionSpec,particleCount:0,particleSizeMin:0,particleSizeRange:0,particleDuration:0,particleColor:[0,0,0,0]},
    proximityFuse:{range:source.behaviorSpec.range,explosionRadius:source.behaviorSpec.explosionSpec.radius,coreRadius:source.behaviorSpec.explosionSpec.coreRadius,soundKey:source.behaviorSpec.explosionSpec.sound},
    proximityExplosionSpec:{...source.behaviorSpec.explosionSpec,minDamageFraction:.5,particleColor:source.behaviorSpec.explosionSpec.particleColor as [number,number,number,number],explosionColor:source.behaviorSpec.explosionSpec.explosionColor as [number,number,number,number],detailedExplosionFlashColorFringe:source.behaviorSpec.explosionSpec.detailedExplosionFlashColorFringe as [number,number,number,number]},
    missileExplosionVisualSpec:{radius:source.explosionRadius,color:source.explosionColor as [number,number,number,number]},
  };
  world.projectiles.push(p);
  world.spawnSystemSmoke?.(native.weapon.smokeSpec as LauncherSmokeSpec,pos,facing,ship.vel);
  sound.play(native.weapon.fireSoundTwo,ship.isPlayer ? .85 : .45);
  return delay;
}
export const canisterFlak = nativeSystem('canister_flak', {
  description:'每个原生系统发射口发射5枚高爆罐弹；近炸半径40、爆炸半径75，使用独立防御槽、次数与恢复。',
  implementationDetails:'S 武器型系统和 CanisterFlakPlugin 的发射口、连发、随机初速/自旋/寿命/间隔，原生高爆范围伤害。专用详细爆炸视觉尚未逐项还原。',
  resources:{textures:['/game-assets/'+native.projectile.sprite],sounds:[native.weapon.fireSoundTwo,native.projectile.behaviorSpec.explosionSpec.sound]},
  ...systemWeaponLauncher(number('burst size'), emit),
});
