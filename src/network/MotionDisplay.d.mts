import type {MotionFrame} from './MotionFrame.mjs';
export const MOTION_DISPLAY_ERROR: Readonly<{linear:number;angular:number}>;
export function projectMotionDisplay(frame:MotionFrame):MotionFrame;
export function encodeMotionDisplayFrame(frame:MotionFrame):Uint8Array;
