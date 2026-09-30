export type AIDecisionProfile = 'standard' | 'large-battle-v1' | 'large-battle-v3';
export function validAIDecisionProfile(value: unknown): value is AIDecisionProfile | undefined;
