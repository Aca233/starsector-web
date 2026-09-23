import {isOriginalCampaignPlanet} from './OriginalCampaignPlanet.mjs';
import {isOriginalCargoPods} from './OriginalCargoPods.mjs';
/** Native orbit objects, retaining actual entity/focus identity and repository-order updates. */
import {requireThat} from '../core/Values.mjs';
import {setOriginalConstructedFleetLocation,setOriginalConstructedFleetFacing} from './OriginalCampaignFleet.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_LOCATION_ORBIT',m),normal=n=>f(f(f(n%360)+360)%360);
const number=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native orbit scalar required');return f(n);};
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual native orbit service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','Synchronous orbit service required');return v;};
export function originalLocationEntityState(object,services={}){const state=object?.campaign?.scope==='native-constructed-campaign-fleet'?object.campaign.entity:(isOriginalCargoPods(object)||isOriginalCampaignPlanet(object))?object.entity:call(services,'readLocationEntityState',object);check(state&&Array.isArray(state.position)&&state.position.length===2,'Actual entity position required');return state;}
export function validateOriginalLocationOrbit(orbit){check(orbit?.scope==='native-current-location-orbit'&&['circular','point-down','spin'].includes(orbit.kind)&&orbit.entity&&orbit.focus,'Actual native orbit identities required');for(const k of ['radius','orbitalPeriod','currAngle'])check(number(orbit[k])===orbit[k],'Non-native orbit float');if(orbit.kind==='spin')for(const k of ['currFacing','spinVel'])check(number(orbit[k])===orbit[k],'Non-native spin float');return orbit;}
function writeLocation(orbit,angle,services){const entity=originalLocationEntityState(orbit.entity,services),focus=originalLocationEntityState(orbit.focus,services),r=f(angle*f(f(Math.PI)/180));entity.position[0]=number(f(focus.position[0]+f(f(Math.cos(r))*orbit.radius)));entity.position[1]=number(f(focus.position[1]+f(f(Math.sin(r))*orbit.radius)));return entity;}
/** Explicit-angle constructor: no fabricated random constructor history. */
export function createOriginalLocationOrbit(entity,focus,{kind='circular',radius,orbitalPeriod=365,currAngle,currFacing,spinVel},services={}){const orbit={scope:'native-current-location-orbit',kind,entity,focus,radius:number(radius),orbitalPeriod:number(orbitalPeriod),currAngle:number(currAngle),...(kind==='spin'?{currFacing:number(currFacing),spinVel:number(spinVel)}:{})};validateOriginalLocationOrbit(orbit);writeLocation(orbit,orbit.currAngle,services);return orbit;}
export function advanceOriginalLocationOrbit(orbit,seconds,days,services={}){
 if(orbit?.scope!=='native-current-location-orbit')return call(services,'advanceCustomLocationOrbit',orbit,seconds);validateOriginalLocationOrbit(orbit);number(seconds);days=number(days);
 if(orbit.kind==='circular'&&orbit.radius<=0){orbit.currAngle=0;writeLocation(orbit,0,services);return;}
 const circumference=f(f(f(Math.PI)*2)*orbit.radius),speed=f(circumference/orbit.orbitalPeriod),angularSpeed=f(360/f(circumference/speed)),angle=number(f(orbit.currAngle-f(angularSpeed*days))),entity=writeLocation(orbit,angle,services);
 if(orbit.entity?.campaign?.scope==='native-constructed-campaign-fleet')setOriginalConstructedFleetLocation(orbit.entity,...entity.position);
 orbit.currAngle=normal(angle);if(orbit.kind!=='circular'){let facing=orbit.currAngle;if(orbit.kind==='spin'){orbit.currFacing=normal(f(orbit.currFacing+f(orbit.spinVel*days)));facing=orbit.currFacing;}if(orbit.entity?.campaign?.scope==='native-constructed-campaign-fleet')setOriginalConstructedFleetFacing(orbit.entity,facing);else if(isOriginalCampaignPlanet(orbit.entity))entity.facing=facing;else call(services,'setLocationEntityFacing',orbit.entity,facing);}
}
