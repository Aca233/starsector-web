export interface ProjectileRecord { id: number; specId: string; [key: string]: unknown }
export interface ProjectileStreamFrame { tick: number; time: number; rows: ProjectileRecord[] }
export const PROJECTILE_STREAM_LIMITS: Readonly<Record<string, number>>;
export interface PreparedProjectileEvents { readonly bytes: Uint8Array; readonly revision: number; readonly tick: number; readonly stats: Readonly<{created:number;changed:number;removed:number;templates:number;stateBytes:number}> }
export class ProjectileEventSender {
 constructor(epoch:string,options?:{referenceSteps?:boolean;visualColumns?:boolean});
 reset(epoch:string):void;
 fork():ProjectileEventSender;
 prepare(frame:ProjectileStreamFrame):PreparedProjectileEvents;
 commit(choice:PreparedProjectileEvents):boolean;
 stats():{revision:number;tick:number;entities:number;templates:number;retainedStateBytes:number;retainedTemplateBytes:number};
}
export class ProjectileEventReceiver {
 constructor(epoch:string);
 reset(epoch:string):void;
 fork():ProjectileEventReceiver;
 receive(bytes:Uint8Array|ArrayBuffer):Readonly<{tick:number;time:number;revision:number;rows:ReadonlyArray<ProjectileRecord>}>;
 stats():{revision:number;tick:number;entities:number;templates:number;retainedStateBytes:number;retainedTemplateBytes:number};
}
