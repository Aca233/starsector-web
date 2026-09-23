import type { FleetView, PointView } from './Protocol.js';
export interface JumpVisualState { brightness: number; opening: boolean; hold: number }
export const JUMP_OPEN_RANGE: 600;
export function wantsJumpPointOpen(point: PointView, fleets: FleetView[], hyperspace: boolean): boolean;
export function initialJumpVisual(open?: boolean): JumpVisualState;
export function advanceJumpVisual(previous: JumpVisualState, active: boolean, seconds: number): JumpVisualState;
export function jumpVisualParameters(radius: number, brightness: number): { open: number; scale: number; coronaSize: number; ringSize: number; ringStep: number; glowSize: number; glowAlpha: number; bandWidth: number; bandInnerRadius: number; bandAlpha: number; bandFluctuation: number; pixelsPerSegment: number };
