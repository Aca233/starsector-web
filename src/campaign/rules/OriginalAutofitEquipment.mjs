/** CoreAutofitPlugin equipment selection/execution (0.98a-RC8), not a standard-variant copier. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalJavaRandom,originalJavaNextFloat,originalJavaNextInt} from './OriginalJavaRandom.mjs';
import {originalInflaterMakePicks} from './OriginalFleetInflater.mjs';
const f=Math.fround;
export const autofitCheck=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_AUTOFIT',m);
export const autofitCall=(s,k,...args)=>{autofitCheck(typeof s?.[k]==='function','Actual native autofit service required: '+k);const value=s[k](...args);autofitCheck(!value||typeof value.then!=='function','Autofit services must be synchronous');return value;};
export const autofitInt=n=>{autofitCheck(typeof n==='number'&&!Number.isNaN(n),'Actual numeric autofit result required');return Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));};
export function autofitOption(session,id){const entry=session.options.find(([key])=>key===id);autofitCheck(entry&&typeof entry[1]==='boolean','Actual autofit option required: '+id);return entry[1];}
const check=autofitCheck,call=autofitCall;
export const autofitWeaponId=(v,id)=>v.weapons.find(([slot])=>slot===id)?.[1]??null;
export const autofitWingId=(v,index)=>v.wings[index]||null;
const tags=spec=>{check(Array.isArray(spec?.tags),'Actual ordered spec tags required');return spec.tags;};
const size=spec=>{const n=['SMALL','MEDIUM','LARGE'].indexOf(spec.size);check(n>=0,'Actual weapon size required');return n;};
const hints=spec=>{check(Array.isArray(spec.aiHints),'Actual weapon AI hints required');return spec.aiHints;};
function category(session,id){const entries=session.classState.categoryEntries;check(Array.isArray(entries),'Actual shared autofit category aliases required');return entries.find(([key])=>key===id)?.[1]??null;}
export function originalAutofitTagLevel(session,tag){
 const cache=session.classState.tagLevels;check(Array.isArray(cache),'Actual shared autofit tag-level history required');const known=cache.find(([key])=>key===tag);if(known)return f(known[1]);
 const cat=category(session,tag);let value=-1;
 if(cat!==null&&typeof tag==='string'){const suffix=tag.split(cat.base).join('');if(suffix.trim()!==''&&Number.isFinite(Number(suffix)))value=autofitInt(f(Number(suffix)));}
 cache.push([tag,value]);return f(value);
}
const categoryTag=(cat,spec)=>tags(spec).find(tag=>cat.tags.includes(tag))??null;
/** WeightedRandomPicker uses nextFloat and <=, including a single remaining candidate. */
export function originalAutofitWeightedPick(rows,random){
 if(rows.length===0)return null;let total=0;for(const row of rows)total=f(total+row[1]);let roll=f(originalJavaNextFloat(random)*total);if(roll>total)roll=total;let sum=0;
 for(const [item,weight]of rows){sum=f(sum+weight);if(roll<=sum)return item;}return rows.at(-1)[0];
}
const norm=n=>{n=f(n%360);return n<0?f(n+360):n;};
const angleDiff=(a,b)=>{const d=norm(f(a-b));return d>180?f(360-d):d;};
const inArc=(direction,arc)=>{if(arc>=360)return true;if(direction<0)direction=f(360+direction);let from=f(direction-f(arc/2)),to=f(direction+f(arc/2));if(from<0)from=f(360+from);if(from>360)from=f(from-360);if(to<0)to=f(360+to);if(to>360)to=f(to-360);return 0>=from&&0<=to||0>=from&&from>to||0<=to&&from>to;};
const arcDistance=slot=>{const d=norm(slot.angle),half=f(slot.arc/2),one=f(Math.abs(d)-half),two=f(Math.abs(f(360-Math.abs(d)))-half);return one<=0||two<=0?0:Math.min(one,two);};
export function originalAutofitSlotScore(slot){let score=[2500,5000,10000][size(slot)];if(inArc(slot.angle,slot.arc))score=f(score+f(180-angleDiff(slot.angle,0)));return score;}
const identityMapPut=(rows,key,value)=>{const row=rows.find(([k])=>k===key);if(row)row[1]=value;else rows.push([key,value]);};
const removeKey=(rows,key)=>{const index=rows.findIndex(([k])=>k===key);if(index>=0)rows.splice(index,1);};
function fittedPut(session,kind,key,value){
 const rows=session[kind],field=kind==='fittedWeapons'?'fittedWeaponMapCapacity':'fittedFighterMapCapacity';let capacity=session[field];check(Number.isInteger(capacity),'Actual fitted-equipment HashMap capacity required');
 const known=rows.find(([id])=>id===key);if(known){known[1]=value;return;}
 const hash=id=>{let h=0;for(let i=0;i<id.length;i++)h=(Math.imul(31,h)+id.charCodeAt(i))|0;return (h^(h>>>16))>>>0;};rows.push([key,value]);
 if(rows.filter(([id])=>(hash(id)&(capacity-1))===(hash(key)&(capacity-1))).length>8){check(capacity<64,'Treeified fitted-equipment map requires native comparator');capacity*=2;}
 if(rows.length>capacity*.75)capacity*=2;rows.sort(([a],[b])=>(hash(a)&(capacity-1))-(hash(b)&(capacity-1)));session[field]=capacity;
}
export function createOriginalAutofitEquipment(session,services,delegate){
 const s=services,d=delegate,level=tag=>originalAutofitTagLevel(session,tag),priority=(kind,spec)=>call(d,'isPriority',kind,spec);
 const weapon=(v,id)=>{const key=autofitWeaponId(v,id);return key===null?null:call(s,'readWeaponSpec',key);};
 const wing=(v,index)=>{const key=autofitWingId(v,index);return key===null?null:call(s,'readFighterSpec',key);};
 const costStats=v=>call(s,'readCostStats',v),weaponCost=(spec,v)=>f(call(s,'readWeaponOPCost',spec,session.stats,costStats(v))),fighterCost=(spec,v)=>f(call(s,'readFighterOPCost',spec,costStats(v)));
 const opLeft=v=>f(f(call(s,'readVariantOPCost',v,session.stats))*-1+f(call(s,'readOrdnancePoints',v,session.stats)));
 function stock(kind){
  const buy=autofitOption(session,'buy_from_market'),storage=autofitOption(session,'use_from_storage'),cargo=autofitOption(session,'use_from_cargo'),black=autofitOption(session,'black_market');
  const automated=kind==='fighter'?call(d,'isAutomatedShip'):false;
  return [...call(d,kind==='weapon'?'getAvailableWeapons':'getAvailableFighters')].filter(w=>!((!buy&&w.price>0)||(automated&&!tags(w.spec).includes('auto_fighter'))||(!storage&&w.price<=0&&w.submarket!==null)||(!cargo&&w.submarket===null)||(!black&&w.submarket!==null&&call(d,'isBlackMarket',w.submarket))));
 }
 function finish(best,desired,used){
  const matches=best.filter(w=>w.id===desired.id),free=matches.find(w=>w.price<=0);if(free)return free;if(matches.length)return matches[0];
  let hasFree=false,nonBlack=false;for(const w of best){if(w.price<=0)hasFree=true;if(w.submarket===null||!call(d,'isBlackMarket',w.submarket))nonBlack=true;}
  if(hasFree)best=best.filter(w=>w.price<=0);else if(nonBlack)best=best.filter(w=>w.submarket===null||!call(d,'isBlackMarket',w.submarket));
  for(const w of best)if(used.has(w.id))return w;return originalAutofitWeightedPick(best.map(w=>[w,1]),session.random);
 }
 function bestMatch(kind,desired,useBetter,catId,used,possible,slot=null){
  const cat=category(session,catId);if(cat===null)return null;const desiredTag=categoryTag(cat,desired),desiredLevel=kind==='weapon'&&desiredTag===null?10000:level(desiredTag);
  let bestScore=-1,bestPriority=false,bestSize=-1,best=[],iter=0;
  for(const w of possible){iter++;const spec=w.spec,tag=categoryTag(cat,spec);if(tag===null)continue;
   if(kind==='weapon'&&!hints(desired).includes('PD')&&tags(spec).includes('SR')&&(!tags(desired).includes('SR')||tags(desired).includes('LR')))continue;
   const isPriority=cat.base===spec.autofitCategory&&priority(kind,spec),n=kind==='weapon'?size(spec):0;
   const better=(kind!=='weapon'||n>=bestSize)&&isPriority&&!bestPriority,worse=(kind!=='weapon'||n<=bestSize)&&!isPriority&&bestPriority;if(worse)continue;
   let score=level(tag);if(!session.randomize&&!useBetter&&!better&&score>desiredLevel)continue;
   let magnitude=0;if(kind==='fighter')magnitude=session.randomize?20:call(d,'allowSlightRandomization')?2:0;else if(desired.size===spec.size)magnitude=session.randomize?20:call(d,'allowSlightRandomization')?4:0;
   if(magnitude>0){
    if(kind==='weapon'){
     const symmetric=originalJavaNextFloat(session.random)<f(.75);
     if(slot!==null&&symmetric){const half=autofitInt(f(slot.location[0]/2)),abs=half===-2147483648?half:Math.abs(half),seed=BigInt.asIntN(64,BigInt(abs)*723489413945245311n)^1181783497276652981n,r=createOriginalJavaRandom(String(BigInt.asIntN(64,(seed+BigInt(session.weaponFilterSeed))*BigInt(iter))));score=f(score+originalJavaNextInt(r,magnitude));}
     else score=f(score+originalJavaNextInt(session.random,magnitude));
    }else score=f(score+originalJavaNextInt(session.random,magnitude));
   }
   if(score>bestScore||better){best=[w];bestScore=score;bestPriority=isPriority;bestSize=n;}else if(score===bestScore)best.push(w);
  }
  return finish(best,desired,used);
 }
 function possibleWeapons(slot,desired,current,availableOP,items){
  let result=[];
  for(const w of items){if(w.quantity<=0)continue;check(Object.hasOwn(w,'savedCostStats')&&Object.hasOwn(w,'cachedOPCost'),'Actual AvailableWeapon OP-cache state required');const stats=costStats(current);let cost;
   if(w.savedCostStats===stats&&w.cachedOPCost>=0)cost=w.cachedOPCost;else{cost=f(call(s,'readWeaponOPCost',w.spec,session.stats,stats));w.cachedOPCost=cost;w.savedCostStats=stats;}
   if(cost>availableOP||!call(s,'weaponFits',slot,w.spec))continue;
   if(w.spec!==desired&&(w.spec.type==='MISSILE'||hints(w.spec).includes('STRIKE'))&&!hints(w.spec).includes('DO_NOT_AIM')){const distance=arcDistance(slot);if(distance>45||(!hints(w.spec).includes('GUIDED_POOR')&&distance>20))continue;}result.push(w);
  }
  if(call(s,'isTutorialInProgress')&&call(s,'readHull',current).tags.includes('derelict'))result=result.filter(w=>w.id!=='heatseeker');return result;
 }
 function possibleFighters(current,availableOP,items){
  let result=items.filter(w=>w.quantity>0&&fighterCost(w.spec,current)<=availableOP);
  if(session.randomize){const random=createOriginalJavaRandom(session.weaponFilterSeed),count=Math.max(1,Math.trunc(result.length/3)*2);result=originalInflaterMakePicks(count,result.length,random).map(index=>result[index]);}return result;
 }
 function slots(current,target,upgrade){return [...call(s,'readWeaponSlots',current)].filter(slot=>!slot.builtIn&&!slot.decorative&&autofitWeaponId(target,slot.id)!==null&&(upgrade||autofitWeaponId(current,slot.id)===null)).sort((a,b)=>Math.sign(f(originalAutofitSlotScore(b)-originalAutofitSlotScore(a))));}
 function clearWeapon(slot,current){removeKey(session.fittedWeapons,current.hullVariantId+'_'+slot.id);call(d,'clearWeaponSlot',slot,current);}
 function clearFighter(index,current){removeKey(session.fittedFighters,current.hullVariantId+'_'+index);call(d,'clearFighterSlot',index,current);}
 function stripWeapons(current){for(const [id]of [...current.weapons]){const slot=call(s,'readWeaponSlots',current).find(row=>row.id===id);check(slot,'Actual fitted weapon slot required');if(slot.decorative||slot.builtIn||slot.hidden||slot.system||slot.stationModule)continue;clearWeapon(slot,current);}}
 function stripFighters(current){for(let index=0;index<20;index++)if(autofitWingId(current,index)!==null)clearFighter(index,current);}
 function fit(kind,current,target,upgrade){
  const used=new Set(),units=kind==='weapon'?slots(current,target,upgrade):Array.from({length:call(s,'computeNumFighterBays',current)},(_,i)=>i);
  for(const unit of units){const id=kind==='weapon'?unit.id:unit;if((kind==='weapon'?session.slotsToSkip:session.baysToSkip).includes(id))continue;
   let availableOP=opLeft(current),toBeat=-1;
   if(upgrade){const previous=kind==='weapon'?weapon(current,id):wing(current,id);if(previous!==null){availableOP=f(availableOP+(kind==='weapon'?weaponCost(previous,current):fighterCost(previous,current)));for(const tag of tags(previous))toBeat=Math.max(toBeat,level(tag));if(priority(kind,previous))toBeat=f(toBeat+1000);}}
   else if(kind==='fighter'&&autofitWingId(current,id)!==null)continue;
   let desired,possible;
   if(kind==='weapon'){desired=weapon(target,id);if(desired===null)continue;possible=possibleWeapons(unit,desired,current,availableOP,stock(kind));if(possible.length===0)continue;}
   else{possible=possibleFighters(current,availableOP,stock(kind));if(possible.length===0)continue;let desiredId=autofitWingId(target,id);if(desiredId===null){if(session.randomize)desiredId=session.emptyWingTarget;else continue;}desired=call(s,'readFighterSpec',desiredId);if(desired===null)continue;}
   check(Array.isArray(desired.autofitCategories),'Actual ordered autofit categories required');let cats=desired.autofitCategories;const map=kind==='weapon'?session.altWeaponCats:session.altFighterCats,prior=map.find(([spec])=>spec===desired);let alternate=prior?.[1]??null;
   if(kind==='weapon'){session.classState.randomizeChance=1;if(session.randomize)identityMapPut(map,desired,[]);}
   else if(session.randomize){check(typeof session.classState.randomizeChance==='number','Actual shared RANDOMIZE_CHANCE history required');if(alternate!==null||originalJavaNextFloat(session.random)<session.classState.randomizeChance){if(alternate===null){alternate=[];for(const catId of cats){const cat=category(session,catId);if(cat!==null&&cat.fallback.length){const index=originalJavaNextInt(session.random,cat.fallback.length-1)+1;if(index!==0)alternate.push(cat.fallback[index]);}}identityMapPut(map,desired,alternate);}if(alternate.length)cats=alternate;}else identityMapPut(map,desired,[]);}
   let pick=null;for(const catId of cats){pick=bestMatch(kind,desired,upgrade,catId,used,possible,kind==='weapon'?unit:null);if(pick!==null||upgrade)break;}
   if(pick===null&&!upgrade){outer:for(const catId of cats){const cat=category(session,catId);if(cat===null)continue;for(const fallback of cat.fallback){pick=bestMatch(kind,desired,true,fallback,used,possible);if(pick!==null)break outer;}}}
   if(pick===null)continue;
   if(upgrade){let pickLevel=-1;if(cats.length){const cat=category(session,cats[0]);if(cat!==null){pickLevel=level(categoryTag(cat,pick.spec));if(priority(kind,pick.spec))pickLevel=f(pickLevel+1000);}}if(pickLevel<=toBeat)continue;}
   used.add(pick.id);
   if(kind==='weapon'){clearWeapon(unit,current);call(d,'fitWeaponInSlot',unit,pick,current);fittedPut(session,'fittedWeapons',current.hullVariantId+'_'+id,pick);if(pick.spec.type==='MISSILE'&&pick.spec.usesAmmo)session.missilesWithAmmoOnCurrent=(session.missilesWithAmmoOnCurrent+1)|0;}
   else{clearFighter(id,current);call(d,'fitFighterInSlot',id,pick,current);fittedPut(session,'fittedFighters',current.hullVariantId+'_'+id,pick);}
  }
 }
 return {stripWeapons,stripFighters,clearWeapon,clearFighter,fitWeapons:(c,t,u)=>fit('weapon',c,t,u),fitFighters:(c,t,u)=>fit('fighter',c,t,u),bestMatch,possibleWeapons,possibleFighters};
}
