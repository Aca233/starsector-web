export interface OriginalJavaStringSet {scope:'native-java-string-set';capacity:number;entries:string[]}
export function createOriginalJavaStringSet(entries?:string[],collection?:boolean):OriginalJavaStringSet;
export function validateOriginalJavaStringSet(state:OriginalJavaStringSet):OriginalJavaStringSet;
export function addOriginalJavaStringSet(state:OriginalJavaStringSet,id:string):boolean;
export function removeOriginalJavaStringSet(state:OriginalJavaStringSet,id:string):boolean;
