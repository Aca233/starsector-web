/** Measure actual cover-navigation requests in the 60Hz engine; not a strength/learning test. */
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--bundle','--output'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Usage: node scripts/diagnose-cover-navigation.mjs --bundle bundle.mjs --output new-report.json');options[args[i]]=args[i+1];}
if(!options['--bundle']||!options['--output'])throw Error('Both --bundle and --output are required');
try{await access(options['--output']);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const bundle=path.resolve(options['--bundle']),lab=await import(pathToFileURL(bundle).href);
assert.equal(typeof lab.regroupVelocity,'function','bundle must export the production cover navigator');
const cases=[
  {id:'cover-destroyer-duel',teams:[['hammerhead'],['hammerhead']],formation:'LINE'},
  {id:'cover-mixed-pair',teams:[['hammerhead','wolf'],['sunder','lasher']],formation:'STAGGER'},
  {id:'cover-line-trio',teams:[['hammerhead','lasher','wolf'],['sunder','hammerhead','lasher']],formation:'WIDE'},
];
function run(scenario,seed,instrument){
  const env=new lab.FleetCombatLab(scenario,seed,0,60),original=lab.CapitalShipAI.prototype.update;
  const metrics={regroupDecisionSeconds:0,farMobileCoverSeconds:0,reversedCoverRequestSeconds:0,unobstructedReversedCoverSeconds:0,stalledCoverRequestSeconds:0};
  const requests=[],counts=new Map();
  if(instrument)lab.CapitalShipAI.prototype.update=function(dt,order,world){
    const s=this.ship,p=world?.fleetPlan?.get(s.id),tick=(counts.get(s.id)??0)+1;counts.set(s.id,tick);
    let request;
    if(!s.isDead&&!s.retreating&&!order&&p?.task==='REGROUP'&&!s.hullStats.doNotBackOff&&!['ASSAULT','EXTRACT'].includes(s.system.tacticalMode)){
      const anchor=world.ships.find(a=>a.id===p.anchorId&&!a.isDead&&!a.isRetreated),t=world.ships.find(a=>a.id===p.targetId);
      if(anchor&&t){
        const away=anchor.pos.clone().sub(t.pos);if(away.length()<1)away.copy(lab.Vector2.fromAngle(anchor.facingRad+Math.PI));
        const clearance=s.spec.collisionRadius+anchor.spec.collisionRadius+180;
        const station=anchor.pos.clone().addScaled(away,clearance/away.length()),delta=station.sub(s.pos),gap=delta.length(),unit=delta.clone().normalize();
        const stats=s.getMotionStats(),braking=Math.max(64,stats.maxSpeed**2/(2*Math.max(1,stats.deceleration))),velocity=lab.regroupVelocity(s,anchor,t);
        request={tick,id:s.id,team:s.teamId,hull:s.spec.id,anchor:anchor.id,target:t.id,gap,maxSpeed:stats.maxSpeed,brakingDistance:braking,requestTowardCover:velocity.dot(unit),anchorTowardCover:anchor.vel.dot(unit),actualTowardCover:s.vel.dot(unit),flux:s.flux.fluxPercent,hp:s.hullHp/s.maxHullHp};
      }
    }
    original.call(this,dt,order,world);
    if(request&&s.tacticalAI?.fleetTask==='REGROUP'){
      metrics.regroupDecisionSeconds+=dt;
      const far=request.gap>60+request.brakingDistance&&request.maxSpeed>10;
      if(far){metrics.farMobileCoverSeconds+=dt;
        if(request.requestTowardCover < -1){metrics.reversedCoverRequestSeconds+=dt;if(!s.tacticalAI.avoidingCollision)metrics.unobstructedReversedCoverSeconds+=dt;}
        if(request.requestTowardCover < request.maxSpeed*.1)metrics.stalledCoverRequestSeconds+=dt;
      }
      if(tick%12===0)requests.push({...request,far,avoidingCollision:s.tacticalAI.avoidingCollision,throttle:s.throttle,strafe:s.strafeInput});
    }
  };
  try{while(!env.done)env.step(new Map());}finally{lab.CapitalShipAI.prototype.update=original;}
  const summary=env.summary();assert.ok(summary.checksum.every(Number.isFinite));
  return {scenario,seed,summary,metrics,requests};
}
const results=[];
for(const c of cases)for(const seed of [211,307,419]){
  const measured=run(c,seed,true),plain=run(c,seed,false);
  assert.deepEqual(measured.summary,plain.summary,'observation must not change complete authoritative summary');
  results.push(measured);console.log(c.id,seed,JSON.stringify(measured.metrics));
}
const report={version:1,note:'Both teams use the same version. Nine seeded scenarios and nine uninstrumented verification replays; no additional independent efficacy samples. Requests are measured before collision avoidance, not claimed as actual travel. Far-mobile means station gap > 60 + brakingDistance and maxSpeed > 10.',bundleSha256:createHash('sha256').update(await readFile(bundle)).digest('hex'),observationNeutrality:true,results};
await writeFile(options['--output'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
