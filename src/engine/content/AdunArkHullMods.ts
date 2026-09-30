import type { HullModDefinition } from '../extensions/HullMods';
import type { ShipSpec } from './ShipSpec';
import { ADUN_ARK_ID, ARK_HULLMODS as M, arkOwner } from './AdunArkIds';
const core = (s: ShipSpec) => (s.sourceHullId ?? s.id) === ADUN_ARK_ID && !s.isModuleHull;
const wing = (s: ShipSpec) => ['PORT', 'STARBOARD'].includes(arkOwner(s.sourceHullId ?? s.id) ?? '') && (s.fighterBays ?? 0) > 0;
const meta = (cost: number, icon: string, uiTags: string[], builtInOnly = false) => ({
 cost: { CAPITAL_SHIP: cost }, icon: 'graphics/fx/web_adun_ark/systems-v19/' + icon + '.png',
 uiTags, builtInOnly, manufacturer: '方舟专属',
});
export const arkHullMods: readonly HullModDefinition[] = [{
 id: M.reactor, name: '方舟 · 太阳能核心', status: 'implemented',
 refit: meta(0, 'reactor', ['特殊'], true), applicable: s => core(s) ? null : '仅限亚顿之矛方舟核心',
 description: '舰体内置，0OP、不可卸下。三技能共用100太阳能：F太阳锻炉40、G护盾超载35、H重构50，互斥运行。工程段完整时闲置恢复2.5/秒，损毁降到0.8/秒并损失45%航速、25%转向；技能运行时不回能。过载/排散中断但不退还消耗。提供的是现有真实资源机制，不另加一套独立充能。可选日冕耦合器改动锻炉强度与恢复；快启矩阵改动实际护盾展开。',
}, {
 id: M.coupler, name: '方舟 · 日冕超导耦合器', status: 'implemented',
 refit: meta(24, 'coupler', ['武器', '特殊']), conflicts: [M.matrix],
 applicable: s => core(s) ? null : '仅限方舟核心；增益由太阳锻炉传到存活模块',
 description: '核心专用，24OP。太阳锻炉的能量伤害加成由45%提高到65%，射速由20%提高到30%；期间每发载荷加价从35%升到55%。共享太阳能闲置恢复降低30%（工程在线2.5→1.75/秒，损毁0.8→0.56/秒）。不增加技能时长、初始储备或主炮弹药，非锻炉状态没有额外武器加成。与矩阵快启互斥。',
}, {
 id: M.matrix, name: '方舟 · 矩阵快启中继', status: 'implemented',
 refit: meta(20, 'matrix', ['护盾', '特殊']), conflicts: [M.coupler],
 applicable: s => core(s) && s.shieldType === 'OMNI' ? null : '仅限方舟核心的全向护盾',
 description: '核心专用，20OP。将基础全向盾的真实展开由约64.1秒缩短至3秒，碰撞保护与显示同步，不是只画满圈。代价是核心载荷容量−15%、护盾维持耗散×1.25。不加盾容量、承伤减免或G时长，不改变其它舰和模块。敏捷护盾等展开百分比仍按宿主规则相加。与日冕耦合器互斥。',
 stats: s => ({ shieldUnfoldRatePercent: Math.max(0, ((s.shieldArcDeg ?? 360) * Math.PI * Math.max(1, s.shieldRadius ?? 1) / (100 * 180) / 3 - 1) * 100), capacityPercent: -15, shieldUpkeepMultiplier: 1.25 }),
}, {
 id: M.hangar, name: '方舟 · 相位回收甲板', status: 'implemented',
 refit: meta(16, 'hangar', ['战机', '支援']),
 applicable: s => wing(s) ? null : '仅限方舟左翼或右翼航空模块；先点击对应模块',
 description: '单翼专用，每侧16OP。该侧联队战损补充时间×0.65、补充率损耗×0.8，代价是出击范围×0.7。只影响装配侧，另一翼不继承；不加飞机数量、不瞬间复活、不缩短存活轰炸机的返舰装弹时间。适合Z召回后围绕母舰重构、近域反击。',
 stats: () => ({ fighterRefitTimeMultiplier: .65, replacementRateDecreaseMultiplier: .8, fighterWingRangeMultiplier: .7 }),
}];
