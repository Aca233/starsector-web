import type { Collection, DeepReadonly, ReadonlyWorld, RulesLock } from '../Types.js';
export const COLLECTIONS: readonly Collection[];
export function createCampaignWorld(input: { id: string; rules: DeepReadonly<RulesLock>; contentFingerprint: string }): ReadonlyWorld;
export function validateCampaignWorld(value: unknown): ReadonlyWorld;
