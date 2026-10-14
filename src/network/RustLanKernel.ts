/** Network authority owns a resident Rust Core, never a hot TS engine. */
import type { Match, PlayerInput, Action } from './protocol';
import type { BattleReport } from './battle-report.mjs';
import type { CommandResult } from '../engine/runtime/CombatCommands';
import type { RustCoreSnapshot } from '../engine/runtime/rust/RustCoreProtocol';
import type { RustScenePublication } from '../engine/runtime/rust/RustScenePublication';
import { RustCombatCore, type RustCompletedSummary } from '../engine/runtime/rust/RustCombatCore';
import { loadRustCombatModule, type RustCombatModule } from '../engine/runtime/rust/RustCombatModule';
import { installRustCombat } from '../engine/runtime/rust/RustCombatInstall';
import { rustCombatFacts, type RustPresentationLive } from '../engine/runtime/rust/RustCombatFactsAdapter';
import { decodeRustOrdnanceFacts } from '../engine/runtime/rust/RustOrdnanceFacts';
import { RustCombatPresentation } from '../engine/runtime/rust/RustCombatPresentation';
import { compileRustLanStartup, type RustLanStartup, type RustLanSeat } from './RustLanStartup';
import { rustLanRow, encodeRustLanTick, decodeRustLanReads } from './RustLanProtocol';
import { RustLanDisplay } from './RustLanDisplay';
export interface RustLanTickInput {readonly seat:number;readonly input:PlayerInput;readonly fresh:boolean;readonly actions:readonly Action[]}
export class RustLanKernel {
 readonly backend='rust-wasm' as const;
 readonly controlled:ReadonlyMap<number,RustLanSeat>;
 private snapshot:RustCoreSnapshot;
 private scene:RustScenePublication;
 private summary:RustCompletedSummary;
 private fullDirty=false;
 private readonly presenter:RustCombatPresentation;
 private readonly display:RustLanDisplay;
 private revision=0;
 private audioCursor=0;
 private timing={commandsMs:0,rustMs:0,snapshotMs:0,sceneReadMs:0};
 private disposed=false;
 static async create(match:Match,epoch:number,artifact?:RustCombatModule):Promise<RustLanKernel>{
  const startup=compileRustLanStartup(match),loaded=artifact??await loadRustCombatModule(),core=await RustCombatCore.create(loaded.module,match.seed);
  try{installRustCombat(core,startup.content,{playerId:startup.playerId,enemyId:startup.enemyId,asteroids:true,scene:startup.scene,startupRadio:startup.radio});
   core.applyPacked(Float64Array.from(startup.seats.flatMap(seat=>rustLanRow(201,seat,[seat.seat,seat.manual.slot,seat.manual.generation]))));
   return new RustLanKernel(core,startup,epoch,loaded.sha256);
  }catch(error){core.dispose();throw error;}
 }
 private constructor(private readonly core:RustCombatCore,private readonly startup:RustLanStartup,private readonly epoch:number,readonly wasmSha256:string){
  this.controlled=new Map(startup.seats.map(s=>[s.seat,s]));this.snapshot=core.snapshot();this.scene=core.scenePublication();this.summary=core.completedSummary();this.validateFull();
  this.presenter=new RustCombatPresentation(startup.content,epoch);this.display=new RustLanDisplay(startup.content,startup.seats);
  if(!this.scene.network)throw Error('Rust LAN seat publication is absent');
 }
 get tick():number{return this.summary.tick;}
 get combatTime():number{return this.summary.combatTime;}
 get isBattleResultReady():boolean{return this.summary.resultReady;}
 get winningTeam():number|undefined{return this.summary.winningTeam;}
 get projectileCount():number{return this.summary.projectileCount;}
 get lastTiming(){return {...this.timing};}
 private refresh():void{this.summary=this.core.completedSummary();this.fullDirty=true;}
 private validateFull():void{if(this.snapshot.tick!==this.summary.tick||this.snapshot.combatTime!==this.summary.combatTime||this.scene.tick!==this.summary.tick||this.scene.time!==this.summary.combatTime
   ||this.scene.resultReady!==this.summary.resultReady||this.scene.winningTeam!==this.summary.winningTeam||this.snapshot.projectiles.length!==this.summary.projectileCount
   ||this.snapshot.lastEventSequence!==this.summary.lastEventSequence||this.scene.visual.audio.sequence!==this.summary.audioSequence
   ||this.scene.visual.audio.events.length!==this.summary.audioCount)throw Error('Rust LAN full publication differs from completed summary');}
 private full():void{if(!this.fullDirty)return;const start=performance.now();this.snapshot=this.core.snapshot();const published=performance.now();this.scene=this.core.scenePublication();const read=performance.now();
  this.validateFull();this.fullDirty=false;this.timing={...this.timing,snapshotMs:published-start,sceneReadMs:read-published};}
 private owner(seat:number):RustLanSeat{const owner=this.controlled.get(seat);if(!owner)throw Error('Missing Rust LAN control seat');return owner;}
 presence(seat:number,connected:boolean):void{this.requireOpen();this.core.applyPacked(Float64Array.from(rustLanRow(202,this.owner(seat),[seat,+connected])));this.refresh();}
 step(inputs:readonly RustLanTickInput[]):void{
  this.requireOpen();const rows=inputs.flatMap(({seat,input,fresh,actions})=>encodeRustLanTick(this.owner(seat),input,fresh,actions));
  const start=performance.now();this.core.applyPacked(Float64Array.from(rows.flat()));const commands=performance.now();this.core.step(1/60);const stepped=performance.now();
  this.refresh();const read=performance.now();this.timing={commandsMs:commands-start,rustMs:stepped-commands,snapshotMs:0,sceneReadMs:read-stepped};
 }
 deployment(seat:number,operation:'deploy'|'retreat'|'withdraw',ids:readonly string[]):CommandResult{
  this.requireOpen();this.full();const owner=this.owner(seat),ships=ids.map(id=>this.scene.ships.find(s=>s.stableId===id));
  if(ships.some(s=>!s))return {accepted:false,reason:operation==='deploy'?'只能部署本队战前编成中的舰船。':'只能撤退本队在场舰船。'};
  const rows=[rustLanRow(205,owner,[seat,operation==='deploy'?0:operation==='retreat'?1:2,ids.length]),
   ...ships.map((ship,i)=>rustLanRow(206,owner,[seat,i,ship!.handle.slot,ship!.handle.generation])),rustLanRow(207,owner,[seat])];
  this.core.applyPacked(Float64Array.from(rows.flat()));this.refresh();this.full();const result=this.scene.commandResults.at(-1);if(!result)throw Error('Missing Rust LAN deployment receipt');return result;
 }
 drainAudio(){
  this.requireOpen();const audio=this.fullDirty?(this.summary.audioCount?this.core.audioPublication():{sequence:this.summary.audioSequence,events:[]}):this.scene.visual.audio;
  if(this.fullDirty&&(audio.sequence!==this.summary.audioSequence||audio.events.length!==this.summary.audioCount))throw Error('Rust LAN retained audio differs from completed summary');
  const start=this.audioCursor-(audio.sequence-audio.events.length);
  if(start<0||start>audio.events.length)throw Error('Rust LAN audio sequence differs');
  const events=audio.events.slice(start);this.audioCursor=audio.sequence;
  this.presenter.discardAudioThrough(audio.sequence);this.core.acknowledgeAudio(audio.sequence);this.core.acknowledgeEvents(this.summary.lastEventSequence);
  // ACK keeps rule facts, but changes the retained queues in a full publication.
  // A later consumer must read those current facts rather than the pre-ACK copy.
  this.summary={...this.summary,audioCount:0};this.fullDirty=true;return events;
 }
 capture(acknowledged:Record<number,number>,simulationMs:number){
  this.requireOpen();this.full();const reads=new Map(this.scene.ships.map(s=>[s.id,s]));const handle=(id:number)=>{const s=reads.get(id);if(!s)throw Error('Missing Rust LAN live owner');return s.handle;};
  const live:RustPresentationLive={...decodeRustOrdnanceFacts(Array.from(this.scene.ordnance),this.startup.content,this.snapshot,this.scene.ships),audio:this.scene.visual.audio,
   systems:this.scene.dynamic.systems.map(s=>({...s,handle:handle(s.id)})),mounts:this.scene.dynamic.mounts.map(s=>({...s,handle:handle(s.id)})),poses:this.scene.dynamic.ships.map(s=>({...s,handle:handle(s.id)}))};
  const facts=rustCombatFacts(this.startup.content,this.snapshot,this.scene,live,this.epoch,++this.revision),frame=this.presenter.capture(this.snapshot,facts);
  return this.display.capture(this.snapshot,facts,frame,decodeRustLanReads(this.scene.network!),acknowledged,simulationMs);
 }
 report():BattleReport{
  this.requireOpen();this.full();const byHandle=new Map(this.scene.ships.map(s=>[s.handle.slot+':'+s.handle.generation,s])),bodies=new Map(this.snapshot.bodies.map(b=>[b.id,b]));
  const seats=new Map([...this.controlled].map(([seat,s])=>[s.stableId,seat]));
  return {tick:this.tick,seconds:this.combatTime,ships:this.scene.deployment.map(row=>{const ship=byHandle.get(row.handle.slot+':'+row.handle.generation);if(!ship)throw Error('Missing Rust LAN settlement identity');const body=bodies.get(ship.id)!,a=body.ship!.armor!.values;
   return {id:ship.stableId,team:row.teamId,seat:seats.get(ship.stableId)??null,name:ship.shipName.slice(0,120),cost:row.cost,status:row.status,hull:row.status==='destroyed'?0:Math.min(a[13],Math.max(0,a[14])),hullMax:a[13],cr:body.ship!.readiness!.values[0]};})};
 }
 witness(){this.requireOpen();this.full();return structuredClone({snapshot:this.snapshot,scene:this.scene});}
 dispose():void{if(!this.disposed){this.disposed=true;this.core.dispose();}}
 private requireOpen():void{if(this.disposed)throw Error('Rust LAN authority is closed');}
}
