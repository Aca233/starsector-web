import type {ProjectileStreamFrame,PreparedProjectileEvents} from './ProjectileEventStream.mjs';
export class ProjectileVisualSender {
 constructor(epoch:string);
 reset(epoch:string):void;
 fork():ProjectileVisualSender;
 prepare(frame:ProjectileStreamFrame):PreparedProjectileEvents;
 commit(choice:PreparedProjectileEvents):boolean;
 stats():{revision:number;tick:number;entities:number;templates:number;retainedStateBytes:number;retainedTemplateBytes:number};
}
export class ProjectileVisualReceiver {
 constructor(epoch:string);
 reset(epoch:string):void;
 fork():ProjectileVisualReceiver;
 receive(bytes:Uint8Array|ArrayBuffer):Readonly<{tick:number;time:number;revision:number;rows:ReadonlyArray<Record<string,any>>}>;
 stats():{revision:number;tick:number;entities:number;templates:number;retainedStateBytes:number;retainedTemplateBytes:number};
}
