import { DwellReader } from './DwellTooltip';
import { RefitHint } from './RefitHint';
import { useMemo } from "react";
import { RefitHoverTerm, type RefitHoverTermId } from "./RefitHoverTerms";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import type { ShipSpec, WeaponMountSlotConfig } from "../engine/content/ShipSpec";
import type { WeaponSpec } from "../engine/simulation/Weapon";
import { nativeRefit, evaluate, weaponOPCost, damageNames, isBuiltIn, sizes, types, weaponFluxPerSecond, weaponName } from "./DesignModel";
import type { Design } from "./DesignModel";
import { effectiveHullModWeaponSpec } from "../engine/extensions/HullMods";
import { effectiveWeaponRange } from "../engine/simulation/WeaponRange";
import { weaponMetadata, damageIcons, damageEffects, accuracyName, turnRateName, formatWeaponNumber, cycleSeconds, dps } from "./WeaponTooltipData";

export function WeaponIcon({ weapon }: { weapon: WeaponSpec }) {
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

/** Shared original/fitted weapon data for picker rows and installed hull mounts. */
export function WeaponInformation({ candidate, installed, draft, selected, compare = false, isCurrent = false, showFitted, onToggleFitted, onOpenCodex, shipSpec, previewInstallation = false }: {
  candidate: WeaponSpec; installed?: WeaponSpec; draft: Design; selected: WeaponMountSlotConfig;
  compare?: boolean; isCurrent?: boolean; showFitted: boolean;
  shipSpec?: ShipSpec; previewInstallation?: boolean;
  onToggleFitted: () => void; onOpenCodex?: (weapon: WeaponSpec) => void;
}) {
  const meta = weaponMetadata[candidate.id];
  const paragraphs = meta?.description.split(/\r?\n\r?\n/) ?? [];
  const currentSpec = useMemo(() => shipSpec ?? evaluate(draft).spec, [draft, shipSpec]);
  const hullSpec = useMemo(() => !previewInstallation ? currentSpec : { ...currentSpec,
    weaponSlots: currentSpec.weaponSlots.map(slot => slot.slotId === selected.slotId ? { ...slot, defaultWeaponId: candidate.id } : slot) },
    [currentSpec, previewInstallation, selected.slotId, candidate.id]);
  const locked = isBuiltIn(draft.hullId, selected.slotId);
  const costOf = (w: WeaponSpec) => locked ? 0 : weaponOPCost(draft, w.id);
  const specOf = (w: WeaponSpec) => previewInstallation && installed?.id === w.id && w.id !== candidate.id ? currentSpec : hullSpec;
  const rangeOf = (w: WeaponSpec) => showFitted ? effectiveWeaponRange(specOf(w), w) : w.range;
  const fitted = (w: WeaponSpec) => showFitted ? effectiveHullModWeaponSpec(specOf(w), w) : w;
  const terms: Record<string, RefitHoverTermId> = { '战术应用': 'role', '安装类型': 'mount', '伤害': 'hitDamage', '精确度': 'accuracy', '转向速度': 'turnRate', '弹药容量': 'ammo', '装配点数': 'op', '武器射程': 'range', '伤害 / 秒': 'dps', '幅能 / 秒': 'flux', '幅能 / 每发射弹': 'shotFlux', '幅能 / 伤害': 'efficiency', '伤害类型': 'damage', '开火间隔 (秒)': 'cycle' };
  const stat = (label: string, read: (weapon: WeaponSpec) => number | string) =>
    candidate && (
      <div
        className="source-weapon-detail-stat"
        key={label}
        data-compare={compare}
      >
        <dt>{terms[label] ? <RefitHoverTerm term={terms[label]}>{label}</RefitHoverTerm> : label}</dt>
        {compare && (
          <dd className="source-weapon-compare">{read(installed!)}</dd>
        )}
        <dd>{read(candidate)}</dd>
      </div>
    );
  return <DwellReader>
    <h3>
      <NativeBitmapText font="body" color="currentColor">{weaponName(candidate.id)}</NativeBitmapText>
      {isCurrent && <em> - 当前安装</em>}
    </h3>
    <p className="source-weapon-manufacturer">
      设计类型：<span>{meta?.manufacturer || "普通"}</span>
    </p>
    <p className="source-weapon-description">
      {paragraphs[0]}
    </p>
    {paragraphs.length > 1 && <p className="source-weapon-attribution">{paragraphs.slice(1).join("\n\n")}</p>}
    <h4 className="source-weapon-stat-title"><RefitHint text="点击切换原始数据 / 当前舰船插件加成后的数据"><button onClick={onToggleFitted}>{showFitted ? "舰装后数据" : "原始数据"}{compare && <span>（当前安装 / 预览）</span>}</button></RefitHint></h4>
    <div className="source-weapon-primary">
      <WeaponIcon weapon={candidate} />
      <dl>
        {stat(
          "战术应用",
          (w) => weaponMetadata[w.id]?.role || damageNames[w.type],
        )}
        {stat(
          "安装类型",
          (w) =>
            `${sizes[w.mountSize]}，${types[w.mountTypeOverride ?? w.weaponType ?? "ENERGY"]}`,
        )}
        {stat("装配点数", w => showFitted ? costOf(w) : nativeRefit.weapons[w.id]?.op ?? costOf(w))}
        <div className="source-weapon-stat-gap" />
        {stat("武器射程", (w) => formatWeaponNumber(rangeOf(w)))}
        {stat(
          "伤害",
          (w) =>
            formatWeaponNumber(w.isBeam ? fitted(w).damagePerSecond : fitted(w).damagePerShot) +
            (w.isBeam ? "/秒" : ""),
        )}
        {stat("伤害 / 秒", (w) => formatWeaponNumber(dps(fitted(w))))}
        <div className="source-weapon-stat-gap" />
        {stat("幅能 / 秒", (w) => formatWeaponNumber(weaponFluxPerSecond(fitted(w))))}
        {stat("幅能 / 每发射弹", (w) =>
          w.isBeam ? "—" : formatWeaponNumber(fitted(w).fluxPerShot),
        )}
        {stat("幅能 / 伤害", (w) =>
          dps(fitted(w)) ? Number((weaponFluxPerSecond(fitted(w)) / dps(fitted(w))).toFixed(2)).toString() : "—",
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
            (!showFitted ? weaponMetadata[w.id]?.accuracy || accuracyName(w) : w.isBeam ? "精确"
              : `${formatWeaponNumber(w.minSpread ?? 0)}° - ${formatWeaponNumber(fitted(w).maxSpread ?? 0)}°`),
        )}
        {stat(
          "转向速度",
          (w) =>
            !showFitted ? weaponMetadata[w.id]?.turnRate || turnRateName(w) :
            showFitted && selected.mountType === "HARDPOINT" ? "固定挂点" :
            `${formatWeaponNumber(fitted(w).turnRateDegPerSec ?? 0)}°/秒`,
        )}
        <div className="source-weapon-stat-gap" />
        {stat("开火间隔 (秒)", (w) =>
          w.isBeam && w.beamVisualMode !== "BURST"
            ? "持续"
            : formatWeaponNumber(cycleSeconds(fitted(w))),
        )}
        {candidate.maxAmmo !== undefined &&
          stat("弹药容量", (w) => fitted(w).maxAmmo ?? "无限")}
      </dl>
    </div>
    {onOpenCodex && <button
      type="button"
      className="source-weapon-codex"
      onClick={() => onOpenCodex(candidate)}
    >
      按 <kbd>F2</kbd> 打开数据百科
    </button>}
  </DwellReader>;
}
