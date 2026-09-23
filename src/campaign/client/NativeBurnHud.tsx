import {useEffect,useRef,useState} from 'react';
import {NativeBitmapText} from '../../ui/NativeBitmapText';
import type {NativeLogisticsHudView} from '../rules/OriginalNativeLogisticsHud.mjs';
import {hudBurnSample,hudRoundedValue,type HudBurnHistory} from './LogisticsHudModel.mjs';
function useBurnLevel(level:number|null){
 const history=useRef<HudBurnHistory>({samples:[],level:-1}),[shown,setShown]=useState(level);
 useEffect(()=>{
  if(level===null){history.current={samples:[],level:-1};return;}
  let handle=0,remaining=10;const advance=()=>{history.current=hudBurnSample(history.current,level);setShown(history.current.level);if(--remaining>0)handle=requestAnimationFrame(advance);};
  handle=requestAnimationFrame(advance);return ()=>cancelAnimationFrame(handle);
 },[level]);
 return level===null?null:shown;
}
/** Original twenty 8px slanted indicators, with independent level/limit/modifier states. */
export function NativeBurnHud({view}:{view:NativeLogisticsHudView}){
 const level=useBurnLevel(view.currentBurn),limits=view.burnLimits,text=level===null?'—':String(level),maximum=limits===null?'—':String(limits.maximum);
 const fuel=view.fuelUse,fuelText=fuel===null?'—':fuel.status==='empty'?'没有燃料':fuel.status==='not-used'?'---':'-'+hudRoundedValue(fuel.perDay)+' / 天';
 return <>
  <div className="native-logistics-fuel-use" aria-label={'燃料日耗 '+fuelText}><NativeBitmapText font="body" color="currentColor">{fuelText}</NativeBitmapText></div>
  <div className="logistics-burn native-logistics-burn" role="meter" aria-label="当前航速" aria-valuemin={0} aria-valuemax={Math.max(20,level??0,limits?.maximum??0)} aria-valuenow={level??undefined} aria-valuetext={text+' / 最大 '+maximum} data-burn-level={level??'unknown'} data-burn-max={limits?.maximum??'unknown'} data-stalled={limits!==null&&limits.maximum<=0} title={'当前航速 '+text+' / 最大 '+maximum}>
   <b><NativeBitmapText font="burn" color="currentColor">{text}</NativeBitmapText></b>
   <svg width="214" height="24" viewBox="0 0 214 24" aria-hidden="true">
    {Array.from({length:20},(_,i)=>{const x=11+i*9,first=i===0,last=i===19,enabled=limits!==null&&i<limits.maximum;return <polygon key={i} points={[[x,24],[x+8+(last?24:0),24],[x+32,0],[x+(first?0:24),0]].map(p=>p.join(',')).join(' ')} data-enabled={enabled} data-on={level!==null&&i<level} data-bonus={limits!==null&&i<limits.maximum&&i>=limits.maximum-limits.bonus} data-penalty={limits!==null&&i>=limits.maximum&&i<limits.maximum+limits.penalty}/>;})}
   </svg>
  </div>
 </>;
}
