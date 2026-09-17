import { sound } from '../engine/audio/SoundManager';
export interface LabSound { key: string; volume: number; rate: number; pos?: [number, number] }
/** Bounded event transport; the normal audio mixer still owns voice limits/throttling. */
export function captureLabAudio() {
  const events: LabSound[] = [];
  const play = sound.play.bind(sound), playAtPos = sound.playAtPos.bind(sound);
  const oldPlay = sound.play, oldPlayAtPos = sound.playAtPos;
  let dropped = 0;
  const push = (event: LabSound) => { if (events.length < 256) events.push(event); else dropped++; };
  sound.play = (key, volume = .8, rate = 1) => push({ key, volume, rate });
  sound.playAtPos = (key, pos, _listener, volume = .8, rate = 1) => push({ key, volume, rate, pos: [pos.x, pos.y] });
  return { drain: () => events.splice(0), dropped: () => dropped, play, playAtPos,
    restore: () => { sound.play = oldPlay; sound.playAtPos = oldPlayAtPos; } };
}
