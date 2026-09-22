/** Transport capability policy, not an assertion about measured Hz or delivery.
 * Default: add bounded LAN motion only; keep complete-world cadence unchanged.
 * The incomplete multirate/visual rewrite still requires an explicit build opt-in.
 */
export function networkFeaturePolicy(env = {}) {
  const mode = env.VITE_LAN_LAYERED_SYNC === 'false' ? 'off'
    : env.VITE_LAN_LAYERED_SYNC === 'true' ? 'experimental' : 'auto';
  return Object.freeze({ mode, motion: mode !== 'off', visuals: mode === 'experimental',
    combat: mode === 'experimental' && env.VITE_LAN_CRITICAL_COMBAT === 'true' });
}
export function networkHelloFeatures(transport, policy) {
  if (transport === 'steam') return { binarySnapshots: 1, binaryReceive: 1 };
  return { binaryDelta: 1, motionReference: 1,
    ...(policy.motion ? { motionState: 1, ...(policy.mode === 'auto' ? { motionAuto: 1 } : {}) } : {}),
    ...(policy.visuals ? { visualState: 1 } : {}), ...(policy.combat ? { combatState: 1 } : {}) };
}
export function networkFeatureStatus(transport, policy, welcome = null) {
  const motion = transport === 'lan' && policy.motion && welcome?.motionState === 1;
  return { policy: policy.mode, negotiated: welcome !== null,
    motionRequested: transport === 'lan' && policy.motion, motion,
    visuals: motion && policy.visuals && welcome?.visualState === 1,
    combat: motion && policy.combat && welcome?.combatState === 1,
    motionWire: motion && welcome?.motionWire === 1,
    bulkChunks: motion && welcome?.bulkChunks === 1,
    binaryDelta: transport === 'lan' && welcome?.stateCredits === 1 && welcome?.binaryDelta === 1,
    binarySnapshots: transport === 'lan' || welcome?.binarySnapshots === 1,
    reason: transport === 'steam' ? 'steam-motion-not-implemented' : policy.mode === 'off' ? 'disabled-by-build'
      : !welcome ? 'awaiting-welcome' : !motion ? 'server-did-not-negotiate'
      : !welcome.controlLane ? 'no-helper-lane' : 'check-receiver-activity' };
}
