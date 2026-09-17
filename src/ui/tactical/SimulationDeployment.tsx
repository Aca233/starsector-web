import { BattleSizeControl } from '../BattleSizeControl';
import { useEffect, useMemo, useState } from 'react';
import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { Modal } from '../core/UI';
import { NativeButton } from '../NativeChrome';
import { NativeBitmapText } from '../NativeBitmapText';
import { simulationRoster, prepareSimulationOption, simulationOptionErrors, registerSimulationOption, type SimulationOption } from './SimulationRoster';
import './simulation-deployment.css';

type Side='ally'|'enemy';
const PAGE_SIZE=80;
export function SimulationDeployment({ engine, onClose, onDeployed }: {
  engine: CombatEngine; onClose: () => void; onDeployed: () => void;
}) {
  const roster = useMemo(() => simulationRoster(), []);
  const [side,setSide]=useState<Side>('enemy');
  const [selected,setSelected]=useState<Record<Side,string[]>>({ally:[],enemy:[]});
  const [hover,setHover]=useState<SimulationOption|null>(null);
  const [advanced,setAdvanced]=useState(false),[query,setQuery]=useState(''),[size,setSize]=useState(''),[scope,setScope]=useState('all');
  const [page,setPage]=useState(0),[error,setError]=useState('');
  const [,refresh]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>refresh(n=>n+1),200);return()=>window.clearInterval(timer);},[]);
  const options=useMemo(()=>roster.filter(option=>(!size||option.spec.hullSize===size)&&(scope!=='preset'||option.preset)
    &&(option.name+' '+option.variantName+' '+option.hullId+' '+option.id).toLowerCase().includes(query.trim().toLowerCase())),[roster,size,scope,query]);
  const pages=Math.max(1,Math.ceil(options.length/PAGE_SIZE)),shownPage=Math.min(page,pages-1);
  const picks={ally:roster.filter(option=>selected.ally.includes(option.id)),enemy:roster.filter(option=>selected.enemy.includes(option.id))};
  const costs={ally:picks.ally.reduce((sum,o)=>sum+o.cost,0),enemy:picks.enemy.reduce((sum,o)=>sum+o.cost,0)};
  const used={ally:engine.simulationDeployedPoints(true),enemy:engine.simulationDeployedPoints(false)},limit=engine.simulationPointLimit;
  const over={ally:used.ally+costs.ally>limit,enemy:used.enemy+costs.enemy>limit};
  const total=picks.ally.length+picks.enemy.length;
  const changeSide=(next:Side)=>{setSide(next);setHover(null);setError('');};
  const inspect=(option:SimulationOption)=>setHover(prepareSimulationOption(option));
  const toggle=(option:SimulationOption)=>{
    const resolved=prepareSimulationOption(option);setHover(resolved);
    if(resolved.errors.length){setError(resolved.errors.join('；'));return;}
    setSelected(current=>({...current,[side]:current[side].includes(option.id)?current[side].filter(id=>id!==option.id):[...current[side],option.id]}));setError('');
  };
  const deploy=()=>{
    if(!total||over.ally||over.enemy)return;
    try {
      // Both tab selections are one transaction. Filtering/switching tabs never discards the other side.
      const entries=([ 'ally','enemy' ] as const).flatMap(team=>picks[team].map(option=>({specId:registerSimulationOption(option),cost:option.cost,isPlayer:team==='ally'})));
      engine.deploySimulationFleet(entries);
      onDeployed();
    } catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  };
  const filtered=()=>{setPage(0);setHover(null);};
  const summary=total?'友军 '+picks.ally.length+' 艘 +'+costs.ally+' DP · 敌军 '+picks.enemy.length+' 艘 +'+costs.enemy+' DP':'可切换友军/敌军分别选择，最后一次部署全部选择。';
  return <Modal title="模拟战斗舰船部署" className="simulation-deployment" onClose={onClose} initialFocus="panel" surface="glass"
    onShortcut={key=>{if(key==='q')changeSide('ally');else if(key==='w')changeSide('enemy');else if(key==='a')setAdvanced(value=>!value);}}
    footer={<><NativeButton disabled={!total||over.ally||over.enemy||!!engine.battleResult} onClick={deploy}>{picks.ally.length&&picks.enemy.length?'部署双方':picks.ally.length?'部署友军':'部署敌军'}</NativeButton>
      <NativeButton disabled={!total} onClick={()=>{setSelected({ally:[],enemy:[]});setError('');}}>清空选择</NativeButton><NativeButton onClick={onClose}>取消</NativeButton></>}>
    <div className="sim-deployment-tabs" role="tablist" aria-label="部署阵营">
      <NativeButton role="tab" aria-selected={side==='ally'} shortcut="Q" onClick={()=>changeSide('ally')}>友军{selected.ally.length?' ('+selected.ally.length+')':''}</NativeButton>
      <NativeButton role="tab" aria-selected={side==='enemy'} shortcut="W" onClick={()=>changeSide('enemy')}>敌军{selected.enemy.length?' ('+selected.enemy.length+')':''}</NativeButton>
      <NativeButton className="sim-advanced-toggle" shortcut="A" aria-expanded={advanced} onClick={()=>setAdvanced(value=>!value)}>{advanced?'收起部署设置':'部署设置'}</NativeButton>
    </div>
    <div className="sim-deployment-intro">
      <h2 data-side={side}><NativeBitmapText font="action" color="currentColor">{side==='enemy'?'选择敌方参战舰船':'选择友方参战舰船'}</NativeBitmapText></h2>
      {advanced?<div className="sim-deployment-options"><BattleSizeControl value={limit*2} onChange={value=>{if(engine.setSimulationPointLimit(value/2)){refresh(n=>n+1);setError('');}else setError('不能低于场上舰船已经占用的部署点。');}}/><p>仅调整本次模拟。两边分别使用部署额度，友军额度包含你驾驶的舰船。</p></div>
        :hover?<div className="sim-deployment-detail"><strong>{hover.name} · {hover.variantName}</strong><span>{hover.cost?hover.cost+' DP':'缺少独立部署费用'} · {hover.spec.designation??''}</span>
          {hover.errors.length?<small>不可部署：{hover.errors.join('；')}</small>:hover.warnings.length?<details><summary>装配适配说明（{hover.warnings.length}）</summary><ul>{hover.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>:<small>使用已导入的原版装配方案</small>}</div>
        :<p className="sim-deployment-hint">友敌选择分别保留；确认后一起入场，不自动暂停，成功后关闭地图。</p>}
    </div>
    <div className="sim-deployment-filters"><input aria-label="筛选模拟舰船" value={query} onChange={e=>{setQuery(e.target.value);filtered();}} placeholder="舰名 / 舰体ID / 装配"/>
      <select aria-label="筛选舰级" value={size} onChange={e=>{setSize(e.target.value);filtered();}}><option value="">全部舰级</option><option value="CAPITAL_SHIP">主力舰</option><option value="CRUISER">巡洋舰</option><option value="DESTROYER">驱逐舰</option><option value="FRIGATE">护卫舰</option></select>
      <select aria-label="舰船目录" value={scope} onChange={e=>{setScope(e.target.value);filtered();}}><option value="all">完整舰船目录</option><option value="preset">原版模拟预设</option></select></div>
    <div className="sim-deployment-roster" aria-label={side==='enemy'?'敌军舰船名单':'友军舰船名单'}>
      {options.slice(shownPage*PAGE_SIZE,(shownPage+1)*PAGE_SIZE).map(option=><button type="button" className="sim-deployment-ship" key={option.id}
        aria-label={option.name+' · '+option.variantName+' · '+(option.cost?option.cost+' 部署点':'不可独立部署')} title={option.name+' · '+option.variantName}
        aria-pressed={selected[side].includes(option.id)} aria-disabled={!!simulationOptionErrors(option).length}
        onMouseEnter={()=>inspect(option)} onFocus={()=>inspect(option)} onClick={()=>toggle(option)}>
        <img src={runtimeAssetUrl(option.spec.spriteUrl)} alt="" draggable={false} style={{width:option.spec.spriteWidth*Math.min(.2,52/option.spec.spriteWidth,56/option.spec.spriteHeight)+'px',height:option.spec.spriteHeight*Math.min(.2,52/option.spec.spriteWidth,56/option.spec.spriteHeight)+'px'}}/>
        <b><NativeBitmapText font="caption" color="currentColor">{option.cost?String(option.cost):'—'}</NativeBitmapText></b>
      </button>)}{!options.length&&<p className="sim-empty">没有符合筛选条件的舰船。</p>}
    </div>
    <div className="sim-deployment-pages"><span>{new Set(options.map(o=>o.hullId)).size} 种舰体 · {options.length} 项装配</span>
      <button type="button" aria-label="上一页舰船" disabled={shownPage===0} onClick={()=>{setPage(shownPage-1);setHover(null);}}>上一页</button><span>{shownPage+1} / {pages}</span><button type="button" aria-label="下一页舰船" disabled={shownPage===pages-1} onClick={()=>{setPage(shownPage+1);setHover(null);}}>下一页</button></div>
    <div className="sim-deployment-budgets">{(['ally','enemy'] as const).map(team=><div key={team} className="sim-deployment-meter" data-over={over[team]} role="status" aria-label={team==='ally'?'友军部署点数':'敌军部署点数'}>
      <i style={{width:Math.min(100,(used[team]+costs[team])/limit*100)+'%'}}/><span>{team==='ally'?'友军':'敌军'} {used[team]} + {costs[team]} / {limit}</span></div>)}</div>
    <div className="sim-deployment-feedback" role="status">{error||(over.ally||over.enemy?([over.ally?'友军':'',over.enemy?'敌军':''].filter(Boolean).join('、')+'超出部署上限，双方均未部署。'):summary)}</div>
  </Modal>;
}
