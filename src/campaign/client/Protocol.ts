import type { OriginalCalendarHud } from '../rules/OriginalCalendar.mjs';
import type { CampaignClock, CampaignCommand, CommandReceipt, EntityExpectation } from '../Types.js';
export type { CampaignCommand, CommandReceipt, EntityExpectation };
export interface FleetLogisticsView {
  repairCompletion?: { supplyCost: number; applicable: boolean } | null;
  minimumCrew: number | null;
  cargoSpaceUsed: number; cargoCapacity: number; fuelCapacity: number; personnelUsed: number; personnelCapacity: number;
  repairSuppliesPerDay: number | null; suppliesPerDay: number; maintenancePerDay: number; recoveryPerDay: number; fuelPerLightYear: number;
}
export interface CargoQuickRequest { side: 'hold' | 'discard'; id: string; quantity: number }
export interface CargoPreviewRequest {
  quickTransfer?: CargoQuickRequest;
  worldId: string; epoch: string; fleetId: string; fleetVersion: number;
  memberVersions: { id: string; version: number }[]; cargo: Record<string, number>;
}
export interface CargoPreviewQuote {
  quickTransfer?: CargoQuickRequest & { amount: number };
  worldId: string; revision: number; fleetId: string; fleetVersion: number;
  memberVersions: { id: string; version: number }[]; cargo: Record<string, number>;
  logistics: FleetLogisticsView | null; logisticsUnavailable: string | null;
}
export interface CargoPreviewResponse extends CargoPreviewQuote { epoch: string }
export interface FleetView {
  id: string; version: number; name: string; locationId: string; position: [number, number];
  canCommand: boolean; partyId: string | null; encounterId: string | null;
  navigation: null | { interaction: { targetId: string; orderId: string; arrived: boolean } | null; jumpSourceId: string | null; velocity: [number, number]; destination: [number, number] | null; jumpPhase: string | null; noEngageUntilTick: number };
  private: null | { logistics: FleetLogisticsView | null; logisticsUnavailable: string | null; cargo: Record<string, number>; members: { id: string; version: number; hullId: string; hullFraction: number; combatReadiness: number; mothballed: boolean; repairsSuspended: boolean }[] };
}
export interface BodyView {
  id: string; version: number; name: string; locationId: string; position: [number, number]; radius: number; facingDegrees: number;
  presentation: { kind: 'star' | 'planet' | 'custom'; nativeType: string; sourceHandle: string };
  surfacePhase: number | null; cloudPhase: number | null; lightSourceId: string | null;
  orbit: { focusId: string; radius: number } | null;
}
export interface CargoPodView {
  id: string; version: number; name: string; locationId: string; position: [number, number]; radius: number;
  accessibleToFleetIds: string[]; items: Record<string, number> | null;
  lifecyclePolicy: 'persistent-until-collected';
}
export interface PointView {
  id: string; version: number; name: string; locationId: string; position: [number, number]; radius: number; tags: string[];
  destinations: { index: number; targetId: string; targetVersion: number; name: string; locationName: string }[];
}
export interface InvitationView {
  id: string; version: number; fromFleetId: string; toFleetId: string; fromName: string; toName: string;
  fromVersion: number; toVersion: number; partyId: string | null; partyVersion: number | null; expiresAt: number; canAccept: boolean;
}
export interface CampaignView {
  ports?: import('../rules/OriginalMarket.mjs').OriginalMarketPort[];
  schemaVersion: 1; visibilityPolicy: 'control-and-consensual-party'; worldId: string; revision: number; clock: CampaignClock; calendar: OriginalCalendarHud | null;
  rules: { id: string; version: string; originalReference: string | null }; self: { id: string; name: string };
  fleets: FleetView[]; locations: { id: string; name: string; space: string; background: string | null; navigationUnavailable: string | null }[]; points: PointView[]; bodies: BodyView[]; cargoPods: CargoPodView[];
  parties: { id: string; version: number; leaderFleetId: string; fleetIds: string[] }[];
  invitations: InvitationView[]; contacts: { id: string; name: string; commander: string }[];
}
export interface CampaignSession {
  epoch: string; development: boolean; view: CampaignView;
  simulation: { status: 'running' | 'stopped' | 'error'; error: null | { code: string } };
}
