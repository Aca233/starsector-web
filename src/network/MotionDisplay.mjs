import {encodeMotionFrame,MOTION_MAX_SHIPS} from './MotionFrame.mjs';
/** DISPLAY projection only. Authority objects, full worlds and SWM1's exact
 * codec remain untouched. A float32 conversion which exceeds the explicit
 * per-channel error budget falls back to the ORIGINAL double, not a clamp. */
export const MOTION_DISPLAY_ERROR = Object.freeze({linear:1/1024,angular:2**-22});
export function projectMotionDisplay(frame) {
  if (!frame || !Array.isArray(frame.ships) || frame.ships.length > MOTION_MAX_SHIPS) throw Error('Invalid display motion');
  const ships = frame.ships.map(row => {
    if (!Array.isArray(row) || row.length !== 9) throw Error('Invalid display motion row');
    const result = row.slice();
    for (let i=1;i<=6;i++) {
      const value=row[i];
      if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Invalid display motion number');
      const small=Math.fround(value),limit=i<=4?MOTION_DISPLAY_ERROR.linear:MOTION_DISPLAY_ERROR.angular;
      if (Number.isFinite(small) && Math.abs(small-value)<=limit) result[i]=small;
    }
    return result;
  });
  return {...frame,ships};
}
export function encodeMotionDisplayFrame(frame) { return encodeMotionFrame(projectMotionDisplay(frame)); }
