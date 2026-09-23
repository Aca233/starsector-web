/** Transport capability policy, not an assertion about measured Hz or delivery.
 * Default: add bounded LAN/production-Steam motion only; keep complete-world cadence unchanged.
 * The incomplete multirate/visual rewrite still requires an explicit build opt-in.
 * Motion-reference capability is separate from the additive motion lane. Offer
 * it by default so congested LAN senders can save bandwidth; healthy delivery
 * uses ordinary deltas without the extra endpoint scan. Explicit false forbids
 * predictive references even when the relay measures congestion.
 */
export function networkFeaturePolicy(env = {}) {
  const mode = env.VITE_LAN_LAYERED_SYNC === 'false' ? 'off'
    : env.VITE_LAN_LAYERED_SYNC === 'true' ? 'experimental' : 'auto';
  return Object.freeze({ mode, motion: mode !== 'off', motionReference: env.VITE_LAN_MOTION_REFERENCE !== 'false', visuals: mode === 'experimental',
    combat: mode === 'experimental' && env.VITE_LAN_CRITICAL_COMBAT === 'true' });
}
export function networkHelloFeatures(transport, policy) {
  if (transport === 'steam') return { binarySnapshots: 1, binaryReceive: 1, ...(policy.visuals || policy.combat ? { componentUpload: 1 } : {}), ...(policy.motion ? { motionState: 1, ...(policy.mode === 'auto' ? { motionAuto: 1 } : {}) } : {}), ...(policy.visuals || policy.combat ? { layeredState: 1 } : {}), ...(policy.visuals ? { visualState: 1 } : {}), ...(policy.combat ? { combatState: 1 } : {}) };
  return { binaryDelta: 1, ...(policy.visuals || policy.combat ? { componentUpload: 1 } : {}), ...(policy.motionReference ? { motionReference: 1 } : {}),
    ...(policy.motion ? { motionState: 1, ...(policy.mode === 'auto' ? { motionAuto: 1 } : {}) } : {}),
    ...(policy.visuals ? { visualState: 1 } : {}), ...(policy.combat ? { combatState: 1 } : {}) };
}
export function networkFeatureStatus(transport, policy, welcome = null) {
  const motion = policy.motion && welcome?.motionState === 1 && (transport === 'lan' || welcome?.motionTransport === 'steam-datagram-v1');
  return { policy: policy.mode, negotiated: welcome !== null,
    motionRequested: policy.motion, motion,
    visuals: (transport === 'lan' || welcome?.layeredTransport === 'steam-components-v1') && motion && policy.visuals && welcome?.visualState === 1,
    combat: (transport === 'lan' || welcome?.layeredTransport === 'steam-components-v1') && motion && policy.combat && welcome?.combatState === 1,
    motionWire: motion && welcome?.motionWire === 1,
    bulkChunks: motion && welcome?.bulkChunks === 1,
    binaryDelta: transport === 'lan' && welcome?.stateCredits === 1 && welcome?.binaryDelta === 1,
    binarySnapshots: transport === 'lan' || welcome?.binarySnapshots === 1,
    reason: policy.mode === 'off' ? 'disabled-by-build'
      : !welcome ? 'awaiting-welcome' : !motion ? 'server-did-not-negotiate'
      : transport === 'steam' ? 'steam-datagram-check-receiver' : !welcome.controlLane ? 'no-helper-lane' : 'check-receiver-activity' };
}
