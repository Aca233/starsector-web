import { captureCombatAudio } from '../engine/audio/CombatAudioEvents';
import { sound } from '../engine/audio/SoundManager';
export interface LabSound { key: string; volume: number; rate: number; pos?: [number, number] }
/** Bounded event transport; the normal audio mixer still owns voice limits/throttling. */
export function captureLabAudio() {
  const events: LabSound[] = [];
  const play = sound.play.bind(sound), playAtPos = sound.playAtPos.bind(sound);
  let dropped = 0;
  const push = (event: LabSound) => { if (events.length < 256) events.push(event); else dropped++; };
  const restore = captureCombatAudio(event => {
    if(event.kind === 'play')push({key:event.key,volume:event.volume,rate:event.rate,...(event.position?{pos:[...event.position] as [number,number]}:{})});
  });
  return { drain: () => events.splice(0), dropped: () => dropped, play, playAtPos,
    restore };
}
