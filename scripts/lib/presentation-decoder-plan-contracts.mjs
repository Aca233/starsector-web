import assert from 'node:assert/strict';

export function checkPresentationDecoderPlans(api) {
  const { LocalCombatKernel, CombatPresentationEncoder: Encoder, CombatPresentationDecoder: Decoder,
    BeforeCombatPresentationDecoder: Before, immutableCopy } = api;
  let checks = 0, packets = 0, equivalent = 0, rejections = 0, reusedEntries = 0;
  const same = (a, b) => { assert.deepEqual(a, b); checks++; };
  const ok = v => { assert.ok(v); checks++; };
  const identical = (a, b) => { assert.equal(a, b); checks++; };
  const kernel = new LocalCombatKernel({ playerHull: 'wolf', enemyHull: 'lasher', seed: 903, multicore: false });
  try {
    const encoder = new Encoder(117, 'render'), current = new Decoder(117, 'render'), old = Before ? new Before(117, 'render') : null;
    const shared = { amount: 1 }, anchor = { constant: true }, plain = { a: 1 }, otherPlain = { b: 2 };
    const metadata = immutableCopy({ name: 'render-metadata', values: [1, 2, 3] });
    const buffer = new ArrayBuffer(16, { maxByteLength: 32 }), typed = new Float64Array(buffer); typed.set([-0, NaN]);
    const graph = { fan: Array.from({ length: 128 }, () => ({ left: shared, right: shared, anchor })), transition: { value: 1 }, plain, otherPlain,
      typed, typedParents: [typed, new Map([[typed, typed]]), new Set([typed])], metadata };
    graph.self = graph; kernel.engine.orders.set('decode-plan-contract', graph);
    let packet, visible, reference, sharing = false;
    const fieldOffset = (p, wanted, key) => {
      const data = new Float64Array(p.buffer, 0, p.length); let at = 2;
      for (let i = 0; i < p.nodeCount; i++) {
        const id = data[at++], kind = data[at++];
        if (kind === 6) { const count=data[at++], index=id===wanted?current.objects.get(id)?.keys.indexOf(key):-1;
          for(let j=0;j<count;j++){const field=data[at++];if(id===wanted&&field===index)return at;at+=2;}
        }
        else if (kind === 5) at += 2;
        else if (kind === 4) { at++; const length = data[at++]; at += length; }
        else if (kind === 0) { const shape = p.shapes[data[at++]]; if (id === wanted) { const index = shape.keys.indexOf(key); ok(index >= 0); return at + index * 2; } at += shape.keys.length * 2; }
        else { const length = data[at++]; at += length * 2; }
      }
      throw Error('Expected changed field missing');
    };
    const reject = (bad, pattern) => {
      const graphBefore = structuredClone(visible), revision = current.revision, tick = current.tick, dictionary = current.metadata;
      const entries = [...current.objects].map(([id, entry]) => ({ id, entry, keys: entry.keys, refs: entry.refs, metadata: entry.metadata,
        value: entry.value, links: [entry.kind, entry.type, entry.units, [...entry.keys], [...entry.refs], [...entry.metadata]] }));
      assert.throws(() => current.apply(structuredClone(bad)), pattern); checks++; rejections++;
      if (old) { assert.throws(() => old.apply(structuredClone(bad)), pattern); checks++; }
      same(structuredClone(visible), graphBefore); same(current.revision, revision); same(current.tick, tick); identical(current.metadata, dictionary);
      same([...current.objects.keys()], entries.map(row => row.id));
      for (const row of entries) {
        const entry = current.objects.get(row.id); identical(entry, row.entry); identical(entry.value, row.value);
        identical(entry.keys, row.keys); identical(entry.refs, row.refs); identical(entry.metadata, row.metadata);
        same([entry.kind, entry.type, entry.units, entry.keys, entry.refs, entry.metadata], row.links);
      }
    };
    for (let frame = 0; frame < 12; frame++) {
      shared.amount = frame; plain.a = frame;
      graph.transition.value = frame % 3 === 0 ? frame : frame % 3 === 1 ? shared : metadata;
      if (frame === 5) plain.added = -0;
      if (frame === 7) delete plain.added;
      if (frame === 6) { buffer.resize(32); typed[2] = Infinity; typed[3] = -Infinity; }
      packet = encoder.capture(kernel.engine, 0, packet?.buffer, packet?.visuals.buffer);
      if (frame > 0 && frame < 5) {
        let bad = structuredClone(packet); bad.liveNodeCount++; reject(bad, /Invalid live presentation count/);
        bad = structuredClone(packet); const offset = fieldOffset(bad, encoder.identities.get(graph.transition).id, 'value');
        const values = new Float64Array(bad.buffer); values[offset] = 6; values[offset + 1] = Number.MAX_SAFE_INTEGER;
        reject(bad, /Unresolved presentation reference/);
        bad = structuredClone(packet); bad.removed.push(encoder.identities.get(anchor).id); bad.liveNodeCount--;
        reject(bad, /Unresolved presentation reference/);
      }
      const prior = new Map([...current.objects].map(([id, entry]) => [id, { entry, value: entry.value }]));
      const input = structuredClone(packet); visible = current.apply(input); packets++;
      if (old) { reference = old.apply(structuredClone(packet)); same(structuredClone(visible), structuredClone(reference)); equivalent++; }
      const shown = visible.hud.tactical.orders.get('decode-plan-contract'); same(shown.self, shown);
      same(shown.fan[0].left, shown.fan[127].right); same(shown.fan[0].left.amount, frame);
      same(shown.typedParents[0], shown.typed); same(shown.typedParents[1].get(shown.typed), shown.typed); ok(shown.typedParents[2].has(shown.typed));
      same(Object.getPrototypeOf(shown.plain), null);
      const a = current.objects.get(encoder.identities.get(plain).id), b = current.objects.get(encoder.identities.get(otherPlain).id);
      if (frame === 0) sharing = Object.isFrozen(a.refs);
      if (sharing) { same(a.refs, b.refs); same(a.metadata, b.metadata); ok(Object.isFrozen(a.refs)); }
      for (const [id, entry] of current.objects) {
        ok(!Object.hasOwn(entry, 'prior') && !Object.hasOwn(entry, 'stagedKeys') && !Object.hasOwn(entry, 'entry'));
        const previous = prior.get(id);
        if (sharing && previous?.value === entry.value) { assert.equal(entry, previous.entry); checks++; reusedEntries++; }
      }
      // Caller mutations of consumed packet keys must not modify accepted link schema.
      const accepted = [...current.objects].map(([id, entry]) => [id, [...entry.keys]]);
      for (const shape of input.shapes) shape.keys.push('outside-after-apply');
      same([...current.objects].map(([id, entry]) => [id, entry.keys]), accepted);
    }
    if (sharing) ok(reusedEntries > 1000);
    return { checks, reports: [{ scenario: 'presentation-decoder-plans', packets, equivalent, rejections, reusedEntries,
      frozenEmptyLinks: sharing, aliasFanIn: 256, typedResizeRebound: true, rejectsDoNotMutateEntries: true }] };
  } finally { kernel.dispose(); }
}
