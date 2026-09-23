export interface PackedProjectileVisual {id:number;specId:string;appearance:Record<string,any>;pose:Array<number|null>}
export const PROJECTILE_VISUAL_COLUMNS:ReadonlyArray<readonly [string,number|null,number]>;
export function packProjectileVisual(row:Record<string,any>):PackedProjectileVisual;
export function unpackProjectileVisual(row:PackedProjectileVisual):Record<string,any>;
export function validateVisualColumns(pose:Array<number|null>):Array<number|null>;
export function referenceVisualColumns(row:PackedProjectileVisual,seconds:number):PackedProjectileVisual;
export function diffVisualColumns(a:Array<number|null>,b:Array<number|null>):Array<number|null>|null;
export function applyVisualColumnDiff(pose:Array<number|null>,changes:Array<number|null>):Array<number|null>;
