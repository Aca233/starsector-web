import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
export interface OriginalJitterRenderer {scope:'native-jitter-renderer';seed:string;random:OriginalJavaRandomState;jitterDirection:[number,number]|null;jitterLength:number;setSeedOnRender:boolean;circular:boolean}
export function createOriginalJitterRenderer(seed:string):OriginalJitterRenderer;
export function updateOriginalJitterSeed(jitter:OriginalJitterRenderer,seed:string):void;
export function originalJitterRandom(jitter:OriginalJitterRenderer):OriginalJavaRandomState;
export function validateOriginalJitterRenderer<T extends OriginalJitterRenderer>(jitter:T):T;
export function originalJitterOffsets(jitter:OriginalJitterRenderer,maxRange:number,copies:number,minRange?:number):[number,number][];
