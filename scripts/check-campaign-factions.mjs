#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { dirname, resolve, join, relative, isAbsolute, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import data from '../src/campaign/data/reference-factions.json' with { type: 'json' };
import { createOriginalFactionDefinitions, validateOriginalFactionData, resolveOriginalFactionDefinition, createFactionRelationshipView, ORIGINAL_FACTION_FIELDS } from '../src/campaign/rules/OriginalFactionDefinitions.mjs';
import { parseFactionText, parseFactionManifest, extractSectorRelationshipAssignments, buildCampaignFactionData, serializeCampaignFactionData, sha256 } from './import-campaign-factions.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = createOriginalFactionDefinitions(data);
const minimal = (patch = {}) => ({ id: 'test', displayName: 'Test', displayNameWithArticle: 'the Test', logo: 'graphics/test.png', names: {}, ...patch });
const normalize = raw => resolveOriginalFactionDefinition(raw, 'fixture', data.defaults);

// Actual installed source evidence is tested as well as synthetic unsupported inputs.
test('all 21 manifest factions retained in manifest order, including player/neutral/poor and non-political factions', () => {
  assert.deepEqual(catalog.list().map(f => f.id), ['neutral', 'player', 'pirates', 'hegemony', 'independent', 'tritachyon', 'sindrian_diktat', 'lions_guard', 'knights_of_ludd', 'luddic_church', 'luddic_path', 'persean', 'derelict', 'remnant', 'omega', 'threat', 'dweller', 'scavengers', 'sleeper', 'poor', 'mercenary']);
  assert.equal(catalog.get('persean').sourceId, 'definition:persean_league');
  assert.equal(catalog.get('remnant').sourceId, 'definition:remnants');
  assert.deepEqual(data.unlistedDefinitions, []);
});
test('localized names and RGBA are imported without replacing names or losing alpha', () => {
  assert.equal(catalog.field('hegemony', 'displayName').value, '霸主');
  assert.equal(catalog.field('player', 'displayName').value, '你');
  assert.deepEqual(catalog.field('player', 'color').value, [170, 222, 255, 127]);
  assert.equal(catalog.field('player', 'showInIntelTab').value, false);
  assert.equal(catalog.get('lions_guard').nativeKind, 'non-player');
  assert.equal(catalog.get('player').nativeKind, 'player');
  assert.equal(catalog.list().filter(f => f.nativeKind === 'player').length, 1);
});
test('missing fields use only audited SpecStore defaults, including float32 and dependent names', () => {
  const f = normalize(minimal()).fields;
  assert.equal(f.displayNameLong.value, 'Test'); assert.equal(f.displayNameLongWithArticle.value, 'the Test');
  assert.equal(f.personNamePrefix.value, 'Test'); assert.equal(f.shipNamePrefix.value, 'ISS');
  assert.equal(f.showInIntelTab.value, true); assert.equal(f.secondarySegments.value, 8);
  assert.equal(f.crest.value, null); assert.equal(f.secondaryUIColor.value, null);
  assert.equal(f.tariffFraction.value, Math.fround(0.3)); assert.equal(f.tollFraction.value, Math.fround(0.1));
  assert.deepEqual(f.color.value, [255, 255, 255, 255]); assert.deepEqual(f.gridUIColor.value, [255, 255, 255, 75]);
  assert.deepEqual(f.darkUIColor.value, [102, 102, 102, 175]);
  assert.equal(f.color.origin, 'default'); assert.equal(f.displayName.origin, 'declared');
  assert.deepEqual(f.tariffFraction.evidence, ['loader', 'economy']);
});
test('color-dependent defaults use faction color, not baseUIColor; explicit zeros/empty text are not absence', () => {
  const f = normalize(minimal({ color: [7, 99, 155, 20], baseUIColor: [255, 255, 255, 10], secondarySegments: 0, tariffFraction: 0, personNamePrefixAOrAn: '' })).fields;
  assert.deepEqual(f.darkUIColor.value, [2, 39, 62, 175]); assert.deepEqual(f.gridUIColor.value, [7, 99, 155, 75]);
  assert.equal(f.tariffFraction.value, 0); assert.equal(f.secondarySegments.value, 0); assert.equal(f.personNamePrefixAOrAn.value, '');
});
test('all 18 default bright colors now resolve through the audited setting; explicit colors remain unchanged', () => {
  assert.deepEqual(data.defaults.brightUIColorTarget.rgba, [203,245,255,255]);
  assert.equal(catalog.list().filter(f => f.fields.brightUIColor.origin === 'default').length, 18);
  assert.equal(catalog.list().filter(f => f.fields.brightUIColor.origin === 'declared').length, 3);
  assert.equal(catalog.list().filter(f => f.fields.brightUIColor.status !== 'resolved').length, 0);
  assert.deepEqual(catalog.field('player','brightUIColor').value,[181,230,255,255]);
  assert.deepEqual(normalize(minimal({baseUIColor:[0,0,0,0]})).fields.brightUIColor.value,[71,85,89,89]);
  assert.deepEqual(normalize(minimal({brightUIColor:[11,22,33,44]})).fields.brightUIColor.value,[11,22,33,44]);
  assert.deepEqual(normalize(minimal({color:[1,2,3,4],baseUIColor:[170,222,255,255]})).fields.brightUIColor.value,[181,230,255,255]);
});
test('old snapshots without the bytecode mapping remain explicitly unresolved, never guessed', () => {
  const old = structuredClone(data); delete old.defaults.brightUIColorTarget;
  old.sources = old.sources.filter(s => !['settingsAccess','engineJar','colorMathJar'].includes(s.id));
  old.definitions = old.definitions.map(f => resolveOriginalFactionDefinition(f.raw,f.sourceId,old.defaults));
  const legacy = createOriginalFactionDefinitions(old);
  assert.equal(legacy.field('player','brightUIColor').status,'unimplemented');
  assert.equal(Object.hasOwn(legacy.field('player','brightUIColor'),'value'),false);
});
test('bright target alpha is forced to 255 before blending and default metadata cannot be forged', () => {
  const d = structuredClone(data.defaults); d.brightUIColorTarget.rgba=[203,245,255,0];
  assert.deepEqual(resolveOriginalFactionDefinition(minimal({baseUIColor:[0,0,0,0]}),'fixture',d).fields.brightUIColor.value,[71,85,89,89]);
  for (const patch of [{rgba:null},{rgba:[1,2,3]},{rgba:[1,2,3,NaN]},{alphaOverride:127},{blendWeight:0.35},{constantField:'cfr_renamed_22'},{sourceId:'made-up'}]) {
    const copy=structuredClone(data.defaults); Object.assign(copy.brightUIColorTarget,patch);
    assert.throws(()=>resolveOriginalFactionDefinition(minimal(),'fixture',copy));
  }
});
test('invalid/null/ambiguous supported fields and unproven inheritance are rejected', () => {
  for (const key of ['id', 'displayName', 'displayNameWithArticle', 'logo', 'names']) { const f = minimal(); delete f[key]; assert.throws(() => normalize(f)); }
  for (const patch of [{ color: null }, { color: [1, 2, 3] }, { color: [1, 2, 3, 4, 5] }, { color: [0, 0, 0, 256] }, { color: [1.5, 2, 3, 4] }, { crest: null }, { showInIntelTab: 'false' }, { tariffFraction: '0.3' }, { tariffFraction: 1e100 }, { secondarySegments: 0.5 }, { secondarySegments: 2 ** 32 }, { displayName: false }]) assert.throws(() => normalize(minimal(patch)));
  for (const key of ['extends', 'inherits', 'baseFaction', 'parentFaction']) assert.throws(() => normalize(minimal({ [key]: 'hegemony' })), /unsupported inheritance/);
});
test('names fall back PER KEY without mutating/merging the native definition tables', () => {
  assert.equal(catalog.name('hegemony', 'rank', 'factionLeader').value, '至高霸主');
  assert.equal(catalog.name('hegemony', 'rank', 'factionLeader').origin, 'declared');
  assert.equal(catalog.name('hegemony', 'rank', 'spaceCaptain').origin, 'default');
  assert.equal(catalog.name('hegemony', 'post', 'patrolCommander').origin, 'declared');
  assert.equal(catalog.name('hegemony', 'fleetType', 'trade').value, '大型商队');
  assert.equal(Object.hasOwn(catalog.get('hegemony').raw, 'fleetTypeNames'), false);
  assert.equal(catalog.name('hegemony', 'rank', 'missing').status, 'missing');
  assert.throws(() => catalog.name('hegemony', 'government', 'leader'), /unsupported name kind/);
});
test('raw present but unimplemented differs from absent outside the supported defaults', () => {
  const f = catalog.field('hegemony', 'factionDoctrine'); assert.equal(f.status, 'unimplemented'); assert.equal(f.presence, 'present');
  assert.deepEqual(f.raw, catalog.get('hegemony').raw.factionDoctrine);
  assert.equal(catalog.field('neutral', 'factionDoctrine').status, 'missing');
  assert.equal(catalog.field('hegemony', 'ranks').status, 'unimplemented');
  assert.equal(catalog.field('hegemony', 'madeUpGovernance').status, 'missing');
  assert.equal(catalog.find('not_present'), undefined); assert.throws(() => catalog.get('not_present'), /Unknown faction/);
  assert.throws(() => catalog.field('not_present', 'color'), /Unknown faction/);
});
test('every supported projection and every unsupported raw field is accounted for', () => {
  for (const f of catalog.list()) {
    assert.deepEqual(Object.keys(f.fields).sort(), [...ORIGINAL_FACTION_FIELDS].sort());
    for (const key of Object.keys(f.raw)) assert.ok(ORIGINAL_FACTION_FIELDS.includes(key) || ['ranks', 'fleetTypeNames'].includes(key) || f.unsupportedFields.includes(key));
    assert.equal(f.id, f.raw.id);
  }
});
test('catalog snapshot, raw fields, result arrays and nested queries are immutable and detached', () => {
  const input = structuredClone(data), view = createOriginalFactionDefinitions(input); input.definitions[0].raw.displayName = 'mutated';
  assert.equal(view.field('neutral', 'displayName').value, '中立');
  assert.throws(() => { view.get('player').fields.color.value[0] = 0; }, TypeError);
  assert.throws(() => { view.list().push({}); }, TypeError);
  assert.throws(() => { view.get('hegemony').raw.factionDoctrine.warships = 0; }, TypeError);
  assert.throws(() => { view.name('hegemony', 'rank', 'spaceCaptain').value = 'x'; }, TypeError);
  assert.equal(Object.isFrozen(view), true); assert.equal(Object.isFrozen(view.data.sources), true);
});
test('validation rejects tampered projections, duplicate IDs, malformed provenance and invalid inputs', () => {
  const mutate = fn => { const copy = structuredClone(data); fn(copy); assert.throws(() => validateOriginalFactionData(copy)); };
  mutate(d => { d.sources=d.sources.filter(source=>source.id!=='engineJar'); });
  mutate(d => { delete d.scope; }); mutate(d => { delete d.defaults.tariffOrigin; });
  mutate(d => { d.relationships.engineLazyFallback.applied = true; });
  mutate(d => { d.relationships.sectorGenAssignments[0].expression = null; });
  mutate(d => { d.schemaVersion = 2; }); mutate(d => { d.definitions[0].fields.color.value[0] = 1; });
  mutate(d => { d.definitions.push(d.definitions[0]); }); mutate(d => { d.sources[0].sha256 = 'invented'; });
  mutate(d => { d.sources[0].path = '../escape'; });
  mutate(d => { d.sources[1] = { ...d.sources[0], id: d.sources[1].id }; });
  mutate(d => { d.definitions[0] = resolveOriginalFactionDefinition(d.definitions[0].raw, 'manager', d.defaults); }); mutate(d => { d.sources.push(d.sources[0]); });
  mutate(d => { d.sources = d.sources.filter(s => s.id !== 'manager'); });
  mutate(d => { d.relationships.completeInitialState = true; }); mutate(d => { d.relationships.sectorGenAssignments[0].to = 'unknown'; });
  mutate(d => { d.definitions[0].unsupportedFields.push('fiction'); }); mutate(d => { d.defaults.ranks.ranks.spaceCaptain.name = 42; });
  assert.throws(() => validateOriginalFactionData(undefined)); const cycle = {}; cycle.self = cycle; assert.throws(() => validateOriginalFactionData(cycle), /cyclic/);
  assert.throws(() => parseFactionText('{"__proto__": {"polluted": true}}'), /unsafe key/);
});
test('relationship import preserves 64 ordered script statements, not a fabricated zero matrix', () => {
  const r = data.relationships; assert.equal(r.status, 'not-initialized'); assert.equal(r.completeInitialState, false);
  assert.equal(r.engineLazyFallback.applied, false); assert.equal(r.sectorGenAssignments.length, 64);
  assert.deepEqual(r.sectorGenAssignments.find(e => e.from === 'player' && e.to === 'pirates').expression, { kind: 'number', value: -0.65 });
  assert.deepEqual(r.sectorGenAssignments.find(e => e.from === 'luddic_church' && e.to === 'knights_of_ludd').expression, { kind: 'rep-level', name: 'COOPERATIVE' });
  assert.equal(r.sectorGenAssignments.some(e => e.from === 'hegemony' && e.to === 'tritachyon'), false); // commented out in SectorGen, lifecycle instead
  assert.equal(Object.hasOwn(r, 'values'), false); assert.equal(r.additionalStages[0].status, 'not-executed');
});
test('relationship evidence points at exact live source lines and never treats commented-out calls as active', async () => {
  const lines = (await readFile(resolve(project, '../starsector-core/data/scripts/world/SectorGen.java'), 'utf8')).split('\n');
  for (const entry of data.relationships.sectorGenAssignments) assert.match(lines[entry.line - 1].trim(), /^\w+\.setRelationship\(/);
  const constants = 'public static final String A = "a"; public static final String B = "b";';
  const head = 'public static void initFactionRelationships(SectorAPI sector) {\nFactionAPI a = sector.getFaction(Factions.A);\nFactionAPI b = sector.getFaction(Factions.B);\n';
  const parsed = extractSectorRelationshipAssignments(head + '// a.setRelationship(b.getId(), 0);\n/*a.setRelationship(b.getId(), 0);*/\na.setRelationship(b.getId(), -0.65f);\n}', constants, new Set(['a', 'b']));
  assert.equal(parsed.length, 1); assert.equal(parsed[0].line, 6);
  assert.throws(() => extractSectorRelationshipAssignments(head + 'if (true) a.setRelationship(b.getId(), 0);\n}', constants, new Set(['a', 'b'])), /unsupported.*statement/);
});
test('separate relation view accepts custom IDs, preserves explicit zero and never invents missing/self relations', () => {
  const input = { factionIds: ['player:alice', 'custom:aurora', 'hegemony'], entries: [{ from: 'custom:aurora', to: 'hegemony', value: -0.65, source: 'world-event:1' }, { from: 'player:alice', to: 'hegemony', value: 0 }] };
  const view = createFactionRelationshipView(input); input.entries[0].value = 0.7;
  assert.equal(view.get('hegemony', 'custom:aurora').value, -0.65); assert.equal(view.get('hegemony', 'player:alice').status, 'known');
  assert.equal(view.get('hegemony', 'player:alice').value, 0); assert.deepEqual(view.get('custom:aurora', 'custom:aurora'), { status: 'uninitialized' });
  assert.deepEqual(view.get('custom:aurora', 'player:alice'), { status: 'uninitialized' });
  assert.throws(() => view.get('not-registered', 'hegemony'), /unknown faction/);
  assert.throws(() => { view.get('hegemony', 'custom:aurora').entry.value = 1; }, TypeError);
  assert.equal(catalog.find('custom:aurora'), undefined); // no static 'player' or NPC definition clone
});
test('relation view rejects contradictory pairs, nonfinite/out-of-range values and undeclared IDs without clamping', () => {
  const entry = { from: 'a', to: 'b', value: 0 }, make = entries => ({ factionIds: ['a', 'b'], entries });
  assert.throws(() => createFactionRelationshipView({ ...make([]), policy: 'automatic' }), /unknown relation snapshot/);
  for (const value of [NaN, Infinity, -1.01, 1.01, null, '0']) assert.throws(() => createFactionRelationshipView(make([{ ...entry, value }])));
  assert.throws(() => createFactionRelationshipView(make([entry, { from: 'b', to: 'a', value: 0 }])) , /duplicate/);
  assert.throws(() => createFactionRelationshipView(make([{ ...entry, to: 'c' }])) , /unknown faction/);
  assert.throws(() => createFactionRelationshipView(make([{ ...entry, governance: 'invented' }])) , /unknown relation entry/);
  assert.throws(() => createFactionRelationshipView({ factionIds: ['a', 'a'], entries: [] }), /duplicate/);
});
test('native parser handles comments, bare keys/enums, Java numbers, trailing separators and quoted comment markers', () => {
  assert.deepEqual(parseFactionText('\uFEFF{# x\n id: "test", n: .5f, token: BARE, /*ignored*/ url: "https://x/#p", arr:[1,2,], };'), { id: 'test', n: 0.5, token: 'BARE', url: 'https://x/#p', arr: [1, 2] });
  for (const text of ['{a:1,a:2}', '{nested:{a:1,a:2}}', '{a:NaN}', '{a:1e999}', '{a:[1,,2]}', '{a:1} junk', '/*unfinished', '{a:"unfinished}', '{a:()=>1}']) {
    // NaN is a legal bare enum token, NOT a numeric NaN; it remains inert raw data.
    if (text === '{a:NaN}') assert.equal(parseFactionText(text).a, 'NaN'); else assert.throws(() => parseFactionText(text));
  }
  assert.throws(() => parseFactionText('['.repeat(130) + ']'.repeat(130)), /nesting/);
});
test('manifest is authoritative and rejects duplicate paths, traversal and unknown CSV schemas', () => {
  assert.deepEqual(parseFactionManifest('\uFEFFfaction\r\n# skip\r\n"data/world/factions/player.faction"\r\n'), ['data/world/factions/player.faction']);
  for (const text of ['faction\n', 'other\nx', 'faction,other\nx,y', 'faction\n../player.faction', 'faction\ndata/world/factions/player.faction\ndata/world/factions/player.faction', 'faction\ndata/world/factions/Player.faction\ndata/world/factions/player.faction', 'faction\n"unterminated']) assert.throws(() => parseFactionManifest(text));
});
test('raw faction parsing agrees with the existing text parser without executing the sandbox importer', async () => {
  const { parseStarsectorJson } = await import('../src/engine/data/StarsectorTextParsers.ts');
  for (const faction of data.definitions) {
    const source = data.sources.find(s => s.id === faction.sourceId);
    const text = await readFile(resolve(project, '../starsector-core', source.path), 'utf8');
    assert.deepEqual(faction.raw, parseStarsectorJson(text), source.path);
  }
});
test('each input file hash matches original bytes; double import is byte-reproducible and artifact matches', async () => {
  const a = await buildCampaignFactionData(), b = await buildCampaignFactionData();
  const bytes = serializeCampaignFactionData(a); assert.equal(bytes, serializeCampaignFactionData(b));
  assert.equal(bytes, await readFile(resolve(project, 'src/campaign/data/reference-factions.json'), 'utf8'));
  for (const source of data.sources) {
    const path = resolve(project, source.root === 'core' ? '../starsector-core' : '../decompiled', source.path);
    const raw = await readFile(path); assert.equal(sha256(raw), source.sha256, source.path); assert.equal(raw.length, source.bytes);
  }
  const run = spawnSync(process.execPath, [resolve(project, 'scripts/import-campaign-factions.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
test('isolated source fixture fails on missing files, duplicate IDs, changed audited code; unlisted files are reported not loaded', async t => {
  const root = await mkdtemp(join(tmpdir(), 'campaign-factions-'));
  t.after(async () => {
    const absolute = await realpath(root), base = await realpath(tmpdir()), rel = relative(base, absolute);
    assert.ok(!isAbsolute(rel) && rel.startsWith('campaign-factions-') && !rel.includes('/') && !rel.includes('\\'));
    await rm(absolute, { recursive: true, force: true });
  });
  for (const source of data.sources) {
    const sourceRoot = resolve(project, source.root === 'core' ? '../starsector-core' : '../decompiled');
    const target = join(root, source.root, source.path); await mkdir(dirname(target), { recursive: true }); await copyFile(join(sourceRoot, source.path), target);
  }
  const options = { coreRoot: join(root, 'core'), sourceRoot: join(root, 'decompiled') };
  await writeFile(join(root, 'core/data/world/factions/not_listed.faction'), 'not valid, must not load');
  const fixture = await buildCampaignFactionData(options); assert.equal(fixture.definitions.length, 21); assert.deepEqual(fixture.unlistedDefinitions, ['data/world/factions/not_listed.faction']);
  // Setting changes are imported, not replaced by hard-coded white or the previous RGBA.
  const settingsPath = join(root,'core/data/config/settings.json'), settingsText = await readFile(settingsPath,'utf8');
  const setting = parseFactionText(settingsText); setting.tooltipTitleAndLightHighlightColor=[7,13,17,0];
  await writeFile(settingsPath,JSON.stringify(setting));
  const changed = await buildCampaignFactionData(options);
  assert.deepEqual(changed.defaults.brightUIColorTarget.rgba,[7,13,17,0]);
  assert.deepEqual(changed.definitions.find(f=>f.id==='player').fields.brightUIColor.value,[112,148,171,255]);
  delete setting.tooltipTitleAndLightHighlightColor; await writeFile(settingsPath,JSON.stringify(setting));
  await assert.rejects(buildCampaignFactionData(options),/missing audited bright-color setting/);
  await writeFile(settingsPath,settingsText);
  const player = join(root, 'core/data/world/factions/player.faction'), original = await readFile(player, 'utf8');
  await writeFile(player, original.replace('"id":"player"', '"id":"neutral"'));
  await assert.rejects(buildCampaignFactionData(options), /duplicate faction id neutral/); await writeFile(player, original);
  const loader = join(root, 'decompiled', data.sources.find(s => s.id === 'loader').path);
  const loaderBytes = await readFile(loader); await writeFile(loader, Buffer.concat([loaderBytes, Buffer.from('\n// drift')]));
  await assert.rejects(buildCampaignFactionData(options), /reviewed source changed/); await writeFile(loader, loaderBytes);
  await rm(player); await assert.rejects(buildCampaignFactionData(options), /ENOENT/);
});
test('TypeScript declaration supports narrowed queries and enforces readonly data without shared type edits', async () => {
  const ts = await import('typescript');
  const filename = resolve(project, 'scripts/__faction_contract_in_memory__.mts').replace(/\\/g, '/');
  const source = `import {createOriginalFactionDefinitions, createFactionRelationshipView} from '../src/campaign/rules/OriginalFactionDefinitions.mjs';
    const defs = createOriginalFactionDefinitions({});
    const result = defs.field('player', 'color');
    if (result.status === 'resolved') { const value = result.value; void value; }
    if (result.status === 'unimplemented') { const reason: string = result.reason; void reason; }
    // @ts-expect-error immutable list
    defs.list().push(defs.get('player'));
    // @ts-expect-error immutable definition
    defs.get('player').id = 'other';
    // @ts-expect-error unsupported name query
    defs.name('player', 'governance', 'owner');
    const relations = createFactionRelationshipView({factionIds:['custom:a'], entries:[]});
    const relation = relations.get('custom:a', 'custom:a');
    if (relation.status === 'known') { const n: number = relation.value; void n; }
    // @ts-expect-error unknown relation has no invented value
    if (relation.status === 'uninitialized') relation.value;
  `;
  const options = { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, types: ['node'], skipLibCheck: false };
  const host = ts.createCompilerHost(options), read = host.readFile.bind(host), exists = host.fileExists.bind(host);
  host.readFile = path => path.replace(/\\/g, '/') === filename ? source : read(path);
  host.fileExists = path => path.replace(/\\/g, '/') === filename || exists(path);
  const program = ts.createProgram([filename], options, host), diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => project, getNewLine: () => '\n' }));
});

// Opt-in actual installed Java oracle. No game startup, resource scanner or renderer.
test('native O0OO initialization resolves the real bright-color field and FactionSpec calculation', { skip: !process.argv.includes('--native') }, async t => {
  const install = resolve(project, '..'), core = join(install, 'starsector-core');
  const dir = await mkdtemp(join(tmpdir(), 'starsector-faction-color-'));
  t.after(async () => {
    const absolute = await realpath(dir), base = await realpath(tmpdir()), rel = relative(base, absolute);
    assert.ok(!isAbsolute(rel) && rel.startsWith('starsector-faction-color-') && !rel.includes('/') && !rel.includes('\\'));
    await rm(absolute, { recursive: true, force: true });
  });
  assert.equal(process.platform, 'win32', 'This native oracle is audited for the installed Windows JRE/native library');
  // -noverify is required by the original obfuscated identifiers (also in the game vmparams).
  // Pin every explicitly loaded game jar/DLL before permitting that original JVM option.
  const pinned = [
    ['starfarer_obf.jar','8ae5516bf879ec068d206714fd67b90ebfa113c990f9e473357a5923b9700d6a'],
    ['fs.common_obf.jar','864124c5c6ea34fc182a750f29505f2b6d53141d2e2098f421401c6f9c5af66c'],
    ['starfarer.api.jar','0798e624c949657ab524188928bb13d618a70cb451dc7da9789545569a05081b'],
    ['json.jar','63c3541f323f3dfdd595da9257a2099b6a6c39f35a6b3909d86c48a8aa456911'],
    ['log4j-1.2.9.jar','d2b9dfb297bcaa7be1fcdd702642a9c9713d7847dca8704e9c15bd829f0ab1bf'],
    ['lwjgl.jar','527d509f60132e5b2653c7fc0f8cf299d6f698f4a8013342bef47705dc57ed3f'],
    ['native/windows/lwjgl64.dll','094c38a9b6b9ab76e3730838d542419811e63de5d4a4ba5a22d83f6edd803943'],
  ];
  for (const [path,hash] of pinned) assert.equal(sha256(await readFile(join(core,path))),hash, `native oracle dependency changed: ${path}`);
  const source = String.raw`
import java.awt.Color;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Scanner;
import java.security.Permission;
import org.json.JSONObject;
import com.fs.starfarer.loading.O0oO;
import com.fs.starfarer.O0OO;
public class FactionColorProbe {
  static Color parse(String s) { String[] v=s.split(","); return new Color(Integer.parseInt(v[0]),Integer.parseInt(v[1]),Integer.parseInt(v[2]),Integer.parseInt(v[3])); }
  static String rgba(Color c) { return c.getRed()+","+c.getGreen()+","+c.getBlue()+","+c.getAlpha(); }
  static void out(String key, Object value) { System.out.println(key+"|"+value); }
  @SuppressWarnings("removal")
  public static void main(String[] args) throws Exception {
    // Loggers must not discover the game's disk log configuration. No appenders are attached.
    org.apache.log4j.LogManager.getRootLogger().removeAllAppenders();
    org.apache.log4j.LogManager.getRootLogger().setLevel(org.apache.log4j.Level.OFF);
    System.setSecurityManager(new SecurityManager() {
      @Override public void checkPermission(Permission p) {
        if (p instanceof java.net.SocketPermission) throw new SecurityException("No network in oracle");
        if (p instanceof java.io.FilePermission && (p.getActions().contains("write") || p.getActions().contains("delete") || p.getActions().contains("execute")))
          throw new SecurityException("Read-only oracle: "+p);
        // B.<clinit> only calls Sys.getTimerResolution; permit its installed LWJGL timer library.
        // No Display/GL method is invoked and no game native font/IME/audio libraries are loaded.
      }
    });
    // Inject ONLY a parsed native settings document into the real settings class's root field.
    // This avoids the game's full settings/resource initialization method and mod loading.
    JSONObject settings = new JSONObject(Files.readString(Path.of(args[0])));
    Class<?> settingsClass = Class.forName("com.fs.starfarer.settings.StarfarerSettings");
    Field root = settingsClass.getDeclaredField("\u00f5\u00d80000"); root.setAccessible(true); root.set(null, settings);
    Field targetField = O0OO.class.getField("void.super");
    Color constant = (Color)targetField.get(null);
    out("constant", rgba(constant));
    O0oO spec = new O0oO();
    Scanner input = new Scanner(System.in);
    while (input.hasNextLine()) {
      String line = input.nextLine(); if (line.isEmpty()) continue; String[] v = line.split("\\|",-1);
      targetField.set(null, v[2].isEmpty() ? constant : parse(v[2]));
      spec.setBaseUIColor(parse(v[1])); spec.setBrightUIColor(v[3].isEmpty() ? null : parse(v[3]));
      out(v[0], rgba(spec.getBrightUIColor()));
    }
  }
}
`;
  const settingsPath=join(dir,'native-settings.json');
  await writeFile(settingsPath,JSON.stringify(parseFactionText(await readFile(join(core,'data/config/settings.json'),'utf8'))),'utf8');
  const sourcePath=join(dir,'FactionColorProbe.java'); await writeFile(sourcePath,source,'utf8');
  const jars=['starfarer_obf.jar','starfarer.api.jar','fs.common_obf.jar','json.jar','log4j-1.2.9.jar','lwjgl.jar'].map(name=>join(core,name)).join(delimiter);
  const compile=spawnSync(process.env.FACTIONS_JAVAC ?? 'javac',['--release','17','-encoding','UTF-8','-cp',jars,'-d',dir,sourcePath],{encoding:'utf8',timeout:60000,cwd:dir});
  assert.equal(compile.status,0,compile.stderr || compile.error?.message);
  // Resolve bytecode symbols independently of the decompiler aliases before executing.
  const jdk=spawnSync(process.env.FACTIONS_JAVAC ?? 'javac',['-J-XshowSettings:properties','-version'],{encoding:'utf8',timeout:30000,cwd:dir});
  assert.equal(jdk.status,0,jdk.stderr || jdk.error?.message);
  const jdkHome=/java\.home = (.+)/.exec(jdk.stderr)?.[1].trim(); assert.ok(jdkHome);
  const javap=process.env.FACTIONS_JAVAP ?? join(jdkHome,'bin/javap.exe');
  const disassemble = name => {
    const result=spawnSync(javap,['-classpath',jars,'-c','-p',name],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,cwd:dir});
    assert.equal(result.status,0,result.stderr || result.error?.message); return result.stdout;
  };
  const getter = disassemble('com.fs.starfarer.loading.O0oO').split('public java.awt.Color getBrightUIColor();')[1].split('public void setBrightUIColor')[0];
  assert.match(getter,/getstatic[^\n]*O0OO\."void\.super"/); assert.match(getter,/float 0\.35f/); assert.match(getter,/sipush\s+255/);
  const constants=disassemble('com.fs.starfarer.O0OO');
  assert.match(constants,/String tooltipTitleAndLightHighlightColor[\s\S]{0,250}putstatic[^\n]*"void\.super"/);
  const cases=[];
  const add=(id,base,target,explicit,expected)=>cases.push({id,input:[id,base.join(','),target?.join(',')??'',explicit?.join(',')??''].join('|'),expected});
  for(const f of catalog.list()) add(f.id,f.fields.baseUIColor.value,null,f.raw.brightUIColor,f.fields.brightUIColor.value);
  // Every possible 8-bit base/target channel pair, with distinct alpha to test forced opacity.
  // Uses genuine native getBrightUIColor, not a handwritten Java copy of the formula.
  const d=structuredClone(data.defaults);
  for(let base=0;base<256;base++) for(let target=0;target<256;target++) {
    const a=[base,255-base,base,base], b=[target,target,255-target,(target*41)%256];
    d.brightUIColorTarget.rgba=b;
    add('pair-'+base+'-'+target,a,b,null,resolveOriginalFactionDefinition(minimal({baseUIColor:a}),'fixture',d).fields.brightUIColor.value);
  }
  const run=spawnSync(join(install,'jre/bin','java.exe'),['-noverify','-Djava.awt.headless=true','-Dlog4j.defaultInitOverride=true','-Dfile.encoding=UTF-8',`-Dorg.lwjgl.librarypath=${join(core,'native/windows')}`,'-cp',[dir,jars].join(delimiter),'FactionColorProbe',settingsPath],
    {input:cases.map(c=>c.input).join('\n')+'\n',encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,cwd:dir});
  assert.equal(run.status,0,run.stderr || run.error?.message);
  const outputs=new Map(run.stdout.trim().split(/\r?\n/).map(line=>{ const [id,value]=line.split('|'); return [id,value.split(',').map(Number)]; }));
  assert.equal(outputs.size,cases.length+1);
  assert.deepEqual(outputs.get('constant'),data.defaults.brightUIColorTarget.rgba);
  assert.deepEqual(outputs.get('player'),[181,230,255,255]);
  for(const c of cases) assert.deepEqual(outputs.get(c.id),c.expected,c.id);
  t.diagnostic(`Native constant ${outputs.get('constant')}; ${cases.length} exact RGBA vectors (21 factions + 65,536 channel pairs), audited jars, no game startup/Display calls; Java IO guarded`);
});
