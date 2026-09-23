import type {NativeDevelopmentState} from './DevelopmentWorld.mjs';
import type {NativeSceneRequest,NativeSceneFrame} from '../../../src/campaign/client/NativeProtocol.js';
import type {DeepReadonly} from '../../../src/campaign/Types.js';
export function validateNativeSceneRequest(input:unknown):NativeSceneRequest;
export class NativeScenePresentation {constructor(state:NativeDevelopmentState);replaceState(state:NativeDevelopmentState):void;restoreCommittedState(state:NativeDevelopmentState):void;frame(playerId:string,input:NativeSceneRequest,now?:number):DeepReadonly<Omit<NativeSceneFrame,'epoch'>>;}
