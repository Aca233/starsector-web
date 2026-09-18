/** Audit the frozen paired replay; independent of live workspace changes outside this fix. */
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, constants } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
const args=process.argv.slice(2);
if(args.length!==1)throw Error('Usage: node scripts/audit-combat-behavior.mjs artifact-directory');
const dir=path.resolve(args[0]),read=name=>readFile(path.join(dir,name),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const sourceFiles=['src/engine/ai/FleetTactics.ts','src/engine/ai/CapitalShipAI.ts'];
function section(text,file){
  const marker=`\n// ${file}\n`,start=text.indexOf(marker);
  assert.ok(start>=0 && text.indexOf(marker,start+1)<0,`unique module ${file}`);
  const rest=text.slice(start+marker.length),end=rest.search(/\n\/\/ (?:src|scripts)\/[^\n]+\n/);
  assert.ok(end>=0);return {start,end:start+marker.length+end,text:text.slice(start,start+marker.length+end)};
}
function outside(text){
  for(const file of sourceFiles){const s=section(text,file);text=text.slice(0,s.start)+`\n// OMIT ${file}\n`+text.slice(s.end);}
  return text.replace(/,\n  weaponRange\n};\s*$/,'\n};\n');
}
const baseline=await read('baseline.mjs'),candidate=await read('candidate.mjs');
assert.equal(outside(baseline),outside(candidate),'only two rule modules and the test helper export may change');
const before=JSON.parse(await read('before.json')),after=JSON.parse(await read('after.json')),repeat=JSON.parse(await read('after-repeat.json'));
assert.equal(before.bundleSha256,hash(baseline));assert.equal(after.bundleSha256,hash(candidate));
assert.deepEqual(after,repeat,'all six complete replays must reproduce, including per-frame events and per-second traces');
assert.equal(before.results.length,6);assert.equal(after.results.length,6);
const highPressure=r=>r.events.filter(e=>e.before.mode==='WITHDRAW'&&e.after.mode==='ENGAGE'&&e.after.pressure>2.5).length;
const rows=before.results.map((b,i)=>{
  const a=after.results[i];assert.deepEqual(b.scenario,a.scenario);assert.equal(b.seed,a.seed);
  assert.ok(b.summary.checksum.every(Number.isFinite)&&a.summary.checksum.every(Number.isFinite));
  const pick=r=>({modeChanges:r.metrics.modeChanges,rapidModeReturns:r.metrics.rapidModeReturns,highPressureReengagements:highPressure(r),seconds:r.summary.seconds,outcome:r.summary.outcome,ownHull:r.summary.ownHull,enemyHull:r.summary.enemyHull});
  return {scenario:b.scenario.id,seed:b.seed,before:pick(b),after:pick(a)};
});
assert.equal(rows.reduce((n,r)=>n+r.before.highPressureReengagements,0),8);
assert.equal(rows.reduce((n,r)=>n+r.after.highPressureReengagements,0),0);
const current=await loadCombatLab(),currentText=await readFile(current.engineBundlePath,'utf8');
for(const f of sourceFiles)assert.equal(section(candidate,f).text,section(currentText,f).text,`${f}: frozen candidate implements the current rule source`);
const sources={};
for(const f of [...sourceFiles,'scripts/ai/CombatLab.ts','scripts/check-ai-withdrawal.mjs','scripts/diagnose-combat-behavior.mjs','scripts/audit-combat-behavior.mjs']){
  sources[f]=hash(await readFile(f));await copyFile(f,path.join(dir,`final-${path.basename(f)}`),constants.COPYFILE_EXCL);
}
const policy=JSON.parse(await readFile('src/engine/ai/learning/combat-policy.json','utf8'));assert.equal(policy.enabled,false);
const report={version:1,createdAt:new Date().toISOString(),status:'PASS',scope:'Behavior regression fix only; both teams use the same version per replay, not a head-to-head strength test.',baselineSha256:hash(baseline),candidateSha256:hash(candidate),unchangedOutsideRuleModulesSha256:hash(outside(baseline)),currentBuildSha256:current.engineBundleSha256,frozenModulesMatchCurrentBuild:true,fullReplayDeterminism:true,learningEnabled:false,sources,rows};
await writeFile(path.join(dir,'audit.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
