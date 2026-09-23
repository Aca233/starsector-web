import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {NativeBitmapText} from '../../ui/NativeBitmapText';
import {NativeFrame} from '../../ui/NativeChrome';
import {CampaignApiError,errorText} from './CampaignClient';
import type {DeepReadonly} from '../Types';
import type {NativeAbilityBar as AbilityBar,NativeAbilityButton,OriginalAbilityBarGesture} from '../rules/OriginalCampaignAbilityBar.mjs';
import './NativeAbilityBar.css';
const descriptions:Record<string,string[]>={go_dark:['关闭一切非必要的系统，降低 50% 被侦测范围，此时舰队将进行缓速航行。','当宇宙航行速度仅为最慢舰船的一半时，就视为缓速航行。'],sustained_burn:['将舰队引擎切换到长途旅行模式。但须暂时熄火来进行切换。','以降低舰队加速度为代价，提高 100% 最大宇宙航速，且此期间舰队的转向性能将受显著影响。同时，使舰队的被侦测范围扩大 100%。','所提高的航速不包括其他因素带来增益，如导航浮标或拖船。']};
/** Observer-local H.Oo perimeter animation; never advances ability state or cooldown. */
function Indicator({ability,color}:{ability:DeepReadonly<NativeAbilityButton>;color:readonly number[]}){
 const canvas=useRef<HTMLCanvasElement>(null),state=useRef({ability,color});useLayoutEffect(()=>{state.current={ability,color};},[ability,color]);
 useEffect(()=>{let frame=0,then=performance.now(),phase=0,active=0,progress=0;const draw=(now:number)=>{const dt=Math.min(.1,(now-then)/1000);then=now;phase=(phase+dt*.5)%1;const current=state.current,a=current.ability,c=canvas.current?.getContext('2d');if(!c)return;c.clearRect(0,0,56,56);c.globalCompositeOperation='lighter';const [r,g,b]=current.color;
  const fade=(v:number,on:boolean)=>Math.max(0,Math.min(1,v+(on?dt/.1:-dt/.25)));active=fade(active,a.showActive);progress=fade(progress,a.showProgress);
  const perimeter=(size:number,offset:number,fraction:number,trail:number,opacity:number,moving:boolean)=>{const total=4*size-4,head=fraction*total;for(let n=Math.floor(trail);n>=0;n--){let p=((head+(moving?n:-n))%total+total)%total,x=0,y=0;if(p<size-1){x=p;}else if(p<2*size-2){x=size-1;y=p-size+1;}else if(p<3*size-3){x=3*size-3-p;y=size-1;}else y=total-p;const alpha=moving?n/Math.max(1,trail):Math.min(1,n/2,(trail-n)/2);c.fillStyle='rgba('+r+','+g+','+b+','+Math.max(0,alpha*opacity)+')';c.fillRect(Math.floor(x+offset),Math.floor(y+offset),1,1);}};
  if(active>0)for(const offset of [0,.5,.25,.75])perimeter(52,2,phase+offset,51,active,true);
  if(progress>0){const fraction=Math.max(0,Math.min(1,a.progress));perimeter(50,3,fraction,fraction*196,progress,false);perimeter(52,2,fraction,fraction*204,progress*.33,false);}
  frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);return ()=>cancelAnimationFrame(frame);},[]);
 return <canvas ref={canvas} width={56} height={56} className="native-ability-indicator" aria-hidden="true"/>;
}
export function NativeAbilityBar({bar,locked,onPress,onChange}:{bar:DeepReadonly<AbilityBar>;locked:boolean;onPress:(index:number,id:string)=>void;onChange:(action:OriginalAbilityBarGesture)=>void}){
 const [hover,setHover]=useState<number|null>(null),[note,setNote]=useState('');
 useEffect(()=>{const key=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(event.defaultPrevented||event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;const match=/^Digit([0-9])$/.exec(event.code);if(!match)return;const index=(Number(match[1])+9)%10,ability=bar.slots[index]?.ability;if(!ability)return;event.preventDefault();if(!locked&&!bar.commandBlockReason&&ability.usable)onPress(index,ability.id);};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[bar,locked,onPress]);
 const color='rgba('+[...bar.color.slice(0,3),bar.color[3]/255].join(',')+')',blocked=bar.commandBlockReason?errorText(new CampaignApiError(bar.commandBlockReason,false)):null,hovered=hover===null?null:bar.slots[hover]?.ability;
 return <section className="native-ability-bar" aria-label="舰队能力栏" aria-busy={locked} data-page={bar.page} style={{'--ability-color':color} as CSSProperties} onContextMenu={event=>{event.preventDefault();setNote(bar.locked?'能力栏已锁定。':'原版能力选择与重排尚未接入；不会打开替代菜单。');}}>
  <img className="native-ability-holder" src={runtimeAssetUrl('/game-assets/graphics/ui/campaign_abilities.png')} alt="" draggable={false}/>
  <div className="native-ability-slots">{bar.slots.map(slot=>{const a=slot.ability;return <div className="native-ability-slot" key={slot.index} onMouseEnter={()=>setHover(slot.index)} onMouseLeave={()=>setHover(null)}>
   <button type="button" className="native-ability-button" aria-label={a?a.name+' ['+slot.shortcut+']':(slot.assigned?'尚未接入的能力槽 ':'空能力槽 ')+slot.shortcut} title={slot.assigned&&!a?'此已保存的能力尚未接入，槽位配置仍保留。':undefined} aria-pressed={a?.active??false} data-ability-id={a?.id??''} disabled={locked||!!blocked||!a||!a.usable} onFocus={()=>setHover(slot.index)} onBlur={()=>setHover(null)} onClick={()=>{if(a)onPress(slot.index,a.id);}}>
    <img src={runtimeAssetUrl('/game-assets/'+(a?.icon??'graphics/icons/abilities/blank.png'))} alt="" draggable={false}/>
   </button>
   {a&&<><Indicator ability={a} color={bar.color}/><span className="native-ability-key"><NativeBitmapText font="tiny" color="currentColor">{slot.shortcut}</NativeBitmapText></span>{a.cooldownFraction<1&&<span className="native-ability-cooldown" style={{height:52*Math.min(1,Math.max(0,1-a.cooldownFraction))}}/>}</>}
  </div>;})}</div>
  <div className="native-ability-controls"><button type="button" disabled={locked} onClick={()=>onChange({kind:'page',direction:-1})}><NativeBitmapText font="tiny" color="currentColor">上一页</NativeBitmapText></button><button type="button" disabled={locked} onClick={()=>onChange({kind:'page',direction:1})}><NativeBitmapText font="tiny" color="currentColor">下一页</NativeBitmapText></button><label className="native-ability-lock"><input type="checkbox" checked={bar.locked} disabled={locked} onChange={event=>onChange({kind:'lock',locked:event.target.checked})}/><NativeBitmapText font="tiny" color="currentColor">锁定</NativeBitmapText></label></div>
  {hovered&&<NativeFrame className="native-ability-tooltip" surface="solid"><h3><NativeBitmapText font="body">{hovered.name+(hovered.active?' (开)':' (关)')}</NativeBitmapText></h3>{descriptions[hovered.id]?.map(text=><p key={text}>{text}</p>)}{blocked&&<p className="native-ability-warning">{blocked}</p>}{!hovered.usable&&<p className="native-ability-warning">当前不可用</p>}<p className="native-ability-muted">右键指定能力：尚未接入</p></NativeFrame>}
  {note&&<p className="native-ability-note" role="status">{note}</p>}
 </section>;
}
