/** Frame-local projectile field columns, not a temporal delta. Every frame is
 * independently decodable after a skip/reconnect; no previous-frame cache/ACK.
 * Inputs to compactProjectileColumns are fresh captureCombat records only. */
type Wire = any;
export const MAX_PROJECTILE_COLUMN_ROWS = 4096;
export const MAX_PROJECTILE_COLUMN_CELLS = 262144;
export const MAX_PROJECTILE_SHARED_NODES = 262144;
const MAX_TEMPLATES = 128, MAX_FIELDS = 256;
export interface ProjectileColumnTemplate { keys: string[]; fixed: Wire[]; dynamic: number[]; width: number; sharedWeight: number }
export interface ProjectileColumnPlan { templates: ProjectileColumnTemplate[]; rows: Wire[] }

// Only shared values introduce expansion not already represented by packet
// bytes. Bound their total repeated subtree work, not just top-level columns.
function sharedWeight(value: Wire, remaining = MAX_PROJECTILE_SHARED_NODES, depth = 2): number {
  if (remaining < 1 || depth > 64) return MAX_PROJECTILE_SHARED_NODES + 1;
  if (!value || typeof value !== 'object') return 1;
  let weight = 1;
  for (const key of Object.keys(value)) {
    weight += sharedWeight(value[key], remaining - weight, depth + 1);
    if (weight > remaining) break;
  }
  return weight;
}

function fieldsWeight(values: Wire[]): number {
  let total = 0;
  for (const value of values) {
    total += sharedWeight(value, MAX_PROJECTILE_SHARED_NODES - total);
    if (total > MAX_PROJECTILE_SHARED_NODES) break;
  }
  return total;
}

function equalPacked(a: Wire, b: Wire, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || depth > 8) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equalPacked(a[i], b[i], depth + 1)) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  if (keys.length !== other.length) return false;
  for (let i = 0; i < keys.length; i++) if (keys[i] !== other[i] || !equalPacked(a[keys[i]], b[keys[i]], depth + 1)) return false;
  return true;
}

export function compactProjectileColumns(rows: Wire[], layouts: string[][]): Wire | null {
  if (rows.length < 4 || rows.length > MAX_PROJECTILE_COLUMN_ROWS) return null;
  const groups = new Map<number, Map<string, { indices: number[]; keys: string[]; layout: number }>>();
  let cells = 0, groupCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], keys = layouts[row?.$record];
    // Unsupported/custom projection: leave the original representation intact.
    if (!Number.isInteger(row?.$record) || !keys || keys.length > MAX_FIELDS || !Array.isArray(row.values) || row.values.length !== keys.length) return null;
    cells += keys.length;
    if (cells > MAX_PROJECTILE_COLUMN_CELLS) return null;
    const spec = row.values[keys.indexOf('specId')];
    if (typeof spec !== 'string') continue;
    let bySpec = groups.get(row.$record);
    if (!bySpec) groups.set(row.$record, bySpec = new Map());
    let group = bySpec.get(spec);
    if (!group) {
      if (++groupCount > MAX_TEMPLATES) return null;
      bySpec.set(spec, group = { indices: [], keys, layout: row.$record });
    }
    group.indices.push(i);
  }
  const templates: Wire[] = [], output = rows.slice();
  let repeatedNodes = 0;
  for (const bySpec of groups.values()) for (const group of bySpec.values()) {
    if (group.indices.length < 4) continue;
    const base = rows[group.indices[0]].values, fixed: number[] = [], dynamic: number[] = [];
    for (let col = 0; col < group.keys.length; col++) {
      let shared = true;
      for (let r = 1; r < group.indices.length; r++) if (!equalPacked(base[col], rows[group.indices[r]].values[col])) { shared = false; break; }
      (shared ? fixed : dynamic).push(col);
    }
    if (fixed.length < 8 || fixed.length * (group.indices.length - 1) < 64) continue;
    const weight = fieldsWeight(fixed.map(col => base[col]));
    repeatedNodes += weight * group.indices.length;
    if (repeatedNodes > MAX_PROJECTILE_SHARED_NODES) return null;
    const id = templates.length;
    templates.push([group.layout, fixed, fixed.map(col => base[col])]);
    for (const i of group.indices) output[i] = [id, ...dynamic.map(col => rows[i].values[col])];
  }
  return templates.length ? { $projectileColumns: templates, values: output } : null;
}

/** Validate structure and expansion budgets BEFORE writing any projectile. The
 * returned plan reads each field directly; it never expands a full world/rows.
 * Layouts have already passed CombatSnapshot's key/prototype denylist checks. */
export function projectileColumnPlan(value: Wire, layouts: string[][]): ProjectileColumnPlan {
  const fail = (): never => { throw Error('Invalid projectile columns'); };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || !Array.isArray(value.$projectileColumns) || value.$projectileColumns.length < 1 || value.$projectileColumns.length > MAX_TEMPLATES
    || !Array.isArray(value.values) || value.values.length > MAX_PROJECTILE_COLUMN_ROWS) return fail();
  const templates: ProjectileColumnTemplate[] = value.$projectileColumns.map((template: Wire) => {
    if (!Array.isArray(template) || template.length !== 3) return fail();
    const [layout, columns, values] = template, keys = Number.isInteger(layout) && layout >= 0 ? layouts[layout] : undefined;
    if (!keys || keys.length > MAX_FIELDS || !Array.isArray(columns) || !Array.isArray(values) || values.length !== columns.length || columns.length > keys.length) return fail();
    let previous = -1;
    for (const col of columns) {
      if (!Number.isInteger(col) || col <= previous || col >= keys.length) return fail();
      previous = col;
    }
    const fixed = new Array(keys.length), dynamic = new Array<number>(keys.length);
    let at = 0, width = 1;
    for (let col = 0; col < keys.length; col++) {
      if (columns[at] === col) { fixed[col] = values[at++]; dynamic[col] = 0; }
      else dynamic[col] = width++;
    }
    const weight = fieldsWeight(values);
    if (weight > MAX_PROJECTILE_SHARED_NODES) return fail();
    return { keys, fixed, dynamic, width, sharedWeight: weight };
  });
  let cells = 0, repeatedNodes = 0;
  for (const row of value.values) {
    if (Array.isArray(row)) {
      const template = Number.isInteger(row[0]) && row[0] >= 0 ? templates[row[0]] : undefined;
      if (!template || row.length !== template.width) return fail();
      cells += template.keys.length;
      repeatedNodes += template.sharedWeight;
      if (repeatedNodes > MAX_PROJECTILE_SHARED_NODES) return fail();
    } else {
      const keys = row && typeof row === 'object' && Number.isInteger(row.$record) && row.$record >= 0 ? layouts[row.$record] : undefined;
      if (!keys || keys.length > MAX_FIELDS || !Array.isArray(row.values) || row.values.length !== keys.length || Object.keys(row).length !== 2) return fail();
      cells += keys.length;
    }
    if (cells > MAX_PROJECTILE_COLUMN_CELLS) return fail();
  }
  return { templates, rows: value.values };
}
