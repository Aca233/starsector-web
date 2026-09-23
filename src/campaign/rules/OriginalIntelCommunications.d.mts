export interface OriginalIntelRangeSettings {unitsPerLightYear:number;maxRelayRangeInHyperspace:number;commRelayRangeAroundSystem:number}
export const ORIGINAL_INTEL_COMMUNICATIONS:Readonly<OriginalIntelRangeSettings>;
export interface OriginalIntelSpatialServices {readIntelRangeSettings?():OriginalIntelRangeSettings;readIntelEntityHyperPosition?(entity:object):[number,number];readIntelSystemHyperPosition?(system:object):[number,number];readIntelEntityPosition?(entity:object):[number,number];readIntelEntityLocation?(entity:object):object|null;isIntelEntityInHyperspace?(entity:object):boolean;readIntelRelays?(location:object|null):object[];isIntelRelayNonfunctional?(relay:object):boolean;chooseIntelSystemRelay?(count:number):number}
export function originalIntelDistance(one:[number,number],two:[number,number]):number;
export function originalIntelSettings(services?:OriginalIntelSpatialServices):OriginalIntelRangeSettings;
export function findOriginalCommRelay(observer:object|null,world:{hyperspace:object;starSystems:object[]},services:OriginalIntelSpatialServices):object|null;
