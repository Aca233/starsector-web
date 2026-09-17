import { useEffect, useRef } from 'react';
import { LanRefit } from './LanRefit';
import { LanHullThumbnail } from './LanHullThumbnail';
import { data, type Design } from '../studio/DesignModel';
import { validateLanDesign } from './LanDesign';
import { aiDesignSignature } from './ai-loadouts.mjs';
import { randomId } from '../shared/RandomId';
import type { LanConnection, RoomOptions } from './protocol';
export interface AiEditTarget {
  design:Design; hull?:string; scope:'group'|'one'|'add'; count:number; team:number;
  assignment:RoomOptions['assignment']; baseRevision:number;
  returnQuery?:string; returnBatch?:string;
}
/** Personal LanRefit stays mounted but suspended; this editor owns only its independent AI draft. */
export function LanAiEditor({target,connection,roomCode,disabledReason,onDone}:{
  target:AiEditTarget;connection:LanConnection;roomCode:string;disabledReason:string;onDone:()=>void;
}) {
  const abort=useRef(new AbortController());
  useEffect(()=>{const controller=new AbortController();abort.current=controller;return()=>controller.abort();},[]);
  const apply=async(draft:Design):Promise<Design>=>{
    const design=validateLanDesign({...draft,name:draft.name.trim()});
    if(!draft.name.trim()||draft.name.trim().length>48)throw Error('方案名称需为 1–48 字');
    const result=await new Promise<Design>((resolve,reject)=>{
      if(!connection.ready||abort.current.signal.aborted){reject(Error('连接未就绪，草稿已保留'));return;}
      const requestId=randomId(),signal=abort.current.signal;
      let done=false;
      const finish=(error?:Error,accepted?:Design)=>{if(done)return;done=true;clearTimeout(timer);unsubscribe();signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(accepted!);};
      const cancel=()=>finish(Error('提交已取消，草稿未确认同步'));
      const unsubscribe=connection.subscribe(m=>{
        if(m.type==='ai-configured'&&m.requestId===requestId){try{
          if(m.roomCode!==roomCode||!Number.isSafeInteger(m.revision)||m.revision<=target.baseRevision||aiDesignSignature(m.design)!==aiDesignSignature(design))throw Error('AI 配装确认不匹配');
          finish(undefined,validateLanDesign(m.design));
        }catch(e){finish(e instanceof Error?e:Error('配装确认无效'));}}
        else if(m.type==='error'&&m.requestId===requestId)finish(Error(m.message));
        else if(['reconnecting','disconnected','roomClosed','left','match'].includes(m.type))finish(Error('连接或房间状态已改变，草稿已保留'));
      });
      const timer=setTimeout(()=>finish(Error('未收到服务器确认，草稿已保留；返回编成检查是否已应用后再操作')),10000);
      signal.addEventListener('abort',cancel,{once:true});
      if(!connection.send({type:'ai',requestId,roomCode,operation:target.scope==='add'?'add':'refit',assignment:target.assignment,team:target.team,hull:target.hull,scope:target.scope==='add'?undefined:target.scope,baseRevision:target.baseRevision,count:target.count,design}))finish(Error('发送失败，草稿已保留'));
    });
    onDone();return result;
  };
  const scope=target.scope==='one'?'拆出 1 艘单独改装':target.scope==='add'?'新增 '+target.count+' 艘 AI':'修改这一组 '+target.count+' 艘';
  return <LanRefit initial={target.design} disabledReason={disabledReason} onApply={apply} onCancel={onDone} room={{
    title:'AI 配装',hasAppliedDesign:false,backLabel:'返回 AI 编成',leaveDescription:'只返回 AI 编成，不离开房间。你自己的舰船草稿保持不变。',
    actionLabel:'返回 AI 编成',actionBlocked:'',onAction:onDone,onDirtyChange:()=>{},tools:<span>{scope}</span>,
    sidebar:(_pick,draft,onChange)=> <aside className="lan-room-sidebar lan-ai-editor-sidebar"><h2>{scope}</h2><LanHullThumbnail hull={draft.hullId} name={data.ships[draft.hullId]?.name??draft.hullId}/>
      <label>方案名称<input aria-label="AI 方案名称" value={draft.name} maxLength={48} onChange={e=>onChange({...draft,name:e.target.value})}/></label>
      <p>这里只编辑 AI，不会覆盖你自己的舰船或本机已存方案。</p>
      <p>{target.scope==='one'?'只拆出一艘；其余舰船保留原方案。':'只有目标方案组会改变，其他方案组保持不变。'}个人战仍然每艘独立成队。</p>
      <p>相同实际配装会自动合并，并沿用已有方案名称。服务器确认后自动返回，其他玩家需要重新准备。</p>
      <p>用下方「返回 AI 编成」安全取消本次改装。</p>
    </aside>
  }}/>;
}
