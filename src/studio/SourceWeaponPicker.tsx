import { NativeBitmapText } from "../ui/NativeBitmapText";
import { NativeBorder } from "../ui/NativeChrome";
import { NativeButton } from "../ui/NativeChrome";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "../ui/core/UI";
import { contentRegistry } from "../engine/content/ContentRegistry";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import type { WeaponMountSlotConfig } from "../engine/content/ShipSpec";
import type { WeaponSpec } from "../engine/simulation/Weapon";
import {
  nativeRefit,
  compatibility,
  designHullSpec,
  weaponOPCost,
  damageNames,
  isBuiltIn,
  sizes,
  types,
  weaponFluxPerSecond,
  weaponName,
  weapons,
} from "./DesignModel";
import type { Design } from "./DesignModel";
import { effectiveHullModWeaponSpec } from "../engine/extensions/HullMods";
import { effectiveWeaponRange } from "../engine/simulation/WeaponRange";
import tooltipData from "./weapon-tooltip-data.json";
import importedTooltips from "../engine/data/generated/refit-weapon-tooltips.json";
import { matchesRefitSearch, refitSearchRank } from "./RefitSearch";
import { FactionFilter } from "./FactionFilter";
import { factionIndex, matchesFaction } from "./FactionModel";

const metadata = { ...Object.fromEntries(Object.entries(nativeRefit.weapons).map(([id, w]) => [id, {manufacturer: w.manufacturer ?? "", role: w.role ?? "", accuracy: w.accuracy ?? "", turnRate: w.turnRate ?? "", description: w.description ?? ""}])), ...importedTooltips, ...tooltipData } as Record<
  string,
  {
    manufacturer: string;
    role: string;
    accuracy: string;
    turnRate: string;
    description: string;
  }
>;
const damageIcons: Record<string, string> = {
  KINETIC: "/game-assets/graphics/ui/icons/damagetype_kinetic.png",
  ENERGY: "/game-assets/graphics/ui/icons/damagetype_energy.png",
  HIGH_EXPLOSIVE:
    "/game-assets/graphics/ui/icons/damagetype_high_explosive.png",
  FRAGMENTATION: "/game-assets/graphics/ui/icons/damagetype_fragmentation.png",
};
const damageEffects: Record<string, string> = {
  KINETIC: "200% vs 护盾，50% vs 装甲",
  ENERGY: "100% vs 护盾，装甲，和结构",
  HIGH_EXPLOSIVE: "50% vs 护盾，200% vs 装甲",
  FRAGMENTATION: "25% vs 护盾，25% vs 装甲",
};
// BaseWeaponSpec / Oo0O: original display-name thresholds, not invented descriptions.
const accuracyName = (w: WeaponSpec) => {
  const spread = w.maxSpread ?? 0;
  return w.isBeam || spread <= 0 ? "完美" : spread <= 2 ? "优秀" : spread <= 5 ? "良好" : spread <= 10 ? "中等" : spread <= 15 ? "较差" : spread <= 20 ? "很差" : "极差";
};
const turnRateName = (w: WeaponSpec) => {
  const rate = w.turnRateDegPerSec ?? 0;
  return rate <= 0 ? "无" : rate <= 5 ? "非常慢" : rate <= 15 ? "较慢" : rate <= 25 ? "中等" : rate <= 35 ? "较快" : rate <= 50 ? "非常快" : "优秀";
};
const weaponTypes = ["BALLISTIC", "ENERGY", "MISSILE"];
const number = (value: number) => Number(value.toFixed(1)).toString();
function cycleSeconds(w: WeaponSpec) {
  return w.isBeam
    ? (w.beamSourceChargeupTime ?? 0) +
        (w.beamDuration ?? 0) +
        (w.beamSourceChargedownTime ?? 0) +
        (w.beamBurstDelay ?? 0)
    : Math.max(
        0.05,
        w.refireDelay +
          (w.chargeTime ?? 0) +
          (Math.max(1, w.burstSize ?? 1) - 1) * (w.burstDelay ?? 0),
      );
}
function dps(w: WeaponSpec) {
  if (!w.isBeam)
    return (w.damagePerShot * Math.max(1, w.burstSize ?? 1)) / cycleSeconds(w);
  if (w.beamVisualMode !== "BURST") return w.damagePerSecond;
  return (
    (w.damagePerSecond *
      ((w.beamSourceChargeupTime ?? 0) + (w.beamDuration ?? 0))) /
    Math.max(0.001, cycleSeconds(w))
  );
}
function WeaponIcon({ weapon }: { weapon: WeaponSpec }) {
  return (
    <span
      className="source-weapon-icon"
      data-type={weapon.weaponType}
      aria-hidden="true"
    >
      <span>
        <img
          src={runtimeAssetUrl(
            weapon.turretSpriteUrl ?? weapon.hardpointSpriteUrl ?? "",
          )}
          alt=""
        />
        {weapon.turretGunSpriteUrl && (
          <img src={runtimeAssetUrl(weapon.turretGunSpriteUrl)} alt="" />
        )}
      </span>
    </span>
  );
}

/** WeaponPickerDialog: mount-anchored list with an interactive, row-anchored hover/focus tooltip. */
export function SourceWeaponPicker({
  draft,
  selected,
  remaining,
  onClose,
  onInstall,
}: {
  draft: Design;
  selected: WeaponMountSlotConfig;
  remaining: number;
  onClose: () => void;
  onInstall: (id: string | null) => void;
}) {
  const installed = selected.defaultWeaponId
    ? contentRegistry.getWeapon(selected.defaultWeaponId)
    : undefined;
  const locked = isBuiltIn(draft.hullId, selected.slotId);
  const hullSpec = designHullSpec(draft);
  const [showFitted, setShowFitted] = useState(false);
  const costOf = (w: WeaponSpec) => locked ? 0 : weaponOPCost(draft, w.id);
  const rangeOf = (w: WeaponSpec) => showFitted ? effectiveWeaponRange(hullSpec, w) : w.range;
  const fitted = (w: WeaponSpec) => showFitted ? effectiveHullModWeaponSpec(hullSpec, w) : w;
  const compatible = weapons.filter((w) => !compatibility(selected, w));
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [messageLibrary, setMessageLibrary] = useState(false);
  const [enabledType, setEnabledType] = useState("ALL");
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [faction, setFaction] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ id: string; anchor: HTMLButtonElement } | null>(null);
  const previewAnchor = useRef<HTMLButtonElement | null>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailsId = useId();
  const cancelHide = useCallback(() => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const hidePreview = useCallback(() => {
    cancelHide();
    previewAnchor.current = null;
    setPreview(null);
  }, [cancelHide]);
  const showPreview = (id: string, anchor: HTMLButtonElement) => {
    cancelHide();
    previewAnchor.current = anchor;
    setPreview(previous => previous?.id === id && previous.anchor === anchor ? previous : { id, anchor });
  };
  const scheduleHide = useCallback(() => {
    cancelHide();
    // Bridge the small row-to-tooltip gap without pinning mouse-click focus forever.
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      if (previewAnchor.current?.matches(":hover, :focus-visible") ||
          detailsRef.current?.matches(":hover") || detailsRef.current?.querySelector(":focus-visible")) return;
      hidePreview();
    }, 180);
  }, [cancelHide, hidePreview]);
  useEffect(() => cancelHide, [cancelHide]);
  const [comparing, setComparing] = useState(false);
  // The nested codex must survive the hover/focus owner losing focus to its modal.
  const [encyclopedia, setEncyclopedia] = useState<WeaponSpec | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const budgetHere = remaining + (installed ? costOf(installed) : 0);
  const canAfford = (w: WeaponSpec) => costOf(w) <= budgetHere;
  const relevantTypes = weaponTypes.filter(type => compatible.some(w => w.weaponType === type));
  const matchingWeapons = compatible
    .filter(w => (enabledType === "ALL" || w.weaponType === enabledType) && (!affordableOnly || canAfford(w)) && matchesRefitSearch(search, weaponName(w.id), w.id, metadata[w.id]?.role ?? ""));
  const available = matchingWeapons.filter(w => matchesFaction(faction, factionIndex.weaponFactions[w.id]))
    .sort((a, b) => refitSearchRank(search, weaponName(a.id), a.id) - refitSearchRank(search, weaponName(b.id), b.id)
      || Number(canAfford(b)) - Number(canAfford(a))
      || Number(b.mountSize === selected.slotSize) - Number(a.mountSize === selected.slotSize)
      || costOf(b) - costOf(a) || a.id.localeCompare(b.id));
  const candidate = preview
    ? (preview.id === installed?.id ? installed : available.find(w => w.id === preview.id))
    : undefined;
  const candidateId = candidate?.id;
  const meta = candidate ? metadata[candidate.id] : undefined;
  const isCurrent = candidate?.id === installed?.id;
  const compare = !!comparing && !!installed && !!candidate && !isCurrent;
  const toggleType = (type: string) => {
    if (locked || (type !== "ALL" && !relevantTypes.includes(type))) return;
    setEnabledType(type === enabledType ? "ALL" : type);
    hidePreview();
  };
  const resetFilters = () => { setSearch(""); setEnabledType("ALL"); setAffordableOnly(false); setFaction(""); hidePreview(); searchRef.current?.focus(); };
  useEffect(() => { if (advanced) searchRef.current?.focus({preventScroll: true}); }, [advanced]);
  useEffect(() => {
    const panel = ref.current?.closest<HTMLElement>(".ui-modal");
    if (!panel) return;
    const preventSearchInsertion = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key.toLowerCase() !== "f" || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
        target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Modal opens and focuses search on this same keydown. Cancel text insertion before
      // its portal-root shortcut handler runs, but leave normal typing inside search alone.
      event.preventDefault();
    };
    panel.addEventListener("keydown", preventSearchInsertion);
    return () => panel.removeEventListener("keydown", preventSearchInsertion);
  }, []);
  useLayoutEffect(() => {
    const panel = ref.current?.closest<HTMLElement>(".ui-modal");
    if (!panel) return;
    const position = () => {
      const mount = document.querySelector<HTMLElement>(
        `.refit-vessel [data-slot-id="${CSS.escape(selected.slotId)}"]`,
      );
      const anchor = mount?.getBoundingClientRect();
      const shell = document
        .querySelector(".refit-shell")
        ?.getBoundingClientRect();
      const narrow = window.innerWidth < 850;
      const width = Math.min(380, window.innerWidth - 24);
      const detailsWidth = narrow
        ? width
        : Math.min(420, window.innerWidth * 0.4);
      const left = narrow
        ? (window.innerWidth - width) / 2
        : Math.min(
            Math.min(window.innerWidth - width - 16, (shell?.right ?? window.innerWidth) - width - 18),
            Math.max(
              detailsWidth + 28,
              (anchor?.right ?? window.innerWidth * 0.62) + 18,
            ),
          );
      panel.style.setProperty("--weapon-picker-left", `${Math.round(left)}px`);
      panel.style.setProperty(
        "--weapon-picker-top",
        `${Math.round(Math.max(14, (shell?.top ?? 126) - 112))}px`,
      );

    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [selected.slotId]);
  useLayoutEffect(() => {
    const details = detailsRef.current, anchor = preview?.anchor;
    if (!candidateId || !details || !anchor) return;
    const position = () => {
      if (!anchor.isConnected) { hidePreview(); return; }
      const viewport = window.visualViewport;
      const minX = (viewport?.offsetLeft ?? 0) + 12;
      const minY = (viewport?.offsetTop ?? 0) + 12;
      const maxX = minX + (viewport?.width ?? window.innerWidth) - 24;
      const maxY = minY + (viewport?.height ?? window.innerHeight) - 24;
      const rowRect = anchor.getBoundingClientRect();
      const scroller = anchor.closest(".source-weapon-list")?.getBoundingClientRect();
      const body = anchor.closest(".ui-modal-body")?.getBoundingClientRect();
      const clipTop = Math.max(minY, scroller?.top ?? minY, body?.top ?? minY);
      const clipBottom = Math.min(maxY, scroller?.bottom ?? maxY, body?.bottom ?? maxY);
      // A scrolled-away row is no longer a hover target; do not leave a detached tooltip behind.
      if (rowRect.bottom <= clipTop || rowRect.top >= clipBottom) { hidePreview(); return; }
      const gap = 6;
      const leftRoom = rowRect.left - minX - gap, rightRoom = maxX - rowRect.right - gap;
      let width = Math.min(420, maxX - minX);
      let side: "left" | "right" | "above" | "below";
      let maxHeight = maxY - minY;
      if (leftRoom >= width) side = "left";
      else if (rightRoom >= width) side = "right";
      else if (Math.max(leftRoom, rightRoom) >= 260) {
        side = leftRoom >= rightRoom ? "left" : "right";
        width = Math.min(width, side === "left" ? leftRoom : rightRoom);
      } else {
        const above = rowRect.top - minY - gap, below = maxY - rowRect.bottom - gap;
        side = below >= above ? "below" : "above";
        // On narrow screens use the space above/below the actual row, with internal scrolling.
        maxHeight = Math.min(maxHeight, Math.max(80, side === "below" ? below : above));
      }
      details.style.width = width + "px";
      details.style.maxHeight = maxHeight + "px";
      const height = details.getBoundingClientRect().height;
      const left = side === "left" ? rowRect.left - gap - width : side === "right" ? rowRect.right + gap : rowRect.left;
      const top = side === "above" ? rowRect.top - gap - height : side === "below" ? rowRect.bottom + gap : rowRect.top;
      details.style.left = Math.max(minX, Math.min(left, maxX - width)) + "px";
      details.style.top = Math.max(minY, Math.min(top, maxY - height)) + "px";
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(details);
    observer.observe(anchor);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [candidateId, preview, hidePreview]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Control") setComparing(e.type === "keydown");
    };
    const blur = () => { setComparing(false); hidePreview(); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("blur", blur);
    };
  }, [hidePreview]);
  const row = (w: WeaponSpec, current = false) => {
    const affordable =
      costOf(w) <=
      remaining + (installed ? costOf(installed) : 0);
    const disabled = current ? locked : locked || !affordable;
    return (
      <button
        type="button"
        key={w.id}
        className={
          "source-weapon-row " + (current ? "source-equipped-weapon" : "")
        }
        aria-label={
          current
            ? (locked ? "内置武器" : "卸下") + weaponName(w.id)
            : "安装" + weaponName(w.id)
        }
        data-weapon-choice={current ? undefined : w.id}
        aria-disabled={disabled}
        data-preview={candidate?.id === w.id}
        aria-controls={candidate?.id === w.id ? detailsId : undefined}
        onMouseEnter={e => showPreview(w.id, e.currentTarget)}
        onMouseLeave={scheduleHide}
        onFocus={e => showPreview(w.id, e.currentTarget)}
        onBlur={scheduleHide}
        onClick={() => {
          if (!disabled) onInstall(current ? null : w.id);
        }}
      >
        <WeaponIcon weapon={w} />
        <span className="source-weapon-row-info">
          <strong><NativeBitmapText font="body" color="currentColor">{weaponName(w.id)}</NativeBitmapText></strong>
          <span>
            {metadata[w.id]?.role || damageNames[w.type]}，射程 {number(rangeOf(w))}
          </span>
          <span className="source-weapon-stock">
            {current
              ? locked
                ? "舰体内置，不能卸载"
                : "点击卸载"
              : affordable
                ? "无限 可用"
                : "装配点不足"}
          </span>
          <small>{current ? "装配" : "模拟装备库"}</small>
        </span>
        <span className="source-weapon-op">
          <b>{costOf(w)}</b>
          <small>装配点数</small>
        </span>
      </button>
    );
  };
  const stat = (label: string, read: (weapon: WeaponSpec) => number | string) =>
    candidate && (
      <div
        className="source-weapon-detail-stat"
        key={label}
        data-compare={compare}
      >
        <dt>{label}</dt>
        {compare && (
          <dd className="source-weapon-compare">{read(installed!)}</dd>
        )}
        <dd>{read(candidate)}</dd>
      </div>
    );
  return (
    <>
      <Modal
        title={
          installed
            ? "当前安装 - 按住 Ctrl 键进行对比"
            : "选择武器 - 按住 Ctrl 键进行对比"
        }
        eyebrow=""
        initialFocus="panel"
        onClose={onClose}
        onShortcut={(key) => {
          if (key === "0") toggleType("ALL");
          if (["1", "2", "3"].includes(key))
            toggleType(weaponTypes[Number(key) - 1]);
          if (key === "4") setMessageLibrary(true);
          if (key === "f") setAdvanced(value => !value);
          if (key === "f2" && candidate) setEncyclopedia(candidate ?? null);
        }}
      >
        <div className="source-weapon-picker" ref={ref}>
          {installed ? (
            row(installed, true)
          ) : (
            <div className="source-weapon-empty-mount">
              {sizes[selected.slotSize]}
              {types[selected.weaponType ?? "UNIVERSAL"]}挂点 · 未安装武器
            </div>
          )}
          {!locked && <div className="source-weapon-tabs">
            <div className="source-type-filters" role="group" aria-label="武器类型筛选">
              {weaponTypes.map((type, index) => <NativeButton key={type} font="body" shortcut={String(index + 1)} data-type={type}
                aria-pressed={enabledType === type || (enabledType === "ALL" && relevantTypes.includes(type))}
                disabled={!relevantTypes.includes(type)} onClick={() => toggleType(type)}>{types[type]}</NativeButton>)}
            </div>
            <div className="source-ownership-filters" role="group" aria-label="装备来源">
              <NativeButton font="body" shortcut="4" aria-pressed="true" onClick={() => setMessageLibrary(true)} title="当前使用完整模拟装备库，不扣除库存">拥有</NativeButton>
              <NativeButton font="body" shortcut="5" disabled title="尚未接入市场交易">合法购买</NativeButton>
              <NativeButton font="body" shortcut="6" disabled title="尚未接入黑市交易">非法购买</NativeButton>
            </div>
          </div>}
          {!locked && advanced && <div className="refit-weapon-filters">
            <div className="refit-search-field">
              <input ref={searchRef} aria-label="搜索可安装武器" type="search" autoComplete="off" value={search}
                onChange={e => {setSearch(e.target.value); hidePreview();}} placeholder="搜索武器名称 / ID"
                onKeyDown={e => {if (e.key === "ArrowDown") {e.preventDefault(); ref.current?.querySelector<HTMLButtonElement>('[data-weapon-choice]')?.focus();}}} />
              {search && <button type="button" className="refit-search-clear" aria-label="清空武器搜索" onClick={() => {setSearch("");hidePreview();searchRef.current?.focus();}}>×</button>}
            </div>
            <FactionFilter label="武器势力筛选" value={faction} onChange={value => {setFaction(value); hidePreview();}}
              memberships={matchingWeapons.map(w => factionIndex.weaponFactions[w.id] ?? [])} />
            <div className="refit-weapon-filter-meta"><label><input type="checkbox" checked={affordableOnly} onChange={e => {setAffordableOnly(e.target.checked); hidePreview();}} />只看 OP 够用</label>
              {(search || enabledType !== "ALL" || affordableOnly || faction) && <button type="button" onClick={resetFilters}>重置</button>}
            </div>
            <p className="refit-weapon-result-count" role="status">{available.length} 种兼容武器 · 当前可用 {budgetHere} OP</p>
          </div>}
          <div className="source-weapon-list">
            {!locked && available.map((w) => row(w))}
            {(locked || !available.length) && (
              <p className="source-weapon-empty">
                {locked
                  ? "该武器属于舰体内置装置，不能替换。"
                  : "没有符合筛选条件的武器。"}
              </p>
            )}
            {!locked && !available.length && (search || enabledType !== "ALL" || affordableOnly || faction) && <NativeButton font="caption" className="refit-weapon-empty-reset" onClick={resetFilters}>清除筛选，显示兼容武器</NativeButton>}
          </div>
          {!locked && <div className="source-weapon-search-toggle">
            <button onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}>搜索 / 势力筛选 [F]{(search || faction || affordableOnly) ? " · 已筛选" : ""}</button>
            <span>{available.length} 种 · {budgetHere} OP</span>
          </div>}
          {messageLibrary && <p className="source-library-note" role="status">模拟装备库：无限库存，不涉及交易。<button onClick={() => setMessageLibrary(false)} aria-label="关闭装备库说明">×</button></p>}
          {candidate && (
            <aside ref={detailsRef} id={detailsId} className="source-weapon-details" aria-label="武器详细参数"
              onMouseEnter={cancelHide} onMouseLeave={scheduleHide} onFocus={cancelHide} onBlur={scheduleHide}>
              <NativeBorder />
              <h3>
                <NativeBitmapText font="body" color="currentColor">{weaponName(candidate.id)}</NativeBitmapText>
                {isCurrent && <em> - 当前安装</em>}
              </h3>
              <p className="source-weapon-manufacturer">
                设计类型：<span>{meta?.manufacturer ?? "普通"}</span>
              </p>
              <p className="source-weapon-description">
                {meta?.description.split("\n\n")[0]}
              </p>
              {meta?.description.includes("\n\n") && <p className="source-weapon-attribution">{meta.description.split("\n\n").slice(1).join("\n\n")}</p>}
              <h4 className="source-weapon-stat-title"><button onClick={() => setShowFitted(value => !value)} title="点击切换原始数据 / 当前舰船插件加成后的数据">{showFitted ? "舰装后数据" : "原始数据"}{compare && <span>（当前安装 / 预览）</span>}</button></h4>
              <div className="source-weapon-primary">
                <WeaponIcon weapon={candidate} />
                <dl>
                  {stat(
                    "战术应用",
                    (w) => metadata[w.id]?.role || damageNames[w.type],
                  )}
                  {stat(
                    "安装类型",
                    (w) =>
                      `${sizes[w.mountSize]}，${types[w.mountTypeOverride ?? w.weaponType ?? "ENERGY"]}`,
                  )}
                  {stat("装配点数", w => showFitted ? costOf(w) : nativeRefit.weapons[w.id]?.op ?? costOf(w))}
                  <div className="source-weapon-stat-gap" />
                  {stat("武器射程", (w) => number(rangeOf(w)))}
                  {stat(
                    "伤害",
                    (w) =>
                      number(w.isBeam ? w.damagePerSecond : w.damagePerShot) +
                      (w.isBeam ? "/秒" : ""),
                  )}
                  {stat("伤害 / 秒", (w) => number(dps(w)))}
                  <div className="source-weapon-stat-gap" />
                  {stat("幅能 / 秒", (w) => number(weaponFluxPerSecond(fitted(w))))}
                  {stat("幅能 / 每发射弹", (w) =>
                    w.isBeam ? "—" : number(fitted(w).fluxPerShot),
                  )}
                  {stat("幅能 / 伤害", (w) =>
                    dps(w) ? number(weaponFluxPerSecond(fitted(w)) / dps(w)) : "—",
                  )}
                </dl>
              </div>
              <h4>辅助数据</h4>
              <div className="source-weapon-secondary">
                <img
                  className="source-damage-icon"
                  src={runtimeAssetUrl(damageIcons[candidate.type])}
                  alt=""
                />
                <dl>
                  {stat("伤害类型", (w) => damageNames[w.type])}
                  <div className="source-damage-effect">
                    {damageEffects[candidate.type]}
                  </div>
                  <div className="source-weapon-stat-gap" />
                  {stat(
                    "精确度",
                    (w) =>
                      (!showFitted ? metadata[w.id]?.accuracy || accuracyName(w) : w.isBeam ? "精确"
                        : `${number(w.minSpread ?? 0)}° - ${number(fitted(w).maxSpread ?? 0)}°`),
                  )}
                  {stat(
                    "转向速度",
                    (w) =>
                      !showFitted ? metadata[w.id]?.turnRate || turnRateName(w) :
                      showFitted && selected.mountType === "HARDPOINT" ? "固定挂点" :
                      `${number(fitted(w).turnRateDegPerSec ?? 0)}°/秒`,
                  )}
                  <div className="source-weapon-stat-gap" />
                  {stat("开火间隔 (秒)", (w) =>
                    w.isBeam && w.beamVisualMode !== "BURST"
                      ? "持续"
                      : number(cycleSeconds(w)),
                  )}
                  {candidate.maxAmmo !== undefined &&
                    stat("弹药容量", (w) => fitted(w).maxAmmo ?? "无限")}
                </dl>
              </div>
              <button
                type="button"
                className="source-weapon-codex"
                onClick={() => setEncyclopedia(candidate ?? null)}
              >
                按 <kbd>F2</kbd> 打开数据百科
              </button>
            </aside>
          )}
        </div>
      </Modal>
      {encyclopedia && (
        <Modal
          title={weaponName(encyclopedia.id)}
          eyebrow="武器数据百科"
          onClose={() => setEncyclopedia(null)}
        >
          <article className="source-weapon-encyclopedia">
            <WeaponIcon weapon={encyclopedia} />
            <p>{metadata[encyclopedia.id]?.description || "暂无武器背景资料。"}</p>
            <small>原作资料；上方装配界面使用当前引擎已接入的武器参数。</small>
          </article>
        </Modal>
      )}
    </>
  );
}
