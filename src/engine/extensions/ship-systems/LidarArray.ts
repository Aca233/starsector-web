import { nativeSystem } from './NativeSystemFactory';
import { advanceWeaponBoostAI } from './SystemAI';

/** LidarArrayStats: passive range is replaced (not added to) active range. */
export const lidarArray = nativeSystem('lidararray', {
  description: '闲置时实弹/能量射程+35%；启动后+100%，射速随展开程度最高×3，弹速+50%，后坐力×0.25。预热禁非导弹；生效及退出只允许非光束实弹/能量硬挂点与导弹开火。',
  implementationDetails: '原版3.25/5/1秒阶段、10秒冷却；被动/主动射程、射速、弹速、后坐力及逐挂点开火限制。雷达碟动画及装饰性照射光束未移植。',
  passiveModifiers: () => ({ weapons: { BALLISTIC: { rangePercent: 35 }, ENERGY: { rangePercent: 35 } } }),
  modifiers: s => ({ recoilMultiplier: .25, weapons: {
    BALLISTIC: { rangePercent: 100, rateOfFireMultiplier: 1 + 2 * s.effectLevel, projectileSpeedPercent: 50 },
    ENERGY: { rangePercent: 100, rateOfFireMultiplier: 1 + 2 * s.effectLevel, projectileSpeedPercent: 50 },
  } }),
  weaponEnabled: (s,m) => !s.isActive || m.spec.weaponType === 'MISSILE' || (s.state !== 'IN' && m.mountType === 'HARDPOINT' && !m.spec.isBeam && (m.spec.weaponType === 'BALLISTIC' || m.spec.weaponType === 'ENERGY')),
  advanceAI: ctx => {
    if (!ctx.ship.weapons.some(m => m.mountType === 'HARDPOINT' && !m.spec.isBeam && !m.isDisabled && m.ammo > 0 && (m.spec.weaponType === 'BALLISTIC' || m.spec.weaponType === 'ENERGY'))) return;
    advanceWeaponBoostAI(ctx, 'BALLISTIC');
    advanceWeaponBoostAI(ctx, 'ENERGY');
  },
});
