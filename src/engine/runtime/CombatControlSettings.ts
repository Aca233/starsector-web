/** Shared default for cockpit, LAN host controls and help text. */
export const DEFAULT_MOUSE_STEERING = true;
// v1 persisted false even when the user never chose it. This revision adopts the
// requested enabled default once; explicit v2 false remains a saved preference.
export const MOUSE_STEERING_SETTING_KEY = 'starsector-web:default-mouse-steering:v2';

export function readMouseSteering(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const value = (storage ?? window.localStorage).getItem(MOUSE_STEERING_SETTING_KEY);
    return value === 'false' ? false : DEFAULT_MOUSE_STEERING;
  } catch { return DEFAULT_MOUSE_STEERING; }
}

export function saveMouseSteering(enabled: boolean, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? window.localStorage).setItem(MOUSE_STEERING_SETTING_KEY, String(enabled)); }
  catch { /* Keep the in-session preference when browser storage is unavailable. */ }
}
