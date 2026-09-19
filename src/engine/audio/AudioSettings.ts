/** Persisted user preferences, shared by menus and the mixer (also safe in workers). */
export interface AudioSettings {
  masterVolume: number;
  effectsVolume: number;
  interfaceVolume: number;
  muted: boolean;
  muteInBackground: boolean;
}
export type AudioChannel = 'effects' | 'interface';
export const AUDIO_SETTINGS_KEY = 'starsector-web:audio-settings';
const LEGACY_MUTE_KEY = 'starsector-web:muted';
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  masterVolume: 1, effectsVolume: 1, interfaceVolume: 1, muted: false, muteInBackground: false,
});

export function normalizeAudioSettings(value: unknown): Readonly<AudioSettings> {
  const raw = value && typeof value === 'object' ? value as Partial<AudioSettings> : {};
  const volume = (key: 'masterVolume' | 'effectsVolume' | 'interfaceVolume') =>
    typeof raw[key] === 'number' && Number.isFinite(raw[key])
      ? Math.max(0, Math.min(1, raw[key])) : DEFAULT_AUDIO_SETTINGS[key];
  return Object.freeze({
    masterVolume: volume('masterVolume'), effectsVolume: volume('effectsVolume'), interfaceVolume: volume('interfaceVolume'),
    muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_AUDIO_SETTINGS.muted,
    muteInBackground: typeof raw.muteInBackground === 'boolean' ? raw.muteInBackground : DEFAULT_AUDIO_SETTINGS.muteInBackground,
  });
}

function readSettings(): Readonly<AudioSettings> {
  try {
    const stored = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return normalizeAudioSettings(parsed);
    }
  } catch { /* Corrupt or unavailable storage must not prevent startup. */ }
  try { return normalizeAudioSettings({ muted: localStorage.getItem(LEGACY_MUTE_KEY) === 'true' }); }
  catch { return DEFAULT_AUDIO_SETTINGS; }
}
let settings = readSettings();
const listeners = new Set<() => void>();
export const getAudioSettings = (): Readonly<AudioSettings> => settings;
export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: Readonly<AudioSettings>) {
  if (Object.keys(DEFAULT_AUDIO_SETTINGS).every(key => settings[key] === next[key])) return;
  settings = next;
  listeners.forEach(listener => listener());
}
export function updateAudioSettings(patch: Partial<AudioSettings>): void {
  publish(normalizeAudioSettings({ ...settings, ...patch }));
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(LEGACY_MUTE_KEY, String(settings.muted));
  } catch { /* Session controls still work when storage is denied or full. */ }
}
export function resetAudioSettings(): void { updateAudioSettings(DEFAULT_AUDIO_SETTINGS); }
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === AUDIO_SETTINGS_KEY || event.key === LEGACY_MUTE_KEY || event.key === null) publish(readSettings());
  });
}
