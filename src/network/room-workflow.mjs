import { roomDeploymentBlockReason } from './room-deployment.mjs';
import { roomStartBlockReason } from './room-start.mjs';

/** Preview the real configure semantics: applying clears everyone's ready flag. */
export function roomApplyAction(room, id, draft) {
  if (room.hostId !== id) return { label: '应用并准备', continueToAction: true, hint: '先确认配装，再自动准备；不会替其他玩家准备。' };
  const members = room.members.map(member => ({ ...member, ready: false,
    ...(member.id === id ? { editing: false, hull: draft.hullId, design: draft } : {}) }));
  const blocked = roomStartBlockReason({ ...room, members, aiHulls: room.options.aiHulls });
  return blocked
    ? { label: '应用配装', continueToAction: false, hint: '应用后不会自动开战。' + blocked }
    : { label: '应用并开始', continueToAction: true, hint: '服务器确认配装后开始战斗。' };
}

export function roomWorkflow(room, id) {
  const guests = room.members.filter(member => member.id !== room.hostId);
  const occupied = new Set([...room.members.map(member => member.team),
    ...room.options.aiHulls.flatMap((hulls, team) => hulls.length ? [team] : [])]);
  const ready = guests.filter(member => member.ready && member.connected && !member.editing).length;
  const me = room.members.find(member => member.id === id);
  return {
    ready, guests: guests.length, offline: room.members.some(member => !member.connected),
    deploymentBlocked: !!roomDeploymentBlockReason(room.members, room.options), opponentsMissing: occupied.size < 2,
    opponentTeam: room.options.assignment === 'solo' ? 0 : room.options.aiHulls.findIndex((_, team) => !occupied.has(team)),
    editing: room.members.filter(member => member.editing).map(member => member.name),
    blocked: roomStartBlockReason({ ...room, aiHulls: room.options.aiHulls }),
    ownReady: !!me?.ready && !!me.connected && !me.editing,
  };
}

/** Wait for the requested room state, not a successful socket write. No automatic retries. */
export function submitRoomAction(connection, roomCode, id, action, signal) {
  return new Promise((resolve, reject) => {
    if (!connection.ready || signal?.aborted) { reject(Error('连接尚未就绪，请等待重连')); return; }
    // Ordinary HTTP LAN origins do not expose randomUUID; getRandomValues works there.
    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    let done = false;
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    };
    const aborted = () => finish(Error('操作已取消'));
    const unsubscribe = connection.subscribe(message => {
      if (message.type === 'room' && message.room.code === roomCode) {
        const room = message.room, me = room.members.find(member => member.id === id);
        if (!me) finish(Error('你已不在原房间中'));
        else if (action.type === 'ready' && ['lobby', 'ended'].includes(room.status) && me.ready === action.ready && (action.ready !== true || !me.editing)) finish();
        else if (action.type === 'start' && ['loading', 'running'].includes(room.status) && room.match?.hostId === id) finish();
      } else if (message.type === 'error' && message.requestId === requestId) finish(Error(message.message));
      else if (['reconnecting', 'disconnected', 'roomClosed', 'left'].includes(message.type)) finish(Error('连接或房间状态已改变，请确认当前状态后重试'));
    });
    const timer = setTimeout(() => finish(Error('未收到服务器确认，请检查当前房间状态后重试')), 10000);
    signal?.addEventListener('abort', aborted, { once: true });
    if (!connection.send({ ...action, requestId })) finish(Error('操作未能发送，请等待重连'));
  });
}
