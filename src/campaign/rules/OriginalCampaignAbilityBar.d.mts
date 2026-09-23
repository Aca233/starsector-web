import type {OriginalConstructedCampaignFleet,NativeRGBA} from './OriginalCampaignFleet.mjs';
import type {OriginalAbilityPlugin} from './OriginalCampaignAbilities.mjs';
export interface OriginalAbilitySlots {scope:'native-campaign-ability-slots';currBarIndex:number;locked:boolean;slots:{slotId:number;abilityId:string|null;inHyperAbilityId:string|null}[][]}
export type OriginalAbilityBarGesture={kind:'page';direction:1|-1}|{kind:'lock';locked:boolean};
export interface NativeAbilityButton {id:string;name:string;icon:string;active:boolean;usable:boolean;progress:number;showProgress:boolean;showActive:boolean;cooldownFraction:number}
export interface NativeAbilityBar {scope:'native-campaign-ability-bar';page:number;locked:boolean;color:NativeRGBA;commandBlockReason:string|null;slots:{index:number;shortcut:string;assigned:boolean;unsupported:boolean;ability:NativeAbilityButton|null}[]}
export function createOriginalAbilitySlots():OriginalAbilitySlots;
export function validateOriginalAbilitySlots(state:OriginalAbilitySlots):OriginalAbilitySlots;
export function populateOriginalNewAbilitySlots(state:OriginalAbilitySlots,fleet:OriginalConstructedCampaignFleet):OriginalAbilitySlots;
export function changeOriginalAbilityBar(state:OriginalAbilitySlots,action:OriginalAbilityBarGesture):OriginalAbilitySlots;
export function originalAbilityForSlot(state:OriginalAbilitySlots,fleet:OriginalConstructedCampaignFleet,slotIndex:number):OriginalAbilityPlugin|null;
export function projectOriginalAbilityBar(state:OriginalAbilitySlots,fleet:OriginalConstructedCampaignFleet,options?:{commandBlockReason?:string|null}):NativeAbilityBar;
