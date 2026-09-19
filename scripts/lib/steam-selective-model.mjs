// Artifact-only instrumentation and aliases. Never modify the production graph.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const normalized = p => p.replaceAll('\\', '/');
function once(text, from, to) {
  assert.equal(text.split(from).length, 2, `model injection must match exactly once: ${from}`);
  return text.replace(from, to);
}
export async function buildSelectiveModel(dir, candidate) {
  const codec = normalized(path.resolve('server/steam/experimental/selective-state-codec.mjs'));
  const sender = normalized(path.resolve('server/steam/experimental/selective-anchored-sender.mjs'));
  const originalSender = normalized(path.resolve('server/steam/anchored-snapshots.mjs'));
  const label = candidate ? 'selective' : 'packed';
  const result = await build({ entryPoints: ['scripts/steam-sockets-link-model.mjs'], bundle: true, format: 'esm', platform: 'node', packages: 'external', write: false, metafile: true,
    plugins: [{ name: 'isolated-selective-state', setup(b) {
      if (candidate) {
        b.onResolve({ filter: /(?:^|\/)sockets-state-codec\.mjs$/ }, args => normalized(args.importer) === codec ? undefined : ({ path: 'codec', namespace: 'selective-model' }));
        b.onResolve({ filter: /(?:^|\/)anchored-snapshots\.mjs$/ }, args => normalized(args.importer) === sender || args.namespace === 'selective-model' ? undefined : ({ path: 'sender', namespace: 'selective-model' }));
        b.onLoad({ filter: /.*/, namespace: 'selective-model' }, args => ({ loader: 'js', resolveDir: process.cwd(), contents: args.path === 'codec'
          ? `export { SteamSelectiveStateCodec as SteamSocketStateCodec, unpackSelectiveState as unpackSocketState } from ${JSON.stringify(codec)};`
          : `export { SteamSelectiveAnchoredSender as SteamAnchoredSender } from ${JSON.stringify(sender)}; export { SteamAnchoredReceiver } from ${JSON.stringify(originalSender)};` }));
      }
      b.onLoad({ filter: /steam-sockets-link-model\.mjs$/ }, args => {
        let text = fs.readFileSync(args.path, 'utf8');
        text = once(text, 'roomFactory=options=>new SteamSocketRoom(options),stateHz=60', 'stateFactory=null,stateVerify=null,roomFactory=options=>new SteamSocketRoom(options),stateHz=60');
        text = once(text, 'seq++;const text=JSON.stringify(', 'seq++;const text=stateFactory?stateFactory(seq,now):JSON.stringify(');
        text = once(text, "if(m.type==='state'){totals[index].states.push", "if(m.type==='state'){stateVerify?.(m,index);totals[index].states.push");
        text = once(text, 'timeline,offeredStates:seq,steps,', 'formatStats:rooms.map(r=>r.codec.selectionDiagnostics?.()??null),timeline,offeredStates:seq,steps,');
        if (candidate) text += `\nexport { readSelectiveDecodes } from ${JSON.stringify(codec)};\n`;
        return { loader: 'js', contents: text, resolveDir: path.dirname(args.path) };
      });
    } }] });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some(p => p.endsWith('/sockets-state-codec.mjs')));
  assert.ok(inputs.some(p => p.endsWith('/anchored-snapshots.mjs')));
  assert.equal(inputs.some(p => p.endsWith('/experimental/selective-state-codec.mjs')), candidate);
  assert.equal(inputs.some(p => p.endsWith('/experimental/selective-anchored-sender.mjs')), candidate);
  const output = path.join(dir, `offline-${label}-model.mjs`);
  fs.writeFileSync(output, result.outputFiles[0].contents, { flag: 'wx' });
  fs.writeFileSync(path.join(dir, `${label}-bundle.json`), JSON.stringify({ inputs, sha256: createHash('sha256').update(result.outputFiles[0].contents).digest('hex') }, null, 2) + '\n', { flag: 'wx' });
  return import(pathToFileURL(output).href);
}
