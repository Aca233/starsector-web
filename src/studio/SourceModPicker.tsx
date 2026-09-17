import { NativeButton } from "../ui/NativeChrome";
import { useEffect, useRef, useState } from "react";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import type { ShipSpec } from "../engine/content/ShipSpec";
import {
  builtInModName,
  data,
  editableMods,
  modDescriptions,
  modReason,
  designHullSpec,
} from "./DesignModel";
import type { Design } from "./DesignModel";
import { hullModDefinitions, hullModOPCost } from "../engine/extensions/HullMods";

import { useHullModTooltip } from "./HullModTooltip";
import { matchesRefitSearch } from "./RefitSearch";

// Category membership comes from the original hull_mods.csv uiTags column.
const categories = [
  "所有类型",
  "后勤",
  "引擎",
  "战机",
  "护盾",
  "支援",
  "武器",
  "特殊",
  "相位",
  "防御",
  "需要船坞",
];
type SortKey = "name" | "manufacturer" | "cost" | "status";
const columns: { key: SortKey; label: string }[] = [
  { key: "name", label: "舰船插件" },
  { key: "manufacturer", label: "设计类型" },
  { key: "cost", label: "装配" },
  { key: "status", label: "状态 & 需求" },
];

/** ModPickerDialogV3 is an expansion of the refit screen, not a centered dialog. */
export function SourceModPicker({
  draft,
  remaining,
  onChange,
}: {
  draft: Design;
  spec: ShipSpec;
  remaining: number;
  onChange: (mods: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("所有类型");
  const [manufacturer, setManufacturer] = useState("所有设计");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "name",
    ascending: true,
  });
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    root.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const costOf = (id: string) =>
    hullModOPCost(designHullSpec(draft), id);
  const reasonFor = (id: string) =>
    modReason(draft, id) ??
    (!draft.hullMods.includes(id) && costOf(id) > remaining
      ? "装配点不足"
      : null);
  const details = useHullModTooltip(true, id => draft.hullMods.includes(id) ? "已安装 · 点击卸下" : reasonFor(id) ?? "点击安装");
  const matchesType = (id: string, type: string) =>
    type === "所有类型" || data.hullmods[id].uiTags.includes(type);
  const manufacturers = [
    ...new Set(editableMods.map((id) => data.hullmods[id].manufacturer)),
  ];
  const rows = editableMods
    .filter(
      (id) =>
        matchesRefitSearch(query, id, builtInModName(id), modDescriptions[id] ?? "") &&
        matchesType(id, category) &&
        (manufacturer === "所有设计" ||
          data.hullmods[id].manufacturer === manufacturer),
    )
    .sort((a, b) => {
      const value = (id: string) =>
        sort.key === "cost"
          ? costOf(id)
          : sort.key === "status"
            ? draft.hullMods.includes(id)
              ? "0"
              : reasonFor(id)
                ? "2"
                : "1"
            : sort.key === "manufacturer"
              ? data.hullmods[id].manufacturer
              : builtInModName(id);
      const av = value(a),
        bv = value(b);
      const compare =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av) < String(bv)
            ? -1
            : String(av) > String(bv)
              ? 1
              : 0;
      return (
        (compare ||
          (builtInModName(a) < builtInModName(b)
            ? -1
            : builtInModName(a) > builtInModName(b)
              ? 1
              : 0)) * (sort.ascending ? 1 : -1)
      );
    });
  const icon = (id: string) =>
    hullModDefinitions.get(id)?.refit?.icon;
  return (
    <section
      id="refit-mod-picker"
      className="source-mod-picker"
      aria-label="安装舰船插件"
      tabIndex={-1}
      ref={root}
    >
      <div className="refit-mod-search">
        <div className="refit-search-field"><input type="search" aria-label="搜索舰船插件" placeholder="搜索插件名称 / 效果 / ID" value={query} onChange={e => {setQuery(e.target.value); details.hide();}} />
          {query && <button type="button" className="refit-search-clear" aria-label="清空插件搜索" onClick={() => setQuery("")}>×</button>}
        </div>
        <span role="status">{rows.length} / {editableMods.length} 项</span>
        {(query || category !== "所有类型" || manufacturer !== "所有设计") && <button type="button" onClick={() => {setQuery("");setCategory("所有类型");setManufacturer("所有设计");details.hide();}}>重置筛选</button>}
      </div>
      <div role="table" aria-label="可用舰船插件" className="source-mod-table">
        <div role="row" className="source-mod-row source-mod-heading">
          {columns.map(({ key, label }) => (
            <div
              role="columnheader"
              key={key}
              aria-sort={
                sort.key === key
                  ? sort.ascending
                    ? "ascending"
                    : "descending"
                  : "none"
              }
            >
              <button
                type="button"
                onClick={() =>
                  setSort({
                    key,
                    ascending: sort.key === key ? !sort.ascending : true,
                  })
                }
              >
                {label}
                <i
                  aria-hidden="true"
                  className={
                    sort.key === key && !sort.ascending ? "ascending-arrow" : ""
                  }
                />
              </button>
            </div>
          ))}
        </div>
        <div
          role="rowgroup"
          className="source-mod-scroll"
          onScroll={() => details.hide()}
        >
          {rows.map((id) => {
            const installed = draft.hullMods.includes(id);
            const reason = reasonFor(id);
            const toggle = () => {
              if (!installed && reason) return;
              onChange(
                installed
                  ? draft.hullMods.filter((m) => m !== id)
                  : [...draft.hullMods, id],
              );
            };
            return (
              <div
                role="row"
                className={
                  "source-mod-row " + (installed ? "is-installed" : "")
                }
                key={id}
                data-unavailable={!!reason && !installed}
              >
                <div role="cell" {...details.bind(id)}>
                  <button
                    className="source-mod-select"
                    type="button"
                    aria-label={
                      builtInModName(id) +
                      (installed ? "，已安装，点击卸下" : "，点击安装")
                    }
                    aria-pressed={installed}
                    aria-disabled={!!reason && !installed}
                    onClick={toggle}
                  >
                    <img
                      src={runtimeAssetUrl("/game-assets/" + icon(id))}
                      alt=""
                    />
                    <span>{builtInModName(id)}</span>
                  </button>
                </div>
                <div role="cell" {...details.bind(id)} onClick={toggle}>
                  {data.hullmods[id].manufacturer}
                </div>
                <div role="cell" {...details.bind(id)} className="source-mod-cost" onClick={toggle}>
                  {costOf(id)}
                </div>
                <div role="cell" {...details.bind(id)} className="source-mod-status" onClick={toggle}>
                  {installed ? (
                    <span className="source-mod-check" aria-label="已安装">
                      ✓
                    </span>
                  ) : (
                    (reason ?? "")
                  )}
                </div>
              </div>
            );
          })}
          {!rows.length && (
            <p className="source-mod-empty">当前没有符合筛选条件的可用插件。</p>
          )}
        </div>
      </div>
      <div className="source-mod-filters" aria-label="插件筛选">
        <div className="source-mod-design-filters" aria-label="设计类型筛选">
          {["所有设计", ...manufacturers].map((name) => (
            <NativeButton font="caption"
              key={name}
              type="button"
              aria-pressed={manufacturer === name}
              onClick={() => {
                setManufacturer(name);
                details.hide();
              }}
            >
              {name} (
              {
                editableMods.filter(
                  (id) =>
                    name === "所有设计" ||
                    data.hullmods[id].manufacturer === name,
                ).length
              }
              )
            </NativeButton>
          ))}
        </div>
        <div className="source-mod-type-filters" aria-label="插件类型筛选">
          {categories.map((type) => {
            const count = editableMods.filter(
              (id) =>
                matchesType(id, type) &&
                (manufacturer === "所有设计" ||
                  data.hullmods[id].manufacturer === manufacturer),
            ).length;
            return (
              <NativeButton font="caption"
                type="button"
                key={type}
                aria-pressed={category === type}
                disabled={!count}
                onClick={() => {
                  setCategory(type);
                  details.hide();
                }}
              >
                {type} ({count})
              </NativeButton>
            );
          })}
        </div>
        <small className="source-mod-availability">
          仅列出已接入战斗的 {editableMods.length} 项插件
        </small>
      </div>
      {details.content}
    </section>
  );
}
