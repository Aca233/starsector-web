import type { NativeSaveEconomySummary } from './lib/campaign-native-save.mjs';
export function captureNativeSaveEconomy(saveDirectory: string, outputFile: string, options?:{nativeClock?:boolean}): Promise<NativeSaveEconomySummary>;
