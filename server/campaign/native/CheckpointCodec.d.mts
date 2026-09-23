import type {DeepReadonly} from '../../../src/campaign/Types.js';
export type OfflineCheckpointEdge = null|boolean|number|string|{ref:number}|{negativeZero:true};
export interface OfflineCheckpoint {scope:'web-offline-identity-graph';schemaVersion:1|2;root:OfflineCheckpointEdge;records:({kind:'object';entries:[string,OfflineCheckpointEdge][]}|{kind:'array';items:OfflineCheckpointEdge[]})[]}
export function encodeOfflineCheckpoint(value:unknown,options?:{allowCycles?:boolean}):DeepReadonly<OfflineCheckpoint>;
export function decodeOfflineCheckpoint(checkpoint:unknown):unknown;
