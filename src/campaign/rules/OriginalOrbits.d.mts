import type { CampaignRuleProvider, ReadonlyWorld, SpaceEntity, DeepReadonly, CampaignEffectPlan } from '../Types.js';
export type OriginalOrbit = {
  schemaVersion: 1; focusId: string; radius: number; periodDays: number; angleDegrees: number;
} & ({ kind: 'circular' | 'point-down' } | { kind: 'spin'; spinDegreesPerDay: number; facingDegrees: number });
export type OriginalSpinOrbit = Extract<OriginalOrbit, { kind: 'spin' }>;
export function validateOriginalOrbit(orbit: unknown): OriginalOrbit | OriginalSpinOrbit;
export function advanceOriginalOrbit(entity: DeepReadonly<SpaceEntity>, focus: DeepReadonly<SpaceEntity>, seconds: number): SpaceEntity;
export function originalOrbitOrder(world: ReadonlyWorld): string[];
export function validateOriginalOrbitalWorld(world: ReadonlyWorld): void;
export function advanceOriginalOrbitalWorld(world: ReadonlyWorld, seconds: number): Pick<CampaignEffectPlan, 'changes' | 'events'>;
export interface OriginalOrbitMethods { validateWorld: typeof validateOriginalOrbitalWorld; advance: typeof advanceOriginalOrbitalWorld }
export const originalOrbitsProvider: CampaignRuleProvider & { methods: OriginalOrbitMethods };
