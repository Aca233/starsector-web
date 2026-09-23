/** Default AccidentManager/OooO low-CR risk and its actual ship/cargo losses. No UI is rendered here. */
import R from '../data/reference-fleet-accidents.json' with {type:'json'};
import {ORIGINAL_MARKET_REFERENCE} from './OriginalMarketPricing.mjs';
import {ORIGINAL_FLEET_SYNC,synchronizeOriginalFleet,originalFleetPointCost,originalMemberLogistics,updateOriginalFleetCargoSpace} from './OriginalFleetData.mjs';
import {getOriginalMemberStats,originalMemberPlayerCommander} from './OriginalMemberEffects.mjs';
import {originalMemberCurrentCR} from './OriginalFleetMemberStats.mjs';
import {originalNativeMemberHullFraction} from './OriginalNativeRepair.mjs';
import {applyOriginalNativeAutoresolveDamage} from './OriginalNativeDamage.mjs';
import {originalResourceQuantity,removeOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {removeOriginalFleetRosterMember} from './OriginalFleetRoster.mjs';
import {advanceOriginalEngineInterval} from './OriginalCampaignFleet.mjs';
import {originalJavaNextFloat,originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_ACCIDENT',m);
const num=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),'Actual native float '+label+' required');return n;};
const int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const crew=c=>int(originalResourceQuantity(c,'crew')),marines=c=>(int(originalResourceQuantity(c,'marines'))+int(num(c.extraMarinesUsed,'extra marines')))|0;
const supplies=c=>f(originalResourceQuantity(c,'supplies')+f(int(num(c.extraSuppliesUsed,'extra supplies')))),fuel=c=>f(originalResourceQuantity(c,'fuel')+num(c.extraFuelUsed,'extra fuel'));
const currentCR=(m,fleet)=>{getOriginalMemberStats(m,fleet);return originalMemberCurrentCR(m,fleet,{playerCommander:originalMemberPlayerCommander(m,fleet)});};
function actual(binding){const fleet=binding?.fleet,a=fleet?.campaign?.accidents;check(a?.fleetRef===fleet.objectRef&&a.risks.length===1&&a.risks[0].kind==='native-low-cr-ship-loss'&&a.risks[0].cargo===fleet.cargo&&a.risks[0].random===a.random,'Actual default accident graph required');validateOriginalJavaRandom(a.random);return fleet;}
export function originalFleetAccidentSeverity(binding,services={}){
 const fleet=actual(binding);if(fleet.attachedToCampaignFleet&&fleet.aiMode)return 'NONE';synchronizeOriginalFleet(fleet,services);
 const supplied=supplies(fleet.cargo)>0,members=fleet.membersWithoutNull,allMothballed=members.every(m=>m.repairTracker.mothballed);
 for(const m of members){const t=m.repairTracker;if(t.mothballed&&!allMothballed||m.type==='FIGHTER_WING'||!(currentCR(m,fleet)<f(.1))||!t.suspendRepairs&&supplied)continue;return 'MAJOR';}return 'NONE';
}
/** Native report merges cargo losses before its four-item display cap; losses beyond the cap still happen. */
export function addOriginalAccidentLoss(report,loss){
 if(loss.kind==='cargo'){const old=report.losses.find(item=>item.kind==='cargo'&&item.type===loss.type&&item.itemId===loss.itemId);if(old){old.quantity=(old.quantity+loss.quantity)|0;return;}}
 if(report.losses.length<4)report.losses.push(loss);
}
function removeResource(fleet,id,amount){
 if(id==='crew'&&amount>0&&fleet.cargo.carryingFleetRef!==null){check(fleet.cargo.carryingFleetRef===fleet.dataRef,'Actual carrying FleetData required');fleet.synchronization.needsSync=true;}
 return removeOriginalResourceCargo(fleet.cargo,id,f(amount),()=>updateOriginalFleetCargoSpace(fleet.cargo));
}
function resourceLoss(report,id,quantity,title,description){addOriginalAccidentLoss(report,{kind:'cargo',type:'RESOURCES',itemId:id,quantity,title,description});}
function losePersonnel(fleet,report,count,random){
 if(count<1)return;
 if(originalJavaNextFloat(random)>f(.5)){
  const lost=int(Math.min(f(f(count)*f(f(f(.4)*originalJavaNextFloat(random))+f(.1))),f(marines(fleet.cargo))));
  if(lost>0){removeResource(fleet,'marines',lost);resourceLoss(report,'marines',lost,'损失陆战队员','失去陆战队员');count=(count-lost)|0;}
 }
 // Installed bytecode confirms the odd comparison: it does not clamp requested loss to available crew.
 if(count>0){removeResource(fleet,'crew',count);resourceLoss(report,'crew',count,'损失船员','失去船员');}
}
function loseFuel(fleet,report,count){if(f(count)>fuel(fleet.cargo))count=int(fuel(fleet.cargo));if(count<1)return;removeResource(fleet,'fuel',count);resourceLoss(report,'fuel',count,'损失燃料','失去燃料');}
function eligibleStack(stack){
 if(!stack||stack.type==='NULL'||stack.size<1||stack.type==='SPECIAL')return null;
 const id=stack.type==='RESOURCES'?stack.commodityId:stack.itemId;let spec;
 if(stack.type==='RESOURCES'){const s=ORIGINAL_MARKET_REFERENCE.commodities[id];if(!s||s.tags.some(t=>['nonecon','ai_core','mission_item','no_loss_from_combat'].includes(t)))return null;spec={maxSize:s.stackSize,cargoSpace:s.cargoSpace};}
 else if(stack.type==='WEAPONS'){spec=R.weapons[id];if(!spec||spec.tags.includes('omega'))return null;}
 else if(stack.type==='FIGHTER_CHIP'){check(ORIGINAL_FLEET_SYNC.wings[id],'Actual fighter wing cargo required');spec={maxSize:10000,cargoSpace:1};}else check(false,'Unknown native cargo type');
 // CargoData(false) still constructs unlimitedStacks=true (native constructor and addItems).
 // Ordinary spec limits belong to the source cargo, not to this temporary candidate cargo.
 if(spec.cargoSpace<=0)return null;return {type:stack.type,itemId:id,maxSize:1000000,cargoSpacePerUnit:spec.cargoSpace,size:stack.size};
}
function temporaryCargo(cargo){
 const slots=[];
 for(const original of cargo.slots){const input=eligibleStack(original);if(!input)continue;let amount=input.size;
  do{let at=-1;for(let i=0;i<slots.length;i++){const s=slots[i];if(s.type===input.type&&s.itemId===input.itemId&&(at<0||slots[at].size>s.size))at=i;}
   if(at<0||slots[at].size>=input.maxSize){if(amount<1)break;check(slots.length<65536,'Accident cargo work limit');at=slots.length;slots.push({...input,size:0});}
   const stack=slots[at],used=Math.min(f(stack.maxSize-stack.size),amount),next=f(stack.size+used);stack.size=stack.type==='RESOURCES'?next:f(int(next));amount=f(amount-used);
  }while(amount>=1);
 }
 return slots;
}
function removeCargoItem(fleet,stack,count){
 if(stack.type==='RESOURCES'){removeResource(fleet,stack.itemId,count);return;}
 const cargo=fleet.cargo;let amount=f(count);
 while(amount>0){let at=-1;for(let i=0;i<cargo.slots.length;i++){const s=cargo.slots[i];if(s?.type===stack.type&&s.itemId===stack.itemId&&(at<0||cargo.slots[at].size>s.size))at=i;}if(at<0)return;
  const target=cargo.slots[at],used=Math.min(target.size,amount),rounding=target.roundSize??(target.source?.attributes.rS==='true'?true:target.source?.attributes.rS==='false'?false:null);check(typeof rounding==='boolean','Actual saved non-resource rounding required');
  let next=Math.max(0,f(target.size-used));if(rounding)next=f(int(next));target.size=next;updateOriginalFleetCargoSpace(cargo);if(target.size<1)cargo.slots[at]=null;amount=f(amount-used);
 }updateOriginalFleetCargoSpace(cargo);
}
function loseCargo(fleet,report,space,random){
 const cargo=fleet.cargo,excess=f(num(cargo.spaceUsed,'space used')-num(cargo.maxCapacity,'capacity'));if(space<1)return;
 const candidates=temporaryCargo(cargo);
 while(space>=1&&candidates.length){const at=int(originalJavaNextDouble(random)*candidates.length),stack=candidates.splice(at,1)[0],unit=stack.cargoSpacePerUnit;let count=unit>0?int(Math.min(f(space/unit),stack.size)):1;if(count<=1&&unit<=excess)count=1;if(count<=0)continue;
  removeCargoItem(fleet,stack,count);const supply=stack.type==='RESOURCES'&&stack.itemId==='supplies';addOriginalAccidentLoss(report,{kind:'cargo',type:stack.type,itemId:stack.itemId,quantity:count,title:supply?'损失补给':'损失货物',description:supply?'失去补给':'失去货物'});space=f(space-f(f(count)*unit));
 }
}
function shipLoss(member,destroyed){return {kind:'ship',lossType:destroyed?'DESTROYED':'DAMAGED',member,crLost:0,title:destroyed?'舰船损毁':'舰船受损',description:(destroyed?'损毁了 ':'损坏了 ')+String(member.shipName)};}
function damageShip(binding,report,globalRandom,services){
 const fleet=actual(binding),random=fleet.campaign.accidents.random; synchronizeOriginalFleet(fleet,services);
 const allMothballed=fleet.membersWithoutNull.every(m=>m.repairTracker.mothballed),candidates=fleet.membersWithoutNull.filter(m=>!(currentCR(m,fleet)>0||m.repairTracker.mothballed&&!allMothballed||m.type==='FIGHTER_WING'||originalFleetPointCost(m)>9999));
 if(candidates.length===0)return;
 const member=candidates[int(originalJavaNextDouble(random)*candidates.length)],hits=f(f(f(1-originalNativeMemberHullFraction(member,services))+f(.25))+f(f(.25)*originalJavaNextFloat(random)));
 applyOriginalNativeAutoresolveDamage(member,{memberRef:member.objectRef,maxHits:1,shields:0,hits},globalRandom,services);
 if(originalNativeMemberHullFraction(member,services)<=0){
  applyOriginalNativeAutoresolveDamage(member,{memberRef:member.objectRef,maxHits:1,shields:0,hits:1},globalRandom,services);removeOriginalFleetRosterMember(binding,member);addOriginalAccidentLoss(report,shipLoss(member,true));
  const count=int(f(originalMemberLogistics(member).minCrew*f(f(originalJavaNextFloat(random)*f(.25))+f(.5))));losePersonnel(fleet,report,count,random);
 }else{
  addOriginalAccidentLoss(report,shipLoss(member,false));let count=int(f(originalMemberLogistics(member).minCrew*f(f(originalJavaNextFloat(random)*f(.125))+f(.125))));if(member.fleetDataRef!==null&&fleet.attachedToCampaignFleet)count=Math.min(crew(fleet.cargo),count);losePersonnel(fleet,report,count,random);
 }
}
function loseExcess(fleet,report,kind,random){
 const destroyed=report.losses.find(loss=>loss.kind==='ship'&&loss.lossType==='DESTROYED'),capacity=destroyed?originalMemberLogistics(destroyed.member):null,c=fleet.cargo;let quantity,max,lostCapacity;
 if(kind==='cargo'){quantity=num(c.spaceUsed,'space used');max=num(c.maxCapacity,'cargo capacity');lostCapacity=capacity?.cargo??0;}
 else if(kind==='fuel'){quantity=fuel(c);max=num(c.maxFuel,'fuel capacity');lostCapacity=capacity?.fuel??0;}
 else{quantity=f(((crew(c)+int(num(c.extraCrewUsed,'extra crew')))|0)+marines(c));max=num(c.maxPersonnel,'personnel capacity');lostCapacity=capacity?.maxCrew??0;}
 const excess=Math.max(0,f(quantity-f(max-lostCapacity))),fraction=f(f(.5)+f(f(.5)*originalJavaNextFloat(random))),count=int(f(excess*fraction));if(count<=0)return;
 if(kind==='cargo')loseCargo(fleet,report,f(count),random);else if(kind==='fuel')loseFuel(fleet,report,count);else losePersonnel(fleet,report,count,random);
}
export function generateOriginalFleetAccident(binding,globalRandom,services={}){
 const fleet=actual(binding),severity=originalFleetAccidentSeverity(binding,services);if(severity==='NONE')return null;validateOriginalJavaRandom(globalRandom);
 const report={scope:'native-low-cr-accident-report',severity,prefix:'因缺乏维修与战备值 (CR) 不足而',cause:'0% 战备值 (CR) ',advice:'你需要尽快采取措施恢复舰船的战备值 (CR) 。如果不进行维修，战备值为 0 的舰船将持续面临发生事故的风险。',losses:[]};
 damageShip(binding,report,globalRandom,services);
 const random=fleet.campaign.accidents.random,order=[['cargo','fuel','personnel'],['cargo','personnel','fuel'],['fuel','cargo','personnel'],['fuel','personnel','cargo'],['personnel','cargo','fuel'],['personnel','fuel','cargo']][int(f(originalJavaNextFloat(random)*6))];
 for(const kind of order)loseExcess(fleet,report,kind,random);return report;
}
/** Manager advance takes already-converted native days; the draft's public entry takes seconds. */
export function advanceOriginalFleetAccidents(binding,days,globalRandom,services={}){
 const fleet=actual(binding),a=fleet.campaign.accidents;num(days,'accident days');validateOriginalJavaRandom(globalRandom);
 advanceOriginalEngineInterval(a.tracker,days,globalRandom);synchronizeOriginalFleet(fleet,services);a.context.daysWithoutSupplies=supplies(fleet.cargo)===0?f(num(a.context.daysWithoutSupplies,'days without supplies')+days):0;
 let report=null;
 if(a.tracker.intervalElapsed){const severity=originalFleetAccidentSeverity(binding,services);if(severity==='NONE')a.currentChance=0;else{
  a.currentChance=Math.min(f(.9),f(num(a.currentChance,'current chance')+f(.5)));
  if(originalJavaNextFloat(a.random)<a.currentChance){a.currentChance=0;originalJavaNextFloat(a.random); // WeightedRandomPicker of the one actual MAJOR risk still consumes a float.
   report=generateOriginalFleetAccident(binding,globalRandom,services);
  }
 }}
 return {scope:'native-fleet-accident-phase',report,showPlayerReport:report!==null&&fleet.isPlayerFleet&&report.losses.length>0,readyForAuthority:false};
}
