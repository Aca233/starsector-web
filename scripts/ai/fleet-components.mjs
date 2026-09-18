import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import ts from 'typescript';

export const componentHash = value => createHash('sha256').update(value).digest('hex');
/** Modify ONLY the exported constant table in an archived offline bundle, never src/. */
export function splitComponentBundle(source, expectedTuning) {
  const blocks = [...source.matchAll(/var POLICY_TUNING = Object\.freeze\(\{\r?\n[\s\S]*?\r?\n\}\);/g)];
  assert.equal(blocks.length, 1, 'Expected exactly one recognizable policy tuning declaration');
  const block = blocks[0];
  const parsed = ts.createSourceFile('tuning.js', block[0], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(parsed.parseDiagnostics.length, 0);
  const statement = parsed.statements[0];
  assert.ok(ts.isVariableStatement(statement));
  const call = statement.declarationList.declarations[0].initializer;
  assert.ok(ts.isCallExpression(call) && call.expression.getText(parsed) === 'Object.freeze');
  const literal = call.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(literal));
  const actual = {};
  for (const property of literal.properties) {
    assert.ok(ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer));
    actual[property.name.getText(parsed)] = Object.fromEntries(property.initializer.properties.map(field => {
      assert.ok(ts.isPropertyAssignment(field) && ts.isNumericLiteral(field.initializer), 'Only numeric literal tuning is supported');
      return [field.name.getText(parsed), Number(field.initializer.text)];
    }));
  }
  assert.deepEqual(actual, expectedTuning, 'Archived source and exported policy table disagree');
  assert.deepEqual(actual.BALANCED, { range: 1, pressure: 1, finish: 1 });
  assert.deepEqual(Object.keys(actual), ['BALANCED', 'PRESSURE', 'FINISH', 'CAUTIOUS']);
  const prefix = source.slice(0, block.index), suffix = source.slice(block.index + block[0].length);
  const neutralizedBodySha256 = componentHash(prefix + 'POLICY_TUNING_TABLE' + suffix);
  const result = { FULL: { source, tuning: actual, neutralizedBodySha256 } };
  for (const component of ['RANGE', 'TARGET']) {
    const tuning = Object.fromEntries(Object.entries(actual).map(([action, entry]) => [action, component === 'RANGE'
      ? { range: entry.range, pressure: 1, finish: 1 } : { range: 1, pressure: entry.pressure, finish: entry.finish }]));
    const replacement = `var POLICY_TUNING = Object.freeze(${JSON.stringify(tuning)});`;
    const modified = prefix + replacement + suffix;
    assert.equal(modified.slice(0, prefix.length), prefix);
    assert.equal(modified.slice(prefix.length + replacement.length), suffix);
    result[component] = { source: modified, tuning, neutralizedBodySha256 };
  }
  return result;
}

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
/** Four corners of a per-mode 2x2 experiment. Unit = one mirrored scenario/seed pair. */
export function componentContrast(pairs, coefficients, random) {
  assert.ok(pairs.length > 0);
  const measures = pairs.map(pair => {
    assert.deepEqual(pair.matches.map(m => m.side).sort(), [0, 1]);
    const effects = pair.matches.map(match => {
      let score = 0, hull = 0;
      for (const [mode, coefficient] of Object.entries(coefficients)) {
        const run = match.runs[mode];
        assert.ok(run, `Missing factorial corner ${mode}`);
        assert.equal(run.seed, pair.seed); assert.equal(run.scenario, pair.scenario); assert.equal(run.learnerTeam, match.side);
        score += coefficient * run.score;
        hull += coefficient * (run.ownHull - run.enemyHull);
      }
      assert.ok(Number.isFinite(score) && Number.isFinite(hull));
      return { score, hull };
    });
    return { score: average(effects.map(e => e.score)), hull: average(effects.map(e => e.hull)) };
  });
  const bootstrap = Array.from({ length: 2000 }, () => {
    let total = 0;
    for (let i = 0; i < measures.length; i++) total += measures[Math.floor(random.next() * measures.length)].score;
    return total / measures.length;
  }).sort((a, b) => a - b);
  return { coefficients, mirrorPairs: pairs.length, meanScoreEffect: average(measures.map(e => e.score)),
    scoreEffect95Interval: [bootstrap[50], bootstrap[1950]], meanHullEffect: average(measures.map(e => e.hull)) };
}

export function summarizeComponents(lab, pairs, seed) {
  const summarize = group => Object.fromEntries(lab.POLICY_ACTIONS.filter(a => a !== 'BALANCED').map(action => {
    const full = `${action}_FULL`, range = `${action}_RANGE`, target = `${action}_TARGET`;
    const contrasts = { rangeAlone: { [range]: 1, BALANCED: -1 }, targetAlone: { [target]: 1, BALANCED: -1 },
      targetAddedToRange: { [full]: 1, [range]: -1 }, rangeAddedToTarget: { [full]: 1, [target]: -1 },
      interaction: { [full]: 1, [range]: -1, [target]: -1, BALANCED: 1 } };
    return [action, Object.fromEntries(Object.entries(contrasts).map(([name, coefficients]) =>
      [name, componentContrast(group, coefficients, new lab.SimulationRandom(seed ^ 0x3c52))]))];
  }));
  return { overall: summarize(pairs),
    byScenario: Object.fromEntries([...new Set(pairs.map(p => p.scenario))].map(id => [id, summarize(pairs.filter(p => p.scenario === id))])),
    bySplit: Object.fromEntries(['train', 'validation'].map(split => [split, summarize(pairs.filter(p => p.split === split))])) };
}

/** Baseline-only descriptive audit. No model changes and no unseen enemy loadout reads. */
export function observationContext(lab, ship, state) {
  if (state === null) return null;
  const target = ship.currentTargetShip;
  assert.equal(lab.combatObservation(ship, target), state);
  const profile = lab.combatProfile(ship, target);
  assert.ok(Number.isFinite(profile.range) && profile.range > 0);
  const relativeDistance = ship.pos.distanceTo(target.pos) / profile.range;
  return { hullClass: ship.spec.hullSize, role: ship.tacticalAI?.fleetRole ?? 'UNKNOWN',
    ownRangeBand: profile.range < 500 ? 'SHORT' : profile.range < 800 ? 'MEDIUM' : 'LONG',
    contactRangeBand: relativeDistance < .8 ? 'CLOSE' : relativeDistance <= 1.1 ? 'IN_RANGE' : 'FAR',
    visibleTargetHullClass: target.spec.hullSize };
}
export class ObservationContextAudit {
  noContactDecisions = 0;
  states = {};
  add(state, context, scenario) {
    if (state === null) { assert.equal(context, null); this.noContactDecisions++; return; }
    assert.ok(context);
    const row = this.states[state] ??= { decisions: 0, features: {}, scenarios: {} };
    row.decisions++; row.scenarios[scenario] = (row.scenarios[scenario] ?? 0) + 1;
    for (const [name, value] of Object.entries(context)) {
      const counts = row.features[name] ??= {};
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  summary() {
    const rows = Object.entries(this.states);
    const dimensions = [...new Set(rows.flatMap(([, row]) => Object.keys(row.features)))];
    const eligibleDecisions = rows.reduce((n, [, row]) => n + row.decisions, 0);
    return { eligibleDecisions, noContactDecisions: this.noContactDecisions, statesObserved: rows.length,
      dimensions: Object.fromEntries(dimensions.map(name => {
        const aliased = rows.filter(([, row]) => Object.keys(row.features[name] ?? {}).length > 1);
        return [name, { statesWithMultipleContexts: aliased.length, decisionsInThoseStates: aliased.reduce((n, [, row]) => n + row.decisions, 0) }];
      })),
      examples: rows.filter(([, row]) => Object.values(row.features).some(counts => Object.keys(counts).length > 1))
        .sort((a, b) => b[1].decisions - a[1].decisions).slice(0, 8).map(([state, row]) => ({ state: Number(state), ...row })),
      caveat: 'Repeated decision samples are not independent trials. Context aliasing alone does not prove a feature is useful or explain a loss.' };
  }
}
