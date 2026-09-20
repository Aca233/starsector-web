import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { networkSessionPath, resumeNetworkSessionPath, attachNetworkSessionDownloads, desktopProcessMetrics } from '../desktop/network-session.mjs';

test('each launch gets a distinct file; controlled Steam relaunch only accepts a generated basename', () => {
  const directory = path.resolve('artifacts/profile'), a = networkSessionPath(directory), b = networkSessionPath(directory);
  assert.notEqual(a,b); assert.equal(path.dirname(a),path.join(directory,'network-logs'));
  assert.equal(resumeNetworkSessionPath(directory,['--network-log-session='+path.basename(a)]),a);
  for(const name of ['../desktop.log',a,'../../network-session-2026-09-20T00-00-00.000Z-123.jsonl','file.jsonl',''])
    assert.equal(resumeNetworkSessionPath(directory,['--network-log-session='+name]),null);
});

test('whole-session export replaces only the own-window local diagnostics blob download', () => {
  const origin='http://127.0.0.1:32110',session=new EventEmitter();let url=origin+'/?view=lan',exports=0,prevented=0;
  const contents={getURL:()=>url},stop=attachNetworkSessionDownloads(contents,session,origin,()=>{exports++;});
  const emit=(source=contents,href='blob:'+origin+'/random',name='network-performance-2026-09-20T00-00-00-000Z.jsonl')=>
    session.emit('will-download',{preventDefault(){prevented++;}},{getURL:()=>href,getFilename:()=>name},source);
  emit();assert.equal(exports,1);assert.equal(prevented,1);
  emit({});emit(contents,'https://evil.invalid/data');emit(contents,'blob:https://evil.invalid/random');
  emit(contents,'blob:'+origin+'.evil.invalid/random');emit(contents,undefined,'save.json');emit(contents,undefined,'network-performance-secret.jsonl');
  url=origin+'/not-game';emit();assert.equal(exports,1);assert.equal(prevented,1);
  url=origin+'/';stop();emit();assert.equal(exports,1);assert.equal(session.listenerCount('will-download'),0);
});

test('CPU and memory sample has no identity and distinguishes absent processes from measured zero', () => {
  const metrics=[{pid:11,type:'Browser',name:'SECRET',cpu:{percentCPUUsage:0},memory:{workingSetSize:1024,privateBytes:256}},
    {pid:12,type:'Tab',cpu:{percentCPUUsage:25},memory:{workingSetSize:2}},
    {pid:13,type:'GPU',cpu:{percentCPUUsage:NaN},memory:{workingSetSize:-1}}];
  const out=desktopProcessMetrics(metrics,{mainPid:11,rendererPid:12,backendPid:null});
  assert.deepEqual(out.main,{cpuPercent:0,workingSetBytes:1048576,privateBytes:262144});
  assert.equal(desktopProcessMetrics(metrics,{mainPid:11,rendererPid:12,cpuSampledPids:new Set([11])}).renderer.cpuPercent,null);
  assert.equal(out.renderer.cpuPercent,25);assert.equal(out.renderer.privateBytes,null);assert.equal(out.backend,null);
  assert.deepEqual(out.gpu,{cpuPercent:null,workingSetBytes:null,privateBytes:null});
  assert.ok(!JSON.stringify(out).includes('SECRET'));assert.ok(!JSON.stringify(out).includes('pid'));
});
