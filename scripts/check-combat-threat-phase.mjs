// Reuses the existing 2-player/20-AI, three-hull LAN scenario. No desktop or release build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { build } from 'esbuild';

const out = path.resolve(process.env.THREAT_PHASE_OUT ?? 'artifacts/combat-threat-phase-20261002');
fs.mkdirSync(out, { recursive: true });
const queryCompare = process.env.THREAT_QUERY_COMPARE === 'true';
const worldCompare = process.env.COMBAT_WORLD_COMPARE === 'true';
const aiCompare = process.env.COMBAT_AI_INTENT_COMPARE === 'true';
const motionCompare = process.env.COMBAT_NUMERIC_MOTION_COMPARE === 'true';
const stageKernelCompare=process.env.COMBAT_STAGE_KERNEL_COMPARE==='true';
const fireFlightCompare=process.env.COMBAT_FIRE_FLIGHT_REWRITE_COMPARE==='true';
const decisionCompare=process.env.COMBAT_DECISION_PIPELINE_COMPARE==='true'||fireFlightCompare||stageKernelCompare;
const acquisitionCompare = process.env.COMBAT_NUMERIC_ACQUISITION_COMPARE === 'true'||decisionCompare;
const ownedAcquisition=process.env.COMBAT_WORKER_OWNED_COMPARE==='true'||decisionCompare;
assert.ok(!ownedAcquisition||acquisitionCompare,'Owned acquisition comparison requires both algorithm arms');
const coreCompare = process.env.COMBAT_STATE_CORE_COMPARE === 'true';
const readCompare = process.env.COMBAT_QUERY_READS_COMPARE === 'true';
const boundariesOnly = process.env.COMBAT_WORLD_BOUNDARIES_ONLY === 'true';
const exports = `
export {stageKernelWork,DecisionReadPlane,bindDecisionReadWorld} from './src/engine/ai/DecisionReadPlane';
export {positionScorer} from './src/engine/ai/TacticalPositioningKernel';
export {createLanWorld} from './src/network/LanWorld';
export {WeaponThreatFrame} from './src/engine/ai/WeaponThreatFrame';
export {WeaponThreatWorkers} from './src/engine/ai/WeaponThreatWorkers';
export {forecastWeaponPartition} from './src/engine/ai/WeaponThreatKernel';
export {assessThreats} from './src/engine/ai/ThreatAssessment';
export {CombatAuthority} from './src/engine/runtime/CombatAuthority';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
export {createBundledPresetDesign} from './src/studio/BundledPresetDesign';
export {AcquisitionRangeIndex} from './src/engine/ai/AcquisitionRangeIndex';
export {PreAimRangeIndex} from './src/engine/ai/PreAimRangeIndex';
export {FireControlQueryBatch,FireControlQueryRoster,hasNativeAcquisitionWorld} from './src/engine/ai/FireControlQueryBatch';
export {Vector2} from './src/engine/math/Vector2';
export {shipMotionStats,advanceMotionWithStats} from './src/engine/simulation/systems/ShipMotion';
export {advanceMotionRow,MOTION_WIDTH,MotionField,MotionFlag} from './src/engine/simulation/systems/MotionKernel';
export {CombatKinematicsStore,kinematicsForWorld} from './src/engine/simulation/CombatKinematicsStore';
export {hasNumericMotionBoundary} from './src/engine/simulation/Ship';
export {combatWeaponRange,combatProjectileSpeed} from './src/engine/simulation/WeaponRange';
export {solveWeaponAim} from './src/engine/ai/AutofireController';
export {weaponMuzzle} from './src/engine/ai/FireControlGeometry';
export {CombatFireFrame} from './src/engine/ai/CombatFireFrame';
export {ShipStepBatch} from './src/engine/simulation/ShipStepBatch';
export {gravityWeapons} from './src/engine/content/GravityArmory';
export {CombatAIPhase} from './src/engine/ai/CombatAIPhase';
export {planFleetTactics,planFleetTacticsNumerically,sameFleetPlan} from './src/engine/ai/FleetTactics';
export {numericFleetWork} from './src/engine/ai/NumericalFleetPlanner';
export {CombatDecisionScene,decisionSceneWork} from './src/engine/ai/CombatDecisionScene';
export {findCombatHostile} from './src/engine/runtime/CombatHostileQuery';
export {CapitalShipAI} from './src/engine/ai/CapitalShipAI';
export {solveSteering} from './src/engine/ai/SteeringKernel';
export {driveVelocity} from './src/engine/ai/TacticalNavigation';
export {selectModuleFireControl} from './src/engine/runtime/ModuleFireControl';
export {NumericAcquisitionTree,fireRewriteWork} from './src/engine/ai/NumericAcquisitionTree';
export {FlightDecisionRoster,flightRewriteWork} from './src/engine/simulation/systems/FlightDecisionRoster';
export {steerFlight,incomingFlightThreat} from './src/engine/simulation/systems/FighterTactics';
export {NumericAcquisitionFrame,numericAcquisitionMetrics} from './src/engine/ai/NumericAcquisitionFrame';
export {acquisitionSegmentEntry,acquireNumericShip,ACQUISITION_WIDTH,AcquisitionField,AcquisitionRole} from './src/engine/ai/WeaponAcquisitionKernel';
export {shipSegmentEntry} from './src/engine/ai/FireControlGeometry';
export {AutofireController,predictWeaponIntercept,bindNativeFireQueries} from './src/engine/ai/AutofireController';
export {CombatStateCore,CoreField,stateCoreForWorld,existingStateCore} from './src/engine/simulation/CombatStateCore';
export {CoreCollisionIndex} from './src/engine/simulation/CoreCollisionIndex';
export {ShipCollisionSystem} from './src/engine/simulation/systems/ShipCollisionSystem';
export {Ship,hasNativeStateCoreReaders} from './src/engine/simulation/Ship';
export {captureMotion} from './src/network/CaptureMotion';
export {CombatQueryReads,queryMotionStats,querySourceModifiers} from './src/engine/ai/CombatQueryReads';
export {combatProfile} from './src/engine/ai/ShipCombatProfile';
export {forecastCombatPosition,chooseCombatVelocity} from './src/engine/ai/TacticalPositioning';
`;
const api = {};
for (const enabled of [false, true]) {
  const filename = path.join(out, enabled ? 'stage.mjs' : 'live.mjs');
  await build({ stdin: { contents: exports, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node',
    outfile: filename, logLevel: 'warning', define: { '__LAN_BUILD_ID__': JSON.stringify('threat-phase-check'),
      'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, VITE_COMBAT_THREAT_PHASE: String(acquisitionCompare || coreCompare || readCompare || motionCompare || aiCompare || worldCompare || queryCompare || enabled),
        VITE_COMBAT_STAT_TABLE: String(acquisitionCompare || coreCompare || readCompare || motionCompare || aiCompare || worldCompare || enabled), VITE_COMBAT_ACQUISITION_INDEX: String(acquisitionCompare || coreCompare || readCompare || motionCompare || aiCompare || worldCompare || enabled),
        VITE_COMBAT_PHASED_WORLD: String(acquisitionCompare || coreCompare || readCompare || motionCompare || aiCompare || worldCompare && enabled),
        VITE_COMBAT_AI_INTENTS: String(acquisitionCompare || coreCompare || readCompare || motionCompare || aiCompare && enabled), VITE_COMBAT_NUMERIC_MOTION: String(motionCompare && enabled), VITE_COMBAT_QUERY_READS: String(acquisitionCompare || coreCompare || readCompare && enabled), VITE_COMBAT_STATE_CORE: String(coreCompare && enabled), VITE_COMBAT_NUMERIC_ACQUISITION: String(decisionCompare||acquisitionCompare && enabled), VITE_COMBAT_DECISION_PIPELINE:String(fireFlightCompare||decisionCompare&&enabled), VITE_COMBAT_FIRE_FLIGHT_REWRITE:String(fireFlightCompare&&enabled), ...(stageKernelCompare?{
          VITE_COMBAT_THREAT_PHASE:'true',VITE_COMBAT_STAT_TABLE:'true',VITE_COMBAT_ACQUISITION_INDEX:'true',
          VITE_COMBAT_PHASED_WORLD:'true',VITE_COMBAT_AI_INTENTS:'true',VITE_COMBAT_QUERY_READS:'true',
          VITE_COMBAT_STATE_CORE:'false',VITE_COMBAT_NUMERIC_MOTION:'false',
          VITE_COMBAT_NUMERIC_ACQUISITION:undefined,VITE_COMBAT_DECISION_PIPELINE:undefined,VITE_COMBAT_FIRE_FLIGHT_REWRITE:undefined,
          VITE_COMBAT_STAGE_KERNEL:String(enabled)}:{}) }) } });
  api[enabled ? 'stage' : 'live'] = await import(pathToFileURL(filename).href);
}
await build({ entryPoints: ['src/engine/ai/weapon-threat.worker.ts'], bundle: true, format: 'esm', platform: 'node',
  outfile: path.join(out, 'worker.mjs'), logLevel: 'warning' });
fs.writeFileSync(path.join(out, 'worker-bootstrap.mjs'), `import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(message,transfers)=>parentPort.postMessage(message,transfers)};
await import('./worker.mjs'); parentPort.on('message',data=>self.onmessage({data}));`);
class BrowserWorker {
  constructor(url) {
    assert.ok(url.pathname.endsWith('/weapon-threat.worker.ts'));
    this.worker = new NodeWorker(pathToFileURL(path.join(out, 'worker-bootstrap.mjs')));
    this.worker.on('message', data => this.onmessage?.({ data }));
    this.worker.on('error', error => this.onerror?.({ message: error.message }));
  }
  postMessage(message) { this.worker.postMessage(message); }
  terminate() { void this.worker.terminate(); }
}
globalThis.Worker = BrowserWorker;
Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: 8 }, configurable: true });
globalThis.crossOriginIsolated = true;
const hulls = ['web_zhuyuan', 'web_gloriana', 'web_sc2_hyperion'];
const fleet = Array.from({ length: 20 }, (_, index) => hulls[index % 3]);
const match = { id: 'threat-phase-check', hostId: 'host', seed: 917, snapshotHz: 60,
  players: [{ id: 'host', name: 'Host', seat: 0, team: 0, hull: hulls[0] }, { id: 'guest', name: 'Guest', seat: 1, team: 1, hull: hulls[0] }],
  options: { assignment: 'teams', battleSize: 3200, deploymentLimit: 1600, aiHulls: [fleet.slice(0, 10), fleet.slice(10)] } };
function world(module, profile = 'standard') {
  const designs = Object.fromEntries(hulls.map(hull => [hull, module.createBundledPresetDesign(hull)]));
  const { engine, controlled } = module.createLanWorld({ ...match,
    players: match.players.map(player => ({ ...player, design: designs[player.hull] })),
    options: { ...match.options, aiDecisionProfile: profile, aiLoadouts: designs } });
  for (const ship of controlled.values()) { engine.externallyControlledShipIds.add(ship.id); ship.fireControlMode = 'MANUAL'; }
  if(ownedAcquisition)module.FireControlQueryRoster.ownForWorker(engine);
  return engine;
}
function scene(engine) { return { ships: engine.ships, projectiles: engine.projectiles, beams: engine.beams, asteroids: engine.asteroids }; }
function comparable(threat) { return threat.threats.map(row => [row.kind, row.sourceId, row.eta, row.damage, row.shieldFlux, row.direction]); }
const checks = [], performanceRows = [];
const report = () => fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ node: process.version, ownership:ownedAcquisition?'Existing private cloned-command authority Worker contract in both arms':'Generic mutable inline world in both arms', comparison: stageKernelCompare?'Final default private authority off/on stage read plane, demand fleet rows, scalar root/module positioning and captured fire provenance; all older accepted paths unchanged':fireFlightCompare?'Same accepted private root/module decision pipeline and numeric fire acquisition in both arms; only post-motion fire relations/tree and live-status flight/scalar execution differ':decisionCompare?'Same existing private authority: per-observer live relationships/fleet allocation versus shared whole-decision scene and numerical fleet assignment; numerical fire-control identical in both arms':acquisitionCompare ? 'Same normal object world: native acquisition/ray geometry vs numerical acquisition kernel (failed state core OFF)' : coreCompare ? 'Same phased/AI world: object ownership vs canonical state core and live collision index' : readCompare ? 'Same phased/AI world: repeated live reads vs synchronous query-read reuse' : motionCompare ? 'Same phased world and AI intents: object motion vs resident numeric motion' : aiCompare ? 'Phased world with serial AI writes vs common AI intent phase' : worldCompare ? 'Interleaved world vs global phased world' : queryCompare ? 'Previous shared phase vs acquisition/stat tables' : 'Legacy live vs shared phase', checks, performanceRows,
  scope: 'Existing LAN world, real Node worker_threads with browser adapter; no renderer, pacing or network. Not FPS or input latency.' }, null, 2));
function pass(name) { checks.push(name); console.log('ok ' + name); report(); }
if(fireFlightCompare) {
  const e=world(api.stage),ships=e.ships,roster=api.stage.FlightDecisionRoster.create(e,ships);assert.ok(roster);
  const craft=e.fighters[0]??ships.find(s=>s.spec.hullSize==='FIGHTER');assert.ok(craft);
  for(let i=0;i<32;i++) {
    const other=ships[(i*7)%ships.length];other.isDead=i%5===0;other.isRetreated=i%7===0;other.isDocked=i%3===0;other.pos.set(i*43-500,900-i*61);
    const live=ships.filter(s=>!s.isRetreated);
    for(const ship of [craft,e.playerShip,e.enemyShip])for(const id of [undefined,other.id])assert.equal(roster.hostile(ship,id),api.stage.findCombatHostile(ship,id,live),'Flight relationships must use live death/retreat/position/current target');
    assert.deepEqual(roster.fireShips(craft,other,ships),[...new Set(ships.filter(s=>s.teamId===craft.teamId||s===other))],'Restricted firing keeps original source identity and ordering');
    const point=new api.stage.Vector2(i*130-1700,i*37-900),velocity=new api.stage.Vector2(i*7-80,i*13-150);
    const legacy=world(api.live).fighters[0];assert.ok(legacy);
    for(const c of [legacy,craft]){c.pos.set(i*19-240,i*-53+30);c.vel.set(i*11-33,i*23-78);c.facingRad=i*.43;c.angularVelRad=i*.03;}
    api.live.steerFlight(legacy,point,velocity,i%2?35:100);api.stage.steerFlight(craft,point,velocity,i%2?35:100);
    assert.deepEqual([craft.turnInput,craft.brakeInput,craft.throttle,craft.strafeInput],[legacy.turnInput,legacy.brakeInput,legacy.throttle,legacy.strafeInput],'Scalar arrival/braking retains exact controls');
    const projectiles=Array.from({length:16},(_,j)=>({id:j,pos:new api.stage.Vector2(j*83-500,j*17-90),vel:new api.stage.Vector2(180-j*30,40-j*7),radius:8,teamId:j%2,isRocket:true,rangeRemaining:1000,hitpoints:30,isFlare:j%9===0,collisionDisabled:j%13===0}));
    // The native carrier and craft are the same scalar inputs in both implementations.
    assert.equal(api.stage.incomingFlightThreat(craft,e.playerShip,2000,projectiles),api.live.incomingFlightThreat(craft,e.playerShip,2000,projectiles),'Pure ordered closest-approach scoring');
  }
  roster.close();assert.equal(roster.hostile(craft),undefined);assert.equal(roster.fireShips(craft,null,ships),undefined);
  assert.equal(api.stage.FlightDecisionRoster.create(world(api.live),ships),undefined,'Foreign/unowned inline fleet cannot borrow flight relations');
  pass('Flight scalar controls/threat scores and restricted roster order agree; live docking/death/retreat/position changes and closed/foreign lifetime are enforced');
  const left=world(api.live),right=world(api.stage);
  for(const engine of [left,right])for(const [i,ship] of engine.ships.entries()){ship.pos.set((i%17-8)*470,Math.floor(i/17)*330-1900);ship.vel.set((i%5-2)*113,(i%7-3)*71);ship.visibilityMask=3;ship.visibilityOverflow='*';}
  const old=api.live.NumericAcquisitionFrame.create(left.ships,left),numeric=api.stage.NumericAcquisitionFrame.create(right.ships,right);assert.ok(old&&numeric);
  const ls=left.ships,rs=right.ships;
  for(let i=0;i<48;i++) {
    const a=ls[i%ls.length],b=rs[i%rs.length];
    for(const [j,mount] of b.weapons.entries()) {
      const q={origin:b.pos,range:[0,100,600,1200,3000][i%5],speed:[1,90,700][i%3],delay:[0,.1,2][i%3]};
      // Reversed/subset lists cannot inherit union-frame permission or tie order.
      const sources=i%2?[rs.filter((_,k)=>k%3!==0).toReversed(),ls.filter((_,k)=>k%3!==0).toReversed()]:[rs,ls];
      const expected=old.scan(a,a.weapons[j],sources[1],q),actual=numeric.scan(b,mount,sources[0],q);
      assert.deepEqual(actual,expected,'Pure numeric broad phase cannot lose/reorder an exact acquired contact');
      assert.deepEqual(numeric.preAim(b,mount,sources[0],q),old.preAim(a,a.weapons[j],sources[1],q),'Numeric nearest/current preference identical');
    }
  }
  for(let i=0;i<rs.length;i++){assert.equal(numeric.phaseStatus(rs[i]),rs[i].isPhased);for(let j=0;j<rs.length;j++)assert.equal(numeric.friendlyBlocker(rs[i],rs[j]),rs[j]!==rs[i]&&rs[j].teamId===rs[i].teamId&&!rs[j].isDead&&!rs[j].isPhased&&(rs[j].assemblyRoot!==rs[i].assemblyRoot||!!rs[j].spec.sourceHullTraits?.includes('do_not_fire_through')));}
  const mount=rs[0].weapons.find(w=>!w.spec.isGuided);assert.ok(mount);
  const index=rs[0].weapons.indexOf(mount),otherMount=ls[0].weapons[index],q={origin:rs[0].pos,range:1000,speed:700,delay:0};
  const guided=mount.spec.isGuided,otherGuided=otherMount.spec.isGuided;
  mount.spec.isGuided=otherMount.spec.isGuided=true;
  assert.deepEqual(numeric.scan(rs[0],mount,rs,q),old.scan(ls[0],otherMount,ls,q),'Unsealed diagnostic frames continue reading mutable weapon flags');
  mount.spec.isGuided=guided;otherMount.spec.isGuided=otherGuided;
  numeric.close();old.close();assert.equal(numeric.phaseStatus(rs[0]),undefined);assert.equal(numeric.targetAllowed(rs[0],rs[1]),undefined);
  pass('Numerical acquisition hierarchy agrees with full exact scan for beams/missiles/arcs, delayed fast targets, subset/reversed scopes; post-motion phase/blocker relations and closed fallback agree');
}
if(decisionCompare) {
  const e=world(api.stage),ships=e.ships,manual=new Set(e.externallyControlledShipIds);
  for(let scene=0;scene<12;scene++) {
    for(let i=0;i<ships.length;i++) {
      const s=ships[i];s.pos.set((i%11-5)*330+(scene%3)*17,Math.floor(i/11)*210-1600);
      s.vel.set((i%5-2)*23,(i%7-3)*19);s.visibilityMask=3;s.visibilityOverflow='*';
      s.flux.softFlux=s.flux.maxFlux*((scene+i)%9)/10;s.flux.hardFlux=0;
      s.currentTargetShip=ships[(i+scene*7+1)%ships.length];
      s.fighterRecall=(scene+i)%7===0;
    }
    const orders=new Map(),kinds=['ENGAGE','AVOID','ESCORT','DEFEND','WAYPOINT'];
    for(let i=0;i<Math.min(ships.length,10);i++)if((i+scene)%3!==0)orders.set(ships[i].id,{id:'decision-order-'+i,type:kinds[(i+scene)%kinds.length],targetShipId:ships[(i+13)%ships.length].id,targetPos:{x:scene*39,y:scene*-73},issuedTime:0});
    const old=api.stage.planFleetTactics(ships,orders,manual),numeric=api.stage.planFleetTacticsNumerically(ships,orders,manual);
    assert.ok(numeric);assert.deepEqual([...numeric],[...old],'Exact numerical fleet claims, visibility, manual/order, backoff/cover and lane case '+scene);
  }
  pass('Whole numerical fleet assignment agrees exactly through 12 dense actual mixed-unit/order/flux/recall/position cases, preserving claim/sum/tie/lane order');
  const frame=api.stage.CombatDecisionScene.create(e,ships);assert.ok(frame);
  for(const ship of ships)for(const id of [undefined,ships[ships.length-1].id])assert.equal(frame.hostile(ship,id),api.stage.findCombatHostile(ship,id,ships),'Exact actual team/ordered/current/nearest hostile relation');
  for(let i=0;i<ships.length;i+=3) {
    const ship=ships[i],horizon=3+(i%4),ownRadius=Math.max(ship.spec.collisionRadius,ship.shield.isActive&&ship.shield.type!=='PHASE'?ship.shield.radius:0),stats=ship.getMotionStats();
    const selected=frame.navigation.select(ships,ship.pos.x,ship.pos.y,ownRadius+8,stats.maxSpeed,ship.vel.length(),horizon);
    assert.ok(selected);assert.deepEqual(selected,selected.toSorted((a,b)=>ships.indexOf(a)-ships.indexOf(b)),'Original navigation candidate order');
    for(const other of ships) {
      if(other.assemblyRoot===ship.assemblyRoot||other.isDead||other.isPhased||other.spec.hullSize==='FIGHTER')continue;
      const r=ownRadius+Math.max(other.spec.collisionRadius,other.shield.isActive&&other.shield.type!=='PHASE'&&!(other.shield.voidShield&&other.teamId===ship.teamId)?other.shield.radius:0)+8;
      if(ship.pos.distanceTo(other.pos)<=r+(stats.maxSpeed+ship.vel.length()+other.vel.length())*horizon)assert.ok(selected.includes(other),'Conservative per-body tree cannot omit an original obstacle');
    }
  }
  assert.equal(frame.navigation.select(ships,0,0,100,100,0,Infinity),undefined,'Exceptional spatial input falls back');
  const saved=ships[1];ships[1]=ships[2];assert.equal(frame.matches(ships),false);assert.equal(frame.navigation.select(ships,0,0,100,100,0,3),undefined);ships[1]=saved;
  const foreign=world(api.stage).playerShip;assert.equal(frame.includes(foreign),false);
  frame.close();assert.equal(frame.matches(ships),false);assert.equal(frame.source(saved.id),undefined);assert.equal(frame.hostile(saved),undefined);assert.equal(frame.navigation.select(ships,0,0,100,100,0,3),undefined);
  pass('Whole decision scene retains exact hostile relations; per-body spatial exclusion is conservative/order-preserving, roster replacements/foreign bodies/nonfinite inputs reject, and effects cannot use a closed scene');
}
if (acquisitionCompare) {
  const left=world(api.live),right=world(api.stage);
  for(const engine of [left,right]) {
    engine.ships.forEach((ship,i)=> {
      if(!ship.isAttachedModule)ship.pos.set((i%7)*350-900,Math.floor(i/7)*280-1200);
      ship.vel.set((i%5-2)*37,(i%3-1)*83);ship.facingRad=(i%9-4)*.7;ship.visibilityMask=3;ship.visibilityOverflow='*';
      if(ship.shield.type!=='NONE'&&ship.shield.type!=='PHASE') {
        ship.shield.isActive=true;ship.shield.currentArcDeg=[0,5,30,180,359,360][i%6];ship.shield.facingAngleRad=(i%7)*.43;
      }
    });
    for(const root of engine.capitalShips)root.syncModuleTree();
  }
  const numerical=api.stage.NumericAcquisitionFrame.create(right.ships,stageKernelCompare?right:undefined);
  assert.ok(numerical,'Actual native armed mixed roster must admit numerical acquisition');
  for(let i=0;i<1536;i++) {
    const row=i%right.ships.length,a=left.ships[row],b=right.ships[row];
    const radius=b.shield.radius+b.spec.collisionRadius+200,angle=i*2.399963229728653;
    const sx=b.pos.x+Math.cos(angle)*radius,sy=b.pos.y+Math.sin(angle)*radius;
    const ex=b.pos.x+Math.cos(angle+.3+(i%5))*radius*.3,ey=b.pos.y+Math.sin(angle+.3+(i%5))*radius*.3;
    const start=new api.live.Vector2(sx,sy),end=new api.live.Vector2(i%23===0?sx:ex,i%23===0?sy:ey);
    assert.equal(numerical.segment(b,start.x,start.y,end.x,end.y,i%7===0),api.live.shipSegmentEntry(a,start,end,i%7===0),'Exact numeric hull/partial-shield contact '+i);
  }
  pass('Numerical swept hull/shield geometry matches 1536 actual authored polygon/circle/offset/partial-shield, zero-length and ignore-shield cases exactly');
  const oldFrame=new api.live.CombatFireFrame(left.ships,undefined,stageKernelCompare?left:undefined),newFrame=new api.stage.CombatFireFrame(right.ships,undefined,stageKernelCompare?right:undefined);
  assert.ok(newFrame.numeric);
  for(let row=0;row<right.ships.length;row++) {
    const a=left.ships[row],b=right.ships[row];a.currentTargetShip=left.enemyShip;b.currentTargetShip=right.enemyShip;
    const ow={ships:left.ships,missiles:[],asteroids:[],fireFrame:oldFrame},nw={ships:right.ships,missiles:[],asteroids:[],fireFrame:newFrame};
    for(let wi=0;wi<b.weapons.length;wi++) {
      const am=a.weapons[wi],bm=b.weapons[wi];
      const before=api.live.AutofireController.prototype.preAim.call(a.weaponControl.autofire,a,am,ow);
      const after=api.stage.AutofireController.prototype.preAim.call(b.weaponControl.autofire,b,bm,nw);
      assert.deepEqual(after?[after.x,after.y]:null,before?[before.x,before.y]:null,'Exact whole numeric preAim mount '+row+'/'+wi);
    }
  }
  assert.ok(api.stage.numericAcquisitionMetrics.preAim>0,'These comparisons must actually execute numeric preAim, not a spec-admission fallback');
  pass('Whole numerical preAim algorithm agrees for every mount in the armed mixed fleet, including current-target preference, target roles, nearest order and lead point');
  const ship=right.playerShip,mount=ship.weapons.find(m=>m.mountType==='TURRET'&&!m.spec.aiHints?.includes('PD_ONLY')),target=right.enemyShip;
  assert.ok(mount);
  mount.arcDeg=360;
  const q={origin:target.pos.clone(),range:100000,speed:1000,delay:.3};
  const full=newFrame.numeric.scan(ship,mount,right.ships,q);
  assert.ok(full&&full.length>0);
  assert.deepEqual(newFrame.numeric.scan(ship,mount,[ship],q),[],'Union geometry cannot widen target permission');
  const mutable=[target];assert.ok(newFrame.numeric.scan(ship,mount,mutable,q));mutable[0]=ship;
  assert.deepEqual(newFrame.numeric.scan(ship,mount,mutable,q),[],'Same-length roster replacement cannot reuse stale permission');
  assert.equal(newFrame.numeric.preAim(ship,mount,[ship],q),null);
  const invalid=newFrame.numeric.scan(ship,mount,[target],{...q,range:Infinity});assert.equal(invalid,undefined,'Uncertain query must fall back');
  const nativeSource=right.ships;
  const nativeBatch=api.stage.FireControlQueryBatch.fromRoster(ship,nativeSource,false,true,newFrame);
  const nativeWorld={ships:nativeSource,missiles:[],asteroids:[],fireFrame:newFrame,queryBatch:nativeBatch};
  assert.equal(api.stage.hasNativeAcquisitionWorld(nativeWorld,ship),true);
  let policyCalls=0;
  nativeBatch.canTarget=function(){policyCalls++;return false;};
  assert.equal(api.stage.hasNativeAcquisitionWorld(nativeWorld,ship),false);assert.equal(policyCalls,0,'Admission cannot invoke custom permission');
  delete nativeBatch.canTarget;
  nativeBatch.queryBlockers=function(){policyCalls++;return [];};
  assert.equal(api.stage.hasNativeAcquisitionWorld(nativeWorld,ship),false);assert.equal(policyCalls,0,'Unknown blocker callbacks cannot enter snapshot geometry');
  delete nativeBatch.queryBlockers;
  const customBudget={estimate(){policyCalls++;return 0;},penalty(){policyCalls++;return 0;}};
  assert.equal(api.stage.hasNativeAcquisitionWorld({...nativeWorld,fireBudget:customBudget},ship),false);assert.equal(policyCalls,0);
  const frameGetter={ships:right.ships,get fireFrame(){policyCalls++;return newFrame;}};
  assert.equal(api.stage.hasNativeAcquisitionWorld(frameGetter,ship),false);assert.equal(policyCalls,0);
  nativeBatch.close();
  const spec=mount.spec,saved=Object.getOwnPropertyDescriptor(spec,'isGuided');
  Object.defineProperty(spec,'isGuided',{configurable:true,get(){policyCalls++;return false;}});
  assert.equal(newFrame.numeric.scan(ship,mount,[target],q),undefined);assert.equal(policyCalls,0,'Used-field getter rejects without invocation');
  if(saved)Object.defineProperty(spec,'isGuided',saved);else delete spec.isGuided;
  spec.isGuided=false;assert.ok(Array.isArray(newFrame.numeric.scan(ship,mount,[target],q)),'Mutable scalar weapon specs are admitted');
  if(saved)Object.defineProperty(spec,'isGuided',saved);else delete spec.isGuided;
  pass('Custom permission/budget/frame getters cannot bypass native policy; mutable weapon scalars work and unknown used-field getters fall back without invocation');
  newFrame.close();oldFrame.close();numerical.close();
  assert.throws(()=>newFrame.numeric.scan(ship,mount,right.ships,q),/Closed/);
  pass('Actual source roster, same-length replacement, current-target scoping, closed lifetime and nonfinite-query fallback are enforced');
  const custom=world(api.stage),vector=custom.playerShip.pos;let calls=0;
  const x=vector.x;Object.defineProperty(vector,'x',{get(){calls++;return x;},enumerable:true,configurable:true});
  assert.equal(api.stage.NumericAcquisitionFrame.create(custom.ships),undefined);assert.equal(calls,0);
  const overridden=world(api.stage),original=overridden.playerShip.getShieldCenter;
  overridden.playerShip.getShieldCenter=function(){calls++;return original.call(this);};
  assert.equal(api.stage.NumericAcquisitionFrame.create(overridden.ships),undefined);assert.equal(calls,0);
  pass('Unknown vector getters and native-geometry overrides retain the old algorithm without invoking their callbacks during admission');
  const closed=world(api.stage);api.stage.FireControlQueryRoster.ownForWorker(closed);
  const ownedFrame=api.stage.NumericAcquisitionFrame.create(closed.ships,closed);assert.ok(ownedFrame);ownedFrame.close();
  assert.equal(api.stage.NumericAcquisitionFrame.create([closed.playerShip,custom.playerShip],closed),undefined);assert.equal(calls,0,'Registered engine cannot bless a foreign getter-bearing Ship');
  closed.playerShip.externalPhaseEffects.set({},()=>{calls++;return .5;});
  assert.equal(api.stage.NumericAcquisitionFrame.create(closed.ships,closed),undefined);assert.equal(calls,0,'Live authored hook invalidator remains active inside private authority');
  pass('Existing cloned-command Worker membership admits its actual phase roster only; foreign getters and live external phase hooks still reject');
  if(process.env.COMBAT_ACQUISITION_DEFAULT_CHECK==='true') {
    assert.equal(ownedAcquisition,false,'Default-selector check first requires an unregistered inline engine');
    const filename=path.join(out,'default.mjs');
    await build({stdin:{contents:exports,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',outfile:filename,logLevel:'warning',
      define:{'__LAN_BUILD_ID__':JSON.stringify('acquisition-default-check'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:false,VITE_COMBAT_STATE_CORE:'false',VITE_COMBAT_NUMERIC_MOTION:'false'})}});
    const defaults=await import(pathToFileURL(filename).href),engine=world(defaults),source=engine.ships;
    assert.equal(defaults.NumericAcquisitionFrame.create(source),undefined,'Unset feature cannot enable generic inline frame');
    assert.equal(defaults.NumericAcquisitionFrame.create(source,engine),undefined,'Actual but unregistered inline engine is not a private authority');
    assert.equal(defaults.CombatDecisionScene.create(engine,source),undefined,'Unset decision pipeline cannot admit an unregistered inline engine');
    const unownedPhase=new defaults.CombatAIPhase(engine,source);assert.equal(unownedPhase.scene,undefined);
    assert.equal(defaults.FlightDecisionRoster.create(engine,source),undefined,'Unset flight rewrite cannot admit an unregistered engine');
    defaults.FireControlQueryRoster.ownForWorker(engine);
    const admitted=defaults.NumericAcquisitionFrame.create(source,engine);assert.ok(admitted);admitted.close();
    const scene=defaults.CombatDecisionScene.create(engine,source);assert.ok(scene);scene.close();
    const foreign=world(defaults).playerShip;
    assert.equal(defaults.CombatDecisionScene.create(engine,[...source,foreign]),undefined,'Registered authority cannot bless foreign decision entities');
    const before=defaults.numericAcquisitionMetrics.frames,sceneBefore=defaults.decisionSceneWork.scenes,fleetBefore=defaults.numericFleetWork.plans;
    const fireBefore=defaults.fireRewriteWork.queries,flightBefore=defaults.flightRewriteWork.rosters;
    engine.fixedUpdate(1/60);
    assert.equal(defaults.numericAcquisitionMetrics.frames,before+1,'Unset feature actually runs through the real engine/batch/fire-frame path after authority registration');
    assert.equal(defaults.decisionSceneWork.scenes,sceneBefore+1,'Unset decision pipeline reaches the actual deferred AI phase');
    assert.equal(defaults.numericFleetWork.plans,fleetBefore+1,'Unset numerical fleet planner reaches actual registered host fixedUpdate');
    assert.ok(defaults.decisionSceneWork.modulePlans>0,'Actual default pipeline includes attached module planning');
    assert.ok(defaults.fireRewriteWork.queries>fireBefore,'Unset fire rewrite executes actual private numerical acquisition tree');
    assert.equal(defaults.flightRewriteWork.rosters,flightBefore+1,'Unset flight rewrite executes actual private flight span');
    let getterCalls=0;const accessorWorld={ships:source,get fireFrame(){getterCalls++;throw Error('Must not invoke generic getter');}};
    assert.equal(defaults.bindNativeFireQueries(engine.playerShip,accessorWorld),undefined);assert.equal(getterCalls,0);
    pass('Default unset enables actual private host acquisition/root-module/fleet/fire-flight execution only; unregistered/foreign callers and unknown context getters stay legacy');
  }
  if(process.env.COMBAT_NUMERIC_ACQUISITION_ONLY==='true'){report();process.exit(0);}
}
if (coreCompare) {
  const e=world(api.stage),ship=e.playerShip,core=new api.stage.CombatStateCore();
  const before=api.stage.captureCombat(e,0,{},0),keys=Object.keys(ship),pos=ship.pos,vel=ship.vel,mount=ship.weapons[0];
  assert.equal(core.reconcile(e.ships),true,'Native mixed world must enter the canonical core');
  assert.equal(core.entityCount,e.ships.length);assert.deepEqual(Object.keys(ship),keys);
  assert.equal(ship.pos,pos);assert.equal(ship.vel,vel);
  assert.ok(Object.getOwnPropertyDescriptor(ship,'hullHp').get);
  assert.ok(Object.getOwnPropertyDescriptor(mount,'ammo').get);
  assert.deepEqual(api.stage.captureCombat(e,0,{},0),before,'Admission changes no snapshot fields/keys/types');
  const handle=core.handle(ship),x=ship.pos.x;
  ship.pos.x=x+37;assert.equal(core.read(handle,api.stage.MotionField.X),x+37);
  ship.flux.increaseFlux(173,false);assert.equal(core.read(handle,api.stage.CoreField.SoftFlux),ship.flux.softFlux);
  ship.hullHp-=31;assert.equal(core.read(handle,api.stage.CoreField.HullHp),ship.hullHp);
  ship.throttle=.8;ship.vel.set(40,17);const previousX=ship.pos.x;core.move(ship,1/60);
  assert.equal(ship.pos.x,core.read(handle,api.stage.MotionField.X));assert.notEqual(ship.pos.x,previousX);
  const admissions=core.counters.admissions;core.reconcile(e.ships);assert.equal(core.counters.admissions,admissions,'No per-step recapture/rebind');
  pass('Canonical core owns mixed-world pose/history/hull/flux/weapon numbers; alias writes and direct kernel writes share one state, with no repeated admission or wire shape change');
  const observation=core.observe([ship]),row=observation.row(ship),observed=observation.read(row);
  assert.equal(observation.row(e.enemyShip),undefined);assert.throws(()=>ship.pos.x+=1,/observation/);
  assert.equal(observation.read(row),observed);assert.throws(()=>core.reconcile(e.ships),/boundary/);
  assert.throws(()=>observation.read(core.handle(e.enemyShip).slot*(api.stage.CoreField.TimeSinceFluxIncrease+1)),/Invalid/);
  observation.close();assert.throws(()=>observation.read(row),/Closed/);ship.pos.x+=1;
  pass('Zero-copy pose observation enforces write exclusion, membership and closed lifetime; weapon plan clocks remain writable in their own rule stage');
  const extra=world(api.stage),capacity=core.capacity,oldPosition=ship.pos.x;
  core.reconcile([...e.ships,...extra.ships]);assert.ok(core.capacity>capacity);assert.equal(ship.pos.x,oldPosition);
  const oldMountAmmo=mount.ammo;core.reconcile(extra.ships);assert.throws(()=>core.read(handle,api.stage.MotionField.X),/Expired/);
  assert.ok('value' in Object.getOwnPropertyDescriptor(pos,'x'));assert.equal(pos.x,oldPosition);
  assert.ok('value' in Object.getOwnPropertyDescriptor(mount,'ammo'));assert.equal(mount.ammo,oldMountAmmo);
  const successor=world(api.stage);core.reconcile(successor.ships);successor.playerShip.pos.x+=999;
  assert.equal(pos.x,oldPosition,'Removed refs never follow recycled slots');core.dispose();
  assert.ok('value' in Object.getOwnPropertyDescriptor(successor.playerShip.pos,'x'));
  pass('Growth preserves aliases and exact values; removal/recycling invalidates handles and materializes old vectors/mounts; disposal restores data descriptors');
  const frozen=world(api.stage),retirement=new api.stage.CombatStateCore();retirement.reconcile(frozen.ships);
  const frozenShip=frozen.playerShip,frozenMount=frozenShip.weapons[0],frozenHandle=retirement.handle(frozenShip),frozenFacing=frozenShip.facingRad,frozenAmmo=frozenMount.ammo;
  Object.freeze(frozenShip);Object.freeze(frozenShip.pos);Object.freeze(frozenMount);
  assert.doesNotThrow(()=>retirement.reconcile([]));assert.throws(()=>retirement.read(frozenHandle,api.stage.MotionField.Facing),/Expired/);
  const replacement=world(api.stage);assert.equal(retirement.reconcile(replacement.ships),true);
  replacement.playerShip.facingRad+=1;replacement.playerShip.weapons[0].ammo-=1;
  assert.equal(frozenShip.facingRad,frozenFacing);assert.equal(frozenMount.ammo,frozenAmmo);retirement.dispose();
  pass('Frozen non-configurable native adapters retire their rows instead of throwing during detach or following recycled slots');

  const custom=world(api.stage),fallback=new api.stage.CombatStateCore();fallback.reconcile(custom.ships);
  const victim=custom.enemyShip,native=custom.playerShip.integrateStep;let calls=0;
  custom.playerShip.integrateStep=function(...args){calls++;victim.pos.x+=123;return native.apply(this,args);};
  assert.equal(fallback.reconcile(custom.ships),false);assert.equal(fallback.entityCount,0);
  custom.fixedUpdate(1/60);assert.ok(calls>0);assert.equal(api.stage.existingStateCore(custom).entityCount,0);
  delete custom.playerShip.integrateStep;assert.equal(fallback.reconcile(custom.ships),true);
  const saved=custom.playerShip.pos.x;
  Object.defineProperty(custom.playerShip.pos,'x',{get(){return saved+7;},configurable:true,enumerable:true});
  assert.equal(fallback.reconcile(custom.ships),false);assert.equal(custom.playerShip.pos.x,saved+7);
  let getterCalls=0;Object.defineProperty(custom.playerShip,'flux',{get(){getterCalls++;return victim.flux;},configurable:true});
  assert.equal(fallback.reconcile(custom.ships),false);assert.equal(getterCalls,0,'Unknown component getters must not run for admission');
  pass('Whole batch falls back for cross-entity integrator writes; replaced numeric descriptors and custom component getters remain caller-owned');
  // Exercise real ordered contact responses with pushes that can introduce
  // contacts across grid cells, and repeat with offset shields and modules.
  for(const shielded of [false,true]) {
    const left=world(api.live),right=world(api.stage),indexedCore=new api.stage.CombatStateCore();
    for(const engine of [left,right]) {
      engine.combatShips.forEach((s,i)=> {
        if(!s.isAttachedModule) {s.pos.set((i%5)*180-360,Math.floor(i/5)*170-500);s.vel.set((i%3-1)*125,(i%2?1:-1)*60);}
        s.shield.isActive=shielded;s.shield.currentArcDeg=shielded?s.shield.maxArcDeg:0;
      });
      for(const root of engine.capitalShips)root.syncModuleTree();
    }
    assert.equal(indexedCore.reconcile(right.ships),true);
    const fx={addFloatingDamage(){},spawnArmorDamageSparks(){},spawnDebris(){},addCameraShake(){},getPlayerPos:()=>new api.stage.Vector2()};
    const oldCollision=new api.live.ShipCollisionSystem(),newCollision=new api.stage.ShipCollisionSystem(),capitals=left.combatShips;
    for(let i=0;i<capitals.length;i++)for(let j=i+1;j<capitals.length;j++)oldCollision.resolveShipToShipCollision(capitals[i],capitals[j],fx,1/60);
    const index=new api.stage.CoreCollisionIndex(right.combatShips,indexedCore);
    index.resolve((a,b)=>newCollision.resolveShipToShipCollision(a,b,fx,1/60));
    assert.ok(index.counts.responses>0);assert.ok(index.counts.candidates<index.counts.possiblePairs);
    if(shielded)assert.ok(right.combatShips.some(s=>s.flux.hardFlux>0),'Expanded shields must actually absorb collision damage');
    assert.deepEqual(api.stage.captureCombat(right,0,{},0),api.live.captureCombat(left,0,{},0),'Live collision index exact ordered contacts, damage and module poses');
    assert.deepEqual(right.random.checkpointWitness(),left.random.checkpointWitness());indexedCore.dispose();
  }
  pass('Live spatial collision index matches actual ordered hull/shield/module responses, damage, flux and RNG after displacement; fewer candidates than the full pair loop');
  const displaced=world(api.stage),active=[displaced.playerShip,displaced.enemyShip,...displaced.capitalShips.filter(s=>s!==displaced.playerShip&&s!==displaced.enemyShip).slice(0,1)];
  active.forEach((s,i)=>s.pos.set(i===0?500:i===1?505:4000,0));
  const liveIndex=new api.stage.CoreCollisionIndex(active,new api.stage.CombatStateCore()),visited=[];
  liveIndex.resolve((a,b)=> {visited.push([active.indexOf(a),active.indexOf(b)]);if(a===active[0]&&b===active[1]){a.pos.x=4000;return true;}return false;});
  assert.ok(visited.some(([i,j])=>i===0&&j===2),'Requery catches newly introduced later contact across cells');
  pass('A response crossing cells introduces and visits the later pair in the original j suffix, without revisiting earlier pairs');
  if(process.env.COMBAT_STATE_CORE_ONLY==='true'){report();process.exit(0);}
}
if (readCompare) {
  const baseline=world(api.live),sample=world(api.stage),ship=sample.playerShip,target=sample.enemyShip,reads=new api.stage.CombatQueryReads();
  const motion=reads.motion(ship);assert.deepEqual(motion,ship.getMotionStats());assert.equal(reads.motion(ship),motion);
  const modifiers=reads.sourceModifiers(ship);assert.ok(modifiers);assert.equal(reads.sourceModifiers(ship),modifiers);
  for(const mount of ship.weapons) {
    assert.equal(api.stage.combatWeaponRange(ship,mount.spec,modifiers),api.stage.combatWeaponRange(ship,mount.spec));
    assert.equal(api.stage.combatProjectileSpeed(ship,mount.spec,modifiers),api.stage.combatProjectileSpeed(ship,mount.spec));
  }
  assert.deepEqual(api.stage.combatProfile(ship,target,reads),api.live.combatProfile(baseline.playerShip,baseline.enemyShip));
  for(const velocity of [[0,0],[130,-40],[-30,100],[12,73]]) {
    const old=api.live.forecastCombatPosition(baseline.playerShip,new api.live.Vector2(...velocity));
    const next=api.stage.forecastCombatPosition(ship,new api.stage.Vector2(...velocity),reads);
    assert.deepEqual([next.x,next.y],[old.x,old.y],'Exact acceleration-limited position candidate');
  }
  reads.close();assert.throws(()=>reads.motion(ship),/Closed/);assert.throws(()=>reads.sourceModifiers(ship),/Closed/);
  ship.terrainSpeedMult*=.6;
  assert.deepEqual(api.stage.queryMotionStats(ship,reads),ship.getMotionStats(),'Expired helper falls back to current effect-stage state');
  const fresh=new api.stage.CombatQueryReads();assert.notEqual(fresh.motion(ship).maxSpeed,motion.maxSpeed);fresh.close();
  pass('One-plan numeric reads match live motion, weapon ranges/speeds, authored combat profile and position candidates; closed leases cannot serve old effect/new-plan state');
  const custom=world(api.stage).playerShip,nativeMotion=custom.getMotionStats;let calls=0;
  custom.getMotionStats=function(){calls++;return nativeMotion.call(this);};
  const overridden=new api.stage.CombatQueryReads();overridden.motion(custom);overridden.motion(custom);assert.equal(calls,2);overridden.close();
  delete custom.getMotionStats;
  custom.system.getSpeedFlatBonus=()=>123+(++calls);calls=0;
  const scalar=new api.stage.CombatQueryReads(),first=scalar.motion(custom),second=scalar.motion(custom);
  assert.equal(calls,2);assert.notEqual(first.maxSpeed,second.maxSpeed);assert.equal(scalar.sourceModifiers(custom),undefined);scalar.close();
  delete custom.system.getSpeedFlatBonus;
  const definition=custom.system.definition;custom.system.state='ACTIVE';custom.system.isActive=true;custom.system.effectLevel=1;calls=0;
  custom.system.definition={...definition,modifiers:()=>({speedFlat:100+(++calls)})};
  const extension=new api.stage.CombatQueryReads(),a=extension.motion(custom),b=extension.motion(custom);
  assert.equal(calls,2);assert.notEqual(a.maxSpeed,b.maxSpeed);extension.close();custom.system.definition=definition;
  const readTable=custom.system.readModifierTable;calls=0;
  custom.system.readModifierTable=function(...args){calls++;return readTable.apply(this,args);};
  const tableOverride=new api.stage.CombatQueryReads();tableOverride.motion(custom);tableOverride.motion(custom);assert.equal(calls,2);tableOverride.close();
  pass('Custom motion/scalar/table readers and unknown authored modifier callbacks retain every live invocation and changing results');
  const actual=world(api.stage),prototype=api.stage.CombatQueryReads.prototype,nativeRead=prototype.motion,leases=new Map();let attempts=0;
  prototype.motion=function(owner){const value=nativeRead.call(this,owner);attempts++;let entities=leases.get(this);if(!entities){entities=new Map();leases.set(this,entities);}let values=entities.get(owner);if(!values){values=new Set();entities.set(owner,values);}values.add(value);return value;};
  try {actual.fixedUpdate(1/60);} finally {prototype.motion=nativeRead;}
  const distinctRows=[...leases.values()].reduce((n,entities)=>n+entities.size,0);
  assert.ok(attempts>distinctRows*2,'Actual navigation/avoidance/candidate/control paths must reuse the same motion row multiple times');
  assert.ok(leases.size>20);for(const [lease,entities] of leases){assert.equal(lease.active,false);for(const values of entities.values())assert.equal(values.size,1);}
  pass('Actual root/module AI plans use '+leases.size+' closed query leases: '+attempts+' motion requests reuse '+distinctRows+' numeric rows');
  const rosterShips=sample.ships,frame=new api.stage.CombatFireFrame(rosterShips),roster=api.stage.FireControlQueryRoster.forStage(rosterShips),fireWorld={ships:rosterShips,missiles:[],asteroids:[],fireFrame:frame};
  const left=roster.begin(ship,fireWorld),right=roster.begin(target,fireWorld);
  assert.ok(left&&right);assert.equal(left.members,right.members,'One membership Set per read-only fire roster, not per shooter');
  const one=[ship];target.visibilityMask|=1<<ship.teamId;
  for(const foreign of [new Set(rosterShips),roster]) {
    const injected=api.stage.FireControlQueryBatch.fromRoster(ship,one,false,true,frame,foreign);
    assert.equal(injected.preAimTargets({origin:ship.pos,range:1e6,speed:1000,delay:0},{spec:{isBeam:true}}).length,0,
      'Injected Set/foreign roster cannot widen a restricted flight source');injected.close();
  }
  left.close();right.close();roster.close();assert.equal(roster.begin(ship,fireWorld),undefined);
  const restricted=api.stage.FireControlQueryRoster.forStage([ship]),restrictedWorld={...fireWorld,ships:[ship]};
  // The source identity is required even if another array has the same membership.
  assert.equal(restricted.begin(ship,restrictedWorld),undefined);restricted.close();frame.close();
  pass('Fire-query membership is shared only by the same active roster; foreign/restricted roster identity cannot grant wider target permissions');
}
if (readCompare && process.env.COMBAT_QUERY_READS_ONLY === 'true') { report(); process.exit(0); }
if (motionCompare) {
  const { MotionField: F, MotionFlag: Flag, MOTION_WIDTH: width } = api.stage;
  const stats = { acceleration: 93, deceleration: 51, maxSpeed: 127, turnAcceleration: .7,
    maxTurnRate: .4, driftAcceleration: -.08, strafeMultiplier: .5 };
  let cases = 0;
  for (let flags = 0; flags < 256; flags++) for (const dt of [0, -.01, 1/60, .17])
    for (const control of [[1,.7,-.8,false,240,83],[-1,-.7,.8,false,1,.2],[0,0,0,false,170,-38],[.2,.4,.3,true,2,3]]) {
      const [turn,throttle,strafe,brake,vx,vy] = control;
      const ship = { pos: new api.stage.Vector2(71,-31), vel: new api.stage.Vector2(vx,vy), facingRad: .8, angularVelRad: -.6,
        turnInput: turn, throttle, strafeInput: strafe, brakeInput: brake,
        engineController: { isFlamedOut: !!(flags & Flag.FlamedOut) }, flux: { isOverloaded: false },
        hullStats: { forcedRightTurn: flags & Flag.ForcedRightTurn ? 1 : 0 },
        spec: { hullSize: flags & Flag.Fighter ? 'FIGHTER' : 'CRUISER' },
        system: { forcesForward: !!(flags & Flag.ForceForward), locksTurning: !!(flags & Flag.LockedTurning),
          forcesBraking: !!(flags & Flag.ForceBraking), blocksAcceleration: !!(flags & Flag.BlockAcceleration), blocksStrafing: !!(flags & Flag.BlockStrafing) } };
      const values = new Float64Array(width);
      for (const [field,value] of [[F.X,71],[F.Y,-31],[F.VelocityX,vx],[F.VelocityY,vy],[F.Facing,.8],[F.AngularVelocity,-.6],
        [F.Dt,dt],[F.Turn,turn],[F.Throttle,throttle],[F.Strafe,strafe],[F.Brake,Number(brake)],[F.Flags,flags],
        [F.Acceleration,stats.acceleration],[F.Deceleration,stats.deceleration],[F.MaxSpeed,stats.maxSpeed],
        [F.TurnAcceleration,stats.turnAcceleration],[F.MaxTurnRate,stats.maxTurnRate],[F.DriftAcceleration,stats.driftAcceleration],
        [F.StrafeMultiplier,stats.strafeMultiplier]]) values[field] = value;
      const commands = api.stage.advanceMotionWithStats(ship,dt,stats);
      api.stage.advanceMotionRow(values,0);
      assert.deepEqual([values[F.X],values[F.Y],values[F.VelocityX],values[F.VelocityY],values[F.Facing],values[F.AngularVelocity],
        !!values[F.Accelerating],!!values[F.Spreading]],
        [ship.pos.x,ship.pos.y,ship.vel.x,ship.vel.y,ship.facingRad,ship.angularVelRad,commands.accelerating,commands.spreading],
        'Exact scalar/row motion: flags='+flags+' dt='+dt+' controls='+control);
      cases++;
    }
  pass('Pure motion rows exactly match existing command order, drift, overspeed, flameout and all flag combinations: '+cases+' cases');
  const sample=world(api.stage),root=sample.playerShip,part=sample.ships.find(ship=>ship.isAttachedModule),store=new api.stage.CombatKinematicsStore();
  assert.ok(part);assert.equal(api.stage.hasNumericMotionBoundary(root),true);
  root.throttle=.8;root.turnInput=.4;root.vel.set(160,31);
  const before=[root.pos.x,root.pos.y,root.vel.x,root.vel.y,root.facingRad,root.angularVelRad];
  store.beginMotion([root,part]);const rootHandle=store.handle(root),partHandle=store.handle(part);
  assert.equal(store.queue(root,1/60),true);assert.equal(store.queue(part,1/60),false);
  assert.throws(()=>store.queue(root,1/60),/duplicate/);assert.throws(()=>store.commit(root),/before solve/);
  assert.throws(()=>store.observe([root]),/overlap/);store.solve();
  assert.deepEqual([root.pos.x,root.pos.y,root.vel.x,root.vel.y,root.facingRad,root.angularVelRad],before,'Solver cannot mutate objects');
  assert.equal(store.commit(part),undefined);assert.ok(store.commit(root));assert.throws(()=>store.commit(root),/already committed/);
  store.closeMotion();root.pos.x+=431;root.vel.y-=77;
  const lease=store.observe([root,part]);
  assert.equal(lease.readHandle(rootHandle,F.X),root.pos.x,'Object teleport imported after numeric submission');
  assert.equal(lease.readHandle(rootHandle,F.VelocityY),root.vel.y,'Post-motion recoil/collision velocity imported');
  const frozenX=lease.readHandle(rootHandle,F.X);root.pos.x+=19;
  assert.equal(lease.readHandle(rootHandle,F.X),frozenX,'Observation stays immutable until close');
  assert.throws(()=>lease.read(-1),/Invalid/);assert.throws(()=>lease.readHandle(rootHandle,width),/Invalid/);
  lease.close();assert.throws(()=>lease.row(root),/Expired/);
  const replacement=sample.enemyShip,recycled=store.observe([part,replacement]);
  assert.deepEqual(store.handle(part),partHandle,'Surviving entity keeps its slot and generation');
  assert.equal(store.handle(replacement).slot,rootHandle.slot);assert.equal(store.hasHandle(rootHandle),false);
  assert.throws(()=>recycled.readHandle(rootHandle,F.X),/Recycled/);recycled.close();
  const grown=store.observe(sample.ships),bytes=store.bufferBytes;
  assert.ok(store.capacity>=sample.ships.length);assert.ok(store.capacity>32);grown.close();
  const reused=store.observe(sample.ships);assert.equal(store.bufferBytes,bytes);reused.close();
  assert.throws(()=>grown.row(root),/Expired/);assert.throws(()=>store.observe([root,root]),/Duplicate/);
  const empty=store.observe([]);assert.equal(store.entityCount,0);assert.equal(store.hasHandle(partHandle),false);empty.close();
  assert.throws(()=>store.queue(root,1/60),/outside/);
  const recover=store.observe([root]);assert.equal(recover.readHandle(store.handle(root),F.X),root.pos.x);recover.close();
  pass('Resident slots grow/reuse, preserve survivors, reject recycled handles, invalid offsets, duplicate work and expired leases; external pose writes are recaptured');
  const actual=world(api.stage),nativeSolve=api.stage.CombatKinematicsStore.prototype.solve;let jobs=0;
  api.stage.CombatKinematicsStore.prototype.solve=function(){jobs+=this.queuedCount;return nativeSolve.call(this);};
  try {actual.fixedUpdate(1/60);} finally {api.stage.CombatKinematicsStore.prototype.solve=nativeSolve;}
  assert.ok(jobs>=22,'Actual mixed-world roots/craft must enter the numeric solver, not only construct an unused table');
  assert.ok(actual.ships.some(ship=>ship.isAttachedModule));
  pass('Actual CombatEngine uses resident numeric motion for '+jobs+' roots/craft while modules retain parent-relative integration');
  const legacy=world(api.live),candidate=world(api.stage);
  for(const engine of [legacy,candidate]) {
    const first=engine.ships[0],later=engine.ships.find(ship=>!ship.isAttachedModule&&ship!==first),integrate=first.integrateStep;
    first.integrateStep=function(...args){later.pos.x+=123;later.vel.y+=77;return integrate.apply(this,args);};
    first.throttle=.9;later.throttle=.6;
  }
  let unsafeJobs=0;api.stage.CombatKinematicsStore.prototype.solve=function(){unsafeJobs+=this.queuedCount;return nativeSolve.call(this);};
  try {legacy.fixedUpdate(1/60);candidate.fixedUpdate(1/60);} finally {api.stage.CombatKinematicsStore.prototype.solve=nativeSolve;}
  assert.equal(unsafeJobs,0,'Unknown integrator requires whole-batch object-motion fallback');
  assert.deepEqual(api.stage.captureCombat(candidate,1,{},0),api.live.captureCombat(legacy,1,{},0));
  const extension=world(api.stage).playerShip,nativeScale=extension.vel.scale;
  extension.vel.scale=function(...args){return nativeScale.apply(this,args);};assert.equal(api.stage.hasNumericMotionBoundary(extension),false);
  pass('Unknown integrator writing a later ship falls back as a whole batch; custom vector methods do not enter numeric motion');
}
if (readCompare || aiCompare) {
  const e=world(api.stage),phasePlans=[],rosters=new Set(),mod=api.stage.CombatAIPhase.prototype;
  const readWrites=()=>JSON.stringify(e.ships.map(s=>[s.id,s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,
    s.fireControlMode,s.isFiringMain,s.throttle,s.strafeInput,s.turnInput,s.brakeInput,s.aiHoldOffensiveFire,
    s.currentTargetShip?.id,s.aimTargetWorld.x,s.aimTargetWorld.y,s.defenseFacingRad,s.shield.isActive,
    s.shield.phaseState,s.flux.totalFlux,s.flux.isVenting,s.allSystems.map(x=>[x.state,x.charges,x.activationSerial]) ]));
  const oldPlan=mod.plan,oldExecute=mod.execute;
  let executions=0;
  mod.plan=function(...args){const before=readWrites();rosters.add(args[3].ships);const value=oldPlan.apply(this,args);
    assert.equal(readWrites(),before,'AI planning cannot change targets, controls, shields, resources or systems');phasePlans.push(args[0].ship);return value;};
  mod.execute=function(...args){assert.ok(this.entityCount>22,'Roots and modules share the decision phase');executions++;return oldExecute.apply(this,args);};
  e.playerShip.throttle=.75;const manualBefore=e.playerShip.throttle;
  try { e.fixedUpdate(1/60); } finally {mod.plan=oldPlan;mod.execute=oldExecute;}
  assert.equal(executions,1);assert.equal(rosters.size,1);assert.equal(new Set(phasePlans).size,phasePlans.length);
  assert.equal(e.playerShip.throttle,manualBefore,'External manual pilot keeps control');
  assert.ok(phasePlans.some(s=>s.isAttachedModule));
  assert.ok(phasePlans.some(s=>!s.isAttachedModule));
  pass('Actual root/module AI plans share one observation span; query does not write world controls, systems, flux or defense');
  const sample=world(api.stage),ai=sample.getNativeAIs()[0],sceneWorld=scene(sample);
  const phase=new api.stage.CombatAIPhase();phase.plan(ai,1/60,null,sceneWorld);
  assert.throws(()=>phase.plan(ai,1/60,null,sceneWorld),/Duplicate/);phase.execute();assert.throws(()=>phase.execute(),/already/);
  const first=ai.plan(1/60,null,sceneWorld),second=ai.plan(1/60,null,sceneWorld);
  assert.throws(()=>ai.commitControls(first),/Stale/);assert.throws(()=>ai.commitEffects(second),/require/);
  const foreign=sample.getNativeAIs().find(other=>other!==ai);assert.throws(()=>foreign.commitControls(second),/foreign/);
  ai.commitControls(second);ai.commitEffects(second);assert.throws(()=>ai.commitEffects(second),/require/);
  pass('AI intent owner, freshness, single control commit and single effects commit are enforced');
  const custom=world(api.stage),customAI=custom.getNativeAIs().find(ai=>!custom.externallyControlledShipIds.has(ai.ship.id)),update=customAI.update;let calls=0;
  customAI.update=function(...args){calls++;return update.apply(this,args);};custom.fixedUpdate(1/60);assert.equal(calls,1);
  pass('Custom whole-AI update retains legacy execution');
  const observation={facing:.3,angularVelocity:.1,velocityX:3,velocityY:5,acceleration:10,deceleration:15,strafeMultiplier:.7,turnDeceleration:.8,locked:false};
  for(const [dx,dy,angle,locked] of [[0,0,0,false],[100,-70,2,false],[-60,40,-2,false],[0,0,1,true]]){
    const read={...observation,locked},before=JSON.stringify(read),command=api.stage.solveSteering(read,dx,dy,angle,.5);
    const local=new api.stage.Vector2(dx,dy).sub(new api.stage.Vector2(read.velocityX,read.velocityY)).rotate(-read.facing);
    assert.equal(JSON.stringify(read),before);assert.ok(command.throttle>=-1&&command.throttle<=1);assert.ok(command.strafeInput>=-1&&command.strafeInput<=1);
    assert.equal(command.brakeInput,dx*dx+dy*dy<1);if(locked)assert.equal(command.turnInput,0);
    if(!command.brakeInput){assert.ok(Math.abs(command.throttle-Math.max(-1,Math.min(1,local.x/((local.x>=0?read.acceleration:read.deceleration)*.5))))<1e-12);
      assert.ok(Math.abs(command.strafeInput-Math.max(-1,Math.min(1,local.y/(read.acceleration*read.strafeMultiplier*.5))))<1e-12);}
  }
  pass('Numeric steering preserves acceleration-limited commands and input observation without entity writes');
  const manualWorld=world(api.stage),manualRoot=manualWorld.capitalShips.find(root=>root.assemblyShips.some(part=>part.isAttachedModule));
  assert.ok(manualRoot);manualRoot.fireControlMode='MANUAL';manualWorld.externallyControlledShipIds.add(manualRoot.id);
  const manualPart=manualRoot.assemblyShips.find(part=>part.isAttachedModule);
  assert.ok(manualPart);api.stage.selectModuleFireControl(manualRoot,manualPart);
  manualPart.isFiringMain=true;manualPart.aimTargetWorld.set(manualRoot.pos.x+1200,manualRoot.pos.y+350);
  const aim=manualPart.aimTargetWorld.clone();manualWorld.fixedUpdate(1/60);
  assert.equal(manualPart.fireControlMode,'MANUAL');assert.equal(manualPart.isFiringMain,true);
  assert.equal(manualPart.aimTargetWorld.x,aim.x);assert.equal(manualPart.aimTargetWorld.y,aim.y);
  pass('Selected manual module retains its trigger and aim through AI control/effects receipts');
  const driveBattle=world(api.stage),driveTarget=driveBattle.playerShip,driveShip=driveBattle.capitalShips.find(ship=>ship.spec.sourceHullId==='web_sc2_hyperion'&&ship.teamId!==driveTarget.teamId);
  assert.ok(driveShip);driveShip.pos.set(0,0);driveShip.vel.set(0,0);driveShip.facingRad=0;driveTarget.pos.set(6000,0);
  driveShip.fireControlMode='AI';driveTarget.fireControlMode='AI';
  const driveAI=new api.stage.CapitalShipAI(driveShip,driveTarget),driveWorld={ships:[driveShip,driveTarget],projectiles:[],beams:[],asteroids:[],fleetPlan:new Map()};
  const driveIntent=driveAI.plan(1/60,null,driveWorld);
  const activations=driveShip.allSystems.map(system=>system.activationSerial);
  driveAI.commitControls(driveIntent);assert.deepEqual(driveShip.allSystems.map(system=>system.activationSerial),activations);
  driveAI.commitEffects(driveIntent);assert.ok(driveShip.allSystems.some((system,i)=>system.activationSerial>activations[i]),'Actual authored Hyperion skill starts only in effects commit');
  pass('Actual authored Hyperion skill activation stays out of planning and control submission');
}
if (acquisitionCompare || coreCompare || readCompare || motionCompare || worldCompare || aiCompare) {
  const e=world(api.stage),order=[],counts=new Map(),plans=[],frames=new Set();
  let queryProjectileCount=null;
  for(const ship of e.ships) {
    for(const [method,phase] of [['prepareStep',0],['integrateStep',1],['finishStep',5]]) {
      const original=ship[method];ship[method]=function(...args){order.push(phase);const key=ship.id+'/'+method;counts.set(key,(counts.get(key)??0)+1);return original.apply(this,args);};
    }
    for(const [method,phase] of [['advanceState',2],['planFire',3],['commitFire',4]]) {
      const original=ship.weaponControl[method];ship.weaponControl[method]=function(...args){
        order.push(phase);
        if(method==='planFire'){
          queryProjectileCount??=e.projectiles.length;assert.equal(e.projectiles.length,queryProjectileCount,'No emission between shooter queries');
          frames.add(args[3].fireFrame);assert.equal(args[3].shipStepBatch,undefined);
        }
        const result=original.apply(this,args);if(method==='planFire')plans.push({ship,plan:result});return result;
      };
    }
  }
  assert.equal(e.usesPhasedWorld,true);
  const start=e.playerShip.pos.clone();e.playerShip.throttle=1;e.playerShip.isFiringMain=true;
  e.fixedUpdate(1/60);
  assert.ok(order.length>200);assert.deepEqual(order,order.toSorted((a,b)=>a-b),'All entities finish each stage before the next');
  for(const count of counts.values())assert.equal(count,1,'Exactly one entity integration');
  assert.equal(frames.size,1,'Special flight target scopes share one geometry frame');assert.ok(!frames.has(undefined));
  assert.ok(e.playerShip.pos.distanceTo(start)>0,'Manual pilot still moves');
  assert.ok(plans.length>22,'Modules and flight craft participate');
  for(const {ship,plan} of plans)assert.throws(()=>ship.weaponControl.commitFire(plan,()=>{},()=>{}),/already committed/);
  const frame=[...frames][0];assert.throws(()=>frame.row(e.playerShip),/outside/);
  pass('Real mixed battle runs all entity stages in order, one integration, one shared fire frame, no early emissions and one-shot plans');
  const sample=world(api.stage),fireFrame=new api.stage.CombatFireFrame(sample.ships),ship=sample.playerShip,row=fireFrame.row(ship);
  const x=fireFrame.read(row);ship.pos.x+=100;assert.equal(fireFrame.read(row),x,'Numeric observations do not follow live object writes');
  const batch=api.stage.FireControlQueryBatch.fromRoster(ship,[ship],false,true,fireFrame);
  const contacts=batch.preAimTargets({origin:ship.pos,range:1e6,speed:1000,delay:0},{spec:{isBeam:true}});
  assert.equal(contacts.length,0,'Shared geometry cannot widen special-flight target permission');batch.close();fireFrame.close();
  const duplicate=new api.stage.ShipStepBatch();duplicate.enqueue(ship,1/60,null,()=>{},()=>{},undefined,{ships:[ship],missiles:[],asteroids:[]});
  assert.throws(()=>duplicate.enqueue(ship,1/60,null,()=>{},()=>{}),/Duplicate/);
  const custom=world(api.stage),update=custom.playerShip.update;let calls=0;
  custom.playerShip.update=function(...args){calls++;return update.apply(this,args);};assert.equal(custom.usesPhasedWorld,false);
  custom.fixedUpdate(1/60);assert.equal(calls,1);
  pass('Numeric frame lifetime and restricted-flight permissions are enforced; duplicate work rejects and custom whole updates retain legacy execution');
  const gravity=world(api.stage),owner=gravity.playerShip,target=gravity.enemyShip,mount=owner.weapons[0];
  mount.spec=api.stage.gravityWeapons().find(w=>w.gravityTractor);mount.mountType='HARDPOINT';mount.baseAngleDeg=0;mount.arcDeg=360;mount.relativePos.set(0,0);
  mount.cooldownTimer=0;mount.isDisabled=false;owner.weaponControl.weapons=[mount];
  owner.weaponControl.weaponGroups=[{...owner.weaponGroups[0],weaponSlotIds:[mount.slotId],mode:'LINKED',isAutofire:false}];
  target.pos.set(owner.pos.x+Math.cos(owner.facingRad)*600,owner.pos.y+Math.sin(owner.facingRad)*600);
  owner.aimTargetWorld.copy(target.pos);owner.isFiringMain=true;owner.fireControlMode='MANUAL';
  const gravityFrame=new api.stage.CombatFireFrame([owner,target]),gravityWorld={ships:[owner,target],missiles:[],asteroids:[],projectiles:[],fireFrame:gravityFrame};
  const weaponState=owner.weaponControl.advanceState(.3,owner),before=owner.flux.totalFlux;
  const gravityPlan=owner.weaponControl.planFire(weaponState,owner.facingRad,target,gravityWorld);
  assert.equal(gravityPlan.tractorRequests.length,1);assert.equal(owner.flux.totalFlux,before,'Tractor query cannot debit capture resources');
  assert.equal(mount.gravityTractor,undefined,'Tractor query cannot acquire world ownership');gravityFrame.close();
  owner.weaponControl.commitFire(gravityPlan,()=>assert.fail('Tractor emitted a fake projectile'),()=>assert.fail('Tractor emitted a fake beam'));
  assert.equal(mount.gravityTractor.phase,'HOLD');assert.equal(owner.flux.totalFlux,before+60);
  pass('Actual gravity tractor emits a deferred effect intent; capture ownership and 60 flux debit happen only at commit');
}
if (acquisitionCompare || coreCompare || readCompare || motionCompare || queryCompare || worldCompare) {
  const left=world(api.live),right=world(api.stage),ship=right.playerShip;
  for(let i=0;i<left.ships.length;i++)assert.deepEqual(api.live.shipMotionStats(left.ships[i]),api.stage.shipMotionStats(right.ships[i]));
  const system=ship.system;
  system.state='ACTIVE';system.isActive=true;system.effectLevel=1;ship.flux.softFlux=ship.flux.maxFlux*.2;
  const original=system.definition;let reads=0;
  system.definition={...original,modifiers(...args){reads++;return original.modifiers(...args);}};
  api.stage.shipMotionStats(ship);assert.equal(reads,1,'One composed read per motion query');
  const batch=api.stage.FireControlQueryBatch.fromRoster(ship,right.ships,false,true);
  const table=batch.sourceModifiers();
  for(const mount of ship.weapons){
    assert.equal(api.stage.combatWeaponRange(ship,mount.spec,table),api.stage.combatWeaponRange(ship,mount.spec));
    assert.equal(api.stage.combatProjectileSpeed(ship,mount.spec,table),api.stage.combatProjectileSpeed(ship,mount.spec));
  }
  const before=reads;assert.equal(batch.sourceModifiers(),table);assert.equal(reads,before);
  batch.close();ship.flux.softFlux=ship.flux.maxFlux*.7;
  const next=api.stage.FireControlQueryBatch.fromRoster(ship,right.ships,false,true),changed=next.sourceModifiers();
  assert.ok(changed.weapons.ENERGY.damageMultiplier>table.weapons.ENERGY.damageMultiplier);
  assert.equal(system.getWeaponDamageMultiplier('ENERGY'),changed.weapons.ENERGY.damageMultiplier);
  next.close();system.definition=original;
  const motion=api.stage.shipMotionStats(ship);system.getSpeedFlatBonus=()=>123;
  assert.ok(api.stage.shipMotionStats(ship).maxSpeed>motion.maxSpeed);delete system.getSpeedFlatBonus;
  system.getWeaponRangePercent=()=>91;
  const extension=api.stage.FireControlQueryBatch.fromRoster(ship,right.ships,false,true);
  assert.equal(extension.sourceModifiers(),undefined);extension.close();delete system.getWeaponRangePercent;
  const parent=right.capitalShips.find(s=>s.allSystems.some(slot=>slot.definition.moduleModifiers));assert.ok(parent);
  const part=parent.childModules.find(s=>s.moduleMount?.slotId==='P1');
  const edict=parent.allSystems.find(s=>s.definition.moduleModifiers);assert.ok(edict&&part);
  edict.state='ACTIVE';edict.isActive=true;edict.effectLevel=1;
  edict.activationInput={origin:parent.pos.clone(),point:parent.pos.clone().add(new api.stage.Vector2(Math.sin(parent.facingRad)*100,-Math.cos(parent.facingRad)*100)),facing:parent.facingRad,velocity:parent.vel.clone(),target:null};
  const parentOn=part.system.readModifierTable();parent.isDead=true;
  const parentOff=part.system.readModifierTable();assert.notDeepEqual(parentOn,parentOff);
  pass('Motion uses one composed read; tables refresh after flux/parent changes and scalar overrides keep live getters');
  const mount=ship.weapons[0];mount.arcDeg=360;
  const contacts=Array.from({length:96},(_,i)=>({id:'range-'+i,radius:2+i%13,
    pos:new api.stage.Vector2(ship.pos.x+(i-48)*180,ship.pos.y+(i%9-4)*90),
    vel:new api.stage.Vector2(i%7===0?-1200:0,i%3===0?100:0)}));
  const index=new api.stage.AcquisitionRangeIndex(contacts,p=>p.radius);
  const origin=api.stage.weaponMuzzle(ship,mount),speed=api.stage.combatProjectileSpeed(ship,mount.spec),range=api.stage.combatWeaponRange(ship,mount.spec);
  for(const beam of [false,true]) {
    const probe={...mount,spec:{...mount.spec,isBeam:beam}};
    const selected=index.query(origin,ship.vel,range,speed,0,beam);
    assert.ok(selected.length<contacts.length,'Sparse acquisition actually prunes contacts');
    assert.deepEqual(selected.map(p=>contacts.indexOf(p)),selected.map(p=>contacts.indexOf(p)).toSorted((a,b)=>a-b));
    let reachable=0;
    for(const p of contacts)if(api.stage.solveWeaponAim(ship,probe,{kind:'MISSILE',entity:p},{origin,speed,range,delay:0})){reachable++;assert.ok(selected.includes(p),'Exact intercept omitted');}
    assert.ok(reachable>0,'Exact intercept oracle has reachable contacts');
  }
  assert.equal(index.query(origin,ship.vel,Infinity,speed,0,false),contacts);
  contacts[0].vel.x=NaN;const unbounded=new api.stage.AcquisitionRangeIndex(contacts,p=>p.radius);
  assert.equal(unbounded.query(origin,ship.vel,range,speed,0,false),contacts);
  const target=right.enemyShip;target.shield.isActive=true;target.shield.radius=1500;
  const ships=[target,...right.ships.filter(s=>s!==target)];const shields=new api.stage.PreAimRangeIndex(ships);
  const selected=shields.query(origin,ship.vel,range,speed,0,true);
  for(const other of ships)if(api.stage.solveWeaponAim(ship,{...mount,spec:{...mount.spec,isBeam:true}},{kind:'SHIP',entity:other},{origin,speed,range,delay:0}))assert.ok(selected.includes(other),'Shield acquisition omitted');
  pass('Ship/shield and missile index retains exact intercepts and order; invalid bounds fail open');
}
if (process.env.THREAT_PHASE_BOUNDARIES_ONLY === 'true') {
  const left = world(api.stage), right = world(api.stage), target = right.enemyShip;
  const frame = new api.stage.WeaponThreatFrame(right.ships, right.combatShips);
  const p = { id:'live-threat',sourceShipId:right.playerShip.id,teamId:right.playerShip.teamId,
    damage:321,damageType:'ENERGY',pos:target.getShieldCenter(),vel:target.vel.clone(),radius:2 };
  const view = {...scene(right),weaponThreatFrame:frame,projectiles:[p],projectileLifetime:()=>2};
  assert.ok(api.stage.assessThreats(target,view,1,1).threats.some(t=>t.kind==='PROJECTILE'&&t.damage===321));
  p.didDamage=true;
  assert.ok(!api.stage.assessThreats(target,view,1,1).threats.some(t=>t.kind==='PROJECTILE'));
  const beam = {sourceShipId:right.playerShip.id,slotId:'live-beam',damageActive:true,duration:1,damagePerSec:123,
    damageType:'ENERGY',startPos:target.getShieldCenter().clone().add({x:-1000,y:0}),endPos:target.getShieldCenter().clone().add({x:1000,y:0})};
  view.beams=[beam];assert.ok(api.stage.assessThreats(target,view,1,1).threats.some(t=>t.kind==='BEAM'));
  beam.damageActive=false;assert.ok(!api.stage.assessThreats(target,view,1,1).threats.some(t=>t.kind==='BEAM'));
  const retained=frame.forShip(target,1);
  assert.throws(()=>frame.install([]),/Incomplete/);
  assert.throws(()=>frame.install([[0,new Float64Array([0,0,0,0])]]),/Invalid/);
  assert.equal(frame.forShip(target,1),retained);
  pass('Actual projectile/beam changes remain live; invalid worker partitions cannot replace retained forecasts');
  const pool=new api.stage.WeaponThreatWorkers();
  try {
    pool.compute(frame);
    const deadline=Date.now()+2000;
    while(!pool.status.ready&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(pool.status.ready,JSON.stringify(pool.status));
    await pool.entries[0].worker.worker.terminate();
    left.fixedUpdate(1/60);
    const authority=new api.stage.CombatAuthority(right);
    assert.equal(await authority.advanceAsync(1/60,captured=>pool.compute(captured),()=>true),true);
    assert.equal(authority.tick,1);assert.equal(pool.status.fallbacks,1);
    assert.deepEqual(api.stage.captureCombat(right,1,{},0),api.stage.captureCombat(left,1,{},0));
    pass('Real worker termination/timeout falls back on the same stage and commits exactly one complete tick');
  }finally{pool.reset();}
  const cancelled=world(api.stage),authority=new api.stage.CombatAuthority(cancelled);
  let current=true;
  assert.equal(await authority.advanceAsync(1/60,()=>{current=false;},()=>current),false);
  assert.equal(authority.tick,0);assert.throws(()=>cancelled.fixedUpdate(1/60),/中断/);
  authority.beginEpoch(world(api.stage));authority.advance(1/60);assert.equal(authority.tick,1);
  pass('An interrupted engine rejects reuse; a fresh authority epoch advances normally');
  process.exit(0);
}
const engine = world(api.stage), observers = engine.combatShips.filter(ship => !ship.isDead && !ship.isDocked);
assert.equal(engine.capitalShips.length, 22);
assert.ok(engine.ships.length >= 78, '22 roots and their module assemblies; use current craft content');
console.log(JSON.stringify({currentEntities:engine.ships.length,roots:engine.capitalShips.length,mounts:engine.ships.reduce((count,ship)=>count+ship.weapons.length,0)}));
const frame = new api.stage.WeaponThreatFrame(engine.ships, observers);
assert.ok(frame.observerCount > 22 && frame.mountCount > 128, 'Includes module and authored-system forecasts');
for (const ship of observers) for (const horizon of [.2, 1, 4, 15]) {
  const before = comparable(api.stage.assessThreats(ship, scene(engine), horizon, 1));
  const after = comparable(api.stage.assessThreats(ship, { ...scene(engine), weaponThreatFrame: frame }, horizon, 1));
  assert.equal(after.length, before.length, 'static threat count ' + ship.id + '/' + horizon);
  for (let i = 0; i < before.length; i++) for (let j = 0; j < before[i].length; j++) {
    if (typeof before[i][j] === 'number') assert.ok(Math.abs(before[i][j] - after[i][j]) <= 1e-7 * Math.max(1, Math.abs(before[i][j])), 'static threat value');
    else assert.equal(after[i][j], before[i][j]);
  }
}
pass('Static scene forecast matches live weapon ETA, damage, type and direction within numeric tolerance');
const target = observers[0], old = comparable(api.stage.assessThreats(target, { ...scene(engine), weaponThreatFrame: frame }, 15, 1));
for (const source of engine.ships) if (source.teamId !== target.teamId) for (const mount of source.weapons) mount.ammo = 0;
assert.deepEqual(comparable(api.stage.assessThreats(target, { ...scene(engine), weaponThreatFrame: frame }, 15, 1)), old);
const changed = new api.stage.WeaponThreatFrame(engine.ships, observers);
assert.equal(api.stage.assessThreats(target, { ...scene(engine), weaponThreatFrame: changed }, 15, 1).threats.length, 0);
pass('Weapon writes do not mutate the captured stage; the next stage sees ammo depletion');
const cancelling = new api.stage.CombatAuthority(world(api.stage));
let resume, current = true;
const pending = cancelling.advanceAsync(1 / 60, () => new Promise(resolve => { resume = resolve; }), () => current);
assert.throws(() => cancelling.advance(1 / 60), /Reentrant/);
assert.throws(() => cancelling.beginEpoch(), /running/);
current = false; resume(); assert.equal(await pending, false); assert.equal(cancelling.tick, 0);
cancelling.beginEpoch(world(api.stage)); cancelling.advance(1 / 60); assert.equal(cancelling.tick, 1);
pass('Async authority rejects overlap; cancelled stage does not commit a tick or leak into a new epoch');
for (const profile of ['standard', 'large-battle-v3']) {
  const left = world(acquisitionCompare || coreCompare || readCompare || motionCompare || queryCompare&&!worldCompare ? api.live : api.stage, profile), right = world(api.stage, profile), serial=acquisitionCompare || coreCompare || readCompare || motionCompare || queryCompare ?world(api.stage,profile):null, pool = new api.stage.WeaponThreatWorkers();
  const authority = new api.stage.CombatAuthority(right);
  try {
    for (let tick = 1; tick <= 36; tick++) {
      if (tick === 12) for (const e of [left, right,serial].filter(Boolean)) for (const ship of e.capitalShips) {
        ship.flux.softFlux = ship.flux.maxFlux * .75; ship.system.activate();
      }
      left.fixedUpdate(1 / 60);
      serial?.fixedUpdate(1/60);
      assert.equal(await authority.advanceAsync(1 / 60, captured => pool.compute(captured), () => true), true);
      assert.deepEqual(api.stage.captureCombat(right, tick, {}, 0), (acquisitionCompare || coreCompare || readCompare || motionCompare || queryCompare&&!worldCompare ? api.live : api.stage).captureCombat(left, tick, {}, 0), 'baseline/candidate whole state ' + profile + '/' + tick);
      if(serial)assert.deepEqual(api.stage.captureCombat(right,tick,{},0),api.stage.captureCombat(serial,tick,{},0),'candidate sync/parallel '+profile+'/'+tick);
      if (acquisitionCompare || coreCompare) assert.equal(api.stage.captureMotion(right,tick,{0:tick}),api.live.captureMotion(left,tick,{0:tick}),'Core/object motion wire agreement');
      assert.deepEqual(right.random.checkpointWitness(), left.random.checkpointWitness());
      await new Promise(setImmediate); // Service real worker replies, as the host's between-tick yield does.
    }
    assert.ok(pool.status.completed > 0, JSON.stringify(pool.status));
    assert.ok(pool.status.observers > 22 && pool.status.mounts > 128);
    pass('Real worker partitions and synchronous stage agree through activation/high flux: ' + profile);
  } finally { pool.reset(); }
}
// One paired six-arm run. Different old/new observation timing may change combat
// trajectories; B/C must agree, old A is an effect/performance reference only.
if (boundariesOnly) { report(); process.exit(0); }
if(stageKernelCompare){
  const e=world(api.stage),ships=e.ships;
  const scene=api.stage.CombatDecisionScene.create(e,ships);
  assert.ok(scene?.readPlane?.active,'Private scene has a real read plane');
  const base={ships,projectiles:e.projectiles,beams:e.beams,asteroids:e.asteroids,fleetPlan:api.stage.planFleetTactics(ships)};
  const subjects=ships.filter(s=>s.spec.hullSize!=='FIGHTER').slice(0,20);
  for(const ship of subjects){
    const target=ships.find(s=>s.teamId!==ship.teamId&&!s.isDead);
    const profile=api.stage.combatProfile(ship,target),desired=new api.stage.Vector2(70,-50);
    const oracle=api.stage.chooseCombatVelocity(ship,target,desired,profile,base);
    const actual={...base,decisionScene:scene,queryReads:scene.readPlane.reads};api.stage.bindDecisionReadWorld(actual,scene.readPlane);
    const numeric=api.stage.chooseCombatVelocity(ship,target,desired,profile,actual);
    assert.deepEqual(numeric,oracle,'Root/module scalar advisory retains exact velocity/score/order');
  }
  scene.close();assert.equal(scene.readPlane.active,false);assert.equal(scene.readPlane.reads.active,false);
  assert.throws(()=>scene.readPlane.reads.motion(ships[0]),/Closed/);
  assert.equal(scene.readPlane.canScore(e.asteroids),false);
  pass('Stage read plane closes before controls/effects; actual root/module scalar scoring matches the object oracle');
}
let motionWitness;
for (const [index, mode] of (acquisitionCompare || coreCompare || readCompare || motionCompare || aiCompare || queryCompare || worldCompare ? ['live', 'stage', 'stage', 'live'] : ['live', 'stage', 'parallel', 'parallel', 'stage', 'live']).entries()) {
  const module = mode === 'live' ? api.live : api.stage, e = world(module);
  const pool = mode === 'parallel' ? new module.WeaponThreatWorkers() : null;
  const times = [], phases = {};
  const acquisitionBefore=acquisitionCompare?{...module.numericAcquisitionMetrics}:null;
  const kernelBefore={...module.stageKernelWork};
  const decisionBefore={...module.decisionSceneWork},fleetBefore={...module.numericFleetWork},fireBefore={...module.fireRewriteWork},flightBefore={...module.flightRewriteWork};
  const decisionCounts=()=>Object.fromEntries(Object.entries(module.decisionSceneWork).map(([key,value])=>[key,value-decisionBefore[key]]));
  const fleetCounts=()=>Object.fromEntries(Object.entries(module.numericFleetWork).map(([key,value])=>[key,value-fleetBefore[key]]));
  const acquisitionCounts=()=>acquisitionBefore?Object.fromEntries(Object.entries(module.numericAcquisitionMetrics).map(([key,value])=>[key,value-acquisitionBefore[key]])):null;
  const trace = { mark(name) { const now = performance.now(); if (this.name) phases[this.name] = (phases[this.name] ?? 0) + now - this.time; this.name = name; this.time = now; } };
  try {
    for (let tick = 0; tick < 270; tick++) {
      trace.name = null;
      const started = performance.now();
      if (pool) await e.fixedUpdateAsync(1 / 60, captured => pool.compute(captured), () => true, { trace: tick >= 150 ? trace : undefined });
      else e.fixedUpdate(1 / 60, { trace: tick >= 150 ? trace : undefined });
      if (tick >= 150) times.push(performance.now() - started);
      if (pool) await new Promise(setImmediate);
    }
    if (acquisitionCompare || coreCompare || readCompare || motionCompare) {
      const witness = { snapshot: module.captureCombat(e, 270, {}, 0), random: e.random.checkpointWitness() };
      if (motionWitness) assert.deepEqual(witness, motionWitness, 'Baseline/candidate complete states agree after all 270 performance ticks');
      else motionWitness = witness;
    }
    const stats = e.statsTracker;
    const kernelCounts=Object.fromEntries(Object.entries(module.stageKernelWork).map(([k,v])=>[k,v-kernelBefore[k]]));
    if(stageKernelCompare&&mode==='stage'){
      assert.ok(kernelCounts.planes>0&&kernelCounts.moduleScores>0&&kernelCounts.rootScores>0&&kernelCounts.sharedPlans>0,
        'Heavy native root/module path must use scalar scores and actual shared read leases');
      assert.ok(kernelCounts.capturedFireFrames===270,
        'All270 native fire frames must retain real captured provenance');
    }
    if(fireFlightCompare&&mode==='stage')assert.ok(module.fireRewriteWork.queries>fireBefore.queries&&module.flightRewriteWork.hostileQueries>flightBefore.hostileQueries&&module.flightRewriteWork.steering>flightBefore.steering,'Real engine must execute rewritten fire and flight algorithms');
    if(decisionCompare&&mode==='stage')assert.ok(decisionCounts().scenes>0&&decisionCounts().modulePlans>0&&fleetCounts().plans>0,'Actual authority must run whole root/module scene and numerical fleet solve');
    if(acquisitionCompare && mode==='stage')assert.ok(acquisitionCounts().preAim>0&&acquisitionCounts().aimScans>0,'Actual armed battle must execute numeric preAim and acquisition scans');
    if(coreCompare && mode==='stage') {
      const owned=module.existingStateCore(e);
      assert.ok(owned?.entityCount>0 && owned.counters.motionSteps>0,'Actual authority battle must execute canonical motion');
      assert.ok(owned.counters.collisionPairs>0,'Actual authority battle must execute the live collision index');
    }
    performanceRows.push({ index, mode, warmSteps: 150, measuredSteps: 120, meanStepMs: times.reduce((a, b) => a + b, 0) / times.length,
      phases, entities: e.ships.length, projectiles: e.projectiles.length, player: stats.playerStats, enemy: stats.enemyStats,
      stageKernel:stageKernelCompare?kernelCounts:null,
      fireRewrite:fireFlightCompare?Object.fromEntries(Object.entries(module.fireRewriteWork).map(([k,v])=>[k,v-fireBefore[k]])):null,flightRewrite:fireFlightCompare?Object.fromEntries(Object.entries(module.flightRewriteWork).map(([k,v])=>[k,v-flightBefore[k]])):null,decisionScene:decisionCompare?decisionCounts():null,numericFleet:decisionCompare?fleetCounts():null,numericAcquisition: acquisitionCounts(), core: module.existingStateCore(e) ? {entities:module.existingStateCore(e).entityCount,bytes:module.existingStateCore(e).byteLength,...module.existingStateCore(e).counters} : null, worker: pool ? { ...pool.status } : null });
    console.log(JSON.stringify(performanceRows.at(-1))); report();
  } finally { pool?.reset(); }
}
pass(stageKernelCompare?'Stage kernel ABBA preserves all270-tick full snapshots/RNG and default private admission; actual shared/scalar/captured execution proved':fireFlightCompare?'Fire/flight rewrite ABBA completed against accepted decision pipeline, with identical complete 270-tick states/RNG':decisionCompare?'Whole decision pipeline paired ABBA completed with identical 270-tick complete states/RNG; actual root/module and numerical fleet execution proved':acquisitionCompare ? 'One paired numerical-acquisition comparison completed; all 270-tick final states and RNG agree' : coreCompare ? 'One paired canonical-core comparison completed; all 270-tick final states and RNG agree' : readCompare ? 'One paired query-read comparison completed; all 270-tick final states and RNG agree' : motionCompare ? 'One paired object/numeric motion comparison completed; all 270-tick final states and RNG agree' : 'One paired live/stage/parallel whole-step comparison completed; no legacy trajectory-equality requirement');
