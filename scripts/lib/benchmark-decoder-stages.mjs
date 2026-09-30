import assert from 'node:assert/strict';

/** TEST-BUILD ONLY. Insert observations at existing boundaries; never replace a
 * validation, loop, write or commit. Timings include instrumentation overhead. */
export function instrumentDecoderStages(source) {
  let code = source;
  const arrayWorklist = source.includes('pending = [root]');
  const insert = (anchor, extra, before = true) => {
    const at = code.indexOf(anchor);
    assert(at >= 0 && code.indexOf(anchor, at + anchor.length) < 0, 'Missing/ambiguous decoder stage anchor: ' + anchor);
    const position = before ? at : at + anchor.length;
    code = code.slice(0, position) + extra + code.slice(position);
  };
  insert('private applyGraph(packet: CombatPresentationGraphPacket): object {', `
    const benchmarkStart = performance.now(); let benchmarkLast = benchmarkStart;
    const benchmarkTimings: Record<string, number> = {};
    const benchmarkCounts = { changedObjects: 0, changedKeys: 0, references: 0, metadataReferences: 0 };
    const benchmarkMark = (key: string) => { const now = performance.now(); benchmarkTimings[key] = now - benchmarkLast; benchmarkLast = now; };
`, false);
  insert('const metadata = new Map(this.metadata);', "benchmarkMark('headerShapesVisualValidationMs');\n    ");
  insert('const data = new Float64Array(packet.buffer, 0, packet.length);', "benchmarkMark('metadataRemovalsMs');\n    ");
  insert('// Roots are freshly published envelopes, never authority objects or stale frames.', "benchmarkMark('parsePlansMs');\n    ");
  insert(arrayWorklist ? 'const reachable = new Set<number>(), usedMetadata = new Set<number>(), pending = [root];' : 'const reachable = new Set<number>([root]), usedMetadata = new Set<number>();', "benchmarkMark('envelopeMs');\n    ");
  insert('liveUnits += links.units;', '\n      benchmarkCounts.references += links.refs.length; benchmarkCounts.metadataReferences += links.metadata.length;', false);
  insert('const replacements = new Map<object, object>();', "benchmarkMark('reachabilityMs');\n    ");
  insert('const prior = this.objects.get(plan.id);', '\n      if (plan.kind === Kind.Object) { benchmarkCounts.changedObjects++; benchmarkCounts.changedKeys += plan.keys.length; }', false);
  insert('const decode = (): unknown => {', "benchmarkMark('allocateMs');\n    ");
  insert('if (replacements.size) {', "benchmarkMark('writeValuesMs');\n    ");
  insert('for (const id of removed) this.objects.delete(id);', "benchmarkMark('rebindMs');\n    ");
  insert('return this.objects.get(root)!.value;', `benchmarkMark('commitMs');
    benchmarkTimings.graphTotalMs = performance.now() - benchmarkStart;
    this.benchmarkDecoderStages = { timings: benchmarkTimings, counts: { ...benchmarkCounts,
      changedPlans: plans.size, shapes: packet.shapes.length, liveNodes: reachable.size,
      pendingVisits: ${arrayWorklist ? 'pending.length' : 'reachable.size'}, replacements: replacements.size,
      metadataEntries: metadata.size, usedMetadata: usedMetadata.size } };
    `);
  insert('this.visuals.applyValidated(packet.visuals, result.view);', 'const benchmarkVisualStart = performance.now();\n    ');
  insert('this.visuals.applyValidated(packet.visuals, result.view);', '\n    this.benchmarkDecoderStages.timings.visualsMs = performance.now() - benchmarkVisualStart;', false);
  return code;
}
