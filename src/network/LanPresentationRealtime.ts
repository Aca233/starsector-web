/** Small same-frame display coordinates, not a HUD/world, authority, or input ACK. */
export interface LanRealtimeFrame {
  frame:number; tick:number; at:number;
  cameraX:number; cameraY:number; zoom:number; aimX:number; aimY:number;
  width:number; height:number; hudZoom:number; configuration:number;
}
export interface LanRealtimePacket { generation:number; serial:number; frame:LanRealtimeFrame|null }
export interface LanRealtimeReceipt { generation:number; serial:number }
const fields = ['frame','tick','at','cameraX','cameraY','zoom','aimX','aimY','width','height','hudZoom','configuration'] as const;
const values = fields.length + 2; // generation and validity, followed by frame scalars
export const LAN_REALTIME_BYTES = 8 + values * 8;
const integer = (n:number, min=0) => Number.isSafeInteger(n) && n >= min;
export function copyRealtimeFrame(frame:LanRealtimeFrame):LanRealtimeFrame {
  if (!frame || !fields.every(key=>Number.isFinite(frame[key])) || !integer(frame.frame,1) || !integer(frame.tick)
    || !integer(frame.configuration) || !integer(frame.width,1) || !integer(frame.height,1)
    || frame.at<0 || frame.zoom<=0 || frame.hudZoom<=0) throw Error('Invalid realtime display sample');
  return {frame:frame.frame,tick:frame.tick,at:frame.at,cameraX:frame.cameraX,cameraY:frame.cameraY,zoom:frame.zoom,
    aimX:frame.aimX,aimY:frame.aimY,width:frame.width,height:frame.height,hudZoom:frame.hudZoom,configuration:frame.configuration};
}
/** Single Worker writer, main reader. Each Float64 travels as two atomic Int32
 * words under one version lock; no unsynchronized shared floating-point loads.
 * Only the Worker writes. Main resets fence by generation, never race this lock. */
export class LanRealtimeMailbox {
  private readonly shared:Int32Array;
  private readonly scratch=new ArrayBuffer(values*8);
  private readonly words=new Int32Array(this.scratch);
  private readonly numbers=new Float64Array(this.scratch);
  constructor(readonly buffer:SharedArrayBuffer){
    if(typeof SharedArrayBuffer!=='function'||!(buffer instanceof SharedArrayBuffer)||buffer.byteLength!==LAN_REALTIME_BYTES)
      throw Error('Invalid realtime mailbox');
    this.shared=new Int32Array(buffer);
  }
  write(generation:number,frame:LanRealtimeFrame|null):void {
    if(!integer(generation,1))throw Error('Invalid realtime generation');
    const value=frame?copyRealtimeFrame(frame):null;
    this.numbers[0]=generation;this.numbers[1]=value?1:0;
    for(let i=0;i<fields.length;i++)this.numbers[i+2]=value?value[fields[i]]:0;
    // Two increments also work when the signed Int32 version wraps. A reader
    // cannot accept an odd/in-progress version, or an intervening write.
    Atomics.add(this.shared,0,1);
    for(let i=0;i<this.words.length;i++)Atomics.store(this.shared,i+2,this.words[i]);
    Atomics.add(this.shared,0,1);
  }
  read(generation:number):LanRealtimeFrame|null {
    if(!integer(generation,1))return null;
    for(let attempt=0;attempt<4;attempt++){
      const before=Atomics.load(this.shared,0);if(before&1)continue;
      for(let i=0;i<this.words.length;i++)this.words[i]=Atomics.load(this.shared,i+2);
      if(Atomics.load(this.shared,0)!==before)continue;
      if(this.numbers[0]!==generation||this.numbers[1]!==1)return null;
      const n=this.numbers;
      return copyRealtimeFrame({frame:n[2],tick:n[3],at:n[4],cameraX:n[5],cameraY:n[6],zoom:n[7],aimX:n[8],aimY:n[9],
        width:n[10],height:n[11],hudZoom:n[12],configuration:n[13]});
    }
    return null; // Contention is not a reason to block the input/UI thread.
  }
}
/** One in-flight scalar message plus one latest sample. Shared mode emits no
 * frame messages. A stopped main thread cannot accumulate a render-frame queue. */
export class LanRealtimePublisher {
  private generation=0;
  private serial=0;
  private pending:LanRealtimeReceipt|null=null;
  private latest:LanRealtimeFrame|null=null;
  private dirty=false;
  private closed=false;
  constructor(private readonly mailbox:LanRealtimeMailbox|null,private readonly send:(packet:LanRealtimePacket)=>void){}
  get stats(){return {shared:!!this.mailbox,pending:!!this.pending,dirty:this.dirty,generation:this.generation,serial:this.serial};}
  reset(generation:number):void{
    if(this.closed||!integer(generation,1)||generation<=this.generation)throw Error('Invalid realtime reset');
    this.generation=generation;this.pending=null;this.latest=null;this.dirty=false;this.publish(null);
  }
  publish(frame:LanRealtimeFrame|null):void{
    if(this.closed||!this.generation)return;
    if(this.mailbox){this.mailbox.write(this.generation,frame);return;}
    this.latest=frame?copyRealtimeFrame(frame):null;this.dirty=true;this.flush();
  }
  private flush():void{
    if(this.closed||this.pending||!this.dirty)return;
    if(!integer(this.serial+1,1))throw Error('Realtime publication sequence exhausted');
    const packet={generation:this.generation,serial:++this.serial,frame:this.latest};
    this.pending={generation:packet.generation,serial:packet.serial};this.dirty=false;
    this.send(packet);
  }
  complete(receipt:LanRealtimeReceipt):boolean{
    if(this.closed||!this.pending||receipt.generation!==this.generation||receipt.serial!==this.pending.serial)return false;
    this.pending=null;this.flush();return true;
  }
  close():void{
    if(this.closed)return;
    if(this.generation)this.mailbox?.write(this.generation,null);
    this.closed=true;this.pending=null;this.latest=null;this.dirty=false;
  }
}
