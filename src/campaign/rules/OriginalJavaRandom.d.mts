export interface OriginalJavaRandomState {kind:'java-random-lcg48';state:string}
export interface OriginalPatrolBranchRandom {scope:'web-persisted-patrol-branch-random';sourceSha256:string;global:OriginalJavaRandomState;routeSeeds:OriginalJavaRandomState}
export function createOriginalJavaRandom(seed:string):OriginalJavaRandomState;
export function validateOriginalJavaRandom(state:OriginalJavaRandomState):OriginalJavaRandomState;
export function originalJavaNextFloat(state:OriginalJavaRandomState):number;
export function originalJavaNextDouble(state:OriginalJavaRandomState):number;
export function originalJavaNextLong(state:OriginalJavaRandomState):string;
export function originalJavaNextInt(state:OriginalJavaRandomState,bound?:number):number;
export function createOriginalPatrolBranchRandom(sourceSha256:string):OriginalPatrolBranchRandom;
export function validateOriginalPatrolBranchRandom(state:OriginalPatrolBranchRandom):OriginalPatrolBranchRandom;
