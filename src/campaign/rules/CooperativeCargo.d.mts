import type { CampaignRuleProvider, DeepReadonly, Fleet, ReadonlyWorld, SpaceEntity } from '../Types.js';
export interface CargoPodData {
  schemaVersion: 1;
  items: Record<string, number>;
  createdAtTick: number;
  /** Historical provenance only; neither field must remain a live foreign key. */
  sourceFleetId: string;
  createdBy: string;
}
export interface CargoPodEntity extends SpaceEntity { cargoPod: CargoPodData }
export interface CargoJettisonPayload { fleetId: string; items: Record<string, number> }
export interface CargoCollectPayload { fleetId: string; podId: string }
export interface CargoTransferResult { fleetId: string; podId: string }
export interface CooperativeCargoMethods {
  validateWorld(world: ReadonlyWorld): void;
  /** Side-effect-free physical eligibility; false on unsupported/locked/invalid targets. Does not authorize the viewer. */
  canCollect(world: ReadonlyWorld, fleet: DeepReadonly<Fleet>, pod: DeepReadonly<SpaceEntity>): boolean;
}
export const cooperativeCargoProvider: CampaignRuleProvider & {
  readonly id: 'cooperative.cargo'; readonly service: 'cargo'; readonly version: '0.1.0';
  readonly lifecyclePolicy: 'persistent-until-collected';
  methods: CooperativeCargoMethods;
};
