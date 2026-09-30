/** Bounded whole-engine acceptance, called by check-gloriana-armory --battle-only.
 * Fleet bouts use unmodified combat/AI/damage at 60 Hz. The separately labelled
 * lifecycle scenario seeds damage and commands; it is not a balance result.
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function runGlorianaBattleAcceptance(m, out) {
 const dt=1/60, selected=process.argv.find(a=>a.startsWith('--battle-case='))?.split('=')[1];
 const report={scope:'Node: production CombatEngine at 60Hz, not a multiplayer-room or GPU performance certification',cases:[]};
 const fit=m.evaluate(m.createGlorianaAviationDesign());assert.deepEqual(fit.errors,[]);
 const v=(x=0,y=0)=>new m.Vector2(x,y);
 const living=s=>!s.isDead&&!s.isRetreated&&s.hullHp>0;
 const craftOf=(e,root)=>[...e.fighters,...e.bombers].filter(s=>s.sourceCarrier===root&&living(s));
 function make(enemyIds,seed) {
  const e=new m.CombatEngine('web_gloriana',enemyIds[0],seed);e.switchPlayerShip(fit.spec,enemyIds[0]);
  e.asteroids.length=0;e.nebulae.length=0;e.openBattlefield=true;
  const root=e.playerShip;root.pos.set(0,0);root.prevPos.copy(root.pos);root.facingRad=-Math.PI/2;root.syncModuleTree(true);
  e.enemyShip.pos.set(2000,-700);e.enemyShip.prevPos.copy(e.enemyShip.pos);e.enemyShip.facingRad=Math.PI;
  e.initFighters();
  for(let i=1;i<enemyIds.length;i++) e.addShip(enemyIds[i],false,v(1900+Math.floor(i/3)*600,(i%3-1)*850),Math.PI);
  root.fireControlMode='AI';
  const ai=new m.CapitalShipAI(root,e.enemyShip);
  return {e,root,ai};
 }
 function observer(e,root) {
  const seen=new Set(), docked=new Set(), relaunched=new Set(), seals=new Set(), modes=new Set();
  const sources=new Map(root.assemblyShips.map(s=>[s.id,s.moduleMount?.slotId??'C']));
  const mounts={},weapons={},events=[];let minShield=Infinity,maxCraft=0,activated=false,collapsed=false,rebuilt=false;
  const lastDock=new Set();
  function check(frame) {
   const shield=root.shield.voidShield;minShield=Math.min(minShield,shield.integrity);
   if(shield.integrity===0)collapsed=true;
   if(collapsed&&shield.integrity>0)rebuilt=true;
   activated ||= root.system.isActive;
   const craft=craftOf(e,root);maxCraft=Math.max(maxCraft,craft.length);assert(craft.length<=14,'six decks must not duplicate craft');
   for(const s of e.ships) {
    for(const [key,n] of Object.entries({x:s.pos.x,y:s.pos.y,vx:s.vel.x,vy:s.vel.y,hp:s.hullHp,flux:s.flux.totalFlux}))assert(Number.isFinite(n),`${s.id} invalid ${key}`);
    assert(s.hullHp>=0 && s.hullHp<=s.maxHullHp+1e-5,`${s.id}: HP bounds`);
    assert(s.flux.totalFlux>=-1e-5&&s.flux.totalFlux<=s.flux.maxFlux+1e-3,`${s.id}: flux bounds`);
    if(s.system.blocksWeapons&&s.spec.id.startsWith('web_gloriana')&&s.spec.hullSize!=='FIGHTER')seals.add(s.moduleMount?.slotId??'C');
   }
   for(const wing of e.playerWings.filter(w=>w.carrierId===root.id)) {
    assert(craft.filter(s=>s.flightDeckWingId===wing.wingId).length<=wing.maxCrafts,`${wing.wingId}: deck overflow`);
    assert(wing.crr>=.25-1e-6&&wing.crr<=1+1e-6,'replacement ratio bounds');
   }
   for(const s of craft) {
    const mode=e.bomberAIModes.get(s.id)??e.fighterAIModes.get(s.id);if(mode)modes.add(`${s.spec.id}:${mode.state}`);
    if(s.isDocked) {
     if(!docked.has(s.id))events.push({time:+e.combatTime.toFixed(2),event:'first dock',id:s.id});
     docked.add(s.id);lastDock.add(s.id);
     assert.equal(mode?.state,'DOCKED');assert(s.pos.distanceTo(root.pos)<2,'docked craft must follow carrier');
    } else if(lastDock.delete(s.id)) {relaunched.add(s.id);events.push({time:+e.combatTime.toFixed(2),event:'relaunch',id:s.id});}
    for(const w of s.weapons)if(Number.isFinite(w.ammo))assert(w.ammo>=0 && w.ammo<=(w.spec.maxAmmo??Infinity),'ammo bounds');
   }
   if(frame%300===0) {
    const p=new m.RenderShipProjection();p.begin();assert(p.supports(e.ships),'render projection must support fleet');
    for(const s of e.ships)p.project(s);p.finish();
   }
  }
  function shots() {
   for(const p of [...e.projectiles,...e.beams]) {
    const id=p.firingCycleId!==undefined?`beam:${p.sourceShipId}:${p.slotId}:${p.firingCycleId}`:`shot:${p.id}`;
    if(seen.has(id))continue;seen.add(id);
    weapons[p.specId]=(weapons[p.specId]??0)+1;
    const part=sources.get(p.sourceShipId);if(part)mounts[part]=(mounts[part]??0)+1;
   }
  }
  return {check,shots,summary:()=>({minShield,maxCraft,edictActivated:activated,collapsed,rebuilt,sealedParts:[...seals],dockedCraft:docked.size,relaunchedCraft:relaunched.size,modes:[...modes],observedProjectilesBySpec:weapons,observedShotsByPart:mounts,events,
   finalModules:root.assemblyShips.map(s=>({part:s.moduleMount?.slotId??'C',alive:living(s),hp:Math.round(s.hullHp)})),
   playerStats:e.statsTracker.playerStats,enemyStats:e.statsTracker.enemyStats})};
 }
 const configs=[
  {name:'fast-fleet',seconds:120,enemies:['wolf','wolf','wolf','wolf','hammerhead','hammerhead','shrike','shrike']},
  {name:'heavy-line',seconds:150,enemies:['onslaught','onslaught','dominator','dominator']},
  {name:'point-defense',seconds:150,enemies:['onslaught','eagle','eagle','enforcer','enforcer']},
  {name:'carrier-group',seconds:180,enemies:['astral','heron','heron','condor']},
 ];
 for(const config of configs) {
  if(selected&&selected!==config.name)continue;
  const row={name:config.name,kind:'natural fleet combat',seed:260926+configs.indexOf(config),enemies:config.enemies,maxSeconds:config.seconds};report.cases.push(row);
  const start=performance.now();console.log(`RUN ${config.name}`);
  const {e,root,ai}=make(config.enemies,row.seed),o=observer(e,root);let frames=0;
  try {
   for(;frames<config.seconds*60&&!e.battleResult;frames++) {
    // User-equivalent order and recall. No resupply/healing or forced damage.
    if(frames===20*60) {
     const target=e.capitalShips.find(s=>!s.isPlayer&&living(s)&&s.isVisibleTo(root.teamId));
     if(target)assert(e.issueOrder('fleet',{id:'acceptance-engage',type:'ENGAGE',targetShipId:target.id,issuedTime:e.combatTime}));
    }
    if(frames===65*60)root.fighterRecall=true;
    if(frames===80*60)root.fighterRecall=false;
    e.updateShipAI(ai,dt);e.fixedUpdate(dt);o.shots();if(frames%30===0)o.check(frames);
   }
   o.check(frames);Object.assign(row,o.summary());
   assert(e.statsTracker.playerStats.shotsFired>20,'flagship fleet must actually fire');
   assert(e.statsTracker.enemyStats.shotsFired>20,'enemy fleet must actually fire');
   assert(e.statsTracker.playerStats.totalDamageDealt>0,'real damage to enemies required');
   assert(row.minShield<96000||e.statsTracker.enemyStats.totalDamageDealt>0,'real enemy contact required');
   assert(row.maxCraft===14,'full paid wing deployment');
   row.status='passed';
  } catch(error) {Object.assign(row,o.summary());row.status='failed';row.error=String(error.stack??error);}
  row.combatSeconds=+e.combatTime.toFixed(2);row.wallSeconds=+((performance.now()-start)/1000).toFixed(2);row.outcome=e.battleResult?(e.battleResult.isVictory?'victory':'defeat'):'time limit';row.enemySurvivors=e.capitalShips.filter(s=>!s.isPlayer&&living(s)).length;
  console.log(`${row.status.toUpperCase()} ${row.name}: ${row.combatSeconds}s, ${row.outcome}, wall ${row.wallSeconds}s${row.error?' '+row.error.split('\n')[0]:''}`);
  await writeFile(resolve(out,'verification-battle'+(selected?'-'+selected:'')+'.json'),JSON.stringify(report,null,2));
 }
 if(!selected||selected==='lifecycle') {
  const row={name:'lifecycle',kind:'seeded damage/command scenario; not natural battle balance',seed:261026};report.cases.push(row);
  console.log('RUN lifecycle');const start=performance.now();const {e,root}=make(['web_gloriana'],row.seed),o=observer(e,root);
  try {
   // Stationary non-firing counterpart keeps a legal target alive for repeated air runs.
   e.fighterSystem.init(root); // This labelled recovery rig has no hostile wing launches.
   for(const s of e.combatShips)for(const w of s.weapons){w.isDisabled=true;w.isPermanentlyDisabled=true;}
   const firingBattery=root.childModules.find(s=>s.moduleMount.slotId==='S2');
   for(const w of firingBattery.weapons){w.isDisabled=false;w.isPermanentlyDisabled=false;}
   e.externallyControlledShipIds.add(e.enemyShip.id);e.enemyShip.clearInput();root.fireControlMode='MANUAL';root.clearInput();
   e.enemyShip.pos.set(1900,0);e.enemyShip.syncModuleTree(true);
   const sentinel=e.addShip('onslaught',false,v(9000,0));e.externallyControlledShipIds.add(sentinel.id);for(const w of sentinel.weapons){w.isDisabled=true;w.isPermanentlyDisabled=true;}
   const ally=e.addShip('onslaught',true,v(-7000,0));e.externallyControlledShipIds.add(ally.id);for(const w of ally.weapons)w.isDisabled=true;
   const p1=root.childModules.find(s=>s.moduleMount.slotId==='P1'),ep=root.childModules.find(s=>s.moduleMount.slotId==='EP');
   const seeded=[root,p1,ep];for(const s of seeded){s.hullHp=s.maxHullHp*.35;s.flux.softFlux=0;s.flux.hardFlux=0;}
   root.shield.absorbImpact(96000,'ENERGY',0);o.check(0);
   let order=false,loss=false,killed=false,recallHeld=false,dockSample,deathDocked=[],deathCraftCount=0,deathIds=new Set();const usedSeals=new Set();
   for(let frame=0;frame<180*60;frame++) {
    if(frame===1){order=e.issueOrder('fleet',{id:'sortie',type:'ENGAGE',targetShipId:e.enemyShip.id,issuedTime:e.combatTime});assert(order);}
    if(frame===7*60){root.aimTargetWorld.copy(e.enemyShip.pos);assert(root.system.activate(),'manual broadside edict accepted after seal');}
    if(frame===10*60){p1.applyHullDamage(p1.hullHp+1);loss=true;}
    if(frame===30*60) {
     const fighter=craftOf(e,root).find(s=>s.spec.id===m.GLORIANA_CRAFT.fury);assert(fighter);fighter.applyHullDamage(fighter.hullHp+1);
    }
    if(frame===70*60)root.fighterRecall=true;
    if(frame===90*60){recallHeld=e.bombers.some(s=>s.sourceCarrier===root&&s.isDocked);root.fighterRecall=false;}
    // Use ordinary thrust for part of the recall to test a moving landing point.
    root.throttle=frame>=70*60&&frame<85*60?1:0;root.brakeInput=frame>=85*60;
    if(frame>=90*60&&!killed&&e.bombers.some(s=>s.sourceCarrier===root&&s.isDocked)) {
     deathDocked=e.bombers.filter(s=>s.sourceCarrier===root&&s.isDocked);deathCraftCount=craftOf(e,root).length;deathIds=new Set(craftOf(e,root).map(s=>s.id));
     root.applyHullDamage(root.hullHp+1);killed=true;row.carrierKilledAt=+e.combatTime.toFixed(2);
    }
    e.fixedUpdate(dt);o.shots();if(frame%30===0)o.check(frame);
    for(const s of seeded)if(s.system.blocksWeapons)usedSeals.add(s.id);
    if(frame===60*60) {const b=e.bombers.find(s=>s.sourceCarrier===root&&s.isDocked);if(b)dockSample={id:b.id,hp:b.hullHp};}
    if(loss&&frame===12*60){assert(p1.isDead);assert(living(root));assert(root.childModules.filter(living).length===7);}
    if(frame===28*60)assert(root.shield.voidShield.integrity>0,'shield must rebuild via real fixed updates');
    if(killed&&e.combatTime>row.carrierKilledAt+30) {
     assert(root.isDead);assert(root.childModules.every(s=>s.isDead));assert(deathDocked.every(s=>s.isDead),'docked bombers die with mother');
     assert(craftOf(e,root).length<=deathCraftCount-deathDocked.length,'no launches from dead carrier');
     assert(craftOf(e,root).every(s=>deathIds.has(s.id)),'dead carrier must not spawn replacements');break;
    }
   }
   Object.assign(row,o.summary(),{recallHeld,dockSample,sealsTriggered:usedSeals.size,carrierDeathTested:killed});
   assert(usedSeals.size===3,'three independent compartments must seal');assert(row.collapsed&&row.rebuilt,'collapse/rebuild cycle');
   assert(row.dockedCraft>0&&row.relaunchedCraft>0,'live full-engine bomber return and relaunch');assert(recallHeld,'recalled bomber remains docked');assert(killed,'must reach mother-loss while bombers docked');
   assert(e.statsTracker.playerStats.fightersRebuilt>0,'actual lost fighter replaced');row.status='passed';
  } catch(error) {Object.assign(row,o.summary());row.status='failed';row.error=String(error.stack??error);}
  row.combatSeconds=+e.combatTime.toFixed(2);row.wallSeconds=+((performance.now()-start)/1000).toFixed(2);
  console.log(`${row.status.toUpperCase()} lifecycle: ${row.combatSeconds}s, wall ${row.wallSeconds}s${row.error?' '+row.error.split('\n')[0]:''}`);
 }
 assert(report.cases.length,'unknown battle case');
 await writeFile(resolve(out,'verification-battle'+(selected?'-'+selected:'')+'.json'),JSON.stringify(report,null,2));
 assert(report.cases.every(c=>c.status==='passed'),report.cases.filter(c=>c.status!=='passed').map(c=>`${c.name}: ${c.error}`).join('\n'));
}
