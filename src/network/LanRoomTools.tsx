import { MotionPresence } from '../ui/core/MotionPresence';
import { FullscreenButton } from '../ui/FullscreenButton';
import { SteamInvite } from "./SteamStart";
import { BattleSizeControl } from "../ui/BattleSizeControl";
import { battleTeamCount, battleTeamLimit } from "../shared/battle-size.mjs";
import { useState } from "react";
import { NativeButton } from "../ui/NativeChrome";
import { Modal } from "../ui/core/UI";
import { LAN_MAX_PLAYERS } from "./protocol";
import type { Room } from "./protocol";

export function LanRoomTools({
  room,
  id,
  addresses,
  send,
  connected = true,
  openSettingsRequest = 0,
}: {
  room: Room;
  id: string;
  addresses: string[];
  send: (m: unknown) => void;
  connected?: boolean;
  openSettingsRequest?: number;
}) {
  const [panel, setPanel] = useState<"rules" | "invite" | "chat" | null>(null);
  const [lastSettingsRequest,setLastSettingsRequest]=useState(openSettingsRequest);
  if(lastSettingsRequest!==openSettingsRequest){setLastSettingsRequest(openSettingsRequest);if(openSettingsRequest)setPanel("rules");}
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [address, setAddress] = useState(
    addresses[0] ?? location.origin + "/?view=lan",
  );
  const [copied, setCopied] = useState("");
  const [kick, setKick] = useState("");
  const editable =
    connected && id === room.hostId && ["lobby", "ended"].includes(room.status);
  const teams = battleTeamCount(room.members,room.options.aiHulls);
  const limit = battleTeamLimit(room.options.battleSize,teams);
  const initial = room.options.initialDeploymentLimit;
  const invite = new URL(address);
  invite.searchParams.set("view", "lan");
  invite.searchParams.set("room", room.code);
  return (
    <div className="lan-room-tools">
      <NativeButton onClick={()=>{setCopied('');setPanel('invite');}}>邀请朋友</NativeButton>
      <NativeButton onClick={()=>setPanel('rules')}>房间设置</NativeButton>
      <NativeButton onClick={()=>setPanel('chat')}>房间聊天</NativeButton>
      <FullscreenButton />
      <MotionPresence>{panel === "rules" && (
        <Modal
          title="房间设置"
          eyebrow=""
          onClose={() => setPanel(null)}
          footer={
            <NativeButton onClick={() => setPanel(null)}>返回</NativeButton>
          }
        >
          <div className="lan-help lan-room-settings">
            <p>
              大厅成员栏只显示真人玩家，AI 在独立的「AI 舰船」中由房主手动添加，不占房间席位。同队协作，不同队交战。
            </p>
            <p>
              玩家可选择自己的队伍；房主可调整全部玩家的队伍，并逐艘配置各队的
              AI。更改编成会取消所有人的准备。
            </p>
            <BattleSizeControl value={room.options.battleSize} teams={teams} disabled={!editable} onChange={battleSize=>send({type:'options',options:{battleSize}})}/>
            <p>{editable ? '仅房主可修改；更改会取消所有人的准备。这里只调整当前房间，不覆盖主菜单的默认设置。' : '使用房主的房间规则；客机的本地设置不影响本局。'}{!['lobby','ended'].includes(room.status) && ' 本局规则已锁定。'}</p>
            <details><summary>高级部署：首发与后备</summary>
              <label>每队首发目标<select aria-label="联机首发预算" disabled={!editable} value={initial==null?'auto':initial} onChange={e=>send({type:'options',options:{initialDeploymentLimit:e.target.value==='auto'?null:Number(e.target.value)}})}>
                <option value="auto">自动填满本队额度（{limit} DP）</option>
                {[...new Set([0,60,120,240,400,800,1600,...(initial==null?[]:[initial])])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n===0?'只部署真人和各队旗舰':n+' DP'+(n>limit?'（本局最多 '+limit+'）':'')}</option>)}
              </select></label>
              <p>真人舰和每队旗舰始终首发；AI 按编成顺序填充首发额度，余舰待命。Tab → G 呼叫本队后备舰。纯 AI 队每 5 秒按空余额补充；本队在场全灭时自动呼叫下一波。部署不暂停战斗。</p>
            </details>
            {editable && (
              <>
                <h3>房间容量</h3>
                <label>
                  玩家席位
                  <select
                    aria-label="房间人数上限"
                    value={room.capacity}
                    onChange={(event) =>
                      send({
                        type: "capacity",
                        capacity: Number(event.target.value),
                      })
                    }
                  >
                    {Array.from(
                      { length: LAN_MAX_PLAYERS - 1 },
                      (_, index) => index + 2,
                    ).map((count) => (
                      <option
                        key={count}
                        value={count}
                        disabled={count < room.members.length}
                      >
                        {count} 人
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  无需坐满；其他真人准备后，房主直接开始。只有房主时，给对面添加 AI 也可开局。掉线保留席位也计入容量；同步按在场复杂度和网络拥塞调整，不代表已通过大规模性能验收。
                </p>
                <h3>访问与成员</h3>
                <label>
                  新房间密码
                  <input
                    aria-label="新房间密码"
                    type="password"
                    value={password}
                    maxLength={32}
                    placeholder="留空可清除密码"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <NativeButton
                  onClick={() => {
                    send({ type: "protect", password });
                    setPassword("");
                  }}
                >
                  设置 / 清除密码
                </NativeButton>
                <p role="status">
                  {room.passwordProtected
                    ? "当前房间需要密码"
                    : "当前房间无密码"}
                  。可信朋友间使用；HTTP 不加密。
                </p>
                {room.members
                  .filter((m) => m.id !== id)
                  .map((m) => (
                    <div className="lan-member-manage" key={m.id}>
                      <span>{m.name}</span>
                      <NativeButton onClick={() => setKick(m.id)}>
                        移出房间
                      </NativeButton>
                    </div>
                  ))}
              </>
            )}
          </div>
        </Modal>
      )}</MotionPresence>
      <MotionPresence>{panel === "invite" && (
        <Modal
          title="邀请朋友"
          eyebrow=""
          onClose={() => setPanel(null)}
          footer={
            <NativeButton onClick={() => setPanel(null)}>返回</NativeButton>
          }
        >
          {room.network?.kind === "steam" ? <SteamInvite key={room.network.lobbyId} lobbyId={room.network.lobbyId}/> : <div className="lan-help lan-room-settings">
            <p>
              选择同一局域网或 n2n / Radmin
              虚拟网卡的地址，分享给朋友。链接已带房间码；如有密码，请另行告知。
            </p>
            <label>
              访问地址
              <select
                aria-label="邀请网卡地址"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              >
                {(addresses.length ? addresses : [address]).map((a) => (
                  <option value={a} key={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="邀请链接"
              readOnly
              value={invite.href}
              onFocus={(e) => e.target.select()}
            />
            <NativeButton
              onClick={() => {
                void navigator.clipboard?.writeText(invite.href).then(
                  () => setCopied("已复制邀请链接"),
                  () => setCopied("请选中上方链接并复制。"),
                );
                if (!navigator.clipboard)
                  setCopied("请选中上方链接，按 Ctrl+C 复制。");
              }}
            >
              复制邀请链接
            </NativeButton>
            <p role="status">{copied}</p>
            <p>加入者只打开链接，不需要启动自己的后台。</p>
          </div>}
        </Modal>
      )}</MotionPresence>
      <MotionPresence>{panel === "chat" && (
        <Modal
          title="房间聊天"
          eyebrow=""
          onClose={() => setPanel(null)}
          footer={
            <NativeButton onClick={() => setPanel(null)}>返回</NativeButton>
          }
        >
          <div className="lan-chat-log" role="log" aria-live="polite">
            {room.chat.length ? (
              room.chat.map((m) => (
                <p key={m.id}>
                  <strong>{m.name}：</strong>
                  {m.text}
                </p>
              ))
            ) : (
              <p className="lan-muted">还没有消息。</p>
            )}
          </div>
          <form
            className="lan-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (connected && text.trim()) {
                send({ type: "chat", text });
                setText("");
              }
            }}
          >
            <input
              aria-label="聊天消息"
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入消息（最多 200 字）"
            />
            <NativeButton type="submit" disabled={!connected||!text.trim()}>
              发送
            </NativeButton>
          </form>
        </Modal>
      )}</MotionPresence>
      <MotionPresence>{kick && (
        <Modal
          title="移出这位玩家？"
          eyebrow=""
          width="small"
          onClose={() => setKick("")}
          footer={
            <>
              <NativeButton onClick={() => setKick("")}>取消</NativeButton>
              <NativeButton
                onClick={() => {
                  send({ type: "kick", id: kick });
                  setKick("");
                }}
              >
                确认移出
              </NativeButton>
            </>
          }
        >
          <p>该玩家会离开房间；房间继续保留。</p>
        </Modal>
      )}</MotionPresence>
    </div>
  );
}
