import portraits from '../shared/captain-portraits.json';
/** Cosmetic captain information belongs to a design, never to combat stats. */
export interface CaptainProfile { name: string; portrait: string }
export const captainPortraits: readonly { id: string; name: string }[] = portraits;
export const defaultCaptainProfile: CaptainProfile = { name: '舰长', portrait: 'portrait_luddic14' };
export function validCaptainProfile(input: unknown): input is CaptainProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 24 &&
    captainPortraits.some(portrait => portrait.id === value.portrait);
}
