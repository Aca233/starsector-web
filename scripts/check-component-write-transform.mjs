import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
import {build} from 'esbuild';
import * as mutation from '../src/network/ComponentMutation.mjs';
import {
  transformComponentWrites, componentWriteVitePlugin, componentWriteEsbuildPlugin,
} from './component-write-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'src/engine/__component_write_semantics__.ts');

async function execute(source, instrument) {
  const events = [];
  const listeners = [];
  const versions = {};
  const code = instrument ? transformComponentWrites(source, fixture) ?? source : source;
  const output = ts.transpileModule(code, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    reportDiagnostics: true,
  });
  assert.deepEqual(output.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const exports = {};
  const context = vm.createContext({
    exports,
    require(specifier) {
      assert.match(specifier, /ComponentMutation\.mjs$/);
      return mutation;
    },
    track(name, value) {
      const record = mutation.componentMutationVersion(value);
      const listener = {changed(key) { events.push([name, key === undefined ? null : String(key)]); }};
      listeners.push(listener); // Runtime intentionally holds WeakRefs, not strong listeners.
      mutation.observeComponentWrites(value, listener);
      versions[name] = record;
      return value;
    },
  });
  vm.runInContext(output.outputText, context, {filename: 'component-write-semantics.cjs', timeout: 5000});
  const result = await exports.run();
  return {
    result: JSON.stringify(result), events,
    versions: Object.fromEntries(Object.entries(versions).map(([name, record]) => [name, record.version])),
  };
}

async function equivalent(body, expectedVersions, options = {}) {
  const source = `${options.prelude ?? ''}\nexport ${options.async ? 'async ' : ''}function run() {\n${body}\n}`;
  const before = await execute(source, false);
  const after = await execute(source, true);
  assert.equal(after.result, before.result, 'return values, state, receiver identity and side-effect trace must match');
  if (expectedVersions) assert.deepEqual(after.versions, expectedVersions, 'each target must be marked exactly as expected');
  if (options.events) assert.deepEqual(after.events, options.events);
  return after;
}

test('assignment, all compound operators and pre/post increments preserve values and one evaluation', async () => {
  await equivalent(`
    const log = [];
    let value = 8;
    const box = track('box', {
      get x() { log.push('get'); return value; },
      set x(v) { log.push(['set', this === box, v]); value = v; },
    });
    const receiver = () => { log.push('receiver'); return box; };
    const key = () => { log.push('key'); return {toString() { log.push('coerce'); return 'x'; }}; };
    const rhs = () => { log.push('rhs'); return 2; };
    const results = [
      receiver()[key()] = rhs(), receiver()[key()] += rhs(), receiver()[key()] -= rhs(),
      receiver()[key()] *= rhs(), receiver()[key()] /= rhs(), receiver()[key()] %= rhs(),
      receiver()[key()] **= rhs(), receiver()[key()] <<= rhs(), receiver()[key()] >>= rhs(),
      receiver()[key()] >>>= rhs(), receiver()[key()] &= rhs(), receiver()[key()] |= rhs(),
      receiver()[key()] ^= rhs(), receiver()[key()]++, ++receiver()[key()],
      receiver()[key()]--, --receiver()[key()],
    ];
    return {results, value, log};
  `, {box: 17});
});

test('logical assignments short-circuit RHS and setter but may conservatively mark', async () => {
  await equivalent(`
    const log = [];
    let value = 0;
    const box = track('box', {
      get x() { log.push('get'); return value; },
      set x(v) { log.push(['set', v]); value = v; },
    });
    const rhs = () => { log.push('rhs'); return 4; };
    const values = [box.x &&= rhs(), box.x ||= rhs(), box.x ??= rhs(), box.x &&= rhs(), box.x ||= rhs()];
    value = null;
    values.push(box.x ??= rhs());
    return {values, value, log};
  `, {box: 6}, {events: Array.from({length: 6}, () => ['box', 'x'])});
});

test('BigInt and Symbol computed keys retain native operator semantics', async () => {
  await equivalent(`
    const symbol = Symbol('slot');
    const box = track('box', {[symbol]: 3n});
    const old = box[symbol]++;
    const now = ++box[symbol];
    return [String(old), String(now), String(box[symbol] *= 4n)];
  `, {box: 3});
});

test('delete keeps result, Proxy traps and evaluation order; failed writes do not become successful', async () => {
  await equivalent(`
    const log = [];
    const plain = {x: 1};
    Object.defineProperty(plain, 'fixed', {value: 2});
    const proxy = track('proxy', new Proxy(plain, {
      deleteProperty(target, key) { log.push(['delete', key]); return Reflect.deleteProperty(target, key); },
      set(target, key, value, receiver) { log.push(['set', key, receiver === proxy]); return false; },
    }));
    const results = [delete proxy.x, delete proxy['missing']];
    for (const action of [() => delete proxy.fixed, () => proxy.x = 3, () => proxy.x++]) {
      try { results.push(action()); } catch (error) { results.push(error.name); }
    }
    return {results, log, keys: Reflect.ownKeys(plain)};
  `, {proxy: 5});
});

test('nested destructuring, elisions, rest and defaults visit each lvalue exactly once', async () => {
  await equivalent(`
    const box = track('box', {});
    const log = [];
    const fallback = () => { log.push('default'); return 9; };
    const key = () => { log.push('pattern key'); return 'row'; };
    const input = {row: [undefined, 2, 3, 4], inner: {value: undefined}, keep: 8};
    const identity = ({[key()]: [box.x = fallback(), , ...box.tail],
      inner: {value: box.y = fallback()}, ...box.rest} = input) === input;
    const row = [undefined, 2];
    const arrayIdentity = ([box.z = (box.side = 10), ...box.more] = row) === row;
    let local;
    ({local = (box.short = 12)} = {});
    return {box, log, identity, arrayIdentity, local};
  `, {box: 8});
});

test('destructuring accessor targets, conditional defaults and abrupt iterator closing are unchanged', async () => {
  await equivalent(`
    const log = [];
    const box = track('box', {
      set x(v) { log.push(['set x', v, this === box]); },
      set fail(v) { log.push(['set fail', v]); throw new RangeError('stop'); },
    });
    const values = {
      [Symbol.iterator]() {
        log.push('iterator');
        let count = 0;
        return {
          next() { log.push('next'); return {value: ++count, done: false}; },
          return() { log.push('close'); return {done: true}; },
        };
      },
    };
    const receiver = () => { log.push('receiver'); return box; };
    try { [receiver().x = (log.push('unexpected default'), 7), receiver().fail] = values; }
    catch (error) { log.push(error.name); }
    return log;
  `, {box: 2});
});

test('for-of/in assignments, nested/default/rest targets, continue/break and declarations', async () => {
  await equivalent(`
    const box = track('box', {});
    const log = [];
    for (box.x of [1, 2]) log.push(box.x);
    for (box.key in {a: 1, b: 2}) log.push(box.key);
    for ([box.first = 7, ...box.rest] of [[undefined, 3, 4], [5]]) log.push([box.first, box.rest]);
    for ({value: box.value = 8, ...box.other} of [{extra: 2}]) log.push([box.value, box.other]);
    for (const [local = (box.defaulted = 10)] of [[undefined]]) log.push(local);
    outer: for (box.i of [1, 2, 3]) { if (box.i === 1) continue outer; break outer; }
    return {box, log};
  `, {box: 13});
});

test('for-await-of, await and yield stay in their original execution contexts', async () => {
  await equivalent(`
    const box = track('box', {});
    const log = [];
    async function* stream() { yield [undefined, 2]; yield [4]; }
    for await ([box.x = await Promise.resolve(3), ...box.tail] of stream()) log.push([box.x, box.tail]);
    const result = box.x += await Promise.resolve(2);
    function* update() { return box.x += yield 'ready'; }
    const iterator = update();
    return {log, result, first: iterator.next(), last: iterator.next(5), x: box.x};
  `, {box: 6}, {async: true});
});

test('Object/Reflect dot, literal-computed and parenthesized calls retain identity and returns', async () => {
  await equivalent(`
    const target = track('target', {});
    const proto = {inherited: 9};
    const log = [];
    const source = {get x() { log.push('get source'); return 1; }};
    const values = [
      Object.assign(target, source) === target,
      Object['defineProperty'](target, 'y', {value: 2, configurable: true}) === target,
      (Object.defineProperties)(target, {z: {value: 3, configurable: true}}) === target,
      Reflect['set'](target, 'x', 4), Reflect.deleteProperty(target, 'y'),
      Reflect.defineProperty(target, 'r', {value: 5}),
      Object.setPrototypeOf(target, proto) === target, Reflect.setPrototypeOf(target, proto),
      Object.preventExtensions(target) === target, Reflect.preventExtensions(target),
      Object.seal(target) === target, Object.freeze(target) === target,
    ];
    return {values, log, x: target.x, r: target.r, frozen: Object.isFrozen(target), proto: Object.getPrototypeOf(target) === proto};
  `, {target: 12});
});

test('Reflect.set marks both target and a distinct explicit receiver', async () => {
  await equivalent(`
    const target = track('target', {x: 1});
    const receiver = track('receiver', {});
    const assigned = Reflect.set(target, 'x', 8, receiver);
    const repeated = Reflect.set(target, 'x', 9, receiver);
    return {assigned, repeated, target, receiver};
  `, {target: 2, receiver: 2});
});

test('Object/Reflect spread operands keep their iterator protocol; hidden targets remain a documented boundary', async () => {
  await equivalent(`
    const box = track('box', {});
    const receiver = track('receiver', {});
    const log = [];
    function spread(values) {
      return {
        [Symbol.iterator]() {
          log.push('iterator');
          let index = 0;
          return {next() { log.push('next'); return index < values.length
            ? {value: values[index++], done: false} : {done: true}; }};
        },
      };
    }
    const results = [
      Object.assign(...spread([box, {a: 1}, {b: 2}])) === box,
      Object.assign(box, ...spread([{c: 3}])) === box,
      Reflect.set(...spread([box, 'x', 4, receiver])),
      Reflect.set(box, ...spread(['y', 5, receiver])),
      Reflect.set(box, 'z', 6, receiver, ...spread([])),
    ];
    return {box, receiver, results, log};
  `, {box: 3, receiver: 1});
});

test('mutating method lookups and calls retain this, identity, getters and argument evaluation', async () => {
  await equivalent(`
    const log = [];
    const array = track('array', [3, 1, 2]);
    const map = track('map', new Map());
    const set = track('set', new Set());
    const custom = track('custom', {
      get push() {
        log.push('lookup');
        return function(...args) { log.push([this === custom, ...args]); return this; };
      },
    });
    const argument = () => { log.push('argument'); return 7; };
    const values = [
      array.push(4), array.pop(), array.shift(), array.unshift(9), array.splice(1, 1, 8),
      array.sort() === array, array.reverse() === array, array.fill(5, 1) === array,
      array.copyWithin(0, 1) === array, array['push'](6), (array.push)(7),
      map.set('x', 1) === map, map.delete('x'), map.clear(),
      set.add(2) === set, set.delete(2), set.clear(),
      custom.push(argument()) === custom,
    ];
    return {array, values, log, map: [...map], set: [...set]};
  `, {array: 11, map: 3, set: 3, custom: 1});
});

test('borrowed known mutators via call/apply retain their explicit thisArg', async () => {
  await equivalent(`
    const box = track('box', []);
    const a = Array.prototype.push.call(box, 1, 2);
    const b = Array.prototype['push'].apply(box, [3, 4]);
    return {box, a, b};
  `, {box: 2});
});

test('typed arrays, DataView and Date setters preserve native internal-slot receivers', async () => {
  await equivalent(`
    const typed = track('typed', new Uint8Array([1, 2, 3]));
    const view = track('view', new DataView(new ArrayBuffer(8)));
    const date = track('date', new Date(0));
    const values = [typed.set([9], 1), typed.fill(4, 2) === typed, typed.reverse() === typed,
      view.setInt16(0, 100, true), date.setUTCFullYear(2020), date.setTime(1000)];
    return {values, typed: [...typed], view: view.getInt16(0, true), date: date.getTime()};
  `, {typed: 3, view: 1, date: 2});
});

test('simple optional calls/delete preserve short circuit and non-callable failures', async () => {
  await equivalent(`
    const box = track('box', {push(value) { return [this === box, value]; }, x: 1});
    const absent = null;
    const log = [];
    const arg = () => { log.push('arg'); return 2; };
    const results = [absent?.push(arg()), box?.push(arg()), box.push?.(arg()),
      absent?.['push'](arg()), delete absent?.x, delete box?.x];
    box.push = 1;
    try { box?.push(arg()); } catch (error) { results.push(error.name); }
    return {results, log};
  `, {box: 5});
});

test('continuous optional chains are not broken or made more permissive', async () => {
  await equivalent(`
    const child = track('child', {push(value) { return [this === child, value]; }, x: 1});
    const log = [];
    const results = [];
    for (const root of [null, {child: null}, {child}]) {
      for (const action of [() => root?.child.push(log.push('arg')),
        () => root?.child?.push(log.push('optional arg')),
        () => root?.child!.push(log.push('asserted arg')),
        () => delete root?.child.x]) {
        try { results.push(action()); } catch (error) { results.push(error.name); }
      }
    }
    (child?.push)(5);
    return {results, log, x: child.x};
  `, {child: 1});
});

test('super writes/mutating calls and private fields keep their actual receiver', async () => {
  await equivalent(`
    const log = [];
    class Base {
      get value() { log.push(['get', this instanceof Child]); return 3; }
      set value(v) { log.push(['set', this instanceof Child, v]); }
      push(v) { log.push(['push', this instanceof Child, v]); return this; }
    }
    class Child extends Base {
      #value = 1;
      change() {
        const values = [super.value = 4, super['value'] += 2, super.value++, this.#value++, ++this.#value];
        [super.value] = [8];
        values.push(super.push(9) === this, this.#value);
        return values;
      }
    }
    const child = track('child', new Child());
    return {values: child.change(), log};
  `, {child: 7});
});

test('TypeScript asserted/non-null lvalues are marked after transparent wrappers', async () => {
  await equivalent(`
    const box = track('box', {x: 1});
    (box.x as number) = 2;
    box.x! += 3;
    (<number>box.x)++;
    const same = (box as {push?: unknown});
    return {x: box.x, same: same === box};
  `, {box: 3});
});

test('injected bindings cannot collide with top-level names or nested parameters', async () => {
  await equivalent(`
    const box = track('box', {});
    function write(__replicationWrite, __replicationWrite_1, __enableComponentMutations_1) {
      box.x = __replicationWrite + __replicationWrite_1 + __enableComponentMutations_1;
    }
    write(2, 3, 4);
    return [box.x, __enableComponentMutations];
  `, {box: 1}, {prelude: 'const __enableComponentMutations = 12;'});
});

test('hashbang, directive prologue, comments and JSX survive printing', () => {
  const code = '#!/usr/bin/env node\n"use client";\n// keep me\nconst view = <button onClick={() => { box.x++; }}>Go</button>;';
  const result = transformComponentWrites(code, fixture.replace(/\.ts$/, '.tsx'));
  assert.ok(result.startsWith('#!/usr/bin/env node\n"use client";'));
  assert.match(result, /\/\/ keep me/);
  assert.match(result, /<button/);
  const parsed = ts.createSourceFile('fixture.tsx', result, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics, []);
});

test('file eligibility excludes declarations, runtime/journal/replication and unrelated roots', () => {
  for (const relative of [
    'src/engine/types.d.ts', 'src/engine/types.d.mts', 'src/engine/types.d.cts',
    'src/network/ComponentMutation.mts', 'src/network/ComponentReplication.ts',
    'src/network/MutationJournal.ts', 'src/network/ComponentWireMetadata.ts',
    'src/campaign/Other.ts', 'scripts/plain.ts', 'node_modules/other.ts', '../outside.ts',
  ]) assert.equal(transformComponentWrites('box.x++;', path.join(root, relative)), null, relative);
  for (const relative of ['src/engine/sample.ts', 'src/ui/sample.tsx', 'src/network/sample.cts', 'scripts/sample.mts']) {
    assert.match(transformComponentWrites('box.x++;', path.join(root, relative)), /markComponentWrite/, relative);
  }
  assert.equal(transformComponentWrites('const read = box.x;', fixture), null);
});

test('Vite query IDs and esbuild loader registration remain compatible', async () => {
  const plugin = componentWriteVitePlugin();
  assert.equal(plugin.enforce, 'pre');
  const output = plugin.transform('box.x++;', fixture + '?v=123');
  assert.match(output.code, /markComponentWrite/);
  assert.equal(output.map, null);
  let load;
  componentWriteEsbuildPlugin().setup({onLoad(options, callback) {
    assert.ok(options.filter.test(fixture));
    load = callback;
  }});
  assert.equal(await load({path: path.join(root, 'src/engine/types.d.mts')}), null);
  // Bundle transformed TS in memory: no fixture files, native tests or build artifacts.
  const source = 'export function run() { const box = {value: 1}; const before = box.value++; return [before, box.value]; }';
  const bundled = await build({
    stdin: {contents: transformComponentWrites(source, fixture), resolveDir: path.dirname(fixture), loader: 'ts'},
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  assert.deepEqual(module.run(), [1, 2]);
});

test('dynamic function/member aliases remain explicitly outside static coverage', async () => {
  const code = `
    export function run() {
      const box = track('box', []);
      const push = box.push.bind(box);
      const method = 'push';
      push(1);
      box[method](2);
      const assign = Object.assign;
      assign(box, {label: 'ok'});
      return {array: [...box], label: box.label};
    }
  `;
  assert.equal(transformComponentWrites(code, fixture), null);
  const before = await execute(code, false);
  const after = await execute(code, true);
  assert.equal(after.result, before.result);
  assert.deepEqual(after.versions, {box: 0});
});
