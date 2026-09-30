import type { ShipSystemDefinition } from './Types';
import { usableWeaponReason } from './Requirements';
import { advanceWeaponBoostAI } from './SystemAI';
import { ECLIPSE_ICON_URL, ECLIPSE_PROTOCOL_ID, ZHUYUAN_HULL_ID } from '../../content/ZhuYuanPack';

/** Web-original system. Stateless modifiers use authoritative flux/lifecycle values,
 * so no hidden counters or local-only WeakMaps need snapshot serialization. */
export const eclipseProtocol: ShipSystemDefinition = {
  id: ECLIPSE_PROTOCOL_ID, sourceIds: [], name: '日蚀协议（原创）',
  iconUrl: ECLIPSE_ICON_URL, resources: { textures: [ECLIPSE_ICON_URL] },
  description: '烛渊专属。启动产生 6% 最大容量硬载荷；持续 5 秒，能量伤害 +25%～100%（随当前总载荷 0%～75% 线性提升），能量弹速 +60%、射程 +20%。代价：航速 -35%、耗散 -50%、护盾承伤 +30%。16 秒冷却。',
  implementationDetails: 'Web 原创；0.4/5/0.6 秒阶段，加减益均随强度淡入淡出。只增幅能量伤害，不增幅 EMP。允许主动排散；不解除过载、不清除硬载荷。青蓝色武器辉光与残像使用现有引擎表现；专属技能图标使用用户提供的日蚀素材。',
  chargeUp: .4, active: 5, chargeDown: .6, cooldown: 16,
  fluxPerUseFraction: .06, hardFlux: true,
  installReason: spec => (spec.sourceHullId ?? spec.id) === ZHUYUAN_HULL_ID ? undefined : '需要烛渊棱镜核心（专属舰体）',
  activationReason: ship => usableWeaponReason(ship, 'ENERGY', '需要至少一门可用的能量武器'),
  statusText: (system) => system.isActive
    ? `日蚀：能量伤害 +${Math.round((.25 + Math.min(1, (system.owner?.flux.fluxPercent ?? 0) / .75) * .75) * system.effectLevel * 100)}% · 护盾/散热削弱`
    : undefined,
  modifiers: (system, _capacity, owner) => {
    const level = system.effectLevel;
    const pressure = Math.min(1, Math.max(0, (owner?.flux.fluxPercent ?? 0) / .75));
    return {
      speedPercent: -35 * level, dissipationMultiplier: 1 - .5 * level,
      shieldDamageMultiplier: 1 + .3 * level,
      weapons: { ENERGY: {
        damageMultiplier: 1 + (.25 + .75 * pressure) * level,
        projectileSpeedPercent: 60 * level, rangePercent: 20 * level,
      } },
    };
  },
  visuals: {
    weaponGlow: { color: [70, 235, 225, 210], types: ['ENERGY'] },
    jitterUnder: { color: [70, 235, 225, 90], copies: 4, range: 3, minRange: 1, radiusFraction: .02 },
  },
  advanceAI: context => {
    if (context.ship.flux.fluxPercent < .2 || context.ship.flux.fluxPercent > .65) return;
    advanceWeaponBoostAI(context, 'ENERGY');
  },
};
