import { randomId } from '../shared/RandomId';
import { validateLanDesign } from './LanDesign';
import { aiDesignSignature } from './ai-loadouts.mjs';
import { editAiFleet, type AiFleetEdit } from './room-fleet.mjs';
import { LAN_MAX_OPTIONS_BYTES, LAN_MAX_PLAYERS, type LanConnection, type RoomOptions } from './protocol';
import type { Design } from '../studio/DesignModel';

/** All AI mutations share the same acknowledged, revision-checked transaction. Never auto-retry an add. */
export function submitAiFleet(connection: LanConnection, roomCode: string, options: RoomOptions, edit: AiFleetEdit, signal?: AbortSignal): Promise<Design | null> {
  const command = { ...edit, baseRevision: edit.baseRevision ?? options.aiRevision ?? 0 };
  if (command.design) command.design = validateLanDesign(command.design);
  editAiFleet(options, command, LAN_MAX_OPTIONS_BYTES, LAN_MAX_PLAYERS);
  return new Promise((resolve, reject) => {
    if (!connection.ready || signal?.aborted) { reject(Error('连接未就绪，未提交修改')); return; }
    const requestId = randomId();
    let done = false;
    const finish = (error?: Error, accepted: Design | null = null) => {
      if (done) return;
      done = true; clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(accepted);
    };
    const cancel = () => finish(Error('提交未确认；请检查实际编成后再操作，草稿已保留'));
    const unsubscribe = connection.subscribe(message => {
      if (message.type === 'ai-configured' && message.requestId === requestId) {
        try {
          if (message.roomCode !== roomCode || !Number.isSafeInteger(message.revision) || message.revision <= command.baseRevision)
            throw Error('AI 编成确认不匹配，请检查实际编成后再操作');
          const accepted = command.design ? validateLanDesign(message.design) : null;
          if (command.design && aiDesignSignature(accepted) !== aiDesignSignature(command.design))
            throw Error('AI 配装确认不匹配，请检查实际编成后再操作');
          finish(undefined, accepted);
        } catch (error) { finish(error instanceof Error ? error : Error('AI 编成确认无效')); }
      } else if (message.type === 'error' && message.requestId === requestId) finish(Error(message.message));
      else if (['reconnecting', 'disconnected', 'roomClosed', 'left', 'match'].includes(message.type)) cancel();
    });
    const timer = setTimeout(() => finish(Error('未收到服务器确认。请先检查实际编成，不要重复添加；草稿已保留')), 10000);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (!connection.send({ type: 'ai', requestId, roomCode, ...command })) finish(Error('发送失败，未提交修改；草稿已保留'));
    } catch { finish(Error('发送失败，请检查实际编成后再操作；草稿已保留')); }
  });
}
