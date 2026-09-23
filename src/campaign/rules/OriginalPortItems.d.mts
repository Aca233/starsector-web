import type { DeepReadonly } from '../Types.js';
import type { EconomyBonus } from './OriginalMarketEconomy.mjs';
export interface OriginalPortItemContext { planetIsGasGiant: boolean | null; conditionIds: string[] }
export const ORIGINAL_PORT_ITEMS: DeepReadonly<{schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;items:Record<'fullerene_spool',{industryIds:string[];accessibilityBonus:number;requirements:string[];name:string;icon:string}>;requirementNames:Record<string,string>}>;
export function isSupportedOriginalPortItem(industryId:string,itemId:unknown):boolean;
export function originalPortItemRequirements(input:DeepReadonly<{industryId:string;itemId:'fullerene_spool';context:OriginalPortItemContext}>):readonly string[];
export function applyOriginalPortItemAccessibility(input:DeepReadonly<{industryId:string;itemId:'fullerene_spool';accessibility:EconomyBonus}&({action:'apply';context:OriginalPortItemContext}|{action:'unapply';context:null})>):DeepReadonly<{scope:'port-installed-item-accessibility-only';accessibility:EconomyBonus;applied:boolean;unmetRequirements:string[]}>;
