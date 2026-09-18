import { useEffect, useRef, useState } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { MotionPresence } from '../ui/core/MotionPresence';
import { createDesign, data } from '../studio/DesignModel';
import type { LanConnection, Room } from './protocol';
import type { AiEditTarget } from './LanAiEditor';
import { groupAiFleet, type AiFleetGroup } from './LanAiGroups';
import { submitAiFleet } from './LanAiSync';
import { LanHullThumbnail } from './LanHullThumbnail';
import { LanLoadoutDetails } from './LanLoadoutDetails';
import { LanTeamRoster } from './LanTeamRoster';
import { LanAiInspection } from './LanAiInspection';
import { useInspectionCodex, type OpenWeaponCodex } from '../studio/useInspectionCodex';
import './lan-room-roster.css';

type QuantityChange = (group: AiFleetGroup, delta: 1 | -1, revision: number) => Promise<void>;

function AiRow({ group, revision, host, disabled, change, onEdit, onView, onOpenCodex }: {
  group: AiFleetGroup; revision: number; host: boolean; disabled: boolean;
  onOpenCodex: OpenWeaponCodex; change: QuantityChange; onEdit: (group: AiFleetGroup) => void; onView: (group: AiFleetGroup) => void;
}) {
  const [removing, setRemoving] = useState<number | null>(null);
  const name = data.ships[group.hull]?.name ?? group.hull;
  return <article className="lan-room-ai-row" data-loadout-key={group.loadoutKey} aria-label={'AI ' + name + ' ' + group.name}>
    <LanAiInspection entry={{...group, defaultLoadout:true}} onOpenCodex={onOpenCodex}><button type="button" className="lan-room-ai-inspect" aria-label={'查看 AI ' + group.name + '的配装'} onClick={() => onView(group)}>
      <LanHullThumbnail hull={group.hull} name={name}/>
    </button></LanAiInspection>
    <LanAiInspection entry={{...group, defaultLoadout:true}} onOpenCodex={onOpenCodex}><div className="lan-room-ai-identity"><strong>{name} <small>AI</small></strong><span>{group.name}</span></div></LanAiInspection>
    <span className="lan-room-ai-count" aria-label={group.count + ' 艘'}>×{group.count}</span>
    {host && <div className="lan-room-ai-actions">
      <NativeButton disabled={disabled} title={group.count === 1 ? '移除最后一艘（需确认）' : '减少一艘'} aria-label={(group.count === 1 ? '移除最后一艘 AI ' : '减少一艘 AI ') + group.name}
        onClick={() => { if (group.count === 1) setRemoving(revision); else void change(group, -1, revision); }}>−</NativeButton>
      <NativeButton disabled={disabled} title="增加一艘" aria-label={'增加一艘 AI ' + group.name} onClick={() => void change(group, 1, revision)}>＋</NativeButton>
      <NativeButton disabled={disabled} onClick={() => onEdit(group)}>{group.count === 1 ? '改装' : '整组改装'}</NativeButton>
    </div>}
    {host && removing === revision && <div className="lan-room-ai-remove" role="group" aria-label="移除最后一艘确认">
      <span>移除最后一艘「{group.name}」？</span>
      <NativeButton disabled={disabled} onClick={() => void change(group, -1, revision)}>确认移除</NativeButton>
      <button type="button" onClick={() => setRemoving(null)}>取消</button>
    </div>}
  </article>;
}

/** One scrollable roster and one acknowledged transaction at a time, for every team. */
export function LanRoomRoster({ room, id, editable, connection, onEdit, onEditAi, onAddAi, send, onBusyChange, collapsed, onToggleTeam, readScroll, onScroll }: {
  room: Room; id: string; editable: boolean; connection: LanConnection;
  onEdit: () => void; onEditAi: (target: AiEditTarget) => void; onAddAi: (team: number) => void;
  send: (message: unknown) => void; onBusyChange: (busy: boolean) => void;
  collapsed: ReadonlySet<number>; onToggleTeam: (team: number) => void; readScroll: () => number; onScroll: (top: number) => void;
}) {
  const codex = useInspectionCodex();
  const host = room.hostId === id, groups = groupAiFleet(room.options);
  const [pending, setPending] = useState(false), busy = useRef(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [viewing, setViewing] = useState<AiFleetGroup | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); abort.current = controller;
    return () => { controller.abort(); onBusyChange(false); };
  }, [onBusyChange]);
  const disabled = !editable || pending;
  const change: QuantityChange = async (group, delta, revision) => {
    if (!host || !editable || busy.current) return;
    busy.current = true; setPending(true); onBusyChange(true); setError(''); setNotice('');
    try {
      await submitAiFleet(connection, room.code, room.options, {
        assignment: room.options.assignment, team: group.team ?? 0, hull: group.loadoutKey, baseRevision: revision,
        ...(group.count === 1 && delta === -1 ? { operation: 'remove' } : { operation: 'adjust', count: delta }),
      }, abort.current?.signal);
      setNotice((delta === 1 ? '已增加 1 艘' : '已移除 1 艘') + ' · 服务器已确认');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法调整 AI 数量'); }
    finally { busy.current = false; setPending(false); onBusyChange(false); }
  };
  const edit = (group: AiFleetGroup) => {
    if (!host || disabled || busy.current) return;
    try {
      onEditAi({ returnToRoster: true, design: group.design ?? createDesign(group.hull), hull: group.loadoutKey, scope: 'group', count: group.count,
        team: group.team ?? 0, assignment: room.options.assignment, baseRevision: room.options.aiRevision ?? 0 });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法改装此舰船'); }
  };
  return <div className="lan-room-roster" aria-busy={pending}>
    <div className="lan-room-roster-bar"><strong>参战舰船</strong><span>真人 {room.members.length} · AI {groups.reduce((sum, group) => sum + group.count, 0)}</span></div>
    {(pending || error || notice) && <p className="lan-room-roster-feedback" role={error ? 'alert' : 'status'} data-error={!!error}>
      <span>{pending ? '正在确认 AI 编成…' : error || notice}</span>
      {!pending && <button type="button" aria-label="关闭编成提示" onClick={() => { setError(''); setNotice(''); }}>×</button>}
    </p>}
    <LanTeamRoster room={room} id={id} editable={!disabled} onEdit={onEdit} onAddAi={onAddAi} send={send}
      collapsed={collapsed} onToggleTeam={onToggleTeam} readScroll={readScroll} onScroll={onScroll}
      renderAi={team => groups.filter(group => group.team === team).map(group => <AiRow key={group.key} group={group}
        revision={room.options.aiRevision ?? 0} host={host} disabled={disabled} change={change} onEdit={edit} onView={setViewing} onOpenCodex={codex.open}/>)}/>
    {codex.content}
    <MotionPresence>{viewing && <LanLoadoutDetails member={viewing} returnLabel="返回舰船列表" onClose={() => setViewing(null)}/>}</MotionPresence>
  </div>;
}
