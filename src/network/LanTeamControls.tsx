import { useState } from "react";
import { NativeButton } from "../ui/NativeChrome";
import { Modal } from "../ui/core/UI";
import { LAN_MAX_OPTIONS_BYTES, LAN_MAX_PLAYERS, teamName, type Room } from "./protocol";

import { checkFleetBudget } from "./room-fleet.mjs";

/** Team arrangement is a room rule, not another lobby or refit workflow. */
export function LanTeamControls({room,id,editable,send}:{room:Room;id:string;editable:boolean;send:(message:unknown)=>void}) {
  const [open,setOpen]=useState(false);
  const [error,setError]=useState("");
  const host=id===room.hostId, solo=room.options.assignment==="solo", count=room.options.aiHulls.length;
  const canEdit=host&&editable;
  const lastOccupied=room.members.some(member=>member.team===count-1)||room.options.aiHulls[count-1].length>0;
  const update=(assignment:"teams"|"solo",aiHulls=room.options.aiHulls)=>{try{checkFleetBudget({...room.options,assignment,aiHulls},LAN_MAX_OPTIONS_BYTES,LAN_MAX_PLAYERS);setError("");send({type:"options",baseRevision:room.options.aiRevision??0,options:{assignment,aiHulls}});}catch(e){setError(e instanceof Error?e.message:"无法修改编队");}};
  return <div className="lan-team-controls">
    <NativeButton onClick={()=>setOpen(true)}>编队规则 · {solo?"各自为战":count+" 队"}</NativeButton>
    {open&&<Modal title="房间编队规则" eyebrow="同一房间 · 同队友好，不同队交战" width="small" onClose={()=>setOpen(false)} footer={<NativeButton onClick={()=>setOpen(false)}>返回改装</NativeButton>}>
      <div className="lan-team-rules"><p>当前：{solo?"各自为战，每位玩家和每艘 AI 都独立成队":"自由分队，可组织两队、三队或更多队互打"}。</p>
        {!host&&<p>编队规则由房主设置；自由分队时可以在自己的成员卡上选队。</p>}
        <NativeButton disabled={!canEdit||!solo} onClick={()=>update("teams")}>自由分队</NativeButton>
        <NativeButton disabled={!canEdit||solo} onClick={()=>update("solo")}>每人独立一队</NativeButton>
        <p>{solo?"新加入的玩家、手动添加的 AI 也会独立成队，不会自动成为他人的队友。切回自由分队后可自行合队。":"左侧成员卡选择 A / B / C 等队伍；房主能调整所有成员。AI 在独立编成窗口按队添加。空队不参战。"}</p>
        {!solo&&<div><strong>{count} 队</strong><div className="lan-team-count-actions">
          <NativeButton disabled={!canEdit} onClick={()=>update("teams",[...room.options.aiHulls,[]])}>增加 {teamName(count)??"队伍"}</NativeButton>
          <NativeButton disabled={!canEdit||count<=2||lastOccupied} title={lastOccupied?"请先移动末队玩家并移除该队 AI":undefined} onClick={()=>update("teams",room.options.aiHulls.slice(0,-1))}>移除末尾空队</NativeButton>
        </div></div>}
        {error&&<p className="lan-error" role="alert">{error}</p>}
        <p className="lan-muted">更改编成会取消准备，但不改变任何人的配装草稿。至少两个有舰船的阵营才能开战；最后存活的阵营获胜。</p>
      </div>
    </Modal>}
  </div>;
}
