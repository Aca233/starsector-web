import {ProjectileVisualSender,ProjectileVisualReceiver} from './ProjectileVisualCodec.mjs';
export const ANCHORED_VISUAL_LIMITS=Object.freeze({baselineBytes:128*1024,updateBytes:11000,baselineSeconds:1,entities:4096});
const L=ANCHORED_VISUAL_LIMITS;
const keyOk=key=>Number.isSafeInteger(key)&&key>0&&key<=1e9;
const epochFor=(epoch,key)=>{if(typeof epoch!=='string'||!/^[a-zA-Z0-9-]{1,48}$/.test(epoch)||!keyOk(key))throw Error('Invalid visual epoch');return epoch+'-'+key;};
const bytes=value=>value instanceof Uint8Array?value:value instanceof ArrayBuffer?new Uint8Array(value):null;
const sameBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
/** One encoder per authority room, independent of guest count. One immutable
 * baseline and one latest update, no per-peer delta histories. Consumers may
 * skip every intermediate update and still recover the latest from its base.
 * Publication byte arrays are immutable-owned: do not transfer/detach them. */
export class AnchoredProjectilePublisher {
 #epoch;#anchor=null;#latest=null;#serial=0;#encodes=0;#updates=0;#baselines=0;
 constructor(epoch){epochFor(epoch,1);this.#epoch=epoch;}
 reset(epoch){epochFor(epoch,1);this.#epoch=epoch;this.#anchor=this.#latest=null;this.#serial=this.#encodes=this.#updates=this.#baselines=0;}
 publish(frame){
  if(!frame||!Number.isSafeInteger(frame.tick)||frame.tick<0||!Number.isFinite(frame.time)||frame.time<0||!Array.isArray(frame.rows)||frame.rows.length>L.entities||this.#latest&&(frame.tick<=this.#latest.tick||frame.time<this.#latest.time))throw Error('Invalid visual publication');
  let choice=null;
  if(this.#anchor&&frame.time-this.#anchor.time<L.baselineSeconds){this.#encodes++;choice=this.#anchor.sender.fork().prepare(frame);if(choice.bytes.length>L.updateBytes)choice=null;}
  if(!choice){
   const key=this.#serial+1,sender=new ProjectileVisualSender(epochFor(this.#epoch,key));this.#encodes++;const baseline=sender.prepare(frame);
   if(baseline.bytes.length>L.baselineBytes)throw Error('Visual baseline exceeds bounded lane');
   if(!sender.commit(baseline))throw Error('Visual baseline admission');
   this.#anchor={key,sender,time:frame.time,tick:frame.tick,bytes:baseline.bytes};this.#serial=key;this.#baselines++;
  }else this.#updates++;
  const anchor=this.#anchor;
  this.#latest=Object.freeze({key:anchor.key,baseTick:anchor.tick,tick:frame.tick,time:frame.time,baseline:anchor.bytes,update:choice?.bytes??null});return this.#latest;
 }
 get latest(){return this.#latest;}
 stats(){return {encodes:this.#encodes,updates:this.#updates,baselines:this.#baselines,key:this.#serial,retainedBytes:(this.#anchor?.bytes.length??0)+(this.#latest?.update?.length??0)};}
}
/** Baseline is never advanced by an update. The temporary receiver fork owns
 * all speculative changes until CRC/projection validation succeeds. */
export class AnchoredProjectileReceiver {
 #epoch;#anchor=null;#tick=-1;#time=0;
 constructor(epoch){epochFor(epoch,1);this.#epoch=epoch;}
 reset(epoch){epochFor(epoch,1);this.#epoch=epoch;this.#anchor=null;this.#tick=-1;this.#time=0;}
 baseline(key,value){
  const data=bytes(value);if(!keyOk(key)||!data||data.length>L.baselineBytes)throw Error('Invalid visual baseline');
  if(this.#anchor&&key<this.#anchor.key)return null;
  if(this.#anchor&&key===this.#anchor.key){if(!sameBytes(data,this.#anchor.bytes))throw Error('Reused visual baseline key');return null;}
  const receiver=new ProjectileVisualReceiver(epochFor(this.#epoch,key)),frame=receiver.receive(data);
  if(frame.revision!==1||frame.tick<this.#tick||frame.time<this.#time)throw Error('Visual baseline rewinds authority');
  this.#anchor={key,receiver,bytes:data.slice(),tick:frame.tick};this.#tick=frame.tick;this.#time=frame.time;return frame;
 }
 update(key,value){
  const data=bytes(value);if(!keyOk(key)||!data||data.length>L.updateBytes)throw Error('Invalid visual update');
  if(!this.#anchor||key!==this.#anchor.key){const e=new Error('Visual baseline required');e.code='VISUAL_MISSING_BASE';throw e;}
  const frame=this.#anchor.receiver.fork().receive(data);if(frame.revision!==2)throw Error('Invalid visual update revision');
  if(frame.tick<=this.#tick)return null;if(frame.time<this.#time)throw Error('Visual clock moved backwards');
  this.#tick=frame.tick;this.#time=frame.time;return frame;
 }
 stats(){return {key:this.#anchor?.key??null,tick:this.#tick,baselineTick:this.#anchor?.tick??null,retainedBaselineBytes:this.#anchor?.bytes.length??0};}
}
