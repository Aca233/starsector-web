import { useEffect, useState } from 'react';
import type { CampaignSession, CargoPreviewRequest, CargoPreviewResponse, FleetView } from './Protocol';

export interface CargoHudDraft {
  scope: string; instance: string; generation: number; cargo: Record<string, number>; stale: boolean;
}
export type CargoPreviewQuery = (input: CargoPreviewRequest, signal: AbortSignal) => Promise<CargoPreviewResponse>;
const entries = (cargo: Record<string, number>) => Object.entries(cargo).filter(([, n]) => n > 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
function contextKey(value: CargoPreviewRequest | CargoPreviewResponse) {
  return JSON.stringify([value.worldId, value.epoch, value.fleetId, value.fleetVersion,
    value.memberVersions.map(m => [m.id, m.version]).sort(([a], [b]) => String(a).localeCompare(String(b))), entries(value.cargo)]);
}
/** Only retained quantities are local. All derived values come from pinned authority rules. */
export function useCargoHudPreview(session: CampaignSession, fleet: FleetView | undefined, scope: string,
  draft: CargoHudDraft | null, query: CargoPreviewQuery) {
  const active = draft?.scope === scope ? draft : null;
  const request: CargoPreviewRequest | null = active && !active.stale && fleet?.canCommand && fleet.private ? {
    worldId: session.view.worldId, epoch: session.epoch, fleetId: fleet.id, fleetVersion: fleet.version,
    memberVersions: fleet.private.members.map(({ id, version }) => ({ id, version })), cargo: active.cargo,
  } : null;
  // Serialized dependencies ignore session polling identity and unrelated world revisions.
  const body = request ? JSON.stringify(request) : '', fingerprint = request ? contextKey(request) : '';
  const key = body ? JSON.stringify([scope, active!.instance, active!.generation, fingerprint]) : '';
  const [result, setResult] = useState<{ key: string; quote: CargoPreviewResponse | null } | null>(null);
  useEffect(() => {
    if (!body || !key) return;
    const controller = new AbortController();
    // Coalesce quick pickup/drop gestures without delaying local quantity feedback.
    const timer = setTimeout(() => {
      void query(JSON.parse(body) as CargoPreviewRequest, controller.signal).then(quote => {
        if (controller.signal.aborted) return;
        if (contextKey(quote) !== fingerprint) throw Error('Preview context mismatch');
        setResult({ key, quote });
      }).catch(() => { if (!controller.signal.aborted) setResult({ key, quote: null }); });
    }, 60);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [body, key, fingerprint, query]);
  if (!active) return { cargo: fleet?.private?.cargo, logistics: fleet?.private?.logistics, status: 'idle', description: '' };
  if (active.stale || !request) return { cargo: undefined, logistics: null, status: 'stale', description: '库存已变化，转移预览失效；请撤销后重试。' };
  const current = result?.key === key ? result : null;
  const status = !current ? 'pending' : current.quote?.logistics ? 'ready' : 'unavailable';
  return {
    cargo: { crew: 0, fuel: 0, supplies: 0, ...active.cargo }, logistics: current?.quote?.logistics ?? null, status,
    description: status === 'pending' ? '转移预览：数量已更新，后勤计算等待服务器（—）。'
      : status === 'unavailable' ? '转移预览：后勤计算暂不可用（—）；预览未修改库存。' : '转移预览（尚未确认，不改变服务器库存）。',
  };
}
