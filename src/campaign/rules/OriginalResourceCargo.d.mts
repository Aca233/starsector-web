export interface OriginalCargoSourceNode {name:string;attributes:Record<string,string>;children:OriginalCargoSourceNode[];text:string}
export interface OriginalResourceStack {cargo?:OriginalResourceCargo;objectRef:string|null;type:'RESOURCES';commodityId:string;size:number;maxSize:number;roundSize:boolean;cargoSpacePerUnit:number;source?:OriginalCargoSourceNode}
export interface OriginalOpaqueCargoStack {cargo?:OriginalResourceCargo;objectRef:string|null;type:'WEAPONS'|'FIGHTER_CHIP'|'SPECIAL'|'NULL';size:number;itemId?:string;itemData?:string|null;source?:OriginalCargoSourceNode;maxSize?:number;roundSize?:boolean;cargoSpacePerUnit?:number}
export interface OriginalResourceCargo {unlimitedStacks:boolean;partials:Record<string,number>|null;slots:(OriginalResourceStack|OriginalOpaqueCargoStack|null)[]}
export function validateOriginalResourceCargo(cargo:OriginalResourceCargo):void;
export function originalResourceQuantity(cargo:OriginalResourceCargo,commodityId:string):number;
export function addOriginalResourceCargo(cargo:OriginalResourceCargo,commodityId:string,amount:number,updateSpaceUsed?:()=>void,mutationReady?:(effectiveAmount:number)=>void):void;
export function removeOriginalResourceCargo(cargo:OriginalResourceCargo,commodityId:string,amount:number,updateSpaceUsed?:()=>void,mutationReady?:(effectiveAmount:number)=>void):boolean;
