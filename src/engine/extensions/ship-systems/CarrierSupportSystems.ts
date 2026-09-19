import { needsWings } from './Requirements';
import { nativeSystem } from './NativeSystemFactory';

export const reserveWing = nativeSystem('reservewing', {
  installReason: needsWings,
  description: '每个允许后备部署的机翼补至双倍编制，额外战机持续30秒后返航回收；不增加战备重建率消耗。',
  implementationDetails: '原版0.1秒预热、3秒退出、60秒冷却、基础容量50%使用消耗。一次性补足编制，不无限补生额外战机；rd_no_extra_craft机翼除外。Web甲板采用即时出击及返航入坞，不包含原版逐架弹射动画。',
  canActivate: ship => (ship.spec.fighterWings ?? []).slice(0, ship.spec.fighterBays ?? 0).some(wing => !wing.tags?.includes('rd_no_extra_craft')),
  onActive: (ship, world) => world.deployReserveWing?.(ship),
  advanceAI: ({ship, target, tactical, system = ship.system}) => {
    if (!ship.isDead && !target.isDead && !tactical?.withdrawing && !tactical?.waypoint && ship.pos.distanceTo(target.pos) < 2000
      && (ship.spec.fighterWings?.length ?? 0) > 0 && ship.flux.fluxPercent < .4) system.activate();
  },
});

/** TargetingFeedStats: all three weapon types on this carrier's wing members only.
 * A live carrier relation means replacements spawned mid-use also receive it, and
 * neither projectile nor continuing-beam stats need to be permanently rewritten. */
export const targetingFeed = nativeSystem('targetingfeed', {
  installReason: needsWings,
  description: '本舰所属战机和轰炸机的武器伤害随系统展开程度提高，完全生效时 +50%；持续20秒。不强化航母自身或其他航母的舰载机。',
  implementationDetails: '原版 TargetingFeedStats、CSV 0.5/20/0.5秒阶段、10秒冷却、基础容量50%使用消耗；按真实母舰归属动态作用于弹体和持续光束。新补充舰载机同样生效，退出或母舰战沉后撤除。武器辉光与舰体抖动作用于所属战机，而非航母；动态抖动范围采用 Web 近似。',
  modifiers: system => ({ fighterDamageMultiplier: 1 + .5 * system.effectLevel }),
  advanceAI: ({ship, target, system = ship.system, tactical}) => {
    if (system.isActive || !system.available || ship.isDead || target.isDead || tactical?.waypoint) return;
    if (ship.combatShips.some(craft => craft.sourceCarrier === ship && !craft.isDead && craft.hullHp > 0
      && craft.pos.distanceTo(target.pos) < 1500)) system.activate();
  },
});
