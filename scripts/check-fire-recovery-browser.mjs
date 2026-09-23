// Controlled real-LAN regression: the old implementation MUST reproduce the
// missing held-fire repeat; that failure is preserved, not relabeled as a pass.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {battleServerInputs,changedBattleInputs} from './lib/battle-server-inputs.mjs';import {compareSteadyFixtures} from './compare-steady-multiplayer.mjs';
const root=path.resolve(process.env.FIRE_RECOVERY_OUT??'artifacts/network-stream-20260922/phase37');
const before=JSON.parse(fs.readFileSync(path.join(root,'before.json'))),after=JSON.parse(fs.readFileSync(path.join(root,'after.json')));
assert.equal(before.files.length,after.files.length);assert.deepEqual(after.files.filter((r,i)=>r.file!==before.files[i].file||r.sha256!==before.files[i].sha256).map(r=>r.file).sort(),['src/network/LanBattle.tsx','src/network/LocalFirePrediction.ts','src/network/SnapshotPlayback.ts']);
const inputs=await battleServerInputs();const results=[];
const counts=(process.env.FIRE_RECOVERY_PLAYERS??'3,5').split(',').map(Number);assert.ok(counts.length&&counts.every(n=>n===3||n===5)&&new Set(counts).size===counts.length);
const order=(process.env.FIRE_RECOVERY_ORDER??'before,after').split(',');assert.deepEqual(order.toSorted(),['after','before']);
for(const players of counts)for(const arm of order){
 const out=path.join(root,`browser-${players}-${arm}`);assert.equal(fs.existsSync(out),false,'Refuse to overwrite evidence');fs.mkdirSync(out);const log=fs.openSync(path.join(out,'run.log'),'w');
 const env={...process.env,MULTIPLAYER_OUT:out,MULTIPLAYER_FROZEN:path.join(root,arm+'.json'),MULTIPLAYER_PLAYERS:String(players),MULTIPLAYER_MS:'15000',MULTIPLAYER_SEED:'917',MULTIPLAYER_STYLED:'true',MULTIPLAYER_ANGLE:'d3d11',MULTIPLAYER_WEAPON_FIXTURE:'true',MULTIPLAYER_EXPECT_FLIGHT:'true',MULTIPLAYER_RECONNECT:'true',MULTIPLAYER_PREDICTION_FIXTURE:'true',MULTIPLAYER_STEADY_FIXTURE:'true',MULTIPLAYER_COMMAND_HELD_FIXTURE:'true'};
 const exitCode=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/check-normal-multiplayer-browser.mjs'],{env,stdio:['ignore',log,log],windowsHide:true});p.on('error',reject);p.on('exit',resolve);});fs.closeSync(log);
 const report=JSON.parse(fs.readFileSync(path.join(out,'result.json')));const beforeOut=path.join(root,`browser-${players}-before`),afterOut=path.join(root,`browser-${players}-after`);const trajectory=fs.existsSync(path.join(beforeOut,'steady-fixture.json'))&&fs.existsSync(path.join(afterOut,'steady-fixture.json'))?compareSteadyFixtures(beforeOut,afterOut):null;
 const row={players,arm,exitCode,error:report.error??null,physicsHz:report.ticks*1000/report.elapsed,stats:report.stats,stall:report.stall,reconnected:report.reconnected,trajectory};results.push(row);
 const drift=changedBattleInputs(inputs);fs.writeFileSync(path.join(root,'browser-pairs.json'),JSON.stringify({scope:'Same-machine actual LAN, held fire+group command in one input; frozen common graph, complete authority checkpoints; not Steam/n2n/multi-machine RTT.',inputs,drift,results},null,2));
 console.log(JSON.stringify({players,arm,exitCode,physicsHz:row.physicsHz,trajectory:trajectory?.equal,fire:report.stats?.map(s=>({seat:s.seat,hz:s.hz,inputP95:s.inputP95,...s.firePrediction}))}));
 assert.deepEqual(drift,[]);assert.equal(report.cleanupCompleted,true);assert.deepEqual(report.errors,[]);assert.deepEqual(report.failures,[]);assert.equal(report.roomStatus,'running');assert.equal(report.reconnected?.matchIdUnchanged,true);assert.equal(report.stall?.validAckProgress,true);assert.ok(report.stall.publicationsDuringMiddle450ms>=5);
 const samples=fs.readFileSync(path.join(out,'samples.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(s=>s.event==='sample'&&s.wallTimeMs>=report.measurement.started&&s.wallTimeMs<=report.measurement.measuredUntil);
 for(const s of report.stats){assert.ok(s.hz>0&&s.ageP95<1500&&s.samples>=3);assert.ok(s.motionPrediction.renderedFrames>0&&s.motionPrediction.reconciliations>0);assert.ok(s.turretPrediction.renderedFrames>0);assert.ok(samples.some(r=>r.seat===s.seat&&r.hud?.input?.projectileFlight?.renderedFrames>0&&r.hud?.input?.projectileFlight?.entities>0));}
 if(arm==='before'){
  assert.equal(exitCode,1);assert.match(report.error,/confirmed held repeats must actually be created/);
  for(const s of report.stats){assert.equal(s.firePrediction.repeated,0);assert.equal(s.firePrediction.recoveredCycles??0,0);}
 }else{assert.equal(exitCode,0);if(trajectory)assert.equal(trajectory.equal,true);for(const s of report.stats){assert.ok(s.firePrediction.recoveredCycles>0);assert.ok(s.firePrediction.repeated>0);}}
}

for(const players of counts)assert.equal(results.find(r=>r.players===players&&r.trajectory)?.trajectory.equal,true,'The completed pair must have identical authority checkpoints');
