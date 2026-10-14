import fs from 'node:fs';
import path from 'node:path';
import {dependencyGraph, dependencyViolations, runtimeCycles, violationKey} from './lib/dependency-graph.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = flag => { const index = args.indexOf(flag); if (index < 0) return undefined; if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`${flag} requires a path`); return args[index + 1]; };
const baselinePath = path.join(root, 'scripts/architecture-exceptions.json');
const graph = dependencyGraph(root), violations = dependencyViolations(graph);
if (args.includes('--record-existing')) {
  if (fs.existsSync(baselinePath)) throw Error('Existing exceptions are never overwritten; review and edit specific edges.');
  fs.writeFileSync(baselinePath, JSON.stringify({schema: 1, recorded: '2026-10-08', scope: 'Current development workspace; exceptions are exact edges, not directory wildcards.',
    exceptions: violations.map(({from, to, kind, rule, reason}) => ({from, to, kind, rule, reason}))}, null, 2) + '\n');
  console.log(`Recorded ${violations.length} existing edges. Future checks do not update this file.`);
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (baseline.schema !== 1 || !Array.isArray(baseline.exceptions)) throw Error('Invalid architecture exceptions');
  const exceptions = new Map();
  for (const edge of baseline.exceptions) {
    if (!edge.reason || exceptions.has(violationKey(edge))) throw Error('Missing reason or duplicate architecture exception: ' + violationKey(edge));
    exceptions.set(violationKey(edge), edge);
  }
  const unexpected = violations.filter(edge => !exceptions.has(violationKey(edge)));
  const current = new Set(violations.map(violationKey));
  const retired = baseline.exceptions.filter(edge => !current.has(violationKey(edge)));
  const report = {files: graph.files.length, runtimeEdges: graph.edges.filter(edge => edge.kind === 'runtime').length,
    typeEdges: graph.edges.filter(edge => edge.kind === 'type').length, cycleGroups: runtimeCycles(graph).components.length,
    existingExceptions: violations.length - unexpected.length, retiredExceptions: retired.length, unexpected, unresolved: graph.unresolved};
  const output = value('--json');
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify({...report, edges: graph.edges}, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (unexpected.length || graph.unresolved.length) process.exitCode = 1;
}
