import type { DeepReadonly, Fleet, ReadonlyWorld } from '../Types.js';
export function canCommandFleet(world: ReadonlyWorld, fleet: DeepReadonly<Fleet>, playerId: string): boolean;
export function fleetUsesNpcLogistics(fleet: DeepReadonly<Fleet>): boolean;
