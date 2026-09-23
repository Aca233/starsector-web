/** FleetMemberStatus/ShipStatus.updateFromAutoresolveData, with the actual shared Web Math.random stream. */
import R from '../data/reference-fleet-accidents.json' with {type:'json'};
import {ORIGINAL_FLEET_MEMBERS} from './OriginalFleetMembers.mjs';
import {ORIGINAL_STORAGE} from './OriginalStorage.mjs';
import {originalNativeMemberStatus} from './OriginalNativeRepair.mjs';
import {originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_AUTORESOLVE_DAMAGE',m);
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),'Actual float '+label+' required');return n;};
function moduleHull(member,status,module){
 const slots=member.variant.effects.stationModules.filter(([slot])=>ORIGINAL_FLEET_MEMBERS.hulls[member.variant.hullId]?.slots[slot]==='STATION_MODULE');
 const index=status.modules.indexOf(module)-1;let variant=member.variant;
 if(index>=0&&index<slots.length){const [slot,id]=slots[index];module.moduleSlotId=slot;variant=ORIGINAL_STORAGE.variants[id];check(variant,'Actual station module variant required');}
 const hull=R.hulls[variant.hullId];check(hull,'Actual public hull geometry required');return hull;
}
/** maxHits/shields/hits are actual fields of the native autoresolve data object, not a direct hull damage fraction. */
export function applyOriginalNativeAutoresolveDamage(member,data,globalRandom,services={}){
 check(data.memberRef===member.objectRef,'Autoresolve member identity mismatch');validateOriginalJavaRandom(globalRandom);
 const maxHits=number(data.maxHits,'maximum hits'),shields=number(data.shields,'shields'),hits=number(data.hits,'hits');check(maxHits>0,'Positive native maximum hits required');
 const status=originalNativeMemberStatus(member,services),fraction=f(f(maxHits-Math.max(0,f(hits-shields)))/maxHits);
 for(let index=0;index<status.modules.length;index++){
  const module=status.modules[index],before=number(module.hullFraction,'module hull fraction');let remaining=fraction;
  // Java evaluates Math.random() > remaining before checking index != 0.
  if(f(originalJavaNextDouble(globalRandom))>remaining&&index!==0)remaining=0;
  if(remaining>=1)continue;
  const destroyed=remaining<=0;if(remaining>before)remaining=before;
  const hullDamage=remaining<=f(.75);module.hullFraction=remaining>f(.75)?1:Math.max(0,Math.min(1,f(remaining/f(.75))));
  module.hullDamageTaken=Math.max(number(module.hullDamageTaken,'saved hull damage counter'),f(before-module.hullFraction));
  const hull=moduleHull(member,status,module),w=hull.gridWidth,h=hull.gridHeight;module.gridWidth=w;module.gridHeight=h;
  let grid=module.armorCellFractions;
  if(grid===null||grid.length<4||grid.length!==w||grid[0].length<4||grid[0].length!==h)grid=module.armorCellFractions=Array.from({length:w},()=>Array(h).fill(1));
  check(grid.every(col=>col.length===h),'Ragged actual armor grid');
  let patches=1+Math.trunc(f(f(originalJavaNextDouble(globalRandom))*f(hull.hullSizeOrdinal)));if(hull.hullSizeOrdinal>=4)patches++;if(destroyed)patches=Math.trunc(f(f(patches)*2));
  if(w<4||h<4)continue;
  for(let patch=0;patch<patches;patch++){
   const amount=hullDamage?1:f(f(f(1-remaining)/f(.25))*Math.max(f(f(originalJavaNextDouble(globalRandom))-f(.25)),0));
   const x=Math.trunc(originalJavaNextDouble(globalRandom)*(w-4)+2),y=Math.trunc(originalJavaNextDouble(globalRandom)*(h-4)+2);
   if(x<2||y<2||x>=w-2||y>=h-2)continue;
   for(let gx=x-2;gx<=x+2;gx++)for(let gy=y-2;gy<=y+2;gy++){
    const next=Math.max(0,gx===0&&gy===0?f(1-amount):f(1-f(amount*(gx%2===0&&gy%2===0?f(.5):1))));if(next<grid[gx][gy])grid[gx][gy]=next;
   }
  }
 }
 status.hullFractions=status.modules.map(module=>module.hullFraction);return status;
}
