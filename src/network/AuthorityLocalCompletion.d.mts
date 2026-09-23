export interface AuthorityCompletion {attempt?:number;tick:number;nextSequence:number;delivery:'sent'|'skipped'}
export function createAuthorityCompletion(enabled?:boolean):Int32Array|null;
export function attachAuthorityCompletion(buffer:unknown):Int32Array|null;
export function closeAuthorityCompletion(view:Int32Array|null):void;
export function writeAuthorityCompletion(view:Int32Array|null,kind:'snapshot'|'motion',receipt:AuthorityCompletion):void;
export function readAuthorityCompletion(view:Int32Array|null,kind:'snapshot'|'motion',expectedTick:number|null,expectedAttempt?:number):AuthorityCompletion|null;
