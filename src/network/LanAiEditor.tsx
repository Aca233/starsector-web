import { useEffect, useRef } from 'react';
import { LanRefit } from './LanRefit';
import { LanHullThumbnail } from './LanHullThumbnail';
import { data, type Design } from '../studio/DesignModel';
import { validateLanDesign } from './LanDesign';
import { submitAiFleet } from './LanAiSync';
import { teamName, type LanConnection, type RoomOptions } from './protocol';
export interface AiEditTarget {
  design:Design; hull?:string; scope:'group'|'one'|'add'; count:number; team:number;
  assignment:RoomOptions['assignment']; baseRevision:number;
  returnToRoster?:boolean;
  returnScroll?:{catalog:number;roster:number};
  returnQuery?:string; returnBatch?:string; returnSelection?:{design:Design;source:string;nativeId?:string;warnings?:string[]}|null;
}
/** Personal LanRefit stays mounted but suspended; this editor owns only its independent AI draft. */
export function LanAiEditor({target,connection,roomCode,options,disabledReason,onDone}:{
  target:AiEditTarget;connection:LanConnection;roomCode:string;options:RoomOptions;disabledReason:string;onDone:()=>void;
}) {
  const abort=useRef(new AbortController());
  useEffect(()=>{const controller=new AbortController();abort.current=controller;return()=>controller.abort();},[]);
  const apply=async(draft:Design):Promise<Design>=>{
    const design=validateLanDesign({...draft,name:draft.name.trim()});
    if(!draft.name.trim()||draft.name.trim().length>48)throw Error('方案名称需为 1–48 字');
    const result=await submitAiFleet(connection,roomCode,options,{
      operation:target.scope==='add'?'add':'refit',assignment:target.assignment,team:target.team,hull:target.hull,
      scope:target.scope==='add'?undefined:target.scope,baseRevision:target.baseRevision,count:target.count,design
    },abort.current.signal);
    if(!result)throw Error('未收到 AI 配装确认，草稿已保留');
    onDone();return result;
  };
  const returnLabel=target.returnToRoster?'返回舰船列表':'返回 AI 编成';
  const destination=target.assignment==='solo'?'每艘独立成队':teamName(target.team);
  const scope=(target.scope==='one'?'拆出 1 艘单独改装':target.scope==='add'?'新增 '+target.count+' 艘 AI':'修改这一组 '+target.count+' 艘')+' · '+destination;
  return <LanRefit initial={target.design} disabledReason={disabledReason} onApply={apply} onCancel={onDone} room={{
    title:'AI 配装',hasAppliedDesign:false,backLabel:returnLabel,leaveDescription:'只'+returnLabel+'，不离开房间。你自己的舰船草稿保持不变。',
    actionLabel:returnLabel,actionBlocked:'',onAction:onDone,onDirtyChange:()=>{},tools:<span>{scope}</span>,
    sidebar:(_pick,draft,onChange)=> <aside className="lan-room-sidebar lan-ai-editor-sidebar"><h2>{scope}</h2><LanHullThumbnail hull={draft.hullId} name={data.ships[draft.hullId]?.name??draft.hullId}/>
      <label>方案名称<input aria-label="AI 方案名称" value={draft.name} maxLength={48} onChange={e=>onChange({...draft,name:e.target.value})}/></label>
      <p>这里只编辑 AI，不会覆盖你自己的舰船或本机已存方案。</p>
      <p>{target.scope==='add'?'应用后才添加这些舰船；返回则取消，不改变现有编成。':target.scope==='one'?'只拆出一艘；其余舰船保留原方案。':'只有目标方案组会改变，其他方案组保持不变。'}个人战仍然每艘独立成队。</p>
      <p>相同实际配装会自动合并，并沿用已有方案名称。服务器确认后自动返回，其他玩家需要重新准备。</p>
      <p>用下方「{returnLabel}」安全取消本次改装。</p>
    </aside>
  }}/>;
}
