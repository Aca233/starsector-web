import type { CompiledRuleset, DeepReadonly, ReadonlyWorld, Principal, CommandReceipt, EventBatch } from '../../src/campaign/Types.js';
/** Internal only: principal is supplied by a trusted gateway, never the client. */
export class CampaignRepository {
  readonly epoch: string;
  constructor(filename: string, ruleset: CompiledRuleset, options?: { epoch?: string; enableNativeDevelopment?: boolean });
  create(state: unknown): ReadonlyWorld;
  read(id: string): ReadonlyWorld;
  execute(principal: Principal, command: unknown): DeepReadonly<CommandReceipt>;
  eventsSince(worldId: string, revision: number, limit?: number): DeepReadonly<EventBatch[]>;
  createNativeDevelopment(input:unknown):DeepReadonly<import('./native/DevelopmentWorld.mjs').NativeDevelopmentSummary>;
  nativeDevelopmentStatus(worldId:string):DeepReadonly<import('./native/DevelopmentWorld.mjs').NativeDevelopmentSummary>;
  projectNativeDevelopmentPlayer(worldId:string,playerId:string):DeepReadonly<import('./native/DevelopmentWorld.mjs').NativeDevelopmentPlayer>;
  projectNativeDevelopmentObservations(worldId:string,playerId:string,input:unknown):DeepReadonly<import('../../src/campaign/client/NativeProtocol.js').NativeFleetObservations>;
  projectNativeDevelopmentScene(worldId:string,playerId:string,input:unknown):DeepReadonly<import('../../src/campaign/client/NativeProtocol.js').NativeSceneFrame>;
  nativeDevelopmentCheckpoint(worldId:string):DeepReadonly<import('./native/CheckpointCodec.mjs').OfflineCheckpoint>;
  executeNativeDevelopment(principal:Principal,command:unknown):DeepReadonly<CommandReceipt>;
  /** Internal only: advances and commits once, or restores the entire native graph. */
  advanceNativeDevelopmentFrame(input:import('./native/DevelopmentWorld.mjs').NativeDevelopmentFrameInput,prepare:import('./native/DevelopmentWorld.mjs').NativeDevelopmentFrameFactory):DeepReadonly<{worldId:string;requestId:string;revision:number;result:import('./native/DevelopmentWorld.mjs').NativeDevelopmentFrameResult}>;
  projectNativeDevelopmentFrameEvents(worldId:string,playerId:string,input:import('./native/FrameEffects.mjs').NativeFrameEventsRequest):DeepReadonly<import('./native/FrameEffects.mjs').NativePlayerFrameEvents>;
  nativeDevelopmentEventsSince(worldId:string,revision:number,limit?:number):DeepReadonly<EventBatch[]>;
  close(): void;
}
