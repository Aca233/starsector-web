/** Shared shield presentation math. Inputs are scalar state, never a simulator. */
export const PHASE_MIN_SPEED_MULT = .33;
export const PHASE_BASE_FLUX_LEVEL_FOR_MIN_SPEED = .5;
export const shieldUnfoldRate=(type:string,radius:number,multiplier:number):number=>100*180/(Math.PI*Math.max(1,radius))*(type==='FRONT'?2:1)*multiplier;
export function shieldVisualAlpha(active:boolean,closing:number,arc:number,currentArc:number,rate:number):number {
 if(!active)return closing/.35;
 const fade=Math.min(.75,arc/rate);
 return fade>0?Math.min(1,currentArc/rate/fade):1;
}
export const shieldRenderArc=(arc:number,currentArc:number):number=>(arc+10)*(arc<=0?0:Math.max(0,Math.min(1,currentArc/arc)))*Math.PI/180;
export const phaseEngaged=(state:string):boolean=>state==='IN'||state==='ACTIVE'||state==='OUT';
export const shieldPhased=(type:string,state:string,effect:number):boolean=>type==='PHASE'&&(state==='IN'||state==='ACTIVE'||state==='OUT'&&effect>.5);
export const phaseCooldown=(state:string,duration:number,timer:number):number=>state==='COOLDOWN'&&duration>0?Math.max(0,Math.min(1,timer/duration)):0;
export function phaseSpeed(engaged:boolean,hardFluxLevel:number,thresholdMultiplier:number,effect:number):number {
 if(!engaged)return 1;
 const threshold=PHASE_BASE_FLUX_LEVEL_FOR_MIN_SPEED*thresholdMultiplier;
 if(threshold<=0)return PHASE_MIN_SPEED_MULT;
 let disruption=hardFluxLevel/threshold;
 if(disruption>1)disruption=1;
 if(disruption<=0)return 1;
 return PHASE_MIN_SPEED_MULT+(1-PHASE_MIN_SPEED_MULT)*(1-disruption*effect);
}
