import { RefitHint } from './RefitHint';
import { currentImportReasons } from '../engine/data/SourceCapabilities';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
// Only search/reference metadata is eager; full records load with their category.
import { catalogText } from 'virtual:native-catalog';
import { catalogRelationFields } from './CatalogRelations';
import type { CatalogKind as Kind } from './CatalogRelations';
import { useCatalogPart } from './NativeCatalogData';
import type { Json, RecordData } from './NativeCatalogData';
import runtimeData from "../engine/data/generated/refit-source.json";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import { hullModDefinitions } from "../engine/extensions/HullMods";
import { shipSystemDefinitions } from "../engine/extensions/ship-systems/Registry";
import "./native-catalog.css";

type Level = "supported" | "approximate" | "unsupported";
type Status = { level: Level; reasons: string[] };
interface CatalogData {
  schemaVersion: number;
  ships: RecordData[];
  weapons: RecordData[];
  wings: RecordData[];
  hullmods: RecordData[];
  systems: RecordData[];
  variants: RecordData[];
  projectiles: RecordData[];
  descriptions: RecordData[];
  report: RecordData;
}
interface RuntimeData {
  wings?: Record<string, {specId: string}>;
  ships: Record<string, { op: number; name: string; manufacturer: string; designation: string }>;
  weapons: Record<string, { op: number; name: string }>;
  shipStatus: Record<string, Status>;
  weaponStatus: Record<string, Status>;
}
interface Entry {
  key: string; sourceIndex: number; kind: Kind; id: string; name: string; subtitle: string; search: string;
  raw: RecordData; stats: RecordData; spec: RecordData; sourcePath: string; hullSize: string; status: Status;
}
interface Link { kind: Kind; id: string; label: string; target?: Entry }
interface Location { kind: Kind; query: string; status: "all" | Level; page: number; key: string | null; sort: string }
export interface NativeCatalogProps { onClose: () => void; onRefit: (hullId: string) => void; onVariant?: (spec: Record<string, unknown>) => void }

const PAGE_SIZE = 50;
const categories: { kind: Kind; label: string; short: string }[] = [
  { kind: "ships", label: "舰船", short: "HULL" }, { kind: "weapons", label: "武器", short: "WPN" },
  { kind: "wings", label: "战机联队", short: "WING" }, { kind: "hullmods", label: "船体插件", short: "MOD" },
  { kind: "systems", label: "舰船系统", short: "SYS" }, { kind: "variants", label: "装配方案", short: "VAR" },
  { kind: "projectiles", label: "弹丸", short: "PROJ" },
];
const categoryName = (kind: Kind) => categories.find(c => c.kind === kind)!.label;
const levelNames: Record<Level, string> = { supported: "运行时可用", approximate: "近似实现", unsupported: "仅目录" };
const sizeNames: Record<string, string> = {
  FIGHTER: "战斗机", FRIGATE: "护卫舰", DESTROYER: "驱逐舰", CRUISER: "巡洋舰", CAPITAL_SHIP: "主力舰",
  SMALL: "小型", MEDIUM: "中型", LARGE: "大型", BALLISTIC: "实弹", ENERGY: "能量", MISSILE: "导弹",
};
const fieldNames: Record<string, string> = {
  cooldown: "冷却时间", "max uses": "最大使用次数", regen: "充能恢复", "charge up": "启动时间", active: "持续时间", down: "关闭时间", "flux/second": "每秒幅能", "flux/use": "单次幅能",
  name: "名称", id: "标识", designation: "舰种", "tech/manufacturer": "科技 / 制造商",
  "system id": "舰船系统", "defense id": "防御系统", "fleet pts": "部署点数", hitpoints: "结构值",
  "armor rating": "装甲", "max flux": "幅能容量", "flux dissipation": "幅能耗散", "ordnance points": "装配点数",
  "fighter bays": "机库", "max speed": "最高航速", acceleration: "加速度", deceleration: "减速度",
  "max turn rate": "转向速率", "turn acceleration": "转向加速度", mass: "质量", "shield type": "护盾类型",
  "shield arc": "护盾覆盖角", "shield upkeep": "护盾维持", "shield efficiency": "护盾效率",
  "min crew": "最低船员", "max crew": "船员容量", cargo: "货舱", fuel: "燃料", "fuel/ly": "每光年燃料",
  "max burn": "巡航速度", "base value": "基础价值", "peak CR sec": "峰值作战时间", "supplies/mo": "每月补给",
  range: "射程 / 作战范围", "damage/second": "每秒伤害", "damage/shot": "单发伤害", emp: "电磁伤害",
  "turn rate": "转向速率", OPs: "装配点数", ammo: "弹药", "ammo/sec": "弹药再生", type: "类型",
  "energy/shot": "单发幅能", "energy/second": "每秒幅能", "burst size": "连发数量", "burst delay": "连发间隔",
  "proj speed": "弹丸速度", "flight time": "飞行时间", "proj hitpoints": "弹丸结构", tags: "标签",
  tier: "等级", rarity: "稀有度", "op cost": "装配点数", num: "编队数量", role: "职责", "role desc": "职责说明",
  variant: "战机装配方案", formation: "队形", refit: "整备时间", uiTags: "界面标签", script: "原生脚本",
  cost_frigate: "护卫舰 OP", cost_dest: "驱逐舰 OP", cost_cruiser: "巡洋舰 OP", cost_capital: "主力舰 OP",
  desc: "原始说明", short: "简述", sModDesc: "永久插件说明", hullId: "舰体", hullSize: "舰体级别",
  systemId: "系统", spriteName: "贴图", sprite: "贴图", projectileSpecId: "弹丸定义", displayName: "显示名称",
  fluxCapacitors: "幅能容器", fluxVents: "幅能耗散器", builtInMods: "内置插件", builtInWeapons: "内置武器",
  builtInWings: "内置联队", hullMods: "船体插件", permaMods: "永久插件", sMods: "S 插件", modules: "模块",
  weaponGroups: "武器编组", weaponSlots: "武器槽", sourcePath: "来源路径", baseHullId: "基础舰体",
};
const object = (value: unknown): RecordData => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordData : {};
const text = (value: unknown): string => typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
const first = (...items: unknown[]) => items.map(text).find(v => v.trim().length > 0) ?? "";
const values = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(values) : typeof value === "string" ? (value.trim() ? [value.trim()] : []) : Object.values(object(value)).flatMap(values);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const normal = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
const pretty = (value: unknown) => JSON.stringify(value, null, 2) ?? "null";
const display = (value: Json): string => value === null ? "null" : value === "" ? "（空值）" : typeof value === "object" ? pretty(value) : String(value);
function parseDocument<T>(source: string, fallback: T): { data: T; error: string } {
  try {
    const parsed: unknown = JSON.parse(source);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("根节点不是对象");
    return { data: parsed as T, error: "" };
  } catch (error) { return { data: fallback, error: error instanceof Error ? error.message : String(error) }; }
}
const sourceDocument = parseDocument<CatalogData>(catalogText, {
  schemaVersion: 1, ships: [], weapons: [], wings: [], hullmods: [], systems: [], variants: [], projectiles: [], descriptions: [], report: {},
});
// Reuse the refit data already imported by the runtime; do not bundle a second raw copy.
const runtimeDocument = { data: runtimeData as unknown as RuntimeData, error: "" };
const catalog = sourceDocument.data;
const runtime = runtimeDocument.data;
function statusFor(kind: Kind, id: string): Status {
  if (kind === "ships" || kind === "weapons") {
    const statuses = kind === "ships" ? runtime.shipStatus : runtime.weaponStatus;
    const status = statuses && has(statuses, id) ? statuses[id] : undefined;
    if (status && has(levelNames, status.level)) return { level: status.level, reasons: currentImportReasons(Array.isArray(status.reasons) ? status.reasons.map(String) : []) };
    return { level: "unsupported", reasons: ["运行时清单未提供此条目的支持状态；原始数据仍可完整查阅。"] };
  }
  if (kind === "wings" && runtime.wings && has(runtime.wings, id))
    return {level: "approximate", reasons: ["可在 Web 航母机库装配，并计入 OP。使用现有战机 AI，特殊系统、补充与轰炸机制不保证原生一致。"]};
  if (kind === "hullmods" && hullModDefinitions.get(id)?.support?.scope === "campaign-only")
    return { level: "unsupported", reasons: [hullModDefinitions.get(id)!.support!.summary, hullModDefinitions.get(id)!.description ?? "仅战役效果，不是战斗插件失效。"] };
  if (kind === "hullmods" && hullModDefinitions.get(id)?.status === "implemented")
    return { level: "approximate", reasons: ["已注册网页运行时插件定义；这不是原生 Java 脚本的执行结果，不保证全部效果一致。"] };
  if (kind === "systems" && shipSystemDefinitions.all().some(d => !d.unavailable && d.id !== "NONE" && (d.id === id || d.sourceIds.includes(id))))
    return { level: "approximate", reasons: ["存在对应的网页舰船系统定义；时序、AI 与原生 Java 行为不保证一致。"] };
  return { level: "unsupported", reasons: [kind === "systems" || kind === "hullmods"
    ? "仅收录原始定义。原生 Java 脚本不等于网页运行时实现。"
    : "该类条目仅作为源数据展示；关联对象可用不代表此条目已完整支持。"] };
}
function makeIndex() {
  const byKind = Object.fromEntries(categories.map(c => [c.kind, []])) as Record<Kind, Entry[]>;
  const byId = Object.fromEntries(categories.map(c => [c.kind, new Map<string, Entry>()])) as Record<Kind, Map<string, Entry>>;
  for (const { kind } of categories) {
    const rows = Array.isArray(catalog[kind]) ? catalog[kind] : [];
    rows.forEach((row, i) => {
      const raw = object(row), spec = object(raw.spec);
      const stats = kind === "wings" || kind === "hullmods" ? raw : object(raw.stats);
      const id = first(raw.id, stats.id, spec.id, kind === "variants" ? spec.variantId : spec.hullId) || `未命名记录-${i + 1}`;
      const hullSize = first(raw.hullSize, spec.hullSize);
      const name = first(raw.name, stats.name, spec.hullName, spec.name, spec.displayName, stats["role desc"], id);
      const subtitle = [sizeNames[hullSize] || hullSize, sizeNames[text(spec.size)] || text(spec.size),
        sizeNames[text(spec.type)] || first(spec.type, stats.type, stats.role), first(stats.designation, stats["tech/manufacturer"])].filter(Boolean).join(" · ");
      const entry: Entry = { key: `${kind}:${i}:${id}`, sourceIndex: i, kind, id, name, subtitle, search: "", raw, stats, spec,
        sourcePath: first(raw.sourcePath), hullSize, status: statusFor(kind, id) };
      byKind[kind].push(entry);
      // Duplicates stay visible; references resolve to the first source record.
      if (!byId[kind].has(id)) byId[kind].set(id, entry);
    });
  }
  for (const entry of byKind.variants) {
    const hull = byId.ships.get(text(entry.spec.hullId));
    if (hull) entry.name = `${hull.name} · ${entry.name}`;
    if (hull && has(runtime.ships, hull.id) && hull.hullSize !== "FIGHTER") entry.status = {level: "approximate", reasons: ["可转换载入 Web 改装：保留可用武器、编组与幅能投资。未适配插件、联队或特殊机制会在载入前逐项提示并要求确认；不代表无损还原。"]};
  }
  for (const entry of byKind.wings) {
    const variant = byId.variants.get(text(entry.stats.variant));
    const hull = variant && byId.ships.get(text(variant.spec.hullId));
    if (hull && !text(entry.raw.name)) entry.name = `${hull.name}联队`;
  }
  const all = categories.flatMap(c => byKind[c.kind]);
  for (const entry of all) entry.search = normal([entry.id, entry.name, entry.subtitle, entry.sourcePath,
    text(entry.stats.tags), text(entry.stats.uiTags), text(entry.stats["role desc"]), text(entry.raw.baseHullId)].join(" "));
  const outgoing = new Map<string, Link[]>(), incoming = new Map<string, Link[]>();
  const add = (from: Entry, kind: Kind, id: string, label: string) => {
    if (!id || id.toUpperCase() === "NONE") return;
    const target = byId[kind].get(id);
    if (target?.key === from.key) return;
    const links = outgoing.get(from.key) ?? [];
    if (links.some(l => l.kind === kind && l.id === id && l.label === label)) return;
    links.push({ kind, id, label, target }); outgoing.set(from.key, links);
    if (target) {
      const reverse = incoming.get(target.key) ?? [];
      reverse.push({ kind: from.kind, id: from.id, label, target: from }); incoming.set(target.key, reverse);
    }
  };
  // Explicit source IDs only: a Java class name does not prove a relationship.
  const fields = catalogRelationFields;
  const walk = (entry: Entry, value: Json, depth = 0) => {
    if (depth > 24 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(v => walk(entry, v, depth + 1)); return; }
    for (const [field, child] of Object.entries(value)) {
      const relation = fields[field.replace(/[ _-]/g, "").toLowerCase()];
      if (!relation) { walk(entry, child, depth + 1); continue; }
      const [kind, label] = relation;
      if (child !== null && typeof child === "object" && !Array.isArray(child)) {
        for (const [slot, target] of Object.entries(child)) for (const id of values(target)) add(entry, kind, id, `${label} · ${slot}`);
      } else for (const id of values(child)) add(entry, kind, id, label);
    }
  };
  for (const entry of all) {
    walk(entry, entry.spec);
    if (entry.kind === "ships") {
      add(entry, "ships", text(entry.raw.baseHullId), "基础舰体");
      add(entry, "systems", text(entry.stats["system id"]), "舰船系统");
      add(entry, "systems", text(entry.stats["defense id"]), "防御系统");
      add(entry, "variants", text(entry.stats["codex variant id"]), "图鉴方案");
    }
    if (entry.kind === "wings") {
      add(entry, "variants", text(entry.stats.variant), "战机方案");
      const variant = byId.variants.get(text(entry.stats.variant));
      if (variant) add(entry, "ships", text(variant.spec.hullId), "战机舰体");
    }
  }
  const descriptions = new Map<string, RecordData[]>();
  for (const row of Array.isArray(catalog.descriptions) ? catalog.descriptions : []) {
    const id = text(row.id); descriptions.set(id, [...(descriptions.get(id) ?? []), row]);
  }
  return { byKind, byId, outgoing, incoming, descriptions };
}
// Built once when this lazy screen is imported, not on each keystroke.
const index = makeIndex();
const sortEntries = (entries: Entry[], sort: string) => sort === "source" ? entries : entries.sort((a, b) =>
  (sort === "id" ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name, "zh-CN")) || a.id.localeCompare(b.id));
function sourceDescriptions(entry: Entry): RecordData[] {
  const types: Record<Kind, string[]> = {
    ships: ["SHIP", "HULL"], weapons: ["WEAPON"], wings: ["WING", "FIGHTER_WING"], hullmods: ["HULLMOD", "HULL_MOD"],
    systems: ["SHIP_SYSTEM", "SHIPSYSTEM", "SYSTEM"], variants: ["VARIANT"], projectiles: ["PROJECTILE"],
  };
  return (index.descriptions.get(entry.id) ?? []).filter(row => !text(row.type) || types[entry.kind].includes(text(row.type).toUpperCase()));
}
function spritesFor(entry: Entry, seen = new Set<string>()): { label: string; path: string }[] {
  if (seen.has(entry.key)) return []; seen.add(entry.key);
  const result: { label: string; path: string }[] = [];
  for (const [label, candidate] of [
    ["主体", entry.raw.sprite], ["主体", entry.spec.spriteName], ["主体", entry.spec.sprite], ["弹头", entry.spec.bulletSprite], ["辉光", entry.spec.glowSprite],
    ["炮塔", entry.spec.turretSprite], ["固定炮座", entry.spec.hardpointSprite],
    ["炮塔炮管", entry.spec.turretGunSprite], ["固定炮管", entry.spec.hardpointGunSprite], ["炮塔辉光", entry.spec.turretGlowSprite], ["固定炮座辉光", entry.spec.hardpointGlowSprite],
    ["图标", entry.stats.sprite], ["图标", entry.stats.icon], ["图标", entry.spec.iconSprite], ["图标", entry.spec.icon],
  ] as [string, unknown][]) {
    const path = text(candidate).trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/^game-assets\//, "");
    // Never interpret catalog strings as arbitrary URLs or filesystem traversal.
    if (path && !path.includes(":") && !path.startsWith("/") && !path.split("/").includes("..") && /\.(png|jpe?g|webp|gif)$/i.test(path)
      && !result.some(r => r.path === path)) result.push({ label, path });
  }
  if (!result.length && (entry.kind === "variants" || entry.kind === "wings")) {
    const next = entry.kind === "variants" ? index.byId.ships.get(text(entry.spec.hullId)) : index.byId.variants.get(text(entry.stats.variant));
    if (next) return spritesFor(next, seen).map(sprite => ({ ...sprite, label: `关联舰体 · ${sprite.label}` }));
  }
  return result;
}
function canRefit(entry: Entry): boolean {
  return entry.kind === "ships" && !!runtime.ships && has(runtime.ships, entry.id)
    && !!entry.hullSize && entry.hullSize.toUpperCase() !== "FIGHTER" && entry.status.level !== "unsupported";
}
function Badge({ status }: { status: Status }) {
  return <RefitHint text={status.reasons.join("\n")}><span className={`nc-badge nc-badge--${status.level}`} ><span aria-hidden="true">●</span> {levelNames[status.level]}</span></RefitHint>;
}
function Pager({ page, count, onChange, label }: { page: number; count: number; onChange: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return <nav className="nc-pager" aria-label={label}>
    <button type="button" disabled={page === 0} onClick={() => onChange(0)} aria-label={`${label}：第一页`}>«</button>
    <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label={`${label}：上一页`}>上一页</button>
    <span aria-live="polite">{page + 1} / {pages}<small>{count ? `${page * PAGE_SIZE + 1}–${Math.min(count, (page + 1) * PAGE_SIZE)}` : "0"} / {count}</small></span>
    <button type="button" disabled={page >= pages - 1} onClick={() => onChange(page + 1)} aria-label={`${label}：下一页`}>下一页</button>
    <button type="button" disabled={page >= pages - 1} onClick={() => onChange(pages - 1)} aria-label={`${label}：最后一页`}>»</button>
  </nav>;
}
function PropertyTable({ value, title }: { value: RecordData; title: string }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => Object.entries(value).filter(([key, cell]) => normal(`${key} ${fieldNames[key] ?? ""} ${display(cell)}`).includes(normal(query))), [value, query]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  return <section className="nc-properties" aria-label={title}>
    <div className="nc-section-heading"><h3>{title}</h3><span>{Object.keys(value).length} 字段</span></div>
    {Object.keys(value).length ? <>
      <input className="nc-field-search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} aria-label={`搜索${title}字段`} placeholder="搜索字段、原始键名或数值…" type="search" />
      <table><caption className="nc-sr-only">{title}，保留原始数值与空值</caption><tbody>{rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map(([key, cell]) =>
        <tr key={key}><th scope="row">{fieldNames[key] ?? (key || "（空列名）")}<code>{key}</code></th><td><pre>{display(cell)}</pre></td></tr>,
      )}</tbody></table>
      {!rows.length && <p className="nc-empty-inline">没有匹配字段。</p>}
      {rows.length > PAGE_SIZE && <Pager page={safePage} count={rows.length} onChange={setPage} label={`${title}分页`} />}
    </> : <p className="nc-empty-inline">源记录未提供这些字段；未以网页运行时数值补齐。</p>}
  </section>;
}
function SpritePreview({ entry }: { entry: Entry }) {
  const sprites = useMemo(() => spritesFor(entry), [entry]);
  const [active, setActive] = useState(0), [scale, setScale] = useState(1);
  const [failed, setFailed] = useState<string[]>([]);
  const sprite = sprites[active];
  return <section className="nc-preview" aria-label="原始贴图预览">
    <div className="nc-section-heading"><h3>原始贴图</h3><span>SPRITE</span></div>
    <div className="nc-sprite-stage">
      <span className="nc-crosshair nc-crosshair--x" aria-hidden="true" /><span className="nc-crosshair nc-crosshair--y" aria-hidden="true" />
      {sprite && !failed.includes(sprite.path) ? <img key={sprite.path} src={runtimeAssetUrl("/game-assets/" + sprite.path)} alt={`${entry.name} · ${sprite.label}`} decoding="async"
        style={{ transform: `scale(${scale})` }} onError={() => setFailed(previous => [...previous, sprite.path])} />
        : <div className="nc-sprite-empty"><span aria-hidden="true">◇</span><strong>{sprite ? "贴图未导入或无法加载" : "此定义没有独立贴图"}</strong><small>数据仍可完整查阅</small></div>}
      <span className="nc-sprite-caption">单张源贴图 · 非战斗效果预览</span>
    </div>
    {!!sprites.length && <div className="nc-sprite-controls">
      {sprites.length > 1 && <select aria-label="选择贴图层" value={active} onChange={event => { setActive(Number(event.target.value)); setScale(1); }}>{sprites.map((item, i) => <option key={item.path} value={i}>{item.label}</option>)}</select>}
      <label>缩放 <input type="range" aria-label="贴图缩放" min="0.5" max="2" step="0.1" value={scale} onChange={event => setScale(Number(event.target.value))} /></label>
      <button type="button" onClick={() => setScale(1)} aria-label="重置贴图缩放">{Math.round(scale * 100)}%</button>
    </div>}
    {sprite && <code className="nc-asset-path">{sprite.path}</code>}
  </section>;
}
function Relationships({ entry, navigate }: { entry: Entry; navigate: (entry: Entry) => void }) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const outgoing = index.outgoing.get(entry.key) ?? [], incoming = index.incoming.get(entry.key) ?? [];
  const links = (direction === "out" ? outgoing : incoming).filter(link => normal(`${link.label} ${link.id} ${link.target?.name ?? ""} ${categoryName(link.kind)}`).includes(normal(query)));
  const safePage = Math.min(page, Math.max(0, Math.ceil(links.length / PAGE_SIZE) - 1));
  return <section className="nc-relations" aria-label="内容关联">
    <div className="nc-segment" role="group" aria-label="关联方向">
      <button type="button" aria-pressed={direction === "out"} onClick={() => { setDirection("out"); setPage(0); }}>引用的内容 <b>{outgoing.length}</b></button>
      <button type="button" aria-pressed={direction === "in"} onClick={() => { setDirection("in"); setPage(0); }}>被哪些内容引用 <b>{incoming.length}</b></button>
    </div>
    <p className="nc-muted">只连接源数据中的明确 ID。未收录目标保留显示；原生脚本内部引用未自动推断。</p>
    <input type="search" className="nc-field-search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="搜索关联名称、ID 或槽位…" aria-label="搜索关联内容" />
    <ul className="nc-link-list">{links.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((link, i) => <li key={`${direction}:${safePage}:${i}`}>
      {link.target ? <button type="button" className="nc-relation-link" onClick={() => navigate(link.target!)}>
        <span className="nc-relation-type">{categoryName(link.kind)} <span aria-hidden="true">↗</span></span>
        <span><strong>{link.target.name}</strong><code>{link.id}</code><small>{link.label}</small></span><Badge status={link.target.status} />
      </button> : <div className="nc-relation-link nc-relation-missing"><span className="nc-relation-type">{categoryName(link.kind)}</span><span><strong>{link.id}</strong><small>{link.label}</small></span><span>未收录目标</span></div>}
    </li>)}</ul>
    {!links.length && <p className="nc-empty-inline">{query ? "没有匹配的关联。" : "源数据中没有可识别的此方向关联。"}</p>}
    <Pager page={safePage} count={links.length} onChange={setPage} label="关联分页" />
  </section>;
}
function RawView({ entry, descriptions }: { entry: Entry; descriptions: RecordData[] }) {
  const [part, setPart] = useState("record"), [notice, setNotice] = useState("");
  const payload = useMemo(() => pretty(part === "spec" ? entry.spec : part === "stats" ? entry.stats : part === "descriptions" ? descriptions : entry.raw), [part, entry, descriptions]);
  return <section className="nc-raw" aria-label="原始 JSON">
    <div className="nc-raw-toolbar"><label>查看 <select value={part} onChange={event => { setPart(event.target.value); setNotice(""); }} aria-label="选择原始数据部分">
      <option value="record">完整目录记录</option><option value="stats">原始 CSV 字段</option><option value="spec">解析后的定义 spec</option><option value="descriptions">原始说明记录</option>
    </select></label><button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(payload); setNotice("已复制 JSON"); }
      catch { setNotice("无法访问剪贴板，请选中下方文本手动复制。"); }
    }}>复制 JSON</button></div>
    <p className="nc-muted">以下是导入器保留的原始字段 / 解析后定义，不是原文件的逐字文本；不替换为运行时数值。</p>
    <span role="status" className="nc-copy-notice">{notice}</span><pre className="nc-json" tabIndex={0} aria-label="可选择复制的原始 JSON">{payload}</pre>
  </section>;
}
type DetailsProps = { entry: Entry; navigate: (entry: Entry) => void; onRefit: (id: string) => void; onVariant?: NativeCatalogProps["onVariant"] };
function CatalogLoading({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div className="nc-data-error" role="alert"><p>目录数据加载失败：{error}。可继续搜索或切换分类。</p><button type="button" onClick={retry}>重试加载</button></div>
    : <div className="nc-empty" role="status">正在加载完整原始数据…</div>;
}
function Details(props: DetailsProps) {
  const { data, error, retry } = useCatalogPart(props.entry.kind);
  const entry = useMemo(() => {
    if (!data) return undefined;
    const raw = data[props.entry.sourceIndex];
    if (!raw) return undefined;
    return { ...props.entry, raw, spec: object(raw.spec), stats: props.entry.kind === "wings" || props.entry.kind === "hullmods" ? raw : object(raw.stats) };
  }, [data, props.entry]);
  return entry ? <LoadedDetails {...props} entry={entry} /> : <CatalogLoading error={error ?? (data ? "当前分块缺少此记录，请刷新目录。" : undefined)} retry={retry} />;
}
function LoadedDetails({ entry, navigate, onRefit, onVariant }: DetailsProps) {
  const [view, setView] = useState("overview"), [specOpen, setSpecOpen] = useState(false);
  const descriptions = useMemo(() => sourceDescriptions(entry), [entry]);
  const variantHull = entry.kind === "variants" ? index.byId.ships.get(text(entry.spec.hullId)) : undefined;
  const loadableVariant = !!variantHull && !!runtime.ships && has(runtime.ships, variantHull.id) && !!variantHull.hullSize && variantHull.hullSize.toUpperCase() !== "FIGHTER";
  const relationCount = (index.outgoing.get(entry.key)?.length ?? 0) + (index.incoming.get(entry.key)?.length ?? 0);
  const preferred: Record<Kind, string[]> = {
    ships: ["hitpoints", "armor rating", "max flux", "flux dissipation", "ordnance points", "max speed", "fighter bays", "fleet pts"],
    weapons: ["OPs", "range", "damage/shot", "damage/second", "energy/shot", "ammo", "type", "proj speed"],
    wings: ["op cost", "num", "role desc", "range", "refit", "formation"],
    hullmods: ["cost_frigate", "cost_dest", "cost_cruiser", "cost_capital", "tier", "tech/manufacturer"],
    systems: ["cooldown", "max uses", "regen", "charge up", "active", "down", "flux/second", "flux/use"], variants: [], projectiles: [],
  };
  const metrics = preferred[entry.kind].filter(key => has(entry.stats, key) && entry.stats[key] !== "").slice(0, 8);
  const explanation = [first(entry.stats.short, entry.stats.desc), ...descriptions.flatMap(row => ["text1", "text2", "text3", "text4", "text5"].map(key => text(row[key])))].filter(Boolean);
  const tabs = [{ id: "overview", name: "原始数据" }, { id: "links", name: `关联 ${relationCount}` }, { id: "raw", name: "JSON / 定义" }];
  return <>
    <header className="nc-detail-heading"><div><span className="nc-eyebrow">{categoryName(entry.kind)} / SOURCE RECORD</span><h2>{entry.name}</h2><code>{entry.id}</code><p>{entry.subtitle || "未提供分类信息"}</p></div>
      <div className="nc-detail-actions"><Badge status={entry.status} />{canRefit(entry) ? <button type="button" className="nc-primary" onClick={() => onRefit(entry.id)}>进入改装 <span aria-hidden="true">→</span></button>
        : entry.kind === "ships" && <span className="nc-refit-note">{entry.hullSize.toUpperCase() === "FIGHTER" ? "战斗机不开放独立改装" : "未进入可改装的运行时舰体清单"}</span>}{onVariant && loadableVariant && <button type="button" className="nc-primary" onClick={() => onVariant({ ...entry.spec, variantId: first(entry.spec.variantId, entry.id) })}>载入原版装配方案 <span aria-hidden="true">→</span></button>}</div>
    </header>
    <div className={`nc-support-note nc-support-note--${entry.status.level}`}><strong>{levelNames[entry.status.level]} ≠ 原生行为完全一致</strong>
      <ul>{(entry.status.reasons.length ? entry.status.reasons : ["状态来自运行时支持清单；不代表全部系统、插件或装配方案具有原生行为。"] ).map((reason, i) => <li key={i}>{reason}</li>)}</ul>
    </div>
    <div className="nc-detail-tabs" role="group" aria-label="详情视图">{tabs.map(tab => <button type="button" key={tab.id} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}>{tab.name}</button>)}</div>
    {view === "overview" && <div className="nc-overview">
      <div className="nc-overview-top"><SpritePreview entry={entry} /><div className="nc-source-summary"><div className="nc-section-heading"><h3>原始参数摘录</h3><span>非运行时修正值</span></div>
        {metrics.length ? <dl className="nc-metrics">{metrics.map(key => <div key={key}><dt>{fieldNames[key] ?? key}</dt><dd>{display(entry.stats[key])}</dd></div>)}</dl>
          : <p className="nc-empty-inline">此类定义没有统一的战斗参数摘要，请查阅下方全部字段或 JSON。</p>}
        <div className="nc-provenance"><strong>来源</strong><code>{entry.sourcePath || (entry.kind === "wings" || entry.kind === "hullmods" ? "原始 CSV 记录（导入器未提供行路径）" : "源记录未提供路径")}</code>
          <span>显示源数据单位，未换算、未补值。空值与 0 分别保留。</span></div>
      </div></div>
      {explanation.length > 0 && <section className="nc-description"><div className="nc-section-heading"><h3>原始说明</h3><span>保留占位符</span></div>{Array.from(new Set(explanation)).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</section>}
      <PropertyTable value={entry.stats} title={entry.kind === "wings" || entry.kind === "hullmods" ? "完整 CSV 记录" : "原始 CSV 参数"} />
      {Object.keys(entry.spec).length > 0 && <details className="nc-spec-disclosure" onToggle={event => setSpecOpen(event.currentTarget.open)}><summary>展开解析后的定义字段 <span>{Object.keys(entry.spec).length} 字段</span></summary>{specOpen && <PropertyTable value={entry.spec} title="解析后的源定义" />}</details>}
      <button className="nc-wide-action" type="button" onClick={() => setView("links")}>查看引用与反向关联（{relationCount}） <span aria-hidden="true">→</span></button>
    </div>}
    {view === "links" && <Relationships entry={entry} navigate={navigate} />}
    {view === "raw" && <RawView entry={entry} descriptions={descriptions} />}
  </>;
}
function DescriptionArchive() {
  const [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const deferred = useDeferredValue(query);
  const records = useMemo(() => (Array.isArray(catalog.descriptions) ? catalog.descriptions : []).map((row, i) => ({ row, i, search: normal(pretty(row)) })), []);
  const matches = useMemo(() => records.filter(item => item.search.includes(normal(deferred))), [records, deferred]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1));
  return <section className="nc-description-archive" aria-label="完整原始说明库">
    <p>包括没有关联到舰船或武器的说明记录；字段、类型与原始占位符均保留。</p>
    <input type="search" className="nc-field-search" aria-label="搜索完整说明库" placeholder="搜索说明 ID、类型或正文…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
    {matches.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map(({ row, i }) => <details key={i}><summary>{first(row.id, `未命名说明-${i + 1}`)} <span>{text(row.type)}</span></summary><pre tabIndex={0}>{pretty(row)}</pre></details>)}
    {!matches.length && <p>没有匹配说明。</p>}
    <Pager page={safePage} count={matches.length} onChange={setPage} label="原始说明分页" />
  </section>;
}
function FullImportReport() {
  const { data, error, retry } = useCatalogPart('report');
  return data ? <><p>报告是导入时快照，不是运行时兼容性证明。解析失败的原文件如未生成记录，只能在本报告中查阅。</p><pre tabIndex={0} aria-label="完整导入报告">{pretty(data)}</pre></> : <CatalogLoading error={error} retry={retry} />;
}
function ImportReport() {
  const [open, setOpen] = useState(false), [view, setView] = useState("report");
  const report = object(catalog.report);
  const issueCount = (value: Json | undefined) => Array.isArray(value) ? value.length : typeof value === "number" ? value : Object.keys(object(value)).length;
  return <details className="nc-report" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}><summary>导入报告 / 说明库 <span>缺失资源 {issueCount(report.missingAssets)} · 解析错误 {issueCount(report.parseErrors)}</span></summary>
    {open && <div><div className="nc-report-tabs" role="group" aria-label="档案附录"><button type="button" aria-pressed={view === "report"} onClick={() => setView("report")}>完整导入报告</button><button type="button" aria-pressed={view === "descriptions"} onClick={() => setView("descriptions")}>全部原始说明</button></div>
      {view === "report" ? <FullImportReport /> : <DescriptionArchive />}
    </div>}
  </details>;
}
export default function NativeCatalog({ onClose, onRefit, onVariant }: NativeCatalogProps) {
  const [location, setLocation] = useState<Location>({ kind: "ships", query: "", status: "all", page: 0, key: null, sort: "source" });
  const [history, setHistory] = useState<Location[]>([]);
  const deferredQuery = useDeferredValue(location.query);
  const searchRef = useRef<HTMLInputElement>(null), listRef = useRef<HTMLUListElement>(null);
  const detailRef = useRef<HTMLElement>(null), tabsRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const rows = index.byKind[location.kind];
  const filtered = useMemo(() => {
    const terms = normal(deferredQuery).trim().split(/\s+/).filter(Boolean);
    return sortEntries(rows.filter(entry => (location.status === "all" || entry.status.level === location.status) && terms.every(term => entry.search.includes(term))), location.sort);
  }, [rows, deferredQuery, location.status, location.sort]);
  const page = Math.min(location.page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = pageRows.find(row => row.key === location.key) ?? pageRows[0];
  const statusCounts = useMemo(() => rows.reduce((counts, entry) => { counts[entry.status.level]++; return counts; }, { supported: 0, approximate: 0, unsupported: 0 }), [rows]);
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [page, deferredQuery, location.kind, location.status, location.sort]);
  useEffect(() => { if (detailRef.current) detailRef.current.scrollTop = 0; }, [selected?.key]);
  const changeCategory = (kind: Kind) => setLocation(previous => ({ kind, query: "", status: "all", page: 0, key: null, sort: previous.sort }));
  const navigate = (entry: Entry) => {
    setHistory(previous => [...previous.slice(-49), { ...location, page, key: selected?.key ?? null }]);
    const sorted = sortEntries([...index.byKind[entry.kind]], location.sort);
    setLocation({ kind: entry.kind, query: "", status: "all", page: Math.floor(sorted.findIndex(item => item.key === entry.key) / PAGE_SIZE), key: entry.key, sort: location.sort });
    detailRef.current?.focus();
  };
  const goBack = () => {
    const previous = history[history.length - 1];
    if (previous) { setLocation(previous); setHistory(entries => entries.slice(0, -1)); detailRef.current?.focus(); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.defaultPrevented) return;
    const editable = event.target instanceof HTMLElement && !!event.target.closest("input, textarea, select, [contenteditable=true]");
    if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !editable)) {
      event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select();
    } else if (event.key === "Escape" && !editable) { event.preventDefault(); onClose(); }
    else if (event.altKey && event.key === "ArrowLeft" && history.length) { event.preventDefault(); goBack(); }
  };
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = categories.findIndex(c => c.kind === location.kind);
    const next = event.key === "ArrowRight" ? (current + 1) % categories.length : event.key === "ArrowLeft" ? (current + categories.length - 1) % categories.length : event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : -1;
    if (next < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); changeCategory(categories[next].kind);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };
  return <main className="native-catalog" onKeyDown={onKeyDown} aria-labelledby={`${uid}-title`}>
    <header className="nc-header"><div><span className="nc-eyebrow">STARSECTOR / NATIVE CONTENT ARCHIVE</span><h1 id={`${uid}-title`}>原生内容档案</h1><p>浏览源定义，核对支持边界。</p></div>
      <div className="nc-header-actions"><RefitHint text="Alt + ←"><button type="button" disabled={!history.length} onClick={goBack} >← 返回上一条</button></RefitHint><RefitHint text="Esc（非输入状态）"><button type="button" className="nc-close" onClick={onClose} >关闭 / 返回 <span aria-hidden="true">×</span></button></RefitHint></div>
    </header>
    <div className="nc-caution"><span aria-hidden="true">△</span><span>完整目录不等于完整移植。原始数值仅供查阅；Java 系统、插件与武器特效可能未实现或仅近似。</span><strong>{categories.reduce((sum, c) => sum + index.byKind[c.kind].length, 0).toLocaleString()} 条源记录</strong></div>
    {(sourceDocument.error || runtimeDocument.error || catalog.schemaVersion !== 1) && <p role="alert" className="nc-data-error">{sourceDocument.error && `目录解析失败：${sourceDocument.error}。`}{runtimeDocument.error && `运行时清单解析失败：${runtimeDocument.error}；改装已保守禁用。`}{catalog.schemaVersion !== 1 && `目录版本 ${String(catalog.schemaVersion)} 与预期 v1 不同。`}</p>}
    <div className="nc-tabs" role="tablist" aria-label="内容分类" ref={tabsRef} onKeyDown={onTabKey}>{categories.map(category => <button type="button" key={category.kind} id={`${uid}-tab-${category.kind}`} role="tab" aria-selected={location.kind === category.kind} aria-controls={`${uid}-panel`} tabIndex={location.kind === category.kind ? 0 : -1} onClick={() => changeCategory(category.kind)}>
      <small>{category.short}</small><span>{category.label}</span><b>{index.byKind[category.kind].length}</b>
    </button>)}</div>
    <div className="nc-toolbar"><label className="nc-search"><span aria-hidden="true">⌕</span><span className="nc-sr-only">搜索原生名称或 ID</span><input ref={searchRef} type="search" value={location.query} onChange={event => setLocation(previous => ({ ...previous, query: event.target.value, page: 0, key: null }))} placeholder="搜索原生名称 / ID / 标签…" /><kbd>/</kbd></label>
      <label className="nc-select-label">支持状态<select value={location.status} onChange={event => setLocation(previous => ({ ...previous, status: event.target.value as Location["status"], page: 0, key: null }))}><option value="all">全部（{rows.length}）</option>{(Object.keys(levelNames) as Level[]).map(level => <option value={level} key={level}>{levelNames[level]}（{statusCounts[level]}）</option>)}</select></label>
      <label className="nc-select-label">排序<select value={location.sort} onChange={event => setLocation(previous => ({ ...previous, sort: event.target.value, page: 0, key: null }))}><option value="source">原始顺序</option><option value="name">名称</option><option value="id">ID</option></select></label>
    </div>
    <section id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${location.kind}`} className="nc-workspace" aria-busy={deferredQuery !== location.query}>
      <aside className="nc-browser" aria-label={`${categoryName(location.kind)}列表`}><div className="nc-list-heading"><strong>{categoryName(location.kind)}</strong><span role="status">{deferredQuery !== location.query ? "筛选中…" : `${filtered.length} / ${rows.length} 条`}</span></div>
        <ul ref={listRef} className="nc-entry-list">{pageRows.map(entry => <li key={entry.key}><button type="button" className="nc-entry" aria-pressed={selected?.key === entry.key} onClick={() => setLocation(previous => ({ ...previous, key: entry.key }))}>
          <span className="nc-entry-text"><strong>{entry.name}</strong><code>{entry.id}</code><small>{entry.subtitle || categoryName(entry.kind)}</small></span><Badge status={entry.status} />
        </button></li>)}</ul>
        {!filtered.length && <div className="nc-empty"><span aria-hidden="true">◇</span><h2>{rows.length ? "没有匹配内容" : "此分类暂无源记录"}</h2><p>{rows.length ? "试试名称的一部分或原始 ID；未实现的内容也在“全部”中。" : "检查导入报告，确认该类源文件已被收录。"}</p>{rows.length > 0 && <button type="button" onClick={() => setLocation(previous => ({ ...previous, query: "", status: "all", page: 0, key: null }))}>清除筛选</button>}</div>}
        <Pager page={page} count={filtered.length} onChange={next => setLocation(previous => ({ ...previous, page: next, key: null }))} label="目录分页" />
      </aside>
      <section className="nc-detail" ref={detailRef} tabIndex={-1} aria-label={selected ? `${selected.name}的详情` : "条目详情"}>{selected ? <Details key={selected.key} entry={selected} navigate={navigate} onRefit={onRefit} onVariant={onVariant} /> : <div className="nc-empty nc-empty--detail"><span aria-hidden="true">⌖</span><h2>等待选择条目</h2><p>所有源记录均可浏览；支持状态不会默认隐藏任何内容。</p></div>}</section>
    </section>
    <ImportReport />
    <footer className="nc-footer"><span>CATALOG v{catalog.schemaVersion ?? "?"} <i> / </i> {Array.isArray(catalog.descriptions) ? catalog.descriptions.length : 0} 条原始说明</span><span><kbd>/</kbd> 搜索 <kbd>Tab</kbd> 导航 <kbd>Alt ←</kbd> 返回关联 <kbd>Esc</kbd> 关闭（非输入状态）</span></footer>
  </main>;
}
