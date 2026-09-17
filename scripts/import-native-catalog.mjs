#!/usr/bin/env node
/** Import native data, never native execution. See docs/native-catalog-import.md. */
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/import-native-catalog.mjs [StarsectorCore] [--strict]\nDefaults to ../starsector-core relative to this project. Existing assets/manifest entries are preserved.');
  process.exit(0);
}
if (args.some(arg => arg.startsWith('--') && arg !== '--strict') || args.filter(arg => !arg.startsWith('--')).length > 1) {
  throw new Error('Usage: node scripts/import-native-catalog.mjs [StarsectorCore] [--strict]');
}
const coreRoot = await realpath(resolve(args.find(arg => !arg.startsWith('--')) ?? resolve(projectRoot, '../starsector-core')));
const assetRoot = resolve(projectRoot, 'public/game-assets');
const catalogPath = resolve(projectRoot, 'src/engine/data/generated/native-catalog.json');
const manifestPath = resolve(assetRoot, 'asset-manifest.json');
const slash = value => value.replace(/\\/g, '/');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.hasOwn(object, key);
const report = {
  counts: {}, discovered: {}, parseErrors: [], missingAssets: [], resolutionErrors: [],
  duplicateIds: [], unresolvedReferences: [], filenameIdMismatches: [], unmatchedCsvRecords: [], unlistedDefinitions: [],
  skippedCsvRecords: {}, skippedSymlinks: [], rejectedAssets: [], caseAliases: [],
  nativeOnlyAssets: [], sourceFiles: [], assetDependencies: {}, csvSources: {},
  notes: [
    'Catalog data is not a claim of Java/plugin gameplay parity; class identifiers are inert strings.',
    'All existing asset files and manifest entries are retained, including sampler overrides. No hash or size audit is performed.',
    'Native packed music is copied only when explicitly referenced; it is not browser-decodable as an ordinary audio URL.',
  ],
};

function within(root, candidate) {
  const rel = relative(root, candidate);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error(`Path escapes allowed root: ${candidate}`);
  return candidate;
}
async function sourceFile(path) {
  return within(coreRoot, await realpath(within(coreRoot, resolve(coreRoot, path))));
}
async function safeDestination(path) {
  const absolute = within(projectRoot, resolve(projectRoot, path));
  // Check the nearest existing ancestor BEFORE mkdir/write, including junctions.
  let parent = absolute;
  while (true) {
    try { within(projectRoot, await realpath(parent)); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; parent = dirname(parent); }
  }
  await mkdir(dirname(absolute), { recursive: true });
  return absolute;
}
async function writeJson(path, data) {
  await safeDestination(path);
  const temporary = await safeDestination(`${path}.tmp`);
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}
async function walk(path) {
  const results = [];
  for (const entry of (await readdir(await sourceFile(path), { withFileTypes: true })).sort((a, b) => compare(a.name, b.name))) {
    const child = `${path}/${entry.name}`;
    if (entry.isSymbolicLink()) { report.skippedSymlinks.push(child); continue; }
    if (entry.isDirectory()) results.push(...await walk(child));
    else if (entry.isFile()) results.push(child);
  }
  return results;
}

// A self-contained counterpart to StarsectorTextParsers. Unlike JSON.parse, this
// accepts native #/line/block comments, bare enum tokens/keys, .5, 1f, trailing
// separators, and a separator after the root object (used by core .skin/.faction).
// It never evals text or loads scripts/classes from the installation.
function parseNative(text) {
  text = text.replace(/^\uFEFF/, '');
  let cursor = 0;
  const fail = message => {
    const line = text.slice(0, cursor).split('\n').length;
    throw new SyntaxError(`${message} at line ${line}, offset ${cursor}`);
  };
  const space = () => {
    while (cursor < text.length) {
      if (/\s/.test(text[cursor])) { cursor++; continue; }
      if (text[cursor] === '#' || text.slice(cursor, cursor + 2) === '//') {
        while (cursor < text.length && text[cursor] !== '\n') cursor++;
      } else if (text.slice(cursor, cursor + 2) === '/*') {
        const end = text.indexOf('*/', cursor + 2);
        if (end < 0) fail('Unterminated block comment');
        cursor = end + 2;
      } else break;
    }
  };
  const string = () => {
    const start = cursor++;
    while (cursor < text.length) {
      const ch = text[cursor++];
      if (ch === '\\') cursor++;
      else if (ch === '"') {
        try { return JSON.parse(text.slice(start, cursor)); }
        catch { return fail('Invalid quoted string'); }
      }
    }
    return fail('Unterminated string');
  };
  const value = (depth = 0) => {
    if (depth > 128) fail('Nesting exceeds 128');
    space();
    const ch = text[cursor];
    if (ch === '"') return string();
    if (ch === '{' || ch === '[') {
      const object = ch === '{';
      const close = object ? '}' : ']';
      const entries = [], items = [];
      cursor++; space();
      while (text[cursor] !== close) {
        if (cursor >= text.length) fail('Unterminated collection');
        if (object) {
          let key;
          if (text[cursor] === '"') key = string();
          else {
            const match = /^[A-Za-z0-9_]+/.exec(text.slice(cursor));
            if (!match) fail('Expected object key');
            key = match[0]; cursor += key.length;
          }
          space();
          if (text[cursor++] !== ':') fail('Expected colon');
          entries.push([key, value(depth + 1)]);
        } else items.push(value(depth + 1));
        space();
        if (text[cursor] === close) break;
        if (![';', ','].includes(text[cursor])) fail('Expected separator');
        cursor++; space();
      }
      cursor++;
      return object ? Object.fromEntries(entries) : items;
    }
    const match = /^[^\s,;\]}:#/]+/.exec(text.slice(cursor));
    if (!match) return fail('Expected value');
    const token = match[0]; cursor += token.length;
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/.test(token)) {
      const numeric = Number(token.replace(/[fFdD]$/, ''));
      if (!Number.isFinite(numeric)) return fail('Non-finite number');
      return numeric;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return token;
    return fail(`Invalid token ${token}`);
  };
  const result = value();
  space();
  if ([',', ';'].includes(text[cursor])) { cursor++; space(); }
  if (cursor !== text.length) fail('Unexpected trailing content');
  return result;
}

function parseCsv(text, sourcePath) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && !field.trim()) quoted = true;
    else if (ch === ',') endField();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') field += ch;
  }
  if (quoted) throw new SyntaxError('Unterminated CSV quoted field');
  if (field.length || row.length) endRow();
  const records = rows.filter(values => !values[0]?.trimStart().startsWith('#'));
  report.skippedCsvRecords[sourcePath] = rows.length - records.length;
  if (!records.length) return [];
  const headers = records.shift().map(header => header.trim());
  return records.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()])));
}

const definitions = { '.ship': [], '.skin': [], '.wpn': [], '.proj': [], '.variant': [], '.system': [] };
const csvFiles = new Map();
const configs = [];
const requests = new Map();
function requestAsset(raw, sourcePath) {
  const resource = slash(raw.trim()).replace(/^\/?game-assets\//, '');
  if (!/^(graphics|sounds)\//.test(resource)) return;
  if (resource.includes('\0') || resource.includes(':') || resource.split('/').includes('..')) {
    report.rejectedAssets.push({ path: resource, sourcePath, reason: 'Unsafe path' }); return;
  }
  const normalized = posix.normalize(resource);
  const refs = requests.get(normalized) ?? new Set();
  refs.add(sourcePath); requests.set(normalized, refs);
}
function findAssets(value, sourcePath) {
  if (typeof value === 'string') {
    if (/^(?:\/?game-assets\/)?(?:graphics|sounds)[/\\]/.test(value)) requestAsset(value, sourcePath);
  } else if (Array.isArray(value)) value.forEach(item => findAssets(item, sourcePath));
  else if (isObject(value)) {
    for (const item of Object.values(value)) findAssets(item, sourcePath);
    if (typeof value.source === 'string' && typeof value.file === 'string' && /^(graphics|sounds)\//.test(value.source) && !extname(value.source)) {
      requestAsset(posix.join(value.source, value.file), sourcePath);
    }
  }
}
for (const sourcePath of await walk('data')) {
  const extension = extname(sourcePath).toLowerCase();
  const specKind = own(definitions, extension);
  const structured = specKind || ['.json', '.faction', '.skill'].includes(extension);
  if (!structured && extension !== '.csv' && !['.java', '.txt', '.sample'].includes(extension)) continue;
  report.sourceFiles.push(sourcePath);
  report.discovered[extension] = (report.discovered[extension] ?? 0) + 1;
  try {
    const raw = await readFile(await sourceFile(sourcePath), 'utf8');
    if (structured) {
      const spec = parseNative(raw);
      if (specKind && !isObject(spec)) throw new SyntaxError('Definition must be an object');
      findAssets(spec, sourcePath);
      if (specKind) definitions[extension].push({ sourcePath, spec });
      else configs.push({ sourcePath, spec });
    } else if (extension === '.csv') {
      const records = parseCsv(raw, sourcePath);
      csvFiles.set(sourcePath, records);
      findAssets(records, sourcePath);
    } else {
      // Literal media dependencies in scripts/mission text only. Never copy or
      // execute Java, extract JARs, evaluate native expressions, or scan saves.
      for (const match of raw.matchAll(/"((?:graphics|sounds)\/[^"\r\n]+\.(?:png|jpe?g|webp|ogg|wav|mp3|fnt|ttf|otf))"/gi)) requestAsset(match[1], sourcePath);
    }
  } catch (error) { report.parseErrors.push({ sourcePath, message: error.message }); }
}

const csvNames = {
  ships: 'ship_data.csv', weapons: 'weapon_data.csv', wings: 'wing_data.csv',
  hullmods: 'hull_mods.csv', systems: 'ship_systems.csv', descriptions: 'descriptions.csv',
};
const tables = {};
for (const [kind, filename] of Object.entries(csvNames)) {
  const matches = [...csvFiles].filter(([path]) => basename(path) === filename);
  report.csvSources[kind] = matches.map(([sourcePath]) => sourcePath);
  if (!matches.length) report.parseErrors.push({ sourcePath: filename, message: 'Required CSV not found' });
  tables[kind] = matches.flatMap(([sourcePath, records]) => records.filter(row => {
    if (row.id) return true;
    report.skippedCsvRecords[sourcePath]++; return false;
  }).map(stats => ({ sourcePath, stats })));
}
const usedCsv = new Set(Object.values(report.csvSources).flat());
for (const [sourcePath, records] of csvFiles) if (!usedCsv.has(sourcePath)) configs.push({ sourcePath, spec: records });
const csvIndex = {};
for (const [kind, rows] of Object.entries(tables)) {
  csvIndex[kind] = new Map();
  if (kind === 'descriptions') continue; // Descriptions have intentional id/type duplicates.
  for (const row of rows) {
    if (csvIndex[kind].has(row.stats.id)) report.duplicateIds.push({ kind: `${kind} CSV`, id: row.stats.id, sourcePath: row.sourcePath });
    else csvIndex[kind].set(row.stats.id, row);
  }
}
function definitionId(record, field, kind) {
  const fileId = basename(record.sourcePath, extname(record.sourcePath));
  const id = record.spec[field];
  if (typeof id !== 'string' || !id) {
    report.resolutionErrors.push({ kind, sourcePath: record.sourcePath, message: `Missing ${field}; using filename` });
    return fileId;
  }
  if (id !== fileId) report.filenameIdMismatches.push({ kind, id, sourcePath: record.sourcePath, filenameId: fileId });
  return id;
}
function withStats(record, kind, id) {
  const row = csvIndex[kind].get(id);
  if (!row) report.unlistedDefinitions.push({ kind, id, sourcePath: record.sourcePath });
  return { ...record, id, stats: row?.stats ?? {}, ...(row ? { csvSourcePath: row.sourcePath } : {}) };
}
const baseShips = definitions['.ship'].map(record => withStats(record, 'ships', definitionId(record, 'hullId', 'ships')));
const rawSkins = definitions['.skin'].map(record => ({ ...record, id: definitionId(record, 'skinHullId', 'skins') }));
const shipById = new Map(), skinById = new Map();
for (const record of baseShips) {
  if (!shipById.has(record.id)) shipById.set(record.id, record);
}
for (const record of rawSkins) {
  skinById.set(record.id, record);
}
// Source .skin keys -> CSV columns. Keep string values and CSV blanks intact.
const skinStats = {
  hullName: 'name', hullDesignation: 'designation', tech: 'tech/manufacturer', systemId: 'system id',
  fleetPoints: 'fleet pts', hitpoints: 'hitpoints', armorRating: 'armor rating', fluxCapacity: 'max flux',
  fluxDissipation: 'flux dissipation', ordnancePoints: 'ordnance points', fighterBays: 'fighter bays',
  maxSpeed: 'max speed', acceleration: 'acceleration', deceleration: 'deceleration', maxTurnRate: 'max turn rate',
  turnAcceleration: 'turn acceleration', mass: 'mass', shieldType: 'shield type', defenseId: 'defense id',
  shieldArc: 'shield arc', shieldUpkeep: 'shield upkeep', shieldEfficiency: 'shield efficiency',
  phaseCost: 'phase cost', phaseUpkeep: 'phase upkeep', minCrew: 'min crew', maxCrew: 'max crew',
  cargo: 'cargo', fuel: 'fuel', fuelPerLY: 'fuel/ly', maxBurn: 'max burn', baseValue: 'base value',
  suppliesToRecover: 'supplies/rec', suppliesPerMonth: 'supplies/mo',
};
const list = value => Array.isArray(value) ? value : [];
const tokens = value => typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : list(value);
const changedList = (base, remove, add) => [...new Set([...list(base).filter(item => !list(remove).includes(item)), ...list(add)])];
function resolveSkin(id, chain = []) {
  if (shipById.has(id)) return shipById.get(id);
  const record = skinById.get(id);
  if (!record) throw new Error(`Missing base hull ${id}`);
  if (chain.includes(id)) throw new Error(`Skin inheritance cycle: ${[...chain, id].join(' -> ')}`);
  const skin = record.spec;
  const base = resolveSkin(skin.baseHullId, [...chain, id]);
  const stats = { ...base.stats, ...(csvIndex.ships.get(id)?.stats ?? {}), id };
  for (const [key, column] of Object.entries(skinStats)) if (own(skin, key)) stats[column] = String(skin[key]);
  if (own(skin, 'baseValueMult') && stats['base value'] !== undefined && stats['base value'] !== '' && Number.isFinite(Number(stats['base value']))) {
    stats['base value'] = String(Number(stats['base value']) * Number(skin.baseValueMult));
  }
  if (own(skin, 'tags')) stats.tags = changedList(tokens(base.stats.tags), [], skin.tags).join(', ');
  if (own(skin, 'addHints') || own(skin, 'removeHints')) stats.hints = changedList(tokens(base.stats.hints), skin.removeHints, skin.addHints).join(', ');
  const spec = { ...structuredClone(base.spec), ...structuredClone(skin), hullId: id };
  const slotError = (kind, slot) => report.resolutionErrors.push({ kind: 'skins', id, sourcePath: record.sourcePath, message: `${kind} references nonexistent slot ${slot}` });
  const baseWeapons = list(base.spec.weaponSlots);
  for (const slot of Object.keys(skin.weaponSlotChanges ?? {})) if (!baseWeapons.some(value => value.id === slot)) slotError('weaponSlotChanges', slot);
  spec.weaponSlots = baseWeapons.filter(slot => !list(skin.removeWeaponSlots).includes(slot.id))
    .map(slot => ({ ...structuredClone(slot), ...structuredClone(skin.weaponSlotChanges?.[slot.id] ?? {}) }));
  const baseEngines = list(base.spec.engineSlots);
  for (const slot of Object.keys(skin.engineSlotChanges ?? {})) if (!baseEngines[Number(slot)]) slotError('engineSlotChanges', slot);
  // Engine changes/removals address ORIGINAL indices, never the filtered array.
  spec.engineSlots = baseEngines.map((slot, index) => ({ ...structuredClone(slot), ...structuredClone(skin.engineSlotChanges?.[index] ?? {}) }))
    .filter((_, index) => !list(skin.removeEngineSlots).map(Number).includes(index));
  spec.builtInMods = changedList(base.spec.builtInMods, skin.removeBuiltInMods, skin.builtInMods);
  spec.builtInWeapons = { ...(base.spec.builtInWeapons ?? {}) };
  for (const slot of [...list(skin.removeBuiltInWeapons), ...list(skin.removeWeaponSlots)]) delete spec.builtInWeapons[slot];
  Object.assign(spec.builtInWeapons, skin.builtInWeapons ?? {});
  if (own(skin, 'builtInWings')) spec.builtInWings = structuredClone(skin.builtInWings); // [] explicitly clears inherited wings.
  if (base.spec.hints || skin.addHints || skin.removeHints) spec.hints = changedList(tokens(base.spec.hints), skin.removeHints, skin.addHints);
  if (base.spec.tags || skin.tags) spec.tags = changedList(base.spec.tags, [], skin.tags);
  const resolved = { id, sourcePath: record.sourcePath, baseHullId: skin.baseHullId, baseSourcePath: base.sourcePath,
    ...(base.csvSourcePath ? { csvSourcePath: base.csvSourcePath } : {}), stats, spec, skinSpec: skin };
  shipById.set(id, resolved);
  return resolved;
}
const skins = [];
for (const record of rawSkins) {
  try { skins.push(resolveSkin(record.id)); }
  catch (error) {
    report.resolutionErrors.push({ kind: 'skins', id: record.id, sourcePath: record.sourcePath, message: error.message });
    // Keep the broken source visible instead of silently dropping it.
    skins.push({ ...record, baseHullId: record.spec.baseHullId, skinSpec: record.spec, stats: {}, unresolved: true });
  }
}
const ships = [...baseShips, ...skins].map(record => ({ ...record, name: record.stats.name || record.spec.hullName || record.id,
  hullSize: record.spec.hullSize ?? '', sprite: slash(record.spec.spriteName ?? '') }));
const weapons = definitions['.wpn'].map(record => {
  const entry = withStats(record, 'weapons', definitionId(record, 'id', 'weapons'));
  return { ...entry, name: entry.stats.name || entry.spec.name || entry.id };
});
const systems = definitions['.system'].map(record => withStats(record, 'systems', definitionId(record, 'id', 'systems')));
const variants = definitions['.variant'].map(record => ({ ...record, id: definitionId(record, 'variantId', 'variants') }));
const projectiles = definitions['.proj'].map(record => ({ ...record, id: definitionId(record, 'id', 'projectiles') }));
const catalog = { schemaVersion: 1, ships, weapons, wings: tables.wings.map(row => row.stats), hullmods: tables.hullmods.map(row => row.stats),
  systems, variants, projectiles, descriptions: tables.descriptions.map(row => row.stats), configs, indexes: {}, report };
for (const [kind, records] of Object.entries({ ships, weapons, systems })) {
  const ids = new Set(records.map(record => record.id));
  for (const row of tables[kind]) if (!ids.has(row.stats.id)) report.unmatchedCsvRecords.push({ kind, id: row.stats.id, sourcePath: row.sourcePath, stats: row.stats });
}
catalog.indexes.fileNames = {};
catalog.indexes.idOccurrences = {};
catalog.indexes.sourcePaths = {};
for (const kind of ['ships', 'weapons', 'systems', 'variants', 'projectiles', 'wings', 'hullmods', 'descriptions']) {
  catalog[kind].sort((a, b) => compare(a.id, b.id) || compare(a.sourcePath ?? a.type ?? '', b.sourcePath ?? b.type ?? ''));
  const index = Object.create(null), occurrences = Object.create(null), filenames = Object.create(null);
  catalog[kind].forEach((record, position) => {
    (occurrences[record.id] ??= []).push(position);
    if (kind === 'descriptions') (index[record.id] ??= []).push(position);
    else if (!own(index, record.id)) index[record.id] = position;
    if (record.sourcePath) {
      const filename = basename(record.sourcePath, extname(record.sourcePath));
      (filenames[filename] ??= []).push(position);
      catalog.indexes.sourcePaths[record.sourcePath] = { collection: kind, index: position };
      // Prefer the filename matching the declared id, while preserving every
      // source record and all ambiguous alternatives in idOccurrences.
      if (filename === record.id) index[record.id] = position;
    }
  });
  catalog.indexes[kind] = index;
  catalog.indexes.fileNames[kind] = filenames;
  catalog.indexes.idOccurrences[kind] = occurrences;
  if (kind !== 'descriptions') {
    for (const [id, positions] of Object.entries(occurrences)) if (positions.length > 1) {
      report.duplicateIds.push({ kind, id, sourcePaths: positions.map(position => catalog[kind][position].sourcePath), indices: positions });
    }
  }
  report.counts[kind] = catalog[kind].length;
}
configs.sort((a, b) => compare(a.sourcePath, b.sourcePath));
catalog.indexes.configs = Object.fromEntries(configs.map((record, index) => [record.sourcePath, index]));
configs.forEach((record, index) => { catalog.indexes.sourcePaths[record.sourcePath] = { collection: 'configs', index }; });
report.counts.baseShips = baseShips.length;
report.counts.skins = skins.length;
report.counts.configs = configs.length;

// Inspect known data references only: no guessing that a Java class name is a
// missing ship/weapon, and no execution to resolve plugin-generated content.
function reference(kind, id, record, field) {
  if (typeof id !== 'string' || !id || id === 'null') return;
  if (!own(catalog.indexes[kind], id) && !own(catalog.indexes.fileNames[kind], id)) {
    report.unresolvedReferences.push({ sourcePath: record.sourcePath ?? report.csvSources.wings[0], id, collection: kind, field });
  }
}
for (const ship of ships) {
  reference('systems', ship.stats['system id'], ship, 'stats.system id');
  reference('systems', ship.stats['defense id'], ship, 'stats.defense id');
  for (const id of Object.values(ship.spec.builtInWeapons ?? {})) reference('weapons', id, ship, 'spec.builtInWeapons');
  for (const id of list(ship.spec.builtInMods)) reference('hullmods', id, ship, 'spec.builtInMods');
  for (const id of list(ship.spec.builtInWings)) reference('wings', id, ship, 'spec.builtInWings');
}
for (const weapon of weapons) reference('projectiles', weapon.spec.projectileSpecId, weapon, 'spec.projectileSpecId');
for (const variant of variants) {
  reference('ships', variant.spec.hullId, variant, 'spec.hullId');
  for (const group of list(variant.spec.weaponGroups)) for (const id of Object.values(group.weapons ?? {})) reference('weapons', id, variant, 'spec.weaponGroups');
  for (const field of ['hullMods', 'permaMods', 'sMods']) for (const id of list(variant.spec[field])) reference('hullmods', id, variant, 'spec.' + field);
  for (const id of list(variant.spec.wings)) reference('wings', id, variant, 'spec.wings');
  const modules = Array.isArray(variant.spec.modules) ? variant.spec.modules : [variant.spec.modules ?? {}];
  for (const module of modules) for (const id of Object.values(module)) reference('variants', id, variant, 'spec.modules');
}
for (const wing of catalog.wings) reference('variants', wing.variant, wing, 'variant');

// Runtime converters can derive filenames (e.g. phase-cloak glow suffixes) that
// never appear literally in native .ship definitions. Include their emitted closure.
report.runtimeResourceFiles = [];
for (const name of (await readdir(resolve(projectRoot, 'src/engine/data/generated'))).sort(compare)) {
  if (!name.endsWith('.json') || name === 'native-catalog.json') continue;
  const localPath = 'src/engine/data/generated/' + name;
  findAssets(JSON.parse((await readFile(resolve(projectRoot, localPath), 'utf8')).replace(/^\uFEFF/, '')), localPath);
  report.runtimeResourceFiles.push(localPath);
}

// Media dependency closure: parsed source strings, font page references, and
// explicitly referenced media directories. Enumerating media never copies it all.
const allowedMedia = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.dds', '.ogg', '.wav', '.mp3', '.flac', '.fnt', '.ttf', '.otf']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.dds']);
const fontExtensions = new Set(['.fnt', '.ttf', '.otf']);
const audioExtensions = new Set(['.ogg', '.wav', '.mp3', '.flac']);
const inventory = [...await walk('graphics'), ...await walk('sounds')];
const assetNames = new Map(inventory.map(path => [path.toLowerCase(), path]));
let manifest;
try { manifest = JSON.parse((await readFile(manifestPath, 'utf8')).replace(/^\uFEFF/, '')); }
catch (error) { if (error.code === 'ENOENT') manifest = []; else throw error; }
if (!Array.isArray(manifest)) throw new Error('Existing asset manifest must be an array; refusing to replace it');
const manifestByPath = new Map(), manifestIds = new Set();
for (const entry of manifest) {
  if (!entry || typeof entry.path !== 'string' || typeof entry.id !== 'string') throw new Error('Malformed existing asset manifest entry');
  if (manifestByPath.has(slash(entry.path)) || manifestIds.has(entry.id)) throw new Error(`Duplicate existing manifest entry ${entry.id}`);
  manifestByPath.set(slash(entry.path), entry); manifestIds.add(entry.id);
}
const fonts = new Map(), imported = new Set(), appended = [];
const missing = new Map();
let copied = 0, preserved = 0;
// Map iteration intentionally sees new font pages and directory children added below.
for (const [resource, references] of requests) {
  const extension = extname(resource).toLowerCase();
  const actual = assetNames.get(resource.toLowerCase());
  if (!actual && !extension) {
    const children = inventory.filter(path => path.toLowerCase().startsWith(`${resource.toLowerCase().replace(/\/$/, '')}/`) && allowedMedia.has(extname(path).toLowerCase()));
    if (children.length) { for (const child of children) for (const ref of references) requestAsset(child, ref); continue; }
  }
  // The one native sound container is explicitly referenced by sounds.json. It
  // is preserved as inert data, not treated as a generic archive to extract.
  const packedMusic = resource.toLowerCase() === 'sounds/music/music.bin';
  if (!allowedMedia.has(extension) && !packedMusic) {
    report.rejectedAssets.push({ path: resource, referencedBy: [...references].sort(compare), reason: 'Not an allowed media file or referenced media directory' }); continue;
  }
  const destination = await safeDestination(resolve(assetRoot, resource));
  let exists = false;
  try { exists = (await lstat(destination)).isFile(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!actual && !exists) { missing.set(resource, { path: resource, referencedBy: [...references].sort(compare) }); continue; }
  if (actual && actual !== resource) report.caseAliases.push({ path: resource, sourcePath: actual });
  if (exists) preserved++;
  else {
    try { await copyFile(await sourceFile(actual), destination, constants.COPYFILE_EXCL); copied++; }
    catch (error) { if (error.code === 'EEXIST') preserved++; else throw error; }
  }
  imported.add(resource);
  if (packedMusic) report.nativeOnlyAssets.push({ path: resource, reason: 'Native packed music container; requires a separate decoder/extractor, not direct HTML audio playback' });
  if (fontExtensions.has(extension)) {
    const info = { family: basename(resource, extension), glyphAtlases: [] };
    if (extension === '.fnt') {
      const text = await readFile(destination, 'utf8');
      info.family = /\bface="([^"]+)"/.exec(text)?.[1] ?? info.family;
      for (const match of text.matchAll(/\bfile\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s<>]+))/g)) {
        const page = slash(match[1] ?? match[2] ?? match[3]);
        const atlas = /^(graphics|sounds)\//.test(page) ? page : posix.join(posix.dirname(resource), page);
        requestAsset(atlas, resource); info.glyphAtlases.push(atlas);
      }
    }
    fonts.set(resource, info);
  }
  // Existing entries (including hashes, bytes, groups, font and sampler fields)
  // remain byte-for-byte equivalent as objects. New entries need no integrity
  // metadata because the runtime explicitly treats bytes/hash as optional.
  if (!manifestByPath.has(resource)) {
    if (manifestIds.has(resource)) throw new Error(`New asset path conflicts with existing manifest id: ${resource}`);
    const type = imageExtensions.has(extension) ? 'image' : fontExtensions.has(extension) ? 'font' : audioExtensions.has(extension) ? 'audio' : 'other';
    const entry = { id: resource, path: resource, type, group: resource.split('/')[0] };
    if (type === 'image') entry.sampler = {
      wrap: /^graphics\/fx\/.*(?:beam|shield|contrail|engineglow)/i.test(resource) ? 'repeat' : 'clamp',
      minFilter: 'linear', magFilter: 'linear', mipmap: false,
    };
    if (type === 'font') entry.font = fonts.get(resource);
    appended.push(entry); manifestByPath.set(resource, entry); manifestIds.add(entry.id);
  }
}
appended.sort((a, b) => compare(a.path, b.path));
// Re-read once at commit time: another worker may have just added custom font
// glyph metadata or sampler overrides while the media copy was in progress.
try {
  const latest = JSON.parse((await readFile(manifestPath, 'utf8')).replace(/^\uFEFF/, ''));
  if (!Array.isArray(latest)) throw new Error('Concurrent asset manifest is not an array');
  const latestPaths = new Set(latest.map(entry => slash(entry.path)));
  const latestIds = new Set(latest.map(entry => entry.id));
  for (const entry of [...manifest, ...appended]) if (!latestPaths.has(slash(entry.path))) {
    if (latestIds.has(entry.id)) throw new Error('Concurrent asset manifest id conflict: ' + entry.id);
    latest.push(entry); latestPaths.add(slash(entry.path)); latestIds.add(entry.id);
  }
  manifest = latest;
} catch (error) {
  if (error.code === 'ENOENT') manifest.push(...appended);
  else throw error;
}
// Font metadata is mandatory at runtime. Only fill absent fields, preserving
// existing families, glyph atlas lists, and any custom extension metadata.
for (const entry of manifest) if (entry.type === 'font') {
  const nativeFont = fonts.get(slash(entry.path));
  if (!entry.font?.family?.trim() || !Array.isArray(entry.font?.glyphAtlases)) {
    if (!nativeFont) throw new Error('Existing font lacks required metadata and is not in this closure: ' + entry.path);
    entry.font = { ...nativeFont, ...entry.font,
      family: entry.font?.family?.trim() ? entry.font.family : nativeFont.family,
      glyphAtlases: Array.isArray(entry.font?.glyphAtlases) ? entry.font.glyphAtlases : nativeFont.glyphAtlases };
  }
}
report.missingAssets = [...missing.values()].sort((a, b) => compare(a.path, b.path));
report.assetDependencies = Object.fromEntries([...requests].sort(([a], [b]) => compare(a, b)).map(([path, refs]) => [path, [...refs].sort(compare)]));
report.counts = { ...report.counts, sourceFiles: report.sourceFiles.length, referencedAssets: requests.size, availableAssets: imported.size,
  copiedAssets: copied, preservedAssets: preserved, newManifestEntries: appended.length, manifestEntries: manifest.length,
  missingAssets: report.missingAssets.length, parseErrors: report.parseErrors.length, resolutionErrors: report.resolutionErrors.length, unresolvedReferences: report.unresolvedReferences.length, duplicateIds: report.duplicateIds.length };
await writeJson(manifestPath, manifest);
await writeJson(catalogPath, catalog);
// Lightweight stock fits for the refit chooser; do not load the entire codex to fit a ship.
const refitVariants = {};
for (const { spec } of catalog.variants) {
  if (spec?.goalVariant !== true || !spec.hullId) continue;
  (refitVariants[spec.hullId] ??= []).push(spec);
}
await writeJson(resolve(projectRoot, 'src/engine/data/generated/refit-variants.json'), refitVariants);
const weaponDescriptions = new Map(catalog.descriptions.filter(d => d.type === 'WEAPON').map(d => [d.id, d]));
const refitWeaponTooltips = Object.fromEntries(catalog.weapons.map(w => {
  const description = weaponDescriptions.get(w.id);
  return [w.id, { manufacturer: w.stats?.['tech/manufacturer'] ?? '', role: w.stats?.primaryRoleStr ?? '',
    accuracy: w.stats?.accuracyStr ?? '', turnRate: w.stats?.turnRateStr ?? '',
    description: [description?.text1, description?.text2, description?.text3].filter(Boolean).join('\n\n') }];
}));
await writeJson(resolve(projectRoot, 'src/engine/data/generated/refit-weapon-tooltips.json'), refitWeaponTooltips);
console.log(JSON.stringify({ catalog: slash(relative(projectRoot, catalogPath)), counts: report.counts,
  parseErrors: report.parseErrors, resolutionErrors: report.resolutionErrors, missingAssets: report.missingAssets,
  unmatchedCsvRecords: report.unmatchedCsvRecords.map(({ stats: _stats, ...entry }) => entry),
  duplicateIds: report.duplicateIds, unresolvedReferences: report.unresolvedReferences, rejectedAssets: report.rejectedAssets, nativeOnlyAssets: report.nativeOnlyAssets }, null, 2));
if (args.includes('--strict') && (report.parseErrors.length || report.resolutionErrors.length || report.missingAssets.length || report.rejectedAssets.length)) process.exitCode = 1;
