/** BattleAutoresolverPluginImpl.applyDamageToFleetMember and ShipStatus damage.
 * Separate from the older updateFromAutoresolveData entry used by fleet accidents. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import GEOMETRY from '../data/reference-fleet-accidents.json' with {type:'json'};
import SYNC from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {originalNativeMemberStatus} from './OriginalNativeRepair.mjs';
import {getOriginalMemberStats} from './OriginalMemberEffects.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalMemberModuleSlots,originalMemberModuleVariant} from './OriginalMemberViewModules.mjs';
import {originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_BATTLE_DAMAGE',m);
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual battle damage service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','Synchronous battle damage service required');return v;};
const scalar=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),'Actual float '+label+' required');return n;};
export function originalBattleDamageHull(variant,services={}){
 const value=services.readBattleDamageHull?call(services,'readBattleDamageHull',variant):R.hulls[variant.hullId];
 check(value&&Object.hasOwn(value,'shieldType'),'Actual battle hull specification required');return value;
}
export function originalBattleModuleActive(variant,services={}){
 if(services.isBattleModuleActive){const value=call(services,'isBattleModuleActive',variant);check(typeof value==='boolean','Actual module activity required');return value;}
 const hull=SYNC.hulls[variant.hullId];check(hull,'Actual module hull required');
 if(hull.ordnancePoints>0)return true;
 // The native method checks weapon GROUPS, including empty groups, not fitted weapons.
 const groups=variant.groupSpecs??(services.readBattleVariantWeaponGroups?call(services,'readBattleVariantWeaponGroups',variant):undefined);
 check(Array.isArray(groups),'Actual module weapon-group list required');return groups.length>0||hull.fighterBays>0;
}
function variantAt(member,index,services){
 if(index===0)return member.variant;
 const row=originalMemberModuleSlots(member,services)[index-1];check(row,'Missing native module slot');
 return originalMemberModuleVariant(member,row.slot,row.variantId,services);
}
function statusVariant(member,status,module,services){
 // ShipStatus.getVariant finds the FIRST identical status, even for aliased entries.
 const index=status.modules.indexOf(module);
 if(index<=0||index>originalMemberModuleSlots(member,services).length)return member.variant;
 const row=originalMemberModuleSlots(member,services)[index-1];module.moduleSlotId=row.slot.id;
 return originalMemberModuleVariant(member,row.slot,row.variantId,services);
}
function statusRandom(member,status,services){
 const random=Object.hasOwn(status,'random')?status.random:call(services,'readBattleStatusRandom',member,status);
 check(random===null||random?.kind==='java-random-lcg48','Actual nullable transient status random required');
 if(random!==null)validateOriginalJavaRandom(random);return random;
}
function statusBonus(member,fleet,key,status,module,services,hullKey){
 const modifiers=getOriginalMemberStats(member,fleet)[key];
 const base=originalBattleDamageHull(statusVariant(member,status,module,services),services)[hullKey];
 return effective({base,modifiers});
}
function stat(member,fleet,key){return effective(getOriginalMemberStats(member,fleet)[key]);}
function applyShipDamage(member,fleet,status,module,amount,fraction,services){
 const variant=()=>statusVariant(member,status,module,services);
 if(module.gridWidth===0||module.gridHeight===0){
  const hull=variant(),g=services.readBattleDamageGeometry?call(services,'readBattleDamageGeometry',hull):GEOMETRY.hulls[hull.hullId];
  check(g&&Number.isInteger(g.gridWidth)&&Number.isInteger(g.gridHeight),'Actual armor geometry required');module.gridWidth=g.gridWidth;module.gridHeight=g.gridHeight;
 }
 const w=module.gridWidth,h=module.gridHeight;check(Number.isInteger(w)&&Number.isInteger(h),'Actual armor grid size required');
 // Both Math.random calls happen even when the status-local Random overrides them.
 let x=Math.trunc(originalJavaNextDouble(services.globalRandom)*(w-4)+2),y=Math.trunc(originalJavaNextDouble(services.globalRandom)*(h-4)+2);
 const random=statusRandom(member,status,services);
 if(random!==null){x=Math.trunc(originalJavaNextDouble(random)*(w-4)+2);y=Math.trunc(originalJavaNextDouble(random)*(h-4)+2);}
 if(x<2||y<2||x>=w-2||y>=h-2)return;
 let grid=module.armorCellFractions;
 if(grid===null||grid.length<4||grid.length!==w||grid[0].length<4||grid[0].length!==h)grid=module.armorCellFractions=Array.from({length:w},()=>Array(h).fill(1));
 check(grid.every(col=>Array.isArray(col)&&col.length===h),'Ragged actual armor grid');
 let armor=statusBonus(member,fleet,'armorBonus',status,module,services,'armorRating');
 amount=f(amount*stat(member,fleet,'armorDamageTakenMult'));if(armor<1)armor=1;
 const localArmor=f(scalar(grid[x][y],'armor cell')*armor);
 let reduction=f(localArmor/f(localArmor+amount));if(reduction>R.settings.maxArmorDamageReduction)reduction=R.settings.maxArmorDamageReduction;
 const damage=f(f(1-reduction)*amount);let overflow=0;
 for(let gx=x-2;gx<=x+2;gx++)for(let gy=y-2;gy<=y+2;gy++){
  if((gx===x-2||gx===x+2)&&(gy===y-2||gy===y+2))continue;
  // Preserve the native absolute-coordinate parity and 1/15 conversion, not a radial approximation.
  const used=f(damage*(gx===0&&gy===0||gx%2===0&&gy%2===0?f(.06666667):f(.033333335)));
  let remaining=f(f(scalar(grid[gx][gy],'armor cell')*armor)*f(.06666667));remaining=f(remaining-used);
  if(remaining<0){overflow=f(overflow-remaining);remaining=0;}grid[gx][gy]=f(remaining/armor);
 }
 let hp=statusBonus(member,fleet,'hullBonus',status,module,services,'hitpoints');if(hp<1)hp=1;
 overflow=f(overflow*stat(member,fleet,'hullDamageTakenMult'));if(fraction>0)overflow=f(hp*fraction);
 const loss=f(overflow/hp);module.hullDamageTaken=f(scalar(module.hullDamageTaken,'hull damage counter')+Math.min(module.hullFraction,loss));
 module.hullFraction=Math.max(0,f(module.hullFraction-loss));
 // ShipStatus.applyDamage does not increment armorDamageTaken.
}
export function resetOriginalBattleDamageTaken(member,services={}){
 const status=originalNativeMemberStatus(member,services);for(const module of status.modules){module.hullDamageTaken=0;module.armorDamageTaken=0;}return status;
}
export function applyOriginalBattleHullFractionDamage(member,fleet,fraction,index=0,services={}){
 scalar(fraction,'hull damage fraction');validateOriginalJavaRandom(services.globalRandom);
 const status=originalNativeMemberStatus(member,services),module=status.modules[index];check(module,'Actual indexed ship status required');
 const amount=f(statusBonus(member,fleet,'armorBonus',status,module,services,'armorRating')*2);
 applyShipDamage(member,fleet,status,module,amount,fraction,services);status.hullFractions=status.modules.map(m=>m.hullFraction);return status;
}
export function applyOriginalBattleMemberDamage(member,fleet,fraction,services={}){
 scalar(fraction,'battle hull damage fraction');if(member.type==='FIGHTER_WING'||fraction<=0)return;
 const status=originalNativeMemberStatus(member,services),count=f(status.modules.length),slots=originalMemberModuleSlots(member,services);
 check(!(f(count-1)>slots.length&&count>1),'More native statuses than variant modules');let activeRemaining=false;
 const apply=(amount,index)=>applyOriginalBattleHullFractionDamage(member,fleet,amount,index,services);
 for(let i=0;i<count;i++){
  const variant=variantAt(member,i,services),module=status.modules[i];check(Array.isArray(variant.effects?.hullMods),'Actual module hullmods required');
  if(variant.effects.hullMods.includes('vastbulk')){
   const damage=Math.min(fraction,f(.9)),hits=Math.max(1,Math.min(5,f(damage/f(.1))));
   for(let j=0;j<hits;j++){apply(f(damage/hits),i);module.hullFraction=1;}
  }else if(i<=0||originalBattleModuleActive(variant,services)){
   let mult=1;if(i>0)mult=f(f(originalJavaNextDouble(services.globalRandom))*2);
   const damage=f(fraction*mult);if(damage<=0)continue;
   apply(damage,i);const hits=Math.max(1,Math.min(5,f(damage/f(.1))));
   for(let j=0;j<hits;j++)apply(f(f(damage/hits)+f(.001)),i);
   if(i>0&&module.hullFraction<=0)module.detached=true;
   if(originalBattleModuleActive(variant,services)&&(module.detached!==true||module.hullFraction>0))activeRemaining=true;
  }
 }
 if(count>1){
  let farthest=0;
  const distance=index=>{const row=originalMemberModuleSlots(member,services)[index-1];check(row,'Actual module weapon slot required');const [x,y]=row.slot.location;return f(Math.sqrt(f(f(x*x)+f(y*y))));};
  for(let i=1;i<count;i++)if(status.modules[i].detached===true&&originalBattleModuleActive(variantAt(member,i,services),services)){const d=distance(i);if(d>farthest)farthest=d;}
  for(let i=1;i<count;i++)if(status.modules[i].detached!==true){const v=variantAt(member,i,services);if(!v.effects.hullMods.includes('vastbulk')&&!originalBattleModuleActive(v,services)&&distance(i)<=f(farthest+200)){status.modules[i].hullFraction=0;status.modules[i].detached=true;}}
 }
 if(!activeRemaining||fraction>=1)for(let i=0;i<count;i++){status.modules[i].hullFraction=0;if(i>0)status.modules[i].detached=true;}
 status.hullFractions=status.modules.map(m=>m.hullFraction);return status;
}
