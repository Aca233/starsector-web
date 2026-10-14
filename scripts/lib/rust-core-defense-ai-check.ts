import { solveAIThreat } from '../../src/engine/ai/batch/AIThreatSolver';
import { bodyKeys, weaponKeys, projectileKeys, beamKeys } from '../../src/engine/ai/batch/StageProtocol';
import type { AIStageView } from '../../src/engine/ai/batch/AIInputs';
import { ShipDefenseController } from '../../src/engine/ai/ShipDefenseController';
import type { ThreatAssessment } from '../../src/engine/ai/ThreatAssessment';
import type { Ship } from '../../src/engine/simulation/Ship';
import { Shield } from '../../src/engine/simulation/Shield';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { remainingProjectileLifetime } from '../../src/engine/simulation/systems/weapon/SourceMissileLifecycle';
import type { Projectile } from '../../src/engine/simulation/Weapon';
import { Vector2 } from '../../src/engine/math/Vector2';
import capitalAISource from '../../src/engine/ai/CapitalShipAI.ts?raw';

interface Exports {memory:WebAssembly.Memory;test_input:(n:number)=>number;test_assess:()=>number;test_initialize:()=>number;test_defense:()=>number;test_forecast:()=>number;test_lifetime:()=>number;test_output_words:()=>number}
const body=(id:number,team:number,first:number,count:number):number[]=>[id,1,team,0,0,0,40,0,0,50,1,.8,1.1,.9,Math.PI/2,.5,.5,2,.5,0,0,0,100,1,first,count,0];
const weapon=(id:number,x:number,y:number,flags=0,type=2):number[]=>[id,1,0,Infinity,100,flags,x,y,1000,400,Math.PI,Math.PI,0,Math.PI/2,1,0,1,100,type,.8,0];
const projectile=(source:number,x:number,y:number,vx:number,vy:number,flags=0,type=2):number[]=>[source,source?1:0,NaN,flags,0,80,type,5,x,y,vx,vy,2,0,0,0,Math.PI,400,1];
const beam=(source:number,mount:number,x:number,y:number,ex:number,ey:number):number[]=>[source,1,mount,1,.7,x,y,ex,ey,90,2,0];
function columns(keys:readonly string[],rows:number):Record<string,Float64Array>{return Object.fromEntries(keys.map(k=>[k,new Float64Array(rows)]));}
function set(c:Record<string,Float64Array>,row:number,fields:Record<string,number>):void{for(const [key,value] of Object.entries(fields))c[key][row]=value;}
interface Scene {b:number[][];w:number[][];p:number[][];e:number[][];teams:number[];visibility:number[]}
function stage(s:Scene):AIStageView{
  const bodies=columns(bodyKeys,s.b.length),weapons=columns(weaponKeys,s.w.length),projectiles=columns(projectileKeys,s.p.length),beams=columns(beamKeys,s.e.length);
  const ai:Record<string,unknown>={ids:s.b.map(b=>'ship-'+b[0]),slotIds:s.w.map((_,i)=>'slot-'+i),projectileSourceId:s.p.map(p=>'ship-'+p[0]),
    shieldThreatHalfArc:new Float64Array(s.b.map(b=>b[14])),fixedMount:new Float64Array(s.w.map(w=>w[12])),authoredHalfArc:new Float64Array(s.w.map(w=>w[13])),
    projectileFuse:new Float64Array(s.p.map(p=>p[13])),projectileTurnRate:new Float64Array(s.p.map(p=>p[18])),projectileMaxSpeed:new Float64Array(s.p.map(p=>p[17])),projectileDidDamage:new Float64Array(s.p.map(p=>p[4]))};
  const sourceRow=(id:number)=>s.b.findIndex(b=>b[0]===id);
  s.b.forEach((b,i)=>set(bodies,i,{handle:b[0],generation:b[1],team:b[2],flags:b[3],vx:b[4],vy:b[5],radius:b[6],shieldX:b[7],shieldY:b[8],shieldRadius:b[9],shieldType:b[10],shieldEfficiency:b[11],
    shieldDamageMultiplier:b[12],shieldEnergyMultiplier:b[13],phaseDownDuration:b[15],phaseUpDuration:b[16],phaseCooldownDuration:b[17],shieldUnfoldDuration:b[18],overloadTimer:b[19],ventTime:b[20],systemRecovery:b[21],maxSpeed:b[22],maxTurnRate:b[23],weaponFirst:b[24],weaponCount:b[25]}));
  s.w.forEach((w,i)=>set(weapons,i,{ownerRow:sourceRow(w[0]),disabled:w[2],ammo:w[3],dps:w[4],flags:w[5],muzzleX:w[6],muzzleY:w[7],effectiveRange:w[8],maxSpeed:w[9],baseAngle:w[10],angle:w[11],turnRate:w[14],readiness:w[15],burstSize:w[16],damage:w[17],damageType:w[18],beamDuration:w[19]}));
  s.p.forEach((p,i)=>set(projectiles,i,{sourceRow:sourceRow(p[0]),team:p[2],flags:p[3],damage:p[5],damageType:p[6],remainingLife:p[7],x:p[8],y:p[9],vx:p[10],vy:p[11],radius:p[12],targetRow:sourceRow(p[14]),facing:p[16]}));
  s.e.forEach((e,i)=>set(beams,i,{sourceRow:sourceRow(e[0]),mountRow:e[2],damageActive:e[3],duration:e[4],startX:e[5],startY:e[6],endX:e[7],endY:e[8],dps:e[9],damageType:e[10]}));
  return {abi:1,active:true,valid:true,epoch:1,revision:0,kind:'AI_PLAN',bodyCount:s.b.length,weaponCount:s.w.length,projectileCount:s.p.length,beamCount:s.e.length,
    bodies,weapons,projectiles,beams,ai,teams:s.teams,visibility:new Float64Array(s.visibility)} as unknown as AIStageView;
}
const threat=(damage=0,flux=0,actual=0,count=0,deferred=false,facing:number|null=null):ThreatAssessment=>({threats:Array.from({length:count},()=>({sourceId:'ship-2',kind:'PROJECTILE' as const,eta:0,damage:1,shieldFlux:1,direction:0})),
  horizon:2,imminentDamage:damage,imminentShieldFlux:flux,actualDamage:actual,earliest:count?0:Infinity,facing,hasDeferredWeaponThreat:deferred});
const threatWords=(t:ThreatAssessment):number[]=>[t.imminentDamage,t.imminentShieldFlux,t.actualDamage,t.threats.length,Number(t.hasDeferredWeaponThreat??false),t.facing??NaN];

export async function checkRustDefenseAI(source:BufferSource){
  const {instance}=await WebAssembly.instantiate(source),exports=instance.exports as unknown as Exports;
  let strictFields=0,geometryFields=0,maxGeometryDifference=0,scenes=0,threatsChecked=0,controllerSteps=0,liveRefreshes=0,ventAttempts=0;
  const geometryLog:{field:string;actual:number;expected:number;difference:number}[]=[];
  const exact=(a:number,b:number,label:string)=>{strictFields++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);};
  const geometry=(a:number,b:number,label:string)=>{geometryFields++;if(Object.is(a,b))return;const difference=Math.abs(a-b);if(!(difference<=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)))))throw Error(`${label}: geometry ${a} differs from ${b}`);
    maxGeometryDifference=Math.max(maxGeometryDifference,difference);if(difference)geometryLog.push({field:label,actual:a,expected:b,difference});};
  const write=(values:number[])=>{const pointer=exports.test_input(values.length);new Float64Array(exports.memory.buffer,pointer,values.length).set(values);};
  const read=(fn:()=>number)=>{const pointer=fn();return new Float64Array(exports.memory.buffer,pointer,exports.test_output_words()).slice();};
  const base=():Scene=>({b:[body(1,0,0,0),body(2,1,0,3),body(3,1,3,1)],w:[weapon(2,300,0),weapon(2,-200,0,8,0),weapon(2,0,200,16|128,1),weapon(3,500,0)],p:[],e:[],teams:[0,1],visibility:[1,1,1,1,1,1]});
  for(let scenario=0;scenario<18;scenario++)for(const frame of [false,true])for(let tick=0;tick<20;tick++){
    const s=base(),horizon=scenario===16?Infinity:3,window=1,weaponHorizon=tick%2?1:3;
    s.b[0][4]=tick%3*3;s.b[1][4]=tick%4*5;s.b[1][3]=scenario===4?64:scenario===5?128:scenario===6?32:scenario===7?4:0;
    if(scenario===0){s.w[0][6]+=tick*.017;s.w[0][7]=tick*3.173;s.w[0][10]=2.8;s.w[0][11]=2.6;s.w[0][12]=0;s.w[0][13]=.3;}
    s.b[1][19]=.8;s.b[1][20]=.9;s.b[1][21]=scenario===8?2:0;s.b[0][10]=scenario===9?3:1;
    s.w[0][15]=tick%4*.2;s.w[0][16]=3;s.w[0][3]=scenario===10?2:Infinity;s.w[3][2]=Number(scenario===11);
    s.p.push(projectile(2,180,0,-100,0,0,tick%4),projectile(2,0,190,0,-130,0,0),projectile(2,300,300,100,100,0,1),projectile(1,-180,0,100,0));
    if(scenario===1){s.p[0][3]=2;s.p[0][14]=1;s.p[0][15]=1;s.p[0][16]=Math.PI;s.p[0][10]=10;}
    if(scenario===2)s.p[0][3]=4;if(scenario===3)s.p[1][4]=1;if(scenario===12){s.p[0][3]=64;s.p[1][3]=16;}
    if(scenario===13){s.p[0][13]=100;s.p[2][0]=0;s.p[2][1]=0;}
    if(scenario===14)s.visibility[2]=0;
    if(scenario===15){s.e.push(beam(2,1,-300,0,300,0),beam(3,3,-300,500,300,500));}
    if(scenario===17){s.p=[];for(let i=0;i<160;i++){const angle=(i%13)*Math.PI/6-Math.PI;s.p.push(projectile(2,20*Math.cos(angle),20*Math.sin(angle),0,0,0,i%4));}s.b[0][14]=tick%4===0?Math.PI:Math.PI/3;}
    write([0,horizon,window,weaponHorizon,Number(frame),s.b.length,s.w.length,s.p.length,s.e.length,s.teams.length,...s.b.flat(),...s.w.flat(),...s.p.flat(),...s.e.flat(),...s.teams,...s.visibility]);
    const actual=read(exports.test_assess),expected=solveAIThreat(stage(s),0,horizon,window,weaponHorizon,frame);exact(actual[0],0,'assessment accepted');
    exact(actual[1],expected.imminentDamage,'imminentDamage');exact(actual[2],expected.imminentShieldFlux,'imminentShieldFlux');exact(actual[3],expected.actualDamage,'actualDamage');exact(actual[4],expected.earliest,'earliest');
    exact(actual[7],expected.threats.length,'count');if(expected.facing===null)exact(actual[5],NaN,'no facing');else geometry(actual[5],expected.facing,'facing');
    let cursor=8;for(const t of expected.threats){const kind=t.kind==='PROJECTILE'?0:t.kind==='BEAM'?1:2;exact(actual[cursor],kind,'kind');exact(actual[cursor+1],Number(t.sourceId.slice(5)),'source handle');
      exact(actual[cursor+2],Number(t.sourceId.slice(5))?1:0,'source generation');exact(actual[cursor+4],t.eta,`eta scenario ${scenario} tick ${tick} frame ${frame} kind ${t.kind} source ${t.sourceId}`);exact(actual[cursor+5],t.damage,'damage');exact(actual[cursor+6],t.shieldFlux,'shieldFlux');geometry(actual[cursor+7],t.direction,'direction');cursor+=8;threatsChecked++;}
    if(expected.facing!==null){const i=expected.threats.findIndex(t=>t.eta<=window&&Object.is(t.direction,expected.facing));exact(actual[6],i,'winning threat original identity');geometry(actual[5],expected.threats[i].direction,'winning original index');}scenes++;
  }
  const stopAudio=captureCombatAudio(()=>{});
  try{for(let scenario=0;scenario<12;scenario++){
    const phase=scenario>=6,type=phase?'PHASE' as const:'FRONT' as const,flux=new FluxTracker(1000,scenario===5?0:100,'FRIGATE'),shield=new Shield(type,180,250,1,10,n=>flux.increaseFluxClamped(n,true));
    shield.phaseActivationCost=45;shield.phaseUpkeepPerSecond=26;shield.toggleLocked=scenario===4;shield.isActive=!phase;
    const controller=new ShipDefenseController();let shieldRequests=0,ventCalls=0,defenseFacing:number|undefined;
    const originalSet=shield.setActive.bind(shield);shield.setActive=(active:boolean)=>{shieldRequests++;originalSet(active);};
    const host={shield,flux,hullHp:300,weapons:[] as {burstRemaining:number;firingState:string;spec:{isBeam:boolean;beamVisualMode?:string}}[],
      system:{preventsAIVenting:false,getShieldDamageMultiplier:()=>1.13,getShieldUpkeepMultiplier:()=>.91},
      get defenseFacingRad(){return defenseFacing;},set defenseFacingRad(value:number|undefined){defenseFacing=value;},
      canUseShields:()=>scenario!==3&&!flux.isOverloaded&&!flux.isVenting&&shield.type!=='NONE',
      startVenting:()=>{ventCalls++;if(scenario===2||flux.isOverloaded||flux.isVenting||flux.totalFlux<=5||shield.toggleLocked)return false;
        if(shield.isRaiseRequested&&(shield.type!=='PHASE'||shield.isPhaseUpkeepActive))shield.setActive(false);return flux.startVenting();}} as unknown as Ship;
    write([1000,flux.baseDissipation,1,1,1,0,1,1,0,0,phase?3:1,180,250,1,10,1,1,.5,.5,2,45,26,1,Number(shield.toggleLocked),1,0,0,0,0,Number(shield.isActive),Number(scenario!==3),1.13,.91,300]);exports.test_initialize();
    for(let tick=0;tick<35;tick++){
      const incoming=tick<5?threat(80,150,scenario===1?400:80,1,false,0):tick===19?threat(0,0,0,0,true):threat();
      const committed=scenario===0&&tick>=5&&tick<15,refresh=scenario===7||scenario===8,fresh=scenario===7?threat(80,150,80,1,false,Math.PI/3):threat();
      host.weapons=committed?[{burstRemaining:1,firingState:'IDLE',spec:{isBeam:false}} as never]:[];host.system.preventsAIVenting=scenario===9;
      const soft=tick<4?(scenario===6||scenario===11?400:950):tick<15?400:800,hard=0;flux.softFlux=soft;flux.hardFlux=hard;flux.isOverloaded=scenario===10&&tick>=20;
      let refreshed=false;controller.observe(.1,incoming);const expected=controller.update(host,incoming,refresh?()=>{refreshed=true;return fresh;}:undefined);
      write([.1,...threatWords(incoming),Number(committed),Number(host.system.preventsAIVenting),Number(scenario!==2),soft,hard,Number(flux.isOverloaded),Number(refresh),...threatWords(fresh)]);
      const actual=read(exports.test_defense);exact(actual[0],0,'defense accepted');exact(actual[1],controller.quietFor,'quietFor');exact(actual[2],(controller as unknown as {safeVentFor:number}).safeVentFor,'safeVentFor');
      exact(actual[3],Number(expected.ventSafe),'ventSafe');exact(actual[4],['UP','DOWN','PHASE','VENTING'].indexOf(expected.state),'defense result');exact(actual[5],Number(refreshed),'live refresh');geometry(actual[7],defenseFacing??NaN,'defenseFacing');
      const sd=actual.subarray(8,52),fd=actual.subarray(52,71),privateShield=shield as unknown as {closeTimeRemaining:number;pendingRaise:boolean;phaseStageTimer:number;pendingActivationCost:number};
      for(const [i,value] of [[6,Number(shield.isActive)],[10,privateShield.closeTimeRemaining],[11,Number(privateShield.pendingRaise)],[14,['IDLE','IN','ACTIVE','OUT','COOLDOWN'].indexOf(shield.phaseState)],[15,shield.phaseEffectLevel],[23,privateShield.phaseStageTimer],[24,privateShield.pendingActivationCost]] as const)exact(sd[i],value,'shield '+i);
      exact(fd[8],flux.softFlux,'soft flux');exact(fd[9],flux.hardFlux,'hard flux');exact(fd[14],Number(flux.isVenting),'venting');exact(fd[16],(flux as unknown as {initialVentFlux:number}).initialVentFlux,'initial vent flux');
      exact(actual[71],shieldRequests,'shield requests');exact(actual[72],ventCalls,'vent calls');controllerSteps++;liveRefreshes+=Number(refreshed);ventAttempts+=Number(actual[6]);
    }
  }}finally{stopAudio();}
  const forecastStart=capitalAISource.indexOf('    const compact=FORECAST_INTERVAL>0'),forecastEnd=capitalAISource.indexOf('    this.defense.observe(dt,threat);',forecastStart);
  if(forecastStart<0||forecastEnd<0)throw Error('Actual CapitalShipAI forecast source boundary moved');
  // Execute the actual authored memory block, avoiding a mirrored TS forecast implementation.
  const originalForecast=new Function('dt','scene','a','r','v','window','horizon','solveAIThreat','FORECAST_INTERVAL',capitalAISource.slice(forecastStart,forecastEnd)+'return threat;') as
    (this:Record<string,number|boolean>,dt:number,scene:{compactThreatForecastEligible:boolean},a:{nativeForecast:number[]},r:number,v:{bodyCount:number},window:number,horizon:number,solve:()=>ThreatAssessment,interval:number)=>ThreatAssessment;
  let forecastSteps=0;
  for(let scenario=0;scenario<9;scenario++){
    write([1000,100,1,1,1,0,1,1,0,0,1,180,250,1,10,1,1,.5,.5,2,45,26,1,0,1,0,0,0,0,1,1,1,1,300]);exports.test_initialize();
    const memory:Record<string,number|boolean>={forecastRemaining:-1,forecastFarThreat:false,forecastEarliest:Infinity,forecastDefenseWindow:0,forecastRosterSize:0,tacticalPhase:scenario%3};
    for(let tick=0;tick<80;tick++){
      const dt=tick%5===0?0:.009,window=tick>=37?1.5:1,horizon=3,roster=tick>=50?4:3,compact=scenario!==0,native=scenario!==1,interval=scenario===2?0:.05,far=tick%7===0;
      const first=(memory.forecastRemaining as number)<0,priorRemaining=memory.forecastRemaining as number;
      const expected=originalForecast.call(memory,dt,{compactThreatForecastEligible:compact},{nativeForecast:[Number(native)]},0,{bodyCount:roster},window,horizon,()=>({
        ...threat(),earliest:far?window+.1:Infinity,threats:far?[{kind:'WEAPON',sourceId:'ship-2',eta:window+.1,damage:1,shieldFlux:1,direction:0}]:[]}),interval);
      write([dt,horizon,window,roster,Number(compact),Number(native),interval,scenario%3,Number(far),far?window+.1:Infinity]);const actual=read(exports.test_forecast);
      const compactEnabled=interval>0&&compact&&native,refresh=!compactEnabled||first||priorRemaining-dt<=1e-9||tick===37||tick===50;
      const expectedValues=[Number(first),Number(refresh),Number(compactEnabled),refresh?horizon:Math.min(horizon,window),memory.forecastRemaining,Number(memory.forecastFarThreat),memory.forecastEarliest,
        memory.forecastDefenseWindow,memory.forecastRosterSize,Number(expected.hasDeferredWeaponThreat??false),expected.earliest];
      expectedValues.forEach((value,i)=>exact(actual[i],Number(value),'actual-source forecast '+i));forecastSteps++;
    }
  }
  let lifetimeCases=0;
  for(const missile of [false,true])for(const flight of [undefined,0,-.3,7])for(const fizzle of [undefined,0,.3,4])for(const range of [undefined,0,900]){
    const p={isRocket:missile,missileLifecycleSpec:missile?{flameoutTime:2}:undefined,flightTimeRemaining:flight,missileFizzleTime:fizzle,rangeRemaining:range,vel:new Vector2(63.17,-27.31),
      fadeTime:.3,fadeProgress:.27} as unknown as Projectile;
    write([Number(missile),2,fizzle??NaN,flight??NaN,range??NaN,NaN,63.17,-27.31,.3,.27]);const actual=read(exports.test_lifetime);exact(actual[0],remainingProjectileLifetime(p),'physical lifetime');lifetimeCases++;
  }
  const rejected=(mutation:(s:Scene)=>void)=>{const s=base();mutation(s);write([0,3,1,3,0,s.b.length,s.w.length,s.p.length,s.e.length,s.teams.length,...s.b.flat(),...s.w.flat(),...s.p.flat(),...s.e.flat(),...s.teams,...s.visibility]);exact(read(exports.test_assess)[0],1,'invalid observation rejected');};
  for(const mutation of [(s:Scene)=>{s.b[0][0]=0;},(s:Scene)=>{s.b[1][0]=1;},(s:Scene)=>{s.visibility=[];},(s:Scene)=>{s.w[0][1]=2;},
    (s:Scene)=>{s.b[1][24]=1;},(s:Scene)=>{s.b[1][22]=NaN;},(s:Scene)=>{const p=projectile(2,100,0,-100,0);p[1]=2;s.p.push(p);},(s:Scene)=>{s.e.push(beam(2,9,-10,0,10,0));}])rejected(mutation);
  return {passed:true,scenes,threatsChecked,controllerSteps,liveRefreshes,ventAttempts,forecastSteps,lifetimeCases,rejectedObservations:8,strictFields,geometryFields,maxGeometryDifference,geometryLog,rngConsumed:0,productionIntegrated:false};
}
