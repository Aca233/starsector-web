#!/usr/bin/env node
/** Build a lightweight refit index from the existing native catalog, not game files. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(projectRoot, 'src/engine/data/generated/native-catalog.json');
const outputPath = resolve(projectRoot, 'src/engine/data/generated/refit-factions.json');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const tokens = value => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
  .filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const excludedFactions = new Set(['player', 'neutral', 'poor']);

function indexById(records, kind) {
  const index = new Map();
  for (const record of records) {
    if (typeof record.id !== 'string' || !record.id) {
      throw new Error(`Missing ${kind} id: ${record.id}`);
    }
    // The native catalog intentionally retains duplicate source definitions.
    // Its own base-hull resolver also uses the first catalog occurrence.
    if (!index.has(record.id)) index.set(record.id, record);
  }
  return index;
}

export function deriveRefitFactions(catalog) {
  for (const key of ['ships', 'weapons', 'variants', 'configs']) {
    if (!Array.isArray(catalog[key])) throw new Error(`Native catalog is missing ${key}[]`);
  }
  const ships = indexById(catalog.ships, 'hull');
  const weapons = indexById(catalog.weapons, 'weapon');
  const variants = indexById(catalog.variants, 'variant');
  const warnings = new Set();
  const hullTags = new Map();

  function tagsForHull(id, chain = []) {
    if (hullTags.has(id)) return hullTags.get(id);
    if (chain.includes(id)) throw new Error(`Skin inheritance cycle: ${[...chain, id].join(' -> ')}`);
    const ship = ships.get(id);
    if (!ship) throw new Error(`Skin references missing base hull: ${id}`);
    const skin = ship.skinSpec;
    let tags;
    if (object(skin)) {
      // Resolved skin stats already contain an additive merge of parent tags.
      // Rebuild from raw skinSpec so an explicit removal cannot leak back in.
      const baseId = skin.baseHullId ?? ship.baseHullId;
      tags = new Set(tagsForHull(baseId, [...chain, id]));
      for (const tag of tokens(skin.tags)) tags.add(tag);
      for (const tag of tokens(skin.removeTags)) tags.delete(tag);
    } else {
      if (ship.baseHullId || ship.sourcePath?.endsWith('.skin')) {
        throw new Error(`Skin ${id} lacks raw skinSpec; re-import the native catalog first`);
      }
      tags = new Set([...tokens(ship.stats?.tags), ...tokens(ship.spec?.tags)]);
    }
    hullTags.set(id, tags);
    return tags;
  }
  for (const id of ships.keys()) tagsForHull(id);
  const weaponTags = new Map([...weapons].map(([id, weapon]) =>
    [id, new Set([...tokens(weapon.stats?.tags), ...tokens(weapon.spec?.tags)])]));

  const factions = [];
  const hullMemberships = new Map();
  const weaponMemberships = new Map();
  const seenFactions = new Set();
  const emptyFactions = [];

  function selectPool(pool, idsKey, records, tagsById, selected, source) {
    if (!object(pool)) return;
    for (const id of tokens(pool[idsKey])) {
      if (records.has(id)) selected.add(id);
      else warnings.add(`${source}: unresolved ${idsKey} id ${id}`);
    }
    const wanted = new Set(tokens(pool.tags));
    if (wanted.size === 0) return;
    for (const [id, tags] of tagsById) {
      if ([...tags].some(tag => wanted.has(tag))) selected.add(id);
    }
  }

  function selectVariants(weights, selected, source) {
    if (!object(weights)) return;
    for (const [id, weight] of Object.entries(weights)) {
      // includeDefault is role metadata, not a variant or permission to label
      // every hull in default_ship_roles.json as belonging to this faction.
      if (id === 'includeDefault' || typeof weight !== 'number' || weight <= 0) continue;
      const variant = variants.get(id);
      if (!variant) {
        warnings.add(`${source}: unresolved variant ${id}`);
        continue;
      }
      const hullId = variant.spec?.hullId;
      if (ships.has(hullId)) selected.add(hullId);
      else warnings.add(`${source}: variant ${id} references missing hull ${hullId}`);
    }
  }

  function addMemberships(index, ids, factionId) {
    for (const id of ids) {
      if (!index.has(id)) index.set(id, new Set());
      index.get(id).add(factionId);
    }
  }

  for (const config of catalog.configs) {
    if (!config.sourcePath?.endsWith('.faction')) continue;
    const faction = config.spec;
    if (!object(faction) || typeof faction.id !== 'string' || !faction.id) {
      throw new Error(`Invalid faction spec: ${config.sourcePath}`);
    }
    const id = faction.id;
    if (seenFactions.has(id)) throw new Error(`Duplicate faction id: ${id}`);
    seenFactions.add(id);
    if (excludedFactions.has(id)) continue;
    const selectedHulls = new Set();
    const selectedWeapons = new Set();
    for (const field of ['knownShips', 'priorityShips']) {
      selectPool(faction[field], 'hulls', ships, hullTags, selectedHulls, `${id}.${field}`);
    }
    for (const field of ['knownWeapons', 'priorityWeapons']) {
      selectPool(faction[field], 'weapons', weapons, weaponTags, selectedWeapons, `${id}.${field}`);
    }
    for (const [role, weights] of Object.entries(faction.shipRoles ?? {})) {
      selectVariants(weights, selectedHulls, `${id}.shipRoles.${role}`);
    }
    selectVariants(faction.variantOverrides, selectedHulls, `${id}.variantOverrides`);
    if (selectedHulls.size === 0 && selectedWeapons.size === 0) {
      emptyFactions.push(id);
      continue;
    }
    if (typeof faction.displayName !== 'string' || !faction.displayName.trim()) {
      throw new Error(`Faction ${id} has no displayName`);
    }
    factions.push({ id, name: faction.displayName });
    addMemberships(hullMemberships, selectedHulls, id);
    addMemberships(weaponMemberships, selectedWeapons, id);
  }

  const sortedIndex = index => Object.fromEntries([...index].sort(([a], [b]) => compare(a, b))
    .map(([id, memberships]) => [id, [...memberships].sort(compare)]));
  return {
    factions: factions.sort((a, b) => compare(a.id, b.id)),
    hullFactions: sortedIndex(hullMemberships),
    weaponFactions: sortedIndex(weaponMemberships),
    notes: [
      'Generated only from native-catalog.json. Import this lightweight file at runtime, not the full native catalog. Rebuild with npm run import:refit-factions after catalog changes.',
      'Faction IDs and names are the exact .faction id/displayName values. Include factions with at least one resolved hull or weapon; exclude player, neutral and poor even if they have starting blueprints.',
      'Membership is the union of knownShips/priorityShips (hulls or any matching tag) and knownWeapons/priorityWeapons (weapons or any matching tag). Tags are case-sensitive native CSV stats/spec tokens, not manufacturer or technology guesses.',
      'Skin tags are reconstructed recursively from base-hull tags plus raw skinSpec.tags, then skinSpec.removeTags are removed when present (none in the current catalog). Flattened skin stats are not re-added. Only tags inherit: explicit hull membership never propagates between a parent and its skins or siblings.',
      'Positive numeric entries in faction shipRoles and variantOverrides additionally select their exact variant.spec.hullId. Zero/negative weights and includeDefault metadata do not select hulls. Global default ship roles are not expanded.',
      'Duplicate hull, weapon and variant IDs use their first catalog occurrence, matching the catalog base-hull resolver; no union of conflicting duplicate definitions is inferred.',
      'Shared hulls and weapons may belong to multiple factions. This is static native pool membership, not exclusive origin, blueprint ownership, spawn probability, current market stock or full campaign/Java-script behavior.',
      'No inference from shipsWhenImporting, hull/weapon frequency or sale weights, fighter-wing pools, variant weapon loadouts, built-in weapons, station modules, hull names or ID spelling. Unknown explicit references are omitted and reported below. Missing map keys mean no resolved membership, not unusable content.',
      `Factions omitted because both resolved pools are empty: ${emptyFactions.sort(compare).join(', ') || 'none'}.`,
      ...[...warnings].sort(compare).map(warning => `Unresolved reference: ${warning}`),
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/import-refit-factions.mjs\nDerives refit-factions.json from the existing generated native-catalog.json. Does not read or modify the source game or assets.');
  } else {
    if (args.length) throw new Error('Usage: node scripts/import-refit-factions.mjs [--help]');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    const result = deriveRefitFactions(catalog);
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Refit factions: ${result.factions.length} factions, ${Object.keys(result.hullFactions).length} hulls, ${Object.keys(result.weaponFactions).length} weapons.`);
    for (const note of result.notes.filter(note => note.startsWith('Unresolved reference:'))) console.warn(note);
  }
}
