import policy from './presentation-policy.json';
/** Presentation data cannot override source gameplay fields. */
export function validatePresentationPolicy(input: typeof policy): void {
  for (const [kind, entries] of Object.entries(input)) {
    if (!['ships','weapons'].includes(kind) || !entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid presentation policy section: ' + kind);
    const allowed = kind === 'ships' ? ['visualProfile','debrisColor'] : ['visualProfile','impactFamily'];
    for (const [id, definition] of Object.entries(entries)) {
      if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error('Invalid presentation policy: ' + id);
      for (const key of Object.keys(definition)) if (!allowed.includes(key)) throw new Error('Presentation policy cannot override gameplay: ' + id + '.' + key);
    }
  }
}
validatePresentationPolicy(policy);
export default policy;
