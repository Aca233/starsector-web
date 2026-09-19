// v012 GetConnectionRealTimeStatus reader. Binding is inert and read-only.
// The lifecycle owner must validate its CURRENT native tag/identity immediately
// before passing an owned interface/handle; this reader does not own connections.
export const SOCKET_STATUS_ABI = Object.freeze({connectionBytes:120,laneBytes:64,laneCount:3});
const unavailable=reason=>({available:false,reason});
const count=value=>Number.isInteger(value)&&value>=0;
const quality=value=>Number.isFinite(value)&&value>=0&&value<=1?value:null;
const rate=value=>Number.isFinite(value)&&value>=0&&value<=0x7fffffff?value:null;
function queueMs(buffer,offset){const value=buffer.readBigInt64LE(offset);return value>=0n&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value)/1000:null;}
export function decodeSocketStatus(connection,lanes){
 if(!Buffer.isBuffer(connection)||connection.length!==120||!Buffer.isBuffer(lanes)||lanes.length!==192)return unavailable('invalid-status-buffer');
 if(connection.readInt32LE(0)!==3)return unavailable('connection-not-connected');
 const ping=connection.readInt32LE(4),sendRate=connection.readInt32LE(32),pendingUnreliable=connection.readInt32LE(36),pendingReliable=connection.readInt32LE(40),unackedReliable=connection.readInt32LE(44);
 if(ping < -1||!count(sendRate)||![pendingUnreliable,pendingReliable,unackedReliable].every(count))return unavailable('invalid-status-counters');
 const result=[];
 for(let lane=0;lane<3;lane++){
  const start=lane*64,unreliable=lanes.readInt32LE(start),reliable=lanes.readInt32LE(start+4),unacked=lanes.readInt32LE(start+8);
  if(![unreliable,reliable,unacked].every(count))return unavailable('invalid-lane-counters');
  result.push({lane,pendingUnreliable:unreliable,pendingReliable:reliable,pendingBytes:unreliable+reliable,unackedReliable:unacked,queueMs:queueMs(lanes,start+16)});
 }
 // With multiple lanes, the CONNECTION queue time is explicitly invalid per
 // SDK v1.63. Never use connection@48 for pacing; only lane@16 is meaningful.
 // Don't force totals to equal lane sums; if a sample disagrees, the larger
 // bound is conservative. Native reliable pending can include retransmits.
 return {available:true,pingMs:ping<0?null:ping,sendRateBytesPerSecond:sendRate||null,
  outBytesPerSecond:rate(connection.readFloatLE(20)),inBytesPerSecond:rate(connection.readFloatLE(28)),
  qualityLocal:quality(connection.readFloatLE(8)),qualityRemote:quality(connection.readFloatLE(12)),
  pendingBytes:Math.max(pendingUnreliable+pendingReliable,result.reduce((sum,lane)=>sum+lane.pendingBytes,0)),
  unackedReliableBytes:Math.max(unackedReliable,result.reduce((sum,lane)=>sum+lane.unackedReliable,0)),lanes:result};
}
export function bindSteamSocketsStatusV012(library){
 const status=library.func('int SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus(void *self, uint32_t connection, void *status, int lanes, void *laneStatus)');
 return (sockets,connection)=>{
  if(typeof sockets!=='bigint'||sockets<=0n||sockets>0xffffffffffffffffn||!Number.isInteger(connection)||connection<1||connection>0xffffffff)return unavailable('invalid-status-handle');
  const summary=Buffer.alloc(120),lanes=Buffer.alloc(192);
  try{if(status(sockets,connection,summary,3,lanes)!==1)return unavailable('native-status-unavailable');return decodeSocketStatus(summary,lanes);}
  catch{return unavailable('native-status-failed');}
 };
}
