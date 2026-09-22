// REJECTED standalone anchor strategy: high guided-missile density made this
// larger/slower at 10Hz. Benchmark comparison only; never production-enabled.
import {projectProjectileVisual,PROJECTILE_VISUAL_FIELDS} from '../../src/network/ProjectileVisualProjection.mjs';
import {ProjectileEventSender,ProjectileEventReceiver} from '../../src/network/ProjectileEventStream.mjs';
/** Presentation trajectory anchors. A validated heartbeat says anchors remained
 * within budget at its authority tick; it does NOT acknowledge damage or grant
 * permission to guide/collide/delete projectiles locally. Not a world snapshot. */
export const PROJECTILE_VISUAL_BUDGET=Object.freeze({position:1/16,velocity:1/16,angle:1/1024,clock:1/65536,fade:1/4096,anchorSeconds:1,maxSteps:240});
const B=PROJECTILE_VISUAL_BUDGET,num=Number.isFinite;
const vector=v=>!!v&&Object.keys(v).length===1&&Array.isArray(v.$vector)&&v.$vector.length===2&&v.$vector.every(num);
const definedNumber=(row,key)=>typeof row[key]==='number'&&num(row[key]);
const asNumber=(row,key,fallback)=>definedNumber(row,key)?row[key]:fallback;
const allowed=new Set([...PROJECTILE_VISUAL_FIELDS,'anchorTick','anchorTime']);
function validate({tick,time,rows}){
 if(!Number.isSafeInteger(tick)||tick<0||!num(time)||time<0||!Array.isArray(rows)||rows.length>4096)throw Error('Invalid visual authority frame');
 for(const row of rows){
  if(Object.keys(row).some(k=>!allowed.has(k))||!vector(row.pos)||!vector(row.vel)||!Number.isSafeInteger(row.anchorTick)||row.anchorTick<0||row.anchorTick>tick||!num(row.anchorTime)||row.anchorTime<0||row.anchorTime>time||time-row.anchorTime>B.anchorSeconds+1e-6||tick-row.anchorTick>B.maxSteps)throw Error('Invalid visual trajectory anchor');
 }
}
function equal(a,b){if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
/** Pure, bounded presentation math. No hit/death/target/RNG/damage evaluation.
 * Source straight ballistic/plasma/tail math follows SourceProjectileLifecycle;
 * guided or special motion simply fails the sender error test and is corrected.
 * Missing optional values/tags stay missing. Never run a native engine update. */
export function predictProjectileVisual(anchor,tick,time){
 const steps=tick-anchor.anchorTick,duration=time-anchor.anchorTime;
 if(!Number.isSafeInteger(tick)||!num(time)||steps<0||steps>B.maxSteps||duration<0||duration>B.anchorSeconds+.101)throw Error('Visual prediction bound');
 const out={...anchor};if(!steps||anchor.isMine===true)return out;
 if(!vector(anchor.pos)||!vector(anchor.vel))throw Error('Invalid visual vector');
 const dt=duration/steps,vx=anchor.vel.$vector[0],vy=anchor.vel.$vector[1];let [x,y]=anchor.pos.$vector;
 const hasTail=vector(anchor.ballisticTail);let [tx,ty]=hasTail?anchor.ballisticTail.$vector:[x,y];
 let angle=asNumber(anchor,'facingRad',Math.atan2(vy,vx)),fade=asNumber(anchor,'fadeProgress',0),range=asNumber(anchor,'rangeRemaining',0);
 let elapsed=asNumber(anchor,'elapsedTime',0),flight=asNumber(anchor,'flightTimeRemaining',0),fizzle=asNumber(anchor,'missileFizzleTime',0);
 const speed=asNumber(anchor,'sourceMoveSpeed',asNumber(anchor,'movingRayMoveSpeed',Math.hypot(vx,vy))),length=asNumber(anchor,'projLength',0);
 const source=anchor.isRocket!==true&&anchor.isFlare!==true&&['BALLISTIC','BALLISTIC_AS_BEAM','PLASMA'].includes(anchor.spawnType)&&asNumber(anchor,'fadeTime',0)>0&&(anchor.spawnType==='PLASMA'||length>0);
 const sv=vector(anchor.sourceVelocity)?anchor.sourceVelocity.$vector:[0,0];
 for(let step=0;step<steps;step++){
  elapsed+=dt;
  // Fuel-to-fizzle TRANSITIONS are authority-only. Already-declared visual coast
  // age may advance; the next authority sample corrects any special behaviour.
  if(definedNumber(anchor,'missileFizzleTime')){
   fizzle+=dt;const spec=anchor.missileLifecycleSpec;
   if(spec&&num(spec.flameoutTime)&&num(spec.fadeTime))fade=spec.fadeTime>0?Math.max(0,Math.min(1,1-(spec.flameoutTime-fizzle)/spec.fadeTime)):(fizzle>=spec.flameoutTime?1:0);
  }else if(definedNumber(anchor,'flightTimeRemaining'))flight-=dt;
  if(definedNumber(anchor,'angularVelocityRad'))angle+=anchor.angularVelocityRad*dt;
  if(source){
   if(anchor.spawnType==='PLASMA'){
    if(range<=0)fade=Math.min(1,fade+dt/anchor.fadeTime);
    x+=vx*dt;y+=vy*dt;
   }else{
    const dx=Math.cos(angle),dy=Math.sin(angle);
    if(anchor.spawnType==='BALLISTIC_AS_BEAM'){
     const tailStep=fade>0?speed*dt:Math.max(0,Math.hypot(x-tx,y-ty)+speed*dt-length);
     tx+=dx*tailStep+sv[0]*dt;ty+=dy*tailStep+sv[1]*dt;
     if(anchor.didDamage!==true){x+=vx*dt;y+=vy*dt;}
     if(anchor.didDamage===true&&(x-tx)*dx+(y-ty)*dy<0){tx=x;ty=y;}
    }else{
     if(anchor.didDamage!==true){x+=vx*dt;y+=vy*dt;}
     let len=Math.hypot(x-tx,y-ty);if(fade>0)len=Math.max(0,len-speed*dt);len=Math.min(length,len);tx=x-dx*len;ty=y-dy*len;
    }
   }
   range-=speed*dt;
   if(anchor.spawnType!=='PLASMA'&&(range<=0||anchor.didDamage===true))fade=Math.min(1,fade+dt/anchor.fadeTime);
  }else{x+=vx*dt;y+=vy*dt;range-=Math.hypot(vx,vy)*dt;}
 }
 out.pos={$vector:[x,y]};if(hasTail)out.ballisticTail={$vector:[tx,ty]};
 for(const [key,value] of Object.entries({facingRad:angle,fadeProgress:fade,rangeRemaining:range,elapsedTime:elapsed,flightTimeRemaining:flight,missileFizzleTime:fizzle}))if(definedNumber(anchor,key))out[key]=value;
 return out;
}
export function withinProjectileVisualBudget(predicted,current){
 const keys=Object.keys(current);if(keys.some(k=>!Object.hasOwn(predicted,k)))return false;
 for(const k of Object.keys(predicted))if(k!=='anchorTick'&&k!=='anchorTime'&&!Object.hasOwn(current,k))return false;
 for(const key of keys){const a=predicted[key],b=current[key];
  if(['pos','ballisticTail','vel','sourceVelocity'].includes(key)&&vector(a)&&vector(b)){
   if(Math.hypot(a.$vector[0]-b.$vector[0],a.$vector[1]-b.$vector[1])>(key==='vel'?B.velocity:B.position))return false;
  }else if(typeof a==='number'&&typeof b==='number'&&num(a)&&num(b)){
   const tolerance=key==='facingRad'?B.angle:['elapsedTime','flightTimeRemaining','missileFizzleTime','flareLife'].includes(key)?B.clock:key==='fadeProgress'?B.fade:key==='rangeRemaining'?B.position:0;
   const distance=key==='facingRad'?Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b))):Math.abs(a-b);
   if(tolerance?distance>tolerance:!Object.is(a,b))return false;
  }else if(!equal(a,b))return false;
 }
 return true;
}
export class ProjectileVisualSender {
 #sender;#anchors=new Map();#choices=new WeakMap();
 constructor(epoch){this.#sender=new ProjectileEventSender(epoch,{referenceSteps:false});}
 reset(epoch){this.#sender.reset(epoch);this.#anchors.clear();this.#choices=new WeakMap();}
 prepare({tick,time,rows}){
  if(!Number.isSafeInteger(tick)||tick<0||!num(time)||time<0||!Array.isArray(rows)||rows.length>4096)throw Error('Invalid visual frame');
  const next=new Map();let corrected=0,held=0;
  for(const raw of rows){const row=projectProjectileVisual(raw),old=this.#anchors.get(row.id);let anchor={...row,anchorTick:tick,anchorTime:time};
   if(old&&tick-old.anchorTick<=B.maxSteps&&time-old.anchorTime<B.anchorSeconds&&time>=old.anchorTime&&withinProjectileVisualBudget(predictProjectileVisual(old,tick,time),row)){anchor=old;held++;}else if(old)corrected++;
   next.set(row.id,anchor);
  }
  if(next.size!==rows.length)throw Error('Duplicate visual projectile');
  const anchors=[...next.values()];validate({tick,time,rows:anchors});
  const prepared=this.#sender.prepare({tick,time,rows:anchors}),choice=Object.freeze({...prepared,stats:Object.freeze({...prepared.stats,corrected,held})});this.#choices.set(choice,{prepared,anchors:new Map(structuredClone(anchors).map(row=>[row.id,row]))});return choice;
 }
 commit(choice){const own=this.#choices.get(choice);if(!own||!this.#sender.commit(own.prepared))return false;this.#choices.delete(choice);this.#anchors=own.anchors;return true;}
 stats(){return this.#sender.stats();}
}
export class ProjectileVisualReceiver {
 #receiver;#frame=null;
 constructor(epoch){this.#receiver=new ProjectileEventReceiver(epoch,{validate});}
 reset(epoch){this.#receiver.reset(epoch);this.#frame=null;}
 receive(bytes){const frame=this.#receiver.receive(bytes);this.#frame=frame;return frame;}
 sample(tick,time){
  const frame=this.#frame;if(!frame)return null;
  // At most 100ms beyond the last validated authority heartbeat. The renderer
  // must hold, not resurrect an older bulk world, when this returns null.
  if(!Number.isSafeInteger(tick)||!num(time)||tick<frame.tick||tick-frame.tick>6||time<frame.time||time-frame.time>.1+1e-9||frame.rows.some(row=>tick-row.anchorTick>B.maxSteps))return null;
  return frame.rows.map(row=>predictProjectileVisual(row,tick,time));
 }
 stats(){return this.#receiver.stats();}
}
