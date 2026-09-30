import assert from 'node:assert/strict';

export function checkQualifiedFireTargets(lab, fixture, snapshot) {
  const {FireControlQueryRoster:Roster,FireControlQueryBatch:Batch,qualifiedFireTargets:qualified,AutofireController:Current,BeforeAutofireController:Before,InFlightFireBudget,Vector2}=lab;
  let checks=0,comparisons=0,beforeQueries=0,afterQueries=0;
  const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
  const identical=(a,b,label)=>{assert.equal(a,b,label);checks++;};
  const ok=(v,label)=>{assert.ok(v,label);checks++;};
  const f=fixture();Roster.ownForWorker(f.engine);const roster=Roster.create(f.ships,f.engine);ok(roster);
  const query={origin:new Vector2(),range:600,speed:1000,delay:0};
  const mount=f.ship.weapons.find(m=>m.mountType!=='HARDPOINT');ok(mount);
  const generic=Batch.fromRoster(f.ship,f.ships);identical(qualified(generic.targets()),undefined);generic.close();
  const batch=roster.begin(f.ship,f.world);ok(batch);const targets=batch.targets(),proof=qualified(targets);ok(proof);
  identical(batch.targetStatus.size,f.ships.length,'all initial admission reads still happen');
  identical(proof.forShip(f.ship,f.ships),proof);identical(proof.forShip(f.target,f.ships),undefined);
  identical(proof.forShip(f.ship,[...f.ships]),undefined);identical(qualified([...targets]),undefined);identical(qualified(f.ships),undefined);
  const first=batch.preAimTargets(query,mount),second=batch.preAimTargets(query,mount);
  identical(qualified(first),proof);identical(qualified(second),proof);ok(second.every(s=>targets.includes(s)));
  batch.close();identical(proof.active,false);identical(qualified(targets),undefined);identical(qualified(second),undefined);
  identical(proof.shooter,undefined);identical(proof.ships,undefined);
  const lengthBatch=roster.begin(f.ship,f.world),list=lengthBatch.targets(),lengthProof=qualified(list);ok(lengthProof);
  const removed=f.ships.pop();try {identical(lengthProof.active,false);identical(qualified(list),undefined);}finally {lengthBatch.close();f.ships.push(removed);}
  f.world.fireBudget=new InFlightFireBudget(f.ships,[]);
  const current=new Current(),before=new (Before??Current)();
  for(let stage=0;stage<10;stage++) {
    f.ship.currentTargetShip=stage===7?f.target:null;
    f.target.isDead=stage===1;f.target.visibilityMask=stage===2?0:3;f.target.isDocked=stage===3;
    f.target.teamId=stage===4?f.ship.teamId:1;f.target.isRetreated=stage===8;
    f.target.pos.set(600+stage*29,stage*11);f.target.vel.set(stage*4,-stage*2);
    const type=f.target.shield.type;f.target.shield.isActive=stage===5;f.target.shield.currentArcDeg=stage===5?180:0;
    if(stage===6){f.target.shield.type='PHASE';f.target.shield.phaseState='ACTIVE';f.target.shield.phaseEffectLevel=1;}
    const now=roster.begin(f.ship,f.world),old=roster.begin(f.ship,f.world);ok(now);ok(old);
    const count=(b,side)=>{const original=b.canTarget;b.canTarget=function(ship){if(side==='before')beforeQueries++;else afterQueries++;return original.call(this,ship);};};
    count(now,'after');count(old,'before');
    const run=(controller,b,m)=>{const world={...f.world,queryBatch:b};const result=controller.aim(.1,f.ship,m,world),pre=controller.preAim(f.ship,m,world),decision=controller.decide(f.ship,m,result,world,.1);
      return {state:snapshot(controller,{...f,mount:m},result),pre:pre&&[pre.x,pre.y],decision};};
    try {for(const m of f.ship.weapons){equal(run(current,now,m),run(before,old,m),'stage/'+stage+'/'+m.slotId);comparisons++;}}
    finally {now.close();old.close();f.target.shield.type=type;f.target.shield.phaseState='IDLE';f.target.shield.phaseEffectLevel=0;}
  }
  if(Before)ok(beforeQueries>afterQueries,'owned loops must actually elide repeated eligibility lookups');
  f.target.isDead=false;f.target.isRetreated=false;f.target.isDocked=false;f.target.visibilityMask=3;f.target.teamId=1;f.ship.currentTargetShip=null;
  // Array copying revokes the proof. Public/custom batches retain the exact old
  // forShip, canTarget, and world.ships getter order and results.
  const customRun=C=>{
    const log=[],native=roster.begin(f.ship,f.world);ok(native);const copied=[...native.targets()];identical(qualified(copied),undefined);
    const fake={forShip(){log.push('forShip');return this;},targets(){log.push('targets');return copied;},preAimTargets(){log.push('preAimTargets');return copied;},canTarget(s){log.push('canTarget:'+s.id);return s!==f.target;}};
    const world={missiles:[],asteroids:[],queryBatch:fake,get ships(){log.push('ships');return f.ships;}};
    try {const controller=new C(),result=controller.aim(.1,f.ship,mount,world),pre=controller.preAim(f.ship,mount,world);return {log,state:snapshot(controller,{...f,mount},result),pre:pre&&[pre.x,pre.y]};}
    finally {native.close();}
  };
  if(Before)equal(customRun(Current),customRun(Before),'generic callback/read order');else customRun(Current);
  // Deliberate test-only interruption after the owned list has been materialized.
  // Both controllers must use original live eligibility once close revokes it.
  const interruptRun=C=>{
    const b=roster.begin(f.ship,f.world);ok(b);b.targets();const descriptor=Object.getOwnPropertyDescriptor(f.target,'teamId');let reads=0;
    Object.defineProperty(f.target,'teamId',{configurable:true,enumerable:true,get(){reads++;b.close();return descriptor.value;}});
    try {const controller=new C(),world={...f.world,queryBatch:b},result=controller.aim(.1,f.ship,mount,world);return {reads,state:snapshot(controller,{...f,mount},result)};}
    finally {Object.defineProperty(f.target,'teamId',descriptor);b.close();}
  };
  if(Before)equal(interruptRun(Current),interruptRun(Before),'closed proof falls back during scan');else interruptRun(Current);
  // An existing selected target still goes through canTarget on every aim call;
  // the qualified-list route must not grant permission to a tracker by identity.
  const tracker=new Current(),trackedBatch=roster.begin(f.ship,f.world);ok(trackedBatch);let trackedReads=0;
  const reader=trackedBatch.canTarget;trackedBatch.canTarget=function(s){trackedReads++;return reader.call(this,s);};
  const world={...f.world,queryBatch:trackedBatch};const acquired=tracker.aim(.1,f.ship,mount,world);
  if(acquired){const n=trackedReads;tracker.aim(1/60,f.ship,mount,world);ok(trackedReads>n,'current tracker is not a qualified-list iteration');}
  trackedBatch.close();roster.close();
  return {checks,comparisons,beforeQueries,afterQueries,frozenReference:!!Before,closedProofReleasesRoster:true};
}
