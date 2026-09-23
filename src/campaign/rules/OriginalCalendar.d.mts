import type { CampaignRuleProvider, ReadonlyWorld } from '../Types.js';

export type OriginalCalendarDate = {
  readonly cycle: number; readonly month: number; readonly day: number;
  readonly hour: number; readonly minute: number; readonly second: number;
}
export type OriginalCalendarDateInput = Pick<OriginalCalendarDate, 'cycle' | 'month' | 'day'>
  & Partial<Pick<OriginalCalendarDate, 'hour' | 'minute' | 'second'>>;
/** JSON-only persisted civil anchor. Not a Java/Unix timestamp and not a display preference. */
export type OriginalCalendarEpoch = {
  readonly schemaVersion: 1;
  readonly providerId: 'reference.calendar'; readonly providerVersion: '1.0.0';
  readonly calendarSystem: 'julian-gregorian-1582'; readonly timeBasis: 'fixed-civil';
  readonly secondsPerDay: 10; readonly atGameSeconds: number;
  readonly date: OriginalCalendarDate; readonly source: string;
}
export interface OriginalCalendarEpochInput {
  readonly date: OriginalCalendarDateInput; readonly atGameSeconds: number; readonly source: string;
}
export type OriginalNewGameStart = 'tutorial' | 'skip-tutorial' | 'development-no-time-pass';
export type OriginalCalendarHud = {
  readonly date: OriginalCalendarDate;
  readonly dateLabel: string; readonly cycleLabel: string;
  readonly monthText: string; readonly dayText: string; readonly cycleText: string;
  readonly dateString: string; readonly shortDate: string; readonly cycleString: string; readonly monthString: string;
  readonly dayProgress: 0 | 0.25 | 0.5 | 0.75 | 1;
}
export const ORIGINAL_CALENDAR: Readonly<{
  providerId: 'reference.calendar'; providerVersion: '1.0.0'; schemaVersion: 1;
  calendarSystem: 'julian-gregorian-1582'; timeBasis: 'fixed-civil';
  secondsPerDay: 10; secondsPerCivilDay: 86400; minCycle: 1; maxCycle: 9999; maxGameSeconds: 1000000000;
}>;
export const ORIGINAL_CALENDAR_EPOCH_KEY: 'reference.calendar:epoch';
export function isOriginalLeapCycle(cycle: number): boolean;
/** Maximum civil day label; October 1582 skips days 5..14. */
export function originalDaysInMonth(cycle: number, month: number): number;
export function createOriginalCalendarEpoch(input: OriginalCalendarEpochInput): OriginalCalendarEpoch;
export function validateOriginalCalendarEpoch(value: unknown): OriginalCalendarEpoch;
export function createOriginalNewGameEpoch(input: { readonly start: OriginalNewGameStart; readonly atGameSeconds: number }): OriginalCalendarEpoch;
export function originalCalendarDateAt(epoch: OriginalCalendarEpoch, gameSeconds: number): OriginalCalendarDate;
export function formatOriginalCalendarHud(date: OriginalCalendarDate): OriginalCalendarHud;
export function originalCalendarHudAt(epoch: OriginalCalendarEpoch, gameSeconds: number): OriginalCalendarHud;
export function projectOriginalCalendarWorld(world: ReadonlyWorld): OriginalCalendarHud | null;
export function validateOriginalCalendarWorld(world: ReadonlyWorld): void;
export interface OriginalCalendarMethods {
  validateWorld: typeof validateOriginalCalendarWorld;
  projectWorld: typeof projectOriginalCalendarWorld;
  createEpoch: typeof createOriginalCalendarEpoch;
  createNewGameEpoch: typeof createOriginalNewGameEpoch;
  validateEpoch: typeof validateOriginalCalendarEpoch;
  dateAt: typeof originalCalendarDateAt;
  hudAt: typeof originalCalendarHudAt;
  formatHud: typeof formatOriginalCalendarHud;
  isLeapCycle: typeof isOriginalLeapCycle;
  daysInMonth: typeof originalDaysInMonth;
}
export const originalCalendarProvider: CampaignRuleProvider & { readonly service: 'calendar'; readonly methods: OriginalCalendarMethods };


/** Uses an explicit native Java timezone offset; never guesses the host timezone. */
export function originalCalendarDateFromUnixMilliseconds(timestamp:number,offsetMilliseconds:number):OriginalCalendarDate;
