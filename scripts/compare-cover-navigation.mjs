/** Frozen old/new helper head-to-head. Only cover-arrival velocity differs by team. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const args=process.argv.slice(2);if(args.length!==1)throw Error('Usage: node scripts/compare-cover-navigation.mjs artifact-directory');
const dir=path.resolve(args[0]),read=name=>readFile(path.join(dir,name),'utf8'),save=(name,value)=>writeFile(path.join(dir,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const plan=JSON.parse(await read('head-to-head-plan.json')),base=await read('baseline-testable.mjs'),candidate=await read('candidate.mjs');
const hash=s=>createHash('sha256').update(s).digest('hex');
const isolation=JSON.parse(await read('isolation.json'));assert.equal(hash(base),isolation.baselineSha256);assert.equal(hash(candidate),isolation.candidateSha256);
function helper(s){const start=s.indexOf('function regroupVelocity(ship, anchor, target) {'),end=s.indexOf('\n}',start)+2;assert.ok(start>0&&end>start);return {start,end,text:s.slice(start,end)};}
const old=helper(base),updated=helper(candidate);
assert.equal(base.slice(0,old.start)+base.slice(old.end),candidate.slice(0,updated.start)+candidate.slice(updated.end),'only the cover helper may differ');
const baseline=await import(pathToFileURL(path.join(dir,'baseline-testable.mjs')).href),current=await import(pathToFileURL(path.join(dir,'candidate.mjs')).href);
const variants=[],variantHashes=[];
for(const team of [0,1,2]){
  assert.ok(!candidate.includes('baselineRegroupVelocity'));
  const wrapper=updated.text.replace('function regroupVelocity(ship, anchor, target) {',`function regroupVelocity(ship, anchor, target) {\n  coverVariantCalls[ship.teamId === ${team} ? 1 : 0]++;\n  if (ship.teamId !== ${team}) return baselineRegroupVelocity(ship, anchor, target);`);
  const text=candidate.slice(0,updated.start)+'var coverVariantCalls = [0,0];\n'+old.text.replace('function regroupVelocity(', 'function baselineRegroupVelocity(')+'\n'+wrapper+candidate.slice(updated.end)+'\nexport { coverVariantCalls };\n';
  const filename=`match-team-${team}.mjs`;await save(filename,text);variantHashes.push(hash(text));variants.push(await import(pathToFileURL(path.join(dir,filename)).href));
}
// Verify the dispatcher itself: neither team can accidentally use the other rule.
let routingChecks=0,changedRequests=0;
for(const selected of [0,1])for(const side of [0,1])for(const x of [0,-1810])for(const v of [0,150,-150]){
  const own=new baseline.Ship('routing-own',baseline.modManager.requireShip('hammerhead'),side===0,new baseline.Vector2(x,0),0);
  const ally=new baseline.Ship('routing-ally',baseline.modManager.requireShip('wolf'),side===0,new baseline.Vector2(-1600,0),0);
  const target=new baseline.Ship('routing-target',baseline.modManager.requireShip('hammerhead'),side!==0,new baseline.Vector2(1200,0),Math.PI);ally.vel.set(v,30);
  const vector=lab=>{const r=lab.regroupVelocity(own,ally,target);return [r.x,r.y];};
  assert.deepEqual(vector(variants[selected]),vector(side===selected?current:baseline));routingChecks++;
  if(vector(current).some((n,i)=>n!==vector(baseline)[i]))changedRequests++;
}
assert.ok(changedRequests>0);
function run(lab,scenario,seed,side,seconds){
  lab.coverVariantCalls?.fill(0);
  const env=new lab.FleetCombatLab(scenario,seed,side,seconds);while(!env.done)env.step(new Map());
  const summary=env.summary();assert.ok(summary.checksum.every(Number.isFinite));
  return {summary,coverCalls:lab.coverVariantCalls?[...lab.coverVariantCalls]:null};
}
// The all-old dispatcher must reproduce the untouched baseline on both sides.
let neutralReplays=0;
for(const scenario of plan.cases)for(const side of [0,1]){
  const seed=plan.seeds[0],a=run(variants[2],scenario,seed,side,8),b=run(baseline,scenario,seed,side,8);
  assert.deepEqual(a.summary,b.summary);assert.equal(a.coverCalls[1],0);neutralReplays+=2;
}
const results=[],pairs=[];
for(const scenario of plan.cases)for(const seed of plan.seeds){
  const paired=[];
  for(const side of [0,1]){
    const result=run(variants[side],scenario,seed,side,plan.seconds);results.push(result);paired.push(result.summary);
    console.log(scenario.id,seed,'new team',side,result.summary.outcome,'cover calls old/new',result.coverCalls.join('/'));
  }
  pairs.push({scenario:scenario.id,seed,meanScore:(paired[0].score+paired[1].score)/2,meanHullBalance:paired.reduce((n,r)=>n+(r.ownHull-r.enemyHull)/2,0)});
}
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const rng=new baseline.SimulationRandom(20260918),draws=[];
for(let i=0;i<5000;i++)draws.push(mean(pairs.map(()=>pairs[Math.floor(rng.next()*pairs.length)].meanScore)));
draws.sort((a,b)=>a-b);
const counts=list=>({wins:list.filter(r=>r.summary.outcome==='win').length,losses:list.filter(r=>r.summary.outcome==='loss').length,timeouts:list.filter(r=>r.summary.outcome==='timeout').length,mutual:list.filter(r=>r.summary.outcome==='mutual').length,meanScore:mean(list.map(r=>r.summary.score)),meanHullBalance:mean(list.map(r=>r.summary.ownHull-r.summary.enemyHull))});
const report={version:1,createdAt:new Date().toISOString(),scope:'One narrow cover-velocity fix vs the preceding rule AI, not a general fleet/RL strength certification. 12 mirrored pairs, not 24 independent samples. Timeouts/mutuals score half. No tuning or selecting candidates from these results.',plan,baselineSha256:hash(base),candidateSha256:hash(candidate),variantHashes,routingChecks,neutralReplays,summary:counts(results),pairedBootstrap95:[draws[124],draws[4874]],perScenario:plan.cases.map(c=>({scenario:c.id,...counts(results.filter(r=>r.summary.scenario===c.id))})),pairs,results};
await save('head-to-head.json',report);console.log(JSON.stringify({summary:report.summary,pairedBootstrap95:report.pairedBootstrap95,perScenario:report.perScenario},null,2));
