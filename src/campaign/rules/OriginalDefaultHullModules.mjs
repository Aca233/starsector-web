/** Native public-core post-SpecStore registry results, not an upgrade path for saved class history. */
import raw from '../data/reference-default-hull-modules.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
export const ORIGINAL_DEFAULT_HULL_MODULES=immutableJSON(raw);
const R=ORIGINAL_DEFAULT_HULL_MODULES;
const check=(value,message)=>requireThat(value,'UNSUPPORTED_NATIVE_DEFAULT_HULL_REGISTRY',message);
/** Only the new member-factory constructor calls this; restore must preserve or reject its saved proof. */
export function createOriginalDefaultHullRegistryState(){
 return {scope:'native-default-hull-registry',origin:'new-web-current-member-factory',referenceId:R.referenceId};
}
export function validateOriginalDefaultHullRegistryState(state){
 check(state?.scope==='native-default-hull-registry'&&state.origin==='new-web-current-member-factory'&&state.referenceId===R.referenceId,'Actual default hull registry initialization history required; old checkpoints cannot be auto-upgraded');return state;
}
export function originalDefaultHullVariantRecipe(id){return typeof id==='string'&&Object.hasOwn(R.hullVariants,id)?R.hullVariants[id]:null;}
/** Read-only facts for DModManager / SpecStore restoration; no D-mod decisions or invented D variants. */
export function originalHullRestoration(id){
 check(typeof id==='string'&&Object.hasOwn(R.hullRestoration,id),'Unloaded native hull restoration metadata: '+id);return R.hullRestoration[id];
}
