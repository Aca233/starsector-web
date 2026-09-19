import type { ShipSpec } from '../../content/ShipSpec';
import { effectiveHullStats } from '../HullMods';
export const needsLaunchers = (spec: ShipSpec): string | undefined => spec.systemWeaponSlots?.length ? undefined : '需要专用 SYSTEM 发射挂点';
export const needsWings = (spec: ShipSpec): string | undefined => effectiveHullStats(spec).fighterBays > 0 && spec.fighterWings?.length ? undefined : '需要已装配的舰载机联队';
export const needsShield = (spec: ShipSpec): string | undefined => ['FRONT', 'OMNI'].includes(effectiveHullStats(spec).shieldType) ? undefined : '需要常规护盾（不能使用相位潜航替代）';
