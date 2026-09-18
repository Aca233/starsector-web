import type { RoomOptions } from './protocol';
import type { Design } from '../studio/DesignModel';
export function teamName(team:number):string;
export function wireBytes(value:unknown):number;
export function checkFleetBudget(options:RoomOptions,limit:number,humans:number,extraHull?:string,extraCount?:number):void;
export interface AiFleetEdit {
  assignment:RoomOptions['assignment']; operation:'add'|'adjust'|'set-count'|'refit'|'remove'|'move';
  team:number; targetTeam?:number; hull?:string; count?:number; design?:Design; scope?:'group'|'one'; baseRevision?:number;
}
export function editAiFleet(options:RoomOptions,edit:AiFleetEdit,limit:number,humans:number):RoomOptions;
