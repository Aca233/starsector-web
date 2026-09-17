import type { RoomOptions } from "./protocol";
export function roomStartBlockReason(room: {
  status: string;
  hostId: string;
  members: Array<{id: string; name: string; hull?: string; design?: {hullId:string}|null; team: number; ready: boolean; editing?: boolean; connected: boolean}>;
  aiHulls: string[][];
  options?: RoomOptions;
}): string;
