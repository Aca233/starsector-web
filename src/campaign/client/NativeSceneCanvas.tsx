import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {CampaignApiError,errorText,readNativeScene} from './CampaignClient';
import {NativeFleetRenderer} from './NativeFleetRenderer';
import {NativeSceneAudio} from './NativeSceneAudio';
import type {NativeSceneFrame} from './NativeProtocol';
import './NativeSceneCanvas.css';
export interface NativeSceneSelection {x:number;y:number;revision:number}
/** The only geometry shown here comes from the authenticated observer's real scene layers. */
export function NativeSceneCanvas({token,worldId,epoch,observerDataRef,revision,locked,onSelect}:{token:string;worldId:string;epoch:string;observerDataRef:string;revision:number;locked:boolean;onSelect:(point:NativeSceneSelection)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),latest=useRef<NativeSceneFrame|null>(null),minimumRevision=useRef(revision),[message,setMessage]=useState('正在读取真实场景…');
 useLayoutEffect(()=>{minimumRevision.current=revision;if(latest.current&&latest.current.revision<revision)latest.current=null;},[revision]);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;let active=true,timer:ReturnType<typeof setTimeout>|undefined,renderer:NativeFleetRenderer|null=null,audio:NativeSceneAudio|null=null;
  const abort=new AbortController(),viewId=crypto.randomUUID();latest.current=null;
  const clear=()=>{audio?.clear();latest.current=null;delete element.dataset.sceneRevision;delete element.dataset.pingCount;if(renderer&&!element.getContext('webgl2')?.isContextLost()){renderer.beginScene(Math.max(1,element.width),Math.max(1,element.height),[0,0,0,1]);renderer.present();}};
  const contextLost=(event:Event)=>{event.preventDefault();abort.abort();clearTimeout(timer);audio?.dispose();latest.current=null;setMessage('图形上下文已丢失，请重新连接。');};element.addEventListener('webglcontextlost',contextLost);
  try{const gl=element.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:false});if(!gl)throw Error('此设备无法创建 WebGL2 航行画面。');renderer=new NativeFleetRenderer(gl);}catch(error){setMessage(errorText(error));return ()=>{active=false;element.removeEventListener('webglcontextlost',contextLost);};}
  audio=new NativeSceneAudio();
  const poll=async()=>{
   let delay=80;try{
    const rect=element.getBoundingClientRect(),width=Math.min(8192,Math.max(1,Math.round(rect.width))),height=Math.min(8192,Math.max(1,Math.round(rect.height)));
    const frame=await readNativeScene(token,{worldId,epoch,observerDataRef,viewId,width,height},abort.signal);if(!active)return;
    if(frame.scope!=='native-observer-scene'||frame.worldId!==worldId||frame.epoch!==epoch||frame.observerDataRef!==observerDataRef||!Number.isSafeInteger(frame.revision)||frame.camera.width!==width||frame.camera.height!==height)throw new CampaignApiError('INVALID_RESPONSE',false);
    if(frame.revision<minimumRevision.current){clear();return;}
    const frames=[...frame.layers.background,...frame.layers.planets,...frame.layers.terrain,...frame.layers.fleets,...frame.layers.contacts,...frame.layers.above,...frame.layers.pings];await renderer!.load(frames);if(!active)return;
    if(frame.revision<minimumRevision.current){clear();return;}
    // Assigning an unchanged canvas size still reallocates/clears its drawing buffer.
    if(element.width!==width)element.width=width;if(element.height!==height)element.height=height;renderer!.beginScene(width,height,[0,0,0,1]);for(const geometry of frames)renderer!.draw(geometry,frame.camera);renderer!.present();latest.current=frame;element.dataset.sceneRevision=String(frame.revision);element.dataset.pingCount=String(frame.layers.pings.length);audio!.present(frame);element.dataset.audioState=audio!.status;element.dataset.audioPlayed=String(audio!.playedCount);setMessage('');
   }catch(error){if(active&&!abort.signal.aborted){clear();setMessage(errorText(error));delay=1500;}}
   finally{if(active&&!abort.signal.aborted)timer=setTimeout(poll,document.hidden?Math.max(1000,delay):delay);}
  };
  void poll();return ()=>{active=false;abort.abort();clearTimeout(timer);element.removeEventListener('webglcontextlost',contextLost);latest.current=null;audio?.dispose();renderer?.dispose();};
 },[token,worldId,epoch,observerDataRef]);
 const select=(event:PointerEvent<HTMLCanvasElement>)=>{
  const frame=latest.current;if(event.button!==0||event.pointerType==='touch'||locked||!frame||frame.revision<revision)return;
  const rect=event.currentTarget.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
  event.preventDefault();const x=(event.clientX-rect.left)*frame.camera.width/rect.width,y=(rect.bottom-event.clientY)*frame.camera.height/rect.height;
  onSelect({x:Math.fround(frame.camera.center[0]+(x-frame.camera.width/2)/frame.camera.zoom),y:Math.fround(frame.camera.center[1]+(y-frame.camera.height/2)/frame.camera.zoom),revision:frame.revision});
 };
 return <div className="native-scene" data-scene-state={message?'unavailable':'ready'}><canvas ref={canvas} aria-label="原生航行区域" onPointerDown={select}/>{message&&<p className="native-scene-message" role="status">{message}</p>}<p className="native-scene-boundary">开发中：背景、星体、舰队与吊舱已接入真实图层；完整 HUD、匿名星体接触与世界推进尚未接齐。</p></div>;
}
