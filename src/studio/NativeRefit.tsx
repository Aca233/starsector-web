import { currentImportReasons } from '../engine/data/SourceCapabilities';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NativeButton, NativeFrame } from "../ui/NativeChrome";
export { NativeButton, NativeFrame } from "../ui/NativeChrome";
import { Modal } from "../ui/core/UI";
import { contentRegistry } from "../engine/content/ContentRegistry";
import {
  hullModDefinitions,
  hullModOPCost,
  sModInstallReason,
  effectiveHullStats,
  effectiveHullModWeaponSpec,
} from "../engine/extensions/HullMods";
import { shipSystemDefinitions } from "../engine/extensions/ship-systems/Registry";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import { ShipStage } from "./ShipStage";
import { useRefitWeaponTooltip } from "./RefitWeaponTooltip";
import { FighterDecks } from "./FighterDecks";
import { SourceWingPicker } from "./SourceWingPicker";
import { HullRoster } from "./HullRoster";
import type { HullFilter } from "./HullRoster";
import { useHullModTooltip } from "./HullModTooltip";
import { SourceModPicker } from "./SourceModPicker";
import { SourceWeaponPicker } from "./SourceWeaponPicker";
import {
  autoGroups,
  modDescriptions,
  weaponFluxPerSecond,
  builtInModName,
  data,
  nativeRefit,
  evaluate,
  fluxLimit,
  hulls,
  isBuiltIn,
  sizes,
  types,
  weaponName,
  withWeapon,
  withWing,
  designWingSlots,
} from "./DesignModel";
import type { Design, Group } from "./DesignModel";
import type { ShipSpec } from "../engine/content/ShipSpec";

const SourceVariantPicker = lazy(() => import("./SourceVariantPicker").then(module => ({ default: module.SourceVariantPicker })));

type Panel =
  "weapons" | "groups" | "mods" | "designs" | "help" | "wings" | null;
interface Props {
  /** Context-specific presentation; the normal single-player editor keeps its defaults. */
  embedded?: { title: string; backLabel: string; primaryLabel: string; disabledReason?: string };
  hullUnavailableReason?: (spec: ShipSpec) => string | null;
  roomLayout?: { sidebar: ReactNode; footer: ReactNode; onPickHull: () => void; locked: boolean };
  draft: Design;
  designs: Design[];
  dirty: boolean;
  canUndo: boolean;
  status: string;
  warning: string | null;
  onChange: (next: Design) => void;
  onHull: (id: string) => void;
  onOpen: (d: Design) => void;
  onSave: (design?: Design) => boolean;
  onRename: (design: Design, name: string) => boolean;
  onCopy: () => void;
  onNew: () => void;
  onDelete: (d: Design) => void;
  onExport: () => void;
  onImport: () => void;
  onUndo: () => void;
  onClear: () => void;
  onLaunch: () => void;
  onHome: () => void;
  onSkills: () => void;
  hullFilter: HullFilter;
  onHullFilter: (filter: HullFilter) => void;
  readHullScroll: () => number;
  writeHullScroll: (value: number) => void;
}
export function NativeRefit(props: Props) {
  const { draft, designs, dirty, onChange } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const modDetails = useHullModTooltip(panel === null);
  const [slotId, setSlotId] = useState("");
  const [deckIndex, setDeckIndex] = useState(0);
  const [zoom, setZoom] = useState(props.roomLayout ? 0.95 : 0.65);
  const [groupHighlight, setGroupHighlight] = useState<number | null>(null);
  const [showMounts, setShowMounts] = useState(false);
  const [feedback, setFeedback] = useState("");
  const importStatus = nativeRefit.shipStatus[draft.hullId];
  const equippedCaveats = [...new Set(Object.values(draft.weapons).filter((id): id is string => !!id).flatMap(id =>
    (nativeRefit.weaponStatus[id]?.reasons ?? []).map(reason => weaponName(id) + "：" + reason)
  ))];
  const caveats = [...currentImportReasons(importStatus?.reasons ?? []), ...equippedCaveats];

  const mainRef = useRef<HTMLDivElement>(null);
  const evaluation = useMemo(() => evaluate(draft), [draft]);
  const { spec, op, errors } = evaluation;
  const stats = effectiveHullStats(spec);
  const systems = [{ definition: shipSystemDefinitions.require(spec.systemType), label: '舰船系统', key: 'F' },
    { definition: shipSystemDefinitions.require(spec.defenseSystemType ?? 'NONE'), label: '防御系统', key: '鼠标右键' }];
  const missingBuiltins = (nativeRefit.sourceBuiltInMods?.[draft.hullId] ?? []).filter(id => hullModDefinitions.get(id)?.status !== "implemented" && hullModDefinitions.get(id)?.support?.scope !== "campaign-only");
  const campaignBuiltins = (spec.builtInHullMods ?? []).filter(id => hullModDefinitions.get(id)?.support?.scope === "campaign-only");
  const info = data.ships[draft.hullId];
  const weaponDetails = useRefitWeaponTooltip(draft, spec, panel === null && !props.roomLayout?.locked);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 3200);
    return () => clearTimeout(timer);
  }, [feedback]);
  const selected = spec.weaponSlots.find((s) => s.slotId === slotId);
  const change = (patch: Partial<Design>) => {
    const next = { ...draft, ...patch, updatedAt: draft.updatedAt };
    next.sMods = (next.sMods ?? []).filter(id => next.hullMods.includes(id) || spec.builtInHullMods?.includes(id));
    if (patch.hullMods) next.wings = designWingSlots(next);
    onChange(next);
  };
  const selectSlot = (id: string) => {
    setSlotId(id);
    setPanel("weapons");
  };
  const weaponFlux = Math.round(
    spec.weaponSlots.reduce((total, slot) => {
      const weapon = slot.defaultWeaponId
        ? contentRegistry.getWeapon(slot.defaultWeaponId)
        : undefined;
      return total + (weapon ? weaponFluxPerSecond(effectiveHullModWeaponSpec(spec, weapon)) : 0);
    }, 0),
  );
  const nextHull = () => {
    if (props.roomLayout) { props.roomLayout.onPickHull(); return; }
    const current = hulls.findIndex(h => h.id === draft.hullId);
    for (let offset = 1; offset <= hulls.length; offset++) {
      const next = hulls[(current + offset) % hulls.length];
      if (!props.hullUnavailableReason?.(next)) { props.onHull(next.id); return; }
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (props.roomLayout?.locked) return;
      // The expanded hullmod table is a refit mode, not a modal: keep stats live,
      // but never route its keys to the concealed ship/clear/trial controls.
      if (
        panel === "mods" &&
        !document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        const typing =
          e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select,[contenteditable]");
        if (
          !e.repeat &&
          (e.key === "Escape" ||
            (!typing &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey &&
              e.key.toLowerCase() === "a"))
        ) {
          e.preventDefault();
          setPanel(null);
        }
        return;
      }
      if (
        panel ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select,[contenteditable]"))
      )
        return;
      const actions: Record<string, () => void> = {
        r: props.onHome,
        c: props.onSkills,
        w: () => setPanel("groups"),
        v: () => setPanel("designs"),
        a: () => setPanel("mods"),
        n: () => {
          if (!errors.length && !props.embedded?.disabledReason) props.onLaunch();
        },

        u: props.onUndo,
        t: props.onClear,
        x: nextHull,
        escape: props.onHome,
      };
      const action = actions[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (panel !== "weapons") return;
    const dismiss = (e: MouseEvent) => {
      e.preventDefault();
      setPanel(null);
    };
    const outside = (e: MouseEvent) => {
      if (
        e.button === 0 &&
        e.target instanceof Element &&
        !e.target.closest('[role="dialog"]')
      )
        setPanel(null);
    };
    window.addEventListener("contextmenu", dismiss);
    window.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("mousedown", outside);
    };
  }, [panel]);
  const modIcon = (id: string) =>
    hullModDefinitions.get(id)?.refit?.icon;
  const modRow = (id: string, builtin: boolean) => (
    <div
      className={"refit-mod-row " + (builtin ? "builtin" : "")}
      key={id}
      tabIndex={0}
      {...modDetails.bind(id)}
    >
      <span>{builtInModName(id)}{draft.sMods?.includes(id) ? " · S" : ""}</span>
      {(draft.sMods?.includes(id) || !sModInstallReason(spec, id)) && <button className="native-step"
        title={(hullModDefinitions.get(id)?.sMod?.description ?? "固化免除OP费用，无额外战斗加成。") + " 沙盒允许撤销固化。"}
        aria-label={(draft.sMods?.includes(id) ? "撤销固化" : "固化") + builtInModName(id)}
        onClick={() => change({sMods: draft.sMods?.includes(id) ? draft.sMods.filter(m => m !== id) : [...(draft.sMods ?? []), id]})}>
        {draft.sMods?.includes(id) ? "撤销 S" : "固化 S"}
      </button>}
      {!builtin && (
        <>
          <b>{hullModOPCost(spec, id)}</b>
          <button
            className="native-step"
            aria-label={"卸下" + builtInModName(id)}
            onClick={() =>
              change({ hullMods: draft.hullMods.filter((m) => m !== id) })
            }
          >
            −
          </button>
        </>
      )}
      {modIcon(id) && (
        <img src={runtimeAssetUrl("/game-assets/" + modIcon(id))} alt="" />
      )}
      {hullModDefinitions.get(id)?.status === "metadata-only" && (
        <small>{hullModDefinitions.get(id)?.support?.scope === "campaign-only" ? "仅战役" : "未实现"}</small>
      )}
    </div>
  );
  return (
    <main
      className={
        "native-refit-app " + (props.roomLayout ? "lan-room-workbench " : "") + (props.embedded ? "lan-refit-editor " : "") + (panel === "mods" ? "mods-expanded" : "")
      }
    >
      {props.roomLayout?.footer}
      {modDetails.content}
      <div className="native-screen-tab">
        {props.embedded?.title ?? "舰队改装"} <span className="native-shortcut">[R]</span>
      </div>
      <div className="refit-skills-entry"><NativeButton shortcut="C" disabled={props.roomLayout?.locked} onClick={props.onSkills} data-skills-entry>角色技能 · {Object.keys(draft.captainSkills ?? {}).length} 项</NativeButton></div>
      <button
        className="native-screen-close"
        aria-label={props.embedded?.backLabel ?? "返回主页面"}
        onClick={props.onHome}
      >
        ×
      </button>
      <NativeFrame className="refit-shell">
        {props.roomLayout?.sidebar ?? <HullRoster unavailableReason={props.hullUnavailableReason} draft={draft} spec={spec} filter={props.hullFilter} onFilter={props.onHullFilter}
          readScrollPosition={props.readHullScroll} writeScrollPosition={props.writeHullScroll} onHull={props.onHull} inert={panel === "mods"} />}
        <div
          className={"refit-grid " + (stats.fighterBays ? "has-flight-decks " : "") + (showMounts ? "show-all-mounts" : "")}
          ref={mainRef}
          inert={props.roomLayout?.locked}
        >
          <div className="refit-cr">
            <div className="native-cr-meter">
              <i />
              <b />
            </div>
            <span className="native-numeric">{Math.round(Math.min(1, .7 + stats.maxCombatReadinessBonus) * 100)}%</span>
            <label>战备值 (CR)</label>
          </div>
          <FighterDecks draft={draft} selected={panel === "wings" ? deckIndex : null} inert={panel === "mods"}
            onSelect={index => { setDeckIndex(index); setPanel("wings"); }}
            onRemove={index => { onChange(withWing(draft, index, null)); setFeedback("已卸下联队 · 可撤消恢复"); }} />
          <div
            className="refit-vessel"
            inert={panel === "mods"}
            onWheel={(e) => {
              weaponDetails.hide();
              setZoom((z) => Math.max(0.65, Math.min(1.5, z - e.deltaY * 0.001)));
            }}
          >
            <ShipStage
              spec={spec}
              onSelect={selectSlot}
              selectedSlot={weaponDetails.activeSlot?.slotId ?? slotId}
              slotBindings={weaponDetails.bind}
              onRemove={(id) => {
                onChange(withWeapon(draft, id, null));
                setFeedback(
                  isBuiltIn(draft.hullId, id)
                    ? "内置武器不能卸下"
                    : "已卸下武器 · 可撤消恢复",
                );
              }}
              highlightSlots={
                groupHighlight === null
                  ? undefined
                  : draft.groups[groupHighlight].weaponSlotIds
              }
              pickingWeapon={panel === "weapons"}
              zoom={zoom}
            />
          </div>
          <aside className="refit-stats" aria-label="舰船装配参数">
            {caveats.length > 0 && <details className="refit-import-warning"><summary>基础模拟 · {caveats.length} 项适配说明</summary><p>以下原作机制尚未完整重现；导入不等于战斗完全一致。</p><ul>{caveats.map((reason, i) => <li key={i}>{reason}</li>)}</ul></details>}
            {systems.filter(s => s.definition.id !== 'NONE').map(({ definition: tacticalSystem, label, key }) => <details key={label} className="refit-system-readiness" data-available={!tacticalSystem.unavailable}>
              <summary>{label}：{tacticalSystem.name.replace(/^未适配[:：]\s*/, "")} · {tacticalSystem.unavailable ? "未接入" : "可用"}</summary>
              <p>{tacticalSystem.unavailable ? "此系统尚未实现战斗效果，不能激活。不会把空计时显示成已生效。" : "已接入战斗逻辑，试战中按 " + key + " 激活；受冷却、充能和舰船状态限制。"}</p>
              {tacticalSystem.description && <p>{tacticalSystem.description}</p>}
              {tacticalSystem.implementationDetails && <p>{tacticalSystem.implementationDetails}</p>}
            </details>)}
            <div className="refit-op-heading">
              <button
                className="native-help-button"
                aria-label="改装帮助"
                onClick={() => setPanel("help")}
              >
                ?
              </button>
              <div
                className={
                  "native-op-bar " + (op.remaining < 0 ? "over-budget" : "")
                }
                role="meter"
                aria-label="装配点"
                aria-valuenow={op.used}
                aria-valuemin={0}
                aria-valuemax={op.total}
                title={
                  "已用 " +
                  op.used +
                  " / 总计 " +
                  op.total +
                  " OP，剩余 " +
                  op.remaining
                }
              >
                <i
                  style={{
                    width: Math.min(100, op.total > 0 ? (op.used / op.total) * 100 : 0) + "%",
                  }}
                />
                <strong>
                  {op.used} / {op.total}
                </strong>
              </div>
            </div>
            <div className="native-stat-three">
              <div>
                <small>最高航速</small>
                <b>{Number(stats.maxSpeed.toFixed(1))}</b>
              </div>
              <div>
                <small>舰体装甲</small>
                <b>{Math.round(stats.armorRating)}</b>
              </div>
              <div>
                <small>舰体结构</small>
                <b>{Math.round(stats.hitpoints)}</b>
              </div>
            </div>
            {(
              [
                {
                  key: "capacitors",
                  label: "幅能容存器",
                  stat: "幅能容量",
                  value: stats.maxFlux,
                },
                {
                  key: "vents",
                  label: "耗散通道",
                  stat: "幅能耗散",
                  value: stats.fluxDissipation,
                },
              ] as const
            ).map((item) => (
              <div className="native-flux-row" key={item.key}>
                <label htmlFor={"refit-" + item.key}>{item.label}</label>
                <button
                  className="native-step"
                  aria-label={"减少" + item.label}
                  disabled={draft[item.key] === 0}
                  onClick={() => change({ [item.key]: draft[item.key] - 1 })}
                >
                  −
                </button>
                <input
                  id={"refit-" + item.key}
                  aria-label={item.label}
                  type="number"
                  min={0}
                  max={fluxLimit(draft.hullId)}
                  value={draft[item.key]}
                  onChange={(e) =>
                    change({
                      [item.key]: Math.max(
                        0,
                        Math.min(
                          fluxLimit(draft.hullId),
                          Math.floor(e.target.valueAsNumber || 0),
                        ),
                      ),
                    })
                  }
                />
                <button
                  className="native-step"
                  aria-label={"增加" + item.label}
                  disabled={draft[item.key] >= fluxLimit(draft.hullId)}
                  onClick={() => change({ [item.key]: draft[item.key] + 1 })}
                >
                  +
                </button>
                <div>
                  <small>{item.stat}</small>
                  <b className="native-green">{item.value}</b>
                </div>
              </div>
            ))}
            <div className="native-stat-three refit-shields">
              <div>
                <small>护盾角度</small>
                <b>
                  {stats.shieldType === "NONE" || stats.shieldType === "PHASE"
                    ? "—"
                    : stats.shieldArcDeg}
                </b>
              </div>
              <div>
                <small>护盾维持 幅能/秒</small>
                <b className="native-green">
                  {stats.shieldType === "PHASE"
                    ? "—"
                    : Math.round(stats.shieldUpkeepPerSecond)}
                </b>
              </div>
              <div>
                <small>护盾 幅能/伤害</small>
                <b className="native-green">
                  {stats.shieldType === "NONE" || stats.shieldType === "PHASE"
                    ? "—"
                    : Number(stats.shieldFluxPerDamage.toFixed(2))}
                </b>
              </div>
            </div>
            <div
              className="refit-weapon-flux"
              title="所有武器的射击周期平均幅能负载，含充能和冷却；不计弹药回充等待、射界与编组交替。"
            >
              <small>武器 幅能/秒</small>
              <b>{weaponFlux}</b>
            </div>
            <section className="refit-hullmods">
              <h2>舰体插件 · S-mod {(draft.sMods ?? []).filter(id => !spec.builtInHullMods?.includes(id)).length}/2</h2>
              {(spec.builtInHullMods ?? []).map((id) => modRow(id, true))}
              {draft.hullMods.map((id) => modRow(id, false))}
              {campaignBuiltins.map(id => <details className="refit-campaign-mods" key={id}><summary>{builtInModName(id)}：仅战役 · 当前无战役模拟</summary><p>{modDescriptions[id]}</p></details>)}
              {!!missingBuiltins.length && <details className="refit-missing-mods"><summary>{missingBuiltins.length} 项原作内置插件未完整接入</summary>
                <p>以下项目不应视为已实现的战斗加成；战役、后勤或特殊机制仍需单独移植。</p>
                <ul>{missingBuiltins.map(id => <li key={id}>{nativeRefit.hullmods?.[id]?.name ?? builtInModName(id)}</li>)}</ul>
              </details>}
              <NativeButton
                shortcut="A"
                aria-expanded={panel === "mods"}
                aria-controls="refit-mod-picker"
                onClick={() => setPanel(panel === "mods" ? null : "mods")}
              >
                {panel === "mods" ? "返回" : "安装舰船插件"}
              </NativeButton>
            </section>
            {!!errors.length && (
              <div className="native-errors" role="alert">
                {errors.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              </div>
            )}
          </aside>
          <div className="refit-bottom" inert={panel === "mods"}>
            <div className="refit-role">
              <span>突击</span>
              {info.designation}
            </div>
            <div className="refit-name">
              <input
                aria-label="方案名称"
                value={draft.name}
                maxLength={48}
                onChange={(e) => change({ name: e.target.value })}
              />
              <span>{info.name}-级</span>
              <small title={props.status}>{dirty ? " *" : ""}</small>
            </div>
            <div className="refit-actions">
              <NativeButton shortcut="W" onClick={() => setPanel("groups")}>
                武器组...
              </NativeButton>
              <NativeButton shortcut="V" onClick={() => setPanel("designs")}>
                装配方案...
              </NativeButton>
              <NativeButton
                shortcut="U"
                disabled={!props.canUndo}
                onClick={props.onUndo}
              >
                撤消
              </NativeButton>
              <NativeButton shortcut="T" onClick={props.onClear}>
                清空装配
              </NativeButton>
              <NativeButton
                shortcut="G"
                disabled
                title="当前舰体没有需要修复的 D-插件；试战损伤不写回设计。"
              >
                修复...
              </NativeButton>
              {!props.roomLayout && <NativeButton
                shortcut="N"
                disabled={!!errors.length || !!props.embedded?.disabledReason}
                title={props.embedded?.disabledReason}
                onClick={() => props.onLaunch()}
              >
                {props.embedded?.primaryLabel ?? "模拟战斗"}
              </NativeButton>}
              <NativeButton
                shortcut="X"
                className="refit-next"
                onClick={nextHull}
              >
                {props.roomLayout ? "更换舰船" : "下一艘/空闲装配点"}
              </NativeButton>
            </div>
          </div>
          {props.warning && (
            <div className="refit-warning" role="alert">
              {props.warning}
            </div>
          )}
        </div>
        {panel === "mods" && (
          <SourceModPicker
            draft={draft}
            spec={spec}
            remaining={op.remaining}
            onChange={(hullMods) => change({ hullMods })}
          />
        )}
      </NativeFrame>
      {weaponDetails.content}
      {panel === "weapons" && selected && (
        <SourceWeaponPicker
          draft={draft}
          selected={selected}
          remaining={op.remaining}
          onClose={() => setPanel(null)}
          onInstall={(weaponId) => {
            onChange(withWeapon(draft, slotId, weaponId));
            setPanel(null);
            setFeedback(
              weaponId ? "已安装 " + weaponName(weaponId) : "已卸下武器",
            );
          }}
        />
      )}
      {panel === "groups" && (
        <SourceWeaponGroups
          draft={draft}
          spec={spec}
          onClose={() => {
            setPanel(null);
            setGroupHighlight(null);
          }}
          onConfirm={(groups) => {
            change({ groups });
            setPanel(null);
            setGroupHighlight(null);
          }}
        />
      )}
      {panel === "designs" && (
        <Suspense fallback={<Modal title="装配方案" eyebrow="" onClose={() => setPanel(null)}><div className="source-variant-picker">正在读取原版装配方案…</div></Modal>}>
        <SourceVariantPicker draft={draft} designs={designs} onClose={() => setPanel(null)}
          onApply={next => { onChange(next); setFeedback("已应用装配方案；可使用撤消恢复。"); }}
          onSave={props.onSave} onDelete={props.onDelete} onRename={props.onRename} />
        </Suspense>
      )}
      {panel === "wings" && deckIndex < stats.fighterBays && (
        <SourceWingPicker key={draft.hullId + ':' + deckIndex} draft={draft} index={deckIndex}
          onClose={() => setPanel(null)} onEquip={id => { onChange(withWing(draft, deckIndex, id)); setPanel(null); setFeedback(id ? "已更换联队 · 可撤消恢复" : "已卸下联队 · 可撤消恢复"); }} />
      )}
      {panel === "help" && (
        <Modal
          title="舰船改装"
          eyebrow="操作说明"
          onClose={() => setPanel(null)}
        >
          <div className="native-help">
            <p>
              点击左侧舰船选择舰体。点击船上的武器挂点，安装兼容武器；内置武器不可替换。
            </p>
            <p>
              右侧分配幅能容存器、耗散通道与舰体插件。每个容存器增加 200
              幅能，每个耗散通道增加 10 幅能/秒，均消耗 1 OP。
            </p>
            <p>
              底部「武器组」设置齐射、交替与自动开火；「装配方案」保存、读取、重命名或删除本地设计。
            </p>
            <p>
              {props.roomLayout ? "在房间内直接改装自己的舰船，应用修改收到确认后才可准备或开始。" : props.embedded ? "「应用并返回房间」提交当前配装；编辑期间不会改变房间配置，返回后还需准备。" : "「模拟战斗」使用当前配置进入战斗，结束后回到这里，战损不改变设计。"}
            </p>
            <label>
              <input
                type="checkbox"
                checked={showMounts}
                onChange={(e) => setShowMounts(e.target.checked)}
              />
              始终显示武器挂点
            </label>
            <p className="native-modal-note">
              顶部「角色技能」或 C 进入独立舰长技能界面。
              滚轮缩放舰体；W 武器组，V 装配方案，A 插件，Ctrl+S 保存，U 撤消，T
              清空，N {props.embedded?.primaryLabel ?? "模拟战斗"}，X 下一舰体。
            </p>
          </div>
        </Modal>
      )}
    </main>
  );
}

/** Layout and commit/cancel semantics follow coreui/refit/wgd2/WeaponGroupDialogV2.java. */
function SourceWeaponGroups({
  draft,
  spec,
  onClose,
  onConfirm,
}: {
  draft: Design;
  spec: ShipSpec;
  onClose: () => void;
  onConfirm: (groups: Group[]) => void;
}) {
  const [groups, setGroups] = useState(() => structuredClone(draft.groups));
  const stats = effectiveHullStats(spec);

  // Native comparator: built-ins, size, slot type, mount type, then slot id.
  const slots = spec.weaponSlots
    .filter((s) => s.defaultWeaponId)
    .sort(
      (a, b) =>
        Number(isBuiltIn(draft.hullId, b.slotId)) -
          Number(isBuiltIn(draft.hullId, a.slotId)) ||
        { SMALL: 0, MEDIUM: 1, LARGE: 2 }[b.slotSize] -
          { SMALL: 0, MEDIUM: 1, LARGE: 2 }[a.slotSize] ||
        (b.weaponType ?? "UNIVERSAL").localeCompare(
          a.weaponType ?? "UNIVERSAL",
        ) ||
        a.mountType.localeCompare(b.mountType) ||
        a.slotId.localeCompare(b.slotId),
    );
  const flux = (group: Group) =>
    Math.round(
      group.weaponSlotIds.reduce((sum, slot) => {
        const weapon = contentRegistry.getWeapon(draft.weapons[slot] ?? "");
        return sum + (weapon ? weaponFluxPerSecond(effectiveHullModWeaponSpec(spec, weapon)) : 0);
      }, 0),
    );
  const weaponType = (weaponId: string) =>
    contentRegistry.getWeapon(weaponId)?.weaponType ?? "ENERGY";
  return (
    <Modal
      title="武器组管理"
      surface="solid"
      eyebrow=""
      onClose={onClose}
      onShortcut={(key) => {
        if (key === "enter" || key === "w") onConfirm(groups);
        if (key === "q") setGroups(autoGroups(draft));
        if (key === "t") onClose();
      }}
      footer={
        <>
          <NativeButton
            shortcut="Q"
            className="source-auto-assign"
            onClick={() => setGroups(autoGroups(draft))}
          >
            自动分配
          </NativeButton>
          <NativeButton shortcut="W" onClick={() => onConfirm(groups)}>
            确认
          </NativeButton>
          <NativeButton shortcut="T" onClick={onClose}>
            取消
          </NativeButton>
        </>
      }
    >
      <div className="source-weapon-groups">
        <section className="source-group-assignments" aria-label="武器编组">
          <div className="source-group-row source-group-autofire">
            <span>启用自动开火</span>
            {groups.map((g) => (
              <button
                type="button"
                key={g.index}
                className="source-group-cell"
                role="checkbox"
                aria-label={"武器组 " + (g.index + 1) + " 自动开火"}
                aria-checked={g.isAutofire}
                onClick={() =>
                  setGroups((all) =>
                    all.map((x) =>
                      x.index === g.index
                        ? { ...x, isAutofire: !x.isAutofire }
                        : x,
                    ),
                  )
                }
              />
            ))}
          </div>
          <div className="source-group-row source-group-header">
            <span>武器</span>
            {groups.map((g) => (
              <b key={g.index}>{g.index + 1}</b>
            ))}
          </div>
          <div
            className="source-group-scroll"
            style={{ height: Math.max(15, Math.min(24, slots.length)) * 21 }}
          >
            {slots.map((slot) => (
              <div
                className="source-group-row source-group-weapon"
                data-type={weaponType(slot.defaultWeaponId!)}
                key={slot.slotId}
              >
                <span
                  className="source-group-weapon-label"
                  title={
                    slot.slotId +
                    " · " +
                    sizes[slot.slotSize] +
                    types[slot.weaponType ?? "UNIVERSAL"] +
                    " · " +
                    slot.arcDeg +
                    "° 射界"
                  }
                >
                  <span>{weaponName(slot.defaultWeaponId!)}</span>
                  <em>
                    ({slot.mountType === "HARDPOINT" ? "挂载点" : "炮塔"})
                  </em>
                  <svg
                    viewBox="0 0 18 18"
                    className="source-group-arc"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="9" r="7.5" />
                    <path d={mountArcPath(slot.arcDeg, slot.baseAngleDeg)} />
                  </svg>
                </span>
                {groups.map((g) => (
                  <button
                    type="button"
                    key={g.index}
                    className="source-group-cell"
                    aria-label={slot.slotId + " 分配到武器组 " + (g.index + 1)}
                    aria-pressed={g.weaponSlotIds.includes(slot.slotId)}
                    onClick={() =>
                      setGroups((all) =>
                        all.map((x) => ({
                          ...x,
                          weaponSlotIds: [
                            ...x.weaponSlotIds.filter(
                              (id) => id !== slot.slotId,
                            ),
                            ...(x.index === g.index ? [slot.slotId] : []),
                          ],
                        })),
                      )
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
        <section
          className="source-group-summary"
          aria-label="武器组射击模式与幅能"
        >
          <div className="source-group-summary-row source-group-summary-header">
            <span>武器组</span>
            <span>射击模式</span>
            <span>幅能</span>
          </div>
          <div className="source-group-summary-table">
            {groups.map((g) => (
              <div
                className="source-group-summary-row"
                key={g.index}
                data-type={
                  g.weaponSlotIds.length
                    ? weaponType(draft.weapons[g.weaponSlotIds[0]]!)
                    : "EMPTY"
                }
              >
                <span>武器组 {g.index + 1}</span>
                <button
                  type="button"
                  disabled={!g.weaponSlotIds.length}
                  aria-label={"武器组 " + (g.index + 1) + " 开火模式"}
                  onClick={() =>
                    setGroups((all) =>
                      all.map((x) =>
                        x.index === g.index
                          ? {
                              ...x,
                              mode:
                                x.mode === "LINKED" ? "ALTERNATING" : "LINKED",
                            }
                          : x,
                      ),
                    )
                  }
                >
                  {!g.weaponSlotIds.length
                    ? "---"
                    : g.mode === "LINKED"
                      ? "同步射击"
                      : "交替射击"}
                </button>
                <b>{g.weaponSlotIds.length ? flux(g) : "---"}</b>
              </div>
            ))}
          </div>
          <dl>
            <dt>幅能耗散 (秒)</dt>
            <dd>{stats.fluxDissipation}</dd>
            <dt>护盾维持 (幅能/秒)</dt>
            <dd>{Math.round(stats.shieldUpkeepPerSecond)}</dd>
            <dt>幅能容量</dt>
            <dd>{stats.maxFlux}</dd>
          </dl>
        </section>
      </div>
    </Modal>
  );
}

/** Same direction/arc as the actual mount; the native UI renders these small sector glyphs. */
function mountArcPath(arc: number, angle: number) {
  if (arc >= 359) return "M9 1.5 A7.5 7.5 0 1 1 8.99 1.5 Z";
  const point = (degrees: number) => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return `${9 + 7.5 * Math.cos(radians)} ${9 + 7.5 * Math.sin(radians)}`;
  };
  return `M9 9 L${point(angle - arc / 2)} A7.5 7.5 0 ${arc > 180 ? 1 : 0} 1 ${point(angle + arc / 2)} Z`;
}
