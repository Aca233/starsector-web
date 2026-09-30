// Serialized actual-page ABBA runner. Requires a prewritten protocol and frozen
// source graph; never mutates defaults, relaxes gates, pools samples or retries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const root=path.resolve(process.argv[2]??'');
assert.ok(process.argv[2],'Usage: node scripts/benchmark-lan-presentation.mjs <artifact-directory>');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const protocolPath=path.join(root,'protocol.json'),sourcePath=path.join(root,'browser-sources.json');
const protocol=JSON.parse(fs.readFileSync(protocolPath));
assert.deepEqual(protocol.order,['main','shared','shared','main']);
assert.deepEqual(protocol.pairing,[[0,1],[3,2]]);
assert.equal(sha(fs.readFileSync(sourcePath)),protocol.graph.sha256);
const output=path.join(root,'crosscheck.json');
assert.ok(!fs.existsSync(output),'Preserve previous experiment: choose another artifact directory');
// Guard the actual Node import closure, plus browser test helpers and styles.
// Packaging/updater entrypoints are NOT executed by this headless harness. A
// change there must not be mistaken for measurement code drift. Node-imported
// src/*.mjs is included too (it is not served through Vite's source freezer).
const graph=await build({entryPoints:['scripts/check-normal-multiplayer-browser.mjs'],bundle:true,platform:'node',format:'esm',write:false,metafile:true,packages:'external',logLevel:'silent',plugins:[{name:'browser-evaluation-imports',setup(b){b.onResolve({filter:/^\/(?:src|scripts|node_modules)\//},({path})=>({path,external:true}));}}]});
const files=new Set([protocolPath,sourcePath,'package-lock.json','package.json','scripts/benchmark-lan-presentation.mjs',...Object.keys(graph.metafile.inputs)]);
for(const dir of ['scripts/lib','src']){
 const walk=folder=>{for(const e of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,e.name);if(e.isDirectory()){if(e.name!=='campaign')walk(file);}else if(dir==='src'?file.endsWith('.css'):/\.(mjs|cjs|js|ts|mts|json)$/.test(file))files.add(file);}};walk(dir);
}
fs.writeFileSync(path.join(root,'node-execution-inputs.json'),JSON.stringify({entry:'scripts/check-normal-multiplayer-browser.mjs',files:Object.keys(graph.metafile.inputs),inputs:graph.metafile.inputs},null,2));
const manifest=[...files].map(file=>({file,sha256:sha(fs.readFileSync(file))}));
fs.writeFileSync(path.join(root,'measurement-manifest.json'),JSON.stringify(manifest,null,2));
const drift=()=>manifest.filter(row=>!fs.existsSync(row.file)||sha(fs.readFileSync(row.file))!==row.sha256).map(row=>row.file);
const state={protocol,manifestSha256:sha(JSON.stringify(manifest)),runs:[],pairs:[],complete:false};
const save=()=>fs.writeFileSync(output,JSON.stringify(state,null,2));save();
const inherited=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('MULTIPLAYER_')&&!key.startsWith('VITE_')&&!['DIRECT_AUTHORITY','SPRITE_CULL','DAMAGE_CULL','MULTI_TEXTURE_SHIPS'].includes(key)));
for(const [index,mode] of protocol.order.entries()){
 assert.deepEqual(drift(),[],'Measurement dependency drift before run');
 const arm=`${index+1}-${mode}`,out=path.join(root,arm);
 assert.ok(!fs.existsSync(out),'Refusing to replace a previous arm');
 const env={...inherited,MULTIPLAYER_OUT:out,MULTIPLAYER_FROZEN:sourcePath,MULTIPLAYER_PLAYERS:String(protocol.players),MULTIPLAYER_AI:String(protocol.ai),MULTIPLAYER_MS:String(protocol.durationMs),MULTIPLAYER_SEED:String(protocol.seed),MULTIPLAYER_ANGLE:protocol.angle,MULTIPLAYER_STYLED:String(protocol.styled),MULTIPLAYER_RECONNECT:'true',MULTIPLAYER_PRESENTATION_MEASURE:mode,VITE_LAN_PRESENTATION_WORKER:mode==='main'?'false':'true',VITE_LAN_LAYERED_SYNC:'true',VITE_LAN_CRITICAL_COMBAT:'true'};
 const log=fs.openSync(path.join(root,arm+'.log'),'wx');console.log('[crosscheck] start',arm);
 let run;try{run=spawnSync(process.execPath,['scripts/check-normal-multiplayer-browser.mjs'],{env,stdio:['ignore',log,log],windowsHide:true});}finally{fs.closeSync(log);}
 const row={arm,mode,exitCode:run.status,error:run.error?String(run.error):null,drift:drift()};state.runs.push(row);save();
 if(run.status!==0||row.drift.length)throw Error(`Arm ${arm} failed; retain artifacts, do not automatically rerun`);
 const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));
 assert.equal(result.cleanupCompleted,true);assert.deepEqual(result.errors,[]);assert.deepEqual(result.failures,[]);assert.equal(result.reconnected?.matchIdUnchanged,true);assert.equal(result.stall?.validAckProgress,true);
 const measured=JSON.parse(fs.readFileSync(path.join(out,'presentation-submit.json')));
 assert.equal(measured.transport,mode==='main'?'main':'shared');assert.equal(measured.mode,mode==='main'?'main':'worker');
 Object.assign(row,{measurement:result.measurement,simulationHz:result.measurement.elapsedMs>0?(result.measurement.tickAfter-result.measurement.tickBefore)*1000/result.measurement.elapsedMs:null,viewers:result.viewers.map(v=>({canvas:v.canvas,gpu:v.gpu,isolated:v.isolated})),phases:measured.phases.map(({edges,...p})=>({...p,edgeCount:edges.length})),safety:{stall:result.stall.validAckProgress,reconnected:result.reconnected.matchIdUnchanged,cleanup:true}});save();console.log('[crosscheck] passed',arm);
}
const delta=(a,b)=>a===null||b===null||a===0?null:(b/a-1)*100;
const thresholds=protocol.thresholds;
for(const [mainIndex,sharedIndex] of protocol.pairing){
 const a=state.runs[mainIndex],b=state.runs[sharedIndex];
 const phases=a.phases.map((old,i)=>{const next=b.phases[i];assert.equal(old.name,next.name);return {name:old.name,
  controlP95ChangePct:delta(old.controlToSubmitMs.p95,next.controlToSubmitMs.p95),controlP95ChangeMs:next.controlToSubmitMs.p95-old.controlToSubmitMs.p95,
  frameGapP95ChangePct:delta(old.frameGapMs.p95,next.frameGapMs.p95),frameGapP95ChangeMs:next.frameGapMs.p95-old.frameGapMs.p95,
  drawAckP95ChangePct:delta(old.eventToDrawAckCoverageMs.p95,next.eventToDrawAckCoverageMs.p95),
  ackMissingChange:next.missingDrawAck/next.edgeCount-old.missingDrawAck/old.edgeCount,
  sharedSentCoverage:next.eventToSendMs.count/next.edgeCount,sharedPredictedCoverage:next.eventToPredictedSubmitMs.count/next.edgeCount};});
 const normal=phases[0],busy=phases[1],simulationRateChangePct=delta(a.simulationHz,b.simulationHz);
 const gates={busyControl:busy.controlP95ChangePct!==null&&busy.controlP95ChangePct<=-thresholds.busyControlP95ImprovementPct,busyFrame:busy.frameGapP95ChangePct!==null&&busy.frameGapP95ChangePct<=-thresholds.busyFrameGapP95ImprovementPct,normalControl:normal.controlP95ChangeMs<=thresholds.normalControlP95MaxRegressionMs,normalFrame:normal.frameGapP95ChangeMs<=thresholds.normalFrameGapP95MaxRegressionMs,simulation:simulationRateChangePct!==null&&simulationRateChangePct>=-thresholds.simulationRateMaxRegressionPct,drawAck:phases.every(p=>p.drawAckP95ChangePct!==null&&p.drawAckP95ChangePct<=thresholds.drawAckP95MaxRegressionPct&&p.ackMissingChange<=thresholds.maximumAckMissingRegression),sentCoverage:phases.every(p=>p.sharedSentCoverage>=thresholds.minimumSentCoverage),predictedCoverage:phases.every(p=>p.sharedPredictedCoverage>=thresholds.minimumPredictedCoverage)};
 state.pairs.push({main:a.arm,shared:b.arm,phases,simulationRateChangePct,gates});
}
state.complete=true;state.numericGatesPassed=state.pairs.every(p=>Object.values(p.gates).every(Boolean));
state.equalWeightChanges={simulationRatePct:state.pairs.reduce((n,p)=>n+p.simulationRateChangePct,0)/state.pairs.length,phases:['normal','main-busy'].map((name,i)=>({name,...Object.fromEntries(['controlP95ChangePct','frameGapP95ChangePct','drawAckP95ChangePct'].map(key=>[key,state.pairs.every(p=>p.phases[i][key]!==null)?state.pairs.reduce((n,p)=>n+p.phases[i][key],0)/state.pairs.length:null]))}))};
state.sourceDrift=JSON.parse(fs.readFileSync(sourcePath)).files.filter(row=>!fs.existsSync(row.file)||sha(fs.readFileSync(row.file))!==row.sha256).map(row=>row.file);
state.toolDrift=drift();state.decision=state.numericGatesPassed?'Local numerical gates passed, not permission/evidence to claim hardware input-to-photon or enable all environments.':'Keep opt-in: failed gates or missing predictive coverage. Do not reinterpret smooth draws as full responsiveness.';
save();console.log(JSON.stringify({complete:state.complete,numericGatesPassed:state.numericGatesPassed,pairs:state.pairs,equalWeightChanges:state.equalWeightChanges,sourceDrift:state.sourceDrift,toolDrift:state.toolDrift},null,2));
