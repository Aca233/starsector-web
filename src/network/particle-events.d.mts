import type { ParticleRecipe } from '../engine/visual/DynamicParticleRecipe';
export type ParticleEventRow = [number, number, ParticleRecipe];
export interface ParticleEventBatch { version: 1; epoch: number; step: number; latest: number; events: ParticleEventRow[] }
export const PARTICLE_EVENT_LIMITS: Readonly<{groups: number; particles: number; steps: number}>;
export function particleEventWeight(recipe: ParticleRecipe): number;
export function validateParticleEvents(batch: unknown): ParticleEventBatch;
