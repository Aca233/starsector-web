import { Ship } from '../../src/engine/simulation/Ship';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Shield } from '../../src/engine/simulation/Shield';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { ShipWeaponControlSystem } from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import { computeCombatReadinessEffects } from '../../src/engine/simulation/CombatReadiness';
import { Vector2 } from '../../src/engine/math/Vector2';
import { RuntimeCombatModifiers } from '../../src/engine/extensions/RuntimeCombatModifiers';
import type { ShipSpec } from '../../src/engine/content/ShipSpec';
import type { WeaponMount, WeaponSpec } from '../../src/engine/simulation/Weapon';
import type { ComponentMalfunctionTarget } from '../../src/engine/simulation/systems/ComponentMalfunctions';
import type { LowCRShipDamageSequence } from '../../src/engine/simulation/systems/LowCRShipDamageSequence';

interface TestExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory; test_input(n: number): number; test_initialize(): number;
  test_step(): number; test_effects(): number; test_query(): number; test_output_words(): number;
}
type PrivateShip = Ship & { resetShieldMalfunctionState(): void };
interface SourceFields { crShieldMalfunctionTimer: number; crShieldMalfunctionInterval: number; crShieldMalfunctionIntervalElapsed: boolean }
function effectWords(e: ReturnType<typeof computeCombatReadinessEffects>): number[] {
  return [e.movementChangePercent,e.damageChangePercent,e.damageTakenChangePercent,e.weaponMalfunctionChance,
    e.engineMalfunctionChance,e.criticalMalfunctionChance,e.shieldMalfunctionChance,Number(e.systemDisabled),Number(e.defenseDisabled)];
}
function targetWords(target: ComponentMalfunctionTarget): number[] {
  return target.kind === 'weapon' ? [0,Number(target.mount.slotId)] : [1,target.index];
}
function sequenceWords(s: LowCRShipDamageSequence | null): number[] {
  return s ? [s.severity,s.elapsed,s.beforeDamage,s.interval,s.intervalElapsed,Number(s.intervalWasElapsed),
    s.initialAttempts,s.remainingAttempts,Number(s.finished),(s as unknown as {targets: unknown[]}).targets.length] : Array(10).fill(0);
}

/** Actual Ship.prepareStep and its private deployment/readiness methods plus
 * LowCRShipDamageSequence are the oracle. The malfunction callback commits
 * eligibility changes but deliberately excludes already-verified real damage;
 * this isolated fixture does not prove production side-effect integration. */
export async function checkRustReadiness(source: BufferSource) {
  const {instance}=await WebAssembly.instantiate(source,{}),wasm=instance.exports as TestExports;
  let strict=0,steps=0,actions=0,shieldFailures=0,queries=0,effectSamples=0;
  function compare(a:number,b:number,label:string) {strict++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);}
  function input(words:number[]) {const p=wasm.test_input(words.length);new Float64Array(wasm.memory.buffer,p,words.length).set(words);}
  function result(p:number) {return Array.from(new Float64Array(wasm.memory.buffer,p,wasm.test_output_words()));}
  for(const cr of [NaN,Infinity,-Infinity,-1,-0,0,.0001,.099999999,.1,.198999999,.199,.2,.398999999,.399,.4,.499999999,.5,.699999999,.7,.700000001,1,2]) {
    for(const range of [0,.0025,.5,1,2])for(const fighter of [false,true]) {
      const bonus=.013,criticalBonus=.007,multiplier=1.31;
      input([cr,range,Number(fighter),bonus,criticalBonus,multiplier]);const actual=result(wasm.test_effects());
      const effects=computeCombatReadinessEffects(cr,range,fighter);effects.weaponMalfunctionChance+=bonus;
      effects.criticalMalfunctionChance=(effects.criticalMalfunctionChance+criticalBonus)*multiplier;
      effectWords(effects).forEach((v,i)=>compare(actual[i],v,`effects ${effectSamples} field ${i}`));effectSamples++;
    }
  }
  for(let scenario=0;scenario<28;scenario++) {
    const fighter=scenario%7===5,initialCR=[.7,.15,.05,0,.199,.399,.9][scenario%7];
    const range=scenario%8===6?0:scenario%8===7?.5:1,multiplier=scenario%4===3?2:1;
    const peak=scenario%6===0?0:scenario%6===1?.07:2;
    const seed=scenario+9107,random=new SimulationRandom(seed),flux=new FluxTracker(1000,0,fighter?'FIGHTER':'FRIGATE');
    const owner=Object.create(Ship.prototype) as Ship;
    const spec={id:'readiness-fixture',hullSize:fighter?'FIGHTER':'FRIGATE',hullMods:[],builtInHullMods:[],weaponSlots:[],
      engineSlots:[],sourceHullTraits:[]} as unknown as ShipSpec;
    const controller=new ShipWeaponControlSystem(random);
    const mounts=[{slotId:'1',mountType:'TURRET',ammo:Infinity,spec:{maxAmmo:undefined}},
      {slotId:'2',mountType:'HIDDEN',ammo:6,spec:{maxAmmo:12}},
      {slotId:'3',mountType:'TURRET',ammo:1,spec:{maxAmmo:12}},
      {slotId:'4',mountType:'TURRET',ammo:40,spec:{maxAmmo:40,ammoRegenPerSec:.1}}].map(w=>({...w,isPermanentlyDisabled:false,isDisabled:false,
        relativePos:new Vector2(),spec:w.spec as WeaponSpec})) as unknown as WeaponMount[];
    controller.weapons=mounts;controller.weaponGroups=[{weaponSlotIds:['1','2','1','3','4','99']}] as typeof controller.weaponGroups;
    const engines=[{systemActivated:false,contribution:.33,currentThrust:0,spread:0},
      {systemActivated:true,contribution:0,currentThrust:0,spread:0},{systemActivated:false,contribution:.34,currentThrust:0,spread:0}];
    const engineController={engines,permanentlyDisabledFraction:0};
    const shield=new Shield('FRONT',180,40,1,0),system=new ShipSystem('NONE',1000),defense=new ShipSystem('NONE',1000);
    Object.assign(owner,{id:'1',teamId:0,isPlayer:true,spec,random,flux,shield,system,systems:[system],defenseSystem:defense,weaponControl:controller,
      engineController,currentCR:initialCR,crAtDeployment:null,lowCRDamageSequence:null,peakPerformanceRemaining:peak,
      crMalfunctionRangeMultiplier:range,criticalMalfunctionChanceMultiplier:multiplier,
      hullHp:1000,isDead:false,isRetreated:false,isDocked:false,retreating:false,pos:new Vector2(),prevPos:new Vector2(),vel:new Vector2(),
      facingRad:0,angularVelRad:0,engineBoostLevel:0,prevEngineBoostLevel:0,brakeInput:false,statusEffects:new Map(),
      parentShip:null,runtimeModifiers:new RuntimeCombatModifiers(),hullStats:{hitpoints:1000,peakCRSec:peak,crLossPerSec:2.7,phaseTimeBonusMultiplier:1,
        weaponMalfunctionChanceBonus:.013,criticalMalfunctionChanceBonus:.007},combatShips:[],advanceHullModFlux:()=>{}});
    Object.defineProperty(owner,'subjectiveTimeMultiplier',{value:scenario%3===0?3:1});
    const calls:ComponentMalfunctionTarget[]=[];
    owner.applyCriticalMalfunction=(target:ComponentMalfunctionTarget)=>{
      calls.push(target);
      if(target.kind==='weapon') {
        target.mount.isPermanentlyDisabled=true;
        if(Number.isFinite(target.mount.ammo))target.mount.ammo=0;
        for(const group of owner.weaponGroups)group.weaponSlotIds=group.weaponSlotIds.filter(id=>id!==target.mount.slotId);
      } else engineController.permanentlyDisabledFraction+=engines[target.index].contribution;
    };
    (owner as unknown as PrivateShip).resetShieldMalfunctionState();
    const explicit=scenario%3!==0,locked=scenario%9===4;
    if(explicit)owner.applyDeploymentReadiness(initialCR,locked);
    input([seed,initialCR,peak,range,multiplier,Number(fighter),.013,.007,peak,2.7,Number(explicit),Number(locked)]);wasm.test_initialize();
    const enemy=Object.create(Ship.prototype) as Ship;
    Object.assign(enemy,{id:'2',teamId:1,spec:{hullSize:'CRUISER'},pos:new Vector2(20,0),isDead:false,isRetreated:false,isDocked:false});
    for(let step=0;step<140;step++) {
      const dt=step%9===0?0:step%17===0?1.7:.073,effective=dt*(scenario%3===0?3:1),near=step%6<4;
      owner.combatShips=near?[owner,enemy]:[owner];owner.isDead=step===139&&scenario%2===0;owner.isRetreated=step===137&&scenario%4===1;
      owner.hullHp=step===138?0:1000;
      const editedCR=step===40?.001:step===41?-1:step===62?.25:step===83?0:-1;
      if(editedCR>=0)owner.currentCR=editedCR;
      mounts[3].ammo=step%20<8?40:0;
      const ammoBefore=mounts[3].ammo;
      const setPermanent=step===51?.34:step===71?.67:-1;
      if(setPermanent>=0)engineController.permanentlyDisabledFraction=setPermanent;
      flux.isOverloaded=step%13===2;flux.isVenting=step%13===5;flux.softFlux=step%11===3?750:step%11===7?751:900;flux.hardFlux=0;
      flux.overloadTimer=flux.overloadDuration=0;
      const age=step%5===0?0:step%5===3?1.25:-1;
      if(age>=0)shield.sinceLastDamageTaken=age;
      shield.type=step%10===8?'NONE':'FRONT';shield.isActive=step%8!==6;
      const active=shield.isActive,front=shield.type==='FRONT';
      const redeploy=step===85,redeployLocked=scenario%5===1;
      if(redeploy)owner.applyDeploymentReadiness(owner.currentCR,redeployLocked);
      calls.length=0;system.disabled=defense.disabled=false;
      owner.prepareStep(dt,null); // Uses the actual source deployment, PPT and shield readiness stages.
      input([dt,effective,Number(near),Number(owner.isDead),owner.hullHp,editedCR,ammoBefore,setPermanent,
        Number(step%13===2),Number(step%13===5),step%11===3?750:step%11===7?751:900,age,Number(active),Number(front),
        Number(redeploy),Number(redeployLocked),Number(owner.isRetreated)]);
      const actual=result(wasm.test_step()),fields=owner as unknown as SourceFields,s=owner.lowCRDamageSequence;
      const expected=[owner.currentCR,owner.crAtDeployment??-1,owner.peakPerformanceRemaining,fields.crShieldMalfunctionTimer,
        fields.crShieldMalfunctionInterval,Number(fields.crShieldMalfunctionIntervalElapsed),Number(owner.justShieldMalfunction),Number(!!s),
        ...effectWords(owner.crEffects),...sequenceWords(s),shield.sinceLastDamageTaken,...random.checkpointWitness(),
        engineController.permanentlyDisabledFraction,Number(flux.isOverloaded),flux.overloadTimer,flux.overloadDuration,
        Number(shield.isActive),Number(shield.isRaiseRequested),Number(system.disabled),Number(defense.disabled),calls.length,
        ...mounts.flatMap(m=>[Number(m.isPermanentlyDisabled),m.ammo]),owner.weaponGroups[0].weaponSlotIds.length,
        ...owner.weaponGroups[0].weaponSlotIds.map(Number),
        ...(s?(s as unknown as {targets:ComponentMalfunctionTarget[]}).targets.flatMap(targetWords):[]),...calls.flatMap(targetWords)];
      compare(actual.length,expected.length,`scene ${scenario} step ${step} length`);
      expected.forEach((v,i)=>compare(actual[i],v,`scene ${scenario} step ${step} field ${i}`));steps++;actions+=calls.length;
      if(owner.justShieldMalfunction)shieldFailures++;
    }
  }
  const owner=Object.create(Ship.prototype) as Ship,other=Object.create(Ship.prototype) as Ship;
  Object.assign(owner,{id:'1',teamId:0,pos:new Vector2(),combatShips:[]});
  for(let i=0;i<96;i++) {
    const ownerTeam=i%3===0?undefined:0,otherTeam=i%4===0?undefined:i%4===1?0:1;
    owner.teamId=ownerTeam as number;owner.isPlayer=undefined as unknown as boolean;
    const same=i%17===0;Object.assign(other,{id:'2',teamId:otherTeam,isPlayer:undefined,pos:new Vector2(i%7===0?2500+1e-10:1500,i%7===1?2000:0),
      isDead:i%11===1,isRetreated:i%11===3,isDocked:i%11===5,spec:{hullSize:i%11===7?'FIGHTER':'CAPITAL_SHIP'}});
    const candidate=same?owner:other;owner.combatShips=[candidate];
    input([ownerTeam??-1,0,0,same?1:2,1,otherTeam??-1,same?0:other.pos.x,same?0:other.pos.y,
      Number(other.isDead),Number(other.isRetreated),Number(other.isDocked),Number(other.spec.hullSize==='FIGHTER'),2500]);
    compare(result(wasm.test_query())[0],Number(owner.areSignificantEnemiesInRange(2500)),`enemy query ${i}`);queries++;
  }
  return {passed:true,strictFields:strict,scenarios:28,steps,effectSamples,queries,criticalActions:actions,shieldFailureSteps:shieldFailures,
    geometryToleranceUsed:false,realDamageCovered:false,productionIntegrated:false,fullBattleReady:false};
}
