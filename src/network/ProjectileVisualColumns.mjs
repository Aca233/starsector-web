/** Integer visual columns; this format is DISPLAY ONLY, not CombatSnapshot.
 * IDs and appearance stay exact; kinematics quantization is explicitly bounded.
 * Scalar optional fields use null (absent), never a fabricated authoritative 0.
 */
import {projectProjectileVisual} from './ProjectileVisualProjection.mjs';
const columns=[
 ['pos',0,64],['pos',1,64],['vel',0,64],['vel',1,64],
 ['ballisticTail',0,64],['ballisticTail',1,64],['sourceVelocity',0,64],['sourceVelocity',1,64],
 ['facingRad',null,65536],['turnVelocityRad',null,65536],['angularVelocityRad',null,65536],
 ['elapsedTime',null,65536],['flightTimeRemaining',null,65536],['missileFizzleTime',null,65536],['flareLife',null,65536],
 ['fadeProgress',null,65536],['rangeRemaining',null,64]
];
export const PROJECTILE_VISUAL_COLUMNS=Object.freeze(columns.map(c=>Object.freeze(c)));
const dynamic=new Set(columns.map(c=>c[0]));
const missing=v=>v===undefined||v&&typeof v==='object'&&v.$undefined===1;
export function packProjectileVisual(input){
 const row=projectProjectileVisual(input),appearance={};
 for(const [key,value]of Object.entries(row))if(key!=='id'&&key!=='specId'&&!dynamic.has(key))appearance[key]=value;
 const pose=columns.map(([key,axis,scale])=>{
  const value=row[key];if(missing(value))return null;
  const scalar=axis===null?value:value?.$vector?.[axis];
  if(typeof scalar!=='number'||!Number.isFinite(scalar)||Math.abs(scalar*scale)>Number.MAX_SAFE_INTEGER)throw Error('Unsupported visual column');
  return Math.round(scalar*scale)||0;
 });
 return {id:row.id,specId:row.specId,appearance,pose};
}
export function unpackProjectileVisual(record){
 if(!record||!Array.isArray(record.pose)||record.pose.length!==columns.length||!record.appearance||typeof record.appearance!=='object'||Array.isArray(record.appearance))throw Error('Invalid visual columns');
 validateVisualColumns(record.pose);
 const out={...record.appearance,id:record.id,specId:record.specId};
 for(let i=0;i<columns.length;i++){
  const v=record.pose[i],[key,axis,scale]=columns[i];if(v===null)continue;if(!Number.isSafeInteger(v))throw Error('Invalid visual column integer');
  if(axis===null)out[key]=v/scale;
  else{out[key]??={$vector:[]};out[key].$vector[axis]=v/scale;}
 }
 for(const key of ['pos','vel','ballisticTail','sourceVelocity'])if(out[key]&&(!Array.isArray(out[key].$vector)||out[key].$vector.length!==2||!out[key].$vector.every(Number.isFinite)))throw Error('Incomplete visual vector');
 return out;
}
// Encoding reference only: exact integer target columns are corrected before a
// receiver commits the CRC-checked revision. Never a displayed prediction/ACK.
const MAX_COLUMN=2**40;
export function validateVisualColumns(pose){
 if(!Array.isArray(pose)||pose.length!==columns.length||pose.some(v=>v!==null&&(!Number.isSafeInteger(v)||Object.is(v,-0)||Math.abs(v)>MAX_COLUMN))||pose.slice(0,4).some(v=>v===null))throw Error('Invalid bounded visual pose');
 for(const [a,b]of [[4,5],[6,7]])if((pose[a]===null)!==(pose[b]===null))throw Error('Incomplete visual pose');
 return pose;
}
export function referenceVisualColumns(row,seconds){
 const p=validateVisualColumns(row.pose),out=p.slice();if(!Number.isFinite(seconds)||seconds<0||seconds>2||row.appearance?.isMine===true)return row;
 const advance=(index,amount)=>{if(out[index]!==null)out[index]=Math.round(out[index]+amount)||0;};
 advance(0,p[2]*seconds);advance(1,p[3]*seconds);advance(4,p[2]*seconds);advance(5,p[3]*seconds);
 advance(8,(p[10]??p[9]??0)*seconds);advance(11,65536*seconds);
 if(p[13]===null)advance(12,-65536*seconds);else advance(13,65536*seconds);
 advance(14,-65536*seconds);advance(16,-Math.hypot(p[2],p[3])*seconds);
 if(out.some(v=>v!==null&&Math.abs(v)>MAX_COLUMN))return row;
 return {...row,pose:out};
}
export function diffVisualColumns(before,after){
 validateVisualColumns(before);validateVisualColumns(after);let mask=0;const values=[];
 for(let i=0;i<columns.length;i++)if(!Object.is(before[i],after[i])){mask|=1<<i;values.push(after[i]===null?null:before[i]===null?after[i]:after[i]-before[i]);}
 return mask?[mask,...values]:null;
}
export function applyVisualColumnDiff(before,changes){
 validateVisualColumns(before);
 if(!Array.isArray(changes)||!Number.isInteger(changes[0])||changes[0]<=0||changes[0]>=2**columns.length)throw Error('Invalid visual mask');
 let at=1;const result=before.slice();
 for(let i=0;i<columns.length;i++)if(changes[0]&(1<<i)){
  const value=changes[at++];if(value!==null&&(!Number.isSafeInteger(value)||Math.abs(value)>MAX_COLUMN*2))throw Error('Invalid visual residual');
  result[i]=value===null?null:before[i]===null?value:before[i]+value;
 }
 if(at!==changes.length)throw Error('Invalid visual residual width');return validateVisualColumns(result);
}
