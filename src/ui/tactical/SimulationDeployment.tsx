import type { DeploymentCommand } from '../../engine/runtime/DeploymentControl';
import type { CommandResult } from '../../engine/runtime/CombatCommands';
import { useDeploymentPicker } from './useDeploymentPicker';
import { RefitHint } from '../../studio/RefitHint';
import { RefitInspection } from '../../studio/RefitInspection';
import { RefitHoverTerm } from '../../studio/RefitHoverTerms';
import { useInspectionCodex } from '../../studio/useInspectionCodex';
import { matchesRefitSearch, hullMatchesCategory, hullSearchAliases } from '../../studio/RefitSearch';
import { BATTLE_SIZE_PRESETS, BATTLE_SIZE_STEP, MIN_BATTLE_SIZE, MAX_BATTLE_SIZE } from '../../shared/battle-size.mjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeploymentViewSource } from '../../engine/runtime/DeploymentView';
import { useDeploymentView, useDeploymentSelection } from './useDeploymentView';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { Modal } from '../core/UI';
import { NativeButton } from '../NativeChrome';
import { NativeBitmapText } from '../NativeBitmapText';
import { simulationRoster, groupSimulationHulls, prepareSimulationOption, simulationOptionErrors, type SimulationOption } from './SimulationRoster';
import { SimulationLoadoutPicker } from './SimulationLoadoutPicker';
import './simulation-deployment.css';

type Side='ally'|'enemy';
const PAGE_SIZE=80;
export function SimulationDeployment({ source, onClose, onDeployed, onDeploymentCommand }: {
  source: DeploymentViewSource; onDeploymentCommand: (command: DeploymentCommand) => Promise<CommandResult>; onClose: () => void; onDeployed: () => void;
}) {
  const { view, refresh } = useDeploymentView(source);
  const codex = useInspectionCodex();
  const pending = useRef(false), mounted = useRef(true), generation = useRef(0);
  const [busyOwner, setBusyOwner] = useState<{ source: DeploymentViewSource; generation: number } | null>(null);
  const busy = busyOwner?.source === source && busyOwner.generation === view.generation;
  const roster = useMemo(() => simulationRoster(), []);
  const [side,setSide]=useState<Side>('enemy');
  const [selected,setSelected]=useDeploymentSelection<Record<Side,string[]>>(source, view.generation, {ally:[],enemy:[]});
  const [hover,setHover]=useState<SimulationOption|null>(null);
  const clearHover = useCallback(() => setHover(null), []);
  const { picker, closePicker, dismissPicker, hullButtonProps, onRosterScroll, cancelClose, leavePicker, dwell } = useDeploymentPicker(codex.isOpen, clearHover, !busy);
  const [query,setQuery]=useState(''),[size,setSize]=useState(''),[scope,setScope]=useState('all');
  const [page,setPage]=useState(0),[error,setError]=useState('');
  useEffect(() => {
    mounted.current = true; generation.current++; pending.current = false;
    return () => { mounted.current = false; };
  }, [source, view.generation]);
  const options=useMemo(()=>roster.filter(option=>hullMatchesCategory(option.spec,size)&&(scope!=='preset'||option.preset)
    &&matchesRefitSearch(query,option.name,option.variantName,option.hullId,option.id,hullSearchAliases(option.spec))),[roster,size,scope,query]);
  const hulls=useMemo(()=>groupSimulationHulls(options),[options]);
  const activeHull=picker?hulls.find(hull=>hull.hullId===picker.id):undefined;
  const pages=Math.max(1,Math.ceil(hulls.length/PAGE_SIZE)),shownPage=Math.min(page,pages-1);
  const picks={ally:roster.filter(option=>selected.ally.includes(option.id)),enemy:roster.filter(option=>selected.enemy.includes(option.id))};
  const costs={ally:picks.ally.reduce((sum,o)=>sum+o.cost,0),enemy:picks.enemy.reduce((sum,o)=>sum+o.cost,0)};
  const used={ally:view.allyUsed,enemy:view.enemyUsed},limit=view.simulationLimit;
  const over={ally:used.ally+costs.ally>limit,enemy:used.enemy+costs.enemy>limit};
  const total=picks.ally.length+picks.enemy.length;
  const changeSide=(next:Side)=>{if(pending.current)return;setSide(next);closePicker();setError('');};
  const inspect=(option:SimulationOption)=>setHover(prepareSimulationOption(option));
  const toggle=(option:SimulationOption)=>{
    if (pending.current) return;
    const resolved=prepareSimulationOption(option);setHover(resolved);
    if(resolved.errors.length){setError(resolved.errors.join('；'));return;}
    setSelected(current=>({...current,[side]:current[side].includes(option.id)?current[side].filter(id=>id!==option.id):[...current[side],option.id]}));setError('');
  };
  const commit = async (command: DeploymentCommand, deployed = false) => {
    if (pending.current) return;
    const token = generation.current, viewGeneration = view.generation;
    const current = () => mounted.current && generation.current === token && source.read().generation === viewGeneration;
    pending.current = true; setBusyOwner({ source, generation: viewGeneration }); setError('');
    try {
      const result = await onDeploymentCommand(command);
      if (!current()) return;
      if (!result.accepted) { setError(result.reason ?? '部署未获确认。'); return; }
      refresh();
      if (deployed) onDeployed();
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (generation.current === token) pending.current = false; if (current()) setBusyOwner(null); }
  };
  const deploy = () => {
    if (!total || over.ally || over.enemy) return;
    // Catalogue identities only: authority compiles BOTH sides and determines their DP.
    void commit({ kind: 'simulation-wave', ally: picks.ally.map(option => option.id), enemy: picks.enemy.map(option => option.id) }, true);
  };
  const changePointLimit = (limit: number) => { void commit({ kind: 'simulation-limit', limit }); };
  const filtered=()=>{setPage(0);closePicker();};
  const summary=total?'友军 '+picks.ally.length+' 艘 +'+costs.ally+' DP · 敌军 '+picks.enemy.length+' 艘 +'+costs.enemy+' DP':'可切换友军/敌军分别选择，最后一次部署全部选择。';
  return <><Modal title="模拟战斗舰船部署" className="simulation-deployment" onClose={()=>{if(!pending.current&&!dismissPicker())onClose();}} initialFocus="panel" surface="glass"
    onShortcut={key=>{if(pending.current)return;if(key==='q')changeSide('ally');else if(key==='w')changeSide('enemy');}}
    footer={<><RefitHint text={view.battleEnded?'战斗已经结束，不能继续部署。':!total?'先点击配装行选择舰船；悬停只查看，不会自动选择。':over.ally||over.enemy?'所选舰船超出部署上限。减少对应阵营的选择或提高上限后，才能一次部署双方。':'确认后将友军和敌军的已选方案一起部署。悬停不会入场。'}><NativeButton disabled={busy||!total||over.ally||over.enemy||(view.battleEnded || !view.available || !view.simulation)} onClick={deploy}>{picks.ally.length&&picks.enemy.length?'部署双方':picks.ally.length?'部署友军':'部署敌军'}</NativeButton></RefitHint>
      <NativeButton disabled={busy||!total} onClick={()=>{setSelected({ally:[],enemy:[]});setError('');}}>清空选择</NativeButton><NativeButton disabled={busy} onClick={onClose}>取消</NativeButton></>}>
    <div className="sim-deployment-tabs" role="tablist" aria-label="部署阵营">
      <NativeButton disabled={busy} role="tab" aria-selected={side==='ally'} shortcut="Q" onClick={()=>changeSide('ally')}>友军{selected.ally.length?' ('+selected.ally.length+')':''}</NativeButton>
      <NativeButton disabled={busy} role="tab" aria-selected={side==='enemy'} shortcut="W" onClick={()=>changeSide('enemy')}>敌军{selected.enemy.length?' ('+selected.enemy.length+')':''}</NativeButton>
    </div>
    <div className="sim-deployment-intro">
      <h2 data-side={side}><NativeBitmapText font="action" color="currentColor">{side==='enemy'?'选择敌方参战舰船':'选择友方参战舰船'}</NativeBitmapText></h2>
      {hover?<div className="sim-deployment-detail"><strong>{hover.name} · {hover.variantName}</strong><RefitHint text="部署点（DP）是此舰船入场占用的额度，不是装配点（OP）；友敌分别核算，模块随母舰入场，不重复添加。"><span>{hover.cost?hover.cost+' DP':'缺少独立部署费用'} · {hover.spec.designation??''}</span></RefitHint>
          {hover.errors.length?<small>不可部署：{hover.errors.join('；')}</small>:hover.warnings.length?<RefitInspection title="装配适配说明" content={<ul>{hover.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}><button type="button" className="sim-inspection-note">装配适配说明（{hover.warnings.length}）</button></RefitInspection>:<small>使用已导入的原版装配方案</small>}</div>
        :<p className="sim-deployment-hint">停留后移入选择，移出自动收起；点击舰体可立即进入。友敌选择分别保留，确认后一起入场。</p>}
    </div>
    <div className="sim-deployment-filters"><input aria-label="筛选模拟舰船" value={query} onChange={e=>{setQuery(e.target.value);filtered();}} placeholder="舰名 / 舰体ID / 装配"/>
      <select aria-label="筛选舰级" value={size} onChange={e=>{setSize(e.target.value);if(e.target.value==='STATION'||e.target.value==='MODULAR'){setScope('all');setQuery('');}filtered();}}><option value="">全部舰级</option><option value="STATION">空间站</option><option value="MODULAR">模块化舰体</option><option value="CAPITAL_SHIP">主力舰</option><option value="CRUISER">巡洋舰</option><option value="DESTROYER">驱逐舰</option><option value="FRIGATE">护卫舰</option></select>
      <select aria-label="舰船目录" value={scope} onChange={e=>{setScope(e.target.value);filtered();}}><option value="all">完整舰船目录</option><option value="preset">原版模拟预设</option></select></div>
    <div onScroll={onRosterScroll} className="sim-deployment-roster" aria-label={side==='enemy'?'敌军舰船名单':'友军舰船名单'}>
      {hulls.slice(shownPage*PAGE_SIZE,(shownPage+1)*PAGE_SIZE).map(hull=>{
        const option=hull.options[0],count=hull.options.filter(fit=>selected[side].includes(fit.id)).length;
        return <button type="button" className="sim-deployment-ship" key={hull.hullId}
          aria-label={option.name+' · '+hull.options.length+' 项配装'+(count?' · 已选 '+count:'')}
          aria-pressed={count>0} data-unavailable={hull.options.every(fit=>simulationOptionErrors(fit).length>0)}
          {...hullButtonProps(hull.hullId,()=>inspect(option))}>
          <img src={runtimeAssetUrl(option.spec.spriteUrl)} alt="" draggable={false} style={{width:option.spec.spriteWidth*Math.min(.2,52/option.spec.spriteWidth,56/option.spec.spriteHeight)+'px',height:option.spec.spriteHeight*Math.min(.2,52/option.spec.spriteWidth,56/option.spec.spriteHeight)+'px'}}/>
          <b><NativeBitmapText font="caption" color="currentColor">{option.cost?String(option.cost):'—'}</NativeBitmapText></b>
          <span className="sim-hull-fits">{count?'✓ '+count:hull.options.length+' 配装'}</span>
        </button>;
      })}{!hulls.length&&<p className="sim-empty">没有符合筛选条件的舰船。</p>}
    </div>
    {picker&&activeHull&&<SimulationLoadoutPicker dwell={dwell} anchor={{element:picker.element,hull:activeHull}} selected={selected[side]} onToggle={toggle} onInspect={inspect}
      onEnter={cancelClose} onLeave={leavePicker} onClose={()=>{dismissPicker();}}
      onOpenCodex={codex.open} inspectionEnabled={!codex.isOpen}/>}
    <div className="sim-deployment-pages"><span>{hulls.length} 种舰体 · {options.length} 项装配</span>
      <button type="button" aria-label="上一页舰船" disabled={shownPage===0} onClick={()=>{setPage(shownPage-1);closePicker();}}>上一页</button><span>{shownPage+1} / {pages}</span><button type="button" aria-label="下一页舰船" disabled={shownPage===pages-1} onClick={()=>{setPage(shownPage+1);closePicker();}}>下一页</button></div>
    <div className="sim-deployment-limit">
      <RefitHint text="友军与敌军分别使用这份部署额度，不是双方共享；友军已部署值包含旗舰。只影响本次模拟，不能调到低于已部署占用的数值。"><label htmlFor="sim-point-limit"><NativeBitmapText font="caption" color="currentColor">每方部署上限</NativeBitmapText></label></RefitHint>
      <input aria-label="调整每方部署上限" type="range" min={MIN_BATTLE_SIZE/2} max={Math.max(MAX_BATTLE_SIZE/2,limit)} step={BATTLE_SIZE_STEP/2}
        value={limit} disabled={busy||(view.battleEnded || !view.available || !view.simulation)} onChange={event=>changePointLimit(Number(event.target.value))}/>
      <select id="sim-point-limit" aria-label="每方部署上限" value={limit} disabled={busy||(view.battleEnded || !view.available || !view.simulation)} onChange={event=>changePointLimit(Number(event.target.value))}>
        {[...new Set([...BATTLE_SIZE_PRESETS.map(value=>value/2),limit])].sort((a,b)=>a-b).map(value=><option key={value} value={value}>{value} DP</option>)}
      </select>
    </div>
    <div className="sim-deployment-budgets">{(['ally','enemy'] as const).map(team=><RefitInspection key={team} title={(team==='ally'?'友军':'敌军')+'部署额度'} content={<>
      <p><RefitHoverTerm term="deploymentPoints">部署点（DP）</RefitHoverTerm>独立按阵营核算{team==='ally'?'，已部署包含旗舰':''}。</p>
      <p>已部署 {used[team]} + 待部署 {costs[team]} = {used[team]+costs[team]} / {limit} DP</p>
      <p className={over[team]?'refit-inspection-warnings':undefined}>{over[team]?'超出 '+(used[team]+costs[team]-limit)+' DP；需减少选择或提高上限。':'确认后剩余 '+(limit-used[team]-costs[team])+' DP。'}</p>
      {picks[team].length>0&&<ul>{picks[team].map(option=><li key={option.id}>{option.name} · {option.variantName}：{option.cost} DP</li>)}</ul>}
      <p className="refit-inspection-note">这是待确认的选择；悬停不部署。任一方超限时，双方都不会入场。</p>
    </>}><div className="sim-deployment-meter" data-over={over[team]} role="status" aria-label={team==='ally'?'友军部署点数':'敌军部署点数'}>
      <i style={{width:Math.min(100,(used[team]+costs[team])/limit*100)+'%'}}/><span>{team==='ally'?'友军':'敌军'} {used[team]} + {costs[team]} / {limit}</span></div></RefitInspection>)}</div>
    <div className="sim-deployment-feedback" role="status">{busy ? '等待部署确认；不会重复提交。' : error||(over.ally||over.enemy?([over.ally?'友军':'',over.enemy?'敌军':''].filter(Boolean).join('、')+'超出部署上限，双方均未部署。'):summary)}</div>
  </Modal>{codex.content}</>;
}
