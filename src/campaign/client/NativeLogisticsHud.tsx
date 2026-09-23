import type {CSSProperties} from 'react';
import type {NativeLogisticsHudView} from '../rules/OriginalNativeLogisticsHud.mjs';
import {NativeBitmapText} from '../../ui/NativeBitmapText';
import {runtimeAssetUrl} from '../../engine/runtime/RuntimePaths';
import {hudCapacity,hudInteger,hudSupplies,hudSupplyRate} from './LogisticsHudModel.mjs';
import './LogisticsHud.css';
import './NativeLogisticsHud.css';
import {NativeBurnHud} from './NativeBurnHud';
const fleetIcon=(name:string)=>'ui/icons/fleettab/'+name+'.png';
function Icon({file}:{file:string}){return <span className="logistics-icon" aria-hidden="true" style={{maskImage:'url("'+runtimeAssetUrl('graphics/'+file)+'")'}}/>;}
function Text({children}:{children:string}){return <NativeBitmapText font="body" color="currentColor">{children}</NativeBitmapText>;}
function Meter({name,className,icon,value,capacity,text,maximum}:{name:string;className:string;icon:string;value:number|null;capacity:number|null;text?:string;maximum?:number|null}){
 const bar=hudCapacity(value,capacity),label=text??bar.text,style={'--fill':bar.fill*100+'%','--excess':bar.excess*100+'%'} as CSSProperties;
 return <div className={'logistics-capacity '+className} data-known={bar.known} data-overloaded={bar.overloaded} title={name+' '+label}>
  <Icon file={fleetIcon(icon)}/><span className="logistics-meter" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={bar.known?Math.max(value!,capacity!):undefined} aria-valuenow={bar.known?value!:undefined} aria-valuetext={label} style={style}>
   <span className="logistics-track" aria-hidden="true"><i className="logistics-fill"/><i className="logistics-excess"/></span>{maximum!==undefined&&maximum!==null&&<i className="native-logistics-cr-max" style={{left:Math.max(0,Math.min(100,maximum))+'%'}} title={'最高战备 '+hudInteger(maximum,true)+'%'}/>}<b><Text>{label}</Text></b>
  </span>
 </div>;
}
/** Committed private fleet readout. This is not the legacy estimated-logistics protocol. */
export function NativeLogisticsHud({view,expanded,revision,dataRef}:{view:NativeLogisticsHudView;expanded:boolean;revision:number;dataRef:string}){
 const suppliesText=view.supplies!==null&&view.supplies<=0?'补给不足':hudSupplies(view.supplies??undefined);
 const credits=view.credits===null?'—':view.credits.toLocaleString('en-US'),repair=view.repairing===false?'---':view.repairing===null||view.repairDays===null?'—':view.repairDays+' 天';
 // Misc.getFormat uses DecimalFormat's default HALF_EVEN, not Math.round.
 const grouped=(n:number|null)=>{if(n===null)return '—';const floor=Math.floor(n),fraction=n-floor;return (fraction===.5?(floor%2===0?floor:floor+1):Math.round(n)).toLocaleString('en-US');};
 return <section className="campaign-logistics native-logistics-readout" aria-label="舰队后勤" data-expanded={expanded} data-hud-revision={revision} data-fleet-ref={dataRef} data-missing={view.missing.join(',')}>
  <div className="logistics-row logistics-credits" aria-label={'星币 '+credits}><Icon file={fleetIcon('credits_24x24')}/><b><NativeBitmapText font="credits" color="currentColor">{credits}</NativeBitmapText></b></div>
  <div className="logistics-row campaign-supplies" data-shortage={view.supplies!==null&&view.supplies<=0} aria-label={'补给 '+suppliesText}><Icon file={fleetIcon('supplies_24x24')}/><b><Text>{suppliesText}</Text></b><small><Text>{hudSupplyRate(view.suppliesPerDay,view.supplies!==null&&view.supplies<=0?0:view.supplies??undefined)}</Text></small></div>
  <div className="logistics-row logistics-crew" aria-label={'船员 '+hudInteger(view.crew)+' / '+hudInteger(view.minimumCrew)}><Icon file={fleetIcon('crew_24x')}/><b><Text>{hudInteger(view.crew)+' / '+hudInteger(view.minimumCrew)}</Text></b></div>
  <div className="logistics-row logistics-marines" aria-label={'陆战队 '+hudInteger(view.marines)}><Icon file={fleetIcon('marines_24x24')}/><b><Text>{hudInteger(view.marines)}</Text></b></div>
  <Meter name="货舱" className="logistics-cargo" icon="cargo_24x16" value={view.cargoUsed} capacity={view.cargoCapacity}/>
  <Meter name="人员" className="logistics-personnel" icon="personnel_24x16" value={view.personnelUsed} capacity={view.personnelCapacity}/>
  <Meter name="燃料" className="logistics-fuel" icon="fuel_24x16" value={view.fuel} capacity={view.fuelCapacity}/>
  <NativeBurnHud key={dataRef} view={view}/>
  <Meter name="战备" className="logistics-readiness" icon="cr24x16" value={view.readiness} capacity={100} maximum={view.maximumReadiness} text={view.readiness===null?'—':hudInteger(view.readiness,true)+'%'}/>
  <div className="logistics-row logistics-sensors" aria-label={'传感器强度 '+grouped(view.sensorStrength)}><Icon file="icons/campaign/sensor_strength.png"/><Text>{grouped(view.sensorStrength)}</Text></div>
  <div className="logistics-row logistics-hull" aria-label={'修复比例 '+(view.repairedness===null?'—':view.repairedness+'%')} title="船体和装甲的原版加权修复比例"><Icon file={fleetIcon('hull24x')}/><Text>{view.repairedness===null?'—':view.repairedness+'%'}</Text></div>
  <div className="logistics-row logistics-repair" aria-label={'修理剩余时间 '+repair}><Icon file={fleetIcon('repair_rate_24x24')}/><Text>{repair}</Text></div>
  <div className="logistics-row logistics-profile" aria-label={'传感器轮廓 '+grouped(view.sensorProfile)}><Icon file="icons/campaign/sensor_profile.png"/><Text>{grouped(view.sensorProfile)}</Text></div>
 </section>;
}
