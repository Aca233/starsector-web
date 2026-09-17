import { useMemo, useState } from "react";
import { Modal } from "../ui/core/UI";
import { NativeButton } from "../ui/NativeChrome";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import { contentRegistry } from "../engine/content/ContentRegistry";
import { ShipStage } from "./ShipStage";
import { importNativeVariant } from "./NativeVariantImport";
import { autoGroups, baseHull, budget, compatibility, createDesign, evaluate, isBuiltIn, modReason, weaponOPCost, weapons } from "./DesignModel";
import type { Design } from "./DesignModel";
import stockText from "../engine/data/generated/refit-variants.json?raw";

const signature = (d: Design) => JSON.stringify({ ...d, updatedAt: 0 });
const stock = JSON.parse(stockText) as Record<string, Record<string, unknown>[]>;
interface Choice { id: string; name: string; design: Design; warnings: string[]; saved?: Design }
interface Props {
  draft: Design; designs: Design[]; onClose: () => void; onApply: (design: Design) => void;
  onSave: (design?: Design) => boolean; onDelete: (design: Design) => void;
  onRename: (design: Design, name: string) => boolean;
}
function Option({ label, checked = false, disabled = false, hint, onChange }: {
  label: string; checked?: boolean; disabled?: boolean; hint?: string; onChange?: (checked: boolean) => void;
}) {
  return <label className="source-fit-option" title={hint}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange?.(e.target.checked)} />
    <span><NativeBitmapText font="body" color="currentColor">{label}</NativeBitmapText></span>
  </label>;
}
/** Preview is local: selecting, hiding or cancelling never edits the live ship. */
export function SourceVariantPicker({ draft, designs, onClose, onApply, onSave, onDelete, onRename }: Props) {
  const nativeChoices = useMemo<Choice[]>(() => (stock[draft.hullId] ?? []).map(raw => {
    const imported = importNativeVariant(raw);
    return { id: String(raw.variantId), name: String(raw.displayName ?? raw.variantId), ...imported };
  }).sort((a, b) => {
    const order = ["火力支援", "突击", "精英"];
    return (order.includes(a.name) ? order.indexOf(a.name) : 9) - (order.includes(b.name) ? order.indexOf(b.name) : 9);
  }), [draft.hullId]);
  const savedChoices: Choice[] = designs.filter(d => d.hullId === draft.hullId).map(d => ({ id: d.id, name: d.name, design: d, warnings: [], saved: d }));
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [clear, setClear] = useState(true);
  const [bulkheads, setBulkheads] = useState(false);
  const [doors, setDoors] = useState(false);
  const [automatic, setAutomatic] = useState<Design | null>(null);
  const [naming, setNaming] = useState<"save" | "rename" | null>(null);
  const [name, setName] = useState(draft.name);
  const [message, setMessage] = useState("");
  const choice = [...nativeChoices, ...savedChoices].find(c => c.id === selected);
  const options = [...nativeChoices.filter(c => !hidden.includes(c.id)), ...savedChoices];
  const planned = (() => {
    const d = structuredClone(automatic ?? choice?.design ?? draft);
    const warnings: string[] = [];
    if (!clear && choice && !automatic) {
      for (const [slot, id] of Object.entries(draft.weapons)) if (!d.weapons[slot] && id) d.weapons[slot] = id;
      d.hullMods = [...new Set([...d.hullMods, ...draft.hullMods])];
      d.groups = autoGroups(d);
    }
    for (const [enabled, id, label] of [[bulkheads, "reinforcedhull", "强化舱壁"], [doors, "blastdoors", "防爆舱门"]] as const) {
      if (!enabled || d.hullMods.includes(id) || baseHull(d.hullId)?.builtInHullMods?.includes(id)) continue;
      const reason = modReason(d, id);
      if (reason) { warnings.push(label + "：" + reason); continue; }
      const next = { ...d, hullMods: [...d.hullMods, id] };
      if (budget(next).remaining < 0) warnings.push(label + "：装配点不足，未安装。");
      else d.hullMods.push(id);
    }
    // Applying a fit edits this ship, not a different saved ship; Undo can restore it.
    return { design: { ...d, id: draft.id, name: draft.name, updatedAt: draft.updatedAt }, warnings };
  })();
  const result = evaluate(planned.design);
  const changed = signature(planned.design) !== signature(draft);
  const label = automatic ? "自动装配预览" : choice?.name ?? "当前装配";
  const select = (c: Choice) => { setSelected(c.id); setAutomatic(null); setMessage(""); };
  const apply = () => { if (changed && !result.errors.length) { onApply(planned.design); onClose(); } };
  const autoFit = () => {
    // Bounded sandbox helper: fill empty mounts only, using real compatible weapons and OP costs.
    // This does not claim to port the original campaign autofit heuristic.
    const d = structuredClone(planned.design);
    const preferred = choice?.design ?? createDesign(d.hullId);
    for (const slot of baseHull(d.hullId)!.weaponSlots) {
      if (isBuiltIn(d.hullId, slot.slotId) || d.weapons[slot.slotId]) continue;
      const available = weapons.filter(w => !compatibility(slot, w) && weaponOPCost(d, w.id) <= budget(d).remaining);
      available.sort((a, b) => Number(b.id === preferred.weapons[slot.slotId]) - Number(a.id === preferred.weapons[slot.slotId]) ||
        Number(b.mountSize === slot.slotSize) - Number(a.mountSize === slot.slotSize) || weaponOPCost(d, a.id) - weaponOPCost(d, b.id) || a.id.localeCompare(b.id));
      if (available[0] && contentRegistry.getWeapon(available[0].id)) d.weapons[slot.slotId] = available[0].id;
    }
    d.groups = autoGroups(d);
    setAutomatic(d);
    setMessage(signature(d) === signature(planned.design) ? "没有可在剩余装配点内补装的空挂点。" : "已预览补齐空挂点的结果；确认后才会应用。可撤消恢复。");
  };
  const warnings = [...(choice?.warnings ?? []), ...planned.warnings, ...result.errors];
  return <>
    <Modal title="选择最适合的装配方案" eyebrow="" initialFocus="panel" surface="glass" onClose={onClose}
      onShortcut={key => { if (key === "v") onClose(); if (key === "g") apply(); if (key === "q") autoFit(); }}>
      <div className="source-variant-picker">
        <section className="source-fit-left">
          <h3 className="source-fit-title"><NativeBitmapText font="body">选择最适合的装配方案</NativeBitmapText></h3>
          <div className="source-fit-choices" role="group" aria-label="可用装配方案">
            {options.map(c => <div className="source-fit-card" key={c.id}>
              <button className="source-fit-select" aria-label={"预览装配方案：" + c.name} aria-pressed={choice?.id === c.id} onClick={() => select(c)}>
                <ShipStage spec={evaluate(c.design).spec} home />
                <span>{c.name}</span>
              </button>
              <button className="source-fit-remove" aria-label={(c.saved ? "删除方案：" : "隐藏原版方案：") + c.name} title={c.saved ? "删除保存的方案（需确认）" : "隐藏此原版方案；可恢复"}
                onClick={() => c.saved ? onDelete(c.saved) : setHidden(prev => [...prev, c.id])}>×</button>
            </div>)}
            <button className="source-fit-save" disabled={evaluate(draft).errors.length > 0} aria-label="保存当前配置为装配方案" title="保存当前舰船的装配方案"
              onClick={() => { setName(draft.name); setNaming("save"); }}>
              <span className="source-fit-silhouette" style={{ maskImage: 'url("' + runtimeAssetUrl(baseHull(draft.hullId)!.spriteUrl) + '")' }} />
              <span className="source-fit-save-caption">保存当前配置</span>
            </button>
          </div>
          <div className="source-fit-options">
            {["搜索货舱使用装备", "搜索仓库使用装备", "搜索市场购买装备", "允许搜索黑市购买"].map(text =>
              <Option key={text} label={text} disabled hint="当前为自由模拟改装；没有货舱、仓库或市场交易。所有兼容装备来自模拟装备库。" />)}
            <Option label="升级武器，如果有剩余装配点" disabled hint="原作武器升级策略尚未移植。左下自动装配仅补齐空挂点。" />
            <Option label="清空当前装配" checked={clear} onChange={v => { setClear(v); setAutomatic(null); }} hint="取消勾选时，保留所选方案没有覆盖的现有武器与插件。" />
            <Option label={'默认安装 "强化舱壁"'} checked={bulkheads} onChange={setBulkheads} />
            <Option label={'默认安装 "防爆舱门"'} checked={doors} onChange={setDoors} />
            <Option label="随机配备武器与船体插件" disabled hint="原作随机装配策略尚未移植。" />
          </div>
          <div className="source-fit-notes">
            <p>模拟改装 · 全装备库可用；未接入货舱、市场与经济。</p>
            {hidden.length > 0 && <button onClick={() => setHidden([])}>恢复隐藏的原版方案（{hidden.length}）</button>}
            {warnings.length > 0 && <details><summary>适配说明（{warnings.length}）{result.errors.length > 0 && " · 需修正后才能确认"}</summary><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
            {message && <p role="status">{message}</p>}
          </div>
        </section>
        <section className="source-fit-right" aria-label="装配方案预览">
          <div className="source-fit-preview">
            <h3 className="source-fit-title"><NativeBitmapText font="body">装配方案</NativeBitmapText></h3>
            <ShipStage spec={result.spec} home />
            <p className="source-fit-preview-name">{label}</p>
          </div>
          <dl className="source-fit-costs">
            <div><dt>装配成本：</dt><dd>0¢</dd></div>
            <div><dt>可用资金：</dt><dd>—</dd></div>
            <div><dt>战备值 (CR) 损耗：</dt><dd>0%</dd></div>
          </dl>
          <div className="source-fit-budget" data-invalid={result.errors.length > 0}>装配点 {result.op.used} / {result.op.total}
            {choice?.saved && <button onClick={() => {setName(choice.name); setNaming("rename");}}>重命名</button>}
          </div>
        </section>
        <div className="source-fit-footer">
          <NativeButton shortcut="Q" className="source-fit-auto" onClick={autoFit} title="预览补齐空挂点：优先所选方案的武器，受兼容类型和剩余 OP 限制">自动装配</NativeButton>
          <NativeButton shortcut="G" disabled={!changed || result.errors.length > 0} onClick={apply}>确认</NativeButton>
          <NativeButton shortcut="V" onClick={onClose}>取消</NativeButton>
        </div>
      </div>
    </Modal>
    {naming && <Modal title={naming === "save" ? "保存装配方案" : "重命名装配方案"} width="small" eyebrow="" onClose={() => setNaming(null)}
      footer={<><NativeButton disabled={!name.trim()} onClick={() => {
        const ok = naming === "save" ? onSave({ ...draft, name }) : choice?.saved ? onRename(choice.saved, name) : false;
        if (ok) { setNaming(null); setMessage("装配方案已保存。"); }
      }}>确认</NativeButton><NativeButton onClick={() => setNaming(null)}>取消</NativeButton></>}>
      <label className="source-fit-name-label">方案名称<input aria-label="装配方案名称" value={name} maxLength={48} onChange={e => setName(e.target.value)} /></label>
    </Modal>}
  </>;
}
