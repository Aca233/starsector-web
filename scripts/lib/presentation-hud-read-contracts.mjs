import assert from 'node:assert/strict';

/** Same-realm frozen encoder oracle: field values, prototypes, graph identities,
 * metadata/shape order and every effective byte must remain identical. */
export function checkPresentationHudReads(api) {
  const {CombatPresentationEncoder: Encoder, BeforeCombatPresentationEncoder: Before,
    CombatPresentationDecoder: Decoder, LocalCombatKernel, FireControlQueryRoster: Roster, Ship, Vector2} = api;
  let checks = 0, exactPackets = 0, ownedFrames = 0, genericContacts = 0, ownedContacts = 0, referenceReadonlyFrames = 0;
  const reports = [], same = (a,b,label) => { assert.deepEqual(a,b,label);checks++; };
  const packet = p => ({...p,buffer:new Uint8Array(p.buffer,0,p.length*8),
    visuals:{...p.visuals,buffer:new Uint8Array(p.visuals.buffer,0,p.visuals.length*8)}});
  const trace = encoder => {
    const reads = [], projector = encoder.hud, original = projector.contact;
    projector.contact = function(ship,detail,engine) { reads.push({ship,detail});return original.call(this,ship,detail,engine); };
    const readonly = projector.captureReadonly;reads.readonlyCalls = 0;
    projector.captureReadonly = function(engine) { reads.readonlyCalls++;return readonly.call(this,engine); };
    return reads;
  };
  const sample = {autopilot:true,blocked:false,keys:{},aim:[0,-400],firing:false,mouseSteering:false,pointerActive:false};
  for (const [playerHull,enemyHull] of [['onslaught','paragon'],['doom','harbinger'],['astral','sunder'],['web_gloriana','paragon']]) {
    const k = new LocalCombatKernel({playerHull,enemyHull,seed:8771,multicore:false});
    try {
      const current = new Encoder(871,'render'), reference = Before ? new Before(871,'render') : undefined;
      const decoder = new Decoder(871,'render'), oldDecoder = reference ? new Decoder(871,'render') : undefined;
      const reads = trace(current), oldReads = reference ? trace(reference) : undefined;
      const player = k.engine.playerShip, enemy = k.engine.enemyShip;
      enemy.visibleToPlayer = true;enemy.visibilityMask = 0x7fffffff;
      let last, oldLast, previousShip;
      for (let frame = 0; frame < 15; frame++) {
        if (frame === 1) Roster.ownForWorker(k.engine);
        if (frame === 2) player.playerTargetId = enemy.id;
        if (frame === 3) { player.pos.x += 71; player.hullHp -= 7; player.armor.setCell(0,0,player.armor.maxCellArmor*.37); if(player.weapons[0])player.weapons[0].ammo = 3; }
        if (frame === 4) { k.step(sample); k.engine.combatTime += .2; }
        if (frame === 5) { player.playerTargetId = null; enemy.isDocked = true; }
        if (frame === 6) {
          enemy.isDocked = false; player.playerTargetId = enemy.id;
          if(player.childModules.length) { player.fireControlMode = 'MANUAL';player.childModules[0].fireControlMode = 'MANUAL'; }
          player.system.state = 'ACTIVE';player.system.isActive = true;player.system.effectLevel = .75;
        }
        if (frame === 7) { player.system.state = 'OUT';player.system.effectLevel = .25;if(player.childModules[0])player.childModules[0].fireControlMode = 'AI'; }
        if (frame === 8) k.engine.reinforcements.push(player,player); // Duplicate slots, not duplicate entities.
        if (frame === 9) { k.engine.reinforcements.pop();k.engine.reinforcements.pop();player.system.state = 'IDLE';player.system.isActive = false; }
        if (frame === 10) { k.command({kind:'add-ship',hull:'broadsword',isPlayer:true,position:[100,100],facing:0});k.command({kind:'add-ship',hull:'dagger',isPlayer:true,position:[150,100],facing:0}); }
        if (frame === 11) { player.shield.setActive(true);player.shield.update(.1,0,0); }
        if (frame === 12) { enemy.isRetreated = true;player.playerTargetId = enemy.id; }
        if (frame === 13) { enemy.isRetreated = false;player.playerTargetId = null; }
        if (frame === 14) { player.currentCR = .22;player.flux.softFlux = 24;player.flux.hardFlux = 19; }
        reads.length = 0;reads.readonlyCalls = 0;if(oldReads){oldReads.length = 0;oldReads.readonlyCalls = 0;}
        const witness = k.replayWitness();
        last = current.capture(k.engine,k.tick,last?.buffer,last?.visuals.buffer);
        same(k.replayWitness(),witness,'HUD capture cannot change authority witness');
        if (reference) {
          oldLast = reference.capture(k.engine,k.tick,oldLast?.buffer,oldLast?.visuals.buffer);
          same(packet(last),packet(oldLast),playerHull+'/exact packet/'+frame);exactPackets++;
          if(frame === 0) same(reads.map(r=>[r.ship.id,r.detail]),oldReads.map(r=>[r.ship.id,r.detail]),'public entry retains original call sequence');
          if(oldReads.readonlyCalls)referenceReadonlyFrames++;else genericContacts += oldReads.length;
        }
        const shown = decoder.apply(structuredClone(last));
        if(oldDecoder)same(shown,oldDecoder.apply(structuredClone(oldLast)),playerHull+'/complete display/'+frame);
        if(frame > 0) {
          same(reads.length,new Set(reads.map(r=>r.ship)).size,'owned source identity is projected only once');
          same(reads.readonlyCalls,1,'owned current encoder uses readonly projection');
          if(oldReads) {
            if(oldReads.readonlyCalls)same(oldReads.length,reads.length,'already-optimized reference retains the same single-pass count');
            else {assert(oldReads.length > reads.length,'duplicate public HUD reads must be eliminated');checks++;}
          }
          ownedFrames++;ownedContacts += reads.length;
        }
        same(shown.hud.read.playerShip,shown.hud.read.ships.find(s=>s.id===player.id),'player record/roster values');
        assert.equal(shown.hud.read.playerShip,shown.hud.read.ships.find(s=>s.id===player.id));checks++;
        if(frame === 8) { const matches = shown.hud.read.ships.filter(s=>s.id===player.id);same(matches.length,3,'all duplicate roster slots survive');assert(matches.every(s=>s===matches[0]));checks++; }
        if(frame === 3) { same(shown.hud.read.playerShip.pos.x,player.pos.x,'same-tick position live');same(shown.hud.read.playerShip.hullHp,player.hullHp,'same-tick hull live');same(shown.hud.read.playerShip.weapons[0].ammo,player.weapons[0].ammo,'same-tick ammo live'); }
        if(frame === 6 && player.childModules.length)same(shown.hud.read.weaponShip.id,player.childModules[0].id,'selected module detail follows current control');
        if(frame === 9 && player.childModules.length)same(shown.hud.read.weaponShip.id,player.id,'released module detail follows current control');
        if(previousShip)assert.equal(shown.hud.read.playerShip,previousShip);previousShip = shown.hud.read.playerShip;
      }
      // Equal IDs must not cause unrelated source identities to be merged.
      const first = new Ship('duplicate-hud-id',player.spec,false,new Vector2(231,100));
      const second = new Ship('duplicate-hud-id',player.spec,false,new Vector2(753,100));
      second.hullHp -= 19;k.engine.reinforcements.push(first,second);
      reads.length = 0;last = current.capture(k.engine,k.tick,last.buffer,last.visuals.buffer);
      if(reference){oldLast=reference.capture(k.engine,k.tick,oldLast.buffer,oldLast.visuals.buffer);same(packet(last),packet(oldLast),'same-id different source packet');exactPackets++;}
      const duplicates = decoder.apply(structuredClone(last)).hud.read.ships.filter(s=>s.id==='duplicate-hud-id');
      same(duplicates.length,2,'both source objects remain');assert.notEqual(duplicates[0],duplicates[1]);checks++;
      same(duplicates.map(s=>s.pos.x),[231,753],'identity not id determines deduplication');
      same(reads.length,new Set(reads.map(r=>r.ship)).size,'newly introduced objects admitted on each capture');
    } finally {k.dispose();}
  }

  // Public/custom engines are not readonly. Getter side effects must retain
  // repeated read count/order, including failure timing and terminal epoch.
  for (const throws of [false,true]) {
    const runs = [];
    for (const C of [Encoder,...(Before?[Before]:[])]) {
      const k = new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:787,multicore:false});
      try {
        const encoder = new C(872,'render'), base = k.engine.playerShip.currentCR, visits = [];
        let calls = 0;
        Object.defineProperty(k.engine.playerShip,'currentCR',{get(){visits.push(++calls);if(throws&&calls===3)throw Error('custom HUD reader');return base-calls*.001;}});
        let result;
        try { result = packet(encoder.capture(k.engine,0)); }
        catch(error) { result = {error:error.message}; }
        assert(calls > 1,'unowned custom getter must not be deduplicated');checks++;
        if(throws){same(result,{error:'custom HUD reader'});assert.throws(()=>encoder.capture(k.engine,0),/failed/);checks++;}
        runs.push({visits,result});
      } finally {k.dispose();}
    }
    if(runs.length>1)same(runs[0],runs[1],'public getter trace/packet/failure remain unchanged');
  }
  const report = {candidate:'owned-hud-once',checks,exactPackets,ownedFrames,genericContacts,ownedContacts,referenceReadonlyFrames,
    note:'Counters are correctness evidence, not a performance measurement. Capture-local dedup only; public engines unchanged.'};
  reports.push(report);return {checks,reports};
}
