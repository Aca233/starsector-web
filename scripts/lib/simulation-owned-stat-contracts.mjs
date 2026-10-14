/** Contracts run in an isolated module Worker, never opt the browser/UI into
 * ownership of externally mutable ships. Extends the existing simulator check. */
export async function ownedStatContractWorker() {
  const {CombatEngine}=await import('/src/engine/simulation/CombatEngine.ts');
  const {enableLocalCombatReadDomain}=await import('/src/engine/runtime/local/LocalCombatReadDomain.ts');
  const {ShipSystem}=await import('/src/engine/simulation/ShipSystem.ts');
  const {shipSystemDefinitions}=await import('/src/engine/extensions/ship-systems/Registry.ts');
  const {hulls}=await import('/src/studio/DesignModel.ts');
  let checks=0, scalarQueries=0, motionQueries=0;
  const check=(ok,name)=>{checks++;if(!ok)throw Error(name);};
  const engines=hulls.map(h=>new CombatEngine(h.id,h.id,23));
  const ships=engines.flatMap(e=>e.playerShip.assemblyShips);
  const methods={getSightRadiusFlat:['sightRadiusFlat',0],getSightRadiusPercent:['sightRadiusPercent',0],
    getArmorDamageMultiplier:['armorDamageMultiplier',1],getHullDamageMultiplier:['hullDamageMultiplier',1],getEmpDamageMultiplier:['empDamageMultiplier',1],
    getRepairTimeMultiplier:['repairTimeMultiplier',1],getTimeMultiplier:['timeMultiplier',1],getBeamDamageMultiplier:['beamDamageMultiplier',1],getFighterDamageMultiplier:['fighterDamageMultiplier',1],
    getRecoilMultiplier:['recoilMultiplier',1],getShieldDamageMultiplier:['shieldDamageMultiplier',1],getShieldUpkeepMultiplier:['shieldUpkeepMultiplier',1],
    getSoftFluxPerSecond:['softFluxPerSecond',0],getDissipationMultiplier:['dissipationMultiplier',1],getSpeedPercentBonus:['speedPercent',0],getDecelerationFlatBonus:['decelerationFlat',0],
    getSpeedFlatBonus:['speedFlat',0],getAccelerationFlatBonus:['accelerationFlat',0],getAccelerationPercentBonus:['accelerationPercent',0],getDecelerationPercentBonus:['decelerationPercent',0],
    getTurnRateFlatBonus:['turnRateFlat',0],getTurnRatePercentBonus:['turnRatePercent',0],getTurnAccelerationFlatBonus:['turnAccelerationFlat',0],getTurnAccelerationPercentBonus:['turnAccelerationPercent',0]};
  const weaponMethods={getWeaponRangePercent:['rangePercent',0],getProjectileSpeedPercent:['projectileSpeedPercent',0],getAmmoRegenMultiplier:['ammoRegenMultiplier',1],
    getWeaponDamageMultiplier:['damageMultiplier',1],getWeaponRateOfFireMultiplier:['rateOfFireMultiplier',1],getWeaponFluxCostMultiplier:['fluxCostMultiplier',1]};
  const same=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.is(a[k],b[k]));
  // UI/inline legacy dispatch is still enabled before this worker's explicit bootstrap.
  const inline=engines[0].playerShip.system,legacy=inline.modifiers;
  let inlineReads=0;inline.modifiers=function(...args){inlineReads++;return legacy.apply(this,args);};
  inline.getWeaponRangePercent('BALLISTIC');check(inlineReads===1,'Inline full dictionary contract changed');delete inline.modifiers;
  const aimQueries=await ownedAimQueryContracts();
  for(const e of engines)enableLocalCombatReadDomain(e);
  const cases=[['IDLE',0,false],['IN',.3,true],['ACTIVE',1,true],['OUT',.2,true],['COOLDOWN',0,false]];
  const validate=label=>{
    for(const ship of ships){
      for(const system of ship.allSystems){
        const value=system.modifiers();
        for(const [name,[key,fallback]] of Object.entries(methods)){scalarQueries++;check(Object.is(system[name](),value[key]??fallback),label+': '+system.type+'/'+name);}
        for(const type of ['BALLISTIC','ENERGY','MISSILE',undefined])for(const [name,[key,fallback]] of Object.entries(weaponMethods)){
          scalarQueries++;check(Object.is(system[name](type),type?value.weapons?.[type]?.[key]??fallback:fallback),label+': '+system.type+'/'+name+'/'+type);
        }
        for(const capacity of [0,17321]){scalarQueries++;check(Object.is(system.getHardFluxPerSecond(capacity),system.modifiers(capacity).hardFluxPerSecond??0),label+': hard-flux capacity');}
        check(system.suppressesZeroFluxBoost===((value.zeroFluxBoostSuppressed??0)>0),label+': suppression');
      }
      const optimized=ship.getMotionStats(),system=ship.system,native=system.modifiers;
      // A shadowed dictionary method forces BOTH scalar and motion readers onto
      // the literal full-composition oracle, preserving all original formulas.
      system.modifiers=function(...args){return native.apply(this,args);};
      let oracle;try{oracle=ship.getMotionStats();check(system.readNativeMotionModifiers()===undefined,'Shadowed dictionary did not disable borrowed motion');}
      finally{delete system.modifiers;}
      motionQueries++;check(same(optimized,oracle),label+': motion '+ship.spec.id);
    }
  };
  for(const [state,level,active] of cases){
    for(const ship of ships){ship.flux.hardFlux=ship.flux.maxFlux*.61;ship.flux.softFlux=ship.flux.maxFlux*.17;
      for(const s of ship.allSystems){s.state=state;s.effectLevel=level;s.isActive=active;s.outEntryEffectLevel=.91;}}
    validate(state);
  }
  // No tick advancement: flux, engine disable and temporary effects must stay live.
  for(const ship of ships){ship.flux.hardFlux=0;ship.flux.softFlux=0;ship.engineController.state='DISABLED';
    ship.runtimeModifiers.set('regression',{speedFlat:43,speedPercent:7,turnRateFlat:13,weapons:{BALLISTIC:{rangePercent:29,damageMultiplier:1.3}}});}
  validate('runtime + disabled');for(const ship of ships){ship.runtimeModifiers.clear();ship.engineController.state='NORMAL';}
  validate('same-tick effect removal');
  const probe=engines[0].playerShip,original=probe.system,originalAux=original.auxiliary;
  let unknownCalls=0;
  shipSystemDefinitions.register({id:'OWNED_STAT_UNKNOWN',sourceIds:[],name:'Regression unknown',chargeUp:0,active:1,chargeDown:0,cooldown:1,
    modifiers:()=>{unknownCalls++;return {speedFlat:unknownCalls,weapons:{BALLISTIC:{rangePercent:unknownCalls}}};}});
  const unknown=new ShipSystem('OWNED_STAT_UNKNOWN',900,probe);unknown.state='ACTIVE';unknown.isActive=true;probe.system=unknown;
  check(unknown.readNativeMotionModifiers()===undefined,'Unknown definition borrowed');
  const first=unknown.getWeaponRangePercent('BALLISTIC'),second=unknown.getWeaponRangePercent('BALLISTIC');
  check(first===1&&second===2&&unknownCalls===2,'Unknown stateful callback memoized');
  probe.system=original;original.auxiliary=unknown;unknownCalls=0;
  check(original.readNativeMotionModifiers()===undefined,'Unknown auxiliary borrowed');
  check(original.getWeaponRangePercent('BALLISTIC')===1&&unknownCalls===1,'Unknown auxiliary callback order/count changed');
  original.auxiliary=originalAux;
  // Accessor dispatch must occur once, not once in qualification and again in fallback.
  let accessorReads=0;const native=original.modifiers;
  Object.defineProperty(original,'modifiers',{configurable:true,get(){accessorReads++;return native;}});
  original.getWeaponRangePercent('BALLISTIC');check(accessorReads===1,'Shadowed dictionary getter dispatched twice');
  check(original.readNativeMotionModifiers()===undefined&&accessorReads===1,'Motion gate read a shadowed dictionary getter');delete original.modifiers;
  const parent=engines.find(e=>e.playerShip.childModules.length)?.playerShip,child=parent.childModules[0],savedParentSystem=parent.system;
  parent.system=unknown;unknownCalls=0;check(child.system.readNativeMotionModifiers()===undefined,'Unknown parent borrowed');
  child.system.getWeaponRangePercent('BALLISTIC');check(unknownCalls===0,'Qualification invoked unknown parent modifiers');parent.system=savedParentSystem;
  return {checks,hulls:engines.length,ships:ships.length,scalarQueries,motionQueries,unknownCallbacksLive:true,inlineLegacyDispatch:true,aimQueries};
}
export async function checkOwnedStatWorker(base) {
  const worker=new Worker(base+'/scripts/lib/simulation-owned-stat-contracts.mjs?owned-stat-worker=1&worker_file&type=module',{type:'module'});
  try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Owned stat contract worker timed out')),90000);
    worker.onmessage=({data})=>{clearTimeout(timeout);if(data.ok)resolve(data.result);else reject(Error(data.message));};worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};});}
  finally{worker.terminate();}
}
export async function checkRealLocalWorker(base,playerHull,enemyHull) {
  const {LOCAL_COMBAT_PROTOCOL:protocol}=await import(base+'/src/engine/runtime/local/LocalCombatProtocol.ts');
  const {LocalCombatKernel}=await import(base+'/src/engine/runtime/local/LocalCombatKernel.ts');
  const {localCombatContentSignature}=await import(base+'/src/engine/runtime/local/LocalCombatContent.ts');
  const {CombatReplayJournal,sameReplayWitness}=await import(base+'/src/engine/runtime/local/CombatReplayCheckpoint.ts');
  const {CombatPresentationDecoder}=await import(base+'/src/engine/runtime/local/CombatPresentationDecoder.ts');
  const config={playerHull,enemyHull,seed:917,multicore:false,expectedContent:localCombatContentSignature()};
  const inline=new LocalCombatKernel(config),journal=new CombatReplayJournal(config,protocol),decoder=new CombatPresentationDecoder(1,'render-strict');
  const live=new Worker(base+'/src/engine/runtime/local/local-combat.worker.ts?worker_file&type=module',{type:'module'});
  let restored,sequence=0,checks=0,progress=0;
  const check=(ok,name)=>{checks++;if(!ok)throw Error(name);};
  const request=(worker,body,epoch=1,seq=++sequence)=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Real local worker timed out')),60000);
    worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};worker.onmessage=({data})=>{
      if(data.kind==='replay-progress'){progress++;return;}clearTimeout(timeout);
      if(data.kind==='failed'){reject(Error(data.message));return;}
      try{check(data.kind==='ack'&&data.protocol===protocol&&data.epoch===epoch&&data.sequence===seq,'Worker acknowledgement identity');resolve(data);}catch(error){reject(error);}
    };worker.postMessage({protocol,epoch,sequence:seq,...body});
  });
  const sample={autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false};
  const decodeCheck=ack=>{const decoded=decoder.apply(ack.frame);const actual=decoded.view.allCapitalShips,expected=inline.engine.allCapitalShips;
    check(actual.length===expected.length,'Worker render roster length');for(let i=0;i<actual.length;i++){
      check(actual[i].id===expected[i].id&&Object.is(actual[i].pos.x,expected[i].pos.x)&&Object.is(actual[i].pos.y,expected[i].pos.y)&&Object.is(actual[i].hullHp,expected[i].hullHp),'Worker render state');
    }};
  try{
    let ack=await request(live,{kind:'init',config});check(sameReplayWitness(ack.witness,inline.replayWitness()),'Worker init witness');journal.initialize(ack.witness);decodeCheck(ack);
    const command={kind:'add-ship',hull:playerHull,isPlayer:true,position:[-900,-1500],facing:Math.PI/2};
    const result=inline.command(command);ack=await request(live,{kind:'commands',commands:[command]});
    check(JSON.stringify(ack.results)===JSON.stringify([result])&&sameReplayWitness(ack.witness,inline.replayWitness()),'Worker command receipt/witness');journal.record({kind:'commands',commands:[command]},ack.results,ack.witness);decodeCheck(ack);
    for(let tick=0;tick<6;tick++){inline.step(sample);ack=await request(live,{kind:'step',sample});
      check(sameReplayWitness(ack.witness,inline.replayWitness()),'Worker step witness '+tick);journal.record({kind:'step',sample},ack.results,ack.witness);decodeCheck(ack);}
    const checkpoint=journal.checkpoint();restored=new Worker(base+'/src/engine/runtime/local/local-combat.worker.ts?worker_file&type=module',{type:'module'});
    const recovered=await request(restored,{kind:'restore',checkpoint},2,1);
    check(sameReplayWitness(recovered.witness,ack.witness),'Worker restore witness');check(progress>0,'Worker restore progress');
    inline.step(sample);const next=await request(restored,{kind:'step',sample},2,2);check(sameReplayWitness(next.witness,inline.replayWitness()),'Worker restored next step');
    check(inline.engine.asteroids.length===78,'Worker smoke preserves terrain');
    return {checks,steps:7,restore:true,commandReceipt:true,renderDecode:true,terrain:78,scope:'Actual module Worker init/commands/step/restore, multicore disabled; not natural combat FPS/TPS.'};
  }finally{live.terminate();restored?.terminate();inline.dispose();}
}


/** Same-call acquisition lease, compared to a deliberately denied permission
 * oracle. The benign ECM accessor counts query preparation ONLY in this isolated
 * test Worker; production ownership still requires plain data-command fields. */
export async function ownedAimQueryContracts() {
  const {LocalCombatKernel}=await import('/src/engine/runtime/local/LocalCombatKernel.ts');
  const {enableLocalCombatReadDomain}=await import('/src/engine/runtime/local/LocalCombatReadDomain.ts');
  const {AutofireController}=await import('/src/engine/ai/AutofireController.ts');
  const {ShipSystem}=await import('/src/engine/simulation/ShipSystem.ts');
  const {shipSystemDefinitions}=await import('/src/engine/extensions/ship-systems/Registry.ts');
  const {hullModDefinitions}=await import('/src/engine/extensions/HullMods.ts');
  const {immutableCopy}=await import('/src/engine/extensions/Immutable.ts');
  let checks=0,compared=0,cases=0,inlineQueries=0,beforeQueries=0,afterQueries=0;
  const check=(ok,label)=>{checks++;if(!ok)throw Error('Aim query: '+label);};
  const same=(a,b)=>Object.is(a,b)||!!a&&!!b&&typeof a==='object'&&typeof b==='object'
    &&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
  const config={playerHull:'web_sc2_hyperion',enemyHull:'web_gloriana',seed:917,multicore:false,
    additionalShips:Array.from({length:20},(_,i)=>({hull:i%2?'web_zhuyuan':'web_sc2_hyperion',isPlayer:i%2===0,position:[800+i*25,(i%3-1)*100],facing:Math.PI}))};
  const make=()=>{
    const kernel=new LocalCombatKernel(config),ships=kernel.engine.ships,source=kernel.engine.playerShip;
    source.pos.set(0,0);source.facingRad=0;source.currentTargetShip=null;
    for(const s of ships){s.visibilityMask=3;s.shield.isActive=false;}
    const mount=source.weapons.find(m=>!m.spec.isBeam&&!m.spec.isGuided&&m.ammo>0);
    check(!!mount,'fixture non-guided mount');mount.currentAngleRad=source.facingRad+mount.baseAngleDeg*Math.PI/180;
    return {kernel,source,mount,ships,world:{ships,missiles:[],asteroids:kernel.engine.asteroids},controllers:new Map(),reads:0};
  };
  const countRange=f=>{const value=f.source.ecmRangePenalty;Object.defineProperty(f.source,'ecmRangePenalty',{configurable:true,get(){f.reads++;return value;}});};
  const deny=f=>{for(const s of f.ships)for(const system of s.allSystems)Object.defineProperty(system,'hasNativeAimQueryStats',{configurable:true,value:false});};
  const inline=make();countRange(inline);
  try {new AutofireController().aim(1/60,inline.source,inline.mount,inline.world);inlineQueries=inline.reads;check(inlineQueries>1,'inline must retain per-candidate query preparation');}
  finally {inline.kernel.dispose();}
  const compact=x=>x&&{target:[x.target.kind,x.target.entity.id],point:[x.point.x,x.point.y],delay:x.delay,speed:x.speed,range:x.range};
  const read=(f,s,m,dt=1/60)=>{
    let controller=f.controllers.get(s);if(!controller){controller=new AutofireController();f.controllers.set(s,controller);}
    const aim=controller.aim(dt,s,m,f.world),pre=controller.preAim(s,m,f.world),decision=controller.decide(s,m,aim,f.world,dt);
    const tracker=controller.trackers.get(m);
    return {aim:compact(aim),pre:pre&&[pre.x,pre.y],decision,control:m.fireControl,
      targetShip:m.fireControlTargetShipId,targetProjectile:m.fireControlTargetProjectileId,
      tracker:tracker&&Object.fromEntries(Object.entries(tracker).map(([k,v])=>[k,k==='target'?v&&[v.kind,v.entity.id]:k==='spec'?v.id:k==='random'?v.checkpointWitness():v]))};
  };
  const pair=(label,mutate,allMounts=false,repeat=false)=>{
    const a=make(),b=make();deny(a);enableLocalCombatReadDomain(b.kernel.engine);cases++;
    try {
      mutate?.(a);mutate?.(b);
      const ids=allMounts?a.ships.map((_,i)=>i):[0];
      for(const i of ids){const as=a.ships[i],bs=b.ships[i];
        const mounts=allMounts?as.weapons.map((_,i)=>i):[as.weapons.indexOf(a.mount)];
        for(const j of mounts){check(same(read(a,as,as.weapons[j]),read(b,bs,bs.weapons[j])),label+' mount '+as.id+'/'+j);compared++;}
      }
      if(repeat){
        for(const f of [a,b]){f.source.pos.x+=17;f.source.flux.softFlux+=350;f.mount.spec.range+=79;const state=f.controllers.get(f.source).trackers.get(f.mount);state.scanIn=0;}
        check(same(read(a,a.source,a.mount),read(b,b.source,b.mount)),label+' next call re-read');compared++;
      }
      check(same(a.kernel.replayWitness(),b.kernel.replayWitness()),label+' source/RNG witness');
      check(a.reads===b.reads||label==='pure preparation counts',label+' callback/count equality');
      const statReads=f=>{const result=[];for(let s=f.source.system;s;s=s.auxiliary)result.push(s.testReads??0);return result;};
      check(same(statReads(a),statReads(b)),label+' stateful system callback count');
      if(label==='pure preparation counts'){beforeQueries=a.reads;afterQueries=b.reads;check(beforeQueries>afterQueries&&afterQueries>=1,'preparation must actually be reused');}
    } finally {a.kernel.dispose();b.kernel.dispose();}
  };
  pair('pure preparation counts',countRange);
  pair('lifecycle/module/carrier mounts',f=>{for(const s of f.ships){s.flux.softFlux=s.flux.maxFlux*.2;for(const system of s.allSystems){system.state='ACTIVE';system.isActive=true;system.effectLevel=.7;}}},true);
  pair('next call live state',undefined,false,true);
  pair('same-call runtime fallback',f=>f.source.runtimeModifiers.set('probe',{weapons:{ENERGY:{rangePercent:13}}}));
  shipSystemDefinitions.register({id:'OWNED_AIM_STATEFUL',sourceIds:[],name:'Stateful aim test',chargeUp:0,active:1,chargeDown:0,cooldown:1,
    passiveModifiers:system=>{system.testReads=(system.testReads??0)+1;return {weapons:{ENERGY:{rangePercent:system.testReads*.01,projectileSpeedPercent:system.testReads*.02}}};}});
  const unknown=f=>new ShipSystem('OWNED_AIM_STATEFUL',f.source.flux.maxFlux,f.source);
  pair('unknown shooter',f=>{const system=unknown(f);system.auxiliary=f.source.defenseSystem;f.source.system=system;});
  pair('unknown source auxiliary',f=>{const system=unknown(f);system.auxiliary=f.source.defenseSystem;f.source.system.auxiliary=system;});
  pair('custom scalar getter',f=>{const system=f.source.system,native=system.getWeaponRangePercent;Object.defineProperty(system,'getWeaponRangePercent',{configurable:true,get(){f.reads++;return native;}});});
  pair('custom dictionary getter',f=>{const system=f.source.system,native=system.modifiers;Object.defineProperty(system,'modifiers',{configurable:true,get(){f.reads++;return native;}});});
  for(const rejected of [false,true])pair('unknown target phase '+rejected,f=>{
    const enemies=f.ships.filter(s=>s.teamId!==f.source.teamId&&!s.parentShip&&!s.sourceCarrier),target=enemies[1];
    check(!!target,'unknown target after earlier candidates');target.externalPhaseEffects.set('probe',()=>{f.reads++;f.source.pos.x+=3;f.mount.spec.range+=7;return rejected?0:undefined;});
  });
  pair('unknown rejected target changes source admission',f=>{
    const target=f.ships.filter(s=>s.teamId!==f.source.teamId&&!s.parentShip&&!s.sourceCarrier)[1];
    target.externalPhaseEffects.set('probe',()=>{f.reads++;const system=unknown(f);system.auxiliary=f.source.defenseSystem;f.source.system=system;return 0;});
  });
  pair('unknown parent phase',f=>{const parent=f.ships.find(s=>s.childModules.length&&s.teamId!==f.source.teamId);check(!!parent,'parent fixture');parent.externalPhaseEffects.set('probe',()=>{f.reads++;f.mount.spec.range+=2;return undefined;});});
  const rangeCalls=new WeakMap();
  hullModDefinitions.register({id:'owned_aim_unknown_range',name:'Unknown range probe',status:'implemented',rangePercent:spec=>{const n=(rangeCalls.get(spec)??0)+1;rangeCalls.set(spec,n);return n*.01;}});
  pair('unknown range hullmod',f=>{f.source.spec=immutableCopy({...f.source.spec,hullMods:[...(f.source.spec.hullMods??[]),'owned_aim_unknown_range']});});
  pair('empty scan',f=>{f.world.ships=f.ships.filter(s=>s.teamId===f.source.teamId);});
  pair('disabled mount',f=>{f.mount.isDisabled=true;});
  return {checks,compared,cases,inlineQueries,beforeQueries,afterQueries,scope:'One aim call only; permission-denied legacy oracle, including callbacks on rejected targets. No fleet admission or tick cache.'};
}

if(typeof document==='undefined'&&typeof self!=='undefined'&&new URL(import.meta.url).searchParams.has('owned-stat-worker')) {
  ownedStatContractWorker().then(result=>self.postMessage({ok:true,result})).catch(error=>self.postMessage({ok:false,message:String(error.stack??error)}));
}
