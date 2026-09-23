import {SnapshotTapeWriter} from './SnapshotTape.mjs';
import {createEncodeMailbox,reserveEncodeMailbox,cancelEncodeMailbox,takeEncodeMailbox} from './SnapshotEncodeMailbox.mjs';
import type {EncodedSnapshotResult} from './SnapshotEncodeMailbox.mjs';
import type {CombatSnapshot,CombatSound} from './CombatSnapshot';
/** One helper and one queued/running job. Completion can be polled at physics
 * boundaries instead of waiting for the authority's MessagePort event queue. */
export class SnapshotEncoderBroker {
  private worker: Worker | null;
  private mailbox = createEncodeMailbox();
  private tape = new SnapshotTapeWriter();
  private spare: ArrayBuffer | null = null;
  private nextId = 0;
  private pending: {id:number;at:number} | null = null;
  private started = performance.now();
  private ready = false;
  private disabled = false;
  private reason = 'starting';
  private counters = {submitted:0,completed:0,cancelled:0,fallbacks:0,prepareMs:0,workerMs:0,tapeBytes:0,transferBytes:0};
  constructor(private readonly wake:()=>void) {
    this.worker = new Worker(new URL('./snapshot-encode.worker.ts',import.meta.url),{type:'module'});
    this.worker.onerror = event => {event.preventDefault();this.disable('worker-error');this.wake();};
    this.worker.onmessage = ({data:m}) => {
      if(this.disabled)return;
      if(m.type==='ready'){this.ready=true;this.reason='active';}
      else if(m.type==='complete'&&m.buffer instanceof ArrayBuffer) this.spare=m.buffer;
      this.wake();
    };
    try {this.worker.postMessage({type:'init',mailbox:this.mailbox});}
    catch (error) {this.worker.terminate();this.worker=null;throw error;}
  }
  get busy() {return this.pending!==null;}
  get available() {return this.ready&&!this.disabled&&!this.busy;}
  get stats() {return {enabled:!this.disabled,reason:this.reason,ready:this.ready,busy:this.busy,...this.counters,ageMs:this.pending?performance.now()-this.pending.at:0};}
  submit(frame:CombatSnapshot,display:boolean,network:boolean,networkSounds:CombatSound[]):number|null {
    if(!this.available||!this.worker)return null;
    if(this.nextId>=0x7ffffffe){this.disable('job-id-exhausted');return null;}
    const start=performance.now();
    if(this.spare){this.tape.reuse(this.spare);this.spare=null;}
    const tape=this.tape.encode(frame);
    if(!tape){this.disable('unsupported-tape');return null;}
    const id=++this.nextId, transferBytes=tape.buffer.byteLength;
    reserveEncodeMailbox(this.mailbox,id);this.pending={id,at:start};
    try {this.worker.postMessage({type:'encode',id,tape,display,network,networkSounds},[tape.buffer]);}
    catch {this.pending=null;this.disable('post-failed');return null;}
    this.counters.submitted++;this.counters.tapeBytes=tape.words*8;this.counters.transferBytes=transferBytes;
    this.counters.prepareMs=this.counters.prepareMs*.7+(performance.now()-start)*.3;
    return id;
  }
  poll():EncodedSnapshotResult|null {
    const pending=this.pending;
    if(!this.disabled && !this.ready&&performance.now()-this.started>3000)this.disable('startup-timeout');
    if(!this.disabled && pending&&performance.now()-pending.at>1000)this.disable('job-timeout');
    if(!pending)return null;
    if(this.disabled){this.pending=null;return{id:pending.id,display:null,network:null,fallback:true,workerMs:0};}
    let result:EncodedSnapshotResult|null;
    try {result=takeEncodeMailbox(this.mailbox,pending.id);}
    catch {this.disable('invalid-mailbox');this.pending=null;return{id:pending.id,display:null,network:null,fallback:true,workerMs:0};}
    if(result){this.pending=null;if(result.fallback)this.disable('worker-fallback');else{this.counters.completed++;this.counters.workerMs=this.counters.workerMs*.7+result.workerMs*.3;}}
    return result;
  }
  cancel() {if(this.pending){this.counters.cancelled++;this.reason='cancelled';this.disabled=true;this.ready=false;this.worker?.terminate();this.worker=null;this.spare=null;}this.pending=null;cancelEncodeMailbox(this.mailbox);}
  private disable(reason:string) {this.reason=reason;if(!this.disabled)this.counters.fallbacks++;this.disabled=true;this.ready=false;cancelEncodeMailbox(this.mailbox);this.worker?.terminate();this.worker=null;this.spare=null;}
  close() {this.cancel();this.reason='closed';this.disabled=true;this.ready=false;this.worker?.terminate();this.worker=null;this.spare=null;}
}
