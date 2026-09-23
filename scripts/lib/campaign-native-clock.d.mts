import type {NativeSaveEconomyCapture,NativeClockCapture} from './campaign-native-save.mjs';
export function captureNativeClock(saved:NativeSaveEconomyCapture['clock'],options?:{zoneId?:string}):Promise<NativeClockCapture>;
