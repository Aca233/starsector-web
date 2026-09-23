/** Native definition queries only. No world mutation, diplomacy, economy or Java execution. */
const PROFILE = 'installed-core-faction-definitions/v1';
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`Faction definitions: ${message}`); };
const requireThat = (condition, message) => { if (!condition) fail(message); };
const text = (value, label, empty = false) => { requireThat(typeof value === 'string' && (empty || value.length > 0), `${label} must be a string`); return value; };
const identifier = (value, label = 'id') => { text(value, label); requireThat(/^[A-Za-z0-9_.:-]+$/.test(value), `invalid ${label}`); return value; };
const finite = (value, label) => { requireThat(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`); return value; };
function json(value, depth = 0, ancestors = new Set()) {
  requireThat(depth <= 128, 'JSON nesting exceeds 128');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { finite(value, 'JSON number'); return; }
  requireThat(object(value) || Array.isArray(value), 'not JSON data');
  requireThat(!ancestors.has(value), 'cyclic data');
  requireThat(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'non-plain object');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { requireThat(own(value, i), 'sparse array'); json(value[i], depth + 1, ancestors); }
  } else for (const [key, entry] of Object.entries(value)) {
    requireThat(!['__proto__', 'prototype', 'constructor'].includes(key), `unsafe key ${key}`);
    json(entry, depth + 1, ancestors);
  }
  ancestors.delete(value);
}
function freeze(value) {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
const immutable = value => freeze(structuredClone(value));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const color = (value, label) => {
  requireThat(Array.isArray(value) && value.length === 4 && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255), `${label} requires exactly four integer RGBA channels (0..255)`);
  return [...value];
};
// Installed O0oO bytecode -> O0OO."void.super" -> native settings key.
// An old snapshot without this newly audited mapping remains explicitly unresolved.
function brightTarget(defaults) {
  if (!own(defaults, 'brightUIColorTarget')) return null;
  const target = defaults.brightUIColorTarget;
  requireThat(object(target) && target.settingKey === 'tooltipTitleAndLightHighlightColor' && target.sourceId === 'settings'
    && target.constantOwner === 'com.fs.starfarer.O0OO' && target.constantField === 'void.super'
    && target.alphaOverride === 255 && target.blendWeight === Math.fround(0.35), 'invalid bright-color default evidence');
  const rgba = color(target.rgba, 'tooltipTitleAndLightHighlightColor'); rgba[3] = 255; return rgba;
}
function blendBright(base, target) {
  // Java B.o00000 performs separate fsub/fmul/fadd, then clamps and truncates to int.
  return base.map((channel, index) => Math.trunc(Math.max(0, Math.min(255,
    Math.fround(channel + Math.fround(Math.fround(target[index] - channel) * Math.fround(0.35)))))));
}
const stringMap = (value, label) => {
  requireThat(object(value), `${label} must be an object`);
  for (const [key, entry] of Object.entries(value)) text(entry, `${label}.${key}`, true);
};
function validateRanks(value, label) {
  requireThat(object(value), `${label} must be an object`);
  for (const kind of ['ranks', 'posts']) {
    if (!own(value, kind)) continue;
    requireThat(object(value[kind]), `${label}.${kind} must be an object`);
    for (const [id, entry] of Object.entries(value[kind])) {
      requireThat(object(entry), `${label}.${kind}.${id} must be an object`);
      text(entry.name, `${label}.${kind}.${id}.name`, true);
    }
  }
}
export const ORIGINAL_FACTION_FIELDS = Object.freeze([
  'id', 'displayName', 'displayNameWithArticle', 'displayNameLong', 'displayNameLongWithArticle',
  'entityNamePrefix', 'personNamePrefix', 'personNamePrefixAOrAn', 'displayNameIsOrAre',
  'logo', 'crest', 'showInIntelTab', 'shipNamePrefix', 'barSound', 'internalComms',
  'tariffFraction', 'tollFraction', 'fineFraction', 'color', 'baseUIColor', 'secondaryUIColor',
  'secondarySegments', 'darkUIColor', 'gridUIColor', 'brightUIColor',
]);

/** Importer-facing normalization of the explicitly supported SpecStore subset. */
export function resolveOriginalFactionDefinition(raw, sourceId, defaults) {
  json(raw); requireThat(object(raw), 'definition must be an object'); identifier(sourceId, 'sourceId');
  for (const key of ['extends', 'inherits', 'baseFaction', 'parentFaction']) requireThat(!own(raw, key), `unsupported inheritance directive ${key}`);
  const fields = {};
  const declared = (key, value, evidence = ['loader']) => {
    fields[key] = { status: 'resolved', origin: 'declared', sourceId, evidence, value };
  };
  const fallback = (key, value, evidence = ['loader'], dependsOn = []) => {
    fields[key] = { status: 'resolved', origin: 'default', sourceId, evidence, dependsOn, value };
  };
  const str = (key, defaultValue, dependencies = []) => {
    if (own(raw, key)) declared(key, text(raw[key], key, true));
    else if (defaultValue === undefined) fail(`missing required ${key} in ${sourceId}`);
    else fallback(key, defaultValue, ['loader'], dependencies);
    return fields[key].value;
  };
  identifier(raw.id); declared('id', raw.id);
  requireThat(object(raw.names), 'missing or invalid required names object (weighted selection remains unimplemented)');
  const name = str('displayName'), article = str('displayNameWithArticle');
  str('displayNameLong', name, ['displayName']); str('displayNameLongWithArticle', article, ['displayNameWithArticle']);
  str('personNamePrefix', str('entityNamePrefix', name, ['displayName']), ['entityNamePrefix']);
  str('personNamePrefixAOrAn', 'a'); str('displayNameIsOrAre', 'is');
  str('logo'); str('crest', null); str('shipNamePrefix', 'ISS'); str('barSound', 'bar_ambience'); str('internalComms', null);
  if (own(raw, 'showInIntelTab')) {
    requireThat(typeof raw.showInIntelTab === 'boolean', 'showInIntelTab must be boolean'); declared('showInIntelTab', raw.showInIntelTab);
  } else fallback('showInIntelTab', true);
  for (const [key, value] of [['tariffFraction', defaults.tariffFraction], ['tollFraction', 0.1], ['fineFraction', 0.25]]) {
    const amount = finite(own(raw, key) ? raw[key] : value, key);
    requireThat(Number.isFinite(Math.fround(amount)), `${key} overflows Java float`);
    if (own(raw, key)) declared(key, Math.fround(amount));
    else fallback(key, Math.fround(amount), key === 'tariffFraction' ? ['loader', 'economy'] : ['loader']);
  }
  if (own(raw, 'color')) declared('color', color(raw.color, 'color'), ['loader', 'colorParser']);
  else fallback('color', [255, 255, 255, 255], ['loader', 'colorParser']);
  const primary = fields.color.value;
  for (const [key, value, evidence, deps] of [
    ['baseUIColor', primary, ['loader'], ['color']],
    ['secondaryUIColor', null, ['loader'], []],
    ['darkUIColor', [...primary.slice(0, 3).map(n => Math.trunc(Math.fround(n * Math.fround(0.4)))), 175], ['loader', 'colorMath'], ['color']],
    ['gridUIColor', [...primary.slice(0, 3), 75], ['loader'], ['color']],
  ]) {
    if (own(raw, key)) declared(key, color(raw[key], key), ['loader', 'colorParser']);
    else fallback(key, value, evidence, deps);
  }
  if (own(raw, 'secondarySegments')) { requireThat(Number.isInteger(raw.secondarySegments) && raw.secondarySegments >= -2147483648 && raw.secondarySegments <= 2147483647, 'secondarySegments must be a Java int'); declared('secondarySegments', raw.secondarySegments); }
  else fallback('secondarySegments', 8);
  const target = brightTarget(defaults);
  if (own(raw, 'brightUIColor')) declared('brightUIColor', color(raw.brightUIColor, 'brightUIColor'), ['loader', 'colorParser']);
  else if (target) fallback('brightUIColor', blendBright(fields.baseUIColor.value, target),
    ['loader', 'spec', 'uiConstants', 'settings', 'settingsAccess', 'colorMath', 'engineJar', 'colorMathJar'],
    ['baseUIColor', 'settings.tooltipTitleAndLightHighlightColor']);
  else fields.brightUIColor = {
    status: 'unimplemented', presence: 'absent', sourceId, evidence: ['loader', 'spec', 'uiConstants'],
    reason: 'Native default blends baseUIColor with O0OO.cfr_renamed_22 at 0.35; this symbol is not resolved in the available O0OO decompilation. No replacement color inferred.',
  };
  // These maps are queried per key below, not blindly deep-merged or used as governance.
  if (own(raw, 'fleetTypeNames')) stringMap(raw.fleetTypeNames, 'fleetTypeNames');
  if (own(raw, 'ranks')) validateRanks(raw.ranks, 'ranks');
  return {
    id: raw.id, sourceId, nativeKind: raw.id === 'player' ? 'player' : 'non-player',
    classificationEvidence: 'faction', raw: structuredClone(raw), fields,
    unsupportedFields: Object.keys(raw).filter(key => !ORIGINAL_FACTION_FIELDS.includes(key) && !['fleetTypeNames', 'ranks'].includes(key)).sort(),
  };
}

/** Validate provenance/shape and recompute the supported projection; never trusts cached fields. */
export function validateOriginalFactionData(data) {
  json(data); requireThat(object(data) && data.schemaVersion === 1 && data.profile === PROFILE, 'unsupported schema/profile');
  requireThat(object(data.scope) && Object.values(data.scope).every(value => typeof value === 'string'), 'scope metadata required');
  requireThat(Array.isArray(data.sources), 'sources[] required');
  const sources = new Map(), sourcePaths = new Set();
  for (const source of data.sources) {
    identifier(source.id, 'source id'); requireThat(!sources.has(source.id), `duplicate source ${source.id}`);
    requireThat(['core', 'decompiled'].includes(source.root), 'invalid source root');
    text(source.path, 'source path');
    const sourceKey = `${source.root}:${source.path}`; requireThat(!sourcePaths.has(sourceKey), 'duplicate source path'); sourcePaths.add(sourceKey);
    requireThat(!source.path.includes('\\') && !source.path.startsWith('/') && !source.path.includes(':') && !source.path.split('/').some(p => ['.', '..', ''].includes(p)), 'unsafe source path');
    requireThat(/^[a-f0-9]{64}$/.test(source.sha256), 'invalid source sha256');
    requireThat(Number.isSafeInteger(source.bytes) && source.bytes > 0, 'invalid source byte count'); sources.set(source.id, source);
  }
  for (const id of ['manifest', 'loader', 'merge', 'colorParser', 'spec', 'fleetNames', 'ranks', 'faction', 'manager', 'shipRoles', 'hostilityManager', 'hostilityIntel', 'colorMath', 'uiConstants', 'lifecycle', 'ids', 'repLevels', 'sectorGen', 'settings', 'economy', 'defaultFleetNames', 'defaultRanks', 'defaultShipRoles']) requireThat(sources.has(id), `missing evidence source ${id}`);
  requireThat(object(data.defaults), 'defaults required'); finite(data.defaults.tariffFraction, 'defaultTariff');
  text(data.defaults.tariffOrigin, 'tariffOrigin');
  if (brightTarget(data.defaults)) for (const id of ['settingsAccess', 'engineJar', 'colorMathJar']) requireThat(sources.has(id), `missing bright-color evidence ${id}`);
  stringMap(data.defaults.fleetTypeNames, 'default fleetTypeNames'); validateRanks(data.defaults.ranks, 'default ranks');
  requireThat(object(data.defaults.shipRoles), 'default ship roles must be preserved');
  requireThat(Array.isArray(data.definitions) && data.definitions.length > 0, 'definitions[] required');
  const ids = new Set(), definitionSources = new Set();
  for (const definition of data.definitions) {
    requireThat(sources.has(definition.sourceId), `unknown definition source ${definition.sourceId}`);
    const definitionSource = sources.get(definition.sourceId);
    requireThat(definitionSource.root === 'core' && /^data\/world\/factions\/[A-Za-z0-9_.-]+\.faction$/.test(definitionSource.path), 'definition must reference a core faction source');
    requireThat(!definitionSources.has(definition.sourceId), 'multiple definitions share one source'); definitionSources.add(definition.sourceId);
    const expected = resolveOriginalFactionDefinition(definition.raw, definition.sourceId, data.defaults);
    requireThat(canonical(definition) === canonical(expected), `inconsistent definition projection ${definition.id}`);
    requireThat(!ids.has(definition.id), `duplicate faction ${definition.id}`); ids.add(definition.id);
  }
  requireThat(object(data.relationships) && data.relationships.status === 'not-initialized' && data.relationships.completeInitialState === false, 'definitions cannot supply a completed relation state');
  requireThat(data.relationships.sourceId === 'sectorGen', 'unsupported relationship evidence source');
  text(data.relationships.method, 'relationship method'); text(data.relationships.completeness, 'relationship completeness');
  const lazy = data.relationships.engineLazyFallback;
  requireThat(object(lazy) && lazy.self === 1 && lazy.other === 0 && lazy.applied === false && lazy.evidence === 'manager', 'invalid lazy relation fallback evidence');
  text(lazy.note, 'lazy relation note');
  requireThat(Array.isArray(data.relationships.additionalStages), 'additional relationship stages required');
  for (const stage of data.relationships.additionalStages) {
    requireThat(object(stage) && sources.has(stage.sourceId) && stage.status === 'not-executed', 'invalid relationship stage');
    text(stage.method, 'stage method'); text(stage.note, 'stage note');
  }
  requireThat(Array.isArray(data.relationships.sectorGenAssignments), 'relationship source assignments required');
  for (const entry of data.relationships.sectorGenAssignments) {
    requireThat(object(entry) && object(entry.expression), 'invalid relationship source expression');
    requireThat(ids.has(entry.from) && ids.has(entry.to), 'relationship evidence references unknown faction');
    requireThat(Number.isSafeInteger(entry.line) && entry.line > 0, 'relationship evidence line required');
    if (entry.expression.kind === 'number') { finite(entry.expression.value, 'relationship literal'); requireThat(Math.abs(entry.expression.value) <= 1, 'out of range relationship evidence'); }
    else requireThat(entry.expression.kind === 'rep-level' && ['VENGEFUL', 'HOSTILE', 'INHOSPITABLE', 'SUSPICIOUS', 'NEUTRAL', 'FAVORABLE', 'WELCOMING', 'FRIENDLY', 'COOPERATIVE'].includes(entry.expression.name), 'unsupported relationship expression');
  }
  requireThat(Array.isArray(data.unlistedDefinitions) && data.unlistedDefinitions.every(path => typeof path === 'string' && /^data\/world\/factions\/[A-Za-z0-9_.-]+\.faction$/.test(path)), 'invalid unlistedDefinitions report');
  return data;
}

/** Pass imported JSON explicitly, keeping this module independent of loader/WorldState/client. */
export function createOriginalFactionDefinitions(input) {
  validateOriginalFactionData(input);
  const data = immutable(input), byId = new Map(data.definitions.map(definition => [definition.id, definition]));
  const get = id => { identifier(id); const result = byId.get(id); if (!result) throw new RangeError(`Unknown faction definition: ${id}`); return result; };
  const name = (id, kind, key) => {
    const definition = get(id); text(key, 'name key');
    let local, defaults, sourceId;
    if (kind === 'fleetType') { local = definition.raw.fleetTypeNames; defaults = data.defaults.fleetTypeNames; sourceId = 'defaultFleetNames'; }
    else if (kind === 'rank' || kind === 'post') { const group = kind === 'rank' ? 'ranks' : 'posts'; local = definition.raw.ranks?.[group]; defaults = data.defaults.ranks[group]; sourceId = 'defaultRanks'; }
    else fail(`unsupported name kind ${kind}`);
    if (local && own(local, key)) return freeze({ status: 'resolved', origin: 'declared', sourceId: definition.sourceId, value: kind === 'fleetType' ? local[key] : local[key].name });
    if (defaults && own(defaults, key)) return freeze({ status: 'resolved', origin: 'default', sourceId, value: kind === 'fleetType' ? defaults[key] : defaults[key].name });
    return freeze({ status: 'missing', reason: 'Not declared locally or in the native fallback table; no name synthesized.' });
  };
  return Object.freeze({
    data,
    list: () => data.definitions,
    find: id => { identifier(id); return byId.get(id); },
    get,
    field: (id, key) => {
      const definition = get(id); text(key, 'field key');
      if (own(definition.fields, key)) return definition.fields[key];
      if (own(definition.raw, key)) return freeze({ status: 'unimplemented', presence: 'present', sourceId: definition.sourceId, raw: definition.raw[key], reason: ['fleetTypeNames', 'ranks'].includes(key) ? 'Use name() for native per-key fallback; this is not a merged definition.' : 'Raw native content preserved; runtime interpretation is not implemented.' });
      return freeze({ status: 'missing', reason: 'Absent from definition and outside supported defaults; absence is not false, zero or an empty collection.' });
    },
    name,
  });
}

/** Read a caller-owned explicit relation snapshot. Supports custom faction IDs, not governance.
 * Symmetry follows FactionManager; no inferred self=1 or absent-pair=0 is applied here. */
export function createFactionRelationshipView(input) {
  json(input); requireThat(object(input) && Array.isArray(input.factionIds) && Array.isArray(input.entries), 'relation snapshot requires factionIds[] and entries[]');
  requireThat(Object.keys(input).every(key => ['factionIds', 'entries'].includes(key)), 'unknown relation snapshot field');
  const ids = new Set();
  for (const id of input.factionIds) { identifier(id); requireThat(!ids.has(id), `duplicate relation faction ${id}`); ids.add(id); }
  const pairKey = (a, b) => JSON.stringify([a, b].sort());
  const entries = new Map();
  for (const entry of input.entries) {
    requireThat(object(entry) && Object.keys(entry).every(key => ['from', 'to', 'value', 'source'].includes(key)), 'unknown relation entry field');
    requireThat(ids.has(entry.from) && ids.has(entry.to), 'unknown faction in relation entry'); finite(entry.value, 'relationship');
    requireThat(entry.value >= -1 && entry.value <= 1, 'relationship outside [-1,1]');
    if (own(entry, 'source')) text(entry.source, 'relation source');
    const key = pairKey(entry.from, entry.to); requireThat(!entries.has(key), 'duplicate or conflicting symmetric relation');
    entries.set(key, immutable(entry));
  }
  const data = immutable(input);
  return Object.freeze({ data, get: (from, to) => {
    requireThat(ids.has(from) && ids.has(to), 'unknown faction in relationship query');
    const entry = entries.get(pairKey(from, to));
    return entry ? freeze({ status: 'known', value: entry.value, entry }) : freeze({ status: 'uninitialized' });
  } });
}
