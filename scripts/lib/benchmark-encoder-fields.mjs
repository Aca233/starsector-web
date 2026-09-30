import assert from 'node:assert/strict';

/** Test-build counters only. The original full packet and validation remain intact. */
export function instrumentEncoderFieldAudit(source) {
  let code=source;
  const patchCodec=source.includes('const changedFields: number[] = [];');
  const replace=(anchor,next)=>{const at=code.indexOf(anchor);assert(at>=0&&code.indexOf(anchor,at+anchor.length)<0,'Missing/ambiguous field audit anchor: '+anchor);code=code.replace(anchor,next);};
  replace('private captureGraph(root: object, tick: number, recycled?: ArrayBuffer): CombatPresentationGraphPacket {', `private captureGraph(root: object, tick: number, recycled?: ArrayBuffer): CombatPresentationGraphPacket {
    const benchmarkFieldChanges = new Set<number>();
    const benchmarkFields = { objectRows: 0, objectFields: 0, stableRows: 0, stableFields: 0,
      changedFields: 0, sparseRows: 0, savedUnits: 0, appliedSavedUnits: 0 };
`);
  if(patchCodec) replace('changed = true;\n        if (trackFields)', 'changed = true; benchmarkFieldChanges.add(Math.floor(at / 2));\n        if (trackFields)');
  else replace('const scalar = (v: WireValue) => { if (!previous || !Object.is(scratch[at], v)) changed = true; scratch[at++] = v; };', `const scalar = (v: WireValue) => {
      if (!previous || !Object.is(scratch[at], v)) { changed = true; benchmarkFieldChanges.add(Math.floor(at / 2)); }
      scratch[at++] = v;
    };`);
  replace('previous = identity.snapshot; scratch = previous?.values ?? [];','benchmarkFieldChanges.clear(); previous = identity.snapshot; scratch = previous?.values ?? [];');
  if(patchCodec) replace('write(Kind.ObjectPatch); write(changedFields.length);', 'benchmarkFields.appliedSavedUnits += at - changedFields.length * 3; write(Kind.ObjectPatch); write(changedFields.length);');
  replace('const snapshot = previous ?? { kind, type, keys, values: scratch };', `if (kind === Kind.Object) {
        benchmarkFields.objectRows++; benchmarkFields.objectFields += keys.length;
        if (previous && priorLength === at && sameKeys(previous.keys, keys)) {
          benchmarkFields.stableRows++; benchmarkFields.stableFields += keys.length;
          benchmarkFields.changedFields += benchmarkFieldChanges.size;
          const saving = keys.length * 2 - benchmarkFieldChanges.size * 3;
          if (saving > 0) { benchmarkFields.sparseRows++; benchmarkFields.savedUnits += saving; }
        }
      }
      const snapshot = previous ?? { kind, type, keys, values: scratch };`);
  replace('this.liveEntries = entries; this.priorFrame = frame;', `this.liveEntries = entries; this.priorFrame = frame;
    globalThis.benchmarkGraphFields = { ...benchmarkFields, graphUnits: cursor,
      fullRowGraphUnits: cursor + benchmarkFields.appliedSavedUnits,
      hypotheticalGraphUnits: cursor - benchmarkFields.savedUnits + benchmarkFields.appliedSavedUnits, nodeCount, liveNodes: pending.length };
`);
  return code;
}
