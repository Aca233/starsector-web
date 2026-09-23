import type {OriginalActionIndicator} from './OriginalCampaignPings.mjs';
import type {OriginalFleetDrawFrame} from './OriginalFleetDraw.mjs';
export function renderOriginalActionIndicator(indicator:OriginalActionIndicator,context:{currentLocation:object|null;alpha:number;isNearViewport:(position:number[],margin:number)=>boolean},services?:{readLocationEntityState?(entity:object):{position:number[];containingLocation:object|null};readPingRadius?(entity:object):number;readPingFactionColor?(entity:object):number[]|null}):OriginalFleetDrawFrame;
