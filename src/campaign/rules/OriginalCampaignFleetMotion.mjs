/** CampaignFleet.advance's counts -> goSlow -> movement/facing phase, not a whole world frame. */
import R from '../data/reference-fleet-construction.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {synchronizeOriginalFleet,originalFleetMinBurnLevel,updateOriginalFleetTravelSpeed} from './OriginalFleetData.mjs';
import {updateOriginalNativeFleetCounts} from './OriginalNativeFleetCounts.mjs';
import {originalNativeFleetDynamicMod} from './OriginalNativeFleetStats.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {advanceOriginalSmoothMovement,advanceOriginalSmoothFacing,getOriginalMovementFacing} from './OriginalMovement.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_MOTION',m);
const scalar=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Actual finite '+label+' required');return f(n);};
const lengthSquared=v=>f(f(v[0]*v[0])+f(v[1]*v[1])),length=v=>f(Math.sqrt(lengthSquared(v)));
const scale=(v,n)=>{v[0]=f(v[0]*n);v[1]=f(v[1]*n);return v;};
const opposite=v=>{const out=[-v[0],-v[1]];return lengthSquared(out)>2**-149?scale(out,f(1/length(out))):out;};
const javaInt=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const round=n=>javaInt(Math.floor(n+0.5));
function state(fleet){check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed world fleet required');return fleet.campaign;}
function travelSpeed(fleet,services){synchronizeOriginalFleet(fleet,services);return updateOriginalFleetTravelSpeed(fleet);}
export function setOriginalConstructedFleetDestination(fleet,x,y,override=false){
 const c=state(fleet);check(typeof override==='boolean','Explicit target override flag required');
 if(c.moveOverride&&!override)return;
 c.moveDestination=[scalar(x,'destination x'),scalar(y,'destination y')];if(override)c.moveOverride=true;
}
/** A null destination getter returns a copy of location, not a new travel order. */
export function getOriginalConstructedFleetDestination(fleet){const c=state(fleet);return c.moveDestination??[...c.entity.position];}
export function setOriginalConstructedFleetDesiredFacing(fleet,angle){state(fleet).desiredFacing=scalar(angle,'desired facing');}
/** No-argument and boolean overloads differ: no-argument preserves an already set stop request. */
export function requestOriginalConstructedFleetGoSlow(fleet,stop){
 const c=state(fleet);if(stop!==undefined)check(typeof stop==='boolean','Actual stop request required');c.flags.goSlowOneFrame=true;
 if(stop!==undefined)c.flags.goSlowStop=stop?true:null;
}
export function originalConstructedFleetGoSlowBurn(fleet,services={}){
 state(fleet);const bonus=effective({base:0,modifiers:originalNativeFleetDynamicMod(fleet.stats,'move_slow_speed_bonus_mod')});
 synchronizeOriginalFleet(fleet,services);
 return javaInt(f(f(round(f(originalFleetMinBurnLevel(fleet)*f(R.motionSettings.sneakBurnMult))))+bonus));
}
/** Source uses last frame's acceleration and leaves hard limits untouched in the high-overspeed branch. */
export function applyOriginalConstructedFleetGoSlow(fleet,seconds,{isFastForwardIteration},services={}){
 const c=state(fleet),dt=scalar(seconds,'frame seconds');check(typeof isFastForwardIteration==='boolean','Actual fast-forward iteration state required');if(dt<=0)return;
 const flags=c.flags,m=c.movement;
 if(!isFastForwardIteration&&flags.wasSlowMoving===true&&flags.goSlowOneFrame!==true){setOriginalConstructedFleetDestination(fleet,...c.entity.position);flags.wasSlowMoving=null;m.hardSpeedLimit=-1;}
 if(flags.goSlowOneFrame!==true)return;
 flags.goSlowOneFrame=null;flags.wasSlowMoving=true;const stop=flags.goSlowStop===true;flags.goSlowStop=null;
 let limit=f(f(R.motionSettings.baseTravelSpeed)+f(f(originalConstructedFleetGoSlowBurn(fleet,services))*f(R.motionSettings.speedPerBurnLevel)));if(stop)limit=0;
 const velocity=m.velocity,speed=length(velocity),direction=opposite(velocity),acceleration=f(m.acceleration*1),excess=f(speed-limit);
 if(excess>f(acceleration*f(.1))){scale(direction,10000);setOriginalConstructedFleetDestination(fleet,f(direction[0]+c.entity.position[0]),f(direction[1]+c.entity.position[1]));}
 else if(excess>0){
  if(stop)setOriginalConstructedFleetDestination(fleet,...c.entity.position);
  const brake=opposite(velocity);let deceleration=f(acceleration*1);if(f(deceleration*dt)>f(speed-limit)&&dt>0)deceleration=f(f(speed-limit)/dt);if(deceleration<0)deceleration=0;
  scale(brake,deceleration);velocity[0]=f(velocity[0]+f(brake[0]*dt));velocity[1]=f(velocity[1]+f(brake[1]*dt));m.hardSpeedLimit=Math.max(limit,length(velocity));
 }
}
/** Explicit subphase; callers must not substitute this for AI, BaseEntity, logistics, accidents or view advance. */
export function advanceOriginalConstructedFleetMotion(fleet,seconds,context,services={}){
 const c=state(fleet),dt=scalar(seconds,'frame seconds');check(typeof context?.isFastForwardIteration==='boolean','Actual fast-forward iteration state required');
 synchronizeOriginalFleet(fleet,services);updateOriginalNativeFleetCounts(fleet);
 applyOriginalConstructedFleetGoSlow(fleet,dt,context,services);
 let moved=false;
 if(c.moveDestination!==null||c.flags.fadeAndExpire!==null){
  if(c.flags.fadeAndExpire!==null)c.moveDestination=[...c.entity.position];
  const speed=travelSpeed(fleet,services);c.movement.acceleration=Math.max(10,f(speed*effective(fleet.stats.accelerationMult)));c.movement.maxSpeed=speed;
  advanceOriginalSmoothMovement(c.movement,c.moveDestination,[0,0],dt,{travelSpeedOf:ref=>{check(ref===fleet.objectRef,'Lost movement delegate');return travelSpeed(fleet,services);},fleetTravelSpeed:()=>travelSpeed(fleet,services)});
  c.moveOverride=false;
  for(let i=0;i<2;i++){c.entity.position[i]=c.movement.position[i];c.entity.velocity[i]=c.movement.velocity[i];}
  if(fleet.battle===null){const currentSpeed=length(c.entity.velocity),distance=length(c.moveDestination.map((n,i)=>f(n-c.movement.position[i])));if(currentSpeed>3&&distance>10)c.desiredFacing=getOriginalMovementFacing(c.entity.velocity);}
  c.facing.turnAcceleration=1040;c.facing.maxTurnRate=720;advanceOriginalSmoothFacing(c.facing,c.desiredFacing,dt);fleet.facing=c.facing.facing;moved=true;
 }
 return {scope:'native-fleet-counts-and-motion-phase',moved,readyForAuthority:false};
}
