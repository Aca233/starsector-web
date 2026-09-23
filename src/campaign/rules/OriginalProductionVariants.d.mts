import {ORIGINAL_SHIP_SELECTION} from './OriginalShipSelection.mjs';
export interface OriginalProductionVariantMap {scope:'native-default-role-hull-variant-map';entries:[string,string[]][]}
export function createOriginalProductionVariantMap(reference?:typeof ORIGINAL_SHIP_SELECTION):OriginalProductionVariantMap;
export function validateOriginalProductionVariantMap(state:OriginalProductionVariantMap):OriginalProductionVariantMap;
export function originalProductionHullVariants(state:OriginalProductionVariantMap,hullId:string):string[];
