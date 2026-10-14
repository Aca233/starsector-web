import {worldFixture,assertWorld,lifecycleWords,type WorldFixture,type WorldActor} from './rust-core-gravity-runtime-fixture';
import {GRAVITY_SYSTEM_IDS as ID} from '../../src/engine/content/GravityIds';
import {gravityWeapons} from '../../src/engine/content/GravityArmory';
import {RustFiringState} from '../../src/engine/runtime/rust/RustCoreProtocol';
export async function checkRustCore(wasm:BufferSource){let strictFields=0,geometryFields=0,maximumDifference=0,steps=0,scenarios=0;
  const cmp=(a:number,b:number,label:string,geo=false)=>{if(!geo){strictFields++;if(!Object.is(a,b))throw Error(label+': Rust '+a+' differs from actual TS '+b);return;}
    geometryFields++;if(Object.is(a,b))return;const d=Math.abs(a-b);assertWorld(Number.isFinite(a)&&Number.isFinite(b)&&d<=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))),label+': geometry '+a+' vs '+b);maximumDifference=Math.max(maximumDifference,d);};
  const numbers=(a:ArrayLike<number>,b:ArrayLike<number>,label:string,geometry:number[]=[])=>{cmp(a.length,b.length,label+' length');for(let i=0;i<b.length;i++)cmp(a[i],b[i],label+' '+i,geometry.includes(i));};
  const coverage={field:0,cursor:0,collapse:0,tractor:0,damage:0,release:0,repulsor:0,push:0,rollback:0,pause:0};
  const scenes:{name:string;owner:Partial<WorldActor>;target?:Partial<WorldActor>;trigger?:boolean;long?:boolean}[]=[
    {name:'well fixed hold',owner:{systemTypes:[ID.well]}},
    {name:'battle cursor automatic collapse',owner:{systemTypes:[ID.battleWell,ID.push,ID.battleRepulsor]},long:true},
    {name:'manual collapse anchored',owner:{systemTypes:[ID.well,ID.collapse]}},
    {name:'repulsor assembly',owner:{systemTypes:[ID.repulsor]}},
    {name:'tractor real armor',owner:{gun:gravityWeapons()[0],hardpoint:true},trigger:true},
    {name:'tractor real ordinary shield',owner:{gun:gravityWeapons()[0],hardpoint:true},target:{shield:'FRONT'},trigger:true},
    {name:'tractor self tow no self damage',owner:{gun:gravityWeapons()[0],hardpoint:true},trigger:true},
    {name:'directional push held release',owner:{systemTypes:[ID.push],gun:gravityWeapons()[0],hardpoint:true}},
    {name:'remote release',owner:{systemTypes:[ID.well,ID.release]}}
  ];
  for(let scene=0;scene<scenes.length;scene++){const data=scenes[scene];const f:WorldFixture=await worldFixture(wasm,data.name,[{position:[0,0],hull:'web_gravity',maxHp:100000,...data.owner},
    {position:[400,0],maxHp:100000,...data.target},...(scene===3?[{position:[400,90]as[number,number],maxHp:100000,parent:1}]:[])],731+scene);try{
      f.aim(0,scene===6?[0,0]:[400,0]);if(data.target?.shield)f.shield(1,true);
      if(data.owner.systemTypes&&!([ID.push]as string[]).includes(data.owner.systemTypes[0]))assertWorld(f.activateSlot(0,0),data.name+' initial activation');
      if(scene===7)f.held(0,false,true);
      const total=data.long?50:18;
      for(let tick=0;tick<total;tick++){const dt=data.long ? .5 : .1;
        if(scene===1){f.held(0,tick<4,false);if(tick<4)f.aim(0,[400+tick*10,0]);}
        if((scene===2||scene===8)&&tick===5)assertWorld(f.activateSlot(0,1),data.name+' remote activation');
        if(scene===7&&tick===6)f.held(0,false,false);
        const snap=await f.step(dt,[!!data.trigger&&tick<12]);steps++;
        for(let i=0;i<f.ships.length;i++){const s=f.ships[i],a=snap.bodies[i].ship!,label=data.name+' tick '+tick+' ship '+i;
          numbers(snap.bodies[i].motion.slice(0,6),[s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad],label+' pose',[0,1,2,3,4,5]);
          cmp(a.armor!.values[14],s.hullHp,label+' hull');numbers(a.armor!.cells,s.armor.copyCells(),label+' armor');
          numbers(a.flux.slice(8,10),[s.flux.softFlux,s.flux.hardFlux],label+' flux');cmp(a.shield![6],+s.shield.isActive,label+' shield');
          s.allSystems.forEach((sys,j)=>numbers(a.systems[j].values.slice(2),lifecycleWords(sys),label+' system '+j));
          s.weapons.forEach((m,j)=>numbers(a.weapons!.mounts[j].slice(16,32),[m.cooldownTimer,m.ammo,m.ammoRechargeProgress,m.lifecycleDt??0,m.burstRemaining,m.burstTimer,+!!m.burstFluxReserved,
            RustFiringState[m.firingState],m.firingStateTimer,+m.triggerHeld,m.firingCycleId,m.reloadDelayRemaining??0,m.recoil,m.glowAlpha,m.barrelIndex,m.currentSpreadDeg],label+' mount '+j));
        }
        numbers(snap.random,f.random.checkpointWitness(),data.name+' combat RNG');numbers(snap.visualRandom,f.visual.checkpointWitness(),data.name+' visual RNG');
        cmp(snap.projectiles.length,f.weapon.projectiles.length,data.name+' actual no fake projectile');
        const published=snap.world!.gravity!;assertWorld(published,data.name+' missing gravity publication');
        f.ships[0].allSystems.forEach(sys=>{if(sys.gravityField){coverage.field++;if(sys.gravityField.kind==='COLLAPSE')coverage.collapse++;if(sys.gravityField.kind==='REPULSOR')coverage.repulsor++;if(sys.gravityField.cursorControlled)coverage.cursor++;}});
        if(f.ships[0].weapons[0]?.gravityTractor?.phase==='HOLD')coverage.tractor++;
        if(f.ships[1].hullHp<f.ships[1].maxHullHp||f.ships[1].armor.dirtyVersion>0)coverage.damage++;
        if(scene===7&&f.ships[0].allSystems[0].gravityPush?.target)coverage.push++;
        if(tick===13&&(scene===4||scene===5||scene===6)&&f.ships[0].weapons[0].gravityTractor?.phase==='IDLE')coverage.release++;
        if(tick===1){const before=f.core.snapshot();let rejected=false;try{f.core.apply([{kind:'gravity-held',id:1,handle:{slot:f.handles[0].slot,generation:f.handles[0].generation+1},field:true,push:true}]);}catch{rejected=true;}assertWorld(rejected,'stale gravity command accepted');
          const after=f.core.snapshot();numbers(after.random,before.random,'rollback RNG');cmp(after.events.length,before.events.length,'rollback events');coverage.rollback++;
          // A paused authority publishes without advancing; Core.step requires a positive dt.
          const now=f.core.snapshot();const paused=f.core.snapshot();cmp(paused.combatTime,now.combatTime,'paused publication time');numbers(paused.random,now.random,'paused publication RNG');numbers(paused.visualRandom,now.visualRandom,'paused publication visual RNG');coverage.pause++;}
      }scenarios++;
    }finally{f.core.dispose();}}
  for(const key of ['field','cursor','collapse','tractor','damage','release','repulsor','push','rollback','pause']as const)assertWorld(coverage[key]>0,'missing actual gravity runtime coverage '+key);
  return{passed:true,fullBattleReady:false,scenarios,steps,strictFields,geometryFields,maximumDifference,coverage};
}

