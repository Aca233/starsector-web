export function createAuthorityAdmission(enabled?:boolean):Int32Array|null;
export function attachAuthorityAdmission(buffer:unknown):Int32Array|null;
export function writeAuthorityAdmission(view:Int32Array|null,blocked:boolean):void;
export function closeAuthorityAdmission(view:Int32Array|null):void;
export function isAuthoritySnapshotBlocked(view:Int32Array|null):boolean;
