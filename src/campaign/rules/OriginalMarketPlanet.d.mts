import type { DeepReadonly } from '../Types.js';
export const ORIGINAL_MARKET_PLANETS:DeepReadonly<{schemaVersion:1;originalReference:string;scope:'market-planet-gas-getter-only';sources:Record<string,{sha256:string}>;entityClasses:Record<string,{planet:boolean}>;specFields:string[];types:Record<string,{isGasGiant:boolean}>}>;
export interface OriginalMarketPlanetInput {
 primaryEntityRef:string|null;
 connectedEntities:{objectRef:string;classAlias:string;planet:{type:string;gasGiantOverride:boolean|null;otherDiffKeys:string[]}|null}[];
}
export interface OriginalMarketPlanetReadback {
 scope:'market-planet-gas-getter-only';planetEntityRef:string|null;planetType:string|null;planetIsGasGiant:boolean|null;gasSource:'type-default'|'saved-diff'|'no-connected-planet';unrestoredPlanetDiffs:{entityRef:string;fields:string[]}[];
}
export function readOriginalMarketPlanet(input:DeepReadonly<OriginalMarketPlanetInput>):DeepReadonly<OriginalMarketPlanetReadback>;
export function projectOriginalPlanetGasDiff(diff:unknown):DeepReadonly<{gasGiantOverride:boolean|null;otherDiffKeys:string[]}>;
