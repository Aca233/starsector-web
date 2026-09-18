/** Paired behavior replay, NOT a win-rate benchmark or an RL evaluation. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
const args=process.argv.slice(2), options={};
for(let i=0;i<args.length;i+=2){
  if(!['--bundle','--output'].includes(args[i]) || !args[i+1] || options[args[i]]) throw Error('Usage: node scripts/diagnose-combat-behavior.mjs [--bundle bundle.mjs] --output report.json');
  options[args[i]]=args[i+1];
}
if(!options['--output'])throw Error('--output is required (existing reports are not overwritten)');
const bundle=options['--bundle'] ? path.resolve(options['--bundle']) : (await loadCombatLab()).engineBundlePath;
const lab=await import(pathToFileURL(bundle).href);
const cases=[
  {id:'behavior-destroyer-duel',teams:[['hammerhead'],['hammerhead']],formation:'LINE'},
  {id:'behavior-mixed-pair',teams:[['hammerhead','wolf'],['sunder','lasher']],formation:'STAGGER'},
  {id:'behavior-line-trio',teams:[['hammerhead','lasher','wolf'],['sunder','hammerhead','lasher']],formation:'WIDE'},
];
function run(scenario,seed){
  const env=new lab.FleetCombatLab(scenario,seed,0,60), e=env.engine;
  const metrics={liveShipSeconds:0,engageSeconds:0,withdrawSeconds:0,regroupSeconds:0,targetChanges:0,modeChanges:0,taskChanges:0,rapidModeReturns:0,rapidTaskReturns:0,largeRangeJumps:0,blockedWeaponSeconds:0,firePermittedWeaponSeconds:0,noTargetWeaponSeconds:0,aligningWeaponSeconds:0};
  const previous=new Map(),events=[],trace=[];
  const step=e.fixedUpdate.bind(e);let tick=0;
  e.fixedUpdate=(dt)=>{
    step(dt);tick++;
    for(const s of e.capitalShips){
      if(s.isDead || s.isRetreated)continue;
      const d=s.tacticalAI;if(!d)continue;
      const t=s.currentTargetShip;
      const state={tick,id:s.id,hull:s.spec.id,team:s.teamId,mode:d.mode,task:d.fleetTask,target:t?.id??null,flux:s.flux.fluxPercent,hp:s.hullHp/s.maxHullHp,range:d.desiredRange,distance:t?s.pos.distanceTo(t.pos):null,pressure:d.pressureRatio,throttle:s.throttle,strafe:s.strafeInput,radialVelocity:t?s.vel.clone().sub(t.vel).dot(t.pos.clone().sub(s.pos).normalize()):null};
      const p=previous.get(s.id);
      metrics.liveShipSeconds+=dt;
      if(d.mode==='ENGAGE')metrics.engageSeconds+=dt;
      if(d.mode==='WITHDRAW')metrics.withdrawSeconds+=dt;
      if(d.fleetTask==='REGROUP')metrics.regroupSeconds+=dt;
      if(p){
        const changes=[];
        if(p.target&&state.target&&p.target!==state.target){metrics.targetChanges++;changes.push('target');}
        for(const [field,count,rapid] of [['mode','modeChanges','rapidModeReturns'],['task','taskChanges','rapidTaskReturns']]){
          state[field+'Change']=p[field+'Change'];state[field+'Before']=p[field+'Before'];
          if(p[field]!==state[field]){
            metrics[count]++;changes.push(field);
            if(state[field]===p[field+'Before'] && tick-p[field+'Change']<=30)metrics[rapid]++;
            state[field+'Before']=p[field];state[field+'Change']=tick;
          }
        }
        if(p.target===state.target && Math.abs(p.range-state.range)>=50){metrics.largeRangeJumps++;changes.push('range');}
        if(changes.length)events.push({changes,before:p,after:state});
      }
      previous.set(s.id,state);
      if(tick%60===0)trace.push(state);
      for(const m of s.weapons){
        const key={FIRE:'firePermittedWeaponSeconds',FRIENDLY_BLOCKED:'blockedWeaponSeconds',NO_TARGET:'noTargetWeaponSeconds',ALIGNING:'aligningWeaponSeconds'}[m.fireControl?.reason];
        if(key)metrics[key]+=dt;
      }
    }
  };
  while(!env.done)env.step(new Map());
  const summary=env.summary();assert.ok(summary.checksum.every(Number.isFinite));
  return {scenario,seed,summary,metrics,events,trace};
}
const results=[];
for(const scenario of cases)for(const seed of [211,307]){
  const result=run(scenario,seed);results.push(result);
  console.log(scenario.id,seed,JSON.stringify(result.metrics));
}
await writeFile(options['--output'],JSON.stringify({version:1,note:'Both teams use the same bundled rule AI. Behavior diagnostics only; outcomes are not evidence of head-to-head strength. No RL weights or past RL holdout scores used.',bundleSha256:createHash('sha256').update(await readFile(bundle)).digest('hex'),results},null,2)+'\n',{flag:'wx'});
