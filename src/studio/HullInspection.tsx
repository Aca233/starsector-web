import { defenseSystemId, tacticalSystemIds } from '../engine/extensions/ship-systems/Loadout';
import type { ShipSpec } from '../engine/content/ShipSpec';
import { effectiveHullStats, hullModDefinitions } from '../engine/extensions/HullMods';
import { shipSystemDefinitions } from '../engine/extensions/ship-systems/Registry';
import { data, nativeHull, nativeRefit } from './DesignModel';
import { RefitInspection, type InspectionTarget } from './RefitInspection';
import { RefitExplanationText, RefitHoverTerm } from './RefitHoverTerms';
import { ModInformation } from './HullModInformation';

export function HullInspection({ spec, children, enabled, unavailable }: {
  spec: ShipSpec; children: InspectionTarget; enabled: boolean; unavailable?: string | null;
}) {
  return <RefitInspection title={data.ships[spec.id]?.name ?? spec.id} enabled={enabled} dismissOnClick className="refit-hull-inspection"
    content={<HullBaselineInformation spec={spec} unavailable={unavailable} />}>{children}</RefitInspection>;
}
/** A hull reference, never the active draft or one of its suggested loadouts. Keep the baseline explicit. */
function HullBaselineInformation({ spec, unavailable }: { spec: ShipSpec; unavailable?: string | null }) {
  const raw = nativeHull(spec.id) ?? spec;
  const baseline: ShipSpec = { ...spec, maxFlux: raw.maxFlux, fluxDissipation: raw.fluxDissipation,
    maxSpeed: raw.maxSpeed, hitpoints: raw.hitpoints, armorRating: raw.armorRating,
    hullMods: [], sMods: [], captainSkills: undefined };
  const stats = effectiveHullStats(baseline);
  const mods = [...new Set([...(spec.builtInHullMods ?? []), ...(nativeRefit.sourceBuiltInMods?.[spec.id] ?? [])])];
  const systems = [...tacticalSystemIds(spec).map((id, index) => ({id, label: '舰船技能 ' + (index + 1)})), {id:defenseSystemId(spec), label:'右键技能'}]
    .filter(system => system.id !== 'NONE');
  const name = data.ships[spec.id];
  const status = nativeRefit.shipStatus[spec.id];
  const number = (value: number) => Number(value.toFixed(2));
  return <>
    <p className="equipment-state">{name?.designation ?? spec.designation ?? spec.id}{name?.manufacturer ? ' · ' + name.manufacturer : ''}</p>
    <p className="refit-inspection-note">舰体基准：含已接入的内置插件，不含外装、幅能投资、舰长技能或临时系统效果。不是当前改装方案。{!spec.isModuleHull && '悬停只查看，点击才切换舰船。'}</p>
    {unavailable && <p className="refit-inspection-warnings">当前不可选择：{unavailable}</p>}
    <dl className="refit-hull-baseline">
      <div><dt><RefitHoverTerm term="armor">舰体装甲</RefitHoverTerm></dt><dd>{number(stats.armorRating)}</dd></div>
      <div><dt><RefitHoverTerm term="hull">舰体结构</RefitHoverTerm></dt><dd>{number(stats.hitpoints)}</dd></div>
      <div><dt><RefitHoverTerm term="speed">最高航速</RefitHoverTerm></dt><dd>{number(stats.maxSpeed)}</dd></div>
      <div><dt><RefitHoverTerm term="capacity">幅能容量</RefitHoverTerm></dt><dd>{number(stats.maxFlux)}</dd></div>
      <div><dt><RefitHoverTerm term="dissipation">幅能耗散 / 秒</RefitHoverTerm></dt><dd>{number(stats.fluxDissipation)}</dd></div>
      <div><dt><RefitHoverTerm term={stats.shieldType === 'PHASE' ? 'phase' : 'shieldBasics'}>防御类型</RefitHoverTerm></dt><dd>{stats.shieldType === 'NONE' ? '无常规护盾' : stats.shieldType === 'PHASE' ? '相位装置（非护盾）' : stats.shieldType === 'OMNI' ? '全向护盾' : '前向护盾'}</dd></div>
      {stats.shieldType !== 'NONE' && stats.shieldType !== 'PHASE' && <>
        <div><dt><RefitHoverTerm term="arc">护盾角度</RefitHoverTerm></dt><dd>{number(stats.shieldArcDeg)}°</dd></div>
        <div><dt><RefitHoverTerm term="shield">幅能 / 伤害</RefitHoverTerm></dt><dd>{number(stats.shieldFluxPerDamage)}</dd></div>
      </>}
      <div><dt><RefitHoverTerm term="flightDeck">战机甲板</RefitHoverTerm></dt><dd>{stats.fighterBays}</dd></div>
      <div><dt><RefitHoverTerm term="mount">武器挂点</RefitHoverTerm></dt><dd>{spec.weaponSlots.length}</dd></div>
      <div><dt><RefitHoverTerm term="op">装配点上限</RefitHoverTerm></dt><dd>{name?.op ?? '—'}</dd></div>
    </dl>
    {systems.length > 0 && <section><h4>系统</h4><ul className="refit-inspection-list">{systems.map(({id,label}) => {
      const system = shipSystemDefinitions.get(id);
      return <li key={label}><RefitInspection title={system?.name ?? id} content={<>
        <p>{system && !system.unavailable ? '已接入战斗；使用受冷却、充能及舰船状态限制。' : '未接入战斗效果，不会显示成已生效。'}</p>
        {system?.description && <p><RefitExplanationText text={system.description} /></p>}
        {system?.implementationDetails && <p><RefitExplanationText text={system.implementationDetails} /></p>}
      </>}><button type="button" className="refit-inspection-item"><span>{system?.name ?? id}</span><small>{label} · {system && !system.unavailable ? '可用' : '未接入'}</small></button></RefitInspection></li>;
    })}</ul></section>}
    <section><h4>内置插件 · {mods.length}</h4>{mods.length ? <ul className="refit-inspection-list">{mods.map(id => {
      const definition = hullModDefinitions.get(id);
      const label = definition?.name ?? nativeRefit.hullmods?.[id]?.name ?? id;
      const note = !spec.builtInHullMods?.includes(id) ? '原作资料，未应用' : definition?.support?.scope === 'campaign-only' ? '仅战役' : '舰体内置';
      return <li key={id}><RefitInspection title={label} className="refit-inspection-equipment" content={<><p className="equipment-state">{note}</p><ModInformation id={id} /></>}>
        <button type="button" className="refit-inspection-item"><span>{label}</span><small>{note}</small></button>
      </RefitInspection></li>;
    })}</ul> : <p className="equipment-state">无内置插件</p>}</section>
    {!!spec.modules?.length && <section><h4>挂接模块 · {spec.modules.length}</h4><p className="equipment-state">下列参数属于模块自身，不与母舰简单相加。</p><ul className="refit-inspection-list">
      {spec.modules.map(module => <li key={module.slotId}><RefitInspection title={'模块 ' + module.slotId} className="refit-hull-inspection"
        content={<HullBaselineInformation spec={module.spec} />}><button type="button" className="refit-inspection-item"><span>{data.ships[module.spec.id]?.name ?? module.spec.id}</span><small>{module.slotId} · {module.spec.weaponSlots.length} 武器挂点</small></button></RefitInspection></li>)}
    </ul></section>}
    {!!status?.reasons.length && <RefitInspection title="舰体适配说明" content={<><p>基础模拟并不等于原作机制完整复现。</p><ul>{status.reasons.map((reason,index) => <li key={index}>{reason}</li>)}</ul></>}>
      <button type="button" className="refit-inspection-item"><span>适配说明 · {status.reasons.length} 项</span></button>
    </RefitInspection>}
  </>;
}
