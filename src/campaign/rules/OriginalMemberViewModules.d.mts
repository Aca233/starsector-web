import type {OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalNativeCampaignMemberView,OriginalMemberViewSprite,OriginalMemberViewServices} from './OriginalCampaignFleetMemberView.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalViewSlot} from './OriginalMemberViewResources.mjs';
import type {OriginalFleetDrawFrame,FleetDrawVec} from './OriginalFleetDraw.mjs';
export interface OriginalMemberModuleIcon {scope:'native-campaign-module-icon';slotId:string;slot:OriginalViewSlot;variant:OriginalStorageVariant;sprite:OriginalMemberViewSprite}
export function originalMemberViewSlotPosition(slot:OriginalViewSlot,facing:number,anchor?:FleetDrawVec|null):FleetDrawVec;
export function originalMemberModuleSlots(member:OriginalNativeFleetMember,services?:OriginalMemberViewServices):{slot:OriginalViewSlot;variantId:string}[];
export function originalMemberModuleVariant(member:OriginalNativeFleetMember,slot:OriginalViewSlot,variantId:string|null,services?:OriginalMemberViewServices):OriginalStorageVariant;
export function createOriginalMemberViewModules(member:OriginalNativeFleetMember,services?:OriginalMemberViewServices,createIcons?:boolean):{size:{width:number;height:number};icons:OriginalMemberModuleIcon[]};
export function renderOriginalMemberViewModules(view:OriginalNativeCampaignMemberView,frame:OriginalFleetDrawFrame,position:FleetDrawVec,services?:OriginalMemberViewServices):void;
