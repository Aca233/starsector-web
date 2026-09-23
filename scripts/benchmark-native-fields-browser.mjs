// Test-only sequential A/B and B/A of frozen producer sources. Never launches a visible window.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const root=path.resolve(process.env.NATIVE_FIELDS_BROWSER_OUT??'artifacts/network-stream-20260922/phase33');
const before=JSON.parse(fs.readFileSync(path.join(root,'before.json'))),after=JSON.parse(fs.readFileSync(path.join(root,'after.json')));
const differences=after.files.filter((f,i)=>f.file!==before.files[i].file||f.sha256!==before.files[i].sha256).map(f=>f.file);
if(JSON.stringify(differences)!=='["src/network/CombatSnapshot.ts"]')throw Error('Comparison must isolate capture');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const tracked=walk('server').filter(f=>/\.[cm]?[jt]s$/.test(f)).concat('scripts/check-normal-multiplayer-browser.mjs');
const serverSources=tracked.map(file=>({file,sha256:sha(file)}));const results=[];
const counts=(process.env.NATIVE_FIELDS_PLAYERS??'3,5').split(',').map(Number);if(!counts.length||counts.some(n=>n!==3&&n!==5)||new Set(counts).size!==counts.length)throw Error('Invalid player counts');
for(const players of counts)for(let round=0;round<2;round++)for(const arm of round?['after','before']:['before','after']){
 const out=path.join(root,`browser-${players}-${round}-${arm}`);fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'result.json')))throw Error('Refusing to overwrite prior experiment: '+out);const log=fs.openSync(path.join(out,'run.log'),'w');
 const env={...process.env,MULTIPLAYER_OUT:out,MULTIPLAYER_FROZEN:path.join(root,arm+'.json'),MULTIPLAYER_PLAYERS:String(players),MULTIPLAYER_MS:'15000',MULTIPLAYER_SEED:'917',MULTIPLAYER_STYLED:'true',MULTIPLAYER_ANGLE:'d3d11',MULTIPLAYER_WEAPON_FIXTURE:'true',MULTIPLAYER_EXPECT_FLIGHT:'true',MULTIPLAYER_RECONNECT:'true'};
 const exitCode=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/check-normal-multiplayer-browser.mjs'],{env,stdio:['ignore',log,log],windowsHide:true});p.on('error',reject);p.on('exit',resolve);});fs.closeSync(log);
 const report=JSON.parse(fs.readFileSync(path.join(out,'result.json')));const row={players,round,arm,exitCode,physicsHz:report.ticks*1000/report.elapsed,stats:report.stats,stall:report.stall,reconnected:report.reconnected,errors:report.errors};results.push(row);
 const drift=serverSources.filter(r=>sha(r.file)!==r.sha256).map(r=>r.file);
 fs.writeFileSync(path.join(root,'browser-pairs.json'),JSON.stringify({scope:'Sequential frozen same-source A/B and B/A; actual LAN on one GPU machine, not Steam/n2n/multi-machine RTT. Human-like aim is wall-time dependent, so combat trajectories are not byte-identical.',differences,serverSources,serverDrift:drift,results},null,2));
 console.log(JSON.stringify({players,round,arm,exitCode,physicsHz:row.physicsHz,guests:row.stats?.slice(1).map(s=>({hz:s.hz,motionHz:s.motionHz,fps:s.fps,ageP95:s.ageP95,inputP95:s.inputP95}))}));
 if(exitCode!==0||drift.length)throw Error('Browser check failed or server sources changed; preserve evidence');
}
