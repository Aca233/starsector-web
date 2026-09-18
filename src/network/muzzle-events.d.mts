import type {MuzzleFlashSpec,LauncherSmokeSpec} from '../engine/simulation/Weapon';
export const MAX_MUZZLE_EVENTS:number,MAX_MUZZLE_STYLES:number,MAX_MUZZLE_PARTICLES:number;
export type MuzzleStyle={kind:0;spec:MuzzleFlashSpec}|{kind:1;spec:LauncherSmokeSpec};
/** id, birth time, style index, native RNG cursor, x, y, vx, vy, angle */
export type MuzzleEventRow=[number,number,number,number,number,number,number,number,number];
export interface MuzzleEventBatch {time:number;latest:number;styles:MuzzleStyle[];events:MuzzleEventRow[]}
export interface MuzzleStyleInfo {style:MuzzleStyle;particles:number;samples:number;duration:number}
export function describeMuzzleStyle(kind:0|1,input:unknown):MuzzleStyleInfo|null;
export function validateMuzzleEvents(batch:unknown):MuzzleStyleInfo[];
