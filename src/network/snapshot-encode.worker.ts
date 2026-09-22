import {encodeSnapshotJob} from './SnapshotEncodeJob.mjs';
let mailbox: SharedArrayBuffer | null = null;
self.onmessage = ({data:m}) => {
  if (m.type === 'init') { mailbox = m.mailbox; self.postMessage({type:'ready'}); return; }
  if (m.type !== 'encode' || !mailbox) return;
  encodeSnapshotJob(m,mailbox);
  self.postMessage({type:'complete',id:m.id,buffer:m.tape.buffer}, {transfer:[m.tape.buffer]});
};
