import type {OriginalCoreAutofitSession} from './OriginalFleetInflater.mjs';
import type {OriginalAutofitEquipmentServices,OriginalAutofitVariant,OriginalAutofitDelegate,OriginalAutofitHull} from './OriginalAutofitEquipment.mjs';
export interface OriginalAutofitHullmodSpec {id:string;tags:string[];effect:object|null}
export interface OriginalCoreAutofitServices extends OriginalAutofitEquipmentServices {
 readHullmodSpec?(id:string):OriginalAutofitHullmodSpec|null;readHullmodCost?(spec:OriginalAutofitHullmodSpec,size:OriginalAutofitHull['hullSize']):number;readSModOPCost?(spec:OriginalAutofitHullmodSpec,size:OriginalAutofitHull['hullSize']):number;
 readMaxFluxBonus?(stats:NonNullable<OriginalCoreAutofitSession['stats']>,kind:'vents'|'caps',base:number):number;
 readShipVariant?(ship:object):OriginalAutofitVariant|null;setShipVariantForHullmodCheck?(ship:object,variant:OriginalAutofitVariant):void;
 isHullmodApplicable?(spec:OriginalAutofitHullmodSpec,ship:object):boolean;isHullmodItemAvailable?(id:string,member:object|null,variant:OriginalAutofitVariant,market:object|null):boolean;
 applyHullmodBeforeShipCreation?(spec:OriginalAutofitHullmodSpec,ship:object):void;applyHullmodAfterShipCreation?(spec:OriginalAutofitHullmodSpec,ship:object):void;
 readDoctrineCarriers?(faction:object):number;isCommanderPlayer?(commander:NonNullable<OriginalCoreAutofitSession['commander']>):boolean;
 readModuleVariant?(parent:OriginalAutofitVariant,slotId:string):OriginalAutofitVariant|null;cloneVariant?(variant:OriginalAutofitVariant):OriginalAutofitVariant;setModuleVariant?(parent:OriginalAutofitVariant,slotId:string,variant:OriginalAutofitVariant):void;
 readVariantDisplayName?(variant:OriginalAutofitVariant):string;hasUnassignedWeapons?(variant:OriginalAutofitVariant):boolean;autoGenerateWeaponGroups?(variant:OriginalAutofitVariant):void;
}
export function executeOriginalCoreAutofit(session:OriginalCoreAutofitSession,current:OriginalAutofitVariant,target:OriginalAutofitVariant,maxSMods:number,services:OriginalCoreAutofitServices,delegate:OriginalAutofitDelegate):void;
