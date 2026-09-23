/** Original positional one-shot admission. Local presentation only: never use the world RNG. */
import R from '../data/reference-campaign-contact-sounds.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CAMPAIGN_AUDIO',m);
const scalar=v=>{check(typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(f(v)),'Actual finite sound float required');return f(v);};
const point=v=>{check(Array.isArray(v)&&v.length===2,'Actual sound position required');return v.map(scalar);};
const distance=(a,b)=>{const x=f(a[0]-b[0]),y=f(a[1]-b[1]);return f(Math.sqrt(f(f(x*x)+f(y*y))));};
export function createOriginalCampaignAudio(){return {scope:'native-campaign-audio',recent:[]};}
/** M.playAll ages both queued and previous sounds AFTER admission, even with dt=0. */
export function selectOriginalCampaignSounds(state,effects,context,services={}){
 check(state?.scope==='native-campaign-audio'&&Array.isArray(state.recent),'Actual local sound queue required');
 const listener=point(context.listener),seconds=scalar(context.seconds);check(seconds>=0&&Array.isArray(effects),'Actual sound frame required');
 const recent=state.recent.map(row=>({...row,position:[...row.position]})),shots=[],unsupported=[];
 for(const effect of effects){
  if(effect?.kind!=='campaign-sound')continue;
  const samples=services.readSoundSpec?services.readSoundSpec(effect.id):Object.hasOwn(R.specs,effect.id)?R.specs[effect.id]:null;
  if(!samples){unsupported.push(effect.id);continue;}
  check(Array.isArray(samples),'Actual sample set required');if(!samples.length)continue;
  const random=services.random?services.random():Math.random();check(Number.isFinite(random)&&random>=0&&random<1,'Sound random must be in [0,1)');
  const sample=samples[Math.floor(random*samples.length)],position=point(effect.position);point(effect.velocity);
  const pitch=f(scalar(sample.pitch)*scalar(effect.pitch)),volume=f(scalar(sample.volume)*scalar(effect.volume));
  check(typeof sample.file==='string'&&sample.file.length>0&&pitch>0&&Number.isFinite(pitch)&&Number.isFinite(volume),'Actual playable sound sample required');
  if(distance(listener,position)>R.maxDistance||volume<=0)continue;
  // The comparison is on the chosen FILE, not the symbolic sound-set id.
  if(recent.some(row=>row.file===sample.file&&Math.abs(f(row.pitch-pitch))<f(.2)&&Math.abs(f(row.volume-volume))<f(.2)&&distance(row.position,position)<=300))continue;
  const shot={file:sample.file,pitch,volume,position,velocity:[0,0],age:0};recent.push(shot);shots.push(shot);
 }
 for(const row of recent)row.age=f(row.age+seconds);
 state.recent=recent.filter(row=>row.age<=f(.05));return {shots,unsupported};
}
