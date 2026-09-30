import assert from 'node:assert/strict';

export function checkPresentationOwnedScalars(api) {
  const {CombatPresentationEncoder: Encoder, BeforeCombatPresentationEncoder: Before, CombatPresentationDecoder: Decoder,
    LocalCombatKernel, FireControlQueryRoster: Roster, Ship, Vector2, immutableCopy} = api;
  const types = [Encoder, ...(Before ? [Before] : [])];
  let checks = 0, packets = 0, exactPackets = 0, ownedCalls = 0;
  const same = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
  const effective = p => ({...p, buffer: new Uint8Array(p.buffer, 0, p.length * 8),
    ...(p.visuals ? {visuals: {...p.visuals, buffer: new Uint8Array(p.visuals.buffer, 0, p.visuals.length * 8)}} : {})});
  const wrap = hud => ({kind: 'lan-presentation-ui', hud, map: {}, deployment: {}, presence: []});
  // Private graph primitive isolates scalar semantics; production ownership is
  // separately checked through capture(engine), never through a caller flag.
  for (const channel of ['render', 'ui']) {
    const arms = types.map(C => {
      const shared = {a: 0, b: -0, c: NaN, d: Infinity, e: -Infinity, missing: undefined, nil: null, yes: true, no: false, text: 'same'};
      const root = {shared, alias: shared, list: [shared, shared], vector: new Vector2(-0, NaN), typed: new Float64Array([-0, NaN, Infinity, -Infinity]), map: new Map([[shared, shared]]), set: new Set([shared]), immutable: immutableCopy({fixed: 1})};root.self = root;
      return {encoder: new C(811, 'render', channel), root, shared, last: undefined};
    });
    for (let frame = 0; frame < 24; frame++) {
      for (const arm of arms) {
        // Alternate first/middle/last differences, no differences, size changes,
        // removals/reentry and repeated same-tick snapshots. Always read all fields.
        if (frame % 4 === 0) arm.shared.a = frame;
        if (frame % 4 === 1) arm.shared.text = 'frame-' + frame;
        arm.shared.b = frame % 2 ? 0 : -0;
        if (frame === 5) arm.shared.newKey = NaN;
        if (frame === 8) delete arm.shared.newKey;
        arm.root.list = frame % 5 === 0 ? [] : [arm.shared, arm.shared];
        arm.root.typed = frame % 6 === 0 ? new Float64Array([frame, NaN]) : arm.root.typed;
        const root = channel === 'ui' ? wrap(arm.root) : arm.root;
        arm.last = arm.encoder.captureGraph(root, 0, arm.last?.buffer, true); packets++;
      }
      if (arms.length > 1) {same(effective(arms[0].last), effective(arms[1].last), 'all packet fields and bytes/' + channel + '/' + frame);exactPackets++;}
    }
  }
  // The real entry point only opts in after explicit closed-Worker registration.
  const kernel = new LocalCombatKernel({playerHull: 'onslaught', enemyHull: 'onslaught', seed: 987, multicore: false});
  try {
    const current = new Encoder(812, 'render'), reference = Before ? new Before(812, 'render') : null;
    const capture = current.captureGraph, flags = [];
    current.captureGraph = function(...args) { flags.push(args[3]); return capture.apply(this, args); };
    const decoder = new Decoder(812, 'render');
    const first = current.capture(kernel.engine, 0);packets++;decoder.apply(structuredClone(first));
    if (reference) {same(effective(first), effective(reference.capture(kernel.engine, 0)), 'unowned production entry');exactPackets++;packets++;}
    const initialRequest = flags.pop(), hasOwnedSurface = initialRequest !== undefined;
    same(initialRequest, hasOwnedSurface ? false : undefined, 'unregistered engine cannot opt in');
    Roster.ownForWorker(kernel.engine);
    for (let i = 0; i < 12; i++) {
      kernel.engine.playerShip.pos.x += 1; kernel.engine.playerShip.weapons[0].currentAngleRad += .01;
      const a = current.capture(kernel.engine, 0);packets++;
      if (reference) {same(effective(a), effective(reference.capture(kernel.engine, 0)), 'owned production entry');exactPackets++;packets++;}
      same(flags.pop(), hasOwnedSurface ? true : undefined, 'registration enables only an implemented owned surface');
      if (hasOwnedSurface) ownedCalls++;
      const shown = decoder.apply(structuredClone(a)).view.playerShip;
      same(shown.pos.x, kernel.engine.playerShip.pos.x, 'decoded live position');
      same(shown.weapons[0].currentAngleRad, kernel.engine.playerShip.weapons[0].currentAngleRad, 'decoded live mount');
    }
  } finally {kernel.dispose();}
  const ownInstance = Object.getOwnPropertyDescriptor(Ship, Symbol.hasInstance), isDescriptor = Object.getOwnPropertyDescriptor(Object, 'is');
  const nativeInstance = Function.prototype[Symbol.hasInstance], originalIs = Object.is;
  const hookTrial = (kind, channel, requestedOwned) => {
    const observations = [];
    for (const C of types) {
      let instanceCalls = 0, comparisons = 0, isGets = 0;
      const encoder = new C(814, 'render', channel), root = {a: 1, z: 'tail', empty: null, list: [false, undefined, -0, NaN]};
      const instance = function(value) {instanceCalls++;return nativeInstance.call(this, value);};
      try {
        if (kind === 'instance') Object.defineProperty(Ship, Symbol.hasInstance, {configurable: true, value: instance});
        if (kind === 'instance-getter') Object.defineProperty(Ship, Symbol.hasInstance, {configurable: true, get() {instanceCalls++;return nativeInstance;}});
        const compare = (a, b) => {comparisons++;return originalIs(a, b);};
        if (kind === 'is') Object.defineProperty(Object, 'is', {...isDescriptor, value: compare});
        if (kind === 'is-getter') Object.defineProperty(Object, 'is', {configurable: true, get() {isGets++;return compare;}});
        let packet;
        for (let i = 0; i < 3; i++) {root.a += i;packet = encoder.captureGraph(channel === 'ui' ? wrap(root) : root, 0, undefined, requestedOwned);packets++;}
        observations.push({packet: effective(packet), instanceCalls, comparisons, isGets});
      } finally {
        if (ownInstance) Object.defineProperty(Ship, Symbol.hasInstance, ownInstance); else delete Ship[Symbol.hasInstance];
        Object.defineProperty(Object, 'is', isDescriptor);
      }
    }
    if (observations.length > 1) {same(observations[0], observations[1], 'custom intrinsic fallback/' + kind + '/' + channel + '/' + requestedOwned);exactPackets++;}
  };
  for (const kind of ['instance','instance-getter','is','is-getter']) for (const channel of ['render','ui']) for (const owned of [false,true]) hookTrial(kind, channel, owned);
  // Validation still runs after an early changed field, and the public capture
  // entry still poisons an epoch after rejection (not just the private primitive).
  for (const bad of [() => ({a: 2, bad: Symbol('unsupported')}), () => ({a: 2, bad: () => 1}), () => ({a: 2, bad: new Date()}), () => ({a: 2, constructor: 1})]) {
    const errors = types.map(C => {
      const k = new LocalCombatKernel({playerHull: 'wolf', enemyHull: 'lasher', seed: 991, multicore: false});
      try {
        Roster.ownForWorker(k.engine);const encoder = new C(815, 'render'), state = {a: 1};k.engine.orders.set('bad-probe', state);
        encoder.capture(k.engine, 0);Object.assign(state, bad());let message = 'did not reject';
        try {encoder.capture(k.engine, 0);} catch (e) {message = e.message;}
        k.engine.orders.clear();assert.throws(() => encoder.capture(k.engine, 0), /encoder failed/);checks++;
        return message;
      } finally {k.dispose();}
    });
    assert.notEqual(errors[0], 'did not reject');checks++;
    if (errors.length > 1) same(errors[0], errors[1], 'complete rejection after first changed scalar');
  }
  return {checks, reports: [{kind: 'owned-scalar-dispatch', packets, exactPackets, ownedCalls, frozenEncoder: !!Before}]};
}
