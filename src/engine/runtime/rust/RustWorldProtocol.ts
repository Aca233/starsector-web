/** Read-only world witness. Records carry completed Rust mutations/factories. */
export interface RustWorldIdentity {readonly id:number;readonly generation:number}
export interface RustWorldRecord {readonly tag:number;readonly values:Float64Array}
export interface RustWorldSnapshot {
  readonly version:1;readonly player:RustWorldIdentity;readonly enemy:RustWorldIdentity;readonly suppressed:boolean;readonly time:number;readonly nextSequence:number;
  readonly stats:{readonly player:Float64Array;readonly enemy:Float64Array};
  readonly losses:readonly{readonly identity:RustWorldIdentity;readonly team:number;readonly time:number;readonly shipName:string;readonly hullName:string}[];
  readonly explosions:readonly RustWorldRecord[];
  readonly terrain:{readonly ships:readonly RustWorldRecord[];readonly active:readonly RustWorldIdentity[];readonly nebulae:readonly RustWorldRecord[];readonly asteroids:readonly RustWorldRecord[];readonly hulks:readonly RustWorldRecord[];readonly sequences:readonly RustWorldRecord[]};
  readonly particleLives:Float64Array;readonly shipDefinitions:readonly RustWorldRecord[];readonly records:readonly RustWorldRecord[];
  readonly deliveries:readonly RustWorldRecord[];readonly projectiles:readonly RustWorldRecord[];readonly beams:readonly RustWorldRecord[];
  readonly floating:readonly RustWorldRecord[];
  readonly gravity?:{readonly header:RustWorldRecord;readonly systems:readonly RustWorldRecord[];readonly mounts:readonly RustWorldRecord[];readonly projectiles:readonly RustWorldRecord[]};
  readonly aux?:RustWorldRecord;
}
class Reader {
  private offset=0;
  constructor(readonly data:Float64Array,readonly context='world'){}
  n():number {if(this.offset>=this.data.length)throw Error('Truncated Rust world record');const n=this.data[this.offset++];if(!Number.isFinite(n))throw Error('Nonfinite Rust world field');return n;}
  sourceFlux():number {if(this.offset>=this.data.length)throw Error('Truncated Rust source flux');const n=this.data[this.offset++];if(!Number.isFinite(n)&&!Number.isNaN(n))throw Error('Invalid Rust source flux');return n;}
  record(n:number):Float64Array{if(this.offset+n>this.data.length)throw Error('Truncated Rust world record');const out=this.data.subarray(this.offset,this.offset+n);this.offset+=n;return out;}
  integer(max=Number.MAX_SAFE_INTEGER,min=0):number{const n=this.n();if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Invalid Rust '+this.context+' integer at '+(this.offset-1)+': '+n);return n;}
  flag():boolean{return this.integer(1)===1;}
  identity():RustWorldIdentity{const id=this.n(),generation=this.integer(0xffff_ffff,1);return{id,generation};}
  skipIdentity():void{this.n();this.integer(0xffff_ffff,1);}
  optionalIdentity():void{const present=this.flag(),id=this.n(),g=this.integer(0xffff_ffff);if(present?g===0:!!(id||g))throw Error('Invalid optional Rust world identity');}
  count(width=1):number{const n=this.integer();if(n*width>this.data.length-this.offset)throw Error('Rust world count exceeds record');return n;}
  identities():RustWorldIdentity[]{return Array.from({length:this.count(2)},()=>this.identity());}
  skipIdentities():void{for(let n=this.count(2);n>0;n--)this.skipIdentity();}
  string():string{const units=Array.from({length:this.count()},()=>this.integer(65535));let value='';for(let i=0;i<units.length;i+=4096)value+=String.fromCharCode(...units.slice(i,i+4096));return value;}
  skipString():void{for(let n=this.count();n>0;n--)this.integer(65535);}
  skipNumbers(n:number):void{for(let i=0;i<n;i++)this.n();}
  numbers(n:number):Float64Array{const start=this.offset;this.skipNumbers(n);return this.data.subarray(start,this.offset);}
  points():void{this.skipNumbers(this.count(2)*2);}
  slots():void{for(let i=this.count(3);i>0;i--){this.integer(0xffff_ffff);this.skipNumbers(2);}}
  finish():void{if(this.offset!==this.data.length)throw Error('Trailing Rust world fields');}
}
function spec(r:Reader):void{r.skipNumbers(4);r.integer(5);r.flag();}
function payload(r:Reader):void{r.skipIdentity();r.integer(0xffff_ffff);r.flag();r.integer(0xffff_ffff);r.flag();r.flag();r.n();r.integer(3);r.flag();r.skipNumbers(8);for(let i=0;i<5;i++)r.flag();r.optionalIdentity();r.flag();r.optionalIdentity();r.skipIdentities();
  if(r.flag()){r.integer(0xffff_ffff);r.integer(0xffff_ffff,1);r.integer(3);r.skipNumbers(10);r.sourceFlux();r.flag();}}
function delivery(r:Reader):void{r.skipNumbers(20);if(r.flag())spec(r);if(r.flag()){r.skipNumbers(2);r.flag();r.n();if(r.flag())spec(r);}for(let i=0;i<4;i++)r.flag();if(r.flag())r.skipNumbers(3);
  r.skipNumbers(5);r.flag();r.n();r.flag();for(let i=0;i<8;i++)r.integer(255);if(r.flag()){r.n();for(let i=0;i<3;i++)r.integer(255);r.flag();}r.integer(3);r.flag();r.skipString();for(let i=0;i<3;i++)r.integer(255);r.flag();r.n();
  r.flag();r.flag();r.flag();r.n();r.flag();r.n();if(r.flag())r.skipString();}
function optionalNumber(r:Reader):void{if(r.flag())r.n();}
function gravityTarget(r:Reader):void{r.integer(3);r.skipIdentity();}
function gravityTargets(r:Reader):void{if(r.flag())for(let i=r.count(3);i>0;i--)gravityTarget(r);}
function gravitySystem(r:Reader):void{r.skipIdentity();r.integer(0xffff_ffff);r.integer(8);r.skipString();
  if(r.flag()){r.integer(2);optionalNumber(r);optionalNumber(r);r.skipNumbers(7);r.integer();r.integer();}
  if(r.flag()){r.skipNumbers(3);r.integer();}if(r.flag())r.skipNumbers(3);if(r.flag())r.skipNumbers(6);if(r.flag())r.skipNumbers(4);
  if(r.flag()){r.skipNumbers(7);if(r.flag())r.skipIdentity();optionalNumber(r);}
  if(r.flag()){r.integer(2);for(let i=0;i<4;i++)optionalNumber(r);r.skipNumbers(3);optionalNumber(r);r.skipNumbers(3);optionalNumber(r);r.skipIdentities();r.skipIdentities();gravityTargets(r);gravityTargets(r);optionalNumber(r);}
  if(r.flag())r.skipNumbers(3);if(r.flag()){if(r.flag())gravityTarget(r);r.skipNumbers(6);r.skipString();}optionalNumber(r);r.flag();
}
function gravityMount(r:Reader):void{r.skipIdentity();r.integer(0xffff_ffff);r.skipString();if(r.flag()){r.skipNumbers(8);r.flag();optionalNumber(r);optionalNumber(r);}if(r.flag())r.skipNumbers(4);
  if(r.flag()){r.integer(2);optionalNumber(r);if(r.flag())gravityTarget(r);r.skipNumbers(6);optionalNumber(r);r.flag();r.skipString();optionalNumber(r);}
  r.flag();r.flag();r.skipNumbers(2);r.flag();r.skipNumbers(6);r.flag();r.skipNumbers(2);r.flag();if(r.flag())r.skipNumbers(3);
}
function validateOutput(tag:number,r:Reader):void{
  const fixed:Record<number,number>={100:5,101:4,103:1,104:3,106:2,200:7,201:6,202:3,203:4,204:7,205:8,206:6,207:8,208:5,209:2,210:0,211:2,212:1,213:1,214:2,300:6,301:6,302:4,303:2,304:2,305:1,500:8,501:4,502:14,503:6,504:4};
  if(Object.hasOwn(fixed,tag)){r.skipNumbers(fixed[tag]);return;}
  if(tag===102){r.skipNumbers(3);r.skipString();r.skipNumbers(9);r.skipNumbers(9);if(r.flag())r.skipNumbers(7);r.skipNumbers(r.count(8)*8);}
  else if(tag===105)r.skipNumbers(r.count(13)*13);
  else if(tag===107){r.n();r.skipIdentity();r.skipNumbers(7);r.points();for(let i=r.count();i>0;i--)r.integer(0xffff_ffff);if(r.flag())r.skipNumbers(4);}
  else if(tag===108){const id=r.n(),generation=r.integer(0xffff_ffff);if(generation===0&&id!==0)throw Error('Invalid Rust terrain particle source');r.skipNumbers(3);r.skipNumbers(r.count(5)*5);}
  else if(tag===400)r.skipNumbers(r.count(14)*14);
  else if(tag===401){r.skipNumbers(13);r.skipNumbers(r.count(8)*8);}
  else if(tag===505){r.skipNumbers(14);if(r.flag())r.skipNumbers(7);if(r.flag())r.skipNumbers(8);r.skipNumbers(r.count(8)*8);}
  else if(tag===600){r.skipString();r.skipNumbers(3);}
  else if(tag===601)r.skipNumbers(2);
  else if(tag===602)r.skipNumbers(r.count(12)*12);
  else if(tag===603)r.skipNumbers(23);
  else if(tag===604)r.skipNumbers(9);
  else if(tag===605){r.skipNumbers(5);r.skipString();r.skipNumbers(6);}
  else if(tag===606){r.integer(2);r.skipNumbers(r.count(13)*13);}
  else throw Error('Unknown Rust world output '+tag);
}
export function decodeRustWorld(data:Float64Array,detached=false):RustWorldSnapshot|undefined {
  if(!data.length)return;
  const block=new Reader(detached?data:data.slice());if(block.integer()!==1)throw Error('Rust world version differs');const count=block.count(2);
  let header:{player:RustWorldIdentity;enemy:RustWorldIdentity;suppressed:boolean;time:number;nextSequence:number}|undefined;
  let stats:RustWorldSnapshot['stats']|undefined,particleLives:Float64Array|undefined,active:RustWorldIdentity[]|undefined;
  const losses:RustWorldSnapshot['losses'][number][]=[],explosions:RustWorldRecord[]=[],ships:RustWorldRecord[]=[],asteroids:RustWorldRecord[]=[],hulks:RustWorldRecord[]=[],nebulae:RustWorldRecord[]=[],sequences:RustWorldRecord[]=[],shipDefinitions:RustWorldRecord[]=[],records:RustWorldRecord[]=[];
  const deliveries:RustWorldRecord[]=[],projectiles:RustWorldRecord[]=[],beams:RustWorldRecord[]=[],floating:RustWorldRecord[]=[];
  let gravityHeader:RustWorldRecord|undefined;const gravitySystems:RustWorldRecord[]=[],gravityMounts:RustWorldRecord[]=[],gravityProjectiles:RustWorldRecord[]=[];
  let aux:RustWorldRecord|undefined;
  for(let i=0;i<count;i++){
    const tag=block.integer(),size=block.count(),values=block.record(size),r=new Reader(values,'world tag '+tag),record={tag,values};
    if(tag===0){if(header)throw Error('Duplicate Rust world header');header={player:r.identity(),enemy:r.identity(),suppressed:r.flag(),time:r.n(),nextSequence:r.integer(0xffff_ffff)};}
    else if(tag===1){if(stats)throw Error('Duplicate Rust world statistics');stats={player:r.numbers(18),enemy:r.numbers(18)};}
    else if(tag===2)losses.push({identity:r.identity(),team:r.integer(0xffff_ffff),time:r.n(),shipName:r.string(),hullName:r.string()});
    else if(tag===3){payload(r);spec(r);r.skipNumbers(3);for(let n=r.count(8);n>0;n--){r.skipIdentity();r.skipNumbers(3);r.flag();r.integer(0xffff_ffff);r.n();}r.skipIdentities();r.skipIdentities();r.skipIdentities();explosions.push(record);}
    else if(tag===4){r.skipIdentity();r.integer(0xffff_ffff);r.integer(0xffff_ffff,1);r.n();r.flag();r.skipNumbers(2);r.flag();r.flag();r.skipString();if(r.flag()){r.skipIdentity();r.skipNumbers(3);r.flag();}r.skipIdentities();r.slots();ships.push(record);}
    else if(tag===5){if(active)throw Error('Duplicate Rust world active roster');active=r.identities();}
    else if(tag===6){r.integer(0xffff_ffff);r.skipString();r.skipNumbers(3);r.integer(0xffff_ffff);r.integer(0xffff_ffff);nebulae.push(record);}
    else if(tag===7){r.skipIdentity();r.skipNumbers(10);r.integer(0xffff_ffff);r.flag();asteroids.push(record);}
    else if(tag===8){r.n();r.skipIdentity();r.flag();r.integer(5);r.skipNumbers(11);r.flag();r.integer(0xffff_ffff);r.flag();r.flag();r.points();if(r.flag())r.points();r.slots();hulks.push(record);}
    else if(tag===9){r.integer(0xffff_ffff,1);r.integer(Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER);r.skipNumbers(3);sequences.push(record);}
    else if(tag===10){if(particleLives)throw Error('Duplicate Rust world particle occupancy');particleLives=r.numbers(size);}
    else if(tag===12){r.integer(0xffff_ffff);r.integer(0xffff_ffff);r.integer(0xffff_ffff,1);r.flag();r.skipNumbers(6);r.flag();r.integer(5);r.skipNumbers(3);for(let k=0;k<9;k++)r.integer(255);for(let k=0;k<4;k++)r.skipString();r.points();r.slots();if(r.flag())r.skipNumbers(6);shipDefinitions.push(record);}
    else if(tag===13){r.integer(0xffff_ffff);r.integer(0xffff_ffff);r.integer(0xffff_ffff,1);r.integer(0xffff_ffff);r.flag();delivery(r);deliveries.push(record);}
    else if(tag===14){r.integer(Number.MAX_SAFE_INTEGER,1);r.flag();r.n();r.flag();r.flag();r.integer(0xffff_ffff);r.integer(0xffff_ffff);for(let k=0;k<3;k++)r.skipNumbers(r.count());r.skipIdentities();r.optionalIdentity();r.flag();projectiles.push(record);}
    else if(tag===15){r.integer(Number.MAX_SAFE_INTEGER,1);r.flag();r.flag();r.skipNumbers(3);r.flag();r.flag();r.skipNumbers(2);r.flag();r.flag();r.skipNumbers(4);for(let i=0;i<8;i++)r.integer(255);beams.push(record);}
    else if(tag===16){r.skipNumbers(5);r.skipString();r.skipNumbers(6);floating.push(record);}
    else if(tag===17){if(gravityHeader)throw Error('Duplicate Rust gravity header');r.integer(0xffff_ffff);for(let n=r.count(4);n>0;n--){r.integer(3,2);r.n();r.skipIdentity();}
      for(let k=0;k<2;k++)for(let n=r.count(2);n>0;n--){r.skipString();r.integer(0xffff_ffff);}if(r.flag())for(let n=r.count(2);n>0;n--){r.integer(0x10ffff);r.integer(0xffff_ffff);}gravityHeader=record;}
    else if(tag===18){gravitySystem(r);gravitySystems.push(record);}
    else if(tag===19){gravityMount(r);gravityMounts.push(record);}
    else if(tag===20){r.skipIdentity();if(r.flag()){r.integer(0xffff_ffff);r.skipIdentity();}if(r.flag())r.skipIdentity();for(let k=0;k<3;k++)r.flag();if(r.flag()){r.skipIdentity();r.skipNumbers(3);}gravityProjectiles.push(record);}
    else if(tag===21){if(aux||r.integer()!==1)throw Error('Invalid Rust aux publication');for(let n=r.count(23);n>0;n--){r.integer(Number.MAX_SAFE_INTEGER,1);r.n();r.integer(2,1);r.skipIdentity();r.integer(0xffff_ffff);r.flag();r.flag();r.skipNumbers(7);r.flag();r.n();r.flag();r.skipNumbers(5);}
      for(let n=r.count(6);n>0;n--){r.skipNumbers(3);for(let i=0;i<3;i++)r.integer();}
      if(r.flag()){r.skipIdentity();r.integer(2,1);r.n();for(let n=r.count(5);n>0;n--){r.skipNumbers(2);r.skipIdentity();r.n();}}aux=record;}
    else {validateOutput(tag,r);records.push(record);}
    r.finish();
  }
  block.finish();if(!header||!stats||!active||!particleLives)throw Error('Incomplete Rust world publication');if(losses.length>64)throw Error('Rust world loss limit differs');
  const key=(id:number,generation:number)=>id+':'+generation;
  const unique=(rows:readonly RustWorldRecord[],index=0)=>{const seen=new Set<string>();for(const row of rows){const k=key(row.values[index],row.values[index+1]);if(seen.has(k))throw Error('Duplicate Rust world identity');seen.add(k);}return seen;};
  const uniqueScalar=(rows:readonly RustWorldRecord[])=>{const seen=new Set<number>();for(const row of rows){if(seen.has(row.values[0]))throw Error('Duplicate Rust world sequence/entity');seen.add(row.values[0]);}};
  const shipIds=unique(ships);unique(asteroids);unique(shipDefinitions,1);uniqueScalar(hulks);uniqueScalar(sequences);
  const activeIds=new Set<string>();for(const i of active){const k=key(i.id,i.generation);if(!shipIds.has(k)||activeIds.has(k))throw Error('Invalid Rust world active identity');activeIds.add(k);}
  for(const h of hulks){if(!shipIds.has(key(h.values[1],h.values[2])))throw Error('Unknown Rust hulk source');}
  uniqueScalar(projectiles);uniqueScalar(beams);
  if(!gravityHeader&&(gravitySystems.length||gravityMounts.length||gravityProjectiles.length))throw Error('Missing Rust gravity ownership');
  for(const rows of [gravitySystems,gravityMounts]){const seen=new Set<string>();for(const row of rows){const k=Array.from(row.values.slice(0,3)).join(':');if(seen.has(k))throw Error('Duplicate Rust gravity slot');seen.add(k);}}
  unique(gravityProjectiles);
  return{version:1,...header,stats,losses,explosions,terrain:{ships,active,nebulae,asteroids,hulks,sequences},particleLives,shipDefinitions,deliveries,projectiles,beams,floating,records,aux,
    gravity:gravityHeader?{header:gravityHeader,systems:gravitySystems,mounts:gravityMounts,projectiles:gravityProjectiles}:undefined};
}
