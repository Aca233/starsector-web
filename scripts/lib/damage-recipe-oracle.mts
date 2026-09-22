/** Independent expansion oracle: never calls candidate capture/replay/decoder. */
import {normalizedProjection} from './damage-view-oracle.mts';
function next(cursor:{state:number}) {
 let x=(cursor.state+=0x6d2b79f5)>>>0;
 x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);
 return ((x^(x>>>14))>>>0)/4294967296;
}
export function normalizedDamageRecipe(frame:any) {
 const visit=(v:any):any=>{
  if(!v||typeof v!=='object')return v;
  if(Array.isArray(v))return v.map(visit);
  if(v.$damageMarks===1)return v.rows.map((row:number[])=>{
   const [gId,cell,state,opacity,intensity]=row,g=v.geometry[gId],rng={state};
   const a=next(rng),b=next(rng),kind=b>.75?'burns':a>.75?'holes':'cracks',variant=next(rng)>.5?0:1;
   const rotationRad=next(rng)*Math.PI*2,size=Math.max(g[4]*1.5,40)*(1+.5*next(rng));
   return {cellIndex:cell,localPos:{$vector:[g[2]+(cell%g[0]+.5)*g[4],g[3]+(Math.floor(cell/g[0])+.5)*g[5]]},opacity,intensity,size,rotationRad,kind,variant};
  });
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));
 };
 return normalizedProjection(visit(frame),true);
}
