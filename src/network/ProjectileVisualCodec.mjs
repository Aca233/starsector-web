import {ProjectileEventSender,ProjectileEventReceiver} from './ProjectileEventStream.mjs';
import {PROJECTILE_VISUAL_FIELDS} from './ProjectileVisualProjection.mjs';
import {PROJECTILE_VISUAL_COLUMNS,packProjectileVisual,unpackProjectileVisual,validateVisualColumns} from './ProjectileVisualColumns.mjs';
const dynamic=new Set(PROJECTILE_VISUAL_COLUMNS.map(c=>c[0]));
const appearanceKeys=new Set(PROJECTILE_VISUAL_FIELDS.filter(k=>k!=='id'&&k!=='specId'&&!dynamic.has(k)));
function validate(frame){
 for(const row of frame.rows){
  if(Object.keys(row).length!==4||!Object.hasOwn(row,'id')||!Object.hasOwn(row,'specId')||!Object.hasOwn(row,'pose')||!Object.hasOwn(row,'appearance')||!row.appearance||Array.isArray(row.appearance)||typeof row.appearance!=='object'||Object.keys(row.appearance).some(k=>!appearanceKeys.has(k)))throw Error('Invalid visual projection');
  validateVisualColumns(row.pose);
 }
}
/** SVP1: explicit, ordered visual-only protocol, distinct from exact SPE1. Every
 * target integer column is recovered and CRC-checked; the only loss is the
 * documented initial DISPLAY quantization. No collision or local authority. */
export class ProjectileVisualSender {
 #sender;#epoch;
 constructor(epoch){this.#epoch=epoch;this.#sender=new ProjectileEventSender(epoch,{visualColumns:true});}
 reset(epoch){this.#epoch=epoch;this.#sender.reset(epoch);}
 fork(){const child=new ProjectileVisualSender(this.#epoch);child.#sender=this.#sender.fork();return child;}
 prepare({tick,time,rows}){
  if(!Array.isArray(rows)||rows.length>4096)throw Error('Invalid visual entities');
  return this.#sender.prepare({tick,time,rows:rows.map(packProjectileVisual)});
 }
 commit(choice){return this.#sender.commit(choice);}
 stats(){return this.#sender.stats();}
}
export class ProjectileVisualReceiver {
 #receiver;#epoch;
 constructor(epoch){this.#epoch=epoch;this.#receiver=new ProjectileEventReceiver(epoch,{validate});}
 reset(epoch){this.#epoch=epoch;this.#receiver.reset(epoch);}
 fork(){const child=new ProjectileVisualReceiver(this.#epoch);child.#receiver=this.#receiver.fork();return child;}
 receive(value){
  const b=value instanceof Uint8Array?value:value instanceof ArrayBuffer?new Uint8Array(value):null;
  if(!b||b.length<4||new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0)!==0x53565031)throw Error('Expected SVP1 visual stream');
  const frame=this.#receiver.receive(b);
  return Object.freeze({...frame,rows:Object.freeze(frame.rows.map(row=>Object.freeze(unpackProjectileVisual(row))))});
 }
 stats(){return this.#receiver.stats();}
}
