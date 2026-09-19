import data from './native-chiral-variants.json';
import { nativeVariantSpec, type NativeVariant } from '../../content/NativeVariantSpec';
import { nativeSystem } from './NativeSystemFactory';
import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../../simulation/Ship';
import type { SystemWorld } from './Types';
const pairs: Readonly<Record<string,string>> = data.pairs;
const variants: Readonly<Record<string,NativeVariant>> = data.variants;
function paired(ship: Ship): NativeVariant | undefined { return variants[pairs[ship.spec.sourceVariantId ?? '']]; }
function spawnPoint(ship: Ship, variant: NativeVariant): Vector2 {
  return ship.pos.clone().add(Vector2.fromAngle(ship.facingRad + (variant.variantId.includes('_left') ? -1 : 1)*Math.PI/2,ship.spec.collisionRadius*1.25));
}
function clear(ship: Ship, pos: Vector2, world: SystemWorld): boolean {
  if (!world.asteroids) return false;
  const padding=ship.spec.collisionRadius*1.25/2;
  return !world.ships.some(other=>other!==ship && !other.isRetreated && other.spec.hullSize!=='FIGHTER' && pos.distanceTo(other.getShieldCenter())<other.shield.radius+padding)
    && !world.asteroids.some(a=>pos.distanceTo(a.pos)<a.radius+padding);
}
export const chiralFigment = nativeSystem('chiral_figment', {
  installReason: spec => variants[pairs[spec.sourceVariantId ?? '']] ? undefined : '需要已定义的配对镜像方案',
  description:'按原生方案的左右旋对应表生成镜像舰。1秒渐入、前0.75秒无碰撞；成形后可独立战斗但不能启用系统或防御。没有虚构20秒自动消失。',
  implementationDetails:'真实原生对侧方案、原舰舰长技能、碰撞安全检查和独立实体。共享Web舰船AI；抖动/受击扰动尚非原版逐帧效果。无原生方案身份的自造装配不能冒充原版映射。',
  resources:{ships:[...new Set(Object.values(variants).map(v=>v.hullId))],weapons:[...new Set(Object.values(variants).flatMap(v=>v.weaponGroups.flatMap(g=>Object.values(g.weapons))))]},
  audio:{activate:'system_interdictor'},
  canActivate:ship=>!!paired(ship),
  onActive:(ship,world)=>{
    const variant=paired(ship);if(!variant)return;
    const pos=spawnPoint(ship,variant);if(!clear(ship,pos,world))return;
    if(!world.spawnShip || !world.addCombatEffect)throw new Error('Chiral figment requires independent combat entity lifecycle');
    const spec={...nativeVariantSpec(variant),captainSkills:{...ship.spec.captainSkills}};
    const figment=world.spawnShip(spec,ship,pos,ship.facingRad+(world.combatRandom.next()-.5)*15*Math.PI/180);
    figment.vel.copy(ship.vel);figment.shield.setActive(false);
    let elapsed=0;
    const apply=()=>{
      figment.runtimeModifiers.set('chiral_figment',{disableSystems:1,disableDefense:1,
        visualAlphaMultiplier:Math.min(1,elapsed)*.67,disableWeapons:elapsed<=1?1:0,disableVenting:elapsed<=1?1:0,
        disableMotion:elapsed<.5?1:0,collisionDisabled:elapsed<=.75?1:0,hullDamageMultiplier:elapsed<=.75?0:1});
      if(elapsed<.5)figment.vel.copy(ship.vel);
    };
    apply();
    world.addCombatEffect(dt=>{if(figment.isDead||figment.isRetreated)return true;elapsed+=dt;apply();return elapsed>1;});
  },
  // Native metadata specifies aiType NONE; do not invent autonomous mirror spawning.
});
