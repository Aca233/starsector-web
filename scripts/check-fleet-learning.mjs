import assert from 'node:assert/strict';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
import { summarizeFleetEvaluation, fleetPromotionGate } from './ai/fleet-evaluation.mjs';
const l = await loadCombatLab();
let passed = 0;
const test = (name, check) => { check(); console.log(`ok ${++passed} - ${name}`); };
const make = (side = 0, seconds = 3) => new l.FleetCombatLab(l.FLEET_SCENARIOS.train[0], 731, side, seconds);
test('v2 rejects v1 artifacts and observes target hull and local visible pressure', () => {
  const p=l.emptyCombatPolicy(); assert.equal(p.version,2); assert.ok(l.validateCombatPolicy(p));
  assert.equal(l.validateCombatPolicy({...p,version:1,observation:'flux-hull-window-mobility-v1'}),false);
  const env=make(), ship=env.learners[0], target=ship.currentTargetShip;
  assert.ok(target); const original=l.combatObservation(ship,target);
  target.hullHp=target.maxHullHp*.2; assert.notEqual(l.combatObservation(ship,target),original);
  target.hullHp=target.maxHullHp;
  const extra=new l.Ship('pressure',l.modManager.requireShip('onslaught'),false,ship.pos.clone().add(new l.Vector2(50,0)),0);
  extra.visibilityMask=0; ship.combatShips=[...env.engine.ships,extra];
  assert.equal(l.combatObservation(ship,target),original,'hidden enemy cannot affect policy features');
  extra.visibilityMask=3; assert.notEqual(l.combatObservation(ship,target),original);
});
test('disabled deployment adds no fleet observation scan; invalid action overrides reject', () => {
  const ship=new l.Ship('own',l.modManager.requireShip('wolf'),true), target=new l.Ship('enemy',ship.spec,false);
  ship.fireControlMode='AI';ship.currentTargetShip=target;
  ship.combatShips=new Proxy([], {get(){throw Error('disabled inference must not read the roster');}});
  assert.equal(l.shipPolicyAction(ship,target),'BALANCED');
  assert.throws(()=>l.setTrainingAction(ship,'UNKNOWN'));
});
test('train, validation and holdout have disjoint scenario IDs and seed streams', () => {
  const ids=new Set(), seeds=new Set();
  for(const split of ['train','validation','holdout']) {
    for(const s of l.FLEET_SCENARIOS[split]){assert.ok(!ids.has(s.id));ids.add(s.id);}
    for(let i=0;i<100;i++){const c=l.fleetCase(split,i,91);assert.ok(!seeds.has(c.seed));seeds.add(c.seed);}
  }
  const trainedHulls=new Set(l.FLEET_SCENARIOS.train.flatMap(s=>s.teams.flat()));
  assert.ok(l.FLEET_SCENARIOS.holdout.some(s=>s.teams.flat().some(h=>!trainedHulls.has(h))));
});
test('v2 fleet observations agree with owner-worker read-only snapshots', () => {
  const scenario={id:'owner-observation',teams:[['onslaught','onslaught'],['onslaught','onslaught']],formation:'WIDE'};
  const env=new l.FleetCombatLab(scenario,72,0,2), e=env.engine;
  env.opponents[0].hullHp*=.25;env.opponents[0].flux.softFlux=env.opponents[0].flux.maxFlux*.8;
  const ship=env.learners[0];ship.currentTargetShip=env.opponents[0];ship.combatShips=e.ships;
  const ais=[env.playerAI,...e.getNativeAIs()], publisher=new l.Publisher(e.ships,ais), owner=new l.Owner(publisher.models,[0]);
  owner.apply(publisher.publish(e,ais,1/60));
  // Inspect only in the lab: these are the exact scalar views consumed by the owner.
  const remote=owner.owned.get(0).ship;remote.combatShips=owner.views;
  assert.equal(l.combatObservation(remote,remote.currentTargetShip),l.combatObservation(ship,ship.currentTargetShip));
  assert.equal(l.observedPressure(remote,remote.currentTargetShip),l.observedPressure(ship,ship.currentTargetShip));
});
test('the learner cannot issue actions to opponents, and the opponent stays original AI', () => {
  for(const side of [0,1]) {
    const env=make(side), before=env.engine.combatTime;
    assert.throws(()=>env.step(new Map([[env.opponents[0].id,'PRESSURE']])));assert.equal(env.engine.combatTime,before);
    env.step(new Map(env.learners.map(s=>[s.id,'PRESSURE'])));
    for(const enemy of env.opponents)assert.equal(l.shipPolicyAction(enemy),'BALANCED');
    for(const learner of env.learners)assert.equal(l.shipPolicyAction(learner),'PRESSURE');
  }
});
test('a flagship loss does not terminate a surviving fleet or disappear from hull accounting', () => {
  const env=make(), flag=env.learners[0];flag.hullHp=0;
  assert.equal(env.done,false); const summary=env.summary();
  assert.equal(summary.ownLost,1);assert.ok(summary.ownHull>0&&summary.ownHull<1);assert.equal(summary.outcome,'timeout');
  assert.equal(env.step(new Map()).done,false);assert.equal(flag.isDead,true,'native destruction must mark the flagship dead');
  assert.equal(flag.system.disabled,true,'native destruction must disable its system');
});
test('all splits and both sides run real physics with finite team rewards', () => {
  for(const split of ['train','validation','holdout'])for(const scenario of l.FLEET_SCENARIOS[split])for(const side of [0,1]){
    const env=new l.FleetCombatLab(scenario,42,side,1);
    const next=env.step(new Map(env.learners.map(s=>[s.id,'BALANCED'])));
    assert.ok(Number.isFinite(next.reward));assert.ok(next.done);assert.ok(env.summary().checksum.every(Number.isFinite));
    assert.throws(()=>env.step(new Map()));
  }
});
test('seeded multi-ship action schedules reproduce rewards, hull, flux and positions exactly', () => {
  const run=()=>{const env=make(1,4);let reward=0;
    while(!env.done)reward+=env.step(new Map(env.learners.filter(s=>!s.isDead).map((s,i)=>[s.id,i?'FINISH':'PRESSURE']))).reward;
    return {...env.summary(),reward};};
  assert.deepEqual(run(),run());
});
const summary=(outcome,score,extra={})=>({scenario:'synthetic',outcome,score,ownHull:.5,enemyHull:.5,reward:0,nonBaselineDecisions:10,...extra});
test('evaluation counts timeouts separately; mirrored pairs are confidence units', () => {
  const pairs=Array.from({length:12},(_,i)=>({scenario:'synthetic',seed:i,matches:[0,1].map(()=>({
    baseline:summary('timeout',.5),candidate:summary('timeout',.5)}))}));
  const stats=summarizeFleetEvaluation(pairs,new l.SimulationRandom(3));
  assert.equal(stats.mirrorPairs,12);assert.equal(stats.battles,24);assert.equal(stats.candidate.win,0);assert.equal(stats.candidate.timeout,24);
  assert.deepEqual(stats.scoreGain95Interval,[0,0]);assert.equal(fleetPromotionGate(stats).passed,false);
});
test('screening cannot pass with no learned actions or with a material scenario regression', () => {
  const pairs=Array.from({length:12},(_,i)=>({scenario:'synthetic',seed:i,matches:[0,1].map(()=>({
    baseline:summary('loss',0),candidate:summary('win',1)}))}));
  const stats=summarizeFleetEvaluation(pairs,new l.SimulationRandom(3));
  assert.deepEqual(stats.scoreGain95Interval,[1,1]);assert.equal(fleetPromotionGate(stats).passed,true);
  assert.equal(fleetPromotionGate(stats).deployment,'NOT_DEPLOYED');
  assert.equal(fleetPromotionGate({...stats,nonBaselineDecisions:0}).passed,false);
  assert.equal(fleetPromotionGate({...stats,byScenario:{bad:{meanScoreGain:-.2}}}).passed,false);
});
console.log(`PASS ${passed} fleet-learning checks`);
