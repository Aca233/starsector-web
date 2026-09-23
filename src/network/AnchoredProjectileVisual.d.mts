import type {ProjectileStreamFrame} from './ProjectileEventStream.mjs';
export const ANCHORED_VISUAL_LIMITS:Readonly<{baselineBytes:number;updateBytes:number;baselineSeconds:number;entities:number}>;
export interface VisualPublication {readonly key:number;readonly baseTick:number;readonly tick:number;readonly time:number;readonly baseline:Uint8Array;readonly update:Uint8Array|null}
export interface VisualReceivedFrame {readonly tick:number;readonly time:number;readonly revision:number;readonly rows:ReadonlyArray<Record<string,any>>}
export class AnchoredProjectilePublisher {
 constructor(epoch:string);reset(epoch:string):void;publish(frame:ProjectileStreamFrame):VisualPublication;
 readonly latest:VisualPublication|null;
 stats():{encodes:number;updates:number;baselines:number;key:number;retainedBytes:number};
}
export class AnchoredProjectileReceiver {
 constructor(epoch:string);reset(epoch:string):void;
 baseline(key:number,bytes:Uint8Array|ArrayBuffer):VisualReceivedFrame|null;
 update(key:number,bytes:Uint8Array|ArrayBuffer):VisualReceivedFrame|null;
 stats():{key:number|null;tick:number;baselineTick:number|null;retainedBaselineBytes:number};
}
