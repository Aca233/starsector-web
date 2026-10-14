// Match the application module entry order for its existing AI/Engine cycle.
import '../../src/engine/simulation/CombatEngine';
import{CapitalShipAI,type CapitalAIIntent}from'../../src/engine/ai/CapitalShipAI';
import{solveAIFleet}from'../../src/engine/ai/batch/AIFleetSolver';
import{solveAIThreat}from'../../src/engine/ai/batch/AIThreatSolver';
import{solveAIForwardPath}from'../../src/engine/ai/batch/AINavigationSolver';
import{bodyKeys,weaponKeys,projectileKeys,beamKeys}from'../../src/engine/ai/batch/StageProtocol';
import type{AIStageView}from'../../src/engine/ai/batch/AIInputs';
import type{AIBatch}from'../../src/engine/ai/batch/AIBatch';
import type{TacticalOrder}from'../../src/engine/simulation/CombatTypes';
import type{Ship}from'../../src/engine/simulation/Ship';
import{ShipSystem}from'../../src/engine/simulation/ShipSystem';
import{Shield}from'../../src/engine/simulation/Shield';
import{FluxTracker}from'../../src/engine/simulation/FluxTracker';
import{Vector2}from'../../src/engine/math/Vector2';
import{captureCombatAudio}from'../../src/engine/audio/CombatAudioEvents';
import{advanceJetsAI,advanceWeaponBoostAI}from'../../src/engine/extensions/ship-systems/SystemAI';
import{burnDrive}from'../../src/engine/extensions/ship-systems/BurnDrive';
import{eclipseProtocol}from'../../src/engine/extensions/ship-systems/EclipseProtocol';
import{adunArkSystems}from'../../src/engine/extensions/ship-systems/AdunArkSystems';
import type{SystemAIContext}from'../../src/engine/extensions/ship-systems/Types';
interface Exports{memory:WebAssembly.Memory;test_input:(n:number)=>number;test_step:()=>number;test_system:()=>number;test_guards:()=>number;test_output_words:()=>number}
interface Scene{b:number[][];w:number[][];rocks:number[][];orders:number[][];teams:number[];visible:number[];own:number;target:number;desired:[number,number];ordered:number}
const tasks=['PRESSURE','FINISH','SCREEN','SUPPORT','REGROUP','DISENGAGE','SEARCH'];
const name=(id:number)=>'ship-'+String(id).padStart(3,'0');
const body=(id:number,team:number,x:number,y:number,first:number,count:number):number[]=>[id,1,id,id,team,0,x,y,0,0,team?Math.PI:0,45,1000,1000,.2,2,100,1,60,70,100,150,0,0,1,60,1,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,first,count,0];
const weapon=(owner:number,slot:number,x:number,y:number,range:number,power:number):number[]=>[owner,1,slot,0,Infinity,power,0,0,range,400,x,y,0,0,0,0,Math.PI/2,0,.1,1,0];
function columns(keys:readonly string[],count:number):Record<string,Float64Array>{return Object.fromEntries(keys.map(k=>[k,new Float64Array(count)]));}
function set(c:Record<string,Float64Array>,r:number,values:Record<string,number>):void{for(const[k,v]of Object.entries(values))c[k][r]=v;}
function fixtureStage(s:Scene):AIStageView{
const b=columns(bodyKeys,s.b.length),w=columns(weaponKeys,s.w.length),ai:Record<string,unknown>={ids:s.b.map(b=>name(b[2])),slotIds:s.w.map(w=>name(w[2])),currentTargetId:s.b.map(b=>b[37]?name(b[37]):undefined),
previousTask:s.b.map(b=>b[39]<0?undefined:tasks[b[39]]),specSpeed:new Float64Array(s.b.map(b=>b[20])),specArmor:new Float64Array(s.b.map(b=>b[21])),wingPower:new Float64Array(s.b.map(b=>b[22])),carrierRange:new Float64Array(s.b.map(b=>b[23])),strafeMultiplier:new Float64Array(s.b.map(b=>b[24])),
rawShieldActive:new Float64Array(s.b.map(b=>b[26])),shieldPhased:new Float64Array(s.b.map(b=>b[28])),systemPhased:new Float64Array(s.b.map(b=>b[29])),systemLocksTurning:new Float64Array(s.b.map(b=>b[30])),vastBulk:new Float64Array(s.b.map(b=>b[31])),retreating:new Float64Array(s.b.map(b=>b[32])),systemDrone:new Float64Array(s.b.map(b=>b[33])),player:new Float64Array(s.b.map(b=>b[34])),doNotBackOff:new Float64Array(s.b.map(b=>b[36])),trainingAction:new Float64Array(s.b.map(b=>b[40])),
localBaseAngle:new Float64Array(s.w.map(w=>w[14])),authoredHalfArc:new Float64Array(s.w.map(w=>w[16])),fixedMount:new Float64Array(s.w.map(w=>w[17])),profileDelay:new Float64Array(s.w.map(w=>w[18])),positionTurnRate:new Float64Array(s.w.map(w=>w[19])),asteroidCount:s.rocks.length,obstacleCount:s.rocks.length,
obstacleX:new Float64Array(s.rocks.map(r=>r[0])),obstacleY:new Float64Array(s.rocks.map(r=>r[1])),obstacleVx:new Float64Array(s.rocks.map(r=>r[2])),obstacleVy:new Float64Array(s.rocks.map(r=>r[3])),obstacleRadius:new Float64Array(s.rocks.map(r=>r[4]))};
s.b.forEach((a,i)=>set(b,i,{handle:a[0],generation:a[1],team:a[4],flags:a[5],x:a[6],y:a[7],vx:a[8],vy:a[9],facing:a[10],radius:a[11],hp:a[12],maxHp:a[13],fluxPercent:a[14],size:a[15],maxSpeed:a[16],maxTurnRate:a[17],acceleration:a[18],deceleration:a[19],shieldRadius:a[25],shieldVoid:a[27],weaponFirst:a[41],weaponCount:a[42]}));
s.w.forEach((a,i)=>set(w,i,{disabled:a[3],ammo:a[4],dps:a[5],flags:a[6],hintMask:a[7],effectiveRange:a[8],speed:a[9],muzzleX:a[10],muzzleY:a[11],relativeX:a[12],relativeY:a[13],angle:a[15]}));
return{abi:1,active:true,valid:true,epoch:1,revision:0,kind:'AI_PLAN',bodyCount:s.b.length,weaponCount:s.w.length,projectileCount:0,beamCount:0,bodies:b,weapons:w,projectiles:columns(projectileKeys,0),beams:columns(beamKeys,0),ai,
teams:s.teams,visibility:new Float64Array(s.visible),rowById:new Map(s.b.map((b,i)=>[name(b[2]),i]))}as unknown as AIStageView;
}
function base():Scene{return{b:[body(1,0,-100,-100,0,3),body(2,0,-150,100,3,2),body(3,0,-300,0,5,1),body(4,1,550,-150,6,2),body(5,1,600,150,8,2),body(6,1,900,0,10,1)],
w:[weapon(1,1,-100,-100,700,140),weapon(1,2,-100,-100,950,90),weapon(1,3,-100,-100,400,30),weapon(2,4,-150,100,650,100),weapon(2,5,-150,100,650,120),weapon(3,6,-300,0,1100,220),weapon(4,7,550,-150,800,140),weapon(4,8,550,-150,500,160),weapon(5,9,600,150,700,130),weapon(5,10,600,150,700,140),weapon(6,11,900,0,1200,190)],
rocks:[],orders:[],teams:[0,1],visible:Array(12).fill(1),own:0,target:3,desired:[80,0],ordered:-1};}

function stage(s:Scene,extra:number[][],shieldKind:number):AIStageView{
  const v=fixtureStage(s),b=v.bodies as unknown as Record<string,Float64Array>,w=v.weapons as unknown as Record<string,Float64Array>,a=v.ai as unknown as Record<string,unknown>;
  a.tacticalPresent=new Float64Array(extra.map(e=>e[0]));a.attachedMotion=new Float64Array(extra.map(e=>e[1]));a.nativeForecast=new Float64Array(extra.map(e=>e[2]));a.doNotBackOff=new Float64Array(extra.map(e=>e[3]));a.systemMode=extra.map(e=>['', 'ASSAULT','EXTRACT','OTHER'][e[4]]||undefined);a.systemActive=new Float64Array(extra.map(e=>e[5]));a.forcesAutofire=new Float64Array(extra.map(e=>e[6]));a.engineState=extra.map(e=>e[7]?'FLAMED_OUT':'RUNNING');
  a.attachmentKey=extra.map(e=>JSON.stringify([e[8]?name(e[8]):undefined,e[9]?'slot-'+e[9]:undefined,e[9]?e[10]:undefined,e[9]?e[11]:undefined,e[9]?e[12]:undefined]));a.shieldThreatHalfArc=new Float64Array(s.b.length).fill(Math.PI/2);a.blockedLaneTarget=new Float64Array(s.w.length).fill(-1);
  s.b.forEach((r,i)=>set(b,i,{assemblyRootRow:i,angularVelocity:0,turnDeceleration:1,shieldX:r[6],shieldY:r[7],shieldType:i===0?shieldKind:1,shieldEfficiency:.8,shieldDamageMultiplier:1,shieldEnergyMultiplier:1,phaseDownDuration:.5,phaseUpDuration:.5,phaseCooldownDuration:2,shieldUnfoldDuration:.5,overloadTimer:.8,ventTime:r[14]*5,systemRecovery:0}));
  s.w.forEach((r,i)=>{const own=s.b.findIndex(b=>b[0]===r[0]);set(w,i,{ownerRow:own,maxSpeed:r[9],baseAngle:s.b[own][10]+r[14],turnRate:r[19],readiness:r[18],burstSize:1,damage:r[5],damageType:2,beamDuration:.8});});return v;
}
type Memory=CapitalShipAI&Record<string,unknown>;
function numberId(id:string|undefined|null):number{return id?Number(id.slice(5)):0;}
const modes=['IDLE','ENGAGE','WITHDRAW','ESCORT','AVOID','DEFEND','WAYPOINT'],defenses=['UP','DOWN','PHASE','VENTING'],positioning=['BASELINE','FIRE_LANE','COVER'];
export async function checkRustAIOwner(source:BufferSource){
  const{instance}=await WebAssembly.instantiate(source),ex=instance.exports as unknown as Exports;let strictFields=0,geometryFields=0,maxGeometryDifference=0,steps=0,heldSteps=0,liveRefreshes=0,ventCalls=0,phaseActivations=0,policySteps=0,policyActivations=0,policyDeactivations=0;
  const geometryLog:{field:string;actual:number;expected:number;difference:number}[]=[],coverage:Record<string,number>={};
  const exact=(a:number,b:number,label:string)=>{strictFields++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);};
  const geometry=(a:number,b:number,label:string)=>{geometryFields++;if(Object.is(a,b))return;const diff=Math.abs(a-b);if(!(diff<=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)))))throw Error(`${label}: geometry ${a} differs from ${b}`);maxGeometryDifference=Math.max(maxGeometryDifference,diff);geometryLog.push({field:label,actual:a,expected:b,difference:diff});};
  const write=(values:number[])=>{const ptr=ex.test_input(values.length);new Float64Array(ex.memory.buffer,ptr,values.length).set(values);};
  const read=()=>{const ptr=ex.test_step();return new Float64Array(ex.memory.buffer,ptr,ex.test_output_words()).slice();};
  const stopAudio=captureCombatAudio(()=>{});
  try{for(let scenario=0;scenario<25;scenario++){
    const flux=new FluxTracker(1000,100,'FRIGATE'),shieldKind=scenario===19?0:scenario>=20&&scenario<=22?3:1,
      shield=new Shield(['NONE','FRONT','OMNI','PHASE'][shieldKind]as'FRONT',180,60,.8,10,n=>flux.increaseFluxClamped(n,true));
    shield.phaseActivationCost=45;shield.phaseUpkeepPerSecond=26;shield.toggleLocked=scenario===23;
    let shieldRequests=0,vents=0,phaseLast=false;const realSet=shield.setActive.bind(shield);shield.setActive=(active:boolean)=>{shieldRequests++;realSet(active);};
    const ships=base().b.map(b=>({id:name(b[0]),teamId:b[4],spec:{collisionRadius:b[11],maxSpeed:b[20]},pos:new Vector2(b[6],b[7]),vel:new Vector2(),isDead:false,isRetreated:false,isDocked:false,retreating:false,hasVastBulk:false,isVisibleTo:()=>true,currentTargetShip:null,fireControlMode:'AI'}as unknown as Ship));
    const ship=ships[0];Object.assign(ship,{shield,flux,hullHp:1000,maxHullHp:1000,aimTargetWorld:new Vector2(),weapons:[],turnInput:0,throttle:0,strafeInput:0,brakeInput:false,tacticalAI:undefined,combatShips:ships,
      clearInput:()=>Object.assign(ship,{turnInput:0,throttle:0,strafeInput:0,brakeInput:false,isFiringMain:false}),canUseShields:()=>scenario!==19&&!flux.isOverloaded&&!flux.isVenting&&shield.type!=='NONE',
      startVenting:()=>{vents++;if(flux.isOverloaded||flux.isVenting||flux.totalFlux<=5||shield.toggleLocked)return false;if(shield.isRaiseRequested&&(shield.type!=='PHASE'||shield.isPhaseUpkeepActive))shield.setActive(false);return flux.startVenting();}});
    const system=new ShipSystem('NONE',1000),defense=new ShipSystem('NONE',1000);Object.assign(ship,{system,systems:[system],defenseSystem:defense,allSystems:[system,defense]});
    const ai=new CapitalShipAI(ship,ships[3]),memory=ai as Memory;
    for(let tick=0;tick<50;tick++){
      const s=base(),multirate=scenario===2||scenario===3&&tick>=15&&tick<35||scenario===18,compact=scenario===4||scenario===18,frame=scenario===5;
      s.b[0][8]=(tick%4)*2;s.b[0][10]=tick*.007;s.b[3][7]+=tick*.43;s.b[4][9]=-tick%5*3;
      s.b[0][37]=numberId(ship.currentTargetShip?.id);s.b[0][38]=s.b[0][37]?1:0;s.b[0][39]=ship.tacticalAI?.fleetTask?tasks.indexOf(ship.tacticalAI.fleetTask):-1;
      let orderKind=-1,ordered=0,pointFlag=0,pointX=0,pointY=0,assignmentMode=scenario===1?1:0;
      if(scenario===6){orderKind=tick<30?0:-1;ordered=5;}if(scenario===7){orderKind=1;ordered=4;}
      if(scenario===8){orderKind=2;pointFlag=1;pointX=900;pointY=200;}if(scenario===9){orderKind=3;ordered=2;}
      if(scenario===10){orderKind=tick<35?4:-1;pointFlag=1;pointX=-200;pointY=-300;}
      if(scenario===11&&tick<10){s.b[0][5]|=2048;ship.fireControlMode='MANUAL';}
      if(scenario===12&&tick>=20&&tick<25){s.b[0][5]|=1;}if(scenario===13&&tick>=20&&tick<25){s.b[0][5]|=4;}if(scenario===14&&tick>=20&&tick<25){s.b[0][5]|=8;}if(scenario===15&&tick>=20&&tick<25){s.b[0][32]=1;}
      if(scenario===16&&tick>=15){s.b[3][5]|=1;}if(scenario===17&&tick>=15){s.visible[6]=0;}
      if(scenario===18){s.b[0][14]=tick<20?.95:.4;s.b[0][36]=tick>=35?2:0;}
      if(scenario===20){for(const w of s.w.filter(w=>w[0]>=4))w[3]=1;s.b[0][14]=.75;}
      if(scenario===21){s.b[0][14]=.98;}if(scenario===22){s.b[3][6]=40;s.b[3][7]=-100;s.b[3][10]=Math.PI;if(tick>25)s.b[0][5]|=64;}
      if(scenario===24){for(let i=3;i<s.b.length;i++)s.b[i][31]=1;assignmentMode=1;}
      flux.softFlux=s.b[0][14]*1000;flux.hardFlux=0;flux.isOverloaded=!!(s.b[0][5]&64);flux.isVenting=!!(s.b[0][5]&128);
      const extra=s.b.map((b,i)=>[i===0?Number(ship.tacticalAI!==undefined):1,Number(scenario===3&&i===0&&tick>=25&&tick<35),Number(compact),b[36],scenario===18&&i===0&&tick>=40?2:scenario===18&&i===0&&tick>=30?1:0,0,Number(scenario===18&&tick>=20),0,0,0,0,0,0]);
      if(scenario===3&&tick>=15){extra[0][8]=2;extra[0][9]=1;extra[0][10]=tick<28?10:15;}
      s.b.forEach((b,i)=>Object.assign(ships[i],{pos:new Vector2(b[6],b[7]),vel:new Vector2(b[8],b[9]),facingRad:b[10],isDead:!!(b[5]&1),isRetreated:!!(b[5]&4),isDocked:!!(b[5]&8),retreating:!!b[32],hasVastBulk:!!b[31],isVisibleTo:(team:number)=>s.visible[i*2+team]!==0}));
      Object.defineProperty(system,'tacticalMode',{configurable:true,value:extra[0][4]?['','ASSAULT','EXTRACT'][extra[0][4]]:undefined});
      for(const w of s.w){const owner=s.b.find(b=>b[0]===w[0])!;w[10]=owner[6]+w[12];w[11]=owner[7]+w[13];w[15]=owner[10]+w[14];}
      const v=stage(s,extra,shieldKind),order=orderKind<0?null:{id:'order-1',type:['ENGAGE','AVOID','DEFEND','ESCORT','WAYPOINT'][orderKind],targetShipId:ordered?name(ordered):undefined,targetPos:pointFlag?new Vector2(pointX,pointY):undefined,issuedTime:0}as TacticalOrder;
      const orders=new Map<string,TacticalOrder>(order?[[ship.id,order]]:[]),fleet=assignmentMode?new Map():solveAIFleet(v,{},orders,new Set(s.b.filter(b=>b[35]).map(b=>name(b[0]))));
      let refreshes=0;const batch={view:v,bridge:{rowOf:new Map(ships.map((s,i)=>[s,i])),ships},fleetPlan:fleet,changed:()=>{},invalidate:()=>{},forward:(_ship:Ship,speed:number,horizon:number)=>solveAIForwardPath(v,0,speed,horizon),
        threat:()=>{refreshes++;const body=v.bodies as unknown as Record<string,Float64Array>;body.ventTime[0]=flux.getTimeToVent();const phase=shield.type==='PHASE',window=1+(phase?shield.phaseChargeUpDuration:0),recovery=2+(phase?shield.phaseChargeDownDuration+shield.phaseCooldownDuration:shield.unfoldDuration);return solveAIThreat(v,0,Math.max(window,flux.getTimeToVent()+recovery),window);}}as unknown as AIBatch;
      const sample=scenario===0||scenario===16,dt=tick===37?.091:1/60;
      write([Number(tick===0),dt,Number(sample),Number(multirate),Number(compact),Number(frame),orderKind,ordered,pointFlag,pointX,pointY,1,0,s.b.length,s.w.length,s.rocks.length,shieldKind,Number(scenario!==19),Number(scenario===23),assignmentMode,...s.b.flat(),...s.w.flat(),...s.rocks.flat(),...extra.flat(),...s.visible]);
      const actual=read();exact(actual[0],0,`scene ${scenario} tick ${tick} admitted`);
      const elapsed=sample?ai.sampleDecision(dt,order,ships,true):dt;let intent:CapitalAIIntent|undefined;const rejected:number[]=[0,0,0];
      if(elapsed!==null){const before=[flux.totalFlux,ship.throttle,shield.isActive,ship.currentTargetShip];intent=ai.planNumeric(elapsed,order,{ships,projectiles:[],beams:[],asteroids:[],multiratePlanning:multirate,compactThreatForecastEligible:compact,weaponThreatFrameEligible:frame},batch);
        exact(flux.totalFlux,before[0]as number,'actual TS planning resource read only');exact(Number(ship.throttle),before[1]as number,'actual TS planning controls read only');exact(Number(shield.isActive),Number(before[2]),'actual TS planning shield read only');
        try{ai.commitEffects(intent);}catch{rejected[0]=1;}ai.commitControls(intent);try{ai.commitControls(intent);}catch{rejected[1]=1;}ai.commitEffects(intent);try{ai.commitEffects(intent);}catch{rejected[2]=1;}}
      const defenseMemory=memory['defense']as{quietFor:number;safeVentFor:number},diag=ship.tacticalAI;
      const expected=[0,Number(elapsed===null),intent?Number(intent.stopped):-1,numberId(intent?.target?.id),intent?.aimX??0,intent?.aimY??0,Number(intent?.holdOffensiveFire??false),intent?.movement.turnInput??0,intent?.movement.throttle??0,intent?.movement.strafeInput??0,Number(intent?.movement.brakeInput??false),
        memory['tacticalRemaining'],memory['multirateRemaining'],memory['forecastRemaining'],Number(memory['forecastFarThreat']),memory['forecastEarliest'],memory['forecastDefenseWindow'],Math.max(0,memory['forecastRosterSize']as number),Number(memory['withdrawing']),Number(memory['attachedMotionLast']),numberId(ai.targetShip?.id),numberId(memory['tacticalTargetId']as string|undefined),memory['tacticalRange'],memory['tacticalBearing'],memory['tacticalFirepower'],memory['tacticalWeapons'],memory['tacticalX'],memory['tacticalY'],memory['tacticalFacing'],Number(memory['tacticalYielding']),memory['tacticalPositioning']?positioning.indexOf(memory['tacticalPositioning']as string):-1,memory['tacticalScoreGain']??NaN,memory['tacticalClearFire']??NaN,memory['decisionRemaining'],memory['decisionElapsed'],numberId(memory['decisionTargetId']as string|undefined),memory['tacticalPhase'],memory['multiratePhase'],defenseMemory.quietFor,defenseMemory.safeVentFor,
        ship.aimTargetWorld.x,ship.aimTargetWorld.y,numberId(ship.currentTargetShip?.id),Number(ship.aiHoldOffensiveFire),ship.defenseFacingRad??NaN,Number(shield.isActive),['IDLE','IN','ACTIVE','OUT','COOLDOWN'].indexOf(shield.phaseState),flux.totalFlux,flux.hardFlux,Number(flux.isVenting),diag?modes.indexOf(diag.mode):-1,diag?.fleetTask?tasks.indexOf(diag.fleetTask):-1,diag?Number(diag.ventSafe):-1,diag?defenses.indexOf(diag.defense):-1,shieldRequests,vents,...rejected];
      const geo=new Set([4,5,7,8,9,22,23,26,27,28,31,40,41,44]);for(let i=0;i<expected.length;i++){const label=`scenario ${scenario} tick ${tick} field ${i}`;if(geo.has(i))geometry(actual[i],expected[i]as number,label);else exact(actual[i],expected[i]as number,label);}
      steps++;heldSteps+=Number(elapsed===null);liveRefreshes+=refreshes;phaseActivations+=Number(shield.isPhaseEngaged&&!phaseLast);phaseLast=shield.isPhaseEngaged;const mode=diag?.mode??'STOPPED';coverage[mode]=(coverage[mode]??0)+1;
      if(scenario===24&&tick===49){const pointer=ex.test_guards(),guards=new Float64Array(ex.memory.buffer,pointer,ex.test_output_words()).slice();const stale=ai.planNumeric(1/60,null,{ships,projectiles:[],beams:[],asteroids:[]},batch),current=ai.planNumeric(1/60,null,{ships,projectiles:[],beams:[],asteroids:[]},batch);let rejected=0;try{ai.commitControls(stale);}catch{rejected=1;}exact(guards[0],rejected,'actual stale sequence rejected');const foreign=new CapitalShipAI(ship,ai.targetShip);rejected=0;try{foreign.commitControls(current);}catch{rejected=1;}exact(guards[1],rejected,'actual foreign owner rejected');exact(guards[2],1,'Rust persistent owner + real host clone continuation');}
    }ventCalls+=vents;}
    const invalid=base();invalid.b[0][5]=16;const extra=invalid.b.map(()=>[1,0,0,0,0,0,0,0,0,0,0,0,0]);write([1,1/60,0,0,0,0,-1,0,0,0,0,1,0,invalid.b.length,invalid.w.length,0,1,1,0,1,...invalid.b.flat(),...invalid.w.flat(),...extra.flat(),...invalid.visible]);exact(read()[0],1,'fighter has independent owner');
    const callbacks=[undefined,burnDrive.advanceAI,advanceJetsAI,(c:SystemAIContext)=>advanceWeaponBoostAI(c,'BALLISTIC'),(c:SystemAIContext)=>advanceWeaponBoostAI(c,'ENERGY'),(c:SystemAIContext)=>advanceWeaponBoostAI(c,'MISSILE'),eclipseProtocol.advanceAI,...adunArkSystems.map(s=>s.advanceAI)];
    for(let kind=0;kind<12;kind++)for(let sample=0;sample<80;sample++){
      const a=[kind,0,1,0,0,0,1,0,20,.5,1,0,1000,0,0,0,200,100,70,0,0,0,0,0,1,0,0,0,1000,1000,0,45,1000,0,1,600,0,0,0,1,0,0,0,0,Infinity,NaN,0,0,100,100,27,-19,0,1000,0,1];
      a[4]=Number(sample%13===0);a[7]=sample%5;a[16]=[0,199,200,449,450,650,651,800,950][sample%9];a[29]=[600,1000,2000,2399,2400][sample%5];a[32]=a[29];a[42]=sample%3;a[54]=Number(sample%2===0);a[55]=Number(sample%7!==0);
      if(sample%17===1)a[2]=0;if(sample%17===2)a[3]=1;if(sample%17===3)a[5]=1;if(sample%17===4)a[11]=1;if(sample%17===5)a[12]=0;if(sample%17===6)a[13]=1;if(sample%17===7)a[14]=1;if(sample%17===8)a[15]=1;
      if(sample%17===9)a[19]=1;if(sample%17===10)a[27]=1;if(sample%17===11)a[27]=32;if(sample%17===12)a[36]=1;if(sample%17===13)a[37]=1;if(sample%17===14)a[38]=1;if(sample%17===15)a[39]=0;if(sample%17===16){a[23]=.7;a[33]=.3;a[41]=100;}
      if(sample%11===1)a[43]=1;if(sample%11===2)a[44]=0;if(sample%11===3)a[46]=.6;if(sample%11===4){a[48]=0;a[49]=0;}if(sample%11===5)a[52]=Math.PI;if(sample%11===6)a[34]=0;if(sample%11===7)a[30]=30;
      write(a);const pointer=ex.test_system(),actual=new Float64Array(ex.memory.buffer,pointer,ex.test_output_words()).slice();let calls=0,deactivations=0;
      const system={available:!!a[2],disabled:!!a[3],isActive:!!a[4],isCoolingDown:!!a[5],definition:{toggle:!!a[6]},state:['IDLE','IN','ACTIVE','OUT','COOLDOWN'][a[7]],fluxCostPerUse:a[8],chargeUpDuration:a[9],chargeDownDuration:a[10],blocksWeapons:false,
        activate:()=>{calls++;if(a[55])system.isActive=true;return!!a[55];},deactivate:()=>{deactivations++;},getWeaponRangePercent:()=>0};
      const type=['BALLISTIC','ENERGY','MISSILE'][a[42]],mount={spec:{weaponType:type,mountSize:'SMALL',range:a[53],damagePerShot:a[48],damagePerSecond:a[49]},isDisabled:!!a[43],ammo:a[44],cooldownTimer:a[46],relativePos:new Vector2(a[50],a[51]),currentAngleRad:a[52]},
        target={isDead:!!(a[27]&1),isPhased:!!(a[27]&32),hullHp:a[28],pos:new Vector2(a[29],a[30]),spec:{collisionRadius:a[31]}},
        owner={system,isDead:!!(a[11]&1),hullHp:a[12],isPhased:!!a[13],flux:{isVenting:!!a[14],isOverloaded:!!a[15],totalFlux:a[16],maxFlux:1000,fluxPercent:a[16]/1000},getFlameoutRatio:()=>a[19],getMotionStats:()=>({deceleration:a[18]}),spec:{maxSpeed:a[17],hullMods:[],builtInHullMods:[],hullSize:'FRIGATE'},ecmRangePenalty:0,pos:new Vector2(a[20],a[21]),facingRad:a[22],turnInput:a[23],throttle:a[24],strafeInput:a[25],brakeInput:!!a[26],weapons:[mount],assemblyShips:[{isDead:false,isDocked:false,isRetreated:false,hullHp:a[54]?60:100,maxHullHp:100}]};
      const context={ship:owner,system,target,distance:a[32],angleDiff:a[33],tactical:{allowOffensiveManeuver:!!a[34],desiredRange:a[35],withdrawing:!!a[36],waypoint:!!a[37],avoidingCollision:!!a[38],forwardClear:!!a[39],quietFor:a[40],threat:{imminentDamage:a[41]}}}as unknown as SystemAIContext;
      if(kind<10)callbacks[kind]?.(context);exact(actual[0],Number(kind>=10),'unknown/special policy rejected');exact(actual[1],calls,`policy ${kind} sample ${sample} activate`);exact(actual[2],deactivations,`policy ${kind} sample ${sample} deactivate`);exact(actual[3],Number(system.isActive),'policy active');policySteps++;policyActivations+=calls;policyDeactivations+=deactivations;
    }
  }finally{stopAudio();}
  return{passed:true,steps,heldSteps,liveRefreshes,ventCalls,phaseActivations,coverage,policySteps,policyActivations,policyDeactivations,strictFields,geometryFields,maxGeometryDifference,geometryLog,rngConsumed:0,productionIntegrated:false,fullBattleReady:false};
}

