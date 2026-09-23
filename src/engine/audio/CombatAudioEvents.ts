/** Simulation output only. No AudioContext, mixer, asset loading or browser API. */
export type CombatAudioEvent =
  | { kind: 'play'; key: string; volume: number; rate: number; position?: readonly [number, number]; listener?: readonly [number, number]; maxDistance?: number }
  | { kind: 'loop'; key: string; volume: number; active: boolean }
  | { kind: 'muffled'; value: boolean };
export type CombatAudioSink = (event: CombatAudioEvent) => void;
let playback: CombatAudioSink | undefined;
const sinks: { emit: CombatAudioSink }[] = [];
/** Presentation registers its mixer once; authority workers never need to import it. */
export function setCombatAudioPlayback(sink: CombatAudioSink): () => void { const previous = playback; playback = sink; return () => { if (playback === sink) playback = previous; }; }
/** Scoped override, safe to dispose out of order. Workers install one collector for
 * their realm; lab/inline captures can nest without patching a SoundManager method. */
export function captureCombatAudio(emit: CombatAudioSink): () => void {
  const entry = { emit }; sinks.push(entry);
  return () => { const index = sinks.indexOf(entry); if (index >= 0) sinks.splice(index, 1); };
}
function publish(event: CombatAudioEvent): void { (sinks.at(-1)?.emit ?? playback)?.(event); }
export const combatAudio = Object.freeze({
  play(key: string, volume = .8, rate = 1): void { publish({ kind: 'play', key, volume, rate }); },
  playAtPos(key: string, pos: {x:number;y:number}, listener: {x:number;y:number}, volume = .8, rate = 1, maxDistance = 2800): void {
    publish({ kind: 'play', key, volume, rate, position: [pos.x,pos.y], listener: [listener.x,listener.y], maxDistance });
  },
  startLoop(key: string, volume = .6): void { publish({ kind: 'loop', key, volume, active: true }); },
  stopLoop(key: string): void { publish({ kind: 'loop', key, volume: 0, active: false }); },
  setMuffled(value: boolean): void { publish({ kind: 'muffled', value }); },
});
