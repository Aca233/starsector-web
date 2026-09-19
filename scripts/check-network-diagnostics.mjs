import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeNetworkRecord, parseNetworkConsole, NetworkDiagnosticBuffer, NETWORK_LOG_PREFIX, MAX_RECORD_BYTES } from '../desktop/network-diagnostic-record.mjs';
import { DesktopNetworkLog } from '../desktop/network-log.mjs';
const sample = (extra = {}) => ({ version: 1, event: 'sample', transport: 'lan', build: '2026-09-19T09:19:59.837Z',
  monotonicMs: 1000, wallTimeMs: 100000, role: 'guest', seat: 1, hudAgeMs: 10, pipelineAgeMs: 100, steamAgeMs: 100,
  hud: { hz: 17, appliedHz: 16, fps: 60, bytes: 328200, authority: { ageMs: 10, flow: { windowMs: 1000, rates: { simulated: 60, produced: 60, blocked: 0 } } } },
  pipeline: { version: 1, role: 'guest', authority: { knownAgeMs: 500, stale: false, performance: { tick: 100 } }, receivers: [{ seat: 1, consumptionCredits: true, stages: { windowMs: 1000, rates: { queued: 20, skippedSocket: 0, skippedCredit: 40, consumed: 17 } } }] }, ...extra });
const message = extra => NETWORK_LOG_PREFIX + JSON.stringify(sample(extra));
test('sample preserves low Hz, zero and unknown distinctly; never clamps guest rates to target', () => {
  const r=normalizeNetworkRecord(sample()); assert.equal(r.hud.hz,17); assert.equal(r.hud.parse,null);
  assert.equal(r.hud.authority.flow.rates.blocked,0); assert.equal(r.pipeline.receivers[0].stages.rates.skippedCredit,40);
  assert.equal(r.hudFresh,true); assert.equal(r.pipelineFresh,true);
});
test('allowlist strips identities, URLs, credentials, raw world and free text at every level', () => {
  const secret={token:'SECRET',name:'SECRET',ip:'SECRET',steamId:'SECRET',matchId:'SECRET',reason:'SECRET'};
  const r=normalizeNetworkRecord(sample({...secret,hud:{...sample().hud,...secret,world:secret},
    pipeline:{...sample().pipeline,...secret,receivers:[{...secret,...sample().pipeline.receivers[0]}]},
    steam:{...secret,role:'guest',nativeHostSession:{...secret,available:true,usingRelay:false,queuedBytes:1024}}}));
  assert.ok(!JSON.stringify(r).includes('SECRET')); assert.equal(r.steam.nativeHostSession.usingRelay,false);
});
test('stale HUD, heartbeat, Steam and authority become unknown; report age is not copied into RTT', () => {
  const r=normalizeNetworkRecord(sample({hudAgeMs:2501,pipelineAgeMs:5001,steamAgeMs:5001}));
  assert.equal(r.hud,null); assert.equal(r.pipeline,null);assert.equal(r.lan,null);assert.equal(r.steam,null);
  const a=normalizeNetworkRecord(sample({pipelineAgeMs:4600})); assert.equal(a.pipeline.authority.performance,null);assert.equal(a.hud.rtt,null);
  const b=sample(); b.hud.authority.ageMs=3000;assert.equal(normalizeNetworkRecord(b).hud.authority,null);
});
test('nonfinite, negative, arbitrary event/build and oversized input rejected or unknown', () => {
  assert.equal(normalizeNetworkRecord(sample({event:'SECRET'})),null);assert.equal(normalizeNetworkRecord(sample({transport:'secret'})),null);
  const r=normalizeNetworkRecord(sample({build:'SECRET',hud:{hz:NaN,fps:Infinity,age:-1}}));
  assert.equal(r.build,null);assert.equal(r.hud.hz,null);assert.equal(r.hud.fps,null);assert.equal(r.hud.age,null);
  assert.equal(parseNetworkConsole('hello'),null);assert.equal(parseNetworkConsole(NETWORK_LOG_PREFIX+'{'),null);
  assert.equal(parseNetworkConsole(NETWORK_LOG_PREFIX+' '.repeat(MAX_RECORD_BYTES)),null);
});
test('receiver arrays bounded, detached and stable after original objects mutate', () => {
  const s=sample();s.pipeline.receivers=Array.from({length:100},()=>sample().pipeline.receivers[0]);
  const r=normalizeNetworkRecord(s);assert.equal(r.pipeline.receivers.length,9);s.pipeline.receivers[0].stages.rates.queued=999;
  assert.equal(r.pipeline.receivers[0].stages.rates.queued,20);assert.ok(JSON.stringify(r).length<MAX_RECORD_BYTES);
});
test('Steam keeps actual ACK gating enums, application bytes and unknown consumption credits', () => {
  const r=normalizeNetworkRecord(sample({transport:'steam',steam:{mode:'legacy-p2p',role:'host',peers:[{blockedBy:'renderer-consumption',lastSnapshotSkip:'wire-byte-window',lastSnapshot:{rawBytes:300000,wireBytes:95000,fragments:12}}]}}));
  assert.equal(r.steam.peers[0].blockedBy,'renderer-consumption');assert.equal(r.steam.peers[0].lastSnapshot.wireBytes,95000);
});
test('ring retains disconnect and recovery across battles with bounded record count', () => {
  const ring=new NetworkDiagnosticBuffer({maxRecords:3});
  for(const [i,event] of ['sample','reconnecting','disconnected','battle-stop','welcome'].entries())ring.write(sample({event,monotonicMs:i*1000}));
  const rows=ring.text().trim().split('\n').map(JSON.parse);assert.equal(rows[0].records,3);assert.equal(rows[0].dropped,2);
  assert.deepEqual(rows.slice(1).map(r=>r.event),['disconnected','battle-stop','welcome']);
});
test('byte bound, error storm rate limit, broken sink and long sampling gaps are nonfatal', () => {
  const ring=new NetworkDiagnosticBuffer({maxBytes:12000,sink:()=>{throw Error('console unavailable');}});
  for(let i=0;i<100;i++)ring.write(sample({event:'error',sampleGapMs:9000}));
  assert.equal(ring.windowCount,12);assert.ok(ring.bytes<=12000);assert.ok(ring.dropped>=88);
  assert.equal(ring.write(sample({monotonicMs:10000,sampleGapMs:9000})),true);
  const last=JSON.parse(ring.rows.at(-1).line);assert.equal(last.sampleGapMs,9000);
});
test('desktop writes only validated trusted messages, reports drops and survives filesystem failure', async () => {
  const writes=[];let fail=true;
  const log=new DesktopNetworkLog('test',{io:{stat:async()=>({size:0}),appendFile:async(_f,line)=>{if(fail)throw Error('disk full');writes.push(line);}},now:()=>1000});
  assert.equal(log.accept(message(),false),false);assert.equal(log.accept('other log',true),false);
  assert.equal(log.accept(message(),true),true);await log.flush();assert.equal(log.dropped,1);
  fail=false;log.accept(message(),true);await log.flush();assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0]).desktopDropped,1);
});
test('desktop pending queue cannot grow with a stalled disk', async () => {
  let release;const wait=new Promise(r=>release=r);let writes=0;
  const log=new DesktopNetworkLog('test',{maxPending:2,io:{stat:async()=>({size:0}),appendFile:async()=>{await wait;writes++;}}});
  assert.equal(log.accept(message(),true),true);assert.equal(log.accept(message(),true),true);assert.equal(log.accept(message(),true),false);
  assert.equal(log.pending,2);release();await log.flush();assert.equal(writes,2);assert.equal(log.pending,0);
});
test('desktop independently limits console spam and resumes next window', async () => {
  let now=0;const log=new DesktopNetworkLog('test',{now:()=>now,io:{stat:async()=>({size:0}),appendFile:async()=>{}}});
  for(let i=0;i<12;i++){assert.equal(log.accept(message(),true),true);await log.flush();}
  assert.equal(log.accept(message(),true),false);now=1001;assert.equal(log.accept(message(),true),true);await log.flush();
});
test('real filesystem rotation replaces previous file and stays bounded on Windows too', async () => {
  await fs.mkdir(path.resolve('artifacts'),{recursive:true});
const dir=await fs.mkdtemp(path.resolve('artifacts/network-log-test-'));
  const file=path.join(dir,'network-performance.jsonl');let now=0;
  const log=new DesktopNetworkLog(file,{maxBytes:4500,now:()=>now});
  for(let i=0;i<12;i++){now+=1000;assert.equal(log.accept(message({battle:i}),true),true);await log.flush();}
  const current=await fs.readFile(file,'utf8'),previous=await fs.readFile(file+'.previous','utf8');
  assert.ok(Buffer.byteLength(current)<=4500);assert.ok(Buffer.byteLength(previous)<=4500);
  assert.equal(JSON.parse(current.trim().split('\n').at(-1)).battle,11);assert.ok(JSON.parse(previous.trim().split('\n').at(-1)).battle<11);
});
