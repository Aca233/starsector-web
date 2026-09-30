import assert from 'node:assert/strict';

/** Identity bookkeeping must not become a cache of source values or validity. */
export function checkPresentationIdentities(api) {
  const { CombatPresentationEncoder: Encoder, BeforeCombatPresentationEncoder: Before,
    CombatPresentationDecoder: Decoder, LocalCombatKernel, immutableCopy } = api;
  let checks = 0, packets = 0, exactPackets = 0;
  const same = (a, b) => { assert.deepEqual(a, b); checks++; };
  const ok = v => { assert.ok(v); checks++; };
  const effective = p => ({ ...p, buffer: new Uint8Array(p.buffer, 0, p.length * 8),
    ...(p.visuals ? { visuals: { ...p.visuals, buffer: new Uint8Array(p.visuals.buffer, 0, p.visuals.length * 8) } } : {}) });
  for (const channel of ['render', 'ui']) {
    const kernel = new LocalCombatKernel({ playerHull: 'wolf', enemyHull: 'lasher', seed: 986, multicore: false });
    try {
      const a = immutableCopy({ label: 'a', child: { amount: 1 } }), b = immutableCopy({ label: 'b', child: { amount: 2 } });
      const mutable = { amount: 1 }, frozen = Object.freeze({ fixed: 3 }), root = { list: [mutable], meta: [a, a, b], child: a.child, frozen };
      let reads = []; Object.defineProperty(root, 'observed', { enumerable: true, get() { reads.push(mutable.amount); return mutable.amount; } });
      root.cycle = root; kernel.engine.orders.set('identity-contract', root);
      const envelope = { kind: 'lan-presentation-ui', hud: root, map: {}, deployment: {}, presence: [] };
      const arms = [Encoder, ...(Before ? [Before] : [])].map(C => ({ encoder: new C(92, 'render', channel), decoder: new Decoder(92, 'render', channel) }));
      let id, metadataId;
      for (let frame = 0; frame < 16; frame++) {
        mutable.amount = frame % 3 === 0 ? -0 : frame;
        if (frame === 3) mutable.added = NaN;
        if (frame === 5) delete mutable.added;
        root.list = frame % 4 === 2 ? [] : [mutable, mutable];
        root.meta = frame % 4 === 1 ? [] : frame % 4 === 2 ? [b] : [a, b, a];
        root.child = root.meta.includes(a) ? a.child : null;
        for (const arm of arms) {
          reads = [];
          arm.last = channel === 'render' ? arm.encoder.capture(kernel.engine, 0, arm.last?.buffer, arm.last?.visuals.buffer)
            : arm.encoder.captureUi({ ...envelope }, 0, arm.last?.buffer);
          packets++; same(reads, [mutable.amount]);
          const shown = channel === 'render' ? arm.decoder.apply(structuredClone(arm.last)).hud.tactical.orders.get('identity-contract')
            : arm.decoder.applyUi(structuredClone(arm.last)).hud;
          same(shown.observed, mutable.amount); same(shown.cycle, shown); same(shown.list.length, root.list.length);
          if (root.list.length) { same(shown.list[0], shown.list[1]); same(shown.list[0].amount, mutable.amount); }
          if (channel === 'ui') { same(arm.last.metadata.length, 0); if (root.meta.includes(a)) same(shown.child, shown.meta[0].child); }
          if (arm.encoder.liveEntries) {
            const entries = arm.encoder.liveEntries;
            same(entries.length, arm.last.liveNodeCount); same(new Set(entries.map(e => e.id)).size, entries.length);
            for (const entry of entries) { ok(entry.snapshot); ok(entry.snapshot.values.every(v => typeof v === 'string' || typeof v === 'number')); }
            const row = arm.encoder.identities.get(mutable);
            same(row.snapshot !== undefined, root.list.length > 0);
            if (id === undefined) id = row.id; same(row.id, id);
            const metaRow = arm.encoder.identities.get(a);
            if (metadataId === undefined) metadataId = metaRow.id; same(metaRow.id, metadataId);
            same(!!metaRow.metadataUnits, channel === 'render');
            same(!!arm.encoder.identities.get(frozen).metadataUnits, false, 'plain Object.freeze must not gain metadata branding');
            if (channel === 'render') same(metaRow.snapshot, undefined);
          }
        }
        if (arms.length === 2) { same(effective(arms[0].last), effective(arms[1].last)); exactPackets++; }
      }
    } finally { kernel.dispose(); }
  }
  // Cached individual metadata sizes must still be added to this frame's total.
  const large = [immutableCopy({ id: 1, text: 'a'.repeat(4_000_000) }), immutableCopy({ id: 2, text: 'b'.repeat(4_000_000) })];
  for (const C of [Encoder, ...(Before ? [Before] : [])]) {
    const kernel = new LocalCombatKernel({ playerHull: 'wolf', enemyHull: 'lasher', seed: 986, multicore: false });
    try {
      const encoder = new C(93, 'render'), root = { items: [large[0]] };
      kernel.engine.orders.set('metadata-budget', root);
      encoder.capture(kernel.engine, 0); root.items = [large[1]]; encoder.capture(kernel.engine, 0);
      root.items = large;
      assert.throws(() => encoder.capture(kernel.engine, 0), /Presentation metadata budget exceeded/); checks++;
      root.items = []; assert.throws(() => encoder.capture(kernel.engine, 0), /Presentation encoder failed/); checks++;
    } finally { kernel.dispose(); }
  }
  return { checks, reports: [{ scenario: 'presentation-identity-records', packets, exactPackets,
    sameTick: true, retirementReleasesSnapshots: true, metadataReentryAndBudget: true, uiAliases: true }] };
}
