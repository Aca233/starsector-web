export interface SteamOverlayStatus { supported: boolean; available: boolean; reason: string }
export interface SteamStatus {
  service: string; available: boolean; protocol: number; build: string; appId: number; testApp: boolean;
  name: string; steamId: string; error: string; busy: boolean; occupied: boolean; pendingInvite: string | null;
  overlay?: SteamOverlayStatus;
  lobby: { id: string; owner: string; host: boolean; code: string } | null;
}
export async function steamRequest<T = SteamStatus>(operation: string, data: unknown = {}): Promise<T> {
  const response = await fetch('/steam/' + operation, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Starsector-Steam': '1' }, body: JSON.stringify(data), signal: AbortSignal.timeout(25000) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Steam 请求失败');
  return result;
}
