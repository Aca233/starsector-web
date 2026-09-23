export interface OriginalLocationEntityState {position:[number,number];velocity?:[number,number];orbit?:unknown;[key:string]:unknown}
export interface OriginalLocationOrbit {scope:'native-current-location-orbit';kind:'circular'|'point-down'|'spin';entity:object;focus:object;radius:number;orbitalPeriod:number;currAngle:number;currFacing?:number;spinVel?:number}
export interface OriginalLocationOrbitServices {readLocationEntityState?(entity:object):OriginalLocationEntityState;advanceCustomLocationOrbit?(orbit:unknown,seconds:number):void;setLocationEntityFacing?(entity:object,facing:number):void}
export function originalLocationEntityState(entity:object,services?:OriginalLocationOrbitServices):OriginalLocationEntityState;
export function validateOriginalLocationOrbit(orbit:OriginalLocationOrbit):OriginalLocationOrbit;
export function createOriginalLocationOrbit(entity:object,focus:object,options:{kind?:OriginalLocationOrbit['kind'];radius:number;orbitalPeriod?:number;currAngle:number;currFacing?:number;spinVel?:number},services?:OriginalLocationOrbitServices):OriginalLocationOrbit;
export function advanceOriginalLocationOrbit(orbit:unknown,seconds:number,days:number,services?:OriginalLocationOrbitServices):void;
