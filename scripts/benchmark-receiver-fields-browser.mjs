// Test-only sequential A/B and B/A of frozen receiver sources. Never launches a visible window.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {battleServerInputs,changedBattleInputs} from './lib/battle-server-inputs.mjs';
import {compareSteadyFixtures} from './compare-steady-multiplayer.mjs';
const steady=process.env.MULTIPLAYER_STEADY_FIXTURE==='true';
const root=path.resolve(process.env.RECEIVER_FIELDS_BROWSER_OUT??'artifacts/network-stream-20260922/phase35');
const before=JSON.parse(fs.readFileSync(path.join(root,'before.json'))),after=JSON.parse(fs.readFileSync(path.join(root,'after.json')));
if(after.files.length!==before.files.length)throw Error('Frozen source graph sizes differ');
const differences=after.files.filter((f,i)=>f.file!==before.files[i].file||f.sha256!==before.files[i].sha256).map(f=>f.file);
if(JSON.stringify(differences)!=='["src/network/CombatSnapshot.ts"]')throw Error('Comparison must isolate restoration');
const serverSources=await battleServerInputs();const results=[];
const counts=(process.env.RECEIVER_FIELDS_PLAYERS??'3,5').split(',').map(Number);if(!counts.length||counts.some(n=>n!==3&&n!==5)||new Set(counts).size!==counts.length)throw Error('Invalid player counts');
for(const players of counts)for(let round=0;round<2;round++)for(const arm of round?['after','before']:['before','after']){
 const out=path.join(root,`browser-${players}-${round}-${arm}`);fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'result.json')))throw Error('Refusing to overwrite prior experiment: '+out);const log=fs.openSync(path.join(out,'run.log'),'w');
 const env={...process.env,MULTIPLAYER_OUT:out,MULTIPLAYER_FROZEN:path.join(root,arm+'.json'),MULTIPLAYER_PLAYERS:String(players),MULTIPLAYER_MS:'15000',MULTIPLAYER_SEED:'917',MULTIPLAYER_STYLED:'true',MULTIPLAYER_ANGLE:'d3d11',MULTIPLAYER_WEAPON_FIXTURE:'true',MULTIPLAYER_EXPECT_FLIGHT:'true',MULTIPLAYER_RECONNECT:'true'};
 const exitCode=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/check-normal-multiplayer-browser.mjs'],{env,stdio:['ignore',log,log],windowsHide:true});p.on('error',reject);p.on('exit',resolve);});fs.closeSync(log);
 const report=JSON.parse(fs.readFileSync(path.join(out,'result.json')));const trajectory=exitCode===0&&steady&&results.some(r=>r.players===players)?compareSteadyFixtures(path.join(root,`browser-${players}-0-before`),out):null;const row={players,round,arm,exitCode,trajectory,physicsHz:report.ticks*1000/report.elapsed,stats:report.stats,stall:report.stall,reconnected:report.reconnected,errors:report.errors};results.push(row);
 const drift=changedBattleInputs(serverSources);
 fs.writeFileSync(path.join(root,'browser-pairs.json'),JSON.stringify({scope:steady?'Fixed-tick, real-network constant-input comparison with complete authority checkpoints; one GPU machine LAN, not Steam/n2n/multi-machine RTT.':'Sequential frozen same-source A/B and B/A; actual LAN on one GPU machine, not Steam/n2n/multi-machine RTT. Human-like aim is wall-time dependent, so combat trajectories are not byte-identical.',differences,serverSources,serverDrift:drift,results},null,2));
 console.log(JSON.stringify({players,round,arm,exitCode,physicsHz:row.physicsHz,guests:row.stats?.slice(1).map(s=>({hz:s.hz,motionHz:s.motionHz,fps:s.fps,ageP95:s.ageP95,inputP95:s.inputP95}))}));
 if(exitCode!==0||drift.length||trajectory?.equal===false)throw Error('Browser check failed, battle inputs drifted, or authority trajectory differed; preserve evidence');
}
