/** Narrow cargo display-sort regression; no live campaign or server state is modified. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { sortCommodityCargo } from '../src/campaign/client/CargoSort.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Match the existing campaign probes: normal checkout tests never need installed assets or Java.
// Opting in intentionally fails on missing tools/files or source drift instead of silently skipping.
const nativeProbe = { skip: process.argv.includes('--native') ? false : 'optional native probe; run with --native' };
const core = resolve(process.env.CARGO_SORT_CORE ?? resolve(project, '../starsector-core'));
const decompiled = resolve(process.env.CARGO_SORT_DECOMPILED ?? resolve(project, '../decompiled'));
const reference = JSON.parse(readFileSync(join(project, 'src/campaign/data/reference-market.json'), 'utf8'));
const read = relative => readFileSync(join(project, relative), 'utf8');
const row = (id, quantity = 1) => ({ id, quantity, commodity: reference.commodities[id] });
const ids = stacks => stacks.map(stack => stack.id);
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', timeout: 30000, ...options });
const succeeded = result => assert.equal(result.status, 0, result.error?.message ?? result.stderr);
function temporary(t) {
  const root = realpathSync(tmpdir()), directory = mkdtempSync(join(root, 'campaign-cargo-sort-'));
  t.after(() => {
    const target = realpathSync(directory);
    // Only this test's freshly created temporary directory may be removed recursively.
    assert.equal(dirname(target), root);
    assert.ok(basename(target).startsWith('campaign-cargo-sort-'));
    rmSync(target, { recursive: true });
  });
  return directory;
}
function nativeSource(relative) {
  const text = readFileSync(join(decompiled, relative), 'utf8');
  assert.equal(createHash('sha256').update(text).digest('hex'), reference.provenance.sources[relative].sha256);
  return text;
}

test('checked-in reference order is explicit float32 metadata, not catalogue position', () => {
  assert.equal(Object.keys(reference.commodities).length, 33);
  for (const [id, order] of Object.entries({ supplies: 0.5, fuel: 0.75, crew: 0.8, marines: 0.9,
    heavy_machinery: 0.95, luxury_goods: 1, lobster: 1.1, food: 13, alpha_core: 40, beta_core: 39, gamma_core: 38 })) {
    assert.equal(reference.commodities[id].order, Math.fround(order), id);
  }
  const input = Object.keys(reference.commodities).map(id => row(id));
  assert.deepEqual(ids(sortCommodityCargo(input)), ['supplies', 'fuel', 'crew', 'marines', 'heavy_machinery',
    'luxury_goods', 'lobster', 'hand_weapons', 'drugs', 'organs', 'domestic_goods', 'rare_metals', 'metals',
    'rare_ore', 'ore', 'ships', 'volatiles', 'organics', 'food', 'ai_cores', 'ship_weapons', 'gamma_core',
    'beta_core', 'alpha_core', 'omega_core', 'survey_data_1', 'survey_data_2', 'survey_data_3', 'survey_data_4',
    'survey_data_5', 'survey_data', 'blueprints', 'credits']);
  assert.notDeepEqual(ids(sortCommodityCargo(input)), ids(input));
});

test('stable ties and unknown metadata never acquire name, quantity, ID or CSV tie breakers', () => {
  const unknown = [row('z-unknown', 0.5), row('a-unknown', 400),
    { id: 'missing', quantity: 3, commodity: {} }, { id: 'invalid', quantity: 7, commodity: { order: NaN } },
    { id: 'infinite', quantity: 8, commodity: { order: Infinity } }];
  const input = [unknown[0], row('ships', 0.125), unknown[1], row('ore', 900), row('food', 5000),
    row('heavy_machinery', 2), ...unknown.slice(2), row('supplies', 1)];
  assert.deepEqual(ids(sortCommodityCargo(input)), ['supplies', 'heavy_machinery', 'ships', 'ore', 'food', ...ids(unknown)]);
  assert.deepEqual(sortCommodityCargo(unknown), unknown);
  const equal = [{ id: 'z', quantity: 1, commodity: { order: 2, name: '乙' } },
    { id: 'a', quantity: 999, commodity: { order: 2, name: '甲' } }];
  assert.deepEqual(sortCommodityCargo(equal), equal);
});

test('Float.compareTo signed-zero order is -0 before +0, stable within each sign', () => {
  const input = Object.freeze([
    ['positive-first', +0], ['negative-first', -0], ['positive-second', +0], ['negative-second', -0],
    ['below', -1], ['above', 1],
  ].map(([id, order], index) => Object.freeze({ id, quantity: index + 1, commodity: Object.freeze({ order }) })));
  const expected = ['below', 'negative-first', 'negative-second', 'positive-first', 'positive-second', 'above'];
  assert.deepEqual(ids(sortCommodityCargo(input)), expected);
  assert.deepEqual(ids(sortCommodityCargo(sortCommodityCargo(input))), expected);
  assert.ok(Object.is(input[0].commodity.order, +0));
  assert.ok(Object.is(input[1].commodity.order, -0));
  // Native compares size first for the same commodity ID, regardless of the order field.
  const sameId = [{ id: 'same', quantity: 2, commodity: { order: +0 } }, { id: 'same', quantity: 1, commodity: { order: -0 } }];
  assert.deepEqual(sortCommodityCargo(sameId), sameId);
});

test('sort returns a new array, preserves frozen rows/quantities and is idempotent', () => {
  const cargo = Object.freeze({ food: 9876.54321, fuel: 0.125, heavy_machinery: 5, 'mod:unknown': 3 });
  const before = JSON.stringify(cargo);
  const stacks = Object.freeze(Object.entries(cargo).map(([id, quantity]) => Object.freeze(row(id, quantity))));
  const sorted = sortCommodityCargo(stacks);
  assert.notEqual(sorted, stacks);
  for (const item of sorted) assert.equal(item, stacks.find(stack => stack.id === item.id));
  assert.equal(JSON.stringify(cargo), before);
  assert.deepEqual(sortCommodityCargo(sorted), sorted);
  assert.deepEqual(sortCommodityCargo([]), []);
  assert.deepEqual(sortCommodityCargo([stacks[0]]), [stacks[0]]);
  const split = [row('fuel', 1), row('fuel', 50), row('fuel', 0.25)];
  assert.deepEqual(sortCommodityCargo(split).map(stack => stack.quantity), [50, 1, 0.25]);
  assert.equal(sortCommodityCargo(split).length, 3, 'no native stack consolidation in a display helper');
});

test('CargoPanel uses independent, non-cycling native sorts for both containers', () => {
  const panel = read('src/campaign/client/CargoPanel.tsx');
  assert.doesNotMatch(panel, /nextSort|sortLabels|sourceOrder|Intl\.Collator|type Sort\b/);
  assert.match(panel, /sortCargoTransfer\(current\.current, side, commodities\)/);
  assert.match(panel, /onClick=\{\(\) => sort\('hold'\)\}/);
  assert.match(panel, /onClick=\{\(\) => sort\('discard'\)\}/);
  assert.doesNotMatch(panel, /setSortApplied|nextSort/);
  assert.match(panel, /title="按原版商品 order 排序" aria-label="排序持有货物"/);
  assert.match(panel, /visibleCount < 2/);
  assert.match(panel, /draftRows.length < 2/);
  assert.match(panel, /cargoTransferItems\(state\)/);
  assert.match(panel, /onJettison\(items\)/);
});

test('real importer --check reproduces the reference, including native order and provenance', nativeProbe, () => {
  succeeded(run(process.execPath, [join(project, 'scripts/import-campaign-market-reference.mjs'), core, decompiled, '--check']));
  nativeSource('starfarer_obf/com/fs/starfarer/campaign/fleet/CargoData.java');
  const loader = nativeSource('starfarer_obf/com/fs/starfarer/loading/SpecStore.java');
  assert.match(loader, /setOrder\(\(float\)jSONObject.getDouble\("order"\)\)/);
});

test('self-contained fixture importer ignores row position and rejects invalid float32 order', t => {
  const directory = temporary(t), script = join(directory, 'scripts/import-campaign-market-reference.mjs');
  const sourceRoot = join(directory, 'core'), fixtureSources = join(directory, 'decompiled');
  const csvPath = join(sourceRoot, 'data/campaign/commodities.csv');
  const output = join(directory, 'src/campaign/data/reference-market.json');
  for (const target of [dirname(script), dirname(csvPath), join(sourceRoot, 'data/config'), dirname(output)]) mkdirSync(target, { recursive: true });
  writeFileSync(script, read('scripts/import-campaign-market-reference.mjs'));
  // Synthetic parser fixtures, NOT copied native sources and NOT a native-behavior oracle.
  writeFileSync(join(sourceRoot, 'data/config/settings.json'), JSON.stringify(reference.settings, null, 2));
  const fixtureBodies = {
    loader: ['optDouble("utility", 1.0)', 'optDouble("econUnit", 500.0)', 'optDouble("cargo space", 0.0)',
      'PriceVariability.V4', '"data/campaign/commodities.csv"', 'setOrder((float)jSONObject.getDouble("order"))', 'setStackSize'].join('\n'),
    clock: 'SECONDS_PER_GAME_DAY = 10.0f;',
    baseSubmarket: 'TRADE_IMPACT_DAYS = 10.0f;',
    variability: Array.from({ length: 11 }, (_, i) => 'V' + i + '(1.0f)').join('\n'),
    industry: 'getCommodityEconUnitMult(float size) { if (size <= 0.0f) { return 0.0f; } return 1.0f;',
  };
  for (const [relative, { scope }] of Object.entries(reference.provenance.sources)) {
    if (!relative.startsWith('starfarer')) continue;
    const destination = join(fixtureSources, relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, '// SYNTHETIC IMPORTER TEST FIXTURE\n' + (fixtureBodies[scope] ?? '// Hash-only input'));
  }
  const header = 'name,id,demand class,base price,price variability,utility,econUnit,cargo space,order,tags,icon';
  const lines = [
    'Fixture supplies,supplies,supplies,100,3,1,750,1,0.5,military,supplies.png',
    'Fixture food,food,food,20,3,1,2000,1,13,food,food.png',
    'Fixture machinery,heavy_machinery,heavy_machinery,150,3,1,300,1,0.95,,machinery.png',
  ];
  const csv = [header, ...lines, ''].join('\n');
  writeFileSync(csvPath, csv);
  const invoke = (...args) => run(process.execPath, [script, sourceRoot, fixtureSources, ...args]);
  succeeded(invoke());
  const imported = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(imported.commodities.supplies.order, 0.5);
  assert.equal(imported.commodities.heavy_machinery.order, Math.fround(0.95));
  assert.equal(imported.commodities.food.order, 13);
  writeFileSync(csvPath, [header, ...lines.toReversed(), ''].join('\n'));
  succeeded(invoke());
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')).commodities, imported.commodities, 'row order must not change metadata');
  succeeded(invoke('--check'));
  // Modify only the supplies order cell, without relying on the importer CSV parser.
  const withOrder = order => csv.replace(',0.5,military,', ',' + order + ',military,');
  for (const value of ['0', '-2.25']) {
    writeFileSync(csvPath, withOrder(value));
    succeeded(invoke());
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).commodities.supplies.order, Number(value));
  }
  const lastGood = readFileSync(output, 'utf8');
  for (const value of ['', 'n/a', 'NaN', 'Infinity', '1e100', '-1e100']) {
    writeFileSync(csvPath, withOrder(value));
    const result = invoke();
    assert.notEqual(result.status, 0, value);
    assert.match(result.stderr, /Invalid or missing supplies\/order/);
    assert.equal(readFileSync(output, 'utf8'), lastGood, 'bad data must not overwrite the reference');
  }
});

test('Java native CargoData oracle agrees on 64 permutations plus signed-zero boundaries', nativeProbe, t => {
  const directory = temporary(t);
  const source = nativeSource('starfarer_obf/com/fs/starfarer/campaign/fleet/CargoData.java');
  const block = source.match(/case 1: \{([\s\S]*?)\n\s*}\n\s*case 3:/)?.[1];
  assert.ok(block, 'native resource branch not found');
  // Only rename the obfuscated spec type; preserve the actual comparison statements.
  const type = block.match(/\s+(\w+) \w+ = cargoItemStack\.getResourceIfResource\(\);/)?.[1];
  assert.ok(type);
  const java = `import java.util.*;
public class CargoSortOracle {
 static class Spec { String id; float order; Spec(String i,float o){id=i;order=o;} String getId(){return id;} float getOrder(){return order;} }
 static class Stack { String key; Spec spec; float size; Stack(String line){String[] p=line.split(",");key=p[0];spec=new Spec(p[1],Float.parseFloat(p[2]));size=Float.parseFloat(p[3]);} Spec getResourceIfResource(){return spec;} float getSize(){return size;} }
 static int compare(Stack cargoItemStack, Stack cargoItemStack2) {${block.replaceAll(type, 'Spec')} }
 public static void main(String[] args){Scanner in=new Scanner(System.in);while(in.hasNextLine()){int count=Integer.parseInt(in.nextLine());List<Stack> rows=new ArrayList<>();for(int i=0;i<count;i++)rows.add(new Stack(in.nextLine()));Collections.sort(rows,CargoSortOracle::compare);System.out.println(String.join(",",rows.stream().map(s->s.key).toList()));}}
}`;
  writeFileSync(join(directory, 'CargoSortOracle.java'), java);
  succeeded(run(process.env.CARGO_SORT_JAVAC ?? 'javac', ['-encoding', 'UTF-8', '-d', directory, join(directory, 'CargoSortOracle.java')]));
  const all = Object.keys(reference.commodities);
  const vectors = Array.from({ length: 64 }, (_, i) => {
    const items = [...all.slice(i % all.length), ...all.slice(0, i % all.length)].map((id, j) => row(id, (j + 1) * 0.25));
    if (i % 2) items.reverse();
    items.splice(i % items.length, 0, row('fuel', 40), row('fuel', 0.125));
    return items.map((item, j) => ({ ...item, key: String(j) }));
  });
  for (const orders of [[+0, -0], [-0, +0], [+0, -0, +0, -0], [-1, +0, -0, 1]]) {
    vectors.push(orders.map((order, i) => ({ key: String(i), id: 'zero-boundary-' + i, quantity: i + 1, commodity: { order } })));
  }
  const input = vectors.map(items => [items.length, ...items.map(s => [s.key, s.id, Object.is(s.commodity.order, -0) ? '-0' : s.commodity.order, s.quantity].join(','))].join('\n')).join('\n') + '\n';
  const result = run(process.env.CARGO_SORT_JAVA ?? 'java', ['-cp', directory, 'CargoSortOracle'], { input });
  succeeded(result);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, vectors.length);
  vectors.forEach((items, i) => assert.equal(sortCommodityCargo(items).map(s => s.key).join(','), lines[i], 'permutation ' + i));
});
