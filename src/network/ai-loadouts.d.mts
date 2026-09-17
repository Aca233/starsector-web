import type { Design } from '../studio/DesignModel';
import type { RoomOptions } from './protocol';
export function aiDesignSignature(input:unknown):string;
export function aiLoadout(options:RoomOptions,key:string):Design|undefined;
export function aiHullId(options:RoomOptions,key:string):string;
export function pruneAiLoadouts(options:RoomOptions):RoomOptions;
export function registerAiLoadout(options:RoomOptions,input:unknown):{options:RoomOptions;key:string};
