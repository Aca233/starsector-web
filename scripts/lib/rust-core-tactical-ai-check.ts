import {solveAIHostile}from'../../src/engine/ai/batch/AITargetSolver';
import {solveAIProfile}from'../../src/engine/ai/batch/AIProfileSolver';
import {solveAIFleet}from'../../src/engine/ai/batch/AIFleetSolver';
import {solveAIPosition}from'../../src/engine/ai/batch/AIPositionSolver';
import{bodyKeys,weaponKeys,projectileKeys,beamKeys}from'../../src/engine/ai/batch/StageProtocol';
import type{AIStageView}from'../../src/engine/ai/batch/AIInputs';
import type{TacticalOrder}from'../../src/engine/simulation/CombatTypes';
interface Exports{memory:WebAssembly.Memory;test_input:(n:number)=>number;test_solve:()=>number;test_output_words:()=>number}
interface Scene{b:number[][];w:number[][];rocks:number[][];orders:number[][];teams:number[];visible:number[];own:number;target:number;desired:[number,number];ordered:number}
const roles=['LINE','BRAWLER','ARTILLERY','SKIRMISHER','CARRIER','UNARMED'],tasks=['PRESSURE','FINISH','SCREEN','SUPPORT','REGROUP','DISENGAGE','SEARCH'];
const name=(id:number)=>'ship-'+String(id).padStart(3,'0');
const body=(id:number,team:number,x:number,y:number,first:number,count:number):number[]=>[id,1,id,id,team,0,x,y,0,0,team?Math.PI:0,45,1000,1000,.2,2,100,1,60,70,100,150,0,0,1,60,1,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,first,count,0];
const weapon=(owner:number,slot:number,x:number,y:number,range:number,power:number):number[]=>[owner,1,slot,0,Infinity,power,0,0,range,400,x,y,0,0,0,0,Math.PI/2,0,.1,1,0];
function columns(keys:readonly string[],count:number):Record<string,Float64Array>{return Object.fromEntries(keys.map(k=>[k,new Float64Array(count)]));}
function set(c:Record<string,Float64Array>,r:number,values:Record<string,number>):void{for(const[k,v]of Object.entries(values))c[k][r]=v;}
function stage(s:Scene):AIStageView{
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
export async function checkRustTacticalAI(source:BufferSource){
const{instance}=await WebAssembly.instantiate(source),exports=instance.exports as unknown as Exports;let strictFields=0,geometryFields=0,maxGeometryDifference=0,scenes=0,assignmentsChecked=0,positionAdjustments=0,coverChoices=0,laneChoices=0;
const geometryLog:{field:string;actual:number;expected:number;difference:number}[]=[];
const roleCoverage:Record<string,number>={},taskCoverage:Record<string,number>={},candidateCoverage:Record<string,number>={};
const exact=(a:number,b:number,label:string)=>{strictFields++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);};
const geometry=(a:number,b:number,label:string)=>{geometryFields++;if(Object.is(a,b))return;const difference=Math.abs(a-b);if(!(difference<=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)))))throw Error(`${label}: ${a} differs from ${b}`);maxGeometryDifference=Math.max(maxGeometryDifference,difference);geometryLog.push({field:label,actual:a,expected:b,difference});};
const write=(s:Scene)=>{const input=[s.b.length,s.w.length,s.rocks.length,s.orders.length,s.teams.length,s.own,s.target,...s.desired,s.ordered,0,0,...s.b.flat(),...s.w.flat(),...s.rocks.flat(),...s.orders.flat(),...s.teams,...s.visible];const pointer=exports.test_input(input.length);new Float64Array(exports.memory.buffer,pointer,input.length).set(input);};
const read=()=>{const pointer=exports.test_solve();return new Float64Array(exports.memory.buffer,pointer,exports.test_output_words()).slice();};
for(let scenario=0;scenario<30;scenario++)for(let tick=0;tick<40;tick++){
const s=base();s.b[0][8]=tick%4*2;s.b[0][10]=tick*.006;s.b[1][7]+=tick*.17;s.b[3][8]=tick%3*7;s.b[4][9]=-tick%5*3;
if(scenario===1){s.b[0][37]=5;s.b[0][38]=1;}if(scenario===2){s.ordered=4;}if(scenario===3){s.b[3][31]=1;}if(scenario===4){s.visible[6]=0;}if(scenario===5){s.b[3][5]=16;s.b[3][15]=0;}
if(scenario===6){s.b[4][5]=1;}if(scenario===7){s.b[0][35]=1;s.b[0][5]|=2048;}if(scenario===8){s.orders.push([1,1,0,5,1,0,0,0,0]);}if(scenario===9){s.orders.push([1,1,2,0,0,1,550,150,0]);}
if(scenario===10){s.orders.push([1,1,3,2,1,0,0,0,0]);}if(scenario===11){s.b[0][22]=600;s.b[0][23]=1800;}if(scenario===12){for(const w of s.w.filter(w=>w[0]===1))w[3]=1;}
if(scenario===13){s.b[0][12]=200;s.b[0][14]=.85;s.b[0][39]=4;s.w[8][5]=1000;s.w[9][5]=900;}if(scenario===14){s.b[3][5]=64;s.b[4][14]=.9;}
if(scenario===15){for(const w of s.w.filter(w=>w[0]===1))w[6]=2;}if(scenario===16){for(const w of s.w.filter(w=>w[0]===1))w[6]=32;}
if(scenario===17){s.b[1][6]=200;s.b[1][7]=-100;s.rocks.push([150,-100,0,0,65]);}if(scenario===18){s.b[0][5]=32;}if(scenario===19){s.b[0][40]=tick%4;}
if(scenario===20){s.b[0][14]=.95;s.b[0][36]=1;s.b[1][27]=1;}if(scenario===21){s.b[0][34]=1;s.orders.push([0,0,1,4,1,0,0,0,0]);}
if(scenario===22){s.b[1][6]=-1000;s.b[1][7]=1000;s.b[2][6]=-1000;s.b[2][7]=-1000;s.b[4][6]=150;s.b[4][7]=400;s.b[4][10]=-Math.PI/2;s.b[5][6]=1400;s.b[5][7]=900;
  for(const w of s.w.filter(w=>w[0]===5)){w[5]=1000;w[8]=700;w[16]=.1;}}
if(scenario===23){s.b[0][16]=160;}if(scenario===24){for(let i=3;i<s.b.length;i++)s.b[i][5]=1;}
if(scenario===25){s.b[0][37]=4;s.b[0][38]=1;s.b[3][5]=4;}
if(scenario===26){s.w[0][6]=8;s.w[0][12]=27;s.w[0][13]=-19;s.w[0][14]=.32;s.w[1][17]=1;s.w[1][14]=-.47;s.w[1][12]=-33;}
if(scenario===27){s.b[0][12]=100;s.b[0][14]=.95;s.b[0][39]=5;for(let i=1;i<3;i++)s.b[i][32]=1;for(const w of s.w.filter(w=>w[0]>=4))w[5]=1500;}
if(scenario===28){for(let i=3;i<s.b.length;i++){s.b[i][31]=1;}}
if(scenario===29){s.b[3][6]=600;s.b[3][7]=0;s.b[4][6]=600;s.b[4][7]=0;s.b[3][8]=0;s.b[4][9]=0;s.b[0][6]=0;s.b[0][7]=0;}
s.w[2][6]=2;
for(const w of s.w){const owner=s.b.find(b=>b[0]===w[0])!;w[10]=owner[6]+w[12];w[11]=owner[7]+w[13];w[15]=owner[10]+w[14];}
write(s);const actual=read(),v=stage(s),orders=new Map<string,TacticalOrder>(s.orders.map(o=>[o[0]?name(o[0]):'fleet',{type:['ENGAGE','AVOID','DEFEND','ESCORT','WAYPOINT'][o[2]],targetShipId:o[3]?name(o[3]):undefined,targetPos:o[5]?{x:o[6],y:o[7]}:undefined}as TacticalOrder]));
const manual=new Set(s.b.filter(b=>b[35]).map(b=>name(b[0]))),fleet=solveAIFleet(v,{},orders,manual),profile=solveAIProfile(v,s.own,s.target,fleet.get(name(s.b[s.own][0]))),position=solveAIPosition(v,s.own,s.target,{x:s.desired[0],y:s.desired[1]},profile,fleet),hostile=solveAIHostile(v,s.own,s.ordered>=0?name(s.b[s.ordered][0]):undefined);
const label=`scenario ${scenario} tick ${tick}`;exact(actual[0],0,label+' admitted');exact(actual[1],hostile<0?0:s.b[hostile][0],label+' hostile');exact(actual[2],hostile<0?0:1,label+' hostile generation');
geometry(actual[3],profile.range,label+' profile range');geometry(actual[4],profile.relativeBearing,label+' profile bearing');exact(actual[5],profile.firepower,label+' power');exact(actual[6],profile.weapons,label+' battery count');
geometry(actual[7],position.velocity.x,label+' position vx');geometry(actual[8],position.velocity.y,label+' position vy');exact(actual[9],Number(position.adjusted),label+' adjusted');geometry(actual[10],position.scoreGain,label+' score gain');exact(actual[11],position.clearFire,label+' clear fire');exact(actual[12],['BASELINE','FIRE_LANE','COVER'].indexOf(position.reason),label+' position reason');
exact(actual[13],(position as typeof position&{candidate?:number}).candidate??0,label+' actual selected candidate identity');
const candidate=String(actual[13]);candidateCoverage[candidate]=(candidateCoverage[candidate]??0)+1;
positionAdjustments+=Number(position.adjusted);coverChoices+=Number(position.reason==='COVER');laneChoices+=Number(position.reason==='FIRE_LANE');exact(actual[14],fleet.size,label+' fleet count');let cursor=15;
for(const[id,p]of fleet){exact(actual[cursor],Number(id.slice(5)),label+' actor');exact(actual[cursor+1],1,label+' actor generation');exact(actual[cursor+2],p.targetId?Number(p.targetId.slice(5)):0,label+' fleet target');exact(actual[cursor+3],p.targetId?1:0,label+' target generation');exact(actual[cursor+4],roles.indexOf(p.role),label+' role');exact(actual[cursor+5],tasks.indexOf(p.task),label+' task');
roleCoverage[p.role]=(roleCoverage[p.role]??0)+1;taskCoverage[p.task]=(taskCoverage[p.task]??0)+1;
geometry(actual[cursor+6],p.score,label+' fleet score');geometry(actual[cursor+7],p.pressureRatio,label+' fleet pressure');exact(actual[cursor+8],p.assignedPower,label+' assigned power');exact(actual[cursor+9],p.carrierRange,label+' carrier range');exact(actual[cursor+10],p.anchorId?Number(p.anchorId.slice(5)):0,label+' anchor');exact(actual[cursor+11],p.anchorId?1:0,label+' anchor generation');geometry(actual[cursor+12],p.approachBearing??NaN,label+' lane bearing');cursor+=13;assignmentsChecked++;}scenes++;
}
const rejected=(mutate:(s:Scene)=>void)=>{const s=base();mutate(s);write(s);exact(read()[0],1,'invalid world rejected');};
for(const mutation of[(s:Scene)=>{s.b[0][0]=0;},(s:Scene)=>{s.b[1][0]=1;},(s:Scene)=>{s.visible=[];},(s:Scene)=>{s.w[0][1]=2;},(s:Scene)=>{s.b[1][41]=1;},(s:Scene)=>{s.b[1][18]=NaN;},(s:Scene)=>{s.b[0][37]=2;s.b[0][38]=2;}])rejected(mutation);
return{passed:true,scenes,assignmentsChecked,positionAdjustments,coverChoices,laneChoices,roleCoverage,taskCoverage,candidateCoverage,rejectedObservations:7,strictFields,geometryFields,maxGeometryDifference,geometryLog,rngConsumed:0,productionIntegrated:false};
}
