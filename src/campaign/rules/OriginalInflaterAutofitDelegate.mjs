/** DefaultFleetInflater's real delegate: no ShipAPI/UI/market here in the original class. */
import {autofitCall as call,autofitCheck as check} from './OriginalAutofitEquipment.mjs';
import {clearOriginalVariantWeapon,setOriginalVariantWeapon,setOriginalVariantWing} from './OriginalStorage.mjs';
export function createOriginalInflaterAutofitDelegate(input,services){
 check(input?.scope==='native-fleet-inflater-delegate','Actual DefaultFleetInflater delegate required');
 const mutations={clearWeapon:services.clearAutofitWeapon??clearOriginalVariantWeapon,setWeapon:services.setAutofitWeapon??setOriginalVariantWeapon,setWing:services.setAutofitWing??setOriginalVariantWing};
 return {
  getAvailableWeapons:()=>input.weapons,getAvailableFighters:()=>input.fighters,getAvailableHullmods:()=>input.hullmods,
  getFaction:()=>input.faction,getShip:()=>null,getFleetMember:()=>null,getMarket:()=>null,
  isAutomatedShip:()=>false,isPlayerCampaignRefit:()=>false,canChangeHullmod:()=>true,allowSlightRandomization:()=>true,
  // Native DefaultFleetInflater.syncUIWithVariant is empty, unlike player campaign refit.
  syncUIWithVariant:()=>{},
  isPriority:(kind,spec)=>call(services,kind==='weapon'?'isInflaterWeaponPriority':'isInflaterFighterPriority',input.faction,spec.id),
  isBlackMarket:market=>call(services,'isAutofitBlackMarket',market),
  clearWeaponSlot:(slot,variant)=>{call(mutations,'clearWeapon',variant,slot.id);if(input.weapons.length)input.weapons[0].quantity=(input.weapons[0].quantity+1)|0;},
  clearFighterSlot:(index,variant)=>{call(mutations,'setWing',variant,index,null);if(input.fighters.length)input.fighters[0].quantity=(input.fighters[0].quantity+1)|0;},
  fitWeaponInSlot:(slot,weapon,variant)=>{weapon.quantity=(weapon.quantity-1)|0;call(mutations,'setWeapon',variant,slot.id,weapon.id);},
  fitFighterInSlot:(index,fighter,variant)=>{fighter.quantity=(fighter.quantity-1)|0;call(mutations,'setWing',variant,index,fighter.id);},
 };
}
