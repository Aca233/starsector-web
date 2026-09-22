import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';import {navigationPlugin} from './lib/navigation-comparison.mjs';import {navigationExperiment} from './lib/navigation-experiment.mjs';
const out=path.resolve(process.env.NAVIGATION_OUT??'artifacts/network-stream-20260922/phase34/navigation-benchmark');fs.mkdirSync(out,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');const modules={};
for(const arm of ['control','candidate']){
 const outfile=path.join(out,arm+'.mjs'),r=await build({entryPoints:['scripts/lib/navigation-scenario.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,plugins:[navigationPlugin({arm})],define:{__LAN_BUILD_ID__:'"navigation-benchmark"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
 assert.ok(!Object.keys(r.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)));
 fs.writeFileSync(path.join(out,arm+'-sources.json'),JSON.stringify({frozen:process.env.NAVIGATION_FROZEN??null,bundleSha256:sha(outfile),navigationSha256:arm==='candidate'?process.env.NAVIGATION_SOURCE?sha(process.env.NAVIGATION_SOURCE):crypto.createHash('sha256').update(navigationExperiment).digest('hex'):process.env.NAVIGATION_CONTROL_SOURCE?sha(process.env.NAVIGATION_CONTROL_SOURCE):null,inputs:r.metafile.inputs},null,2));
 modules[arm]=await import(pathToFileURL(outfile).href);await modules[arm].assets();
}
const samples=Number(process.env.NAVIGATION_SAMPLES??600),warmup=240;assert.ok(samples>=360&&samples<=1800);
const q=(v,p)=>v.toSorted((a,b)=>a-b)[Math.floor((v.length-1)*p)],stats=v=>({p50:q(v,.5),p95:q(v,.95),p99:q(v,.99),mean:v.reduce((a,b)=>a+b,0)/v.length});const pairs=[];
for(const players of [3,5])for(const order of [['control','candidate'],['candidate','control']]){
 const worlds=Object.fromEntries(Object.entries(modules).map(([arm,m])=>[arm,m.scenario(players)]));const times={control:[],candidate:[]},hash=crypto.createHash('sha256');let maxProjectiles=0,minProjectiles=Infinity;
 for(let tick=0;tick<samples+warmup;tick++){
  for(const arm of order){const ms=worlds[arm].advance(tick);if(tick>=warmup)times[arm].push(ms);}
  assert.equal(worlds.candidate.rng(),worlds.control.rng(),'RNG at tick '+tick);
  // Each complete authority frame is compared outside the timed region, not just a movement projection.
  const a=worlds.control.wire(tick),b=worlds.candidate.wire(tick);assert.deepEqual(b,a,'full encoded frame at tick '+tick);hash.update(a);
  if(tick>=warmup){const n=worlds.control.entities().projectiles;minProjectiles=Math.min(minProjectiles,n);maxProjectiles=Math.max(maxProjectiles,n);}
 }
 const control=stats(times.control),candidate=stats(times.candidate);const pair={players,order,minProjectiles,maxProjectiles,traceSha256:hash.digest('hex'),control,candidate,ratios:{p50:candidate.p50/control.p50,p95:candidate.p95/control.p95,mean:candidate.mean/control.mean},phases:Object.fromEntries(Object.entries(worlds).map(([arm,w])=>[arm,w.phases()]))};
 pairs.push(pair);fs.writeFileSync(path.join(out,`pair-${players}-${order[0]}.json`),JSON.stringify({pair,times},null,2));console.log(JSON.stringify({players,order,control,candidate,ratios:pair.ratios}));
}
const report={scope:'Exact same frozen source graph, independently bundled native simulation; only TacticalNavigation differs. 22 ships, 3/5 deterministic controlled seats, real weapons/projectiles. Full frames and RNG compared each tick outside timing. This is not actual network latency/FPS.',at:new Date().toISOString(),samples,warmup,pairs,gate:{p50AtMost:.95,p95AtMost:1.10},passed:pairs.every(p=>p.ratios.p50<=.95&&p.ratios.p95<=1.10)};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('GATE',report.passed?'PASS':'FAIL; not enabled');if(!report.passed)process.exitCode=1;
