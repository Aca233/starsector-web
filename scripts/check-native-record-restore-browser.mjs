// Frozen common source graph, actual LAN+Worker+helpers+WebGL, A/B then B/A.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
import {receiverFieldsReference} from './lib/receiver-fields-reference.mjs';
import {freezeBrowserSources} from './lib/frozen-vite-sources.mjs';import {battleServerInputs,changedBattleInputs} from './lib/battle-server-inputs.mjs';import {compareSteadyFixtures} from './compare-steady-multiplayer.mjs';
const root=path.resolve(process.env.NATIVE_RESTORE_OUT??'artifacts/network-stream-20260922/phase38/real');assert.ok(!fs.existsSync(root),'Do not overwrite prior evidence');fs.mkdirSync(root,{recursive:true});
freezeBrowserSources(path.join(root,'after.json'));const after=JSON.parse(fs.readFileSync(path.join(root,'after.json'))),before=structuredClone(after);
const row=before.files.find(r=>r.file==='src/network/CombatSnapshot.ts');row.code=receiverFieldsReference;row.sha256=crypto.createHash('sha256').update(row.code).digest('hex');fs.writeFileSync(path.join(root,'before.json'),JSON.stringify(before));
assert.deepEqual(after.files.filter((r,i)=>r.sha256!==before.files[i].sha256).map(r=>r.file),['src/network/CombatSnapshot.ts']);
const inputs=await battleServerInputs(),results=[];
const cases=[{players:3,round:0,order:['before','after']},{players:5,round:0,order:['before','after']},{players:5,round:1,order:['after','before']}];
for(const {players,round,order}of cases)for(const arm of order){
 const out=path.join(root,`${players}-${round}-${arm}`);fs.mkdirSync(out);const log=fs.openSync(path.join(out,'run.log'),'w');
 const env={...process.env,MULTIPLAYER_OUT:out,MULTIPLAYER_FROZEN:path.join(root,arm+'.json'),MULTIPLAYER_PLAYERS:String(players),MULTIPLAYER_MS:'15000',MULTIPLAYER_SEED:'917',MULTIPLAYER_STYLED:'true',MULTIPLAYER_COMPILED_CSS:'dist/assets/main-BeF0Wh6B.css',MULTIPLAYER_ANGLE:'d3d11',MULTIPLAYER_WEAPON_FIXTURE:'true',MULTIPLAYER_EXPECT_FLIGHT:'true',MULTIPLAYER_RECONNECT:'true',MULTIPLAYER_PREDICTION_FIXTURE:'true',MULTIPLAYER_STEADY_FIXTURE:'true',MULTIPLAYER_COMMAND_HELD_FIXTURE:'false',MULTIPLAYER_PROFILE:'false'};
 const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/check-normal-multiplayer-browser.mjs'],{env,stdio:['ignore',log,log],windowsHide:true});child.on('error',reject);child.on('exit',resolve);});fs.closeSync(log);
 const report=JSON.parse(fs.readFileSync(path.join(out,'result.json')));const beforeOut=path.join(root,`${players}-${round}-before`),afterOut=path.join(root,`${players}-${round}-after`);
 const trajectory=fs.existsSync(path.join(beforeOut,'steady-fixture.json'))&&fs.existsSync(path.join(afterOut,'steady-fixture.json'))?compareSteadyFixtures(beforeOut,afterOut):null;
 const drift=changedBattleInputs(inputs);results.push({players,round,arm,exitCode,physicsHz:report.ticks*1000/report.elapsed,stats:report.stats,stall:report.stall,reconnected:report.reconnected,trajectory,drift});
 fs.writeFileSync(path.join(root,'pairs.json'),JSON.stringify({scope:'Controlled actual same-machine LAN, not Steam/n2n remote RTT. Complete authority and actual inputs compared. No CPU profiling during measurement.',inputs,results},null,2));
 console.log(JSON.stringify({players,round,arm,exitCode,physicsHz:report.ticks*1000/report.elapsed,trajectory:trajectory?.equal,hz:report.stats?.map(s=>s.hz)}));
 assert.deepEqual(drift,[]);assert.equal(exitCode,0);assert.equal(report.cleanupCompleted,true);assert.deepEqual(report.errors,[]);assert.deepEqual(report.failures,[]);assert.equal(report.stall?.validAckProgress,true);assert.ok(report.stall.publicationsDuringMiddle450ms>=5);assert.equal(report.reconnected?.matchIdUnchanged,true);if(trajectory){assert.equal(trajectory.effectiveInputsEqual,true);assert.equal(trajectory.equal,true);}
}
for(const {players,round}of cases)assert.ok(results.some(r=>r.players===players&&r.round===round&&r.trajectory?.equal));
