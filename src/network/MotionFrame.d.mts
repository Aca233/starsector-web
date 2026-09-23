export type MotionRow = [string, number, number, number, number, number, number, number, number];
export interface MotionFrame { tick: number; time: number; acknowledged: Record<number, number>; ships: MotionRow[] }
export const MOTION_MAX_SHIPS: number;
export const MOTION_MAX_BYTES: number;
export function encodeMotionFrame(frame: MotionFrame): Uint8Array;
export function decodeMotionFrame(value: Uint8Array | ArrayBuffer): MotionFrame;
export function motionToText(bytes: Uint8Array): string;
export function motionFromText(value: unknown): MotionFrame;
