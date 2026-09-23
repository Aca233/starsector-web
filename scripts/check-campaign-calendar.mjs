import {OriginalNativeClock,originalJavaZoneOffset} from '../src/campaign/rules/OriginalNativeClock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  ORIGINAL_CALENDAR as C, ORIGINAL_CALENDAR_EPOCH_KEY as EPOCH_KEY,
  createOriginalCalendarEpoch as epoch, createOriginalNewGameEpoch as newGame,
  validateOriginalCalendarEpoch as validate, originalCalendarDateAt as dateAt,
  originalCalendarHudAt as hudAt, formatOriginalCalendarHud as hud,
  isOriginalLeapCycle as leap, originalDaysInMonth as days, originalCalendarProvider as provider,
} from '../src/campaign/rules/OriginalCalendar.mjs';
import reference from '../src/campaign/data/reference-calendar.json' with { type: 'json' };
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';

const date = (cycle, month, day, hour = 0, minute = 0, second = 0) => ({ cycle, month, day, hour, minute, second });
const anchor = (d = date(206, 1, 1), atGameSeconds = 0) => epoch({ date: d, atGameSeconds, source: 'explicit-test-fixture' });
const bad = callback => assert.throws(callback, error => ['INVALID_CALENDAR', 'CALENDAR_VERSION', 'INVALID_JSON', 'INVALID_NUMBER'].includes(error.code));

test('epoch is explicit, detached, immutable, and survives exact JSON persistence', () => {
  const input = { date: { cycle: 456, month: 7, day: 8 }, atGameSeconds: 123.5, source: 'scenario:custom-v1' };
  const e = epoch(input); input.date.day = 9;
  assert.deepEqual(e.date, date(456, 7, 8)); assert.equal(e.atGameSeconds, 123.5);
  assert.equal(e.providerId, 'reference.calendar'); assert.equal(e.secondsPerDay, 10);
  assert.ok(Object.isFrozen(e)); assert.ok(Object.isFrozen(e.date));
  const restored = validate(JSON.parse(JSON.stringify(e)));
  assert.deepEqual(restored, e); assert.notEqual(restored, e); assert.notEqual(restored.date, e.date);
  assert.deepEqual(dateAt(restored, 123.5), e.date);
});

test('verified tutorial and skip flows share 60.2-day warmup; dev flow does not', () => {
  for (const start of ['tutorial', 'skip-tutorial']) {
    const e = newGame({ start, atGameSeconds: 0 });
    assert.deepEqual(e.date, date(206, 3, 2, 4, 48));
    assert.deepEqual(dateAt(anchor(), 602), e.date);
    assert.match(e.source, new RegExp(`${start}$`));
  }
  assert.deepEqual(newGame({ start: 'development-no-time-pass', atGameSeconds: 0 }).date, date(206, 1, 1));
  const at602 = newGame({ start: 'tutorial', atGameSeconds: 602 });
  assert.deepEqual(dateAt(at602, 602), date(206, 3, 2, 4, 48)); // no double warmup
  bad(() => newGame({ start: 'custom', atGameSeconds: 0 }));
  bad(() => newGame({ atGameSeconds: 0 })); bad(() => newGame({ start: 'tutorial' }));
});

test('10 game seconds per civil day; whole-second floor without per-call accumulation', () => {
  const e = anchor();
  assert.deepEqual(dateAt(e, 0), date(206, 1, 1));
  assert.deepEqual(dateAt(e, 1 / 8640), date(206, 1, 1, 0, 0, 1));
  assert.deepEqual(dateAt(e, 0.5 / 8640), date(206, 1, 1));
  assert.deepEqual(dateAt(e, 5), date(206, 1, 1, 12));
  assert.deepEqual(dateAt(e, 10 - 1e-8), date(206, 1, 1, 23, 59, 59));
  assert.deepEqual(dateAt(e, 10), date(206, 1, 2));
  assert.deepEqual(dateAt(e, 10 + 1e-8), date(206, 1, 2));
  assert.deepEqual(dateAt(anchor(date(206, 1, 31, 23, 59, 59)), 1 / 8640), date(206, 2, 1));
});

test('month length is not convertToMonths fixed divisor 30', () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => days(206, i + 1)), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  assert.deepEqual(dateAt(anchor(), 300), date(206, 1, 31));
  assert.deepEqual(dateAt(anchor(), 310), date(206, 2, 1));
  assert.deepEqual(dateAt(anchor(), 590), date(206, 3, 1));
  for (let month = 1; month < 12; month++) {
    assert.deepEqual(dateAt(anchor(date(206, month, 1)), days(206, month) * 10), date(206, month + 1, 1));
  }
});

test('Julian leap cycles include c300, unlike a proleptic Gregorian JS Date', () => {
  for (const cycle of [4, 100, 208, 300, 400, 1500]) {
    assert.equal(leap(cycle), true); assert.equal(days(cycle, 2), 29);
    assert.deepEqual(dateAt(anchor(date(cycle, 2, 28)), 10), date(cycle, 2, 29));
    assert.deepEqual(dateAt(anchor(date(cycle, 2, 28)), 20), date(cycle, 3, 1));
    assert.deepEqual(dateAt(anchor(date(cycle, 1, 1)), 3660), date(cycle + 1, 1, 1));
  }
  for (const cycle of [1, 206, 207, 209, 1700, 1800, 1900, 2100]) {
    assert.equal(leap(cycle), false); assert.equal(days(cycle, 2), 28);
    assert.deepEqual(dateAt(anchor(date(cycle, 2, 28)), 10), date(cycle, 3, 1));
  }
  for (const cycle of [1600, 2000, 2400]) assert.equal(leap(cycle), true);
});

test('1582 cutover skips ten civil labels while month maximum stays 31', () => {
  assert.equal(days(1582, 10), 31);
  assert.deepEqual(dateAt(anchor(date(1582, 10, 4)), 10), date(1582, 10, 15));
  assert.deepEqual(dateAt(anchor(date(1582, 10, 15), 10), 0), date(1582, 10, 4));
  assert.deepEqual(dateAt(anchor(date(1582, 10, 1)), 210), date(1582, 11, 1));
  assert.deepEqual(dateAt(anchor(date(1582, 1, 1)), 3550), date(1583, 1, 1));
  for (let d = 5; d <= 14; d++) bad(() => anchor(date(1582, 10, d)));
});

test('cycle rollover, explicit time-of-day and earlier historical queries', () => {
  const e = anchor(date(206, 12, 31, 23, 59, 59), 100);
  assert.deepEqual(dateAt(e, 100 + 1 / 8640), date(207, 1, 1));
  assert.deepEqual(dateAt(e, 90), date(206, 12, 30, 23, 59, 59));
  assert.deepEqual(dateAt(anchor(date(207, 1, 1)), 3650), date(208, 1, 1));
  assert.deepEqual(dateAt(anchor(date(208, 1, 1)), 3660), date(209, 1, 1));
});

test('absolute world tick queries and arbitrary read batches give identical HUD and leave state untouched', () => {
  const e = anchor(date(206, 12, 31, 23, 58), 0), saved = JSON.stringify(e);
  const run = batches => {
    let tick = 0, result;
    for (const ticks of batches) { tick += ticks; result = hudAt(e, tick / 60); }
    return result;
  };
  assert.deepEqual(run([7200]), run(Array(7200).fill(1)));
  assert.deepEqual(run([200, 4000, 2999, 1]), run([7200]));
  assert.deepEqual(dateAt(e, 1 / 60), date(207, 1, 1, 0, 0, 24));
  assert.equal(JSON.stringify(e), saved);
  // Check many integer civil-second boundaries produced by the existing 60Hz clock.
  const plain = anchor();
  for (let tick = 1; tick < 10000; tick += 37) {
    const d = dateAt(plain, tick / 60), civilSeconds = tick * 144;
    assert.equal(d.hour * 3600 + d.minute * 60 + d.second, civilSeconds % 86400);
  }
});

test('localized native HUD preserves parts, punctuation, alignment spaces and format variants', () => {
  const result = hud(date(206, 3, 2, 4, 48));
  assert.equal(result.dateLabel, '日期'); assert.equal(result.cycleLabel, '星历年');
  assert.equal(result.monthText, '   3月'); assert.equal(result.dayText, '2日,'); assert.equal(result.cycleText, '206');
  assert.equal(result.dateString, '   3月 2, c206'); assert.equal(result.shortDate, '206.3.2'); assert.equal(result.cycleString, 'c206');
  assert.equal(result.monthString, ' 3月'); assert.equal(hud(date(206, 5, 1)).monthText, ' 5月');
  assert.equal(hud(date(206, 10, 1)).monthText, '10月'); assert.ok(Object.isFrozen(result.date));
});

test('native day bar uses minute-only /23 strict steps, not smooth /24', () => {
  for (const [hour, minute, fraction] of [[0, 0, 0], [4, 35, 0], [4, 36, 0], [4, 37, 0.25],
    [9, 12, 0.25], [9, 13, 0.5], [13, 48, 0.5], [13, 49, 0.75], [18, 24, 0.75], [18, 25, 1], [23, 59, 1]]) {
    assert.equal(hud(date(206, 1, 1, hour, minute)).dayProgress, fraction, `${hour}:${minute}`);
    assert.equal(hud(date(206, 1, 1, hour, minute, 59)).dayProgress, fraction);
  }
});

test('unsupported/missing epoch is an error, never a new-game default or permissive date rollover', () => {
  for (const v of [undefined, null, [], {}, 0, '206.1.1']) bad(() => validate(v));
  for (const d of [date(0, 1, 1), date(-1, 1, 1), date(10000, 1, 1), date(206.5, 1, 1), date(206, 0, 1),
    date(206, 13, 1), date(206, 1, 0), date(206, 2, 29), date(206, 4, 31), date(206, 1, 1, 24),
    date(206, 1, 1, 0, 60), date(206, 1, 1, 0, 0, 60), date(206, 1, 1, 0, 0, 0.5)]) bad(() => anchor(d));
  for (const n of [-1, NaN, Infinity, -Infinity, '0', null, undefined, 1_000_000_001]) {
    bad(() => epoch({ date: date(206, 1, 1), atGameSeconds: n, source: 'test' })); bad(() => dateAt(anchor(), n));
  }
  bad(() => epoch({ date: date(206, 1, 1), atGameSeconds: 0 }));
  bad(() => epoch({ date: date(206, 1, 1), atGameSeconds: 0, source: '  ' }));
  bad(() => epoch({ date: date(206, 1, 1), atGameSeconds: 0, source: 'test', secondsPerDay: 5 }));
  for (const key of ['schemaVersion', 'providerId', 'providerVersion', 'calendarSystem', 'timeBasis', 'secondsPerDay']) {
    bad(() => validate({ ...anchor(), [key]: 'changed' }));
  }
  const missingTime = JSON.parse(JSON.stringify(anchor())); delete missingTime.date.second;
  bad(() => validate(missingTime)); bad(() => validate({ ...anchor(), timestamp: -123456789 }));
  bad(() => leap(NaN)); bad(() => days(206, 1.5));
  let getterCalls = 0;
  const accessor = { date: date(206, 1, 1), atGameSeconds: 0, get source() { getterCalls++; return 'not-data'; } };
  bad(() => epoch(accessor)); assert.equal(getterCalls, 0);
  bad(() => validate(Object.assign(Object.create({ inherited: true }), anchor())));
  bad(() => anchor({ ...date(206, 1, 1), timezone: 'UTC' }));
});

test('supported date/precision limits and tiny fractions do not silently overflow or normalize BCE', () => {
  assert.deepEqual(dateAt(anchor(date(1, 1, 1)), 0), date(1, 1, 1));
  assert.deepEqual(dateAt(anchor(date(9999, 12, 31, 23, 59, 59)), 0), date(9999, 12, 31, 23, 59, 59));
  bad(() => dateAt(anchor(date(9999, 12, 31, 23, 59, 59)), 1 / 8640));
  bad(() => dateAt(anchor(date(1, 1, 1), 10), 0));
  bad(() => dateAt(anchor(), C.maxGameSeconds));
  assert.deepEqual(dateAt(anchor(date(206, 1, 1), C.maxGameSeconds), C.maxGameSeconds), date(206, 1, 1));
  assert.deepEqual(dateAt(anchor(date(206, 1, 1), 1e8), 1e8 + 1 / 8640), date(206, 1, 1, 0, 0, 1));
});

test('calendar service can be pinned/replaced and epoch fits existing provider-owned versioned extensions', () => {
  const rules = new CampaignRuleRegistry().register(provider).compile({ id: 'calendar-test', version: '1.0.0', providers: { calendar: provider.id } });
  const w = structuredClone(createCampaignWorld({ id: 'calendar-test', rules: rules.lock, contentFingerprint: 'calendar-only-fixture' }));
  const e = rules.services.calendar.createEpoch({ date: date(777, 8, 9), atGameSeconds: w.clock.gameSeconds, source: 'explicit-world-creation' });
  w.extensions[EPOCH_KEY] = { id: EPOCH_KEY, version: 0, schemaVersion: 1, data: { epoch: e } };
  const persisted = validateCampaignWorld(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(rules.services.calendar.hudAt(persisted.extensions[EPOCH_KEY].data.epoch, persisted.clock.gameSeconds).date, date(777, 8, 9));
  assert.equal(rules.handler('world.advance'), undefined); assert.equal(provider.commands, undefined);
  assert.ok(rules.acceptsLock(persisted.rules));
  const alternate = { id: 'test.alternate-calendar', version: '1.0.0', service: 'calendar', apiVersion: 1,
    capabilities: provider.capabilities, methods: { hudAt: () => ({ shortDate: 'custom' }) } };
  const custom = new CampaignRuleRegistry().register(provider).register(alternate).compile({ id: 'overhaul', version: '1.0.0', providers: { calendar: alternate.id } });
  assert.equal(custom.services.calendar.hudAt().shortDate, 'custom'); assert.equal(custom.acceptsLock(rules.lock), false);
});

test('host timezone cannot affect civil date or HUD output', () => {
  const moduleUrl = new URL('../src/campaign/rules/OriginalCalendar.mjs', import.meta.url).href;
  const script = `import {createOriginalCalendarEpoch as e,originalCalendarHudAt as h} from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify(h(e({date:{cycle:2024,month:3,day:10},atGameSeconds:0,source:'tz-fixture'}),10)));`;
  const outputs = ['UTC', 'Asia/Shanghai', 'America/New_York', 'Pacific/Apia'].map(TZ => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr); return run.stdout;
  });
  for (const out of outputs) assert.equal(out, outputs[0]);
  assert.deepEqual(JSON.parse(outputs[0]).date, date(2024, 3, 11));
});

// Optional executable oracle: actual installed CampaignClock class, not a transcription of its Java code.
// No repository files are generated; only a source/class pair in a fresh temp directory, cleaned by t.after.
const nativeEnabled = process.argv.includes('--native');
test('native source hashes and installed Java CampaignClock/GregorianCalendar differential oracle', { skip: !nativeEnabled }, t => {
  const install = fileURLToPath(new URL('../../', import.meta.url));
  for (const item of reference.sources) {
    const hash = createHash('sha256').update(readFileSync(resolve(install, item.path))).digest('hex');
    assert.equal(hash, item.sha256, `Native source changed: ${item.path}`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'starsector-calendar-'));
  const sourcePath = join(dir, 'CalendarProbe.java');
  const classPath = join(dir, 'CalendarProbe.class');
  t.after(() => { for (const path of [sourcePath, classPath]) if (existsSync(path)) unlinkSync(path); rmdirSync(dir); });
  const source = `
import com.fs.starfarer.campaign.CampaignClock;
import java.util.*;
public class CalendarProbe {
  static String fields(CampaignClock c) { GregorianCalendar g=c.getCal(); return c.getCycle()+","+c.getMonth()+","+c.getDay()+","+c.getHour()+","+g.get(Calendar.MINUTE)+","+g.get(Calendar.SECOND); }
  static void out(String key, Object value) { System.out.println(key+"|"+value); }
  public static void main(String[] args) {
    TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    CampaignClock c=new CampaignClock(); out("constructor", fields(c)); out("rate", c.getSecondsPerDay());
    for(int i=0;i<120;i++) for(int j=0;j<2;j++) c.advance(2.5f);
    for(int i=0;i<30;i++) c.advance(0.06666667f);
    out("warmup", fields(c)); out("dateString", c.getDateString()); out("shortDate", c.getShortDate());
    out("cycleString", c.getCycleString()); out("monthString", c.getMonthString());
    CampaignClock split=new CampaignClock(), whole=new CampaignClock();
    for(int i=0;i<100;i++) split.advance(.001f); whole.advance(.1f);
    out("nativeSplit", fields(split)); out("nativeWhole", fields(whole));
    CampaignClock setter=new CampaignClock(); long timestamp=setter.getTimestamp(); setter.set(206,1,1);
    out("setMonthZeroBased", fields(setter)); out("setTimestampUnchanged", setter.getTimestamp()==timestamp);
    for(int m=1;m<=12;m++) { c.getCal().set(Calendar.MONTH,m-1); out("shortMonth"+m,c.getShortMonthString()); }
    for(int m=0;m<1440;m++) {
      float f=((float)(m/60)+(float)(m%60)/60.0f)/23.0f;
      f=f>0.8f?1.0f:f>0.6f?0.75f:f>0.4f?0.5f:f>0.2f?0.25f:0;
      out("bar"+m,f);
    }
    Scanner s=new Scanner(System.in);
    while(s.hasNextLine()) {
      String line=s.nextLine(); if(line.isEmpty()) continue; String[] v=line.split(",");
      c=new CampaignClock(); GregorianCalendar g=c.getCal(); g.clear();
      g.set(Integer.parseInt(v[1]),Integer.parseInt(v[2])-1,Integer.parseInt(v[3]),Integer.parseInt(v[4]),Integer.parseInt(v[5]),Integer.parseInt(v[6]));
      int count=Integer.parseInt(v[7]);
      if(v[0].startsWith("clock")) c.advance(Float.parseFloat(v[8])); else { g.add(Calendar.DATE,count); c.advance(0); }
      out(v[0],fields(c));
    }
  }
}
`;
  writeFileSync(sourcePath, source, 'utf8');
  const cases = [];
  for (const cycle of [1, 4, 99, 100, 206, 208, 300, 400, 1500, 1582, 1600, 1700, 1900, 2000, 2400, 9998]) {
    for (let month = 1; month <= 12; month++) {
      for (const offset of [0, 1, 28, 31, 60, 366]) {
        const d = date(cycle, month, 1, 13, 27, 11), id = `days${cases.length}`;
        cases.push({ id, input: [id, ...Object.values(d), offset].join(','), expected: dateAt(anchor(d), offset * 10) });
      }
    }
  }
  for (const d of [date(206, 1, 31), date(206, 2, 28), date(208, 2, 28), date(300, 2, 28), date(1582, 10, 4), date(1700, 2, 28), date(206, 12, 31, 23, 59, 59)]) {
    for (const seconds of [0, 2.5, 10, 20, 310, 602]) {
      const id = `clock${cases.length}`;
      cases.push({ id, input: [id, ...Object.values(d), 0, seconds].join(','), expected: dateAt(anchor(d), seconds) });
    }
  }
  const jars = ['starfarer_obf.jar', 'starfarer.api.jar', 'fs.common_obf.jar'].map(name => join(install, 'starsector-core', name)).join(delimiter);
  // Compile for Java 17 using a JDK, then execute with the actual bundled JRE (it omits jdk.compiler).
  const compile = spawnSync(process.env.CALENDAR_JAVAC ?? 'javac', ['--release', '17', '-encoding', 'UTF-8', '-cp', jars, '-d', dir, sourcePath],
    { encoding: 'utf8', timeout: 60000 });
  assert.equal(compile.status, 0, compile.stderr || compile.error?.message);
  const run = spawnSync(join(install, 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
    ['-Dfile.encoding=UTF-8', '--class-path', [dir, jars].join(delimiter), 'CalendarProbe'],
    { input: cases.map(c => c.input).join('\n') + '\n', encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || run.error?.message);
  const outputs = new Map(run.stdout.trim().split(/\r?\n/).map(line => { const i = line.indexOf('|'); return [line.slice(0, i), line.slice(i + 1)]; }));
  const parse = key => Object.fromEntries(['cycle', 'month', 'day', 'hour', 'minute', 'second'].map((name, i) => [name, Number(outputs.get(key)?.split(',')[i])]));
  assert.deepEqual(parse('constructor'), reference.constructorDate); assert.equal(Number(outputs.get('rate')), C.secondsPerDay);
  assert.deepEqual(parse('warmup'), reference.afterStandardTimePassDate);
  const warmHud = hud(reference.afterStandardTimePassDate);
  for (const name of ['dateString', 'shortDate', 'cycleString', 'monthString']) assert.equal(outputs.get(name), warmHud[name]);
  for (let m = 1; m <= 12; m++) assert.equal(outputs.get(`shortMonth${m}`), reference.shortMonthLabels[m - 1]);
  assert.deepEqual(parse('nativeSplit'), date(206, 1, 1, 0, 13, 20));
  assert.deepEqual(parse('nativeWhole'), date(206, 1, 1, 0, 14, 24));
  assert.deepEqual(parse('setMonthZeroBased'), date(206, 2, 1)); assert.equal(outputs.get('setTimestampUnchanged'), 'true');
  for (let m = 0; m < 1440; m++) assert.equal(Number(outputs.get(`bar${m}`)), hud(date(206, 1, 1, Math.floor(m / 60), m % 60)).dayProgress, `bar minute ${m}`);
  for (const c of cases) assert.deepEqual(parse(c.id), c.expected, c.input);
  t.diagnostic(`Verified ${reference.sources.length} source hashes, ${cases.length} date vectors, 1440 Java-float HUD bar positions, constructor/warmup/formatting and native batch discrepancy`);
});


// In-memory consumer: check declarations without writing a shared contract/config/build artifact.
test('strict TypeScript consumer can call the provider and persist its JSON contract', async () => {
  const { default: ts } = await import('typescript');
  const virtualPath = fileURLToPath(new URL('./__calendar_contract__.mts', import.meta.url));
  const source = `
    import { originalCalendarProvider, createOriginalCalendarEpoch, originalCalendarHudAt } from '../src/campaign/rules/OriginalCalendar.mjs';
    import type { CampaignRuleProvider, JsonValue } from '../src/campaign/Types.js';
    const p: CampaignRuleProvider = originalCalendarProvider;
    const e = createOriginalCalendarEpoch({date:{cycle:206,month:1,day:1},atGameSeconds:0,source:'typed-test'});
    const stored: JsonValue = e;
    const rendered: JsonValue = originalCalendarHudAt(e, 10);
    const day: number = originalCalendarProvider.methods.dateAt(e, 10).day;
    // @ts-expect-error: persisted anchor gameSeconds is mandatory.
    createOriginalCalendarEpoch({date:{cycle:206,month:1,day:1},source:'typed-test'});
    // @ts-expect-error: never guess a custom start.
    originalCalendarProvider.methods.createNewGameEpoch({start:'custom',atGameSeconds:0});
    // @ts-expect-error: immutable epoch.
    e.date.day = 2;
    void p; void stored; void rendered; void day;
  `;
  const options = { strict: true, noEmit: true, skipLibCheck: false, target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: ['node'] };
  const host = ts.createCompilerHost(options), originalRead = host.readFile.bind(host), originalGet = host.getSourceFile.bind(host);
  host.readFile = path => resolve(path) === virtualPath ? source : originalRead(path);
  host.getSourceFile = (path, languageVersion, onError, shouldCreate) => resolve(path) === virtualPath
    ? ts.createSourceFile(path, source, languageVersion, true) : originalGet(path, languageVersion, onError, shouldCreate);
  const program = ts.createProgram([virtualPath], options, host), diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics,
    { getCurrentDirectory: () => fileURLToPath(new URL('../', import.meta.url)), getCanonicalFileName: f => f, getNewLine: () => '\n' }));
});


test('saved native clock uses explicit Java zone data, preserves milliseconds and truncates every original frame',()=>{
 const state={schemaVersion:1,timestamp:123,secondsPerDay:10,zone:{scope:'expanded-java-timezone',id:'UTC',minTimestamp:-63000000000000,maxTimestamp:254000000000000,initialOffset:0,transitions:[]}};
 const clock=new OriginalNativeClock(state),initial=clock.snapshot();assert.deepEqual(clock.date(),date(1970,1,1));
 const tiny=clock.advance(0.00001);assert.equal(tiny.timestamp,123);assert.ok(tiny.amountDays>0);
 for(let i=0;i<10;i++)clock.advance(0.0002);assert.equal(clock.snapshot().timestamp,10123);
 const batched=new OriginalNativeClock(state);batched.advance(0.002);assert.equal(batched.snapshot().timestamp,17123);assert.equal(initial.timestamp,123);
 const restored=new OriginalNativeClock(JSON.parse(JSON.stringify(clock.snapshot())));assert.deepEqual(restored.date(),clock.date());assert.equal(restored.elapsedDaysSince(0),Math.fround(3.4028234663852886e38));
 const cutover=new OriginalNativeClock({...state,timestamp:-12219292801000});assert.deepEqual(cutover.date(),date(1582,10,4,23,59,59));assert.deepEqual(cutover.advance(0.00012).date,date(1582,10,15));
 const shifting={...state.zone,transitions:[{at:86400000,offset:3600000},{at:172800000,offset:0}]};assert.equal(originalJavaZoneOffset(shifting,86399999),0);assert.equal(originalJavaZoneOffset(shifting,86400000),3600000);assert.equal(originalJavaZoneOffset(shifting,172800000),0);
 assert.deepEqual(new OriginalNativeClock({...state,timestamp:86400000,zone:shifting}).date(),date(1970,1,2,1));
 assert.throws(()=>new OriginalNativeClock({...state,zone:{...shifting,transitions:shifting.transitions.toReversed()}}),/Unordered/);
 assert.throws(()=>new OriginalNativeClock({...state,secondsPerDay:0}));assert.deepEqual(state,{...state,timestamp:123});
});
