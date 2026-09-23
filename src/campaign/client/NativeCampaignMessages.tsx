import {useEffect,useRef,useState} from 'react';
import {NativeBitmapText} from '../../ui/NativeBitmapText';
import {getLoadedNativeFont,loadNativeFont,type BitmapFont} from '../../ui/native-fonts';
import {campaignAsset} from './BodyRenderer';
import {readNativeFrameEvents} from './CampaignClient';
import {createNativeMessageStream,applyNativeMessagePage} from './NativeMessageStream.mjs';
import {ORIGINAL_CAMPAIGN_MESSAGES as R,advanceOriginalCampaignMessages,hoverOriginalCampaignMessageIcon,type OriginalCampaignMessageRow} from '../rules/OriginalCampaignMessages.mjs';
import './NativeCampaignMessages.css';
const rgba=(c:readonly number[])=>'rgba('+c.slice(0,3).join(',')+','+(c[3]/255)+')';
// Keep the native atlas advances/kerning and 400-unit info width. Long-wrap equivalence still needs live comparison.
function lines(text:string,font:BitmapFont|undefined){
 if(!font)return [text];const result:string[]=[];let line='',width=0,previous:number|undefined;
 for(const char of Array.from(text)){if(char===String.fromCharCode(10)){result.push(line);line='';width=0;previous=undefined;continue;}const code=char.codePointAt(0)!,glyph=font.glyphs.get(code);if(!glyph)return [text];let advance=glyph.xadvance+(previous===undefined?0:font.kernings.get(previous+':'+code)??0);
  if(line&&width+advance>R.layout.infoWidth){result.push(line);line='';width=0;advance=glyph.xadvance;}line+=char;width+=advance;previous=code;
 }result.push(line);return result;
}
function Line({text,row}:{text:string;row:OriginalCampaignMessageRow}){const at=row.highlight===null?-1:text.indexOf(row.highlight),color=rgba(row.color);return <span className="native-message-line">{at<0?<NativeBitmapText font="body" color={color}>{text}</NativeBitmapText>:<><NativeBitmapText font="body" color={color}>{text.slice(0,at)}</NativeBitmapText><NativeBitmapText font="body" color={rgba(R.colors.highlight)}>{row.highlight!}</NativeBitmapText><NativeBitmapText font="body" color={color}>{text.slice(at+row.highlight!.length)}</NativeBitmapText></>}</span>;}
export function NativeCampaignMessages({token,worldId,playerId,epoch,initialRevision,ownedDataRefs,onIssue,onRefit}:{token:string;worldId:string;playerId:string;epoch:string;initialRevision:number;ownedDataRefs:readonly string[];onIssue:(text:string)=>void;onRefit?:(dataRef:string,memberRef:string)=>void}){
 const stream=useRef(createNativeMessageStream(worldId,playerId,initialRevision)),owned=useRef(ownedDataRefs);
 useEffect(()=>{owned.current=ownedDataRefs;},[ownedDataRefs]);
 const [cursor,setCursor]=useState(initialRevision);
 const [rows,setRows]=useState<OriginalCampaignMessageRow[]>([]),[font,setFont]=useState(()=>getLoadedNativeFont('body'));
 const [fontIssue,setFontIssue]=useState(''),[syncIssue,setSyncIssue]=useState('');
 useEffect(()=>{onIssue([fontIssue,syncIssue].filter(Boolean).join(' '));},[fontIssue,syncIssue,onIssue]);
 useEffect(()=>{let active=true;void loadNativeFont('body').then(value=>{if(active){setFont(value);setFontIssue('');}}).catch(()=>{if(active)setFontIssue('原版消息字体加载失败，请刷新重试。');});return ()=>{active=false;};},[]);
 useEffect(()=>{let active=true,animation=0,previous=performance.now();const animate=(now:number)=>{if(!active)return;const current=stream.current.list;if(current.rows.length){advanceOriginalCampaignMessages(current,(now-previous)/1000);setRows([...current.rows]);}previous=now;animation=requestAnimationFrame(animate);};animation=requestAnimationFrame(animate);return ()=>{active=false;cancelAnimationFrame(animation);};},[]);
 useEffect(()=>{
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;const abort=new AbortController();
  const poll=async()=>{let delay=500;try{
   const current=stream.current,page=await readNativeFrameEvents(token,{worldId,epoch,afterRevision:current.cursor,limit:100},abort.signal);if(!active)return;
   if(page.epoch!==epoch)throw Error('stale epoch');applyNativeMessagePage(current,page,owned.current);setCursor(current.cursor);setRows([...current.list.rows]);
   setSyncIssue(current.unhandled.length?'部分自然帧效果（事故报告或能力视听效果）尚未接入界面。':'');if(page.nextRevision<page.revision)delay=0;
  }catch{if(active)setSyncIssue('消息同步中断，正在重试；不会重新执行舰队操作。');}
  finally{if(active)timer=setTimeout(poll,delay);}};
  void poll();return ()=>{active=false;abort.abort();if(timer!==undefined)clearTimeout(timer);};
 },[token,worldId,epoch]);
 return <div className="native-campaign-messages" role="log" aria-label="生涯消息" aria-live="polite" aria-relevant="additions text" data-message-cursor={cursor} style={{left:R.layout.left,bottom:R.layout.bottom,gap:R.layout.pad}}>{rows.map(row=>{
  const wrapped=lines(row.text,font),textHeight=wrapped.length*(font?.lineHeight??17),height=row.icon?Math.max(R.layout.iconHeight,textHeight+R.layout.rowPadding):textHeight+R.layout.rowPadding;
  return <div className="native-campaign-message" key={row.id} data-message-id={row.id} data-message-kind={row.icon?'repairs-complete':'campaign-message'} style={{height,width:R.layout.infoWidth+(row.icon?R.layout.iconHeight+R.layout.iconGap:0),opacity:row.fader.currBrightness}}>
   {row.icon&&<span className="native-message-icon" onPointerMove={()=>hoverOriginalCampaignMessageIcon(stream.current.list,row.id)} onPointerDown={e=>e.stopPropagation()}><button type="button" disabled={!onRefit} aria-label="查看修理完成的舰船" title={onRefit?'打开该舰船的改装界面':'原生舰队改装页尚未接入，暂不能打开'} onClick={e=>{e.stopPropagation();if(row.memberRef)onRefit?.(row.dataRef,row.memberRef);}}><img src={campaignAsset(row.icon)} alt=""/></button></span>}
   <div className="native-message-info" style={{left:row.icon?R.layout.iconHeight+R.layout.iconGap:0,top:row.icon?(textHeight+5>40?0:(40-textHeight)/2):5}}>{wrapped.map((line,i)=><Line key={i} text={line} row={row}/>)}</div>
  </div>;
 })}</div>;
}
