import type { RoomOptions } from './protocol';
export function roomDeploymentBlockReason(members: readonly {team:number;name:string;hull?:string;design?:{hullId:string}|null}[], options: RoomOptions): string;
