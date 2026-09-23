import type {OriginalFleetMemberStats,OriginalNativeFleetMember,OriginalNativeFleet} from './OriginalFleetData.mjs';
import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
export interface OriginalMemberEffectPlugins {skills?:Record<string,(stats:OriginalFleetMemberStats,id:string,level:number,member:OriginalNativeFleetMember)=>void>;hullmods?:Record<string,(stats:OriginalFleetMemberStats,id:string,hullSize:string,sMod:boolean,member:OriginalNativeFleetMember)=>void>}
export function applyOriginalCharacterShipEffects(character:OriginalPayrollPerson['stats'],member:OriginalNativeFleetMember,type:'SHIP'|'ALL_SHIPS_IN_FLEET',plugins?:OriginalMemberEffectPlugins['skills']):void;
export function applyOriginalMemberHullmods(member:OriginalNativeFleetMember,plugins?:OriginalMemberEffectPlugins['hullmods'],fleet?:OriginalNativeFleet|null):void;
export function originalMemberPlayerCommander(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet|null):boolean;
export function updateOriginalMemberStats(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet|null,plugins?:OriginalMemberEffectPlugins):void;
export function applyOriginalCommanderFleetwideStats(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):void;
export function setOriginalCommanderStatsFleet(commanderRef:string,fleet:OriginalNativeFleet):void;
export type OriginalVariantHullmodPlugins=Record<string,(stats:import('./OriginalFleetMemberStats.mjs').OriginalVariantShipStats,id:string,hullSize:string,sMod:boolean,member:null,fleet:null)=>void>;
export function applyOriginalVariantHullmod(stats:import('./OriginalFleetMemberStats.mjs').OriginalVariantShipStats,variant:import('./OriginalStorage.mjs').OriginalStorageVariant,id:string,plugins?:OriginalVariantHullmodPlugins):void;
export function createOriginalVariantOPStats(member:OriginalNativeFleetMember,plugins?:OriginalVariantHullmodPlugins):import('./OriginalFleetMemberStats.mjs').OriginalVariantShipStats|null;
export function getOriginalMemberStats(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):OriginalFleetMemberStats;
