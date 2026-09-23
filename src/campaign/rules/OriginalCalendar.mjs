import reference from '../data/reference-calendar.json' with { type: 'json' };
import { deepFreeze, isRecord, jsonCopy, requireThat } from '../core/Values.mjs';

deepFreeze(reference);

/** Civil calendar only: this module never advances, pauses, or reads a world clock. */
export const ORIGINAL_CALENDAR = deepFreeze({
  providerId: 'reference.calendar', providerVersion: '1.0.0', schemaVersion: 1,
  calendarSystem: 'julian-gregorian-1582', timeBasis: 'fixed-civil',
  secondsPerDay: reference.secondsPerDay, secondsPerCivilDay: 86400,
  minCycle: 1, maxCycle: 9999, maxGameSeconds: 1_000_000_000,
});
export const ORIGINAL_CALENDAR_EPOCH_KEY = 'reference.calendar:epoch';
const C = ORIGINAL_CALENDAR;
const DATE_KEYS = ['cycle', 'month', 'day', 'hour', 'minute', 'second'];
const EPOCH_KEYS = ['schemaVersion', 'providerId', 'providerVersion', 'calendarSystem', 'timeBasis', 'secondsPerDay', 'atGameSeconds', 'date', 'source'];
const CUTOVER_JDN = 2299161; // Gregorian 1582-10-15, immediately after Julian 1582-10-04.
const fail = (ok, message) => requireThat(ok, 'INVALID_CALENDAR', message);
function record(value, keys, label) {
  fail(isRecord(value), `Expected ${label}`);
  fail(Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value')), 'Calendar input cannot contain accessors');
  fail(Object.keys(value).every(key => keys.includes(key)), `Unknown ${label} field`);
}
function int(value, min, max, label) {
  fail(Number.isSafeInteger(value) && value >= min && value <= max, `Invalid ${label}`);
  return value;
}
function gameTime(value) {
  fail(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= C.maxGameSeconds, 'Invalid gameSeconds');
  return value;
}
function sourceText(value) {
  fail(typeof value === 'string' && value.trim().length > 0 && value.length <= 1024, 'Explicit epoch source is required');
  return value;
}

export function isOriginalLeapCycle(cycle) {
  int(cycle, C.minCycle, C.maxCycle, 'cycle');
  // java.util.GregorianCalendar uses Julian leap years BEFORE its default cutover.
  return cycle % 4 === 0 && (cycle <= 1582 || cycle % 100 !== 0 || cycle % 400 === 0);
}
/** Maximum civil day label, as getActualMaximum(DAY_OF_MONTH); October 1582 has a gap. */
export function originalDaysInMonth(cycle, month) {
  int(cycle, C.minCycle, C.maxCycle, 'cycle'); int(month, 1, 12, 'month');
  return month === 2 ? (isOriginalLeapCycle(cycle) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function normalizedDate(value, allowOmittedTime) {
  record(value, DATE_KEYS, 'civil date');
  const cycle = int(value.cycle, C.minCycle, C.maxCycle, 'cycle');
  const month = int(value.month, 1, 12, 'month');
  const day = int(value.day, 1, originalDaysInMonth(cycle, month), 'day');
  fail(!(cycle === 1582 && month === 10 && day >= 5 && day <= 14), 'Civil date is in the Gregorian cutover gap');
  const time = key => allowOmittedTime && !Object.hasOwn(value, key) ? 0 : value[key];
  return { cycle, month, day, hour: int(time('hour'), 0, 23, 'hour'),
    minute: int(time('minute'), 0, 59, 'minute'), second: int(time('second'), 0, 59, 'second') };
}
function dayNumber({ cycle, month, day }) {
  const a = Math.floor((14 - month) / 12), y = cycle + 4800 - a, m = month + 12 * a - 3;
  const base = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4);
  const gregorian = cycle > 1582 || (cycle === 1582 && (month > 10 || month === 10 && day >= 15));
  return gregorian ? base - Math.floor(y / 100) + Math.floor(y / 400) - 32045 : base - 32083;
}
function dateFromDayNumber(jdn) {
  let c, b = 0;
  if (jdn >= CUTOVER_JDN) {
    const a = jdn + 32044; b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor(146097 * b / 4);
  } else c = jdn + 32082;
  const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
  return { cycle: 100 * b + d - 4800 + Math.floor(m / 10), month: m + 3 - 12 * Math.floor(m / 10),
    day: e - Math.floor((153 * m + 2) / 5) + 1 };
}
const MIN_JDN = dayNumber({ cycle: C.minCycle, month: 1, day: 1 });
const MAX_JDN = dayNumber({ cycle: C.maxCycle, month: 12, day: 31 });

/** Requires an explicit date AND the authoritative gameSeconds at which it applies. */
export function createOriginalCalendarEpoch(input) {
  record(input, ['date', 'atGameSeconds', 'source'], 'epoch input');
  const date = normalizedDate(input.date, true);
  return deepFreeze({ schemaVersion: C.schemaVersion, providerId: C.providerId, providerVersion: C.providerVersion,
    calendarSystem: C.calendarSystem, timeBasis: C.timeBasis, secondsPerDay: C.secondsPerDay,
    atGameSeconds: gameTime(input.atGameSeconds), date, source: sourceText(input.source) });
}
/** Validates a persisted complete epoch, returning a detached immutable JSON value. No migration/fallback. */
export function validateOriginalCalendarEpoch(value) {
  // jsonCopy rejects accessors, prototypes, NaN, cycles and non-JSON state before reading it.
  const epoch = jsonCopy(value); record(epoch, EPOCH_KEYS, 'persisted epoch');
  for (const key of ['schemaVersion', 'providerId', 'providerVersion', 'calendarSystem', 'timeBasis', 'secondsPerDay']) {
    requireThat(epoch[key] === C[key], 'CALENDAR_VERSION', `Unsupported calendar ${key}; explicit migration required`);
  }
  gameTime(epoch.atGameSeconds); sourceText(epoch.source); normalizedDate(epoch.date, false);
  return deepFreeze(epoch);
}
/** Opt-in ONLY for the verified bundled start flows; never use this to repair an old/unknown save. */
export function createOriginalNewGameEpoch(input) {
  record(input, ['start', 'atGameSeconds'], 'new-game epoch input');
  fail(['tutorial', 'skip-tutorial', 'development-no-time-pass'].includes(input.start), 'Choose a verified original start, or supply a custom epoch');
  const date = input.start === 'development-no-time-pass' ? reference.constructorDate : reference.afterStandardTimePassDate;
  return createOriginalCalendarEpoch({ date, atGameSeconds: input.atGameSeconds,
    source: `reference-calendar.json:${reference.referenceId}:${input.start}` });
}

/** Absolute projection, not incremental advance: batching and repeated reads cannot accumulate drift. */
export function originalCalendarDateAt(value, gameSeconds) {
  const epoch = validateOriginalCalendarEpoch(value); gameTime(gameSeconds);
  const rate = C.secondsPerCivilDay / epoch.secondsPerDay;
  let elapsed = (gameSeconds - epoch.atGameSeconds) * rate;
  // Correct only representational noise around an integer civil second (e.g. tick / 60).
  // This is not a scheduler quantum: fractional time is never accumulated or rounded per call.
  const nearest = Math.round(elapsed);
  const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(elapsed), gameSeconds * rate, epoch.atGameSeconds * rate);
  if (Math.abs(elapsed - nearest) <= tolerance) elapsed = nearest;
  const baseSecond = epoch.date.hour * 3600 + epoch.date.minute * 60 + epoch.date.second;
  const seconds = baseSecond + Math.floor(elapsed);
  const days = Math.floor(seconds / C.secondsPerCivilDay), secondOfDay = seconds - days * C.secondsPerCivilDay;
  const jdn = dayNumber(epoch.date) + days;
  fail(jdn >= MIN_JDN && jdn <= MAX_JDN, 'Projected date is outside supported cycles 1..9999');
  return deepFreeze({ ...dateFromDayNumber(jdn), hour: Math.floor(secondOfDay / 3600),
    minute: Math.floor(secondOfDay % 3600 / 60), second: secondOfDay % 60 });
}

/** Original GregorianCalendar civil fields for a timestamp with an explicitly restored Java zone offset. */
export function originalCalendarDateFromUnixMilliseconds(timestamp, offsetMilliseconds) {
  fail(Number.isSafeInteger(timestamp), 'Inexact native timestamp');
  int(offsetMilliseconds, -86400000, 86400000, 'explicit Java zone offset');
  const local = timestamp + offsetMilliseconds;
  fail(Number.isSafeInteger(local), 'Inexact local timestamp');
  const day = Math.floor(local / 86400000), jdn = 2440588 + day;
  fail(jdn >= MIN_JDN && jdn <= MAX_JDN, 'Native date outside supported cycles 1..9999');
  const seconds = Math.floor((local - day * 86400000) / 1000);
  return deepFreeze({ ...dateFromDayNumber(jdn), hour: Math.floor(seconds / 3600), minute: Math.floor(seconds % 3600 / 60), second: seconds % 60 });
}

/** Native localized labels/spacing are separate from calendar arithmetic and can be replaced by a provider. */
export function formatOriginalCalendarHud(value) {
  const date = normalizedDate(value, false), month = reference.shortMonthLabels[date.month - 1];
  // Campaign HUD intentionally ignores seconds and quantizes (hour + minute / 60) / 23.
  // Java float evaluation is reproduced, including strict > thresholds, not a smooth 24h bar.
  const fraction = Math.fround(Math.fround(date.hour + Math.fround(date.minute / 60)) / 23);
  const dayProgress = fraction > Math.fround(0.8) ? 1 : fraction > Math.fround(0.6) ? 0.75
    : fraction > Math.fround(0.4) ? 0.5 : fraction > Math.fround(0.2) ? 0.25 : 0;
  return deepFreeze({ date, dateLabel: reference.hud.dateLabel, cycleLabel: reference.hud.cycleLabel,
    monthText: month, dayText: `${date.day}日,`, cycleText: String(date.cycle),
    dateString: `${month} ${date.day}, c${date.cycle}`, shortDate: `${date.cycle}.${date.month}.${date.day}`,
    cycleString: `c${date.cycle}`, monthString: reference.monthLabels[date.month - 1], dayProgress });
}
export function originalCalendarHudAt(epoch, gameSeconds) {
  return formatOriginalCalendarHud(originalCalendarDateAt(epoch, gameSeconds));
}
export function projectOriginalCalendarWorld(world) {
  const state = world.extensions[ORIGINAL_CALENDAR_EPOCH_KEY];
  if (!state) return null;
  fail(state.schemaVersion === 1 && Object.keys(state.data).length === 1 && Object.hasOwn(state.data, 'epoch'), 'Invalid calendar extension');
  return originalCalendarHudAt(state.data.epoch, world.clock.gameSeconds);
}
export function validateOriginalCalendarWorld(world) { projectOriginalCalendarWorld(world); }
export const originalCalendarProvider = deepFreeze({
  id: C.providerId, version: C.providerVersion, service: 'calendar', apiVersion: 1,
  capabilities: ['persistent-calendar-epoch', 'absolute-calendar-projection', 'native-calendar-hud'],
  evidence: [{ reference: reference.referenceId, source: 'CampaignClock.java / campaign/ui/Oo0o.java / CampaignGameManager.java / rules.csv',
    scope: 'Native hybrid civil calendar and localized HUD; fixed-civil timezone and absolute projection are explicit web policies',
    provenance: reference.sources }],
  methods: { validateWorld: validateOriginalCalendarWorld, projectWorld: projectOriginalCalendarWorld, createEpoch: createOriginalCalendarEpoch, createNewGameEpoch: createOriginalNewGameEpoch,
    validateEpoch: validateOriginalCalendarEpoch, dateAt: originalCalendarDateAt, hudAt: originalCalendarHudAt,
    formatHud: formatOriginalCalendarHud, isLeapCycle: isOriginalLeapCycle, daysInMonth: originalDaysInMonth },
});


