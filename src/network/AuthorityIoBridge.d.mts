export class AuthorityIoBridge {
 constructor(options:{send:(data:string|Uint8Array)=>void;buffered:()=>number;now?:()=>number;sharedCompletion?:boolean});
 attach(port:MessagePort,matchId:string,seq?:number):void;
 close(reason?:string):void;
 observe(data:unknown):boolean|undefined;
 publish(message:unknown):void;
}
