import type { Action, PlayerInput } from './protocol';
import { encodeRustSceneShipCommand } from '../engine/runtime/rust/RustSceneShipCommandProtocol';
import type { RustLanSeat } from './RustLanStartup';
import type { RustBodyHandle } from '../engine/runtime/rust/RustCoreProtocol';
export const rustLanRow=(tag:number,owner:RustLanSeat,values:readonly number[]):number[]=>{
 if(values.length>22||values.some(n=>!Number.isFinite(n)))throw Error('Invalid Rust LAN command');
 return [tag,owner.id,owner.handle.slot,owner.handle.generation,...values,...Array<number>(22-values.length).fill(0)];
};
export function encodeRustLanTick(owner:RustLanSeat,input:PlayerInput,fresh:boolean,actions:readonly Action[]):number[][] {
 if(!Number.isSafeInteger(input.keys)||input.keys<0||input.keys>1023||!Array.isArray(input.aim)||input.aim.length!==2||!input.aim.every(Number.isFinite))throw Error('Invalid Rust LAN sample');
 const rows=[rustLanRow(203,owner,[owner.seat,fresh?input.keys&255:0,...input.aim,+!!(fresh&&input.firing),1,+!!(fresh&&input.pointerActive),+!!(fresh&&(input.keys&256)),+!!(fresh&&(input.keys&512))])];
 for(const action of actions){
  const c=encodeRustSceneShipCommand({command:{kind:action.kind,value:action.value??0},aim:action.aim},owner.id,owner.handle)[0];
  rows.push(rustLanRow(204,owner,[owner.seat,c[0],...c.slice(4,11)]));
 }
 return rows;
}
export interface RustLanReads {
 readonly seats:readonly {seat:number;root:RustBodyHandle;connected:boolean;manual:RustBodyHandle;target?:RustBodyHandle}[];
 readonly ships:readonly {id:number;motionStats:{acceleration:number;deceleration:number;maxSpeed:number;maxTurnRate:number;turnAcceleration:number;turnDeceleration:number;driftAcceleration:number;strafeMultiplier:number};
  forcedRightTurn:number;subjectiveTimeMultiplier:number;aim:readonly [number,number];defenseFacingRad?:number;aiHoldOffensiveFire:boolean;externalPhased:boolean;externalPhaseAlpha?:number;phaseAlphaMultiplier:number;teleportSequence:number}[];
 readonly systems:readonly {id:number;systemId:number;bits:number;forcesBraking:boolean;isPhased:boolean;fluxCosts:Record<string,number>;fireRates:Record<string,number>;fireComponents:readonly number[]}[];
 readonly mounts:readonly {id:number;componentId:number;speed:number}[];
 readonly wings:readonly {side:number;carrier:RustBodyHandle;wingId:string;specId:string;name:string;teamId:number;maxCrafts:number;crr:number;tags:readonly string[];rebuildQueue:readonly {id:string;timer:number;maxTimer:number}[]}[];
}
class Reader {
 private at=0;
 constructor(readonly v:Float64Array){}
 number():number{const n=this.v[this.at++];if(!Number.isFinite(n))throw Error('Invalid Rust LAN read');return n;}
 integer(max=Number.MAX_SAFE_INTEGER):number{const n=this.number();if(!Number.isSafeInteger(n)||n<0||n>max)throw Error('Invalid Rust LAN integer');return n;}
 flag():boolean{return this.integer(1)===1;}
 handle():RustBodyHandle{return {slot:this.integer(0xffffffff),generation:this.integer(0xffffffff)};}
 count():number{const n=this.integer();if(n>this.v.length-this.at)throw Error('Invalid Rust LAN count');return n;}
 record():Float64Array{const n=this.count(),v=this.v.subarray(this.at,this.at+n);this.at+=n;return v;}
 string():string{let s='';for(let n=this.count();n>0;n--)s+=String.fromCharCode(this.integer(65535));return s;}
 finish():void{if(this.at!==this.v.length)throw Error('Trailing Rust LAN read');}
}
export function decodeRustLanReads(values:Float64Array):RustLanReads {
 const block=new Reader(values);if(block.integer()!==1)throw Error('Rust LAN version differs');
 const seats:RustLanReads['seats'][number][]=[],ships:RustLanReads['ships'][number][]=[],systems:RustLanReads['systems'][number][]=[],mounts:RustLanReads['mounts'][number][]=[],wings:RustLanReads['wings'][number][]=[];
 for(let i=0,n=block.count();i<n;i++){
  const tag=block.integer(5),r=new Reader(block.record());
  if(tag===1){const seat=r.integer(),root=r.handle(),connected=r.flag(),manual=r.handle(),target=r.flag()?r.handle():undefined;seats.push({seat,root,connected,manual,target});}
  else if(tag===2){const id=r.integer(0xffffffff),motionStats={acceleration:r.number(),deceleration:r.number(),maxSpeed:r.number(),maxTurnRate:r.number(),turnAcceleration:r.number(),turnDeceleration:r.number(),driftAcceleration:r.number(),strafeMultiplier:r.number()};
   const forcedRightTurn=r.integer(1),subjectiveTimeMultiplier=r.number(),aim=[r.number(),r.number()] as const,defensePresent=r.flag(),defense=r.number(),aiHoldOffensiveFire=r.flag(),externalPhased=r.flag(),externalAlpha=r.number(),phaseAlphaMultiplier=r.number(),teleportSequence=r.integer();
   ships.push({id,motionStats,forcedRightTurn,subjectiveTimeMultiplier,aim,defenseFacingRad:defensePresent?defense:undefined,aiHoldOffensiveFire,externalPhased,externalPhaseAlpha:externalPhased?externalAlpha:undefined,phaseAlphaMultiplier,teleportSequence});}
  else if(tag===3){const id=r.integer(0xffffffff),systemId=r.integer(0xffffffff),bits=r.integer(1023),forcesBraking=r.flag(),isPhased=r.flag();
   const fluxCosts={BALLISTIC:r.number(),ENERGY:r.number(),MISSILE:r.number()},fireRates={BALLISTIC:r.number(),ENERGY:r.number(),MISSILE:r.number()},fireComponents=Array.from({length:r.count()},()=>r.integer(0xffffffff));systems.push({id,systemId,bits,forcesBraking,isPhased,fluxCosts,fireRates,fireComponents});}
  else if(tag===4)mounts.push({id:r.integer(0xffffffff),componentId:r.integer(0xffffffff),speed:r.number()});
  else if(tag===5){const side=r.integer(1),carrier=r.handle(),wingId=r.string(),specId=r.string(),name=r.string(),teamId=r.integer(0xffffffff),maxCrafts=r.integer(),crr=r.number(),tags=Array.from({length:r.count()},()=>r.string()),rebuildQueue=Array.from({length:r.count()},()=>({id:r.string(),timer:r.number(),maxTimer:r.number()}));wings.push({side,carrier,wingId,specId,name,teamId,maxCrafts,crr,tags,rebuildQueue});}
  else throw Error('Unknown Rust LAN record');r.finish();
 }
 block.finish();if(!seats.length||seats.length>64||new Set(seats.map(s=>s.seat)).size!==seats.length||new Set(ships.map(s=>s.id)).size!==ships.length||new Set(systems.map(s=>s.id+':'+s.systemId)).size!==systems.length||new Set(mounts.map(s=>s.id+':'+s.componentId)).size!==mounts.length)throw Error('Invalid Rust LAN membership');
 return {seats,ships,systems,mounts,wings};
}
