import { bodyKeys, weaponKeys, projectileKeys, beamKeys, BodyFlag } from '../../src/engine/ai/batch/StageProtocol';
import { positionVelocity, approachVelocity, regroupVelocity, solveAIAvoidance, solveAIForwardPath, solveAIYield, solveAISteering } from '../../src/engine/ai/batch/AINavigationSolver';
import type { AIStageView } from '../../src/engine/ai/batch/AIInputs';
import { coordinateLength } from '../../src/engine/math/Vector2';
import { cursorTurnCommand } from '../../src/engine/runtime/PlayerControls';
import type { FleetAssignment, FleetRole } from '../../src/engine/ai/FleetTactics';

interface Exports {
  memory:WebAssembly.Memory;
  test_input(n:number):number;
  test_run():number;
  test_output():number;
  test_output_words():number;
}
interface GeometryDifference {scene:number;step:number;field:number;actual:number;expected:number;error:number}
interface CheckResult {passed:true;scenes:number;steps:number;strictFields:number;geometryFields:number;geometryDifferences:number;maximumGeometryError:number;geometryLog:GeometryDifference[];decisionCoverage:Record<string,number>;rejectedCases:number}
const roles:FleetRole[]=['BRAWLER','SKIRMISHER','ARTILLERY','CARRIER','UNARMED','LINE'];
const columns=(keys:readonly string[],count:number):Record<string,Float64Array>=>Object.fromEntries(keys.map(key=>[key,new Float64Array(count)]));
function fixture(scene:number,step:number) {
  const bodies=columns(bodyKeys,5),weapons=columns(weaponKeys,4),ai={
    strafeMultiplier:new Float64Array(5),rawShieldActive:new Float64Array(5),systemLocksTurning:new Float64Array(5),
    blockedLaneTarget:new Float64Array(4).fill(-1),obstacleCount:3,obstacleX:new Float64Array(3),obstacleY:new Float64Array(3),
    obstacleVx:new Float64Array(3),obstacleVy:new Float64Array(3),obstacleRadius:new Float64Array([25,43,15])
  };
  for(let r=0;r<5;r++) {
    bodies.handle[r]=100+r;bodies.generation[r]=1;bodies.assemblyRootRow[r]=r;
    bodies.x[r]=r===0?0:r===1?240:r===2?-220:r===3?80:450;
    bodies.y[r]=r===0?0:r===1?0:r===2?90:r===3?40:-90;
    bodies.vx[r]=r===0?35:r===1?-28:r===2?14:0;bodies.vy[r]=r===0?5:r===2?-7:0;
    bodies.facing[r]=r===0?.15:r===2?.1:Math.PI;bodies.angularVelocity[r]=r===0?.4:0;
    bodies.radius[r]=r===0?35:r===1?55:25;bodies.team[r]=r===0||r===2||r===3?0:1;
    bodies.maxSpeed[r]=120;bodies.acceleration[r]=38;bodies.deceleration[r]=47;bodies.turnDeceleration[r]=.24;
    bodies.shieldType[r]=1;bodies.shieldRadius[r]=bodies.radius[r]+40;ai.strafeMultiplier[r]=.8;
    bodies.weaponFirst[r]=r===0?0:r===1?1:r===2?1:r===3?3:4;bodies.weaponCount[r]=r===0?1:r===2?2:r===3?1:0;
  }
  weapons.relativeX.set([15,20,15,10]);weapons.relativeY.set([3,-6,8,0]);
  const owners=[0,2,2,3];owners.forEach((owner,m)=>weapons.ownerRow[m]=owner);
  ai.blockedLaneTarget[1]=1;ai.blockedLaneTarget[2]=4;ai.blockedLaneTarget[3]=1;
  ai.obstacleX.set([110,300,-90]);ai.obstacleY.set([100,-120,-150]);ai.obstacleVx.set([0,-9,4]);ai.obstacleVy.set([-4,0,3]);
  const t=step/60;
  bodies.x[0]=Math.sin(t)*18;bodies.y[0]=Math.cos(t*.7)*12-12;bodies.facing[0]=.15+t*.03;
  bodies.angularVelocity[0]=Math.sin(t*.8)*.8;bodies.vx[0]=35+Math.sin(t)*20;bodies.vy[0]=Math.cos(t)*8;
  bodies.y[1]=Math.sin(t*.4)*30;bodies.x[1]=240+Math.cos(t*.5)*40;
  const desired={x:85+Math.sin(t*.8)*25,y:Math.cos(t*.7)*22};
  const destination={x:350+Math.sin(t)*70,y:90};const targetVelocity={x:-18,y:4};
  let tolerance=8,range=170,withdrawing=false,role=scene%6,bearing:number|undefined=Math.PI*.75;
  let facing=Math.atan2(bodies.y[1]-bodies.y[0],bodies.x[1]-bodies.x[0])-.4;
  let speed=145,horizon=3,regroupTarget=1;
  if(scene===1){bodies.flags[0]=BodyFlag.PHASED;ai.rawShieldActive.fill(1);}
  if(scene===2){bodies.flags[1]=BodyFlag.DEAD;bodies.flags[4]=BodyFlag.FIGHTER;ai.obstacleY[0]=0;}
  if(scene===3){bodies.assemblyRootRow[1]=0;bodies.flags[3]=BodyFlag.PHASED;ai.rawShieldActive[2]=1;bodies.shieldVoid[2]=1;}
  if(scene===4){ai.rawShieldActive.fill(1);bodies.shieldType[0]=3;bodies.shieldType[1]=3;bodies.shieldVoid[2]=1;}
  if(scene===5){withdrawing=true;bearing=undefined;}
  if(scene===6){bodies.x[1]=bodies.x[0];bodies.y[1]=bodies.y[0];range=0;role=-1;regroupTarget=-1;}
  if(scene===7){destination.x=bodies.x[0];destination.y=bodies.y[0];targetVelocity.x=170;targetVelocity.y=-60;tolerance=60;desired.x=0;desired.y=0;}
  if(scene===8){bodies.x[0]=0;bodies.y[0]=0;bodies.facing[0]=0;bodies.angularVelocity[0]=1.1;facing=.8;desired.x=140;desired.y=0;ai.obstacleY[0]=0;}
  if(scene===9){ai.systemLocksTurning[0]=1;desired.x=-70;desired.y=90;}
  if(scene===10){bodies.flags[0]=BodyFlag.OVERLOADED;ai.blockedLaneTarget.fill(-1);speed=0;horizon=0;}
  if(scene===11){bodies.maxSpeed[0]=15;bodies.acceleration[0]=0;bodies.deceleration[0]=0;ai.strafeMultiplier[0]=0;bodies.turnDeceleration[0]=0;desired.x=30;desired.y=0;}
  if(scene===12){desired.x=.999999999;desired.y=0;facing=bodies.facing[0]+Math.PI/180;}
  if(scene===13){desired.x=1;desired.y=0;bodies.x[1]=2000;range=600;bodies.x[2]=-5000;bodies.x[3]=5000;ai.obstacleX.fill(1e6);}
  if(scene===14){bodies.x[0]=0;bodies.y[0]=0;bodies.facing[2]=0;bodies.x[2]=-200;bodies.y[2]=0;bodies.x[1]=240;bodies.y[1]=0;ai.rawShieldActive[0]=1;bodies.shieldVoid[0]=1;}
  if(scene===15){bodies.flags[1]=step%2?BodyFlag.PHASED:BodyFlag.DEAD;ai.blockedLaneTarget[1]=1;ai.blockedLaneTarget[2]=4;bodies.facing[0]=Math.PI*8+.2;}
  if(scene===16){bodies.x[0]=0;bodies.y[0]=0;destination.x=8;destination.y=0;targetVelocity.x=0;targetVelocity.y=0;desired.x=120;desired.y=-120;role=1;bearing=-Math.PI*.9;}
  if(scene===17){bodies.x[0]=0;bodies.y[0]=0;desired.x=0;desired.y=.1;bodies.vx[0]=90;bodies.vy[0]=-35;ai.obstacleX[0]=80;ai.obstacleY[0]=-20;facing=bodies.facing[0];}
  const view={abi:1,active:true,valid:true,kind:'AI_PLAN',epoch:1,revision:1,bodyCount:5,weaponCount:4,projectileCount:0,beamCount:0,
    bodies,weapons,projectiles:columns(projectileKeys,0),beams:columns(beamKeys,0),ai} as unknown as AIStageView;
  const assignment: FleetAssignment|undefined=role<0?undefined:{targetId:null,role:roles[role],task:'PRESSURE',score:0,pressureRatio:1,assignedPower:0,carrierRange:0,anchorId:null,approachBearing:bearing??null};
  const input=[5,4,3,0,1,2,regroupTarget,destination.x,destination.y,targetVelocity.x,targetVelocity.y,tolerance,range,role,+(bearing!==undefined),bearing??0,desired.x,desired.y,speed,horizon,+withdrawing,facing];
  for(let r=0;r<5;r++)input.push(bodies.handle[r],bodies.generation[r],bodies.handle[bodies.assemblyRootRow[r]],bodies.generation[bodies.assemblyRootRow[r]],
    bodies.x[r],bodies.y[r],bodies.vx[r],bodies.vy[r],bodies.facing[r],bodies.angularVelocity[r],bodies.radius[r],bodies.team[r],bodies.flags[r],
    bodies.maxSpeed[r],bodies.acceleration[r],bodies.deceleration[r],ai.strafeMultiplier[r],bodies.turnDeceleration[r],bodies.shieldType[r],bodies.shieldRadius[r],ai.rawShieldActive[r],bodies.shieldVoid[r],ai.systemLocksTurning[r],bodies.weaponFirst[r],bodies.weaponCount[r]);
  for(let m=0;m<4;m++){const owner=weapons.ownerRow[m],target=ai.blockedLaneTarget[m];input.push(bodies.handle[owner],bodies.generation[owner],weapons.relativeX[m],weapons.relativeY[m],target<0?0:bodies.handle[target],target<0?0:bodies.generation[target]);}
  for(let o=0;o<3;o++)input.push(ai.obstacleX[o],ai.obstacleY[o],ai.obstacleVx[o],ai.obstacleVy[o],ai.obstacleRadius[o]);
  return {input,view,desired,destination,targetVelocity,tolerance,range,withdrawing,assignment,facing,speed,horizon,regroupTarget};
}
function expected(f:ReturnType<typeof fixture>) {
  const v=f.view,b=v.bodies;
  const pos=positionVelocity(v,0,f.destination.x,f.destination.y,f.targetVelocity.x,f.targetVelocity.y,f.tolerance);
  const approach=approachVelocity(v,0,1,f.range,f.withdrawing,f.assignment),regroup=regroupVelocity(v,0,2,f.regroupTarget);
  const avoid=solveAIAvoidance(v,0,f.desired),forward=solveAIForwardPath(v,0,f.speed,f.horizon),yielding=solveAIYield(v,0,f.desired);
  let candidate=0;
  if(avoid.velocity!==f.desired){
    const n=coordinateLength(f.desired.x,f.desired.y),speed=Math.max(n,b.maxSpeed[0]*.5),heading=n>1?Math.atan2(f.desired.y,f.desired.x):b.facing[0];
    const candidates=[{x:f.desired.x*.5,y:f.desired.y*.5},{x:0,y:0},...[30,-30,60,-60,90,-90,135,-135,180].map(angle=>({x:Math.cos(heading+angle*Math.PI/180)*Math.min(speed,b.maxSpeed[0]),y:Math.sin(heading+angle*Math.PI/180)*Math.min(speed,b.maxSpeed[0])}))];
    candidate=candidates.findIndex(c=>Object.is(c.x,avoid.velocity.x)&&Object.is(c.y,avoid.velocity.y))+1;
    if(!candidate)throw Error('unrecognized TS avoidance candidate');
  }
  let lane=-1;
  if(yielding.yielding){
    // Identify the actual first lane via a sequence of prefixes, calling the
    // production solver rather than a copied ray/qualification implementation.
    for(let m=0;m<4;m++){
      const a={...v.ai,blockedLaneTarget:Float64Array.from(v.ai.blockedLaneTarget,(target,index)=>index<=m?target:-1)};
      if(solveAIYield({...v,ai:a},0,f.desired).yielding){lane=m;break;}
    }
  }
  const steering=solveAISteering(v,0,f.desired,f.facing),cursor=cursorTurnCommand(b.facing[0],b.angularVelocity[0],f.facing,b.turnDeceleration[0]);
  return [pos.x,pos.y,approach.x,approach.y,regroup.x,regroup.y,avoid.velocity.x,avoid.velocity.y,+avoid.avoiding,avoid.risk,candidate,+forward,
    yielding.velocity.x,yielding.velocity.y,+yielding.yielding,lane,steering.turnInput,steering.throttle,steering.strafeInput,+steering.brakeInput,cursor];
}
export async function checkRustNavigation(wasm:ArrayBuffer|Uint8Array):Promise<CheckResult> {
  const {instance}=await WebAssembly.instantiate(wasm,{}),core=instance.exports as unknown as Exports;
  let strictFields=0,geometryFields=0,geometryDifferences=0,maximumGeometryError=0;
  const coverage:Record<string,number>={avoidance:0,yielding:0,blockedForward:0,braking:0,turnLeft:0,turnRight:0,candidate0:0};
  // Pre-registered geometry fields include continuous steering dot-product
  // ratios. All digital control/clamp outcomes and decision identities are strict.
  const geometry=new Set([0,1,2,3,4,5,6,7,9,12,13,17,18]);
  const geometryLog:GeometryDifference[]=[];
  const run=(input:number[])=>{const pointer=core.test_input(input.length);new Float64Array(core.memory.buffer,pointer,input.length).set(input);return core.test_run();};
  const steps=240,scenes=18;
  for(let scene=0;scene<scenes;scene++)for(let step=0;step<steps;step++){
    const f=fixture(scene,step),wanted=expected(f),code=run(f.input);
    if(code)throw Error(`Rust rejected valid scene=${scene} step=${step} code=${code}`);
    const actual=new Float64Array(core.memory.buffer,core.test_output(),core.test_output_words()).slice();
    if(actual.length!==wanted.length)throw Error('navigation output width differs');
    for(let field=0;field<actual.length;field++){
      const a=actual[field],e=wanted[field];
      if(geometry.has(field)){
        geometryFields++;
        if(a!==e&&!(Number.isNaN(a)&&Number.isNaN(e))){geometryDifferences++;const error=Math.abs(a-e);maximumGeometryError=Math.max(maximumGeometryError,error);const tolerance=Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(e)));if(!Number.isFinite(a)||!Number.isFinite(e)||!(error<=tolerance))throw Error(`geometry scene=${scene} step=${step} field=${field}: ${a} != ${e}`);geometryLog.push({scene,step,field,actual:a,expected:e,error});}
        if(field===17||field===18){const category=(x:number)=>Number.isNaN(x)?'nan':x===0?'zero':x===-1?'minus-one':x===1?'one':'continuous';strictFields++;if(category(a)!==category(e))throw Error(`steering gate differs scene=${scene} step=${step} field=${field}`);}
      }else{strictFields++;if(a!==e)throw Error(`strict scene=${scene} step=${step} field=${field}: ${a} != ${e}`);}
    }
    coverage.avoidance+=actual[8];coverage.yielding+=actual[14];coverage.blockedForward+=1-actual[11];coverage.braking+=actual[19];coverage.turnLeft+=+(actual[16]<0);coverage.turnRight+=+(actual[16]>0);
    const key=`candidate${actual[10]}`;coverage[key]=(coverage[key]??0)+1;
  }
  const clean=fixture(0,0).input;
  const invalids:((input:number[])=>void)[]=[
    input=>input[22]=0,
    input=>input[22+25]=input[22],
    input=>input[22+14]=-1,
    input=>input[22+25*5+6+5]=2,
    input=>input[22+25*5]=9999,
    input=>input[22+3]=999,
    input=>input[22+25+24]=1,
    input=>input[3]=999,
    input=>input[4]=999,
    input=>input[7]=NaN,
  ];
  let rejectedCases=0;
  for(const [index,mutate] of invalids.entries()){const input=[...clean];mutate(input);if(!run(input))throw Error(`invalid navigation input accepted: ${index}`);rejectedCases++;}
  for(const field of ['avoidance','yielding','blockedForward','braking','turnLeft','turnRight'])if(!coverage[field])throw Error(`missing navigation coverage: ${field}`);
  return {passed:true,scenes,steps:steps*scenes,strictFields,geometryFields,geometryDifferences,maximumGeometryError,geometryLog,decisionCoverage:coverage,rejectedCases};
}
