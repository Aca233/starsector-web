import type { DeepReadonly } from '../Types.js';
export interface OriginalEconomySchedule { schemaVersion: 1; phase: 'WAITING' | 'DOING_TASKS'; elapsed: number; untilNext: number; iterLeft: number; prevMonth: number; taskIndex: number | null }
export type OriginalEconomyTask = 'MainWorkTask2' | 'UpdateMarketsAgainTask' | 'ImmigrationTask' | 'FinishEconomyUpdateTask';
export interface OriginalEconomyFrame { amountDays: number; month: number; day: number; daysInMonth: number; completedTask: OriginalEconomyTask | null }
export type OriginalEconomyScheduleEvent = { type: 'economy-tick'; iteration: number } | { type: 'economy-month-end' } | { type: 'begin-economy-pass'; withStockpileUpdate: boolean; iteration: number } | { type: 'advance-task'; task: OriginalEconomyTask };
export function initialOriginalEconomySchedule(): DeepReadonly<OriginalEconomySchedule>;
export function advanceOriginalEconomySchedule(previous: DeepReadonly<OriginalEconomySchedule>, frame: DeepReadonly<OriginalEconomyFrame>): DeepReadonly<{ state: OriginalEconomySchedule; events: OriginalEconomyScheduleEvent[] }>;

export function restoreOriginalEconomySchedule(previous:DeepReadonly<OriginalEconomySchedule>):DeepReadonly<OriginalEconomySchedule>;
/** Receivers must mutate the same encompassing transaction and persist their report/listener state alongside the economy checkpoint; no independent commits. */
export interface OriginalEconomyNotificationRuntime {
 reportSectorEconomyTick(iteration:number):void;reportManagedEconomyTick(iteration:number):void;
 reportSectorEconomyMonthEnd():void;reportManagedEconomyMonthEnd():void;
}
export interface OriginalEconomyScheduleRuntime extends OriginalEconomyNotificationRuntime {
 setScheduleState(state:DeepReadonly<OriginalEconomySchedule>):void;
 beginEconomyPass(withStockpileUpdate:boolean):void;advanceTask(task:OriginalEconomyTask):boolean;
}
export function advanceOriginalEconomyScheduleWithRuntime(previous:DeepReadonly<OriginalEconomySchedule>,frame:DeepReadonly<Omit<OriginalEconomyFrame,'completedTask'>>,runtime:OriginalEconomyScheduleRuntime):ReturnType<typeof advanceOriginalEconomySchedule>;
