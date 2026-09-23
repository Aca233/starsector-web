import R from '../data/reference-campaign-contact-sounds.json';
import {createOriginalCampaignAudio,selectOriginalCampaignSounds,type OriginalCampaignSoundShot} from '../rules/OriginalCampaignAudio.mjs';
import {assetResolver} from '../../engine/assets/AssetResolver';
import {getAudioSettings,subscribeAudioSettings} from '../../engine/audio/AudioSettings';
import type {NativeSceneFrame} from './NativeProtocol';

type Voice={source:AudioBufferSourceNode;panner:PannerNode;gain:GainNode;position:number[]};
/** One authenticated scene subscription owns one mixer; no cross-captain/global sound queue. */
export class NativeSceneAudio {
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private buffers=new Map<string,AudioBuffer>();
 private loads=new Map<string,Promise<AudioBuffer|null>>();
 private abort=new AbortController();
 private voices=new Set<Voice>();
 private state=createOriginalCampaignAudio();
 private sceneId:string|null=null;
 private sequence=-1;
 private lastAt:number|null=null;
 private generation=0;
 private disposed=false;
 private failed=false;
 private unsubscribe:()=>void;
 private listener:number[]=[0,0];
 private played=0;
 constructor(){
  this.unsubscribe=subscribeAudioSettings(()=>this.mix());
  document.addEventListener('visibilitychange',this.visibility);
  document.addEventListener('pointerdown',this.gesture,true);
  document.addEventListener('keydown',this.gesture,true);
  try{
   this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);this.mix();
   // Relative panner coordinates keep the shared listener at the WebAudio default origin,
   // facing -Z/up +Y, identical to OpenAL. Z=-200 equals original listener z=200.
   for(const file of new Set(Object.values(R.specs).flatMap(samples=>samples.map(s=>s.file))))void this.load(file);
   if(navigator.userActivation?.hasBeenActive)this.unlock();
  }catch{this.failed=true;}
 }
 get status(){return this.failed?'unavailable':!this.context||this.context.state!=='running'?'gesture-required':this.loads.size?'loading':'ready';}
 get playedCount(){return this.played;}
 private gesture=(event:Event)=>{if(event.isTrusted)this.unlock();};
 private unlock(){if(!this.disposed&&this.context?.state==='suspended')void this.context.resume().catch(()=>{/* Retry only on another actual gesture. */});}
 private visibility=()=>{if(document.hidden&&getAudioSettings().muteInBackground)this.clear();this.mix();};
 private audible(){const s=getAudioSettings();return !(document.hidden&&s.muteInBackground)&&!s.muted&&s.masterVolume>0&&s.effectsVolume>0;}
 private mix(){const s=getAudioSettings();if(this.master)this.master.gain.value=s.muted||(s.muteInBackground&&document.hidden)?0:s.masterVolume*s.effectsVolume;}
 private load(file:string):Promise<AudioBuffer|null>{
  const cached=this.buffers.get(file);if(cached)return Promise.resolve(cached);
  const existing=this.loads.get(file);if(existing)return existing;
  const context=this.context;if(!context||this.disposed)return Promise.resolve(null);
  const promise=(async()=>{try{
   const response=await fetch(assetResolver.url(file),{signal:this.abort.signal});if(!response.ok)throw Error('audio resource unavailable');
   const buffer=await context.decodeAudioData(await response.arrayBuffer());if(this.disposed)return null;this.buffers.set(file,buffer);return buffer;
  }catch{if(!this.disposed)this.failed=true;return null;}finally{this.loads.delete(file);}})();
  this.loads.set(file,promise);return promise;
 }
 private locate(voice:Voice){voice.panner.positionX.value=voice.position[0]-this.listener[0];voice.panner.positionY.value=voice.position[1]-this.listener[1];voice.panner.positionZ.value=-R.listenerZ;}
 private release(voice:Voice){voice.source.onended=null;voice.source.disconnect();voice.panner.disconnect();voice.gain.disconnect();this.voices.delete(voice);}
 private emit(shot:OriginalCampaignSoundShot,buffer:AudioBuffer,generation:number,at:number){
  const context=this.context;if(this.disposed||generation!==this.generation||!context||context.state!=='running'||!this.master||!this.audible()||performance.now()-at>250)return;
  // This is the campaign mixer's cap, not a claim of a process-global OpenAL source pool.
  if(this.voices.size>=R.maxSources)return;
  const source=context.createBufferSource(),panner=context.createPanner(),gain=context.createGain();
  const voice={source,panner,gain,position:shot.position};
  try{
   source.buffer=buffer;source.playbackRate.value=shot.pitch;gain.gain.value=shot.volume;
   panner.panningModel='equalpower';panner.distanceModel='linear';panner.refDistance=R.referenceDistance;panner.maxDistance=R.maxDistance;panner.rolloffFactor=1;this.locate(voice);
   source.connect(panner);panner.connect(gain);gain.connect(this.master);source.onended=()=>this.release(voice);this.voices.add(voice);source.start();this.played++;
  }catch{this.release(voice);this.failed=true;}
 }
 /** Called only after an authenticated, current frame was successfully drawn. */
 present(frame:NativeSceneFrame){
  if(this.disposed)return;
  try{
   if(!Number.isSafeInteger(frame.sequence)||frame.sequence<1)throw Error('Missing scene sequence');
   if(this.sceneId!==frame.sceneId){this.clear();this.sceneId=frame.sceneId;this.sequence=-1;}
   if(frame.sequence<=this.sequence)return;
   this.sequence=frame.sequence;this.generation++;const now=performance.now(),seconds=this.lastAt===null?0:Math.max(0,(now-this.lastAt)/1000);this.lastAt=now;
   this.listener=[...frame.camera.center];for(const voice of this.voices)this.locate(voice);
   const selected=selectOriginalCampaignSounds(this.state,frame.effects,{listener:this.listener,seconds});if(selected.unsupported.length)this.failed=true;
   // Do not queue past contacts while locked, muted, suspended, or background-muted.
   if(this.context?.state!=='running'||!this.audible())return;
   const generation=this.generation;for(const shot of selected.shots){const buffer=this.buffers.get(shot.file);if(buffer)this.emit(shot,buffer,generation,now);else void this.load(shot.file).then(value=>{if(value)this.emit(shot,value,generation,now);}).catch(()=>{if(!this.disposed)this.failed=true;});}
  }catch{this.clear();this.failed=true;}
 }
 /** Invalidate pending decodes too. Already consumed sequence numbers stay consumed. */
 clear(){this.generation++;this.state=createOriginalCampaignAudio();this.lastAt=null;for(const voice of [...this.voices]){try{voice.source.stop();}catch{/* Already ended. */}this.release(voice);}}
 dispose(){if(this.disposed)return;this.disposed=true;this.clear();this.abort.abort();this.unsubscribe();document.removeEventListener('visibilitychange',this.visibility);document.removeEventListener('pointerdown',this.gesture,true);document.removeEventListener('keydown',this.gesture,true);this.master?.disconnect();if(this.context)void this.context.close().catch(()=>{});this.buffers.clear();}
}
