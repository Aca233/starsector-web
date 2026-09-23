/** Native route fleet getter closure only; reading visibility never invokes FleetData.sync. */
import {captureFleetStats} from './campaign-native-fleet-sync.mjs';
import {createOriginalNativeFleetCounts} from '../../src/campaign/rules/OriginalNativeFleetCounts.mjs';
import {parseFactionText} from '../import-campaign-factions.mjs';
const check=(v,m)=>{if(!v)throw Error('NATIVE_SENSORS: '+m);};
export function captureNativeFleetSensors(g,r,space,playerCapture){
 const unresolved=[],fleets=[],scalar=(n,k)=>r.attr(n,k)??r.value(n,k);
 const nullableFloat=(n,k)=>{const text=scalar(n,k);if(text===null)return null;const value=Math.fround(Number(text));check(text!==''&&Number.isFinite(value),'Invalid sensor float');return value;};
 for(const entity of space.entities.filter(e=>e.fleet)){
  const node=g.objects.get(entity.objectRef);check(node,'Missing native sensor fleet object');
  const tags=r.members(g.child(node,'tags')).map(n=>{check(!n.children.length,'Unsupported entity tag');return n.text.trim();});
  const text=r.value(node,'j0'),data=text===null?{}:parseFactionText(text,'BaseCampaignEntity.j0');check(data&&typeof data==='object'&&!Array.isArray(data)&&(!Object.hasOwn(data,'f5')||typeof data.f5==='boolean'),'Invalid sensor transponder encoding');
  const player=entity.objectRef===space.playerFleetRef?playerCapture?.state?.fleet:null;
  const fleet=player?.nativeSyncScope==='native-fleet-data-sync-inputs'?{objectRef:player.objectRef,sensorStrength:player.sensorStrength,sensorProfile:player.sensorProfile,transponderOn:player.transponderOn,stats:player.stats,counts:player.counts}:
   {objectRef:entity.objectRef,sensorStrength:nullableFloat(node,'sS'),sensorProfile:nullableFloat(node,'sP'),transponderOn:data.f5??false,stats:captureFleetStats(g,r,g.child(node,'s')),counts:createOriginalNativeFleetCounts()};
  if(entity.objectRef===space.playerFleetRef&&!player)unresolved.push('missing-player-sensor-fleet');
  if(fleet.stats===null)unresolved.push('missing-fleet-sensor-stats');
  fleets.push({objectRef:entity.objectRef,tags,extendedDetectedAtRange:nullableFloat(node,'eDAR'),fleet});
 }
 // CampaignEngine.readResolve defaults a missing/null difficulty to normal. The process debug switch is not saved.
 const difficulty=scalar(g.root,'difficulty')??'normal';
 return {scope:'native-route-fleet-sensors',schemaVersion:1,sensorsOn:true,difficulty,fleets,unresolved:[...new Set(unresolved)]};
}
