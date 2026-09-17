import type { WeaponEffectDefinition } from './Types';
import { applyComponentDamage } from '../../simulation/systems/weapon/ComponentDamage';
import { pickEmpShipTarget } from '../../simulation/systems/weapon/TachyonLanceEffect';
import { sound } from '../../audio/SoundManager';
export const sabotHit: WeaponEffectDefinition = {
  id: 'com.fs.starfarer.api.impl.combat.SabotOnHitEffect',
  resources:{sounds:['tachyon_lance_emp_impact_01','tachyon_lance_emp_impact_02','tachyon_lance_emp_impact_03']},
  hit: (p, ship, impactWorld, shield, source, ctx) => {
    if (shield || ctx.random.next() >= .25) return;
    const point = pickEmpShipTarget(ship, impactWorld, ctx.random);
    const end = point.local.clone().rotate(ship.facingRad).add(ship.pos);
    applyComponentDamage(ship, point.local, {armorDamage:0, hullDamage:0}, p.empDamage ?? 0, source);
    ctx.fx.spawnNativeEmpArc(impactWorld, end, ship, 20, [25,100,155,255], [255,255,255,255]);
    const variant = 1 + Math.floor(ctx.visualRandom.next() * 3);
    sound.playAtPos('tachyon_lance_emp_impact_0' + variant, end, ctx.playerShip.pos, .3, 1.5);
  }
};
