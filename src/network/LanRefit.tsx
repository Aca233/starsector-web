import { MotionPresence } from '../ui/core/MotionPresence';
import type { RoomApplyAction } from './room-workflow.mjs';
import { randomId } from "../shared/RandomId";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NativeRefit } from '../studio/NativeRefit';
import { NativeButton } from '../ui/NativeChrome';
import { Modal } from '../ui/core/UI';
import { createDesign, data, decodeDesign, evaluate, readLibrary, writeLibrary, storageKey, type Design } from '../studio/DesignModel';
import { HullRoster, type HullFilter } from '../studio/HullRoster';
import { lanHullUnavailable, validateLanDesign } from './LanDesign';
import { modManager } from '../engine/modding/ModManager';
import '../studio/source-variant-picker.css';
import '../studio/source-weapon-picker.css';
const CaptainSkillsScreen = lazy(() => import('../studio/CaptainSkillsScreen').then(m=>({default:m.CaptainSkillsScreen})));
const signature = (d: Design) => JSON.stringify({...d,updatedAt:0});
type Confirmation = {title:string; text:string; run:()=>void};
export interface LanEditorRoom {
  title: string; hasAppliedDesign: boolean; leaveDescription: string;
  sidebar: (onPickHull:()=>void, draft:Design, onChange:(draft:Design)=>void) => ReactNode;
  backLabel?:string;
  tools: ReactNode;
  actionLabel: string; actionBlocked: string; onAction:()=>void|Promise<void>;
  applyAction?: (draft:Design)=>RoomApplyAction;
  actionHint?: string;
  onDirtyChange:(dirty:boolean)=>void;
}

/** Room connection lives in the parent. Editing is a local draft until explicit Apply. */
export function LanRefit({initial,disabledReason,onApply,onCancel,room,suspended=false}:{
  initial:Design; disabledReason:string; onApply:(draft:Design)=>void|Promise<Design>; onCancel:()=>void; room?:LanEditorRoom; suspended?:boolean;
}) {
  const [draft,setDraft]=useState(()=>structuredClone(initial));
  const [baseline,setBaseline]=useState(()=>structuredClone(initial));
  const [confirmed,setConfirmed]=useState(room?.hasAppliedDesign??true);
  const [phase,setPhase]=useState<'idle'|'syncing'|'error'>('idle');
  const [syncError,setSyncError]=useState('');
  const [actionBusy,setActionBusy]=useState(false), [actionError,setActionError]=useState('');
  const latestRoom=useRef(room);
  useLayoutEffect(()=>{latestRoom.current=room;},[room]);
  const [pickingHull,setPickingHull]=useState(false);
  const submitting=useRef(false), mounted=useRef(true), lastPrimary=useRef(-Infinity);
  const initialReport=useRef({applied:room?.hasAppliedDesign??true,notify:room?.onDirtyChange});
  useEffect(()=>{mounted.current=true;initialReport.current.notify?.(!initialReport.current.applied);return()=>{mounted.current=false;};},[]);
  const [history,setHistory]=useState<Design[]>([]);
  const [library,setLibrary]=useState(readLibrary);
  const [notice,setNotice]=useState(room?'中间编辑自己的配装；下方主按钮会说明应用后是准备、开始，还是仅同步配装。':'编辑不会改变房间配装；完成后点击「应用并返回房间」，再准备。');
  const [error,setError]=useState('');
  const [confirm,setConfirm]=useState<Confirmation|null>(null);
  const [skills,setSkills]=useState(false);
  const [filter,setFilter]=useState<HullFilter>({query:'',hullClass:'',faction:''});
  const scroll=useRef(0), file=useRef<HTMLInputElement>(null), footer=useRef<HTMLElement>(null);
  const hasRoom=!!room;
  useLayoutEffect(()=>{
    const element=footer.current, shell=element?.closest<HTMLElement>('.lan-room-workbench');
    if(!element||!shell)return;
    const measure=()=>shell.style.setProperty('--lan-room-footer-space',Math.ceil(element.getBoundingClientRect().height+18)+'px');
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>{observer.disconnect();shell.style.removeProperty('--lan-room-footer-space');};
  },[suspended,skills,hasRoom]);
  const readScroll=useCallback(()=>scroll.current,[]), writeScroll=useCallback((n:number)=>{scroll.current=n;},[]);
  const dirty=signature(draft)!==signature(baseline);
  const needsApply=dirty||!confirmed;
  const busy=phase==='syncing'||actionBusy;
  const evaluation=useMemo(()=>evaluate(draft),[draft]);
  const notify=(next:Design)=>room?.onDirtyChange(signature(next)!==signature(baseline)||!confirmed);
  const change=(next:Design)=>{if(busy)return;setActionError('');setHistory(previous=>[...previous.slice(-59),draft]);setDraft(structuredClone(next));notify(next);};
  const undo=()=>{if(history.length&&!submitting.current){const next=history[history.length-1];setDraft(next);setHistory(history.slice(0,-1));notify(next);}};
  const cancel=()=>{
    if(submitting.current)return;
    if(room)setConfirm({title:room.backLabel?room.backLabel+'？':'离开房间？',text:room.leaveDescription+(needsApply?' 未应用的草稿会被放弃；可以先另存方案。':''),run:onCancel});
    else if(dirty)setConfirm({title:'放弃这次改装？',text:'房间中的参战配装不会改变。可以继续编辑，也可以放弃本页修改返回房间。已另存的方案不会被删除。',run:onCancel});else onCancel();
  };
  const discard=()=>setConfirm({title:'放弃未应用的修改？',text:'恢复本页最近一次已确认的配装，房间内其他玩家和已保存方案不受影响。',run:()=>{setDraft(structuredClone(baseline));setHistory([]);setSyncError('');setActionError('');setPhase('idle');room?.onDirtyChange(!confirmed);}});
  const attempt=(run:()=>void)=>{try{run();}catch(e){setError(e instanceof Error?e.message:'操作失败');}};
  const chooseHull=(id:string,empty=false)=>attempt(()=>{
    const reason=lanHullUnavailable(modManager.requireShip(id));if(reason)throw Error(reason);
    change(createDesign(id,empty?'empty':'standard'));
    setPickingHull(false);
    setNotice('已选择'+(data.ships[id]?.name??id)+'；可继续改装或直接应用，切换前的配装可撤消。');
  });
  const applyBlocked=disabledReason||lanHullUnavailable(evaluation.spec)||evaluation.errors.join("；");
  const runAction=async()=>{
    setActionBusy(true);setActionError('');
    try { await latestRoom.current?.onAction(); }
    catch(e){if(mounted.current)setActionError(e instanceof Error?e.message:'操作未确认，请重试');}
    finally{if(mounted.current)setActionBusy(false);}
  };
  const apply=async(continueToAction=false)=>{
    if(submitting.current)return;
    try {
      if(disabledReason)throw Error(disabledReason);
      const submitted=validateLanDesign(draft);
      submitting.current=true;setPhase('syncing');setSyncError('');setActionError('');
      const acknowledged=await onApply(submitted);
      if(!mounted.current)return;
      if(room){
        if(!acknowledged)throw Error('未收到服务器确认，草稿已保留');
        const accepted=acknowledged;
        setDraft(accepted);setBaseline(structuredClone(accepted));setConfirmed(true);setHistory([]);
        room.onDirtyChange(false);setNotice('配装已同步到房间，其他玩家需要重新准备。');
      }
      setPhase('idle');
      if(continueToAction&&mounted.current)await runAction();
    }catch(e){if(mounted.current){setPhase('error');setConfirmed(false);room?.onDirtyChange(true);setSyncError(e instanceof Error?e.message:'同步失败，草稿已保留');}}
    finally{submitting.current=false;}
  };
  const applyAction=room?.applyAction?.(draft);
  const syncLabel=actionBusy?'正在确认操作…':phase==='syncing'?'正在同步…':phase==='error'?'同步失败 · 草稿已保留':needsApply?'我的配装 · 尚未应用':'我的配装 · 已同步';
  const primaryLabel=busy?'等待服务器确认…':!room?'应用并返回房间':needsApply?applyAction?.label??'应用修改':room.actionLabel;
  const primaryBlocked=busy?'正在等待服务器确认':needsApply||!room?applyBlocked:disabledReason||room.actionBlocked;
  const primary=async()=>{
    if(primaryBlocked||submitting.current||performance.now()-lastPrimary.current<350)return;
    lastPrimary.current=performance.now();
    if(needsApply||!room){await apply(applyAction?.continueToAction??false);return;}
    submitting.current=true;
    try {await runAction();} finally{submitting.current=false;}
  };
  // Only explicit library commands persist; never replace the standalone editor's draft/baseline.
  const updateLibrary=(transform:(designs:Design[])=>Design[])=>{
    const current=readLibrary();if(current.protected)throw Error(current.error??'本机方案库已保护，请先导出备份。');
    const designs=transform(current.library.designs);if(designs.length>100)throw Error('已保存方案达到 100 个上限。');
    writeLibrary({...current.library,designs},current.observedRaw);
    setLibrary(readLibrary());
  };
  const save=(design=draft)=>{try{
    const copy=decodeDesign({...design,id:randomId(),updatedAt:Date.now()});
    updateLibrary(items=>[...items,copy]);setNotice('已另存为本机方案；原有方案与单机草稿未被覆盖。');return true;
  }catch(e){setError(e instanceof Error?e.message:'保存失败');return false;}};
  const exportDesign=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='lan-design.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  useEffect(()=>{
    const changed=(e:StorageEvent)=>{if(e.key===storageKey||e.key===null)setLibrary(readLibrary());};
    window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
  },[]);
  useEffect(()=>{
    const before=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
    const key=(e:KeyboardEvent)=>{if(!suspended&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!e.repeat&&!document.querySelector('[role="dialog"], [role="alertdialog"]')){e.preventDefault();save();}};
    window.addEventListener('beforeunload',before);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('beforeunload',before);window.removeEventListener('keydown',key);};
  });
  if(suspended)return null;
  return <>
    {skills ? <Suspense fallback={<div className="native-loading">正在准备战斗技能…</div>}>
      <CaptainSkillsScreen value={draft.captainSkills??{}} profile={draft.captainProfile} designName={draft.name} hullName={data.ships[draft.hullId]?.name??draft.hullId}
        status={notice} dirty={dirty} warning={disabledReason||library.error} backLabel="返回联机改装" launchLabel={room?"应用修改":"应用并返回房间"}
        onChange={captainSkills=>change({...draft,captainSkills})} onProfileChange={captainProfile=>change({...draft,captainProfile})}
        onBack={()=>setSkills(false)} onRefit={()=>setSkills(false)} onLaunch={()=>void apply()} launchDisabledReason={(busy?"正在等待服务器确认":!needsApply&&room?"配装没有未应用修改":applyBlocked)||null}
        canUndo={!!history.length} onUndo={undo} onSave={()=>save()} onExport={exportDesign} onImport={()=>file.current?.click()} />
    </Suspense> : <NativeRefit
      embedded={{title:room?.title??'联机改装',backLabel:room?.backLabel??(room?'离开房间':'返回房间'),primaryLabel:room?'应用修改':'应用并返回房间',disabledReason:busy?'正在同步':!needsApply&&room?'配装没有未应用修改':applyBlocked}} hullUnavailableReason={lanHullUnavailable}
      roomLayout={room?{sidebar:room.sidebar(()=>setPickingHull(true),draft,change),onPickHull:()=>setPickingHull(true),locked:busy||!!disabledReason,
        footer:<footer ref={footer} className="lan-editor-footer"><div className="lan-editor-sync" data-sync={actionError?'error':phase} role="status"><strong>{syncLabel}</strong><span>{busy?'等待服务器确认，暂不能准备或开始':actionError||syncError||disabledReason||(needsApply?evaluation.errors.join('；')||applyAction?.hint||'其他人仍看到上一次已应用的配装':room.actionBlocked||room.actionHint||'配装已确认，可以准备 / 开始')}</span></div>
          <div className="lan-editor-primary"><NativeButton disabled={busy} onClick={()=>save()}>另存方案</NativeButton>{dirty&&<NativeButton disabled={busy} onClick={discard}>放弃修改</NativeButton>}{needsApply&&applyAction?.continueToAction&&<NativeButton disabled={busy||!!applyBlocked} onClick={()=>void apply()}>仅应用配装</NativeButton>}<NativeButton disabled={!!primaryBlocked} title={primaryBlocked||undefined} onClick={primary}>{primaryLabel}</NativeButton></div>
          <div className="lan-editor-tools">{room.tools}{(disabledReason||phase==="error")&&<NativeButton disabled={busy} onClick={exportDesign}>导出草稿</NativeButton>}<NativeButton disabled={busy} onClick={cancel}>{room.backLabel??'离开房间'}</NativeButton><small>中间直接改装 · 窄屏可左右滑动</small></div></footer>}:undefined}
      draft={draft} designs={library.library.designs} dirty={needsApply} status={notice} warning={disabledReason||library.error||(room?null:notice)}
      canUndo={!!history.length} onUndo={undo} onChange={change} onHull={chooseHull} onOpen={change} onSave={save}
      onRename={(design,name)=>{try{const text=name.trim();if(!text||text.length>48)throw Error('名称需为 1–48 字');updateLibrary(items=>items.map(d=>d.id===design.id?{...d,name:text,updatedAt:Date.now()}:d));return true;}catch(e){setError(e instanceof Error?e.message:'重命名失败');return false;}}}
      onDelete={design=>setConfirm({title:'删除本机方案？',text:'只删除已保存的「'+design.name+'」，不会删除房间配装或当前草稿。',run:()=>attempt(()=>updateLibrary(items=>items.filter(d=>d.id!==design.id)))})}
      onCopy={()=>change({...draft,id:randomId(),name:draft.name.slice(0,43)+' · 副本'})} onNew={()=>chooseHull(draft.hullId,true)}
      onClear={()=>setConfirm({title:'清空装配？',text:'清空本地改装草稿的外装装备，原房间配装不变，可撤消恢复。',run:()=>change({...createDesign(draft.hullId,'empty'),id:draft.id,name:draft.name,captainSkills:draft.captainSkills,captainProfile:draft.captainProfile})})}
      onExport={exportDesign} onImport={()=>file.current?.click()} onLaunch={()=>void apply()} onHome={cancel} onSkills={()=>setSkills(true)}
      hullFilter={filter} onHullFilter={setFilter} readHullScroll={readScroll} writeHullScroll={writeScroll} />}
    {!room && !skills && <div className="lan-refit-mobile-actions"><small>左右滑动查看完整改装台</small><div><NativeButton onClick={cancel}>返回房间</NativeButton><NativeButton disabled={busy||!!applyBlocked} onClick={()=>void apply()}>应用并返回房间</NativeButton></div></div>}
    <MotionPresence>{room&&pickingHull&&<Modal title="更换舰船" eyebrow="选择后只修改本地草稿" width="small" onClose={()=>setPickingHull(false)} footer={<NativeButton onClick={()=>setPickingHull(false)}>返回改装</NativeButton>}><div className="lan-room-hull-picker"><HullRoster draft={draft} spec={evaluation.spec} filter={filter} onFilter={setFilter} readScrollPosition={readScroll} writeScrollPosition={writeScroll} onHull={chooseHull} inert={busy} unavailableReason={lanHullUnavailable}/></div></Modal>}</MotionPresence>
    {!room&&syncError&&<p className="lan-error" role="alert">{syncError}</p>}
    <input ref={file} hidden type="file" accept=".json,application/json" onChange={async event=>{
      const picked=event.target.files?.[0];event.target.value='';if(!picked)return;
      try{if(picked.size>2_000_000)throw Error('方案超过 2 MB');change(decodeDesign(JSON.parse(await picked.text())));setNotice('已导入本页草稿，尚未应用到房间。');}
      catch(e){setError(e instanceof Error?e.message:'无法导入方案');}
    }} />
    <MotionPresence>{confirm&&<Modal title={confirm.title} eyebrow="" width="small" onClose={()=>setConfirm(null)} footer={<><NativeButton onClick={()=>setConfirm(null)}>继续编辑</NativeButton><NativeButton onClick={()=>{const action=confirm.run;setConfirm(null);action();}}>确认</NativeButton></>}><p>{confirm.text}</p></Modal>}</MotionPresence>
    <MotionPresence>{error&&<Modal title="无法完成操作" eyebrow="联机改装" width="small" onClose={()=>setError('')} footer={<NativeButton onClick={()=>setError('')}>返回编辑</NativeButton>}><p className="lan-error">{error}</p></Modal>}</MotionPresence>
  </>;
}
