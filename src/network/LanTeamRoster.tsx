import { useState } from "react";
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
  send,
}: {
  room: Room;
  id: string;
  editable: boolean;
  onEdit: () => void;
  send: (message: unknown) => void;
}) {
  const [inspectedId,setInspectedId] = useState<string | null>(null);
  const inspected = room.members.find(member=>member.id===inspectedId);
  const isHost = room.hostId === id;
  return (
    <div className="lan-teams">
      {inspected && <LanLoadoutDetails member={inspected} onClose={()=>setInspectedId(null)} />}
      {roomTeams(room.options).filter(team=>room.options.assignment!=="solo"||room.members.some(member=>member.team===team)).map((team) => {
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
              <span>{teamName(team)}</span>
              <small>{humans.length} 人</small>
            </h3>
            {!humans.length && (
              <p className="lan-team-empty">暂无真人玩家</p>
            )}
            {humans.map((member) => (
              <article
                className="lan-team-member"
                data-local={member.id === id}
                key={member.id}
              >
                <button className="lan-member-ship" aria-label={member.id===id ? "更换我的舰船" : "查看"+member.name+"的配装"} onClick={()=>member.id===id ? onEdit() : setInspectedId(member.id)} disabled={member.id===id&&!editable}>
                  {modManager.getShip(member.hull)&&<img alt="" src={runtimeAssetUrl(modManager.getShip(member.hull)!.spriteUrl)} />}
                </button>
                <div className="lan-member-heading">
                  <strong>
                    {member.name}
                    {member.id === id ? "（你）" : ""}
                  </strong>
                  <span>{member.id === room.hostId ? "房主" : "玩家"}</span>
                </div>
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
                {member.id===id ? <span className="lan-muted lan-own-card-note">中间直接改装 · 点缩略图换船</span> : <NativeButton onClick={()=>setInspectedId(member.id)}>查看配装</NativeButton>}
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
          </section>
        );
      })}
      <p className="lan-muted lan-team-limit">
        真人玩家 {room.members.length}/{room.capacity} · AI 不占玩家席位
        <br />
        {room.options.assignment==="solo" ? "各自为战 · 每人独立成队" : isHost ? "可调整所有真人玩家的队伍" : "可以选择自己的队伍"}
      </p>
    </div>
  );
}
