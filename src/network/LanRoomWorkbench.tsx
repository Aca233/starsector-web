import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LanAiEditor, type AiEditTarget } from "./LanAiEditor";
import { aiLoadout, aiHullId } from "./ai-loadouts.mjs";
import { NativeButton } from "../ui/NativeChrome";
import { LanRefit } from "./LanRefit";
import { LanTeamControls } from "./LanTeamControls";
import { LanTeamRoster } from "./LanTeamRoster";
import { LanRoomTools } from "./LanRoomTools";
import { LanAiFleet } from "./LanAiFleet";
import { submitLanDesign } from "./LanLoadoutSync";
import { validateLanDesign } from "./LanDesign";
import { battleTeamCount, battleTeamLimit } from "../shared/battle-size.mjs";
import { roomStartBlockReason } from "./room-start.mjs";
import { createDesign, type Design } from "../studio/DesignModel";
import { LAN_SHIPS, type LanConnection, type Room } from "./protocol";

export function LanRoomWorkbench({room,id,active,connection,addresses,message,initial,onLeave,onConfirmed,onViewReport}:{
  room:Room;id:string;active:boolean;connection:LanConnection;addresses:string[];message:string;
  initial:Design|null;onLeave:()=>void;onConfirmed:(design:Design)=>void;onViewReport?:()=>void;
}) {
  const me=room.members.find(member=>member.id===id);
  const isHost=room.hostId===id;
  const editable=active&&connection.ready&&["lobby","ended"].includes(room.status);
  const current=useRef({room,active,editable,id});
  useLayoutEffect(()=>{current.current={room,active,editable,id};},[room,active,editable,id]);
  const pending=useRef(false), dirtyRef=useRef(false), abort=useRef<AbortController|null>(null);
  const [error,setError]=useState("");
  const [aiEditor,setAiEditor]=useState<AiEditTarget|null>(null);
  const [aiReturn,setAiReturn]=useState(false),[aiTeam,setAiTeam]=useState(1);
  const [aiQuery,setAiQuery]=useState(""),[aiBatch,setAiBatch]=useState("1");
  const [seed]=useState(()=>{
    try {return {draft:me?.design?validateLanDesign(me.design):initial??createDesign(me?.hull??LAN_SHIPS[0].id),applied:!!me?.design};}
    catch {return {draft:createDesign(LAN_SHIPS[0].id),applied:false};}
  });
  useEffect(()=>{const controller=new AbortController();abort.current=controller;return()=>controller.abort();},[]);
  const send=(message:unknown)=>{setError("");if(!connection.ready||!connection.send(message))setError("连接尚未就绪，请等待重连");};
  const reportDirty=useCallback((dirty:boolean)=>{
    dirtyRef.current=dirty;
    const {room,editable,id}=current.current;
    const member=room.members.find(member=>member.id===id);
    if(editable&&member&&member.editing!==dirty)connection.send({type:"editing",editing:dirty});
  },[connection]);
  useEffect(()=>{if(editable)reportDirty(dirtyRef.current);},[editable,reportDirty]);
  const apply=async(draft:Design)=>{
    const state=current.current,member=state.room.members.find(member=>member.id===state.id);
    if(!state.editable||!member)throw Error("原房间不可编辑，草稿仍可另存");
    if(pending.current)throw Error("已有配装正在提交，请等待确认");
    pending.current=true;setError("");
    try {
      const design=await submitLanDesign(connection,state.room.code,member.designRevision,draft,abort.current?.signal);
      onConfirmed(design);return design;
    }finally{pending.current=false;}
  };
  const act=()=>{
    if(!editable||pending.current||dirtyRef.current){setError("请先应用修改并等待服务器确认");return;}
    if(!isHost&&me?.ready){send({type:"ready",ready:false});return;}
    try {
      for(const member of room.members)if(member.design)try{validateLanDesign(member.design);}catch(e){throw Error(member.name+"的配装不可用："+(e instanceof Error?e.message:String(e)));}
      for(const key of new Set(room.options.aiHulls.flat())) {
        const design=aiLoadout(room.options,key)??createDesign(aiHullId(room.options,key));
        try {validateLanDesign(design);}catch(e){throw Error('AI 方案「'+design.name+'」不可用：'+(e instanceof Error?e.message:String(e)));}
      }
      send({type:isHost?"start":"ready",...(isHost?{}:{ready:true})});
    }catch(e){setError(e instanceof Error?e.message:"编成无法开始");}
  };
  const disabledReason=!active?"原房间已关闭或已离开；草稿仍可另存，退出后重新加入。":!connection.ready?"连接中断，草稿已保留，请等待重连。":!editable?"房间已进入对局，暂不能修改配装。":"";
  const blocked=isHost?roomStartBlockReason({status:room.status,hostId:room.hostId,members:room.members,aiHulls:room.options.aiHulls,options:room.options}):"";
  return <><LanRefit suspended={!!aiEditor} initial={seed.draft} disabledReason={disabledReason} onApply={apply} onCancel={onLeave}
    room={{title:"联机改装",hasAppliedDesign:seed.applied,
      leaveDescription:isHost?"你是房主，离开会关闭整个房间。已保存的单机方案不受影响。":"离开只退出你自己；已保存的方案不受影响。",
      onDirtyChange:reportDirty,actionLabel:isHost?"开始战斗":me?.ready?"取消准备":"准备",actionBlocked:blocked,onAction:act,
      sidebar:(onPickHull,draft)=><aside className="lan-room-sidebar" aria-label="房间成员"><header><strong>房间 {room.code}</strong><span>真人 {room.members.length}/{room.capacity}</span></header>
        {(message||error)&&<p className="lan-error" role="alert">{error||message}</p>}
        <p className="lan-muted" aria-label="当前房间战斗规模">战斗规模 {room.options.battleSize} DP · 每队 {battleTeamLimit(room.options.battleSize,battleTeamCount(room.members,room.options.aiHulls))} DP</p>
        {onViewReport && <NativeButton onClick={onViewReport}>上一局战报</NativeButton>}
        <LanTeamControls room={room} id={id} editable={editable} send={send}/>
        <LanTeamRoster room={room} id={id} editable={editable} onEdit={onPickHull} send={send}/>
        <div className="lan-room-ai"><LanAiFleet room={room} isHost={isHost} editable={editable} send={send} currentDesign={draft} openInitially={aiReturn} initialTeam={aiTeam} initialQuery={aiQuery} initialBatch={aiBatch} onEdit={target=>{setAiQuery(target.returnQuery??"");setAiBatch(target.returnBatch??"1");setAiTeam(target.team);setAiReturn(true);setAiEditor(target);}}/></div>
        <p className="lan-muted lan-room-guidance">左侧查看真人与已应用的舰船；中间直接改装自己的船。AI 独立管理，不占真人席位。</p>
      </aside>,
      tools:<LanRoomTools room={room} id={id} addresses={addresses} send={send}/>
    }}/>
    {aiEditor&&<LanAiEditor target={aiEditor} connection={connection} roomCode={room.code} disabledReason={disabledReason||(!isHost?"只有房主可修改 AI":aiEditor.assignment!==room.options.assignment||aiEditor.scope!=="add"&&aiEditor.baseRevision!==(room.options.aiRevision??0)?"AI 编成已变化；草稿可另存，请返回编成后重新选择改装目标":"")} onDone={()=>setAiEditor(null)}/>}
  </>;
}
