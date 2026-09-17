/** Cosmetic captain information belongs to a design, never to combat stats. */
export interface CaptainProfile { name: string; portrait: string }
export const captainPortraits = [
  { id: 'portrait_luddic14', name: '卢德舰长' },
  { id: 'portrait_hegemony17', name: '霸主女军官' },
  { id: 'portrait_hegemony01', name: '霸主男军官' },
  { id: 'portrait_corporate02', name: '速子女主管' },
  { id: 'portrait_corporate01', name: '速子男主管' },
  { id: 'portrait_league00', name: '联盟军官' },
  { id: 'portrait_diktat11', name: '独裁国军官' },
  { id: 'portrait_mercenary02', name: '自由佣兵' },
  { id: 'portrait_pirate03', name: '海盗舰长' },
  { id: 'portrait27', name: '独立舰长' },
  { id: 'portrait34', name: '飞行员' },
  { id: 'portrait42', name: '太空行者' },
] as const;
export const defaultCaptainProfile: CaptainProfile = { name: '舰长', portrait: 'portrait_luddic14' };
export function validCaptainProfile(input: unknown): input is CaptainProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 24 &&
    captainPortraits.some(portrait => portrait.id === value.portrait);
}
