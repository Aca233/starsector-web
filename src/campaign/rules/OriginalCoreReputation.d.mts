import type {OriginalRepLevel,OriginalFactionRelations,OriginalRelationshipFaction,OriginalRelationshipFacade} from './OriginalRelationships.mjs';
export interface OriginalReputationEnvelope {scope:'native-rep-action-envelope';action:string;param:unknown;textPanel:object|null;message:object|null;addMessageOnNoChange:boolean;withMessage:boolean;reason:string|null}
export interface OriginalReputationImpact {delta:number;limit:OriginalRepLevel|null;ensureAtBest:OriginalRepLevel|null;ensureAtWorst:OriginalRepLevel|null;requireAtBest:OriginalRepLevel|null;requireAtWorst:OriginalRepLevel|null}
export interface OriginalReputationResult {delta:number}
export interface OriginalReputationServices {
 readNativeReputationPlayerFleet?():object|null;readNativeReputationPlayerPerson?():object;
 resolveNativeReputationImpact?(action:string,param:unknown):OriginalReputationImpact;
 reportNativeReputationMessage?(message:{kind:'adjustment'|'no-change';delta?:number;deltaSign?:number;faction:OriginalRelationshipFaction|null;person:object|null;message:object|null;panel:object|null;withCurrent:true;pad:0;reason:string|null}):void;
 reportNativeReputationChange?(target:string|object,delta:number):void;
 reportReputationChangeToListener?(listener:import('./OriginalFleetWorld.mjs').OriginalFleetWorldListener,target:string|object,delta:number):void;
 pickNativeReputationActionPlugin?(action:unknown,factionId:string):{handlePlayerReputationAction(action:unknown,factionId:string):OriginalReputationResult}|null;
}
export function createOriginalReputationEnvelope(action:string,param?:unknown,textPanel?:object|null):OriginalReputationEnvelope;
export function originalCoreReputationImpact(action:string,param:unknown,services?:OriginalReputationServices):OriginalReputationImpact;
export function handleOriginalCoreReputation(manager:OriginalFactionRelations,action:unknown,factionId:string,person:object|null,delegate:OriginalRelationshipFacade,services?:OriginalReputationServices):OriginalReputationResult;
export function adjustOriginalPlayerFactionReputation(manager:OriginalFactionRelations,action:unknown,factionId:string,services?:OriginalReputationServices):OriginalReputationResult;
