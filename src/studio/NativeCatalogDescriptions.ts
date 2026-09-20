import nativeParameters from '../engine/data/generated/native-description-params.json';
import { formatNativeDescription, nativeHighlightParameters } from '../shared/native-description-format.mjs';
import type { RecordData } from './NativeCatalogData';

const string = (value: unknown): string => typeof value === 'string' ? value : '';
type Parameters = { desc: string[]; sModDesc: string[] };
interface HullModParameters { script: string; templates: { desc: string; sModDesc: string }; parameters?: Parameters; sizes?: Record<string, Parameters> }
const mods = nativeParameters.hullmods as Record<string, HullModParameters>;
export const nativeHullSizes = [['FRIGATE', '护卫舰'], ['DESTROYER', '驱逐舰'], ['CRUISER', '巡洋舰'], ['CAPITAL_SHIP', '主力舰']] as const;

/** Reject stale template/parameter pairings rather than silently displaying incorrect numbers. */
export function hullModDescription(row: RecordData, field: 'desc' | 'sModDesc', size: string) {
  const template = string(row[field]), reference = mods[string(row.id)];
  const parameters = reference?.templates[field] === template && reference.script === row.script
    ? (reference.parameters ?? reference.sizes?.[size])?.[field] : undefined;
  return formatNativeDescription(template, parameters);
}
export function weaponCustomDescription(row: RecordData, field: 'customPrimary' | 'customAncillary') {
  const template = string(row[field]);
  let parameters = nativeHighlightParameters(string(row[field + 'HL']));
  // Local CSV omits this one HL value. ioncannon_fighter.wpn -> ioncannon_shot.proj ->
  // IonCannonOnHitEffect.onHit: Math.random() > 0.75f, not shieldHit, target instanceof ShipAPI.
  // Bind the repair to the audited template; never apply 25% to an arbitrary missing parameter.
  if (row.id === 'ioncannon_fighter' && field === 'customPrimary' && !parameters.length &&
    template === '命中船体或装甲时，有 {%s} 的概率产生打击武器与引擎的电弧，造成该武器命中目标时等值的额外伤害。') parameters = ['25%'];
  return formatNativeDescription(template, parameters);
}
export function shipDescriptionId(id: string, spec: RecordData, baseHullId: unknown): string {
  return string(spec.descriptionId) || string(baseHullId) || id;
}
/** Display projection only. Original templates remain untouched in the JSON/source view. */
export function readableDescriptionStats(kind: string, row: RecordData, size: string): RecordData {
  const result = { ...row };
  if (kind === 'hullmods') for (const field of ['desc', 'sModDesc'] as const) {
    if (typeof row[field] === 'string') result[field] = hullModDescription(row, field, size).text;
  }
  if (kind === 'weapons') for (const field of ['customPrimary', 'customAncillary'] as const) {
    if (typeof row[field] === 'string') result[field] = weaponCustomDescription(row, field).text;
  }
  return result;
}
