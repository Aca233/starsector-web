import type { CampaignSession, CargoPreviewRequest, CargoPreviewResponse, CargoQuickRequest, FleetView } from './Protocol';
import type { CargoPreviewQuery } from './useCargoHudPreview';

const entries = (cargo: Record<string, number>) => Object.entries(cargo).filter(([, n]) => n > 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
function context(value: CargoPreviewRequest | CargoPreviewResponse) {
  return JSON.stringify([value.worldId, value.epoch, value.fleetId, value.fleetVersion,
    value.memberVersions.map(m => [m.id, m.version]).sort(([a], [b]) => String(a).localeCompare(String(b))), entries(value.cargo)]);
}
/** Bound read-only shortcut query; never falls back to moving the entire stack. */
export async function queryCargoQuickTransfer(session: CampaignSession, fleet: FleetView | undefined,
  cargo: Record<string, number>, quickTransfer: CargoQuickRequest, query: CargoPreviewQuery, signal: AbortSignal) {
  if (!fleet?.canCommand || !fleet.private) throw Error('Fleet is not commandable');
  const request: CargoPreviewRequest = { worldId: session.view.worldId, epoch: session.epoch, fleetId: fleet.id,
    fleetVersion: fleet.version, memberVersions: fleet.private.members.map(({ id, version }) => ({ id, version })), cargo, quickTransfer };
  const quote = await query(request, signal), result = quote.quickTransfer;
  if (signal.aborted || context(quote) !== context(request) || !result || result.id !== quickTransfer.id
    || result.side !== quickTransfer.side || result.quantity !== quickTransfer.quantity
    || !Number.isFinite(result.amount) || result.amount < 0 || result.amount > quickTransfer.quantity) throw Error('Shortcut context mismatch');
  return result.amount;
}
