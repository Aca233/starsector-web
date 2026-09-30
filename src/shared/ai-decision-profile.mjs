/** Versioned gameplay tradeoff, not a graphics preference or a client-local rate. */
export function validAIDecisionProfile(value) {
  return value === undefined || value === 'standard' || value === 'large-battle-v1' || value === 'large-battle-v3';
}
