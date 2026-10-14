import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {dependencyGraph, dependencyViolations, violationKey} from './lib/dependency-graph.mjs';
import {checkCatalog, selectChecks} from './lib/check-catalog.mjs';
import {encodeReplayFile, decodeReplayFile} from './lib/replay-file.mjs';

test('type imports do not create runtime cycles; a new reverse import is detected with its source line', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-dependencies-'));
  try {
    fs.mkdirSync(path.join(directory, 'src/shared'), {recursive: true});
    fs.mkdirSync(path.join(directory, 'src/engine/contracts'), {recursive: true});
    fs.writeFileSync(path.join(directory, 'src/shared/a.ts'), "import type {B} from '../engine/contracts/b';\nexport type A = B;\n");
    fs.writeFileSync(path.join(directory, 'src/engine/contracts/b.ts'), "import type {A} from '../../shared/a';\nexport type B = {x: number};\n");
    const typed = dependencyViolations(dependencyGraph(directory));
    assert.equal(typed.length, 1); assert.equal(typed[0].rule, 'shared-independent'); assert.equal(typed[0].kind, 'type'); assert.equal(typed[0].line, 1);
    const accepted = new Set(typed.map(violationKey));
    fs.writeFileSync(path.join(directory, 'src/shared/a.ts'), "import {b} from '../engine/contracts/b';\nexport const a = b;\n");
    fs.writeFileSync(path.join(directory, 'src/engine/contracts/b.ts'), "import {a} from '../../shared/a';\nexport const b = 1;\n");
    const runtime = dependencyViolations(dependencyGraph(directory));
    assert.equal(runtime.filter(edge => edge.rule === 'runtime-cycle').length, 2);
    assert.ok(runtime.filter(edge => !accepted.has(violationKey(edge))).length > 0);
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
test('affected plan inventories real wrappers and retains relevant save and authority checks', () => {
  const catalog = checkCatalog(process.cwd());
  assert.ok(catalog.length > 350);
  const save = selectChecks(catalog, ['src/engine/game/GameStateCodec.ts']);
  for (const id of ['architecture', 'foundation-types', 'save-migrations', 'game-save']) assert.ok(save.checks.some(check => check.id === id), id);
  const authority = selectChecks(catalog, ['src/network/host.worker.ts']);
  for (const id of ['network-authority', 'network-io', 'network-launch']) assert.ok(authority.checks.some(check => check.id === id), id);
  assert.ok(catalog.filter(check => check.file?.endsWith('.mts')).every(check => !check.runnable));
  assert.ok(!catalog.find(check => check.id === 'steam-sockets-native-session').runnable, 'exported native helper is not a standalone test');
  for (const [id, domain] of [['lan-socket-close', 'network'], ['steam-transport', 'network'], ['refit-hullmod-layout', 'ui'], ['gloriana', 'content'], ['combat-ai', 'combat']])
    assert.equal(catalog.find(check => check.id === id)?.domain, domain, id + ' owner');
  assert.ok(catalog.filter(check => check.file?.startsWith('scripts/lib/')).every(check => !check.runnable));
  assert.equal(catalog.find(check => check.id === 'render-spear-of-adun-modules')?.environment, 'python-manual');
  assert.ok(catalog.filter(check => check.file?.endsWith('.py')).every(check => !check.runnable && check.environment === 'python-manual'));
  assert.ok(authority.checks.some(check => check.id === 'lan-owned-aim-queries'), 'dynamic LAN harness belongs to network, not foundation');
  const system = selectChecks(catalog, ['src/engine/extensions/ship-systems/Registry.ts']);
  assert.ok(system.checks.some(check => check.id === 'ship-packs'));
  assert.ok(!system.checks.some(check => check.id === 'foundation-tools'), 'content change does not select unrelated tooling self-tests');
  assert.ok(!selectChecks(catalog, ['package.json']).checks.some(check => check.id === 'release-scope'), 'release-only checkout gate stays with release workflow');
  assert.ok(selectChecks(catalog, ['package.json']).conservative.length);
  assert.equal(selectChecks(catalog, ['docs/foundation-development-roadmap-2026-10-08.md', 'docs/campaign.md']).checks.length, 0, 'documentation-only changes do not trigger runtime checks');
});
test('check selection rejects mixed or misspelled selectors before running any checks', () => {
  for (const args of [['--catalog', '--run'], ['--check', 'architecture', '--file', 'src/main.tsx'], ['--rn']]) {
    const result = spawnSync(process.execPath, ['scripts/check-affected.mjs', ...args], {encoding: 'utf8', windowsHide: true});
    assert.notEqual(result.status, 0); assert.match(result.stderr, /inventory only|cannot be combined|Unknown option/);
  }
});
test('development replay export preserves fingerprint values through JSON and rejects duplicate properties', () => {
  const source = {a: undefined, b: [Infinity, -Infinity, NaN, -0, null], c: {x: 1}};
  const restored = decodeReplayFile(JSON.parse(JSON.stringify(encodeReplayFile(source))));
  assert.deepEqual(restored, source); assert.ok(Object.hasOwn(restored, 'a')); assert.ok(Object.is(restored.b[3], -0));
  assert.throws(() => decodeReplayFile({format: 'foundry-development-replay', version: 1,
    checkpoint: ['object', [['x', ['scalar', null]], ['x', ['undefined']]]]}), /duplicate/);
  const cycle = {}; cycle.self = cycle; assert.throws(() => encodeReplayFile(cycle), /acyclic/);
});
