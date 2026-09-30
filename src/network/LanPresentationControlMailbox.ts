import { copyWorkerControls, type LanWorkerControls } from './LanPresentationWorkerProtocol';

export interface LanSharedControlSample {
  revision:number; revocations:number; pointerRevocations:number; controls:LanWorkerControls;
}
// generation, revision (0 = revoked), two revocation counters, flags, then
// zoom/seq/keys/minTick, pointer XY, backing WH, CSS rectangle L/T/W/H.
const NUMBERS=17;
export const LAN_CONTROL_BYTES=8+NUMBERS*8;
const integer=(n:number,min=0)=>Number.isSafeInteger(n)&&n>=min;

/** Main is the ONLY writer; Worker never clears/writes this lock, even on reset.
 * No floating-point shared loads, unbounded history, action list or network credit.
 * The explicit reset message supplies generation and syncId to the reader. */
export class LanPresentationControlMailbox {
  private readonly shared:Int32Array;
  private readonly scratch=new ArrayBuffer(NUMBERS*8);
  private readonly words=new Int32Array(this.scratch);
  private readonly numbers=new Float64Array(this.scratch);
  constructor(readonly buffer:SharedArrayBuffer){
    if(typeof SharedArrayBuffer!=='function'||!(buffer instanceof SharedArrayBuffer)||buffer.byteLength!==LAN_CONTROL_BYTES)throw Error('Invalid shared controls mailbox');
    this.shared=new Int32Array(buffer);
  }
  write(generation:number,sample:LanSharedControlSample|null):void{
    if(!integer(generation,1))throw Error('Invalid shared controls generation');
    if(sample&&(!integer(sample.revision,1)||!integer(sample.revocations)||!integer(sample.pointerRevocations)))throw Error('Invalid shared controls revision');
    const c=sample?copyWorkerControls(sample.controls):null,n=this.numbers;
    n.fill(0);n[0]=generation;
    if(c&&sample){
      n[1]=sample.revision;n[2]=sample.revocations;n[3]=sample.pointerRevocations;
      n[4]=(c.pointer?1:0)|(c.viewport?2:0)|(c.visible?4:0)|(c.launched?8:0)|(c.synced?16:0)|(c.focused?32:0)|(c.blocked?64:0)|(c.firing?128:0);
      n[5]=c.zoom;n[6]=c.seq;n[7]=c.keys;n[8]=c.minTick;
      if(c.pointer){n[9]=c.pointer[0];n[10]=c.pointer[1];}
      if(c.viewport){const v=c.viewport;n[11]=v.width;n[12]=v.height;n[13]=v.rect.left;n[14]=v.rect.top;n[15]=v.rect.width;n[16]=v.rect.height;}
    }
    Atomics.add(this.shared,0,1);
    for(let i=0;i<this.words.length;i++)Atomics.store(this.shared,i+2,this.words[i]);
    Atomics.add(this.shared,0,1);
  }
  /** false = coherent unchanged sample; null = revoked/wrong generation or
   * bounded contention. Neither condition authorizes a new session or input. */
  read(generation:number,syncId:string,afterRevision=0):LanSharedControlSample|false|null{
    if(!integer(generation,1)||!integer(afterRevision))return null;
    for(let attempt=0;attempt<4;attempt++){
      const before=Atomics.load(this.shared,0);if(before&1)continue;
      for(let i=0;i<this.words.length;i++)this.words[i]=Atomics.load(this.shared,i+2);
      if(Atomics.load(this.shared,0)!==before)continue;
      const n=this.numbers;
      if(n[0]!==generation||n[1]===0)return null;
      if(!integer(n[1],1)||!integer(n[2])||!integer(n[3])||!integer(n[4])||n[4]>255)throw Error('Invalid shared controls publication');
      if(n[1]<=afterRevision)return false;
      const flags=n[4];
      return {revision:n[1],revocations:n[2],pointerRevocations:n[3],controls:copyWorkerControls({
        zoom:n[5],seq:n[6],keys:n[7],minTick:n[8],syncId,
        pointer:flags&1?[n[9],n[10]]:null,
        viewport:flags&2?{width:n[11],height:n[12],rect:{left:n[13],top:n[14],width:n[15],height:n[16]}}:null,
        visible:!!(flags&4),launched:!!(flags&8),synced:!!(flags&16),focused:!!(flags&32),blocked:!!(flags&64),firing:!!(flags&128),
      })};
    }
    return null;
  }
}
