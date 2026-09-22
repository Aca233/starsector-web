import crypto from 'node:crypto';
import assert from 'node:assert/strict';import {test} from 'node:test';import path from 'node:path';import {createLocalBattleBuildAudit} from './lib/local-battle-build-audit.mjs';
test('main and Worker audit accumulate separate graphs, query-backed modules and watched virtual inputs',()=>{const root=process.cwd(),audit=createLocalBattleBuildAudit(root);audit.plugin('main').generateBundle.call({getModuleIds:()=>[path.resolve('src/App.tsx'),path.resolve('src/network/host.worker.ts')+'?worker&url','\0virtual:ignored'],getWatchFiles:()=>[path.resolve('src/engine/data/generated/ships.json')]});audit.plugin('worker').generateBundle.call({getModuleIds:()=>[path.resolve('src/network/host.worker.ts'),path.resolve('src/network/AuthorityLocalCompletion.mjs')]});const r=audit.report();assert.equal(r.graphs.worker.length,2);assert.ok(r.sources.some(s=>s.file.endsWith('host.worker.ts')));assert.equal(r.sources.length,3);assert.equal(r.watchedSources.length,1);assert.ok(r.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)));});
test('campaign exclusion is enforced inside every Worker as well as main; no prefix lookalikes',()=>{for(const graph of ['main','worker'])for(const id of ['/src/campaign/main.ts','C:\\repo\\src\\campaign\\entry.ts?worker']){const audit=createLocalBattleBuildAudit(process.cwd());assert.throws(()=>audit.plugin(graph).generateBundle.call({getModuleIds:()=>[id]}),/Campaign module/);}const audit=createLocalBattleBuildAudit(process.cwd());assert.doesNotThrow(()=>audit.plugin('worker').generateBundle.call({getModuleIds:()=>['/src/campaign-safe-label.ts']}));assert.throws(()=>audit.plugin('unknown'));});

// Frozen loaders must not turn ?raw JSON into executable JavaScript or swallow
// Vite's worker/URL wrapper generation during production builds.
const {frozenBrowserPlugin}=await import('./lib/frozen-vite-sources.mjs');
const os=await import('node:os');
const auditFs=await import('node:fs');
test('frozen resource query semantics preserve raw strings and delegate URL/worker wrappers',()=>{
 const dir=auditFs.mkdtempSync(path.join(os.tmpdir(),'battle-frozen-query-')),file=path.join(dir,'source.json');
 const code='{"舰船":"test"}\n',source='src/example.json';
 try{
  auditFs.writeFileSync(file,JSON.stringify({files:[{file:source,code,sha256:crypto.createHash('sha256').update(code).digest('hex')}]}));
  const plugin=frozenBrowserPlugin(file),id=path.resolve(source);
  assert.equal(plugin.load(id),code);assert.equal(plugin.load(id+'?t=42'),code);
  assert.equal(plugin.load(id+'?raw'),'export default '+JSON.stringify(code)+';');
  for(const query of ['url','worker','worker&url','sharedworker&inline'])assert.equal(plugin.load(id+'?'+query),null);
  assert.equal(plugin.load(path.resolve('src/missing.ts')),null);
 }finally{auditFs.unlinkSync(file);auditFs.rmdirSync(dir);}
});
