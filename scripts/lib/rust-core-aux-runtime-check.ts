import {worldFixture,assertWorld} from './rust-core-aux-runtime-fixture';
export async function checkRustCore(wasm:BufferSource){let strictFields=0,geometryFields=0,maximumDifference=0,steps=0;
  const cmp=(a:number,b:number,label:string,geo=false)=>{if(!geo){strictFields++;if(!Object.is(a,b))throw Error(label+': Rust '+a+' vs actual TS '+b);return;}
    geometryFields++;if(Object.is(a,b))return;const difference=Math.abs(a-b);assertWorld(Number.isFinite(a)&&Number.isFinite(b)&&difference<=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))),label+': geometry '+a+' vs '+b);maximumDifference=Math.max(maximumDifference,difference);};
  const numbers=(a:ArrayLike<number>,b:ArrayLike<number>,label:string,geometry:readonly number[]=[])=>{cmp(a.length,b.length,label+' length');for(let i=0;i<b.length;i++)cmp(a[i],b[i],label+' '+i,geometry.includes(i));};
  const coverage={mine:0,blast:0,damage:0,shield:0,stealth:0,light:0,queue:0,rollback:0,startup:0};
  const scenes=[{name:'deploy actual blast',shield:false,mods:[]},{name:'deploy shield blast',shield:true,mods:[]},
    {name:'zero flux mine',shield:false,mods:[],zero:true},{name:'stealth heavy shared source',shield:false,mods:['stealth_minefield']},
    {name:'stealth light shared source',shield:false,mods:['stealth_minefield_lt']},
    {name:'two actual stealth invocations',shield:false,mods:['stealth_minefield','stealth_minefield_lt']}];
  for(let scene=0;scene<scenes.length;scene++){const data=scenes[scene],f=await worldFixture(wasm,data.name,[
    {position:[0,0],maxHp:100000,maxFlux:data.zero?0:10000,builtins:data.mods},{position:[600,0],maxHp:100000,shield:data.shield?'OMNI':'NONE'},
    ...(data.mods.length?[{position:[1300,350]as[number,number],maxHp:100000},{position:[-900,700]as[number,number],maxHp:100000,team:0,builtins:['stealth_minefield']}]:[])],981+scene);
    try{numbers(f.core.snapshot().random,f.random.checkpointWitness(),data.name+' startup combat');numbers(f.core.snapshot().visualRandom,f.visual.checkpointWitness(),data.name+' startup visual');coverage.startup++;
      if(data.shield)f.shield(1,true);if(!data.mods.length)f.deploy(0,[600,0]);
      const total=data.mods.length?100:65;for(let tick=0;tick<total;tick++){const snap=await f.step(.2);steps++;
        const actual=f.auxSnapshot(),geometry:number[]=[];let offset=2;for(let i=0;i<actual[1];i++){geometry.push(offset+8,offset+9,offset+10,offset+11,offset+14);offset+=23;}
        const blastCount=actual[offset++];for(let i=0;i<blastCount;i++){geometry.push(offset,offset+1);offset+=6;}const field=actual[offset++];
        if(field){const incoming=actual[offset+4];offset+=5;for(let i=0;i<incoming;i++){geometry.push(offset,offset+1);offset+=5;}coverage.stealth++;if(incoming)coverage.queue++;}
        assertWorld(snap.world?.aux,data.name+' missing actual aux authority');numbers(snap.world.aux.values,actual,data.name+' tick '+tick+' aux',geometry);
        numbers(snap.random,f.random.checkpointWitness(),data.name+' combat RNG');numbers(snap.visualRandom,f.visual.checkpointWitness(),data.name+' visual RNG');
        cmp(snap.projectiles.length,f.weapon.projectiles.length,data.name+' ordnance count');
        for(let i=0;i<f.ships.length;i++){const s=f.ships[i],b=snap.bodies[i],a=b.ship!;numbers(b.motion.slice(0,6),[s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad],data.name+' pose '+i,[0,1,2,3,4,5]);
          cmp(a.armor!.values[14],s.hullHp,data.name+' hull '+i);numbers(a.armor!.cells,s.armor.copyCells(),data.name+' armor '+i);numbers(a.flux.slice(8,10),[s.flux.softFlux,s.flux.hardFlux],data.name+' flux '+i);
          if(s.hullHp<s.maxHullHp||s.armor.dirtyVersion)coverage.damage++;if(s.flux.hardFlux>0)coverage.shield++;}
        coverage.mine+=f.mines.mines.length;coverage.blast+=blastCount;if(f.mines.mines.some(m=>m.weaponId==='minelayer1'))coverage.light++;
        if(tick===2){const before=f.core.snapshot();let rejected=false;try{f.core.apply([{kind:'deploy-mine',id:1,handle:f.handles[0],point:[NaN,0],range:1000}]);}catch{rejected=true;}assertWorld(rejected,'invalid mine command accepted');
          const after=f.core.snapshot();numbers(after.random,before.random,'failed mine RNG');numbers(after.world!.aux!.values,before.world!.aux!.values,'failed mine world');coverage.rollback++;}
      }
    }finally{f.core.dispose();}}
  for(const [key,value]of Object.entries(coverage))assertWorld(value>0,'missing shared aux coverage '+key);
  return{passed:true,fullBattleReady:false,scenarios:scenes.length,steps,strictFields,geometryFields,maximumDifference,coverage};
}
