import assert from 'node:assert/strict';
import fs from 'node:fs';

/** Real CombatView, not a fabricated engine prop: HUD/input/lifecycle/settlement. */
export async function checkHostedCombatUI(page) {
  await page.goto(new URL('/__multiteam_map_check.html',page.url()).href);
  await page.evaluate(async()=>{
    await import('/src/index.css');await import('/src/ui/core/motion.css');await import('/src/ui/native-chrome.css');
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {CombatView}=await import('/src/CombatView.tsx');
    const root=document.createElement('div');root.id='hosted-ui';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'100',background:'#030712'});document.body.append(root);
    window.__hostedRoot=createRoot(root);window.__hostedRoot.render(React.createElement(CombatView));
  });
  await page.waitForFunction(()=>window.__combatSession?.isPresentationReady()&&window.__combatSession.getAuthorityStatus().tick>=4,null,{timeout:120000});
  const canvas=page.locator('#hosted-ui canvas').first();await canvas.focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__combatSession.state==='paused');
  console.log('hosted UI: initial worker ready');
  const initial=await page.evaluate(async()=>{
    const s=window.__combatSession;await s.barrier();let engineDenied=false;try{engineDenied = s.engine === undefined;}catch{engineDenied=true;}
    return {status:s.getAuthorityStatus(),engineDenied,shipId:s.read.playerShip.id,armor:Array.from(s.read.playerShip.armor.cells),weaponCount:s.read.playerShip.weapons.length,
      hasSimulation:'fixedUpdate' in s.read.playerShip,systemMutation:'activate' in s.read.playerShip.system,readClass:Object.getPrototypeOf(s.read.playerShip).constructor.name};
  });
  assert.equal(initial.status.backend,'worker-render');assert(initial.engineDenied&&!initial.hasSimulation&&!initial.systemMutation);assert(initial.weaponCount>0&&initial.armor.length>0);
  const buttons=page.getByRole('button',{name:/^选择武器组 \d+$/});assert(await buttons.count()>1);
  const label=await buttons.nth(1).getAttribute('aria-label'),group=Number(label.match(/\d+/)[0])-1;
  await buttons.nth(1).click();await page.waitForFunction(group=>window.__combatSession.read.playerShip.selectedGroupIndex===group,group);
  const target=await page.evaluate(async()=>{
    const s=window.__combatSession,enemy=s.read.capitalShips.find(ship=>ship.teamId!==s.read.playerShip.teamId);
    const ack=await s.dispatchControl({kind:'ship',command:{kind:'target'},aim:[enemy.pos.x,enemy.pos.y]});
    return {accepted:ack.accepted,id:s.read.targetShip?.id,weapons:s.read.targetShip?.weapons.length,enemy:enemy.id,tick:s.getAuthorityStatus().tick};
  });assert(target.accepted);assert.equal(target.id,target.enemy);assert(target.weapons>0);assert.equal(target.tick,initial.status.tick);
  await canvas.focus();await page.keyboard.press('Tab');const map=page.getByRole('region',{name:'战术地图',exact:true});await map.waitFor();
  await page.keyboard.press('a');await page.getByRole('button',{name:'全面进攻!',exact:true}).click();
  await page.waitForFunction(()=>!!window.__combatSession.tacticalMapView.read().map?.orders.fleet);
  await page.keyboard.press('Delete');await page.waitForFunction(()=>!window.__combatSession.tacticalMapView.read().map?.orders.fleet);
  await page.keyboard.press('Tab');await map.waitFor({state:'hidden'});
  // Resume, hold/release real movement, then pause through the actual UI.
  const before=await page.evaluate(()=>({x:window.__combatSession.read.playerShip.pos.x,y:window.__combatSession.read.playerShip.pos.y,tick:window.__combatSession.getAuthorityStatus().tick}));
  await canvas.focus();await page.keyboard.press('Space');await page.keyboard.down('KeyW');
  await page.waitForFunction(tick=>window.__combatSession.getAuthorityStatus().tick>=tick+12,before.tick,{timeout:60000});
  await page.keyboard.up('KeyW');await page.keyboard.press('Space');await page.waitForFunction(()=>window.__combatSession.state==='paused');
  const after=await page.evaluate(async()=>{const s=window.__combatSession;await s.barrier();return {x:s.read.playerShip.pos.x,y:s.read.playerShip.pos.y,tick:s.getAuthorityStatus().tick};});
  assert(after.tick>before.tick);assert(Math.hypot(after.x-before.x,after.y-before.y)>0);
  const dir=process.env.MAP_CHECK_ARTIFACTS;if(dir)await page.screenshot({path:dir+'/hosted-combat-hud.png'});
  // A restored authority must continue like the UNINTERRUPTED authority, not merely
  // render the same pose once. Includes hidden AI/RNG/effect evolution after replay.
  const replay = await page.evaluate(async()=>{
    const {LocalWorkerHost}=await import('/src/engine/runtime/local/LocalWorkerHost.ts');
    const {CombatReplayJournal,copyReplayCheckpoint,MAX_REPLAY_TICKS}=await import('/src/engine/runtime/local/CombatReplayCheckpoint.ts');
    const {LOCAL_COMBAT_PROTOCOL}=await import('/src/engine/runtime/local/LocalCombatProtocol.ts');
    const s=window.__combatSession; await s.barrier(); const original=s.workerHost;
    const state=host=>{
      const f=host.latest,v=f.presentation.view,h=f.presentation.hud;
      const vec=p=>p&&[p.x,p.y];
      const ships=v.ships.map(ship=>[ship.id,vec(ship.pos),vec(ship.vel),ship.facingRad,ship.hullHp,ship.isDead,ship.flux.softFlux,ship.flux.hardFlux]);
      const detail=ship=>ship&&[ship.id,Array.from(ship.armor.cells),ship.weapons.map(w=>[w.slotId,w.ammo,w.cooldownRemaining,w.currentAngle]),ship.system.state,ship.system.cooldownRemaining];
      return {witness:f.witness,ships,detail:[detail(h.read.playerShip),detail(h.read.targetShip)],
        projectiles:v.projectiles.map(p=>[p.id,vec(p.pos),vec(p.vel),p.facing,p.life,p.damage]),
        beams:v.beams.map(b=>[vec(b.from),vec(b.to),b.damage]),map:h.read.isTacticalMap,outcome:f.outcome};
    };
    window.__replayState=state;
    const checkpoint=original.checkpoint();
    const rejects=fn=>{try{fn();return false;}catch{return true;}};
    const badVersion=structuredClone(checkpoint);badVersion.protocol++;
    const badCount=structuredClone(checkpoint);badCount.tick++;
    const changed=structuredClone(checkpoint);changed.config.expectedContent+='changed';
    if(!rejects(()=>copyReplayCheckpoint(badVersion,LOCAL_COMBAT_PROTOCOL))||!rejects(()=>copyReplayCheckpoint(badCount,LOCAL_COMBAT_PROTOCOL))
      ||!rejects(()=>new LocalWorkerHost(changed.config,90000,changed)))throw Error('incompatible checkpoint accepted');
    const sample={autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false};
    const full=structuredClone(checkpoint);full.tick=MAX_REPLAY_TICKS;full.witness[0]=full.tick;full.entries=[{kind:'step',sample,count:full.tick}];
    const budget=new CombatReplayJournal(full.config,LOCAL_COMBAT_PROTOCOL);budget.seed(full);budget.record({kind:'step',sample},[],full.witness);
    if(!budget.unavailableReason)throw Error('replay journal exceeded budget silently');
    const badWitness=structuredClone(checkpoint);badWitness.witness[2]++;
    const refused=new LocalWorkerHost(badWitness.config,90000,badWitness);let rejected=false;
    try{await refused.ready;}catch{rejected=true;}finally{refused.dispose();}
    if(!rejected)throw Error('divergent replay accepted');
    const clone=new LocalWorkerHost(checkpoint.config,90000,checkpoint);
    let compared=0, maxProjectiles=0;
    try{
      await clone.ready;
      if(clone.latest.audio.length)throw Error('historical audio replayed');
      if(JSON.stringify(state(original))!==JSON.stringify(state(clone)))throw Error('restored initial state differs');
      for(let i=0;i<60;i++){
        await original.step(sample);await clone.step(sample);
        if(JSON.stringify(state(original))!==JSON.stringify(state(clone)))throw Error('replay continuation diverged at '+i);
        compared++;maxProjectiles=Math.max(maxProjectiles,original.latest.presentation.view.projectiles.length);
      }
    }finally{clone.dispose();}
    await s.barrier();
    window.__beforeRecovery=state(original);window.__recoveryTick=original.latest.tick;
    const pending=original.commands([{kind:'toggle-map'}]);
    original.worker.dispatchEvent(new ErrorEvent('error',{message:'intentional recovery fixture'}));
    if(s.getPresentationState().status!=='failed'||!s.canRecoverAuthority)throw Error('worker error was not surfaced immediately');
    let dropped=false;try{await pending;}catch{dropped=true;}
    const refusedControl=await s.dispatchControl({kind:'clear-input'});
    if(!dropped||refusedControl.accepted||!s.canRecoverAuthority)throw Error('failed authority did not stop at ACK');
    if(original.checkpoint().tick!==window.__recoveryTick)throw Error('unconfirmed tick recorded');
    return {compared,maxProjectiles,tick:window.__recoveryTick,epoch:original.epoch,rejectedWitness:rejected,budget:budget.unavailableReason};
  });
  await page.getByRole('button',{name:'恢复至已确认进度',exact:true}).click();
  await page.waitForFunction(()=>window.__combatSession.isPresentationReady(),null,{timeout:120000});
  const recovered=await page.evaluate(async()=>{
    const s=window.__combatSession;await s.barrier();
    const after=window.__replayState(s.workerHost),before=window.__beforeRecovery;
    if(JSON.stringify(after)!==JSON.stringify(before))throw Error('actual UI recovery changed the last confirmed world');
    return {tick:s.getAuthorityStatus().tick,state:s.state,epoch:s.workerHost.epoch,backend:s.getAuthorityStatus().backend};
  });
  assert.equal(recovered.tick,replay.tick);assert.equal(recovered.state,'paused');assert(recovered.epoch>replay.epoch);
  if(dir)fs.writeFileSync(dir+'/hosted-recovery.json',JSON.stringify({replay,recovered},null,2));
  console.log('hosted UI: ACK-boundary recovery and uninterrupted continuation passed');
  if(process.env.MAP_CHECK_ONLY_RECOVERY==='1'){
    const idleFailure=await page.evaluate(async()=>{
      const s=window.__combatSession;await s.barrier();const old=s.workerHost;
      if(old.pendingTransactions)throw Error('idle failure fixture still has transactions');
      old.worker.dispatchEvent(new ErrorEvent('error',{message:'idle paused Worker failure'}));
      if(s.getPresentationState().status!=='failed'||!s.canRecoverAuthority)throw Error('paused crash requires a command to surface');
      const restoring=s.recoverAuthority(),restoringHost=s.workerHost;
      window.__hostedRoot.unmount();const result=await restoring;
      return {accepted:result.accepted,host:restoringHost.status,session:s.state};
    });
    assert.equal(idleFailure.accepted,false);assert.equal(idleFailure.host,'disposed');assert.equal(idleFailure.session,'disposed');
    if(dir)fs.writeFileSync(dir+'/hosted-recovery-idle.json',JSON.stringify(idleFailure,null,2));
    return {initial,target,before,after,replay,recovered,idleFailure};
  }

  // Real game owner creates a new epoch. Pending old ACK must not revive it.
  const stale=await page.evaluate(async()=>{
    const s=window.__combatSession,epoch=s.controlEpoch,old=s.workerHost;
    const pending=s.dispatchControl({kind:'ship',command:{kind:'vent'}});
    window.__gameSession.startSandbox('wolf');const ack=await pending;
    return {epoch,newEpoch:s.controlEpoch,accepted:ack.accepted,oldStatus:old.status};
  });assert(stale.newEpoch>stale.epoch);assert.equal(stale.accepted,false);assert.equal(stale.oldStatus,'disposed');
  await page.waitForFunction(()=>window.__combatSession.isPresentationReady()&&window.__combatSession.read.playerShip.spec.id==='wolf',null,{timeout:120000});
  // Retry uses native pre-battle fleet values. A deliberately fragile enemy fixture
  // allows real weapon damage and authoritative settlement, not a fake result ACK.
  console.log('hosted UI: input and epoch isolation passed; settlement');
  const encounter=await page.evaluate(async()=>{
    const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
    const spec=structuredClone(contentRegistry.getShip('wolf'));
    Object.assign(spec,{id:'hosted-settlement-target',hitpoints:1,armorRating:0,shieldType:'NONE',maxSpeed:0,acceleration:0});
    contentRegistry.registerShip(spec,false,false);
    const game=window.__gameSession;const ids=game.getSnapshot().fleet.filter(s=>s.status==='ready').map(s=>s.id);
    game.startFleetCombat(ids,'hosted-settlement-target',ids.slice(0,1),240);
    const save=JSON.parse(game.exportSave());save.pendingCombat.enemyFleet[0].hullFraction=1;
    if(save.pendingCombat.enemyFleet[0].armor)save.pendingCombat.enemyFleet[0].armor.fractions.fill(0);
    game.importSave(JSON.stringify(save));return save.pendingCombat.id;
  });
  await page.waitForFunction(()=>window.__combatSession.isPresentationReady()&&window.__combatSession.read.deploymentEnabled,null,{timeout:120000});
  // Keep the UI paused while the SAME session API advances accepted ticks for a bounded scenario.
  await page.evaluate(async()=>{const s=window.__combatSession;s.pause();await s.barrier();});
  const settlement=await page.evaluate(async()=>{
    const s=window.__combatSession,g=window.__gameSession;let steps=0;await s.dispatchControl({kind:'pilot',autopilot:true});
    for(;steps<750&&g.getSnapshot().pendingCombat;steps++){
      s.start();await s.fixedUpdateControlled(1/60,{autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false});
      s.pause();await s.barrier();
    }
    return {steps,pending:g.getSnapshot().pendingCombat,history:g.getSnapshot().outcomes,error:g.error,
      result:!!s.read.battleResult,ready:s.read.isBattleResultReady,outcome:s.workerHost.latest.outcome,tick:s.getAuthorityStatus().tick,backend:s.getAuthorityStatus().backend};
  });
  if(dir)fs.writeFileSync(dir+'/hosted-settlement-latest.json',JSON.stringify(settlement,null,2));
  assert.equal(settlement.error,null);assert(settlement.result&&settlement.ready,'real battle must finish within fixture budget');assert.equal(settlement.pending,null);assert.equal(settlement.outcome.encounterId,encounter);assert.equal(settlement.backend,'worker-render');
  console.log('hosted UI: authoritative settlement passed; failure/disposal');
  const failure=await page.evaluate(async()=>{
    const s=window.__combatSession,host=s.workerHost;host.fail(new Error('intentional worker failure fixture'));
    if(s.getPresentationState().status!=='failed')throw Error('idle Worker failure did not notify its session');
    const ack=await s.dispatchControl({kind:'clear-input'});
    const failed={accepted:ack.accepted,status:s.getPresentationState().status,backend:s.getAuthorityStatus().backend,tick:s.getAuthorityStatus().tick};
    window.__hostedRoot.unmount();return {...failed,hostStatus:host.status,sessionState:s.state};
  });assert.equal(failure.accepted,false);assert.equal(failure.status,'failed');assert.equal(failure.backend,'worker-render');assert.equal(failure.hostStatus,'disposed');assert.equal(failure.sessionState,'disposed');
  const result={initial,target,before,after,replay,recovered,stale,settlement,failure};if(dir)fs.writeFileSync(dir+'/hosted-combat-ui.json',JSON.stringify(result,null,2));return result;
}
/** Same existing hosted scenario, with genuine page reload + fleet settlement. */
export async function checkPersistentCombatUI(page) {
  const mount=async(checkStartup=false)=>{
    await page.evaluate(async checkStartup=>{
      await import('/src/index.css');await import('/src/ui/core/motion.css');await import('/src/ui/native-chrome.css');
      const React=(await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const {CombatView}=await import('/src/CombatView.tsx');
      if(checkStartup){
        const {CombatCheckpointStore}=await import('/src/engine/game/CombatCheckpointStore.ts');
        const load=CombatCheckpointStore.prototype.load;
        CombatCheckpointStore.prototype.load=async function(){
          await new Promise(resolve=>setTimeout(resolve,1000));
          window.__checkpointStartup ??= {state:window.__combatSession?.state,tick:window.__combatSession?.getAuthorityStatus().tick};
          return load.call(this);
        };
      }
      const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
      // Installed identically before each mount: tests a stable data mod, not missing content.
      const spec=structuredClone(contentRegistry.getShip('wolf'));
      Object.assign(spec,{id:'durable-settlement-target',hitpoints:1,armorRating:0,shieldType:'NONE',maxSpeed:0,acceleration:0});
      contentRegistry.registerShip(spec,false,false);
      const root=document.createElement('div');root.id='hosted-ui';Object.assign(root.style,{position:'fixed',inset:'0',background:'#030712'});document.body.append(root);
      window.__hostedRoot=createRoot(root);window.__hostedRoot.render(React.createElement(CombatView));
    },checkStartup);
    await page.waitForFunction(()=>window.__combatSession?.isPresentationReady()&&window.__gameSession.combatCheckpointStatus.state!=='loading',null,{timeout:120000});
  };
  await mount();
  const canvas=page.locator('#hosted-ui canvas').first();await canvas.focus();await page.keyboard.press('Space');
  const encounter=await page.evaluate(async()=>{
    const g=window.__gameSession,s=g.combat;s.pause();await s.barrier();
    const ids=g.getSnapshot().fleet.filter(m=>m.status==='ready').map(m=>m.id);
    g.startFleetCombat(ids,'durable-settlement-target',ids.slice(0,1),240);return g.getSnapshot().pendingCombat.id;
  });
  await page.waitForFunction(()=>window.__combatSession.isPresentationReady()&&window.__combatSession.read.deploymentEnabled,null,{timeout:120000});
  await page.evaluate(async()=>{
    const s=window.__combatSession;s.pause();await s.barrier();await s.dispatchControl({kind:'pilot',autopilot:true});
    for(let i=0;i<45;i++){
      s.start();await s.fixedUpdateControlled(1/60,{autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false});s.pause();await s.barrier();
    }
    if(!window.__gameSession.getSnapshot().pendingCombat)throw Error('fixture finished before checkpoint');
  });
  await canvas.focus();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'游戏设置',exact:true}).click();
  await page.getByRole('button',{name:'舰队 / 存档',exact:true}).click();
  await page.getByRole('button',{name:'保存中场进度',exact:true}).click();
  await page.waitForFunction(()=>window.__gameSession.combatCheckpointStatus.state==='saved',null,{timeout:120000});
  const saved=await page.evaluate(()=>({status:window.__gameSession.combatCheckpointStatus,witness:window.__combatSession.workerHost.latest.witness,
    encounter:window.__gameSession.getSnapshot().pendingCombat.id,revision:window.__gameSession.getSnapshot().revision}));
  const dir=process.env.MAP_CHECK_ARTIFACTS;if(dir)await page.screenshot({path:dir+'/persistent-checkpoint-panel.png'});
  console.log('persistent UI: real menu saved checkpoint',saved.status.tick);
  const contracts=await page.evaluate(async()=>{
    const {CombatCheckpointStore}=await import('/src/engine/game/CombatCheckpointStore.ts');
    const {copyReplayCheckpoint}=await import('/src/engine/runtime/local/CombatReplayCheckpoint.ts');
    const {LOCAL_COMBAT_PROTOCOL}=await import('/src/engine/runtime/local/LocalCombatProtocol.ts');
    const g=window.__gameSession,s=g.combat,record=structuredClone(g.checkpointRecord);
    const bad=structuredClone(record.replay);bad.build='stale-code';let version=false;
    try{copyReplayCheckpoint(bad,LOCAL_COMBAT_PROTOCOL);}catch{version=true;}
    const wrong=structuredClone(record.replay);wrong.config.encounter.id+='other';const original=s.workerHost;
    const rejected=await s.restoreCheckpoint(wrong);
    if(rejected.accepted||s.workerHost!==original)throw Error('wrong encounter replaced authority');
    const key='isolated-durable-contract',a=new CombatCheckpointStore(key),b=new CombatCheckpointStore(key);
    await Promise.all([a.load(),b.load()]);
    record.probe={infinity:Infinity,minusZero:-0,absent:undefined,typed:new Float64Array([Math.PI,-0,Infinity])};
    await a.write(record,()=>true);let conflict=false;
    try{await b.write(null,()=>true);}catch{conflict=true;}
    const c=new CombatCheckpointStore(key),roundTrip=await c.load();
    const exact=roundTrip.probe.infinity===Infinity&&Object.is(roundTrip.probe.minusZero,-0)&&Object.hasOwn(roundTrip.probe,'absent')
      &&roundTrip.probe.typed instanceof Float64Array&&Object.is(roundTrip.probe.typed[1],-0);
    const denied=new CombatCheckpointStore('denied',()=>{throw Error('storage denied fixture');});let unavailable=false;
    try{await denied.load();}catch{unavailable=true;}
    a.dispose();b.dispose();c.dispose();denied.dispose();
    if(!version||!conflict||!exact||!unavailable)throw Error('durable checkpoint contracts failed');
    return {version,conflict,exact,unavailable,wrongEncounter:!rejected.accepted};
  });
  // A real navigation destroys the old JS realm, Worker and in-memory journal.
  await page.reload();await mount(true);
  const startup=await page.evaluate(()=>window.__checkpointStartup);
  assert.equal(startup.state,'paused');assert.equal(startup.tick,0);
  await page.waitForFunction(()=>window.__gameSession.combatCheckpointStatus.state==='available',null,{timeout:120000});
  await page.getByRole('button',{name:'继续中场进度',exact:true}).click();
  await page.getByRole('button',{name:'确认继续中场',exact:true}).click();
  await page.waitForFunction(()=>window.__gameSession.combatCheckpointStatus.state==='saved'&&window.__combatSession.isPresentationReady(),null,{timeout:120000});
  const restored=await page.evaluate(async()=>{
    const s=window.__combatSession,g=window.__gameSession;await s.barrier();
    return {tick:s.getAuthorityStatus().tick,witness:s.workerHost.latest.witness,state:s.state,encounter:g.getSnapshot().pendingCombat.id,revision:g.getSnapshot().revision};
  });
  assert.equal(restored.encounter,encounter);assert.equal(restored.tick,saved.status.tick);assert.equal(restored.state,'paused');assert.equal(restored.revision,saved.revision);assert.deepEqual(restored.witness,saved.witness);
  console.log('persistent UI: genuine reload restored the same fleet encounter');
  if(process.env.MAP_CHECK_PERSISTENT_STARTUP_ONLY==='1'){
    await page.evaluate(()=>window.__hostedRoot.unmount());
    const result={saved,contracts,restored,startup};if(dir)fs.writeFileSync(dir+'/persistent-startup.json',JSON.stringify(result,null,2));return result;
  }

  const settled=await page.evaluate(async()=>{
    const g=window.__gameSession,s=g.combat;const id=g.getSnapshot().pendingCombat.id;let steps=0;
    const sample={autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false};
    for(;steps<750&&g.getSnapshot().pendingCombat;steps++){
      s.start();await s.fixedUpdateControlled(1/60,sample);s.pause();await s.barrier();
    }
    await g.checkpointStore.verify();
    const {CombatCheckpointStore}=await import('/src/engine/game/CombatCheckpointStore.ts');
    const probe=new CombatCheckpointStore(g.store.storageKey),remaining=await probe.load();probe.dispose();
    // Repeated accepted barriers are not a second battle-completed event/writeback.
    const revision=g.getSnapshot().revision;await s.barrier();await s.barrier();
    return {steps,id,pending:g.getSnapshot().pendingCombat,outcomes:g.getSnapshot().outcomes.filter(o=>o.encounterId===id),
      error:g.error,remaining,revision,finalRevision:g.getSnapshot().revision,store:g.saveStatus};
  });
  assert.equal(settled.pending,null);assert.equal(settled.error,null);assert.equal(settled.outcomes.length,1);assert.equal(settled.outcomes[0].enemyFleet[0].status,'destroyed');
  assert.equal(settled.remaining,null);assert.equal(settled.finalRevision,settled.revision);assert.equal(settled.store.state,'saved');
  await page.reload();await mount();
  const reopened=await page.evaluate(id=>({count:window.__gameSession.getSnapshot().outcomes.filter(o=>o.encounterId===id).length,
    status:window.__gameSession.combatCheckpointStatus.state,canResume:window.__gameSession.canResumeCombatCheckpoint}),encounter);
  assert.equal(reopened.count,1);assert.equal(reopened.canResume,false);
  await page.evaluate(()=>window.__hostedRoot.unmount());
  const result={saved,contracts,restored,startup,settled,reopened};if(dir)fs.writeFileSync(dir+'/persistent-combat.json',JSON.stringify(result,null,2));return result;
}
