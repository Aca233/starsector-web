import { useState } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { Modal } from '../ui/core/UI';
import { data,hulls,createDesign,type Design } from '../studio/DesignModel';
import { matchesRefitSearch } from '../studio/RefitSearch';
import { lanHullUnavailable,validateLanDesign } from './LanDesign';
import { LAN_MAX_OPTIONS_BYTES,LAN_MAX_PLAYERS,roomTeams,teamName,type Room } from './protocol';
import { editAiFleet,type AiFleetEdit } from './room-fleet.mjs';
import { LanHullThumbnail } from './LanHullThumbnail';
import { groupAiFleet,type AiFleetGroup } from './LanAiGroups';
import { LanDesignPicker } from './LanDesignPicker';
import { LanLoadoutDetails } from './LanLoadoutDetails';
import type { AiEditTarget } from './LanAiEditor';
const hullName=(hull:string)=>data.ships[hull]?.name??hull;
function FleetQuantity({count,label,disabled,onCommit}:{count:number;label:string;disabled:boolean;onCommit:(count:number)=>void}) {
  const [draft,setDraft]=useState<string|null>(null);
  return <input type="number" min="1" step="1" aria-label={label} value={disabled?String(count):draft??String(count)} disabled={disabled}
    onFocus={()=>setDraft(String(count))} onChange={e=>setDraft(e.target.value)}
    onKeyDownCapture={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();e.currentTarget.blur();}}}
    onBlur={e=>{const value=Number(e.currentTarget.value);if(value!==count)onCommit(value);setDraft(null);}}/>;
}
/** Default add is still one click; variants are separate count rows under a collapsible hull. */
export function LanAiFleet({room,isHost,editable,send,currentDesign,onEdit,openInitially=false,initialTeam=1,initialQuery="",initialBatch="1"}:{
  room:Room;isHost:boolean;editable:boolean;send:(message:unknown)=>void;currentDesign:Design;onEdit:(target:AiEditTarget)=>void;openInitially?:boolean;initialTeam?:number;initialQuery?:string;initialBatch?:string;
}) {
  const [open,setOpen]=useState(openInitially),[team,setTeam]=useState(initialTeam),[query,setQuery]=useState(initialQuery),[batch,setBatch]=useState(initialBatch),[error,setError]=useState('');
  const [removing,setRemoving]=useState<string|null>(null),[viewing,setViewing]=useState<AiFleetGroup|null>(null);
  const solo=room.options.assignment==='solo',activeTeam=solo?0:Math.min(team,room.options.aiHulls.length-1),canEdit=isHost&&editable;
  const allGroups=groupAiFleet(room.options),groups=allGroups.filter(g=>solo||g.team===activeTeam);
  const total=allGroups.reduce((s,g)=>s+g.count,0),shown=groups.reduce((s,g)=>s+g.count,0);
  const hullGroups=[...new Set(groups.map(g=>g.hull))].map(hull=>({hull,variants:groups.filter(g=>g.hull===hull)}));
  const candidates=hulls.filter(spec=>matchesRefitSearch(query,spec.id,data.ships[spec.id].name,data.ships[spec.id].designation));
  const change=(edit:Omit<AiFleetEdit,'assignment'|'team'>)=>{
    if(!canEdit)return false;
    try{const command={...edit,assignment:room.options.assignment,team:activeTeam};
      if(command.design)command.design=validateLanDesign(command.design);
      editAiFleet(room.options,command,LAN_MAX_OPTIONS_BYTES,LAN_MAX_PLAYERS);
      send({type:'ai',...command});setError('');return true;
    }catch(e){setError(e instanceof Error?e.message:'无法修改 AI 编成');return false;}
  };
  const addDesign=(design:Design)=>{change({operation:'add',design,count:Number(batch)});};
  const editGroup=(group:AiFleetGroup,scope:'group'|'one')=>{
    setOpen(false);onEdit({design:group.design??createDesign(group.hull),hull:group.loadoutKey,scope,count:scope==='one'?1:group.count,team:activeTeam,assignment:room.options.assignment,baseRevision:room.options.aiRevision??0,returnQuery:query,returnBatch:batch});
  };
  const createCustom=()=>{try{const count=Number(batch);if(!Number.isSafeInteger(count)||count<1)throw Error('请输入正整数数量');setOpen(false);onEdit({design:validateLanDesign(currentDesign),scope:'add',count,team:activeTeam,assignment:room.options.assignment,baseRevision:room.options.aiRevision??0,returnQuery:query,returnBatch:batch});}catch(e){setError(e instanceof Error?e.message:'无法改装');}};
  const close=()=>{setOpen(false);setRemoving(null);setError('');};
  const teamLabel=solo?'独立阵营':teamName(activeTeam);
  return <div className="lan-ai-summary"><NativeButton onClick={()=>setOpen(true)}>AI 舰船 · {total} 艘</NativeButton><small>{total?(solo?'每艘独立成队 · 按配装归组显示':'同型舰按配装分组'):'默认不添加 · 不占真人席位'}</small>
    {open&&<Modal title="AI 舰船编成" eyebrow="点船即加 · 同型舰按方案分别计数" width="wide" onClose={close}
      footer={<><span className="lan-ai-footer-note">全房间 {total} 艘 · 当前 {shown} 艘 / {groups.length} 个方案</span><NativeButton onClick={close}>返回改装</NativeButton></>}>
      <div className="lan-ai-configurator">
        <div className="lan-ai-toolbar">{!solo&&<label>{canEdit?"添加到":"查看队伍"}<select aria-label="AI 所属队伍" value={activeTeam} onChange={e=>{setTeam(Number(e.target.value));setRemoving(null);}}>{roomTeams(room.options).map(t=><option key={t} value={t}>{teamName(t)}</option>)}</select></label>}
          <label>每次添加<input aria-label="每次添加数量" type="number" min="1" step="1" value={batch} disabled={!canEdit} onChange={e=>setBatch(e.target.value)}/></label>
          <label>筛选舰船<input aria-label="搜索 AI 舰船" value={query} onChange={e=>setQuery(e.target.value)} placeholder="名称 / 舰体"/></label>
        </div>
        <div className="lan-ai-loadout-tools"><NativeButton disabled={!canEdit} onClick={()=>addDesign(currentDesign)}>添加当前设计</NativeButton><LanDesignPicker disabled={!canEdit} onSelect={addDesign} onEdit={createCustom}/><NativeButton disabled={!canEdit} onClick={createCustom}>新建 AI 配装</NativeButton></div>
        <p className="lan-muted">默认点左侧舰船直接添加建议配装；当前设计复制你的改装草稿，不会改变你的舰船。不同方案分别计数，同配置自动合并。</p>
        {!canEdit&&<p className="lan-muted">只有房主可调整 AI；你可以展开查看各方案。</p>}
        {error&&<p className="lan-error" role="alert">{error}</p>}
        <div className="lan-ai-columns lan-ai-workspace">
          <section className="lan-ai-catalog"><h3>舰船目录 · 建议配装</h3><div className="lan-ai-hull-grid">{candidates.map(spec=>{const reason=lanHullUnavailable(spec);return <NativeButton className="lan-ai-hull-choice" key={spec.id} disabled={!canEdit||!!reason} title={reason??'添加建议配装'} aria-label={'添加 '+hullName(spec.id)+' 建议配装'} onClick={()=>{try{const design=createDesign(spec.id);addDesign({...design,name:'建议配装'});}catch(e){setError(e instanceof Error?e.message:'舰船不可用');}}}><LanHullThumbnail hull={spec.id} name={hullName(spec.id)}/><span>{hullName(spec.id)}</span></NativeButton>;})}</div></section>
          <section className="lan-ai-fleet"><h3>{teamLabel} · {shown} 艘</h3><div className="lan-ai-group-list">
            {!groups.length&&<p className="lan-muted">此处尚无 AI。点左侧舰船即可添加，也可以使用自己的方案。</p>}
            {hullGroups.map(({hull,variants})=><details className="lan-ai-hull-group" key={hull} open><summary><LanHullThumbnail hull={hull} name={hullName(hull)}/><strong>{hullName(hull)}</strong><span>× {variants.reduce((s,g)=>s+g.count,0)} · {variants.length} 个方案</span></summary>
              {variants.map(group=><article className="lan-ai-variant-row" key={group.key} data-loadout-key={group.loadoutKey}><div className="lan-ai-variant-heading"><strong>{group.name}</strong><button type="button" onClick={()=>setViewing(group)}>查看配装</button></div>
                <div className="lan-ai-quantity"><NativeButton aria-label={'减少一艘 '+group.name} disabled={!canEdit||group.count<=1} onClick={()=>change({operation:'adjust',hull:group.loadoutKey,count:-1})}>−</NativeButton><FleetQuantity count={group.count} label={teamLabel+' '+hullName(hull)+' '+group.name+'数量'} disabled={!canEdit} onCommit={count=>change({operation:'set-count',hull:group.loadoutKey,count})}/><NativeButton aria-label={'增加一艘 '+group.name} disabled={!canEdit} onClick={()=>change({operation:'add',hull:group.loadoutKey,count:1})}>＋</NativeButton></div>
                <div className="lan-ai-secondary"><button type="button" disabled={!canEdit} onClick={()=>editGroup(group,'group')}>整组改装</button><button type="button" disabled={!canEdit||group.count<2} onClick={()=>editGroup(group,'one')}>拆出一艘改装</button><button type="button" disabled={!canEdit} onClick={()=>setRemoving(group.key)}>删除</button></div>
                {removing===group.key&&<div className="lan-ai-remove-note">删除此方案的 {group.count} 艘？<NativeButton disabled={!canEdit} onClick={()=>{if(change({operation:'remove',hull:group.loadoutKey}))setRemoving(null);}}>确认删除</NativeButton><NativeButton onClick={()=>setRemoving(null)}>取消</NativeButton></div>}
              </article>)}
            </details>)}
          </div></section>
        </div>
        <p className="lan-muted lan-ai-safety">改装只在应用后同步并取消全员准备。AI 不设固定数量上限，受部署 DP、房主算力和通信安全预算限制；个人战归组不合并实际阵营。</p>
      </div>
    </Modal>}
    {viewing&&<LanLoadoutDetails member={{name:hullName(viewing.hull)+' · '+viewing.name,hull:viewing.hull,design:viewing.design??createDesign(viewing.hull)}} onClose={()=>setViewing(null)}/>}
  </div>;
}
