import type {OriginalInflaterDelegate,OriginalFleetInflaterServices} from './OriginalFleetInflater.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalAutofitDelegate,OriginalAutofitAvailable,OriginalAutofitWeaponSpec,OriginalAutofitFighterSpec} from './OriginalAutofitEquipment.mjs';
export interface OriginalInflaterAutofitDelegateServices extends Pick<OriginalFleetInflaterServices,'isInflaterWeaponPriority'|'isInflaterFighterPriority'> {
 isAutofitBlackMarket?(market:object):boolean;
 clearAutofitWeapon?(variant:OriginalStorageVariant,slotId:string):void;setAutofitWeapon?(variant:OriginalStorageVariant,slotId:string,id:string):void;setAutofitWing?(variant:OriginalStorageVariant,index:number,id:string|null):void;
}
export type OriginalInflaterAutofitInput=Omit<OriginalInflaterDelegate,'weapons'|'fighters'>&{weapons:OriginalAutofitAvailable<OriginalAutofitWeaponSpec>[];fighters:OriginalAutofitAvailable<OriginalAutofitFighterSpec>[]};
export function createOriginalInflaterAutofitDelegate(input:OriginalInflaterAutofitInput,services:OriginalInflaterAutofitDelegateServices):OriginalAutofitDelegate;
