import {encodeProjectedSnapshotTape,replaceProjectedTapeSounds} from './BinarySnapshot.mjs';
import {completeEncodeMailbox} from './SnapshotEncodeMailbox.mjs';
/** Only immutable P1 data enters this worker. No engine, input, simulation or
 * network connection lives here. The world stays on its numeric tape: only the
 * small sound batch is reconstructed for the two existing lane histories. */
export function encodeSnapshotJob(job,mailbox) {
 const started=performance.now();
 try {
  const frame=encodeProjectedSnapshotTape(job.tape);
  if(!frame) return completeEncodeMailbox(mailbox,job.id,null,null,performance.now()-started,true);
  const sameSounds=job.network&&job.networkSounds.length===frame.sounds.length&&job.networkSounds.every((s,i)=>s.id===frame.sounds[i].id);
  const display=job.display?frame.bytes:null;
  const network=job.network?(sameSounds?frame.bytes:replaceProjectedTapeSounds(frame,job.networkSounds)):null;
  return completeEncodeMailbox(mailbox,job.id,display,network,performance.now()-started,(job.display&&!display)||(job.network&&!network));
 } catch {return completeEncodeMailbox(mailbox,job.id,null,null,performance.now()-started,true);}
}
