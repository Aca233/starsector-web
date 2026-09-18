import { sModInstallReason } from '../engine/extensions/HullMods';
import { designHullSpec } from './DesignModel';
import { currentImportReasons } from '../engine/data/SourceCapabilities';
import { contentRegistry } from '../engine/content/ContentRegistry';
import {
  createDesign, baseHull, compatibility, data, fluxLimit, isBuiltIn,
  modReason, nativeRefit, weaponName, evaluate, builtInWingIds, designFighterBays,
} from './DesignModel';
import type { Design } from './DesignModel';

/** Convert a native loadout without executing source scripts or silently hiding omissions. */
export function importNativeVariant(raw: Record<string, unknown>): { design: Design; warnings: string[] } {
  if (typeof raw.hullId !== 'string' || (!baseHull(raw.hullId) || baseHull(raw.hullId)?.isModuleHull)) throw new Error('该方案的舰体尚不能进入 Web 改装。');
  const d = createDesign(raw.hullId, 'empty');
  if (typeof raw.variantId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(raw.variantId)) d.sourceVariantId = raw.variantId;
  const hull = baseHull(d.hullId)!;
  const warnings: string[] = [];
  d.name = `${data.ships[d.hullId].name} · ${String(raw.displayName ?? raw.variantId ?? '原版方案')}`.slice(0, 48);
  for (const [key, source] of [['capacitors', 'fluxCapacitors'], ['vents', 'fluxVents']] as const) {
    const value = Number(raw[source] ?? 0);
    d[key] = Math.min(fluxLimit(d.hullId), Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)));
    if (d[key] !== value) warnings.push(`${source} 超出 Web 可装配范围，已限制为 ${d[key]}。`);
  }
  const assigned = new Set<string>();
  if (Array.isArray(raw.weaponGroups)) raw.weaponGroups.forEach((value, index) => {
    if (!value || typeof value !== 'object') return;
    const group = value as {mode?: string; autofire?: boolean; weapons?: Record<string, unknown>};
    const target = d.groups[Math.min(index, 6)];
    target.mode = group.mode === 'ALTERNATING' ? 'ALTERNATING' : 'LINKED';
    target.isAutofire = group.autofire === true;
    for (const [slotId, id] of Object.entries(group.weapons ?? {})) {
      const slot = hull.weaponSlots.find(s => s.slotId === slotId);
      if (!slot) { warnings.push(`未适配挂点 ${slotId}（${String(id)}）。`); continue; }
      if (assigned.has(slotId)) { warnings.push(`重复武器组挂点 ${slotId} 已忽略。`); continue; }
      if (isBuiltIn(d.hullId, slotId)) {
        if (d.weapons[slotId] !== id) warnings.push(`${slotId} 保留舰体内置武器，不能替换为 ${String(id)}。`);
      } else {
        const w = typeof id === 'string' ? contentRegistry.getWeapon(id) : undefined;
        if (!w || !data.weapons[w.id] || compatibility(slot, w)) {
          warnings.push(`${slotId} 的 ${String(id)} 不可安装，保留空挂点。`); continue;
        }
        d.weapons[slotId] = w.id;
      }
      if (d.weapons[slotId]) {
        for (const g of d.groups) g.weaponSlotIds = g.weaponSlotIds.filter(s => s !== slotId);
        target.weaponSlotIds.push(slotId);
        assigned.add(slotId);
      }
      if (typeof id === 'string' && nativeRefit.weaponStatus[id]?.level === 'approximate') warnings.push(`${weaponName(id)} 使用基础模拟，特殊效果见内容目录。`);
    }
  });
  for (const [id, weapon] of Object.entries(d.weapons)) if (weapon && !d.groups.some(g => g.weaponSlotIds.includes(id))) d.groups[0].weaponSlotIds.push(id);
  const mods = [...(Array.isArray(raw.hullMods) ? raw.hullMods : []), ...(Array.isArray(raw.permaMods) ? raw.permaMods : []), ...(Array.isArray(raw.sMods) ? raw.sMods : [])];
  // Prerequisite hullmods may appear after their dependants in native JSON.
  const pending = new Set(mods.filter((id): id is string => typeof id === 'string' && !hull.builtInHullMods?.includes(id) && !d.hullMods.includes(id)));
  for (let progress = true; progress && pending.size;) {
    progress = false;
    for (const id of pending) if (!modReason(d,id)) { d.hullMods.push(id); pending.delete(id); progress = true; }
  }
  for (const id of pending) warnings.push('未装入插件 ' + id + '：' + modReason(d,id) + '。');
  for (const id of new Set([...(Array.isArray(raw.sMods) ? raw.sMods : []), ...(Array.isArray(raw.sModdedBuiltIns) ? raw.sModdedBuiltIns : [])])) {
    if (typeof id !== 'string') { warnings.push('无效S-mod ID'); continue; }
    const reason = sModInstallReason(designHullSpec(d), id);
    if (reason) warnings.push('未固化 ' + id + '：' + reason);
    else (d.sMods ??= []).push(id);
  }
  d.wings = [...builtInWingIds(d.hullId)];
  if (Array.isArray(raw.wings)) for (const id of raw.wings) {
    if (!id) { if (d.wings.length < designFighterBays(d)) d.wings.push(null); continue; }
    if (typeof id !== 'string' || !nativeRefit.wings?.[id]) { warnings.push(`未装入舰载机联队 ${String(id)}：尚未适配。`); if (d.wings.length < designFighterBays(d)) d.wings.push(null); continue; }
    if (d.wings.length >= designFighterBays(d)) { warnings.push(`舰载机联队 ${id} 超出机库数量。`); continue; }
    d.wings.push(id);
  }
  if (raw.modules && Object.keys(raw.modules as object).length && !d.sourceVariantId) warnings.push('模块方案缺少原版身份，不能导入自定义模块编组。');
  for (const reason of currentImportReasons(nativeRefit.shipStatus[d.hullId]?.reasons ?? [])) if (!reason.startsWith('Default variant ')) warnings.push(reason);
  warnings.push(...evaluate(d).errors);
  return {design: d, warnings: [...new Set(warnings)]};
}
