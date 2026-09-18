import { useMemo } from 'react';
import type { ShipSpec, WeaponMountSlotConfig } from '../engine/content/ShipSpec';
import { hullModDefinitions } from '../engine/extensions/HullMods';
import { budget, builtInWingIds, data, designFromModule, designWingSlots, evaluate, isBuiltIn, nativeRefit, weaponName, type Design } from './DesignModel';
import { ModInformation } from './HullModInformation';
import { WingInformation } from './WingInformation';
import { RefitHoverTerm } from './RefitHoverTerms';
import { RefitInspection, type InspectionTarget } from './RefitInspection';
import { WeaponInspection, type OpenWeaponCodex } from './WeaponInspection';

export function VariantInspection({ name, design, warnings, saved, enabled, onOpenCodex, children }: {
  name: string; design: Design; warnings: string[]; saved?: boolean; enabled: boolean;
  onOpenCodex: OpenWeaponCodex; children: InspectionTarget;
}) {
  return <RefitInspection title={name} enabled={enabled} className="refit-loadout-inspection"
    content={<VariantInformation design={design} warnings={warnings} saved={saved} onOpenCodex={onOpenCodex} />}>{children}</RefitInspection>;
}
function VariantInformation({ design, warnings, saved, onOpenCodex }: {
  design: Design; warnings: string[]; saved?: boolean; onOpenCodex: OpenWeaponCodex;
}) {
  const result = useMemo(() => evaluate(design), [design]);
  const notices = [...new Set([...warnings, ...result.errors])];
  return <>
    <p className="equipment-state">{saved ? '已保存方案' : '原版方案'} · {data.ships[design.hullId]?.name}</p>
    <p className="refit-inspection-note">只查看此卡片的原始方案，不含左下附加选项。点击卡片选择预览，再点“确认”才会应用。</p>
    <LoadoutSection draft={design} spec={result.spec} onOpenCodex={onOpenCodex} />
    {notices.length > 0 && <section className="refit-inspection-warnings"><h4>适配说明{result.errors.length > 0 && ' · 需修正后才能确认'}</h4>
      <ul>{notices.map((text, index) => <li key={index}>{text}</li>)}</ul></section>}
  </>;
}
/** Keep all module equipment at the same information depth; each has its own fitted context and OP budget. */
export function LoadoutSection({ draft, spec, onOpenCodex, moduleLabel, compact = false }: {
  draft: Design; spec: ShipSpec; onOpenCodex: OpenWeaponCodex; moduleLabel?: string; compact?: boolean;
}) {
  const op = budget(draft);
  const slots = spec.weaponSlots.filter(slot => slot.defaultWeaponId);
  const batches = new Map<string, WeaponMountSlotConfig[]>();
  for (const slot of slots) {
    // Do not merge fixed/turret, different arcs or built-in/removable mounts into misleading identical rows.
    const key = [slot.defaultWeaponId, slot.mountType, slot.slotSize, slot.arcDeg, slot.builtIn || isBuiltIn(draft.hullId, slot.slotId)].join(':');
    batches.set(key, [...(batches.get(key) ?? []), slot]);
  }
  const builtMods = new Set([...(spec.builtInHullMods ?? []), ...(nativeRefit.sourceBuiltInMods?.[draft.hullId] ?? [])]);
  const mods = [...new Set([...builtMods, ...(spec.hullMods ?? [])])];
  const wings = designWingSlots(draft), builtWings = builtInWingIds(draft.hullId).length;
  return <section className="refit-loadout-section">
    {moduleLabel && <h4>{moduleLabel} · {data.ships[draft.hullId]?.name ?? draft.hullId}</h4>}
    <p className="refit-inspection-budget" data-invalid={op.remaining < 0}><RefitHoverTerm term="op">装配点</RefitHoverTerm> <strong>{op.used} / {op.total}</strong> · 剩余 {op.remaining}</p>
    <p className="equipment-state">武器 {op.weaponOP} · 插件 {op.modOP} · 联队 {op.wingOP} · 幅能投资 {op.fluxOP} OP{spec.modules?.length ? '（仅本舰体；模块单独列出）' : ''}</p>
    <p><RefitHoverTerm term="capacitors">幅能容存器</RefitHoverTerm> {draft.capacitors} · <RefitHoverTerm term="vents">耗散通道</RefitHoverTerm> {draft.vents}</p>
    <h4>武器 · {slots.length} 门</h4>
    {slots.length ? <ul className="refit-inspection-list">{[...batches.entries()].map(([key, members]) => {
      const slot = members[0];
      return <li key={key}><WeaponInspection draft={draft} spec={spec} slot={slot} onOpenCodex={onOpenCodex}>
        <button type="button" className="refit-inspection-item"><span>{weaponName(slot.defaultWeaponId!)} ×{members.length}</span>
          <small>{slot.builtIn || isBuiltIn(draft.hullId, slot.slotId) ? '内置 · ' : ''}{slot.mountType === 'HARDPOINT' ? '固定挂点' : '炮塔'}{!compact && ' · ' + members.map(member => member.slotId).join('、')}</small></button>
      </WeaponInspection></li>;
    })}</ul> : <p className="equipment-state">未安装武器</p>}
    <h4>船体插件 · {mods.length}</h4>
    {mods.length ? <ul className="refit-inspection-list">{mods.map(id => {
      const name = hullModDefinitions.get(id)?.name ?? data.hullmods[id]?.name ?? nativeRefit.hullmods?.[id]?.name ?? id;
      const solid = spec.sMods?.includes(id);
      const metadataOnly = builtMods.has(id) && !spec.builtInHullMods?.includes(id);
      const status = metadataOnly ? ' · 原作资料，未应用' : hullModDefinitions.get(id)?.support?.scope === 'campaign-only' ? ' · 仅战役' : '';
      return <li key={id}><RefitInspection title={name} className="refit-inspection-equipment" content={<>
        <p className="equipment-state">{builtMods.has(id) ? '舰体内置' : '方案安装'}{solid ? ' · S-mod 已固化 / 增强' : ''}{status}</p><ModInformation id={id} />
      </>}><button type="button" className="refit-inspection-item"><span>{name}</span><small>{builtMods.has(id) ? '内置' : '外装'}{solid ? ' · S-mod' : ''}{status}</small></button></RefitInspection></li>;
    })}</ul> : <p className="equipment-state">未安装插件</p>}
    <h4>舰载机 · {wings.filter(Boolean).length} / {wings.length} 甲板</h4>
    {wings.length ? <ul className="refit-inspection-list">{wings.map((id, index) => {
      const wing = id ? nativeRefit.wings?.[id] : undefined;
      return <li key={index}>{wing ? <RefitInspection title={wing.displayName ?? wing.name} className="refit-inspection-equipment"
        content={<><p className="equipment-state">甲板 {index + 1}{index < builtWings ? ' · 内置，0 OP' : ` · ${wing.op} OP`}</p><WingInformation wing={wing} /></>}>
        <button type="button" className="refit-inspection-item"><span>{wing.displayName ?? wing.name}</span><small>甲板 {index + 1}{index < builtWings ? ' · 内置' : ''}</small></button>
      </RefitInspection> : <span className="equipment-state">甲板 {index + 1} · {id ? `资料不可用：${id}` : '空'}</span>}</li>;
    })}</ul> : <p className="equipment-state">无战机甲板</p>}
    {spec.modules?.map(mount => <LoadoutSection key={mount.slotId} draft={draft.modules?.[mount.slotId] ?? designFromModule(mount.spec)}
      spec={mount.spec} moduleLabel={'模块 ' + mount.slotId} onOpenCodex={onOpenCodex} compact={compact} />)}
  </section>;
}
