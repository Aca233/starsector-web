#!/usr/bin/env node
/** Campaign definitions from native files, NOT the sandbox refit faction membership index. */
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOriginalFactionDefinition, validateOriginalFactionData } from '../src/campaign/rules/OriginalFactionDefinitions.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(project, 'src/campaign/data/reference-factions.json');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw new Error(`Faction import: ${message}`); };

// Reviewed decompilation snapshot. A changed implementation requires a deliberate audit,
// not automatically relabeling yesterday's rule with today's hash.
const reviewed = [
  ['settingsAccess', 'starfarer_obf/com/fs/starfarer/settings/StarfarerSettings.java', '5400ae43a3d69689bb3f144ca1abec1e8e8921b566dfef94b7be0ceef266d26c'],
  ['shipRoles', 'starfarer_obf/com/fs/starfarer/loading/o0oo.java', '3296a0468d9251f9382674c76a473d3fc4fddcd465d953590c992482e2a6ee4a'],
  ['hostilityManager', 'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/FactionHostilityManager.java', 'e272ba1f5823e92c06693e26fd997748b3c92da20331efb55852b034274dc639'],
  ['hostilityIntel', 'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/FactionHostilityIntel.java', '6ab5509aec5095c308b7d7cc5112c204624a8aa05771f138f115d3fd4eb31132'],
  ['loader', 'starfarer_obf/com/fs/starfarer/loading/SpecStore.java', '23151e3c6f2e01762982baa962d16349db1dd320f9050bf66ee53b51fed9d003'],
  ['merge', 'starfarer_obf/com/fs/starfarer/loading/LoadingUtils.java', '6e1923e9f632586b0dfc3ef87ca721f740db750740b72146a094772f48078a2f'],
  ['colorParser', 'starfarer_obf/com/fs/starfarer/loading/String.java', 'acb79d529294803898afd9ddb44699b69fbed6898b994a8cddb2da67a27c76d3'],
  ['spec', 'starfarer_obf/com/fs/starfarer/loading/o0oo_0.java', 'f785e0ea1a09c0c4b6c7844cabff0d638bb77e229e58e1905469c873014f522d'],
  ['fleetNames', 'starfarer_obf/com/fs/starfarer/loading/R.java', '735a7e669bcfbc45d02ae75b1eab1ed31471fba4b5419cb08d4ac886e0994cfd'],
  ['ranks', 'starfarer_obf/com/fs/starfarer/loading/oo0o_0.java', '4765a00cf66da6775983b9f88f86fcf25463c9e56968745df25ca95afdcbbb1d'],
  ['faction', 'starfarer_obf/com/fs/starfarer/campaign/Faction.java', '9803ee657a0a696bfb2968f1ba13e88936c5fd614e2ed8138dbea5ec42610853'],
  ['manager', 'starfarer_obf/com/fs/starfarer/campaign/FactionManager.java', '7911b5e44d4a20939f4829bf3a34f2aec6dca3b7400d8623b9a2770558e2a132'],
  ['colorMath', 'fs.common_obf/com/fs/graphics/util/B.java', '480e4cefb621a5a841027ea44a090b7da51f7ff1d723ec0e9d03ae68f4f23783'],
  ['uiConstants', 'starfarer_obf/com/fs/starfarer/O0OO.java', '0fc23b8f11eadd01fd1a40d64517ffd8dbaa839298481c5c69875a31a0593f87'],
  ['lifecycle', 'starfarer.api/com/fs/starfarer/api/impl/campaign/CoreLifecyclePluginImpl.java', 'ca7384b9f6a8ff9b82faf4df9e1e896ce0e3222c721bd68712146c1130070898'],
  ['ids', 'starfarer.api/com/fs/starfarer/api/impl/campaign/ids/Factions.java', 'da3eeecd658d5860711b3328916822a6270f99b4e843e922bc12febd51c1fa7e'],
  ['repLevels', 'starfarer.api/com/fs/starfarer/api/campaign/RepLevel.java', '0dc83a14078eddf82131752f230b3bd7269b5a7457fb767a81f3522043a217e6'],
];

/** Adapted from existing import-native-catalog/StarsectorTextParsers grammar.
 * Separate because neither catches duplicate keys and the catalog importer runs on import.
 * No eval; unlike JSONObject coercions we reject malformed/ambiguous field types. */
export function parseFactionText(input, label = '<data>') {
  const text = input.replace(/^\uFEFF/, ''); let cursor = 0;
  const fail = message => { throw new SyntaxError(`${label}:${text.slice(0, cursor).split('\n').length}: ${message}`); };
  const space = () => {
    while (cursor < text.length) {
      if (/\s/.test(text[cursor])) { cursor++; continue; }
      if (text[cursor] === '#' || text.slice(cursor, cursor + 2) === '//') { while (cursor < text.length && text[cursor] !== '\n') cursor++; continue; }
      if (text.slice(cursor, cursor + 2) === '/*') { const end = text.indexOf('*/', cursor + 2); if (end < 0) fail('unterminated comment'); cursor = end + 2; continue; }
      break;
    }
  };
  const string = () => {
    const start = cursor++;
    while (cursor < text.length) {
      const ch = text[cursor++];
      if (ch === '\\') cursor++;
      else if (ch === '"') return JSON.parse(text.slice(start, cursor));
    }
    return fail('unterminated string');
  };
  const value = (depth = 0) => {
    if (depth > 128) fail('nesting exceeds 128'); space();
    const ch = text[cursor];
    if (ch === '"') return string();
    if (ch === '{' || ch === '[') {
      const isObject = ch === '{', close = isObject ? '}' : ']', entries = [], items = [], keys = new Set();
      cursor++; space();
      while (text[cursor] !== close) {
        if (cursor >= text.length) fail('unterminated collection');
        if (isObject) {
          let key;
          if (text[cursor] === '"') key = string();
          else { const match = /^[A-Za-z0-9_]+/.exec(text.slice(cursor)); if (!match) fail('expected key'); key = match[0]; cursor += key.length; }
          if (keys.has(key)) fail(`duplicate key ${key}`);
          if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(`unsafe key ${key}`);
          keys.add(key); space(); if (text[cursor++] !== ':') fail('expected colon');
          entries.push([key, value(depth + 1)]);
        } else items.push(value(depth + 1));
        space(); if (text[cursor] === close) break;
        if (![',', ';'].includes(text[cursor])) fail('expected separator'); cursor++; space();
      }
      cursor++; return isObject ? Object.fromEntries(entries) : items;
    }
    const match = /^[^\s,;\]}:#/]+/.exec(text.slice(cursor)); if (!match) return fail('expected value');
    const token = match[0]; cursor += token.length;
    if (token === 'true') return true; if (token === 'false') return false; if (token === 'null') return null;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/.test(token)) {
      const number = Number(token.replace(/[fFdD]$/, '')); if (!Number.isFinite(number)) fail('non-finite number'); return number;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return token;
    return fail(`unsupported token ${token}`);
  };
  const result = value(); space(); if ([',', ';'].includes(text[cursor])) { cursor++; space(); }
  if (cursor !== text.length) fail('unexpected trailing content'); return result;
}

/** factions.csv currently has one column; do not guess a schema for extra columns. */
export function parseFactionManifest(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const cell = line => {
    if (line.startsWith('"')) { check(/^"(?:[^"]|"")*"$/.test(line), `malformed manifest cell ${line}`); return line.slice(1, -1).replace(/""/g, '"'); }
    check(!/[",]/.test(line), 'manifest must have exactly one column'); return line;
  };
  check(cell(lines.shift() ?? '') === 'faction', 'missing/unsupported factions.csv header');
  const paths = lines.map(cell), seen = new Set(); check(paths.length > 0, 'empty manifest');
  for (const path of paths) {
    check(/^data\/world\/factions\/[A-Za-z0-9_.-]+\.faction$/.test(path), `unsupported manifest path ${path}`);
    check(!seen.has(path.toLowerCase()), `duplicate/case-ambiguous manifest path ${path}`); seen.add(path.toLowerCase());
  }
  return paths;
}

function stripJavaComments(text) {
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, token => token.startsWith('/') ? token.replace(/[^\n]/g, ' ') : token);
}
/** Evidence extraction only: preserve RepLevel expressions, ordering and source lines.
 * This intentionally does NOT evaluate the script or create world relation values. */
export function extractSectorRelationshipAssignments(text, constantsText, knownIds) {
  const constants = new Map();
  for (const match of stripJavaComments(constantsText).matchAll(/public static final String (\w+) = "([^"]+)";/g)) {
    check(!constants.has(match[1]), `duplicate faction constant ${match[1]}`); constants.set(match[1], match[2]);
  }
  const clean = stripJavaComments(text), marker = 'public static void initFactionRelationships(SectorAPI sector)';
  const start = clean.indexOf(marker); check(start >= 0 && start === clean.lastIndexOf(marker), 'missing/ambiguous relationship initializer');
  const open = clean.indexOf('{', start); let depth = 1, end = open + 1;
  for (; end < clean.length && depth; end++) { if (clean[end] === '{') depth++; else if (clean[end] === '}') depth--; }
  check(depth === 0, 'unterminated relationship initializer');
  const variables = new Map(), assignments = [], startLine = clean.slice(0, open + 1).split('\n').length;
  for (const [offset, raw] of clean.slice(open + 1, end - 1).split('\n').entries()) {
    const line = raw.trim(); if (!line || line === 'Class c = HeavyArmor.class;') continue;
    let match = /^FactionAPI (\w+) = sector.getFaction\(Factions\.(\w+)\);$/.exec(line);
    if (match) { const id = constants.get(match[2]); check(id && knownIds.has(id), `unknown faction constant ${match[2]}`); check(!variables.has(match[1]), 'duplicate faction variable'); variables.set(match[1], id); continue; }
    match = /^(\w+)\.setRelationship\((\w+)\.getId\(\), (RepLevel\.([A-Z_]+)|-?\d+(?:\.\d+)?f?)\);$/.exec(line);
    check(match, `unsupported relationship initializer statement at line ${startLine + offset}: ${line}`);
    check(variables.has(match[1]) && variables.has(match[2]), 'unknown relationship variable');
    assignments.push({ from: variables.get(match[1]), to: variables.get(match[2]), line: startLine + offset,
      expression: match[4] ? { kind: 'rep-level', name: match[4] } : { kind: 'number', value: Number(match[3].replace(/f$/, '')) } });
  }
  check(assignments.length > 0, 'no source relationship assignments'); return assignments;
}
function within(root, absolute) {
  const rel = relative(root, absolute); check(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..\\`) && !rel.startsWith('../'), `path escapes source root: ${absolute}`); return absolute;
}
export async function buildCampaignFactionData({ coreRoot = resolve(project, '../starsector-core'), sourceRoot = resolve(project, '../decompiled') } = {}) {
  const roots = { core: await realpath(coreRoot), decompiled: await realpath(sourceRoot) }, sources = [], texts = new Map();
  const load = async (id, root, path, reviewedHash, binary = false) => {
    const absolute = within(roots[root], await realpath(within(roots[root], resolve(roots[root], path))));
    const bytes = await readFile(absolute), hash = sha256(bytes);
    if (reviewedHash) check(hash === reviewedHash, `reviewed source changed: ${path}; audit rules before updating hash`);
    sources.push({ id, root, path, sha256: hash, bytes: bytes.length });
    if (binary) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); texts.set(id, text); return text;
  };
  for (const [id, path, hash] of reviewed) await load(id, 'decompiled', path, hash);
  // The installed bytecode disambiguates CFR's inconsistent cfr_renamed_22 alias.
  await load('engineJar', 'core', 'starfarer_obf.jar', '8ae5516bf879ec068d206714fd67b90ebfa113c990f9e473357a5923b9700d6a', true);
  await load('colorMathJar', 'core', 'fs.common_obf.jar', '864124c5c6ea34fc182a750f29505f2b6d53141d2e2098f421401c6f9c5af66c', true);
  const settings = await load('settings', 'core', 'data/config/settings.json');
  const parsedSettings = parseFactionText(settings, 'settings.json');
  check(object(parsedSettings) && Object.hasOwn(parsedSettings, 'tooltipTitleAndLightHighlightColor'), 'missing audited bright-color setting');
  const manifest = parseFactionManifest(await load('manifest', 'core', 'data/world/factions/factions.csv'));
  const economy = parseFactionText(await load('economy', 'core', 'data/campaign/econ/economy.json'), 'economy.json');
  check(object(economy), 'economy.json must be an object');
  const defaultTariff = Object.hasOwn(economy, 'defaultTariff') ? economy.defaultTariff : 0;
  check(typeof defaultTariff === 'number' && Number.isFinite(defaultTariff), 'invalid defaultTariff');
  const defaults = {
    brightUIColorTarget: {
      settingKey: 'tooltipTitleAndLightHighlightColor', sourceId: 'settings',
      constantOwner: 'com.fs.starfarer.O0OO', constantField: 'void.super',
      rgba: parsedSettings.tooltipTitleAndLightHighlightColor, alphaOverride: 255, blendWeight: Math.fround(0.35),
    },
    tariffFraction: Math.fround(defaultTariff), tariffOrigin: Object.hasOwn(economy, 'defaultTariff') ? 'economy.defaultTariff' : 'SpecStore optDouble default 0',
    fleetTypeNames: parseFactionText(await load('defaultFleetNames', 'core', 'data/world/factions/default_fleet_type_names.json')),
    ranks: parseFactionText(await load('defaultRanks', 'core', 'data/world/factions/default_ranks.json')),
    shipRoles: parseFactionText(await load('defaultShipRoles', 'core', 'data/world/factions/default_ship_roles.json')),
  };
  const definitions = [], ids = new Set();
  for (const path of manifest) {
    const sourceId = `definition:${path.split('/').at(-1).slice(0, -8)}`;
    const raw = parseFactionText(await load(sourceId, 'core', path), path);
    const definition = resolveOriginalFactionDefinition(raw, sourceId, defaults);
    check(!ids.has(definition.id), `duplicate faction id ${definition.id}`); ids.add(definition.id); definitions.push(definition);
  }
  const directory = within(roots.core, await realpath(resolve(roots.core, 'data/world/factions')));
  const unlistedDefinitions = (await readdir(directory)).filter(name => name.endsWith('.faction') && !manifest.includes(`data/world/factions/${name}`)).sort(compare).map(name => `data/world/factions/${name}`);
  const sector = await load('sectorGen', 'core', 'data/scripts/world/SectorGen.java', '0a70fe5fb1339a63939ca474acae9ca628c0ff31f2bf8667ec9e27b6a4840f75');
  const entryPoints = [...stripJavaComments(settings).replace(/#[^\n]*/g, '').matchAll(/"newGameCreationEntryPoint"\s*:\s*"([^"]+)"/g)];
  check(entryPoints.length === 1 && entryPoints[0][1] === 'data.scripts.world.SectorGen', 'unsupported/ambiguous new-game entry point');
  const data = {
    schemaVersion: 1, profile: 'installed-core-faction-definitions/v1',
    scope: {
      installation: 'Local installed starsector-core snapshot (localized/possibly modified); hashes, not a clean-vanilla claim.',
      manifestOrder: 'Preserved from single-root factions.csv; does not promise FactionManager HashMap iteration order.',
      modOverlays: 'not-supported: no mod search order, fullOverrides or LoadingUtils overlay merge executed',
      inheritance: 'not-supported: no faction parent chain in reviewed SpecStore; no default.faction inferred',
      shipRoles: 'raw-only: default and local pools retained; selection, includeDefault and doctrine not executed',
      assetPaths: 'strings-only: logo/crest paths retained; image existence, copying and browser asset URLs are not handled by this importer',
      runtimeOverrides: 'not-supported: names/colors/known technology/player customization are world state, not immutable definitions',
    },
    sources: sources.sort((a, b) => compare(a.id, b.id)), defaults, definitions, unlistedDefinitions,
    relationships: {
      status: 'not-initialized', completeInitialState: false,
      sourceId: 'sectorGen', method: 'SectorGen.initFactionRelationships',
      sectorGenAssignments: extractSectorRelationshipAssignments(sector, texts.get('ids'), ids),
      engineLazyFallback: { self: 1, other: 0, applied: false, evidence: 'manager', note: 'Low-level absent-relation allocation only, NOT final new-game diplomatic state.' },
      additionalStages: [
        { sourceId: 'lifecycle', method: 'onGameLoad', status: 'not-executed', note: 'Starts hegemony/tritachyon, hegemony/persean, tritachyon/luddic_church hostilities when manager is absent.' },
        { sourceId: 'hostilityManager', method: 'startHostilities', status: 'not-executed', note: 'Creates FactionHostilityIntel if this pair has no ongoing hostilities.' },
        { sourceId: 'hostilityIntel', method: 'constructor/endHostilties', status: 'not-executed', note: 'Stores initial relationship, sets HOSTILE, and restores initial relationship when the event ends; this is stateful behavior, not a permanent definition default.' },
      ],
      completeness: 'SectorGen method statements are source evidence only. RepLevel conversion, hostilities, other scripts and player-start changes are not applied. No relation matrix exported.',
    },
  };
  validateOriginalFactionData(data); return data;
}
export const serializeCampaignFactionData = data => `${JSON.stringify(data, null, 2)}\n`;
async function main() {
  const args = process.argv.slice(2); let coreRoot, sourceRoot, verify = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') verify = true;
    else if (args[i] === '--source-root') { check(args[i + 1] && !args[i + 1].startsWith('--'), '--source-root requires a directory'); sourceRoot = resolve(args[++i]); }
    else if (args[i] === '--help') { console.log('node scripts/import-campaign-factions.mjs [StarsectorCore] [--source-root Decompiled] [--check]'); return; }
    else { check(!args[i].startsWith('--') && !coreRoot, `unknown argument ${args[i]}`); coreRoot = resolve(args[i]); }
  }
  const data = await buildCampaignFactionData({ coreRoot, sourceRoot }), bytes = serializeCampaignFactionData(data);
  if (verify) check(await readFile(destination, 'utf8') === bytes, 'reference-factions.json is stale; re-import after review');
  else { await mkdir(dirname(destination), { recursive: true }); await writeFile(`${destination}.tmp`, bytes, 'utf8'); await rename(`${destination}.tmp`, destination); }
  console.log(JSON.stringify({ destination, check: verify, factions: data.definitions.length, sources: data.sources.length,
    relationshipSourceStatements: data.relationships.sectorGenAssignments.length, unlistedDefinitions: data.unlistedDefinitions,
    unsupportedFields: [...new Set(data.definitions.flatMap(definition => definition.unsupportedFields))].sort(), sha256: sha256(bytes) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
