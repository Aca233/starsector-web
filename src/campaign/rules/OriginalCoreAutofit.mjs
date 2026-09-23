/** Original CoreAutofitPlugin.doFit and its OP/hullmod phases. Missing world/spec services fail explicitly. */
import {autofitCheck as check,autofitCall as call,autofitInt as jint,autofitOption as option,autofitWeaponId,autofitWingId,originalAutofitWeightedPick,createOriginalAutofitEquipment} from './OriginalAutofitEquipment.mjs';
import {originalJavaNextFloat,originalJavaNextLong,originalJavaNextInt} from './OriginalJavaRandom.mjs';
const f=Math.fround;
const M={reinforced:'reinforcedhull',doors:'blast_doors',hardened:'hardened_subsystems',coil:'fluxcoil',distributor:'fluxdistributor',itu:'targetingunit',dtc:'dedicated_targeting_core',advanced:'advancedcore',distributed:'distributed_fire_control',fragile:'fragile_subsystems',safety:'safetyoverrides',armored:'armoredweapons'};
const add=(rows,id)=>{if(!rows.includes(id))rows.push(id);};
function mapPut(rows,key,value){const old=rows.find(([id])=>id===key);if(old)old[1]=value;else rows.push([key,value]);}
export function executeOriginalCoreAutofit(session,current,target,maxSMods,services,delegate){
 check(session?.scope==='native-core-autofit-session','Actual CoreAutofit session required');
 const s=services,d=delegate,equip=createOriginalAutofitEquipment(session,s,d),hull=v=>call(s,'readHull',v),size=v=>hull(v).hullSize,has=(v,id)=>v.effects.hullMods.includes(id),phase=v=>hull(v).phase;
 const mod=id=>call(s,'readHullmodSpec',id),cost=(spec,v)=>jint(call(s,'readHullmodCost',spec,size(v)));
 const points=v=>jint(call(s,'readOrdnancePoints',v,session.stats)),left=v=>{const used=jint(call(s,'readVariantOPCost',v,session.stats));return (points(v)-used)|0;};
 const maxFlux=(v,kind)=>{const base=({CAPITAL_SHIP:50,CRUISER:30,DESTROYER:20,FRIGATE:10,FIGHTER:5})[size(v)]??100;return session.stats===null?base:jint(call(s,'readMaxFluxBonus',session.stats,kind,base));};
 const nonBuilt=v=>v.effects.hullMods.filter(id=>!hull(v).builtInMods.includes(id)&&!v.effects.permaMods.includes(id));
 function addMod(v,id){if(v.effects.suppressedMods.includes(id)||has(v,id))return;v.hasOpAffectingMods=null;v.effects.hullMods.push(id);}
 function removeMod(v,id){if(!v.effects.suppressedMods.includes(id)&&(hull(v).builtInMods.includes(id)||v.effects.permaMods.includes(id)))return;const i=v.effects.hullMods.indexOf(id);if(i>=0){v.effects.hullMods.splice(i,1);v.hasOpAffectingMods=null;}}
 function addPerma(v,id){add(v.effects.permaMods,id);add(v.effects.sMods,id);addMod(v,id);v.hasOpAffectingMods=null;}
 function addFlux(amount,v,maximum,kind){const field=kind==='vents'?'fluxVents':'fluxCapacitors',old=v.effects[field];let wanted=(old+amount)|0;if(wanted>maximum)wanted=maximum;if(wanted<0)wanted=0;v.effects[field]=wanted;return (wanted-old)|0;}
 function extra(v,kind){const op=left(v);if(op>0)addFlux(op,v,maxFlux(v,kind),kind);}
 function ventsCaps(v,t,fraction){if(fraction<0)return;let op=left(v);const maxV=maxFlux(v,'vents'),maxC=maxFlux(v,'caps');let n=Math.max((jint(Math.ceil(f(t.effects.fluxVents*fraction)))-v.effects.fluxVents)|0,0);if(n>op)n=op;op=(op-addFlux(n,v,maxV,'vents'))|0;n=Math.max((jint(Math.ceil(f(t.effects.fluxCapacitors*fraction)))-v.effects.fluxCapacitors)|0,0);if(n>op)n=op;addFlux(n,v,maxC,'caps');}
 function extraBoth(v,t){let op=left(v);const maxV=maxFlux(v,'vents'),maxC=maxFlux(v,'caps');if(op<=0)return;const total=f((v.effects.fluxVents+v.effects.fluxCapacitors)|0),fraction=total>0?f(v.effects.fluxVents/total):1;op=(op-addFlux(jint(f(op*fraction)),v,maxV,'vents'))|0;op=(op-addFlux(op,v,maxC,'caps'))|0;addFlux(op,v,maxV,'vents');if(t!==null&&(f(t.effects.fluxVents)>f(t.effects.fluxCapacitors)||f(t.effects.fluxVents)>=maxV)){const vents=f(v.effects.fluxVents),caps=f(v.effects.fluxCapacitors),sum=f(vents+caps),desiredV=Math.min(jint(f(vents+f(caps*f(.5)))),maxV);v.effects.fluxVents=desiredV;v.effects.fluxCapacitors=Math.min(jint(f(sum-desiredV)),maxC);}}
 function possibleMod(spec,v,op){
  if(spec===null||has(v,spec.id))return 0;if(call(d,'isPlayerCampaignRefit')&&!call(d,'canChangeHullmod',spec.id))return 0;const amount=cost(spec,v);if(amount>op)return 0;
  const ship=call(d,'getShip');let previous=null;
  if(ship!==null){previous=call(s,'readShipVariant',ship);call(s,'setShipVariantForHullmodCheck',ship,v);}
  if(ship!==null&&spec.effect!==null&&call(s,'readShipVariant',ship)!==null&&!call(s,'isHullmodApplicable',spec,ship)&&!has(call(s,'readShipVariant',ship),spec.id)){if(previous!==null)call(s,'setShipVariantForHullmodCheck',ship,previous);return 0;}
  const item=call(s,'isHullmodItemAvailable',spec.id,call(d,'getFleetMember'),v,call(d,'getMarket'));if(!item){if(previous!==null)call(s,'setShipVariantForHullmodCheck',ship,previous);return 0;}
  if(previous!==null&&ship!==null)call(s,'setShipVariantForHullmodCheck',ship,previous);
  addMod(v,spec.id);
  if(ship!==null&&spec.id!==null&&spec.effect!==null&&!spec.tags.includes('do_not_apply_hullmod_during_autofit')){call(s,'applyHullmodBeforeShipCreation',spec,ship);call(s,'applyHullmodAfterShipCreation',spec,ship);}
  return amount;
 }
 function possibleModId(id,v,op){if(has(v,id))return 0;if(call(d,'isPlayerCampaignRefit')&&!call(d,'canChangeHullmod',id))return 0;return possibleMod(mod(id),v,op);}
 function hullmods(v,ids){
  if(session.fittingModule)return 0;let op=left(v),total=0;for(let id of ids){if(has(v,id))continue;if(!session.availableMods.includes(id)){if(id===M.itu&&['CRUISER','CAPITAL_SHIP'].includes(size(v)))id=M.dtc;else continue;}
   if(id===M.dtc&&session.availableMods.includes(M.itu))id=M.itu;const spec=mod(id);
   if(id===M.itu&&has(v,M.dtc)){removeMod(v,M.dtc);const amount=cost(mod(M.dtc),v);total=(total-amount)|0;op=(op+amount)|0;}
   if((has(v,M.advanced)||has(v,M.distributed))&&(id===M.itu||id===M.dtc))continue;
   if(phase(v)&&spec.tags.includes('non_phase')||!phase(v)&&spec.tags.includes('phase'))continue;
   const amount=possibleMod(spec,v,op);op=(op-amount)|0;total=(total+amount)|0;
  }return total;
 }
 function convert(v,num){if(num<=0)return 0;const choices=[];for(const id of v.effects.hullMods){if(v.effects.permaMods.includes(id)||hull(v).builtInMods.includes(id))continue;const spec=mod(id);if(spec.tags.includes('no_build_in'))continue;choices.push(spec);}choices.sort((a,b)=>(jint(call(s,'readSModOPCost',b,size(v)))-jint(call(s,'readSModOPCost',a,size(v))))|0);let count=0;for(let i=0;i<num&&i<choices.length;i++){addPerma(v,choices[i].id);count++;}return count;}
 function tradeFlux(v,id,kind,strict){let op=left(v);if(op<=0)return;const n=kind==='vents'?v.effects.fluxVents:v.effects.fluxCapacitors,amount=cost(mod(id),v),bound=f(op+f(n*f(.3)));if(strict?amount<bound:amount<=bound){const remove=(amount-op)|0;if(remove>0)op=(op-addFlux(-remove,v,1000,kind))|0;possibleModId(id,v,op);}}
 const coil=v=>tradeFlux(v,M.coil,'vents',true),distributor=v=>tradeFlux(v,M.distributor,'caps',false);
 function spare(v,t){if(left(v)<=0)return;const total=f((t.effects.fluxVents+t.effects.fluxCapacitors)|0),fraction=total>0?f(t.effects.fluxVents/total):1;if(fraction>=f(.5)){distributor(v);coil(v);}else{coil(v);distributor(v);}}
 function randomized(v,pre){
  let count=0;if(originalJavaNextFloat(session.random)>f(.5)){count++;if(originalJavaNextFloat(session.random)>f(.75))count++;}if(count<=0)return 0;
  const h=hull(v),omni=h.shieldType==='OMNI',front=h.shieldType==='FRONT',shield=omni||front,rows=[],candidate=(id,weight=1)=>{if(session.availableMods.includes(id))rows.push([id,weight]);};
  if(pre){
   if(omni&&h.shieldArc<270)candidate('frontemitter');if(shield&&h.shieldArc<=300)candidate('extendedshieldemitter');
   if(session.availableMods.includes('converted_hangar')&&h.hullSize!=='FRIGATE'&&h.fighterBays<=0){const faction=call(d,'getFaction'),chance=faction===null?f(.2):f(f(call(s,'readDoctrineCarriers',faction))/5);if(originalJavaNextFloat(session.random)<chance)candidate('converted_hangar');}
   if(!shield&&h.shieldType!=='PHASE')candidate('frontshield');if(h.fighterBays>=2)candidate('expanded_deck_crew');candidate('ecm');
   if(session.availableMods.includes(M.itu))candidate(M.itu,100);else if(['CRUISER','CAPITAL_SHIP'].includes(h.hullSize))candidate(M.dtc,100);
   if(shield){candidate('hardenedshieldemitter');candidate('stabilizedshieldemitter');}candidate('heavyarmor');if(!omni)candidate('insulatedengine');candidate('fluxbreakers',shield?1:10);candidate('unstable_injector');
  }else{candidate(M.armored);if(session.missilesWithAmmoOnCurrent>=2){candidate('missleracks',session.missilesWithAmmoOnCurrent);candidate('eccm');}}
  let total=0;const maximum=f(points(v)*f(.2));for(let index=0;index<count;index++){const id=originalAutofitWeightedPick(rows,session.random);if(id===null)break;rows.splice(rows.findIndex(([key])=>key===id),1);if(has(v,id)){index--;continue;}
   if(pre){const opposite=id==='extendedshieldemitter'?'frontemitter':id==='frontemitter'&&h.shieldArc>=180?'extendedshieldemitter':null,at=rows.findIndex(([key])=>key===opposite);if(at>=0)rows.splice(at,1);}
   total=f(hullmods(v,[id]));if(total>=maximum)break;
  }return jint(total);
 }
 let depth=0;
 function fit(v,t,max){
  check(++depth<=48,'Bounded module recursion required');check(v.effects&&t.effects&&Array.isArray(v.groupSpecs)&&Array.isArray(t.groupSpecs),'Actual complete mutable autofit variants required');
  const player=session.commander!==null&&call(s,'isCommanderPlayer',session.commander);
  if(!session.fittingModule){session.fittedWeapons.length=0;session.fittedFighters.length=0;session.randomize=option(session,'randomize');session.availableMods=[...new Set(call(d,'getAvailableHullmods'))];}
  v.mayAutoAssignWeapons=false;for(const [key,value]of t.effects.stationModules)mapPut(v.effects.stationModules,key,value);
  let index=0;for(const [slotId]of v.effects.stationModules){let module=call(s,'readModuleVariant',v,slotId),force=false;if(module===null){force=true;module=call(s,'readModuleVariant',t,slotId);}check(module!==null,'Actual module variant required: '+slotId);
   if(module.variantSource==='STOCK'||force){module=call(s,'cloneVariant',module);module.variantSource='REFIT';if(!force)module.hullVariantId=module.hullVariantId+'_'+index;}index++;
   const goal=call(s,'readModuleVariant',t,slotId);if(goal===null)continue;session.fittingModule=true;fit(module,goal,0);session.fittingModule=false;call(s,'setModuleVariant',v,slotId,module);
  }
  v.variantSource='REFIT';session.weaponFilterSeed=originalJavaNextLong(session.random);session.emptyWingTarget=null;
  if(call(d,'getAvailableFighters').length>0){const fighters=call(d,'getAvailableFighters'),count=call(d,'getAvailableFighters').length;session.emptyWingTarget=fighters[originalJavaNextInt(session.random,count)].id;}
  session.altWeaponCats.length=0;session.altFighterCats.length=0;session.slotsToSkip.length=0;session.baysToSkip.length=0;session.missilesWithAmmoOnCurrent=0;
  if(option(session,'strip')){equip.stripWeapons(v);equip.stripFighters(v);v.effects.fluxCapacitors=0;v.effects.fluxVents=0;
   if(call(d,'isPlayerCampaignRefit')){for(const id of nonBuilt(v))if(call(d,'canChangeHullmod',id))removeMod(v,id);}else{v.effects.hullMods.length=0;for(const id of hull(v).builtInMods)addMod(v,id);for(const id of v.effects.permaMods)addMod(v,id);}
   if(!session.fittingModule)call(d,'syncUIWithVariant',v);
  }else{session.slotsToSkip.push(...v.weapons.map(([id])=>id));for(let i=0;i<20;i++)if(autofitWingId(v,i)!==null)session.baysToSkip.push(i);}
  if(option(session,'always_reinforced_hull'))hullmods(v,[M.reinforced]);if(option(session,'always_blast_doors'))hullmods(v,[M.doors]);
  const targetMods=[...t.effects.sMods.filter(id=>!t.effects.sModdedBuiltIns.includes(id)),...nonBuilt(t)];if(targetMods.length)hullmods(v,targetMods);
  let addedRandom=0;if(session.randomize)addedRandom=randomized(v,true);
  equip.fitFighters(v,t,false);equip.fitWeapons(v,t,false);
  if(has(v,M.fragile)&&['FRIGATE','DESTROYER'].includes(size(v)))hullmods(v,[M.hardened]);
  const addedMax=f(points(v)*f(.1));if(session.randomize&&addedRandom<=addedMax)randomized(v,false);
  const upgrade=option(session,'upgrade'),fraction=upgrade?f(.5):1;ventsCaps(v,t,fraction);
  if(upgrade){equip.fitFighters(v,t,true);equip.fitWeapons(v,t,true);ventsCaps(v,t,f(1-fraction));}
  extraBoth(v,t);hullmods(v,[M.reinforced,M.doors,M.hardened]);spare(v,t);
  if(max>0){const added=convert(v,max);extra(v,'vents');extra(v,'caps');if(!has(v,M.distributor))distributor(v);if(!has(v,M.coil))coil(v);
   const fast=size(v)==='FRIGATE'||has(v,M.safety);hullmods(v,fast?[M.hardened,M.reinforced,M.doors]:[M.reinforced,M.doors,M.hardened]);const remaining=(max-added)|0;
   if(remaining>0){const ids=[M.distributor,M.coil,...(fast?[M.hardened,M.reinforced]:[M.reinforced,M.hardened]),M.doors].filter(id=>!v.effects.permaMods.includes(id));for(let i=0;i<remaining&&ids.length;i++){v.effects.fluxCapacitors=0;v.effects.fluxVents=0;hullmods(v,[ids[Math.min(i,ids.length-1)]]);convert(v,1);}}
  }
  extra(v,phase(v)?'caps':'vents');hullmods(v,[M.armored]);if(left(v)>0)randomized(v,false);extra(v,phase(v)?'vents':'caps');
  v.displayName=call(s,'readVariantDisplayName',t);v.groupSpecs.length=0;for(const group of t.groupSpecs){const slots=group.slots.filter(id=>autofitWeaponId(v,id)!==null);if(slots.length)v.groupSpecs.push({type:group.type,autofire:group.autofire,slots});}
  if(player){if(v.groupSpecs.length===0||session.randomize||call(s,'hasUnassignedWeapons',v)){v.mayAutoAssignWeapons=true;call(s,'autoGenerateWeaponGroups',v);}}else v.groupSpecs.length=0;
  if(!session.fittingModule)call(d,'syncUIWithVariant',v);depth--;
 }
 fit(current,target,maxSMods);
}
