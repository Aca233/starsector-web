import type { Match } from './protocol';
export type BattleShipStatus = 'reserve' | 'deployed' | 'retreating' | 'retreated' | 'destroyed';
export interface BattleReportShip { id:string; team:number; seat:number|null; name:string; cost:number; status:BattleShipStatus; hull:number; hullMax:number; cr:number; }
export interface BattleReport { tick:number; seconds:number; ships:BattleReportShip[]; }
export interface BattleEnded { matchId:string; reason:string; winner?:number|'draw'; report?:BattleReport; }
export const MAX_BATTLE_REPORT_BYTES:number;
export function validateBattleReport(input:unknown, match:Match, frame?:{tick:number;ships:Array<{id:string;state:{teamId:number}}> }|null):BattleReport;
