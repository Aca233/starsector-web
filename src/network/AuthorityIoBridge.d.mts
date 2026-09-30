export class AuthorityIoBridge {
 constructor(options:{send:(data:string|Uint8Array)=>void;buffered:()=>number;now?:()=>number;sharedCompletion?:boolean;sharedAdmission?:boolean});
 attach(port:MessagePort,matchId:string,seq?:number):void;
 close(reason?:string):void;
 observe(data:unknown):boolean|undefined;
 refreshAdmission(bufferedAmount?:number):void;
 publish(message:unknown):void;
}
