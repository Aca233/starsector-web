import { resolveSystemId, shipSystemDefinitions } from '../engine/extensions/ship-systems/Registry';
import { systemLoadoutErrors } from '../engine/extensions/ship-systems/Loadout';
import { nativeModules } from '../engine/content/ModularVariants';
import { randomId } from "../shared/RandomId";
import { validCaptainProfile, type CaptainProfile } from "./CaptainProfile";
import { combatSkillErrors } from "../engine/extensions/CombatSkills";
import type { CombatSkillLoadout } from "../engine/extensions/CombatSkills";
import { weaponFitsSlotType } from "../engine/content/WeaponCompatibility";
import sourceShips from "../engine/data/generated/ships.json";
import refitData from "./refit-data.json";
import importedRefit from "../engine/data/generated/refit-source.json";
import { modManager } from "../engine/modding/ModManager";
import { contentRegistry } from "../engine/content/ContentRegistry";
import type {
  ShipSpec,
  WeaponMountSlotConfig,
} from "../engine/content/ShipSpec";
import type { WeaponSpec } from "../engine/simulation/Weapon";
import type { HullModSupport } from "../engine/extensions/HullMods";
import { effectiveFighterBays, hullModDefinitions, hullModInstallReason, hullModLoadoutErrors, hullModOPCost, effectiveWeaponOP } from "../engine/extensions/HullMods";
import { i18n } from "../engine/i18n/LocalizationManager";

export interface RefitWing {
  tags?: string[];
  specId: string; role: 'FIGHTER' | 'BOMBER'; count: number; rebuildSeconds: number; op: number; name: string;
  displayName?: string; sourceRole?: string; roleDescription?: string; range?: number | null; formation?: string; category?: 'INTERCEPTOR' | 'FIGHTER' | 'BOMBER';
}
export interface ImportStatus { level: 'supported' | 'approximate' | 'unsupported'; reasons: string[]; }
export const nativeRefit = importedRefit as unknown as {
  hullmods?: Record<string, {name: string; implemented: boolean; support?: HullModSupport}>;
  sourceBuiltInMods?: Record<string, string[]>;
  sourceBuiltInWings?: Record<string, string[]>;
  ships: Record<string, {op: number; name: string; manufacturer: string; designation: string}>;
  weapons: Record<string, {op: number; name: string; builtInOnly?: boolean; manufacturer?: string; role?: string; accuracy?: string; turnRate?: string; description?: string}>;
  shipStatus: Record<string, ImportStatus>;
  weaponStatus: Record<string, ImportStatus>;
  wings?: Record<string, RefitWing>;
};
export const data = { ...refitData, ships: {...nativeRefit.ships, ...refitData.ships}, weapons: {...nativeRefit.weapons, ...refitData.weapons}, hullmods: Object.fromEntries(hullModDefinitions.all().filter(mod => mod.refit).map(mod => [mod.id, { name: mod.name, ...mod.refit! }])) } as {
  source: string;
  fluxPerCapacitor: number;
  dissipationPerVent: number;
  limits: Record<string, number>;
  ships: Record<
    string,
    { op: number; name: string; manufacturer: string; designation: string }
  >;
  weapons: Record<string, { op: number; name: string }>;
  hullmods: Record<
    string,
    {
      name: string;
      cost: Record<string, number>;
      uiTags: string[];
      manufacturer: string;
    }
  >;
};
export const hulls = Object.keys(data.ships).map((id) =>
  modManager.requireShip(id),
).filter(h => h.hullSize !== "FIGHTER" && !h.isModuleHull);
export const weapons = contentRegistry
  .getAllWeapons()
  .filter((w) => data.weapons[w.id] && w.id !== "tpc" && !nativeRefit.weapons[w.id]?.builtInOnly);
// One catalog drives installation UI, import validation, OP and battle effects.
export const editableMods = hullModDefinitions.all()
  .filter(mod => mod.status === "implemented" && mod.refit && !mod.refit.builtInOnly)
  .map(mod => mod.id);
export const modDescriptions: Record<string, string> = Object.fromEntries(
  hullModDefinitions.all().map(mod => [mod.id, mod.description ?? "尚未实现"]),
);
export const sizes: Record<string, string> = {
  SMALL: "小型",
  MEDIUM: "中型",
  LARGE: "大型",
};
export const types: Record<string, string> = {
  BALLISTIC: "实弹",
  ENERGY: "能量",
  MISSILE: "导弹",
  HYBRID: "混合",
  COMPOSITE: "复合",
  SYNERGY: "协同",
  UNIVERSAL: "通用",
  BUILT_IN: "内置",
};
export const damageNames: Record<string, string> = {
  KINETIC: "动能",
  HIGH_EXPLOSIVE: "高爆",
  ENERGY: "能量",
  FRAGMENTATION: "破片",
};
export type Group = {
  index: number;
  weaponSlotIds: string[];
  mode: "LINKED" | "ALTERNATING";
  isAutofire: boolean;
};
export interface Design {
  version: 1;
  id: string;
  name: string;
  hullId: string;
  sourceVariantId?: string;
  /** Undefined inherits the native fit; [] intentionally removes all tactical skills. */
  systemTypes?: string[];
  /** Undefined inherits the hull; NONE removes only the right-click skill, not its shield. */
  rightClickSystemType?: string;
  /** Only edited modules, keyed by native attachment slot (not hull ID). */
  modules?: Record<string, Design>;
  weapons: Record<string, string | null>;
  hullMods: string[];
  sMods?: string[];
  captainSkills?: CombatSkillLoadout;
  captainProfile?: CaptainProfile;
  /** Omitted only in legacy saves: retain their original fixed fighter decks. */
  /** Null is an empty deck; other decks keep their original positions. */
  wings?: (string | null)[];
  capacitors: number;
  vents: number;
  groups: Group[];
  updatedAt: number;
}
export interface DesignLibrary {
  version: 1;
  baseline?: Design;
  draft: Design;
  designs: Design[];
}
export const storageKey =
  "starsector-web:design-studio:v1:" + import.meta.env.BASE_URL;
export const weaponName = (id: string) =>
  data.weapons[id]?.name ??
  i18n.t(contentRegistry.getWeapon(id)?.nameKey ?? id);
export const baseHull = (id: string): ShipSpec | undefined => {
  const hull = Object.hasOwn(data.ships, id) ? modManager.getShip(id) : undefined;
  return hull?.hullSize === 'FIGHTER' ? undefined : hull;
};
export const nativeHull = (id: string): ShipSpec =>
  (sourceShips as unknown as Record<string, ShipSpec>)[id];
export const isBuiltIn = (hullId: string, slotId: string) =>
  !!nativeHull(hullId)?.weaponSlots.find((s) => s.slotId === slotId)
    ?.defaultWeaponId;
export const fluxLimit = (hullId: string) =>
  data.limits[baseHull(hullId)?.hullSize ?? ""] ?? 0;
export function compatibility(
  slot: WeaponMountSlotConfig,
  weapon: WeaponSpec,
): string | null {
  const ranks: Record<string, number> = { SMALL: 1, MEDIUM: 2, LARGE: 3 };
  if (ranks[weapon.mountSize] > ranks[slot.slotSize]) return "超过挂点尺寸";
  if (!weaponFitsSlotType(slot.weaponType, weapon)) return "挂点类型不兼容";
  if (weapon.id === "tpc" || nativeRefit.weapons[weapon.id]?.builtInOnly || weapon.weaponType === undefined) return "舰体内置武器，不可外装";
  return null;
}
export function designHullSpec(d: Design): ShipSpec {
  return { ...baseHull(d.hullId)!, hullMods: d.hullMods, sMods: d.sMods ?? [], captainSkills: d.captainSkills };
}
export function modReason(d: Design, id: string): string | null {
  if (!editableMods.includes(id)) return "当前版本不支持外装该插件";
  return hullModInstallReason(designHullSpec(d), id);
}
export function weaponOPCost(d: Design, id: string): number {
  const weapon = contentRegistry.getWeapon(id);
  const metadata = data.weapons[id];
  if (!weapon || !metadata) throw new Error("缺少武器装配数据：" + id);
  return effectiveWeaponOP(designHullSpec(d), weapon, metadata.op);
}
/** Native built-in wings occupy the leading flight decks and do not cost OP. */
export function builtInWingIds(hullId: string): string[] {
  return (nativeRefit.sourceBuiltInWings?.[hullId] ?? []).filter(id => nativeRefit.wings?.[id]).slice(0, baseHull(hullId)?.fighterBays ?? 0);
}
export function designFighterBays(d: Design): number { return effectiveFighterBays(designHullSpec(d)); }
export function designWingSlots(d: Design): (string | null)[] {
  const hull = baseHull(d.hullId)!;
  const legacy = () => (hull.fighterWings ?? []).map(wing => Object.entries(nativeRefit.wings ?? {})
    .find(([, entry]) => entry.specId === wing.specId && entry.count === wing.count)?.[0] ?? null);
  const configured = d.wings ?? legacy();
  const builtins = builtInWingIds(d.hullId);
  return Array.from({length: designFighterBays(d)}, (_, index) => builtins[index] ?? configured[index] ?? null);
}
export function withWing(d: Design, index: number, id: string | null): Design {
  if (!Number.isInteger(index) || index < 0 || index >= designFighterBays(d)) throw new Error('战机甲板不存在。');
  if (index < builtInWingIds(d.hullId).length) throw new Error('内置联队不能更换或卸下。');
  if (id !== null && !nativeRefit.wings?.[id]) throw new Error('该舰载机联队尚未适配。');
  const wings = designWingSlots(d);
  wings[index] = id;
  return {...d, wings};
}
export function budget(d: Design) {
  const hull = designHullSpec(d);
  const weaponOP = Object.entries(d.weapons).reduce(
    (n, [slot, id]) =>
      n + (!id || isBuiltIn(d.hullId, slot) ? 0 : weaponOPCost(d, id)),
    0,
  );
  const modOP = d.hullMods.reduce(
    (n, id) => n + hullModOPCost(hull, id),
    0,
  );
  const builtInDeckCount = builtInWingIds(d.hullId).length;
  const wingOP = designWingSlots(d).reduce<number>((n, id, index) => n + (id && index >= builtInDeckCount ? nativeRefit.wings?.[id]?.op ?? 0 : 0), 0);
  const total = data.ships[d.hullId].op,
    fluxOP = d.capacitors + d.vents;
  return {
    total,
    used: weaponOP + modOP + fluxOP + wingOP,
    remaining: total - weaponOP - modOP - fluxOP - wingOP,
    weaponOP,
    modOP,
    fluxOP,
    wingOP,
  };
}
export function createDesign(
  hullId = "paragon",
  mode: "standard" | "empty" = "standard",
): Design {
  const hull = baseHull(hullId);
  if (!hull) throw new Error("当前舰体不支持改装。");
  const groups: Group[] = Array.from({ length: 7 }, (_, index) => ({
    index,
    weaponSlotIds: [],
    mode: "LINKED",
    isAutofire: index > 1,
  }));
  for (const g of hull.defaultWeaponGroups ?? [])
    if (groups[g.index]) groups[g.index] = { ...structuredClone(g) };
  const equipped: Record<string, string | null> = {};
  for (const slot of hull.weaponSlots) {
    equipped[slot.slotId] = slot.defaultWeaponId ?? null;
    if (
      slot.defaultWeaponId &&
      !groups.some((g) => g.weaponSlotIds.includes(slot.slotId))
    )
      groups[0].weaponSlotIds.push(slot.slotId);
  }
  const d: Design = {
    version: 1,
    id: randomId(),
    name: `${data.ships[hullId].name} · 方案 01`,
    hullId,
    weapons: equipped,
    hullMods: (hull.hullMods ?? []).filter((id) => editableMods.includes(id)),
    sMods: [...(hull.sMods ?? [])],
    wings: (hull.fighterWings ?? []).flatMap(wing => {
      const match = Object.entries(nativeRefit.wings ?? {}).find(([, entry]) => entry.specId === wing.specId && entry.count === wing.count);
      return match ? [match[0]] : [];
    }),
    capacitors: 0,
    vents: 0,
    groups,
    updatedAt: Date.now(),
  };
  // Imported hulls start from their own native loadout, never the three curated demo fits.
  if (mode === "standard" && !["paragon", "onslaught", "doom"].includes(hullId)) {
    d.hullMods = d.hullMods.filter(id => !modReason(d, id));
    // Source variants may include unimplemented equipment; only preserve valid fitted weapons.
    for (const slot of hull.weaponSlots) {
      const id = d.weapons[slot.slotId];
      if (!isBuiltIn(hullId, slot.slotId) && id) {
        const w = contentRegistry.getWeapon(id);
        if (!w || !data.weapons[id] || compatibility(slot, w)) d.weapons[slot.slotId] = null;
      }
    }
    if (budget(d).remaining < 0) {
      // Don't silently trim a native fit to disguise source OP discrepancies. Keep it visible for editing.
      d.groups = autoGroups(d);
      return d;
    }
    d.groups = autoGroups(d);
    return d;
  }
  // A new build can start completely empty. The suggested fits use only bundled,
  // simulated weapons, not unsupported original variants represented by placeholders.
  for (const slot of hull.weaponSlots) {
    if (!isBuiltIn(hullId, slot.slotId)) d.weapons[slot.slotId] = null;
  }
  d.hullMods = [];
  d.sMods = [];
  d.wings = [...builtInWingIds(hullId)];
  if (mode === "standard") {
    d.hullMods =
      hullId === "paragon"
        ? [
            "stabilizedshieldemitter",
            "hardenedshieldemitter",
            "fluxbreakers",
            "fluxdistributor",
          ]
        : hullId === "onslaught"
          ? ["targetingunit", "fluxbreakers"]
          : ["fluxbreakers"];
    const slots = [...hull.weaponSlots].sort(
      (a, b) =>
        ({ LARGE: 0, MEDIUM: 1, SMALL: 2 })[a.slotSize] -
        { LARGE: 0, MEDIUM: 1, SMALL: 2 }[b.slotSize],
    );
    for (const slot of slots) {
      if (isBuiltIn(hullId, slot.slotId)) continue;
      let id: string;
      if (slot.weaponType === "MISSILE")
        id =
          slot.slotSize === "SMALL"
            ? "atropos_single"
            : hullId === "doom"
              ? "typhoon"
              : "annihilatorpod";
      else if (slot.weaponType === "BALLISTIC")
        id =
          slot.slotSize === "LARGE"
            ? "mark9"
            : slot.slotSize === "SMALL"
              ? "lightmg"
              : slot.x > 100
                ? "heavymauler"
                : "flak";
      else if (slot.slotSize === "LARGE")
        id = slot.x > 100 ? "tachyonlance" : "autopulse";
      else if (slot.slotSize === "MEDIUM")
        id =
          slot.weaponType === "UNIVERSAL"
            ? "hveldriver"
            : slot.x < 0
              ? "taclaser"
              : hullId === "doom"
                ? "heavyblaster"
                : "gravitonbeam";
      else id = "pdburst";
      const weapon = contentRegistry.getWeapon(id)!;
      if (
        !compatibility(slot, weapon) &&
        budget(d).remaining - weaponOPCost(d, id) >=
          Math.min(20, fluxLimit(hullId))
      )
        d.weapons[slot.slotId] = id;
    }
    d.vents = Math.max(0, Math.min(fluxLimit(hullId), budget(d).remaining));
    d.capacitors = Math.max(
      0,
      Math.min(fluxLimit(hullId), budget(d).remaining),
    );
  }
  d.groups = autoGroups(d);
  return d;
}
export function withWeapon(
  d: Design,
  slotId: string,
  weaponId: string | null,
): Design {
  const next = structuredClone(d);
  const slot = baseHull(d.hullId)?.weaponSlots.find((s) => s.slotId === slotId);
  if (!slot || isBuiltIn(d.hullId, slotId)) return d;
  if (weaponId) {
    const weapon = contentRegistry.getWeapon(weaponId);
    if (!weapon || compatibility(slot, weapon)) return d;
  }
  next.weapons[slotId] = weaponId;
  if (!weaponId)
    for (const group of next.groups)
      group.weaponSlotIds = group.weaponSlotIds.filter((s) => s !== slotId);
  else if (!next.groups.some((g) => g.weaponSlotIds.includes(slotId)))
    next.groups[0].weaponSlotIds.push(slotId);
  next.updatedAt = Date.now();
  return next;
}
export function evaluate(d: Design, template?: ShipSpec) {
  return evaluateAssembly(d, template, { count: 0 }, 0);
}
function evaluateAssembly(d: Design, template: ShipSpec | undefined, state: { count: number }, depth: number): {
  spec: ShipSpec;
  errors: string[];
  op: ReturnType<typeof budget>;
} {
  if (depth > 8 || ++state.count > 128) throw new Error("模块编组超过限制。");
  const hull = template ?? baseHull(d.hullId);
  if (!hull || hull.id !== d.hullId) throw new Error("舰体不在已支持目录中。");
  const errors: string[] = [...hullModLoadoutErrors(designHullSpec(d)), ...combatSkillErrors(d.captainSkills)];
  const op = budget(d);
  if (!d.name.trim()) errors.push("请填写方案名称");
  if (op.remaining < 0) errors.push(`装配点超出 ${-op.remaining} OP`);
  if (d.capacitors > fluxLimit(d.hullId) || d.vents > fluxLimit(d.hullId))
    errors.push("幅能配置超过舰体上限");
  for (const id of d.hullMods) {
    const reason = modReason(d, id);
    if (reason) errors.push(reason);
  }
  const spec = structuredClone(hull);
  spec.maxFlux =
    nativeHull(d.hullId).maxFlux + d.capacitors * data.fluxPerCapacitor;
  spec.fluxDissipation =
    nativeHull(d.hullId).fluxDissipation + d.vents * data.dissipationPerVent;
  spec.shieldUpkeepBaseDissipation = nativeHull(d.hullId).fluxDissipation;
  spec.sourceVariantId = d.sourceVariantId;
  if (d.systemTypes !== undefined) spec.systemTypes = [...d.systemTypes];
  if (d.rightClickSystemType !== undefined) spec.rightClickSystemType = d.rightClickSystemType;
  if (!template && spec.moduleSlots?.length && d.sourceVariantId) {
    try { spec.modules = nativeModules(d.hullId, d.sourceVariantId); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (d.modules) {
    for (const [slotId, child] of Object.entries(d.modules)) {
      const mount = spec.modules?.find(m => m.slotId === slotId);
      if (!mount || child?.hullId !== mount.spec.id || child.sourceVariantId !== mount.spec.sourceVariantId) {
        errors.push(`模块 ${slotId}：与原版挂接方案不匹配`);
        continue;
      }
      try {
        const compiled = evaluateAssembly(child, mount.spec, state, depth + 1);
        mount.spec = compiled.spec;
        errors.push(...compiled.errors.map(error => `模块 ${slotId}：${error}`));
      } catch (error) { errors.push(`模块 ${slotId}：${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  spec.hullMods = [...d.hullMods];
  spec.sMods = [...(d.sMods ?? [])];
  spec.captainSkills = structuredClone(d.captainSkills ?? {});
  if (d.wings !== undefined && (!Array.isArray(d.wings) || d.wings.length > designFighterBays(d))) errors.push("舰载机联队超出机库数量");
  spec.fighterWings = designWingSlots(d).flatMap(id => {
    if (id === null) return [];
    const wing = nativeRefit.wings?.[id];
    if (!wing) { errors.push("舰载机联队尚未适配：" + id); return []; }
    return [{specId: wing.specId, role: wing.role, count: wing.count, rebuildSeconds: wing.rebuildSeconds, range: wing.range ?? undefined, tags: wing.tags}];
  });
  spec.weaponSlots = spec.weaponSlots.map((slot) => {
    const id = d.weapons[slot.slotId];
    if (isBuiltIn(d.hullId, slot.slotId))
      return {
        ...slot,
        builtIn: true,
        defaultWeaponId: nativeHull(d.hullId).weaponSlots.find(
          (s) => s.slotId === slot.slotId,
        )!.defaultWeaponId,
      };
    if (id) {
      const w = contentRegistry.getWeapon(id);
      if (!w || !data.weapons[id]) errors.push(`${slot.slotId}：武器不可用`);
      else {
        const reason = compatibility(slot, w);
        if (reason) errors.push(`${slot.slotId}：${reason}`);
      }
    }
    return { ...slot, defaultWeaponId: id ?? undefined };
  });
  errors.push(...systemLoadoutErrors(spec));
  spec.defaultWeaponGroups = structuredClone(d.groups);
  return { spec, errors: [...new Set(errors)], op };
}
/** One reserved, isolated prototype; never replace the source hull or modify library designs. */
export function registerPrototype(d: Design): string {
  if (baseHull(d.hullId)?.isModuleHull) throw new Error("模块必须随母舰部署。");
  const { spec, errors } = evaluate(d);
  if (errors.length) throw new Error(errors.join("；"));
  spec.id = "studio-prototype";
  spec.nameKey = "studio.prototype.name";
  spec.i18n = {
    zh_CN: { "studio.prototype.name": d.name },
    en_US: { "studio.prototype.name": d.name },
  };
  modManager.registerShip(spec, {
    allowExistingId: !!contentRegistry.getShip(spec.id),
  });
  return spec.id;
}
export function decodeDesign(input: unknown): Design {
  return decodeAssembly(input, undefined, { count: 0 }, 0);
}
function decodeAssembly(input: unknown, template: ShipSpec | undefined, state: { count: number }, depth: number): Design {
  if (depth > 8 || ++state.count > 128) throw new Error("模块编组超过限制。");
  if (!input || typeof input !== "object")
    throw new Error("方案不是有效对象。");
  const d = input as Design;
  if (d.sourceVariantId !== undefined && (typeof d.sourceVariantId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(d.sourceVariantId))) throw new Error("原生方案身份无效。");
  if (
    d.version !== 1 ||
    typeof d.id !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(d.id) ||
    typeof d.name !== "string" ||
    d.name.length > 48 ||
    !baseHull(d.hullId)
  )
    throw new Error("方案版本、名称或舰体不可用。");
  if (
    !Number.isFinite(d.updatedAt) ||
    ![d.vents, d.capacitors].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= fluxLimit(d.hullId),
    )
  )
    throw new Error("幅能配置无效。");
  if (!d.weapons || typeof d.weapons !== "object" || Array.isArray(d.weapons))
    throw new Error("武器配置无效。");
  const hull = baseHull(d.hullId)!;
  if (!template && hull.isModuleHull) throw new Error("模块不能作为独立舰船方案。");
  if (template && (d.hullId !== template.id || d.sourceVariantId !== template.sourceVariantId))
    throw new Error("模块舰体或原版方案与挂点不匹配。");
  const decodedModules: Record<string, Design> = {};
  if (d.modules !== undefined) {
    if (!d.modules || typeof d.modules !== "object" || Array.isArray(d.modules)) throw new Error("模块配置无效。");
    const mounts = designModules(d, template);
    for (const [slot, child] of Object.entries(d.modules)) {
      const mount = mounts.find(m => m.slotId === slot);
      if (["__proto__", "prototype", "constructor"].includes(slot) || !mount) throw new Error("模块挂点不存在：" + slot);
      decodedModules[slot] = decodeAssembly(child, mount.spec, state, depth + 1);
    }
  }
  const slots = new Set(hull.weaponSlots.map((s) => s.slotId));
  if (
    Object.keys(d.weapons).length !== slots.size ||
    Object.keys(d.weapons).some((id) => !slots.has(id))
  )
    throw new Error("方案挂点与舰体不匹配。");
  for (const slot of hull.weaponSlots) {
    const id = d.weapons[slot.slotId];
    if (isBuiltIn(d.hullId, slot.slotId)) {
      if (
        id !==
        nativeHull(d.hullId).weaponSlots.find((s) => s.slotId === slot.slotId)!
          .defaultWeaponId
      )
        throw new Error("内置武器不可更改。");
    } else if (id !== null) {
      const w =
        typeof id === "string" ? contentRegistry.getWeapon(id) : undefined;
      if (!w || !data.weapons[id!] || compatibility(slot, w))
        throw new Error("方案包含不兼容武器。");
    }
  }
  if (
    !Array.isArray(d.hullMods) ||
    d.hullMods.some((id) => !editableMods.includes(id)) ||
    new Set(d.hullMods).size !== d.hullMods.length
  )
    throw new Error("舰船插件无效。");
  if (d.sMods !== undefined && (!Array.isArray(d.sMods) || d.sMods.some(id => typeof id !== "string") || new Set(d.sMods).size !== d.sMods.length)) throw new Error("S-mod配置无效。");
  if (d.wings !== undefined && (!Array.isArray(d.wings) || d.wings.length > designFighterBays(d) || d.wings.some(id => id !== null && (typeof id !== "string" || !nativeRefit.wings?.[id])))) throw new Error("舰载机配置无效。");
  if (!Array.isArray(d.groups) || ![5, 7].includes(d.groups.length))
    throw new Error("武器组无效。");
  const assigned = new Set<string>();
  for (let i = 0; i < d.groups.length; i++) {
    const g = d.groups[i];
    if (
      !g ||
      g.index !== i ||
      !["LINKED", "ALTERNATING"].includes(g.mode) ||
      typeof g.isAutofire !== "boolean" ||
      !Array.isArray(g.weaponSlotIds)
    )
      throw new Error("武器组无效。");
    for (const id of g.weaponSlotIds) {
      if (!slots.has(id) || !d.weapons[id] || assigned.has(id))
        throw new Error("武器组挂点重复或缺失。");
      assigned.add(id);
    }
  }
  for (const [slot, id] of Object.entries(d.weapons))
    if (id && !assigned.has(slot)) throw new Error("已安装武器未分配武器组。");
  if (d.captainProfile !== undefined && !validCaptainProfile(d.captainProfile)) throw new Error("舰长姓名或头像无效。");
  const skillErrors = combatSkillErrors(d.captainSkills);
  if (skillErrors.length) throw new Error(skillErrors.join("；"));
  const modErrors = hullModLoadoutErrors(designHullSpec(d));
  if (modErrors.length) throw new Error(modErrors.join("；"));
  if (d.systemTypes !== undefined && (!Array.isArray(d.systemTypes) || d.systemTypes.length > 64 || d.systemTypes.some(id => typeof id !== 'string' || id.length > 160))) throw new Error('技能列表格式无效');
  if (d.systemTypes !== undefined) {
    const ids = d.systemTypes.map(resolveSystemId);
    if (new Set(ids).size !== ids.length || ids.some(id => id === 'NONE' || !shipSystemDefinitions.get(id) || shipSystemDefinitions.require(id).unavailable)) throw new Error('技能重复或尚未接入');
  }
  if (d.rightClickSystemType !== undefined) {
    if (typeof d.rightClickSystemType !== 'string' || d.rightClickSystemType.length > 160) throw new Error('右键技能格式无效');
    const id = resolveSystemId(d.rightClickSystemType), definition = shipSystemDefinitions.get(id);
    if (!definition || definition.unavailable) throw new Error('右键技能尚未接入');
    if (id !== 'NONE' && d.systemTypes?.some(type => resolveSystemId(type) === id)) throw new Error('右键与技能槽不能重复装配');
  }
  const decoded = structuredClone(d);
  if (d.modules !== undefined) decoded.modules = decodedModules;
  // Older web drafts had five groups. Preserve their assignments and append the
  // two empty groups present in the original WeaponGroupDialogV2 / combat input.
  while (decoded.groups.length < 7)
    decoded.groups.push({
      index: decoded.groups.length,
      weaponSlotIds: [],
      mode: "LINKED",
      isAutofire: false,
    });
  return decoded;
}
export function readLibrary(): {
  library: DesignLibrary;
  error: string | null;
  protected: boolean;
  /** Exact observed bytes for write-before-overwrite conflict detection. */
  observedRaw: string | null;
} {
  const fresh = () => ({
    version: 1 as const,
    draft: createDesign(),
    designs: [],
  });
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey);
    if (raw === null) return { library: fresh(), error: null, protected: false, observedRaw: raw };
    if (raw.length > 2_000_000) throw new Error("方案库过大");
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      !Array.isArray(value.designs) ||
      value.designs.length > 100
    )
      throw new Error("不支持的方案库版本");
    const designs = value.designs.map(decodeDesign);
    if (new Set(designs.map((d: Design) => d.id)).size !== designs.length)
      throw new Error("方案 ID 重复");
    const draft = decodeDesign(value.draft);
    const baseline = value.baseline
      ? decodeDesign(value.baseline)
      : { ...createDesign(draft.hullId), id: draft.id };
    if (
      baseline &&
      (baseline.id !== draft.id || baseline.hullId !== draft.hullId)
    )
      throw new Error("草稿编辑基准不匹配");
    return {
      library: { version: 1, draft, designs, baseline },
      error: null,
      protected: false,
      observedRaw: raw,
    };
  } catch (e) {
    return {
      library: fresh(),
      error: `未覆盖原方案数据：${e instanceof Error ? e.message : String(e)}。当前仅在内存编辑，可导出方案备份。`,
      protected: true,
      observedRaw: raw,
    };
  }
}
export class DesignLibraryConflictError extends Error {
  constructor() { super('另一页面修改了方案库。本页已暂停写入，请先导出当前方案，再刷新。'); }
}

/** Detect stale readers even before the browser delivers its storage event.
 * This is an optimistic guard, not a cross-process atomic transaction. */
export function writeLibrary(library: DesignLibrary, observedRaw: string | null): string {
  const raw = JSON.stringify(library);
  if (raw.length > 2_000_000 || library.designs.length > 100) throw new Error('方案库超过保存上限，请先导出备份。');
  if (localStorage.getItem(storageKey) !== observedRaw) throw new DesignLibraryConflictError();
  localStorage.setItem(storageKey, raw);
  return raw;
}

export const builtInModName = (id: string) =>
  hullModDefinitions.get(id)?.name ?? id;

/** Group every fitted mount once: main weapons / missiles / support / PD / reserve. */
export function autoGroups(d: Design): Group[] {
  const groups: Group[] = Array.from({ length: 7 }, (_, index) => ({
    index,
    weaponSlotIds: [],
    mode: index === 1 ? "ALTERNATING" : "LINKED",
    isAutofire: index >= 2,
  }));
  for (const [slotId, id] of Object.entries(d.weapons)) {
    if (!id) continue;
    const w = contentRegistry.getWeapon(id)!;
    const index = w.isPointDefense
      ? 3
      : w.weaponType === "MISSILE"
        ? 1
        : w.mountSize === "LARGE"
          ? 0
          : 2;
    groups[index].weaponSlotIds.push(slotId);
  }
  return groups;
}

export function weaponFluxPerSecond(w: WeaponSpec): number {
  if (w.isBeam) {
    if (w.beamVisualMode !== "BURST") return w.fluxPerSecond ?? 0;
    const active = (w.beamSourceChargeupTime ?? 0) + (w.beamDuration ?? 0);
    const cycle =
      active + (w.beamSourceChargedownTime ?? 0) + (w.beamBurstDelay ?? 0);
    return ((w.fluxPerSecond ?? 0) * active) / Math.max(0.001, cycle);
  }
  const burst = Math.max(1, w.burstSize ?? 1);
  return (
    (w.fluxPerShot * burst) /
    Math.max(
      0.05,
      w.refireDelay + (w.chargeTime ?? 0) + (burst - 1) * (w.burstDelay ?? 0),
    )
  );
}

/** Unmodified attachment templates; never derive defaults from another slot's edits. */
export function designModules(d: Design, template?: ShipSpec) {
  if (template) return template.modules ?? [];
  const hull = baseHull(d.hullId);
  return hull?.moduleSlots?.length && d.sourceVariantId
    ? nativeModules(d.hullId, d.sourceVariantId) : hull?.modules ?? [];
}

/** Recover the exact imported module fit, including flux investments and groups. */
export function designFromModule(spec: ShipSpec): Design {
  const raw = nativeHull(spec.id);
  const d: Design = {
    version: 1, id: ('module-' + spec.id).replace(/_/g, '-').slice(0, 80),
    name: (data.ships[spec.id].name + ' · 模块').slice(0, 48), hullId: spec.id,
    sourceVariantId: spec.sourceVariantId,
    ...(spec.systemTypes === undefined ? {} : { systemTypes: [...spec.systemTypes] }),
    ...(spec.rightClickSystemType === undefined ? {} : { rightClickSystemType: spec.rightClickSystemType }),
    weapons: Object.fromEntries(spec.weaponSlots.map(s => [s.slotId, s.defaultWeaponId ?? null])),
    hullMods: [...(spec.hullMods ?? [])], sMods: [...(spec.sMods ?? [])],
    capacitors: Math.round((spec.maxFlux - raw.maxFlux) / data.fluxPerCapacitor),
    vents: Math.round((spec.fluxDissipation - raw.fluxDissipation) / data.dissipationPerVent),
    groups: Array.from({length: 7}, (_, index) => {
      const group = spec.defaultWeaponGroups?.find(g => g.index === index);
      return group ? structuredClone(group) : {index, weaponSlotIds: [], mode: 'LINKED', isAutofire: true};
    }),
    wings: (spec.fighterWings ?? []).map(wing => Object.entries(nativeRefit.wings ?? {})
      .find(([, entry]) => entry.specId === wing.specId && entry.count === wing.count)?.[0] ?? null),
    updatedAt: 0,
  };
  for (const [slot, id] of Object.entries(d.weapons)) {
    if (id && !d.groups.some(g => g.weaponSlotIds.includes(slot))) d.groups[0].weaponSlotIds.push(slot);
  }
  return d;
}

export function moduleDesignContext(root: Design, path: readonly string[]) {
  let draft = root;
  let template: ShipSpec | undefined;
  for (const slot of path) {
    const mount = designModules(draft, template).find(m => m.slotId === slot);
    if (!mount) return null;
    template = mount.spec;
    draft = draft.modules?.[slot] ?? designFromModule(template);
  }
  return {draft, template};
}

/** Immutable path update keeps identical module hulls, undo, and root identity separate. */
export function withModuleDesign(root: Design, path: readonly string[], next: Design | null): Design {
  const update = (parent: Design, depth: number): Design => {
    const slot = path[depth];
    const context = moduleDesignContext(root, path.slice(0, depth + 1));
    if (!context || !path.length) throw new Error('模块挂点不存在。');
    const modules = {...parent.modules};
    if (depth === path.length - 1) {
      if (next === null) delete modules[slot];
      else {
        if (next.hullId !== context.template!.id || next.sourceVariantId !== context.template!.sourceVariantId)
          throw new Error('不能替换模块舰体或挂接方案。');
        modules[slot] = next;
      }
    } else modules[slot] = update(context.draft, depth + 1);
    const updated = {...parent, updatedAt: Date.now()};
    if (Object.keys(modules).length) updated.modules = modules;
    else delete updated.modules;
    return updated;
  };
  return update(root, 0);
}
