import { MotionPresence } from '../ui/core/MotionPresence';
import { LanCaptainTooltip, LanCaptainPortrait } from './LanCaptainTooltip';
import { useEquipmentHover } from '../studio/useEquipmentHover';
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LanLoadoutDetails } from "./LanLoadoutDetails";
import { NativeButton } from "../ui/NativeChrome";
import { LAN_SHIPS, roomTeams, teamName, teamColor } from "./protocol";
import type { Room } from "./protocol";
import { modManager } from "../engine/modding/ModManager";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";

export function LanTeamRoster({
  room,
  id,
  editable,
  onEdit,
  onAddAi,
  send, renderAi, collapsed, onToggleTeam, readScroll, onScroll,
}: {
  room: Room;
  id: string;
  editable: boolean;
  onEdit: () => void;
  onAddAi?: (team:number) => void;
  send: (message: unknown) => void;
  renderAi: (team: number | null) => ReactNode;
  collapsed: ReadonlySet<number>;
  onToggleTeam: (team: number) => void;
  readScroll: () => number;
  onScroll: (top: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const top = readScroll();
    const restore = () => { if (list.current) list.current.scrollTop = top; };
    restore();
    // The personal footer remeasures after the AI editor unmounts. Restore again
    // once that layout settles, so a temporary scroll range cannot clamp the return position.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(restore); });
    return () => cancelAnimationFrame(frame);
  }, [readScroll]);
  const [inspectedId,setInspectedId] = useState<string | null>(null);
  const inspected = room.members.find(member=>member.id===inspectedId);
  const isHost = room.hostId === id;
  const captainHover = useEquipmentHover();
  const hoveredCaptain = room.members.find(member => member.id === captainHover.active?.id);
  return (
    <div className="lan-teams" ref={list} onScroll={event=>onScroll(event.currentTarget.scrollTop)}>
      {hoveredCaptain && <LanCaptainTooltip member={hoveredCaptain} hover={captainHover} />}
      <MotionPresence>{inspected && <LanLoadoutDetails member={inspected} onClose={()=>setInspectedId(null)} />}</MotionPresence>
      {roomTeams(room.options).filter(team=>room.options.assignment!=="solo"||room.members.some(member=>member.team===team)).map((team) => {
        const folded = collapsed.has(team);
        const humans = room.members.filter((member) => member.team === team);
        return (
          <section
            className="lan-team"
            data-team={team}
            style={{borderColor:teamColor(team)}}
            aria-label={teamName(team)}
            key={team}
          >
            <h3 className="lan-team-heading" style={{color:teamColor(team)}}>
              <button type="button" className="lan-team-toggle" aria-expanded={!folded} aria-label={(folded?'展开':'收起')+teamName(team)} onClick={()=>onToggleTeam(team)}>
                <span><span aria-hidden="true">{folded?'▸':'▾'}</span> {teamName(team)}</span>
                <small>{humans.length} 人{room.options.assignment!=='solo'&&` · ${room.options.aiHulls[team]?.length??0} AI`}</small>
              </button>
              <span className="lan-team-header-actions">
                {isHost&&onAddAi&&room.options.assignment!=='solo'&&<NativeButton aria-label={'为'+teamName(team)+'添加 AI'} title={'为'+teamName(team)+'添加 AI'} disabled={!editable} onClick={()=>onAddAi(team)}>＋AI</NativeButton>}
                {room.options.assignment!=='solo'&&room.members.find(member=>member.id===id)?.team!==team&&<NativeButton aria-label={'加入'+teamName(team)} title="加入此队" disabled={!editable} onClick={()=>send({type:'team',id,team})}>加入</NativeButton>}
              </span>
            </h3>
            {!folded&&<>
            {!humans.length && !room.options.aiHulls[team]?.length && (
              <p className="lan-team-empty">暂无舰船 · 可加入或添加 AI</p>
            )}
            {humans.map((member) => (
              <article
                className="lan-team-member"
                data-local={member.id === id}
                key={member.id}
              >
                <div className="lan-member-identity">
                  <LanCaptainPortrait member={member} hover={captainHover} />
                  <div className="lan-member-heading">
                    <strong>
                      {member.name}
                      {member.id === id ? "（你）" : ""}
                    </strong>
                    <span>{member.id === room.hostId ? "房主" : "玩家"}</span>
                  </div>
                </div>
                <button className="lan-member-ship" aria-label={member.id===id ? "更换我的舰船" : "查看"+member.name+"的配装"} onClick={()=>member.id===id ? onEdit() : setInspectedId(member.id)} disabled={member.id===id&&!editable}>
                  {modManager.getShip(member.hull)&&<img alt="" src={runtimeAssetUrl(modManager.getShip(member.hull)!.spriteUrl)} />}
                </button>
                <p>
                  {member.design ? member.design.name + " · 自定义配装" : (LAN_SHIPS.find((ship) => ship.id === member.hull)?.name ?? member.hull) + "级"} ·{" "}
                  <span className={member.ready ? "lan-ready" : "lan-muted"}>
                    {!member.connected
                      ? "断线重连中"
                      : member.editing ? "正在改装 · 未应用"
                      : member.id === room.hostId
                        ? "房主 · 负责开始"
                        : member.ready
                        ? "已准备"
                        : "未准备"}
                  </span>
                </p>
                {member.id===id ? <NativeButton disabled={!editable} onClick={onEdit}>更换舰船</NativeButton> : <NativeButton onClick={()=>setInspectedId(member.id)}>查看配装</NativeButton>}
                <label className="lan-team-select">
                  队伍
                  <select
                    aria-label={member.name + "的队伍"}
                    value={member.team}
                    disabled={!editable || room.options.assignment==="solo" || (!isHost && member.id !== id)}
                    onChange={(event) =>
                      send({
                        type: "team",
                        id: member.id,
                        team: Number(event.target.value),
                      })
                    }
                  >
                    {roomTeams(room.options).map((option) => (
                      <option key={option} value={option}>
                        {teamName(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
            {room.options.assignment!=='solo'&&renderAi(team)}
            </>}
          </section>
        );
      })}
      {room.options.assignment==='solo'&&<section className="lan-team lan-solo-ai" aria-label="独立 AI">
        <h3 className="lan-team-heading"><button type="button" className="lan-team-toggle" aria-expanded={!collapsed.has(-1)} aria-label={(collapsed.has(-1)?'展开':'收起')+'独立 AI'} onClick={()=>onToggleTeam(-1)}>
          <span><span aria-hidden="true">{collapsed.has(-1)?'▸':'▾'}</span> 独立 AI</span><small>{room.options.aiHulls.flat().length} 艘</small>
        </button></h3>
        {!collapsed.has(-1)&&<><p className="lan-team-empty">每艘独立成队 · 同配装仅合并显示</p>
          {isHost&&onAddAi&&<div className="lan-team-quick-actions"><NativeButton disabled={!editable} onClick={()=>onAddAi(0)}>添加 AI</NativeButton></div>}
          {renderAi(null)}</>}
      </section>}
      <p className="lan-muted lan-team-limit">
        真人玩家 {room.members.length}/{room.capacity} · AI 不占玩家席位
        <br />
        {room.options.assignment==="solo" ? "各自为战 · 每人独立成队" : isHost ? "可调整所有真人玩家的队伍" : "可以选择自己的队伍"}
      </p>
    </div>
  );
}
