import { catalogRelationFields } from '../src/studio/CatalogRelations.ts';

export const catalogKinds = ['ships', 'weapons', 'wings', 'hullmods', 'systems', 'variants', 'projectiles'] as const;
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const pick = (value: Row, keys: readonly string[]): Row => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
const statsKeys = ['id', 'name', 'type', 'role', 'role desc', 'designation', 'tech/manufacturer', 'tags', 'uiTags', 'system id', 'defense id', 'codex variant id', 'variant', 'sprite', 'icon'];
const specKeys = ['id', 'variantId', 'hullId', 'hullSize', 'hullName', 'name', 'displayName', 'size', 'type',
  'spriteName', 'sprite', 'bulletSprite', 'glowSprite', 'turretSprite', 'hardpointSprite', 'turretGunSprite', 'hardpointGunSprite', 'turretGlowSprite', 'hardpointGlowSprite', 'iconSprite', 'icon'];

/** Preserve every recognizable reference (including its original slot label/nesting). */
function relationships(value: unknown, depth = 0): unknown {
  if (depth > 24 || value === null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    const projected = value.map(child => relationships(child, depth + 1)).filter(child => child !== undefined);
    return projected.length ? projected : undefined;
  }
  const projected: Row = {};
  for (const [key, child] of Object.entries(value)) {
    const relation = catalogRelationFields[key.replace(/[ _-]/g, '').toLowerCase()];
    const kept = relation ? child : relationships(child, depth + 1);
    if (kept !== undefined) projected[key] = kept;
  }
  return Object.keys(projected).length ? projected : undefined;
}
const issueCount = (value: unknown) => Array.isArray(value) ? value.length : typeof value === 'number' ? value : Object.keys(object(value)).length;

/** Only the list/reference index is projected. Each lazy category retains its exact records. */
export function projectCatalog(document: Row) {
  if (document.schemaVersion !== 1) throw new Error('Unsupported native catalog schema: ' + document.schemaVersion);
  const report = object(document.report);
  const index: Row = { schemaVersion: document.schemaVersion, descriptions: document.descriptions ?? [],
    report: { missingAssets: issueCount(report.missingAssets), parseErrors: issueCount(report.parseErrors) } };
  const parts: Record<string, unknown> = { report };
  for (const kind of catalogKinds) {
    const rows = document[kind];
    if (!Array.isArray(rows)) throw new Error('Missing native catalog category: ' + kind);
    parts[kind] = rows;
    index[kind] = rows.map(value => {
      const row = object(value), spec = object(row.spec);
      const references = object(relationships(spec));
      // Original field order also defines the ordering of relationship links.
      const projectedSpec = Object.fromEntries(Object.entries(spec)
        .filter(([key]) => specKeys.includes(key) || Object.hasOwn(references, key))
        .map(([key, value]) => [key, Object.hasOwn(references, key) ? references[key] : value]));
      return { ...pick(row, ['id', 'name', 'hullSize', 'sprite', 'baseHullId', 'sourcePath', ...statsKeys]),
        stats: pick(object(row.stats), statsKeys), spec: projectedSpec };
    });
  }
  return { index, parts };
}
