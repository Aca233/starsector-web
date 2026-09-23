/** API TimeoutTracker: ordered item identity, Java float timers, inclusive zero expiry. */
import {requireThat} from '../core/Values.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_TIMEOUT_TRACKER',message),f=Math.fround;
const scalar=value=>{check(typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(f(value)),'Finite native timeout required');return f(value);};
export function createOriginalTimeoutTracker(){return {scope:'native-timeout-tracker',items:[]};}
export function validateOriginalTimeoutTracker(state){check(state?.scope==='native-timeout-tracker'&&Array.isArray(state.items),'Actual ordered TimeoutTracker required');const seen=new Set();for(const row of state.items){check(row&&row.item!==null&&row.item!==undefined&&!seen.has(row.item),'Unique actual timeout item identities required');seen.add(row.item);check(scalar(row.remaining)===row.remaining,'Native float timeout required');}return state;}
function data(state,item){check(item!==null&&item!==undefined,'Actual timeout item required');let row=state.items.find(row=>row.item===item);if(!row){row={item,remaining:0};state.items.push(row);}return row;}
export const originalTimeoutContains=(state,item)=>state.items.some(row=>row.item===item);
export const originalTimeoutItems=state=>state.items.map(row=>row.item);
/** Like Java, this getter allocates a zero-duration entry. */
export function originalTimeoutRemaining(state,item){return data(state,item).remaining;}
export function setOriginalTimeout(state,item,time){data(state,item).remaining=scalar(time);}
export function addOriginalTimeout(state,item,time,limit){time=scalar(time);const row=data(state,item);if(limit===undefined){row.remaining=f(row.remaining+time);return;}limit=scalar(limit);if(time>0&&f(row.remaining+time)>limit)time=Math.max(0,f(limit-row.remaining));row.remaining=f(row.remaining+time);if(row.remaining<0)row.remaining=0;}
export function removeOriginalTimeout(state,item){const index=state.items.findIndex(row=>row.item===item);if(index>=0)state.items.splice(index,1);}
export function clearOriginalTimeoutTracker(state){state.items.length=0;}
export function advanceOriginalTimeoutTracker(state,amount){amount=scalar(amount);for(let i=0;i<state.items.length;){const row=state.items[i];row.remaining=f(row.remaining-amount);if(row.remaining<=0)state.items.splice(i,1);else i++;}}
