import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {dependencyGraph, normalizePath} from './dependency-graph.mjs';

export function domainOf(file) {
  file = normalizePath(file);
  const name = path.posix.basename(file).replace(/^check-/, '');
  if (/^(?:src|server)\/campaign\//.test(file) || /campaign|career/.test(path.basename(file))) return 'campaign';
  if (/^src\/engine\/(?:modding|content|data|extensions)\//.test(file) || /^(?:ship-pack|default-loadout|desktop-content|adun-|ark-|retired-adun|extension-ballistics|gloriana|gravity|hyperion|rocinante|spear-of-adun|render-spear-of-adun|zhefeng|zhuyuan|four-tier-weapons|webp)/.test(name)) return 'content';
  if (/^src\/engine\/game\//.test(file) || /VersionedMigration|save-boundary|versioned-migration/.test(file)) return 'persistence';
  if (/^(?:src\/network|server|desktop)\//.test(file)) return 'network';
  if (/^src\/(?:ui|studio|hooks|visual-lab)\//.test(file) || /^(?:ui-|refit-|captain-retention|audio-settings|graphics-settings|home-network-navigation|cover-navigation|native-bitmap-text|native-descriptions|web-loading)/.test(name)) return 'ui';
  // Script ownership is explicit: dynamic bundles often have no static game imports.
  if (/^scripts\//.test(file) && /^(?:lan-|steam-|network-|authority-|server-|snapshot-|shared-(?:authority|snapshot)|relay-|realtime-|receiver-|record-deltas|fused-capture|one-pass-snapshot|native-(?:capture|dto|fields|record|projectile)|local-(?:turret-prediction|fire-prediction|particle-events)|ship-(?:network-view|display-lane)|motion-|layered-motion|particle-motion-reference|.*multiplayer|multiteam-|host-|owned-phase-reads|background-heartbeat|publication-probe|projection-encoding-cache|render-network-diagnostics|same-tick-skip-fixture|critical-combat|weapon-(?:replica|component)|(?:anchored-)?projectile-(?:events|visuals|flight|columns|entities|lifecycle|visual-renderer)|numeric-blocks|component-write-transform|direct-particle-restore)/.test(name)) return 'network';
  if (/^src\/(?:engine|worker-lab)\//.test(file) || /^scripts\//.test(file) && /^(?:ai-|authored-|beam-|battle-|combat-|damage-|distance-|fleet-|fire-|engine-apertures|explosion-|dynamic-particle|hull-overlay|hull-weapon-depth|interception-|local-battle|lockstep|navigation-|post-block|render-projection|sampled-autofire|simulation-|sprite-|stage-|weapon-)/.test(name)) return 'combat';
  return 'foundation';
}
const protectedPattern = /save|migration|foundation|contract|gateway|authority|idempot|concurr|permission|cargo-transfer|launch-idempot|release-scope/;
const mandatory = {
  foundation: ['architecture', 'foundation-types', 'foundation-declarations', 'stage-types', 'development-targets'],
  persistence: ['save-migrations', 'game-save'],
  content: ['ship-packs', 'game-save'],
  combat: ['stage-types', 'stage-lifecycle'],
  campaign: ['campaign-types', 'campaign-foundation', 'campaign-gateway', 'campaign-native-save'],
  network: ['network-authority', 'network-io', 'network-launch'],
  ui: ['ui-contracts'],
};
const explicit = [
  {id: 'architecture', domain: 'foundation', command: ['scripts/check-architecture.mjs'], safety: true},
  {id: 'foundation-types', domain: 'foundation', command: ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.foundation.json', '--pretty', 'false'], safety: true},
  {id: 'stage-types', domain: 'combat', command: ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.stage-contracts.json', '--pretty', 'false'], safety: true},
  {id: 'foundation-declarations', domain: 'foundation', command: ['scripts/generate-foundation-declarations.mjs', '--check'], safety: true},
  {id: 'save-migrations', domain: 'persistence', file: 'scripts/check-versioned-migrations.mjs'},
  {id: 'game-save', domain: 'persistence', file: 'scripts/check-game-save-boundary.mjs'},
  {id: 'ship-packs', domain: 'content', file: 'scripts/check-ship-pack-catalog.mjs'},
  {id: 'stage-lifecycle', domain: 'combat', file: 'scripts/check-stage-boundaries.mjs', expensive: true},
  {id: 'ecs-authority-foundation', domain: 'combat', file: 'scripts/check-ecs-authority-foundation.mjs'},
  {id: 'campaign-types', domain: 'campaign', command: ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.campaign.json', '--pretty', 'false'], safety: true},
  {id: 'campaign-foundation', domain: 'campaign', file: 'scripts/check-campaign-foundation.mjs'},
  {id: 'campaign-gateway', domain: 'campaign', file: 'scripts/check-campaign-gateway.mjs'},
  {id: 'campaign-native-save', domain: 'campaign', file: 'scripts/check-campaign-native-save.mjs', expensive: true},
  {id: 'network-authority', domain: 'network', file: 'scripts/check-server-authority-lifecycle.mjs'},
  {id: 'network-io', domain: 'network', file: 'scripts/check-authority-io.mjs'},
  {id: 'network-launch', domain: 'network', file: 'scripts/check-network-activation.mjs'},
  {id: 'ui-contracts', domain: 'ui', file: 'scripts/check-ui-contracts.mjs'},
  {id: 'development-targets', domain: 'foundation', file: 'scripts/check-development-targets.mjs'},
];
function hasEntrypoint(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let executes = false;
  const visit = node => {
    if (ts.isFunctionLike(node) || ts.isClassDeclaration(node)) return;
    if (ts.isCallExpression(node) || ts.isAwaitExpression(node) || ts.isNewExpression(node)) executes = true;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return executes;
}

/** Inventory includes every check source. Helper/compile-only entries never pretend to be runnable tests. */
export function checkCatalog(root) {
  const graph = dependencyGraph(root, ['src', 'server', 'desktop', 'scripts']);
  const imports = new Map(graph.files.map(file => [file, []]));
  for (const edge of graph.edges) if (!edge.external) imports.get(edge.from)?.push(edge.to);
  const dependencyCache = new Map();
  const dependencies = file => {
    if (dependencyCache.has(file)) return dependencyCache.get(file);
    const seen = new Set(), pending = [file];
    while (pending.length) { const next = pending.pop(); if (seen.has(next)) continue; seen.add(next); pending.push(...(imports.get(next) ?? [])); }
    dependencyCache.set(file, seen); return seen;
  };
  const explicitByFile = new Map(explicit.map(check => [check.file ?? check.command?.[0], check]));
  const entries = [];
  const inventoryFiles = [...graph.files.filter(file => /^scripts\/(?:.*\/)?check-/.test(file)),
    ...fs.readdirSync(path.join(root, 'scripts')).filter(file => /^check-.*\.py$/.test(file)).map(file => 'scripts/' + file)];
  for (const file of inventoryFiles) {
    const source = fs.readFileSync(path.join(root, file), 'utf8'), override = explicitByFile.get(file);
    const python = file.endsWith('.py'), compileOnly = /\.(?:mts|ts|tsx)$/.test(file);
    const helper = /^scripts\/.*\//.test(file) || !python && (/\.d\./.test(file) || !hasEntrypoint(source, file));
    const dynamicHarness = /stdin\s*:|eval\(|\.evaluate\(|build\(/.test(source);
    const deps = [...dependencies(file)];
    const browser = /playwright|chromium\.launch|puppeteer/.test(source) || deps.some(dependency => /browser/.test(dependency));
    const native = /node:sqlite|koffi|steamworks/.test(source) || deps.some(dependency => /server\/(?:campaign\/native|steam\/sockets-v012)/.test(dependency));
    const electron = /(?:from\s*['"]electron['"]|require\(['"]electron['"]\))/.test(source);
    entries.push({id: override?.id ?? path.basename(file).replace(/^check-/, '').replace(/\.[^.]+$/, '') + (compileOnly ? ':source' : file.endsWith('.js') ? ':js' : ''), file,
      domain: override?.domain ?? domainOf(file), environment: python ? 'python-manual' : electron ? 'isolated-electron' : browser ? 'headless-browser' : native ? 'node-native' : 'node',
      expensive: override?.expensive ?? (browser || electron || /benchmark|profile|native-save|combat-threat-phase/.test(file)),
      safety: override?.safety ?? protectedPattern.test(file), dynamicHarness, runnable: !python && !compileOnly && !helper && file !== 'scripts/check-affected.mjs',
      reason: python ? 'Python tool; inspect its interpreter, dependencies and arguments before manual execution.' : compileOnly ? 'Compiled by an owning wrapper or explicit type-check project.' : helper ? 'Exported helper; executed by its owning harness, not by importing this file alone.' : file === 'scripts/check-affected.mjs' ? 'Selection tool, never recursively executed as a check.' : 'Existing standalone check entry.',
      command: python || compileOnly || helper || file === 'scripts/check-affected.mjs' ? null : override?.command ?? [/from\s*['"]node:test['"]/.test(source) ? '--test' : file, ...(/from\s*['"]node:test['"]/.test(source) ? [file] : [])], dependencies: deps});
  }
  for (const check of explicit.filter(check => check.command && !entries.some(entry => entry.id === check.id))) entries.push({...check, environment: 'node', expensive: false, runnable: true, dependencies: [], reason: 'Explicit engineering gate.'});
  for (const check of explicit.filter(check => check.file)) if (!entries.some(entry => entry.id === check.id)) throw Error(`Required check missing: ${check.file}`);
  const ids = new Set();
  for (const check of entries) { if (ids.has(check.id)) throw Error('Duplicate check id: ' + check.id); ids.add(check.id); }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

export function selectChecks(catalog, changedFiles, domains = []) {
  for (const domain of domains) if (!Object.hasOwn(mandatory, domain)) throw Error('Unknown check domain: ' + domain);
  const changed = changedFiles.map(normalizePath), touched = new Set(domains);
  const material = changed.filter(file => !/^(?:docs\/|.*\.md$)/.test(file));
  material.forEach(file => touched.add(domainOf(file)));
  const affected = new Set(material);
  for (const check of catalog) if (check.dependencies.some(file => affected.has(file))) touched.add(check.domain);
  const required = new Set(material.length || domains.length ? mandatory.foundation : []);
  for (const domain of touched) for (const id of mandatory[domain] ?? []) required.add(id);
  const unknown = material.filter(file => !/^(?:src|server|desktop|scripts)\//.test(file));
  if (unknown.length) for (const ids of Object.values(mandatory)) ids.forEach(id => required.add(id));
  const selected = catalog.filter(check => check.runnable && check.id !== 'release-scope' && (required.has(check.id)
    || check.dependencies.some(file => changed.includes(file))
    || (check.dynamicHarness && touched.has(check.domain))
    || (domains.length && domains.includes(check.domain))
    || (unknown.length && check.safety)));
  return {changed, domains: [...touched].sort(), conservative: unknown, checks: selected.map(check => ({...check,
    selectedBecause: required.has(check.id) ? 'Required domain or engineering gate' : check.dependencies.some(file => changed.includes(file)) ? 'Imports a changed source' : check.dynamicHarness && touched.has(check.domain) ? 'Conservative domain selection for a dynamic bundle/browser harness' : 'Explicit domain / conservative safety selection'}))};
}
