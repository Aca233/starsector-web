import type { ShipSystemDefinition } from './Types';
import { advanceWeaponBoostAI } from './SystemAI';

/** data/shipsystems/scripts/AmmoFeedStats.java and ship_systems.csv.
 * No ammoburst alias: that ID does not occur in the installed vanilla CSV.
 */
export const ammoFeed: ShipSystemDefinition = {
  id: 'AMMO_FEED', sourceIds: ['ammofeed'], name: '加速填弹器',
  description: '实弹武器射速最高 +100%，每发幅能消耗 -50%，持续 5 秒；不会凭空补充弹药。',
  implementationDetails: '射速倍率为 1 + 阶段强度，遵守原版 0.05 秒最小射击间隔；IN/ACTIVE/OUT 期间实弹幅能消耗固定减半，能量/导弹不变。1/5/1/10 秒阶段；采用 Web 开火窗口 AI，无专用武器辉光/音效。',
  chargeUp: 1, active: 5, chargeDown: 1, cooldown: 10,
  modifiers: system => ({ weapons: { BALLISTIC: { rateOfFireMultiplier: 1 + system.effectLevel, fluxCostMultiplier: .5 } } }),
  advanceAI: context => advanceWeaponBoostAI(context, 'BALLISTIC')
};
