import {RustCombatCore,RustCoreCommandError} from '../../src/engine/runtime/rust/RustCombatCore';
import {RustEventKind as E,RustArmorField as A,RustComponentField as C,RustShipFlag as F,RustShieldField as S,
  RustWeaponSize,RustWeaponMount,type RustBodyHandle,type RustArmorConfig,type RustArmorStats,type RustWeaponHealthConfig} from '../../src/engine/runtime/rust/RustCoreProtocol';
// Keep actual game module initialization in its established Ship-first order.
import {Ship} from '../../src/engine/simulation/Ship';
import {ArmorGrid,type DamageType} from '../../src/engine/simulation/ArmorGrid';
import {ShipDamageState,type ScorchMark} from '../../src/engine/simulation/ShipDamageState';
import {Shield} from '../../src/engine/simulation/Shield';
import {FluxTracker} from '../../src/engine/simulation/FluxTracker';
import {SimulationRandom} from '../../src/engine/simulation/SimulationRandom';
import {Vector2} from '../../src/engine/math/Vector2';
import {voidShieldContact} from '../../src/engine/simulation/VoidShield';
import type {WeaponMount} from '../../src/engine/simulation/Weapon';
import {weaponHealthProfile,createWeaponHealthTracker,damageWeaponComponent,disableWeaponComponent,advanceWeaponComponent} from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import {MOTION_WIDTH} from '../../src/engine/simulation/systems/MotionKernel';
import {checkRustCore as checkShield} from './rust-core-shield-check';

function insist(condition:unknown,label:string):asserts condition{if(!condition)throw Error(label);}
function exact(actual:number,expected:number,label:string){if(!Object.is(actual,expected))throw Error(`${label}: ${actual} differs from ${expected}`);}
function rejected(operation:()=>void,code:number){
  try{operation();}catch(e){insist(e instanceof RustCoreCommandError&&e.code===code,'Unexpected rejection '+String(e));return;}
  throw Error('Missing rejection '+code);
}
interface Weapon {config:RustWeaponHealthConfig;mount:WeaponMount;policy:[boolean,number,boolean]}
interface Fixture {id:number;handle:RustBodyHandle;armor:ArmorGrid;scars:ShipDamageState;owner:Ship;shield:Shield;flux:FluxTracker;
  config:RustArmorConfig;stats:RustArmorStats;weapons:Weapon[];clock:number[];flags:number}
type Expected=readonly [number,number,number,number,number,number];
const damageTypes:DamageType[]=['ENERGY','KINETIC','HIGH_EXPLOSIVE','FRAGMENTATION'];
const neutral:RustArmorStats={effectiveMultiplier:1,dynamicMultiplier:1,maxReduction:.85,minResidualMultiplier:1,incoming:[1,1,1,1,1,1,1,1]};
const base:RustArmorConfig={cols:9,rows:7,cellWidth:20,cellHeight:20,armorRating:1500,maxHull:1e6};
function scarWords(m:ScorchMark):number[]{return [m.cellIndex,m.localPos.x,m.localPos.y,m.opacity,m.intensity,m.heat,Number(m.justHit),m.flash,m.flashElapsed,
  m.phase,m.pulsePeriod,m.size,m.rotationRad,['cracks','burns','holes'].indexOf(m.kind),m.variant];}
function weaponWords(w:Weapon):number[]{
  const m=w.mount,t=m.healthTracker,c=w.config;
  return [c.componentId,RustWeaponSize[c.size],RustWeaponMount[c.mount],c.x??0,c.y??0,m.health,m.maxHealth,Number(m.isDisabled),Number(m.isPermanentlyDisabled),
    m.disabledDuration,m.disabledTimer,Number(!!t),t?.repairDuration??0,t?.hitAgo??0,t?.interval??0,t?.elapsed??0,Number(t?.intervalElapsed??false),
    Number(w.policy[0]),w.policy[1],Number(w.policy[2])];
}
function armorWords(f:Fixture):number[]{
  const a=f.armor,s=f.stats;
  return [a.cols,a.rows,a.cellWidth,a.cellHeight,a.maxArmorRating,a.minX,a.minY,a.maxCellArmor,a.effectiveArmorMultiplier,s.dynamicMultiplier,
    a.maxDamageReduction,a.minArmorFractionMultiplier,a.dirtyVersion,f.config.maxHull,f.owner.hullHp,Number(f.owner.hullDamageSuppressed),Number(f.owner.hasVastBulk),
    Number(f.config.scarsEnabled??true),Number(f.scars.suppressed),f.scars.revision,(f.scars as unknown as {armorRevision:number}).armorRevision,
    ...s.incoming,a.getIntegrityPercentage(),0];
}

/** Real ArmorGrid/ShipDamageState and weapon health functions; the owner only
 * supplies direct-hull-damage inputs. No hit selection/full firing/controller claim. */
export async function checkRustCore(source:BufferSource){
  const prior=await checkShield(source),core=await RustCombatCore.create(source,917);
  const random=new SimulationRandom(917),visual=new SimulationRandom((917^0x9e3779b9)>>>0),fixtures:Fixture[]=[],events:Expected[]=[];
  let tick=0,time=0,sequence=0,exactFields=0,eventsChecked=0,rngWitnessFields=0;
  const emit=(f:Fixture,kind:number,value=0,a=0,b=0)=>events.push([f.id,kind,value,a,b,tick]);
  const configs:RustArmorConfig[]=[base,{...base,cols:1,rows:1,armorRating:0,scarsEnabled:false},
    {...base,cols:5,rows:5,cellWidth:23.8,cellHeight:23.8,armorRating:1,minX:-71.4,minY:-47.6},
    {...base,cols:8,rows:6,cellWidth:23.8,cellHeight:24.6,minX:-71.4,minY:-62.15},
    {...base,cols:11,rows:9,armorRating:1750.37},base,{...base,maxHull:1000},
    {...base,hullSuppressed:true},{...base,vastBulk:true},{...base,cols:10,rows:10},base,base];
  function setStats(f:Fixture,stats:RustArmorStats){
    f.stats=stats;Object.assign(f.armor,{effectiveArmorMultiplier:stats.effectiveMultiplier,maxDamageReduction:stats.maxReduction,minArmorFractionMultiplier:stats.minResidualMultiplier});
    f.armor.dynamicEffectiveArmorMultiplier=()=>f.stats.dynamicMultiplier;
    f.armor.damageTakenModifiers=type=>{const i=damageTypes.indexOf(type)*2;return {armor:f.stats.incoming[i],hull:f.stats.incoming[i+1]};};
    f.owner.hullDamageSuppressed=stats.hullSuppressed??false;
    f.owner.spec.hullMods=stats.vastBulk?['vastbulk']:[];f.scars.suppressed=stats.scarsSuppressed??false;
    core.apply([{kind:'armor-stats',id:f.id,handle:f.handle,stats}]);
  }
  try{
    for(let i=0;i<configs.length;i++){
      const id=700+i,config=configs[i],motion=new Float64Array(MOTION_WIDTH);motion[18]=1;
      core.apply([{kind:'spawn',id,motion}]);const handle=core.snapshot().bodies.at(-1)!.handle;
      const armor=new ArmorGrid(config.cols,config.rows,config.cellWidth,config.cellHeight,config.armorRating,config.minX,config.minY);
      const scars=new ShipDamageState(armor,visual),flux=new FluxTracker(1000,0,'FRIGATE');
      const shield=new Shield(i===11?'PHASE':i===3?'OMNI':'NONE',360,100,1,0,amount=>flux.increaseFluxClamped(amount,true));
      if(i===11)shield.setActive(true);
      const owner=Object.create(Ship.prototype) as Ship;
      Object.assign(owner,{armor,shield,hullHp:config.maxHull,hullStats:{hitpoints:config.maxHull},isDead:false,isRetreated:false,parentShip:null,
        hullDamageSuppressed:config.hullSuppressed??false,hullDamageInterceptors:new Set(),spec:{hullMods:config.vastBulk?['vastbulk']:[],builtInHullMods:[]}});
      const f:Fixture={id,handle,armor,scars,owner,shield,flux,config,stats:neutral,weapons:[],clock:[1.2,shield.phaseEffectLevel,i%2?1.13:1,0,0,0,0,0,0],
        flags:F.AllowDissipation|(shield.isActive?F.ShieldActive:0)};fixtures.push(f);
      core.apply([{kind:'initialize-ship',id,handle,config:{maxFlux:1000,baseDissipation:0,hullSize:1,phaseTimeBonus:1.2,externalTimeMultiplier:f.clock[2]}},
        {kind:'initialize-shield',id,handle,config:{type:shield.type,maxArc:360,radius:100,efficiency:1,upkeepRate:0,initialActive:i===11}},
        {kind:'initialize-armor',id,handle,config}]);
      if(i===3){const v={layers:3,integrityPerLayer:200,rechargePerSecond:70,hitDelay:.6,restartDelay:1.2};shield.configureVoidShield(v);
        core.apply([{kind:'configure-void-shield',id,handle,spec:v}]);f.flags|=F.ShieldActive;}
      setStats(f,{...neutral,hullSuppressed:config.hullSuppressed,vastBulk:config.vastBulk,
        ...(i===4?{effectiveMultiplier:1.15,dynamicMultiplier:.94,maxReduction:.91,minResidualMultiplier:.67,
          incoming:[1.17,.9,.83,1.21,.7,.88,1.3,.76] as const}:{}),
        ...(i===5?{incoming:[0,1,1,1,1,1,1,1] as const}:{}),...(i===6?{maxReduction:1,minResidualMultiplier:0}:{})});
      armor.onCellDamage=(c,r,damage)=>{
        if(damage>0)voidShieldContact(shield.voidShield);
        if(config.scarsEnabled??true)scars.onCellDamage(c,r,damage);
        emit(f,E.CellDamage,damage,c,r);
      };
      for(const size of Object.keys(RustWeaponSize) as (keyof typeof RustWeaponSize)[])for(const mountType of Object.keys(RustWeaponMount) as (keyof typeof RustWeaponMount)[]){
        const componentId=f.weapons.length+1,c:RustWeaponHealthConfig={componentId,size,mount:mountType,x:componentId-6,y:2-componentId,
          healthMultiplier:1.17,deferTracker:componentId%4===0};
        const profile=weaponHealthProfile(size,mountType,c.healthMultiplier);
        const mount={spec:{mountSize:size},mountType,relativePos:new Vector2(c.x,c.y),health:profile.health,maxHealth:profile.health,
          isDisabled:false,isPermanentlyDisabled:false,disabledDuration:0,disabledTimer:0,
          healthTracker:c.deferTracker?undefined:createWeaponHealthTracker(profile.repairDuration,random)} as WeaponMount;
        f.weapons.push({config:c,mount,policy:[true,1,false]});
        core.apply([{kind:'install-weapon-health',id,handle,config:c}]);
      }
    }
    function check(label:string){
      const snap=core.snapshot();exact(snap.tick,tick,label+' tick');exact(snap.combatTime,time,label+' world time');
      random.checkpointWitness().forEach((n,i)=>{exact(snap.random[i],n,label+' combat RNG '+i);rngWitnessFields++;});
      visual.checkpointWitness().forEach((n,i)=>{exact(snap.visualRandom[i],n,label+' visual RNG '+i);rngWitnessFields++;});
      snap.bodies.forEach((body,i)=>{
        const f=fixtures[i],ship=body.ship!,a=ship.armor!;
        armorWords(f).forEach((n,j)=>{exact(a.values[j],n,`${label} armor ${i}/${j}`);exactFields++;});
        f.armor.copyCells().forEach((n,j)=>{exact(a.cells[j],n,`${label} f32 cell ${i}/${j}`);exactFields++;});
        exact(a.scars.length,f.scars.marks.length,label+' scar count '+i);
        a.scars.forEach((mark,j)=>scarWords(f.scars.marks[j]).forEach((n,k)=>{exact(mark[k],n,`${label} scar ${i}/${j}/${k}`);exactFields++;}));
        f.clock[1]=f.shield.phaseEffectLevel;f.flags=(f.flags&~F.ShieldActive)|(f.shield.isActive?F.ShieldActive:0);
        exact(ship.flags,f.flags,label+' flags '+i);
        f.clock.forEach((n,j)=>{exact(ship.clock[j],n,`${label} clock ${i}/${j}`);exactFields++;});
        if(f.shield.voidShield){const v=f.shield.voidShield;
          [v.integrity,v.rebuild,v.quietRemaining,v.restartRemaining].forEach((n,j)=>{exact(ship.shield![S.VoidStart+5+j],n,label+' void contact '+j);exactFields++;});}
        exact(ship.components.length,f.weapons.length,label+' weapon count');
        f.weapons.forEach((w,j)=>weaponWords(w).forEach((n,k)=>{exact(ship.components[j].values[k],n,`${label} component ${i}/${j}/${k}`);exactFields++;}));
      });
      exact(snap.events.length,events.length,label+' event count');
      snap.events.forEach((e,i)=>{
        const expected=events[i],f=fixtures.find(f=>f.id===e.id)!;
        exact(e.sequence,sequence+i+1,label+' sequence');exact(e.id,expected[0],label+' owner');exact(e.systemId,0,label+' system');
        exact(e.kind,expected[1],label+' kind');exact(e.value,expected[2],label+' value');exact(e.detail[0],expected[3],label+' detail 0');
        exact(e.detail[1],expected[4],label+' detail 1');exact(e.tick,expected[5],label+' tick');
        exact(e.handle.slot,f.handle.slot,label+' slot');exact(e.handle.generation,f.handle.generation,label+' generation');eventsChecked++;
      });
      exact(core.snapshot().events.length,events.length,'Repeated publication consumed events');
      sequence=snap.lastEventSequence;core.acknowledgeEvents(sequence);events.length=0;
    }
    function cell(f:Fixture,c:number,r:number,value:number){f.armor.setCell(c,r,value);core.apply([{kind:'armor-cell',id:f.id,handle:f.handle,c,r,value}]);}
    function hit(f:Fixture,x:number,y:number,damage:number,type:DamageType,strength?:number,isDps=false,applyHull=true){
      const result=f.armor.takeDamage(new Vector2(x,y),damage,type,strength,isDps);
      emit(f,E.ArmorDamage,result.armorDamage);emit(f,E.ArmorHullDamage,result.hullDamage);emit(f,E.ResidualArmor,result.residualArmor);
      if(applyHull)emit(f,E.HullApplied,f.owner.applyHullDamage(result.hullDamage));
      core.apply([{kind:'armor-impact',id:f.id,handle:f.handle,x,y,damage,damageType:type,hitStrength:strength,isDps,applyHull}]);
    }
    function hull(f:Fixture,damage:number){emit(f,E.HullApplied,f.owner.applyHullDamage(damage));core.apply([{kind:'hull-damage',id:f.id,handle:f.handle,damage}]);}
    function damageWeapon(f:Fixture,index:number,damage:number){const w=f.weapons[index],before=w.mount.health;damageWeaponComponent(w.mount,damage,random);
      emit(f,E.ComponentDamage,before-w.mount.health,w.config.componentId);core.apply([{kind:'component-damage',id:f.id,handle:f.handle,componentId:w.config.componentId,damage}]);}
    function disable(f:Fixture,index:number,permanent=false){const w=f.weapons[index],newly=disableWeaponComponent(w.mount,random,permanent);
      if(newly)emit(f,E.ComponentDisabled,0,w.config.componentId,Number(permanent));emit(f,E.ComponentDisableResult,Number(newly),w.config.componentId,Number(permanent));
      core.apply([{kind:'component-disable',id:f.id,handle:f.handle,componentId:w.config.componentId,permanent}]);}
    function policy(f:Fixture,index:number,canRepair:boolean,multiplier:number,underFire:boolean){
      const w=f.weapons[index];w.policy=[canRepair,multiplier,underFire];core.apply([{kind:'component-repair-policy',id:f.id,handle:f.handle,componentId:w.config.componentId,canRepair,multiplier,underFire}]);}
    check('initial');
    for(const f of fixtures){
      cell(f,0,0,Math.PI);cell(f,0,0,Math.PI);cell(f,-1,0,30);cell(f,f.armor.cols+1,2,100);
      for(const w of f.weapons)damageWeapon(f,w.config.componentId-1,w.mount.maxHealth*(w.config.componentId%3===0?2:.1));
    }
    disable(fixtures[0],0);disable(fixtures[0],1,true);disable(fixtures[0],1,true);disable(fixtures[0],2);
    policy(fixtures[1],0,false,.3,true);policy(fixtures[2],1,true,0,true);policy(fixtures[3],2,true,2.7,true);
    check('commands');
    for(let step=0;step<120;step++){
      if(step%5===0)for(const [i,f] of fixtures.entries()){
        const x=step%10===0?f.armor.minX+f.armor.cellWidth*3:f.armor.minX-1000;
        const y=step%15===0?f.armor.minY+f.armor.cellHeight*3:f.armor.minY+f.armor.cellHeight*.5;
        hit(f,x+(step%20===0?-1e-10:0),y,step%10===0?1350.27:55.1,damageTypes[(i+step)%4],step%3===0?0:undefined,step%2===0,i!==2);
      }
      if(step===4){cell(fixtures[4],3,3,2e3);cell(fixtures[4],4,3,-5);fixtures[4].scars.syncWithArmorGridState();
        core.apply([{kind:'sync-scars',id:fixtures[4].id,handle:fixtures[4].handle}]);}
      if(step===7)hull(fixtures[6],1e5);
      if(step===8){hull(fixtures[7],1e5);hull(fixtures[8],1e5);hull(fixtures[2],0);hull(fixtures[2],-5);}
      if(step===10){setStats(fixtures[9],{...neutral,scarsSuppressed:true});setStats(fixtures[5],{...neutral,incoming:[-1,1,1,1,1,1,1,1]});}
      if(step===12)policy(fixtures[1],0,true,.3,true);
      if(step===15){disable(fixtures[2],11);damageWeapon(fixtures[2],11,200);}
      if(step===16)setStats(fixtures[9],neutral);
      if(step===21)for(const f of fixtures)damageWeapon(f,4,300);
      if(step===24)for(const f of fixtures)policy(f,4,true,.83,false);
      if(step===30){fixtures[10].owner.isDead=true;fixtures[10].flags|=F.Dead;core.apply([{kind:'ship-flags',id:fixtures[10].id,handle:fixtures[10].handle,
        flags:fixtures[10].flags,hardFluxDissipationFraction:0,zeroFluxMinimum:0,allowZeroFluxAtAnyLevel:0}]);hull(fixtures[10],100);}
      if(step===31){fixtures[10].owner.isDead=false;fixtures[10].flags&=~F.Dead;core.apply([{kind:'ship-flags',id:fixtures[10].id,handle:fixtures[10].handle,
        flags:fixtures[10].flags,hardFluxDissipationFraction:0,zeroFluxMinimum:0,allowZeroFluxAtAnyLevel:0}]);}
      check('commands '+step);
      const dt=[1/60,.1,.31,.61,1.7,6,1e-10][step%7];tick++;time+=dt;
      for(const f of fixtures){
        if(f.owner.isDead||f.owner.isRetreated||f.owner.hullHp<=0)continue;
        const tactical=dt*f.clock[2],effective=dt*((1+2*f.clock[0]*f.shield.phaseEffectLevel)*f.clock[2]);
        f.clock[3]=dt;f.clock[4]=tactical;f.clock[5]=effective;f.clock[6]+=dt;f.clock[7]+=tactical;f.clock[8]+=effective;
        f.shield.sinceLastDamageTaken+=effective;f.flux.update(tactical,f.shield.isActive,true);f.shield.update(effective,0,0);
        for(const w of f.weapons){const event=advanceWeaponComponent(w.mount,effective,random,...w.policy);
          if(event.disabled)emit(f,E.ComponentDisabled,0,w.config.componentId);if(event.repaired)emit(f,E.ComponentRepaired,0,w.config.componentId);}
        if(f.config.scarsEnabled??true)f.scars.advance(dt,f.owner.hullHp/f.config.maxHull);
      }
      core.step(dt);check('step '+step);
    }
    const f=fixtures[4],before=core.snapshot();
    const untouched=f.armor.getCellCenterLocal(8,6),untouchedIndex=6*before.bodies[4].ship!.armor!.values[A.Cols]+8;
    insist(!f.scars.marks.some(m=>m.cellIndex===untouchedIndex),'Failed batch must reach a new visual RNG allocation');
    rejected(()=>core.apply([{kind:'armor-impact',id:f.id,handle:f.handle,x:untouched.x,y:untouched.y,damage:1e4,damageType:'ENERGY',applyHull:true},
      {kind:'install-weapon-health',id:f.id,handle:f.handle,config:{componentId:100,size:'LARGE',mount:'TURRET'}},
      {kind:'component-damage',id:f.id,handle:f.handle,componentId:999,damage:1}]),8);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(before),'Failed damage batch changed cells/HP/events/RNG');
    rejected(()=>core.apply([{kind:'initialize-armor',id:f.id,handle:f.handle,config:f.config}]),8);
    const retained=core.snapshot();retained.bodies[4].ship!.armor!.cells[0]=1e8;
    retained.bodies[4].ship!.components[0].values[5]=1e8;
    if(retained.bodies[4].ship!.armor!.scars.length)retained.bodies[4].ship!.armor!.scars[0][5]=1e8;
    insist(JSON.stringify(core.snapshot())===JSON.stringify(before),'Published damage values wrote authority');
    // A late-body finite multiplication overflow rolls back earlier clocks,
    // component intervals, scars and random draws in the same failed step.
    core.step(6);
    insist(core.snapshot().bodies[0].ship!.components.some(c=>c.values[C.IntervalElapsed]===1),
      'Failed step must first resample an earlier combat RNG interval');
    const bad=fixtures.at(-1)!;
    core.apply([{kind:'clock-input',id:bad.id,handle:bad.handle,phaseTimeBonus:1.2,phaseEffect:bad.shield.phaseEffectLevel,externalTimeMultiplier:1e308}]);
    const badBefore=core.snapshot();rejected(()=>core.step(2),7);
    insist(JSON.stringify(core.snapshot())===JSON.stringify(badBefore),'Failed step consumed damage clocks or RNG');
    core.apply([{kind:'despawn',id:f.id,handle:f.handle}]);core.apply([{kind:'spawn',id:f.id,motion:new Float64Array(MOTION_WIDTH)}]);
    rejected(()=>core.apply([{kind:'armor-cell',id:f.id,handle:f.handle,c:0,r:0,value:10}]),4);
    return {passed:true,fullBattleReady:false,prior,fixtures:fixtures.length,weapons:fixtures.reduce((n,f)=>n+f.weapons.length,0),steps:120,
      exactArmorHullComponentScarClockFields:exactFields,exactOrderedEvents:eventsChecked,rngWitnessFields,float32CellsExact:true,
      actualArmorGrid:true,actualShipDamageState:true,actualShipHullMethod:true,actualWeaponHealthFunctions:true,
      noMalfunctionCallbacks:true,engineControllerExcluded:true,fullFiringExcluded:true,fullHitSelectionExcluded:true,
      atomicDamageAndRng:true,ownedPublication:true,voidContactDelay:true,performanceMeasured:false};
  }finally{core.dispose();}
}
