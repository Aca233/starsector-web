import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LanAiEditor, type AiEditTarget } from "./LanAiEditor";
import { aiLoadout, aiHullId } from "./ai-loadouts.mjs";
import { NativeButton } from "../ui/NativeChrome";
import { LanRefit } from "./LanRefit";
import { LanTeamControls } from "./LanTeamControls";
import { LanRoomRoster } from "./LanRoomRoster";
import { LanRoomTools } from "./LanRoomTools";
import { LanAiFleet } from "./LanAiFleet";
import { submitLanDesign } from "./LanLoadoutSync";
import { validateLanDesign } from "./LanDesign";
import { battleTeamCount, battleTeamLimit } from "../shared/battle-size.mjs";
import { roomStartBlockReason } from "./room-start.mjs";
import { roomApplyAction, roomWorkflow, submitRoomAction } from "./room-workflow.mjs";
import { LanRoomProgress } from "./LanRoomProgress";
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
  const [aiBusy,setAiBusy]=useState(false), aiBusyRef=useRef(false);
  const reportAiBusy=useCallback((busy:boolean)=>{aiBusyRef.current=busy;setAiBusy(busy);},[]);
  // LanRefit keeps the personal draft, but unmounts its sidebar during AI refit.
  const [collapsedTeams,setCollapsedTeams]=useState<ReadonlySet<number>>(()=>new Set());
  const toggleTeam=(team:number)=>setCollapsedTeams(previous=>{const next=new Set(previous);if(next.has(team))next.delete(team);else next.add(team);return next;});
  const rosterScroll=useRef(0);
  const readRosterScroll=useCallback(()=>rosterScroll.current,[]);
  const saveRosterScroll=useCallback((top:number)=>{rosterScroll.current=top;},[]);
  const [aiOpen,setAiOpen]=useState<{sequence:number;team:number}>();
  const [rulesOpen,setRulesOpen]=useState(0), [settingsOpen,setSettingsOpen]=useState(0);
  const openAi=(team:number)=>setAiOpen(previous=>({sequence:(previous?.sequence??0)+1,team}));
  const [aiEditor,setAiEditor]=useState<AiEditTarget|null>(null);
  const [aiReturn,setAiReturn]=useState(false),[aiTeam,setAiTeam]=useState(1);
  const [aiQuery,setAiQuery]=useState(""),[aiBatch,setAiBatch]=useState("1");
  const [aiHullClass,setAiHullClass]=useState(""),[aiFaction,setAiFaction]=useState("");
  const [aiScroll,setAiScroll]=useState<AiEditTarget["returnScroll"]>();
  const [aiSelection,setAiSelection]=useState<AiEditTarget["returnSelection"]>(null);
  const [seed]=useState(()=>{
    try {return {draft:me?.design?validateLanDesign(me.design):initial??createDesign(me?.hull??LAN_SHIPS[0].id),applied:!!me?.design};}
    catch {return {draft:createDesign(LAN_SHIPS[0].id),applied:false};}
  });
  useEffect(()=>{
    const controller=new AbortController();abort.current=controller;
    // Room broadcasts precede configure receipts. Keep this snapshot synchronous so
    // apply -> ready/start never uses ready flags from the previous React render.
    const unsubscribe=connection.subscribe(message=>{
      if(message.type==='room'&&message.room.code===current.current.room.code){
        const next=message.room as Room;
        current.current={...current.current,room:next,editable:current.current.active&&connection.ready&&['lobby','ended'].includes(next.status)};
      }else if(['roomClosed','left','disconnected','reconnecting'].includes(message.type))current.current={...current.current,editable:false};
    });
    return()=>{controller.abort();unsubscribe();};
  },[connection]);
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
    if(aiBusyRef.current)throw Error("AI 编成正在同步，请等待服务器确认");
    if(pending.current)throw Error("已有配装正在提交，请等待确认");
    pending.current=true;setError("");
    try {
      const design=await submitLanDesign(connection,state.room.code,member.designRevision,draft,abort.current?.signal);
      onConfirmed(design);return design;
    }finally{pending.current=false;}
  };
  const act=async()=>{
    const state=current.current, member=state.room.members.find(member=>member.id===state.id);
    if(!state.editable||!connection.ready||!member)throw Error('房间暂不可操作，请等待连接恢复');
    if(aiBusyRef.current)throw Error('AI 编成正在同步，请等待服务器确认');
    if(pending.current||dirtyRef.current)throw Error('请先应用修改并等待服务器确认');
    const host=state.room.hostId===state.id;
    if(!host&&member.ready){await submitRoomAction(connection,state.room.code,state.id,{type:'ready',ready:false},abort.current?.signal);return;}
    if(host){
      const blocked=roomStartBlockReason({...state.room,aiHulls:state.room.options.aiHulls});
      if(blocked)throw Error(blocked);
    }
    // A guest confirms only their own design; another player's draft must not
    // prevent them from preparing. Host validates the whole fleet before start.
    for(const player of host?state.room.members:[member])if(player.design)try{validateLanDesign(player.design);}catch(e){throw Error(player.name+'的配装不可用：'+(e instanceof Error?e.message:String(e)));}
    if(host)for(const key of new Set(state.room.options.aiHulls.flat())) {
      const design=aiLoadout(state.room.options,key)??createDesign(aiHullId(state.room.options,key));
      try{validateLanDesign(design);}catch(e){throw Error('AI 方案「'+design.name+'」不可用：'+(e instanceof Error?e.message:String(e)));}
    }
    await submitRoomAction(connection,state.room.code,state.id,host?{type:'start'}:{type:'ready',ready:true},abort.current?.signal);
  };
  const disabledReason=!active?"原房间已关闭或已离开；草稿仍可另存，退出后重新加入。":!connection.ready?"连接中断，草稿已保留，请等待重连。":!editable?"房间已进入对局，暂不能修改配装。":"";
  const workflow=roomWorkflow(room,id);
  const blocked=isHost?workflow.blocked:"";
  return <><LanRefit suspended={!!aiEditor} initial={seed.draft} disabledReason={disabledReason||(aiBusy?"AI 编成正在同步，请等待服务器确认":"")} onApply={apply} onCancel={onLeave}
    room={{title:"联机房间",hasAppliedDesign:seed.applied,
      leaveDescription:isHost?"你是房主，离开会关闭整个房间。已保存的单机方案不受影响。":"离开只退出你自己；已保存的方案不受影响。",
      onDirtyChange:reportDirty,actionLabel:isHost?'开始战斗':me?.ready?'取消准备':'准备',actionBlocked:blocked,onAction:act,
      applyAction:draft=>roomApplyAction(room,id,draft),
      actionHint:isHost?'所有开战条件已满足，点击开始战斗。':me?.ready?'你已准备，等待房主开始；继续改装会取消准备。':'配装已同步，点击准备后等待房主开始。',
      sidebar:(onPickHull,draft)=><aside className="lan-room-sidebar lan-room-fleet-sidebar" aria-label="房间舰船"><header><strong>房间 {room.code}</strong><span>真人 {room.members.length}/{room.capacity}</span></header>
        {(message||error)&&<p className="lan-error" role="alert">{error||message}</p>}
        <p className="lan-muted" aria-label="当前房间战斗规模">战斗规模 {room.options.battleSize} DP · 每队 {battleTeamLimit(room.options.battleSize,battleTeamCount(room.members,room.options.aiHulls))} DP</p>
        {onViewReport && <NativeButton onClick={onViewReport}>上一局战报</NativeButton>}
        <LanRoomProgress room={room} id={id} editable={editable&&!aiBusy} onAddOpponent={()=>openAi(Math.max(0,workflow.opponentTeam))} onRules={()=>setRulesOpen(value=>value+1)} onSettings={()=>setSettingsOpen(value=>value+1)}/>
        <LanRoomRoster room={room} id={id} editable={editable} connection={connection} onEdit={onPickHull} send={send} onAddAi={openAi}
          onBusyChange={reportAiBusy} collapsed={collapsedTeams} onToggleTeam={toggleTeam} readScroll={readRosterScroll} onScroll={saveRosterScroll}
          onEditAi={target=>{setAiReturn(false);setAiOpen(undefined);setAiEditor(target);}}/>
        <div className="lan-room-ai"><LanAiFleet room={room} isHost={isHost} editable={editable&&!aiBusy} entryDisabled={aiBusy} connection={connection} currentDesign={draft} openRequest={aiOpen} openInitially={aiReturn} initialTeam={aiTeam} initialQuery={aiQuery} initialHullClass={aiHullClass} initialFaction={aiFaction} initialBatch={aiBatch} initialSelection={aiSelection} initialScroll={aiScroll} onEdit={target=>{setAiScroll(target.returnScroll);setAiOpen(undefined);setAiSelection(target.returnSelection);setAiQuery(target.returnQuery??"");setAiHullClass(target.returnHullClass??"");setAiFaction(target.returnFaction??"");setAiBatch(target.returnBatch??"1");setAiTeam(target.team);setAiReturn(true);setAiEditor(target);}}/></div>
      </aside>,
      tools:<><LanRoomTools room={room} id={id} addresses={addresses} send={send} connected={active&&connection.ready&&!aiBusy} openSettingsRequest={settingsOpen}/><LanTeamControls room={room} id={id} editable={editable&&!aiBusy} send={send} openRequest={rulesOpen}/></>
    }}/>
    {aiEditor&&<LanAiEditor target={aiEditor} connection={connection} roomCode={room.code} options={room.options} disabledReason={disabledReason||(!isHost?"只有房主可修改 AI":aiEditor.assignment!==room.options.assignment||aiEditor.baseRevision!==(room.options.aiRevision??0)?"AI 编成已变化；草稿可另存，请返回编成后重新选择改装目标":"")} onDone={()=>setAiEditor(null)}/>}
  </>;
}
