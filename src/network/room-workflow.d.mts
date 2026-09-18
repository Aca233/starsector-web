import type { Design } from '../studio/DesignModel';
import type { LanConnection, Room } from './protocol';
export interface RoomApplyAction { label: string; continueToAction: boolean; hint: string }
export function roomApplyAction(room: Room, id: string, draft: Design): RoomApplyAction;
export function roomWorkflow(room: Room, id: string): {
  ready: number; guests: number; offline: boolean; deploymentBlocked: boolean; opponentsMissing: boolean; opponentTeam: number;
  editing: string[]; blocked: string; ownReady: boolean;
};
export function submitRoomAction(connection: LanConnection, roomCode: string, id: string,
  action: { type: 'start' } | { type: 'ready'; ready: boolean }, signal?: AbortSignal): Promise<void>;
