// Importing this entry on the main thread is inert, allowing the existing
// dependency-graph packagers to copy this runtime file without bundling it.
import {isMainThread,parentPort,workerData} from 'node:worker_threads';
import {SnapshotPrepareState} from './snapshot-prepare-state.mjs';
export const SNAPSHOT_PREPARE_WORKER_URL=new URL('./snapshot-prepare-worker.mjs',import.meta.url);
export const SNAPSHOT_PREPARE_WORKER_KIND='steam-snapshot-prepare-v1';
if(!isMainThread&&workerData?.kind===SNAPSHOT_PREPARE_WORKER_KIND){
 const state=new SnapshotPrepareState();
 parentPort.on('message',message=>{
  try{const {response,transfer}=state.handle(message);parentPort.postMessage(response,transfer);}
  catch{parentPort.postMessage({op:'fault',reason:'prepare-transaction-failed'});}
 });
 parentPort.postMessage({op:'ready'});
}
