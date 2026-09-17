import type { WeaponSpec } from "../engine/simulation/Weapon";
import { nativeRefit } from "./DesignModel";
import tooltipData from "./weapon-tooltip-data.json";
import importedTooltips from "../engine/data/generated/refit-weapon-tooltips.json";

export const weaponMetadata = { ...Object.fromEntries(Object.entries(nativeRefit.weapons).map(([id, w]) => [id, {manufacturer: w.manufacturer ?? "", role: w.role ?? "", accuracy: w.accuracy ?? "", turnRate: w.turnRate ?? "", description: w.description ?? ""}])), ...importedTooltips, ...tooltipData } as Record<
  string,
  {
    manufacturer: string;
    role: string;
    accuracy: string;
    turnRate: string;
    description: string;
  }
>;
export const damageIcons: Record<string, string> = {
  KINETIC: "/game-assets/graphics/ui/icons/damagetype_kinetic.png",
  ENERGY: "/game-assets/graphics/ui/icons/damagetype_energy.png",
  HIGH_EXPLOSIVE:
    "/game-assets/graphics/ui/icons/damagetype_high_explosive.png",
  FRAGMENTATION: "/game-assets/graphics/ui/icons/damagetype_fragmentation.png",
};
export const damageEffects: Record<string, string> = {
  KINETIC: "200% vs 护盾，50% vs 装甲",
  ENERGY: "100% vs 护盾，装甲，和结构",
  HIGH_EXPLOSIVE: "50% vs 护盾，200% vs 装甲",
  FRAGMENTATION: "25% vs 护盾，25% vs 装甲",
};
// BaseWeaponSpec / Oo0O: original display-name thresholds, not invented descriptions.
export const accuracyName = (w: WeaponSpec) => {
  const spread = w.maxSpread ?? 0;
  return w.isBeam || spread <= 0 ? "完美" : spread <= 2 ? "优秀" : spread <= 5 ? "良好" : spread <= 10 ? "中等" : spread <= 15 ? "较差" : spread <= 20 ? "很差" : "极差";
};
export const turnRateName = (w: WeaponSpec) => {
  const rate = w.turnRateDegPerSec ?? 0;
  return rate <= 0 ? "无" : rate <= 5 ? "非常慢" : rate <= 15 ? "较慢" : rate <= 25 ? "中等" : rate <= 35 ? "较快" : rate <= 50 ? "非常快" : "优秀";
};
export const formatWeaponNumber = (value: number) => Number(value.toFixed(1)).toString();
export function cycleSeconds(w: WeaponSpec) {
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
export function dps(w: WeaponSpec) {
  if (!w.isBeam)
    return (w.damagePerShot * Math.max(1, w.burstSize ?? 1)) / cycleSeconds(w);
  if (w.beamVisualMode !== "BURST") return w.damagePerSecond;
  return (
    (w.damagePerSecond *
      ((w.beamSourceChargeupTime ?? 0) + (w.beamDuration ?? 0))) /
    Math.max(0.001, cycleSeconds(w))
  );
}
