export type OriginalRepLevel='VENGEFUL'|'HOSTILE'|'INHOSPITABLE'|'SUSPICIOUS'|'NEUTRAL'|'FAVORABLE'|'WELCOMING'|'FRIENDLY'|'COOPERATIVE';
export interface OriginalRelationshipFaction {objectRef:string;factionId:string;equipment?:import('./OriginalFactionEquipment.mjs').OriginalFactionEquipment;nativeFrame?:import('./OriginalFactionFrame.mjs').OriginalFactionFrame}
export interface OriginalFactionRelation {objectRef:string;factionIdOne:string;factionIdTwo:string;value:number}
export interface OriginalFactionRelations {scope:'native-current-faction-relations';objectRef:string;serial:number;factions:OriginalRelationshipFaction[];playerFaction:OriginalRelationshipFaction|null;relations:{key:string;relation:OriginalFactionRelation}[]}
export interface OriginalRelationshipTarget {type:'FACTION'|'PERSON'|'PLAYER';faction:OriginalRelationshipFaction|null;person:object|null}
export interface OriginalRelationship {scope:'native-relationship';rel:number;target:OriginalRelationshipTarget|null}
export interface OriginalRelationshipFacade {getTarget():OriginalRelationshipTarget|null;setTarget(target:OriginalRelationshipTarget|null):void;getRel():number;setRel(value:number):void;getLevel():OriginalRepLevel;setLevel(level:OriginalRepLevel):void;getRepInt():number;isAtBest(level:OriginalRepLevel):boolean;isAtWorst(level:OriginalRepLevel):boolean;isHostile():boolean;ensureAtBest(level:OriginalRepLevel):boolean;ensureAtWorst(level:OriginalRepLevel):boolean;adjustRelationship(delta:number,limit?:OriginalRepLevel|null):boolean}
export function originalReputationInt(value:number):number;
export function originalReputationLevel(value:number):OriginalRepLevel;
export function originalRepAtBest(current:OriginalRepLevel,best:OriginalRepLevel):boolean;
export function originalRepAtWorst(current:OriginalRepLevel,worst:OriginalRepLevel):boolean;
export function createOriginalFactionRelations(objectRef:string,factions:OriginalRelationshipFaction[],playerFaction:OriginalRelationshipFaction|null):OriginalFactionRelations;
export function validateOriginalFactionRelations(manager:OriginalFactionRelations):OriginalFactionRelations;
export function originalFactionById(manager:OriginalFactionRelations,id:string):OriginalRelationshipFaction|null;
export function originalFactionRelation(manager:OriginalFactionRelations,one:string|null,two:string|null):OriginalFactionRelation|null;
export function setOriginalFactionRelation(manager:OriginalFactionRelations,one:string,two:string,value:number):void;
export function bindOriginalFactionRelationship(manager:OriginalFactionRelations,ownerId:string,target:OriginalRelationshipFaction):OriginalRelationshipFacade;
export function createOriginalRelationship(target:OriginalRelationshipTarget|null):OriginalRelationship;
export function bindOriginalRelationship(state:OriginalRelationship):OriginalRelationshipFacade;
